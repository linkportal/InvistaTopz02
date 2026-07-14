const express = require('express');
const { v4: uuid } = require('uuid');
const { query, getOne, run } = require('../database');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const { type, status, min_price, max_price, sort } = req.query;
    let sql = 'SELECT * FROM properties WHERE 1=1';
    const params = [];

    if (type) { sql += ' AND type = ?'; params.push(type); }
    if (status) { sql += ' AND status = ?'; params.push(status); }
    else { sql += " AND status = 'active'"; }
    if (min_price) { sql += ' AND token_price >= ?'; params.push(min_price); }
    if (max_price) { sql += ' AND token_price <= ?'; params.push(max_price); }

    if (sort === 'yield') sql += ' ORDER BY yield_annual DESC';
    else if (sort === 'price_asc') sql += ' ORDER BY token_price ASC';
    else if (sort === 'price_desc') sql += ' ORDER BY token_price DESC';
    else sql += ' ORDER BY created_at DESC';

    const properties = query(sql, params);
    res.json(properties.map(p => ({
      ...p,
      tokens_available: p.total_tokens - p.tokens_sold,
      progress_pct: Math.round((p.tokens_sold / p.total_tokens) * 100)
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const property = getOne('SELECT * FROM properties WHERE id = ?', [req.params.id]);
    if (!property) return res.status(404).json({ error: 'Imóvel não encontrado' });

    const investors = getOne(`
      SELECT COUNT(DISTINCT user_id) as count, SUM(tokens) as total_tokens
      FROM investments WHERE property_id = ?
    `, [req.params.id]);

    res.json({
      ...property,
      tokens_available: property.total_tokens - property.tokens_sold,
      progress_pct: Math.round((property.tokens_sold / property.total_tokens) * 100),
      investors_count: investors?.count || 0,
      investors_tokens: investors?.total_tokens || 0
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', auth, (req, res) => {
  try {
    const { title, location, type, description, image_url, total_value, token_price, total_tokens, yield_annual, appreciation, term_months } = req.body;
    if (!title || !location || !type || !total_value || !token_price || !total_tokens || !yield_annual || !term_months) {
      return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    }
    const id = uuid();
    run(`INSERT INTO properties (id, title, location, type, description, image_url, total_value, token_price, total_tokens, yield_annual, appreciation, term_months) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, title, location, type, description || '', image_url || '', total_value, token_price, total_tokens, yield_annual, appreciation || 0, term_months]);
    const property = getOne('SELECT * FROM properties WHERE id = ?', [id]);
    res.status(201).json(property);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', auth, (req, res) => {
  try {
    const existing = getOne('SELECT * FROM properties WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Imóvel não encontrado' });

    const { title, location, type, description, image_url, status, yield_annual, appreciation } = req.body;
    run(`UPDATE properties SET title = COALESCE(?, title), location = COALESCE(?, location), type = COALESCE(?, type), description = COALESCE(?, description), image_url = COALESCE(?, image_url), status = COALESCE(?, status), yield_annual = COALESCE(?, yield_annual), appreciation = COALESCE(?, appreciation) WHERE id = ?`,
      [title, location, type, description, image_url, status, yield_annual, appreciation, req.params.id]);
    const property = getOne('SELECT * FROM properties WHERE id = ?', [req.params.id]);
    res.json(property);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
