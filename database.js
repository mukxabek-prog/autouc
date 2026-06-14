const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// data papkasini yaratish
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Default ma'lumotlar
const DEFAULT_DB = {
  users: {},
  orders: [],
  topup_requests: [],
  transactions: [],
  next_order_id: 1,
  next_topup_id: 1,
  products: {
    uc: [
      { id: 1, type: 'uc', name: '60 UC', amount: 60, price: 15000 },
      { id: 2, type: 'uc', name: '325 UC', amount: 325, price: 65000 },
      { id: 3, type: 'uc', name: '660 UC', amount: 660, price: 125000 },
      { id: 4, type: 'uc', name: '1800 UC', amount: 1800, price: 320000 },
      { id: 5, type: 'uc', name: '3850 UC', amount: 3850, price: 640000 },
      { id: 6, type: 'uc', name: '8100 UC', amount: 8100, price: 1275000 }
    ],
    popularity: [
      { id: 7, type: 'popularity', name: '100 Popularity', amount: 100, price: 25000 },
      { id: 8, type: 'popularity', name: '300 Popularity', amount: 300, price: 70000 },
      { id: 9, type: 'popularity', name: '600 Popularity', amount: 600, price: 130000 },
      { id: 10, type: 'popularity', name: '1500 Popularity', amount: 1500, price: 300000 }
    ]
  }
};

// DB ni yuklash
function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {}
  return JSON.parse(JSON.stringify(DEFAULT_DB));
}

// DB ni saqlash
function saveDB(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('DB saqlashda xato:', e.message);
  }
}

// ========================
// USERS
// ========================
function getOrCreateUser(telegramId, username, fullName) {
  const db = loadDB();
  const id = String(telegramId);
  if (!db.users[id]) {
    db.users[id] = {
      telegram_id: telegramId,
      username: username || null,
      full_name: fullName || null,
      balance: 0,
      total_spent: 0,
      joined_at: new Date().toISOString(),
      is_banned: false
    };
  } else {
    db.users[id].username = username || db.users[id].username;
    db.users[id].full_name = fullName || db.users[id].full_name;
  }
  saveDB(db);
  return db.users[id];
}

function getUserByTelegramId(telegramId) {
  const db = loadDB();
  return db.users[String(telegramId)] || null;
}

function getUserBalance(telegramId) {
  const user = getUserByTelegramId(telegramId);
  return user ? user.balance : 0;
}

function addBalance(telegramId, amount, description = "Hisob to'ldirish") {
  const db = loadDB();
  const id = String(telegramId);
  if (!db.users[id]) return;
  db.users[id].balance += amount;
  db.transactions.push({
    telegram_id: telegramId,
    type: 'topup',
    amount: amount,
    description,
    created_at: new Date().toISOString()
  });
  saveDB(db);
}

function deductBalance(telegramId, amount, description = 'Xarid') {
  const db = loadDB();
  const id = String(telegramId);
  if (!db.users[id] || db.users[id].balance < amount) return false;
  db.users[id].balance -= amount;
  db.users[id].total_spent += amount;
  db.transactions.push({
    telegram_id: telegramId,
    type: 'purchase',
    amount: -amount,
    description,
    created_at: new Date().toISOString()
  });
  saveDB(db);
  return true;
}

function getAllUsers() {
  const db = loadDB();
  return Object.values(db.users);
}

function getUserCount() {
  const db = loadDB();
  return Object.keys(db.users).length;
}

// ========================
// TOPUP REQUESTS
// ========================
function createTopupRequest(telegramId, amount, receiptFileId, receiptType) {
  const db = loadDB();
  const id = db.next_topup_id++;
  db.topup_requests.push({
    id,
    telegram_id: telegramId,
    amount,
    receipt_file_id: receiptFileId,
    receipt_type: receiptType,
    status: 'pending',
    created_at: new Date().toISOString(),
    reviewed_at: null,
    reviewed_by: null,
    reject_reason: null
  });
  saveDB(db);
  return id;
}

function getTopupRequest(id) {
  const db = loadDB();
  return db.topup_requests.find(r => r.id === parseInt(id)) || null;
}

function getPendingTopupRequests() {
  const db = loadDB();
  return db.topup_requests.filter(r => r.status === 'pending');
}

function approveTopupRequest(id, adminId) {
  const db = loadDB();
  const req = db.topup_requests.find(r => r.id === parseInt(id));
  if (!req || req.status !== 'pending') return false;
  req.status = 'approved';
  req.reviewed_at = new Date().toISOString();
  req.reviewed_by = adminId;
  saveDB(db);
  addBalance(req.telegram_id, req.amount, `To'ldirish #${id} tasdiqlandi`);
  return req;
}

function rejectTopupRequest(id, adminId, reason) {
  const db = loadDB();
  const req = db.topup_requests.find(r => r.id === parseInt(id));
  if (!req || req.status !== 'pending') return false;
  req.status = 'rejected';
  req.reviewed_at = new Date().toISOString();
  req.reviewed_by = adminId;
  req.reject_reason = reason || null;
  saveDB(db);
  return req;
}

// ========================
// ORDERS
// ========================
function createOrder(telegramId, productType, productName, amount, price, pubgId, pubgNick) {
  const db = loadDB();
  const id = db.next_order_id++;
  db.orders.push({
    id,
    telegram_id: telegramId,
    product_type: productType,
    product_name: productName,
    amount,
    price,
    pubg_id: pubgId,
    pubg_nick: pubgNick,
    status: 'pending',
    created_at: new Date().toISOString(),
    completed_at: null,
    admin_note: null
  });
  saveDB(db);
  return id;
}

function getOrder(id) {
  const db = loadDB();
  return db.orders.find(o => o.id === parseInt(id)) || null;
}

function getUserOrders(telegramId, limit = 10) {
  const db = loadDB();
  return db.orders
    .filter(o => o.telegram_id === telegramId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, limit);
}

function getAllOrders(limit = 50) {
  const db = loadDB();
  return db.orders
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, limit);
}

function completeOrder(id) {
  const db = loadDB();
  const order = db.orders.find(o => o.id === parseInt(id));
  if (order) {
    order.status = 'completed';
    order.completed_at = new Date().toISOString();
    saveDB(db);
  }
}

function cancelOrder(id, note) {
  const db = loadDB();
  const order = db.orders.find(o => o.id === parseInt(id));
  if (order) {
    order.status = 'cancelled';
    order.admin_note = note || null;
    saveDB(db);
  }
}

// ========================
// PRODUCTS
// ========================
function getProducts(type) {
  const db = loadDB();
  return db.products[type] || [];
}

function getProductById(id) {
  const db = loadDB();
  const all = [...(db.products.uc || []), ...(db.products.popularity || [])];
  return all.find(p => p.id === parseInt(id)) || null;
}

// ========================
// TRANSACTIONS
// ========================
function getUserTransactions(telegramId, limit = 10) {
  const db = loadDB();
  return db.transactions
    .filter(t => t.telegram_id === telegramId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, limit);
}

// ========================
// STATS
// ========================
function getStats() {
  const db = loadDB();
  const totalUsers = Object.keys(db.users).length;
  const completedOrders = db.orders.filter(o => o.status === 'completed');
  const totalOrders = completedOrders.length;
  const totalRevenue = completedOrders.reduce((sum, o) => sum + o.price, 0);
  const pendingTopups = db.topup_requests.filter(r => r.status === 'pending').length;
  const pendingOrders = db.orders.filter(o => o.status === 'pending').length;
  return { totalUsers, totalOrders, totalRevenue, pendingTopups, pendingOrders };
}

module.exports = {
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
