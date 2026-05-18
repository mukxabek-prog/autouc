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
    "rb_40": {"name": "40 ROBUX - 7.000 🪙", "price": 7000},
    "rb_80": {"name": "80 ROBUX - 14.000 🪙", "price": 14000},
    "rb_120": {"name": "120 ROBUX - 21.000 🪙", "price": 21000},
    "rb_160": {"name": "160 ROBUX - 28.000 🪙", "price": 28000},
    "rb_200": {"name": "200 ROBUX - 35.000 🪙", "price": 35000},
    "rb_240": {"name": "240 ROBUX - 42.000 🪙", "price": 42000},
    "rb_280": {"name": "280 ROBUX - 49.000 🪙", "price": 49000},
    "rb_320": {"name": "320 ROBUX - 56.000 🪙", "price": 56000},
    "rb_360": {"name": "360 ROBUX - 63.000 🪙", "price": 63000},
    "rb_400": {"name": "400 ROBUX - 65.000 🪙", "price": 65000},
    "rb_440": {"name": "440 ROBUX - 72.000 🪙", "price": 72000},
    "rb_480": {"name": "480 ROBUX - 79.000 🪙", "price": 79000},
    "rb_520": {"name": "520 ROBUX - 86.000 🪙", "price": 86000},
    "rb_560": {"name": "560 ROBUX - 93.000 🪙", "price": 93000},
    "rb_700": {"name": "700 ROBUX - 100.000 🪙", "price": 100000},
    "rb_740": {"name": "740 ROBUX - 107.000 🪙", "price": 107000},
    "rb_780": {"name": "780 ROBUX - 114.000 🪙", "price": 114000},
    "rb_820": {"name": "820 ROBUX - 121.000 🪙", "price": 121000},
    "rb_860": {"name": "860 ROBUX - 128.000 🪙", "price": 128000},
    "rb_1000": {"name": "1000 ROBUX - 132.000 🪙", "price": 132000},
    "rb_1500": {"name": "1500 ROBUX - 197.000 🪙", "price": 197000},
    "rb_2000": {"name": "2000 ROBUX - 265.000 🪙", "price": 265000},
    "rb_5250": {"name": "5250 ROBUX - 660.000 🪙", "price": 660000},
    "rb_11000": {"name": "11000 ROBUX - 1.310.000 🪙", "price": 1310000},
    "rb_24000": {"name": "24000 ROBUX - 2.620.000 🪙", "price": 2620000}
}

logging.basicConfig(level=logging.INFO)
bot = Bot(token=API_TOKEN)
dp = Dispatcher()

# --- HOLATLAR ---
class ShopState(StatesGroup):
    waiting_for_id = State()
    waiting_for_nick = State()
    waiting_for_rb_confirm = State()
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

# --- ADMIN /ADD COMMAND ---
@dp.message(Command("add"))
async def admin_add_balance(message: types.Message):
    if message.from_user.id not in ADMIN_IDS: return
    try:
        args = message.text.split()
        target_id, amount = int(args[1]), int(args[2])
        conn = await get_db_conn()
        await conn.execute("UPDATE users SET balance = balance + $1 WHERE user_id = $2", amount, target_id)
        await conn.close()
        await message.answer(f"✅ ID: <code>{target_id}</code> hisobiga {amount:,} so'm qo'shildi!", parse_mode="HTML")
        await bot.send_message(target_id, f"🎁 Admin tomonidan hisobingiz {amount:,} so'mga to'ldirildi!")
    except:
        await message.answer("❌ Xato! Format: `/add [ID] [SUMMA]`", parse_mode="HTML")

# --- START ---
@dp.message(Command("start"))
async def start_cmd(message: types.Message, state: FSMContext):
    await state.clear()
    conn = await get_db_conn()
    await conn.execute('INSERT INTO users (user_id, full_name) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name', message.from_user.id, message.from_user.full_name)
    await conn.close()
    text = (f"👋 Assalomu alaykum {message.from_user.full_name}!\n"
            f"Sizni bu botda korganmzdan xursandmiz. Siz bu botda:\n\n"
            f"🤑 Arzon hamyonbob\n"
            f"✅ UC xizmat ID orqali tushadi\n"
            f"😎 Eng muxumi ishonchli\n\n"
            f"Undan tashqar:\n"
            f"💎 Free Fire uchun ham diamondlar\n"
            f"🪙 Roblox uchun Robuxlar\n"
            f"🫵 Olishingiz mumkin!")
    try: await message.answer_photo(photo=FSInputFile(MENYU_RASM), caption=text, reply_markup=main_menu(message.from_user.id))
    except: await message.answer(text, reply_markup=main_menu(message.from_user.id))

# --- HISOB ---
@dp.message(F.text == "💰 Hisob")
async def show_profile(message: types.Message, state: FSMContext):
    await state.clear()
    conn = await get_db_conn()
    balance = await conn.fetchval("SELECT balance FROM users WHERE user_id = $1", message.from_user.id)
    await conn.close()
    if balance is None: balance = 0
    builder = InlineKeyboardBuilder()
    builder.button(text="➕ Hisobni to'ldirish", callback_data="topup_start")
    await message.answer(f"💰 <b>Mening balansim:</b> {balance:,} so'm".replace(",", "."), parse_mode="HTML", reply_markup=builder.as_markup())

# --- ROBUX SOTIB OLISH ---
@dp.message(F.text == "🪙 Robux sotib olish")
async def robux_shop(message: types.Message, state: FSMContext):
    await state.clear()
    builder = InlineKeyboardBuilder()
    for k, v in ROBUX_PRICES.items():
        builder.button(text=v['name'], callback_data=f"buyrb_{k}")
    builder.adjust(2)
    await message.answer("🔥 <b>ROBUX NARXLAR</b> 🔥\n\nQancha sotib olmoqchisiz?", parse_mode="HTML", reply_markup=builder.as_markup())

@dp.callback_query(F.data.startswith("buyrb_"))
async def robux_confirm(call: types.CallbackQuery, state: FSMContext):
    rb_key = call.data.replace("buyrb_", "")
    item = ROBUX_PRICES.get(rb_key)
    await state.update_data(chosen=item['name'], price=item['price'], key=rb_key)
    
    builder = InlineKeyboardBuilder()
    builder.button(text="✅ Sotib olaman", callback_data="rb_yes")
    builder.button(text="⬅️ Orqaga", callback_data="rb_back")
    builder.adjust(1)
    await call.message.edit_text(f"❓ {item['name']} sotib olmoqchimisiz?", reply_markup=builder.as_markup())

@dp.callback_query(F.data == "rb_yes")
async def robux_ask_creds(call: types.CallbackQuery, state: FSMContext):
    await call.message.edit_text("📝 Nikingiz va parolingizni yozib qoldiring!\n\nFormat: `nik: auto_uc parol: auto_parol`\n\n⚠️ <b>2-tekshiruvni o'chirib qo'yish esingizdan chiqmasin!</b>", parse_mode="HTML")
    await state.set_state(ShopState.waiting_for_rb_creds)

@dp.message(ShopState.waiting_for_rb_creds)
async def robux_finish(message: types.Message, state: FSMContext):
    data = await state.get_data()
    creds = message.text
    
    builder = InlineKeyboardBuilder()
    builder.button(text="✅ Tushdi", callback_data=f"order_done_{message.from_user.id}_{data['price']}_RB")
    
    for admin_id in ADMIN_IDS:
        try:
            await bot.send_message(admin_id, f"🪙 <b>Yangi ROBUX Buyurtmasi!</b>\n👤 Foydalanuvchi: {message.from_user.full_name}\n🆔 ID: {message.from_user.id}\n📦 Paket: {data['chosen']}\n🔑 Ma'lumotlar: ` {creds} `", parse_mode="HTML", reply_markup=builder.as_markup())
        except: continue
        
    await message.answer("✅ Buyurtma qabul qilindi! 15 minut ichida robuxingiz tushadi. 😊", reply_markup=main_menu(message.from_user.id))
    await state.clear()

@dp.callback_query(F.data == "rb_back")
async def rb_back(call: types.CallbackQuery, state: FSMContext):
    await robux_shop(call.message, state)

# --- UC / DIAMOND ---
@dp.message(F.text == "💎 UC sotib olish")
@dp.message(F.text == "🔹 Diamond sotib olish")
async def shop_start(message: types.Message, state: FSMContext):
    await state.clear()
    is_uc = "UC" in message.text
    prices = UC_PRICES if is_uc else DIAMOND_PRICES
    builder = InlineKeyboardBuilder()
    for k, v in prices.items(): builder.button(text=v['name'], callback_data=f"buy_{k}")
    builder.adjust(1)
    await message.answer(f"🛒 {'UC' if is_uc else 'Diamond'} paketini tanlang:", reply_markup=builder.as_markup())

@dp.callback_query(F.data.startswith("buy_"))
async def process_buy(call: types.CallbackQuery, state: FSMContext):
    item_key = call.data.replace("buy_", "")
    item = {**UC_PRICES, **DIAMOND_PRICES}.get(item_key)
    conn = await get_db_conn()
    balance = await conn.fetchval("SELECT balance FROM users WHERE user_id = $1", call.from_user.id)
    await conn.close()
    if balance is not None and balance >= item['price']:
        await state.update_data(chosen=item['name'], price=item['price'], key=item_key)
        builder = InlineKeyboardBuilder()
        builder.button(text="⬅️ Orqaga", callback_data=f"shop_back_{'uc' if 'uc' in item_key else 'dm'}")
        await call.message.edit_text(f"✅ {item['name']}\n🔢 Player ID kiriting (Faqat raqam):", reply_markup=builder.as_markup())
        await state.set_state(ShopState.waiting_for_id)
    else: await call.answer("❌ Mablag' yetarli emas!", show_alert=True)

@dp.message(ShopState.waiting_for_id)
async def get_player_id(message: types.Message, state: FSMContext):
    if not message.text.isdigit(): return await message.answer("❌ ID faqat raqam!")
    await state.update_data(player_id=message.text)
    await message.answer("👤 O'yin nikingizni kiriting:")
    await state.set_state(ShopState.waiting_for_nick)

@dp.message(ShopState.waiting_for_nick)
async def finish_buy(message: types.Message, state: FSMContext):
    data = await state.get_data()
    conn = await get_db_conn()
    promo = await conn.fetchval("SELECT promo_code FROM promos WHERE package_id = $1", data['key'])
    await conn.close()
    promo_text = f"\n🎁 Promo: {promo}" if promo else "\n🎁 Promo: Kiritilmagan"
    
    builder = InlineKeyboardBuilder()
    type_code = "UC" if "UC" in data['chosen'] else "DM"
    builder.button(text="✅ Tushdi", callback_data=f"order_done_{message.from_user.id}_{data['price']}_{type_code}")
    
    for admin_id in ADMIN_IDS:
        try: await bot.send_message(admin_id, f"🛒 <b>Yangi Buyurtma!</b>\n👤 {message.from_user.full_name}\n🆔 {message.from_user.id}\n📦 {data['chosen']}\n🎮 ID: {data['player_id']}\n👤 Nick: {message.text}{promo_text}", parse_mode="HTML", reply_markup=builder.as_markup())
        except: continue
    msg_type = "UC" if "UC" in data['chosen'] else "diamonds"
    await message.answer(f"✅ Buyurtma qabul qilindi! 15 minut ichida {msg_type} tushadi.", reply_markup=main_menu(message.from_user.id))
    await state.clear()

@dp.callback_query(F.data.startswith("order_done_"))
async def admin_confirm_order(call: types.CallbackQuery):
    parts = call.data.split("_")
    uid, price, o_type = int(parts[2]), int(parts[3]), parts[4]
    conn = await get_db_conn()
    balance = await conn.fetchval("SELECT balance FROM users WHERE user_id = $1", uid)
    if balance is not None and balance >= price:
        await conn.execute("UPDATE users SET balance = balance - $1 WHERE user_id = $2", price, uid)
        await conn.close()
        msg = "Robuxingiz tushdi ✅" if o_type == "RB" else ("UC tushdi ✅" if o_type == "UC" else "Diamonds tushdi ✅")
        await bot.send_message(uid, f"🎉 Tabriklaymiz! {msg}")
        await call.message.edit_text(call.message.text + "\n\n✅ <b>Bajarildi va pul yechildi!</b>", parse_mode="HTML", reply_markup=None)
    else: 
        await conn.close()
        await call.answer("Mijoz balansi yetarli emas!", show_alert=True)

# --- ADMIN PANEL ---
@dp.message(F.text == "🛠 Admin Panel")
async def adm_panel(message: types.Message, state: FSMContext):
    await state.clear()
    if message.from_user.id in ADMIN_IDS:
        builder = ReplyKeyboardBuilder()
        builder.button(text="👥 Foydalanuvchilar"), builder.button(text="📊 Statistika")
        builder.button(text="🛠 Promo kiritish"), builder.button(text="⬅️ Orqaga")
        builder.adjust(2)
        await message.answer("🛠 Admin Paneli", reply_markup=builder.as_markup(resize_keyboard=True))

@dp.message(F.text == "👥 Foydalanuvchilar")
async def adm_users(message: types.Message):
    if message.from_user.id in ADMIN_IDS:
        conn = await get_db_conn()
        rows = await conn.fetch("SELECT user_id, full_name, balance FROM users")
        await conn.close()
        text = "👥 <b>Foydalanuvchilar:</b>\n\n"
        for r in rows: text += f"🆔 <code>{r['user_id']}</code> | 👤 {r['full_name']} | 💰 {r['balance']:,} so'm\n"
        await message.answer(text, parse_mode="HTML")

# --- QOLGAN FUNKSIYALAR (HELP, TOPUP) AVVALGI KODDAGIDEK QOLDI ---
@dp.callback_query(F.data == "topup_start")
async def topup_choose(call: types.CallbackQuery, state: FSMContext):
    await state.clear()
    builder = InlineKeyboardBuilder()
    builder.button(text="VISA", callback_data="pay_visa"), builder.button(text="HUMO", callback_data="pay_humo")
    await call.message.edit_text("To'lov turini tanlang:", reply_markup=builder.as_markup())

@dp.callback_query(F.data.in_(["pay_visa", "pay_humo"]))
async def pay_info(call: types.CallbackQuery, state: FSMContext):
    card_type = "VISA 💳" if call.data == "pay_visa" else "HUMO 💳"
    karta = "4916 9903 4984 9908" if call.data == "pay_visa" else "9860 1606 2989 6350"
    await state.update_data(card_type=card_type)
    await call.message.edit_text(f"HISOBNI TOLDIRISH {card_type}\n\n<code>{karta}</code>\nIsmoil Q***yev\n\nQancha tashlamoqchisiz?", parse_mode="HTML")
    await state.set_state(DepositState.waiting_for_amount)

@dp.message(DepositState.waiting_for_amount)
async def get_amount(message: types.Message, state: FSMContext):
    if not message.text.isdigit(): return await message.answer("Faqat raqam!")
    await state.update_data(amount=int(message.text))
    wait_msg = await message.answer("⌛️ Kuting...")
    await asyncio.sleep(5)
    builder = InlineKeyboardBuilder()
    builder.button(text="✅ Tashladim", callback_data="i_sent_it")
    await wait_msg.edit_text(f"Summa: {message.text} so'm. To'lov qilsangiz tugmani bosing.", reply_markup=builder.as_markup())

@dp.callback_query(F.data == "i_sent_it")
async def ask_photo(call: types.CallbackQuery, state: FSMContext):
    await call.message.edit_text("⌛️ Ariza qabul qilinmoqda...")
    await asyncio.sleep(6)
    await call.message.edit_text("📸 Iltimos, to'lov cheki (rasmi)ni yuboring:")
    await state.set_state(DepositState.waiting_for_photo)

@dp.message(DepositState.waiting_for_photo, F.photo)
async def handle_check(message: types.Message, state: FSMContext):
    data = await state.get_data()
    builder = InlineKeyboardBuilder()
    builder.button(text="✅ Tasdiqlash", callback_data=f"adm_app_{message.from_user.id}_{data['amount']}")
    builder.button(text="❌ Rad etish", callback_data=f"adm_rej_{message.from_user.id}")
    builder.adjust(2)
    for admin_id in ADMIN_IDS:
        try: await bot.send_photo(chat_id=admin_id, photo=message.photo[-1].file_id, caption=f"📩 <b>Yangi to'lov!</b>\n👤 {message.from_user.full_name}\n🆔 {message.from_user.id}\n💰 {data['amount']:,} so'm", parse_mode="HTML", reply_markup=builder.as_markup())
        except: continue
    await message.answer("⌛️ Sorov bajarilmoqda iltimos kuting ...")
    await state.clear()

@dp.callback_query(F.data.startswith("adm_app_"))
async def admin_app_pay(call: types.CallbackQuery):
    parts = call.data.split("_")
    uid, amount = int(parts[2]), int(parts[3])
    conn = await get_db_conn()
    await conn.execute("UPDATE users SET balance = balance + $1 WHERE user_id = $2", amount, uid)
    await conn.close()
    await call.message.edit_caption(caption=call.message.caption + "\n\n✅ Tasdiqlandi!", reply_markup=None)
    await bot.send_message(uid, f"🎉 Hisobingiz {amount:,} so'mga to'ldirildi!")

@dp.message(F.text == "⬅️ Orqaga")
async def back(message: types.Message, state: FSMContext):
    await state.clear(), await message.answer("Bosh menyu 🏠", reply_markup=main_menu(message.from_user.id))

async def main():
    await init_db()
    await start_web_server()
    print("🚀 Bot ishga tushdi!")
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
