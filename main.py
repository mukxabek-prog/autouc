import asyncio
import logging
import asyncpg
import os
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import Command
from aiogram.utils.keyboard import ReplyKeyboardBuilder, InlineKeyboardBuilder
from aiogram.types import FSInputFile
from aiogram.fsm.state import StatesGroup, State
from aiogram.fsm.context import FSMContext
from aiohttp import web

# --- SOZLAMALAR ---
API_TOKEN = '8014335358:AAECevOsYHvb35TUwJN62akMpSyo9rBVGUc'
ADMIN_IDS = [8088597011, 1675681600, 6800188051]
MENYU_RASM = 'menyu_rasm.jpg'
DB_URL = "postgresql://postgres.uhycpopponeusqfaibgx:C%26Q6tfGa%2A-Utr8L@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres"

# --- UYG'OQ SAQLASH ---
async def handle(request): return web.Response(text="Bot is alive!")
async def start_web_server():
    app = web.Application()
    app.router.add_get("/", handle)
    runner = web.AppRunner(app)
    await runner.setup()
    port = int(os.environ.get("PORT", 8080))
    site = web.TCPSite(runner, "0.0.0.0", port)
    await site.start()

# --- NARXLAR ---
PUBG_PRICES = {
    "uc_60": {"name": "60 UC - 12.500 🧐", "price": 12500},
    "uc_325": {"name": "325 UC - 60.000 🥱", "price": 60000},
    "uc_660": {"name": "660 UC - 120.000 🤓", "price": 120000},
    "uc_1800": {"name": "1.800 UC - 290.000 😨", "price": 290000},
    "uc_3850": {"name": "3.850 UC - 575.000 🫡", "price": 575000},
    "uc_8100": {"name": "8.100 UC - 1.130.000 🫢", "price": 1130000},
    "uc_16200": {"name": "16.200 UC - 2.265.000 🤫", "price": 2265000},
    "uc_24300": {"name": "24.300 UC - 3.400.000 😱", "price": 3400000},
    "uc_32400": {"name": "32.400 UC - 4.550.000 😃", "price": 4550000},
    "uc_40500": {"name": "40.500 UC - 5.770.000 😎", "price": 5770000}
}
FF_PRICES = {
    "ff_100": {"name": "100 Diamonds - 13.000 💎", "price": 13000},
    "ff_210": {"name": "210 Diamonds - 25.000 💎", "price": 25000},
    "ff_530": {"name": "530 Diamonds - 65.000 💎", "price": 65000},
    "ff_1080": {"name": "1080 Diamonds - 130.000 💎", "price": 130000},
    "ff_2200": {"name": "2200 Diamonds - 245.000 💎", "price": 245000}
}
ROBLOX_PRICES = {
    "rb_40": {"name": "40 ROBUX - 7.000 🪙", "price": 7000}, "rb_860": {"name": "860 ROBUX - 128.000 🪙", "price": 128000},
    "rb_1000": {"name": "1000 ROBUX - 132.000 🪙", "price": 132000}, "rb_5250": {"name": "5250 ROBUX - 660.000 🪙", "price": 660000},
    "rb_11000": {"name": "11000 ROBUX - 1.310.000 🪙", "price": 1310000}, "rb_24000": {"name": "24000 ROBUX - 2.620.000 🪙", "price": 2620000}
}
GENSHIN_PRICES = {
    "gs_60": {"name": "60 G.Crystals - 13.000 ❄️", "price": 13000},
    "gs_330": {"name": "330 G.Crystals - 65.000 ❄️", "price": 65000},
    "gs_1090": {"name": "1.090 G.Crystals - 190.000 ❄️", "price": 190000},
    "gs_2140": {"name": "2.140 G.Crystals - 375.000 ❄️", "price": 375000},
    "gs_3880": {"name": "3.880 G.Crystals - 620.000 ❄️", "price": 620000},
    "gs_7080": {"name": "7.080 G.Crystals - 1.123.000 ❄️", "price": 1123000}
}
ML_PRICES = {
    "ml_56": {"name": "56 Diamonds - 13.000 ⚔️", "price": 13000},
    "ml_278": {"name": "278 Diamonds - 66.000 ⚔️", "price": 66000},
    "ml_571": {"name": "571 Diamonds - 130.000 ⚔️", "price": 130000},
    "ml_1167": {"name": "1.167 Diamonds - 255.000 ⚔️", "price": 255000},
    "ml_1783": {"name": "1.783 Diamonds - 375.000 ⚔️", "price": 375000},
    "ml_3006": {"name": "3.006 Diamonds - 635.000 ⚔️", "price": 635000},
    "ml_4770": {"name": "4.770 Diamonds - 1.000.000 ⚔️", "price": 1000000},
    "ml_6012": {"name": "6.012 Diamonds - 1.250.000 ⚔️", "price": 1250000},
    "ml_pass": {"name": "Twilight Pass - 200.000 ⚔️", "price": 200000}
}

logging.basicConfig(level=logging.INFO)
bot = Bot(token=API_TOKEN); dp = Dispatcher()

class ShopState(StatesGroup): waiting_for_id = State(); waiting_for_nick = State(); waiting_for_creds = State()
class DepositState(StatesGroup): waiting_for_amount = State(); waiting_for_photo = State()
class AdminPromoState(StatesGroup): waiting_for_promo_code = State()

async def get_db_conn(): return await asyncpg.connect(DB_URL)
async def init_db():
    conn = await get_db_conn()
    await conn.execute('CREATE TABLE IF NOT EXISTS users (user_id BIGINT PRIMARY KEY, full_name TEXT, balance INTEGER DEFAULT 0)')
    await conn.execute('CREATE TABLE IF NOT EXISTS promos (package_id TEXT PRIMARY KEY, promo_code TEXT)')
    await conn.close()

def main_menu(uid):
    b = ReplyKeyboardBuilder()
    b.button(text="🎮 PUBG Mobile"), b.button(text="🔥 Free Fire")
    b.button(text="🪙 Roblox"), b.button(text="❄️ Genshin Impact")
    b.button(text="⚔️ Mobile Legends"), b.button(text="💰 Hisob")
    b.button(text="ℹ️ Yordam")
    if uid in ADMIN_IDS: b.button(text="🛠 Admin Panel")
    b.adjust(2); return b.as_markup(resize_keyboard=True)

def admin_menu():
    b = ReplyKeyboardBuilder()
    b.button(text="👥 Foydalanuvchilar"), b.button(text="📊 Statistika")
    b.button(text="🛠 Promo kiritish"), b.button(text="⬅️ Orqaga")
    b.adjust(2); return b.as_markup(resize_keyboard=True)

# --- START ---
@dp.message(Command("start"))
async def start(m: types.Message, s: FSMContext):
    await s.clear(); conn = await get_db_conn()
    await conn.execute('INSERT INTO users (user_id, full_name) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name', m.from_user.id, m.from_user.full_name)
    await conn.close()
    txt = f"👋 Assalomu alaykum {m.from_user.full_name}, sizni bu botda korganmzdan xursandmiz!..\n\nArzon hamyonbob 🤑\nID orqali tushadi ✅\nIshonchli 😎"
    try: await m.answer_photo(photo=FSInputFile(MENYU_RASM), caption=txt, reply_markup=main_menu(m.from_user.id))
    except: await m.answer(txt, reply_markup=main_menu(m.from_user.id))

# --- HISOB ---
@dp.message(F.text == "💰 Hisob")
async def profile(m: types.Message, s: FSMContext):
    await s.clear(); conn = await get_db_conn(); bal = await conn.fetchval("SELECT balance FROM users WHERE user_id = $1", m.from_user.id); await conn.close()
    b = InlineKeyboardBuilder(); b.button(text="➕ Hisobni to'ldirish", callback_data="topup_start")
    await m.answer(f"💰 <b>Mening balansim:</b> {bal or 0:,} so'm".replace(",", "."), parse_mode="HTML", reply_markup=b.as_markup())

@dp.callback_query(F.data == "topup_start")
async def top_s(c, s):
    await s.clear(); b = InlineKeyboardBuilder(); b.button(text="VISA", callback_data="p_v"), b.button(text="HUMO", callback_data="p_h")
    await c.message.edit_text("To'lov turi:", reply_markup=b.as_markup())

@dp.callback_query(F.data.in_(["p_v", "p_h"]))
async def pay_i(c, s):
    t, k = ("VISA 💳", "4916 9903 4984 9908") if c.data=="p_v" else ("HUMO 💳", "9860 1606 2989 6350")
    await s.update_data(c_t=t); await c.message.edit_text(f"TOLDIRISH {t}\n\n<code>{k}</code>\nIsmoil Q***yev\n\nQancha tashlaysiz?", parse_mode="HTML")
    await s.set_state(DepositState.waiting_for_amount)

@dp.message(DepositState.waiting_for_amount)
async def get_am(m, s):
    if not m.text.isdigit(): return await m.answer("Raqam yozing!")
    await s.update_data(am=int(m.text)); w = await m.answer("⌛️ Kuting..."); await asyncio.sleep(5)
    b = InlineKeyboardBuilder(); b.button(text="✅ Tashladim", callback_data="i_s"); b.button(text="⬅️ Orqaga", callback_data="topup_start")
    await w.edit_text(f"Siz {m.text} so'm kiritdingiz.", reply_markup=b.as_markup())

@dp.callback_query(F.data == "i_s")
async def ask_p(c, s):
    await c.message.edit_text("⌛️ Ariza qabul qilinmoqda..."); await asyncio.sleep(6)
    await c.message.edit_text("📸 Chek rasmini yuboring:"); await s.set_state(DepositState.waiting_for_photo)

@dp.message(DepositState.waiting_for_photo, F.photo)
async def h_check(m, s):
    d = await s.get_data(); b = InlineKeyboardBuilder()
    b.button(text="✅ Tasdiqlash", callback_data=f"adm_pay_app_{m.from_user.id}_{d['am']}")
    b.button(text="❌ Rad etish", callback_data=f"adm_pay_rej_{m.from_user.id}")
    for a in ADMIN_IDS:
        try: await bot.send_photo(a, m.photo[-1].file_id, caption=f"📩 <b>To'lov!</b>\n👤 {m.from_user.full_name}\n🆔 {m.from_user.id}\n💰 {d['am']:,} so'm", parse_mode="HTML", reply_markup=b.as_markup())
        except: continue
    await m.answer("⌛️ Tekshirilmoqda kuting..."); await s.clear()

@dp.callback_query(F.data.startswith("adm_pay_"))
async def adm_p_dec(c: types.CallbackQuery):
    p = c.data.split("_"); act, uid = p[2], int(p[3])
    if act == "app":
        am = int(p[4]); conn = await get_db_conn(); await conn.execute("UPDATE users SET balance = balance + $1 WHERE user_id = $2", am, uid); await conn.close()
        await c.message.edit_caption(caption=c.message.caption + "\n\n✅ Tasdiqlandi!", reply_markup=None)
        await bot.send_message(uid, f"🎉 Hisobingiz {am:,} so'mga to'ldirildi!")
    else:
        await c.message.edit_caption(caption=c.message.caption + "\n\n❌ Rad etildi!", reply_markup=None)
        await bot.send_message(uid, "❌ To'lov rad etildi! Chek xato yoki soxta.")

# --- O'YINLAR SOTIB OLISH ---
@dp.message(F.text.in_(["🎮 PUBG Mobile", "🔥 Free Fire", "❄️ Genshin Impact", "⚔️ Mobile Legends"]))
async def g_shop(m, s):
    await s.clear(); t = m.text; p_dict = PUBG_PRICES if "PUBG" in t else (FF_PRICES if "Fire" in t else (GENSHIN_PRICES if "Genshin" in t else ML_PRICES))
    b = InlineKeyboardBuilder(); [b.button(text=v['name'], callback_data=f"buy_{k}") for k, v in p_dict.items()]; b.adjust(1)
    await m.answer(f"🛒 {t} paketini tanlang:", reply_markup=b.as_markup())

@dp.message(F.text == "🪙 Roblox")
async def rb_shop(m, s):
    await s.clear(); b = InlineKeyboardBuilder(); [b.button(text=v['name'], callback_data=f"buyrb_{k}") for k, v in ROBLOX_PRICES.items()]; b.adjust(2)
    await m.answer("🪙 Roblox paketini tanlang:", reply_markup=b.as_markup())

@dp.callback_query(F.data.startswith("buyrb_"))
async def rb_c(c, s):
    it = ROBLOX_PRICES.get(c.data.replace("buyrb_", "")); await s.update_data(chosen=it['name'], pr=it['price'])
    b = InlineKeyboardBuilder(); b.button(text="✅ Sotib olaman", callback_data="rb_y"); b.button(text="⬅️ Orqaga", callback_data="back_rb")
    await c.message.edit_text(f"❓ {it['name']} sotib olasizmi?", reply_markup=b.as_markup())

@dp.callback_query(F.data == "rb_y")
async def rb_a(c, s):
    await c.message.edit_text("📝 Nik va parol yozing!\nFormat: `nik: user parol: pass`\n⚠️ 2-tekshiruvni o'chiring!"); await s.set_state(ShopState.waiting_for_creds)

@dp.message(ShopState.waiting_for_creds)
async def rb_f(m, s):
    d = await s.get_data(); b = InlineKeyboardBuilder(); b.button(text="✅ Tushdi", callback_data=f"ord_done_{m.from_user.id}_{d['pr']}_RB_none")
    for a in ADMIN_IDS:
        try: await bot.send_message(a, f"🪙 <b>ROBLOX!</b>\n👤 {m.from_user.full_name}\n🔑 `{m.text}`\n💰 {d['pr']:,} so'm", parse_mode="HTML", reply_markup=b.as_markup())
        except: continue
    await m.answer("✅ Buyurtma qabul qilindi! 15 minutda tushadi."); await s.clear()

@dp.callback_query(F.data.startswith("buy_"))
async def p_buy(c, s):
    k = c.data.replace("buy_", ""); it = {**PUBG_PRICES, **FF_PRICES, **GENSHIN_PRICES, **ML_PRICES}.get(k)
    conn = await get_db_conn(); bal = await conn.fetchval("SELECT balance FROM users WHERE user_id = $1", c.from_user.id); await conn.close()
    if bal and bal >= it['price']:
        await s.update_data(chosen=it['name'], pr=it['price'], key=k)
        await c.message.edit_text(f"✅ {it['name']}\n🔢 ID yuboring:"); await s.set_state(ShopState.waiting_for_id)
    else: await c.answer("❌ Pul yetarli emas!", show_alert=True)

@dp.message(ShopState.waiting_for_id)
async def get_id(m, s):
    if not m.text.isdigit(): return await m.answer("Faqat raqam!")
    await s.update_data(p_id=m.text); await m.answer("👤 Nick yuboring:"); await s.set_state(ShopState.waiting_for_nick)

@dp.message(ShopState.waiting_for_nick)
async def fin_b(m, s):
    d = await s.get_data(); conn = await get_db_conn(); promo = await conn.fetchval("SELECT promo_code FROM promos WHERE package_id = $1", d['key']); await conn.close()
    p_txt = f"\n🎁 Promo: <code>{promo}</code>" if promo else "\n🎁 Promo: Kiritilmagan"
    b = InlineKeyboardBuilder(); t_c = "PUBG" if "uc" in d['key'] else "GAME"
    b.button(text="✅ Tushdi", callback_data=f"ord_done_{m.from_user.id}_{d['pr']}_{t_c}_{d['key']}")
    for a in ADMIN_IDS:
        try: await bot.send_message(a, f"🛒 <b>Buyurtma!</b>\n👤 {m.from_user.full_name}\n📦 {d['chosen']}\n🎮 ID: {d['p_id']}\n👤 Nick: {m.text}{p_txt}", parse_mode="HTML", reply_markup=b.as_markup())
        except: continue
    await m.answer(f"✅ Buyurtma qabul qilindi! 15 minutda tushadi."); await s.clear()

@dp.callback_query(F.data.startswith("ord_done_"))
async def adm_c_o(c: types.CallbackQuery):
    p = c.data.split("_"); uid, pr, tp, pk = int(p[2]), int(p[3]), p[4], p[5]
    conn = await get_db_conn(); bal = await conn.fetchval("SELECT balance FROM users WHERE user_id = $1", uid)
    if bal and bal >= pr:
        await conn.execute("UPDATE users SET balance = balance - $1 WHERE user_id = $2", pr, uid)
        await conn.execute("DELETE FROM promos WHERE package_id = $1", pk); await conn.close()
        await bot.send_message(uid, "🎉 Buyurtmangiz tushdi ✅"); await c.message.edit_text(c.message.text + "\n\n✅ Bajarildi!", reply_markup=None)
    else: await conn.close(); await c.answer("Balans yetarli emas!", show_alert=True)

# --- ADMIN PANEL ---
@dp.message(F.text == "🛠 Admin Panel")
async def adm_p(m, s):
    if m.from_user.id in ADMIN_IDS: await m.answer("🛠 Admin Panel", reply_markup=admin_menu())

@dp.message(F.text == "👥 Foydalanuvchilar")
async def adm_u(m):
    if m.from_user.id in ADMIN_IDS:
        conn = await get_db_conn(); rows = await conn.fetch("SELECT user_id, full_name, balance FROM users LIMIT 40"); await conn.close()
        t = "👥 <b>Foydalanuvchilar:</b>\n\n"
        for r in rows: t += f"🆔 <code>{r[0]}</code> | 👤 {r[1]} | 💰 {r[2]:,} so'm\n"
        await m.answer(t, parse_mode="HTML")

@dp.message(F.text == "📊 Statistika")
async def adm_st(m):
    if m.from_user.id in ADMIN_IDS:
        conn = await get_db_conn(); c = await conn.fetchval("SELECT COUNT(*) FROM users"); b = await conn.fetchval("SELECT SUM(balance) FROM users"); await conn.close()
        await m.answer(f"📊 Jami: {c} ta foydalanuvchi\n💰 Jami balans: {b or 0:,} so'm")

@dp.message(F.text == "🛠 Promo kiritish")
async def adm_pr(m, s):
    await s.clear(); b = InlineKeyboardBuilder(); [b.button(text=v['name'], callback_data=f"sp_{k}") for k, v in PUBG_PRICES.items()]; b.adjust(1)
    await m.answer("Promo paketini tanlang:", reply_markup=b.as_markup())

@dp.callback_query(F.data.startswith("sp_"))
async def adm_s_p(c, s):
    await s.update_data(pk=c.data.replace("sp_", "")); await c.message.edit_text("Promo kodni yozing:"); await s.set_state(AdminPromoState.waiting_for_promo_code)

@dp.message(AdminPromoState.waiting_for_promo_code)
async def adm_sv_p(m, s):
    d = await s.get_data(); conn = await get_db_conn(); await conn.execute('INSERT INTO promos (package_id, promo_code) VALUES ($1, $2) ON CONFLICT (package_id) DO UPDATE SET promo_code = $2', d['pk'], m.text); await conn.close()
    await m.answer("✅ Promo saqlandi!"); await s.clear()

@dp.message(Command("add"))
async def adm_add(m):
    if m.from_user.id not in ADMIN_IDS: return
    try:
        a = m.text.split(); conn = await get_db_conn(); await conn.execute("UPDATE users SET balance = balance + $1 WHERE user_id = $2", int(a[2]), int(a[1])); await conn.close()
        await m.answer("✅ Bajarildi!"); await bot.send_message(int(a[1]), f"🎁 Balans: {a[2]} so'm")
    except: await m.answer("Xato!")

@dp.message(F.text == "⬅️ Orqaga")
async def back(m, s): await s.clear(); await m.answer("Bosh menyu", reply_markup=main_menu(m.from_user.id))

async def main():
    await init_db(); await start_web_server()
    print("🚀 Bot tayyor!"); await dp.start_polling(bot)

if __name__ == "__main__": asyncio.run(main())
