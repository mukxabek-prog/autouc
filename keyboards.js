// ========================
// INLINE KEYBOARDS
// ========================

function mainMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '🎮 UC sotib olish', callback_data: 'buy_uc' },
        { text: '⭐ Popularity sotib olish', callback_data: 'buy_popularity' }
      ],
      [
        { text: '💰 Hisobni to\'ldirish', callback_data: 'topup_menu' },
        { text: '👤 Mening hisobim', callback_data: 'my_account' }
      ],
      [
        { text: '📋 Buyurtmalarim', callback_data: 'my_orders' },
        { text: '📞 Qo\'llab-quvvatlash', callback_data: 'support' }
      ]
    ]
  };
}

function topupAmountKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '5,000 so\'m', callback_data: 'topup_5000' },
        { text: '10,000 so\'m', callback_data: 'topup_10000' }
      ],
      [
        { text: '20,000 so\'m', callback_data: 'topup_20000' },
        { text: '50,000 so\'m', callback_data: 'topup_50000' }
      ],
      [
        { text: '100,000 so\'m', callback_data: 'topup_100000' },
        { text: '200,000 so\'m', callback_data: 'topup_200000' }
      ],
      [
        { text: '✏️ Boshqa miqdor', callback_data: 'topup_custom' }
      ],
      [
        { text: '🔙 Orqaga', callback_data: 'main_menu' }
      ]
    ]
  };
}

function ucProductsKeyboard(products) {
  const rows = [];
  for (let i = 0; i < products.length; i += 2) {
    const row = [];
    row.push({
      text: `🎯 ${products[i].name} — ${formatPrice(products[i].price)}`,
      callback_data: `product_${products[i].id}`
    });
    if (products[i + 1]) {
      row.push({
        text: `🎯 ${products[i + 1].name} — ${formatPrice(products[i + 1].price)}`,
        callback_data: `product_${products[i + 1].id}`
      });
    }
    rows.push(row);
  }
  rows.push([{ text: '🔙 Orqaga', callback_data: 'main_menu' }]);
  return { inline_keyboard: rows };
}

function popularityProductsKeyboard(products) {
  const rows = [];
  for (let i = 0; i < products.length; i += 2) {
    const row = [];
    row.push({
      text: `⭐ ${products[i].name} — ${formatPrice(products[i].price)}`,
      callback_data: `product_${products[i].id}`
    });
    if (products[i + 1]) {
      row.push({
        text: `⭐ ${products[i + 1].name} — ${formatPrice(products[i + 1].price)}`,
        callback_data: `product_${products[i + 1].id}`
      });
    }
    rows.push(row);
  }
  rows.push([{ text: '🔙 Orqaga', callback_data: 'main_menu' }]);
  return { inline_keyboard: rows };
}

function confirmOrderKeyboard(productId) {
  return {
    inline_keyboard: [
      [
        { text: '✅ Tasdiqlash', callback_data: `confirm_order_${productId}` },
        { text: '❌ Bekor qilish', callback_data: 'main_menu' }
      ]
    ]
  };
}

function backToMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🏠 Bosh menyu', callback_data: 'main_menu' }]
    ]
  };
}

function adminTopupKeyboard(requestId) {
  return {
    inline_keyboard: [
      [
        { text: '✅ Tasdiqlash', callback_data: `admin_approve_${requestId}` },
        { text: '❌ Rad etish', callback_data: `admin_reject_${requestId}` }
      ]
    ]
  };
}

function adminOrderKeyboard(orderId) {
  return {
    inline_keyboard: [
      [
        { text: '✅ Bajarildi', callback_data: `admin_complete_${orderId}` },
        { text: '❌ Bekor qilish', callback_data: `admin_cancel_${orderId}` }
      ]
    ]
  };
}

function adminPanelKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '📊 Statistika', callback_data: 'admin_stats' },
        { text: '⏳ Kutayotgan to\'ldirish', callback_data: 'admin_pending_topups' }
      ],
      [
        { text: '📦 Barcha buyurtmalar', callback_data: 'admin_all_orders' },
        { text: '👥 Foydalanuvchilar', callback_data: 'admin_users' }
      ],
      [
        { text: '📢 Xabar yuborish', callback_data: 'admin_broadcast' }
      ]
    ]
  };
}

function formatPrice(price) {
  return price.toLocaleString('uz-UZ') + ' so\'m';
}

module.exports = {
  mainMenuKeyboard,
  topupAmountKeyboard,
  ucProductsKeyboard,
  popularityProductsKeyboard,
  confirmOrderKeyboard,
  backToMenuKeyboard,
  adminTopupKeyboard,
  adminOrderKeyboard,
  adminPanelKeyboard,
  formatPrice
};
