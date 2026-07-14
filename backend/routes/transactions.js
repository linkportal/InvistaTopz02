const express = require('express');
const { v4: uuid } = require('uuid');
const { query, getOne, run } = require('../database');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.get('/', auth, (req, res) => {
  try {
    const { type } = req.query;
    let sql = 'SELECT * FROM transactions WHERE user_id = ?';
    const params = [req.userId];

    if (type) { sql += ' AND type = ?'; params.push(type); }
    sql += ' ORDER BY created_at DESC LIMIT 50';

    const transactions = query(sql, params);
    const balance = getOne('SELECT balance FROM users WHERE id = ?', [req.userId]);

    res.json({ transactions, balance: balance.balance });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/deposit', auth, (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valor inválido' });
    }
    const txId = uuid();
    run('UPDATE users SET balance = balance + ? WHERE id = ?', [amount, req.userId]);
    run('INSERT INTO transactions (id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)', [txId, req.userId, 'deposit', amount, `Depósito de R$ ${amount.toFixed(2)}`]);
    const user = getOne('SELECT balance FROM users WHERE id = ?', [req.userId]);
    res.json({ success: true, balance: user.balance, message: `R$ ${amount.toFixed(2)} depositados com sucesso` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/withdraw', auth, (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valor inválido' });
    }
    const user = getOne('SELECT * FROM users WHERE id = ?', [req.userId]);
    if (user.balance < amount) {
      return res.status(400).json({ error: 'Saldo insuficiente' });
    }
    const txId = uuid();
    run('UPDATE users SET balance = balance - ? WHERE id = ?', [amount, req.userId]);
    run('INSERT INTO transactions (id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)', [txId, req.userId, 'withdrawal', -amount, `Saque de R$ ${amount.toFixed(2)}`]);
    const updated = getOne('SELECT balance FROM users WHERE id = ?', [req.userId]);
    res.json({ success: true, balance: updated.balance, message: `R$ ${amount.toFixed(2)} sacados com sucesso` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
