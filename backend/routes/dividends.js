const express = require('express');
const { v4: uuid } = require('uuid');
const { query, getOne, run, runTransaction } = require('../database');
const { auth, adminAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', auth, (req, res) => {
  try {
    const dividends = query(`
      SELECT d.*, p.title, p.location
      FROM dividends d
      JOIN properties p ON d.property_id = p.id
      WHERE d.user_id = ?
      ORDER BY d.created_at DESC
    `, [req.userId]);

    const totalReceived = dividends.filter(d => d.paid).reduce((s, d) => s + d.amount, 0);
    const totalPending = dividends.filter(d => !d.paid).reduce((s, d) => s + d.amount, 0);

    res.json({
      dividends,
      summary: {
        total_received: totalReceived,
        total_pending: totalPending,
        count: dividends.length
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/generate', adminAuth, (req, res) => {
  try {
    const investments = query(`
      SELECT i.user_id, i.property_id, i.tokens, p.token_price, p.yield_annual
      FROM investments i
      JOIN properties p ON i.property_id = p.id
    `);

    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const existing = getOne('SELECT id FROM dividends WHERE month = ?', [month]);
    if (existing) {
      return res.status(400).json({ error: 'Dividendos já gerados para este mês' });
    }

    runTransaction(() => {
      let count = 0;
      for (const inv of investments) {
        const monthlyYield = inv.yield_annual / 12 / 100;
        const dividendAmount = inv.tokens * inv.token_price * monthlyYield;
        if (dividendAmount > 0) {
          const id = uuid();
          run('INSERT INTO dividends (id, user_id, property_id, amount, month, paid) VALUES (?, ?, ?, ?, ?, 1)', [id, inv.user_id, inv.property_id, dividendAmount, month]);
          run('UPDATE users SET balance = balance + ? WHERE id = ?', [dividendAmount, inv.user_id]);
          const txId = uuid();
          run('INSERT INTO transactions (id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)', [txId, inv.user_id, 'dividend', dividendAmount, `Dividendo mensal - ${month}`]);
          count++;
        }
      }
    });

    res.json({ success: true, message: `Dividendos gerados para ${month}`, month });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
