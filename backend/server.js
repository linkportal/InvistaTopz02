require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { getDb } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/properties', require('./routes/properties'));
app.use('/api/investments', require('./routes/investments'));
app.use('/api/dividends', require('./routes/dividends'));
app.use('/api/transactions', require('./routes/transactions'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
  }
});

async function start() {
  await getDb();
  console.log('Banco de dados inicializado');
  app.listen(PORT, () => {
    console.log(`InvistaTop API rodando em http://localhost:${PORT}`);
    console.log(`Frontend em http://localhost:${PORT}`);
  });
}

start().catch(console.error);
