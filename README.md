# 🎮 PUBG UC Shop Bot

Telegram orqali PUBG Mobile UC va Popularity sotish boti.

## ✨ Xususiyatlar

- 🎯 UC va Popularity sotish
- 💰 Admin orqali hisob to'ldirish (chek bilan)
- 📸 Chek foto/fayl sifatida qabul qilinadi
- ✅ Admin tasdiqlash/rad etish paneli
- 📊 Statistika
- 📢 Broadcast (barcha userlarga xabar)
- 🕐 Buyurtmalar tarixi
- 💳 Balans tizimi
- 🔒 SQLite ma'lumotlar bazasi

## 🚀 O'rnatish

### 1. Bot token olish
[@BotFather](https://t.me/BotFather) orqali yangi bot yarating va token oling.

### 2. Admin ID olish
[@userinfobot](https://t.me/userinfobot) ga yozing — u sizga Telegram ID ni beradi.

### 3. `.env` fayl yarating
```
cp .env.example .env
```

`.env` faylni to'ldiring:
```
BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrSTUvwxYZ
ADMIN_IDS=123456789
BOT_USERNAME=mening_botim
```

Bir nechta admin uchun:
```
ADMIN_IDS=123456789,987654321
```

### 4. O'rnatish va ishga tushirish
```bash
npm install
npm start
```

---

## 🌐 Render.com ga Deploy

1. GitHub/GitLab ga push qiling
2. [render.com](https://render.com) ga kiring
3. **New → Web Service** yoki **Worker** tanlang
4. Repository ni ulang
5. Environment variables qo'shing:
   - `BOT_TOKEN` = bot tokeningiz
   - `ADMIN_IDS` = admin ID(lar)
   - `BOT_USERNAME` = bot username
6. **Create Service** bosing

> ⚠️ **Muhim:** Render free tier da disk bo'lmaydi, shuning uchun `render.yaml` da disk sozlangan — lekin bu **paid** feature. Free tier uchun bot ishlaydi, lekin restart bo'lganda ma'lumotlar o'chishi mumkin. Persistent storage uchun free PostgreSQL (Render DB) dan foydalanish tavsiya etiladi.

---

## 📋 Bot Buyruqlari

| Buyruq | Ta'rif |
|--------|--------|
| `/start` | Botni ishga tushirish |
| `/admin` | Admin panel (faqat adminlar) |

---

## ⚙️ Sozlamalar

### Karta raqamini o'zgartirish
`src/bot.js` faylida `sendPaymentDetails` funksiyasini toping:
```
🏦 <code>8600 0000 0000 0000</code>
👤 Egasi: <b>Admin Ismi</b>
```
O'z karta raqamingizga o'zgartiring.

### Mahsulot narxlarini o'zgartirish
`src/database.js` faylida `insertProduct.run(...)` qatorlarini o'zgartiring.
Yoki ma'lumotlar bazasiga to'g'ridan-to'g'ri SQL orqali yangilang.

### Admin yordamchi username
`src/bot.js` da support bo'limida `@admin_username` ni o'zgartiring.

---

## 🛡️ Xavfsizlik

- Faqat admin IDlar admin panelga kira oladi
- Barcha pul operatsiyalari loglanadi
- ID tekshiruvi: faqat raqamlar, max 15 ta
