require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const http = require('http');

// ========================
// CONFIG
// ========================
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(id => parseInt(id.trim())).filter(Boolean);
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) { console.error('❌ BOT_TOKEN topilmadi!'); process.exit(1); }

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const userStates = {};

// ========================
// DATABASE (JSON)
// ========================
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DEFAULT_DB = {
  users: {}, orders: [], topup_requests: [], transactions: [],
  next_order_id: 1, next_topup_id: 1,
  products: {
    uc: [
      { id: 1, type: 'uc', name: '60 UC', price: 15000 },
      { id: 2, type: 'uc', name: '325 UC', price: 65000 },
      { id: 3, type: 'uc', name: '660 UC', price: 125000 },
      { id: 4, type: 'uc', name: '1800 UC', price: 320000 },
      { id: 5, type: 'uc', name: '3850 UC', price: 640000 },
      { id: 6, type: 'uc', name: '8100 UC', price: 1275000 }
    ],
    popularity: [
      { id: 7, type: 'popularity', name: '100 Popularity', price: 25000 },
      { id: 8, type: 'popularity', name: '300 Popularity', price: 70000 },
      { id: 9, type: 'popularity', name: '600 Popularity', price: 130000 },
      { id: 10, type: 'popularity', name: '1500 Popularity', price: 300000 }
    ],
    diamond: [
      { id: 11, type: 'diamond', name: '100 Diamond', price: 18000 },
      { id: 12, type: 'diamond', name: '310 Diamond', price: 52000 },
      { id: 13, type: 'diamond', name: '520 Diamond', price: 85000 },
      { id: 14, type: 'diamond', name: '1060 Diamond', price: 165000 },
      { id: 15, type: 'diamond', name: '2180 Diamond', price: 330000 },
      { id: 16, type: 'diamond', name: '5600 Diamond', price: 820000 }
    ],
    gems: [
      { id: 17, type: 'gems', name: '80 Gems', price: 12000 },
      { id: 18, type: 'gems', name: '500 Gems', price: 65000 },
      { id: 19, type: 'gems', name: '1200 Gems', price: 150000 },
      { id: 20, type: 'gems', name: '2500 Gems', price: 300000 },
      { id: 21, type: 'gems', name: '6500 Gems', price: 750000 },
      { id: 22, type: 'gems', name: '14000 Gems', price: 1500000 }
    ],
    mlbb: [
      { id: 23, type: 'mlbb', name: '86 Diamonds', price: 20000 },
      { id: 24, type: 'mlbb', name: '172 Diamonds', price: 38000 },
      { id: 25, type: 'mlbb', name: '257 Diamonds', price: 55000 },
      { id: 26, type: 'mlbb', name: '706 Diamonds', price: 145000 },
      { id: 27, type: 'mlbb', name: '1412 Diamonds', price: 280000 },
      { id: 28, type: 'mlbb', name: '2195 Diamonds', price: 420000 }
    ],
    robux: [
      { id: 29, type: 'robux', name: '400 Robux', price: 45000 },
      { id: 30, type: 'robux', name: '800 Robux', price: 85000 },
      { id: 31, type: 'robux', name: '1700 Robux', price: 170000 },
      { id: 32, type: 'robux', name: '4500 Robux', price: 420000 },
      { id: 33, type: 'robux', name: '10000 Robux', price: 900000 }
    ]
  }
};

function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      // Yangi o'yinlar bo'lmasa qo'shish
      for (const key of Object.keys(DEFAULT_DB.products)) {
        if (!data.products[key]) data.products[key] = DEFAULT_DB.products[key];
      }
      return data;
    }
  } catch (e) {}
  return JSON.parse(JSON.stringify(DEFAULT_DB));
}

function saveDB(data) {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2)); }
  catch (e) { console.error('DB xato:', e.message); }
}

function getOrCreateUser(telegramId, username, fullName) {
  const data = loadDB();
  const id = String(telegramId);
  if (!data.users[id]) {
    data.users[id] = { telegram_id: telegramId, username: username || null, full_name: fullName || null, balance: 0, total_spent: 0, joined_at: new Date().toISOString() };
  } else {
    if (username) data.users[id].username = username;
    if (fullName) data.users[id].full_name = fullName;
  }
  saveDB(data); return data.users[id];
}

function getUser(telegramId) { const d = loadDB(); return d.users[String(telegramId)] || null; }
function getBalance(telegramId) { const u = getUser(telegramId); return u ? u.balance : 0; }

function addBalance(telegramId, amount, desc) {
  const data = loadDB(); const id = String(telegramId);
  if (!data.users[id]) return;
  data.users[id].balance += amount;
  data.transactions.push({ telegram_id: telegramId, type: 'topup', amount, description: desc || "To'ldirish", created_at: new Date().toISOString() });
  saveDB(data);
}

function deductBalance(telegramId, amount, desc) {
  const data = loadDB(); const id = String(telegramId);
  if (!data.users[id] || data.users[id].balance < amount) return false;
  data.users[id].balance -= amount;
  data.users[id].total_spent += amount;
  data.transactions.push({ telegram_id: telegramId, type: 'purchase', amount: -amount, description: desc || 'Xarid', created_at: new Date().toISOString() });
  saveDB(data); return true;
}

function getAllUsers() { return Object.values(loadDB().users); }

function createTopupReq(telegramId, amount, fileId, fileType) {
  const data = loadDB();
  const id = data.next_topup_id++;
  data.topup_requests.push({ id, telegram_id: telegramId, amount, receipt_file_id: fileId, receipt_type: fileType, status: 'pending', created_at: new Date().toISOString(), reviewed_by: null, reject_reason: null });
  saveDB(data); return id;
}

function getTopupReq(id) { return loadDB().topup_requests.find(r => r.id === parseInt(id)) || null; }
function getPendingTopups() { return loadDB().topup_requests.filter(r => r.status === 'pending'); }

function approveTopup(id, adminId) {
  const data = loadDB();
  const req = data.topup_requests.find(r => r.id === parseInt(id));
  if (!req || req.status !== 'pending') return false;
  req.status = 'approved'; req.reviewed_by = adminId; req.reviewed_at = new Date().toISOString();
  saveDB(data); addBalance(req.telegram_id, req.amount, `To'ldirish #${id} tasdiqlandi`); return req;
}

function rejectTopup(id, adminId, reason) {
  const data = loadDB();
  const req = data.topup_requests.find(r => r.id === parseInt(id));
  if (!req || req.status !== 'pending') return false;
  req.status = 'rejected'; req.reviewed_by = adminId; req.reject_reason = reason || null; req.reviewed_at = new Date().toISOString();
  saveDB(data); return req;
}

function createOrder(telegramId, type, name, price, gameId, gameNick) {
  const data = loadDB();
  const id = data.next_order_id++;
  data.orders.push({ id, telegram_id: telegramId, product_type: type, product_name: name, price, game_id: gameId, game_nick: gameNick, status: 'pending', created_at: new Date().toISOString(), completed_at: null });
  saveDB(data); return id;
}

function getOrder(id) { return loadDB().orders.find(o => o.id === parseInt(id)) || null; }
function getUserOrders(telegramId) { return loadDB().orders.filter(o => o.telegram_id === telegramId).sort((a,b) => new Date(b.created_at)-new Date(a.created_at)).slice(0,10); }
function getAllOrders() { return loadDB().orders.sort((a,b) => new Date(b.created_at)-new Date(a.created_at)).slice(0,30); }

function completeOrder(id) {
  const data = loadDB(); const o = data.orders.find(o => o.id === parseInt(id));
  if (o) { o.status = 'completed'; o.completed_at = new Date().toISOString(); saveDB(data); }
}

function cancelOrder(id) {
  const data = loadDB(); const o = data.orders.find(o => o.id === parseInt(id));
  if (o) { o.status = 'cancelled'; saveDB(data); }
}

function getProductById(id) {
  const data = loadDB();
  return Object.values(data.products).flat().find(p => p.id === parseInt(id)) || null;
}

function getProducts(type) { return loadDB().products[type] || []; }

function getStats() {
  const data = loadDB();
  const done = data.orders.filter(o => o.status === 'completed');
  return {
    users: Object.keys(data.users).length,
    orders: done.length,
    revenue: done.reduce((s,o) => s+o.price, 0),
    pendingTopups: data.topup_requests.filter(r => r.status === 'pending').length,
    pendingOrders: data.orders.filter(o => o.status === 'pending').length
  };
}

function getLastTransactions(telegramId) {
  return loadDB().transactions.filter(t => t.telegram_id === telegramId).sort((a,b) => new Date(b.created_at)-new Date(a.created_at)).slice(0,5);
}

// ========================
// HELPERS
// ========================
function fmt(price) { return price.toLocaleString('uz-UZ') + ' so\'m'; }

function gameInfo(type) {
  return {
    uc:         { name: 'PUBG Mobile',    emoji: '🎮', currency: 'UC',        idLabel: 'PUBG ID (faqat raqam, max 15 ta)' },
    popularity: { name: 'PUBG Mobile',    emoji: '⭐', currency: 'Popularity', idLabel: 'PUBG ID (faqat raqam, max 15 ta)' },
    diamond:    { name: 'Free Fire',      emoji: '🔥', currency: 'Diamond',   idLabel: 'Free Fire ID (faqat raqam)' },
    gems:       { name: 'Clash of Clans', emoji: '⚔️', currency: 'Gems',      idLabel: 'CoC Tag (masalan: #ABC1234)' },
    mlbb:       { name: 'Mobile Legends', emoji: '🌟', currency: 'Diamond',   idLabel: 'MLBB ID (faqat raqam)' },
    robux:      { name: 'Roblox',         emoji: '🟥', currency: 'Robux',     idLabel: 'Roblox akkaunt NIK (username)' }
  }[type] || { name: type, emoji: '🎮', currency: type, idLabel: 'ID' };
}

function isAdmin(id) { return ADMIN_IDS.includes(parseInt(id)); }
function getState(id) { return userStates[id] || {}; }
function setState(id, s) { userStates[id] = { ...getState(id), ...s }; }
function clearState(id) { delete userStates[id]; }

// ========================
// KEYBOARDS
// ========================
function mainMenu() {
  return { inline_keyboard: [
    [{ text: '🎮 PUBG — UC', callback_data: 'buy_uc' }, { text: '⭐ PUBG — Popularity', callback_data: 'buy_popularity' }],
    [{ text: '🔥 Free Fire — Diamond', callback_data: 'buy_diamond' }, { text: '⚔️ Clash of Clans — Gems', callback_data: 'buy_gems' }],
    [{ text: '🌟 Mobile Legends — Diamond', callback_data: 'buy_mlbb' }, { text: '🟥 Roblox — Robux', callback_data: 'buy_robux' }],
    [{ text: '💰 Hisobni to\'ldirish', callback_data: 'topup_menu' }, { text: '👤 Mening hisobim', callback_data: 'my_account' }],
    [{ text: '📋 Buyurtmalarim', callback_data: 'my_orders' }, { text: '📞 Yordam', callback_data: 'support' }]
  ]};
}

// Pastki (doimiy) menyu — Telegramning "Reply Keyboard"i.
// Bu inline tugmalardan farqli o'laroq, xabar pufakchasi ichida emas,
// balki yozish maydonchasi ostida doim ko'rinib turadi.
const CATEGORY_BUTTONS = {
  '🎮 PUBG — UC': 'uc',
  '⭐ PUBG — Popularity': 'popularity',
  '🔥 Free Fire — Diamond': 'diamond',
  '⚔️ Clash of Clans — Gems': 'gems',
  '🌟 Mobile Legends — Diamond': 'mlbb',
  '🟥 Roblox — Robux': 'robux'
};
const TOPUP_BUTTON = '💰 Hisobni to\'ldirish';
const ACCOUNT_BUTTON = '👤 Mening hisobim';
const ORDERS_BUTTON = '📋 Buyurtmalarim';
const SUPPORT_BUTTON = '📞 Yordam';

function mainReplyKeyboard() {
  return {
    keyboard: [
      ['🎮 PUBG — UC', '⭐ PUBG — Popularity'],
      ['🔥 Free Fire — Diamond', '⚔️ Clash of Clans — Gems'],
      ['🌟 Mobile Legends — Diamond', '🟥 Roblox — Robux'],
      [TOPUP_BUTTON, ACCOUNT_BUTTON],
      [ORDERS_BUTTON, SUPPORT_BUTTON]
    ],
    resize_keyboard: true,
    is_persistent: true
  };
}

function productsMenu(products) {
  const rows = [];
  for (let i = 0; i < products.length; i += 2) {
    const row = [{ text: products[i].name + ' — ' + fmt(products[i].price), callback_data: 'product_' + products[i].id }];
    if (products[i+1]) row.push({ text: products[i+1].name + ' — ' + fmt(products[i+1].price), callback_data: 'product_' + products[i+1].id });
    rows.push(row);
  }
  rows.push([{ text: '🔙 Orqaga', callback_data: 'main_menu' }]);
  return { inline_keyboard: rows };
}

function topupMenu() {
  return { inline_keyboard: [
    [{ text: '5,000 so\'m', callback_data: 'topup_5000' }, { text: '10,000 so\'m', callback_data: 'topup_10000' }],
    [{ text: '20,000 so\'m', callback_data: 'topup_20000' }, { text: '50,000 so\'m', callback_data: 'topup_50000' }],
    [{ text: '100,000 so\'m', callback_data: 'topup_100000' }, { text: '200,000 so\'m', callback_data: 'topup_200000' }],
    [{ text: '✏️ Boshqa miqdor', callback_data: 'topup_custom' }],
    [{ text: '🔙 Orqaga', callback_data: 'main_menu' }]
  ]};
}

function backBtn() { return { inline_keyboard: [[{ text: '🏠 Bosh menyu', callback_data: 'main_menu' }]] }; }
function cancelBtn() { return { inline_keyboard: [[{ text: '❌ Bekor qilish', callback_data: 'main_menu' }]] }; }
function confirmBtn(pid) { return { inline_keyboard: [[{ text: '✅ Tasdiqlash', callback_data: 'confirm_' + pid }, { text: '❌ Bekor', callback_data: 'main_menu' }]] }; }
function adminTopupBtn(id) { return { inline_keyboard: [[{ text: '✅ Tasdiqlash', callback_data: 'adm_approve_' + id }, { text: '❌ Rad etish', callback_data: 'adm_reject_' + id }]] }; }
function adminOrderBtn(id) { return { inline_keyboard: [[{ text: '✅ Bajarildi', callback_data: 'adm_done_' + id }, { text: '❌ Bekor', callback_data: 'adm_cancel_' + id }]] }; }
function adminPanel() {
  return { inline_keyboard: [
    [{ text: '📊 Statistika', callback_data: 'adm_stats' }, { text: '⏳ Kutayotgan to\'ldirish', callback_data: 'adm_topups' }],
    [{ text: '📦 Buyurtmalar', callback_data: 'adm_orders' }, { text: '📢 Xabar yuborish', callback_data: 'adm_broadcast' }]
  ]};
}

// ========================
// TO'LOV MA'LUMOTLARI
// ========================
async function sendPayment(chatId, msgId, amount, edit) {
  const text = `💰 <b>To\'ldirish: ${fmt(amount)}</b>\n\n` +
    `1️⃣ Quyidagi kartaga pul o\'tkazing:\n` +
    `🏦 <code>8600 0000 0000 0000</code>\n` +
    `👤 <b>Admin Ismi</b>\n\n` +
    `2️⃣ Miqdor: <b>${fmt(amount)}</b>\n\n` +
    `3️⃣ To\'lovdan so\'ng <b>chek (screenshot)</b> yuboring\n\n` +
    `✅ Admin tasdiqlashidan so\'ng balans qo\'shiladi!`;
  const opts = { parse_mode: 'HTML', reply_markup: cancelBtn() };
  if (edit && msgId) await bot.editMessageText(text, { chat_id: chatId, message_id: msgId, ...opts });
  else await bot.sendMessage(chatId, text, opts);
}

// ========================
// START
// ========================
bot.onText(/\/start/, async (msg) => {
  const { id: chatId, from } = msg;
  clearState(from.id);
  getOrCreateUser(from.id, from.username, [from.first_name, from.last_name].filter(Boolean).join(' '));
  await bot.sendMessage(chatId,
    `👋 Salom, <b>${from.first_name}</b>!\n\n` +
    `🎮 <b>Game Shop</b> ga xush kelibsiz!\n\n` +
    `🎮 PUBG Mobile — UC & Popularity\n` +
    `🔥 Free Fire — Diamond\n` +
    `⚔️ Clash of Clans — Gems\n` +
    `🌟 Mobile Legends — Diamond\n` +
    `🟥 Roblox — Robux\n\n` +
    `💳 To\'lov admin orqali tasdiqlanadi.\n` +
    `⚡ Tez va ishonchli yetkazib berish!\n\n` +
    `👇 Pastdagi menyudan tanlang:`,
    { parse_mode: 'HTML', reply_markup: mainReplyKeyboard() }
  );
});

bot.onText(/\/admin/, async (msg) => {
  if (!isAdmin(msg.from.id)) return;
  await bot.sendMessage(msg.chat.id, '⚙️ <b>Admin Panel</b>', { parse_mode: 'HTML', reply_markup: adminPanel() });
});

// ========================
// CALLBACK
// ========================
bot.on('callback_query', async (query) => {
  const { data, from, message } = query;
  const uid = from.id;
  const chatId = message.chat.id;
  const msgId = message.message_id;
  await bot.answerCallbackQuery(query.id);

  try {
    // MAIN MENU
    if (data === 'main_menu') {
      clearState(uid);
      const bal = getBalance(uid);
      await bot.editMessageText(
        `🎮 <b>Game Shop</b>\n\n💰 Balansingiz: <b>${fmt(bal)}</b>\n\n👇 Pastdagi menyudan tanlang`,
        { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: { inline_keyboard: [] } }
      );
    }

    // KATEGORIYA
    else if (data.startsWith('buy_')) {
      const type = data.replace('buy_', '');
      const g = gameInfo(type);
      const products = getProducts(type);
      await bot.editMessageText(
        `${g.emoji} <b>${g.name} — ${g.currency}</b>\n\nPaket tanlang:`,
        { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: productsMenu(products) }
      );
    }

    // MAHSULOT
    else if (data.startsWith('product_')) {
      const pid = parseInt(data.split('_')[1]);
      const product = getProductById(pid);
      if (!product) return;
      const bal = getBalance(uid);
      const g = gameInfo(product.type);
      setState(uid, { selectedProduct: pid, step: 'enter_id' });

      if (bal < product.price) {
        await bot.editMessageText(
          `${g.emoji} <b>${product.name}</b>\n\n💰 Narx: <b>${fmt(product.price)}</b>\n💳 Balans: <b>${fmt(bal)}</b>\n\n⚠️ <b>Balans yetarli emas!</b>\nYetishmaydi: <b>${fmt(product.price - bal)}</b>`,
          { chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: '💰 Hisobni to\'ldirish', callback_data: 'topup_menu' }], [{ text: '🔙 Orqaga', callback_data: 'buy_' + product.type }]] }
          }
        );
      } else {
        // Roblox uchun maxsus
        let idText = '';
        if (product.type === 'robux') {
          idText = `👤 Roblox <b>akkaunt nikingizni</b> yuboring:\n\n⚠️ Faqat username (masalan: <code>MrCool123</code>)`;
        } else {
          idText = `🆔 <b>${g.idLabel}</b> yuboring:`;
        }
        await bot.editMessageText(
          `${g.emoji} <b>${product.name}</b>\n\n💰 Narx: <b>${fmt(product.price)}</b>\n💳 Balans: <b>${fmt(bal)}</b>\n\n📝 ${idText}`,
          { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: cancelBtn() }
        );
      }
    }

    // BUYURTMA TASDIQLASH
    else if (data.startsWith('confirm_')) {
      const pid = parseInt(data.replace('confirm_', ''));
      const state = getState(uid);
      const product = getProductById(pid);
      if (!product || !state.gameId) return;

      const g = gameInfo(product.type);
      const deducted = deductBalance(uid, product.price, product.name + ' xaridi');
      if (!deducted) {
        return bot.editMessageText('❌ Balans yetarli emas!', { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: backBtn() });
      }

      const orderId = createOrder(uid, product.type, product.name, product.price, state.gameId, state.gameNick || '-');
      clearState(uid);
      const newBal = getBalance(uid);

      // Roblox uchun maxsus xabar
      let orderDetails = '';
      if (product.type === 'robux') {
        orderDetails = `👤 Roblox Nik: <b>${state.gameId}</b>`;
      } else {
        orderDetails = `🆔 ID: <b>${state.gameId}</b>\n👤 Nik: <b>${state.gameNick || '-'}</b>`;
      }

      await bot.editMessageText(
        `✅ <b>Buyurtma qabul qilindi!</b>\n\n` +
        `📦 #${orderId}\n${g.emoji} ${g.name}: <b>${product.name}</b>\n${orderDetails}\n` +
        `💰 To\'langan: <b>${fmt(product.price)}</b>\n💳 Qolgan: <b>${fmt(newBal)}</b>\n\n` +
        `⏳ <b>Admin tasdig\'ini kuting (5-15 daqiqa)</b>`,
        { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: backBtn() }
      );

      const fromUser = from.username ? `@${from.username}` : from.first_name;
      for (const adminId of ADMIN_IDS) {
        let adminMsg = `🛒 <b>Yangi buyurtma #${orderId}</b>\n\n👤 ${fromUser} (${uid})\n${g.emoji} <b>${g.name} — ${product.name}</b>\n`;
        if (product.type === 'robux') {
          adminMsg += `👤 Roblox Nik: <code>${state.gameId}</code>\n`;
        } else {
          adminMsg += `🆔 ID: <code>${state.gameId}</code>\n👤 Nik: <b>${state.gameNick || '-'}</b>\n`;
        }
        adminMsg += `💰 <b>${fmt(product.price)}</b>`;
        await bot.sendMessage(adminId, adminMsg, { parse_mode: 'HTML', reply_markup: adminOrderBtn(orderId) });
      }
    }

    // HISOB TO'LDIRISH
    else if (data === 'topup_menu') {
      await bot.editMessageText(
        `💰 <b>Hisobni to\'ldirish</b>\n\n📌 To\'lov usuli: Admin orqali\n📸 Chek yuboring → Admin tasdiqlaydi → Balans qo\'shiladi`,
        { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: topupMenu() }
      );
    }

    else if (data.startsWith('topup_') && data !== 'topup_menu') {
      const val = data.replace('topup_', '');
      if (val === 'custom') {
        setState(uid, { step: 'enter_amount' });
        await bot.editMessageText(`✏️ Nechta so\'m to\'ldirmoqchisiz?\nFaqat raqam kiriting:`,
          { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '❌ Bekor', callback_data: 'topup_menu' }]] } });
      } else {
        const amount = parseInt(val);
        setState(uid, { step: 'send_receipt', topupAmount: amount });
        await sendPayment(chatId, msgId, amount, true);
      }
    }

    // MENING HISOBIM
    else if (data === 'my_account') {
      const user = getUser(uid);
      if (!user) return;
      const txs = getLastTransactions(uid);
      let txText = txs.length ? '\n\n📋 <b>So\'nggi operatsiyalar:</b>\n' + txs.map(t => `${t.amount > 0 ? '+' : ''}${fmt(Math.abs(t.amount))} — ${t.description}`).join('\n') : '';
      await bot.editMessageText(
        `👤 <b>Mening hisobim</b>\n\n🆔 ID: <code>${uid}</code>\n👤 Ism: <b>${user.full_name || 'Noma\'lum'}</b>\n💰 Balans: <b>${fmt(user.balance)}</b>\n💸 Jami sarflangan: <b>${fmt(user.total_spent)}</b>` + txText,
        { chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [[{ text: '💰 To\'ldirish', callback_data: 'topup_menu' }], [{ text: '🏠 Menyu', callback_data: 'main_menu' }]] } }
      );
    }

    // BUYURTMALARIM
    else if (data === 'my_orders') {
      const orders = getUserOrders(uid);
      if (!orders.length) return bot.editMessageText('📋 Hali buyurtmalar yo\'q.', { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: backBtn() });
      let text = `📋 <b>Buyurtmalarim</b>\n\n`;
      orders.forEach((o, i) => {
        const s = o.status === 'completed' ? '✅' : o.status === 'pending' ? '⏳' : '❌';
        const g = gameInfo(o.product_type);
        text += `${i+1}. #${o.id} ${s} ${g.emoji} <b>${o.product_name}</b> — ${fmt(o.price)}\n`;
      });
      await bot.editMessageText(text, { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: backBtn() });
    }

    // YORDAM
    else if (data === 'support') {
      await bot.editMessageText(
        `📞 <b>Yordam</b>\n\n👨‍💼 Admin: @admin_username\n⏰ Ish vaqti: 09:00 - 22:00\n\n💬 Murojaat vaqtida buyurtma raqamingizni yozing!`,
        { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: backBtn() }
      );
    }

    // ========================
    // ADMIN
    // ========================
    else if (data.startsWith('adm_approve_') && isAdmin(uid)) {
      const reqId = parseInt(data.replace('adm_approve_', ''));
      const req = approveTopup(reqId, uid);
      if (!req) return;
      const newBal = getBalance(req.telegram_id);
      await bot.editMessageText(message.text + '\n\n✅ <b>TASDIQLANDI</b>', { chat_id: chatId, message_id: msgId, parse_mode: 'HTML' });
      await bot.sendMessage(req.telegram_id,
        `✅ <b>Hisobingiz to\'ldirildi!</b>\n\n💰 Qo\'shildi: <b>${fmt(req.amount)}</b>\n💳 Balans: <b>${fmt(newBal)}</b>\n\nXarid qilishingiz mumkin! 🎮`,
        { parse_mode: 'HTML', reply_markup: mainReplyKeyboard() }
      );
    }

    else if (data.startsWith('adm_reject_') && isAdmin(uid)) {
      const reqId = parseInt(data.replace('adm_reject_', ''));
      setState(uid, { step: 'adm_reject', rejectId: reqId });
      await bot.sendMessage(chatId, `❌ Rad etish sababini yozing:`);
    }

    else if (data.startsWith('adm_done_') && isAdmin(uid)) {
      const orderId = parseInt(data.replace('adm_done_', ''));
      const order = getOrder(orderId);
      if (!order) return;
      completeOrder(orderId);
      await bot.editMessageText(message.text + '\n\n✅ <b>BAJARILDI</b>', { chat_id: chatId, message_id: msgId, parse_mode: 'HTML' });
      const g = gameInfo(order.product_type);
      let doneMsg = `✅ <b>Buyurtmangiz bajarildi!</b>\n\n📦 #${orderId}\n${g.emoji} ${g.name}: <b>${order.product_name}</b>\n`;
      if (order.product_type === 'robux') {
        doneMsg += `👤 Roblox Nik: <b>${order.game_id}</b>\n`;
      } else {
        doneMsg += `🆔 ID: <code>${order.game_id}</code>\n`;
      }
      doneMsg += `\nO\'yiningizni tekshiring! 🎮\nRahmat! ❤️`;
      await bot.sendMessage(order.telegram_id, doneMsg, { parse_mode: 'HTML', reply_markup: mainReplyKeyboard() });
    }

    else if (data.startsWith('adm_cancel_') && isAdmin(uid)) {
      const orderId = parseInt(data.replace('adm_cancel_', ''));
      const order = getOrder(orderId);
      if (!order) return;
      addBalance(order.telegram_id, order.price, `Buyurtma #${orderId} bekor — pul qaytarildi`);
      cancelOrder(orderId);
      await bot.editMessageText(message.text + '\n\n❌ <b>BEKOR QILINDI — pul qaytarildi</b>', { chat_id: chatId, message_id: msgId, parse_mode: 'HTML' });
      await bot.sendMessage(order.telegram_id,
        `⚠️ <b>Buyurtma bekor qilindi</b>\n\n📦 #${orderId}\n💰 Pul qaytarildi: <b>${fmt(order.price)}</b>`,
        { parse_mode: 'HTML', reply_markup: mainReplyKeyboard() }
      );
    }

    else if (data === 'adm_stats' && isAdmin(uid)) {
      const s = getStats();
      await bot.editMessageText(
        `📊 <b>Statistika</b>\n\n👥 Foydalanuvchilar: <b>${s.users}</b>\n📦 Bajarilgan: <b>${s.orders}</b>\n💰 Daromad: <b>${fmt(s.revenue)}</b>\n\n⏳ Kutayotgan to\'ldirish: <b>${s.pendingTopups}</b>\n🔄 Kutayotgan buyurtma: <b>${s.pendingOrders}</b>`,
        { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: adminPanel() }
      );
    }

    else if (data === 'adm_topups' && isAdmin(uid)) {
      const reqs = getPendingTopups();
      if (!reqs.length) return bot.editMessageText('✅ Kutayotgan to\'ldirish yo\'q.', { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: adminPanel() });
      await bot.editMessageText(`⏳ <b>${reqs.length} ta kutayotgan</b>`, { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: adminPanel() });
      for (const req of reqs) {
        const user = getUser(req.telegram_id);
        const name = user?.username ? `@${user.username}` : (user?.full_name || `ID: ${req.telegram_id}`);
        const cap = `💰 <b>To\'ldirish #${req.id}</b>\n👤 ${name} (${req.telegram_id})\n💰 <b>${fmt(req.amount)}</b>`;
        try {
          if (req.receipt_type === 'photo') await bot.sendPhoto(chatId, req.receipt_file_id, { caption: cap, parse_mode: 'HTML', reply_markup: adminTopupBtn(req.id) });
          else await bot.sendDocument(chatId, req.receipt_file_id, { caption: cap, parse_mode: 'HTML', reply_markup: adminTopupBtn(req.id) });
        } catch { await bot.sendMessage(chatId, cap + '\n⚠️ Chek yuklanmagan.', { parse_mode: 'HTML', reply_markup: adminTopupBtn(req.id) }); }
      }
    }

    else if (data === 'adm_orders' && isAdmin(uid)) {
      const orders = getAllOrders();
      if (!orders.length) return bot.editMessageText('📦 Buyurtmalar yo\'q.', { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: adminPanel() });
      let text = `📦 <b>So\'nggi buyurtmalar:</b>\n\n`;
      orders.forEach(o => {
        const s = o.status === 'completed' ? '✅' : o.status === 'pending' ? '⏳' : '❌';
        const g = gameInfo(o.product_type);
        text += `${s} #${o.id} ${g.emoji} ${o.product_name} — ${o.game_id}\n`;
      });
      await bot.editMessageText(text, { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '🔙 Admin', callback_data: 'adm_stats' }]] } });
    }

    else if (data === 'adm_broadcast' && isAdmin(uid)) {
      setState(uid, { step: 'adm_broadcast' });
      await bot.sendMessage(chatId, `📢 Xabar matnini yozing:`);
    }

  } catch (err) {
    console.error('Callback xato:', err.message);
  }
});

// ========================
// MESSAGES
// ========================
bot.on('message', async (msg) => {
  const { chat, from, text, photo, document } = msg;
  const uid = from.id;
  const chatId = chat.id;
  const state = getState(uid);
  if (text && text.startsWith('/') && text !== '/start') return;

  // ========================
  // PASTKI MENYU TUGMALARI
  // ========================
  if (text && CATEGORY_BUTTONS[text]) {
    clearState(uid);
    const type = CATEGORY_BUTTONS[text];
    const g = gameInfo(type);
    const products = getProducts(type);
    return bot.sendMessage(chatId,
      `${g.emoji} <b>${g.name} — ${g.currency}</b>\n\nPaket tanlang:`,
      { parse_mode: 'HTML', reply_markup: productsMenu(products) }
    );
  }

  if (text === TOPUP_BUTTON) {
    clearState(uid);
    return bot.sendMessage(chatId,
      `💰 <b>Hisobni to\'ldirish</b>\n\n📌 To\'lov usuli: Admin orqali\n📸 Chek yuboring → Admin tasdiqlaydi → Balans qo\'shiladi`,
      { parse_mode: 'HTML', reply_markup: topupMenu() }
    );
  }

  if (text === ACCOUNT_BUTTON) {
    clearState(uid);
    const user = getUser(uid);
    if (!user) return;
    const txs = getLastTransactions(uid);
    let txText = txs.length ? '\n\n📋 <b>So\'nggi operatsiyalar:</b>\n' + txs.map(t => `${t.amount > 0 ? '+' : ''}${fmt(Math.abs(t.amount))} — ${t.description}`).join('\n') : '';
    return bot.sendMessage(chatId,
      `👤 <b>Mening hisobim</b>\n\n🆔 ID: <code>${uid}</code>\n👤 Ism: <b>${user.full_name || 'Noma\'lum'}</b>\n💰 Balans: <b>${fmt(user.balance)}</b>\n💸 Jami sarflangan: <b>${fmt(user.total_spent)}</b>` + txText,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '💰 To\'ldirish', callback_data: 'topup_menu' }]] } }
    );
  }

  if (text === ORDERS_BUTTON) {
    clearState(uid);
    const orders = getUserOrders(uid);
    if (!orders.length) return bot.sendMessage(chatId, '📋 Hali buyurtmalar yo\'q.', { parse_mode: 'HTML' });
    let ordersText = `📋 <b>Buyurtmalarim</b>\n\n`;
    orders.forEach((o, i) => {
      const s = o.status === 'completed' ? '✅' : o.status === 'pending' ? '⏳' : '❌';
      const g = gameInfo(o.product_type);
      ordersText += `${i+1}. #${o.id} ${s} ${g.emoji} <b>${o.product_name}</b> — ${fmt(o.price)}\n`;
    });
    return bot.sendMessage(chatId, ordersText, { parse_mode: 'HTML' });
  }

  if (text === SUPPORT_BUTTON) {
    clearState(uid);
    return bot.sendMessage(chatId,
      `📞 <b>Yordam</b>\n\n👨‍💼 Admin: @admin_username\n⏰ Ish vaqti: 09:00 - 22:00\n\n💬 Murojaat vaqtida buyurtma raqamingizni yozing!`,
      { parse_mode: 'HTML' }
    );
  }

  try {
    // GAME ID
    if (state.step === 'enter_id') {
      if (!text) return bot.sendMessage(chatId, '⚠️ Matn kiriting!');
      const product = getProductById(state.selectedProduct);
      if (!product) return;

      // Roblox — faqat nik
      if (product.type === 'robux') {
        const nik = text.trim();
        if (nik.length < 3 || nik.length > 20) return bot.sendMessage(chatId, '❌ Roblox nik 3-20 ta belgidan iborat bo\'lishi kerak!');
        setState(uid, { gameId: nik, step: 'confirm_robux' });
        const g = gameInfo(product.type);
        return bot.sendMessage(chatId,
          `📋 <b>Buyurtma ma\'lumotlari:</b>\n\n${g.emoji} <b>${g.name} — ${product.name}</b>\n👤 Roblox Nik: <b>${nik}</b>\n💰 Narx: <b>${fmt(product.price)}</b>\n\nTasdiqlaysizmi?`,
          { parse_mode: 'HTML', reply_markup: confirmBtn(state.selectedProduct) }
        );
      }

      // CoC — tag
      let cleanId = text.trim().replace(/\s+/g, '');
      if (product.type === 'gems') {
        if (!cleanId.startsWith('#')) cleanId = '#' + cleanId;
        setState(uid, { gameId: cleanId, step: 'enter_nick' });
      } else {
        // PUBG, FF, MLBB — faqat raqam
        if (!/^\d+$/.test(cleanId)) return bot.sendMessage(chatId, `❌ Faqat raqamlar kiriting!\nMasalan: <code>512345678</code>`, { parse_mode: 'HTML' });
        if (cleanId.length > 15) return bot.sendMessage(chatId, `❌ ID maksimum 15 ta raqam!`);
        setState(uid, { gameId: cleanId, step: 'enter_nick' });
      }

      const g = gameInfo(product.type);
      await bot.sendMessage(chatId,
        `✅ ID: <code>${cleanId}</code>\n\n👤 Endi <b>nikneymingizni</b> yozing:`,
        { parse_mode: 'HTML', reply_markup: cancelBtn() }
      );
    }

    // NIK
    else if (state.step === 'enter_nick') {
      if (!text || text.trim().length < 2) return bot.sendMessage(chatId, '⚠️ Nikneym noto\'g\'ri!');
      const nik = text.trim().slice(0, 30);
      const product = getProductById(state.selectedProduct);
      if (!product) return;
      const g = gameInfo(product.type);
      setState(uid, { gameNick: nik, step: 'confirm' });
      await bot.sendMessage(chatId,
        `📋 <b>Buyurtma ma\'lumotlari:</b>\n\n${g.emoji} <b>${g.name} — ${product.name}</b>\n🆔 ID: <code>${state.gameId}</code>\n👤 Nik: <b>${nik}</b>\n💰 Narx: <b>${fmt(product.price)}</b>\n\nTasdiqlaysizmi?`,
        { parse_mode: 'HTML', reply_markup: confirmBtn(state.selectedProduct) }
      );
    }

    // TO'LDIRISH MIQDORI
    else if (state.step === 'enter_amount') {
      if (!text) return;
      const amount = parseInt(text.replace(/[\s,]/g, ''));
      if (isNaN(amount) || amount < 1000) return bot.sendMessage(chatId, '❌ Minimum 1,000 so\'m!');
      if (amount > 10000000) return bot.sendMessage(chatId, '❌ Maksimum 10,000,000 so\'m!');
      setState(uid, { step: 'send_receipt', topupAmount: amount });
      await sendPayment(chatId, null, amount, false);
    }

    // CHEK
    else if (state.step === 'send_receipt') {
      const amount = state.topupAmount;
      if (!amount) return;
      let fileId = null, fileType = null;
      if (photo) { fileId = photo[photo.length-1].file_id; fileType = 'photo'; }
      else if (document) { fileId = document.file_id; fileType = 'document'; }
      if (!fileId) return bot.sendMessage(chatId, `📸 Chekni <b>rasm yoki fayl</b> sifatida yuboring!`, { parse_mode: 'HTML' });

      const reqId = createTopupReq(uid, amount, fileId, fileType);
      clearState(uid);
      await bot.sendMessage(chatId,
        `✅ <b>Chek qabul qilindi!</b>\n\n📋 So\'rov #${reqId}\n💰 <b>${fmt(amount)}</b>\n\n⏳ Admin tasdig\'ini kuting (5-30 daqiqa)`,
        { parse_mode: 'HTML', reply_markup: mainReplyKeyboard() }
      );

      const user = getUser(uid);
      const name = user?.username ? `@${user.username}` : (user?.full_name || `ID: ${uid}`);
      const cap = `💰 <b>Yangi to\'ldirish #${reqId}</b>\n\n👤 ${name} (${uid})\n💰 <b>${fmt(amount)}</b>`;
      for (const adminId of ADMIN_IDS) {
        try {
          if (fileType === 'photo') await bot.sendPhoto(adminId, fileId, { caption: cap, parse_mode: 'HTML', reply_markup: adminTopupBtn(reqId) });
          else await bot.sendDocument(adminId, fileId, { caption: cap, parse_mode: 'HTML', reply_markup: adminTopupBtn(reqId) });
        } catch (e) { console.error('Admin xabar:', e.message); }
      }
    }

    // ADMIN: RAD ETISH SABABI
    else if (state.step === 'adm_reject' && isAdmin(uid)) {
      const req = rejectTopup(state.rejectId, uid, text);
      if (!req) return bot.sendMessage(chatId, '❌ Topilmadi!');
      clearState(uid);
      await bot.sendMessage(chatId, `✅ So\'rov #${req.id} rad etildi.`);
      await bot.sendMessage(req.telegram_id,
        `❌ <b>To\'ldirish rad etildi</b>\n\n📋 #${req.id} | 💰 ${fmt(req.amount)}\n\n📝 Sabab: <b>${text}</b>\n\n❓ Savol bo\'lsa admin bilan bog\'laning.`,
        { parse_mode: 'HTML', reply_markup: mainReplyKeyboard() }
      );
    }

    // ADMIN: BROADCAST
    else if (state.step === 'adm_broadcast' && isAdmin(uid)) {
      if (!text) return;
      clearState(uid);
      const users = getAllUsers();
      let sent = 0, failed = 0;
      await bot.sendMessage(chatId, `📢 Yuborilmoqda... (${users.length} ta)`);
      for (const u of users) {
        try { await bot.sendMessage(u.telegram_id, `📢 <b>Admin xabari:</b>\n\n${text}`, { parse_mode: 'HTML' }); sent++; await new Promise(r => setTimeout(r, 50)); }
        catch { failed++; }
      }
      await bot.sendMessage(chatId, `✅ Tugadi! Yuborildi: ${sent} | Xato: ${failed}`);
    }

    // NOMA'LUM
    else if (text && !state.step) {
      const bal = getBalance(uid);
      await bot.sendMessage(chatId,
        `🎮 <b>Game Shop</b>\n\n💰 Balansingiz: <b>${fmt(bal)}</b>\n\nO\'yin tanlang:`,
        { parse_mode: 'HTML', reply_markup: mainReplyKeyboard() }
      );
    }

  } catch (err) {
    console.error('Message xato:', err.message);
  }
});

// ========================
// ERROR + HTTP SERVER
// ========================
bot.on('polling_error', err => console.error('Polling:', err.message));
process.on('unhandledRejection', err => console.error('Unhandled:', err));

http.createServer((req, res) => { res.writeHead(200); res.end('Game Shop Bot ishlayapti! 🎮'); }).listen(PORT, () => console.log(`🌐 Port ${PORT}`));
console.log('🚀 Game Shop Bot ishga tushdi!');
console.log(`👥 Adminlar: ${ADMIN_IDS.join(', ')}`);
