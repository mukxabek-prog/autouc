require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const db = require('./database');
const kb = require('./keyboards');

// ========================
// CONFIG
// ========================
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(id => parseInt(id.trim())).filter(Boolean);
const BOT_USERNAME = process.env.BOT_USERNAME || 'bot';

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN topilmadi! .env faylini tekshiring.');
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN); // { polling: true } qismini olib tashlang

// Foydalanuvchi holati (sessiya)
const userStates = {};

function isAdmin(userId) {
  return ADMIN_IDS.includes(parseInt(userId));
}

function getUserState(userId) {
  return userStates[userId] || {};
}

function setUserState(userId, state) {
  userStates[userId] = { ...getUserState(userId), ...state };
}

function clearUserState(userId) {
  delete userStates[userId];
}

// ========================
// ASOSIY MENYU
// ========================
async function sendMainMenu(chatId, userId, text = null) {
  const user = db.getUserByTelegramId(userId);
  const balance = user ? user.balance : 0;

  const menuText = text || `🎮 <b>PUBG UC Shop</b> ga xush kelibsiz!\n\n` +
    `💰 Balansingiz: <b>${kb.formatPrice(balance)}</b>\n\n` +
    `Quyidagi menyu orqali xizmatlardan foydalaning:`;

  await bot.sendMessage(chatId, menuText, {
    parse_mode: 'HTML',
    reply_markup: kb.mainMenuKeyboard()
  });
}

// ========================
// START
// ========================
bot.onText(/\/start/, async (msg) => {
  const { id: chatId, from } = msg;
  const userId = from.id;
  const username = from.username || null;
  const fullName = [from.first_name, from.last_name].filter(Boolean).join(' ');

  clearUserState(userId);
  db.getOrCreateUser(userId, username, fullName);

  const welcomeText = `👋 Salom, <b>${from.first_name}</b>!\n\n` +
    `🎮 <b>PUBG UC Shop</b> ga xush kelibsiz!\n\n` +
    `Bu yerda siz:\n` +
    `🔹 <b>UC</b> — PUBG Mobile uchun valyuta\n` +
    `🔹 <b>Popularity</b> — obro' ballar\n\n` +
    `sotib olishingiz mumkin.\n\n` +
    `💳 To'lov admin orqali tasdiqlanadi.\n` +
    `⚡ Tez va ishonchli yetkazib berish kafolatlanadi!`;

  await bot.sendMessage(chatId, welcomeText, {
    parse_mode: 'HTML',
    reply_markup: kb.mainMenuKeyboard()
  });
});

// Admin buyrug'i
bot.onText(/\/admin/, async (msg) => {
  if (!isAdmin(msg.from.id)) return;
  await bot.sendMessage(msg.chat.id, '⚙️ <b>Admin Panel</b>', {
    parse_mode: 'HTML',
    reply_markup: kb.adminPanelKeyboard()
  });
});

// ========================
// CALLBACK QUERY HANDLER
// ========================
bot.on('callback_query', async (query) => {
  const { data, from, message } = query;
  const userId = from.id;
  const chatId = message.chat.id;
  const msgId = message.message_id;

  await bot.answerCallbackQuery(query.id);

  try {
    // ========== MAIN MENU ==========
    if (data === 'main_menu') {
      clearUserState(userId);
      const user = db.getUserByTelegramId(userId);
      const balance = user ? user.balance : 0;
      await bot.editMessageText(
        `🎮 <b>PUBG UC Shop</b>\n\n💰 Balansingiz: <b>${kb.formatPrice(balance)}</b>\n\nQuyidagi menyu orqali xizmatlardan foydalaning:`,
        { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: kb.mainMenuKeyboard() }
      );
    }

    // ========== UC SOTISH ==========
    else if (data === 'buy_uc') {
      const products = db.getProducts('uc');
      await bot.editMessageText(
        `🎯 <b>UC Sotib olish</b>\n\nQuyidagi UC paketlaridan birini tanlang:\n\n` +
        `💡 UC — PUBG Mobile ichidagi asosiy valyuta.\n` +
        `Kiyim, silah skinlari va boshqa narsalar sotib olishingiz mumkin!`,
        {
          chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
          reply_markup: kb.ucProductsKeyboard(products)
        }
      );
    }

    // ========== POPULARITY SOTISH ==========
    else if (data === 'buy_popularity') {
      const products = db.getProducts('popularity');
      await bot.editMessageText(
        `⭐ <b>Popularity Sotib olish</b>\n\nQuyidagi paketlardan birini tanlang:\n\n` +
        `💡 Popularity — PUBG Mobile profil obro'ingizni oshiradi!\n` +
        `Reytingda yuqoriga chiqib, do'stlaringizni hayron qoldiring!`,
        {
          chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
          reply_markup: kb.popularityProductsKeyboard(products)
        }
      );
    }

    // ========== MAHSULOT TANLASH ==========
    else if (data.startsWith('product_')) {
      const productId = parseInt(data.split('_')[1]);
      const product = db.getProductById(productId);
      if (!product) return;

      const user = db.getUserByTelegramId(userId);
      const balance = user ? user.balance : 0;

      setUserState(userId, { selectedProduct: productId, step: 'enter_pubg_id' });

      const emoji = product.type === 'uc' ? '🎯' : '⭐';
      const insufficientBalance = balance < product.price;

      let text = `${emoji} <b>${product.name}</b>\n\n` +
        `💰 Narx: <b>${kb.formatPrice(product.price)}</b>\n` +
        `💳 Balansingiz: <b>${kb.formatPrice(balance)}</b>\n\n`;

      if (insufficientBalance) {
        text += `⚠️ <b>Balans yetarli emas!</b>\n` +
          `Kerakli summa: <b>${kb.formatPrice(product.price - balance)}</b>\n\n` +
          `Hisobingizni to'ldiring va qaytib keling.`;
        await bot.editMessageText(text, {
          chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '💰 Hisobni to\'ldirish', callback_data: 'topup_menu' }],
              [{ text: '🔙 Orqaga', callback_data: `buy_${product.type}` }]
            ]
          }
        });
      } else {
        text += `📝 PUBG Mobile <b>ID raqamingizni</b> yuboring:\n\n` +
          `⚠️ Faqat raqamlar (max 15 ta)\n` +
          `💡 ID ni topish: PUBG Mobile → Profil → ID raqam`;
        await bot.editMessageText(text, {
          chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[{ text: '❌ Bekor qilish', callback_data: 'main_menu' }]]
          }
        });
      }
    }

    // ========== BUYURTMANI TASDIQLASH ==========
    else if (data.startsWith('confirm_order_')) {
      const productId = parseInt(data.replace('confirm_order_', ''));
      const state = getUserState(userId);
      const product = db.getProductById(productId);

      if (!product || !state.pubgId || !state.pubgNick) {
        await bot.sendMessage(chatId, '❌ Xato yuz berdi. Qaytadan urinib ko\'ring.', {
          reply_markup: kb.backToMenuKeyboard()
        });
        return;
      }

      const user = db.getUserByTelegramId(userId);
      if (!user || user.balance < product.price) {
        await bot.editMessageText('❌ Balans yetarli emas!', {
          chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
          reply_markup: kb.backToMenuKeyboard()
        });
        return;
      }

      // Balansdan ayirish
      const deducted = db.deductBalance(userId, product.price, `${product.name} xaridi`);
      if (!deducted) {
        await bot.editMessageText('❌ To\'lov amalga oshmadi. Balansni tekshiring.', {
          chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
          reply_markup: kb.backToMenuKeyboard()
        });
        return;
      }

      // Buyurtma yaratish
      const orderId = db.createOrder(
        userId, product.type, product.name,
        product.amount, product.price,
        state.pubgId, state.pubgNick
      );

      clearUserState(userId);

      const newBalance = db.getUserBalance(userId);
      const emoji = product.type === 'uc' ? '🎯' : '⭐';

      await bot.editMessageText(
        `✅ <b>Buyurtma qabul qilindi!</b>\n\n` +
        `📦 Buyurtma #${orderId}\n` +
        `${emoji} Mahsulot: <b>${product.name}</b>\n` +
        `🆔 PUBG ID: <b>${state.pubgId}</b>\n` +
        `👤 Nik: <b>${state.pubgNick}</b>\n` +
        `💰 To\'langan: <b>${kb.formatPrice(product.price)}</b>\n` +
        `💳 Qolgan balans: <b>${kb.formatPrice(newBalance)}</b>\n\n` +
        `⏳ <b>Admin tasdig'ini kuting...</b>\n` +
        `Odatda 5-15 daqiqa ichida yetkaziladi!`,
        {
          chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
          reply_markup: kb.backToMenuKeyboard()
        }
      );

      // Adminga xabar yuborish
      const fromUser = from.username ? `@${from.username}` : from.first_name;
      for (const adminId of ADMIN_IDS) {
        await bot.sendMessage(adminId,
          `🛒 <b>Yangi buyurtma #${orderId}</b>\n\n` +
          `👤 Foydalanuvchi: ${fromUser} (ID: ${userId})\n` +
          `${emoji} Mahsulot: <b>${product.name}</b>\n` +
          `🆔 PUBG ID: <code>${state.pubgId}</code>\n` +
          `👤 Nik: <b>${state.pubgNick}</b>\n` +
          `💰 Summa: <b>${kb.formatPrice(product.price)}</b>`,
          {
            parse_mode: 'HTML',
            reply_markup: kb.adminOrderKeyboard(orderId)
          }
        );
      }
    }

    // ========== HISOB TO'LDIRISH ==========
    else if (data === 'topup_menu') {
      await bot.editMessageText(
        `💰 <b>Hisobni to\'ldirish</b>\n\n` +
        `To\'ldirmoqchi bo\'lgan summani tanlang yoki o\'zingiz kiriting.\n\n` +
        `📌 <b>To'lov usuli:</b> Admin orqali\n` +
        `📱 Pul o\'tkazilgandan so\'ng chek/screenshot yuboring.\n` +
        `✅ Admin tasdiqlashidan so\'ng balans avtomatik qo\'shiladi.`,
        {
          chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
          reply_markup: kb.topupAmountKeyboard()
        }
      );
    }

    else if (data.startsWith('topup_') && data !== 'topup_menu') {
      const amountStr = data.replace('topup_', '');

      if (amountStr === 'custom') {
        setUserState(userId, { step: 'enter_topup_amount' });
        await bot.editMessageText(
          `✏️ <b>Miqdorni kiriting</b>\n\n` +
          `Nechta so\'m to\'ldirmoqchisiz?\n` +
          `Faqat raqam kiriting (masalan: 75000)`,
          {
            chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: '❌ Bekor qilish', callback_data: 'topup_menu' }]] }
          }
        );
      } else {
        const amount = parseInt(amountStr);
        setUserState(userId, { step: 'send_receipt', topupAmount: amount });
        await sendPaymentDetails(chatId, msgId, amount, true);
      }
    }

    // ========== MENING HISOBIM ==========
    else if (data === 'my_account') {
      const user = db.getUserByTelegramId(userId);
      if (!user) return;
      const transactions = db.getUserTransactions(userId, 5);
      let txText = '';
      if (transactions.length > 0) {
        txText = '\n\n📋 <b>So\'nggi operatsiyalar:</b>\n';
        transactions.forEach(tx => {
          const sign = tx.amount > 0 ? '+' : '';
          const date = new Date(tx.created_at).toLocaleDateString('uz-UZ');
          txText += `${sign}${kb.formatPrice(Math.abs(tx.amount))} — ${tx.description} (${date})\n`;
        });
      }
      await bot.editMessageText(
        `👤 <b>Mening hisobim</b>\n\n` +
        `🆔 Telegram ID: <code>${userId}</code>\n` +
        `👤 Ism: <b>${user.full_name || 'Noma\'lum'}</b>\n` +
        `💰 Balans: <b>${kb.formatPrice(user.balance)}</b>\n` +
        `💸 Jami sarflangan: <b>${kb.formatPrice(user.total_spent)}</b>\n` +
        `📅 Ro\'yxatdan o\'tgan: <b>${new Date(user.joined_at).toLocaleDateString('uz-UZ')}</b>` +
        txText,
        {
          chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '💰 Hisobni to\'ldirish', callback_data: 'topup_menu' }],
              [{ text: '🏠 Bosh menyu', callback_data: 'main_menu' }]
            ]
          }
        }
      );
    }

    // ========== MENING BUYURTMALARIM ==========
    else if (data === 'my_orders') {
      const orders = db.getUserOrders(userId, 10);
      if (orders.length === 0) {
        await bot.editMessageText(
          `📋 <b>Buyurtmalarim</b>\n\nSizda hali buyurtmalar yo\'q.`,
          {
            chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
            reply_markup: kb.backToMenuKeyboard()
          }
        );
        return;
      }

      let text = `📋 <b>So\'nggi buyurtmalarim</b>\n\n`;
      orders.forEach((o, i) => {
        const statusEmoji = o.status === 'completed' ? '✅' : o.status === 'pending' ? '⏳' : '❌';
        const date = new Date(o.created_at).toLocaleDateString('uz-UZ');
        text += `${i + 1}. #${o.id} ${statusEmoji} <b>${o.product_name}</b>\n`;
        text += `   🆔 ID: ${o.pubg_id} | 💰 ${kb.formatPrice(o.price)} | 📅 ${date}\n\n`;
      });

      await bot.editMessageText(text, {
        chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
        reply_markup: kb.backToMenuKeyboard()
      });
    }

    // ========== QO'LLAB-QUVVATLASH ==========
    else if (data === 'support') {
      await bot.editMessageText(
        `📞 <b>Qo\'llab-quvvatlash</b>\n\n` +
        `Muammo yoki savollaringiz bo\'lsa:\n\n` +
        `👨‍💼 Admin bilan bog\'laning:\n` +
        `📱 @admin_username\n\n` +
        `⏰ Ish vaqti: 09:00 - 22:00\n\n` +
        `💬 Murojaat vaqtida buyurtma raqamingizni yozing!`,
        {
          chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
          reply_markup: kb.backToMenuKeyboard()
        }
      );
    }

    // ========================
    // ADMIN CALLBACKS
    // ========================

    // Admin: To'ldirish tasdiqlash
    else if (data.startsWith('admin_approve_') && isAdmin(userId)) {
      const reqId = parseInt(data.replace('admin_approve_', ''));
      const req = db.approveTopupRequest(reqId, userId);
      if (!req) {
        await bot.answerCallbackQuery(query.id, { text: '❌ So\'rov topilmadi yoki allaqachon ko\'rib chiqilgan!' });
        return;
      }
      const newBalance = db.getUserBalance(req.telegram_id);
      await bot.editMessageText(
        message.text + `\n\n✅ <b>TASDIQLANDI</b> — Admin ID: ${userId}`,
        { chat_id: chatId, message_id: msgId, parse_mode: 'HTML' }
      );
      // Foydalanuvchiga xabar
      await bot.sendMessage(req.telegram_id,
        `✅ <b>Hisobingiz to\'ldirildi!</b>\n\n` +
        `💰 Qo\'shilgan summa: <b>${kb.formatPrice(req.amount)}</b>\n` +
        `💳 Joriy balans: <b>${kb.formatPrice(newBalance)}</b>\n\n` +
        `Xarid qilishingiz mumkin! 🎮`,
        { parse_mode: 'HTML', reply_markup: kb.mainMenuKeyboard() }
      );
    }

    // Admin: To'ldirish rad etish
    else if (data.startsWith('admin_reject_') && isAdmin(userId)) {
      const reqId = parseInt(data.replace('admin_reject_', ''));
      setUserState(userId, { step: 'admin_reject_reason', rejectTopupId: reqId, adminMsgId: msgId, adminChatId: chatId });
      await bot.sendMessage(chatId,
        `❌ Rad etish sababini yozing:\n(Foydalanuvchiga yuboriladi)`,
        { parse_mode: 'HTML' }
      );
    }

    // Admin: Buyurtma bajarildi
    else if (data.startsWith('admin_complete_') && isAdmin(userId)) {
      const orderId = parseInt(data.replace('admin_complete_', ''));
      const order = db.getOrder(orderId);
      if (!order) return;
      db.completeOrder(orderId);
      await bot.editMessageText(
        message.text + `\n\n✅ <b>BAJARILDI</b> — Admin ID: ${userId}`,
        { chat_id: chatId, message_id: msgId, parse_mode: 'HTML' }
      );
      const emoji = order.product_type === 'uc' ? '🎯' : '⭐';
      await bot.sendMessage(order.telegram_id,
        `✅ <b>Buyurtmangiz bajarildi!</b>\n\n` +
        `📦 Buyurtma #${orderId}\n` +
        `${emoji} <b>${order.product_name}</b>\n` +
        `🆔 PUBG ID: <code>${order.pubg_id}</code>\n\n` +
        `O\'yiningizni tekshiring! 🎮\n` +
        `Rahmat, bizni tanlaganingiz uchun! ❤️`,
        { parse_mode: 'HTML', reply_markup: kb.mainMenuKeyboard() }
      );
    }

    // Admin: Buyurtma bekor qilish
    else if (data.startsWith('admin_cancel_') && isAdmin(userId)) {
      const orderId = parseInt(data.replace('admin_cancel_', ''));
      const order = db.getOrder(orderId);
      if (!order) return;
      // Pulni qaytarish
      db.addBalance(order.telegram_id, order.price, `Buyurtma #${orderId} bekor — pul qaytarildi`);
      db.cancelOrder(orderId, 'Admin tomonidan bekor qilindi');
      await bot.editMessageText(
        message.text + `\n\n❌ <b>BEKOR QILINDI</b> — Admin ID: ${userId}`,
        { chat_id: chatId, message_id: msgId, parse_mode: 'HTML' }
      );
      await bot.sendMessage(order.telegram_id,
        `⚠️ <b>Buyurtma bekor qilindi</b>\n\n` +
        `📦 Buyurtma #${orderId}\n` +
        `💰 Pul balansga qaytarildi: <b>${kb.formatPrice(order.price)}</b>\n\n` +
        `❓ Savol bo'lsa admin bilan bog'laning.`,
        { parse_mode: 'HTML', reply_markup: kb.mainMenuKeyboard() }
      );
    }

    // Admin: Statistika
    else if (data === 'admin_stats' && isAdmin(userId)) {
      const stats = db.getStats();
      await bot.editMessageText(
        `📊 <b>Bot Statistikasi</b>\n\n` +
        `👥 Jami foydalanuvchilar: <b>${stats.totalUsers}</b>\n` +
        `📦 Bajarilgan buyurtmalar: <b>${stats.totalOrders}</b>\n` +
        `💰 Jami daromad: <b>${kb.formatPrice(stats.totalRevenue)}</b>\n\n` +
        `⏳ Kutayotgan to'ldirish: <b>${stats.pendingTopups}</b>\n` +
        `🔄 Kutayotgan buyurtmalar: <b>${stats.pendingOrders}</b>`,
        {
          chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
          reply_markup: kb.adminPanelKeyboard()
        }
      );
    }

    // Admin: Kutayotgan to'ldirish so'rovlari
    else if (data === 'admin_pending_topups' && isAdmin(userId)) {
      const requests = db.getPendingTopupRequests();
      if (requests.length === 0) {
        await bot.editMessageText('✅ Kutayotgan to\'ldirish so\'rovlari yo\'q.', {
          chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
          reply_markup: kb.adminPanelKeyboard()
        });
        return;
      }
      await bot.editMessageText(
        `⏳ <b>${requests.length} ta kutayotgan to\'ldirish so\'rovi bor.</b>\n\nQuyida cheklar yuboriladi...`,
        { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: kb.adminPanelKeyboard() }
      );
      for (const req of requests) {
        const user = db.getUserByTelegramId(req.telegram_id);
        const userName = user ? (user.username ? `@${user.username}` : user.full_name) : `ID: ${req.telegram_id}`;
        const date = new Date(req.created_at).toLocaleString('uz-UZ');
        const caption = `💰 <b>To\'ldirish so\'rovi #${req.id}</b>\n\n` +
          `👤 Foydalanuvchi: ${userName} (${req.telegram_id})\n` +
          `💰 Summa: <b>${kb.formatPrice(req.amount)}</b>\n` +
          `📅 Vaqt: ${date}`;
        try {
          if (req.receipt_type === 'photo') {
            await bot.sendPhoto(chatId, req.receipt_file_id, {
              caption, parse_mode: 'HTML',
              reply_markup: kb.adminTopupKeyboard(req.id)
            });
          } else if (req.receipt_type === 'document') {
            await bot.sendDocument(chatId, req.receipt_file_id, {
              caption, parse_mode: 'HTML',
              reply_markup: kb.adminTopupKeyboard(req.id)
            });
          } else {
            await bot.sendMessage(chatId, caption, {
              parse_mode: 'HTML',
              reply_markup: kb.adminTopupKeyboard(req.id)
            });
          }
        } catch (e) {
          await bot.sendMessage(chatId, caption + '\n\n⚠️ Chek yuklanmagan yoki o\'chirilgan.', {
            parse_mode: 'HTML',
            reply_markup: kb.adminTopupKeyboard(req.id)
          });
        }
      }
    }

    // Admin: Barcha buyurtmalar
    else if (data === 'admin_all_orders' && isAdmin(userId)) {
      const orders = db.getAllOrders(20);
      if (orders.length === 0) {
        await bot.editMessageText('📦 Hali buyurtmalar yo\'q.', {
          chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
          reply_markup: kb.adminPanelKeyboard()
        });
        return;
      }
      let text = `📦 <b>So\'nggi 20 buyurtma:</b>\n\n`;
      orders.forEach(o => {
        const statusEmoji = o.status === 'completed' ? '✅' : o.status === 'pending' ? '⏳' : '❌';
        const date = new Date(o.created_at).toLocaleDateString('uz-UZ');
        text += `${statusEmoji} #${o.id} — ${o.product_name} — ID: ${o.pubg_id} (${date})\n`;
      });
      await bot.editMessageText(text, {
        chat_id: chatId, message_id: msgId, parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: '🔙 Admin panel', callback_data: 'admin_stats' }]]
        }
      });
    }

    // Admin: Broadcast
    else if (data === 'admin_broadcast' && isAdmin(userId)) {
      setUserState(userId, { step: 'admin_broadcast' });
      await bot.sendMessage(chatId,
        `📢 <b>Barcha foydalanuvchilarga xabar yuborish</b>\n\nXabar matnini yozing:`,
        { parse_mode: 'HTML' }
      );
    }

  } catch (err) {
    console.error('Callback xatosi:', err);
  }
});

// ========================
// PAYMENT DETAILS HELPER
// ========================
async function sendPaymentDetails(chatId, msgId, amount, edit = false) {
  const text = `💰 <b>To\'ldirish: ${kb.formatPrice(amount)}</b>\n\n` +
    `📱 <b>To\'lov yo\'riqnomasi:</b>\n\n` +
    `1️⃣ Quyidagi karta raqamiga pul o\'tkazing:\n` +
    `🏦 <code>8600 0000 0000 0000</code>\n` +
    `👤 Egasi: <b>Admin Ismi</b>\n\n` +
    `2️⃣ O\'tkazma miqdori: <b>${kb.formatPrice(amount)}</b>\n\n` +
    `3️⃣ To\'lovdan so\'ng <b>chek (screenshot)</b> yuboring\n\n` +
    `⚠️ Muhim: Faqat shu miqdorni o\'tkazing!\n` +
    `✅ Admin tasdiqlashidan so\'ng balans qo\'shiladi.`;

  const opts = {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[{ text: '❌ Bekor qilish', callback_data: 'topup_menu' }]] }
  };

  if (edit && msgId) {
    await bot.editMessageText(text, { chat_id: chatId, message_id: msgId, ...opts });
  } else {
    await bot.sendMessage(chatId, text, opts);
  }
}

// ========================
// MESSAGE HANDLER
// ========================
bot.on('message', async (msg) => {
  const { chat, from, text, photo, document } = msg;
  const userId = from.id;
  const chatId = chat.id;
  const state = getUserState(userId);

  // Boshlang'ich buyruqlar
  if (text && text.startsWith('/')) return;

  try {
    // ========== PUBG ID KIRITING ==========
    if (state.step === 'enter_pubg_id') {
      if (!text) {
        return bot.sendMessage(chatId, '⚠️ Faqat PUBG ID raqamini yozing!');
      }
      const cleanId = text.trim().replace(/\s+/g, '');

      if (!/^\d+$/.test(cleanId)) {
        return bot.sendMessage(chatId,
          `❌ <b>Noto'g'ri format!</b>\n\nFaqat raqamlar kiriting!\nMasalan: <code>5123456789</code>`,
          { parse_mode: 'HTML' }
        );
      }
      if (cleanId.length > 15) {
        return bot.sendMessage(chatId,
          `❌ <b>ID juda uzun!</b>\n\nPUBG ID maksimum 15 ta raqamdan iborat.\nSiz kiritdingiz: ${cleanId.length} ta`,
          { parse_mode: 'HTML' }
        );
      }

      setUserState(userId, { pubgId: cleanId, step: 'enter_pubg_nick' });
      await bot.sendMessage(chatId,
        `✅ ID: <code>${cleanId}</code>\n\n` +
        `👤 Endi PUBG Mobile <b>nikneymingizni</b> yozing:`,
        {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [[{ text: '❌ Bekor qilish', callback_data: 'main_menu' }]] }
        }
      );
    }

    // ========== PUBG NIK KIRITING ==========
    else if (state.step === 'enter_pubg_nick') {
      if (!text || text.trim().length < 2) {
        return bot.sendMessage(chatId, '⚠️ Nikneym noto\'g\'ri. Qaytadan kiriting!');
      }
      const nick = text.trim().slice(0, 30);
      const product = db.getProductById(state.selectedProduct);
      if (!product) return;

      setUserState(userId, { pubgNick: nick, step: 'confirm_order' });

      const emoji = product.type === 'uc' ? '🎯' : '⭐';
      await bot.sendMessage(chatId,
        `📋 <b>Buyurtma ma'lumotlari:</b>\n\n` +
        `${emoji} Mahsulot: <b>${product.name}</b>\n` +
        `🆔 PUBG ID: <code>${state.pubgId}</code>\n` +
        `👤 Nik: <b>${nick}</b>\n` +
        `💰 Narx: <b>${kb.formatPrice(product.price)}</b>\n\n` +
        `Tasdiqlaysizmi?`,
        {
          parse_mode: 'HTML',
          reply_markup: kb.confirmOrderKeyboard(state.selectedProduct)
        }
      );
    }

    // ========== TO'LDIRISH MIQDORI KIRITISH ==========
    else if (state.step === 'enter_topup_amount') {
      if (!text) return;
      const amount = parseInt(text.replace(/\s+/g, '').replace(/,/g, ''));
      if (isNaN(amount) || amount < 1000) {
        return bot.sendMessage(chatId, '❌ Noto\'g\'ri miqdor! Minimum 1,000 so\'m kiriting.');
      }
      if (amount > 10000000) {
        return bot.sendMessage(chatId, '❌ Maksimal miqdor: 10,000,000 so\'m');
      }
      setUserState(userId, { step: 'send_receipt', topupAmount: amount });
      await sendPaymentDetails(chatId, null, amount, false);
    }

    // ========== CHEK YUBORISH ==========
    else if (state.step === 'send_receipt') {
      const amount = state.topupAmount;
      if (!amount) return;

      let fileId = null;
      let fileType = null;

      if (photo) {
        fileId = photo[photo.length - 1].file_id;
        fileType = 'photo';
      } else if (document) {
        fileId = document.file_id;
        fileType = 'document';
      }

      if (!fileId) {
        return bot.sendMessage(chatId,
          `📸 Iltimos, to\'lov checkini <b>rasm yoki fayl</b> sifatida yuboring!\n\n` +
          `💡 Maslahat: Screenshot oling va yuboring.`,
          { parse_mode: 'HTML' }
        );
      }

      // So'rov yaratish
      const reqId = db.createTopupRequest(userId, amount, fileId, fileType);
      clearUserState(userId);

      await bot.sendMessage(chatId,
        `✅ <b>Chek qabul qilindi!</b>\n\n` +
        `📋 So\'rov #${reqId}\n` +
        `💰 Summa: <b>${kb.formatPrice(amount)}</b>\n\n` +
        `⏳ <b>Admin tasdig'ini kuting...</b>\n` +
        `Odatda 5-30 daqiqa ichida ko\'rib chiqiladi.\n\n` +
        `✅ Tasdiqlanganda balans avtomatik qo\'shiladi!`,
        { parse_mode: 'HTML', reply_markup: kb.mainMenuKeyboard() }
      );

      // Adminga xabar
      const user = db.getUserByTelegramId(userId);
      const userName = user?.username ? `@${user.username}` : (user?.full_name || `ID: ${userId}`);
      const caption = `💰 <b>Yangi to\'ldirish so\'rovi #${reqId}</b>\n\n` +
        `👤 Foydalanuvchi: ${userName} (${userId})\n` +
        `💰 Summa: <b>${kb.formatPrice(amount)}</b>`;

      for (const adminId of ADMIN_IDS) {
        try {
          if (fileType === 'photo') {
            await bot.sendPhoto(adminId, fileId, {
              caption, parse_mode: 'HTML',
              reply_markup: kb.adminTopupKeyboard(reqId)
            });
          } else {
            await bot.sendDocument(adminId, fileId, {
              caption, parse_mode: 'HTML',
              reply_markup: kb.adminTopupKeyboard(reqId)
            });
          }
        } catch (e) {
          console.error('Adminga yuborishda xato:', e.message);
        }
      }
    }

    // ========== ADMIN: RAD ETISH SABABI ==========
    else if (state.step === 'admin_reject_reason' && isAdmin(userId)) {
      const reason = text || 'Sabab ko\'rsatilmagan';
      const reqId = state.rejectTopupId;
      const req = db.rejectTopupRequest(reqId, userId, reason);

      if (!req) {
        return bot.sendMessage(chatId, '❌ So\'rov topilmadi!');
      }

      await bot.sendMessage(chatId, `✅ So\'rov #${reqId} rad etildi.`);

      // Foydalanuvchiga xabar
      await bot.sendMessage(req.telegram_id,
        `❌ <b>To\'ldirish so\'rovi rad etildi</b>\n\n` +
        `📋 So\'rov #${reqId}\n` +
        `💰 Summa: <b>${kb.formatPrice(req.amount)}</b>\n\n` +
        `📝 Sabab: <b>${reason}</b>\n\n` +
        `❓ Shubhangiz bo\'lsa yoki xato bo\'lsa, admin bilan bog\'laning.`,
        { parse_mode: 'HTML', reply_markup: kb.mainMenuKeyboard() }
      );

      clearUserState(userId);
    }

    // ========== ADMIN: BROADCAST ==========
    else if (state.step === 'admin_broadcast' && isAdmin(userId)) {
      if (!text) return;
      clearUserState(userId);
      const users = db.getAllUsers();
      let sent = 0, failed = 0;
      await bot.sendMessage(chatId, `📢 Yuborilmoqda... (${users.length} ta foydalanuvchi)`);

      for (const user of users) {
        try {
          await bot.sendMessage(user.telegram_id,
            `📢 <b>Admin xabari:</b>\n\n${text}`,
            { parse_mode: 'HTML' }
          );
          sent++;
          await new Promise(r => setTimeout(r, 50)); // Rate limit
        } catch (e) {
          failed++;
        }
      }

      await bot.sendMessage(chatId,
        `✅ Broadcast tugadi!\n✅ Yuborildi: ${sent}\n❌ Xato: ${failed}`
      );
    }

    // Noma'lum xabar
    else if (text && !state.step) {
      await sendMainMenu(chatId, userId);
    }

  } catch (err) {
    console.error('Message xatosi:', err);
  }
});

// ========================
// ERROR HANDLERS
// ========================
bot.on('polling_error', (err) => {
  console.error('Polling xatosi:', err.message);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

// ========================
// HTTP SERVER (Render Free uchun)
// ========================
const http = require('http');
const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('PUBG UC Bot ishlayapti! 🎮');
});

server.listen(PORT, () => {
  console.log(`🌐 HTTP server port ${PORT} da ishga tushdi`);
});

console.log('🚀 PUBG UC Bot ishga tushdi!');
console.log(`👥 Adminlar: ${ADMIN_IDS.join(', ')}`);
