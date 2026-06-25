const tg = window.Telegram.WebApp;
tg.expand(); // Web appni to'liq ekranga yoyish

const API_URL = ""; // Agar HTML va bot bitta hostda bo'lsa bo'sh qoladi

// Foydalanuvchi ma'lumotlarini o'rnatish
const user = tg.initDataUnsafe.user;
if (user) {
    document.getElementById('user-name').innerText = user.first_name + (user.last_name ? ' ' + user.last_name : '');
    document.getElementById('user-id').innerText = "ID: " + user.id;
    if (user.photo_url) {
        document.getElementById('user-photo').src = user.photo_url;
    }
}

// ID ni nusxalash funksiyasi
function copyId() {
    navigator.clipboard.writeText(user.id).then(() => {
        tg.showAlert("ID nusxalandi: " + user.id);
    });
}

// Bazadan ma'lumotlarni olish
async function loadUserData() {
    try {
        const response = await fetch('/api/me', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData: tg.initData })
        });
        const data = await response.json();
        if (data.ok) {
            document.getElementById('token-balance').innerText = data.tokens;
            if (!data.checkin_available) {
                setCooldown(data.checkin_next_at);
            }
        }
    } catch (e) {
        console.error("Xatolik:", e);
    }
}

// Bonusni olish (OCHISH tugmasi)
async function claimDrop() {
    tg.HapticFeedback.impactOccurred('medium');
    try {
        const response = await fetch('/api/checkin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData: tg.initData })
        });
        const data = await response.json();
        
        if (data.ok) {
            tg.showPopup({
                title: 'Tabriklaymiz!',
                message: `Sizga ${data.earned} ta token tushdi!`,
                buttons: [{type: 'ok'}]
            });
            document.getElementById('token-balance').innerText = data.tokens;
            setCooldown(data.nextAt);
        } else if (data.error === 'cooldown') {
            tg.showAlert("Hali vaqt bor!");
        }
    } catch (e) {
        tg.showAlert("Tarmoq xatosi");
    }
}

function setCooldown(nextAt) {
    const btn = document.getElementById('open-btn');
    const timer = document.getElementById('cooldown-timer');
    btn.disabled = true;
    btn.style.opacity = "0.5";
    btn.innerText = "YOPILGAN";
    
    // Oddiy taymer mantiqi (ixtiyoriy qo'shish mumkin)
    timer.classList.remove('hidden');
    timer.innerText = "Ertaga qaytib keling!";
}

// Vazifani tekshirish
async function checkTask() {
    const response = await fetch('/api/task/channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: tg.initData })
    });
    const data = await response.json();
    if (data.ok) {
        tg.showAlert("Vazifa bajarildi! +3 token");
        loadUserData();
    } else {
        tg.showAlert("Avval kanalga a'zo bo'ling!");
    }
}

// Dastlabki yuklash
loadUserData();
