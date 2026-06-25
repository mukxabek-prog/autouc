const tg = window.Telegram.WebApp;
tg.expand(); // Web appni to'liq ekranga yoyish[cite: 2]

const API_URL = ""; // Agar HTML va bot bitta hostda bo'lsa bo'sh qoladi[cite: 2]

// Foydalanuvchi ma'lumotlarini o'rnatish (Buzilmadi, ishlaydi)[cite: 2]
const user = tg.initDataUnsafe.user;
if (user) {
    document.getElementById('user-name').innerText = user.first_name + (user.last_name ? ' ' + user.last_name : '');[cite: 2]
    document.getElementById('user-id').innerText = "ID: " + user.id;[cite: 2]
    if (user.photo_url) {
        document.getElementById('user-photo').src = user.photo_url;[cite: 2]
    }
}

// ID ni nusxalash funksiyasi[cite: 2]
function copyId() {
    navigator.clipboard.writeText(user.id).then(() => {
        tg.showAlert("ID nusxalandi: " + user.id);[cite: 2]
    });
}

// Bo'limlarni almashtirish funksiyasi (YANGI)
function switchTab(tabName) {
    tg.HapticFeedback.impactOccurred('light'); // Har bosilganda yengil vibratsiya
    
    // Hamma sahifalarni yashirish
    const contents = document.querySelectorAll('.tab-content');
    contents.forEach(content => content.classList.add('hidden'));
    
    // Hamma navigatsiya tugmalaridan 'active' klassini olib tashlash
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => item.classList.remove('active'));
    
    // Tanlangan sahifani ko'rsatish
    document.getElementById(`section-${tabName}`).classList.remove('hidden');
    
    // Bosilgan navigatsiya tugmasini faollashtirish
    // (Targetni aniqlash uchun bosilgan element matniga qarab topamiz)
    navItems.forEach(item => {
        if(item.innerText.toLowerCase().includes(tabName === 'gildirak' ? 'g\'ildirak' : tabName)) {
            item.classList.add('active');
        }
    });
}

// Bazadan ma'lumotlarni olish[cite: 2]
async function loadUserData() {
    try {
        const response = await fetch('/api/me', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData: tg.initData })[cite: 2]
        });
        const data = await response.json();
        if (data.ok) {
            document.getElementById('token-balance').innerText = data.tokens;[cite: 2]
            if (!data.checkin_available) {
                setCooldown(data.checkin_next_at);[cite: 2]
            }
        }
    } catch (e) {
        console.error("Xatolik:", e);[cite: 2]
    }
}

// Bonusni olish (OCHISH tugmasi)[cite: 2]
async function claimDrop() {
    tg.HapticFeedback.impactOccurred('medium');[cite: 2]
    try {
        const response = await fetch('/api/checkin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData: tg.initData })[cite: 2]
        });
        const data = await response.json();
        
        if (data.ok) {
            tg.showPopup({
                title: 'Tabriklaymiz!',
                message: `Sizga ${data.earned} ta token tushdi!`,[cite: 2]
                buttons: [{type: 'ok'}]
            });
            document.getElementById('token-balance').innerText = data.tokens;[cite: 2]
            setCooldown(data.nextAt);[cite: 2]
        } else if (data.error === 'cooldown') {
            tg.showAlert("Hali vaqt bor!");[cite: 2]
        }
    } catch (e) {
        tg.showAlert("Tarmoq xatosi");[cite: 2]
    }
}

function setCooldown(nextAt) {
    const btn = document.getElementById('open-btn');[cite: 2]
    const timer = document.getElementById('cooldown-timer');[cite: 2]
    btn.disabled = true;[cite: 2]
    btn.style.opacity = "0.5";[cite: 2]
    btn.innerText = "YOPILGAN";[cite: 2]
    
    timer.classList.remove('hidden');[cite: 2]
    timer.innerText = "Ertaga qaytib keling!";[cite: 2]
}

// Dastlabki yuklash[cite: 2]
loadUserData();[cite: 2]
