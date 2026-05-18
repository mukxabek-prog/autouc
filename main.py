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
UC_PRICES = {
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

DIAMOND_PRICES = {
    "dm_100": {"name": "100 Diamonds - 13.000 💎", "price": 13000},
    "dm_210": {"name": "210 Diamonds - 25.000 💎", "price": 25000},
    "dm_530": {"name": "530 Diamonds - 65.000 💎", "price": 65000},
    "dm_1080": {"name": "1080 Diamonds - 130.000 💎", "price": 130000},
    "dm_2200": {"name": "2200 Diamonds - 245.000 💎", "price": 245000}
}

ROBUX_PRICES = {
    "rb_40": {"name": "40 ROBUX - 7.000 🪙", "price": 7000}, "rb_80": {"name": "80 ROBUX - 14.000 🪙", "price": 14000},
    "rb_120": {"name": "120 ROBUX - 21.000 🪙", "price": 21000}, "rb_160": {"name": "160 ROBUX - 28.000 🪙", "price": 28000},
    "rb_200": {"name": "200 ROBUX - 35.000 🪙", "price": 35000}, "rb_240": {"name": "240 ROBUX - 42.000 🪙", "price": 42000},
    "rb_280": {"name": "280 ROBUX - 49.000 🪙", "price": 49000}, "rb_320": {"name": "320 ROBUX - 56.000 🪙", "price": 56000},
    "rb_360": {"name": "360 ROBUX - 63.000 🪙", "price": 63000}, "rb_400": {"name": "400 ROBUX - 65.000 🪙", "price": 65000},
    "rb_440": {"name": "440 ROBUX - 72.000 🪙", "price": 72000}, "rb_480": {"name": "480 ROBUX - 79.000 🪙", "price": 79000},
    "rb_520": {"name": "520 ROBUX - 86.000 🪙", "price": 86000}, "rb_560": {"name": "560 ROBUX - 93.000 🪙", "price": 93000},
    "rb_700": {"name": "700 ROBUX - 100.000 🪙", "price": 100000}, "rb_740": {"name": "740 ROBUX - 107.000 🪙", "price": 107000},
    "rb_780": {"name": "780 ROBUX - 114.000 🪙", "price": 114000}, "rb_820": {"name": "820 ROBUX - 121.000 🪙", "price": 121000},
    "rb_860": {"name": "860 ROBUX - 128.000 🪙", "price": 128000}, "rb_1000": {"name": "1000 ROBUX - 132.000 🪙", "price": 132000},
    "rb_1500": {"name": "1500 ROBUX - 197.000 🪙", "price": 197000}, "rb_2000": {"name": "2000 ROBUX - 265.000 🪙", "price": 265000},
    "rb_5250": {"name": "5250 ROBUX - 660.000 🪙", "price": 660000}, "rb_11000": {"name": "11000 ROBUX - 1.310.000 🪙", "price": 1310000},
    "rb_24000": {"name": "24000 ROBUX - 2.620.000 🪙", "price": 2620000}
}

logging.basicConfig(level=logging.INFO)
bot = Bot(token=API_TOKEN)
dp = Dispatcher()

# --- HOLATLAR ---
class ShopState(StatesGroup):
    waiting_for_id = State()
    waiting_for_nick = State()
    waiting_for_rb_creds = State()
class DepositState(StatesGroup):
    waiting_for_amount = State()
    waiting_for_photo = State()
class AdminPromoState(StatesGroup):
    waiting_for_promo_code = State()

# --- BAZA ---
async def get_db_conn(): return await asyncpg.connect(DB_URL)
async def init_db():
    conn = await get_db_conn()
    await conn.execute('CREATE TABLE IF NOT EXISTS users (user_id BIGINT PRIMARY KEY, full_name TEXT, balance INTEGER DEFAULT 0)')
    await conn.execute('CREATE TABLE IF NOT EXISTS promos (package_id TEXT PRIMARY KEY, promo_code TEXT)')
    await conn.close()

def main_menu(user_id):
    builder = ReplyKeyboardBuilder()
    builder.button(text="💎 UC sotib olish"), builder.button(text="🔹 Diamond sotib olish")
    builder.button(text="🪙 Robux sotib olish"), builder.button(text="💰 Hisob")
    builder.button(text="ℹ️ Yordam")
    if user_id in ADMIN_IDS: builder.button(text="🛠 Admin Panel")
    builder.adjust(2)
    return builder.as_markup(resize_keyboard=True)

def admin_menu():
    builder = ReplyKeyboardBuilder()
    builder.button(text="👥 Foydalanuvchilar"), builder.button(text="📊 Statistika")
    builder.button(text="🛠 Promo kiritish"), builder.button(text="⬅️ Orqaga")
    builder.adjust(2)
    return builder.as_markup(resize_keyboard=True)

# --- ADMIN COMMANDS ---
@dp.message(Command("add"))
async def admin_add_balance(message: types.Message):
    if message.from_user.id not in ADMIN_IDS: return
    try:
        args = message.text.split()
        target_id, amount = int(args[1]), int(args[2])
        conn = await get_db_conn()
        await conn.execute("UPDATE users SET balance = balance + $1 WHERE user_id = $2", amount, target_id)
        await conn.close()
        status = "qo'shildi ➕" if amount > 0 else "ayrildi ➖"
        await message.answer(f"✅ ID: <code>{target_id}</code> hisobidan {abs(amount):,} so'm {status}!", parse_mode="HTML")
        user_msg = f"🎁 Admin tomonidan hisobingiz {amount:,} so'mga to'ldirildi!" if amount > 0 else f"⚠️ Admin tomonidan hisobingizdan {abs(amount):,} so'm yechib olindi!"
        await bot.send_message(target_id, user_msg)
    except: await message.answer("❌ Xato! Format: `/add [ID] [SUMMA]`")

# --- START ---
@dp.message(Command("start"))
async def start_cmd(message: types.Message, state: FSMContext):
    await state.clear()
    conn = await get_db_conn()
    await conn.execute('INSERT INTO users (user_id, full_name) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name', message.from_user.id, message.from_user.full_name)
    await conn.close()
    text = (f"Assalomu alaykum {message.from_user.full_name}!\nsizni bu botda korganmzdan xursandmiz siz bu botda\n\n"
            f"Arzon hamyonbob 🤑\nuc xizmat id orqali tushadi ✅\nEng muxumi ishonchli 😎\n\n"
            f"Undan tashqar :\nFree Firee uchu ham diamondlar💎\nOlishingiz mumkin 🫵")
    try: await message.answer_photo(photo=FSInputFile(MENYU_RASM), caption=text, reply_markup=main_menu(message.from_user.id))
    except: await message.answer(text, reply_markup=main_menu(message.from_user.id))

# --- HISOB & TOPUP ---
@dp.message(F.text == "💰 Hisob")
async def show_profile(message: types.Message, state: FSMContext):
    await state.clear()
    conn = await get_db_conn()
    balance = await conn.fetchval("SELECT balance FROM users WHERE user_id = $1", message.from_user.id)
    await conn.close()
    builder = InlineKeyboardBuilder(); builder.button(text="➕ Hisobni to'ldirish", callback_data="topup_start")
    await message.answer(f"💰 <b>Mening balansim:</b> {balance or 0:,} so'm".replace(",", "."), parse_mode="HTML", reply_markup=builder.as_markup())

# --- ADMIN PROMO SECTION (RASMDAGIDEK) ---
@dp.message(F.text == "🛠 Promo kiritish")
async def admin_promo_menu(message: types.Message, state: FSMContext):
    await state.clear()
    if message.from_user.id not in ADMIN_IDS: return
    builder = InlineKeyboardBuilder()
    for k, v in UC_PRICES.items(): builder.button(text=v['name'], callback_data=f"setpromo_{k}")
    builder.adjust(1)
    await message.answer("🛠 Qaysi paketga promo qo'shmoqchisiz?", reply_markup=builder.as_markup())

@dp.callback_query(F.data.startswith("setpromo_"))
async def admin_ask_promo(call: types.CallbackQuery, state: FSMContext):
    pkg_id = call.data.replace("setpromo_", "")
    await state.update_data(promo_pkg_id=pkg_id)
    await call.message.edit_text(f"📝 <b>{pkg_id}</b> uchun yangi promo kodni yuboring:", parse_mode="HTML")
    await state.set_state(AdminPromoState.waiting_for_promo_code)

@dp.message(AdminPromoState.waiting_for_promo_code)
async def admin_save_promo(message: types.Message, state: FSMContext):
    data = await state.get_data(); pkg_id = data['promo_pkg_id']
    conn = await get_db_conn()
    await conn.execute('INSERT INTO promos (package_id, promo_code) VALUES ($1, $2) ON CONFLICT (package_id) DO UPDATE SET promo_code = $2', pkg_id, message.text)
    await conn.close()
    await message.answer(f"✅ Promo saqlandi!", reply_markup=admin_menu()); await state.clear()

# --- SHOP LOGIC ---
@dp.message(F.text.in_(["💎 UC sotib olish", "🔹 Diamond sotib olish"]))
async def shop_start(message: types.Message, state: FSMContext):
    await state.clear()
    prices = UC_PRICES if "UC" in message.text else DIAMOND_PRICES
    builder = InlineKeyboardBuilder()
    for k, v in prices.items(): builder.button(text=v['name'], callback_data=f"buy_{k}")
    builder.adjust(1); await message.answer("🛒 Paketni tanlang:", reply_markup=builder.as_markup())

@dp.callback_query(F.data.startswith("buy_"))
async def process_buy(call: types.CallbackQuery, state: FSMContext):
    item_key = call.data.replace("buy_", ""); item = {**UC_PRICES, **DIAMOND_PRICES}.get(item_key)
    conn = await get_db_conn(); balance = await conn.fetchval("SELECT balance FROM users WHERE user_id = $1", call.from_user.id); await conn.close()
    if balance and balance >= item['price']:
        await state.update_data(chosen=item['name'], price=item['price'], key=item_key)
        builder = InlineKeyboardBuilder(); builder.button(text="⬅️ Orqaga", callback_data=f"shop_back_{'uc' if 'uc' in item_key else 'dm'}")
        await call.message.edit_text(f"✅ {item['name']}\n🔢 Player ID (faqat raqam):", reply_markup=builder.as_markup())
        await state.set_state(ShopState.waiting_for_id)
    else: await call.answer("❌ Mablag' yetarli emas!", show_alert=True)

@dp.message(ShopState.waiting_for_id)
async def get_id(message: types.Message, state: FSMContext):
    if not message.text.isdigit(): return await message.answer("Faqat raqam!")
    await state.update_data(player_id=message.text); await message.answer("👤 O'yin nikingizni kiriting:"); await state.set_state(ShopState.waiting_for_nick)

@dp.message(ShopState.waiting_for_nick)
async def finish_buy(message: types.Message, state: FSMContext):
    data = await state.get_data(); conn = await get_db_conn()
    promo = await conn.fetchval("SELECT promo_code FROM promos WHERE package_id = $1", data['key']); await conn.close()
    promo_txt = f"\n🎁 Promo: <code>{promo}</code>" if promo else "\n🎁 Promo: <i>Kiritilmagan</i>"
    builder = InlineKeyboardBuilder()
    type_code = "UC" if "UC" in data['chosen'] else "DM"
    builder.button(text="✅ Tushdi", callback_data=f"order_done_{message.from_user.id}_{data['price']}_{type_code}_{data['key']}")
    for admin_id in ADMIN_IDS:
        try: await bot.send_message(admin_id, f"🛒 <b>Buyurtma!</b>\n👤 {message.from_user.full_name}\n🆔 {message.from_user.id}\n📦 {data['chosen']}\n🎮 ID: {data['player_id']}\n👤 Nick: {message.text}{promo_txt}", parse_mode="HTML", reply_markup=builder.as_markup())
        except: continue
    msg_type = "UC" if "UC" in data['chosen'] else "diamonds"
    await message.answer(f"✅ Buyurtma qabul qilindi! 15 minutda {msg_type} tushadi.", reply_markup=main_menu(message.from_user.id)); await state.clear()

# --- ADMIN ORDER CONFIRM (PUL YECHILADI VA PROMO O'CHADI) ---
@dp.callback_query(F.data.startswith("order_done_"))
async def admin_confirm_order(call: types.CallbackQuery):
    p = call.data.split("_"); uid, price, o_type, pkg_key = int(p[2]), int(p[3]), p[4], p[5]
    conn = await get_db_conn(); balance = await conn.fetchval("SELECT balance FROM users WHERE user_id = $1", uid)
    if balance and balance >= price:
        await conn.execute("UPDATE users SET balance = balance - $1 WHERE user_id = $2", price, uid)
        if o_type == "UC": # Faqat UC bo'lsa promoni o'chirish
            await conn.execute("DELETE FROM promos WHERE package_id = $1", pkg_key)
        await conn.close()
        txt = "UC tushdi ✅" if o_type=="UC" else ("Robux tushdi ✅" if o_type=="RB" else "Diamonds tushdi ✅")
        await bot.send_message(uid, f"🎉 Buyurtmangiz bajarildi! {txt}")
        await call.message.edit_text(call.message.text + "\n\n✅ <b>Bajarildi va pul yechildi! (Promo o'chirildi)</b>", parse_mode="HTML", reply_markup=None)
    else: await conn.close(); await call.answer("Balans yetarli emas!", show_alert=True)

# --- ROBUX ---
@dp.message(F.text == "🪙 Robux sotib olish")
async def rb_shop(message: types.Message, state: FSMContext):
    await state.clear(); builder = InlineKeyboardBuilder()
    for k, v in ROBUX_PRICES.items(): builder.button(text=v['name'], callback_data=f"buyrb_{k}")
    builder.adjust(2); await message.answer("🔥 <b>ROBUX NARXLAR</b> 🔥", reply_markup=builder.as_markup())

@dp.callback_query(F.data.startswith("buyrb_"))
async def rb_confirm(call: types.CallbackQuery, state: FSMContext):
    item = ROBUX_PRICES.get(call.data.replace("buyrb_", "")); await state.update_data(chosen=item['name'], price=item['price'])
    builder = InlineKeyboardBuilder(); builder.button(text="✅ Sotib olaman", callback_data="rb_yes"); builder.button(text="⬅️ Orqaga", callback_data="rb_back")
    await call.message.edit_text(f"❓ {item['name']} sotib olmoqchimisiz?", reply_markup=builder.as_markup())

@dp.callback_query(F.data == "rb_yes")
async def rb_ask(call: types.CallbackQuery, state: FSMContext):
    await call.message.edit_text("📝 Nik va parol yozing (nik: user parol: pass)\n⚠️ 2-tekshiruvni o'chiring!"); await state.set_state(ShopState.waiting_for_rb_creds)

@dp.message(ShopState.waiting_for_rb_creds)
async def rb_finish(message: types.Message, state: FSMContext):
    d = await state.get_data(); builder = InlineKeyboardBuilder()
    builder.button(text="✅ Tushdi", callback_data=f"order_done_{message.from_user.id}_{d['price']}_RB_none")
    for a in ADMIN_IDS:
        try: await bot.send_message(a, f"🪙 <b>ROBUX!</b>\n👤 {message.from_user.full_name}\n📦 {d['chosen']}\n🔑: `{message.text}`", parse_mode="HTML", reply_markup=builder.as_markup())
        except: continue
    await message.answer("✅ Buyurtma qabul qilindi! 15 minutda tushadi.", reply_markup=main_menu(message.from_user.id)); await state.clear()

# --- QOLGAN FUNKSIYALAR (HISOB TO'LDIRISH, ADMIN PANEL VA HKZ) ---
@dp.message(F.text == "🛠 Admin Panel")
async def adm_p(m, s):
    if m.from_user.id in ADMIN_IDS: await m.answer("🛠 Admin Panel", reply_markup=admin_menu())

@dp.message(F.text == "📊 Statistika")
async def adm_stats(m):
    if m.from_user.id in ADMIN_IDS:
        c = await (await get_db_conn()).fetchval("SELECT COUNT(*) FROM users")
        await m.answer(f"📊 <b>Statistika:</b>\n👥 Foydalanuvchilar: {c} ta")

@dp.message(F.text == "👥 Foydalanuvchilar")
async def adm_u(m):
    if m.from_user.id in ADMIN_IDS:
        rows = await (await get_db_conn()).fetch("SELECT user_id, full_name, balance FROM users LIMIT 30")
        t = "👥 <b>Foydalanuvchilar:</b>\n\n"
        for r in rows: t += f"🆔 <code>{r['user_id']}</code> | 👤 {r['full_name']} | 💰 {r['balance']:,} so'm\n"
        await m.answer(t, parse_mode="HTML")

@dp.message(F.text == "⬅️ Orqaga")
async def back_main(m, s): await s.clear(); await m.answer("Bosh menyu", reply_markup=main_menu(m.from_user.id))

@dp.callback_query(F.data == "topup_start")
async def topup_s(c, s):
    b = InlineKeyboardBuilder(); b.button(text="VISA", callback_data="pay_v"), b.button(text="HUMO", callback_data="pay_h")
    await c.message.edit_text("Karta tanlang:", reply_markup=b.as_markup())

@dp.callback_query(F.data.in_(["pay_v", "pay_h"]))
async def pay_i(c, s):
    t, k = ("VISA 💳", "4916 9903 4984 9908") if c.data=="pay_v" else ("HUMO 💳", "9860 1606 2989 6350")
    await s.update_data(card_type=t); await c.message.edit_text(f"HISOBNI TOLDIRISH {t}\n\n<code>{k}</code>\nIsmoil Q***yev\n\nQancha tashlaysiz?", parse_mode="HTML")
    await s.set_state(DepositState.waiting_for_amount)

@dp.message(DepositState.waiting_for_amount)
async def get_am(m, s):
    if not m.text.isdigit(): return await m.answer("Faqat raqam!")
    await s.update_data(amount=int(m.text)); wait = await m.answer("Kuting..."); await asyncio.sleep(5)
    b = InlineKeyboardBuilder(); b.button(text="✅ Tashladim", callback_data="i_s"); b.button(text="⬅️ Orqaga", callback_data="topup_start")
    await wait.edit_text(f"Siz {m.text} so'm kiritdingiz.", reply_markup=b.as_markup())

@dp.callback_query(F.data == "i_s")
async def ask_ph(c, s):
    await c.message.edit_text("Ariza qabul qilinmoqda..."); await asyncio.sleep(6)
    await c.message.edit_text("📸 Chek rasmini yuboring:"); await s.set_state(DepositState.waiting_for_photo)

@dp.message(DepositState.waiting_for_photo, F.photo)
async def h_check(m, s):
    d = await s.get_data(); b = InlineKeyboardBuilder(); b.button(text="✅ Tasdiqlash", callback_data=f"adm_app_{m.from_user.id}_{d['amount']}"); b.button(text="❌ Rad etish", callback_data=f"adm_rej_{m.from_user.id}")
    for a in ADMIN_IDS:
        try: await bot.send_photo(a, m.photo[-1].file_id, caption=f"📩 <b>To'lov!</b>\n👤 {m.from_user.full_name}\n🆔 {m.from_user.id}\n💰 {d['amount']:,} so'm", parse_mode="HTML", reply_markup=b.as_markup())
        except: continue
    await m.answer("⌛️ So'rov bajarilmoqda kuting..."); await s.clear()

@dp.callback_query(F.data.startswith("adm_app_"))
async def adm_app(c):
    p = c.data.split("_"); uid, am = int(p[2]), int(p[3]); conn = await get_db_conn()
    await conn.execute("UPDATE users SET balance = balance + $1 WHERE user_id = $2", am, uid); await conn.close()
    await c.message.edit_caption(caption=c.message.caption + "\n\n✅ Tasdiqlandi!", reply_markup=None)
    await bot.send_message(uid, f"🎉 Hisobingiz {am:,} so'mga to'ldirildi!")

async def main():
    await init_db(); await start_web_server()
    print("🚀 Bot tayyor!"); await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
