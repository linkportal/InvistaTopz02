const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'invistatop.db');
let db = null;
let inTransaction = false;

async function getDb() {
  if (db) return db;
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  db.run('PRAGMA foreign_keys = ON');

  db.run(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, phone TEXT DEFAULT '', balance REAL DEFAULT 0, is_admin INTEGER DEFAULT 0, status TEXT DEFAULT 'active', last_login DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`)
  try { db.run("ALTER TABLE users ADD COLUMN phone TEXT DEFAULT ''"); } catch {}
  try { db.run('ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0'); } catch {}
  try { db.run("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'"); } catch {}
  try { db.run('ALTER TABLE users ADD COLUMN last_login DATETIME'); } catch {};
  db.run(`CREATE TABLE IF NOT EXISTS properties (id TEXT PRIMARY KEY, title TEXT NOT NULL, location TEXT NOT NULL, type TEXT NOT NULL, description TEXT, image_url TEXT, total_value REAL NOT NULL, token_price REAL NOT NULL, total_tokens INTEGER NOT NULL, tokens_sold INTEGER DEFAULT 0, yield_annual REAL NOT NULL, appreciation REAL DEFAULT 0, term_months INTEGER NOT NULL, status TEXT DEFAULT 'active', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS investments (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), property_id TEXT NOT NULL REFERENCES properties(id), tokens INTEGER NOT NULL, total_paid REAL NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS dividends (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), property_id TEXT NOT NULL REFERENCES properties(id), amount REAL NOT NULL, month TEXT NOT NULL, paid INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS transactions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), type TEXT NOT NULL, amount REAL NOT NULL, description TEXT, status TEXT DEFAULT 'completed', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  try { db.run("ALTER TABLE transactions ADD COLUMN status TEXT DEFAULT 'completed'"); } catch {}
  db.run('CREATE INDEX IF NOT EXISTS idx_investments_user ON investments(user_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_investments_property ON investments(property_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_dividends_user ON dividends(user_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_dividends_property ON dividends(property_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_dividends_month ON dividends(month)');
  db.run('CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type)');
  db.run('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
  db.run('CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)');
  db.run('CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status)');
  db.run('CREATE INDEX IF NOT EXISTS idx_properties_type ON properties(type)');
  save();
  return db;
}

function save() {
  if (db && !inTransaction) {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  }
}

function saveForce() {
  if (db) {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  }
}

function query(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const results = [];
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

function getOne(sql, params = []) {
  const results = query(sql, params);
  return results.length > 0 ? results[0] : undefined;
}

function run(sql, params = []) {
  db.run(sql, params);
  if (!inTransaction) save();
}

function runTransaction(fn) {
  inTransaction = true;
  db.run('BEGIN');
  try {
    fn();
    db.run('COMMIT');
  } catch (e) {
    try { db.run('ROLLBACK'); } catch {}
    throw e;
  } finally {
    inTransaction = false;
    saveForce();
  }
}

module.exports = { getDb, query, getOne, run, runTransaction };
