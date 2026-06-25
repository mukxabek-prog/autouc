const tg = window.Telegram.WebApp;
tg.expand();

const user = tg.initDataUnsafe.user;

if (user) {
    document.getElementById('user-name').innerText = user.username || user.first_name;
    document.getElementById('user-id-text').innerHTML = `ID: ${user.id} <i class="fa-regular fa-copy"></i>`;
    if (user.photo_url) document.getElementById('user-avatar').src = user.photo_url;
}

function copyId() {
    navigator.clipboard.writeText(user.id.toString());
    tg.HapticFeedback.notificationOccurred('success');
    tg.showAlert("ID nusxalandi!");
}

async function loadTokens() {
    const res = await fetch('/api/me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: tg.initData })
    });
    const data = await res.json();
    if (data.ok) {
        document.getElementById('token-count').innerText = data.tokens;
    }
}

// Bo'limlarni almashtirish (Hozircha faqat vizual)
function changeTab(tabName) {
    tg.HapticFeedback.impactOccurred('light');
    
    // Barcha nav-item lardan 'active' klassini olib tashlash
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });

    // Bosilganiga 'active' klassini qo'shish
    const clickedItem = event.currentTarget;
    clickedItem.classList.add('active');

    // O'rtadagi matnni o'zgartirish (test uchun)
    const mainText = document.querySelector('.placeholder-text h2');
    mainText.innerText = tabName.toUpperCase() + "...";
}

loadTokens();
