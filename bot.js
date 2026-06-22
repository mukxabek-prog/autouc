require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { MongoClient } = require('mongodb');
const http = require('http');

// ========================
// CONFIG
// ========================
const BOT_TOKEN   = process.env.BOT_TOKEN;
const ADMIN_IDS   = (process.env.ADMIN_IDS || '').split(',').map(id => parseInt(id.trim())).filter(Boolean);
const GEMINI_KEY  = process.env.GEMINI_API_KEY;
const MONGO_URI   = process.env.MONGODB_URI;
const PORT        = process.env.PORT || 3000;

if (!BOT_TOKEN)  { console.error('❌ BOT_TOKEN topilmadi!');   process.exit(1); }
if (!MONGO_URI)  { console.error('❌ MONGODB_URI topilmadi!'); process.exit(1); }

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const userStates = {};

// Gemini
let genAI = null;
if (GEMINI_KEY) {
  genAI = new GoogleGenerativeAI(GEMINI_KEY);
} else {
  console.warn('⚠️  GEMINI_API_KEY topilmadi — AI chat ishlamaydi');
}

// ========================
// MONGODB
// ========================
const client = new MongoClient(MONGO_URI);
let db;

async function connectDB() {
  await client.connect();
  db = client.db('gameshop');
  // Collectionlar
  await db.collection('users').createIndex({ telegram_id: 1 }, { unique: true });
  await db.collection('orders').createIndex({ telegram_id: 1 });
  await db.collection('topup_requests').createIndex({ telegram_id: 1 });
  await db.collection('transactions').createIndex({ telegram_id: 1 });
  // Counter collection (order va topup IDlar uchun)
  const counters = db.collection('counters');
  await counters.updateOne({ _id: 'order_id' },   { $setOnInsert: { seq: 0 } }, { upsert: true });
  await counters.updateOne({ _id: 'topup_id' },   { $setOnInsert: { seq: 0 } }, { upsert: true });
  console.log('✅ MongoDB ulandi!');
}

async function nextSeq(name) {
  const res = await db.collection('counters').findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { returnDocument: 'after', upsert: true }
  );
  return res.seq;
}

// ========================
// PRODUCTS (static)
// ========================
const PRODUCTS = {
  uc: [
    { id: 1,  type: 'uc',         name: '60 UC',          price: 15000  },
    { id: 2,  type: 'uc',         name: '325 UC',         price: 65000  },
    { id: 3,  type: 'uc',         name: '660 UC',         price: 125000 },
    { id: 4,  type: 'uc',         name: '1800 UC',        price: 320000 },
    { id: 5,  type: 'uc',         name: '3850 UC',        price: 640000 },
    { id: 6,  type: 'uc',         name: '8100 UC',        price: 1275000}
  ],
  popularity: [
    { id: 7,  type: 'popularity', name: '100 Popularity',  price: 25000  },
    { id: 8,  type: 'popularity', name: '300 Popularity',  price: 70000  },
    { id: 9,  type: 'popularity', name: '600 Popularity',  price: 130000 },
    { id: 10, type: 'popularity', name: '1500 Popularity', price: 300000 }
  ],
  diamond: [
    { id: 11, type: 'diamond',    name: '100 Diamond',    price: 18000  },
    { id: 12, type: 'diamond',    name: '310 Diamond',    price: 52000  },
    { id: 13, type: 'diamond',    name: '520 Diamond',    price: 85000  },
    { id: 14, type: 'diamond',    name: '1060 Diamond',   price: 165000 },
    { id: 15, type: 'diamond',    name: '2180 Diamond',   price: 330000 },
    { id: 16, type: 'diamond',    name: '5600 Diamond',   price: 820000 }
  ],
  gems: [
    { id: 17, type: 'gems',       name: '80 Gems',        price: 12000  },
    { id: 18, type: 'gems',       name: '500 Gems',       price: 65000  },
    { id: 19, type: 'gems',       name: '1200 Gems',      price: 150000 },
    { id: 20, type: 'gems',       name: '2500 Gems',      price: 300000 },
    { id: 21, type: 'gems',       name: '6500 Gems',      price: 750000 },
    { id: 22, type: 'gems',       name: '14000 Gems',     price: 1500000}
  ],
  mlbb: [
    { id: 23, type: 'mlbb',       name: '86 Diamonds',    price: 20000  },
    { id: 24, type: 'mlbb',       name: '172 Diamonds',   price: 38000  },
    { id: 25, type: 'mlbb',       name: '257 Diamonds',   price: 55000  },
    { id: 26, type: 'mlbb',       name: '706 Diamonds',   price: 145000 },
    { id: 27, type: 'mlbb',       name: '1412 Diamonds',  price: 280000 },
    { id: 28, type: 'mlbb',       name: '2195 Diamonds',  price: 420000 }
  ],
  robux: [
    { id: 29, type: 'robux',      name: '400 Robux',      price: 45000  },
    { id: 30, type: 'robux',      name: '800 Robux',      price: 85000  },
    { id: 31, type: 'robux',      name: '1700 Robux',     price: 170000 },
    { id: 32, type: 'robux',      name: '4500 Robux',     price: 420000 },
    { id: 33, type: 'robux',      name: '10000 Robux',    price: 900000 }
  ]
};

function getProductById(id) {
  return Object.values(PRODUCTS).flat().find(p => p.id === parseInt(id)) || null;
}
function getProducts(type) { return PRODUCTS[type] || []; }

// ========================
// DATABASE FUNCTIONS
// ========================
async function getOrCreateUser(telegramId, username, fullName) {
  const col = db.collection('users');
  const id  = parseInt(telegramId);
  await col.updateOne(
    { telegram_id: id },
    {
      $setOnInsert: { telegram_id: id, balance: 0, total_spent: 0, joined_at: new Date() },
      $set: { username: username || null, full_name: fullName || null }
    },
    { upsert: true }
  );
  return col.findOne({ telegram_id: id });
}

async function getUser(telegramId) {
  return db.collection('users').findOne({ telegram_id: parseInt(telegramId) });
}

async function getBalance(telegramId) {
  const u = await getUser(telegramId);
  return u ? u.balance : 0;
}

async function addBalance(telegramId, amount, desc) {
  const id = parseInt(telegramId);
  await db.collection('users').updateOne({ telegram_id: id }, { $inc: { balance: amount } });
  await db.collection('transactions').insertOne({
    telegram_id: id, type: 'topup', amount,
    description: desc || "To'ldirish", created_at: new Date()
  });
}

async function deductBalance(telegramId, amount, desc) {
  const id  = parseInt(telegramId);
  const res = await db.collection('users').findOneAndUpdate(
    { telegram_id: id, balance: { $gte: amount } },
    { $inc: { balance: -amount, total_spent: amount } },
    { returnDocument: 'after' }
  );
  if (!res) return false;
  await db.collection('transactions').insertOne({
    telegram_id: id, type: 'purchase', amount: -amount,
    description: desc || 'Xarid', created_at: new Date()
  });
  return true;
}

async function getAllUsers() {
  return db.collection('users').find().toArray();
}

async function createTopupReq(telegramId, amount, fileId, fileType) {
  const id = await nextSeq('topup_id');
  await db.collection('topup_requests').insertOne({
    id, telegram_id: parseInt(telegramId), amount,
    receipt_file_id: fileId, receipt_type: fileType,
    status: 'pending', created_at: new Date(),
    reviewed_by: null, reject_reason: null
  });
  return id;
}

async function getPendingTopups() {
  return db.collection('topup_requests').find({ status: 'pending' }).toArray();
}

async function approveTopup(id, adminId) {
  const req = await db.collection('topup_requests').findOneAndUpdate(
    { id: parseInt(id), status: 'pending' },
    { $set: { status: 'approved', reviewed_by: adminId, reviewed_at: new Date() } },
    { returnDocument: 'after' }
  );
  if (!req) return false;
  await addBalance(req.telegram_id, req.amount, `To'ldirish #${id} tasdiqlandi`);
  return req;
}

async function rejectTopup(id, adminId, reason) {
  return db.collection('topup_requests').findOneAndUpdate(
    { id: parseInt(id), status: 'pending' },
    { $set: { status: 'rejected', reviewed_by: adminId, reject_reason: reason || null, reviewed_at: new Date() } },
    { returnDocument: 'after' }
  );
}

async function createOrder(telegramId, type, name, price, gameId, gameNick) {
  const id = await nextSeq('order_id');
  await db.collection('orders').insertOne({
    id, telegram_id: parseInt(telegramId),
    product_type: type, product_name: name, price,
    game_id: gameId, game_nick: gameNick,
    status: 'pending', created_at: new Date(), completed_at: null
  });
  return id;
}

async function getOrder(id) {
  return db.collection('orders').findOne({ id: parseInt(id) });
}

async function getUserOrders(telegramId) {
  return db.collection('orders')
    .find({ telegram_id: parseInt(telegramId) })
    .sort({ created_at: -1 }).limit(10).toArray();
}

async function getAllOrders() {
  return db.collection('orders').find().sort({ created_at: -1 }).limit(30).toArray();
}

async function completeOrder(id) {
  await db.collection('orders').updateOne(
    { id: parseInt(id) },
    { $set: { status: 'completed', completed_at: new Date() } }
  );
}

async function cancelOrder(id) {
  await db.collection('orders').updateOne({ id: parseInt(id) }, { $set: { status: 'cancelled' } });
}

async function getStats() {
  const [users, orders, pendingTopups, pendingOrders] = await Promise.all([
    db.collection('users').countDocuments(),
    db.collection('orders').find({ status: 'completed' }).toArray(),
    db.collection('topup_requests').countDocuments({ status: 'pending' }),
    db.collection('orders').countDocuments({ status: 'pending' })
  ]);
  return {
    users,
    orders: orders.length,
    revenue: orders.reduce((s, o) => s + o.price, 0),
    pendingTopups,
    pendingOrders
  };
}

async function getLastTransactions(telegramId) {
  return db.collection('transactions')
    .find({ telegram_id: parseInt(telegramId) })
    .sort({ created_at: -1 }).limit(5).toArray();
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

function isAdmin(id)      { return ADMIN_IDS.includes(parseInt(id)); }
function getState(id)     { return userStates[id] || {}; }
function setState(id, s)  { userStates[id] = { ...getState(id), ...s }; }
function clearState(id)   { delete userStates[id]; }

// ========================
// AI CHAT (Gemini)
// ========================
const aiChatHistories = {};

async function askGemini(uid, userMessage) {
  if (!genAI) throw new Error('GEMINI_API_KEY sozlanmagan');
  if (!aiChatHistories[uid]) aiChatHistories[uid] = [];
  const history = aiChatHistories[uid];
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    systemInstruction:
      'Siz Game Shop Telegram botining AI yordamchisisiz. ' +
      'Foydalanuvchilar bilan o\'zbek tilida muloyimlik bilan muloqot qiling. ' +
      'O\'yinlar, top-up, va umumiy savollarga javob bering. ' +
      'Qisqa va aniq javob bering.'
  });
  const chat   = model.startChat({ history });
  const result = await chat.sendMessage(userMessage);
  const reply  = result.response.text();
  aiChatHistories[uid].push({ role: 'user',  parts: [{ text: userMessage }] });
  aiChatHistories[uid].push({ role: 'model', parts: [{ text: reply }] });
  if (aiChatHistories[uid].length > 20) aiChatHistories[uid] = aiChatHistories[uid].slice(-20);
  return reply;
}

function exitAiBtn() {
  return { inline_keyboard: [[{ text: '🚪 AI chatdan chiqish', callback_data: 'exit_ai' }]] };
}

// ========================
// KEYBOARDS
// ========================
const CATEGORY_BUTTONS = {
  '🎮 PUBG — UC':                'uc',
  '⭐ PUBG — Popularity':        'popularity',
  '🔥 Free Fire — Diamond':      'diamond',
  '⚔️ Clash of Clans — Gems':   'gems',
  '🌟 Mobile Legends — Diamond': 'mlbb',
  '🟥 Roblox — Robux':           'robux'
};

const TOPUP_BUTTON    = '💰 Hisobni to\'ldirish';
const ACCOUNT_BUTTON  = '👤 Mening hisobim';
const ORDERS_BUTTON   = '📋 Buyurtmalarim';
const SUPPORT_BUTTON  = '📞 Yordam';
const BULLDROP_BUTTON = '🎁 Bulldrop';
const AI_BUTTON       = '🤖 AI bilan suhbat';

function mainReplyKeyboard() {
  return {
    keyboard: [
      ['🎮 PUBG — UC',           '⭐ PUBG — Popularity'],
      ['🔥 Free Fire — Diamond', '⚔️ Clash of Clans — Gems'],
      ['🌟 Mobile Legends — Diamond', '🟥 Roblox — Robux'],
      [TOPUP_BUTTON,   ACCOUNT_BUTTON],
      [ORDERS_BUTTON,  BULLDROP_BUTTON],
      [AI_BUTTON,      SUPPORT_BUTTON]
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
    [{ text: '5,000 so\'m',   callback_data: 'topup_5000'   }, { text: '10,000 so\'m',  callback_data: 'topup_10000'  }],
    [{ text: '20,000 so\'m',  callback_data: 'topup_20000'  }, { text: '50,000 so\'m',  callback_data: 'topup_50000'  }],
    [{ text: '100,000 so\'m', callback_data: 'topup_100000' }, { text: '200,000 so\'m', callback_data: 'topup_200000' }],
    [{ text: '✏️ Boshqa miqdor', callback_data: 'topup_custom' }],
    [{ text: '🔙 Orqaga',       callback_data: 'main_menu'   }]
  ]};
}

function backBtn()         { return { inline_keyboard: [[{ text: '🏠 Bosh menyu', callback_data: 'main_menu' }]] }; }
function cancelBtn()       { return { inline_keyboard: [[{ text: '❌ Bekor qilish', callback_data: 'main_menu' }]] }; }
function confirmBtn(pid)   { return { inline_keyboard: [[{ text: '✅ Tasdiqlash', callback_data: 'confirm_' + pid }, { text: '❌ Bekor', callback_data: 'main_menu' }]] }; }
function adminTopupBtn(id) { return { inline_keyboard: [[{ text: '✅ Tasdiqlash', callback_data: 'adm_approve_' + id }, { text: '❌ Rad etish', callback_data: 'adm_reject_' + id }]] }; }
function adminOrderBtn(id) { return { inline_keyboard: [[{ text: '✅ Bajarildi', callback_data: 'adm_done_' + id }, { text: '❌ Bekor', callback_data: 'adm_cancel_' + id }]] }; }

function adminPanel() {
  return { inline_keyboard: [
    [{ text: '📊 Statistika', callback_data: 'adm_stats' }],
    [{ text: '⏳ Kutayotgan to\'ldirish', callback_data: 'adm_topups' }, { text: '📦 Buyurtmalar', callback_data: 'adm_orders' }],
    [{ text: '💳 Balans berish', callback_data: 'adm_give_balance' }, { text: '👥 Foydalanuvchilar', callback_data: 'adm_users' }],
    [{ text: '📢 Xabar yuborish', callback_data: 'adm_broadcast' }]
  ]};
}

// ========================
// TO'LOV MA'LUMOTLARI
// ========================
async function sendPayment(chatId, msgId, amount, edit) {
  const text =
    `💰 <b>To\'ldirish: ${fmt(amount)}</b>\n\n` +
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
async function sendStartMenu(chatId, from) {
  await getOrCreateUser(from.id, from.username, [from.first_name, from.last_name].filter(Boolean).join(' '));
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
}

bot.onText(/\/start/, async (msg) => {
  clearState(msg.from.id);
  delete aiChatHistories[msg.from.id];
  await sendStartMenu(msg.chat.id, msg.from);
});

bot.onText(/\/admin/, async (msg) => {
  if (!isAdmin(msg.from.id)) return bot.sendMessage(msg.chat.id, '❌ Ruxsat yo\'q!');
  const s = await getStats();
  await bot.sendMessage(msg.chat.id,
    `⚙️ <b>Admin Panel</b>\n\n` +
    `👥 Foydalanuvchilar: <b>${s.users}</b>\n` +
    `📦 Bajarilgan buyurtmalar: <b>${s.orders}</b>\n` +
    `💰 Umumiy daromad: <b>${fmt(s.revenue)}</b>\n\n` +
    `⏳ Kutayotgan to\'ldirish: <b>${s.pendingTopups}</b>\n` +
    `🔄 Kutayotgan buyurtma: <b>${s.pendingOrders}</b>`,
    { parse_mode: 'HTML', reply_markup: adminPanel() }
  );
});

// ========================
// CALLBACK
// ========================
bot.on('callback_query', async (query) => {
  const { data, from, message } = query;
  const uid    = from.id;
  const chatId = message.chat.id;
  const msgId  = message.message_id;
  await bot.answerCallbackQuery(query.id);

  try {
    if (data === 'exit_ai') {
      clearState(uid);
      delete aiChatHistories[uid];
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: msgId });
      return bot.sendMessage(chatId, `✅ AI chatdan chiqdingiz.\n\n👇 Pastdagi menyudan tanlang:`,
        { parse_mode: 'HTML', reply_markup: mainReplyKeyboard() });
    }

    if (data === 'main_menu') {
      clearState(uid);
      await bot.editMessageText(
        `🎮 <b>Game Shop</b>\n\n👇 Pastdagi menyudan tanlang`,
        { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: { inline_keyboard: [] } }
      );
    }

    else if (data.startsWith('buy_')) {
      const type     = data.replace('buy_', '');
      const g        = gameInfo(type);
      const products = getProducts(type);
      await bot.editMessageText(
        `${g.emoji} <b>${g.name} — ${g.currency}</b>\n\nPaket tanlang:`,
        { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: productsMenu(products) }
      );
    }

    else if (data.startsWith('product_')) {
      const pid     = parseInt(data.split('_')[1]);
      const product = getProductById(pid);
      if (!product) return;
      const bal = await getBalance(uid);
      const g   = gameInfo(product.type);
      setState(uid, { selectedProduct: pid, step: 'enter_id' });

      if (bal < product.price) {
        await bot.editMessageText(
          `${g.emoji} <b>${product.name}</b>\n\n💰 Narx: <b>${fmt(product.price)}</b>\n💳 Balans: <b>${fmt(bal)}</b>\n\n⚠️ <b>Balans yetarli emas!</b>\nYetishmaydi: <b>${fmt(product.price - bal)}</b>`,
          { chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [
              [{ text: '💰 Hisobni to\'ldirish', callback_data: 'topup_menu' }],
              [{ text: '🔙 Orqaga', callback_data: 'buy_' + product.type }]
            ]}
          }
        );
      } else {
        const idText = product.type === 'robux'
          ? `👤 Roblox <b>akkaunt nikingizni</b> yuboring:\n\n⚠️ Faqat username (masalan: <code>MrCool123</code>)`
          : `🆔 <b>${g.idLabel}</b> yuboring:`;
        await bot.editMessageText(
          `${g.emoji} <b>${product.name}</b>\n\n💰 Narx: <b>${fmt(product.price)}</b>\n💳 Balans: <b>${fmt(bal)}</b>\n\n📝 ${idText}`,
          { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: cancelBtn() }
        );
      }
    }

    else if (data.startsWith('confirm_')) {
      const pid     = parseInt(data.replace('confirm_', ''));
      const state   = getState(uid);
      const product = getProductById(pid);
      if (!product || !state.gameId) return;

      const g        = gameInfo(product.type);
      const deducted = await deductBalance(uid, product.price, product.name + ' xaridi');
      if (!deducted) {
        return bot.editMessageText('❌ Balans yetarli emas!', { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: backBtn() });
      }

      const orderId = await createOrder(uid, product.type, product.name, product.price, state.gameId, state.gameNick || '-');
      clearState(uid);
      const newBal = await getBalance(uid);

      const orderDetails = product.type === 'robux'
        ? `👤 Roblox Nik: <b>${state.gameId}</b>`
        : `🆔 ID: <code>${state.gameId}</code>\n👤 Nik: <b>${state.gameNick || '-'}</b>`;

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
        adminMsg += product.type === 'robux'
          ? `👤 Roblox Nik: <code>${state.gameId}</code>\n`
          : `🆔 ID: <code>${state.gameId}</code>\n👤 Nik: <b>${state.gameNick || '-'}</b>\n`;
        adminMsg += `💰 <b>${fmt(product.price)}</b>`;
        await bot.sendMessage(adminId, adminMsg, { parse_mode: 'HTML', reply_markup: adminOrderBtn(orderId) });
      }
    }

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
          { chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: '❌ Bekor', callback_data: 'topup_menu' }]] } });
      } else {
        const amount = parseInt(val);
        setState(uid, { step: 'send_receipt', topupAmount: amount });
        await sendPayment(chatId, msgId, amount, true);
      }
    }

    else if (data === 'my_account') {
      const user = await getOrCreateUser(uid, from.username, [from.first_name, from.last_name].filter(Boolean).join(' '));
      const txs  = await getLastTransactions(uid);
      const txText = txs.length
        ? '\n\n📋 <b>So\'nggi operatsiyalar:</b>\n' + txs.map(t => `${t.amount > 0 ? '+' : ''}${fmt(Math.abs(t.amount))} — ${t.description}`).join('\n')
        : '';
      await bot.editMessageText(
        `👤 <b>Mening hisobim</b>\n\n🆔 ID: <code>${uid}</code>\n👤 Ism: <b>${user.full_name || 'Noma\'lum'}</b>\n💰 Balans: <b>${fmt(user.balance)}</b>\n💸 Jami sarflangan: <b>${fmt(user.total_spent)}</b>` + txText,
        { chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [[{ text: '💰 To\'ldirish', callback_data: 'topup_menu' }], [{ text: '🏠 Menyu', callback_data: 'main_menu' }]] } }
      );
    }

    else if (data === 'my_orders') {
      const orders = await getUserOrders(uid);
      if (!orders.length) return bot.editMessageText('📋 Hali buyurtmalar yo\'q.', { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: backBtn() });
      let text = `📋 <b>Buyurtmalarim</b>\n\n`;
      orders.forEach((o, i) => {
        const s = o.status === 'completed' ? '✅' : o.status === 'pending' ? '⏳' : '❌';
        const g = gameInfo(o.product_type);
        text += `${i+1}. #${o.id} ${s} ${g.emoji} <b>${o.product_name}</b> — ${fmt(o.price)}\n`;
      });
      await bot.editMessageText(text, { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: backBtn() });
    }

    else if (data === 'support') {
      await bot.editMessageText(
        `📞 <b>Yordam</b>\n\n👨‍💼 Admin: @admin_username\n⏰ Ish vaqti: 09:00 - 22:00\n\n💬 Murojaat vaqtida buyurtma raqamingizni yozing!`,
        { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: backBtn() }
      );
    }

    // ========================
    // ADMIN PANEL
    // ========================
    else if (data === 'adm_stats' && isAdmin(uid)) {
      const s = await getStats();
      await bot.editMessageText(
        `📊 <b>Statistika</b>\n\n` +
        `👥 Foydalanuvchilar: <b>${s.users}</b>\n` +
        `📦 Bajarilgan: <b>${s.orders}</b>\n` +
        `💰 Daromad: <b>${fmt(s.revenue)}</b>\n\n` +
        `⏳ Kutayotgan to\'ldirish: <b>${s.pendingTopups}</b>\n` +
        `🔄 Kutayotgan buyurtma: <b>${s.pendingOrders}</b>`,
        { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: adminPanel() }
      );
    }

    else if (data === 'adm_topups' && isAdmin(uid)) {
      const reqs = await getPendingTopups();
      if (!reqs.length) return bot.editMessageText('✅ Kutayotgan to\'ldirish yo\'q.', { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: adminPanel() });
      await bot.editMessageText(`⏳ <b>${reqs.length} ta kutayotgan to\'ldirish</b>`, { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: adminPanel() });
      for (const req of reqs) {
        const user = await getUser(req.telegram_id);
        const name = user?.username ? `@${user.username}` : (user?.full_name || `ID: ${req.telegram_id}`);
        const cap  = `💰 <b>To\'ldirish #${req.id}</b>\n👤 ${name} (${req.telegram_id})\n💰 <b>${fmt(req.amount)}</b>`;
        try {
          if (req.receipt_type === 'photo') await bot.sendPhoto(chatId, req.receipt_file_id, { caption: cap, parse_mode: 'HTML', reply_markup: adminTopupBtn(req.id) });
          else await bot.sendDocument(chatId, req.receipt_file_id, { caption: cap, parse_mode: 'HTML', reply_markup: adminTopupBtn(req.id) });
        } catch { await bot.sendMessage(chatId, cap + '\n⚠️ Chek yuklanmagan.', { parse_mode: 'HTML', reply_markup: adminTopupBtn(req.id) }); }
      }
    }

    else if (data === 'adm_orders' && isAdmin(uid)) {
      const orders = await getAllOrders();
      if (!orders.length) return bot.editMessageText('📦 Buyurtmalar yo\'q.', { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: adminPanel() });
      let text = `📦 <b>So\'nggi buyurtmalar:</b>\n\n`;
      orders.forEach(o => {
        const s = o.status === 'completed' ? '✅' : o.status === 'pending' ? '⏳' : '❌';
        const g = gameInfo(o.product_type);
        text += `${s} #${o.id} ${g.emoji} ${o.product_name} — <code>${o.game_id}</code>\n`;
      });
      await bot.editMessageText(text, { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '🔙 Admin', callback_data: 'adm_stats' }]] } });
    }

    else if (data === 'adm_users' && isAdmin(uid)) {
      const allUsers = await getAllUsers();
      const users    = allUsers.slice(0, 30);
      let text = `👥 <b>Foydalanuvchilar (${allUsers.length} ta):</b>\n\n`;
      users.forEach((u, i) => {
        const name = u.username ? `@${u.username}` : (u.full_name || 'Noma\'lum');
        text += `${i+1}. ${name} — <b>${fmt(u.balance)}</b>\n`;
      });
      await bot.editMessageText(text, { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '🔙 Admin', callback_data: 'adm_stats' }]] } });
    }

    else if (data === 'adm_give_balance' && isAdmin(uid)) {
      setState(uid, { step: 'adm_give_balance' });
      await bot.sendMessage(chatId,
        `💳 <b>Balans berish</b>\n\nQuyidagi formatda yozing:\n<code>ID MIQDOR</code>\n\nMasalan: <code>123456789 50000</code>`,
        { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '❌ Bekor', callback_data: 'adm_stats' }]] } }
      );
    }

    else if (data === 'adm_broadcast' && isAdmin(uid)) {
      setState(uid, { step: 'adm_broadcast' });
      await bot.sendMessage(chatId, `📢 Barcha foydalanuvchilarga yuboriladigan xabar matnini yozing:`,
        { reply_markup: { inline_keyboard: [[{ text: '❌ Bekor', callback_data: 'adm_stats' }]] } });
    }

    else if (data.startsWith('adm_approve_') && isAdmin(uid)) {
      const reqId = parseInt(data.replace('adm_approve_', ''));
      const req   = await approveTopup(reqId, uid);
      if (!req) return;
      const newBal = await getBalance(req.telegram_id);
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
      const order   = await getOrder(orderId);
      if (!order) return;
      await completeOrder(orderId);
      await bot.editMessageText(message.text + '\n\n✅ <b>BAJARILDI</b>', { chat_id: chatId, message_id: msgId, parse_mode: 'HTML' });
      const g = gameInfo(order.product_type);
      let doneMsg = `✅ <b>Buyurtmangiz bajarildi!</b>\n\n📦 #${orderId}\n${g.emoji} ${g.name}: <b>${order.product_name}</b>\n`;
      doneMsg += order.product_type === 'robux'
        ? `👤 Roblox Nik: <b>${order.game_id}</b>\n`
        : `🆔 ID: <code>${order.game_id}</code>\n`;
      doneMsg += `\nO\'yiningizni tekshiring! 🎮\nRahmat! ❤️`;
      await bot.sendMessage(order.telegram_id, doneMsg, { parse_mode: 'HTML', reply_markup: mainReplyKeyboard() });
    }

    else if (data.startsWith('adm_cancel_') && isAdmin(uid)) {
      const orderId = parseInt(data.replace('adm_cancel_', ''));
      const order   = await getOrder(orderId);
      if (!order) return;
      await addBalance(order.telegram_id, order.price, `Buyurtma #${orderId} bekor — pul qaytarildi`);
      await cancelOrder(orderId);
      await bot.editMessageText(message.text + '\n\n❌ <b>BEKOR QILINDI — pul qaytarildi</b>', { chat_id: chatId, message_id: msgId, parse_mode: 'HTML' });
      await bot.sendMessage(order.telegram_id,
        `⚠️ <b>Buyurtma bekor qilindi</b>\n\n📦 #${orderId}\n💰 Pul qaytarildi: <b>${fmt(order.price)}</b>`,
        { parse_mode: 'HTML', reply_markup: mainReplyKeyboard() }
      );
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
  const uid    = from.id;
  const chatId = chat.id;
  const state  = getState(uid);
  if (text && text.startsWith('/') && text !== '/start') return;

  if (text === AI_BUTTON) {
    clearState(uid);
    delete aiChatHistories[uid];
    if (!genAI) {
      return bot.sendMessage(chatId, `⚠️ AI hali sozlanmagan.\n\nAdmin .env faylga GEMINI_API_KEY qo\'shishi kerak.`, { parse_mode: 'HTML' });
    }
    const displayName = from.username ? `@${from.username}` : from.first_name;
    setState(uid, { step: 'ai_chat' });
    return bot.sendMessage(chatId,
      `🤖 <b>AI Yordamchi</b>\n\nSalom, ${displayName}! Savolingizni yozavering!\n\n<i>Chatdan chiqish uchun pastdagi tugmani bosing.</i>`,
      { parse_mode: 'HTML', reply_markup: exitAiBtn() }
    );
  }

  if (state.step === 'ai_chat') {
    if (!text) return;
    await bot.sendChatAction(chatId, 'typing');
    try {
      const reply = await askGemini(uid, text);
      return bot.sendMessage(chatId, reply, { parse_mode: 'HTML', reply_markup: exitAiBtn() });
    } catch (err) {
      console.error('Gemini xato:', err.message);
      return bot.sendMessage(chatId, `⚠️ AI javob bera olmadi. Qayta urinib ko\'ring.`, { reply_markup: exitAiBtn() });
    }
  }

  if (text && CATEGORY_BUTTONS[text]) {
    clearState(uid);
    const type     = CATEGORY_BUTTONS[text];
    const g        = gameInfo(type);
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
    const user = await getOrCreateUser(uid, from.username, [from.first_name, from.last_name].filter(Boolean).join(' '));
    const txs  = await getLastTransactions(uid);
    const txText = txs.length
      ? '\n\n📋 <b>So\'nggi operatsiyalar:</b>\n' + txs.map(t => `${t.amount > 0 ? '+' : ''}${fmt(Math.abs(t.amount))} — ${t.description}`).join('\n')
      : '';
    return bot.sendMessage(chatId,
      `👤 <b>Mening hisobim</b>\n\n🆔 ID: <code>${uid}</code>\n👤 Ism: <b>${user.full_name || 'Noma\'lum'}</b>\n💰 Balans: <b>${fmt(user.balance)}</b>\n💸 Jami sarflangan: <b>${fmt(user.total_spent)}</b>` + txText,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '💰 To\'ldirish', callback_data: 'topup_menu' }]] } }
    );
  }

  if (text === ORDERS_BUTTON) {
    clearState(uid);
    const orders = await getUserOrders(uid);
    if (!orders.length) return bot.sendMessage(chatId, '📋 Hali buyurtmalar yo\'q.', { parse_mode: 'HTML' });
    let ordersText = `📋 <b>Buyurtmalarim</b>\n\n`;
    orders.forEach((o, i) => {
      const s = o.status === 'completed' ? '✅' : o.status === 'pending' ? '⏳' : '❌';
      const g = gameInfo(o.product_type);
      ordersText += `${i+1}. #${o.id} ${s} ${g.emoji} <b>${o.product_name}</b> — ${fmt(o.price)}\n`;
    });
    return bot.sendMessage(chatId, ordersText, { parse_mode: 'HTML' });
  }

  if (text === BULLDROP_BUTTON) {
    clearState(uid);
    return bot.sendMessage(chatId,
      `🎁 <b>Bulldrop</b>\n\nAssalomu alaykum! Siz bu kanalda promolar olishingiz mumkin 🎉\n\n🔥 Chegirmalar, promo kodlar va maxsus takliflar!`,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '🚀 Kirish', url: 'https://t.me/sjjsanbfsahbfa' }]] } }
    );
  }

  if (text === SUPPORT_BUTTON) {
    clearState(uid);
    return bot.sendMessage(chatId,
      `📞 <b>Yordam</b>\n\n👨‍💼 Admin: @admin_username\n⏰ Ish vaqti: 09:00 - 22:00\n\n💬 Murojaat vaqtida buyurtma raqamingizni yozing!`,
      { parse_mode: 'HTML' }
    );
  }

  try {
    if (state.step === 'enter_id') {
      if (!text) return bot.sendMessage(chatId, '⚠️ Matn kiriting!');
      const product = getProductById(state.selectedProduct);
      if (!product) return;

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

      let cleanId = text.trim().replace(/\s+/g, '');
      if (product.type === 'gems') {
        if (!cleanId.startsWith('#')) cleanId = '#' + cleanId;
        setState(uid, { gameId: cleanId, step: 'enter_nick' });
      } else {
        if (!/^\d+$/.test(cleanId)) return bot.sendMessage(chatId, `❌ Faqat raqamlar kiriting!\nMasalan: <code>512345678</code>`, { parse_mode: 'HTML' });
        if (cleanId.length > 15)    return bot.sendMessage(chatId, `❌ ID maksimum 15 ta raqam!`);
        setState(uid, { gameId: cleanId, step: 'enter_nick' });
      }
      await bot.sendMessage(chatId, `✅ ID: <code>${cleanId}</code>\n\n👤 Endi <b>nikneymingizni</b> yozing:`, { parse_mode: 'HTML', reply_markup: cancelBtn() });
    }

    else if (state.step === 'enter_nick') {
      if (!text || text.trim().length < 2) return bot.sendMessage(chatId, '⚠️ Nikneym noto\'g\'ri!');
      const nik     = text.trim().slice(0, 30);
      const product = getProductById(state.selectedProduct);
      if (!product) return;
      const g = gameInfo(product.type);
      setState(uid, { gameNick: nik, step: 'confirm' });
      await bot.sendMessage(chatId,
        `📋 <b>Buyurtma ma\'lumotlari:</b>\n\n${g.emoji} <b>${g.name} — ${product.name}</b>\n🆔 ID: <code>${state.gameId}</code>\n👤 Nik: <b>${nik}</b>\n💰 Narx: <b>${fmt(product.price)}</b>\n\nTasdiqlaysizmi?`,
        { parse_mode: 'HTML', reply_markup: confirmBtn(state.selectedProduct) }
      );
    }

    else if (state.step === 'enter_amount') {
      if (!text) return;
      const amount = parseInt(text.replace(/[\s,]/g, ''));
      if (isNaN(amount) || amount < 1000) return bot.sendMessage(chatId, '❌ Minimum 1,000 so\'m!');
      if (amount > 10000000)              return bot.sendMessage(chatId, '❌ Maksimum 10,000,000 so\'m!');
      setState(uid, { step: 'send_receipt', topupAmount: amount });
      await sendPayment(chatId, null, amount, false);
    }

    else if (state.step === 'send_receipt') {
      const amount = state.topupAmount;
      if (!amount) return;
      let fileId = null, fileType = null;
      if (photo)    { fileId = photo[photo.length-1].file_id; fileType = 'photo'; }
      else if (document) { fileId = document.file_id; fileType = 'document'; }
      if (!fileId) return bot.sendMessage(chatId, `📸 Chekni <b>rasm yoki fayl</b> sifatida yuboring!`, { parse_mode: 'HTML' });

      const reqId = await createTopupReq(uid, amount, fileId, fileType);
      clearState(uid);
      await bot.sendMessage(chatId,
        `✅ <b>Chek qabul qilindi!</b>\n\n📋 So\'rov #${reqId}\n💰 <b>${fmt(amount)}</b>\n\n⏳ Admin tasdig\'ini kuting (5-30 daqiqa)`,
        { parse_mode: 'HTML', reply_markup: mainReplyKeyboard() }
      );

      const user = await getUser(uid);
      const name = user?.username ? `@${user.username}` : (user?.full_name || `ID: ${uid}`);
      const cap  = `💰 <b>Yangi to\'ldirish #${reqId}</b>\n\n👤 ${name} (${uid})\n💰 <b>${fmt(amount)}</b>`;
      for (const adminId of ADMIN_IDS) {
        try {
          if (fileType === 'photo') await bot.sendPhoto(adminId, fileId, { caption: cap, parse_mode: 'HTML', reply_markup: adminTopupBtn(reqId) });
          else await bot.sendDocument(adminId, fileId, { caption: cap, parse_mode: 'HTML', reply_markup: adminTopupBtn(reqId) });
        } catch (e) { console.error('Admin xabar:', e.message); }
      }
    }

    else if (state.step === 'adm_give_balance' && isAdmin(uid)) {
      if (!text) return;
      const parts    = text.trim().split(/\s+/);
      if (parts.length < 2) return bot.sendMessage(chatId, '❌ Format: <code>ID MIQDOR</code>', { parse_mode: 'HTML' });
      const targetId = parseInt(parts[0]);
      const amount   = parseInt(parts[1]);
      if (isNaN(targetId) || isNaN(amount) || amount <= 0) return bot.sendMessage(chatId, '❌ Noto\'g\'ri format!');
      const targetUser = await getUser(targetId);
      if (!targetUser) return bot.sendMessage(chatId, `❌ Foydalanuvchi topilmadi: ${targetId}`);
      await addBalance(targetId, amount, 'Admin tomonidan qo\'shildi');
      clearState(uid);
      const newBal = await getBalance(targetId);
      const tName  = targetUser.username ? `@${targetUser.username}` : (targetUser.full_name || `ID: ${targetId}`);
      await bot.sendMessage(chatId, `✅ ${tName} ga <b>${fmt(amount)}</b> qo\'shildi.\nYangi balans: <b>${fmt(newBal)}</b>`, { parse_mode: 'HTML' });
      await bot.sendMessage(targetId, `💳 <b>Hisobingizga ${fmt(amount)} qo\'shildi!</b>\n\nYangi balans: <b>${fmt(newBal)}</b>`, { parse_mode: 'HTML', reply_markup: mainReplyKeyboard() }).catch(()=>{});
    }

    else if (state.step === 'adm_reject' && isAdmin(uid)) {
      const req = await rejectTopup(state.rejectId, uid, text);
      if (!req) return bot.sendMessage(chatId, '❌ Topilmadi!');
      clearState(uid);
      await bot.sendMessage(chatId, `✅ So\'rov #${req.id} rad etildi.`);
      await bot.sendMessage(req.telegram_id,
        `❌ <b>To\'ldirish rad etildi</b>\n\n📋 #${req.id} | 💰 ${fmt(req.amount)}\n\n📝 Sabab: <b>${text}</b>`,
        { parse_mode: 'HTML', reply_markup: mainReplyKeyboard() }
      );
    }

    else if (state.step === 'adm_broadcast' && isAdmin(uid)) {
      if (!text) return;
      clearState(uid);
      const users = await getAllUsers();
      let sent = 0, failed = 0;
      await bot.sendMessage(chatId, `📢 Yuborilmoqda... (${users.length} ta)`);
      for (const u of users) {
        try { await bot.sendMessage(u.telegram_id, `📢 <b>Admin xabari:</b>\n\n${text}`, { parse_mode: 'HTML' }); sent++; await new Promise(r => setTimeout(r, 50)); }
        catch { failed++; }
      }
      await bot.sendMessage(chatId, `✅ Tugadi! Yuborildi: ${sent} | Xato: ${failed}`);
    }

    else if (text && !state.step) {
      await bot.sendMessage(chatId, `🎮 <b>Game Shop</b>\n\n👇 Pastdagi menyudan tanlang:`, { parse_mode: 'HTML', reply_markup: mainReplyKeyboard() });
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

// ========================
// START
// ========================
connectDB().then(() => {
  console.log('🚀 Game Shop Bot ishga tushdi!');
  console.log(`👥 Adminlar: ${ADMIN_IDS.join(', ')}`);
}).catch(err => {
  console.error('❌ MongoDB ulanmadi:', err.message);
  process.exit(1);
});
