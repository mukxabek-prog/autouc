require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs   = require('fs');
const path = require('path');
const http = require('http');
const { MongoClient } = require('mongodb');

// ========================
// CONFIG
// ========================
const BOT_TOKEN   = process.env.BOT_TOKEN;
const ADMIN_IDS   = (process.env.ADMIN_IDS || '').split(',').map(id => parseInt(id.trim())).filter(Boolean);
const PORT        = process.env.PORT || 3000;
const MONGO_URL = process.env.MONGO_URL;mongodb+srv://muhammadjon:mukxabek2010@cluster0.9wjrn8y.mongodb.net/?appName=Cluster0
const CHANNEL     = '@auto_uc';
const CHANNEL_URL = 'https://t.me/auto_uc';

if (!BOT_TOKEN) { console.error('❌ BOT_TOKEN topilmadi!'); process.exit(1); }
if (!MONGO_URL) { console.error('❌ MONGO_URL topilmadi!'); process.exit(1); }

const bot        = new TelegramBot(BOT_TOKEN, { polling: true });
const userStates = {};

// ========================
// MONGODB ULANISH
// ========================
let db;
const client = new MongoClient(MONGO_URL);

async function connectDB() {
  await client.connect();
  db = client.db('game_shop');
  console.log('✅ MongoDB ga ulandi!');

  // Indexlar yaratish
  await db.collection('users').createIndex({ telegram_id: 1 }, { unique: true });
  await db.collection('orders').createIndex({ telegram_id: 1 });
  await db.collection('topup_requests').createIndex({ telegram_id: 1 });
  await db.collection('transactions').createIndex({ telegram_id: 1 });

  // Default mahsulotlar (birinchi marta)
  const count = await db.collection('products').countDocuments();
  if (count === 0) {
    const DEFAULT_PRODUCTS = [
      {id:1,type:'uc',name:'60 UC',price:12500},
      {id:2,type:'uc',name:'325 UC',price:60000},
      {id:3,type:'uc',name:'660 UC',price:120000},
      {id:4,type:'uc',name:'1800 UC',price:290000},
      {id:5,type:'uc',name:'3850 UC',price:575000},
      {id:6,type:'uc',name:'8100 UC',price:1130000},
      {id:34,type:'uc',name:'16200 UC',price:2265000},
      {id:35,type:'uc',name:'24300 UC',price:3400000},
      {id:36,type:'uc',name:'32400 UC',price:4550000},
      {id:37,type:'uc',name:'40500 UC',price:5770000},
      {id:7,type:'popularity',name:'20K PP',price:20000},
      {id:8,type:'popularity',name:'50K PP',price:50000},
      {id:9,type:'popularity',name:'100K PP',price:90000},
      {id:10,type:'popularity',name:'150K PP',price:140000},
      {id:38,type:'popularity',name:'200K PP',price:185000},
      {id:11,type:'diamond',name:'100 Diamond',price:12500},
      {id:12,type:'diamond',name:'210 Diamond',price:25000},
      {id:13,type:'diamond',name:'530 Diamond',price:63000},
      {id:14,type:'diamond',name:'1080 Diamond',price:127000},
      {id:15,type:'diamond',name:'2200 Diamond',price:250000},
      {id:16,type:'diamond',name:'4400 Diamond',price:500000},
      {id:23,type:'mlbb',name:'56',price:12500},
      {id:24,type:'mlbb',name:'278',price:63000},
      {id:25,type:'mlbb',name:'1783',price:365000},
      {id:26,type:'mlbb',name:'3005',price:610000},
      {id:27,type:'mlbb',name:'4770',price:973000},
      {id:28,type:'mlbb',name:'6012',price:1225000}
    ];
    await db.collection('products').insertMany(DEFAULT_PRODUCTS);
    console.log("✅ Default mahsulotlar qo'shildi");
  }

  // Auto-increment counters
  if (!await db.collection('counters').findOne({ _id: 'order_id' }))
    await db.collection('counters').insertOne({ _id: 'order_id', seq: 1 });
  if (!await db.collection('counters').findOne({ _id: 'topup_id' }))
    await db.collection('counters').insertOne({ _id: 'topup_id', seq: 1 });
  if (!await db.collection('counters').findOne({ _id: 'tournament_id' }))
    await db.collection('counters').insertOne({ _id: 'tournament_id', seq: 1 });
}

async function getNextId(name) {
  const result = await db.collection('counters').findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { returnDocument: 'before', upsert: true }
  );
  return result.seq || 1;
}

// ========================
// USER FUNKSIYALAR
// ========================
async function getOrCreateUser(tid, username, fullName) {
  const id = parseInt(tid);
  const existing = await db.collection('users').findOne({ telegram_id: id });
  if (!existing) {
    const user = {
      telegram_id: id, username: username||null, full_name: fullName||null,
      balance: 0, total_spent: 0, joined_at: new Date().toISOString(), used_promos: []
    };
    await db.collection('users').insertOne(user);
    return user;
  }
  const upd = {};
  if (username) upd.username = username;
  if (fullName) upd.full_name = fullName;
  if (!existing.used_promos) upd.used_promos = [];
  if (Object.keys(upd).length) await db.collection('users').updateOne({ telegram_id: id }, { $set: upd });
  return { ...existing, ...upd };
}

async function getUser(tid) {
  return await db.collection('users').findOne({ telegram_id: parseInt(tid) }) || null;
}

async function getBalance(tid) {
  const u = await getUser(tid);
  return u ? u.balance : 0;
}

async function getAllUsers() {
  return await db.collection('users').find({}).toArray();
}

async function addBalance(tid, amount, desc) {
  const id = parseInt(tid);
  await db.collection('users').updateOne({ telegram_id: id }, { $inc: { balance: amount } });
  await db.collection('transactions').insertOne({
    telegram_id: id, type: 'topup', amount,
    description: desc || "To'ldirish", created_at: new Date().toISOString()
  });
}

async function deductBalance(tid, amount, desc) {
  const id = parseInt(tid);
  const user = await getUser(id);
  if (!user || user.balance < amount) return false;
  await db.collection('users').updateOne(
    { telegram_id: id },
    { $inc: { balance: -amount, total_spent: amount } }
  );
  await db.collection('transactions').insertOne({
    telegram_id: id, type: 'purchase', amount: -amount,
    description: desc || 'Xarid', created_at: new Date().toISOString()
  });
  return true;
}

async function getLastTxs(tid) {
  return await db.collection('transactions')
    .find({ telegram_id: parseInt(tid) })
    .sort({ created_at: -1 }).limit(5).toArray();
}

// ========================
// TOPUP FUNKSIYALAR
// ========================
async function createTopupReq(tid, amount, fileId, fileType) {
  const id = await getNextId('topup_id');
  await db.collection('topup_requests').insertOne({
    id, telegram_id: parseInt(tid), amount,
    receipt_file_id: fileId, receipt_type: fileType,
    status: 'pending', created_at: new Date().toISOString()
  });
  return id;
}

async function getPendingTopups() {
  return await db.collection('topup_requests').find({ status: 'pending' }).toArray();
}

async function approveTopup(id, adminId) {
  const req = await db.collection('topup_requests').findOne({ id: parseInt(id) });
  if (!req || req.status !== 'pending') return false;
  await db.collection('topup_requests').updateOne(
    { id: parseInt(id) },
    { $set: { status: 'approved', reviewed_by: adminId, reviewed_at: new Date().toISOString() } }
  );
  await addBalance(req.telegram_id, req.amount, `To'ldirish #${id} tasdiqlandi`);
  return req;
}

async function rejectTopup(id, adminId, reason) {
  const req = await db.collection('topup_requests').findOne({ id: parseInt(id) });
  if (!req || req.status !== 'pending') return false;
  await db.collection('topup_requests').updateOne(
    { id: parseInt(id) },
    { $set: { status: 'rejected', reviewed_by: adminId, reject_reason: reason||null, reviewed_at: new Date().toISOString() } }
  );
  return req;
}

// ========================
// ORDER FUNKSIYALAR
// ========================
async function createOrder(tid, type, name, price, origPrice, gameId, gameNick, promoUsed) {
  const id = await getNextId('order_id');
  await db.collection('orders').insertOne({
    id, telegram_id: parseInt(tid), product_type: type, product_name: name,
    price, original_price: origPrice, game_id: gameId, game_nick: gameNick||'-',
    promo_used: promoUsed||null, status: 'pending',
    created_at: new Date().toISOString(), completed_at: null
  });
  return id;
}

async function getOrder(id) {
  return await db.collection('orders').findOne({ id: parseInt(id) }) || null;
}

async function getUserOrders(tid) {
  return await db.collection('orders')
    .find({ telegram_id: parseInt(tid) })
    .sort({ created_at: -1 }).limit(10).toArray();
}

async function getAllOrders() {
  return await db.collection('orders')
    .find({}).sort({ created_at: -1 }).limit(30).toArray();
}

async function completeOrder(id) {
  await db.collection('orders').updateOne(
    { id: parseInt(id) },
    { $set: { status: 'completed', completed_at: new Date().toISOString() } }
  );
}

async function cancelOrder(id) {
  await db.collection('orders').updateOne({ id: parseInt(id) }, { $set: { status: 'cancelled' } });
}

async function getProductById(id) {
  return await db.collection('products').findOne({ id: parseInt(id) }) || null;
}

async function getProducts(type) {
  return await db.collection('products').find({ type }).toArray();
}

async function getStats() {
  const users = await db.collection('users').countDocuments();
  const done = await db.collection('orders').find({ status: 'completed' }).toArray();
  const pendingTopups = await db.collection('topup_requests').countDocuments({ status: 'pending' });
  const pendingOrders = await db.collection('orders').countDocuments({ status: 'pending' });
  const totalPromos = await db.collection('promocodes').countDocuments();
  const totalTournaments = await db.collection('tournaments').countDocuments();
  return {
    users, orders: done.length,
    revenue: done.reduce((s,o) => s+o.price, 0),
    pendingTopups, pendingOrders, totalPromos, totalTournaments
  };
}

// ========================
// PROMOKOD FUNKSIYALAR
// ========================
async function createPromo(code, amount, maxUses) {
  const k = code.toUpperCase();
  const expiresAt = new Date(Date.now() + 12*60*60*1000).toISOString();
  const promo = {
    code: k, amount, maxUses: maxUses||1, usedBy: [],
    created_at: new Date().toISOString(), expires_at: expiresAt, is_active: true
  };
  await db.collection('promocodes').replaceOne({ code: k }, promo, { upsert: true });
  return promo;
}

async function getPromo(code) {
  return await db.collection('promocodes').findOne({ code: code.toUpperCase() }) || null;
}

async function getAllPromos() {
  return await db.collection('promocodes').find({}).toArray();
}

async function deletePromo(code) {
  const result = await db.collection('promocodes').deleteOne({ code: code.toUpperCase() });
  return result.deletedCount > 0;
}

async function markPromoUsed(code, tid) {
  await db.collection('promocodes').updateOne(
    { code: code.toUpperCase() }, { $push: { usedBy: String(tid) } }
  );
}

async function checkPromo(code, tid) {
  const promo = await getPromo(code);
  if (!promo)           return { ok: false, msg: '❌ Promokod topilmadi!' };
  if (!promo.is_active) return { ok: false, msg: '❌ Promokod faol emas!' };
  if (promo.expires_at && new Date() > new Date(promo.expires_at)) {
    await db.collection('promocodes').updateOne(
      { code: code.toUpperCase() }, { $set: { is_active: false } }
    );
    return { ok: false, msg: '❌ Promokod muddati tugagan!' };
  }
  if (promo.usedBy.length >= promo.maxUses)
    return { ok: false, msg: '😔 Kechirasz, ulgurmadingiz! Promokod tugadi.' };
  if (promo.usedBy.map(String).includes(String(tid)))
    return { ok: false, msg: '❌ Siz bu promokodni allaqachon ishlatgansiz!' };
  return { ok: true, amount: promo.amount, promo };
}

async function cleanExpiredPromos() {
  await db.collection('promocodes').updateMany(
    { expires_at: { $lt: new Date().toISOString() }, is_active: true },
    { $set: { is_active: false } }
  );
}
setInterval(cleanExpiredPromos, 30*60*1000);

// ========================
// TURNIR FUNKSIYALAR
// ========================
async function createTournament(data) {
  const id = await getNextId('tournament_id');
  await db.collection('tournaments').insertOne({
    id, ...data, participants: [], is_active: true, created_at: new Date().toISOString()
  });
  return id;
}

async function getTournament(id) {
  return await db.collection('tournaments').findOne({ id: parseInt(id) }) || null;
}

async function getAllTournaments() {
  return await db.collection('tournaments').find({ is_active: true }).toArray();
}

async function updateTournament(id, data) {
  const result = await db.collection('tournaments').updateOne({ id: parseInt(id) }, { $set: data });
  return result.modifiedCount > 0;
}

async function deleteTournament(id) {
  const result = await db.collection('tournaments').updateOne(
    { id: parseInt(id) }, { $set: { is_active: false } }
  );
  return result.modifiedCount > 0;
}

async function joinTournament(tournamentId, userId, gameId, gameNick) {
  const t = await getTournament(tournamentId);
  if (!t || !t.is_active) return { ok: false, msg: '❌ Turnir topilmadi!' };
  if (t.participants.length >= t.slots) return { ok: false, msg: "❌ Turnir to'ldi!" };
  if (t.participants.find(p => p.telegram_id === userId))
    return { ok: false, msg: "❌ Siz allaqachon bu turnirga qo'shilgansiz!" };
  const deducted = await deductBalance(userId, t.entry_fee, `Turnir #${tournamentId} kirish`);
  if (!deducted) return { ok: false, msg: `❌ Balans yetarli emas! Kirish narxi: ${fmt(t.entry_fee)}` };
  const update = { $push: { participants: { telegram_id: userId, game_id: gameId, game_nick: gameNick } } };
  if (t.participants.length + 1 >= t.slots) update.$set = { is_active: false };
  await db.collection('tournaments').updateOne({ id: parseInt(tournamentId) }, update);
  return { ok: true };
}

async function getUserTournaments(userId) {
  return await db.collection('tournaments').find({ 'participants.telegram_id': userId }).toArray();
}

// ========================
// OBUNA TEKSHIRISH
// ========================
async function isSubscribed(userId) {
  try {
    const m = await bot.getChatMember(CHANNEL, userId);
    return ['member','administrator','creator'].includes(m.status);
  } catch(e) { return false; }
}

async function sendSubRequired(chatId) {
  await bot.sendMessage(chatId,
    `🔒 <b>Botdan foydalanish uchun kanalga obuna bo'ling!</b>\n\n📢 Kanal: ${CHANNEL}\n\nObuna bo'lgandan so'ng "✅ Tekshirish" tugmasini bosing.`,
    { parse_mode:'HTML', reply_markup:{ inline_keyboard:[
      [{text:`📢 ${CHANNEL} ga o'tish`, url:CHANNEL_URL}],
      [{text:'✅ Obunani tekshirish', callback_data:'check_sub'}]
    ]}}
  );
}

// ========================
// HELPERS
// ========================
function fmt(p)  { return p.toLocaleString('uz-UZ')+' so\'m'; }
function isAdmin(id) { return ADMIN_IDS.includes(parseInt(id)); }
function getState(id)    { return userStates[id]||{}; }
function setState(id,s)  { userStates[id]={...getState(id),...s}; }
function clearState(id)  { delete userStates[id]; }

function gameInfo(type) {
  return {
    uc:         {name:'PUBG Mobile',   emoji:'🎮', idLabel:'PUBG ID (faqat raqam, max 15)'},
    popularity: {name:'PUBG Mobile',   emoji:'⭐', idLabel:'PUBG ID (faqat raqam, max 15)'},
    diamond:    {name:'Free Fire',     emoji:'🔥', idLabel:'Free Fire ID (faqat raqam)'},
    mlbb:       {name:'Mobile Legends',emoji:'🌟', idLabel:'MLBB ID (faqat raqam)'}
  }[type]||{name:type, emoji:'🎮', idLabel:'ID'};
}

const MAP_NAMES  = ['Erangel','Sanhok','Miramar','Livik'];
const MODE_NAMES = ['Solo','Duo','Squad'];
const MONTHS = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];

// ========================
// KEYBOARDS
// ========================
const CAT_BTNS = {
  '🎮 PUBG — UC':               'uc',
  '⭐ PUBG — Popularity':       'popularity',
  '🔥 Free Fire — Diamond':     'diamond',
  '🌟 Mobile Legends — Diamond':'mlbb'
};
const BTN_TOPUP   = "💰 Hisobni to'ldirish";
const BTN_ACCOUNT = '👤 Mening hisobim';
const BTN_ORDERS  = '📋 Buyurtmalarim';
const BTN_SUPPORT = '📞 Yordam';
const BTN_PROMO   = '🎟 Promokod';
const BTN_HISOB   = '💸 Pul ishlash';
const BTN_TURNIR  = '🏆 Turnir';

function mainKeyboard() {
  return {
    keyboard:[
      ['🎮 PUBG — UC',           '⭐ PUBG — Popularity'],
      ['🔥 Free Fire — Diamond', '🌟 Mobile Legends — Diamond'],
      [BTN_TOPUP,  BTN_ACCOUNT],
      [BTN_ORDERS, BTN_PROMO],
      [BTN_HISOB,  BTN_SUPPORT],
      [BTN_TURNIR]
    ],
    resize_keyboard:true, is_persistent:true
  };
}

function productsMenu(products) {
  const rows=[];
  for(let i=0;i<products.length;i+=2){
    const row=[{text:products[i].name+' — '+fmt(products[i].price), callback_data:'product_'+products[i].id}];
    if(products[i+1]) row.push({text:products[i+1].name+' — '+fmt(products[i+1].price), callback_data:'product_'+products[i+1].id});
    rows.push(row);
  }
  rows.push([{text:'🔙 Orqaga', callback_data:'back_main'}]);
  return {inline_keyboard:rows};
}

function topupMenu() {
  return {inline_keyboard:[
    [{text:"5,000 so'm",callback_data:'topup_5000'},{text:"10,000 so'm",callback_data:'topup_10000'}],
    [{text:"20,000 so'm",callback_data:'topup_20000'},{text:"50,000 so'm",callback_data:'topup_50000'}],
    [{text:"100,000 so'm",callback_data:'topup_100000'},{text:"150,000 so'm",callback_data:'topup_150000'}],
    [{text:"✏️ Boshqa miqdor",callback_data:'topup_custom'}],
    [{text:'🔙 Orqaga',callback_data:'back_main'}]
  ]};
}

function cancelBtn()    { return {inline_keyboard:[[{text:'❌ Bekor qilish',callback_data:'back_main'}]]}; }
function confirmBtn(pid){ return {inline_keyboard:[[{text:'✅ Tasdiqlash',callback_data:'confirm_'+pid},{text:'❌ Bekor',callback_data:'back_main'}]]}; }
function atmBtn(id)     { return {inline_keyboard:[[{text:'✅ Tasdiqlash',callback_data:'adm_ok_'+id},{text:'❌ Rad etish',callback_data:'adm_no_'+id}]]}; }
function aordBtn(id)    { return {inline_keyboard:[[{text:'✅ Bajarildi',callback_data:'adm_done_'+id},{text:'❌ Bekor',callback_data:'adm_cancel_'+id}]]}; }

function adminMenu() {
  return {inline_keyboard:[
    [{text:"⏳ Kutayotgan to'ldirish",callback_data:'adm_topups'},{text:'📦 Buyurtmalar',callback_data:'adm_orders'}],
    [{text:'💳 Balans berish/ayirish',callback_data:'adm_give'},{text:'👥 Foydalanuvchilar',callback_data:'adm_users'}],
    [{text:'🔍 Foydalanuvchi qidirish',callback_data:'adm_search'},{text:'💬 Xabar yuborish',callback_data:'adm_msg_user'}],
    [{text:'🎟 Promokodlar',callback_data:'adm_promos'},{text:'📢 Hammaga xabar',callback_data:'adm_broadcast'}],
    [{text:'🏆 Turnirlarni boshqarish',callback_data:'adm_tournaments'}]
  ]};
}

// ========================
// TO'LOV
// ========================
async function sendPayment(chatId, msgId, amount, edit) {
  const text=`💰 <b>To'ldirish: ${fmt(amount)}</b>\n\n1️⃣ Quyidagi kartaga pul o'tkazing:\n🏦 <code>9860 1606 2989 6350</code>\n👆 <i>(Karta raqamiga bosing — avtomatik ko'chiriladi)</i>\n👤 <b>Qoshaqboyev.I</b>\n\n2️⃣ Miqdor: <b>${fmt(amount)}</b>\n\n3️⃣ To'lovdan so'ng <b>chek (screenshot)</b> yuboring\n\n✅ Admin tasdiqlashidan so'ng balans qo'shiladi!`;
  const opts={parse_mode:'HTML', reply_markup:cancelBtn()};
  if(edit&&msgId) await bot.editMessageText(text,{chat_id:chatId,message_id:msgId,...opts});
  else await bot.sendMessage(chatId, text, opts);
}

// ========================
// START
// ========================
async function sendStart(chatId, from) {
  await getOrCreateUser(from.id, from.username, [from.first_name,from.last_name].filter(Boolean).join(' '));
  const photoPath = path.join(__dirname, 'menustart.png');
  const caption = `👋 Salom, <b>${from.first_name}</b>!\n\n🎮 <b>Game Shop</b> ga xush kelibsiz!\n\n🎮 PUBG Mobile — UC & Popularity\n🔥 Free Fire — Diamond\n🌟 Mobile Legends — Diamond\n\n💳 To'lov admin orqali tasdiqlanadi.\n⚡ Tez va ishonchli yetkazib berish!\n\n👇 Pastdagi menyudan tanlang:`;
  try {
    if(fs.existsSync(photoPath)) {
      await bot.sendPhoto(chatId, fs.createReadStream(photoPath), {caption, parse_mode:'HTML', reply_markup:mainKeyboard()});
    } else {
      await bot.sendMessage(chatId, caption, {parse_mode:'HTML', reply_markup:mainKeyboard()});
    }
  } catch(e) {
    await bot.sendMessage(chatId, caption, {parse_mode:'HTML', reply_markup:mainKeyboard()});
  }
}

bot.onText(/\/start(.*)/, async (msg, match) => {
  clearState(msg.from.id);
  const from = msg.from;
  await getOrCreateUser(from.id, from.username, [from.first_name, from.last_name].filter(Boolean).join(' '));
  const ok = await isSubscribed(from.id);
  if(!ok) return sendSubRequired(msg.chat.id);
  await sendStart(msg.chat.id, from);
});

bot.onText(/\/admin/, async (msg) => {
  if(!isAdmin(msg.from.id)) return bot.sendMessage(msg.chat.id,'❌ Ruxsat yo\'q!');
  await bot.sendMessage(msg.chat.id,
    `⚙️ <b>Admin Panel</b>\n\nXush kelibsiz, admin! Quyidagi bo'limlardan birini tanlang:`,
    {parse_mode:'HTML', reply_markup:adminMenu()}
  );
});

// ========================
// CALLBACK QUERY
// ========================
bot.on('callback_query', async (query) => {
  const {data,from,message} = query;
  const uid    = from.id;
  const chatId = message.chat.id;
  const msgId  = message.message_id;
  await bot.answerCallbackQuery(query.id);

  try {
    if(data==='check_sub') {
      const ok=await isSubscribed(uid);
      if(!ok) return bot.sendMessage(chatId,"❌ Hali obuna bo'lmadingiz! Obuna bo'lib qaytadan tekshiring.",{reply_markup:{inline_keyboard:[[{text:`📢 ${CHANNEL}`,url:CHANNEL_URL}],[{text:'✅ Tekshirish',callback_data:'check_sub'}]]}});
      await bot.editMessageText('✅ Obuna tasdiqlandi! Xush kelibsiz! 🎮',{chat_id:chatId,message_id:msgId});
      return sendStart(chatId,from);
    }

    if(!isAdmin(uid)) {
      const ok=await isSubscribed(uid);
      if(!ok) {
        try { await bot.editMessageReplyMarkup({inline_keyboard:[]},{chat_id:chatId,message_id:msgId}); } catch(e){}
        return sendSubRequired(chatId);
      }
    }

    if(data==='back_main') {
      clearState(uid);
      try { await bot.editMessageText('🎮 <b>Game Shop</b>\n\n👇 Pastdagi menyudan tanlang',{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[]}}); } catch(e){}
      return;
    }

    if(data.startsWith('buy_')) {
      const type=data.replace('buy_','');
      const g=gameInfo(type);
      return bot.editMessageText(`${g.emoji} <b>${g.name}</b>\n\nPaket tanlang:`,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:productsMenu(await getProducts(type))});
    }

    if(data.startsWith('product_')) {
      const pid=parseInt(data.split('_')[1]);
      const product=await getProductById(pid);
      if(!product) return;
      const bal=await getBalance(uid);
      const g=gameInfo(product.type);
      setState(uid,{selectedProduct:pid, step:'enter_id', finalPrice:product.price});
      if(bal<product.price) {
        return bot.editMessageText(
          `${g.emoji} <b>${product.name}</b>\n\n💰 Narx: <b>${fmt(product.price)}</b>\n💳 Balans: <b>${fmt(bal)}</b>\n\n⚠️ <b>Balans yetarli emas!</b>\nYetishmaydi: <b>${fmt(product.price-bal)}</b>`,
          {chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:"💰 Hisobni to'ldirish",callback_data:'topup_menu'}],[{text:'🔙 Orqaga',callback_data:'back_main'}]]}}
        );
      }
      return bot.editMessageText(
        `${g.emoji} <b>${product.name}</b>\n\n💰 Narx: <b>${fmt(product.price)}</b>\n💳 Balans: <b>${fmt(bal)}</b>\n\n📝 🆔 <b>${g.idLabel}</b> yuboring:`,
        {chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:cancelBtn()}
      );
    }

    if(data.startsWith('confirm_')) {
      const pid=parseInt(data.replace('confirm_',''));
      const state=getState(uid);
      const product=await getProductById(pid);
      if(!product||!state.gameId) return;
      const g=gameInfo(product.type);
      const finalPrice=(state.finalPrice!==undefined&&state.finalPrice!==null)?state.finalPrice:product.price;
      const deducted=await deductBalance(uid,finalPrice,product.name+' xaridi');
      if(!deducted) return bot.editMessageText('❌ Balans yetarli emas!',{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'🏠 Menyu',callback_data:'back_main'}]]}});
      const orderId=await createOrder(uid,product.type,product.name,finalPrice,product.price,state.gameId,state.gameNick,null);
      clearState(uid);
      const newBal=await getBalance(uid);
      await bot.editMessageText(
        `✅ <b>Buyurtma qabul qilindi!</b>\n\n📦 #${orderId}\n${g.emoji} ${g.name}: <b>${product.name}</b>\n🆔 ID: <code>${state.gameId}</code>\n👤 Nik: <b>${state.gameNick||'-'}</b>\n💰 To'langan: <b>${fmt(finalPrice)}</b>\n💳 Qolgan: <b>${fmt(newBal)}</b>\n\n⏳ <b>Admin tasdig'ini kuting (5-15 daqiqa)</b>`,
        {chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'🏠 Bosh menyu',callback_data:'back_main'}]]}}
      );
      const fromUser=from.username?`@${from.username}`:from.first_name;
      for(const adminId of ADMIN_IDS) {
        await bot.sendMessage(adminId,
          `🛒 <b>Yangi buyurtma #${orderId}</b>\n\n👤 ${fromUser} (${uid})\n${g.emoji} <b>${g.name} — ${product.name}</b>\n🆔 ID: <code>${state.gameId}</code>\n👤 Nik: <b>${state.gameNick||'-'}</b>\n💰 <b>${fmt(finalPrice)}</b>`,
          {parse_mode:'HTML',reply_markup:aordBtn(orderId)}
        );
      }
    }

    if(data==='topup_menu') {
      return bot.editMessageText(`💰 <b>Hisobni to'ldirish</b>\n\n📌 To'lov usuli: Admin orqali\n📸 Chek yuboring → Admin tasdiqlaydi → Balans qo'shiladi\n\n📌 Minimum: 5,000 so'm | Maksimum: 150,000 so'm`,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:topupMenu()});
    }
    if(data.startsWith('topup_')&&data!=='topup_menu') {
      const val=data.replace('topup_','');
      if(val==='custom') {
        setState(uid,{step:'enter_amount'});
        return bot.editMessageText(`✏️ Nechta so'm to'ldirmoqchisiz?\n\n📌 Minimum: 5,000 | Maksimum: 150,000\n\nFaqat raqam kiriting:`,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'topup_menu'}]]}});
      }
      setState(uid,{step:'send_receipt',topupAmount:parseInt(val)});
      return sendPayment(chatId,msgId,parseInt(val),true);
    }

    if(data==='my_account') {
      const user=await getOrCreateUser(uid,from.username,[from.first_name,from.last_name].filter(Boolean).join(' '));
      const txs=await getLastTxs(uid);
      const txText=txs.length?'\n\n📋 <b>So\'nggi operatsiyalar:</b>\n'+txs.map(t=>`${t.amount>0?'+':''}${fmt(Math.abs(t.amount))} — ${t.description}`).join('\n'):'';
      return bot.editMessageText(
        `👤 <b>Mening hisobim</b>\n\n🆔 ID: <code>${uid}</code>\n👤 Ism: <b>${user.full_name||"Noma'lum"}</b>\n💰 Balans: <b>${fmt(user.balance)}</b>\n💸 Jami sarflangan: <b>${fmt(user.total_spent)}</b>`+txText,
        {chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:"💰 To'ldirish",callback_data:'topup_menu'}],[{text:'🏠 Menyu',callback_data:'back_main'}]]}}
      );
    }

    if(data==='promo_enter') {
      clearState(uid); setState(uid,{step:'enter_promo'});
      return bot.sendMessage(chatId,`🎟 <b>Promokod kiritish</b>\n\nPromokod kodini yozing:`,{parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'back_main'}]]}});
    }
    if(data==='promo_get') {
      return bot.sendMessage(chatId,`🎟 <b>Promokod olish</b>\n\nPromokod olish uchun kanalimizga obuna bo'ling!\n\n📢 Kanalimiz:`,
        {parse_mode:'HTML', reply_markup:{inline_keyboard:[
          [{text:`📢 ${CHANNEL} ga o'tish`, url:CHANNEL_URL}],
          [{text:'🔙 Orqaga', callback_data:'back_main'}]
        ]}}
      );
    }

    if(data==='adm_topups'&&isAdmin(uid)) {
      const reqs=await getPendingTopups();
      if(!reqs.length) return bot.editMessageText("✅ Kutayotgan to'ldirish yo'q.",{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:adminMenu()});
      await bot.editMessageText(`⏳ <b>${reqs.length} ta kutayotgan to'ldirish</b>`,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:adminMenu()});
      for(const req of reqs) {
        const user=await getUser(req.telegram_id);
        const name=user?.username?`@${user.username}`:(user?.full_name||`ID: ${req.telegram_id}`);
        const cap=`💰 <b>To'ldirish #${req.id}</b>\n👤 ${name} (${req.telegram_id})\n💰 <b>${fmt(req.amount)}</b>`;
        try {
          if(req.receipt_type==='photo') await bot.sendPhoto(chatId,req.receipt_file_id,{caption:cap,parse_mode:'HTML',reply_markup:atmBtn(req.id)});
          else await bot.sendDocument(chatId,req.receipt_file_id,{caption:cap,parse_mode:'HTML',reply_markup:atmBtn(req.id)});
        } catch { await bot.sendMessage(chatId,cap+'\n⚠️ Chek yuklanmagan.',{parse_mode:'HTML',reply_markup:atmBtn(req.id)}); }
      }
    }

    if(data==='adm_orders'&&isAdmin(uid)) {
      const orders=await getAllOrders();
      if(!orders.length) return bot.editMessageText("📦 Buyurtmalar yo'q.",{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:adminMenu()});
      let text=`📦 <b>So'nggi buyurtmalar:</b>\n\n`;
      orders.forEach(o=>{const s=o.status==='completed'?'✅':o.status==='pending'?'⏳':'❌';const g=gameInfo(o.product_type);text+=`${s} #${o.id} ${g.emoji} ${o.product_name} — <code>${o.game_id}</code>\n`;});
      return bot.editMessageText(text,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'🔙 Admin',callback_data:'adm_back'}]]}});
    }

    if(data==='adm_back'&&isAdmin(uid)) {
      return bot.editMessageText(`⚙️ <b>Admin Panel</b>`,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:adminMenu()});
    }

    if(data==='adm_users'&&isAdmin(uid)) {
      const allUsers=await getAllUsers(); const users=allUsers.slice(0,30);
      let text=`👥 <b>Foydalanuvchilar (${allUsers.length} ta):</b>\n\n`;
      users.forEach((u,i)=>{const name=u.username?`@${u.username}`:(u.full_name||"Noma'lum");text+=`${i+1}. ${name} | ID: <code>${u.telegram_id}</code> — <b>${fmt(u.balance)}</b>\n`;});
      return bot.editMessageText(text,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'🔙 Admin',callback_data:'adm_back'}]]}});
    }

    if(data==='adm_give'&&isAdmin(uid)) {
      return bot.editMessageText(`💳 <b>Balans boshqarish</b>`,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[
        [{text:"➕ Balans qo'shish",callback_data:'adm_give_add'},{text:'➖ Balans ayirish',callback_data:'adm_give_sub'}],
        [{text:'🔙 Admin',callback_data:'adm_back'}]
      ]}});
    }
    if(data==='adm_give_add'&&isAdmin(uid)) {
      setState(uid,{step:'adm_give_add'});
      return bot.sendMessage(chatId,`➕ <b>Balans qo'shish</b>\n\nFormat: <code>ID MIQDOR</code>\nMasalan: <code>123456789 50000</code>`,{parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_back'}]]}});
    }
    if(data==='adm_give_sub'&&isAdmin(uid)) {
      setState(uid,{step:'adm_give_sub'});
      return bot.sendMessage(chatId,`➖ <b>Balans ayirish</b>\n\nFormat: <code>ID MIQDOR</code>`,{parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_back'}]]}});
    }

    if(data==='adm_search'&&isAdmin(uid)) {
      setState(uid,{step:'adm_search'});
      return bot.sendMessage(chatId,`🔍 Foydalanuvchi ID sini kiriting:`,{reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_back'}]]}});
    }

    if(data==='adm_msg_user'&&isAdmin(uid)) {
      setState(uid,{step:'adm_msg_user_id'});
      return bot.sendMessage(chatId,`💬 Foydalanuvchi ID sini kiriting:`,{reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_back'}]]}});
    }
    if(data==='adm_msg_skip_photo'&&isAdmin(uid)) {
      setState(uid,{...getState(uid),step:'adm_msg_user_text',msgPhoto:null});
      return bot.sendMessage(chatId,`✏️ Xabar matnini yozing:`,{reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_back'}]]}});
    }
    if(data==='adm_msg_confirm'&&isAdmin(uid)) {
      const state=getState(uid);
      if(!state.msgTargetId||!state.msgText) return;
      clearState(uid);
      try {
        if(state.msgPhoto) await bot.sendPhoto(state.msgTargetId,state.msgPhoto,{caption:state.msgText,parse_mode:'HTML'});
        else await bot.sendMessage(state.msgTargetId,state.msgText,{parse_mode:'HTML'});
        await bot.sendMessage(chatId,'✅ Xabar yuborildi!',{reply_markup:{inline_keyboard:[[{text:'🔙 Admin',callback_data:'adm_back'}]]}});
      } catch(e) {
        await bot.sendMessage(chatId,`❌ Xabar yuborilmadi: ${e.message}`,{reply_markup:{inline_keyboard:[[{text:'🔙 Admin',callback_data:'adm_back'}]]}});
      }
    }

    if(data==='adm_promos'&&isAdmin(uid)) {
      const promos=await getAllPromos();
      let text=promos.length?`🎟 <b>Promokodlar (${promos.length} ta):</b>\n\n`:"🎟 Hali promokodlar yo'q.\n";
      promos.forEach(p=>{
        const expired=p.expires_at&&new Date()>new Date(p.expires_at);
        text+=`${expired?'⏰':p.is_active?'✅':'❌'} <code>${p.code}</code> — <b>${fmt(p.amount||0)}</b> | ${p.usedBy.length}/${p.maxUses}\n`;
      });
      return bot.editMessageText(text,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[
        [{text:"➕ Qo'shish",callback_data:'adm_add_promo'},{text:"🗑 O'chirish",callback_data:'adm_del_promo'}],
        [{text:'🔙 Admin',callback_data:'adm_back'}]
      ]}});
    }
    if(data==='adm_add_promo'&&isAdmin(uid)) {
      setState(uid,{step:'adm_promo_code',promoData:{}});
      return bot.sendMessage(chatId,`🎟 <b>Yangi promokod</b>\n\n1️⃣ Kod yozing (masalan: <code>BONUS</code>)\n⏰ 12 soatdan keyin avtomatik o'chadi`,{parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_promos'}]]}});
    }
    if(data==='adm_del_promo'&&isAdmin(uid)) {
      setState(uid,{step:'adm_del_promo'});
      return bot.sendMessage(chatId,`🗑 O'chirilishi kerak bo'lgan promokod kodini yozing:`,{reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_promos'}]]}});
    }

    if(data.startsWith('adm_promo_uses_')&&isAdmin(uid)) {
      const val=data.replace('adm_promo_uses_','');
      const state=getState(uid);
      if(val==='custom') {
        setState(uid,{...state,step:'adm_promo_maxuses'});
        return bot.sendMessage(chatId,`✏️ Nechta odam ishlatsin? Raqam yozing:`,{reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_promos'}]]}});
      }
      const maxUses=parseInt(val); const pd=state.promoData;
      await createPromo(pd.code,pd.amount,maxUses);
      clearState(uid);
      return bot.sendMessage(chatId,`✅ <b>Promokod yaratildi!</b>\n\n🎟 Kod: <code>${pd.code}</code>\n💸 Bonus: <b>${fmt(pd.amount)}</b>\n👥 Limit: <b>${maxUses} ta odam</b>`,{parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'🎟 Promokodlar',callback_data:'adm_promos'}]]}});
    }

    if(data==='adm_broadcast'&&isAdmin(uid)) {
      setState(uid,{step:'adm_broadcast'});
      return bot.sendMessage(chatId,`📢 Avval rasm yuboring yoki o'tkazib yuboring:`,{reply_markup:{inline_keyboard:[
        [{text:"🚫 Rasmni o'tkazib yuborish",callback_data:'adm_broadcast_skip_photo'}],
        [{text:'❌ Bekor',callback_data:'adm_back'}]
      ]}});
    }
    if(data==='adm_broadcast_skip_photo'&&isAdmin(uid)) {
      setState(uid,{...getState(uid),step:'adm_broadcast_text',broadPhoto:null});
      return bot.sendMessage(chatId,`✏️ Matn kiriting:`,{reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_back'}]]}});
    }

    if(data.startsWith('adm_ok_')&&isAdmin(uid)) {
      const req=await approveTopup(parseInt(data.replace('adm_ok_','')),uid);
      if(!req) return;
      const newBal=await getBalance(req.telegram_id);
      try {
        if(message.photo||message.document) await bot.editMessageCaption((message.caption||'')+'\n\n✅ <b>TASDIQLANDI</b>',{chat_id:chatId,message_id:msgId,parse_mode:'HTML'});
        else await bot.editMessageText((message.text||'')+'\n\n✅ <b>TASDIQLANDI</b>',{chat_id:chatId,message_id:msgId,parse_mode:'HTML'});
      } catch(e){}
      await bot.sendMessage(req.telegram_id,`✅ <b>Hisobingiz to'ldirildi!</b>\n\n💰 Qo'shildi: <b>${fmt(req.amount)}</b>\n💳 Balans: <b>${fmt(newBal)}</b>\n\nXarid qilishingiz mumkin! 🎮`,{parse_mode:'HTML',reply_markup:mainKeyboard()});
    }

    if(data.startsWith('adm_no_')&&isAdmin(uid)) {
      setState(uid,{step:'adm_reject',rejectId:parseInt(data.replace('adm_no_',''))});
      return bot.sendMessage(chatId,`❌ Rad etish sababini yozing:`);
    }

    if(data.startsWith('adm_done_')&&isAdmin(uid)) {
      const orderId=parseInt(data.replace('adm_done_',''));
      const order=await getOrder(orderId);
      if(!order) return;
      await completeOrder(orderId);
      try { await bot.editMessageText((message.text||'')+'\n\n✅ <b>BAJARILDI</b>',{chat_id:chatId,message_id:msgId,parse_mode:'HTML'}); } catch(e){}
      const g=gameInfo(order.product_type);
      await bot.sendMessage(order.telegram_id,`✅ <b>Buyurtmangiz bajarildi!</b>\n\n📦 #${orderId}\n${g.emoji} ${g.name}: <b>${order.product_name}</b>\n🆔 ID: <code>${order.game_id}</code>\n\nO'yiningizni tekshiring! 🎮\nRahmat! ❤️`,{parse_mode:'HTML',reply_markup:mainKeyboard()});
    }

    if(data.startsWith('adm_cancel_')&&isAdmin(uid)) {
      const orderId=parseInt(data.replace('adm_cancel_',''));
      const order=await getOrder(orderId);
      if(!order) return;
      await addBalance(order.telegram_id,order.price,`Buyurtma #${orderId} bekor — pul qaytarildi`);
      await cancelOrder(orderId);
      try { await bot.editMessageText((message.text||'')+'\n\n❌ <b>BEKOR QILINDI — pul qaytarildi</b>',{chat_id:chatId,message_id:msgId,parse_mode:'HTML'}); } catch(e){}
      await bot.sendMessage(order.telegram_id,`⚠️ <b>Buyurtma bekor qilindi</b>\n\n📦 #${orderId}\n💰 Pul qaytarildi: <b>${fmt(order.price)}</b>`,{parse_mode:'HTML',reply_markup:mainKeyboard()});
    }

    // ========================
    // TURNIR CALLBACKS
    // ========================
    if(data==='turnir_list') {
      const tournaments=await getAllTournaments();
      if(!tournaments.length) return bot.editMessageText(`🏆 <b>Turnirlar</b>\n\nHozircha faol turnirlar yo'q.`,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'🔙 Orqaga',callback_data:'back_main'}]]}});
      const btns=tournaments.map(t=>[{text:`🏆 ${t.name} — ${fmt(t.entry_fee)}`, callback_data:`turnir_view_${t.id}`}]);
      btns.push([{text:'🔙 Orqaga',callback_data:'back_main'}]);
      return bot.editMessageText(`🏆 <b>Faol turnirlar</b>\n\nTurnirni tanlang:`,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:btns}});
    }

    if(data.startsWith('turnir_view_')) {
      const tid2=parseInt(data.replace('turnir_view_',''));
      const t=await getTournament(tid2); if(!t) return;
      const alreadyJoined=t.participants.find(p=>p.telegram_id===uid);
      const slotsLeft=t.slots-t.participants.length;
      const mapEmoji={Erangel:'🟢',Sanhok:'🌴',Miramar:'🏜',Livik:'🏝'}[t.map]||'🗺';
      const modeEmoji={Solo:'👤',Duo:'👥',Squad:'👨‍👩‍👧‍👦'}[t.mode]||'🎮';
      let text=`🏆 <b>${t.name}</b>\n\n📅 Sana: <b>${t.day} ${MONTHS[t.month-1]}</b>\n⏰ Soat: <b>${t.time}</b>\n${mapEmoji} Xarita: <b>${t.map}</b>\n${modeEmoji} Rejim: <b>${t.mode}</b>\n💰 Kirish narxi: <b>${fmt(t.entry_fee)}</b>\n🎯 Slotlar: <b>${t.participants.length}/${t.slots}</b>\n📊 Bo'sh joy: <b>${slotsLeft>0?slotsLeft+' ta':"❌ To'ldi"}</b>`;
      const btns=[];
      if(alreadyJoined) btns.push([{text:"✅ Qo'shilgansiz!",callback_data:'noop'}]);
      else if(slotsLeft>0&&t.is_active) btns.push([{text:"🎮 Turnirga qo'shilish",callback_data:`turnir_join_${tid2}`}]);
      else btns.push([{text:"❌ Turnir to'ldi",callback_data:'noop'}]);
      btns.push([{text:'🔙 Turnirlar',callback_data:'turnir_list'}]);
      return bot.editMessageText(text,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:btns}});
    }

    if(data.startsWith('turnir_join_')) {
      const tid2=parseInt(data.replace('turnir_join_',''));
      const t=await getTournament(tid2); if(!t) return;
      const bal=await getBalance(uid);
      if(bal<t.entry_fee) {
        return bot.editMessageText(`❌ <b>Balans yetarli emas!</b>\n\n💰 Kirish narxi: <b>${fmt(t.entry_fee)}</b>\n💳 Balansingiz: <b>${fmt(bal)}</b>`,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:"💰 Hisobni to'ldirish",callback_data:'topup_menu'}],[{text:'🔙 Orqaga',callback_data:`turnir_view_${tid2}`}]]}});
      }
      setState(uid,{step:'turnir_enter_id',joinTournamentId:tid2});
      return bot.sendMessage(chatId,`🏆 <b>${t.name}</b> ga qo'shilish\n\n🆔 PUBG Mobile ID ingizni kiriting:`,{parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:`turnir_view_${tid2}`}]]}});
    }

    if(data.startsWith('turnir_confirm_')) {
      const tid2=parseInt(data.replace('turnir_confirm_',''));
      const state=getState(uid); if(!state.turnirGameId) return;
      const result=await joinTournament(tid2,uid,state.turnirGameId,state.turnirNick||'-');
      clearState(uid);
      if(!result.ok) return bot.sendMessage(chatId,result.msg,{parse_mode:'HTML',reply_markup:mainKeyboard()});
      const t=await getTournament(tid2);
      return bot.editMessageText(`✅ <b>Turnirga muvaffaqiyatli qo'shildingiz!</b>\n\n🏆 ${t?.name||'Turnir'}\n🆔 ID: <code>${state.turnirGameId}</code>\n👤 Nik: <b>${state.turnirNick||'-'}</b>\n💰 Yechildi: <b>${fmt(t?.entry_fee||0)}</b>\n💳 Qolgan balans: <b>${fmt(await getBalance(uid))}</b>`,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'👤 Mening turnirlarim',callback_data:'my_tournaments'}],[{text:'🏠 Bosh menyu',callback_data:'back_main'}]]}});
    }

    if(data==='my_tournaments') {
      const myT=await getUserTournaments(uid);
      if(!myT.length) return bot.editMessageText(`🏆 <b>Mening turnirlarim</b>\n\nSiz hali hech qaysi turnirga qo'shilmadingiz.`,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'🏆 Turnirlar',callback_data:'turnir_list'}],[{text:'🔙 Orqaga',callback_data:'back_main'}]]}});
      let text=`🏆 <b>Mening turnirlarim:</b>\n\n`;
      myT.forEach((t,i)=>{const me=t.participants.find(p=>p.telegram_id===uid);text+=`${i+1}. 🏆 <b>${t.name}</b>\n   📅 ${t.day} ${MONTHS[t.month-1]} | ⏰ ${t.time}\n   🆔 ID: <code>${me?.game_id||'-'}</code> | 👤 ${me?.game_nick||'-'}\n\n`;});
      return bot.editMessageText(text,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'🏆 Turnirlar',callback_data:'turnir_list'}],[{text:'🔙 Orqaga',callback_data:'back_main'}]]}});
    }

    if(data==='noop') return;

    if(data==='adm_tournaments'&&isAdmin(uid)) {
      return bot.editMessageText(`🏆 <b>Turnirlarni boshqarish</b>`,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[
        [{text:"➕ Turnir qo'shish",callback_data:'adm_t_add'}],
        [{text:'✏️ Turnir tahrirlash',callback_data:'adm_t_edit'},{text:"🗑 Turnir o'chirish",callback_data:'adm_t_delete'}],
        [{text:'📋 Barcha turnirlar',callback_data:'adm_t_list'}],
        [{text:'🔙 Admin',callback_data:'adm_back'}]
      ]}});
    }

    if(data==='adm_t_list'&&isAdmin(uid)) {
      const all=await db.collection('tournaments').find({}).toArray();
      if(!all.length) return bot.editMessageText("🏆 Hali turnirlar yo'q.",{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'🔙 Orqaga',callback_data:'adm_tournaments'}]]}});
      let text=`📋 <b>Barcha turnirlar:</b>\n\n`;
      all.forEach(t=>{text+=`${t.is_active?'✅':'❌'} #${t.id} <b>${t.name}</b> — ${fmt(t.entry_fee)} | ${t.participants.length}/${t.slots}\n`;});
      return bot.editMessageText(text,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'🔙 Orqaga',callback_data:'adm_tournaments'}]]}});
    }

    if(data==='adm_t_add'&&isAdmin(uid)) {
      setState(uid,{step:'adm_t_month',tData:{}});
      const monthBtns=[];
      for(let i=0;i<12;i+=3){const row=[];for(let j=i;j<i+3&&j<12;j++) row.push({text:MONTHS[j],callback_data:`adm_t_setmonth_${j+1}`});monthBtns.push(row);}
      monthBtns.push([{text:'❌ Bekor',callback_data:'adm_tournaments'}]);
      return bot.editMessageText(`🏆 <b>Yangi turnir qo'shish</b>\n\n1️⃣ Qaysi oyga?`,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:monthBtns}});
    }

    if(data.startsWith('adm_t_setmonth_')&&isAdmin(uid)) {
      const month=parseInt(data.replace('adm_t_setmonth_',''));
      const state=getState(uid); setState(uid,{...state,tData:{...state.tData,month},step:'adm_t_day'});
      const dayBtns=[];
      for(let i=1;i<=31;i+=7){const row=[];for(let j=i;j<i+7&&j<=31;j++) row.push({text:String(j),callback_data:`adm_t_setday_${j}`});dayBtns.push(row);}
      dayBtns.push([{text:'❌ Bekor',callback_data:'adm_tournaments'}]);
      return bot.editMessageText(`✅ Oy: <b>${MONTHS[month-1]}</b>\n\n2️⃣ Qaysi kun?`,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:dayBtns}});
    }

    if(data.startsWith('adm_t_setday_')&&isAdmin(uid)) {
      const day=parseInt(data.replace('adm_t_setday_',''));
      const state=getState(uid); setState(uid,{...state,tData:{...state.tData,day},step:'adm_t_time'});
      return bot.editMessageText(`✅ Sana: <b>${day} ${MONTHS[state.tData.month-1]}</b>\n\n3️⃣ Soat nechida? (Masalan: <code>14:00</code>)`,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_tournaments'}]]}});
    }

    if(data.startsWith('adm_t_setmap_')&&isAdmin(uid)) {
      const map=data.replace('adm_t_setmap_','');
      const state=getState(uid); setState(uid,{...state,tData:{...state.tData,map},step:'adm_t_mode'});
      return bot.editMessageText(`✅ Xarita: <b>${map}</b>\n\n6️⃣ Rejim?`,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[MODE_NAMES.map(m=>({text:m,callback_data:`adm_t_setmode_${m}`})),[{text:'❌ Bekor',callback_data:'adm_tournaments'}]]}});
    }

    if(data.startsWith('adm_t_setmode_')&&isAdmin(uid)) {
      const mode=data.replace('adm_t_setmode_','');
      const state=getState(uid); setState(uid,{...state,tData:{...state.tData,mode},step:'adm_t_fee'});
      return bot.editMessageText(`✅ Rejim: <b>${mode}</b>\n\n7️⃣ Kirish narxi (so'mda)?`,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_tournaments'}]]}});
    }

    if(data==='adm_t_edit'&&isAdmin(uid)) {
      setState(uid,{step:'adm_t_edit_id'});
      return bot.sendMessage(chatId,`✏️ Tahrirlash kerak bo'lgan turnir ID sini kiriting:`,{reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_tournaments'}]]}});
    }
    if(data==='adm_t_delete'&&isAdmin(uid)) {
      setState(uid,{step:'adm_t_delete_id'});
      return bot.sendMessage(chatId,`🗑 O'chirilishi kerak bo'lgan turnir ID sini kiriting:`,{reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_tournaments'}]]}});
    }
    if(data.startsWith('adm_t_confirm_del_')&&isAdmin(uid)) {
      const tid2=parseInt(data.replace('adm_t_confirm_del_',''));
      await deleteTournament(tid2); clearState(uid);
      return bot.editMessageText("✅ Turnir o'chirildi.",{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'🔙 Turnirlar',callback_data:'adm_tournaments'}]]}});
    }

  } catch(err) { console.error('Callback xato:',err.message); }
});

// ========================
// MESSAGE HANDLER
// ========================
bot.on('message', async (msg) => {
  const {chat,from,text,photo,document} = msg;
  const uid=from.id, chatId=chat.id, state=getState(uid);
  if(text&&text.startsWith('/')) return;

  if(!isAdmin(uid)) {
    const ok=await isSubscribed(uid);
    if(!ok) return sendSubRequired(chatId);
  }

  try {
    if(text&&CAT_BTNS[text]) {
      clearState(uid); const type=CAT_BTNS[text]; const g=gameInfo(type);
      return bot.sendMessage(chatId,`${g.emoji} <b>${g.name}</b>\n\nPaket tanlang:`,{parse_mode:'HTML',reply_markup:productsMenu(await getProducts(type))});
    }

    if(text===BTN_TOPUP) {
      clearState(uid);
      return bot.sendMessage(chatId,`💰 <b>Hisobni to'ldirish</b>\n\n📌 Minimum: 5,000 so'm | Maksimum: 150,000 so'm`,{parse_mode:'HTML',reply_markup:topupMenu()});
    }

    if(text===BTN_ACCOUNT) {
      clearState(uid);
      const user=await getOrCreateUser(uid,from.username,[from.first_name,from.last_name].filter(Boolean).join(' '));
      const txs=await getLastTxs(uid);
      const txText=txs.length?'\n\n📋 <b>So\'nggi operatsiyalar:</b>\n'+txs.map(t=>`${t.amount>0?'+':''}${fmt(Math.abs(t.amount))} — ${t.description}`).join('\n'):'';
      return bot.sendMessage(chatId,`👤 <b>Mening hisobim</b>\n\n🆔 ID: <code>${uid}</code>\n👤 Ism: <b>${user.full_name||"Noma'lum"}</b>\n💰 Balans: <b>${fmt(user.balance)}</b>\n💸 Jami sarflangan: <b>${fmt(user.total_spent)}</b>`+txText,{parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:"💰 To'ldirish",callback_data:'topup_menu'}]]}});
    }

    if(text===BTN_ORDERS) {
      clearState(uid);
      const orders=await getUserOrders(uid);
      if(!orders.length) return bot.sendMessage(chatId,"📋 Hali buyurtmalar yo'q.");
      let t=`📋 <b>Buyurtmalarim</b>\n\n`;
      orders.forEach((o,i)=>{const s=o.status==='completed'?'✅':o.status==='pending'?'⏳':'❌';const g=gameInfo(o.product_type);t+=`${i+1}. #${o.id} ${s} ${g.emoji} <b>${o.product_name}</b> — ${fmt(o.price)}\n`;});
      return bot.sendMessage(chatId,t,{parse_mode:'HTML'});
    }

    if(text===BTN_PROMO) {
      clearState(uid);
      return bot.sendMessage(chatId,`🎟 <b>Promokod</b>\n\nQuyidagilardan birini tanlang:`,{parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'🎟 Promokod kiritish',callback_data:'promo_enter'}],[{text:'🎁 Promokod olish',callback_data:'promo_get'}]]}});
    }

    if(text===BTN_HISOB) {
      clearState(uid);
      const balance=await getBalance(uid);
      return bot.sendMessage(chatId,`💸 <b>Pul ishlash</b>\n\n💰 Balansingiz: <b>${fmt(balance)}</b>\n\nDo'stlaringizni taklif qiling va har bir do'stingiz uchun <b>250 so'm</b> oling!\n\n🔗 Sizning referal havolangiz:\n<code>https://t.me/${process.env.BOT_USERNAME||''}?start=ref_${uid}</code>`,{parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'🔙 Orqaga',callback_data:'back_main'}]]}});
    }

    if(text===BTN_SUPPORT) {
      clearState(uid);
      return bot.sendMessage(chatId,`📞 <b>Yordam</b>\n\n👨‍💼 Admin: @ismoiljo_n\n⏰ Ish vaqti: 09:00 - 22:00`,{parse_mode:'HTML'});
    }

    if(text===BTN_TURNIR) {
      clearState(uid);
      const tournaments=await getAllTournaments();
      const myT=await getUserTournaments(uid);
      let wt=`🏆 <b>Turnir</b>\n\nAssalomu alaykum, <b>${from.first_name}</b>!\n\n📌 <b>Qanday ishlaydi:</b>\n1️⃣ Turnirni tanlang\n2️⃣ Kirish narxini to'lang\n3️⃣ ID va nikingizni kiriting\n4️⃣ Turnir sanasida qatnashing!\n\n🎯 Faol turnirlar: <b>${tournaments.length} ta</b>`;
      const btns=[];
      if(tournaments.length) btns.push([{text:'🏆 Turnirlar',callback_data:'turnir_list'}]);
      if(myT.length) btns.push([{text:'👤 Mening turnirlarim',callback_data:'my_tournaments'}]);
      btns.push([{text:'🔙 Orqaga',callback_data:'back_main'}]);
      return bot.sendMessage(chatId,wt,{parse_mode:'HTML',reply_markup:{inline_keyboard:btns}});
    }

    // STATE HANDLERS
    if(state.step==='enter_promo') {
      if(!text) return;
      const code=text.trim().toUpperCase();
      const chk=await checkPromo(code,uid);
      if(!chk.ok) return bot.sendMessage(chatId,chk.msg,{parse_mode:'HTML'});
      await markPromoUsed(code,uid);
      await addBalance(uid,chk.promo.amount,`🎟 Promokod: ${code}`);
      const newBal=await getBalance(uid);
      clearState(uid);
      return bot.sendMessage(chatId,`🎉 <b>Promokod ishlatildi!</b>\n\n🎟 Kod: <code>${code}</code>\n💸 Qo'shildi: <b>${fmt(chk.promo.amount)}</b>\n💳 Yangi balans: <b>${fmt(newBal)}</b>`,{parse_mode:'HTML',reply_markup:mainKeyboard()});
    }

    if(state.step==='enter_id') {
      if(!text) return bot.sendMessage(chatId,'⚠️ Matn kiriting!');
      const product=await getProductById(state.selectedProduct); if(!product) return;
      let cleanId=text.trim().replace(/\s+/g,'');
      if(!/^\d+$/.test(cleanId)) return bot.sendMessage(chatId,`❌ Faqat raqamlar kiriting!\nMasalan: <code>512345678</code>`,{parse_mode:'HTML'});
      if(cleanId.length>15) return bot.sendMessage(chatId,'❌ ID maksimum 15 ta raqam!');
      setState(uid,{gameId:cleanId,step:'enter_nick'});
      return bot.sendMessage(chatId,`✅ ID: <code>${cleanId}</code>\n\n👤 Endi <b>nikneymingizni</b> yozing:`,{parse_mode:'HTML',reply_markup:cancelBtn()});
    }

    if(state.step==='enter_nick') {
      if(!text||text.trim().length<2) return bot.sendMessage(chatId,"⚠️ Nikneym noto'g'ri!");
      const nik=text.trim().slice(0,30);
      const product=await getProductById(state.selectedProduct); if(!product) return;
      const g=gameInfo(product.type);
      const finalPrice=(state.finalPrice!==undefined&&state.finalPrice!==null)?state.finalPrice:product.price;
      setState(uid,{gameNick:nik,step:'confirm_step'});
      return bot.sendMessage(chatId,`📋 <b>Buyurtma ma'lumotlari:</b>\n\n${g.emoji} <b>${g.name} — ${product.name}</b>\n🆔 ID: <code>${state.gameId}</code>\n👤 Nik: <b>${nik}</b>\n💰 Narx: <b>${fmt(finalPrice)}</b>\n\nTasdiqlaysizmi?`,{parse_mode:'HTML',reply_markup:confirmBtn(state.selectedProduct)});
    }

    if(state.step==='enter_amount') {
      if(!text) return;
      const amount=parseInt(text.replace(/[\s,]/g,''));
      if(isNaN(amount)||amount<5000) return bot.sendMessage(chatId,"❌ Minimum 5,000 so'm!");
      if(amount>150000) return bot.sendMessage(chatId,"❌ Maksimum 150,000 so'm!");
      setState(uid,{step:'send_receipt',topupAmount:amount});
      return sendPayment(chatId,null,amount,false);
    }

    if(state.step==='send_receipt') {
      const amount=state.topupAmount; if(!amount) return;
      let fileId=null,fileType=null;
      if(photo) { fileId=photo[photo.length-1].file_id; fileType='photo'; }
      else if(document) { fileId=document.file_id; fileType='document'; }
      if(!fileId) return bot.sendMessage(chatId,`📸 Chekni <b>rasm yoki fayl</b> sifatida yuboring!`,{parse_mode:'HTML'});
      const reqId=await createTopupReq(uid,amount,fileId,fileType);
      clearState(uid);
      await bot.sendMessage(chatId,`✅ <b>Chek qabul qilindi!</b>\n\n📋 So'rov #${reqId}\n💰 <b>${fmt(amount)}</b>\n\n⏳ Admin tasdig'ini kuting (5-30 daqiqa)`,{parse_mode:'HTML',reply_markup:mainKeyboard()});
      const user=await getUser(uid);
      const name=user?.username?`@${user.username}`:(user?.full_name||`ID: ${uid}`);
      const cap=`💰 <b>Yangi to'ldirish #${reqId}</b>\n\n👤 ${name} (${uid})\n💰 <b>${fmt(amount)}</b>`;
      for(const adminId of ADMIN_IDS) {
        try {
          if(fileType==='photo') await bot.sendPhoto(adminId,fileId,{caption:cap,parse_mode:'HTML',reply_markup:atmBtn(reqId)});
          else await bot.sendDocument(adminId,fileId,{caption:cap,parse_mode:'HTML',reply_markup:atmBtn(reqId)});
        } catch(e) { console.error('Admin xabar:',e.message); }
      }
    }

    if(state.step==='adm_give_add'&&isAdmin(uid)) {
      if(!text) return;
      const parts=text.trim().split(/\s+/);
      if(parts.length<2) return bot.sendMessage(chatId,'❌ Format: <code>ID MIQDOR</code>',{parse_mode:'HTML'});
      const targetId=parseInt(parts[0]); const amount=parseInt(parts[1]);
      if(isNaN(targetId)||isNaN(amount)||amount<=0) return bot.sendMessage(chatId,"❌ Noto'g'ri format!");
      const tu=await getUser(targetId);
      if(!tu) return bot.sendMessage(chatId,`❌ Foydalanuvchi topilmadi: ${targetId}`);
      await addBalance(targetId,amount,"Admin tomonidan qo'shildi");
      clearState(uid);
      const newBal=await getBalance(targetId);
      const tName=tu.username?`@${tu.username}`:(tu.full_name||`ID: ${targetId}`);
      await bot.sendMessage(chatId,`✅ ${tName} ga <b>${fmt(amount)}</b> qo'shildi.\nYangi balans: <b>${fmt(newBal)}</b>`,{parse_mode:'HTML'});
      await bot.sendMessage(targetId,`💳 <b>Hisobingizga ${fmt(amount)} qo'shildi!</b>\n\nYangi balans: <b>${fmt(newBal)}</b>`,{parse_mode:'HTML',reply_markup:mainKeyboard()}).catch(()=>{});
    }

    if(state.step==='adm_give_sub'&&isAdmin(uid)) {
      if(!text) return;
      const parts=text.trim().split(/\s+/);
      if(parts.length<2) return bot.sendMessage(chatId,'❌ Format: <code>ID MIQDOR</code>',{parse_mode:'HTML'});
      const targetId=parseInt(parts[0]); const amount=parseInt(parts[1]);
      if(isNaN(targetId)||isNaN(amount)||amount<=0) return bot.sendMessage(chatId,"❌ Noto'g'ri format!");
      const tu=await getUser(targetId);
      if(!tu) return bot.sendMessage(chatId,`❌ Foydalanuvchi topilmadi: ${targetId}`);
      const deducted=await deductBalance(targetId,amount,'Admin tomonidan ayirildi');
      clearState(uid);
      if(!deducted) return bot.sendMessage(chatId,`❌ Balans yetarli emas! Foydalanuvchi balansi: ${fmt(tu.balance)}`);
      const newBal=await getBalance(targetId);
      const tName=tu.username?`@${tu.username}`:(tu.full_name||`ID: ${targetId}`);
      await bot.sendMessage(chatId,`✅ ${tName} dan <b>${fmt(amount)}</b> ayirildi. Yangi balans: <b>${fmt(newBal)}</b>`,{parse_mode:'HTML'});
      await bot.sendMessage(targetId,`⚠️ <b>Hisobingizdan ${fmt(amount)} ayirildi.</b>\n\nYangi balans: <b>${fmt(newBal)}</b>`,{parse_mode:'HTML',reply_markup:mainKeyboard()}).catch(()=>{});
    }

    if(state.step==='adm_search'&&isAdmin(uid)) {
      if(!text) return;
      const targetId=parseInt(text.trim());
      if(isNaN(targetId)) return bot.sendMessage(chatId,'❌ Faqat ID raqam kiriting!');
      const tu=await getUser(targetId); clearState(uid);
      if(!tu) return bot.sendMessage(chatId,`❌ Foydalanuvchi topilmadi: <code>${targetId}</code>`,{parse_mode:'HTML'});
      const txs=await db.collection('transactions').find({telegram_id:targetId}).sort({created_at:-1}).limit(5).toArray();
      const orders=await getUserOrders(targetId);
      let infoText=`🔍 <b>Foydalanuvchi ma'lumotlari</b>\n\n👤 Ism: <b>${tu.full_name||'Nomaʼlum'}</b>\n🔖 Username: ${tu.username?`@${tu.username}`:'Yoʼq'}\n🆔 ID: <code>${tu.telegram_id}</code>\n💰 Balans: <b>${fmt(tu.balance)}</b>\n💸 Jami sarflagan: <b>${fmt(tu.total_spent)}</b>\n📅 Qoʼshilgan: ${new Date(tu.joined_at).toLocaleDateString('uz')}\n`;
      if(orders.length){infoText+=`\n📦 <b>Soʼnggi buyurtmalar:</b>\n`;orders.slice(0,5).forEach(o=>{const s=o.status==='completed'?'✅':o.status==='pending'?'⏳':'❌';infoText+=`${s} #${o.id} ${o.product_name} — ${fmt(o.price)}\n`;});}
      if(txs.length){infoText+=`\n💳 <b>Soʼnggi tranzaksiyalar:</b>\n`;txs.forEach(t=>{infoText+=`${t.amount>0?'+':''}${fmt(Math.abs(t.amount))} — ${t.description}\n`;});}
      return bot.sendMessage(chatId,infoText,{parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'🔙 Admin',callback_data:'adm_back'}]]}});
    }

    if(state.step==='adm_msg_user_id'&&isAdmin(uid)) {
      if(!text) return;
      const targetId=parseInt(text.trim());
      if(isNaN(targetId)) return bot.sendMessage(chatId,'❌ Faqat ID kiriting!');
      const tu=await getUser(targetId);
      if(!tu) return bot.sendMessage(chatId,`❌ Foydalanuvchi topilmadi: ${targetId}`);
      setState(uid,{...state,step:'adm_msg_user_photo',msgTargetId:targetId});
      const tName=tu.username?`@${tu.username}`:(tu.full_name||`ID: ${targetId}`);
      return bot.sendMessage(chatId,`👤 Foydalanuvchi: <b>${tName}</b>\n\nRasm yuboring (ixtiyoriy):`,{parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:"🚫 Rasmni o'tkazib yuborish",callback_data:'adm_msg_skip_photo'}],[{text:'❌ Bekor',callback_data:'adm_back'}]]}});
    }
    if(state.step==='adm_msg_user_photo'&&isAdmin(uid)) {
      if(photo) {
        setState(uid,{...state,step:'adm_msg_user_text',msgPhoto:photo[photo.length-1].file_id});
        return bot.sendMessage(chatId,'✅ Rasm qabul qilindi!\n\nEndi matnni kiriting:',{reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_back'}]]}});
      }
    }
    if(state.step==='adm_msg_user_text'&&isAdmin(uid)) {
      if(!text) return;
      setState(uid,{...state,step:'adm_msg_confirm',msgText:text});
      return bot.sendMessage(chatId,`📋 <b>Xabar ko'rib chiqish:</b>\n\n${text}\n\n${state.msgPhoto?'📷 Rasm: bor':'📷 Rasm: yoq'}\n\nYuborasizmi?`,{parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'✅ Yuborish',callback_data:'adm_msg_confirm'},{text:'❌ Bekor',callback_data:'adm_back'}]]}});
    }

    if(state.step==='adm_reject'&&isAdmin(uid)) {
      const req=await rejectTopup(state.rejectId,uid,text);
      if(!req) return bot.sendMessage(chatId,'❌ Topilmadi!');
      clearState(uid);
      await bot.sendMessage(chatId,`✅ So'rov #${req.id} rad etildi.`);
      await bot.sendMessage(req.telegram_id,`❌ <b>To'ldirish rad etildi</b>\n\n📋 #${req.id} | 💰 ${fmt(req.amount)}\n\n📝 Sabab: <b>${text}</b>`,{parse_mode:'HTML',reply_markup:mainKeyboard()});
    }

    if(state.step==='adm_broadcast'&&isAdmin(uid)) {
      if(photo) {
        setState(uid,{...state,step:'adm_broadcast_text',broadPhoto:photo[photo.length-1].file_id});
        return bot.sendMessage(chatId,'✅ Rasm qabul qilindi!\n\nEndi matnni kiriting:',{reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_back'}]]}});
      }
    }
    if(state.step==='adm_broadcast_text'&&isAdmin(uid)) {
      if(!text) return;
      clearState(uid);
      const users=await getAllUsers(); let sent=0,failed=0;
      await bot.sendMessage(chatId,`📢 Yuborilmoqda... (${users.length} ta)`);
      for(const u of users) {
        try {
          if(state.broadPhoto) await bot.sendPhoto(u.telegram_id,state.broadPhoto,{caption:`📢 <b>Admin xabari:</b>\n\n${text}`,parse_mode:'HTML'});
          else await bot.sendMessage(u.telegram_id,`📢 <b>Admin xabari:</b>\n\n${text}`,{parse_mode:'HTML'});
          sent++; await new Promise(r=>setTimeout(r,50));
        } catch { failed++; }
      }
      return bot.sendMessage(chatId,`✅ Tugadi! Yuborildi: ${sent} | Xato: ${failed}`);
    }

    if(state.step==='adm_promo_code'&&isAdmin(uid)) {
      if(!text) return;
      const code=text.trim().toUpperCase().replace(/\s+/g,'');
      if(code.length<2||code.length>20) return bot.sendMessage(chatId,'❌ Kod 2-20 belgi bo\'lishi kerak!');
      if(await getPromo(code)) return bot.sendMessage(chatId,`❌ <b>${code}</b> allaqachon mavjud!`,{parse_mode:'HTML'});
      setState(uid,{step:'adm_promo_amount_text',promoData:{code}});
      return bot.sendMessage(chatId,`✅ Kod: <code>${code}</code>\n\n2️⃣ Necha so'm berilsin?`,{parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_promos'}]]}});
    }

    if(state.step==='adm_promo_amount_text'&&isAdmin(uid)) {
      if(!text) return;
      const amount=parseInt(text.trim().replace(/[\s,]/g,''));
      if(isNaN(amount)||amount<100) return bot.sendMessage(chatId,"❌ Minimum 100 so'm kiriting!");
      const state2=getState(uid);
      setState(uid,{...state2,promoData:{...state2.promoData,amount},step:'adm_promo_maxuses'});
      return bot.sendMessage(chatId,`✅ Bonus: <b>${fmt(amount)}</b>\n\n3️⃣ Nechta odam ishlatishi mumkin?`,{parse_mode:'HTML',reply_markup:{inline_keyboard:[
        [{text:'1 kishi',callback_data:'adm_promo_uses_1'},{text:'5 kishi',callback_data:'adm_promo_uses_5'},{text:'10 kishi',callback_data:'adm_promo_uses_10'}],
        [{text:'50 kishi',callback_data:'adm_promo_uses_50'},{text:'100 kishi',callback_data:'adm_promo_uses_100'},{text:"✏️ Boshqa",callback_data:'adm_promo_uses_custom'}],
        [{text:'❌ Bekor',callback_data:'adm_promos'}]
      ]}});
    }

    if(state.step==='adm_promo_maxuses'&&isAdmin(uid)) {
      if(!text) return;
      const maxUses=parseInt(text.trim());
      if(isNaN(maxUses)||maxUses<1) return bot.sendMessage(chatId,'❌ 1 dan katta raqam kiriting!');
      const state2=getState(uid); const pd=state2.promoData;
      await createPromo(pd.code,pd.amount,maxUses);
      clearState(uid);
      return bot.sendMessage(chatId,`✅ <b>Promokod yaratildi!</b>\n\n🎟 Kod: <code>${pd.code}</code>\n💸 Bonus: <b>${fmt(pd.amount)}</b>\n👥 Limit: <b>${maxUses} ta odam</b>`,{parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'🎟 Promokodlar',callback_data:'adm_promos'}]]}});
    }

    if(state.step==='adm_del_promo'&&isAdmin(uid)) {
      if(!text) return;
      const code=text.trim().toUpperCase(); clearState(uid);
      return bot.sendMessage(chatId,(await deletePromo(code))?`✅ <b>${code}</b> o'chirildi.`:`❌ <b>${code}</b> topilmadi.`,{parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'🎟 Promokodlar',callback_data:'adm_promos'}]]}});
    }

    if(state.step==='turnir_enter_id') {
      if(!text) return;
      let cleanId=text.trim().replace(/\s+/g,'');
      if(!/^\d+$/.test(cleanId)) return bot.sendMessage(chatId,'❌ Faqat raqamlar kiriting!');
      if(cleanId.length>15) return bot.sendMessage(chatId,'❌ ID maksimum 15 ta raqam!');
      setState(uid,{...state,turnirGameId:cleanId,step:'turnir_enter_nick'});
      return bot.sendMessage(chatId,`✅ ID: <code>${cleanId}</code>\n\n👤 Endi nikneymingizni yozing:`,{parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'back_main'}]]}});
    }

    if(state.step==='turnir_enter_nick') {
      if(!text||text.trim().length<2) return bot.sendMessage(chatId,"⚠️ Nikneym noto'g'ri!");
      const nik=text.trim().slice(0,30);
      const t=await getTournament(state.joinTournamentId);
      setState(uid,{...state,turnirNick:nik,step:'turnir_confirm'});
      return bot.sendMessage(chatId,`📋 <b>Turnirga qo'shilish:</b>\n\n🏆 ${t?.name||'Turnir'}\n🆔 ID: <code>${state.turnirGameId}</code>\n👤 Nik: <b>${nik}</b>\n💰 Kirish narxi: <b>${fmt(t?.entry_fee||0)}</b>\n\nTasdiqlaysizmi?`,{parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'✅ Tasdiqlash',callback_data:`turnir_confirm_${state.joinTournamentId}`},{text:'✏️ Tahrirlash',callback_data:`turnir_join_${state.joinTournamentId}`}]]}});
    }

    if(state.step==='adm_t_time'&&isAdmin(uid)) {
      if(!text) return;
      if(!/^\d{1,2}:\d{2}$/.test(text.trim())) return bot.sendMessage(chatId,'❌ Format xato! Masalan: <code>14:00</code>',{parse_mode:'HTML'});
      setState(uid,{...state,tData:{...state.tData,time:text.trim()},step:'adm_t_name'});
      return bot.sendMessage(chatId,`✅ Soat: <b>${text.trim()}</b>\n\n4️⃣ Turnir nomi nima?`,{parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_tournaments'}]]}});
    }

    if(state.step==='adm_t_name'&&isAdmin(uid)) {
      if(!text) return;
      setState(uid,{...state,tData:{...state.tData,name:text.trim()},step:'adm_t_map'});
      return bot.sendMessage(chatId,`✅ Nom: <b>${text.trim()}</b>\n\n5️⃣ Xarita?`,{parse_mode:'HTML',reply_markup:{inline_keyboard:[MAP_NAMES.map(m=>({text:m,callback_data:`adm_t_setmap_${m}`})),[{text:'❌ Bekor',callback_data:'adm_tournaments'}]]}});
    }

    if(state.step==='adm_t_fee'&&isAdmin(uid)) {
      if(!text) return;
      const fee=parseInt(text.trim().replace(/[\s,]/g,''));
      if(isNaN(fee)||fee<0) return bot.sendMessage(chatId,"❌ To'g'ri narx kiriting!");
      setState(uid,{...state,tData:{...state.tData,entry_fee:fee},step:'adm_t_slots'});
      return bot.sendMessage(chatId,`✅ Kirish narxi: <b>${fmt(fee)}</b>\n\n8️⃣ Necha slot?`,{parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_tournaments'}]]}});
    }

    if(state.step==='adm_t_slots'&&isAdmin(uid)) {
      if(!text) return;
      const slots=parseInt(text.trim());
      if(isNaN(slots)||slots<2) return bot.sendMessage(chatId,'❌ Kamida 2 slot kiriting!');
      const td=state.tData;
      const tid2=await createTournament({...td,slots});
      clearState(uid);
      return bot.sendMessage(chatId,`✅ <b>Turnir qo'shildi!</b>\n\n🏆 ${td.name}\n📅 ${td.day} ${MONTHS[td.month-1]} | ⏰ ${td.time}\n🗺 ${td.map} | 🎮 ${td.mode}\n💰 ${fmt(td.entry_fee)}\n🎯 Slotlar: ${slots}\n🆔 ID: <b>#${tid2}</b>`,{parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'🏆 Turnirlar',callback_data:'adm_tournaments'}]]}});
    }

    if(state.step==='adm_t_delete_id'&&isAdmin(uid)) {
      if(!text) return;
      const tid2=parseInt(text.trim());
      if(isNaN(tid2)) return bot.sendMessage(chatId,'❌ ID raqam kiriting!');
      const t=await getTournament(tid2); clearState(uid);
      if(!t) return bot.sendMessage(chatId,`❌ Turnir topilmadi: #${tid2}`,{reply_markup:{inline_keyboard:[[{text:'🔙 Orqaga',callback_data:'adm_tournaments'}]]}});
      return bot.sendMessage(chatId,`⚠️ <b>${t.name}</b> turnirini o'chirmoqchimisiz?\n\n👥 Qatnashchilar: ${t.participants.length} ta`,{parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:"🗑 Ha, o'chirish",callback_data:`adm_t_confirm_del_${tid2}`},{text:"❌ Yo'q",callback_data:'adm_tournaments'}]]}});
    }

    if(state.step==='adm_t_edit_id'&&isAdmin(uid)) {
      if(!text) return;
      const tid2=parseInt(text.trim());
      if(isNaN(tid2)) return bot.sendMessage(chatId,'❌ ID raqam kiriting!');
      const t=await getTournament(tid2); clearState(uid);
      if(!t) return bot.sendMessage(chatId,`❌ Turnir topilmadi: #${tid2}`);
      return bot.sendMessage(chatId,`✏️ <b>${t.name}</b>\n\nYangi nomini kiriting ("-" o'zgartirmaslik uchun):`,{parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_tournaments'}]]}});
    }

    if(text&&!state.step) {
      return bot.sendMessage(chatId,'🎮 <b>Game Shop</b>\n\n👇 Pastdagi menyudan tanlang:',{parse_mode:'HTML',reply_markup:mainKeyboard()});
    }

  } catch(err) { console.error('Message xato:',err.message); }
});

// ========================
// REFERRAL
// ========================
bot.onText(/\/start ref_(.+)/, async (msg, match) => {
  const from=msg.from;
  const referId=parseInt(match[1]);
  if(referId&&referId!==from.id) {
    const newUser=await getUser(from.id);
    const refUser=await getUser(referId);
    if(newUser&&refUser&&!newUser.referred_by) {
      await db.collection('users').updateOne({telegram_id:from.id},{$set:{referred_by:String(referId)}});
      await addBalance(referId,250,'Referal bonusi');
      await bot.sendMessage(referId,`🎉 Do'stingiz <b>${from.first_name}</b> siz orqali kirdi!\n💰 Hisobingizga <b>250 so'm</b> qo'shildi!`,{parse_mode:'HTML'}).catch(()=>{});
    }
  }
});

// ========================
// HTTP + ERROR
// ========================
bot.on('polling_error', err=>console.error('Polling:',err.message));
process.on('unhandledRejection', err=>console.error('Unhandled:',err));
http.createServer((req,res)=>{res.writeHead(200);res.end('Game Shop Bot ishlayapti! 🎮');}).listen(PORT,()=>console.log(`🌐 Port ${PORT}`));

// MongoDB ulanib, keyin botni ishga tushirish
connectDB().then(() => {
  console.log('🚀 Game Shop Bot ishga tushdi!');
  console.log(`👥 Adminlar: ${ADMIN_IDS.join(', ')}`);
}).catch(err => {
  console.error('❌ MongoDB ulanish xatosi:', err.message);
  process.exit(1);
});
