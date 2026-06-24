require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs   = require('fs');
const path = require('path');
const http = require('http');

// ========================
// CONFIG
// ========================
const BOT_TOKEN        = process.env.BOT_TOKEN;
const ADMIN_IDS        = (process.env.ADMIN_IDS || '').split(',').map(id => parseInt(id.trim())).filter(Boolean);
const GEMINI_KEY       = process.env.GEMINI_API_KEY;
const PORT             = process.env.PORT || 3000;
const CHANNEL          = '@bulldrop_n1';
const CHANNEL_URL      = 'https://t.me/bulldrop_n1';
const SITE_URL         = 'https://mukxabek-prog.github.io/autouc.html/';

if (!BOT_TOKEN) { console.error('❌ BOT_TOKEN topilmadi!'); process.exit(1); }

const bot        = new TelegramBot(BOT_TOKEN, { polling: true });
const userStates = {};
let   genAI      = null;
if (GEMINI_KEY) genAI = new GoogleGenerativeAI(GEMINI_KEY);

// ========================
// DATABASE
// ========================
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE  = path.join(DATA_DIR, 'db.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DEFAULT_DB = {
  users: {}, orders: [], topup_requests: [], transactions: [],
  next_order_id: 1, next_topup_id: 1, promocodes: {},
  products: {
    uc:         [ {id:1,type:'uc',name:'60 UC',price:12500},{id:2,type:'uc',name:'325 UC',price:60000},{id:3,type:'uc',name:'660 UC',price:120000},{id:4,type:'uc',name:'1800 UC',price:290000},{id:5,type:'uc',name:'3850 UC',price:575000},{id:6,type:'uc',name:'8100 UC',price:1130000},{id:34,type:'uc',name:'16200 UC',price:2265000},{id:35,type:'uc',name:'24300 UC',price:3400000},{id:36,type:'uc',name:'32400 UC',price:4550000},{id:37,type:'uc',name:'40500 UC',price:5770000} ],
    popularity: [ {id:7,type:'popularity',name:'20K PP',price:20000},{id:8,type:'popularity',name:'50K PP',price:50000},{id:9,type:'popularity',name:'100K PP',price:90000},{id:10,type:'popularity',name:'150K PP',price:140000},{id:38,type:'popularity',name:'200K PP',price:185000} ],
    diamond:    [ {id:11,type:'diamond',name:'100 Diamond',price:18000},{id:12,type:'diamond',name:'310 Diamond',price:52000},{id:13,type:'diamond',name:'520 Diamond',price:85000},{id:14,type:'diamond',name:'1060 Diamond',price:165000},{id:15,type:'diamond',name:'2180 Diamond',price:330000},{id:16,type:'diamond',name:'5600 Diamond',price:820000} ],
    gems:       [ {id:17,type:'gems',name:'80 Gems',price:12000},{id:18,type:'gems',name:'500 Gems',price:65000},{id:19,type:'gems',name:'1200 Gems',price:150000},{id:20,type:'gems',name:'2500 Gems',price:300000},{id:21,type:'gems',name:'6500 Gems',price:750000},{id:22,type:'gems',name:'14000 Gems',price:1500000} ],
    mlbb:       [ {id:23,type:'mlbb',name:'86 Diamonds',price:20000},{id:24,type:'mlbb',name:'172 Diamonds',price:38000},{id:25,type:'mlbb',name:'257 Diamonds',price:55000},{id:26,type:'mlbb',name:'706 Diamonds',price:145000},{id:27,type:'mlbb',name:'1412 Diamonds',price:280000},{id:28,type:'mlbb',name:'2195 Diamonds',price:420000} ],
    robux:      [ {id:29,type:'robux',name:'400 Robux',price:45000},{id:30,type:'robux',name:'800 Robux',price:85000},{id:31,type:'robux',name:'1700 Robux',price:170000},{id:32,type:'robux',name:'4500 Robux',price:420000},{id:33,type:'robux',name:'10000 Robux',price:900000} ]
  }
};

function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const d = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      for (const k of Object.keys(DEFAULT_DB.products)) if (!d.products[k]) d.products[k] = DEFAULT_DB.products[k];
      if (!d.promocodes) d.promocodes = {};
      return d;
    }
  } catch(e) {}
  return JSON.parse(JSON.stringify(DEFAULT_DB));
}
function saveDB(d) { try { fs.writeFileSync(DB_FILE, JSON.stringify(d,null,2)); } catch(e) { console.error('DB xato:',e.message); } }

// USER
function getOrCreateUser(tid, username, fullName) {
  const d = loadDB(); const id = String(tid);
  if (!d.users[id]) d.users[id] = { telegram_id:tid, username:username||null, full_name:fullName||null, balance:0, total_spent:0, joined_at:new Date().toISOString(), used_promos:[] };
  else { if(username) d.users[id].username=username; if(fullName) d.users[id].full_name=fullName; if(!d.users[id].used_promos) d.users[id].used_promos=[]; }
  saveDB(d); return d.users[id];
}
function getUser(tid)    { const d=loadDB(); return d.users[String(tid)]||null; }
function getBalance(tid) { const u=getUser(tid); return u?u.balance:0; }
function getAllUsers()    { return Object.values(loadDB().users); }

function addBalance(tid, amount, desc) {
  const d=loadDB(); const id=String(tid); if(!d.users[id]) return;
  d.users[id].balance+=amount;
  d.transactions.push({telegram_id:tid,type:'topup',amount,description:desc||"To'ldirish",created_at:new Date().toISOString()});
  saveDB(d);
}
function deductBalance(tid, amount, desc) {
  const d=loadDB(); const id=String(tid);
  if(!d.users[id]||d.users[id].balance<amount) return false;
  d.users[id].balance-=amount; d.users[id].total_spent+=amount;
  d.transactions.push({telegram_id:tid,type:'purchase',amount:-amount,description:desc||'Xarid',created_at:new Date().toISOString()});
  saveDB(d); return true;
}
function getLastTxs(tid) { return loadDB().transactions.filter(t=>t.telegram_id===tid).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,5); }

// TOPUP
function createTopupReq(tid, amount, fileId, fileType) {
  const d=loadDB(); const id=d.next_topup_id++;
  d.topup_requests.push({id,telegram_id:tid,amount,receipt_file_id:fileId,receipt_type:fileType,status:'pending',created_at:new Date().toISOString()});
  saveDB(d); return id;
}
function getPendingTopups() { return loadDB().topup_requests.filter(r=>r.status==='pending'); }
function approveTopup(id, adminId) {
  const d=loadDB(); const req=d.topup_requests.find(r=>r.id===parseInt(id));
  if(!req||req.status!=='pending') return false;
  req.status='approved'; req.reviewed_by=adminId; req.reviewed_at=new Date().toISOString();
  saveDB(d); addBalance(req.telegram_id,req.amount,`To'ldirish #${id} tasdiqlandi`); return req;
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
  d.orders.push({id,telegram_id:tid,product_type:type,product_name:name,price,original_price:origPrice,game_id:gameId,game_nick:gameNick||'-',promo_used:promoUsed||null,status:'pending',created_at:new Date().toISOString(),completed_at:null});
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
  return { users:Object.keys(d.users).length, orders:done.length, revenue:done.reduce((s,o)=>s+o.price,0), pendingTopups:d.topup_requests.filter(r=>r.status==='pending').length, pendingOrders:d.orders.filter(o=>o.status==='pending').length, totalPromos:Object.keys(d.promocodes).length };
}

// PROMOKODLAR
function createPromo(code, discount, type, productName, productId, maxUses) {
  const d=loadDB(); const k=code.toUpperCase();
  d.promocodes[k]={
    code:k, discount,
    type: type,
    productName: productName,
    productId: productId||null,
    maxUses: maxUses||1,
    usedBy:[],
    created_at:new Date().toISOString(),
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
function checkPromo(code, tid, productType, productId) {
  const promo=getPromo(code);
  if(!promo)              return {ok:false,msg:'❌ Promokod topilmadi!'};
  if(!promo.is_active)    return {ok:false,msg:'❌ Promokod faol emas!'};
  if(promo.usedBy.length>=promo.maxUses) return {ok:false,msg:'❌ Promokod tugagan! (limit toldi)'};
  if(promo.usedBy.map(String).includes(String(tid))) return {ok:false,msg:'❌ Siz bu promokodni allaqachon ishlatgansiz!'};
  // O'yin turi tekshirish
  if(productType && promo.type !== productType) {
    const names={uc:'PUBG UC',popularity:'Popularity (PP)',diamond:'FF Diamond',gems:'CoC Gems',mlbb:'MLBB Diamond',robux:'Robux'};
    return {ok:false,msg:`❌ Bu promokod faqat <b>${names[promo.type]||promo.type}</b> uchun!`};
  }
  // Aniq mahsulot tekshirish (productId berilgan bo'lsa)
  if(promo.productId && productId && promo.productId !== productId) {
    return {ok:false,msg:`❌ Bu promokod faqat <b>${promo.productName}</b> uchun!`};
  }
  return {ok:true,discount:promo.discount,promo};
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
    `🔒 <b>Botdan foydalanish uchun kanalga obuna bo'ling!</b>\n\n` +
    `📢 Kanal: ${CHANNEL}\n\n` +
    `Obuna bo'lgandan so'ng "✅ Tekshirish" tugmasini bosing.`,
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
    uc:        {name:'PUBG Mobile',   emoji:'🎮',currency:'UC',       idLabel:'PUBG ID (faqat raqam, max 15)'},
    popularity:{name:'PUBG Mobile',   emoji:'⭐',currency:'Popularity',idLabel:'PUBG ID (faqat raqam, max 15)'},
    diamond:   {name:'Free Fire',     emoji:'🔥',currency:'Diamond',  idLabel:'Free Fire ID (faqat raqam)'},
    gems:      {name:'Clash of Clans',emoji:'⚔️',currency:'Gems',     idLabel:'CoC Tag (masalan: #ABC1234)'},
    mlbb:      {name:'Mobile Legends',emoji:'🌟',currency:'Diamond',  idLabel:'MLBB ID (faqat raqam)'},
    robux:     {name:'Roblox',        emoji:'🟥',currency:'Robux',    idLabel:'Roblox username'}
  }[type]||{name:type,emoji:'🎮',currency:type,idLabel:'ID'};
}

// ========================
// AI CHAT
// ========================
const aiHistories = {};
async function askGemini(uid, msg) {
  if(!genAI) throw new Error('GEMINI_API_KEY yoq');
  if(!aiHistories[uid]) aiHistories[uid]=[];
  const model=genAI.getGenerativeModel({model:'gemini-1.5-flash',systemInstruction:'Siz Game Shop Telegram botining AI yordamchisisiz. O\'zbek tilida muloyimlik bilan muloqot qiling. Qisqa va aniq javob bering.'});
  const chat=model.startChat({history:aiHistories[uid]});
  const res=await chat.sendMessage(msg);
  const reply=res.response.text();
  aiHistories[uid].push({role:'user',parts:[{text:msg}]});
  aiHistories[uid].push({role:'model',parts:[{text:reply}]});
  if(aiHistories[uid].length>20) aiHistories[uid]=aiHistories[uid].slice(-20);
  return reply;
}

// ========================
// KEYBOARDS
// ========================
const CAT_BTNS = {
  '🎮 PUBG — UC':               'uc',
  '⭐ PUBG — Popularity':       'popularity',
  '🔥 Free Fire — Diamond':     'diamond',
  '⚔️ Clash of Clans — Gems':   'gems',
  '🌟 Mobile Legends — Diamond':'mlbb',
  '🟥 Roblox — Robux':          'robux'
};
const BTN_TOPUP   = '💰 Hisobni to\'ldirish';
const BTN_ACCOUNT = '👤 Mening hisobim';
const BTN_ORDERS  = '📋 Buyurtmalarim';
const BTN_SUPPORT = '📞 Yordam';
const BTN_PROMO   = '🎟 Promokod kiritish';
const BTN_AI      = '🤖 AI bilan suhbat';

function mainKeyboard() {
  return {
    keyboard:[
      ['🎮 PUBG — UC',           '⭐ PUBG — Popularity'],
      ['🔥 Free Fire — Diamond', '⚔️ Clash of Clans — Gems'],
      ['🌟 Mobile Legends — Diamond','🟥 Roblox — Robux'],
      [BTN_TOPUP,  BTN_ACCOUNT],
      [BTN_ORDERS, BTN_PROMO],
      [BTN_AI,     BTN_SUPPORT]
    ],
    resize_keyboard:true, is_persistent:true
  };
}
function productsMenu(products) {
  const rows=[];
  for(let i=0;i<products.length;i+=2){
    const row=[{text:products[i].name+' — '+fmt(products[i].price),callback_data:'product_'+products[i].id}];
    if(products[i+1]) row.push({text:products[i+1].name+' — '+fmt(products[i+1].price),callback_data:'product_'+products[i+1].id});
    rows.push(row);
  }
  rows.push([{text:'🔙 Orqaga',callback_data:'back_main'}]);
  return {inline_keyboard:rows};
}
function topupMenu() {
  return {inline_keyboard:[
    [{text:"5,000 so'm",callback_data:'topup_5000'},{text:"10,000 so'm",callback_data:'topup_10000'}],
    [{text:"20,000 so'm",callback_data:'topup_20000'},{text:"50,000 so'm",callback_data:'topup_50000'}],
    [{text:"100,000 so'm",callback_data:'topup_100000'},{text:"200,000 so'm",callback_data:'topup_200000'}],
    [{text:"✏️ Boshqa miqdor",callback_data:'topup_custom'}],
    [{text:'🔙 Orqaga',callback_data:'back_main'}]
  ]};
}
function cancelBtn()     { return {inline_keyboard:[[{text:'❌ Bekor qilish',callback_data:'back_main'}]]}; }
function confirmBtn(pid) { return {inline_keyboard:[[{text:'✅ Tasdiqlash',callback_data:'confirm_'+pid},{text:'❌ Bekor',callback_data:'back_main'}]]}; }
function atmBtn(id)      { return {inline_keyboard:[[{text:'✅ Tasdiqlash',callback_data:'adm_ok_'+id},{text:'❌ Rad etish',callback_data:'adm_no_'+id}]]}; }
function aordBtn(id)     { return {inline_keyboard:[[{text:'✅ Bajarildi',callback_data:'adm_done_'+id},{text:'❌ Bekor',callback_data:'adm_cancel_'+id}]]}; }
function adminMenu() {
  return {inline_keyboard:[
    [{text:'📊 Statistika',callback_data:'adm_stats'}],
    [{text:'⏳ Kutayotgan to\'ldirish',callback_data:'adm_topups'},{text:'📦 Buyurtmalar',callback_data:'adm_orders'}],
    [{text:'💳 Balans berish',callback_data:'adm_give'},{text:'👥 Foydalanuvchilar',callback_data:'adm_users'}],
    [{text:'🎟 Promokodlar ro\'yxati',callback_data:'adm_promos'},{text:'➕ Promo qo\'shish',callback_data:'adm_add_promo'}],
    [{text:'🗑 Promo o\'chirish',callback_data:'adm_del_promo'},{text:'📢 Xabar yuborish',callback_data:'adm_broadcast'}]
  ]};
}

// ========================
// TO'LOV
// ========================
async function sendPayment(chatId, msgId, amount, edit) {
  const text=`💰 <b>To\'ldirish: ${fmt(amount)}</b>\n\n1️⃣ Quyidagi kartaga pul o\'tkazing:\n🏦 <code>9860 1606 2989 6350</code>\n👤 <b>Qoshaqboyev.M</b>\n\n2️⃣ Miqdor: <b>${fmt(amount)}</b>\n\n3️⃣ To\'lovdan so\'ng <b>chek (screenshot)</b> yuboring\n\n✅ Admin tasdiqlashidan so\'ng balans qo\'shiladi!`;
  const opts={parse_mode:'HTML',reply_markup:cancelBtn()};
  if(edit&&msgId) await bot.editMessageText(text,{chat_id:chatId,message_id:msgId,...opts});
  else await bot.sendMessage(chatId,text,opts);
}

// ========================
// START
// ========================
async function sendStart(chatId, from) {
  getOrCreateUser(from.id,from.username,[from.first_name,from.last_name].filter(Boolean).join(' '));
  await bot.sendMessage(chatId,
    `👋 Salom, <b>${from.first_name}</b>!\n\n🎮 <b>Game Shop</b> ga xush kelibsiz!\n\n🎮 PUBG Mobile — UC & Popularity\n🔥 Free Fire — Diamond\n⚔️ Clash of Clans — Gems\n🌟 Mobile Legends — Diamond\n🟥 Roblox — Robux\n\n💳 To\'lov admin orqali tasdiqlanadi.\n⚡ Tez va ishonchli yetkazib berish!\n\n👇 Pastdagi menyudan tanlang:`,
    {parse_mode:'HTML',reply_markup:mainKeyboard()}
  );
}

bot.onText(/\/start/, async (msg) => {
  clearState(msg.from.id);
  delete aiHistories[msg.from.id];
  const ok = await isSubscribed(msg.from.id);
  if(!ok) return sendSubRequired(msg.chat.id);
  await sendStart(msg.chat.id, msg.from);
});

bot.onText(/\/admin/, async (msg) => {
  if(!isAdmin(msg.from.id)) return bot.sendMessage(msg.chat.id,'❌ Ruxsat yo\'q!');
  const s=getStats();
  await bot.sendMessage(msg.chat.id,
    `⚙️ <b>Admin Panel</b>\n\n👥 Foydalanuvchilar: <b>${s.users}</b>\n📦 Bajarilgan: <b>${s.orders}</b>\n💰 Daromad: <b>${fmt(s.revenue)}</b>\n\n⏳ Kutayotgan to\'ldirish: <b>${s.pendingTopups}</b>\n🔄 Kutayotgan buyurtma: <b>${s.pendingOrders}</b>\n🎟 Promokodlar: <b>${s.totalPromos}</b>`,
    {parse_mode:'HTML',reply_markup:adminMenu()}
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

    // AI DAN CHIQISH
    if(data==='exit_ai') {
      clearState(uid); delete aiHistories[uid];
      try { await bot.editMessageReplyMarkup({inline_keyboard:[]},{chat_id:chatId,message_id:msgId}); } catch(e){}
      return bot.sendMessage(chatId,'✅ AI chatdan chiqdingiz.\n\n👇 Pastdagi menyudan tanlang:',{parse_mode:'HTML',reply_markup:mainKeyboard()});
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
      return bot.editMessageText(`${g.emoji} <b>${g.name} — ${g.currency}</b>\n\nPaket tanlang:`,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:productsMenu(getProducts(type))});
    }

    // MAHSULOT
    if(data.startsWith('product_')) {
      const pid=parseInt(data.split('_')[1]);
      const product=getProductById(pid);
      if(!product) return;
      const bal=getBalance(uid);
      const g=gameInfo(product.type);
      const state=getState(uid);

      // Promokod bormi?
      let finalPrice=product.price;
      let promoLine='';
      if(state.activePromo) {
        const chk=checkPromo(state.activePromo.code,uid,product.type,product.id);
        if(chk.ok) {
          finalPrice=Math.round(product.price*(1-chk.promo.discount/100));
          promoLine=`\n🎟 Promokod: <b>${state.activePromo.code}</b> (-${chk.promo.discount}%)\n💸 Asl narx: <s>${fmt(product.price)}</s>\n✅ Chegirmali: <b>${fmt(finalPrice)}</b>`;
          setState(uid,{activePromo:{code:state.activePromo.code,discount:chk.promo.discount}});
        } else {
          promoLine=`\n⚠️ ${chk.msg}`;
          finalPrice=product.price;
        }
      }
      setState(uid,{selectedProduct:pid,step:'enter_id',finalPrice});

      if(bal<finalPrice) {
        return bot.editMessageText(
          `${g.emoji} <b>${product.name}</b>\n\n💰 Narx: <b>${fmt(finalPrice)}</b>${promoLine}\n💳 Balans: <b>${fmt(bal)}</b>\n\n⚠️ <b>Balans yetarli emas!</b>\nYetishmaydi: <b>${fmt(finalPrice-bal)}</b>`,
          {chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:"💰 Hisobni to'ldirish",callback_data:'topup_menu'}],[{text:'🔙 Orqaga',callback_data:'back_main'}]]}}
        );
      }
      const idText=product.type==='robux'?`👤 Roblox <b>username</b>ingizni yuboring:\n💡 Masalan: <code>MrCool123</code>`:`🆔 <b>${g.idLabel}</b> yuboring:`;
      return bot.editMessageText(
        `${g.emoji} <b>${product.name}</b>\n\n💰 Narx: <b>${fmt(finalPrice)}</b>${promoLine}\n💳 Balans: <b>${fmt(bal)}</b>\n\n📝 ${idText}`,
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
      let promoUsed=null;

      if(state.activePromo) {
        const chk=checkPromo(state.activePromo.code,uid,product.type,product.id);
        if(chk.ok) { markPromoUsed(state.activePromo.code,uid); promoUsed=state.activePromo.code; }
      }

      let deducted=true;
      if(finalPrice>0) {
        deducted=deductBalance(uid,finalPrice,product.name+' xaridi');
        if(!deducted) return bot.editMessageText('❌ Balans yetarli emas!',{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'🏠 Menyu',callback_data:'back_main'}]]}});
      }

      const orderId=createOrder(uid,product.type,product.name,finalPrice,product.price,state.gameId,state.gameNick,promoUsed);
      clearState(uid);
      const newBal=getBalance(uid);
      const details=product.type==='robux'?`👤 Roblox Username: <b>${state.gameId}</b>`:`🆔 ID: <code>${state.gameId}</code>\n👤 Nik: <b>${state.gameNick||'-'}</b>`;
      const promoLine=promoUsed?`\n🎟 Promokod: <b>${promoUsed}</b>`:'';

      await bot.editMessageText(
        `✅ <b>Buyurtma qabul qilindi!</b>\n\n📦 #${orderId}\n${g.emoji} ${g.name}: <b>${product.name}</b>\n${details}${promoLine}\n💰 To\'langan: <b>${fmt(finalPrice)}</b>\n💳 Qolgan: <b>${fmt(newBal)}</b>\n\n⏳ <b>Admin tasdig\'ini kuting (5-15 daqiqa)</b>`,
        {chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'🏠 Bosh menyu',callback_data:'back_main'}]]}}
      );

      const fromUser=from.username?`@${from.username}`:from.first_name;
      for(const adminId of ADMIN_IDS) {
        let adminMsg=`🛒 <b>Yangi buyurtma #${orderId}</b>\n\n👤 ${fromUser} (${uid})\n${g.emoji} <b>${g.name} — ${product.name}</b>\n`;
        adminMsg+=product.type==='robux'?`👤 Roblox: <code>${state.gameId}</code>\n`:`🆔 ID: <code>${state.gameId}</code>\n👤 Nik: <b>${state.gameNick||'-'}</b>\n`;
        if(promoUsed) adminMsg+=`🎟 Promo: <b>${promoUsed}</b> (-${state.activePromo?.discount||0}%)\n`;
        adminMsg+=`💰 <b>${fmt(finalPrice)}</b>${promoUsed?` (asl: ${fmt(product.price)})` : ''}`;
        await bot.sendMessage(adminId,adminMsg,{parse_mode:'HTML',reply_markup:aordBtn(orderId)});
      }
    }

    // TO'LDIRISH
    if(data==='topup_menu') {
      return bot.editMessageText(`💰 <b>Hisobni to\'ldirish</b>\n\n📌 To\'lov usuli: Admin orqali\n📸 Chek yuboring → Admin tasdiqlaydi → Balans qo\'shiladi`,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:topupMenu()});
    }
    if(data.startsWith('topup_')&&data!=='topup_menu') {
      const val=data.replace('topup_','');
      if(val==='custom') {
        setState(uid,{step:'enter_amount'});
        return bot.editMessageText(`✏️ Nechta so\'m to\'ldirmoqchisiz?\nFaqat raqam kiriting:`,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'topup_menu'}]]}});
      }
      setState(uid,{step:'send_receipt',topupAmount:parseInt(val)});
      return sendPayment(chatId,msgId,parseInt(val),true);
    }

    // MENING HISOBIM
    if(data==='my_account') {
      const user=getOrCreateUser(uid,from.username,[from.first_name,from.last_name].filter(Boolean).join(' '));
      const txs=getLastTxs(uid);
      const txText=txs.length?'\n\n📋 <b>So\'nggi operatsiyalar:</b>\n'+txs.map(t=>`${t.amount>0?'+':''}${fmt(Math.abs(t.amount))} — ${t.description}`).join('\n'):'';
      return bot.editMessageText(`👤 <b>Mening hisobim</b>\n\n🆔 ID: <code>${uid}</code>\n👤 Ism: <b>${user.full_name||'Noma\'lum'}</b>\n💰 Balans: <b>${fmt(user.balance)}</b>\n💸 Jami sarflangan: <b>${fmt(user.total_spent)}</b>`+txText,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:"💰 To'ldirish",callback_data:'topup_menu'}],[{text:'🏠 Menyu',callback_data:'back_main'}]]}});
    }

    // ========================
    // ADMIN CALLBACKS
    // ========================
    if(data==='adm_stats'&&isAdmin(uid)) {
      const s=getStats();
      return bot.editMessageText(`📊 <b>Statistika</b>\n\n👥 Foydalanuvchilar: <b>${s.users}</b>\n📦 Bajarilgan: <b>${s.orders}</b>\n💰 Daromad: <b>${fmt(s.revenue)}</b>\n\n⏳ Kutayotgan to\'ldirish: <b>${s.pendingTopups}</b>\n🔄 Kutayotgan buyurtma: <b>${s.pendingOrders}</b>\n🎟 Promokodlar: <b>${s.totalPromos}</b>`,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:adminMenu()});
    }

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
      return bot.editMessageText(text,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'🔙 Admin',callback_data:'adm_stats'}]]}});
    }

    if(data==='adm_users'&&isAdmin(uid)) {
      const users=getAllUsers().slice(0,30);
      let text=`👥 <b>Foydalanuvchilar (${getAllUsers().length} ta):</b>\n\n`;
      users.forEach((u,i)=>{ const name=u.username?`@${u.username}`:(u.full_name||'Noma\'lum'); text+=`${i+1}. ${name} — <b>${fmt(u.balance)}</b>\n`; });
      return bot.editMessageText(text,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'🔙 Admin',callback_data:'adm_stats'}]]}});
    }

    if(data==='adm_give'&&isAdmin(uid)) {
      setState(uid,{step:'adm_give'});
      return bot.sendMessage(chatId,`💳 <b>Balans berish</b>\n\nFormat: <code>ID MIQDOR</code>\nMasalan: <code>123456789 50000</code>`,{parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_stats'}]]}});
    }

    if(data==='adm_promos'&&isAdmin(uid)) {
      const promos=getAllPromos();
      let text=promos.length?`🎟 <b>Promokodlar (${promos.length} ta):</b>\n\n`:'🎟 Hali promokodlar yo\'q.\n';
      const names={uc:'PUBG UC',popularity:'PP',diamond:'FF Diamond',gems:'CoC Gems',mlbb:'MLBB',robux:'Robux'};
      promos.forEach(p=>{
        const gameLabel=names[p.type]||p.type||'?';
        const uses=`${p.usedBy.length}/${p.maxUses}`;
        text+=`• <code>${p.code}</code> — <b>${p.discount}%</b> | ${gameLabel}: ${p.productName||'?'} | ${uses}\n`;
      });
      return bot.editMessageText(text,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'➕ Qo\'shish',callback_data:'adm_add_promo'},{text:'🗑 O\'chirish',callback_data:'adm_del_promo'}],[{text:'🔙 Admin',callback_data:'adm_stats'}]]}});
    }

    if(data==='adm_add_promo'&&isAdmin(uid)) {
      setState(uid,{step:'adm_promo_code',promoData:{}});
      return bot.sendMessage(chatId,
        `🎟 <b>Yangi promokod yaratish</b>\n\n1️⃣ Promokod kodi qanday bo\'lsin?\n\n💡 Masalan: <code>TEKIN</code>, <code>UC2024</code>, <code>DOSTUM</code>`,
        {parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_promos'}]]}}
      );
    }

    // PROMO YARATISH - O'YIN TANLASH (inline button)
    if(data.startsWith('adm_promo_type_')&&isAdmin(uid)) {
      const type=data.replace('adm_promo_type_','');
      const state=getState(uid);
      setState(uid,{...state,promoData:{...state.promoData,type},step:'adm_promo_product'});
      const products=getProducts(type);
      const names={uc:'PUBG UC',popularity:'Popularity (PP)',diamond:'FF Fire Diamond',gems:'CoC Gems',mlbb:'MLBB Diamond',robux:'Robux'};
      const rows=products.map(p=>[{text:p.name,callback_data:`adm_promo_prod_${p.id}`}]);
      rows.push([{text:'❌ Bekor',callback_data:'adm_promos'}]);
      return bot.sendMessage(chatId,
        `🎮 <b>${names[type]}</b> tanlandiz\n\n3️⃣ Qaysi mahsulot uchun chegirma?`,
        {parse_mode:'HTML',reply_markup:{inline_keyboard:rows}}
      );
    }

    // PROMO YARATISH - MAHSULOT TANLASH
    if(data.startsWith('adm_promo_prod_')&&isAdmin(uid)) {
      const pid=parseInt(data.replace('adm_promo_prod_',''));
      const product=getProductById(pid);
      if(!product) return;
      const state=getState(uid);
      setState(uid,{...state,promoData:{...state.promoData,productId:pid,productName:product.name},step:'adm_promo_maxuses'});
      return bot.sendMessage(chatId,
        `📦 <b>${product.name}</b> tanlandiz\n\n4️⃣ Nechta odam uchun? (foydalanish limiti)\n\n💡 Masalan: <code>1</code> — 1 kishi, <code>10</code> — 10 kishi`,
        {parse_mode:'HTML',reply_markup:{inline_keyboard:[
          [{text:'1 kishi',callback_data:'adm_promo_uses_1'},{text:'5 kishi',callback_data:'adm_promo_uses_5'},{text:'10 kishi',callback_data:'adm_promo_uses_10'}],
          [{text:'50 kishi',callback_data:'adm_promo_uses_50'},{text:'100 kishi',callback_data:'adm_promo_uses_100'},{text:'✏️ Boshqa',callback_data:'adm_promo_uses_custom'}],
          [{text:'❌ Bekor',callback_data:'adm_promos'}]
        ]}}
      );
    }

    // PROMO YARATISH - FOYDALANISH LIMITI (button)
    if(data.startsWith('adm_promo_uses_')&&isAdmin(uid)) {
      const val=data.replace('adm_promo_uses_','');
      const state=getState(uid);
      if(val==='custom') {
        setState(uid,{...state,step:'adm_promo_maxuses'});
        return bot.sendMessage(chatId,`✏️ Nechta odam ishlatsin? Raqam yozing:`,{reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_promos'}]]}});
      }
      const maxUses=parseInt(val);
      const pd=state.promoData;
      // Hammasi tayyor, promo yaratish
      createPromo(pd.code,pd.discount,pd.type,pd.productName,pd.productId,maxUses);
      clearState(uid);
      const names={uc:'PUBG UC',popularity:'Popularity (PP)',diamond:'FF Diamond',gems:'CoC Gems',mlbb:'MLBB Diamond',robux:'Robux'};
      return bot.sendMessage(chatId,
        `✅ <b>Promokod yaratildi!</b>\n\n🎟 Kod: <code>${pd.code}</code>\n💰 Chegirma: <b>${pd.discount}%</b>\n🎮 O\'yin: <b>${names[pd.type]||pd.type}</b>\n📦 Mahsulot: <b>${pd.productName}</b>\n👥 Limit: <b>${maxUses} ta odam</b>`,
        {parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'🎟 Promokodlar',callback_data:'adm_promos'}]]}}
      );
    }

    if(data==='adm_del_promo'&&isAdmin(uid)) {
      setState(uid,{step:'adm_del_promo'});
      return bot.sendMessage(chatId,`🗑 O\'chirmoqchi bo\'lgan promokod kodini yozing:`,{reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_promos'}]]}});
    }

    // PROMO - FOIZ TUGMASI
    if(data.startsWith('adm_promo_disc_')&&isAdmin(uid)) {
      const val=data.replace('adm_promo_disc_','');
      const state=getState(uid);
      if(val==='custom') {
        setState(uid,{...state,step:'adm_promo_discount_text'});
        return bot.sendMessage(chatId,`✏️ Foizni yozing (1-100):`,{reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_promos'}]]}});
      }
      const discount=parseInt(val);
      setState(uid,{...state,promoData:{...state.promoData,discount},step:'adm_promo_type'});
      const typesBtns=[
        [{text:'🎮 PUBG UC',callback_data:'adm_promo_type_uc'},{text:'⭐ Popularity (PP)',callback_data:'adm_promo_type_popularity'}],
        [{text:'🔥 FF Diamond',callback_data:'adm_promo_type_diamond'},{text:'⚔️ CoC Gems',callback_data:'adm_promo_type_gems'}],
        [{text:'🌟 MLBB Diamond',callback_data:'adm_promo_type_mlbb'},{text:'🟥 Robux',callback_data:'adm_promo_type_robux'}],
        [{text:'❌ Bekor',callback_data:'adm_promos'}]
      ];
      return bot.sendMessage(chatId,
        `✅ Chegirma: <b>${discount}%</b>\n\n3️⃣ Qaysi o\'yin uchun?`,
        {parse_mode:'HTML',reply_markup:{inline_keyboard:typesBtns}});
    }

    if(data==='adm_broadcast'&&isAdmin(uid)) {
      setState(uid,{step:'adm_broadcast'});
      return bot.sendMessage(chatId,`📢 Xabar matnini yozing:`,{reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_stats'}]]}});
    }

    if(data.startsWith('adm_ok_')&&isAdmin(uid)) {
      const req=approveTopup(parseInt(data.replace('adm_ok_','')),uid);
      if(!req) return;
      const newBal=getBalance(req.telegram_id);
      await bot.editMessageText((message.text||message.caption||'')+'\n\n✅ <b>TASDIQLANDI</b>',{chat_id:chatId,message_id:msgId,parse_mode:'HTML'});
      await bot.sendMessage(req.telegram_id,`✅ <b>Hisobingiz to\'ldirildi!</b>\n\n💰 Qo\'shildi: <b>${fmt(req.amount)}</b>\n💳 Balans: <b>${fmt(newBal)}</b>\n\nXarid qilishingiz mumkin! 🎮`,{parse_mode:'HTML',reply_markup:mainKeyboard()});
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
      await bot.editMessageText((message.text||'')+'\n\n✅ <b>BAJARILDI</b>',{chat_id:chatId,message_id:msgId,parse_mode:'HTML'});
      const g=gameInfo(order.product_type);
      let msg2=`✅ <b>Buyurtmangiz bajarildi!</b>\n\n📦 #${orderId}\n${g.emoji} ${g.name}: <b>${order.product_name}</b>\n`;
      msg2+=order.product_type==='robux'?`👤 Roblox: <b>${order.game_id}</b>\n`:`🆔 ID: <code>${order.game_id}</code>\n`;
      msg2+=`\nO\'yiningizni tekshiring! 🎮\nRahmat! ❤️`;
      await bot.sendMessage(order.telegram_id,msg2,{parse_mode:'HTML',reply_markup:mainKeyboard()});
    }

    if(data.startsWith('adm_cancel_')&&isAdmin(uid)) {
      const orderId=parseInt(data.replace('adm_cancel_',''));
      const order=getOrder(orderId);
      if(!order) return;
      addBalance(order.telegram_id,order.price,`Buyurtma #${orderId} bekor — pul qaytarildi`);
      cancelOrder(orderId);
      await bot.editMessageText((message.text||'')+'\n\n❌ <b>BEKOR QILINDI — pul qaytarildi</b>',{chat_id:chatId,message_id:msgId,parse_mode:'HTML'});
      await bot.sendMessage(order.telegram_id,`⚠️ <b>Buyurtma bekor qilindi</b>\n\n📦 #${orderId}\n💰 Pul qaytarildi: <b>${fmt(order.price)}</b>`,{parse_mode:'HTML',reply_markup:mainKeyboard()});
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
  if(text&&text.startsWith('/')&&text!=='/start') return;

  // Obuna tekshirish (admin emas bo'lsa)
  if(!isAdmin(uid)) {
    const ok=await isSubscribed(uid);
    if(!ok) return sendSubRequired(chatId);
  }

  // AI
  if(text===BTN_AI) {
    clearState(uid); delete aiHistories[uid];
    if(!genAI) return bot.sendMessage(chatId,'⚠️ AI hali sozlanmagan.',{parse_mode:'HTML'});
    setState(uid,{step:'ai_chat'});
    return bot.sendMessage(chatId,`🤖 <b>AI Yordamchi</b>\n\nSalom! Savolingizni yozing.\n\n<i>Chatdan chiqish uchun tugmani bosing.</i>`,{parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'🚪 AI chatdan chiqish',callback_data:'exit_ai'}]]}});
  }
  if(state.step==='ai_chat') {
    if(!text) return;
    await bot.sendChatAction(chatId,'typing');
    try { return bot.sendMessage(chatId,await askGemini(uid,text),{parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'🚪 AI chatdan chiqish',callback_data:'exit_ai'}]]}}); }
    catch(e) { return bot.sendMessage(chatId,'⚠️ AI javob bera olmadi.',{reply_markup:{inline_keyboard:[[{text:'🚪 AI chatdan chiqish',callback_data:'exit_ai'}]]}}); }
  }

  // KATEGORIYA TUGMALARI
  if(text&&CAT_BTNS[text]) {
    clearState(uid);
    const type=CAT_BTNS[text]; const g=gameInfo(type);
    return bot.sendMessage(chatId,`${g.emoji} <b>${g.name} — ${g.currency}</b>\n\nPaket tanlang:`,{parse_mode:'HTML',reply_markup:productsMenu(getProducts(type))});
  }

  // TO'LDIRISH
  if(text===BTN_TOPUP) {
    clearState(uid);
    return bot.sendMessage(chatId,`💰 <b>Hisobni to\'ldirish</b>\n\n📌 To\'lov usuli: Admin orqali\n📸 Chek yuboring → Admin tasdiqlaydi → Balans qo\'shiladi`,{parse_mode:'HTML',reply_markup:topupMenu()});
  }

  // HISOBIM
  if(text===BTN_ACCOUNT) {
    clearState(uid);
    const user=getOrCreateUser(uid,from.username,[from.first_name,from.last_name].filter(Boolean).join(' '));
    const txs=getLastTxs(uid);
    const txText=txs.length?'\n\n📋 <b>So\'nggi operatsiyalar:</b>\n'+txs.map(t=>`${t.amount>0?'+':''}${fmt(Math.abs(t.amount))} — ${t.description}`).join('\n'):'';
    return bot.sendMessage(chatId,`👤 <b>Mening hisobim</b>\n\n🆔 ID: <code>${uid}</code>\n👤 Ism: <b>${user.full_name||'Noma\'lum'}</b>\n💰 Balans: <b>${fmt(user.balance)}</b>\n💸 Jami sarflangan: <b>${fmt(user.total_spent)}</b>`+txText,{parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:"💰 To'ldirish",callback_data:'topup_menu'}]]}});
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

  // 🎟 PROMOKOD KIRITISH
  if(text===BTN_PROMO) {
    clearState(uid);
    setState(uid,{step:'enter_promo'});
    return bot.sendMessage(chatId,
      `🎟 <b>Promokod kiritish</b>\n\nPromokod kodini yozing:\n\n` +
      `💡 Promokod olish uchun kanalimizga obuna bo\'ling:\n📢 ${CHANNEL}`,
      {parse_mode:'HTML',reply_markup:{inline_keyboard:[
        [{text:`📢 ${CHANNEL} ga o\'tish`,url:CHANNEL_URL}],
        [{text:'❌ Bekor',callback_data:'back_main'}]
      ]}}
    );
  }

  // YORDAM
  if(text===BTN_SUPPORT) {
    clearState(uid);
    return bot.sendMessage(chatId,`📞 <b>Yordam</b>\n\n👨‍💼 Admin: @ismoiljo_n\n⏰ Ish vaqti: 09:00 - 22:00\n\n💬 Murojaat vaqtida buyurtma raqamingizni yozing!`,{parse_mode:'HTML'});
  }

  try {
    // PROMOKOD TEKSHIRISH
    if(state.step==='enter_promo') {
      if(!text) return;
      const code=text.trim().toUpperCase();
      const chk=checkPromo(code,uid,null,null);
      if(!chk.ok) return bot.sendMessage(chatId,chk.msg+`\n\n💡 Promokod olish: ${CHANNEL}`,{parse_mode:'HTML'});
      const p=chk.promo;
      const names={uc:'PUBG UC',popularity:'Popularity (PP)',diamond:'FF Diamond',gems:'CoC Gems',mlbb:'MLBB Diamond',robux:'Robux'};
      const gameLabel=names[p.type]||p.type;
      const remaining=`\n📊 Qolgan: ${p.maxUses-p.usedBy.length} ta`;
      setState(uid,{activePromo:{code,discount:p.discount},step:null});
      return bot.sendMessage(chatId,
        `✅ <b>Promokod faollashtirildi!</b>\n\n🎟 Kod: <code>${code}</code>\n💰 Chegirma: <b>${p.discount}%</b>\n🎮 Qo\'llanadi: <b>${gameLabel}</b>\n📦 Mahsulot: <b>${p.productName}</b>${remaining}\n\n🛒 ${p.productName} tanlang, chegirma avtomatik qo\'llanadi!`,
        {parse_mode:'HTML',reply_markup:mainKeyboard()}
      );
    }

    // GAME ID
    if(state.step==='enter_id') {
      if(!text) return bot.sendMessage(chatId,'⚠️ Matn kiriting!');
      const product=getProductById(state.selectedProduct);
      if(!product) return;

      if(product.type==='robux') {
        const nik=text.trim();
        if(nik.length<3||nik.length>20) return bot.sendMessage(chatId,'❌ Roblox username 3-20 ta belgidan iborat!');
        const finalPrice=(state.finalPrice!==undefined&&state.finalPrice!==null)?state.finalPrice:product.price;
        const g=gameInfo('robux');
        setState(uid,{gameId:nik,step:'confirm_step'});
        const promoLine=state.activePromo?`\n🎟 Promokod: ${state.activePromo.code} (-${state.activePromo.discount}%)`:'';
        return bot.sendMessage(chatId,
          `📋 <b>Buyurtma ma\'lumotlari:</b>\n\n${g.emoji} <b>${g.name} — ${product.name}</b>\n👤 Roblox Username: <b>${nik}</b>\n💰 Narx: <b>${fmt(finalPrice)}</b>${promoLine}\n\nTasdiqlaysizmi?`,
          {parse_mode:'HTML',reply_markup:confirmBtn(state.selectedProduct)}
        );
      }

      let cleanId=text.trim().replace(/\s+/g,'');
      if(product.type==='gems') {
        if(!cleanId.startsWith('#')) cleanId='#'+cleanId;
      } else {
        if(!/^\d+$/.test(cleanId)) return bot.sendMessage(chatId,`❌ Faqat raqamlar kiriting!\nMasalan: <code>512345678</code>`,{parse_mode:'HTML'});
        if(cleanId.length>15) return bot.sendMessage(chatId,'❌ ID maksimum 15 ta raqam!');
      }
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
      const promoLine=state.activePromo?`\n🎟 Promokod: ${state.activePromo.code} (-${state.activePromo.discount}%)`:'';
      return bot.sendMessage(chatId,
        `📋 <b>Buyurtma ma\'lumotlari:</b>\n\n${g.emoji} <b>${g.name} — ${product.name}</b>\n🆔 ID: <code>${state.gameId}</code>\n👤 Nik: <b>${nik}</b>\n💰 Narx: <b>${fmt(finalPrice)}</b>${promoLine}\n\nTasdiqlaysizmi?`,
        {parse_mode:'HTML',reply_markup:confirmBtn(state.selectedProduct)}
      );
    }

    // TO'LDIRISH MIQDORI
    if(state.step==='enter_amount') {
      if(!text) return;
      const amount=parseInt(text.replace(/[\s,]/g,''));
      if(isNaN(amount)||amount<1000) return bot.sendMessage(chatId,'❌ Minimum 1,000 so\'m!');
      if(amount>10000000) return bot.sendMessage(chatId,'❌ Maksimum 10,000,000 so\'m!');
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

    // ADMIN: BALANS BERISH
    if(state.step==='adm_give'&&isAdmin(uid)) {
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

    // ADMIN: PROMO - KOD KIRITISH (1-qadam)
    if(state.step==='adm_promo_code'&&isAdmin(uid)) {
      if(!text) return;
      const code=text.trim().toUpperCase().replace(/\s+/g,'');
      if(code.length<2||code.length>20) return bot.sendMessage(chatId,'❌ Kod 2-20 belgi bo\'lishi kerak!');
      if(getPromo(code)) return bot.sendMessage(chatId,`❌ <b>${code}</b> allaqachon mavjud! Boshqa kod yozing:`,{parse_mode:'HTML'});
      setState(uid,{step:'adm_promo_discount',promoData:{code}});
      return bot.sendMessage(chatId,
        `✅ Kod: <code>${code}</code>\n\n2️⃣ Necha foiz chegirma? (1-100)\n\n💡 Masalan: <code>100</code> — tekin, <code>50</code> — yarmi bepul, <code>10</code> — 10% arzon`,
        {parse_mode:'HTML',reply_markup:{inline_keyboard:[
          [{text:'10%',callback_data:'adm_promo_disc_10'},{text:'20%',callback_data:'adm_promo_disc_20'},{text:'50%',callback_data:'adm_promo_disc_50'}],
          [{text:'100% (tekin)',callback_data:'adm_promo_disc_100'},{text:'✏️ Boshqa',callback_data:'adm_promo_disc_custom'}],
          [{text:'❌ Bekor',callback_data:'adm_promos'}]
        ]}});
    }

    // ADMIN: PROMO - FOIZ KIRITISH (matn bilan)
    if(state.step==='adm_promo_discount_text'&&isAdmin(uid)) {
      if(!text) return;
      const discount=parseInt(text.trim());
      if(isNaN(discount)||discount<1||discount>100) return bot.sendMessage(chatId,'❌ 1 dan 100 gacha raqam kiriting!');
      const state2=getState(uid);
      setState(uid,{...state2,promoData:{...state2.promoData,discount},step:'adm_promo_type'});
      const typesBtns=[
        [{text:'🎮 PUBG UC',callback_data:'adm_promo_type_uc'},{text:'⭐ Popularity (PP)',callback_data:'adm_promo_type_popularity'}],
        [{text:'🔥 FF Diamond',callback_data:'adm_promo_type_diamond'},{text:'⚔️ CoC Gems',callback_data:'adm_promo_type_gems'}],
        [{text:'🌟 MLBB Diamond',callback_data:'adm_promo_type_mlbb'},{text:'🟥 Robux',callback_data:'adm_promo_type_robux'}],
        [{text:'❌ Bekor',callback_data:'adm_promos'}]
      ];
      return bot.sendMessage(chatId,
        `✅ Chegirma: <b>${discount}%</b>\n\n3️⃣ Qaysi o\'yin uchun?`,
        {parse_mode:'HTML',reply_markup:{inline_keyboard:typesBtns}});
    }

    // ADMIN: PROMO - MAX USES KIRITISH (matn bilan)
    if(state.step==='adm_promo_maxuses'&&isAdmin(uid)) {
      if(!text) return;
      const maxUses=parseInt(text.trim());
      if(isNaN(maxUses)||maxUses<1) return bot.sendMessage(chatId,'❌ 1 dan katta raqam kiriting!');
      const state2=getState(uid);
      const pd=state2.promoData;
      createPromo(pd.code,pd.discount,pd.type,pd.productName,pd.productId,maxUses);
      clearState(uid);
      const names={uc:'PUBG UC',popularity:'Popularity (PP)',diamond:'FF Diamond',gems:'CoC Gems',mlbb:'MLBB Diamond',robux:'Robux'};
      return bot.sendMessage(chatId,
        `✅ <b>Promokod yaratildi!</b>\n\n🎟 Kod: <code>${pd.code}</code>\n💰 Chegirma: <b>${pd.discount}%</b>\n🎮 O\'yin: <b>${names[pd.type]||pd.type}</b>\n📦 Mahsulot: <b>${pd.productName}</b>\n👥 Limit: <b>${maxUses} ta odam</b>`,
        {parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'🎟 Promokodlar',callback_data:'adm_promos'}]]}}
      );
    }

    // ADMIN: PROMO O'CHIRISH
    if(state.step==='adm_del_promo'&&isAdmin(uid)) {
      if(!text) return;
      const code=text.trim().toUpperCase();
      clearState(uid);
      return bot.sendMessage(chatId,deletePromo(code)?`✅ <b>${code}</b> o\'chirildi.`:`❌ <b>${code}</b> topilmadi.`,{parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'🎟 Promokodlar',callback_data:'adm_promos'}]]}});
    }

    // ADMIN: RAD ETISH
    if(state.step==='adm_reject'&&isAdmin(uid)) {
      const req=rejectTopup(state.rejectId,uid,text);
      if(!req) return bot.sendMessage(chatId,'❌ Topilmadi!');
      clearState(uid);
      await bot.sendMessage(chatId,`✅ So\'rov #${req.id} rad etildi.`);
      await bot.sendMessage(req.telegram_id,`❌ <b>To\'ldirish rad etildi</b>\n\n📋 #${req.id} | 💰 ${fmt(req.amount)}\n\n📝 Sabab: <b>${text}</b>`,{parse_mode:'HTML',reply_markup:mainKeyboard()});
    }

    // ADMIN: BROADCAST
    if(state.step==='adm_broadcast'&&isAdmin(uid)) {
      if(!text) return;
      clearState(uid);
      const users=getAllUsers(); let sent=0,failed=0;
      await bot.sendMessage(chatId,`📢 Yuborilmoqda... (${users.length} ta)`);
      for(const u of users) {
        try { await bot.sendMessage(u.telegram_id,`📢 <b>Admin xabari:</b>\n\n${text}`,{parse_mode:'HTML'}); sent++; await new Promise(r=>setTimeout(r,50)); }
        catch { failed++; }
      }
      return bot.sendMessage(chatId,`✅ Tugadi! Yuborildi: ${sent} | Xato: ${failed}`);
    }

    // NOMA'LUM
    if(text&&!state.step) {
      return bot.sendMessage(chatId,'🎮 <b>Game Shop</b>\n\n👇 Pastdagi menyudan tanlang:',{parse_mode:'HTML',reply_markup:mainKeyboard()});
    }

  } catch(err) { console.error('Message xato:',err.message); }
});

// ========================
// HTTP + ERROR
// ========================
bot.on('polling_error', err=>console.error('Polling:',err.message));
process.on('unhandledRejection', err=>console.error('Unhandled:',err));
http.createServer((req,res)=>{res.writeHead(200);res.end('Game Shop Bot ishlayapti! 🎮');}).listen(PORT,()=>console.log(`🌐 Port ${PORT}`));
console.log('🚀 Game Shop Bot ishga tushdi!');
console.log(`👥 Adminlar: ${ADMIN_IDS.join(', ')}`);
console.log(`📢 Majburiy kanal: ${CHANNEL}`);
