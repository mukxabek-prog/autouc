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
const CYBERDROP_PHOTO_ID = 'AgACAgIAAxkBAAFNTm5qO-9IhN1DPIgayIm_ZEzNiCbOOgAClCFrG-kE4UlUtpxTskjDlQEAAwIAA3gAAzwE';
// ⚠️ Bu yerga o'zingizning o'yin/sayt havolangizni qo'ying:
const CYBERDROP_URL    = 'https://example.com/CHANGE_ME';

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
  referrals: {},
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
  if (!d.users[id]) d.users[id] = { telegram_id:tid, username:username||null, full_name:fullName||null, balance:0, total_spent:0, joined_at:new Date().toISOString(), used_promos:[], tokens:0, referred_by:null, referral_count:0 };
  else { if(username) d.users[id].username=username; if(fullName) d.users[id].full_name=fullName; if(!d.users[id].used_promos) d.users[id].used_promos=[]; if(d.users[id].tokens===undefined) d.users[id].tokens=0; if(d.users[id].referred_by===undefined) d.users[id].referred_by=null; if(d.users[id].referral_count===undefined) d.users[id].referral_count=0; }
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

// TOKENLAR
function getTokens(tid) { const u=getUser(tid); return u?u.tokens:0; }
function addTokens(tid, amount) {
  const d=loadDB(); const id=String(tid); if(!d.users[id]) return;
  d.users[id].tokens=(d.users[id].tokens||0)+amount;
  saveDB(d);
}
function deductTokens(tid, amount) {
  const d=loadDB(); const id=String(tid);
  if(!d.users[id]||(d.users[id].tokens||0)<amount) return false;
  d.users[id].tokens-=amount; saveDB(d); return true;
}

// REFERAL
function getReferralLink(tid) { return `https://t.me/${process.env.BOT_USERNAME||''}?start=ref_${tid}`; }
function processReferral(newUserId, referId) {
  const d=loadDB(); const id=String(newUserId); const rid=String(referId);
  if(id===rid) return; // o'z-o'ziga referral bo'lmaydi
  if(!d.users[id]||!d.users[rid]) return;
  if(d.users[id].referred_by) return; // allaqachon referral orqali kelgan
  d.users[id].referred_by=rid;
  d.users[rid].referral_count=(d.users[rid].referral_count||0)+1;
  d.users[rid].tokens=(d.users[rid].tokens||0)+1; // har bir referral uchun 1 token
  saveDB(d);
  return d.users[rid];
}

// TOKEN ALMASHTIRISH NARCHLAR (har token = 1000 so'm, yoki maxsus jadval)
const TOKEN_EXCHANGE = {
  uc:         { product: '60 UC',       type: 'uc',         tokens: 50 },
  popularity: { product: '20K PP',      type: 'popularity', tokens: 20 },
  diamond:    { product: '100 Diamond', type: 'diamond',    tokens: 20 },
  gems:       { product: '80 Gems',     type: 'gems',       tokens: 15 },
  mlbb:       { product: '86 Diamonds', type: 'mlbb',       tokens: 22 },
  robux:      { product: '400 Robux',   type: 'robux',      tokens: 30 },
};

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
function createPromo(code, amount, maxUses, rewardType) {
  const d=loadDB(); const k=code.toUpperCase();
  d.promocodes[k]={
    code:k,
    amount: amount,
    rewardType: rewardType||'som', // 'som' yoki 'token'
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
function checkPromo(code, tid) {
  const promo=getPromo(code);
  if(!promo)           return {ok:false,msg:'❌ Promokod topilmadi!'};
  if(!promo.is_active) return {ok:false,msg:'❌ Promokod faol emas!'};
  if(promo.usedBy.length>=promo.maxUses) return {ok:false,msg:'😔 Kechirasz, ulgurmadingiz! Promokod tugadi.'};
  if(promo.usedBy.map(String).includes(String(tid))) return {ok:false,msg:'❌ Siz bu promokodni allaqachon ishlatgansiz!'};
  return {ok:true,amount:promo.amount,rewardType:promo.rewardType||'som',promo};
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
const BTN_CYBER   = '🎮 CyberDrop Game';
const BTN_HISOB   = '💸 Pul ishlash';

function mainKeyboard() {
  return {
    keyboard:[
      ['🎮 PUBG — UC',           '⭐ PUBG — Popularity'],
      ['🔥 Free Fire — Diamond', '⚔️ Clash of Clans — Gems'],
      ['🌟 Mobile Legends — Diamond','🟥 Roblox — Robux'],
      [BTN_TOPUP,  BTN_ACCOUNT],
      [BTN_ORDERS, BTN_PROMO],
      [BTN_HISOB,  BTN_SUPPORT],
      [BTN_CYBER]
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
  const text=`💰 <b>To\'ldirish: ${fmt(amount)}</b>\n\n1️⃣ Quyidagi kartaga pul o\'tkazing:\n🏦 <code>9860 1606 2989 6350</code>\n👆 <i>(Karta raqamiga bosing — avtomatik ko\'chiriladi)</i>\n👤 <b>Qoshaqboyev.I</b>\n\n2️⃣ Miqdor: <b>${fmt(amount)}</b>\n\n3️⃣ To\'lovdan so\'ng <b>chek (screenshot)</b> yuboring\n\n✅ Admin tasdiqlashidan so\'ng balans qo\'shiladi!`;
  const opts={parse_mode:'HTML',reply_markup:cancelBtn()};
  if(edit&&msgId) await bot.editMessageText(text,{chat_id:chatId,message_id:msgId,...opts});
  else await bot.sendMessage(chatId,text,opts);
}

// ========================
// START
// ========================
async function sendStart(chatId, from) {
  getOrCreateUser(from.id,from.username,[from.first_name,from.last_name].filter(Boolean).join(' '));
  // Avval rasm yuborish
  const PHOTO_ID = 'AgACAgIAAxkBAAFNTfFqO-0P_mU_0pN__dKsit56Cp-d6QACiSFrG-kE4UkmrmASwGXQ2wEAAwIAA3gAAzwE';
  try { await bot.sendPhoto(chatId, PHOTO_ID); } catch(e) {}
  // Keyin ovozli xabar
  const VOICE_ID = 'AwACAgQAAxkBAAFNSUhqO707mvf9vSUCsKHiMP0wyL_VrAACwgQAAv3WxFJ8Ar5yX_dhtTwE';
  try { await bot.sendVoice(chatId, VOICE_ID); } catch(e) {}
  await bot.sendMessage(chatId,
    `👋 Salom, <b>${from.first_name}</b>!\n\n🎮 <b>Game Shop</b> ga xush kelibsiz!\n\n🎮 PUBG Mobile — UC & Popularity\n🔥 Free Fire — Diamond\n⚔️ Clash of Clans — Gems\n🌟 Mobile Legends — Diamond\n🟥 Roblox — Robux\n\n💳 To\'lov admin orqali tasdiqlanadi.\n⚡ Tez va ishonchli yetkazib berish!\n\n👇 Pastdagi menyudan tanlang:`,
    {parse_mode:'HTML',reply_markup:mainKeyboard()}
  );
}

bot.onText(/\/start(.*)/, async (msg, match) => {
  clearState(msg.from.id);
  const from = msg.from;
  const param = (match[1]||'').trim();

  // Foydalanuvchini yaratish
  getOrCreateUser(from.id, from.username, [from.first_name, from.last_name].filter(Boolean).join(' '));

  // Referral tekshirish
  if(param.startsWith('ref_')) {
    const referId = parseInt(param.replace('ref_',''));
    if(referId && referId !== from.id) {
      const referrer = processReferral(from.id, referId);
      if(referrer) {
        const rName = referrer.username ? `@${referrer.username}` : (referrer.full_name || `ID: ${referId}`);
        // Referralga xabar yuborish
        try {
          await bot.sendMessage(referId,
            `🎉 <b>Yangi referral!</b>\n\n👤 ${from.first_name} siz orqali kirdi!\n🪙 Hisobingizga <b>+1 token</b> qo'shildi!\n\nJami tokenlaringiz: <b>${getTokens(referId)} token</b>`,
            {parse_mode:'HTML'}
          );
        } catch(e){}
      }
    }
  }

  const ok = await isSubscribed(from.id);
  if(!ok) return sendSubRequired(msg.chat.id);
  await sendStart(msg.chat.id, from);
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

      // Narx
      const finalPrice=product.price;
      const promoLine='';
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

      const deducted=deductBalance(uid,finalPrice,product.name+' xaridi');
      if(!deducted) return bot.editMessageText('❌ Balans yetarli emas!',{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'🏠 Menyu',callback_data:'back_main'}]]}});

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
      promos.forEach(p=>{
        const uses=`${p.usedBy.length}/${p.maxUses}`;
        text+=`• <code>${p.code}</code> — <b>${fmt(p.amount||0)}</b> | ${uses} ishlatilgan\n`;
      });
      return bot.editMessageText(text,{chat_id:chatId,message_id:msgId,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'➕ Qo\'shish',callback_data:'adm_add_promo'},{text:'🗑 O\'chirish',callback_data:'adm_del_promo'}],[{text:'🔙 Admin',callback_data:'adm_stats'}]]}});
    }

    if(data==='adm_add_promo'&&isAdmin(uid)) {
      setState(uid,{step:'adm_promo_code',promoData:{}});
      return bot.sendMessage(chatId,
        `🎟 <b>Yangi promokod yaratish</b>\n\n1️⃣ Promokod kodi qanday bo\'lsin?\n\n💡 Masalan: <code>BONUS</code>, <code>DOSTUM</code>, <code>HEDYA</code>`,
        {parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_promos'}]]}}
      );
    }

    // PROMO YARATISH - MIQDOR TUGMASI
    if(data.startsWith('adm_promo_amt_')&&isAdmin(uid)) {
      const val=data.replace('adm_promo_amt_','');
      const state=getState(uid);
      const rewardType = state.promoData?.rewardType||'som';
      if(val==='custom') {
        setState(uid,{...state,step:'adm_promo_amount_text'});
        const unitLabel = rewardType==='token' ? 'token' : "so'm";
        return bot.sendMessage(chatId,`✏️ Necha ${unitLabel} berilsin? Raqam yozing:`,{reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_promos'}]]}});
      }
      const amount=parseInt(val);
      setState(uid,{...state,promoData:{...state.promoData,amount},step:'adm_promo_maxuses'});
      const unitLabel = rewardType==='token' ? `${amount} token` : fmt(amount);
      return bot.sendMessage(chatId,
        `✅ Bonus: <b>${unitLabel}</b>\n\n4️⃣ Nechta odam ishlatishi mumkin?`,
        {parse_mode:'HTML',reply_markup:{inline_keyboard:[
          [{text:'1 kishi',callback_data:'adm_promo_uses_1'},{text:'5 kishi',callback_data:'adm_promo_uses_5'},{text:'10 kishi',callback_data:'adm_promo_uses_10'}],
          [{text:'50 kishi',callback_data:'adm_promo_uses_50'},{text:'100 kishi',callback_data:'adm_promo_uses_100'},{text:'✏️ Boshqa',callback_data:'adm_promo_uses_custom'}],
          [{text:'❌ Bekor',callback_data:'adm_promos'}]
        ]}});
    }

    // PROMO YARATISH - NECHTA ODAM (button)
    if(data.startsWith('adm_promo_uses_')&&isAdmin(uid)) {
      const val=data.replace('adm_promo_uses_','');
      const state=getState(uid);
      if(val==='custom') {
        setState(uid,{...state,step:'adm_promo_maxuses'});
        return bot.sendMessage(chatId,`✏️ Nechta odam ishlatsin? Raqam yozing:`,{reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_promos'}]]}});
      }
      const maxUses=parseInt(val);
      const pd=state.promoData;
      createPromo(pd.code,pd.amount,maxUses,pd.rewardType||'som');
      clearState(uid);
      const rewardType = pd.rewardType||'som';
      const bonusLabel = rewardType==='token' ? `${pd.amount} token 🪙` : fmt(pd.amount);
      return bot.sendMessage(chatId,
        `✅ <b>Promokod yaratildi!</b>\n\n🎟 Kod: <code>${pd.code}</code>\n💸 Bonus: <b>${bonusLabel}</b>\n👥 Limit: <b>${maxUses} ta odam</b>`,
        {parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'🎟 Promokodlar',callback_data:'adm_promos'}]]}}
      );
    }

    if(data==='adm_del_promo'&&isAdmin(uid)) {
      setState(uid,{step:'adm_del_promo'});
      return bot.sendMessage(chatId,`🗑 O\'chirmoqchi bo\'lgan promokod kodini yozing:`,{reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_promos'}]]}});
    }

    // PROMO YARATISH - BONUS TURI TANLASH
    if(data.startsWith('adm_promo_type_')&&isAdmin(uid)) {
      const rewardType = data.replace('adm_promo_type_',''); // 'som' yoki 'token'
      const state = getState(uid);
      setState(uid,{...state, promoData:{...state.promoData, rewardType}, step:'adm_promo_amount'});
      if(rewardType==='token') {
        return bot.sendMessage(chatId,
          `🪙 Token bonus\n\n3️⃣ Nechta token berilsin?`,
          {parse_mode:'HTML',reply_markup:{inline_keyboard:[
            [{text:'1 token',callback_data:'adm_promo_amt_1'},{text:'2 token',callback_data:'adm_promo_amt_2'},{text:'5 token',callback_data:'adm_promo_amt_5'}],
            [{text:'10 token',callback_data:'adm_promo_amt_10'},{text:'20 token',callback_data:'adm_promo_amt_20'},{text:'✏️ Boshqa',callback_data:'adm_promo_amt_custom'}],
            [{text:'❌ Bekor',callback_data:'adm_promos'}]
          ]}});
      } else {
        return bot.sendMessage(chatId,
          `💰 So\'m bonus\n\n3️⃣ Necha so\'m berilsin?`,
          {parse_mode:'HTML',reply_markup:{inline_keyboard:[
            [{text:"1 000 so'm",callback_data:'adm_promo_amt_1000'},{text:"2 000 so'm",callback_data:'adm_promo_amt_2000'},{text:"5 000 so'm",callback_data:'adm_promo_amt_5000'}],
            [{text:"10 000 so'm",callback_data:'adm_promo_amt_10000'},{text:"50 000 so'm",callback_data:'adm_promo_amt_50000'},{text:'✏️ Boshqa',callback_data:'adm_promo_amt_custom'}],
            [{text:'❌ Bekor',callback_data:'adm_promos'}]
          ]}});
      }
    }



    // 👥 REFERRAL
    if(data==='my_referral') {
      const user = getUser(uid);
      const tokens = getTokens(uid);
      const refLink = `https://t.me/${process.env.BOT_USERNAME||'GameShopBot'}?start=ref_${uid}`;
      const refCount = user?.referral_count||0;
      return bot.editMessageText(
        `👥 <b>Mening referralim</b>\n\n🔗 Sizning havolangiz:\n<code>${refLink}</code>\n\n👥 Ulashgan do'stlaringiz: <b>${refCount} ta</b>\n🪙 Har bir do'st uchun: <b>+1 token</b>\n\n💡 Havolani do'stlaringizga yuboring! Ular bot orqali kirsa siz avtomatik 2 token olasiz!`,
        {chat_id:chatId, message_id:msgId, parse_mode:'HTML', reply_markup:{inline_keyboard:[
          [{text:'🔄 Tokenni almashtirish', callback_data:'token_exchange'}],
          [{text:'🔙 Orqaga', callback_data:'back_hisob'}]
        ]}}
      );
    }

    // 💼 HISOB ISHLASH (back)
    if(data==='back_hisob') {
      const tokens = getTokens(uid);
      const balance = getBalance(uid);
      return bot.editMessageText(
        `💸 <b>Pul ishlash</b>\n\n🪙 Tokenlaringiz: <b>${tokens} token</b>\n💰 Balansingiz: <b>${fmt(balance)}</b>\n\n1 token = 250 so\'m`,
        {chat_id:chatId, message_id:msgId, parse_mode:'HTML', reply_markup:{inline_keyboard:[
          [{text:'👥 Referralim', callback_data:'my_referral'}],
          [{text:'🔄 Token → Mahsulot', callback_data:'token_exchange'}],
          [{text:'🛒 Token sotib olish (250 so\'m/dona)', callback_data:'tokshop_menu'}],
          [{text:'💵 Token → So\'m (250 so\'m/dona)', callback_data:'token_to_som'}],
          [{text:'🔙 Orqaga', callback_data:'back_main'}]
        ]}}
      );
    }

    // 🛒 TOKEN SOTIB OLISH
    if(data==='tokshop_menu') {
      const balance = getBalance(uid);
      return bot.editMessageText(
        `🛒 <b>Token sotib olish</b>\n\n💰 Balansingiz: <b>${fmt(balance)}</b>\n🪙 1 token = <b>250 so'm</b>\n\nNechta token sotib olmoqchisiz?`,
        {chat_id:chatId, message_id:msgId, parse_mode:'HTML', reply_markup:{inline_keyboard:[
          [{text:"1 token — 250 so'm", callback_data:'tokshop_buy_1'},{text:"5 token — 1,250 so'm", callback_data:'tokshop_buy_5'}],
          [{text:"10 token — 2,500 so'm", callback_data:'tokshop_buy_10'},{text:"20 token — 5,000 so'm", callback_data:'tokshop_buy_20'}],
          [{text:"50 token — 12,500 so'm", callback_data:'tokshop_buy_50'},{text:"100 token — 25,000 so'm", callback_data:'tokshop_buy_100'}],
          [{text:'✏️ Boshqa miqdor', callback_data:'tokshop_buy_custom'}],
          [{text:'🔙 Orqaga', callback_data:'back_hisob'}]
        ]}}
      );
    }

    if(data.startsWith('tokshop_buy_')) {
      const val = data.replace('tokshop_buy_','');
      if(val==='custom') {
        setState(uid,{step:'buy_tokens_amount'});
        return bot.sendMessage(chatId,`✏️ Nechta token sotib olmoqchisiz? Raqam yozing:`,{reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'tokshop_menu'}]]}});
      }
      const amount = parseInt(val);
      const cost = amount * 250;
      const balance = getBalance(uid);
      if(balance < cost) {
        return bot.editMessageText(
          `❌ <b>Balans yetarli emas!</b>\n\n🪙 ${amount} token = <b>${fmt(cost)}</b>\n💰 Balansingiz: <b>${fmt(balance)}</b>\nYetishmaydi: <b>${fmt(cost - balance)}</b>`,
          {chat_id:chatId, message_id:msgId, parse_mode:'HTML', reply_markup:{inline_keyboard:[
            [{text:"💰 Hisobni to'ldirish", callback_data:'topup_menu'}],
            [{text:'🔙 Orqaga', callback_data:'tokshop_menu'}]
          ]}}
        );
      }
      const deducted = deductBalance(uid, cost, `${amount} token sotib olindi`);
      if(!deducted) return bot.editMessageText('❌ Xato yuz berdi!',{chat_id:chatId,message_id:msgId});
      addTokens(uid, amount);
      const newTokens = getTokens(uid);
      const newBal = getBalance(uid);
      return bot.editMessageText(
        `✅ <b>Token sotib olindi!</b>\n\n🪙 Qo'shildi: <b>+${amount} token</b>\n💰 Sarflandi: <b>${fmt(cost)}</b>\n\n🪙 Jami tokenlar: <b>${newTokens} token</b>\n💳 Qolgan balans: <b>${fmt(newBal)}</b>`,
        {chat_id:chatId, message_id:msgId, parse_mode:'HTML', reply_markup:{inline_keyboard:[
          [{text:'🔙 Pul ishlash', callback_data:'back_hisob'}]
        ]}}
      );
    }

    // 💵 TOKEN → SO'M
    if(data==='token_to_som') {
      const tokens = getTokens(uid);
      if(tokens < 1) {
        return bot.editMessageText(
          `❌ <b>Token yetarli emas!</b>\n\n🪙 Sizda: <b>0 token</b>\n\n👥 Do'stlaringizni taklif qiling yoki token sotib oling!`,
          {chat_id:chatId, message_id:msgId, parse_mode:'HTML', reply_markup:{inline_keyboard:[
            [{text:'🛒 Token sotib olish', callback_data:'tokshop_menu'}],
            [{text:'🔙 Orqaga', callback_data:'back_hisob'}]
          ]}}
        );
      }
      const btnRows = [];
      if(tokens>=100) btnRows.push([{text:`100 token — ${fmt(25000)}`, callback_data:'tok2som_100'}]);
      if(tokens>=50) btnRows.push([{text:`50 token — ${fmt(12500)}`, callback_data:'tok2som_50'}]);
      if(tokens>=10) btnRows.push([{text:`10 token — ${fmt(2500)}`, callback_data:'tok2som_10'}]);
      btnRows.push([{text:`Barchasi (${tokens} token = ${fmt(tokens*250)})`, callback_data:`tok2som_${tokens}`}]);
      btnRows.push([{text:'✏️ Boshqa miqdor', callback_data:'tok2som_custom'}]);
      btnRows.push([{text:'🔙 Orqaga', callback_data:'back_hisob'}]);
      return bot.editMessageText(
        `💵 <b>Token → So'm almashtirish</b>\n\n🪙 Sizda: <b>${tokens} token</b>\n💰 1 token = <b>250 so'm</b>\n💰 Jami qiymat: <b>${fmt(tokens * 250)}</b>\n\nNechtasini almashtirasiz?`,
        {chat_id:chatId, message_id:msgId, parse_mode:'HTML', reply_markup:{inline_keyboard:btnRows}}
      );
    }

    if(data.startsWith('tok2som_')) {
      const val = data.replace('tok2som_','');
      if(val==='custom') {
        setState(uid,{step:'tok2som_amount'});
        return bot.sendMessage(chatId,`✏️ Nechta tokenni so'mga almashtirasiz? Raqam yozing:`,{reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'token_to_som'}]]}});
      }
      const amount = parseInt(val);
      const tokens = getTokens(uid);
      if(isNaN(amount)||amount<1) return;
      if(tokens < amount) {
        return bot.editMessageText(
          `❌ <b>Token yetarli emas!</b>\n\n🪙 Sizda: <b>${tokens} token</b>\nKerak: <b>${amount} token</b>`,
          {chat_id:chatId, message_id:msgId, parse_mode:'HTML', reply_markup:{inline_keyboard:[
            [{text:'🔙 Orqaga', callback_data:'token_to_som'}]
          ]}}
        );
      }
      const earned = amount * 250;
      deductTokens(uid, amount);
      addBalance(uid, earned, `${amount} token → so'm almashtirish`);
      const newTokens = getTokens(uid);
      const newBal = getBalance(uid);
      return bot.editMessageText(
        `✅ <b>Almashtirish muvaffaqiyatli!</b>\n\n🪙 Sarflandi: <b>${amount} token</b>\n💰 Qo'shildi: <b>${fmt(earned)}</b>\n\n🪙 Qolgan tokenlar: <b>${newTokens} token</b>\n💳 Yangi balans: <b>${fmt(newBal)}</b>`,
        {chat_id:chatId, message_id:msgId, parse_mode:'HTML', reply_markup:{inline_keyboard:[
          [{text:'🏠 Bosh menyu', callback_data:'back_main'}],
          [{text:'🔙 Pul ishlash', callback_data:'back_hisob'}]
        ]}}
      );
    }

    // 🔄 TOKEN ALMASHTIRISH - o'yin tanlash
    if(data==='token_exchange') {
      const tokens = getTokens(uid);
      return bot.editMessageText(
        `🔄 <b>Tokenni almashtirish</b>\n\n🪙 Sizda: <b>${tokens} token</b>\n\n🎮 Qaysi o'yin uchun almashtirmoqchisiz?`,
        {chat_id:chatId, message_id:msgId, parse_mode:'HTML', reply_markup:{inline_keyboard:[
          [{text:'🎮 PUBG — UC (50 token)', callback_data:'tex_uc'}],
          [{text:'🔥 Free Fire — Diamond (20 token)', callback_data:'tex_diamond'}],
          [{text:'⭐ PUBG — Popularity (20 token)', callback_data:'tex_popularity'}],
          [{text:'⚔️ Clash of Clans — Gems (15 token)', callback_data:'tex_gems'}],
          [{text:'🌟 Mobile Legends (22 token)', callback_data:'tex_mlbb'}],
          [{text:'🟥 Roblox — Robux (30 token)', callback_data:'tex_robux'}],
          [{text:'🔙 Orqaga', callback_data:'back_hisob'}]
        ]}}
      );
    }

    // 🔄 TOKEN ALMASHTIRISH - o'yin tanlandi
    if(data.startsWith('tex_')) {
      const gameType = data.replace('tex_','');
      const ex = TOKEN_EXCHANGE[gameType];
      if(!ex) return;
      const tokens = getTokens(uid);
      const g = gameInfo(gameType);
      if(tokens < ex.tokens) {
        return bot.editMessageText(
          `❌ <b>Token yetarli emas!</b>\n\n🪙 Sizda: <b>${tokens} token</b>\n💡 Kerak: <b>${ex.tokens} token</b>\n\nYetishmaydi: <b>${ex.tokens - tokens} token</b>\n\n👥 Do'stlaringizni taklif qiling, har biri uchun +1 token olasiz!`,
          {chat_id:chatId, message_id:msgId, parse_mode:'HTML', reply_markup:{inline_keyboard:[
            [{text:'👥 Referral havolam', callback_data:'my_referral'}],
            [{text:'🔙 Orqaga', callback_data:'token_exchange'}]
          ]}}
        );
      }
      // Token yetarli — ID so'rash
      setState(uid, {step:'tex_enter_id', texGame:gameType, texEx:ex});
      return bot.editMessageText(
        `✅ <b>${g.name} — ${ex.product}</b>\n\n🪙 Narx: <b>${ex.tokens} token</b>\n💳 Sizda: <b>${tokens} token</b>\n\n📝 <b>${g.idLabel}</b> yuboring:`,
        {chat_id:chatId, message_id:msgId, parse_mode:'HTML', reply_markup:{inline_keyboard:[[{text:'❌ Bekor', callback_data:'token_exchange'}]]}}
      );
    }

    // 🔄 TOKEN ALMASHTIRISH — TASDIQLASH
    if(data==='tex_confirm') {
      const state = getState(uid);
      const ex = state.texEx;
      const gameType = state.texGame;
      if(!ex||!gameType||!state.texId) return;
      const g = gameInfo(gameType);
      const tokens = getTokens(uid);
      if(tokens < ex.tokens) {
        clearState(uid);
        return bot.editMessageText('❌ Token yetarli emas!', {chat_id:chatId, message_id:msgId, parse_mode:'HTML', reply_markup:{inline_keyboard:[[{text:'🔙 Orqaga', callback_data:'token_exchange'}]]}});
      }
      deductTokens(uid, ex.tokens);
      const orderId = createOrder(uid, gameType, ex.product, 0, 0, state.texId, state.texNick||'-', null);
      clearState(uid);
      const newTokens = getTokens(uid);
      const details = gameType==='robux' ? `👤 Roblox: <b>${state.texId}</b>` : `🆔 ID: <code>${state.texId}</code>\n👤 Nik: <b>${state.texNick||'-'}</b>`;
      await bot.editMessageText(
        `✅ <b>Token bilan buyurtma qabul qilindi!</b>\n\n📦 #${orderId}\n${g.emoji} ${g.name}: <b>${ex.product}</b>\n${details}\n🪙 Sarflandi: <b>${ex.tokens} token</b>\n🪙 Qolgan: <b>${newTokens} token</b>\n\n⏳ Admin tasdig'ini kuting (5-15 daqiqa)`,
        {chat_id:chatId, message_id:msgId, parse_mode:'HTML', reply_markup:{inline_keyboard:[[{text:'🏠 Bosh menyu', callback_data:'back_main'}]]}}
      );
      const fromUser = from.username ? `@${from.username}` : from.first_name;
      for(const adminId of ADMIN_IDS) {
        let adminMsg=`🪙 <b>TOKEN buyurtma #${orderId}</b>\n\n👤 ${fromUser} (${uid})\n${g.emoji} <b>${g.name} — ${ex.product}</b>\n`;
        adminMsg += gameType==='robux' ? `👤 Roblox: <code>${state.texId}</code>\n` : `🆔 ID: <code>${state.texId}</code>\n👤 Nik: <b>${state.texNick||'-'}</b>\n`;
        adminMsg += `🪙 To'lov: <b>${ex.tokens} token</b> (Bepul)`;
        await bot.sendMessage(adminId, adminMsg, {parse_mode:'HTML', reply_markup:aordBtn(orderId)}).catch(()=>{});
      }
    }

    if(data==='adm_broadcast'&&isAdmin(uid)) {
      setState(uid,{step:'adm_broadcast'});
      return bot.sendMessage(chatId,`📢 Xabar matnini yozing:`,{reply_markup:{inline_keyboard:[[{text:'❌ Bekor',callback_data:'adm_stats'}]]}});
    }

    if(data.startsWith('adm_ok_')&&isAdmin(uid)) {
      const req=approveTopup(parseInt(data.replace('adm_ok_','')),uid);
      if(!req) return;
      const newBal=getBalance(req.telegram_id);
      // Rasm (photo) yoki matn — ikkalasini ham qo'llab-quvvatlash
      try {
        if(message.photo||message.document) {
          await bot.editMessageCaption(
            (message.caption||'')+'\n\n✅ <b>TASDIQLANDI</b>',
            {chat_id:chatId,message_id:msgId,parse_mode:'HTML'}
          );
        } else {
          await bot.editMessageText(
            (message.text||'')+'\n\n✅ <b>TASDIQLANDI</b>',
            {chat_id:chatId,message_id:msgId,parse_mode:'HTML'}
          );
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
      // Buyurtma xabari matn — editMessageText
      try {
        await bot.editMessageText(
          (message.text||'')+'\n\n✅ <b>BAJARILDI</b>',
          {chat_id:chatId,message_id:msgId,parse_mode:'HTML'}
        );
      } catch(e) { console.error('Edit xato:', e.message); }
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
      try {
        await bot.editMessageText(
          (message.text||'')+'\n\n❌ <b>BEKOR QILINDI — pul qaytarildi</b>',
          {chat_id:chatId,message_id:msgId,parse_mode:'HTML'}
        );
      } catch(e) { console.error('Edit xato:', e.message); }
      await bot.sendMessage(order.telegram_id,
        `⚠️ <b>Buyurtma bekor qilindi</b>\n\n📦 #${orderId}\n💰 Pul qaytarildi: <b>${fmt(order.price)}</b>`,
        {parse_mode:'HTML',reply_markup:mainKeyboard()}
      );
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

  // AI
  // CYBERDROP GAME
  if(text===BTN_CYBER) {
    clearState(uid);
    return bot.sendMessage(chatId,
      `🎮 <b>CyberDrop Game</b>\n\n` +
      `Assalomu alaykum! Bizning o\'yinimizga xush kelibsiz! 🎉\n\n` +
      `Bu o\'yinda <b>tokenlaringiz</b> bilan o\'ynab, ularni ko\'paytirishingiz mumkin!\n\n` +
      `📖 <b>Batafsil yo\'riqnoma:</b>\n\n` +
      `1️⃣ Saytga kiring va ro\'yxatdan o\'ting\n` +
      `2️⃣ Tokenlaringizni o\'yinga kiriting\n` +
      `3️⃣ O\'yin topshiriqlarini bajaring\n` +
      `4️⃣ Yutgan tokenlaringizni balansga qo\'shing\n` +
      `5️⃣ Balans orqali UC, Diamond va boshqa valyutalar sotib oling!\n\n` +
      `💡 <b>Eslatma:</b> O\'yin muntazam yangilanib boradi. Kuzatib boring!\n\n` +
      `👇 O\'yinni boshlash uchun quyidagi tugmani bosing:`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🚀 CyberDrop o\'ynash', url: 'https://mukxabek-prog.github.io/autouc.html/' }]
          ]
        }
      }
    );
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

  // 💼 HISOB ISHLASH
  if(text===BTN_HISOB) {
    clearState(uid);
    const tokens = getTokens(uid);
    const balance = getBalance(uid);
    return bot.sendMessage(chatId,
      `💸 <b>Pul ishlash</b>\n\n🪙 Tokenlaringiz: <b>${tokens} token</b>\n💰 Balansingiz: <b>${fmt(balance)}</b>\n\n1 token = 250 so\'m`,
      {parse_mode:'HTML', reply_markup:{inline_keyboard:[
        [{text:'👥 Referralim', callback_data:'my_referral'}],
        [{text:'🔄 Token → Mahsulot', callback_data:'token_exchange'}],
        [{text:'🛒 Token sotib olish (250 so\'m/dona)', callback_data:'tokshop_menu'}],
        [{text:'💵 Token → So\'m (250 so\'m/dona)', callback_data:'token_to_som'}],
        [{text:'🔙 Orqaga', callback_data:'back_main'}]
      ]}}
    );
  }

  try {
    // PROMOKOD TEKSHIRISH
    if(state.step==='enter_promo') {
      if(!text) return;
      const code=text.trim().toUpperCase();
      const chk=checkPromo(code,uid);
      if(!chk.ok) return bot.sendMessage(chatId,chk.msg,{parse_mode:'HTML'});
      const p=chk.promo;
      markPromoUsed(code,uid);
      let rewardMsg='';
      if(chk.rewardType==='token') {
        addTokens(uid, p.amount);
        const newTokens = getTokens(uid);
        rewardMsg = `🪙 Tokenlaringizga qo\'shildi: <b>${p.amount} token</b>\n🪙 Jami tokenlar: <b>${newTokens} token</b>`;
      } else {
        addBalance(uid,p.amount,`🎟 Promokod: ${code}`);
        const newBal=getBalance(uid);
        rewardMsg = `💸 Hisobingizga qo\'shildi: <b>${fmt(p.amount)}</b>\n💳 Yangi balans: <b>${fmt(newBal)}</b>`;
      }
      clearState(uid);
      return bot.sendMessage(chatId,
        `🎉 <b>Promokod muvaffaqiyatli ishlatildi!</b>\n\n🎟 Kod: <code>${code}</code>\n${rewardMsg}\n\n🛒 Endi xarid qilishingiz mumkin!`,
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

    // TOKEN ALMASHTIRISH — ID KIRITISH
    if(state.step==='tex_enter_id') {
      if(!text) return bot.sendMessage(chatId,'⚠️ Matn kiriting!');
      const ex = state.texEx;
      const gameType = state.texGame;
      const g = gameInfo(gameType);
      let cleanId = text.trim().replace(/\s+/g,'');
      if(gameType==='gems') {
        if(!cleanId.startsWith('#')) cleanId='#'+cleanId;
      } else if(gameType==='robux') {
        if(cleanId.length<3||cleanId.length>20) return bot.sendMessage(chatId,'❌ Roblox username 3-20 ta belgidan iborat!');
      } else {
        if(!/^\d+$/.test(cleanId)) return bot.sendMessage(chatId,`❌ Faqat raqamlar kiriting!`,{parse_mode:'HTML'});
        if(cleanId.length>15) return bot.sendMessage(chatId,'❌ ID maksimum 15 ta raqam!');
      }
      setState(uid, {...state, texId:cleanId, step:'tex_enter_nick'});
      if(gameType==='robux') {
        // Robux uchun nick shart emas, to'g'ri tasdiqlash
        setState(uid, {...getState(uid), step:'tex_confirm'});
        return bot.sendMessage(chatId,
          `📋 <b>Token almashtirish:</b>\n\n${g.emoji} <b>${g.name} — ${ex.product}</b>\n👤 Username: <b>${cleanId}</b>\n🪙 Sarflanadi: <b>${ex.tokens} token</b>\n\nTasdiqlaysizmi?`,
          {parse_mode:'HTML', reply_markup:{inline_keyboard:[
            [{text:'✅ Tasdiqlash', callback_data:'tex_confirm'},{text:'❌ Bekor', callback_data:'token_exchange'}]
          ]}}
        );
      }
      return bot.sendMessage(chatId,`✅ ID: <code>${cleanId}</code>\n\n👤 Endi <b>nikneymingizni</b> yozing:`,{parse_mode:'HTML', reply_markup:{inline_keyboard:[[{text:'❌ Bekor', callback_data:'token_exchange'}]]}});
    }

    // TOKEN ALMASHTIRISH — NIK KIRITISH
    if(state.step==='tex_enter_nick') {
      if(!text||text.trim().length<2) return bot.sendMessage(chatId,'⚠️ Nikneym noto\'g\'ri!');
      const nik = text.trim().slice(0,30);
      const ex = state.texEx;
      const g = gameInfo(state.texGame);
      setState(uid, {...state, texNick:nik, step:'tex_confirm'});
      return bot.sendMessage(chatId,
        `📋 <b>Token almashtirish:</b>\n\n${g.emoji} <b>${g.name} — ${ex.product}</b>\n🆔 ID: <code>${state.texId}</code>\n👤 Nik: <b>${nik}</b>\n🪙 Sarflanadi: <b>${ex.tokens} token</b>\n\nTasdiqlaysizmi?`,
        {parse_mode:'HTML', reply_markup:{inline_keyboard:[
          [{text:'✅ Tasdiqlash', callback_data:'tex_confirm'},{text:'❌ Bekor', callback_data:'token_exchange'}]
        ]}}
      );
    }

    // TOKEN SOTIB OLISH - boshqa miqdor
    if(state.step==='buy_tokens_amount') {
      if(!text) return;
      const amount = parseInt(text.trim().replace(/[\s,]/g,''));
      if(isNaN(amount)||amount<1) return bot.sendMessage(chatId,'❌ Kamida 1 ta token kiriting!');
      if(amount>10000) return bot.sendMessage(chatId,'❌ Maksimum 10,000 token!');
      const cost = amount * 250;
      const balance = getBalance(uid);
      clearState(uid);
      if(balance < cost) {
        return bot.sendMessage(chatId,
          `❌ <b>Balans yetarli emas!</b>\n\n🪙 ${amount} token = <b>${fmt(cost)}</b>\n💰 Balansingiz: <b>${fmt(balance)}</b>\nYetishmaydi: <b>${fmt(cost - balance)}</b>`,
          {parse_mode:'HTML', reply_markup:{inline_keyboard:[
            [{text:"💰 Hisobni to'ldirish", callback_data:'topup_menu'}],
            [{text:'🔙 Orqaga', callback_data:'tokshop_menu'}]
          ]}}
        );
      }
      deductBalance(uid, cost, `${amount} token sotib olindi`);
      addTokens(uid, amount);
      return bot.sendMessage(chatId,
        `✅ <b>Token sotib olindi!</b>\n\n🪙 Qo'shildi: <b>+${amount} token</b>\n💰 Sarflandi: <b>${fmt(cost)}</b>\n\n🪙 Jami tokenlar: <b>${getTokens(uid)} token</b>\n💳 Qolgan balans: <b>${fmt(getBalance(uid))}</b>`,
        {parse_mode:'HTML', reply_markup:mainKeyboard()}
      );
    }

    // TOKEN → SO'M - boshqa miqdor
    if(state.step==='tok2som_amount') {
      if(!text) return;
      const amount = parseInt(text.trim().replace(/[\s,]/g,''));
      const tokens = getTokens(uid);
      if(isNaN(amount)||amount<1) return bot.sendMessage(chatId,'❌ Kamida 1 ta token kiriting!');
      if(amount>tokens) return bot.sendMessage(chatId,`❌ Sizda faqat <b>${tokens} token</b> bor!`,{parse_mode:'HTML'});
      clearState(uid);
      const earned = amount * 250;
      deductTokens(uid, amount);
      addBalance(uid, earned, `${amount} token → so'm almashtirish`);
      return bot.sendMessage(chatId,
        `✅ <b>Almashtirish muvaffaqiyatli!</b>\n\n🪙 Sarflandi: <b>${amount} token</b>\n💰 Qo'shildi: <b>${fmt(earned)}</b>\n\n🪙 Qolgan tokenlar: <b>${getTokens(uid)} token</b>\n💳 Yangi balans: <b>${fmt(getBalance(uid))}</b>`,
        {parse_mode:'HTML', reply_markup:mainKeyboard()}
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

    // ADMIN: PROMO - 1-QADAM: KOD
    if(state.step==='adm_promo_code'&&isAdmin(uid)) {
      if(!text) return;
      const code=text.trim().toUpperCase().replace(/\s+/g,'');
      if(code.length<2||code.length>20) return bot.sendMessage(chatId,'❌ Kod 2-20 belgi bo\'lishi kerak!');
      if(getPromo(code)) return bot.sendMessage(chatId,`❌ <b>${code}</b> allaqachon mavjud! Boshqa kod yozing:`,{parse_mode:'HTML'});
      setState(uid,{step:'adm_promo_type',promoData:{code}});
      return bot.sendMessage(chatId,
        `✅ Kod: <code>${code}</code>\n\n2️⃣ Bonus turi qanday bo\'lsin?`,
        {parse_mode:'HTML',reply_markup:{inline_keyboard:[
          [{text:"💰 So'm bonus",callback_data:'adm_promo_type_som'},{text:"🪙 Token bonus",callback_data:'adm_promo_type_token'}],
          [{text:'❌ Bekor',callback_data:'adm_promos'}]
        ]}});
    }

    // ADMIN: PROMO - 2-QADAM: MIQDOR (matn bilan)
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
        ]}});
    }

    // ADMIN: PROMO - 3-QADAM: MAX USES (matn bilan)
    if(state.step==='adm_promo_maxuses'&&isAdmin(uid)) {
      if(!text) return;
      const maxUses=parseInt(text.trim());
      if(isNaN(maxUses)||maxUses<1) return bot.sendMessage(chatId,'❌ 1 dan katta raqam kiriting!');
      const state2=getState(uid);
      const pd=state2.promoData;
      createPromo(pd.code,pd.amount,maxUses,pd.rewardType||'som');
      clearState(uid);
      const rewardType = pd.rewardType||'som';
      const bonusLabel = rewardType==='token' ? `${pd.amount} token 🪙` : fmt(pd.amount);
      return bot.sendMessage(chatId,
        `✅ <b>Promokod yaratildi!</b>\n\n🎟 Kod: <code>${pd.code}</code>\n💸 Bonus: <b>${bonusLabel}</b>\n👥 Limit: <b>${maxUses} ta odam</b>`,
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
