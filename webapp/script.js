// changeTab funksiyasini biroz yangilaymiz
function changeTab(tabName, element) {
    tg.HapticFeedback.impactOccurred('medium');
    
    // Active klassini o'zgartirish
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    element.classList.add('active');

    // Sarlavhani o'zgartirish
    const title = document.getElementById('tab-title');
    const titles = {
        'earn': 'PUL ISHLASH',
        'tasks': 'VAZIFALAR',
        'home': 'BOSH SAHIFA',
        'shop': 'DO\'KON',
        'profile': 'PROFIL'
    };
    title.innerText = titles[tabName] || tabName.toUpperCase();

    // MASLAHAT: Agar har bir tabda orqa fon o'zgarishini xohlasangiz:
    // const lobby = document.getElementById('game-lobby');
    // if(tabName === 'shop') lobby.style.backgroundImage = "url('yangi_rasm_url')";
}
