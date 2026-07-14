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

  db.run(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, balance REAL DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS properties (id TEXT PRIMARY KEY, title TEXT NOT NULL, location TEXT NOT NULL, type TEXT NOT NULL, description TEXT, image_url TEXT, total_value REAL NOT NULL, token_price REAL NOT NULL, total_tokens INTEGER NOT NULL, tokens_sold INTEGER DEFAULT 0, yield_annual REAL NOT NULL, appreciation REAL DEFAULT 0, term_months INTEGER NOT NULL, status TEXT DEFAULT 'active', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS investments (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, property_id TEXT NOT NULL, tokens INTEGER NOT NULL, total_paid REAL NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS dividends (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, property_id TEXT NOT NULL, amount REAL NOT NULL, month TEXT NOT NULL, paid INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS transactions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL, amount REAL NOT NULL, description TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
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
