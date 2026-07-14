const express = require('express');
const { v4: uuid } = require('uuid');
const { query, getOne, run, runTransaction } = require('../database');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.post('/buy', auth, (req, res) => {
  try {
    const { property_id, tokens } = req.body;
    if (!property_id || !tokens || tokens <= 0) {
      return res.status(400).json({ error: 'property_id e tokens são obrigatórios' });
    }

    const property = getOne("SELECT * FROM properties WHERE id = ? AND status = 'active'", [property_id]);
    if (!property) return res.status(404).json({ error: 'Imóvel não encontrado ou inativo' });

    const available = property.total_tokens - property.tokens_sold;
    if (tokens > available) {
      return res.status(400).json({ error: `Apenas ${available} tokens disponíveis` });
    }

    const totalPaid = tokens * property.token_price;
    const user = getOne('SELECT * FROM users WHERE id = ?', [req.userId]);
    if (user.balance < totalPaid) {
      return res.status(400).json({ error: `Saldo insuficiente. Necessário: R$ ${totalPaid.toFixed(2)}, disponível: R$ ${user.balance.toFixed(2)}` });
    }

    runTransaction(() => {
      run('UPDATE users SET balance = balance - ? WHERE id = ?', [totalPaid, req.userId]);
      run('UPDATE properties SET tokens_sold = tokens_sold + ? WHERE id = ?', [tokens, property_id]);

      const existing = getOne('SELECT * FROM investments WHERE user_id = ? AND property_id = ?', [req.userId, property_id]);
      if (existing) {
        run('UPDATE investments SET tokens = tokens + ?, total_paid = total_paid + ? WHERE id = ?', [tokens, totalPaid, existing.id]);
      } else {
        const invId = uuid();
        run('INSERT INTO investments (id, user_id, property_id, tokens, total_paid) VALUES (?, ?, ?, ?, ?)', [invId, req.userId, property_id, tokens, totalPaid]);
      }

      const txId = uuid();
      run('INSERT INTO transactions (id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)', [txId, req.userId, 'purchase', -totalPaid, `Compra de ${tokens} tokens de ${property.title}`]);
    });

    const updatedUser = getOne('SELECT balance FROM users WHERE id = ?', [req.userId]);
    const updatedProperty = getOne('SELECT * FROM properties WHERE id = ?', [property_id]);

    res.json({
      success: true,
      message: `${tokens} tokens comprados com sucesso!`,
      investment: {
        property_title: property.title,
        tokens,
        total_paid: totalPaid,
        token_price: property.token_price
      },
      balance: updatedUser.balance,
      tokens_available: updatedProperty.total_tokens - updatedProperty.tokens_sold
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/', auth, (req, res) => {
  try {
    const investments = query(`
      SELECT i.*, p.title, p.location, p.type, p.yield_annual, p.token_price, p.total_value, p.image_url
      FROM investments i
      JOIN properties p ON i.property_id = p.id
      WHERE i.user_id = ?
      ORDER BY i.created_at DESC
    `, [req.userId]);

    const result = investments.map(inv => ({
      ...inv,
      current_value: inv.tokens * inv.token_price * (1 + inv.yield_annual / 100),
      monthly_dividend: (inv.tokens * inv.token_price * inv.yield_annual / 100) / 12,
      return_pct: inv.yield_annual
    }));

    const totalInvested = result.reduce((s, i) => s + i.total_paid, 0);
    const totalValue = result.reduce((s, i) => s + i.current_value, 0);

    res.json({
      investments: result,
      summary: {
        total_invested: totalInvested,
        current_value: totalValue,
        total_return: totalValue - totalInvested,
        monthly_income: result.reduce((s, i) => s + i.monthly_dividend, 0)
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/portfolio', auth, (req, res) => {
  try {
    const investments = query(`
      SELECT i.property_id, p.title, p.location, p.type, p.yield_annual, p.token_price,
             SUM(i.tokens) as total_tokens, SUM(i.total_paid) as total_invested
      FROM investments i
      JOIN properties p ON i.property_id = p.id
      WHERE i.user_id = ?
      GROUP BY i.property_id
    `, [req.userId]);

    const portfolio = investments.map(inv => ({
      property_id: inv.property_id,
      title: inv.title,
      location: inv.location,
      type: inv.type,
      tokens: inv.total_tokens,
      invested: inv.total_invested,
      current_value: inv.total_tokens * inv.token_price * (1 + inv.yield_annual / 100),
      monthly_dividend: (inv.total_tokens * inv.token_price * inv.yield_annual / 100) / 12
    }));

    const totalInvested = portfolio.reduce((s, i) => s + i.invested, 0);
    const totalValue = portfolio.reduce((s, i) => s + i.current_value, 0);

    res.json({
      portfolio,
      total_invested: totalInvested,
      total_value: totalValue,
      total_return: totalValue - totalInvested,
      monthly_income: portfolio.reduce((s, i) => s + i.monthly_dividend, 0)
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
