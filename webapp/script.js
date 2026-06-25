const tg = window.Telegram.WebApp;

// WebApp tayyor bo'lishini kutamiz
tg.ready();
tg.expand();

// Foydalanuvchi ma'lumotlarini ekranga chiqarish funksiyasi
function setupUser() {
    const user = tg.initDataUnsafe.user;

    if (user) {
        // Nikneym (username bo'lsa uni, bo'lmasa ismini chiqaramiz)
        document.getElementById('user-name').innerText = user.username ? "@" + user.username : user.first_name;
        
        // ID raqami
        document.getElementById('user-id-text').innerHTML = `ID: ${user.id} <i class="fa-regular fa-copy"></i>`;
        
        // Rasm (Avatar)
        if (user.photo_url) {
            document.getElementById('user-avatar').src = user.photo_url;
        } else {
            // Agar rasm bo'lmasa, harflar bilan avatar yasash (placeholder)
            document.getElementById('user-avatar').src = `https://ui-avatars.com/api/?name=${user.first_name}&background=38bdf8&color=fff`;
        }
    } else {
        // Agar Telegram muhitida bo'lmasa (test uchun)
        document.getElementById('user-name').innerText = "Mehmon";
        document.getElementById('user-id-text').innerText = "ID: 00000000";
    }
}

// ID nusxalash
function copyId() {
    const user = tg.initDataUnsafe.user;
    if (user) {
        navigator.clipboard.writeText(user.id.toString());
        tg.HapticFeedback.notificationOccurred('success');
        tg.showPopup({ message: "ID nusxalandi!" });
    }
}

// Menyularni almashtirish funksiyasi
function changeTab(tabName, element) {
    // Vibratsiya (aloqa sezish)
    tg.HapticFeedback.impactOccurred('medium');
    
    // Barcha menyulardan 'active' klassini olib tashlaymiz
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });

    // Bosilgan menyuga 'active' klassini qo'shamiz
    element.classList.add('active');

    // Sarlavhani o'zgartiramiz
    const titles = {
        'earn': 'PUL ISHLASH',
        'tasks': 'VAZIFALAR',
        'home': 'BOSH SAHIFA',
        'shop': 'DO\'KON',
        'profile': 'PROFIL'
    };
    document.getElementById('tab-title').innerText = titles[tabName] || tabName.toUpperCase();
}

// Tokenlarni bazadan olish (Real vaqtda)
async function loadTokens() {
    try {
        const res = await fetch('/api/me', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData: tg.initData })
        });
        const data = await res.json();
        if (data.ok) {
            document.getElementById('token-count').innerText = data.tokens;
        }
    } catch (e) {
        console.log("Token yuklashda xato");
    }
}

// Skript yuklanganda hammasini ishga tushirish
setupUser();
loadTokens();
