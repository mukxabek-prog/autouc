
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs   = require('fs');
const path = require('path');
const http = require('http');

// ========================
// CONFIG
// ========================
const BOT_TOKEN   = process.env.BOT_TOKEN;
const ADMIN_IDS   = (process.env.ADMIN_IDS || '').split(',').map(id => parseInt(id.trim())).filter(Boolean);
const PORT        = process.env.PORT || 3000;
const CHANNEL     = '@auto_uc';
const CHANNEL_URL = 'https://t.me/auto_uc';

if (!BOT_TOKEN) { console.error('❌ BOT_TOKEN topilmadi!'); process.exit(1); }

const bot        = new TelegramBot(BOT_TOKEN, { polling: true });
const userStates = {};

// ========================
// DATABASE
// ========================
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE  = path.join(DATA_DIR, 'db.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DEFAULT_DB = {
  users: {}, orders: [], topup_requests: [], transactions: [],
  next_order_id: 1, next_topup_id: 1, promocodes: {},
  tournaments: [], next_tournament_id: 1,
  products: {
    uc:         [
      {id:1,type:'uc',name:'60 UC',price:12500},
      {id:2,type:'uc',name:'325 UC',price:60000},
      {id:3,type:'uc',name:'660 UC',price:120000},
      {id:4,type:'uc',name:'1800 UC',price:290000},
      {id:5,type:'uc',name:'3850 UC',price:575000},
      {id:6,type:'uc',name:'8100 UC',price:1130000},
      {id:34,type:'uc',name:'16200 UC',price:2265000},
      {id:35,type:'uc',name:'24300 UC',price:3400000},
      {id:36,type:'uc',name:'32400 UC',price:4550000},
      {id:37,type:'uc',name:'40500 UC',price:5770000}
    ],
    popularity: [
      {id:7,type:'popularity',name:'20K PP',price:20000},
      {id:8,type:'popularity',name:'50K PP',price:50000},
      {id:9,type:'popularity',name:'100K PP',price:90000},
      {id:10,type:'popularity',name:'150K PP',price:140000},
      {id:38,type:'popularity',name:'200K PP',price:185000}
    ],
    diamond:    [
      {id:11,type:'diamond',name:'100 Diamond',price:12500},
      {id:12,type:'diamond',name:'210 Diamond',price:25000},
      {id:13,type:'diamond',name:'530 Diamond',price:63000},
      {id:14,type:'diamond',name:'1080 Diamond',price:127000},
      {id:15,type:'diamond',name:'2200 Diamond',price:250000},
      {id:16,type:'diamond',name:'4400 Diamond',price:500000}
    ],
    mlbb:       [
      {id:23,type:'mlbb',name:'56',price:12500},
      {id:24,type:'mlbb',name:'278',price:63000},
      {id:25,type:'mlbb',name:'1783',price:365000},
      {id:26,type:'mlbb',name:'3005',price:610000},
      {id:27,type:'mlbb',name:'4770',price:973000},
      {id:28,type:'mlbb',name:'6012',price:1225000}
    ]
  }
};

function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const d = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      for (const k of Object.keys(DEFAULT_DB.products)) if (!d.products[k]) d.products[k] = DEFAULT_DB.products[k];
      if (!d.promocodes) d.promocodes = {};
      if (!d.tournaments) d.tournaments = [];
      if (!d.next_tournament_id) d.next_tournament_id = 1;
      return d;
    }
  } catch(e) {}
  return JSON.parse(JSON.stringify(DEFAULT_DB));
}
function saveDB(d) { try { fs.writeFileSync(DB_FILE, JSON.stringify(d,null,2)); } catch(e) { console.error('DB xato:',e.message); } }

// USER
function getOrCreateUser(tid, username, fullName) {
  const d = loadDB(); const id = String(tid);
  if (!d.users[id]) {
    d.users[id] = {
      telegram_id: tid, username: username||null, full_name: fullName||null,
      balance: 0, total_spent: 0, joined_at: new Date().toISOString(),
      used_promos: []
    };
  } else {
    if(username) d.users[id].username = username;
    if(fullName) d.users[id].full_name = fullName;
    if(!d.users[id].used_promos) d.users[id].used_promos = [];
  }
  saveDB(d); return d.users[id];
}
function getUser(tid)    { const d=loadDB(); return d.users[String(tid)]||null; }
function getBalance(tid) { const u=getUser(tid); return u?u.balance:0; }
function getAllUsers()    { return Object.values(loadDB().users); }

function addBalance(tid, amount, desc) {
  const d=loadDB(); const id=String(tid); if(!d.users[id]) return;
  d.users[id].balance += amount;
  d.transactions.push({telegram_id:tid, type:'topup', amount, description:desc||"To'ldirish", created_at:new Date().toISOString()});
  saveDB(d);
}
function deductBalance(tid, amount, desc) {
  const d=loadDB(); const id=String(tid);
  if(!d.users[id]||d.users[id].balance<amount) return false;
  d.users[id].balance -= amount; d.users[id].total_spent += amount;
  d.transactions.push({telegram_id:tid, type:'purchase', amount:-amount, description:desc||'Xarid', created_at:new Date().toISOString()});
  saveDB(d); return true;
}
function getLastTxs(tid) {
  return loadDB().transactions.filter(t=>t.telegram_id===tid)
    .sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,5);
}

// TOPUP
function createTopupReq(tid, amount, fileId, fileType) {
  const d=loadDB(); const id=d.next_topup_id++;
  d.topup_requests.push({id, telegram_id:tid, amount, receipt_file_id:fileId, receipt_type:fileType, status:'pending', created_at:new Date().toISOString()});
  saveDB(d); return id;
}
function getPendingTopups() { return loadDB().topup_requests.filter(r=>r.status==='pending'); }
function approveTopup(id, adminId) {
  const d=loadDB(); const req=d.topup_requests.find(r=>r.id===parseInt(id));
  if(!req||req.status!=='pending') return false;
  req.status='approved'; req.reviewed_by=adminId; req.reviewed_at=new Date().toISOString();
  saveDB(d); addBalance(req.telegram_id, req.amount, `To'ldirish #${id} tasdiqlandi`); return req;
}
function rejectTopup(id, adminId, reason) {
  const d=loadDB(); const req=d.topup_requests.find(r=>r.id===parseInt(id));
  if(!req||req.status!=='pending') return false;
  req.status='rejected'; req.reviewed_by=adminId; req.reject_reason=reason||null; req.reviewed_at=new Date().toISOString();
  saveDB(d); return req;
}

// ORDERS
function createOrder(tid, type, name, price, origPrice, gameId, gameNick, promoUsed) {
  const d=loadDB(); const id=d.next_order_id++;
  d.orders.push({id, telegram_id:tid, product_type:type, product_name:name, price, original_price:origPrice,
    game_id:gameId, game_nick:gameNick||'-', promo_used:promoUsed||null, status:'pending',
    created_at:new Date().toISOString(), completed_at:null});
  saveDB(d); return id;
}
function getOrder(id)        { return loadDB().orders.find(o=>o.id===parseInt(id))||null; }
function getUserOrders(tid)  { return loadDB().orders.filter(o=>o.telegram_id===tid).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,10); }
function getAllOrders()       { return loadDB().orders.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,30); }
function completeOrder(id)   { const d=loadDB(); const o=d.orders.find(o=>o.id===parseInt(id)); if(o){o.status='completed';o.completed_at=new Date().toISOString();saveDB(d);} }
function cancelOrder(id)     { const d=loadDB(); const o=d.orders.find(o=>o.id===parseInt(id)); if(o){o.status='cancelled';saveDB(d);} }
function getProductById(id)  { return Object.values(loadDB().products).flat().find(p=>p.id===parseInt(id))||null; }
function getProducts(type)   { return loadDB().products[type]||[]; }
function getStats() {
  const d=loadDB(); const done=d.orders.filter(o=>o.status==='completed');
  return {
    users: Object.keys(d.users).length, orders: done.length,
    revenue: done.reduce((s,o)=>s+o.price,0),
    pendingTopups: d.topup_requests.filter(r=>r.status==='pending').length,
    pendingOrders: d.orders.filter(o=>o.status==='pending').length,
    totalPromos: Object.keys(d.promocodes).length,
    totalTournaments: (d.tournaments||[]).length
  };
}

// PROMOKODLAR
function createPromo(code, amount, maxUses) {
  const d=loadDB(); const k=code.toUpperCase();
  // 12 soatdan keyin auto o'chirish uchun expires_at
  const expiresAt = new Date(Date.now() + 12*60*60*1000).toISOString();
  d.promocodes[k] = {
    code:k, amount, maxUses:maxUses||1,
    usedBy:[], created_at:new Date().toISOString(),
    expires_at: expiresAt,
    is_active:true
  };
  saveDB(d); return d.promocodes[k];
}
function getPromo(code)   { return loadDB().promocodes[code.toUpperCase()]||null; }
function getAllPromos()    { return Object.values(loadDB().promocodes); }
function deletePromo(code){ const d=loadDB(); const k=code.toUpperCase(); if(d.promocodes[k]){delete d.promocodes[k];saveDB(d);return true;} return false; }
function markPromoUsed(code, tid) {
  const d=loadDB(); const k=code.toUpperCase();
  if(d.promocodes[k]) { d.promocodes[k].usedBy.push(String(tid)); saveDB(d); }
}
function checkPromo(code, tid) {
  const promo=getPromo(code);
  if(!promo)           return {ok:false, msg:'❌ Promokod topilmadi!'};
  if(!promo.is_active) return {ok:false, msg:'❌ Promokod faol emas!'};
  // Muddat tekshirish
  if(promo.expires_at && new Date() > new Date(promo.expires_at)) {
    // Auto o'chirish
    const d=loadDB(); if(d.promocodes[code.toUpperCase()]) { d.promocodes[code.toUpperCase()].is_active=false; saveDB(d); }
    return {ok:false, msg:'❌ Promokod muddati tugagan!'};
  }
  if(promo.usedBy.length>=promo.maxUses) return {ok:false, msg:'😔 Kechirasz, ulgurmadingiz! Promokod tugadi.'};
  if(promo.usedBy.map(String).includes(String(tid))) return {ok:false, msg:'❌ Siz bu promokodni allaqachon ishlatgansiz!'};
  return {ok:true, amount:promo.amount, promo};
}
// Auto muddati o'tgan promolarni tozalash
function cleanExpiredPromos() {
  const d=loadDB(); let changed=false;
  for(const k of Object.keys(d.promocodes)) {
    const p=d.promocodes[k];
    if(p.expires_at && new Date() > new Date(p.expires_at)) {
      d.promocodes[k].is_active=false; changed=true;
    }
  }
  if(changed) saveDB(d);
}
setInterval(cleanExpiredPromos, 30*60*1000); // har 30 daqiqada tekshirish

// TURNIRLAR
function createTournament(data) {
  const d=loadDB(); const id=d.next_tournament_id++;
  d.tournaments.push({
    id, ...data,
    participants: [], // [{telegram_id, game_id, game_nick}]
    is_active: true,
    created_at: new Date().toISOString()
  });
  saveDB(d); return id;
}
function getTournament(id)   { return loadDB().tournaments.find(t=>t.id===parseInt(id))||null; }
function getAllTournaments()  { return (loadDB().tournaments||[]).filter(t=>t.is_active); }
function updateTournament(id, data) {
  const d=loadDB(); const idx=d.tournaments.findIndex(t=>t.id===parseInt(id));
  if(idx===-1) return false;
  d.tournaments[idx]={...d.tournaments[idx],...data};
  saveDB(d); return true;
}
function deleteTournament(id) {
  const d=loadDB(); const idx=d.tournaments.findIndex(t=>t.id===parseInt(id));
  if(idx===-1) return false;
  d.tournaments[idx].is_active=false; saveDB(d); return true;
}
function joinTournament(tournamentId, userId, gameId, gameNick) {
  const d=loadDB(); const t=d.tournaments.find(t=>t.id===parseInt(tournamentId));
  if(!t||!t.is_active) return {ok:false,msg:'❌ Turnir topilmadi!'};
  if(t.participants.length >= t.slots) return {ok:false,msg:'❌ Turnir to\'ldi!'};
  if(t.participants.find(p=>p.telegram_id===userId)) return {ok:false,msg:'❌ Siz allaqachon bu turnirga qo\'shilgansiz!'};
  // Pul yechish
  const deducted = deductBalance(userId, t.entry_fee, `Turnir #${tournamentId} kirish`);
  if(!deducted) return {ok:false,msg:`❌ Balans yetarli emas! Kirish narxi: ${fmt(t.entry_fee)}`};
  t.participants.push({telegram_id:userId, game_id:gameId, game_nick:gameNick});
  // Slot to'lsa turnirni yopish
  if(t.participants.length >= t.slots) { t.is_active=false; }
  saveDB(d); return {ok:true};
}
function getUserTournaments(userId) {
  return (loadDB().tournaments||[]).filter(t=>t.participants.find(p=>p.telegram_id===userId));
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

// Turnir xaritasi
const MAP_NAMES = ['Erangel','Sanhok','Miramar','Livik'];
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
const BTN_TOPUP     = '💰 Hisobni to\'ldirish';
const BTN_ACCOUNT   = '👤 Mening hisobim';
const BTN_ORDERS    = '📋 Buyurtmalarim';
const BTN_SUPPORT   = '📞 Yordam';
const BTN_PROMO     = '🎟 Promokod';
const BTN_HISOB     = '💸 Pul ishlash';
const BTN_TURNIR    = '🏆 Turnir';

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
function cancelBtn()   { return {inline_keyboard:[[{text:'❌ Bekor qilish',callback_data:'back_main'}]]}; }
function confirmBtn(pid){ return {inline_keyboard:[[{text:'✅ Tasdiqlash',callback_data:'confirm_'+pid},{text:'❌ Bekor',callback_data:'back_main'}]]}; }
function atmBtn(id)     { return {inline_keyboard:[[{text:'✅ Tasdiqlash',callback_data:'adm_ok_'+id},{text:'❌ Rad etish',callback_data:'adm_no_'+id}]]}; }
function aordBtn(id)    { return {inline_keyboard:[[{text:'✅ Bajarildi',callback_data:'adm_done_'+id},{text:'❌ Bekor',callback_data:'adm_cancel_'+id}]]}; }

function adminMenu() {
  return {inline_keyboard:[
    [{text:'⏳ Kutayotgan to\'ldirish',callback_data:'adm_topups'},{text:'📦 Buyurtmalar',callback_data:'adm_orders'}],
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
  const text=`💰 <b>To\'ldirish: ${fmt(amount)}</b>\n\n1️⃣ Quyidagi kartaga pul o\'tkazing:\n🏦 <code>9860 1606 2989 6350</code>\n👆 <i>(Karta raqamiga bosing — avtomatik ko\'chiriladi)</i>\n👤 <b>Qoshaqboyev.I</b>\n\n2️⃣ Miqdor: <b>${fmt(amount)}</b>\n\n3️⃣ To\'lovdan so\'ng <b>chek (screenshot)</b> yuboring\n\n✅ Admin tasdiqlashidan so\'ng balans qo\'shiladi!`;
  const opts={parse_mode:'HTML', reply_markup:cancelBtn()};
  if(edit&&msgId) await bot.editMessageText(text,{chat_id:chatId,message_id:msgId,...opts});
  else await bot.sendMessage(chatId, text, opts);
}

// ========================
// START
// ========================
async function sendStart(chatId, from) {
  getOrCreateUser(from.id, from.username, [from.first_name,from.last_name].filter(Boolean).join(' '));
  // menustart.png rasmini yuborish (foydalanuvchi o'zi joylashtiradi)
  const photoPath = path.join(__dirname, 'menustart.png');
  const caption = `👋 Salom, <b>${from.first_name}</b>!\n\n🎮 <b>Game Shop</b> ga xush kelibsiz!\n\n🎮 PUBG Mobile — UC & Popularity\n🔥 Free Fire — Diamond\n🌟 Mobile Legends — Diamond\n\n💳 To\'lov admin orqali tasdiqlanadi.\n⚡ Tez va ishonchli yetkazib berish!\n\n👇 Pastdagi menyudan tanlang:`;
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
  getOrCreateUser(from.id, from.username, [from.first_name, from.last_name].filter(Boolean).join(' '));
  const ok = await isSubscribed(from.id);
  if(!ok) return sendSubRequired(msg.chat.id);
  await sendStart(msg.chat.id, from);
});

bot.onText(/\/admin/, async (msg) => {
  if(!isAdmin(msg.from.id)) return bot.sendMessage(msg.chat.id,'❌ Ruxsat yo\'q!');
  await bot.sendMessage(msg.chat.id,
    `⚙️ <b>Admin Panel</b>\n\nXush kelibsiz, admin! Quyidagi bo\'limlardan birini tanlang:`,
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
    // OBUNA TEKSHIRISH
    if(data==='check_sub') {
      const ok=await isSubscribed(uid);
      if(!ok) return bot.sendMessage(chatId,'❌ Hali obuna bo\'lmadingiz! Obuna bo\'lib qaytadan tekshiring.',{reply_markup:{inline_keyboard:[[{text:`📢 ${CHANNEL}`,url:CHANNEL_URL}],[{text:'✅ Tekshirish',callback_data:'check_sub'}]]}});
      await bot.editMessageText('✅ Obuna tasdiqlandi! Xush kelibsiz! 🎮',{chat_id:chatId,message_id:msgId});
      return sendStart(chatId,from);
    }

    // Admin emas bo'lsa obuna tekshir
    if(!isAdmin(uid)) {
      const ok=await isSubscribed(uid);
      if(!ok) {
        try { await bot.editMessageReplyMarkup({inline_keyboard:[]},{chat_id:chatId,message_id:msgId}); } catch(e){}
        return sendSubRequired(chatId);
      }
    }

    // ORQAGA
    if(data==='back_main') {
      clearState(uid);
      try { await bot.editMessageText('🎮 <b>Game Shop</b>\n\n👇 Pastdagi menyudan tanlang',{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[]}}); } catch(e){}
      return;
    }

    // KATEGORIYA
    if(data.startsWith('buy_')) {
      const type=data.replace('buy_','');
      const g=gameInfo(type);
      return bot.editMessageText(`${g.emoji} <b>${g.name}</b>\n\nPaket tanlang:`,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:productsMenu(getProducts(type))});
    }

    // MAHSULOT
    if(data.startsWith('product_')) {
      const pid=parseInt(data.split('_')[1]);
      const product=getProductById(pid);
      if(!product) return;
      const bal=getBalance(uid);
      const g=gameInfo(product.type);
      const finalPrice=product.price;
      setState(uid,{selectedProduct:pid, step:'enter_id', finalPrice});
      if(bal<finalPrice) {
        return bot.editMessageText(
          `${g.emoji} <b>${product.name}</b>\n\n💰 Narx: <b>${fmt(finalPrice)}</b>\n💳 Balans: <b>${fmt(bal)}</b>\n\n⚠️ <b>Balans yetarli emas!</b>\nYetishmaydi: <b>${fmt(finalPrice-bal)}</b>`,
          {chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:"💰 Hisobni to'ldirish",callback_data:'topup_menu'}],[{text:'🔙 Orqaga',callback_data:'back_main'}]]}}
        );
      }
      const idText=`🆔 <b>${g.idLabel}</b> yuboring:`;
      return bot.editMessageText(
        `${g.emoji} <b>${product.name}</b>\n\n💰 Narx: <b>${fmt(finalPrice)}</b>\n💳 Balans: <b>${fmt(bal)}</b>\n\n📝 ${idText}`,
        {chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:cancelBtn()}
      );
    }

    // BUYURTMA TASDIQLASH
    if(data.startsWith('confirm_')) {
      const pid=parseInt(data.replace('confirm_',''));
      const state=getState(uid);
      const product=getProductById(pid);
      if(!product||!state.gameId) return;
      const g=gameInfo(product.type);
      const finalPrice=(state.finalPrice!==undefined&&state.finalPrice!==null)?state.finalPrice:product.price;
      const deducted=deductBalance(uid,finalPrice,product.name+' xaridi');
      if(!deducted) return bot.editMessageText('❌ Balans yetarli emas!',{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'🏠 Menyu',callback_data:'back_main'}]]}});
      const orderId=createOrder(uid,product.type,product.name,finalPrice,product.price,state.gameId,state.gameNick,null);
      clearState(uid);
      const newBal=getBalance(uid);
      const details=`🆔 ID: <code>${state.gameId}</code>\n👤 Nik: <b>${state.gameNick||'-'}</b>`;
      await bot.editMessageText(
        `✅ <b>Buyurtma qabul qilindi!</b>\n\n📦 #${orderId}\n${g.emoji} ${g.name}: <b>${product.name}</b>\n${details}\n💰 To\'langan: <b>${fmt(finalPrice)}</b>\n💳 Qolgan: <b>${fmt(newBal)}</b>\n\n⏳ <b>Admin tasdig\'ini kuting (5-15 daqiqa)</b>`,
        {chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'🏠 Bosh menyu',callback_data:'back_main'}]]}}
      );
      const fromUser=from.username?`@${from.username}`:from.first_name;
      for(const adminId of ADMIN_IDS) {
        let adminMsg=`🛒 <b>Yangi buyurtma #${orderId}</b>\n\n👤 ${fromUser} (${uid})\n${g.emoji} <b>${g.name} — ${product.name}</b>\n`;
        adminMsg+=`🆔 ID: <code>${state.gameId}</code>\n👤 Nik: <b>${state.gameNick||'-'}</b>\n`;
        adminMsg+=`💰 <b>${fmt(finalPrice)}</b>`;
        await bot.sendMessage(adminId,adminMsg,{parse_mode:'HTML',reply_markup:aordBtn(orderId)});
      }
    }

    // TO'LDIRISH
    if(data==='topup_menu') {
      return bot.editMessageText(`💰 <b>Hisobni to\'ldirish</b>\n\n📌 To\'lov usuli: Admin orqali\n📸 Chek yuboring → Admin tasdiqlaydi → Balans qo\'shiladi\n\n📌 Minimum: 5,000 so'm | Maksimum: 150,000 so'm`,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:topupMenu()});
    }
    if(data.startsWith('topup_')&&data!=='topup_menu') {
      const val=data.replace('topup_','');
      if(val==='custom') {
        setState(uid,{step:'enter_amount'});
        return bot.editMessageText(`✏️ Nechta so\'m to\'ldirmoqchisiz?\n\n📌 Minimum: 5,000 | Maksimum: 150,000\n\nFaqat raqam kiriting:`,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'topup_menu'}]]}});
      }
      setState(uid,{step:'send_receipt',topupAmount:parseInt(val)});
      return sendPayment(chatId,msgId,parseInt(val),true);
    }

    // MENING HISOBIM
    if(data==='my_account') {
      const user=getOrCreateUser(uid,from.username,[from.first_name,from.last_name].filter(Boolean).join(' '));
      const txs=getLastTxs(uid);
      const txText=txs.length?'\n\n📋 <b>So\'nggi operatsiyalar:</b>\n'+txs.map(t=>`${t.amount>0?'+':''}${fmt(Math.abs(t.amount))} — ${t.description}`).join('\n'):'';
      return bot.editMessageText(
        `👤 <b>Mening hisobim</b>\n\n🆔 ID: <code>${uid}</code>\n👤 Ism: <b>${user.full_name||'Noma\'lum'}</b>\n💰 Balans: <b>${fmt(user.balance)}</b>\n💸 Jami sarflangan: <b>${fmt(user.total_spent)}</b>`+txText,
        {chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:"💰 To'ldirish",callback_data:'topup_menu'}],[{text:'🏠 Menyu',callback_data:'back_main'}]]}}
      );
    }

    // ========================
    // PROMOKOD CALLBACK
    // ========================
    if(data==='promo_enter') {
      clearState(uid);
      setState(uid,{step:'enter_promo'});
      return bot.sendMessage(chatId,`🎟 <b>Promokod kiritish</b>\n\nPromokod kodini yozing:`,{parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'back_main'}]]}});
    }
    if(data==='promo_get') {
      return bot.sendMessage(chatId,
        `🎟 <b>Promokod olish</b>\n\nPromokod olish uchun kanalimizga obuna bo'ling va postlarni kuzatib boring!\n\n📢 Kanalimiz:`,
        {parse_mode:'HTML', reply_markup:{inline_keyboard:[
          [{text:`📢 ${CHANNEL} ga o'tish`, url:CHANNEL_URL}],
          [{text:'🔙 Orqaga', callback_data:'back_main'}]
        ]}}
      );
    }

    // ========================
    // ADMIN CALLBACKS
    // ========================
    if(data==='adm_topups'&&isAdmin(uid)) {
      const reqs=getPendingTopups();
      if(!reqs.length) return bot.editMessageText('✅ Kutayotgan to\'ldirish yo\'q.',{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:adminMenu()});
      await bot.editMessageText(`⏳ <b>${reqs.length} ta kutayotgan to\'ldirish</b>`,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:adminMenu()});
      for(const req of reqs) {
        const user=getUser(req.telegram_id);
        const name=user?.username?`@${user.username}`:(user?.full_name||`ID: ${req.telegram_id}`);
        const cap=`💰 <b>To\'ldirish #${req.id}</b>\n👤 ${name} (${req.telegram_id})\n💰 <b>${fmt(req.amount)}</b>`;
        try {
          if(req.receipt_type==='photo') await bot.sendPhoto(chatId,req.receipt_file_id,{caption:cap,parse_mode:'HTML',reply_markup:atmBtn(req.id)});
          else await bot.sendDocument(chatId,req.receipt_file_id,{caption:cap,parse_mode:'HTML',reply_markup:atmBtn(req.id)});
        } catch { await bot.sendMessage(chatId,cap+'\n⚠️ Chek yuklanmagan.',{parse_mode:'HTML',reply_markup:atmBtn(req.id)}); }
      }
    }

    if(data==='adm_orders'&&isAdmin(uid)) {
      const orders=getAllOrders();
      if(!orders.length) return bot.editMessageText('📦 Buyurtmalar yo\'q.',{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:adminMenu()});
      let text=`📦 <b>So\'nggi buyurtmalar:</b>\n\n`;
      orders.forEach(o=>{const s=o.status==='completed'?'✅':o.status==='pending'?'⏳':'❌';const g=gameInfo(o.product_type);text+=`${s} #${o.id} ${g.emoji} ${o.product_name} — <code>${o.game_id}</code>\n`;});
      return bot.editMessageText(text,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'🔙 Admin',callback_data:'adm_back'}]]}});
    }

    if(data==='adm_back'&&isAdmin(uid)) {
      return bot.editMessageText(`⚙️ <b>Admin Panel</b>`,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:adminMenu()});
    }

    if(data==='adm_users'&&isAdmin(uid)) {
      const users=getAllUsers().slice(0,30);
      let text=`👥 <b>Foydalanuvchilar (${getAllUsers().length} ta):</b>\n\n`;
      users.forEach((u,i)=>{
        const name=u.username?`@${u.username}`:(u.full_name||'Noma\'lum');
        text+=`${i+1}. ${name} | ID: <code>${u.telegram_id}</code> — <b>${fmt(u.balance)}</b>\n`;
      });
      return bot.editMessageText(text,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'🔙 Admin',callback_data:'adm_back'}]]}});
    }

    // BALANS BERISH / AYIRISH
    if(data==='adm_give'&&isAdmin(uid)) {
      return bot.editMessageText(
        `💳 <b>Balans boshqarish</b>\n\nQuyidagilardan birini tanlang:`,
        {chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[
          [{text:'➕ Balans qo\'shish',callback_data:'adm_give_add'},{text:'➖ Balans ayirish',callback_data:'adm_give_sub'}],
          [{text:'🔙 Admin',callback_data:'adm_back'}]
        ]}}
      );
    }
    if(data==='adm_give_add'&&isAdmin(uid)) {
      setState(uid,{step:'adm_give_add'});
      return bot.sendMessage(chatId,`➕ <b>Balans qo\'shish</b>\n\nFormat: <code>ID MIQDOR</code>\nMasalan: <code>123456789 50000</code>`,{parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_back'}]]}});
    }
    if(data==='adm_give_sub'&&isAdmin(uid)) {
      setState(uid,{step:'adm_give_sub'});
      return bot.sendMessage(chatId,`➖ <b>Balans ayirish</b>\n\nFormat: <code>ID MIQDOR</code>\nMasalan: <code>123456789 50000</code>`,{parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_back'}]]}});
    }

    // FOYDALANUVCHI QIDIRISH
    if(data==='adm_search'&&isAdmin(uid)) {
      setState(uid,{step:'adm_search'});
      return bot.sendMessage(chatId,`🔍 <b>Foydalanuvchi qidirish</b>\n\nFoydalanuvchi ID sini kiriting:`,{parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_back'}]]}});
    }

    // FOYDALANUVCHIGA XABAR
    if(data==='adm_msg_user'&&isAdmin(uid)) {
      setState(uid,{step:'adm_msg_user_id'});
      return bot.sendMessage(chatId,`💬 <b>Foydalanuvchiga xabar</b>\n\nFoydalanuvchi ID sini kiriting:`,{parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_back'}]]}});
    }
    if(data==='adm_msg_skip_photo'&&isAdmin(uid)) {
      const state=getState(uid);
      setState(uid,{...state,step:'adm_msg_user_text',msgPhoto:null});
      return bot.sendMessage(chatId,`✏️ Xabar matnini yozing:`,{reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_back'}]]}});
    }
    if(data==='adm_msg_confirm'&&isAdmin(uid)) {
      const state=getState(uid);
      if(!state.msgTargetId||!state.msgText) return;
      clearState(uid);
      try {
        if(state.msgPhoto) {
          await bot.sendPhoto(state.msgTargetId,state.msgPhoto,{caption:state.msgText,parse_mode:'HTML'});
        } else {
          await bot.sendMessage(state.msgTargetId,state.msgText,{parse_mode:'HTML'});
        }
        await bot.sendMessage(chatId,'✅ Xabar yuborildi!',{reply_markup:{inline_keyboard:[[{text:'🔙 Admin',callback_data:'adm_back'}]]}});
      } catch(e) {
        await bot.sendMessage(chatId,`❌ Xabar yuborilmadi: ${e.message}`,{reply_markup:{inline_keyboard:[[{text:'🔙 Admin',callback_data:'adm_back'}]]}});
      }
    }

    // PROMOKODLAR
    if(data==='adm_promos'&&isAdmin(uid)) {
      const promos=getAllPromos();
      let text=promos.length?`🎟 <b>Promokodlar (${promos.length} ta):</b>\n\n`:'🎟 Hali promokodlar yo\'q.\n';
      promos.forEach(p=>{
        const uses=`${p.usedBy.length}/${p.maxUses}`;
        const expired = p.expires_at && new Date()>new Date(p.expires_at);
        const statusIcon = expired?'⏰':p.is_active?'✅':'❌';
        text+=`${statusIcon} <code>${p.code}</code> — <b>${fmt(p.amount||0)}</b> | ${uses}\n`;
      });
      return bot.editMessageText(text,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[
        [{text:'➕ Qo\'shish',callback_data:'adm_add_promo'},{text:'🗑 O\'chirish',callback_data:'adm_del_promo'}],
        [{text:'🔙 Admin',callback_data:'adm_back'}]
      ]}});
    }

    if(data==='adm_add_promo'&&isAdmin(uid)) {
      setState(uid,{step:'adm_promo_code',promoData:{}});
      return bot.sendMessage(chatId,
        `🎟 <b>Yangi promokod yaratish</b>\n\n1️⃣ Promokod kodi qanday bo\'lsin?\n\n💡 Masalan: <code>BONUS</code>, <code>DOSTUM</code>, <code>HEDYA</code>\n\n⏰ Promokod 12 soatdan keyin avtomatik o\'chadi (ishlatilmasa)`,
        {parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_promos'}]]}}
      );
    }

    if(data==='adm_del_promo'&&isAdmin(uid)) {
      setState(uid,{step:'adm_del_promo'});
      return bot.sendMessage(chatId,`🗑 O\'chirmoqchi bo\'lgan promokod kodini yozing:`,{reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_promos'}]]}});
    }

    if(data.startsWith('adm_promo_type_')&&isAdmin(uid)) {
      const rewardType = data.replace('adm_promo_type_','');
      const state = getState(uid);
      setState(uid,{...state, promoData:{...state.promoData, rewardType}, step:'adm_promo_amount'});
      return bot.sendMessage(chatId,
        `💰 <b>Bonus miqdori</b>\n\nNecha so\'m berilsin? Raqam yozing:`,
        {parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_promos'}]]}}
      );
    }

    if(data.startsWith('adm_promo_uses_')&&isAdmin(uid)) {
      const val=data.replace('adm_promo_uses_','');
      const state=getState(uid);
      if(val==='custom') {
        setState(uid,{...state,step:'adm_promo_maxuses'});
        return bot.sendMessage(chatId,`✏️ Nechta odam ishlatsin? Raqam yozing:`,{reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_promos'}]]}});
      }
      const maxUses=parseInt(val);
      const pd=state.promoData;
      createPromo(pd.code,pd.amount,maxUses);
      clearState(uid);
      return bot.sendMessage(chatId,
        `✅ <b>Promokod yaratildi!</b>\n\n🎟 Kod: <code>${pd.code}</code>\n💸 Bonus: <b>${fmt(pd.amount)}</b>\n👥 Limit: <b>${maxUses} ta odam</b>\n⏰ 12 soatdan keyin avtomatik o\'chadi`,
        {parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'🎟 Promokodlar',callback_data:'adm_promos'}]]}}
      );
    }

    // BROADCAST
    if(data==='adm_broadcast'&&isAdmin(uid)) {
      setState(uid,{step:'adm_broadcast'});
      return bot.sendMessage(chatId,
        `📢 <b>Hammaga xabar yuborish</b>\n\nAvval rasm yuboring (yoki "Rasmni o'tkazib yuborish" tugmasini bosing):`,
        {parse_mode:'HTML',reply_markup:{inline_keyboard:[
          [{text:"🚫 Rasmni o'tkazib yuborish",callback_data:'adm_broadcast_skip_photo'}],
          [{text:'❌ Bekor',callback_data:'adm_back'}]
        ]}}
      );
    }
    if(data==='adm_broadcast_skip_photo'&&isAdmin(uid)) {
      const state=getState(uid);
      setState(uid,{...state,step:'adm_broadcast_text',broadPhoto:null});
      return bot.sendMessage(chatId,`✏️ Matn kiriting — bu matn hammaga yuboriladi:`,{reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_back'}]]}});
    }

    // ADMIN TOPUP TASDIQLASH
    if(data.startsWith('adm_ok_')&&isAdmin(uid)) {
      const req=approveTopup(parseInt(data.replace('adm_ok_','')),uid);
      if(!req) return;
      const newBal=getBalance(req.telegram_id);
      try {
        if(message.photo||message.document) {
          await bot.editMessageCaption((message.caption||'')+'\n\n✅ <b>TASDIQLANDI</b>',{chat_id:chatId,message_id:msgId,parse_mode:'HTML'});
        } else {
          await bot.editMessageText((message.text||'')+'\n\n✅ <b>TASDIQLANDI</b>',{chat_id:chatId,message_id:msgId,parse_mode:'HTML'});
        }
      } catch(e) { console.error('Edit xato:', e.message); }
      await bot.sendMessage(req.telegram_id,
        `✅ <b>Hisobingiz to\'ldirildi!</b>\n\n💰 Qo\'shildi: <b>${fmt(req.amount)}</b>\n💳 Balans: <b>${fmt(newBal)}</b>\n\nXarid qilishingiz mumkin! 🎮`,
        {parse_mode:'HTML',reply_markup:mainKeyboard()}
      );
    }

    if(data.startsWith('adm_no_')&&isAdmin(uid)) {
      setState(uid,{step:'adm_reject',rejectId:parseInt(data.replace('adm_no_',''))});
      return bot.sendMessage(chatId,`❌ Rad etish sababini yozing:`);
    }

    if(data.startsWith('adm_done_')&&isAdmin(uid)) {
      const orderId=parseInt(data.replace('adm_done_',''));
      const order=getOrder(orderId);
      if(!order) return;
      completeOrder(orderId);
      try {
        await bot.editMessageText((message.text||'')+'\n\n✅ <b>BAJARILDI</b>',{chat_id:chatId,message_id:msgId,parse_mode:'HTML'});
      } catch(e) {}
      const g=gameInfo(order.product_type);
      await bot.sendMessage(order.telegram_id,
        `✅ <b>Buyurtmangiz bajarildi!</b>\n\n📦 #${orderId}\n${g.emoji} ${g.name}: <b>${order.product_name}</b>\n🆔 ID: <code>${order.game_id}</code>\n\nO\'yiningizni tekshiring! 🎮\nRahmat! ❤️`,
        {parse_mode:'HTML',reply_markup:mainKeyboard()}
      );
    }

    if(data.startsWith('adm_cancel_')&&isAdmin(uid)) {
      const orderId=parseInt(data.replace('adm_cancel_',''));
      const order=getOrder(orderId);
      if(!order) return;
      addBalance(order.telegram_id,order.price,`Buyurtma #${orderId} bekor — pul qaytarildi`);
      cancelOrder(orderId);
      try {
        await bot.editMessageText((message.text||'')+'\n\n❌ <b>BEKOR QILINDI — pul qaytarildi</b>',{chat_id:chatId,message_id:msgId,parse_mode:'HTML'});
      } catch(e) {}
      await bot.sendMessage(order.telegram_id,
        `⚠️ <b>Buyurtma bekor qilindi</b>\n\n📦 #${orderId}\n💰 Pul qaytarildi: <b>${fmt(order.price)}</b>`,
        {parse_mode:'HTML',reply_markup:mainKeyboard()}
      );
    }

    // ========================
    // TURNIR CALLBACKS
    // ========================

    // Foydalanuvchi: Turnirlar ro'yxati
    if(data==='turnir_list') {
      const tournaments=getAllTournaments();
      if(!tournaments.length) {
        return bot.editMessageText(
          `🏆 <b>Turnirlar</b>\n\nHozircha faol turnirlar yo'q.\nKuzatib turing! 👀`,
          {chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'🔙 Orqaga',callback_data:'back_main'}]]}}
        );
      }
      const btns = tournaments.map(t=>[{text:`🏆 ${t.name} — ${fmt(t.entry_fee)}`, callback_data:`turnir_view_${t.id}`}]);
      btns.push([{text:'🔙 Orqaga',callback_data:'back_main'}]);
      return bot.editMessageText(
        `🏆 <b>Faol turnirlar</b>\n\nQatnashmoqchi bo\'lgan turnirni tanlang:`,
        {chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:btns}}
      );
    }

    // Turnir ma'lumotlari
    if(data.startsWith('turnir_view_')) {
      const tid2=parseInt(data.replace('turnir_view_',''));
      const t=getTournament(tid2);
      if(!t) return;
      const alreadyJoined = t.participants.find(p=>p.telegram_id===uid);
      const slotsLeft = t.slots - t.participants.length;
      const mapEmoji = {Erangel:'🟢',Sanhok:'🌴',Miramar:'🏜',Livik:'🏝'}[t.map]||'🗺';
      const modeEmoji = {Solo:'👤',Duo:'👥',Squad:'👨‍👩‍👧‍👦'}[t.mode]||'🎮';
      let text = `🏆 <b>${t.name}</b>\n\n`;
      text += `📅 Sana: <b>${t.day} ${MONTHS[t.month-1]}</b>\n`;
      text += `⏰ Soat: <b>${t.time}</b>\n`;
      text += `${mapEmoji} Xarita: <b>${t.map}</b>\n`;
      text += `${modeEmoji} Rejim: <b>${t.mode}</b>\n`;
      text += `💰 Kirish narxi: <b>${fmt(t.entry_fee)}</b>\n`;
      text += `🎯 Slotlar: <b>${t.participants.length}/${t.slots}</b>\n`;
      text += `📊 Bo\'sh joy: <b>${slotsLeft > 0 ? slotsLeft+' ta' : '❌ To\'ldi'}</b>`;

      const btns = [];
      if(alreadyJoined) {
        btns.push([{text:'✅ Qo\'shilgansiz!',callback_data:'noop'}]);
      } else if(slotsLeft > 0 && t.is_active) {
        btns.push([{text:'🎮 Turnirga qo\'shilish',callback_data:`turnir_join_${tid2}`}]);
      } else {
        btns.push([{text:'❌ Turnir to\'ldi',callback_data:'noop'}]);
      }
      btns.push([{text:'🔙 Turnirlar',callback_data:'turnir_list'}]);
      return bot.editMessageText(text,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:btns}});
    }

    // Turnirga qo'shilish — ID so'rash
    if(data.startsWith('turnir_join_')) {
      const tid2=parseInt(data.replace('turnir_join_',''));
      const t=getTournament(tid2);
      if(!t) return;
      const bal=getBalance(uid);
      if(bal<t.entry_fee) {
        return bot.editMessageText(
          `❌ <b>Balans yetarli emas!</b>\n\n💰 Kirish narxi: <b>${fmt(t.entry_fee)}</b>\n💳 Balansingiz: <b>${fmt(bal)}</b>\nYetishmaydi: <b>${fmt(t.entry_fee-bal)}</b>`,
          {chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[
            [{text:"💰 Hisobni to'ldirish",callback_data:'topup_menu'}],
            [{text:'🔙 Orqaga',callback_data:`turnir_view_${tid2}`}]
          ]}}
        );
      }
      setState(uid,{step:'turnir_enter_id',joinTournamentId:tid2});
      return bot.sendMessage(chatId,
        `🏆 <b>${t.name}</b> ga qo\'shilish\n\n🆔 PUBG Mobile ID ingizni kiriting:`,
        {parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:`turnir_view_${tid2}`}]]}}
      );
    }

    // Turnir qo'shilish tasdiqlash
    if(data.startsWith('turnir_confirm_')) {
      const tid2=parseInt(data.replace('turnir_confirm_',''));
      const state=getState(uid);
      if(!state.turnirGameId) return;
      const result=joinTournament(tid2, uid, state.turnirGameId, state.turnirNick||'-');
      clearState(uid);
      if(!result.ok) return bot.sendMessage(chatId,result.msg,{parse_mode:'HTML',reply_markup:mainKeyboard()});
      const t=getTournament(tid2);
      return bot.editMessageText(
        `✅ <b>Turnirga muvaffaqiyatli qo\'shildingiz!</b>\n\n🏆 ${t?.name||'Turnir'}\n🆔 ID: <code>${state.turnirGameId}</code>\n👤 Nik: <b>${state.turnirNick||'-'}</b>\n💰 Yechildi: <b>${fmt(t?.entry_fee||0)}</b>\n💳 Qolgan balans: <b>${fmt(getBalance(uid))}</b>\n\n📅 Turnir sanasida qatnashing! 🎮`,
        {chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[
          [{text:'👤 Mening turnirlarim',callback_data:'my_tournaments'}],
          [{text:'🏠 Bosh menyu',callback_data:'back_main'}]
        ]}}
      );
    }

    // Mening turnirlarim
    if(data==='my_tournaments') {
      const myT=getUserTournaments(uid);
      if(!myT.length) {
        return bot.editMessageText(
          `🏆 <b>Mening turnirlarim</b>\n\nSiz hali hech qaysi turnirga qo\'shilmadingiz.`,
          {chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[
            [{text:'🏆 Turnirlar',callback_data:'turnir_list'}],
            [{text:'🔙 Orqaga',callback_data:'back_main'}]
          ]}}
        );
      }
      let text=`🏆 <b>Mening turnirlarim:</b>\n\n`;
      myT.forEach((t,i)=>{
        const me=t.participants.find(p=>p.telegram_id===uid);
        text+=`${i+1}. 🏆 <b>${t.name}</b>\n`;
        text+=`   📅 ${t.day} ${MONTHS[t.month-1]} | ⏰ ${t.time}\n`;
        text+=`   🆔 ID: <code>${me?.game_id||'-'}</code> | 👤 ${me?.game_nick||'-'}\n\n`;
      });
      return bot.editMessageText(text,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[
        [{text:'🏆 Turnirlar',callback_data:'turnir_list'}],
        [{text:'🔙 Orqaga',callback_data:'back_main'}]
      ]}});
    }

    // noop (bo'sh tugma)
    if(data==='noop') return;

    // ========================
    // ADMIN — TURNIR BOSHQARUV
    // ========================
    if(data==='adm_tournaments'&&isAdmin(uid)) {
      return bot.editMessageText(
        `🏆 <b>Turnirlarni boshqarish</b>`,
        {chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[
          [{text:'➕ Turnir qo\'shish',callback_data:'adm_t_add'}],
          [{text:'✏️ Turnir tahrirlash',callback_data:'adm_t_edit'},{text:'🗑 Turnir o\'chirish',callback_data:'adm_t_delete'}],
          [{text:'📋 Barcha turnirlar',callback_data:'adm_t_list'}],
          [{text:'🔙 Admin',callback_data:'adm_back'}]
        ]}}
      );
    }

    if(data==='adm_t_list'&&isAdmin(uid)) {
      const all=(loadDB().tournaments||[]);
      if(!all.length) return bot.editMessageText('🏆 Hali turnirlar yo\'q.',{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'🔙 Orqaga',callback_data:'adm_tournaments'}]]}});
      let text=`📋 <b>Barcha turnirlar:</b>\n\n`;
      all.forEach(t=>{
        const s=t.is_active?'✅':'❌';
        text+=`${s} #${t.id} <b>${t.name}</b> — ${fmt(t.entry_fee)} | ${t.participants.length}/${t.slots}\n`;
      });
      return bot.editMessageText(text,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'🔙 Orqaga',callback_data:'adm_tournaments'}]]}});
    }

    if(data==='adm_t_add'&&isAdmin(uid)) {
      setState(uid,{step:'adm_t_month',tData:{}});
      const monthBtns=[];
      for(let i=0;i<12;i+=3) {
        const row=[];
        for(let j=i;j<i+3&&j<12;j++) row.push({text:MONTHS[j],callback_data:`adm_t_setmonth_${j+1}`});
        monthBtns.push(row);
      }
      monthBtns.push([{text:'❌ Bekor',callback_data:'adm_tournaments'}]);
      return bot.editMessageText(`🏆 <b>Yangi turnir qo\'shish</b>\n\n1️⃣ Qaysi oyga?`,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:monthBtns}});
    }

    if(data.startsWith('adm_t_setmonth_')&&isAdmin(uid)) {
      const month=parseInt(data.replace('adm_t_setmonth_',''));
      const state=getState(uid);
      setState(uid,{...state,tData:{...state.tData,month},step:'adm_t_day'});
      const dayBtns=[];
      for(let i=1;i<=31;i+=7) {
        const row=[];
        for(let j=i;j<i+7&&j<=31;j++) row.push({text:String(j),callback_data:`adm_t_setday_${j}`});
        dayBtns.push(row);
      }
      dayBtns.push([{text:'❌ Bekor',callback_data:'adm_tournaments'}]);
      return bot.editMessageText(`✅ Oy: <b>${MONTHS[month-1]}</b>\n\n2️⃣ Qaysi kun?`,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:dayBtns}});
    }

    if(data.startsWith('adm_t_setday_')&&isAdmin(uid)) {
      const day=parseInt(data.replace('adm_t_setday_',''));
      const state=getState(uid);
      setState(uid,{...state,tData:{...state.tData,day},step:'adm_t_time'});
      return bot.editMessageText(`✅ Sana: <b>${day} ${MONTHS[state.tData.month-1]}</b>\n\n3️⃣ Soat nechida? (Masalan: <code>14:00</code>)`,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_tournaments'}]]}});
    }

    if(data.startsWith('adm_t_setmap_')&&isAdmin(uid)) {
      const map=data.replace('adm_t_setmap_','');
      const state=getState(uid);
      setState(uid,{...state,tData:{...state.tData,map},step:'adm_t_mode'});
      return bot.editMessageText(`✅ Xarita: <b>${map}</b>\n\n6️⃣ Rejim?`,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[
        MODE_NAMES.map(m=>({text:m,callback_data:`adm_t_setmode_${m}`})),
        [{text:'❌ Bekor',callback_data:'adm_tournaments'}]
      ]}});
    }

    if(data.startsWith('adm_t_setmode_')&&isAdmin(uid)) {
      const mode=data.replace('adm_t_setmode_','');
      const state=getState(uid);
      setState(uid,{...state,tData:{...state.tData,mode},step:'adm_t_fee'});
      return bot.editMessageText(`✅ Rejim: <b>${mode}</b>\n\n7️⃣ Kirish narxi (so\'mda)? Raqam yozing:`,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_tournaments'}]]}});
    }

    // ADMIN TURNIR EDIT / DELETE
    if(data==='adm_t_edit'&&isAdmin(uid)) {
      setState(uid,{step:'adm_t_edit_id'});
      return bot.sendMessage(chatId,`✏️ Tahrirlanishi kerak bo\'lgan turnir ID sini kiriting:`,{reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_tournaments'}]]}});
    }
    if(data==='adm_t_delete'&&isAdmin(uid)) {
      setState(uid,{step:'adm_t_delete_id'});
      return bot.sendMessage(chatId,`🗑 O\'chirilishi kerak bo\'lgan turnir ID sini kiriting:`,{reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_tournaments'}]]}});
    }
    if(data.startsWith('adm_t_confirm_del_')&&isAdmin(uid)) {
      const tid2=parseInt(data.replace('adm_t_confirm_del_',''));
      deleteTournament(tid2);
      clearState(uid);
      return bot.editMessageText('✅ Turnir o\'chirildi.',{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'🔙 Turnirlar',callback_data:'adm_tournaments'}]]}});
    }

    // PULSIZ (bo'sh tugma uchun)
    if(data==='adm_back'&&isAdmin(uid)) {
      return bot.editMessageText(`⚙️ <b>Admin Panel</b>`,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:adminMenu()});
    }

  } catch(err) { console.error('Callback xato:',err.message); }
});

// ========================
// MESSAGE HANDLER
// ========================
bot.on('message', async (msg) => {
  const {chat,from,text,photo,document} = msg;
  const uid    = from.id;
  const chatId = chat.id;
  const state  = getState(uid);
  if(text&&text.startsWith('/')) return;

  // Obuna tekshirish (admin emas bo'lsa)
  if(!isAdmin(uid)) {
    const ok=await isSubscribed(uid);
    if(!ok) return sendSubRequired(chatId);
  }

  try {

    // KATEGORIYA TUGMALARI
    if(text&&CAT_BTNS[text]) {
      clearState(uid);
      const type=CAT_BTNS[text]; const g=gameInfo(type);
      return bot.sendMessage(chatId,`${g.emoji} <b>${g.name}</b>\n\nPaket tanlang:`,{parse_mode:'HTML',reply_markup:productsMenu(getProducts(type))});
    }

    // TO'LDIRISH
    if(text===BTN_TOPUP) {
      clearState(uid);
      return bot.sendMessage(chatId,`💰 <b>Hisobni to\'ldirish</b>\n\n📌 To\'lov usuli: Admin orqali\n📸 Chek yuboring → Admin tasdiqlaydi → Balans qo\'shiladi\n\n📌 Minimum: 5,000 so\'m | Maksimum: 150,000 so\'m`,{parse_mode:'HTML',reply_markup:topupMenu()});
    }

    // HISOBIM
    if(text===BTN_ACCOUNT) {
      clearState(uid);
      const user=getOrCreateUser(uid,from.username,[from.first_name,from.last_name].filter(Boolean).join(' '));
      const txs=getLastTxs(uid);
      const txText=txs.length?'\n\n📋 <b>So\'nggi operatsiyalar:</b>\n'+txs.map(t=>`${t.amount>0?'+':''}${fmt(Math.abs(t.amount))} — ${t.description}`).join('\n'):'';
      return bot.sendMessage(chatId,
        `👤 <b>Mening hisobim</b>\n\n🆔 ID: <code>${uid}</code>\n👤 Ism: <b>${user.full_name||'Noma\'lum'}</b>\n💰 Balans: <b>${fmt(user.balance)}</b>\n💸 Jami sarflangan: <b>${fmt(user.total_spent)}</b>`+txText,
        {parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:"💰 To'ldirish",callback_data:'topup_menu'}]]}}
      );
    }

    // BUYURTMALAR
    if(text===BTN_ORDERS) {
      clearState(uid);
      const orders=getUserOrders(uid);
      if(!orders.length) return bot.sendMessage(chatId,'📋 Hali buyurtmalar yo\'q.');
      let t=`📋 <b>Buyurtmalarim</b>\n\n`;
      orders.forEach((o,i)=>{const s=o.status==='completed'?'✅':o.status==='pending'?'⏳':'❌';const g=gameInfo(o.product_type);t+=`${i+1}. #${o.id} ${s} ${g.emoji} <b>${o.product_name}</b> — ${fmt(o.price)}\n`;});
      return bot.sendMessage(chatId,t,{parse_mode:'HTML'});
    }

    // 🎟 PROMOKOD TUGMASI
    if(text===BTN_PROMO) {
      clearState(uid);
      return bot.sendMessage(chatId,
        `🎟 <b>Promokod</b>\n\nQuyidagilardan birini tanlang:`,
        {parse_mode:'HTML',reply_markup:{inline_keyboard:[
          [{text:'🎟 Promokod kiritish',callback_data:'promo_enter'}],
          [{text:'🎁 Promokod olish',callback_data:'promo_get'}]
        ]}}
      );
    }

    // 💼 PUL ISHLASH
    if(text===BTN_HISOB) {
      clearState(uid);
      const balance = getBalance(uid);
      return bot.sendMessage(chatId,
        `💸 <b>Pul ishlash</b>\n\n💰 Balansingiz: <b>${fmt(balance)}</b>\n\nDo\'stlaringizni taklif qiling va har bir do\'stingiz uchun <b>250 so\'m</b> oling!\n\n🔗 Sizning referal havolangiz:\n<code>https://t.me/${process.env.BOT_USERNAME||''}?start=ref_${uid}</code>\n\nHavolani do\'stlaringizga yuboring!`,
        {parse_mode:'HTML', reply_markup:{inline_keyboard:[
          [{text:'🔙 Orqaga',callback_data:'back_main'}]
        ]}}
      );
    }

    // YORDAM
    if(text===BTN_SUPPORT) {
      clearState(uid);
      return bot.sendMessage(chatId,`📞 <b>Yordam</b>\n\n👨‍💼 Admin: @ismoiljo_n\n⏰ Ish vaqti: 09:00 - 22:00\n\n💬 Murojaat vaqtida buyurtma raqamingizni yozing!`,{parse_mode:'HTML'});
    }

    // 🏆 TURNIR TUGMASI
    if(text===BTN_TURNIR) {
      clearState(uid);
      const tournaments=getAllTournaments();
      const myT=getUserTournaments(uid);

      let welcomeText=`🏆 <b>Turnir</b>\n\nAssalomu alaykum, <b>${from.first_name}</b>!\n\nBu bo\'limda sport turnirlarida qatnashib, sovrinlar yutib olishingiz mumkin! 🎮\n\n`;
      welcomeText+=`📌 <b>Qanday ishlaydi:</b>\n`;
      welcomeText+=`1️⃣ Turnirni tanlang\n`;
      welcomeText+=`2️⃣ Kirish narxini to\'lang\n`;
      welcomeText+=`3️⃣ PUBG ID va nikingizni kiriting\n`;
      welcomeText+=`4️⃣ Turnir sanasida qatnashing!\n\n`;
      welcomeText+=`🎯 Faol turnirlar: <b>${tournaments.length} ta</b>`;

      const btns=[];
      if(tournaments.length) btns.push([{text:'🏆 Turnirlar',callback_data:'turnir_list'}]);
      if(myT.length) btns.push([{text:'👤 Mening turnirlarim',callback_data:'my_tournaments'}]);
      btns.push([{text:'🔙 Orqaga',callback_data:'back_main'}]);

      return bot.sendMessage(chatId,welcomeText,{parse_mode:'HTML',reply_markup:{inline_keyboard:btns}});
    }

    // ========================
    // STATE HANDLERS
    // ========================

    // PROMOKOD KIRITISH
    if(state.step==='enter_promo') {
      if(!text) return;
      const code=text.trim().toUpperCase();
      const chk=checkPromo(code,uid);
      if(!chk.ok) return bot.sendMessage(chatId,chk.msg,{parse_mode:'HTML'});
      const p=chk.promo;
      markPromoUsed(code,uid);
      addBalance(uid,p.amount,`🎟 Promokod: ${code}`);
      const newBal=getBalance(uid);
      clearState(uid);
      return bot.sendMessage(chatId,
        `🎉 <b>Promokod muvaffaqiyatli ishlatildi!</b>\n\n🎟 Kod: <code>${code}</code>\n💸 Qo\'shildi: <b>${fmt(p.amount)}</b>\n💳 Yangi balans: <b>${fmt(newBal)}</b>\n\n🛒 Endi xarid qilishingiz mumkin!`,
        {parse_mode:'HTML',reply_markup:mainKeyboard()}
      );
    }

    // GAME ID
    if(state.step==='enter_id') {
      if(!text) return bot.sendMessage(chatId,'⚠️ Matn kiriting!');
      const product=getProductById(state.selectedProduct);
      if(!product) return;
      let cleanId=text.trim().replace(/\s+/g,'');
      if(!/^\d+$/.test(cleanId)) return bot.sendMessage(chatId,`❌ Faqat raqamlar kiriting!\nMasalan: <code>512345678</code>`,{parse_mode:'HTML'});
      if(cleanId.length>15) return bot.sendMessage(chatId,'❌ ID maksimum 15 ta raqam!');
      setState(uid,{gameId:cleanId,step:'enter_nick'});
      return bot.sendMessage(chatId,`✅ ID: <code>${cleanId}</code>\n\n👤 Endi <b>nikneymingizni</b> yozing:`,{parse_mode:'HTML',reply_markup:cancelBtn()});
    }

    // NIK
    if(state.step==='enter_nick') {
      if(!text||text.trim().length<2) return bot.sendMessage(chatId,'⚠️ Nikneym noto\'g\'ri!');
      const nik=text.trim().slice(0,30);
      const product=getProductById(state.selectedProduct);
      if(!product) return;
      const g=gameInfo(product.type);
      const finalPrice=(state.finalPrice!==undefined&&state.finalPrice!==null)?state.finalPrice:product.price;
      setState(uid,{gameNick:nik,step:'confirm_step'});
      return bot.sendMessage(chatId,
        `📋 <b>Buyurtma ma\'lumotlari:</b>\n\n${g.emoji} <b>${g.name} — ${product.name}</b>\n🆔 ID: <code>${state.gameId}</code>\n👤 Nik: <b>${nik}</b>\n💰 Narx: <b>${fmt(finalPrice)}</b>\n\nTasdiqlaysizmi?`,
        {parse_mode:'HTML',reply_markup:confirmBtn(state.selectedProduct)}
      );
    }

    // TO'LDIRISH MIQDORI (matn)
    if(state.step==='enter_amount') {
      if(!text) return;
      const amount=parseInt(text.replace(/[\s,]/g,''));
      if(isNaN(amount)||amount<5000) return bot.sendMessage(chatId,'❌ Minimum 5,000 so\'m!');
      if(amount>150000) return bot.sendMessage(chatId,'❌ Maksimum 150,000 so\'m!');
      setState(uid,{step:'send_receipt',topupAmount:amount});
      return sendPayment(chatId,null,amount,false);
    }

    // CHEK
    if(state.step==='send_receipt') {
      const amount=state.topupAmount; if(!amount) return;
      let fileId=null,fileType=null;
      if(photo)    { fileId=photo[photo.length-1].file_id; fileType='photo'; }
      else if(document) { fileId=document.file_id; fileType='document'; }
      if(!fileId) return bot.sendMessage(chatId,`📸 Chekni <b>rasm yoki fayl</b> sifatida yuboring!`,{parse_mode:'HTML'});
      const reqId=createTopupReq(uid,amount,fileId,fileType);
      clearState(uid);
      await bot.sendMessage(chatId,`✅ <b>Chek qabul qilindi!</b>\n\n📋 So\'rov #${reqId}\n💰 <b>${fmt(amount)}</b>\n\n⏳ Admin tasdig\'ini kuting (5-30 daqiqa)`,{parse_mode:'HTML',reply_markup:mainKeyboard()});
      const user=getUser(uid);
      const name=user?.username?`@${user.username}`:(user?.full_name||`ID: ${uid}`);
      const cap=`💰 <b>Yangi to\'ldirish #${reqId}</b>\n\n👤 ${name} (${uid})\n💰 <b>${fmt(amount)}</b>`;
      for(const adminId of ADMIN_IDS) {
        try {
          if(fileType==='photo') await bot.sendPhoto(adminId,fileId,{caption:cap,parse_mode:'HTML',reply_markup:atmBtn(reqId)});
          else await bot.sendDocument(adminId,fileId,{caption:cap,parse_mode:'HTML',reply_markup:atmBtn(reqId)});
        } catch(e) { console.error('Admin xabar:',e.message); }
      }
    }

    // ADMIN: BALANS QO'SHISH
    if(state.step==='adm_give_add'&&isAdmin(uid)) {
      if(!text) return;
      const parts=text.trim().split(/\s+/);
      if(parts.length<2) return bot.sendMessage(chatId,'❌ Format: <code>ID MIQDOR</code>',{parse_mode:'HTML'});
      const targetId=parseInt(parts[0]); const amount=parseInt(parts[1]);
      if(isNaN(targetId)||isNaN(amount)||amount<=0) return bot.sendMessage(chatId,'❌ Noto\'g\'ri format!');
      const tu=getUser(targetId);
      if(!tu) return bot.sendMessage(chatId,`❌ Foydalanuvchi topilmadi: ${targetId}`);
      addBalance(targetId,amount,'Admin tomonidan qo\'shildi');
      clearState(uid);
      const newBal=getBalance(targetId);
      const tName=tu.username?`@${tu.username}`:(tu.full_name||`ID: ${targetId}`);
      await bot.sendMessage(chatId,`✅ ${tName} ga <b>${fmt(amount)}</b> qo\'shildi.\nYangi balans: <b>${fmt(newBal)}</b>`,{parse_mode:'HTML'});
      await bot.sendMessage(targetId,`💳 <b>Hisobingizga ${fmt(amount)} qo\'shildi!</b>\n\nYangi balans: <b>${fmt(newBal)}</b>`,{parse_mode:'HTML',reply_markup:mainKeyboard()}).catch(()=>{});
    }

    // ADMIN: BALANS AYIRISH
    if(state.step==='adm_give_sub'&&isAdmin(uid)) {
      if(!text) return;
      const parts=text.trim().split(/\s+/);
      if(parts.length<2) return bot.sendMessage(chatId,'❌ Format: <code>ID MIQDOR</code>',{parse_mode:'HTML'});
      const targetId=parseInt(parts[0]); const amount=parseInt(parts[1]);
      if(isNaN(targetId)||isNaN(amount)||amount<=0) return bot.sendMessage(chatId,'❌ Noto\'g\'ri format!');
      const tu=getUser(targetId);
      if(!tu) return bot.sendMessage(chatId,`❌ Foydalanuvchi topilmadi: ${targetId}`);
      const deducted=deductBalance(targetId,amount,'Admin tomonidan ayirildi');
      clearState(uid);
      if(!deducted) return bot.sendMessage(chatId,`❌ Balans yetarli emas! Foydalanuvchi balansi: ${fmt(tu.balance)}`);
      const newBal=getBalance(targetId);
      const tName=tu.username?`@${tu.username}`:(tu.full_name||`ID: ${targetId}`);
      await bot.sendMessage(chatId,`✅ ${tName} dan <b>${fmt(amount)}</b> ayirildi.\nYangi balans: <b>${fmt(newBal)}</b>`,{parse_mode:'HTML'});
      await bot.sendMessage(targetId,`⚠️ <b>Hisobingizdan ${fmt(amount)} ayirildi.</b>\n\nYangi balans: <b>${fmt(newBal)}</b>`,{parse_mode:'HTML',reply_markup:mainKeyboard()}).catch(()=>{});
    }

    // ADMIN: FOYDALANUVCHI QIDIRISH
    if(state.step==='adm_search'&&isAdmin(uid)) {
      if(!text) return;
      const targetId=parseInt(text.trim());
      if(isNaN(targetId)) return bot.sendMessage(chatId,'❌ Faqat ID raqam kiriting!');
      const tu=getUser(targetId);
      clearState(uid);
      if(!tu) return bot.sendMessage(chatId,`❌ Foydalanuvchi topilmadi: <code>${targetId}</code>`,{parse_mode:'HTML'});
      const txs=loadDB().transactions.filter(t=>t.telegram_id===targetId).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,5);
      const orders=getUserOrders(targetId).slice(0,5);
      const tName=tu.username?`@${tu.username}`:(tu.full_name||'Nomaʼlum');
      let infoText=`🔍 <b>Foydalanuvchi ma'lumotlari</b>\n\n`;
      infoText+=`👤 Ism: <b>${tu.full_name||'Nomaʼlum'}</b>\n`;
      infoText+=`🔖 Username: ${tu.username?`@${tu.username}`:'Yoʼq'}\n`;
      infoText+=`🆔 ID: <code>${tu.telegram_id}</code>\n`;
      infoText+=`💰 Balans: <b>${fmt(tu.balance)}</b>\n`;
      infoText+=`💸 Jami sarflagan: <b>${fmt(tu.total_spent)}</b>\n`;
      infoText+=`📅 Qoʼshilgan: ${new Date(tu.joined_at).toLocaleDateString('uz')}\n`;
      if(orders.length) {
        infoText+=`\n📦 <b>Soʼnggi buyurtmalar:</b>\n`;
        orders.forEach(o=>{
          const s=o.status==='completed'?'✅':o.status==='pending'?'⏳':'❌';
          infoText+=`${s} #${o.id} ${o.product_name} — ${fmt(o.price)}\n`;
        });
      }
      if(txs.length) {
        infoText+=`\n💳 <b>Soʼnggi tranzaksiyalar:</b>\n`;
        txs.forEach(t=>{ infoText+=`${t.amount>0?'+':''}${fmt(Math.abs(t.amount))} — ${t.description}\n`; });
      }
      return bot.sendMessage(chatId,infoText,{parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'🔙 Admin',callback_data:'adm_back'}]]}});
    }

    // ADMIN: FOYDALANUVCHIGA XABAR — ID KIRITISH
    if(state.step==='adm_msg_user_id'&&isAdmin(uid)) {
      if(!text) return;
      const targetId=parseInt(text.trim());
      if(isNaN(targetId)) return bot.sendMessage(chatId,'❌ Faqat ID kiriting!');
      const tu=getUser(targetId);
      if(!tu) return bot.sendMessage(chatId,`❌ Foydalanuvchi topilmadi: ${targetId}`);
      setState(uid,{...state,step:'adm_msg_user_photo',msgTargetId:targetId});
      const tName=tu.username?`@${tu.username}`:(tu.full_name||`ID: ${targetId}`);
      return bot.sendMessage(chatId,
        `👤 Foydalanuvchi: <b>${tName}</b>\n\nRasm yuboring (ixtiyoriy):`,
        {parse_mode:'HTML',reply_markup:{inline_keyboard:[
          [{text:"🚫 Rasmni o'tkazib yuborish",callback_data:'adm_msg_skip_photo'}],
          [{text:'❌ Bekor',callback_data:'adm_back'}]
        ]}}
      );
    }
    if(state.step==='adm_msg_user_photo'&&isAdmin(uid)) {
      if(photo) {
        const photoId=photo[photo.length-1].file_id;
        setState(uid,{...state,step:'adm_msg_user_text',msgPhoto:photoId});
        return bot.sendMessage(chatId,'✅ Rasm qabul qilindi!\n\nEndi matnni kiriting:',{reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_back'}]]}});
      }
    }
    if(state.step==='adm_msg_user_text'&&isAdmin(uid)) {
      if(!text) return;
      setState(uid,{...state,step:'adm_msg_confirm',msgText:text});
      return bot.sendMessage(chatId,
        `📋 <b>Xabar ko\'rib chiqish:</b>\n\n${text}\n\n${state.msgPhoto?'📷 Rasm: bor':'📷 Rasm: yoq'}\n\nYuborasizmi?`,
        {parse_mode:'HTML',reply_markup:{inline_keyboard:[
          [{text:'✅ Yuborish',callback_data:'adm_msg_confirm'},{text:'❌ Bekor',callback_data:'adm_back'}]
        ]}}
      );
    }

    // ADMIN: RAD ETISH
    if(state.step==='adm_reject'&&isAdmin(uid)) {
      const req=rejectTopup(state.rejectId,uid,text);
      if(!req) return bot.sendMessage(chatId,'❌ Topilmadi!');
      clearState(uid);
      await bot.sendMessage(chatId,`✅ So\'rov #${req.id} rad etildi.`);
      await bot.sendMessage(req.telegram_id,`❌ <b>To\'ldirish rad etildi</b>\n\n📋 #${req.id} | 💰 ${fmt(req.amount)}\n\n📝 Sabab: <b>${text}</b>`,{parse_mode:'HTML',reply_markup:mainKeyboard()});
    }

    // ADMIN: BROADCAST — rasm
    if(state.step==='adm_broadcast'&&isAdmin(uid)) {
      if(photo) {
        const photoId=photo[photo.length-1].file_id;
        setState(uid,{...state,step:'adm_broadcast_text',broadPhoto:photoId});
        return bot.sendMessage(chatId,'✅ Rasm qabul qilindi!\n\nEndi matnni kiriting:',{reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_back'}]]}});
      }
    }
    if(state.step==='adm_broadcast_text'&&isAdmin(uid)) {
      if(!text) return;
      clearState(uid);
      const users=getAllUsers(); let sent=0,failed=0;
      await bot.sendMessage(chatId,`📢 Yuborilmoqda... (${users.length} ta)`);
      for(const u of users) {
        try {
          if(state.broadPhoto) {
            await bot.sendPhoto(u.telegram_id,state.broadPhoto,{caption:`📢 <b>Admin xabari:</b>\n\n${text}`,parse_mode:'HTML'});
          } else {
            await bot.sendMessage(u.telegram_id,`📢 <b>Admin xabari:</b>\n\n${text}`,{parse_mode:'HTML'});
          }
          sent++; await new Promise(r=>setTimeout(r,50));
        } catch { failed++; }
      }
      return bot.sendMessage(chatId,`✅ Tugadi! Yuborildi: ${sent} | Xato: ${failed}`);
    }

    // ADMIN: PROMO KOD KIRITISH
    if(state.step==='adm_promo_code'&&isAdmin(uid)) {
      if(!text) return;
      const code=text.trim().toUpperCase().replace(/\s+/g,'');
      if(code.length<2||code.length>20) return bot.sendMessage(chatId,'❌ Kod 2-20 belgi bo\'lishi kerak!');
      if(getPromo(code)) return bot.sendMessage(chatId,`❌ <b>${code}</b> allaqachon mavjud! Boshqa kod yozing:`,{parse_mode:'HTML'});
      setState(uid,{step:'adm_promo_amount_text',promoData:{code}});
      return bot.sendMessage(chatId,
        `✅ Kod: <code>${code}</code>\n\n2️⃣ Necha so\'m berilsin? Raqam yozing:`,
        {parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_promos'}]]}}
      );
    }

    // ADMIN: PROMO MIQDOR
    if(state.step==='adm_promo_amount_text'&&isAdmin(uid)) {
      if(!text) return;
      const amount=parseInt(text.trim().replace(/[\s,]/g,''));
      if(isNaN(amount)||amount<100) return bot.sendMessage(chatId,'❌ Minimum 100 so\'m kiriting!');
      const state2=getState(uid);
      setState(uid,{...state2,promoData:{...state2.promoData,amount},step:'adm_promo_maxuses'});
      return bot.sendMessage(chatId,
        `✅ Bonus: <b>${fmt(amount)}</b>\n\n3️⃣ Nechta odam ishlatishi mumkin?`,
        {parse_mode:'HTML',reply_markup:{inline_keyboard:[
          [{text:'1 kishi',callback_data:'adm_promo_uses_1'},{text:'5 kishi',callback_data:'adm_promo_uses_5'},{text:'10 kishi',callback_data:'adm_promo_uses_10'}],
          [{text:'50 kishi',callback_data:'adm_promo_uses_50'},{text:'100 kishi',callback_data:'adm_promo_uses_100'},{text:'✏️ Boshqa',callback_data:'adm_promo_uses_custom'}],
          [{text:'❌ Bekor',callback_data:'adm_promos'}]
        ]}}
      );
    }

    // ADMIN: PROMO MAX USES (matn)
    if(state.step==='adm_promo_maxuses'&&isAdmin(uid)) {
      if(!text) return;
      const maxUses=parseInt(text.trim());
      if(isNaN(maxUses)||maxUses<1) return bot.sendMessage(chatId,'❌ 1 dan katta raqam kiriting!');
      const state2=getState(uid);
      const pd=state2.promoData;
      createPromo(pd.code,pd.amount,maxUses);
      clearState(uid);
      return bot.sendMessage(chatId,
        `✅ <b>Promokod yaratildi!</b>\n\n🎟 Kod: <code>${pd.code}</code>\n💸 Bonus: <b>${fmt(pd.amount)}</b>\n👥 Limit: <b>${maxUses} ta odam</b>\n⏰ 12 soatdan keyin avtomatik o\'chadi`,
        {parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'🎟 Promokodlar',callback_data:'adm_promos'}]]}}
      );
    }

    // ADMIN: PROMO O'CHIRISH
    if(state.step==='adm_del_promo'&&isAdmin(uid)) {
      if(!text) return;
      const code=text.trim().toUpperCase();
      clearState(uid);
      return bot.sendMessage(chatId,
        deletePromo(code)?`✅ <b>${code}</b> o\'chirildi.`:`❌ <b>${code}</b> topilmadi.`,
        {parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'🎟 Promokodlar',callback_data:'adm_promos'}]]}}
      );
    }

    // TURNIR — ID kiritish
    if(state.step==='turnir_enter_id') {
      if(!text) return;
      let cleanId=text.trim().replace(/\s+/g,'');
      if(!/^\d+$/.test(cleanId)) return bot.sendMessage(chatId,'❌ Faqat raqamlar kiriting!');
      if(cleanId.length>15) return bot.sendMessage(chatId,'❌ ID maksimum 15 ta raqam!');
      setState(uid,{...state,turnirGameId:cleanId,step:'turnir_enter_nick'});
      return bot.sendMessage(chatId,
        `✅ ID: <code>${cleanId}</code>\n\n👤 Endi nikneymingizni yozing:`,
        {parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'back_main'}]]}}
      );
    }

    // TURNIR — Nik kiritish
    if(state.step==='turnir_enter_nick') {
      if(!text||text.trim().length<2) return bot.sendMessage(chatId,'⚠️ Nikneym noto\'g\'ri!');
      const nik=text.trim().slice(0,30);
      const tid2=state.joinTournamentId;
      const t=getTournament(tid2);
      setState(uid,{...state,turnirNick:nik,step:'turnir_confirm'});
      return bot.sendMessage(chatId,
        `📋 <b>Turnirga qo\'shilish:</b>\n\n🏆 ${t?.name||'Turnir'}\n🆔 ID: <code>${state.turnirGameId}</code>\n👤 Nik: <b>${nik}</b>\n💰 Kirish narxi: <b>${fmt(t?.entry_fee||0)}</b>\n\nTasdiqlaysizmi?`,
        {parse_mode:'HTML',reply_markup:{inline_keyboard:[
          [{text:'✅ Tasdiqlash',callback_data:`turnir_confirm_${tid2}`},{text:'✏️ Tahrirlash',callback_data:`turnir_join_${tid2}`}]
        ]}}
      );
    }

    // ADMIN TURNIR: VAQT KIRITISH
    if(state.step==='adm_t_time'&&isAdmin(uid)) {
      if(!text) return;
      const timeRegex=/^\d{1,2}:\d{2}$/;
      if(!timeRegex.test(text.trim())) return bot.sendMessage(chatId,'❌ Format xato! Masalan: <code>14:00</code>',{parse_mode:'HTML'});
      setState(uid,{...state,tData:{...state.tData,time:text.trim()},step:'adm_t_name'});
      return bot.sendMessage(chatId,`✅ Soat: <b>${text.trim()}</b>\n\n4️⃣ Turnir nomi nima?`,{parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_tournaments'}]]}});
    }

    // ADMIN TURNIR: NOMI
    if(state.step==='adm_t_name'&&isAdmin(uid)) {
      if(!text) return;
      setState(uid,{...state,tData:{...state.tData,name:text.trim()},step:'adm_t_map'});
      return bot.sendMessage(chatId,
        `✅ Nom: <b>${text.trim()}</b>\n\n5️⃣ Xarita?`,
        {parse_mode:'HTML',reply_markup:{inline_keyboard:[
          MAP_NAMES.map(m=>({text:m,callback_data:`adm_t_setmap_${m}`})),
          [{text:'❌ Bekor',callback_data:'adm_tournaments'}]
        ]}}
      );
    }

    // ADMIN TURNIR: KIRISH NARXI
    if(state.step==='adm_t_fee'&&isAdmin(uid)) {
      if(!text) return;
      const fee=parseInt(text.trim().replace(/[\s,]/g,''));
      if(isNaN(fee)||fee<0) return bot.sendMessage(chatId,'❌ To\'g\'ri narx kiriting!');
      setState(uid,{...state,tData:{...state.tData,entry_fee:fee},step:'adm_t_slots'});
      return bot.sendMessage(chatId,`✅ Kirish narxi: <b>${fmt(fee)}</b>\n\n8️⃣ Necha slot? (Turnirga necha kishi kira oladi)`,{parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_tournaments'}]]}});
    }

    // ADMIN TURNIR: SLOTLAR
    if(state.step==='adm_t_slots'&&isAdmin(uid)) {
      if(!text) return;
      const slots=parseInt(text.trim());
      if(isNaN(slots)||slots<2) return bot.sendMessage(chatId,'❌ Kamida 2 slot kiriting!');
      const td=state.tData;
      const tid2=createTournament({...td,slots});
      clearState(uid);
      return bot.sendMessage(chatId,
        `✅ <b>Turnir muvaffaqiyatli qo\'shildi!</b>\n\n🏆 ${td.name}\n📅 ${td.day} ${MONTHS[td.month-1]} | ⏰ ${td.time}\n🗺 ${td.map} | 🎮 ${td.mode}\n💰 Kirish: ${fmt(td.entry_fee)}\n🎯 Slotlar: ${slots}\n🆔 Turnir ID: <b>#${tid2}</b>`,
        {parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'🏆 Turnirlar',callback_data:'adm_tournaments'}]]}}
      );
    }

    // ADMIN TURNIR: O'CHIRISH ID
    if(state.step==='adm_t_delete_id'&&isAdmin(uid)) {
      if(!text) return;
      const tid2=parseInt(text.trim());
      if(isNaN(tid2)) return bot.sendMessage(chatId,'❌ ID raqam kiriting!');
      const t=getTournament(tid2);
      clearState(uid);
      if(!t) return bot.sendMessage(chatId,`❌ Turnir topilmadi: #${tid2}`,{reply_markup:{inline_keyboard:[[{text:'🔙 Orqaga',callback_data:'adm_tournaments'}]]}});
      return bot.sendMessage(chatId,
        `⚠️ <b>${t.name}</b> turnirini o\'chirmoqchimisiz?\n\n👥 Qatnashchilar: ${t.participants.length} ta`,
        {parse_mode:'HTML',reply_markup:{inline_keyboard:[
          [{text:'🗑 Ha, o\'chirish',callback_data:`adm_t_confirm_del_${tid2}`},{text:'❌ Yo\'q',callback_data:'adm_tournaments'}]
        ]}}
      );
    }

    // ADMIN TURNIR: TAHRIRLASH
    if(state.step==='adm_t_edit_id'&&isAdmin(uid)) {
      if(!text) return;
      const tid2=parseInt(text.trim());
      if(isNaN(tid2)) return bot.sendMessage(chatId,'❌ ID raqam kiriting!');
      const t=getTournament(tid2);
      clearState(uid);
      if(!t) return bot.sendMessage(chatId,`❌ Turnir topilmadi: #${tid2}`);
      return bot.sendMessage(chatId,
        `✏️ <b>${t.name}</b>\n\nYangi nomini kiriting (o\'zgartirmaslik uchun "-" yozing):`,
        {parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_tournaments'}]]}}
      );
    }

    // NOMA'LUM
    if(text&&!state.step) {
      return bot.sendMessage(chatId,'🎮 <b>Game Shop</b>\n\n👇 Pastdagi menyudan tanlang:',{parse_mode:'HTML',reply_markup:mainKeyboard()});
    }

  } catch(err) { console.error('Message xato:',err.message); }
});

// ========================
// REFERRAL — /start ref_
// ========================
bot.onText(/\/start ref_(.+)/, async (msg, match) => {
  const from=msg.from;
  const referId=parseInt(match[1]);
  if(referId&&referId!==from.id) {
    const d=loadDB(); const newId=String(from.id); const refId=String(referId);
    if(d.users[newId]&&d.users[refId]&&!d.users[newId].referred_by) {
      d.users[newId].referred_by=refId;
      addBalance(referId,250,'Referal bonusi');
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
console.log('🚀 Game Shop Bot ishga tushdi!');
console.log(`👥 Adminlar: ${ADMIN_IDS.join(', ')}`);
