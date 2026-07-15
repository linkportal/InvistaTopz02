const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const { getOne, run, query } = require('../database');
const { adminAuth } = require('../middleware/auth');

const router = express.Router();

router.use(adminAuth);

// ===== DASHBOARD =====
router.get('/dashboard', (req, res) => {
  try {
    const totalUsers = getOne('SELECT COUNT(*) as t FROM users').t;
    const activeUsers = getOne("SELECT COUNT(*) as t FROM users WHERE status='active'").t;
    const totalProps = getOne('SELECT COUNT(*) as t FROM properties').t;
    const activeProps = getOne("SELECT COUNT(*) as t FROM properties WHERE status='active'").t;
    const totalInvested = getOne('SELECT COALESCE(SUM(total_paid),0) as t FROM investments').t;
    const totalTokensSold = getOne('SELECT COALESCE(SUM(tokens_sold),0) as t FROM properties').t;
    const totalBalance = getOne('SELECT COALESCE(SUM(balance),0) as t FROM users').t;
    const totalDividends = getOne('SELECT COALESCE(SUM(amount),0) as t FROM dividends').t;
    const totalDeposits = getOne("SELECT COALESCE(SUM(amount),0) as t FROM transactions WHERE type='deposit'").t;
    const totalWithdrawals = getOne("SELECT COALESCE(SUM(amount),0) as t FROM transactions WHERE type='withdrawal'").t;
    const recentUsers = query('SELECT id, name, email, created_at, last_login FROM users ORDER BY created_at DESC LIMIT 5');
    const recentInvestments = query(`
      SELECT i.*, u.name as user_name, p.title as property_title
      FROM investments i
      JOIN users u ON i.user_id = u.id
      JOIN properties p ON i.property_id = p.id
      ORDER BY i.created_at DESC LIMIT 5
    `);
    const monthlyData = query(`
      SELECT strftime('%Y-%m', created_at) as month, SUM(amount) as total, type
      FROM transactions
      WHERE created_at >= date('now', '-6 months')
      GROUP BY month, type
      ORDER BY month
    `);
    const propertyPerformance = query(`
      SELECT p.title, p.tokens_sold, p.total_tokens, p.yield_annual,
        COALESCE(SUM(i.total_paid),0) as total_invested
      FROM properties p
      LEFT JOIN investments i ON p.id = i.property_id
      WHERE p.status='active'
      GROUP BY p.id
      ORDER BY total_invested DESC
      LIMIT 5
    `);
    res.json({
      total_users: totalUsers, active_users: activeUsers,
      total_properties: totalProps, active_properties: activeProps,
      total_invested: totalInvested, total_tokens_sold: totalTokensSold,
      total_balance: totalBalance, total_dividends: totalDividends,
      total_deposits: totalDeposits, total_withdrawals: totalWithdrawals,
      recent_users: recentUsers, recent_investments: recentInvestments,
      monthly_data: monthlyData, property_performance: propertyPerformance
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== USERS CRUD =====
router.get('/users', (req, res) => {
  try {
    const { search, status, page = 1, limit = 20 } = req.query;
    let sql = 'SELECT id, name, email, phone, balance, is_admin, status, created_at, last_login FROM users WHERE 1=1';
    const params = [];
    if (search) { sql += ' AND (name LIKE ? OR email LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    if (status) { sql += ' AND status = ?'; params.push(status); }
    const total = getOne(sql.replace(/SELECT .+? FROM/, 'SELECT COUNT(*) as t FROM'), params).t;
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(+limit, (+page - 1) * +limit);
    const users = query(sql, params);
    res.json({ users, total, page: +page, pages: Math.ceil(total / +limit) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/users/:id', (req, res) => {
  try {
    const user = getOne('SELECT id, name, email, phone, balance, is_admin, status, created_at, last_login FROM users WHERE id=?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'Não encontrado' });
    const investments = query('SELECT i.*, p.title FROM investments i JOIN properties p ON i.property_id=p.id WHERE i.user_id=?', [req.params.id]);
    const transactions = query('SELECT * FROM transactions WHERE user_id=? ORDER BY created_at DESC LIMIT 20', [req.params.id]);
    res.json({ ...user, investments, transactions });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/users', (req, res) => {
  try {
    const { name, email, password, phone, balance, is_admin } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Nome, email e senha obrigatórios' });
    if (getOne('SELECT id FROM users WHERE email=?', [email])) return res.status(409).json({ error: 'Email já existe' });
    const id = uuid();
    run('INSERT INTO users (id,name,email,phone,password,balance,is_admin) VALUES (?,?,?,?,?,?,?)',
      [id, name, email, phone || '', bcrypt.hashSync(password, 10), balance || 0, is_admin ? 1 : 0]);
    res.status(201).json(getOne('SELECT id,name,email,phone,balance,is_admin,status FROM users WHERE id=?', [id]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/users/:id', (req, res) => {
  try {
    const existing = getOne('SELECT id FROM users WHERE id=?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Não encontrado' });
    const { name, email, phone, balance, is_admin, status, password } = req.body;
    if (name !== undefined) run('UPDATE users SET name=? WHERE id=?', [name, req.params.id]);
    if (email !== undefined) run('UPDATE users SET email=? WHERE id=?', [email, req.params.id]);
    if (phone !== undefined) run('UPDATE users SET phone=? WHERE id=?', [phone, req.params.id]);
    if (balance !== undefined) run('UPDATE users SET balance=? WHERE id=?', [balance, req.params.id]);
    if (is_admin !== undefined) run('UPDATE users SET is_admin=? WHERE id=?', [is_admin ? 1 : 0, req.params.id]);
    if (status !== undefined) run('UPDATE users SET status=? WHERE id=?', [status, req.params.id]);
    if (password) run('UPDATE users SET password=? WHERE id=?', [bcrypt.hashSync(password, 10), req.params.id]);
    res.json(getOne('SELECT id,name,email,phone,balance,is_admin,status FROM users WHERE id=?', [req.params.id]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/users/:id', (req, res) => {
  try {
    run("UPDATE users SET status='inactive' WHERE id=?", [req.params.id]);
    res.json({ success: true, message: 'Usuário desativado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== PROPERTIES CRUD =====
router.get('/properties', (req, res) => {
  try {
    const { type, status, search, page = 1, limit = 20 } = req.query;
    let sql = 'SELECT * FROM properties WHERE 1=1';
    const params = [];
    if (type) { sql += ' AND type=?'; params.push(type); }
    if (status) { sql += ' AND status=?'; params.push(status); }
    if (search) { sql += ' AND (title LIKE ? OR location LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    const total = getOne(sql.replace(/SELECT .+? FROM/, 'SELECT COUNT(*) as t FROM'), params).t;
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(+limit, (+page - 1) * +limit);
    const properties = query(sql, params).map(p => ({ ...p, tokens_available: p.total_tokens - p.tokens_sold, progress_pct: Math.round((p.tokens_sold / p.total_tokens) * 100) }));
    res.json({ properties, total, page: +page, pages: Math.ceil(total / +limit) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/properties/:id', (req, res) => {
  try {
    const p = getOne('SELECT * FROM properties WHERE id=?', [req.params.id]);
    if (!p) return res.status(404).json({ error: 'Não encontrado' });
    const investors = getOne('SELECT COUNT(DISTINCT user_id) as count, SUM(tokens) as total_tokens FROM investments WHERE property_id=?', [req.params.id]);
    const investments = query('SELECT i.*, u.name, u.email FROM investments i JOIN users u ON i.user_id=u.id WHERE i.property_id=?', [req.params.id]);
    res.json({ ...p, tokens_available: p.total_tokens - p.tokens_sold, progress_pct: Math.round((p.tokens_sold / p.total_tokens) * 100), investors_count: investors?.count || 0, investors_tokens: investors?.total_tokens || 0, investments });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/properties', (req, res) => {
  try {
    const { title, location, type, description, image_url, total_value, token_price, total_tokens, yield_annual, appreciation, term_months, status } = req.body;
    if (!title || !location || !type || !total_value || !token_price || !total_tokens || !yield_annual || !term_months) {
      return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    }
    const id = uuid();
    run('INSERT INTO properties (id,title,location,type,description,image_url,total_value,token_price,total_tokens,yield_annual,appreciation,term_months,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [id, title, location, type, description || '', image_url || '', total_value, token_price, total_tokens, yield_annual, appreciation || 0, term_months, status || 'active']);
    res.status(201).json(getOne('SELECT * FROM properties WHERE id=?', [id]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/properties/:id', (req, res) => {
  try {
    const existing = getOne('SELECT id FROM properties WHERE id=?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Não encontrado' });
    const { title, location, type, description, image_url, total_value, token_price, total_tokens, tokens_sold, yield_annual, appreciation, term_months, status } = req.body;
    if (title !== undefined) run('UPDATE properties SET title=? WHERE id=?', [title, req.params.id]);
    if (location !== undefined) run('UPDATE properties SET location=? WHERE id=?', [location, req.params.id]);
    if (type !== undefined) run('UPDATE properties SET type=? WHERE id=?', [type, req.params.id]);
    if (description !== undefined) run('UPDATE properties SET description=? WHERE id=?', [description, req.params.id]);
    if (image_url !== undefined) run('UPDATE properties SET image_url=? WHERE id=?', [image_url, req.params.id]);
    if (total_value !== undefined) run('UPDATE properties SET total_value=? WHERE id=?', [total_value, req.params.id]);
    if (token_price !== undefined) run('UPDATE properties SET token_price=? WHERE id=?', [token_price, req.params.id]);
    if (total_tokens !== undefined) run('UPDATE properties SET total_tokens=? WHERE id=?', [total_tokens, req.params.id]);
    if (tokens_sold !== undefined) run('UPDATE properties SET tokens_sold=? WHERE id=?', [tokens_sold, req.params.id]);
    if (yield_annual !== undefined) run('UPDATE properties SET yield_annual=? WHERE id=?', [yield_annual, req.params.id]);
    if (appreciation !== undefined) run('UPDATE properties SET appreciation=? WHERE id=?', [appreciation, req.params.id]);
    if (term_months !== undefined) run('UPDATE properties SET term_months=? WHERE id=?', [term_months, req.params.id]);
    if (status !== undefined) run('UPDATE properties SET status=? WHERE id=?', [status, req.params.id]);
    res.json(getOne('SELECT * FROM properties WHERE id=?', [req.params.id]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/properties/:id', (req, res) => {
  try {
    run("UPDATE properties SET status='inactive' WHERE id=?", [req.params.id]);
    res.json({ success: true, message: 'Imóvel desativado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== INVESTMENTS =====
router.get('/investments', (req, res) => {
  try {
    const { user_id, property_id, page = 1, limit = 20 } = req.query;
    let sql = 'SELECT i.*, u.name as user_name, u.email as user_email, p.title as property_title, p.token_price FROM investments i JOIN users u ON i.user_id=u.id JOIN properties p ON i.property_id=p.id WHERE 1=1';
    const params = [];
    if (user_id) { sql += ' AND i.user_id=?'; params.push(user_id); }
    if (property_id) { sql += ' AND i.property_id=?'; params.push(property_id); }
    const countSql = sql.replace(/SELECT i\..+? FROM/, 'SELECT COUNT(*) as t FROM');
    const total = getOne(countSql, params).t;
    sql += ' ORDER BY i.created_at DESC LIMIT ? OFFSET ?';
    params.push(+limit, (+page - 1) * +limit);
    const investments = query(sql, params);
    res.json({ investments, total, page: +page, pages: Math.ceil(total / +limit) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== DIVIDENDS =====
router.get('/dividends', (req, res) => {
  try {
    const { month, page = 1, limit = 20 } = req.query;
    let sql = 'SELECT d.*, u.name as user_name, p.title as property_title FROM dividends d JOIN users u ON d.user_id=u.id JOIN properties p ON d.property_id=p.id WHERE 1=1';
    const params = [];
    if (month) { sql += ' AND d.month=?'; params.push(month); }
    const countSql = sql.replace(/SELECT d\..+? FROM/, 'SELECT COUNT(*) as t FROM');
    const total = getOne(countSql, params).t;
    sql += ' ORDER BY d.created_at DESC LIMIT ? OFFSET ?';
    params.push(+limit, (+page - 1) * +limit);
    const dividends = query(sql, params);
    res.json({ dividends, total, page: +page, pages: Math.ceil(total / +limit) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/dividends/generate', (req, res) => {
  try {
    const investments = query('SELECT i.user_id, i.property_id, i.tokens, p.token_price, p.yield_annual FROM investments i JOIN properties p ON i.property_id=p.id');
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (getOne('SELECT id FROM dividends WHERE month=?', [month])) {
      return res.status(400).json({ error: 'Dividendos já gerados para este mês' });
    }
    let count = 0;
    for (const inv of investments) {
      const amt = inv.tokens * inv.token_price * (inv.yield_annual / 12 / 100);
      if (amt > 0) {
        run('INSERT INTO dividends (id,user_id,property_id,amount,month,paid) VALUES (?,?,?,?,?,1)', [uuid(), inv.user_id, inv.property_id, amt, month]);
        run('UPDATE users SET balance=balance+? WHERE id=?', [amt, inv.user_id]);
        run('INSERT INTO transactions (id,user_id,type,amount,description) VALUES (?,?,?,?,?)', [uuid(), inv.user_id, 'dividend', amt, `Dividendo ${month}`]);
        count++;
      }
    }
    res.json({ success: true, message: `${count} dividendos gerados para ${month}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== TRANSACTIONS =====
router.get('/transactions', (req, res) => {
  try {
    const { user_id, type, page = 1, limit = 20 } = req.query;
    let sql = 'SELECT t.*, u.name as user_name FROM transactions t JOIN users u ON t.user_id=u.id WHERE 1=1';
    const params = [];
    if (user_id) { sql += ' AND t.user_id=?'; params.push(user_id); }
    if (type) { sql += ' AND t.type=?'; params.push(type); }
    const countSql = sql.replace(/SELECT t\..+? FROM/, 'SELECT COUNT(*) as t FROM');
    const total = getOne(countSql, params).t;
    sql += ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?';
    params.push(+limit, (+page - 1) * +limit);
    const transactions = query(sql, params);
    res.json({ transactions, total, page: +page, pages: Math.ceil(total / +limit) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== SETTINGS =====
router.get('/settings', (req, res) => {
  try {
    const rows = query('SELECT * FROM settings');
    const settings = {};
    for (const r of rows) settings[r.key] = r.value;
    res.json(settings);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/settings', (req, res) => {
  try {
    const settings = req.body;
    for (const [key, value] of Object.entries(settings)) {
      const existing = getOne('SELECT key FROM settings WHERE key=?', [key]);
      if (existing) run('UPDATE settings SET value=? WHERE key=?', [String(value), key]);
      else run('INSERT INTO settings (key, value) VALUES (?,?)', [key, String(value)]);
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== EXPORT =====
router.get('/export/:type', (req, res) => {
  try {
    const { type } = req.params;
    let rows, filename;
    if (type === 'users') {
      rows = query('SELECT id, name, email, phone, balance, is_admin, status, created_at, last_login FROM users ORDER BY created_at DESC');
      filename = 'usuarios.csv';
    } else if (type === 'investments') {
      rows = query(`SELECT u.name, u.email, p.title as property, i.tokens, p.token_price, i.total_paid, i.created_at
        FROM investments i JOIN users u ON i.user_id=u.id JOIN properties p ON i.property_id=p.id ORDER BY i.created_at DESC`);
      filename = 'investimentos.csv';
    } else if (type === 'transactions') {
      rows = query(`SELECT u.name, u.email, t.type, t.amount, t.description, t.created_at
        FROM transactions t JOIN users u ON t.user_id=u.id ORDER BY t.created_at DESC`);
      filename = 'transacoes.csv';
    } else if (type === 'dividends') {
      rows = query(`SELECT u.name, u.email, p.title as property, d.amount, d.month, d.paid, d.created_at
        FROM dividends d JOIN users u ON d.user_id=u.id JOIN properties p ON d.property_id=p.id ORDER BY d.created_at DESC`);
      filename = 'dividendos.csv';
    } else {
      return res.status(400).json({ error: 'Tipo inválido' });
    }
    if (!rows.length) {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send('');
    }
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${String(r[h] || '').replace(/"/g, '""')}"`).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + csv);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== WITHDRAWALS =====
router.get('/withdrawals', (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    let sql = 'SELECT t.*, u.name as user_name, u.email as user_email FROM transactions t JOIN users u ON t.user_id=u.id WHERE t.type=\'withdrawal\'';
    const params = [];
    if (status) { sql += ' AND t.status=?'; params.push(status); }
    const countSql = sql.replace(/SELECT t\..+? FROM/, 'SELECT COUNT(*) as t FROM');
    const total = getOne(countSql, params).t;
    sql += ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?';
    params.push(+limit, (+page - 1) * +limit);
    const withdrawals = query(sql, params);
    res.json({ withdrawals, total, page: +page, pages: Math.ceil(total / +limit) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/withdrawals/:id', (req, res) => {
  try {
    const { status } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido' });
    }
    const tx = getOne('SELECT * FROM transactions WHERE id=? AND type=\'withdrawal\'', [req.params.id]);
    if (!tx) return res.status(404).json({ error: 'Saque não encontrado' });
    if (tx.status !== 'pending') {
      return res.status(400).json({ error: 'Saque já processado' });
    }
    if (status === 'rejected') {
      run('UPDATE users SET balance = balance + ? WHERE id = ?', [Math.abs(tx.amount), tx.user_id]);
    }
    run('UPDATE transactions SET status=? WHERE id=?', [status, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
