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
from aiohttp import web # Uyg'oq saqlash uchun kerak

# --- SOZLAMALAR ---
API_TOKEN = '8014335358:AAECevOsYHvb35TUwJN62akMpSyo9rBVGUc'
ADMIN_IDS = [8088597011, 1675681600, 6800188051]
MENYU_RASM = 'menyu_rasm.jpg'
DB_URL = "postgresql://postgres.uhycpopponeusqfaibgx:C%26Q6tfGa%2A-Utr8L@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres"

# --- WEB SERVER (CRON-JOB UCHUN) ---
async def handle(request):
    return web.Response(text="Bot uyg'oq!")

async def start_web_server():
    app = web.Application()
    app.router.add_get("/", handle)
    runner = web.AppRunner(app)
    await runner.setup()
    port = int(os.environ.get("PORT", 8080)) # Render portni o'zi beradi
    site = web.TCPSite(runner, "0.0.0.0", port)
    await site.start()
    print(f"✅ Web server {port}-portda ishga tushdi")

# --- QOLGAN BOT KODLARI (NARXLAR VA HKZ) ---
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

async def get_db_conn():
    return await asyncpg.connect(DB_URL)

async def init_db():
    conn = await get_db_conn()
    await conn.execute('CREATE TABLE IF NOT EXISTS users (user_id BIGINT PRIMARY KEY, full_name TEXT, balance INTEGER DEFAULT 0)')
    await conn.close()

def main_menu(user_id):
    builder = ReplyKeyboardBuilder()
    builder.button(text="💎 UC sotib olish"), builder.button(text="🔹 Diamond sotib olish")
    builder.button(text="💰 Hisob"), builder.button(text="ℹ️ Yordam")
    if user_id in ADMIN_IDS: builder.button(text="🛠 Admin Panel")
    builder.adjust(2)
    return builder.as_markup(resize_keyboard=True)

# --- START VA BOSHQALAR (AVVALGI IDEAL KODINGIZ) ---
@dp.message(Command("start"))
async def start_cmd(message: types.Message, state: FSMContext):
    await state.clear()
    conn = await get_db_conn()
    await conn.execute('INSERT INTO users (user_id, full_name) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name', message.from_user.id, message.from_user.full_name)
    await conn.close()
    text = (f"Assalomu alaykum {message.from_user.full_name}!\nsizni bu botda korganmzdan xursandmiz...")
    try: await message.answer_photo(photo=FSInputFile(MENYU_RASM), caption=text, reply_markup=main_menu(message.from_user.id))
    except: await message.answer(text, reply_markup=main_menu(message.from_user.id))

# ... (Bu yerga avvalgi barcha xabarlar, to'lovlar va sotib olish kodlarini qo'shing) ...
# (Joy yetmasligi uchun faqat asosiy qismini yozdim, siz o'zingizdagi to'liq mantiqni saqlab qoling)

# --- ASOSIY ISHGA TUSHIRISH ---
async def main():
    await init_db()
    await start_web_server() # BU JUDA MUHIM!
    print("🚀 Bot ishga tushdi!")
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
