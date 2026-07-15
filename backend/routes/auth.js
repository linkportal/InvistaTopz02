const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const { getOne, run, query } = require('../database');
const { JWT_SECRET, auth } = require('../middleware/auth');

const router = express.Router();

// ===== PÚBLICO =====

router.post('/register', (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' });
    }
    const exists = getOne('SELECT id FROM users WHERE email = ?', [email]);
    if (exists) {
      return res.status(409).json({ error: 'Email já cadastrado' });
    }
    const hash = bcrypt.hashSync(password, 10);
    const id = uuid();
    run('INSERT INTO users (id, name, email, password, phone, balance) VALUES (?, ?, ?, ?, ?, ?)',
      [id, name, email, hash, phone || '', 10000]);
    const token = jwt.sign({ userId: id }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({
      token,
      user: { id, name, email, phone: phone || '', balance: 10000 }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }
    const user = getOne('SELECT * FROM users WHERE email = ?', [email]);
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }
    run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({
      token,
      user: {
        id: user.id, name: user.name, email: user.email,
        phone: user.phone, balance: user.balance, is_admin: user.is_admin
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== USUÁRIO LOGADO =====

router.get('/me', auth, (req, res) => {
  try {
    const user = getOne('SELECT id, name, email, phone, balance, is_admin, created_at, last_login FROM users WHERE id = ?', [req.userId]);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    const investments = query(`
      SELECT i.*, p.title, p.yield_annual, p.token_price, p.location
      FROM investments i JOIN properties p ON i.property_id = p.id
      WHERE i.user_id = ? ORDER BY i.created_at DESC
    `, [req.userId]);

    const totalInvested = investments.reduce((sum, i) => sum + i.total_paid, 0);
    const portfolioValue = investments.reduce((sum, i) =>
      sum + i.tokens * i.token_price * (1 + i.yield_annual / 100), 0);

    res.json({
      ...user,
      investments,
      stats: {
        total_invested: totalInvested,
        portfolio_value: portfolioValue,
        returns: portfolioValue - totalInvested,
        properties_count: new Set(investments.map(i => i.property_id)).size
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/me', auth, (req, res) => {
  try {
    const { name, phone } = req.body;
    if (name) run('UPDATE users SET name = ? WHERE id = ?', [name, req.userId]);
    if (phone !== undefined) run('UPDATE users SET phone = ? WHERE id = ?', [phone, req.userId]);
    const user = getOne('SELECT id, name, email, phone, balance FROM users WHERE id = ?', [req.userId]);
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/change-password', auth, (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Senha atual e nova senha são obrigatórias' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ error: 'Nova senha deve ter no mínimo 6 caracteres' });
    }
    const user = getOne('SELECT * FROM users WHERE id = ?', [req.userId]);
    if (!bcrypt.compareSync(current_password, user.password)) {
      return res.status(401).json({ error: 'Senha atual incorreta' });
    }
    const hash = bcrypt.hashSync(new_password, 10);
    run('UPDATE users SET password = ? WHERE id = ?', [hash, req.userId]);
    res.json({ success: true, message: 'Senha alterada com sucesso' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/me', auth, (req, res) => {
  try {
    const { password } = req.body;
    const user = getOne('SELECT * FROM users WHERE id = ?', [req.userId]);
    if (password && !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Senha incorreta' });
    }
    run('UPDATE users SET status = "inactive" WHERE id = ?', [req.userId]);
    res.json({ success: true, message: 'Conta desativada' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
