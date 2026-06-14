const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'bot.db');

// data papkasini yaratish
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Jadvallarni yaratish
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    telegram_id INTEGER UNIQUE NOT NULL,
    username TEXT,
    full_name TEXT,
    balance INTEGER DEFAULT 0,
    total_spent INTEGER DEFAULT 0,
    joined_at TEXT DEFAULT (datetime('now')),
    is_banned INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    telegram_id INTEGER NOT NULL,
    product_type TEXT NOT NULL,
    product_name TEXT NOT NULL,
    amount INTEGER NOT NULL,
    price INTEGER NOT NULL,
    pubg_id TEXT,
    pubg_nick TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT,
    admin_note TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS topup_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    receipt_file_id TEXT,
    receipt_type TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    reviewed_at TEXT,
    reviewed_by INTEGER,
    reject_reason TEXT
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    amount INTEGER NOT NULL,
    description TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    amount INTEGER NOT NULL,
    price INTEGER NOT NULL,
    is_active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0
  );
`);

// Default mahsulotlarni qo'shish (agar bo'sh bo'lsa)
const productCount = db.prepare('SELECT COUNT(*) as cnt FROM products').get();
if (productCount.cnt === 0) {
  const insertProduct = db.prepare(
    'INSERT INTO products (type, name, amount, price, sort_order) VALUES (?, ?, ?, ?, ?)'
  );

  // UC mahsulotlari
  insertProduct.run('uc', '60 UC', 60, 15000, 1);
  insertProduct.run('uc', '325 UC', 325, 65000, 2);
  insertProduct.run('uc', '660 UC', 660, 125000, 3);
  insertProduct.run('uc', '1800 UC', 1800, 320000, 4);
  insertProduct.run('uc', '3850 UC', 3850, 640000, 5);
  insertProduct.run('uc', '8100 UC', 8100, 1275000, 6);

  // Popularity mahsulotlari
  insertProduct.run('popularity', '100 Popularity', 100, 25000, 1);
  insertProduct.run('popularity', '300 Popularity', 300, 70000, 2);
  insertProduct.run('popularity', '600 Popularity', 600, 130000, 3);
  insertProduct.run('popularity', '1500 Popularity', 1500, 300000, 4);
}

// ========================
// USERS
// ========================
function getOrCreateUser(telegramId, username, fullName) {
  let user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);
  if (!user) {
    db.prepare(
      'INSERT OR IGNORE INTO users (telegram_id, username, full_name) VALUES (?, ?, ?)'
    ).run(telegramId, username || null, fullName || null);
    user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);
  } else {
    db.prepare('UPDATE users SET username = ?, full_name = ? WHERE telegram_id = ?')
      .run(username || null, fullName || null, telegramId);
  }
  return user;
}

function getUserByTelegramId(telegramId) {
  return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);
}

function getUserBalance(telegramId) {
  const user = db.prepare('SELECT balance FROM users WHERE telegram_id = ?').get(telegramId);
  return user ? user.balance : 0;
}

function addBalance(telegramId, amount, description = 'Hisob to\'ldirish') {
  db.prepare('UPDATE users SET balance = balance + ? WHERE telegram_id = ?').run(amount, telegramId);
  db.prepare(
    'INSERT INTO transactions (telegram_id, type, amount, description) VALUES (?, ?, ?, ?)'
  ).run(telegramId, 'topup', amount, description);
}

function deductBalance(telegramId, amount, description = 'Xarid') {
  const user = getUserByTelegramId(telegramId);
  if (!user || user.balance < amount) return false;
  db.prepare('UPDATE users SET balance = balance - ?, total_spent = total_spent + ? WHERE telegram_id = ?')
    .run(amount, amount, telegramId);
  db.prepare(
    'INSERT INTO transactions (telegram_id, type, amount, description) VALUES (?, ?, ?, ?)'
  ).run(telegramId, 'purchase', -amount, description);
  return true;
}

function getAllUsers() {
  return db.prepare('SELECT * FROM users ORDER BY joined_at DESC').all();
}

function getUserCount() {
  return db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt;
}

// ========================
// TOPUP REQUESTS
// ========================
function createTopupRequest(telegramId, amount, receiptFileId, receiptType) {
  const result = db.prepare(
    'INSERT INTO topup_requests (telegram_id, amount, receipt_file_id, receipt_type) VALUES (?, ?, ?, ?)'
  ).run(telegramId, amount, receiptFileId, receiptType);
  return result.lastInsertRowid;
}

function getTopupRequest(id) {
  return db.prepare('SELECT * FROM topup_requests WHERE id = ?').get(id);
}

function getPendingTopupRequests() {
  return db.prepare("SELECT * FROM topup_requests WHERE status = 'pending' ORDER BY created_at").all();
}

function approveTopupRequest(id, adminId) {
  const req = getTopupRequest(id);
  if (!req || req.status !== 'pending') return false;
  db.prepare(
    "UPDATE topup_requests SET status = 'approved', reviewed_at = datetime('now'), reviewed_by = ? WHERE id = ?"
  ).run(adminId, id);
  addBalance(req.telegram_id, req.amount, `To'ldirish #${id} tasdiqlandi`);
  return req;
}

function rejectTopupRequest(id, adminId, reason) {
  const req = getTopupRequest(id);
  if (!req || req.status !== 'pending') return false;
  db.prepare(
    "UPDATE topup_requests SET status = 'rejected', reviewed_at = datetime('now'), reviewed_by = ?, reject_reason = ? WHERE id = ?"
  ).run(adminId, reason || null, id);
  return req;
}

// ========================
// ORDERS
// ========================
function createOrder(telegramId, productType, productName, amount, price, pubgId, pubgNick) {
  const user = getUserByTelegramId(telegramId);
  if (!user) return null;
  const result = db.prepare(
    `INSERT INTO orders (user_id, telegram_id, product_type, product_name, amount, price, pubg_id, pubg_nick)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(user.id, telegramId, productType, productName, amount, price, pubgId, pubgNick);
  return result.lastInsertRowid;
}

function getOrder(id) {
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
}

function getUserOrders(telegramId, limit = 10) {
  return db.prepare(
    'SELECT * FROM orders WHERE telegram_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(telegramId, limit);
}

function getAllOrders(limit = 50) {
  return db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT ?').all(limit);
}

function completeOrder(id) {
  db.prepare("UPDATE orders SET status = 'completed', completed_at = datetime('now') WHERE id = ?").run(id);
}

function cancelOrder(id, note) {
  db.prepare("UPDATE orders SET status = 'cancelled', admin_note = ? WHERE id = ?").run(note || null, id);
}

// ========================
// PRODUCTS
// ========================
function getProducts(type) {
  return db.prepare(
    'SELECT * FROM products WHERE type = ? AND is_active = 1 ORDER BY sort_order, price'
  ).all(type);
}

function getProductById(id) {
  return db.prepare('SELECT * FROM products WHERE id = ?').get(id);
}

// ========================
// TRANSACTIONS
// ========================
function getUserTransactions(telegramId, limit = 10) {
  return db.prepare(
    'SELECT * FROM transactions WHERE telegram_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(telegramId, limit);
}

// ========================
// STATS
// ========================
function getStats() {
  const totalUsers = db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt;
  const totalOrders = db.prepare("SELECT COUNT(*) as cnt FROM orders WHERE status = 'completed'").get().cnt;
  const totalRevenue = db.prepare("SELECT COALESCE(SUM(price), 0) as total FROM orders WHERE status = 'completed'").get().total;
  const pendingTopups = db.prepare("SELECT COUNT(*) as cnt FROM topup_requests WHERE status = 'pending'").get().cnt;
  const pendingOrders = db.prepare("SELECT COUNT(*) as cnt FROM orders WHERE status = 'pending'").get().cnt;
  return { totalUsers, totalOrders, totalRevenue, pendingTopups, pendingOrders };
}

module.exports = {
  db,
  getOrCreateUser,
  getUserByTelegramId,
  getUserBalance,
  addBalance,
  deductBalance,
  getAllUsers,
  getUserCount,
  createTopupRequest,
  getTopupRequest,
  getPendingTopupRequests,
  approveTopupRequest,
  rejectTopupRequest,
  createOrder,
  getOrder,
  getUserOrders,
  getAllOrders,
  completeOrder,
  cancelOrder,
  getProducts,
  getProductById,
  getUserTransactions,
  getStats
};
