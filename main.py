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

# --- UYG'OQ SAQLASH UCHUN WEB SERVER ---
async def handle(request):
    return web.Response(text="Bot is alive!")

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

logging.basicConfig(level=logging.INFO)
bot = Bot(token=API_TOKEN)
dp = Dispatcher()

class ShopState(StatesGroup):
    waiting_for_id = State()
    waiting_for_nick = State()

class DepositState(StatesGroup):
    waiting_for_amount = State()
    waiting_for_photo = State()

class AdminPromoState(StatesGroup):
    waiting_for_promo_code = State()

# --- BAZA ---
async def get_db_conn():
    return await asyncpg.connect(DB_URL)

async def init_db():
    conn = await get_db_conn()
    await conn.execute('CREATE TABLE IF NOT EXISTS users (user_id BIGINT PRIMARY KEY, full_name TEXT, balance INTEGER DEFAULT 0)')
    await conn.execute('CREATE TABLE IF NOT EXISTS promos (package_id TEXT PRIMARY KEY, promo_code TEXT)')
    await conn.close()

def main_menu(user_id):
    builder = ReplyKeyboardBuilder()
    builder.button(text="💎 UC sotib olish"), builder.button(text="🔹 Diamond sotib olish")
    builder.button(text="💰 Hisob"), builder.button(text="ℹ️ Yordam")
    if user_id in ADMIN_IDS: builder.button(text="🛠 Admin Panel")
    builder.adjust(2)
    return builder.as_markup(resize_keyboard=True)

# --- ADMIN PANEL MENYU ---
def admin_menu():
    builder = ReplyKeyboardBuilder()
    builder.button(text="👥 Foydalanuvchilar"), builder.button(text="📊 Statistika")
    builder.button(text="🛠 Promo kiritish"), builder.button(text="⬅️ Orqaga")
    builder.adjust(2)
    return builder.as_markup(resize_keyboard=True)

# --- HANDLERS ---
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

# --- ADMIN PROMO SECTION ---
@dp.message(F.text == "🛠 Promo kiritish")
async def admin_promo_list(message: types.Message):
    if message.from_user.id not in ADMIN_IDS: return
    builder = InlineKeyboardBuilder()
    for k, v in UC_PRICES.items():
        # Faqat paket nomi (narxsiz)
        pkg_name = v['name'].split("-")[0].strip()
        builder.button(text=pkg_name, callback_data=f"setpromo_{k}")
    builder.adjust(2)
    await message.answer("Qaysi UC paketi uchun promo kiritmoqchisiz?", reply_markup=builder.as_markup())

@dp.callback_query(F.data.startswith("setpromo_"))
async def admin_ask_promo(call: types.CallbackQuery, state: FSMContext):
    pkg_id = call.data.replace("setpromo_", "")
    await state.update_data(promo_pkg_id=pkg_id)
    await call.message.edit_text(f"📝 {pkg_id} uchun yangi promo kodni yuboring:")
    await state.set_state(AdminPromoState.waiting_for_promo_code)

@dp.message(AdminPromoState.waiting_for_promo_code)
async def admin_save_promo(message: types.Message, state: FSMContext):
    data = await state.get_data()
    pkg_id = data['promo_pkg_id']
    promo_code = message.text
    
    conn = await get_db_conn()
    await conn.execute('INSERT INTO promos (package_id, promo_code) VALUES ($1, $2) ON CONFLICT (package_id) DO UPDATE SET promo_code = $2', pkg_id, promo_code)
    await conn.close()
    
    await message.answer(f"✅ {pkg_id} uchun promo kod saqlandi: <code>{promo_code}</code>", parse_mode="HTML", reply_markup=admin_menu())
    await state.clear()

# --- SHOP LOGIC ---
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
        await call.message.edit_text(f"✅ {item['name']}\n🔢 Player ID kiriting:", reply_markup=builder.as_markup())
        await state.set_state(ShopState.waiting_for_id)
    else: await call.answer("❌ Mablag' yetarli emas!", show_alert=True)

@dp.message(ShopState.waiting_for_id)
async def get_player_id(message: types.Message, state: FSMContext):
    if not message.text.isdigit(): return await message.answer("❌ ID faqat raqam bo'lishi kerak!")
    await state.update_data(player_id=message.text)
    await message.answer("👤 O'yin nikingizni kiriting:")
    await state.set_state(ShopState.waiting_for_nick)

@dp.message(ShopState.waiting_for_nick)
async def finish_buy(message: types.Message, state: FSMContext):
    data = await state.get_data()
    item_key = data['key']
    
    # Promokodni bazadan tekshirish
    conn = await get_db_conn()
    promo = await conn.fetchval("SELECT promo_code FROM promos WHERE package_id = $1", item_key)
    await conn.close()
    
    promo_text = f"🎁 Promo: <code>{promo}</code>" if promo else "🎁 Promo: <i>Kiritilmagan, o'zingiz UC tushiring</i>"
    
    builder = InlineKeyboardBuilder()
    type_code = "UC" if "UC" in data['chosen'] else "DM"
    builder.button(text="✅ Tushdi", callback_data=f"order_done_{message.from_user.id}_{data['price']}_{type_code}")
    
    for admin_id in ADMIN_IDS:
        try:
            await bot.send_message(admin_id, 
                f"🛒 <b>Yangi Buyurtma!</b>\n👤 {message.from_user.full_name}\n🆔 {message.from_user.id}\n📦 {data['chosen']}\n🎮 ID: <code>{data['player_id']}</code>\n👤 Nick: {message.text}\n\n{promo_text}",
                parse_mode="HTML", reply_markup=builder.as_markup())
        except: continue
        
    msg_type = "UC" if "UC" in data['chosen'] else "diamonds"
    await message.answer(f"✅ Buyurtma qabul qilindi! 15 minut ichida {msg_type} tushadi.", reply_markup=main_menu(message.from_user.id))
    await state.clear()

# --- ADMIN DEPOSIT & ORDER CONFIRM (AVVALGI KOD) ---
@dp.callback_query(F.data.startswith("order_done_"))
async def admin_confirm_order(call: types.CallbackQuery):
    parts = call.data.split("_")
    uid, price, o_type = int(parts[2]), int(parts[3]), parts[4]
    conn = await get_db_conn()
    balance = await conn.fetchval("SELECT balance FROM users WHERE user_id = $1", uid)
    if balance is not None and balance >= price:
        await conn.execute("UPDATE users SET balance = balance - $1 WHERE user_id = $2", price, uid)
        await conn.close()
        txt = "UC tushdi ✅" if o_type == "UC" else "Diamonds tushdi ✅"
        await bot.send_message(uid, f"🎉 Buyurtmangiz bajarildi! {txt}")
        await call.message.edit_text(call.message.text + "\n\n✅ <b>Bajarildi!</b>", parse_mode="HTML", reply_markup=None)
    else: 
        await conn.close()
        await call.answer("Balans yetarli emas!", show_alert=True)

@dp.message(F.text == "🛠 Admin Panel")
async def adm_panel(message: types.Message, state: FSMContext):
    await state.clear()
    if message.from_user.id in ADMIN_IDS:
        await message.answer("🛠 Admin Paneli", reply_markup=admin_menu())

@dp.message(F.text == "📊 Statistika")
async def stats(message: types.Message):
    if message.from_user.id in ADMIN_IDS:
        conn = await get_db_conn()
        res = await conn.fetchval("SELECT COUNT(*) FROM users")
        await conn.close()
        await message.answer(f"📊 Jami foydalanuvchilar: {res} ta")

@dp.message(F.text == "👥 Foydalanuvchilar")
async def adm_users(message: types.Message):
    if message.from_user.id in ADMIN_IDS:
        conn = await get_db_conn()
        rows = await conn.fetch("SELECT user_id, full_name, balance FROM users")
        await conn.close()
        text = "👥 <b>Foydalanuvchilar:</b>\n\n"
        for r in rows: text += f"🆔 <code>{r['user_id']}</code> | 👤 {r['full_name']} | 💰 {r['balance']:,} so'm\n"
        await message.answer(text, parse_mode="HTML")

# --- QOLGAN CALLBACKLAR (PAYMENT VA HKZ) ---
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
    if not message.text.isdigit(): return await message.answer("Faqat raqam yuboring!")
    await state.update_data(amount=int(message.text))
    wait_msg = await message.answer("Kuting...")
    await asyncio.sleep(5)
    builder = InlineKeyboardBuilder()
    builder.button(text="✅ Tashladim", callback_data="i_sent_it")
    await wait_msg.edit_text(f"Summa: {message.text} so'm. To'lov qilsangiz tugmani bosing.", reply_markup=builder.as_markup())

@dp.callback_query(F.data == "i_sent_it")
async def ask_photo(call: types.CallbackQuery, state: FSMContext):
    await call.message.edit_text("Ariza qabul qilinmoqda...")
    await asyncio.sleep(6)
    await call.message.edit_text("Iltimos, to'lov cheki (rasmi)ni yuboring:")
    await state.set_state(DepositState.waiting_for_photo)

@dp.message(DepositState.waiting_for_photo, F.photo)
async def handle_check(message: types.Message, state: FSMContext):
    data = await state.get_data()
    amount, card = data.get('amount'), data.get('card_type')
    builder = InlineKeyboardBuilder()
    builder.button(text="✅ Tasdiqlash", callback_data=f"adm_app_{message.from_user.id}_{amount}"), builder.button(text="❌ Rad etish", callback_data=f"adm_rej_{message.from_user.id}")
    builder.adjust(2)
    for admin_id in ADMIN_IDS:
        try: await bot.send_photo(chat_id=admin_id, photo=message.photo[-1].file_id, caption=f"📩 <b>Yangi to'lov!</b>\n👤 {message.from_user.full_name}\n🆔 {message.from_user.id}\n💳 {card}\n💰 {amount:,} so'm", parse_mode="HTML", reply_markup=builder.as_markup())
        except: continue
    await message.answer("Sorov bajarilmoqda iltimos kuting ...")
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

@dp.callback_query(F.data.startswith("adm_rej_"))
async def admin_rej_pay(call: types.CallbackQuery):
    uid = int(call.data.split("_")[2])
    await call.message.edit_caption(caption=call.message.caption + "\n\n❌ Rad etildi!", reply_markup=None)
    await bot.send_message(uid, "❌ To'lov rad etildi. Chek soxta!")

@dp.message(F.text == "⬅️ Orqaga")
async def back(message: types.Message, state: FSMContext):
    await state.clear()
    await message.answer("Bosh menyu", reply_markup=main_menu(message.from_user.id))

async def main():
    await init_db()
    await start_web_server()
    print("🚀 Bot ishga tushdi!")
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
