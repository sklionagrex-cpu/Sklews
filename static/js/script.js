/* BUILD-20260807-1600 */
/* Sklews client */
window.SKLEWS_JS_OK = true;
const socket = (typeof io === 'function')
  ? io({ transports: ['websocket', 'polling'] })
  : { on: function(){}, emit: function(){}, off: function(){} };


let currentChannelId = null;
let currentChatUserId = null;
let currentSort = 'today';
let isSuperMode = false;
let longPressChannelId = null;
let pendingPostPhoto = null;
let pendingChannelAvatar = null;
let currentCommentPostId = null;
let anChart = null;
let anChannelId = null;
let viewingPosts = false;
let reactPostId = null;


function setMePlusFromProfile(p) {
    meHasPremium = !!p.is_premium;
    meHasPremiumPlus = !!p.is_premium_plus;
    mePlus = {
        plus_name_fx: p.plus_name_fx || '',
        plus_avatar_frame: p.plus_avatar_frame || '',
        plus_aura: p.plus_aura || '',
        plus_badge: p.plus_badge || '',
        plus_banner_fx: p.plus_banner_fx || '',
        plus_msg_style: p.plus_msg_style || '',
        plus_card_style: p.plus_card_style || '',
        plus_accent: p.plus_accent || '',
    };
    if (Array.isArray(p.owned_themes)) meOwnedThemes = p.owned_themes;
}

function applyPlusToProfileHero(p, opts) {
    opts = opts || {};
    const heroId = opts.heroId || 'profile-hero';
    const avId = opts.avId || 'profile-avatar';
    const bannerId = opts.bannerId || 'profile-banner';
    const nameId = opts.nameId || 'profile-username';
    const badgeId = opts.badgeId || 'profile-plus-badge';
    const underId = opts.underId || 'profile-plus-under';
    const hero = document.getElementById(heroId);
    const av = document.getElementById(avId);
    const banner = document.getElementById(bannerId);
    const under = document.getElementById(underId);
    const pun = document.getElementById(nameId);
    if (!p) return;

    // Restore original avatar DOM if we previously wrapped it
    if (av && av.parentElement && av.parentElement.classList.contains('avatar-hero-wrap')) {
        const wrap = av.parentElement;
        wrap.parentNode.insertBefore(av, wrap);
        wrap.remove();
    }

    // Avatar itself unchanged layout — only ring classes
    if (av) {
        av.classList.remove('av-ring-gold','av-ring-diamond','av-ring-aurora','av-ring-rose','av-ring-obsidian','av-ring-prism','av-ring-royal');
        if (p.plus_avatar_frame) av.classList.add('av-ring-' + p.plus_avatar_frame);
    }

    // Banner overlay FX (on top of photo/video, under gradient)
    const fxKeys = ['glare','aurora','neon','stardust','holo','rain','shutter','spark','trail','radar'];
    if (banner) {
        banner.classList.remove(...fxKeys.map(k => 'bfx-' + k));
        let layer = banner.querySelector('.banner-fx-layer');
        if (!layer) {
            layer = document.createElement('div');
            layer.className = 'banner-fx-layer';
            banner.appendChild(layer);
        }
        layer.className = 'banner-fx-layer';
        layer.innerHTML = '';
        if (p.plus_banner_fx && fxKeys.includes(p.plus_banner_fx)) {
            banner.classList.add('bfx-' + p.plus_banner_fx);
            layer.classList.add('bfx-' + p.plus_banner_fx);
            // particles need many dots
            if (p.plus_banner_fx === 'stardust') {
                for (let i = 0; i < 24; i++) {
                    const d = document.createElement('span');
                    d.className = 'stardust-dot';
                    d.style.setProperty('--i', i);
                    d.style.setProperty('--x', (Math.random() * 100).toFixed(1) + '%');
                    d.style.setProperty('--delay', (Math.random() * 8).toFixed(2) + 's');
                    d.style.setProperty('--dur', (5 + Math.random() * 6).toFixed(2) + 's');
                    layer.appendChild(d);
                }
            }
            if (p.plus_banner_fx === 'spark') {
                for (let i = 0; i < 8; i++) {
                    const s = document.createElement('span');
                    s.className = 'spark-star';
                    s.style.setProperty('--i', i);
                    s.style.setProperty('--x', (8 + Math.random() * 84).toFixed(1) + '%');
                    s.style.setProperty('--y', (10 + Math.random() * 70).toFixed(1) + '%');
                    s.style.setProperty('--delay', (Math.random() * 2).toFixed(2) + 's');
                    layer.appendChild(s);
                }
            }
            if (p.plus_banner_fx === 'rain') {
                for (let i = 0; i < 18; i++) {
                    const r = document.createElement('span');
                    r.className = 'rain-streak';
                    r.style.setProperty('--i', i);
                    r.style.setProperty('--x', (Math.random() * 100).toFixed(1) + '%');
                    r.style.setProperty('--delay', (Math.random() * 3).toFixed(2) + 's');
                    r.style.setProperty('--dur', (1.2 + Math.random() * 2.2).toFixed(2) + 's');
                    layer.appendChild(r);
                }
            }
        }
    }
    // hide legacy under strip if present
    if (under) under.style.display = 'none';

    if (hero) {
        hero.classList.remove('plus-card-glass','plus-card-velvet','plus-card-metal','plus-card-royal','has-aura');
        if (p.plus_card_style) hero.classList.add('plus-card-' + p.plus_card_style);
        if (p.plus_aura) {
            hero.classList.add('has-aura');
            hero.style.setProperty('--plus-aura', p.plus_aura + '88');
        } else {
            hero.style.removeProperty('--plus-aura');
        }
        if (p.plus_accent) hero.style.setProperty('--plus-accent', p.plus_accent);
        else hero.style.removeProperty('--plus-accent');
    }

    if (pun) {
        pun.innerHTML = premiumNickHtml(p.username, p.is_premium || p.is_premium_plus, p.plus_name_fx, p.plus_accent || p.plus_aura || '');
        let badge = document.getElementById(badgeId);
        if (p.plus_badge) {
            if (!badge) {
                badge = document.createElement('div');
                badge.id = badgeId;
                badge.className = 'profile-plus-badge';
                pun.after(badge);
            }
            badge.textContent = p.plus_badge;
            badge.style.display = '';
        } else if (badge) {
            badge.style.display = 'none';
        }
    }
}


function premiumNickHtml(username, isPremium, plusFx, pulseColor) {
    const name = escapeHtml(username || '');
    if (!isPremium && !plusFx) return '@' + name;
    const fx = plusFx ? (' nick-fx-' + plusFx) : '';
    const style = (pulseColor && /^#[0-9A-Fa-f]{6}$/.test(pulseColor))
        ? (' style="--prem-pulse:' + pulseColor + '"') : '';
    return '<span class="premium-nick' + fx + '"' + style + '>@' + name + '</span>';
}

function setProfileBanner(bannerEl, videoEl, url, bannerType) {
    if (!bannerEl) return;
    const isVideo = bannerType === 'video' || (!!url && /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url));
    if (videoEl) {
        videoEl.pause();
        videoEl.removeAttribute('src');
        videoEl.load();
    }
    if (!url) {
        bannerEl.classList.remove('has-banner', 'has-video');
        bannerEl.style.backgroundImage = '';
        return;
    }
    if (isVideo && videoEl) {
        bannerEl.classList.add('has-banner', 'has-video');
        bannerEl.style.backgroundImage = '';
        videoEl.muted = true;
        videoEl.loop = true;
        videoEl.playsInline = true;
        videoEl.setAttribute('playsinline', '');
        videoEl.setAttribute('muted', '');
        videoEl.src = url;
        videoEl.play().catch(() => {});
    } else {
        bannerEl.classList.add('has-banner');
        bannerEl.classList.remove('has-video');
        bannerEl.style.backgroundImage = 'url(' + url + ')';
    }
}


let meIsAdmin = false;
let meHasPremium = false;
let meHasPremiumPlus = false;
let mePlus = { plus_name_fx:'', plus_avatar_frame:'', plus_aura:'', plus_badge:'', plus_banner_fx:'' };
let meId = null;
let meUserId = null;
let meOwnedThemes = [];
const EXCLUSIVE_THEME_KEYS = ['obsidian_gold', 'aurora_void', 'crimson_neon', 'honey_ember', 'terracotta_dusk', 'cashmere_haze'];

// Bootstrap premium/admin flags early so Premium tab appears without visiting profile
(async function bootstrapMe() {
    try {
        const res = await fetch('/api/profile');
        if (!res.ok) return;
        const p = await res.json();
        setMePlusFromProfile(p);
    if (p.id) meId = p.id;
    if (p.username) window.__meUsername = p.username;
    if (Array.isArray(p.owned_themes)) loadSavedTheme();
        meUserId = p.id;
        meIsAdmin = !!p.is_admin;
        updatePremiumNav();
        const fab = document.getElementById('admin-fab');
        if (fab) {
            if (meIsAdmin) fab.classList.remove('hidden');
            else fab.classList.add('hidden');
        }
    } catch (e) {}
})();

function safeOn(id, event, fn) {
    const el = typeof id === 'string' ? document.getElementById(id) : id;
    if (!el) { console.warn('safeOn missing', id); return; }
    el.addEventListener(event, fn);
}
let adminSelectMode = false;
let adminSelectedChannels = new Set();
let _lastChannelsCache = [];


// ===== Notifications: sound + vibration =====
function notifyUser(type) {
    try {
        if (navigator.vibrate) navigator.vibrate(type === 'message' ? [40, 30, 40] : [20, 40, 20]);
    } catch (e) {}
    try {
        const ctx = window._audioCtx || (window._audioCtx = new (window.AudioContext || window.webkitAudioContext)());
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = 'sine';
        if (type === 'message') { o.frequency.value = 880; g.gain.value = 0.08; }
        else if (type === 'friend') { o.frequency.value = 660; g.gain.value = 0.07; }
        else { o.frequency.value = 520; g.gain.value = 0.06; }
        o.start();
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
        o.stop(ctx.currentTime + 0.2);
    } catch (e) {}
}



document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        NAV_STACK.length = 0;
        currentChatUserId = null;
        showScreen('screen-' + tab, { push: false });
        try { history.replaceState({ sklews: 1, root: 1, tab }, '', '#' + tab); } catch (e) {}
        if (tab === 'home') loadHome();
        if (tab === 'premium') {
            const activeP = document.querySelector('.premium-tab.active')?.dataset.ptab || 'posts';
            if (activeP === 'chat') openPremiumChat();
            else loadPremiumFeed();
        }
        if (tab === 'profile') loadProfile();
        if (tab === 'create') loadMyChannels();
        if (tab === 'analytics') loadAnalyticsTab();
        if (tab === 'shop') loadShop();
        if (tab === 'chats') {
            document.getElementById('search-results').innerHTML = '';
            document.getElementById('search-users').value = '';
            loadChatsList();
        }
    });
});

// ===== In-app navigation stack (hardware back button) =====
const NAV_STACK = [];
let _navSuppress = false;

function showScreen(id, opts) {
    opts = opts || {};
    const push = opts.push !== false; // default push
    const current = document.querySelector('.screen.active');
    const curId = current ? current.id : null;
    if (push && curId && curId !== id) {
        NAV_STACK.push({ screen: curId, chatUserId: currentChatUserId, extra: opts.fromExtra || null });
        try {
            history.pushState({ sklews: 1, screen: id, depth: NAV_STACK.length }, '', '#' + id);
        } catch (e) {}
    }
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(id);
    if (!el) {
        console.warn('showScreen: missing', id);
        return;
    }
    el.classList.add('active');
    try { el.scrollTop = 0; } catch (e) {}
}

function navGoBack() {
    // Close open modals first
    const openModal = document.querySelector('.modal:not(.hidden)');
    if (openModal) {
        openModal.classList.add('hidden');
        return true;
    }
    if (!NAV_STACK.length) {
        // On root tabs — don't exit; stay
        return true;
    }
    const prev = NAV_STACK.pop();
    _navSuppress = true;
    if (prev.screen === 'screen-chat' && prev.chatUserId) {
        // rare
        currentChatUserId = prev.chatUserId;
    } else if (prev.screen !== 'screen-chat') {
        currentChatUserId = null;
    }
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(prev.screen);
    if (el) el.classList.add('active');
    // Sync bottom nav highlight for root tabs
    const tabMap = {
        'screen-home': 'home', 'screen-premium': 'premium', 'screen-create': 'create',
        'screen-analytics': 'analytics', 'screen-shop': 'shop', 'screen-chats': 'chats',
        'screen-profile': 'profile'
    };
    if (tabMap[prev.screen]) {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('.nav-btn[data-tab="' + tabMap[prev.screen] + '"]')?.classList.add('active');
    }
    try {
        history.pushState({ sklews: 1, screen: prev.screen, depth: NAV_STACK.length }, '', '#' + prev.screen);
    } catch (e) {}
    _navSuppress = false;
    return true;
}

window.addEventListener('popstate', e => {
    if (_navSuppress) return;
    // Android/iOS system back
    if (NAV_STACK.length) {
        navGoBack();
    } else {
        // Keep a state so another back can be intercepted again
        try { history.pushState({ sklews: 1, root: 1 }, '', location.pathname); } catch (err) {}
    }
});

// Seed history so first back is interceptable
try { history.replaceState({ sklews: 1, root: 1 }, '', location.pathname); } catch (e) {}


function showToast(title, text, icon) {
    document.getElementById('toast-title').textContent = title || 'Готово';
    document.getElementById('toast-text').textContent = text || '';
    document.getElementById('toast-icon').textContent = icon || '✦';
    document.getElementById('modal-toast').classList.remove('hidden');
}
safeOn('btn-toast-ok', 'click', () => document.getElementById('modal-toast')?.classList.add('hidden'));


function setAvatarEl(el, url, letter) {
    if (!el) return;
    const L = ((letter || '?')[0] || '?').toUpperCase();
    el.style.backgroundImage = '';
    el.textContent = '';
    el.querySelectorAll('img').forEach(i => i.remove());
    if (url) {
        const img = document.createElement('img');
        img.src = url;
        img.alt = '';
        img.loading = 'lazy';
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit';
        img.onerror = () => { img.remove(); el.textContent = L; };
        el.appendChild(img);
    } else {
        el.textContent = L;
    }
}

function avatarHtml(letter, url, cls) {
    const c = cls || 'avatar';
    const L = ((letter || '?')[0] || '?').toUpperCase();
    if (url) {
        const safe = String(url).replace(/"/g, '');
        return `<div class="${c}" style="overflow:hidden;position:relative">` +
            `<img src="${safe}" alt="" loading="lazy" decoding="async" ` +
            `style="width:100%;height:100%;object-fit:cover;display:block" ` +
            `onerror="this.style.display='none';this.parentNode.textContent='${L}';this.parentNode.style.display='flex';this.parentNode.style.alignItems='center';this.parentNode.style.justifyContent='center'">` +
            `</div>`;
    }
    return `<div class="${c}">${L}</div>`;
}

function escapeHtml(t) {
    if (!t) return '';
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
}

function linkifyMentions(text) {
    const esc = escapeHtml(text || '');
    // URLs first, then mentions
    let out = esc.replace(/(https?:\/\/[^\s<]+)/gi, '<a class="msg-link" href="$1" target="_blank" rel="noopener" data-preview-url="$1">$1</a>');
    out = out.replace(/@([a-zA-Z0-9_]{2,32})/g, '<span class="mention-link" data-username="$1">@$1</span>');
    return out;
}

const _linkPreviewCache = {};
async function fetchLinkPreview(url) {
    if (_linkPreviewCache[url]) return _linkPreviewCache[url];
    try {
        const res = await fetch('/api/link-preview?url=' + encodeURIComponent(url));
        const data = await res.json();
        _linkPreviewCache[url] = data;
        return data;
    } catch (e) {
        return null;
    }
}

function buildLinkPreviewHtml(data) {
    if (!data || data.error && !data.image && !data.video && !data.title) return '';
    if (data.type === 'image' || (data.image && !data.title && data.type !== 'page')) {
        const src = data.image || data.url;
        return '<a class="link-preview" href="' + escapeHtml(data.url || src) + '" target="_blank" rel="noopener">' +
            '<img class="link-preview-media" src="' + escapeHtml(src) + '" alt="" loading="lazy"></a>';
    }
    if (data.type === 'video' || data.video) {
        const src = data.video || data.url;
        return '<div class="link-preview"><video class="link-preview-video" src="' + escapeHtml(src) + '" controls playsinline preload="metadata"></video></div>';
    }
    if (!data.title && !data.image && !data.description) return '';
    let media = '';
    if (data.image) media = '<img class="link-preview-media" src="' + escapeHtml(data.image) + '" alt="" loading="lazy">';
    return '<a class="link-preview" href="' + escapeHtml(data.url || '#') + '" target="_blank" rel="noopener">' + media +
        '<div class="link-preview-body">' +
        (data.site ? '<div class="link-preview-site">' + escapeHtml(data.site) + '</div>' : '') +
        (data.title ? '<div class="link-preview-title">' + escapeHtml(data.title) + '</div>' : '') +
        (data.description ? '<div class="link-preview-desc">' + escapeHtml(data.description) + '</div>' : '') +
        '</div></a>';
}

async function enhanceLinkPreviews(root) {
    if (!root) return;
    const links = root.querySelectorAll('a.msg-link[data-preview-url]');
    const seen = new Set();
    for (const a of links) {
        const url = a.getAttribute('data-preview-url');
        if (!url || seen.has(url)) continue;
        seen.add(url);
        // skip if preview already next sibling under same bubble
        const bubble = a.closest('.msg-bubble, .pc-msg, .pf-text, .post-text');
        if (bubble && bubble.querySelector('.link-preview[data-for="' + url.replace(/"/g, '') + '"]')) continue;
        const data = await fetchLinkPreview(url);
        const html = buildLinkPreviewHtml(data);
        if (!html) continue;
        const wrap = document.createElement('div');
        wrap.innerHTML = html;
        const node = wrap.firstElementChild;
        if (!node) continue;
        node.setAttribute('data-for', url);
        if (bubble) bubble.appendChild(node);
        else a.insertAdjacentElement('afterend', node);
    }
}

function bindMentions(root) {
    if (!root) return;
    root.querySelectorAll('.mention-link').forEach(el => {
        el.onclick = async e => {
            e.stopPropagation();
            const uname = el.dataset.username;
            if (!uname) return;
            const res = await fetch('/api/users/search?q=' + encodeURIComponent(uname));
            const users = await res.json();
            const u = users.find(x => x.username.toLowerCase() === uname.toLowerCase());
            if (u) openUserProfile(u.id);
            else showToast('Не найден', '@' + uname, '!');
        };
    });
}



let homeSearchTimer = null;
document.getElementById('home-search')?.addEventListener('input', e => {
    const q = e.target.value.trim();
    const clearBtn = document.getElementById('btn-clear-home-search');
    const box = document.getElementById('home-search-results');
    if (clearBtn) clearBtn.classList.toggle('hidden', !q);
    clearTimeout(homeSearchTimer);
    if (!box) return;
    if (q.length < 1) {
        box.classList.add('hidden');
        box.innerHTML = '';
        return;
    }
    homeSearchTimer = setTimeout(async () => {
        const res = await fetch('/api/channels?q=' + encodeURIComponent(q));
        const channels = await res.json();
        box.innerHTML = '';
        if (!channels.length) {
            box.innerHTML = '<div class="empty-state" style="padding:16px">Ничего не найдено</div>';
        } else {
            channels.forEach(ch => {
                const card = document.createElement('div');
                card.className = 'channel-card';
                card.innerHTML = avatarHtml(ch.name, ch.avatar) +
                    '<div class="channel-info"><h3>' + escapeHtml(ch.name) + '</h3><p>' + (ch.subscribers || 0) + ' участников</p></div>';
                card.onclick = () => {
                    box.classList.add('hidden');
                    document.getElementById('home-search').value = '';
                    clearBtn?.classList.add('hidden');
                    openChannel(ch.id);
                };
                box.appendChild(card);
            });
        }
        box.classList.remove('hidden');
    }, 250);
});
document.getElementById('btn-clear-home-search')?.addEventListener('click', () => {
    document.getElementById('home-search').value = '';
    document.getElementById('btn-clear-home-search').classList.add('hidden');
    document.getElementById('home-search-results').classList.add('hidden');
    document.getElementById('home-search-results').innerHTML = '';
});
document.getElementById('home-search')?.addEventListener('focus', () => {
    if (document.getElementById('home-search').value.trim()) {
        document.getElementById('home-search-results').classList.remove('hidden');
    }
});

function loadHome() { loadChannels(); loadActivity(); }

async function loadActivity() {
    try {
        const res = await fetch('/api/activity');
        const d = await res.json();
        const el = document.getElementById('activity-line');
        if (el) el.textContent = 'Активность: ' + (d.today || 0) + ' постов за сегодня';
    } catch (e) {}
}

async function loadChannels() {
    try {
        const res = await fetch('/api/channels?sort=' + currentSort);
        const channels = await res.json();
        _lastChannelsCache = channels;
        const feed = document.getElementById('channels-feed');
        if (!feed) return;
        feed.innerHTML = '';
        updateAdminSelectBar();
        if (!channels.length) {
            feed.innerHTML = '<div class="empty-state">Нет новых каналов</div>';
            return;
        }
        channels.forEach(ch => {
            const card = document.createElement('div');
            card.className = 'channel-card' + (ch.is_boosted ? ' boosted boosted-' + (ch.boost_level || 'bronze') : '') + (ch.plus_frame ? ' plus-frame-' + ch.plus_frame : '') + (ch.plus_anim ? ' plus-anim-' + ch.plus_anim : '');
            card.dataset.channelId = ch.id;
            if (adminSelectMode && adminSelectedChannels.has(ch.id)) card.classList.add('admin-selected');
            if (ch.plus_glow) card.style.boxShadow = '0 0 22px ' + ch.plus_glow + '44';
            const badge = (ch.label ? '<span class="boost-label">' + ch.label + '</span>' : '') + (ch.plus_badge ? '<span class="channel-plus-badge">' + escapeHtml(ch.plus_badge) + '</span>' : '');
            const check = adminSelectMode ? '<div class="admin-check"></div>' : '';
            card.innerHTML = check + avatarHtml(ch.name, ch.avatar) +
                '<div class="channel-info"><h3>' + escapeHtml(ch.name) + ' ' + badge + '</h3><p>' + ch.subscribers + ' участников</p></div>';
            let longPressed = false;
            card.onclick = () => {
                if (longPressed) { longPressed = false; return; }
                if (adminSelectMode && meIsAdmin) {
                    toggleAdminChannelSelect(ch.id, card);
                    return;
                }
                openChannel(ch.id);
            };
            // Admin: long-press single delete (when not in select mode)
            if (meIsAdmin) {
                let t = null;
                const start = () => {
                    if (adminSelectMode) return;
                    longPressed = false;
                    t = setTimeout(() => {
                        longPressed = true;
                        window._deleteChannelId = ch.id;
                        window._deleteChannelName = ch.name;
                        const title = document.querySelector('#modal-delete-channel h3');
                        if (title) title.textContent = 'Удалить канал?';
                        const p = document.querySelector('#modal-delete-channel p');
                        if (p) p.textContent = '«' + ch.name + '» — все посты и подписки будут удалены безвозвратно';
                        document.getElementById('modal-delete-channel').classList.remove('hidden');
                    }, 550);
                };
                const cancel = () => clearTimeout(t);
                card.addEventListener('touchstart', start, { passive: true });
                card.addEventListener('touchend', cancel);
                card.addEventListener('touchmove', cancel);
                card.addEventListener('mousedown', start);
                card.addEventListener('mouseup', cancel);
                card.addEventListener('mouseleave', cancel);
            }
            feed.appendChild(card);
        });
    } catch (e) { console.error(e); }
}

function updateAdminSelectBar() {
    const bar = document.getElementById('admin-select-bar');
    if (!bar) return;
    if (!meIsAdmin) {
        bar.classList.add('hidden');
        return;
    }
    bar.classList.remove('hidden');
    const btnToggle = document.getElementById('btn-admin-select-toggle');
    const btnAll = document.getElementById('btn-admin-select-all');
    const btnDel = document.getElementById('btn-admin-bulk-delete');
    const btnCancel = document.getElementById('btn-admin-select-cancel');
    const cnt = document.getElementById('admin-sel-count');
    if (adminSelectMode) {
        btnToggle.classList.add('hidden');
        btnAll.classList.remove('hidden');
        btnDel.classList.remove('hidden');
        btnCancel.classList.remove('hidden');
        if (cnt) cnt.textContent = adminSelectedChannels.size;
        btnDel.disabled = adminSelectedChannels.size === 0;
        btnDel.style.opacity = adminSelectedChannels.size ? '1' : '0.5';
    } else {
        btnToggle.classList.remove('hidden');
        btnAll.classList.add('hidden');
        btnDel.classList.add('hidden');
        btnCancel.classList.add('hidden');
        adminSelectedChannels.clear();
    }
}

function toggleAdminChannelSelect(id, card) {
    if (adminSelectedChannels.has(id)) {
        adminSelectedChannels.delete(id);
        card.classList.remove('admin-selected');
    } else {
        adminSelectedChannels.add(id);
        card.classList.add('admin-selected');
    }
    updateAdminSelectBar();
}

function setAdminSelectMode(on) {
    adminSelectMode = !!on;
    if (!on) adminSelectedChannels.clear();
    updateAdminSelectBar();
    loadChannels();
}


async function loadMySubs() {
    try {
        const res = await fetch('/api/my_subscriptions');
        const subs = await res.json();
        const feed = document.getElementById('my-subs');
        feed.innerHTML = '';
        if (!subs.length) {
            feed.innerHTML = '<div class="empty-state">Нет подписок</div>';
            return;
        }
        subs.forEach(s => {
            const card = document.createElement('div');
            card.className = 'sub-card';
            card.innerHTML = avatarHtml(s.name, s.avatar) +
                '<div class="channel-info"><h3>' + escapeHtml(s.name) + '</h3><p>' + escapeHtml(s.last_message) + '</p></div>' +
                (s.unread > 0 ? '<div class="badge-unread">' + s.unread + '</div>' : '');
            card.onclick = () => openChannel(s.id);
            let timer;
            const start = () => { timer = setTimeout(() => openSubActions(s), 550); };
            const cancel = () => clearTimeout(timer);
            card.addEventListener('touchstart', start);
            card.addEventListener('mousedown', start);
            card.addEventListener('touchend', cancel);
            card.addEventListener('mouseup', cancel);
            card.addEventListener('touchmove', cancel);
            feed.appendChild(card);
        });
    } catch (e) { console.error(e); }
}

function openSubActions(s) {
    longPressChannelId = s.id;
    document.getElementById('sub-actions-title').textContent = s.name;
    document.getElementById('btn-toggle-notif').textContent = s.notifications ? 'Отключить уведомления' : 'Включить уведомления';
    document.getElementById('modal-sub-actions').classList.remove('hidden');
}
document.getElementById('btn-close-sub-modal').onclick = () => document.getElementById('modal-sub-actions').classList.add('hidden');
document.getElementById('btn-toggle-notif').onclick = async () => {
    await fetch('/api/channel/' + longPressChannelId + '/notifications', { method: 'POST' });
    document.getElementById('modal-sub-actions').classList.add('hidden');
    loadMySubs();
};
document.getElementById('btn-leave-from-modal').onclick = async () => {
    await fetch('/api/channel/' + longPressChannelId + '/leave', { method: 'POST' });
    document.getElementById('modal-sub-actions').classList.add('hidden');
    loadMySubs(); loadHome();
};

document.querySelectorAll('.filters .filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filters .filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentSort = btn.dataset.sort;
        loadChannels();
    });
});

async function openChannel(id) {
    currentChannelId = id;
    viewingPosts = false;
    showScreen('screen-channel');
    try {
        const res = await fetch('/api/channel/' + id);
        if (!res.ok) {
            showToast('Канал', 'Не удалось открыть', '!');
            return;
        }
        const ch = await res.json();
        if (ch.error) {
            showToast('Канал', ch.error, '!');
            return;
        }
        document.getElementById('channel-title').textContent = ch.name;
        const chNameEl = document.getElementById('channel-name');
        chNameEl.textContent = ch.name;
        if (ch.plus_badge) {
            chNameEl.innerHTML = escapeHtml(ch.name) + ' <span class="channel-plus-badge">' + escapeHtml(ch.plus_badge) + '</span>';
        }
        document.getElementById('channel-subs').textContent = ch.subscribers + ' участников';
        document.getElementById('channel-desc').textContent = ch.description || 'Нет описания';
        const av = document.getElementById('channel-avatar');
        if (av) {
            if (typeof setAvatarEl === 'function') setAvatarEl(av, ch.avatar, ch.name);
            else {
                if (ch.avatar) {
                    av.style.backgroundImage = 'url(' + ch.avatar + ')';
                    av.style.backgroundSize = 'cover';
                    av.textContent = '';
                } else {
                    av.style.backgroundImage = '';
                    av.textContent = (ch.name || '?')[0].toUpperCase();
                }
            }
        }
        const head = document.querySelector('#screen-channel .channel-header') || document.querySelector('.channel-header') || document.getElementById('channel-header');
        if (head) {
            head.classList.remove('fx-shimmer','fx-aurora','fx-ember');
            if (ch.plus_header_fx) head.classList.add('fx-' + ch.plus_header_fx);
            if (ch.plus_glow) head.style.boxShadow = '0 0 30px ' + ch.plus_glow + '33';
            else head.style.boxShadow = '';
            if (ch.avatar) {
                head.style.background = 'linear-gradient(to bottom, rgba(12,10,20,0.4), var(--bg)), url(' + ch.avatar + ') center/cover';
            } else head.style.background = '';
        }
        const btnJoin = document.getElementById('btn-join');
        const btnWatch = document.getElementById('btn-watch');
        const btnPosts = document.getElementById('btn-open-posts');
        if (ch.is_owner) {
            btnJoin.classList.add('hidden');
            btnWatch.classList.add('hidden');
            btnPosts.classList.remove('hidden');
        } else if (ch.is_subscribed) {
            btnJoin.textContent = 'Покинуть';
            btnJoin.classList.remove('btn-primary', 'hidden'); btnJoin.classList.add('btn-secondary');
            btnWatch.classList.add('hidden');
            btnPosts.classList.remove('hidden');
        } else {
            btnJoin.textContent = 'Вступить';
            btnJoin.classList.add('btn-primary'); btnJoin.classList.remove('btn-secondary', 'hidden');
            btnWatch.classList.remove('hidden');
            btnPosts.classList.add('hidden');
        }
        document.getElementById('btn-analytics').classList.toggle('hidden', !ch.is_owner);
        document.getElementById('btn-edit-channel').classList.toggle('hidden', !ch.is_owner);
        const btnSup = document.getElementById('btn-support-channel');
        if (btnSup) btnSup.classList.toggle('hidden', !!ch.is_owner);

        // owner row
        const ownerAv = document.getElementById('channel-owner-avatar');
        const ownerName = document.getElementById('channel-owner-name');
        if (ch.owner_username && ownerName) {
            ownerName.textContent = ch.owner_username;
            if (ownerAv) {
                if (typeof setAvatarEl === 'function') setAvatarEl(ownerAv, ch.owner_avatar, ch.owner_username);
                else {
                    if (ch.owner_avatar) {
                        ownerAv.style.backgroundImage = 'url(' + ch.owner_avatar + ')';
                        ownerAv.style.backgroundSize = 'cover';
                        ownerAv.textContent = '';
                    } else {
                        ownerAv.style.backgroundImage = '';
                        ownerAv.textContent = ch.owner_username[0].toUpperCase();
                    }
                }
            }
            const orow = document.getElementById('channel-owner-row');
            if (orow) orow.onclick = () => openUserProfile(ch.owner_id);
        }
    } catch (e) { console.error(e); }
}
document.getElementById('btn-open-posts').onclick = () => openPostsPage(currentChannelId);

document.getElementById('btn-back-channel').onclick = () => { if (NAV_STACK.length) navGoBack(); else { showScreen('screen-home', { push: false }); loadHome(); } };
safeOn('btn-watch', 'click', () => openPostsPage(currentChannelId));
safeOn('btn-join', 'click', async () => {
    const isLeave = document.getElementById('btn-join').textContent === 'Покинуть';
    await fetch('/api/channel/' + currentChannelId + '/' + (isLeave ? 'leave' : 'join'), { method: 'POST' });
    openChannel(currentChannelId);
    loadMySubs();
});

async function openPostsPage(id) {
    currentChannelId = id;
    viewingPosts = true;
    showScreen('screen-posts');
    const res = await fetch('/api/channel/' + id);
    const ch = await res.json();
    document.getElementById('posts-page-title').textContent = ch.name;
    const canPost = ch.is_owner || ch.role === 'admin' || ch.role === 'coauthor';
    document.getElementById('btn-add-post').classList.toggle('hidden', !canPost);
    loadPosts(id);
}
document.getElementById('btn-back-posts').onclick = () => { if (NAV_STACK.length) navGoBack(); else openChannel(currentChannelId); };


document.getElementById('btn-support-channel')?.addEventListener('click', () => {
    document.getElementById('support-amount').value = '';
    document.getElementById('modal-support-channel').classList.remove('hidden');
});
document.getElementById('btn-cancel-support')?.addEventListener('click', () => {
    document.getElementById('modal-support-channel').classList.add('hidden');
});
document.getElementById('btn-send-support')?.addEventListener('click', async () => {
    const amount = parseInt(document.getElementById('support-amount').value, 10);
    if (!amount || amount < 1) return showToast('Ошибка', 'Введите сумму', '!');
    if (!currentChannelId) return;
    const res = await fetch('/api/channel/' + currentChannelId + '/support', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ amount })
    });
    const d = await res.json();
    document.getElementById('modal-support-channel').classList.add('hidden');
    if (d.error) showToast('Ошибка', d.error, '!');
    else {
        showToast('Поддержка', 'Отправлено ' + d.sent + ' ✦', '⚡');
        loadProfile();
    }
});

document.getElementById('btn-channel-menu').onclick = async () => {
    const res = await fetch('/api/channel/' + currentChannelId);
    const ch = await res.json();
    if (ch.is_owner || ch.role === 'admin') openRolesModal();
    else showToast('Меню', 'Доступно владельцу и админам', '!');
};

async function openRolesModal() {
    document.getElementById('modal-roles').classList.remove('hidden');
    document.getElementById('role-picked-id').value = '';
    const lab = document.getElementById('role-picked-label');
    if (lab) lab.textContent = 'Выбрать пользователя';
    const res = await fetch('/api/channel/' + currentChannelId + '/roles');
    const roles = await res.json();
    const list = document.getElementById('roles-list');
    list.innerHTML = '';
    const roleLabels = { owner: 'Владелец', admin: 'Админ', moderator: 'Модератор', coauthor: 'Соавтор' };
    (roles || []).forEach(r => {
        const card = document.createElement('div');
        card.className = 'role-card';
        card.innerHTML = avatarHtml(r.username, r.avatar) +
            '<div class="role-card-info"><h4>' + escapeHtml(r.username) + '</h4>' +
            '<span class="role-badge ' + r.role + '">' + (roleLabels[r.role] || r.role) + '</span></div>';
        card.querySelector('.avatar')?.addEventListener('click', () => openUserProfile(r.user_id));
        card.querySelector('h4')?.addEventListener('click', () => openUserProfile(r.user_id));
        list.appendChild(card);
    });
    if (!(roles || []).length) list.innerHTML = '<div class="empty-state" style="padding:20px">Пока только владелец</div>';
}
document.getElementById('btn-close-roles').onclick = () => document.getElementById('modal-roles').classList.add('hidden');

document.getElementById('btn-pick-role-user')?.addEventListener('click', () => {
    document.getElementById('role-pick-search').value = '';
    document.getElementById('role-pick-list').innerHTML = '<div class="empty-state">Введите логин для поиска</div>';
    document.getElementById('modal-role-pick').classList.remove('hidden');
});
document.getElementById('btn-close-role-pick')?.addEventListener('click', () => {
    document.getElementById('modal-role-pick').classList.add('hidden');
});
document.getElementById('role-pick-search')?.addEventListener('input', async e => {
    const q = e.target.value.trim();
    const list = document.getElementById('role-pick-list');
    if (q.length < 2) { list.innerHTML = '<div class="empty-state">Введите логин для поиска</div>'; return; }
    const res = await fetch('/api/users/search?q=' + encodeURIComponent(q));
    const users = await res.json();
    list.innerHTML = '';
    if (!users.length) { list.innerHTML = '<div class="empty-state">Никого не найдено</div>'; return; }
    users.forEach(u => {
        const card = document.createElement('div');
        card.className = 'role-card';
        card.style.cursor = 'pointer';
        card.innerHTML = avatarHtml(u.username, u.avatar) +
            '<div class="role-card-info"><h4>' + escapeHtml(u.username) + '</h4>' +
            '<span style="font-size:12px;color:var(--muted)">' + escapeHtml(u.status || '') + '</span></div>';
        card.onclick = () => {
            document.getElementById('role-picked-id').value = u.id;
            document.getElementById('role-picked-label').textContent = u.username;
            document.getElementById('modal-role-pick').classList.add('hidden');
        };
        list.appendChild(card);
    });
});


document.getElementById('role-type-grid')?.addEventListener('click', e => {
    const chip = e.target.closest('.role-type-chip');
    if (!chip) return;
    document.querySelectorAll('.role-type-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    const sel = document.getElementById('role-select');
    if (sel) sel.value = chip.dataset.role;
});

document.getElementById('btn-add-role').onclick = async () => {
    const userId = document.getElementById('role-picked-id').value;
    const role = document.getElementById('role-select').value;
    if (!userId) return showToast('Ошибка', 'Выберите пользователя', '!');
    await fetch('/api/channel/' + currentChannelId + '/roles', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ user_id: parseInt(userId), role })
    });
    document.getElementById('role-picked-id').value = '';
    document.getElementById('role-picked-label').textContent = 'Выбрать пользователя';
    showToast('Роль', 'Назначена', '✓');
    openRolesModal();
};

async function loadPosts(channelId) {
    const res = await fetch('/api/channel/' + channelId + '/posts');
    const posts = await res.json();
    const feed = document.getElementById('posts-feed');
    feed.innerHTML = '';
    if (!posts.length) { feed.innerHTML = '<div class="empty-state">Пока нет постов</div>'; return; }
    posts.forEach(p => {
        const card = document.createElement('div');
        card.className = 'channel-card';
        card.style.cssText = 'flex-direction:column;align-items:stretch';
        const pin = p.is_pinned ? '<i class="fa-solid fa-thumbtack" style="color:var(--accent);font-size:12px"></i> ' : '';
        let media = '';
        if (p.media_type === 'photo' && p.media_url) {
            media = '<img class="media-clickable" data-type="photo" data-src="' + p.media_url + '" src="' + p.media_url + '" style="width:100%;border-radius:12px;margin-bottom:10px;max-height:280px;object-fit:cover">';
        }
        if (p.media_type === 'circle' && p.media_url) {
            media = '<div class="post-circle-wrap"><video class="circle-video" src="' + p.media_url + '" playsinline loop muted onclick="this.muted=!this.muted;this.paused?this.play():this.pause()"></video></div>';
        }
        if (p.media_type === 'video' && p.media_url) {
            media = '<video class="media-clickable" data-type="video" data-src="' + p.media_url + '" src="' + p.media_url + '" controls playsinline style="width:100%;border-radius:12px;margin-bottom:10px;max-height:280px;background:#000"></video>';
        }
        const reacts = p.reactions || {};
        const myReact = p.my_reaction || null;
        let pillsHtml = '';
        const entries = Object.entries(reacts);
        if (entries.length) {
            pillsHtml = '<div class="react-pills">' + entries.map(([e, n]) => {
                const mine = (myReact === e) ? ' mine' : '';
                return '<span class="react-pill' + mine + '" data-id="' + p.id + '" data-emoji="' + e + '"><span>' + e + '</span><span class="cnt">' + n + '</span></span>';
            }).join('') + '</div>';
        }
        const authorNick = premiumNickHtml(p.author, p.author_premium);
        const authorHtml = '<span class="post-author-link" data-author-id="' + (p.author_id || '') + '">' + pin + authorNick + '</span>';
        const stripEmojis = ['🔥','❤️','😂','😮','😢','👏','✨','💯','🚀','❤️‍🔥','👍','👎','🤯','🥰','💀'];
        const stripHtml = '<div class="react-strip" data-post-id="' + p.id + '">' +
            stripEmojis.map(e => '<button type="button" class="react-strip-item" data-emoji="' + e + '">' + e + '</button>').join('') +
            '</div>';
        card.innerHTML = '<div style="display:flex;justify-content:space-between;margin-bottom:8px">' + authorHtml + '<span style="font-size:12px;color:var(--muted)">' + p.created_at + '</span></div>' +
            media +
            '<div class="post-text-wrap" data-post-id="' + p.id + '">' + stripHtml +
            '<div style="margin-bottom:10px;white-space:pre-wrap" class="post-text">' + linkifyMentions(p.content) + '</div></div>' +
            '<div style="display:flex;gap:16px;font-size:13px;color:var(--muted);align-items:center;flex-wrap:wrap">' +
            '<span class="like-btn" data-id="' + p.id + '" style="cursor:pointer;' + (p.liked ? 'color:var(--accent)' : '') + '"><i class="fa-solid fa-heart"></i> ' + p.likes + '</span>' +
            '<span class="comment-btn" data-id="' + p.id + '" style="cursor:pointer"><i class="fa-solid fa-comment"></i> ' + (p.comments || 0) + '</span>' +
            '<span class="react-open-btn" data-id="' + p.id + '" style="cursor:pointer;padding:2px 6px;border-radius:10px;background:rgba(139,92,246,0.12)" title="Реакция">😊</span>' +
            '<span><i class="fa-solid fa-eye"></i> ' + p.views + '</span>' +
            '<span class="pin-btn" data-id="' + p.id + '" style="cursor:pointer"><i class="fa-solid fa-thumbtack"></i></span></div>' +
            pillsHtml;
        card.querySelector('.post-author-link')?.addEventListener('click', e => {
            e.stopPropagation();
            if (p.author_id) openUserProfile(p.author_id);
        });
        if (p.can_delete) {
            let lt;
            const startLP = () => { lt = setTimeout(() => {
                window._deletePostId = p.id;
                document.getElementById('modal-delete-post').classList.remove('hidden');
            }, 550); };
            const cancelLP = () => clearTimeout(lt);
            card.addEventListener('touchstart', startLP, { passive: true });
            card.addEventListener('mousedown', startLP);
            card.addEventListener('touchend', cancelLP);
            card.addEventListener('mouseup', cancelLP);
            card.addEventListener('touchmove', cancelLP);
            card.addEventListener('mouseleave', cancelLP);
        }
        feed.appendChild(card);
        enhanceLinkPreviews(card);
    });
    document.querySelectorAll('.react-pill').forEach(pill => {
        pill.onclick = async e => {
            e.stopPropagation();
            await fetch('/api/post/' + pill.dataset.id + '/react', {
                method: 'POST', headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ emoji: pill.dataset.emoji })
            });
            if (currentChannelId && viewingPosts) loadPosts(currentChannelId);
        };
    });
    document.querySelectorAll('.post-text-wrap').forEach(wrap => {
        const strip = wrap.querySelector('.react-strip');
        const text = wrap.querySelector('.post-text');
        if (!text || !strip) return;
        const openStrip = e => {
            e.stopPropagation();
            document.querySelectorAll('.react-strip.open').forEach(s => { if (s !== strip) s.classList.remove('open'); });
            strip.classList.toggle('open');
        };
        text.addEventListener('click', openStrip);
        // long-press support
        let lt = null;
        text.addEventListener('touchstart', () => { lt = setTimeout(() => { strip.classList.add('open'); }, 400); }, { passive: true });
        text.addEventListener('touchend', () => clearTimeout(lt));
        text.addEventListener('touchmove', () => clearTimeout(lt));
        strip.querySelectorAll('.react-strip-item').forEach(btn => {
            btn.onclick = async e => {
                e.stopPropagation();
                await fetch('/api/post/' + wrap.dataset.postId + '/react', {
                    method: 'POST', headers: {'Content-Type':'application/json'},
                    body: JSON.stringify({ emoji: btn.dataset.emoji })
                });
                strip.classList.remove('open');
                if (currentChannelId && viewingPosts) loadPosts(currentChannelId);
            };
        });
    });
    document.querySelectorAll('.react-open-btn').forEach(btn => {
        btn.onclick = e => {
            e.stopPropagation();
            const wrap = document.querySelector('.post-text-wrap[data-post-id="' + btn.dataset.id + '"]');
            const strip = wrap && wrap.querySelector('.react-strip');
            if (!strip) return;
            document.querySelectorAll('.react-strip.open').forEach(s => { if (s !== strip) s.classList.remove('open'); });
            strip.classList.add('open');
            try { strip.scrollLeft = 0; } catch (err) {}
        };
    });
    // close strips on outside tap
    if (!window._reactStripDocBound) {
        window._reactStripDocBound = true;
        document.addEventListener('click', e => {
            if (!e.target.closest('.post-text-wrap') && !e.target.closest('.react-open-btn')) {
                document.querySelectorAll('.react-strip.open').forEach(s => s.classList.remove('open'));
            }
        });
    }
    document.querySelectorAll('.like-btn').forEach(btn => {
        btn.onclick = async e => {
            e.stopPropagation();
            const r = await fetch('/api/post/' + btn.dataset.id + '/like', { method: 'POST' });
            const d = await r.json();
            btn.innerHTML = '<i class="fa-solid fa-heart"></i> ' + d.likes;
            btn.style.color = d.liked ? 'var(--accent)' : '';
        };
    });
    document.querySelectorAll('.comment-btn').forEach(btn => {
        btn.onclick = e => { e.stopPropagation(); openComments(btn.dataset.id); };
    });
    bindMentions(feed);
    document.querySelectorAll('.pin-btn').forEach(btn => {
        btn.onclick = async e => {
            e.stopPropagation();
            await fetch('/api/post/' + btn.dataset.id + '/pin', { method: 'POST' });
            loadPosts(channelId);
        };
    });
    document.querySelectorAll('.media-clickable').forEach(el => {
        el.onclick = e => { e.stopPropagation(); openLightbox(el.dataset.type, el.dataset.src); };
    });
}


document.getElementById('btn-cancel-delete-post')?.addEventListener('click', () => {
    document.getElementById('modal-delete-post').classList.add('hidden');
    window._deletePostId = null;
});
document.getElementById('btn-confirm-delete-post')?.addEventListener('click', async () => {
    const id = window._deletePostId;
    document.getElementById('modal-delete-post').classList.add('hidden');
    if (!id) return;
    await fetch('/api/post/' + id + '/delete', { method: 'POST' });
    window._deletePostId = null;
    if (currentChannelId) loadPosts(currentChannelId);
    showToast('Пост', 'Удалён', '✓');
});

function openReactModal(postId) {
    reactPostId = postId;
    document.getElementById('modal-react').classList.remove('hidden');
}
document.getElementById('btn-close-react').onclick = () => document.getElementById('modal-react').classList.add('hidden');
document.querySelectorAll('.react-pick').forEach(btn => {
    btn.onclick = async () => {
        if (!reactPostId) return;
        await fetch('/api/post/' + reactPostId + '/react', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ emoji: btn.dataset.emoji })
        });
        document.getElementById('modal-react').classList.add('hidden');
        if (currentChannelId && viewingPosts) loadPosts(currentChannelId);
    };
});

function openLightbox(type, src) {
    const img = document.getElementById('lightbox-img');
    const vid = document.getElementById('lightbox-video');
    lbScale = 1;
    img.style.transform = 'scale(1)';
    vid.style.transform = 'scale(1)';
    img.style.display = 'none'; vid.style.display = 'none'; vid.pause();
    if (type === 'video') { vid.src = src; vid.style.display = 'block'; }
    else { img.src = src; img.style.display = 'block'; }
    document.getElementById('media-lightbox').classList.remove('hidden');
}
let lbScale = 1;
document.getElementById('media-lightbox').addEventListener('wheel', e => {
    e.preventDefault();
    lbScale = Math.min(4, Math.max(0.5, lbScale + (e.deltaY > 0 ? -0.15 : 0.15)));
    const t = 'scale(' + lbScale + ')';
    document.getElementById('lightbox-img').style.transform = t;
    document.getElementById('lightbox-video').style.transform = t;
}, { passive: false });
// pinch
let lastPinch = 0;
document.getElementById('media-lightbox').addEventListener('touchmove', e => {
    if (e.touches.length === 2) {
        e.preventDefault();
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        if (lastPinch) {
            lbScale = Math.min(4, Math.max(0.5, lbScale * (d / lastPinch)));
            const t = 'scale(' + lbScale + ')';
            document.getElementById('lightbox-img').style.transform = t;
            document.getElementById('lightbox-video').style.transform = t;
        }
        lastPinch = d;
    }
}, { passive: false });
document.getElementById('media-lightbox').addEventListener('touchend', () => { lastPinch = 0; });

document.getElementById('btn-close-lightbox').onclick = () => {
    document.getElementById('media-lightbox').classList.add('hidden');
    document.getElementById('lightbox-video').pause();
};

document.getElementById('btn-add-post').onclick = () => {
    pendingPostCircleUrl = null;
    const pcv = document.getElementById('post-circle-preview');
    if (pcv) pcv.style.display = 'none';
    document.getElementById('new-post-content').value = '';
    document.getElementById('post-photo-preview').style.display = 'none';
    pendingPostPhoto = null;
    document.getElementById('modal-post').classList.remove('hidden');
};
document.getElementById('btn-cancel-post').onclick = () => document.getElementById('modal-post').classList.add('hidden');
document.getElementById('btn-add-photo').onclick = () => {
    pendingPostCircleUrl = null;
    const pcv = document.getElementById('post-circle-preview');
    if (pcv) pcv.style.display = 'none';
    document.getElementById('post-photo-input').click();
};
document.getElementById('btn-add-video').onclick = () => {
    pendingPostCircleUrl = null;
    const pcv = document.getElementById('post-circle-preview');
    if (pcv) pcv.style.display = 'none';
    document.getElementById('post-video-input').click();
};
document.getElementById('post-photo-input').onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    pendingPostPhoto = file; pendingPostPhoto._type = 'photo';
    document.getElementById('post-photo-img').style.display = 'block';
    document.getElementById('post-photo-img').src = URL.createObjectURL(file);
    document.getElementById('post-photo-preview').style.display = 'block';
};
document.getElementById('post-video-input').onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    pendingPostPhoto = file; pendingPostPhoto._type = 'video';
    document.getElementById('post-photo-preview').style.display = 'block';
    document.getElementById('post-photo-img').style.display = 'none';
};
document.getElementById('btn-confirm-post').onclick = async () => {
    const content = document.getElementById('new-post-content').value.trim();
    if (!content && !pendingPostPhoto && !pendingPostCircleUrl) return;
    let media_url = '', media_type = 'text';
    if (pendingPostCircleUrl) {
        media_url = pendingPostCircleUrl;
        media_type = 'circle';
    } else if (pendingPostPhoto) {
        const fd = new FormData();
        fd.append('file', pendingPostPhoto);
        const up = await fetch('/api/upload', { method: 'POST', body: fd });
        const upData = await up.json();
        if (upData.error) { showToast('Ошибка', upData.error, '!'); return; }
        media_url = upData.url;
        media_type = pendingPostPhoto._type === 'video' ? 'video' : 'photo';
    }
    await fetch('/api/channel/' + currentChannelId + '/post', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ content: content || (media_type === 'circle' ? '⭕' : '📷'), media_type: media_type, media_url: media_url })
    });
    document.getElementById('modal-post').classList.add('hidden');
    pendingPostPhoto = null;
    pendingPostCircleUrl = null;
    const pcv = document.getElementById('post-circle-preview');
    if (pcv) pcv.style.display = 'none';
    loadPosts(currentChannelId);
};

document.getElementById('btn-create-channel').onclick = () => {
    document.getElementById('new-channel-name').value = '';
    document.getElementById('new-channel-desc').value = '';
    pendingChannelAvatar = null;
    const prev = document.getElementById('new-channel-avatar-preview');
    prev.style.backgroundImage = ''; prev.textContent = '+';
    document.getElementById('modal-create').classList.remove('hidden');
};
document.getElementById('btn-cancel-create').onclick = () => document.getElementById('modal-create').classList.add('hidden');
document.getElementById('new-channel-avatar-preview').onclick = () => document.getElementById('new-channel-avatar').click();
document.getElementById('new-channel-avatar').onchange = e => {
    const f = e.target.files[0];
    if (!f) return;
    pendingChannelAvatar = f;
    const prev = document.getElementById('new-channel-avatar-preview');
    prev.style.backgroundImage = 'url(' + URL.createObjectURL(f) + ')';
    prev.style.backgroundSize = 'cover';
    prev.textContent = '';
};
document.getElementById('btn-confirm-create').onclick = async () => {
    const name = document.getElementById('new-channel-name').value.trim();
    const description = document.getElementById('new-channel-desc').value.trim();
    if (!name) return showToast('Ошибка', 'Введите название', '!');
    let avatar = '';
    if (pendingChannelAvatar) {
        const fd = new FormData();
        fd.append('file', pendingChannelAvatar);
        const up = await fetch('/api/upload', { method: 'POST', body: fd });
        const ud = await up.json();
        if (ud.url) avatar = ud.url;
    }
    const res = await fetch('/api/channel/create', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ name: name, description: description, avatar: avatar })
    });
    const data = await res.json();
    if (!res.ok || data.error) {
        showToast('Ошибка', data.error || 'Не удалось создать', '!');
        return;
    }
    document.getElementById('modal-create').classList.add('hidden');
    if (data.id) {
        if (data.cost) showToast('Сообщество', 'Создано за ' + data.cost + ' ✦', '✓');
        else showToast('Сообщество', 'Создано (+3 ✦)', '✓');
        openPostsPage(data.id); loadProfile(); loadMyChannels();
    }
};

let pendingEditChannelAvatar = null;
document.getElementById('btn-edit-channel').onclick = async () => {
    const res = await fetch('/api/channel/' + currentChannelId);
    const ch = await res.json();
    document.getElementById('edit-channel-name').value = ch.name;
    document.getElementById('edit-channel-desc').value = ch.description || '';
    pendingEditChannelAvatar = null;
    const prev = document.getElementById('edit-channel-avatar-preview');
    if (prev) {
        prev.innerHTML = '';
        if (ch.avatar) {
            const img = document.createElement('img');
            img.src = ch.avatar;
            img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:inherit';
            prev.appendChild(img);
        } else {
            prev.textContent = (ch.name || '+')[0].toUpperCase();
        }
    }
    document.getElementById('modal-edit-channel').classList.remove('hidden');
};
document.getElementById('edit-channel-avatar-preview')?.addEventListener('click', () => {
    document.getElementById('edit-channel-avatar')?.click();
});
document.getElementById('edit-channel-avatar')?.addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    pendingEditChannelAvatar = f;
    const prev = document.getElementById('edit-channel-avatar-preview');
    if (prev) {
        prev.innerHTML = '';
        const img = document.createElement('img');
        img.src = URL.createObjectURL(f);
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:inherit';
        prev.appendChild(img);
    }
    e.target.value = '';
});
document.getElementById('btn-cancel-edit-ch').onclick = () => {
    pendingEditChannelAvatar = null;
    document.getElementById('modal-edit-channel').classList.add('hidden');
};
document.getElementById('btn-save-edit-ch').onclick = async () => {
    const name = document.getElementById('edit-channel-name').value.trim();
    const description = document.getElementById('edit-channel-desc').value.trim();
    let avatar = null;
    if (pendingEditChannelAvatar) {
        const fd = new FormData();
        fd.append('file', pendingEditChannelAvatar);
        const up = await fetch('/api/channel/' + currentChannelId + '/avatar', { method: 'POST', body: fd });
        const ud = await up.json();
        if (ud.error) return showToast('Аватар', ud.error, '!');
        avatar = ud.avatar;
        pendingEditChannelAvatar = null;
    }
    const body = { name: name, description: description };
    if (avatar) body.avatar = avatar;
    const res = await fetch('/api/channel/' + currentChannelId + '/update', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify(body)
    });
    const data = await res.json();
    if (data.error) showToast('Ошибка', data.error, '!');
    else {
        document.getElementById('modal-edit-channel').classList.add('hidden');
        showToast('Сохранено', 'Канал обновлён', '✓');
        openChannel(currentChannelId);
        loadMyChannels();
        loadHome();
    }
};

async function loadMyChannels() {
    const res = await fetch('/api/my_channels');
    const channels = await res.json();
    const list = document.getElementById('my-channels-list');
    list.innerHTML = '';
    if (!channels.length) { list.innerHTML = '<div class="empty-state">Нет каналов</div>'; return; }
    channels.forEach(ch => {
        const card = document.createElement('div');
        card.className = 'channel-card';
        const badge = ch.is_boosted ? '<span class="boost-label">' + ch.boost_level + '</span>' : '';
        card.innerHTML = avatarHtml(ch.name, ch.avatar) +
            '<div class="channel-info"><h3>' + escapeHtml(ch.name) + ' ' + badge + '</h3><p>' + ch.subscribers + ' участников</p></div>';
        card.onclick = () => openChannel(ch.id);
        let t = null;
        const start = e => { t = setTimeout(() => {
            window._deleteChannelId = ch.id;
            document.getElementById('modal-delete-channel').classList.remove('hidden');
        }, 550); };
        const cancel = () => clearTimeout(t);
        card.addEventListener('touchstart', start, { passive: true });
        card.addEventListener('touchend', cancel);
        card.addEventListener('touchmove', cancel);
        card.addEventListener('mousedown', start);
        card.addEventListener('mouseup', cancel);
        card.addEventListener('mouseleave', cancel);
        list.appendChild(card);
    });
}
document.getElementById('btn-cancel-delete-channel')?.addEventListener('click', () => {
    document.getElementById('modal-delete-channel').classList.add('hidden');
    window._deleteChannelId = null;
});
document.getElementById('btn-confirm-delete-channel')?.addEventListener('click', async () => {
    const id = window._deleteChannelId;
    document.getElementById('modal-delete-channel').classList.add('hidden');
    if (!id) return;
    const res = await fetch('/api/channel/' + id + '/delete', { method: 'POST' });
    const d = await res.json();
    if (d.error) showToast('Ошибка', d.error, '!');
    else {
        showToast('Канал', 'Удалён', '✓');
        loadMyChannels();
        loadProfile();
        loadHome();
        loadMySubs();
    }
    window._deleteChannelId = null;
    window._deleteChannelName = null;
});

async function loadProfile() {
    const res = await fetch('/api/profile');
    const p = await res.json();
    meIsAdmin = !!p.is_admin;
    setMePlusFromProfile(p);
    applyPlusToProfileHero(p);
    if (p.id) meId = p.id;
    if (p.username) window.__meUsername = p.username;
    if (Array.isArray(p.owned_themes)) loadSavedTheme();
    meUserId = p.id;
    updatePremiumNav();
    const fab = document.getElementById('admin-fab');
    if (fab) {
        if (meIsAdmin) fab.classList.remove('hidden');
        else fab.classList.add('hidden');
    }
    updateAdminSelectBar();
    document.getElementById('profile-status').textContent = p.status || 'Статус не указан';
    document.getElementById('profile-crystals').textContent = p.crystals;
    document.getElementById('profile-friends').textContent = p.hide_friends ? '•' : p.friends;
    setAvatarEl(document.getElementById('profile-avatar'), p.avatar, p.username);
    setProfileBanner(
        document.getElementById('profile-banner'),
        document.getElementById('profile-banner-video'),
        p.banner || '',
        p.banner_type || 'image'
    );
    const sb = document.getElementById('shop-balance');
    if (sb) sb.textContent = p.crystals;
    updateChatsBadge(p.unread_messages || 0);
    const frBadge = document.getElementById('friends-req-badge');
    if (frBadge) {
        const n = p.friend_requests || 0;
        if (n > 0) {
            frBadge.textContent = n > 99 ? '99+' : n;
            frBadge.classList.remove('hidden');
        } else {
            frBadge.classList.add('hidden');
        }
    }
}


// Settings (delegation — never breaks other handlers)
document.addEventListener('click', e => {
    if (e.target.closest('#btn-settings')) {
        document.getElementById('modal-settings')?.classList.remove('hidden');
    }
    if (e.target.closest('#btn-close-settings')) {
        document.getElementById('modal-settings')?.classList.add('hidden');
    }
});
document.getElementById('btn-set-avatar').onclick = () => document.getElementById('avatar-input').click();
document.getElementById('avatar-input').onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/profile/avatar', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.error) showToast('Ошибка', data.error, '!');
    else { showToast('Аватар', 'Обновлён', '✓'); loadProfile(); }
    document.getElementById('modal-settings').classList.add('hidden');
};
document.getElementById('btn-set-banner').onclick = () => document.getElementById('banner-input').click();
document.getElementById('banner-input').onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    const isVideo = (f.type || '').startsWith('video/');
    if (isVideo && !meHasPremiumPlus) {
        showToast('Шапка', 'Видео-шапка только для Premium+', '!');
        e.target.value = '';
        return;
    }
    const fd = new FormData();
    fd.append('file', f);
    try {
        const res = await fetch('/api/profile/banner', { method: 'POST', body: fd });
        const raw = await res.text();
        let d = {};
        try { d = raw ? JSON.parse(raw) : {}; } catch (err) { d = { error: 'Ошибка сервера' }; }
        if (!res.ok || d.error) showToast('Шапка', d.error || 'Не удалось', '!');
        else {
            showToast('Шапка', isVideo ? 'Видео-шапка установлена' : 'Обновлена', '✓');
            loadProfile();
        }
    } catch (err) {
        showToast('Шапка', 'Сеть', '!');
    }
    e.target.value = '';
};
document.getElementById('btn-set-status').onclick = () => {
    document.getElementById('modal-settings').classList.add('hidden');
    document.getElementById('edit-status').value = document.getElementById('profile-status').textContent;
    document.getElementById('modal-status').classList.remove('hidden');
};
document.getElementById('btn-cancel-status').onclick = () => document.getElementById('modal-status').classList.add('hidden');
document.getElementById('btn-save-status').onclick = async () => {
    await fetch('/api/profile/update', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ status: document.getElementById('edit-status').value.trim() })
    });
    document.getElementById('modal-status').classList.add('hidden');
    loadProfile();
};
document.getElementById('btn-set-privacy').onclick = async () => {
    document.getElementById('modal-settings').classList.add('hidden');
    const res = await fetch('/api/profile');
    const p = await res.json();
    document.getElementById('priv-friends').checked = !!p.hide_friends;
    document.getElementById('priv-channels').checked = !!p.hide_channels;
    document.getElementById('modal-privacy').classList.remove('hidden');
};
document.getElementById('btn-close-privacy').onclick = () => document.getElementById('modal-privacy').classList.add('hidden');
document.getElementById('btn-save-privacy').onclick = async () => {
    await fetch('/api/profile/update', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
            hide_friends: document.getElementById('priv-friends').checked,
            hide_channels: document.getElementById('priv-channels').checked
        })
    });
    document.getElementById('modal-privacy').classList.add('hidden');
    showToast('Приватность', 'Сохранено', '✓');
    loadProfile();
};
document.getElementById('btn-daily').onclick = async () => {
    document.getElementById('modal-settings').classList.add('hidden');
    const res = await fetch('/api/daily_bonus', { method: 'POST' });
    const data = await res.json();
    if (data.error) showToast('Бонус', data.error, '⏳');
    else showToast('Бонус дня', '+' + data.bonus + ' ✦', '✦');
    loadProfile();
};
document.getElementById('btn-logout').onclick = () => location.href = '/logout';
document.getElementById('crystals-badge').onclick = () => document.getElementById('btn-daily').click();

document.getElementById('btn-open-friends').onclick = async () => {
    showScreen('screen-friends');
    const list = document.getElementById('friends-page-list');
    list.innerHTML = '';
    const [fr, rq] = await Promise.all([fetch('/api/friends'), fetch('/api/friends/requests')]);
    const friends = await fr.json();
    const reqs = await rq.json();
    if (reqs.length) {
        const t = document.createElement('div');
        t.className = 'section-title';
        t.textContent = 'Входящие заявки';
        list.appendChild(t);
        reqs.forEach(r => {
            const card = document.createElement('div');
            card.className = 'channel-card';
            card.innerHTML = avatarHtml(r.username, r.avatar) +
                '<div class="channel-info"><h3>' + escapeHtml(r.username) + '</h3><p style="font-size:12px;color:var(--muted)">Хочет добавить в друзья</p></div>' +
                '<button class="btn btn-primary btn-sm" title="Принять"><i class="fa-solid fa-check"></i></button>' +
                '<button class="btn btn-secondary btn-sm" title="Отклонить"><i class="fa-solid fa-xmark"></i></button>';
            card.querySelectorAll('button')[0].onclick = async e => { e.stopPropagation(); await respondRequest(r.id, 'accept'); document.getElementById('btn-open-friends').click(); };
            card.querySelectorAll('button')[1].onclick = async e => { e.stopPropagation(); await respondRequest(r.id, 'reject'); document.getElementById('btn-open-friends').click(); };
            card.querySelector('.channel-info').onclick = () => openUserProfile(r.user_id);
            list.appendChild(card);
        });
    }
    const t2 = document.createElement('div');
    t2.className = 'section-title';
    t2.textContent = 'Друзья';
    list.appendChild(t2);
    if (!friends.length) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.textContent = 'Пока нет друзей';
        list.appendChild(empty);
    }
    friends.forEach(f => {
        const card = document.createElement('div');
        card.className = 'channel-card';
        card.innerHTML = avatarHtml(f.username, f.avatar) +
            '<div class="channel-info"><h3>' + escapeHtml(f.username) + '</h3><p style="font-size:12px;color:var(--muted)">' + escapeHtml(f.status||'') + '</p></div>' +
            '<button class="btn btn-primary btn-sm"><i class="fa-solid fa-paper-plane"></i></button>';
        card.querySelector('.channel-info').onclick = () => openUserProfile(f.id);
        const av = card.querySelector('.avatar');
        if (av) av.onclick = () => openUserProfile(f.id);
        card.querySelector('button').onclick = e => { e.stopPropagation(); openChat(f.id, f.username, f.avatar); };
        list.appendChild(card);
    });
};
document.getElementById('btn-back-friends').onclick = () => { if (NAV_STACK.length) navGoBack(); else { showScreen('screen-profile', { push: false }); loadProfile(); } };

document.getElementById('btn-open-subs').onclick = async () => {
    showScreen('screen-subs');
    const res = await fetch('/api/my_subscriptions');
    const subs = await res.json();
    const list = document.getElementById('subs-page-list');
    list.innerHTML = '';
    if (!subs.length) list.innerHTML = '<div class="empty-state">Нет подписок</div>';
    subs.forEach(s => {
        const card = document.createElement('div');
        card.className = 'channel-card';
        card.innerHTML = avatarHtml(s.name, s.avatar) +
            '<div class="channel-info"><h3>' + escapeHtml(s.name) + '</h3><p>' + escapeHtml(s.last_message) + '</p></div>';
        card.onclick = () => openChannel(s.id);
        list.appendChild(card);
    });
};
document.getElementById('btn-back-subs').onclick = () => { if (NAV_STACK.length) navGoBack(); else { showScreen('screen-profile', { push: false }); loadProfile(); } };

async function openUserProfile(userId) {
    showScreen('screen-user');
    const res = await fetch('/api/user/' + userId);
    const u = await res.json();
    window._viewUserId = u.id;

    // Clean legacy wrappers
    const uav = document.getElementById('user-avatar');
    if (uav && uav.parentElement && uav.parentElement.classList.contains('avatar-hero-wrap')) {
        const wrap = uav.parentElement;
        wrap.parentNode.insertBefore(uav, wrap);
        wrap.remove();
    }

    setAvatarEl(uav, u.avatar || null, u.username);
    setProfileBanner(
        document.getElementById('user-banner'),
        document.getElementById('user-banner-video'),
        u.banner || '',
        u.banner_type || 'image'
    );

    applyPlusToProfileHero(u, {
        heroId: 'user-hero',
        avId: 'user-avatar',
        bannerId: 'user-banner',
        nameId: 'user-username',
        badgeId: 'user-plus-badge',
        underId: 'user-banner-fx'
    });

    document.getElementById('user-status').textContent = u.status || '';
    document.getElementById('user-friends').textContent = u.friends_count === null ? '•' : (u.friends_count ?? 0);
    document.getElementById('user-channels').textContent = u.channels_count === null ? '•' : (u.channels_count ?? 0);

    const fb = document.getElementById('btn-user-friend');
    const mb = document.getElementById('btn-user-message');
    if (u.is_me) {
        fb.style.display = 'none';
        mb.style.display = 'none';
    } else {
        fb.style.display = '';
        mb.style.display = '';
        if (u.friendship === 'accepted') fb.textContent = 'Друг';
        else if (u.friendship === 'pending') fb.textContent = 'Запрос отправлен';
        else fb.textContent = 'Добавить';
        fb.onclick = async () => {
            if (u.friendship !== 'none') return;
            await sendFriendRequest(u.id);
            openUserProfile(userId);
        };
        mb.onclick = () => openChat(u.id, u.username, u.avatar);
    }
}

document.getElementById('btn-user-friends-list')?.addEventListener('click', async () => {
    const title = document.getElementById('user-username').textContent.replace(' 💎','');
    // fetch by scanning - we need user id stored
    if (!window._viewUserId) return;
    const res = await fetch('/api/user/' + window._viewUserId + '/friends');
    const data = await res.json();
    if (data.error) return showToast('Приватность', data.error, '!');
    const friends = data.friends || data;
    showScreen('screen-friends');
    document.querySelector('#screen-friends h1').textContent = 'Друзья';
    const list = document.getElementById('friends-page-list');
    list.innerHTML = '';
    const arr = Array.isArray(friends) ? friends : [];
    if (!arr.length) list.innerHTML = '<div class="empty-state">Пусто или скрыто</div>';
    arr.forEach(f => {
        const card = document.createElement('div');
        card.className = 'channel-card';
        card.innerHTML = avatarHtml(f.username, f.avatar) +
            '<div class="channel-info"><h3>' + escapeHtml(f.username) + '</h3></div>';
        card.onclick = () => openUserProfile(f.id);
        list.appendChild(card);
    });
});
document.getElementById('btn-user-channels-list')?.addEventListener('click', async () => {
    if (!window._viewUserId) return;
    const res = await fetch('/api/user/' + window._viewUserId + '/channels');
    const data = await res.json();
    if (data.error) return showToast('Приватность', data.error, '!');
    const channels = data.channels || data;
    showScreen('screen-subs');
    document.querySelector('#screen-subs h1').textContent = 'Подписки';
    const list = document.getElementById('subs-page-list');
    list.innerHTML = '';
    const arr = Array.isArray(channels) ? channels : [];
    if (!arr.length) list.innerHTML = '<div class="empty-state">Пусто или скрыто</div>';
    arr.forEach(ch => {
        const card = document.createElement('div');
        card.className = 'channel-card';
        card.innerHTML = avatarHtml(ch.name, ch.avatar) +
            '<div class="channel-info"><h3>' + escapeHtml(ch.name) + '</h3></div>';
        card.onclick = () => openChannel(ch.id);
        list.appendChild(card);
    });
});

document.getElementById('btn-back-user').onclick = () => { if (NAV_STACK.length) navGoBack(); else showScreen('screen-chats', { push: false }); };


async function refreshExclusiveShopUI() {
    try {
        const res = await fetch('/api/shop/exclusive-themes');
        const data = await res.json();
        if (Array.isArray(data.owned_themes)) meOwnedThemes = data.owned_themes;
        const bal = document.getElementById('shop-balance');
        if (bal && data.crystals != null) bal.textContent = data.crystals;
        document.querySelectorAll('.btn-buy-xtheme').forEach(btn => {
            const key = btn.dataset.theme;
            if (meOwnedThemes.includes(key)) {
                btn.textContent = 'Куплено';
                btn.classList.add('owned');
                btn.disabled = true;
            } else {
                const price = btn.dataset.price || (THEME_PALETTES[key] && THEME_PALETTES[key].price) || 500;
                btn.textContent = price + ' ✦';
                btn.classList.remove('owned');
                btn.disabled = false;
            }
        });
    } catch (e) {}
}

document.addEventListener('click', async e => {
    const btn = e.target.closest('.btn-buy-xtheme');
    if (!btn || btn.disabled) return;
    const theme = btn.dataset.theme;
    if (!theme) return;
    btn.disabled = true;
    try {
        const res = await fetch('/api/shop/exclusive-theme', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ theme })
        });
        let d = {};
        try { d = await res.json(); } catch (e) { d = { error: 'Сервер вернул не JSON (' + res.status + ')' }; }
        if (!res.ok || d.error) {
            showToast('Магазин', d.error || ('Ошибка ' + res.status), '!');
            btn.disabled = false;
            return;
        }
        meOwnedThemes = d.owned_themes || meOwnedThemes;
        const bal = document.getElementById('shop-balance');
        if (bal && d.crystals != null) bal.textContent = d.crystals;
        showToast('Супер-тема', 'Куплено навсегда!', '✦');
        refreshExclusiveShopUI();
        // auto-apply
        if (THEME_PALETTES[theme]) {
            localStorage.setItem('sklews_theme', theme);
            applyThemeVars(THEME_PALETTES[theme], theme);
            _themeDraft = theme;
        }
    } catch (err) {
        showToast('Ошибка', 'Сеть: ' + (err && err.message ? err.message : 'не удалось купить'), '!');
        btn.disabled = false;
    }
});

async function loadShop() {
    refreshExclusiveShopUI();
    await loadProfile();
    const res = await fetch('/api/my_channels');
    const channels = await res.json();
    const sel = document.getElementById('shop-channel-select');
    sel.innerHTML = '';
    if (!channels.length) sel.innerHTML = '<option value="">Нет каналов</option>';
    else channels.forEach(ch => {
        const o = document.createElement('option');
        o.value = ch.id;
        o.textContent = ch.name + (ch.is_boosted ? ' (буст)' : '');
        sel.appendChild(o);
    });
}
document.querySelectorAll('.btn-boost').forEach(btn => {
    btn.onclick = async () => {
        const channelId = parseInt(document.getElementById('shop-channel-select').value);
        if (!channelId) return showToast('Ошибка', 'Создайте канал', '!');
        const res = await fetch('/api/shop/boost', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ channel_id: channelId, level: btn.dataset.level })
        });
        const data = await res.json();
        if (data.error) showToast('Ошибка', data.error, '!');
        else { showToast('Буст', 'До ' + data.boost_until, '🚀'); loadShop(); }
    };
});
document.getElementById('btn-buy-premium').onclick = async () => {
    const res = await fetch('/api/shop/premium', { method: 'POST' });
    const data = await res.json();
    if (data.error) showToast('Ошибка', data.error, '!');
    else { showToast('Премиум', '30 дней', '💎'); loadProfile(); }
};

async function loadAnalyticsTab() {
    document.getElementById('analytics-list').classList.remove('hidden');
    document.getElementById('analytics-detail').classList.add('hidden');
    const list = document.getElementById('analytics-list');
    list.innerHTML = '<div class="empty-state">Загрузка...</div>';
    const res = await fetch('/api/analytics/overview');
    const channels = await res.json();
    if (!channels.length) { list.innerHTML = '<div class="empty-state">Нет каналов</div>'; return; }
    list.innerHTML = '';
    channels.forEach(ch => {
        const card = document.createElement('div');
        card.className = 'channel-card';
        card.style.cssText = 'flex-direction:column;align-items:stretch;cursor:pointer';
        card.innerHTML = '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">' +
            avatarHtml(ch.name, ch.avatar) +
            '<div class="channel-info"><h3>' + escapeHtml(ch.name) + '</h3></div>' +
            '<i class="fa-solid fa-chevron-right" style="color:var(--muted)"></i></div>' +
            '<div class="profile-stats" style="margin:0">' +
            '<div><span>' + ch.subscribers + '</span>подп.</div>' +
            '<div><span>' + ch.posts + '</span>посты</div>' +
            '<div><span>' + ch.likes + '</span>лайки</div>' +
            '<div><span>' + ch.views + '</span>просм.</div></div>';
        card.onclick = () => openAnalyticsDetail(ch.id, ch.name);
        list.appendChild(card);
    });
}
async function openAnalyticsDetail(channelId, name) {
    anChannelId = channelId;
    document.getElementById('analytics-list').classList.add('hidden');
    document.getElementById('analytics-detail').classList.remove('hidden');
    document.getElementById('an-channel-name').textContent = name;
    loadAnPeriod('24h');
}
document.getElementById('btn-an-back').onclick = () => loadAnalyticsTab();
document.querySelectorAll('#an-periods .filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('#an-periods .filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        loadAnPeriod(btn.dataset.period);
    });
});
async function loadAnPeriod(period) {
    if (!anChannelId) return;
    const res = await fetch('/api/channel/' + anChannelId + '/analytics/detailed?period=' + period);
    const d = await res.json();
    if (d.error) return;
    const ctx = document.getElementById('an-chart');
    if (anChart) anChart.destroy();
    anChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: d.labels,
            datasets: [
                { label: 'Лайки', data: d.likes, borderColor: '#8b5cf6', tension: 0.3, fill: false },
                { label: 'Просмотры', data: d.views, borderColor: '#a89bc4', tension: 0.3, fill: false },
                { label: 'Посты', data: d.posts, borderColor: '#10b981', tension: 0.3, fill: false }
            ]
        },
        options: {
            responsive: true,
            plugins: { legend: { labels: { color: '#a89bc4' } } },
            scales: {
                x: { ticks: { color: '#a89bc4' }, grid: { color: 'rgba(46,38,69,0.5)' } },
                y: { ticks: { color: '#a89bc4' }, grid: { color: 'rgba(46,38,69,0.5)' } }
            }
        }
    });
    document.getElementById('an-summary').innerHTML = '<div class="profile-card" style="margin:0"><div class="profile-stats">' +
        '<div><span>' + d.subscribers + '</span>подп.</div>' +
        '<div><span>' + d.total_posts + '</span>посты</div>' +
        '<div><span>' + d.total_likes + '</span>лайки</div>' +
        '<div><span>' + d.total_views + '</span>просм.</div></div></div>';
}
document.getElementById('btn-analytics').onclick = () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.nav-btn[data-tab="analytics"]')?.classList.add('active');
    showScreen('screen-analytics');
    loadAnalyticsTab();
};

let pendingCommentPhoto = null;

async function openComments(postId) {
    currentCommentPostId = postId;
    pendingCommentPhoto = null;
    const prev = document.getElementById('comment-photo-preview');
    if (prev) prev.style.display = 'none';
    document.getElementById('modal-comments').classList.remove('hidden');
    const res = await fetch('/api/post/' + postId + '/comments');
    const comments = await res.json();
    const list = document.getElementById('comments-list');
    list.innerHTML = comments.length ? '' : '<div class="empty-state">Нет комментариев</div>';
    comments.forEach(c => {
        const av = c.avatar
            ? avatarHtml(c.username, c.avatar, 'avatar comment-av')
            : '<div class="avatar comment-av">' + (c.username ? c.username[0].toUpperCase() : '?') + '</div>';
        let media = '';
        if (c.media_url && c.media_type === 'photo') {
            media = '<img class="comment-photo media-clickable" data-type="photo" data-src="' + c.media_url + '" src="' + c.media_url + '" style="max-width:160px;border-radius:10px;margin-top:6px;display:block">';
        }
        const text = (c.content && c.content !== '📷') ? '<div class="comment-text">' + linkifyMentions(c.content) + '</div>' : '';
        const row = document.createElement('div');
        row.className = 'comment-row';
        row.dataset.cid = c.id;
        row.innerHTML = av +
            '<div class="comment-body">' +
            '<div class="comment-nick" data-uid="' + c.user_id + '">@' + escapeHtml(c.username) + '</div>' +
            text + media +
            '<div class="comment-time">' + c.created_at + '</div></div>';
        row.querySelector('.comment-nick').onclick = () => openUserProfile(c.user_id);
        row.querySelector('.comment-av')?.addEventListener('click', () => openUserProfile(c.user_id));
        row.querySelectorAll('.media-clickable').forEach(el => {
            el.onclick = e => { e.stopPropagation(); openLightbox(el.dataset.type, el.dataset.src); };
        });
        if (c.can_delete) {
            let timer = null;
            const start = (e) => { timer = setTimeout(() => {
                window._deleteComment = { postId: postId, commentId: c.id };
                document.getElementById('modal-delete-comment').classList.remove('hidden');
            }, 550); };
            const cancel = () => clearTimeout(timer);
            row.addEventListener('touchstart', start, { passive: true });
            row.addEventListener('touchend', cancel);
            row.addEventListener('touchmove', cancel);
            row.addEventListener('mousedown', start);
            row.addEventListener('mouseup', cancel);
            row.addEventListener('mouseleave', cancel);
        }
        list.appendChild(row);
    });
}

document.getElementById('btn-cancel-delete-comment')?.addEventListener('click', () => {
    document.getElementById('modal-delete-comment').classList.add('hidden');
    window._deleteComment = null;
});
document.getElementById('btn-confirm-delete-comment')?.addEventListener('click', async () => {
    const d = window._deleteComment;
    document.getElementById('modal-delete-comment').classList.add('hidden');
    if (!d) return;
    await fetch('/api/post/' + d.postId + '/comments/' + d.commentId, { method: 'DELETE' });
    window._deleteComment = null;
    openComments(d.postId);
    if (currentChannelId && viewingPosts) loadPosts(currentChannelId);
});

document.getElementById('btn-close-comments').onclick = () => document.getElementById('modal-comments').classList.add('hidden');
document.getElementById('btn-comment-photo')?.addEventListener('click', () => document.getElementById('comment-photo-input').click());
document.getElementById('comment-photo-input')?.addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    pendingCommentPhoto = f;
    const img = document.getElementById('comment-photo-img');
    const prev = document.getElementById('comment-photo-preview');
    img.src = URL.createObjectURL(f);
    prev.style.display = 'block';
    e.target.value = '';
});
document.getElementById('btn-clear-comment-photo')?.addEventListener('click', () => {
    pendingCommentPhoto = null;
    document.getElementById('comment-photo-preview').style.display = 'none';
});
document.getElementById('btn-send-comment').onclick = async () => {
    const content = document.getElementById('comment-input').value.trim();
    if ((!content && !pendingCommentPhoto) || !currentCommentPostId) return;
    let media_url = '', media_type = '';
    if (pendingCommentPhoto) {
        const fd = new FormData();
        fd.append('file', pendingCommentPhoto);
        const up = await fetch('/api/upload', { method: 'POST', body: fd });
        const ud = await up.json();
        if (ud.error) return showToast('Ошибка', ud.error, '!');
        media_url = ud.url;
        media_type = 'photo';
    }
    const cres = await fetch('/api/post/' + currentCommentPostId + '/comments', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ content: content || '📷', media_url, media_type })
    });
    const cdata = await cres.json().catch(() => ({}));
    if (!cres.ok || cdata.error) {
        showToast('Комментарий', cdata.error || 'Ошибка', '!');
        return;
    }
    document.getElementById('comment-input').value = '';
    pendingCommentPhoto = null;
    document.getElementById('comment-photo-preview').style.display = 'none';
    openComments(currentCommentPostId);
    if (currentChannelId && viewingPosts) loadPosts(currentChannelId);
};

document.getElementById('search-users').addEventListener('input', e => {
    const q = e.target.value.trim();
    if (q.length >= 2) searchUsers(q);
    else document.getElementById('search-results').innerHTML = '';
});
async function searchUsers(q) {
    const feed = document.getElementById('search-results');
    const res = await fetch('/api/users/search?q=' + encodeURIComponent(q));
    const users = await res.json();
    feed.innerHTML = '';
    if (!users.length) { feed.innerHTML = '<div class="empty-state">Никого не найдено</div>'; return; }
    users.forEach(u => {
        const card = document.createElement('div');
        card.className = 'channel-card';
        let btn = '';
        if (u.friendship === 'none') btn = '<button class="btn btn-primary btn-sm"><i class="fa-solid fa-user-plus"></i></button>';
        else if (u.friendship === 'pending') btn = '<span class="muted" style="font-size:12px">Запрос</span>';
        else btn = '<button class="btn btn-primary btn-sm"><i class="fa-solid fa-paper-plane"></i></button>';
        card.innerHTML = avatarHtml(u.username, u.avatar) +
            '<div class="channel-info"><h3>' + premiumNickHtml(u.username, u.is_premium) + '</h3>' +
            '<p style="font-size:12px;color:var(--muted)">' + escapeHtml(u.status||'') + '</p></div>' + btn;
        card.querySelector('.channel-info').onclick = () => openUserProfile(u.id);
        const b = card.querySelector('button');
        if (b) {
            if (u.friendship === 'none') b.onclick = e => { e.stopPropagation(); sendFriendRequest(u.id); };
            else if (u.friendship === 'accepted') b.onclick = e => { e.stopPropagation(); openChat(u.id, u.username, u.avatar); };
        }
        feed.appendChild(card);
    });
}
async function sendFriendRequest(userId) {
    await fetch('/api/friends/request', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ user_id: userId })
    });
    const q = document.getElementById('search-users').value.trim();
    if (q) searchUsers(q);
}
async function loadFriendsAndRequests() {
    const feed = document.getElementById('search-results');
    const [fr, rq] = await Promise.all([fetch('/api/friends'), fetch('/api/friends/requests')]);
    const friends = await fr.json();
    const reqs = await rq.json();
    feed.innerHTML = '';
    if (reqs.length) {
        const t = document.createElement('div');
        t.className = 'section-title';
        t.textContent = 'Заявки';
        feed.appendChild(t);
        reqs.forEach(r => {
            const card = document.createElement('div');
            card.className = 'channel-card';
            card.innerHTML = avatarHtml(r.username) +
                '<div class="channel-info"><h3>' + escapeHtml(r.username) + '</h3></div>' +
                '<button class="btn btn-primary btn-sm"><i class="fa-solid fa-check"></i></button>' +
                '<button class="btn btn-secondary btn-sm"><i class="fa-solid fa-xmark"></i></button>';
            card.querySelectorAll('button')[0].onclick = () => respondRequest(r.id, 'accept');
            card.querySelectorAll('button')[1].onclick = () => respondRequest(r.id, 'reject');
            feed.appendChild(card);
        });
    }
    if (friends.length) {
        const t = document.createElement('div');
        t.className = 'section-title';
        t.textContent = 'Друзья';
        feed.appendChild(t);
        friends.forEach(f => {
            const card = document.createElement('div');
            card.className = 'channel-card';
            card.innerHTML = avatarHtml(f.username, f.avatar) +
                '<div class="channel-info"><h3>' + escapeHtml(f.username) + '</h3></div>' +
                '<button class="btn btn-primary btn-sm"><i class="fa-solid fa-paper-plane"></i></button>';
            card.querySelector('.channel-info').onclick = () => openUserProfile(f.id);
            card.querySelector('button').onclick = e => { e.stopPropagation(); openChat(f.id, f.username, f.avatar); };
            feed.appendChild(card);
        });
    }
    if (!reqs.length && !friends.length) feed.innerHTML = '<div class="empty-state">Поиск друзей выше</div>';
}
async function respondRequest(id, action) {
    await fetch('/api/friends/respond', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ request_id: id, action: action })
    });
    loadFriendsAndRequests();
}

function openChat(userId, username, avatar, lastSeen) {
    currentChatUserId = userId;
    isSuperMode = false;
    document.getElementById('chat-title').textContent = username;
    const peerAv = document.getElementById('chat-peer-avatar');
    if (avatar) {
        peerAv.style.backgroundImage = 'url(' + avatar + ')';
        peerAv.style.backgroundSize = 'cover';
        peerAv.textContent = '';
    } else {
        peerAv.style.backgroundImage = '';
        peerAv.textContent = username ? username[0].toUpperCase() : '?';
    }
    const st = document.getElementById('chat-peer-status');
    if (st) st.textContent = lastSeen || 'недавно';
    document.getElementById('chat-peer').onclick = () => openUserProfile(userId);
    showScreen('screen-chat');
    loadMessages(userId);
    // refresh last_seen from API
    fetch('/api/user/' + userId).then(r => r.json()).then(u => {
        if (u.last_seen && document.getElementById('chat-peer-status')) {
            document.getElementById('chat-peer-status').textContent = u.last_seen;
        }
    }).catch(() => {});
}
document.getElementById('btn-back-chat').onclick = () => {
    if (NAV_STACK.length) { navGoBack(); return; }
    showScreen('screen-chats', { push: false });
    currentChatUserId = null;
    loadChatsList();
    loadProfile();
};

function updateChatsBadge(n) {
    const badge = document.getElementById('nav-chats-badge');
    if (!badge) return;
    if (n > 0) {
        badge.textContent = n > 99 ? '99+' : n;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

async function loadChatsList() {
    const list = document.getElementById('chats-list');
    if (!list) return;
    const res = await fetch('/api/friends');
    const friends = await res.json();
    list.innerHTML = '';
    let totalUnread = 0;
    const withMsgs = friends.filter(f => f.last_message || f.unread > 0);
    if (!withMsgs.length) {
        list.innerHTML = '<div class="empty-state">Нет диалогов</div>';
    }
    withMsgs.forEach(f => {
        totalUnread += (f.unread || 0);
        const card = document.createElement('div');
        card.className = 'channel-card chat-dialog-card';
        const unreadBadge = f.unread > 0 ? '<div class="badge-unread">' + f.unread + '</div>' : '';
        card.innerHTML = avatarHtml(f.username, f.avatar) +
            '<div class="channel-info"><h3>' + escapeHtml(f.username) + '</h3>' +
            '<p style="font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
            escapeHtml(f.last_message || 'Нет сообщений') + '</p></div>' +
            '<div class="chat-meta"><span class="chat-time">' + (f.last_time || '') + '</span>' + unreadBadge + '</div>';
        card.onclick = () => openChat(f.id, f.username, f.avatar, f.last_seen);
        let t = null;
        const start = e => { t = setTimeout(() => {
            window._deleteChatPeer = { id: f.id, username: f.username };
            document.getElementById('delete-chat-name').textContent = f.username;
            document.getElementById('modal-delete-chat').classList.remove('hidden');
        }, 550); };
        const cancel = () => clearTimeout(t);
        card.addEventListener('touchstart', start, { passive: true });
        card.addEventListener('touchend', cancel);
        card.addEventListener('touchmove', cancel);
        card.addEventListener('mousedown', start);
        card.addEventListener('mouseup', cancel);
        card.addEventListener('mouseleave', cancel);
        list.appendChild(card);
    });
    updateChatsBadge(totalUnread);
}
document.getElementById('btn-cancel-delete-chat')?.addEventListener('click', () => {
    document.getElementById('modal-delete-chat').classList.add('hidden');
    window._deleteChatPeer = null;
});
async function doDeleteChat(mode) {
    const p = window._deleteChatPeer;
    document.getElementById('modal-delete-chat').classList.add('hidden');
    if (!p) return;
    await fetch('/api/messages/' + p.id + '/delete', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ mode })
    });
    window._deleteChatPeer = null;
    if (currentChatUserId === p.id) {
        showScreen('screen-chats');
        currentChatUserId = null;
    }
    loadChatsList();
    showToast('Чат', mode === 'both' ? 'Удалён у обоих' : 'Удалён у вас', '✓');
}
document.getElementById('btn-delete-chat-me')?.addEventListener('click', () => doDeleteChat('me'));
document.getElementById('btn-delete-chat-both')?.addEventListener('click', () => doDeleteChat('both'));

function formatMessage(content, isSuper) {
    let body = content || '';
    if (body.startsWith('[photo]')) body = '<img class="media-clickable" data-type="photo" data-src="' + body.slice(7) + '" src="' + body.slice(7) + '" style="max-width:220px;border-radius:12px">';
    else if (body.startsWith('[circle]')) body = '<video class="circle-video" src="' + body.slice(8) + '" playsinline loop muted onclick="this.muted=!this.muted;this.paused?this.play():this.pause()"></video>';
    else if (body.startsWith('[video]')) body = '<video src="' + body.slice(7) + '" controls playsinline style="max-width:220px;border-radius:12px"></video>';
    else if (body.startsWith('[voice]')) {
        const src = body.slice(7);
        const bars = Array.from({length:12}, (_,i) => {
            const h = 5 + ((i * 9) % 14);
            return '<i style="display:inline-block;width:2px;height:' + h + 'px;margin:0 1px;border-radius:1px;background:rgba(255,255,255,0.8);vertical-align:middle"></i>';
        }).join('');
        body = '<div class="voice-msg" data-src="' + src + '" style="display:flex;align-items:center;gap:8px;min-width:140px;max-width:180px;padding:2px 0">' +
            '<button type="button" class="voice-msg-play" style="width:28px;height:28px;border-radius:50%;border:none;background:rgba(0,0,0,0.28);color:#fff;flex-shrink:0;cursor:pointer;font-size:11px"><i class="fa-solid fa-play"></i></button>' +
            '<div class="voice-msg-wave" style="flex:1;display:flex;align-items:center;height:22px">' + bars + '</div>' +
            '<span class="voice-msg-dur" style="font-size:11px;opacity:0.9;min-width:28px">🎙</span>' +
            '<audio preload="metadata" src="' + src + '" style="display:none"></audio></div>';
    }
    else body = linkifyMentions(body);
    return (isSuper ? '<span style="font-size:11px;opacity:.85"><i class="fa-solid fa-bolt"></i> SUPER</span><br>' : '') + body;
}

function bindMsgLongPress(div, msgId) {
    let t = null;
    const start = () => { t = setTimeout(() => {
        window._deleteMsgId = msgId;
        document.getElementById('modal-delete-message').classList.remove('hidden');
    }, 550); };
    const cancel = () => clearTimeout(t);
    div.addEventListener('touchstart', start, { passive: true });
    div.addEventListener('touchend', cancel);
    div.addEventListener('touchmove', cancel);
    div.addEventListener('mousedown', start);
    div.addEventListener('mouseup', cancel);
    div.addEventListener('mouseleave', cancel);
}

async function loadMessages(userId) {
    const res = await fetch('/api/messages/' + userId);
    const messages = await res.json();
    const box = document.getElementById('messages');
    box.innerHTML = '';
    messages.forEach(m => {
        const div = document.createElement('div');
        div.className = 'message ' + (m.is_mine ? 'mine' : 'theirs') + (m.is_super ? ' super' : '') + (m.is_mine && mePlus.plus_msg_style ? ' plus-msg-' + mePlus.plus_msg_style : '');
        div.dataset.msgId = m.id;
        div.innerHTML = '<div class="msg-bubble">' + formatMessage(m.content, m.is_super) +
            '<div class="msg-time">' + (m.created_at || '') + (m.is_mine && m.is_read ? ' ✓✓' : (m.is_mine ? ' ✓' : '')) + '</div></div>';
        bindMsgLongPress(div, m.id);
        box.appendChild(div);
    });
    box.querySelectorAll('.media-clickable').forEach(el => {
        el.onclick = () => openLightbox(el.dataset.type, el.dataset.src);
    });
    bindMentions(box);
    bindVoicePlayers(box);
    enhanceLinkPreviews(box);
    box.scrollTop = box.scrollHeight;
}

document.getElementById('btn-cancel-delete-msg')?.addEventListener('click', () => {
    document.getElementById('modal-delete-message').classList.add('hidden');
    window._deleteMsgId = null;
});
async function doDeleteMessage(mode) {
    const id = window._deleteMsgId;
    document.getElementById('modal-delete-message').classList.add('hidden');
    if (!id) return;
    await fetch('/api/message/' + id + '/delete', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ mode })
    });
    window._deleteMsgId = null;
    if (currentChatUserId) loadMessages(currentChatUserId);
}
document.getElementById('btn-delete-msg-me')?.addEventListener('click', () => doDeleteMessage('me'));
document.getElementById('btn-delete-msg-both')?.addEventListener('click', () => doDeleteMessage('both'));

document.getElementById('btn-send').onclick = sendMessage;
document.getElementById('message-input').addEventListener('keypress', e => {
    if (e.key === 'Enter') { e.preventDefault(); sendMessage(); }
});
function sendMessage() {
    const input = document.getElementById('message-input');
    const content = input.value.trim();
    if (!content || !currentChatUserId) return;
    socket.emit('send_message', { receiver_id: currentChatUserId, content: content, is_super: isSuperMode });
    input.value = '';
    isSuperMode = false;
}
document.getElementById('btn-attach').onclick = () => document.getElementById('chat-file').click();
document.getElementById('chat-file').onchange = async e => {
    const file = e.target.files[0];
    if (!file || !currentChatUserId) return;
    const fd = new FormData();
    fd.append('file', file);
    const up = await fetch('/api/upload', { method: 'POST', body: fd });
    const ud = await up.json();
    if (ud.error) return showToast('Ошибка', ud.error, '!');
    const content = file.type.startsWith('video') ? '[video]' + ud.url : '[photo]' + ud.url;
    socket.emit('send_message', { receiver_id: currentChatUserId, content: content, is_super: false });
    e.target.value = '';
};
let mediaRecorder = null, voiceChunks = [], voiceStream = null, voiceTimer = null, voiceSecs = 0, voiceCancelled = false;

function formatVoiceTime(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m + ':' + String(sec).padStart(2, '0');
}
function showVoiceBar(on) {
    const bar = document.getElementById('voice-rec-bar');
    const input = document.querySelector('.chat-input-area');
    if (!bar) return;
    if (on) {
        bar.classList.remove('hidden');
        if (input) input.style.display = 'none';
        document.getElementById('voice-rec-timer').textContent = '0:00';
    } else {
        bar.classList.add('hidden');
        if (input) input.style.display = '';
        document.getElementById('btn-voice')?.classList.remove('active');
    }
}
function stopVoiceRecording(send) {
    voiceCancelled = !send;
    if (voiceTimer) { clearInterval(voiceTimer); voiceTimer = null; }
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        try { mediaRecorder.stop(); } catch (e) {}
    } else {
        if (voiceStream) voiceStream.getTracks().forEach(t => t.stop());
        voiceStream = null;
        showVoiceBar(false);
    }
}
async function startVoiceRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') return;
    try {
        voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' :
                     MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
        mediaRecorder = new MediaRecorder(voiceStream, mime ? { mimeType: mime } : undefined);
        voiceChunks = [];
        voiceSecs = 0;
        voiceCancelled = false;
        mediaRecorder.ondataavailable = e => { if (e.data && e.data.size) voiceChunks.push(e.data); };
        mediaRecorder.onstop = async () => {
            if (voiceStream) voiceStream.getTracks().forEach(t => t.stop());
            voiceStream = null;
            showVoiceBar(false);
            if (voiceCancelled || !voiceChunks.length || voiceSecs < 1) return;
            const blob = new Blob(voiceChunks, { type: 'audio/webm' });
            const fd = new FormData();
            fd.append('file', blob, 'voice.webm');
            const up = await fetch('/api/upload', { method: 'POST', body: fd });
            const ud = await up.json();
            if (ud.url && currentChatUserId) {
                socket.emit('send_message', { receiver_id: currentChatUserId, content: '[voice]' + ud.url, is_super: false });
            } else if (ud.error) showToast('Ошибка', ud.error, '!');
        };
        mediaRecorder.start(200);
        document.getElementById('btn-voice')?.classList.add('active');
        showVoiceBar(true);
        voiceTimer = setInterval(() => {
            voiceSecs++;
            const el = document.getElementById('voice-rec-timer');
            if (el) el.textContent = formatVoiceTime(voiceSecs);
            if (voiceSecs >= 120) stopVoiceRecording(true);
        }, 1000);
    } catch (err) {
        showToast('Ошибка', 'Нет доступа к микрофону', '!');
    }
}
document.getElementById('btn-voice').onclick = () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') stopVoiceRecording(true);
    else startVoiceRecording();
};
document.getElementById('btn-voice-stop')?.addEventListener('click', () => stopVoiceRecording(true));
document.getElementById('btn-voice-cancel')?.addEventListener('click', () => stopVoiceRecording(false));

function bindVoicePlayers(root) {
    (root || document).querySelectorAll('.voice-msg').forEach(wrap => {
        if (wrap.dataset.bound) return;
        wrap.dataset.bound = '1';
        const audio = wrap.querySelector('audio');
        const btn = wrap.querySelector('.voice-msg-play');
        const dur = wrap.querySelector('.voice-msg-dur');
        if (!audio || !btn) return;
        audio.addEventListener('loadedmetadata', () => {
            if (dur && isFinite(audio.duration)) dur.textContent = formatVoiceTime(Math.round(audio.duration));
        });
        audio.addEventListener('timeupdate', () => {
            if (dur && isFinite(audio.duration)) {
                const left = Math.max(0, Math.round(audio.duration - audio.currentTime));
                dur.textContent = formatVoiceTime(left);
            }
        });
        audio.addEventListener('ended', () => {
            btn.innerHTML = '<i class="fa-solid fa-play"></i>';
        });
        btn.onclick = e => {
            e.stopPropagation();
            document.querySelectorAll('.voice-msg audio').forEach(a => {
                if (a !== audio) { a.pause(); const b = a.closest('.voice-msg')?.querySelector('.voice-msg-play'); if (b) b.innerHTML = '<i class="fa-solid fa-play"></i>'; }
            });
            if (audio.paused) {
                audio.play();
                btn.innerHTML = '<i class="fa-solid fa-pause"></i>';
            } else {
                audio.pause();
                btn.innerHTML = '<i class="fa-solid fa-play"></i>';
            }
        };
    });
}


// ===== Video circles =====
let circleRecorder = null, circleChunks = [], circleStream = null, circleTimer = null, circleSecs = 0;
let circleFacing = 'user';
let circleMode = 'chat'; // chat | post
let pendingPostCircleUrl = null;

async function startCircleRecording(mode) {
    circleMode = mode || 'chat';
    if (circleMode === 'chat' && !currentChatUserId) return;
    try {
        if (circleStream) circleStream.getTracks().forEach(t => t.stop());
        circleStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: circleFacing }, width: { ideal: 720 }, height: { ideal: 720 } },
            audio: true
        });
        const preview = document.getElementById('circle-preview');
        preview.srcObject = circleStream;
        document.getElementById('circle-recorder').classList.remove('hidden');
        circleChunks = [];
        circleSecs = 0;
        document.getElementById('circle-timer').textContent = '0:00';
        const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' :
                     MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : '';
        circleRecorder = new MediaRecorder(circleStream, mime ? { mimeType: mime } : undefined);
        circleRecorder.ondataavailable = e => { if (e.data.size) circleChunks.push(e.data); };
        circleRecorder.onstop = async () => {
            clearInterval(circleTimer);
            if (circleStream) circleStream.getTracks().forEach(t => t.stop());
            circleStream = null;
            document.getElementById('circle-recorder').classList.add('hidden');
            preview.srcObject = null;
            if (!circleChunks.length || circleSecs < 1) return;
            const blob = new Blob(circleChunks, { type: 'video/webm' });
            const fd = new FormData();
            fd.append('file', blob, 'circle.webm');
            const up = await fetch('/api/upload', { method: 'POST', body: fd });
            const ud = await up.json();
            if (!ud.url) return showToast('Ошибка', ud.error || 'Загрузка', '!');
            if (circleMode === 'chat' && currentChatUserId) {
                socket.emit('send_message', { receiver_id: currentChatUserId, content: '[circle]' + ud.url, is_super: false });
            } else if (circleMode === 'premium' || window.__premiumCirclePending) {
                window.__premiumCirclePending = false;
                if (typeof sendPremiumChat === 'function') sendPremiumChat('[circle]' + ud.url);
            } else if (circleMode === 'post') {
                pendingPostCircleUrl = ud.url;
                pendingPostPhoto = null;
                const pv = document.getElementById('post-circle-preview');
                const vid = document.getElementById('post-circle-vid');
                if (pv && vid) {
                    vid.src = ud.url;
                    vid.play().catch(() => {});
                    pv.style.display = 'block';
                }
                document.getElementById('post-photo-preview').style.display = 'none';
            }
        };
        circleRecorder.start(200);
        clearInterval(circleTimer);
        circleTimer = setInterval(() => {
            circleSecs++;
            const m = Math.floor(circleSecs / 60);
            const s = String(circleSecs % 60).padStart(2, '0');
            document.getElementById('circle-timer').textContent = m + ':' + s;
            if (circleSecs >= 60) stopCircle();
        }, 1000);
    } catch (err) {
        showToast('Ошибка', 'Нет доступа к камере', '!');
    }
}

document.getElementById('btn-circle')?.addEventListener('click', () => startCircleRecording('chat'));
document.getElementById('btn-add-circle')?.addEventListener('click', () => startCircleRecording('post'));

function stopCircle() {
    if (circleRecorder && circleRecorder.state === 'recording') circleRecorder.stop();
}
document.getElementById('btn-circle-cancel')?.addEventListener('click', () => {
    circleChunks = [];
    circleSecs = 0;
    if (circleRecorder && circleRecorder.state === 'recording') {
        try { circleRecorder.onstop = null; circleRecorder.stop(); } catch(e) {}
    }
    if (circleStream) circleStream.getTracks().forEach(t => t.stop());
    circleStream = null;
    document.getElementById('circle-recorder').classList.add('hidden');
    const preview = document.getElementById('circle-preview');
    if (preview) preview.srcObject = null;
});
document.getElementById('btn-circle-flip')?.addEventListener('click', async () => {
    const nextFacing = circleFacing === 'user' ? 'environment' : 'user';
    const wasRecording = circleRecorder && circleRecorder.state === 'recording';
    const savedOnStop = wasRecording ? circleRecorder.onstop : null;
    const savedSecs = circleSecs;

    // Stop recorder without finishing upload
    if (wasRecording) {
        try {
            circleRecorder.onstop = null;
            if (circleRecorder.state === 'recording') circleRecorder.stop();
        } catch (e) {}
    }

    // Fully release old camera (required on mobile before opening the other)
    if (circleStream) {
        try { circleStream.getTracks().forEach(t => t.stop()); } catch (e) {}
        circleStream = null;
    }
    const preview = document.getElementById('circle-preview');
    if (preview) preview.srcObject = null;

    try {
        let stream = null;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { exact: nextFacing }, width: { ideal: 720 }, height: { ideal: 720 } },
                audio: true
            });
        } catch (e1) {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: nextFacing }, width: { ideal: 480 }, height: { ideal: 480 } },
                audio: true
            });
        }
        circleStream = stream;
        circleFacing = nextFacing;
        if (preview) {
            preview.srcObject = circleStream;
            preview.muted = true;
            try { await preview.play(); } catch (e) {}
        }

        if (wasRecording && circleStream) {
            const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus') ? 'video/webm;codecs=vp8,opus' :
                         MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' :
                         MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : '';
            circleRecorder = new MediaRecorder(circleStream, mime ? { mimeType: mime } : undefined);
            circleRecorder.ondataavailable = e => { if (e.data && e.data.size) circleChunks.push(e.data); };
            circleRecorder.onstop = savedOnStop;
            circleRecorder.start(200);
            circleSecs = savedSecs;
        }
    } catch (err) {
        console.warn('flip camera', err);
        showToast('Камера', 'Не удалось переключить. На эмуляторе/ПК часто только одна камера.', '!');
        // try restore previous facing
        try {
            circleStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: circleFacing } },
                audio: true
            });
            if (preview) {
                preview.srcObject = circleStream;
                try { await preview.play(); } catch (e) {}
            }
            if (wasRecording && circleStream) {
                const mime = MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : '';
                circleRecorder = new MediaRecorder(circleStream, mime ? { mimeType: mime } : undefined);
                circleRecorder.ondataavailable = e => { if (e.data && e.data.size) circleChunks.push(e.data); };
                circleRecorder.onstop = savedOnStop;
                circleRecorder.start(200);
                circleSecs = savedSecs;
            }
        } catch (e2) {
            showToast('Ошибка', 'Камера недоступна', '!');
            document.getElementById('circle-recorder')?.classList.add('hidden');
        }
    }
});
document.getElementById('circle-preview')?.addEventListener('click', stopCircle);
document.getElementById('circle-timer')?.addEventListener('click', stopCircle);

document.getElementById('btn-clear-post-circle')?.addEventListener('click', () => {
    pendingPostCircleUrl = null;
    const pv = document.getElementById('post-circle-preview');
    if (pv) pv.style.display = 'none';
});


socket.on('new_message', data => {
    const inChat = document.getElementById('screen-chat').classList.contains('active');
    if (inChat && (data.sender_id === currentChatUserId || data.is_mine)) {
        const box = document.getElementById('messages');
        const div = document.createElement('div');
        div.className = 'message ' + (data.is_mine ? 'mine' : 'theirs') + (data.is_super ? ' super' : '') + (data.is_mine && mePlus.plus_msg_style ? ' plus-msg-' + mePlus.plus_msg_style : '');
        div.innerHTML = '<div class="msg-bubble">' + formatMessage(data.content, data.is_super) +
            '<div class="msg-time">' + (data.created_at || '') + '</div></div>';
        if (data.id) {
            div.dataset.msgId = data.id;
            bindMsgLongPress(div, data.id);
        }
        box.appendChild(div);
        enhanceLinkPreviews(div);
        box.scrollTop = box.scrollHeight;
        box.querySelectorAll('.media-clickable').forEach(el => {
            el.onclick = () => openLightbox(el.dataset.type, el.dataset.src);
        });
        bindMentions(box);
        bindVoicePlayers(div);
        if (!data.is_mine) notifyUser('message');
    } else if (!data.is_mine) {
        notifyUser('message');
        const badge = document.getElementById('nav-chats-badge');
        if (badge) {
            let n = parseInt(badge.textContent) || 0;
            if (badge.classList.contains('hidden')) n = 0;
            updateChatsBadge(n + 1);
        }
        if (document.getElementById('screen-chats').classList.contains('active')) {
            loadChatsList();
        }
    }
});
socket.on('friend_request', data => {
    notifyUser('friend');
    showToast('Заявка в друзья', (data.from_username || 'Кто-то') + ' хочет добавить вас', '👋');
    const frBadge = document.getElementById('friends-req-badge');
    if (frBadge) {
        let n = parseInt(frBadge.textContent) || 0;
        if (frBadge.classList.contains('hidden')) n = 0;
        n += 1;
        frBadge.textContent = n > 99 ? '99+' : n;
        frBadge.classList.remove('hidden');
    }
});
socket.on('error', d => showToast('Ошибка', d.msg || 'Ошибка', '!'));

try { loadHome(); } catch (e) { console.error('loadHome', e); }


if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
}
if (window.caches) {
    caches.keys().then(keys => keys.forEach(k => caches.delete(k))).catch(() => {});
}
console.log('Sklews build', window.SKLEWS_BUILD || 'unknown');


// ===== Admin panel (draggable FAB) =====
(function initAdminFab() {
    const fab = document.getElementById('admin-fab');
    if (!fab) return;

    let dragging = false, moved = false, startX = 0, startY = 0, origX = 0, origY = 0;

    function getPos(e) {
        if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        return { x: e.clientX, y: e.clientY };
    }

    function onStart(e) {
        if (fab.classList.contains('hidden')) return;
        dragging = true;
        moved = false;
        const p = getPos(e);
        startX = p.x; startY = p.y;
        const rect = fab.getBoundingClientRect();
        origX = rect.left; origY = rect.top;
        fab.style.right = 'auto';
        fab.style.bottom = 'auto';
        fab.style.left = origX + 'px';
        fab.style.top = origY + 'px';
        e.preventDefault();
    }
    function onMove(e) {
        if (!dragging) return;
        const p = getPos(e);
        const dx = p.x - startX, dy = p.y - startY;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
        let nx = origX + dx, ny = origY + dy;
        nx = Math.max(8, Math.min(window.innerWidth - 60, nx));
        ny = Math.max(8, Math.min(window.innerHeight - 60, ny));
        fab.style.left = nx + 'px';
        fab.style.top = ny + 'px';
    }
    function onEnd(e) {
        if (!dragging) return;
        dragging = false;
        if (!moved) openAdminModal();
    }

    fab.addEventListener('mousedown', onStart);
    fab.addEventListener('touchstart', onStart, { passive: false });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchend', onEnd);

    async function openAdminModal() {
        document.getElementById('modal-admin').classList.remove('hidden');
        try {
            const res = await fetch('/api/admin/stats');
            const d = await res.json();
            if (d.error) { showToast('Админ', d.error, '!'); return; }
            document.getElementById('admin-total-users').textContent = d.total_users;
            document.getElementById('admin-online-users').textContent = d.online_users;
            document.getElementById('admin-channels').textContent = d.channels;
            document.getElementById('admin-posts').textContent = d.posts;
        } catch (e) {
            showToast('Админ', 'Ошибка загрузки', '!');
        }
    }

    const btnCloseAdmin = document.getElementById('btn-close-admin');
    if (btnCloseAdmin) btnCloseAdmin.onclick = () => {
        document.getElementById('modal-admin')?.classList.add('hidden');
    };

    const btnAdminGive = document.getElementById('btn-admin-give');
    if (btnAdminGive) btnAdminGive.onclick = async () => {
        const username = document.getElementById('admin-crystal-user').value.trim();
        const amount = parseInt(document.getElementById('admin-crystal-amount').value, 10);
        if (!username || isNaN(amount) || amount === 0) {
            return showToast('Админ', 'Укажите ник и количество', '!');
        }
        const res = await fetch('/api/admin/give_crystals', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ username, amount })
        });
        const d = await res.json();
        if (d.error) return showToast('Админ', d.error, '!');
        showToast('Кристаллы', '@' + d.username + ' → ' + d.crystals + ' ✦', '✓');
        document.getElementById('admin-crystal-amount').value = '';
    };
})();

// Refresh admin flag on load
(async function() {
    try {
        const res = await fetch('/api/profile');
        const p = await res.json();
        meIsAdmin = !!p.is_admin;
    setMePlusFromProfile(p);
    if (p.id) meId = p.id;
    if (p.username) window.__meUsername = p.username;
    if (Array.isArray(p.owned_themes)) loadSavedTheme();
    meUserId = p.id;
    updatePremiumNav();
        const fab = document.getElementById('admin-fab');
        if (fab && meIsAdmin) fab.classList.remove('hidden');
    } catch (e) {}
})();


// ===== Admin multi-select bulk delete =====
document.getElementById('btn-admin-select-toggle')?.addEventListener('click', () => setAdminSelectMode(true));
document.getElementById('btn-admin-select-cancel')?.addEventListener('click', () => setAdminSelectMode(false));
document.getElementById('btn-admin-select-all')?.addEventListener('click', () => {
    (_lastChannelsCache || []).forEach(ch => adminSelectedChannels.add(ch.id));
    loadChannels();
});
document.getElementById('btn-admin-bulk-delete')?.addEventListener('click', () => {
    const n = adminSelectedChannels.size;
    if (!n) return;
    const el = document.getElementById('bulk-delete-text');
    if (el) el.textContent = 'Выбрано каналов: ' + n + '. Все посты и подписки будут удалены безвозвратно.';
    document.getElementById('modal-bulk-delete-channels').classList.remove('hidden');
});
document.getElementById('btn-cancel-bulk-delete')?.addEventListener('click', () => {
    document.getElementById('modal-bulk-delete-channels').classList.add('hidden');
});
document.getElementById('btn-confirm-bulk-delete')?.addEventListener('click', async () => {
    const ids = Array.from(adminSelectedChannels);
    document.getElementById('modal-bulk-delete-channels').classList.add('hidden');
    if (!ids.length) return;
    const res = await fetch('/api/admin/delete_channels', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ ids })
    });
    const d = await res.json();
    if (d.error) {
        showToast('Ошибка', d.error, '!');
        return;
    }
    showToast('Каналы', 'Удалено: ' + (d.deleted || ids.length), '✓');
    setAdminSelectMode(false);
    loadHome();
    loadMyChannels();
    loadProfile();
});


// ===== Theme & font size =====
const THEME_PALETTES = {
    violet:  { name: 'Фиолет', bg:'#0c0a14', bg2:'#130f1f', card:'#1a1528', card2:'#221c35', border:'#2e2645', text:'#f3eefc', muted:'#a89bc4', accent:'#8b5cf6', accent2:'#a78bfa', accent3:'#c4b5fd' },
    ocean:   { name: 'Океан', bg:'#0a1220', bg2:'#0f1a2e', card:'#152238', card2:'#1c2d48', border:'#243a5c', text:'#e8f1ff', muted:'#8aa4c7', accent:'#3b82f6', accent2:'#60a5fa', accent3:'#93c5fd' },
    emerald: { name: 'Изумруд', bg:'#0a1410', bg2:'#0f1f18', card:'#152820', card2:'#1c3329', border:'#264a38', text:'#e8fff4', muted:'#8ab8a0', accent:'#10b981', accent2:'#34d399', accent3:'#6ee7b7' },
    rose:    { name: 'Роза', bg:'#140a12', bg2:'#1f0f1a', card:'#281520', card2:'#351c2a', border:'#4a263a', text:'#ffedf5', muted:'#c49aaf', accent:'#ec4899', accent2:'#f472b6', accent3:'#f9a8d4' },
    amber:   { name: 'Янтарь', bg:'#14100a', bg2:'#1f180f', card:'#282015', card2:'#352a1c', border:'#4a3a26', text:'#fff8ed', muted:'#c4b08a', accent:'#f59e0b', accent2:'#fbbf24', accent3:'#fcd34d' },
    crimson: { name: 'Багровый', bg:'#140a0a', bg2:'#1f0f0f', card:'#281515', card2:'#351c1c', border:'#4a2626', text:'#ffeeee', muted:'#c49a9a', accent:'#ef4444', accent2:'#f87171', accent3:'#fca5a5' },
    cyan:    { name: 'Циан', bg:'#0a1414', bg2:'#0f1f1f', card:'#152828', card2:'#1c3333', border:'#264a4a', text:'#e8ffff', muted:'#8ab8b8', accent:'#06b6d4', accent2:'#22d3ee', accent3:'#67e8f9' },
    slate:   { name: 'Сланец', bg:'#0c0e12', bg2:'#12151c', card:'#1a1e28', card2:'#222833', border:'#2e3545', text:'#eef1f8', muted:'#9aa3b8', accent:'#64748b', accent2:'#94a3b8', accent3:'#cbd5e1' },
    indigo:  { name: 'Индиго', bg:'#0a0c18', bg2:'#0f1224', card:'#151a32', card2:'#1c2240', border:'#262e55', text:'#eef0ff', muted:'#9aa3d0', accent:'#6366f1', accent2:'#818cf8', accent3:'#a5b4fc' },
    mango:   { name: 'Манго', bg:'#141208', bg2:'#1f1b0c', card:'#28240f', card2:'#353014', border:'#4a441c', text:'#fffce8', muted:'#c4bc8a', accent:'#eab308', accent2:'#facc15', accent3:'#fde047' },
    grape:   { name: 'Виноград', bg:'#100a14', bg2:'#180f20', card:'#22152c', card2:'#2c1c38', border:'#3d2850', text:'#f8eeff', muted:'#b49ac8', accent:'#a855f7', accent2:'#c084fc', accent3:'#d8b4fe' },
    mint:    { name: 'Мята', bg:'#081412', bg2:'#0c1e1a', card:'#122a24', card2:'#183630', border:'#204840', text:'#e8fff8', muted:'#8ab8ac', accent:'#14b8a6', accent2:'#2dd4bf', accent3:'#5eead4' },
    sunset:  { name: 'Закат', bg:'#140c0a', bg2:'#1f140f', card:'#281c15', card2:'#35251c', border:'#4a3426', text:'#fff5ed', muted:'#c4a890', accent:'#f97316', accent2:'#fb923c', accent3:'#fdba74' },
    midnight:{ name: 'Полночь', bg:'#050508', bg2:'#0a0a10', card:'#12121a', card2:'#1a1a24', border:'#282834', text:'#e8e8f0', muted:'#8888a0', accent:'#7c3aed', accent2:'#8b5cf6', accent3:'#a78bfa' },
    sakura:  { name: 'Сакура', bg:'#140e12', bg2:'#1c1418', card:'#261c22', card2:'#32242c', border:'#453038', text:'#fff0f5', muted:'#c4a0b0', accent:'#db2777', accent2:'#ec4899', accent3:'#f9a8d4' },
    // Super exclusive (paid, permanent)
    obsidian_gold: {
        name: 'Obsidian Gold', exclusive: true, price: 500,
        bg:'#0a0908', bg2:'#12100c', card:'#1c1914', card2:'#262218',
        border:'#3d3420', text:'#faf6eb', muted:'#a89b78',
        accent:'#fbbf24', accent2:'#f59e0b', accent3:'#fde68a'
    },
    aurora_void: {
        name: 'Aurora Void', exclusive: true, price: 500,
        bg:'#05060f', bg2:'#0a0e1c', card:'#101628', card2:'#162036',
        border:'#1e2a4a', text:'#e8f7ff', muted:'#7a9bb8',
        accent:'#22d3ee', accent2:'#818cf8', accent3:'#67e8f9'
    },
    crimson_neon: {
        name: 'Crimson Neon', exclusive: true, price: 500,
        bg:'#0a0408', bg2:'#12060c', card:'#1e0a12', card2:'#2a1018',
        border:'#4a1528', text:'#fff0f5', muted:'#c48a9c',
        accent:'#f43f5e', accent2:'#fb7185', accent3:'#fda4af'
    },
    honey_ember: {
        name: 'Honey Ember', exclusive: true, price: 750,
        bg:'#14100a', bg2:'#1c160e', card:'#261e14', card2:'#322818',
        border:'#4a3a22', text:'#faf3e4', muted:'#b8a88a',
        accent:'#e8a54b', accent2:'#d4893a', accent3:'#f0c57a'
    },
    terracotta_dusk: {
        name: 'Terracotta Dusk', exclusive: true, price: 750,
        bg:'#16100e', bg2:'#1e1512', card:'#2a1c18', card2:'#362420',
        border:'#4a322c', text:'#faf0ea', muted:'#b89888',
        accent:'#c4785a', accent2:'#d4926e', accent3:'#e8b498'
    },
    cashmere_haze: {
        name: 'Cashmere Haze', exclusive: true, price: 750,
        bg:'#141214', bg2:'#1c181c', card:'#282024', card2:'#342a2e',
        border:'#4a3c42', text:'#faf4f6', muted:'#b8a0a8',
        accent:'#c9a0a8', accent2:'#d4b0b6', accent3:'#e8cdd2'
    },
};

let _themeDraft = null;
let _fontDraft = 16;

function applyThemeVars(p, key) {
    if (!p) return;
    const r = document.documentElement;
    r.style.setProperty('--bg', p.bg);
    r.style.setProperty('--bg2', p.bg2);
    r.style.setProperty('--card', p.card);
    r.style.setProperty('--card2', p.card2);
    r.style.setProperty('--border', p.border);
    r.style.setProperty('--text', p.text);
    r.style.setProperty('--muted', p.muted);
    r.style.setProperty('--accent', p.accent);
    r.style.setProperty('--accent2', p.accent2);
    r.style.setProperty('--accent3', p.accent3);
    r.style.setProperty('--purple-glow', p.accent + '59');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', p.accent);
    // exclusive body effects
    document.body.classList.forEach(c => {
        if (c.startsWith('xtheme-')) document.body.classList.remove(c);
    });
    const k = key || _themeDraft || localStorage.getItem('sklews_theme');
    if (k && EXCLUSIVE_THEME_KEYS.includes(k)) {
        document.body.classList.add('xtheme-' + k);
    }
}
function applyFontSize(px) {
    const n = parseInt(px, 10) || 16;
    document.documentElement.style.setProperty('--app-font', n + 'px');
    document.documentElement.style.setProperty('--msg-font', Math.max(13, n - 1.5) + 'px');
    document.body.style.fontSize = n + 'px';
}
function loadSavedTheme() {
    try {
        let key = localStorage.getItem('sklews_theme') || 'violet';
        const font = parseInt(localStorage.getItem('sklews_font') || '16', 10);
        if (THEME_PALETTES[key] && THEME_PALETTES[key].exclusive && !meOwnedThemes.includes(key)) {
            key = 'violet';
        }
        applyThemeVars(THEME_PALETTES[key] || THEME_PALETTES.violet, key);
        applyFontSize(font);
        _themeDraft = key;
        _fontDraft = font;
    } catch (e) {}
}
function renderThemeGrid() {
    const grid = document.getElementById('theme-palette-grid');
    if (!grid) return;
    grid.innerHTML = '';
    Object.entries(THEME_PALETTES).forEach(([key, p]) => {
        if (p.exclusive) return;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'theme-swatch' + (key === _themeDraft ? ' active' : '');
        b.style.background = 'linear-gradient(135deg, ' + p.bg + ' 0%, ' + p.card + ' 55%, ' + p.accent + ' 100%)';
        b.innerHTML = '<span>' + p.name + '</span><span class="dots"><i style="background:' + p.accent + '"></i><i style="background:' + p.accent2 + '"></i><i style="background:' + p.card + ';border:1px solid rgba(255,255,255,.3)"></i></span>';
        b.onclick = () => {
            _themeDraft = key;
            applyThemeVars(p, key);
            renderThemeGrid();
        };
        grid.appendChild(b);
    });
    renderExclusiveThemeGrid();
}
function renderExclusiveThemeGrid() {
    const grid = document.getElementById('theme-exclusive-grid');
    if (!grid) return;
    grid.innerHTML = '';
    EXCLUSIVE_THEME_KEYS.forEach(key => {
        const p = THEME_PALETTES[key];
        if (!p) return;
        const owned = meOwnedThemes.includes(key);
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'theme-swatch exclusive' + (key === _themeDraft ? ' active' : '') + (owned ? '' : ' locked');
        b.style.background = 'linear-gradient(135deg, ' + p.bg + ' 0%, ' + p.accent + ' 100%)';
        b.innerHTML = '<span>' + p.name + '</span>' +
            (owned ? '' : '<span class="lock-badge"><i class="fa-solid fa-lock"></i></span>') +
            '<span class="dots"><i style="background:' + p.accent + '"></i><i style="background:' + p.accent2 + '"></i></span>' +
            (owned ? '' : '<span class="price-badge">' + (p.price || 500) + ' ✦</span>');
        b.onclick = () => {
            if (!owned) {
                showToast('Супер-тема', 'Купи в Магазине за ' + (p.price || 500) + ' ✦', '✦');
                return;
            }
            _themeDraft = key;
            applyThemeVars(p, key);
            renderThemeGrid();
        };
        grid.appendChild(b);
    });
}
function syncFontButtons() {
    document.querySelectorAll('.font-size-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.size, 10) === _fontDraft);
    });
}
document.addEventListener('click', e => {
    const openBtn = e.target.closest('#btn-open-theme');
    if (openBtn) {
        e.preventDefault();
        e.stopPropagation();
        document.getElementById('modal-settings')?.classList.add('hidden');
        _themeDraft = localStorage.getItem('sklews_theme') || 'violet';
        _fontDraft = parseInt(localStorage.getItem('sklews_font') || '16', 10);
        renderThemeGrid();
        syncFontButtons();
        const m = document.getElementById('modal-theme');
        if (m) {
            m.classList.remove('hidden');
            m.style.display = 'flex';
        }
        return;
    }
    if (e.target.closest('#btn-theme-close')) {
        loadSavedTheme();
        const m = document.getElementById('modal-theme');
        if (m) { m.classList.add('hidden'); m.style.display = ''; }
    }
    if (e.target.closest('#btn-theme-save')) {
        localStorage.setItem('sklews_theme', _themeDraft || 'violet');
        localStorage.setItem('sklews_font', String(_fontDraft || 16));
        applyThemeVars(THEME_PALETTES[_themeDraft] || THEME_PALETTES.violet, _themeDraft);
        applyFontSize(_fontDraft);
        const m = document.getElementById('modal-theme');
        if (m) { m.classList.add('hidden'); m.style.display = ''; }
        showToast('Оформление', 'Сохранено', '✓');
    }
    if (e.target.closest('#btn-theme-reset')) {
        _themeDraft = 'violet';
        _fontDraft = 16;
        applyThemeVars(THEME_PALETTES.violet, 'violet');
        applyFontSize(16);
        renderThemeGrid();
        syncFontButtons();
    }
});

document.getElementById('font-size-row')?.addEventListener('click', e => {
    const btn = e.target.closest('.font-size-btn');
    if (!btn) return;
    _fontDraft = parseInt(btn.dataset.size, 10);
    applyFontSize(_fontDraft);
    syncFontButtons();
});
loadSavedTheme();


// ===== Premium nav + feed + lobby chat =====
function updatePremiumNav() {
    const btn = document.getElementById('nav-premium');
    if (!btn) return;
    if (meHasPremium) {
        btn.classList.remove('hidden');
        btn.classList.remove('nav-premium-locked');
    } else {
        btn.classList.add('hidden');
        if (document.getElementById('screen-premium')?.classList.contains('active')) {
            showScreen('screen-home');
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelector('.nav-btn[data-tab="home"]')?.classList.add('active');
        }
        try { socket.emit('leave_premium_chat'); } catch (e) {}
    }
}

let pendingPfPhoto = null;
let premiumChatJoined = false;

function switchPremiumTab(ptab) {
    document.querySelectorAll('.premium-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.ptab === ptab);
    });
    const posts = document.getElementById('premium-page-posts');
    const chat = document.getElementById('premium-page-chat');
    if (ptab === 'chat') {
        if (posts) posts.classList.add('hidden');
        if (chat) chat.classList.remove('hidden');
        openPremiumChat();
    } else {
        if (chat) chat.classList.add('hidden');
        if (posts) posts.classList.remove('hidden');
        try { socket.emit('leave_premium_chat'); } catch (e) {}
        premiumChatJoined = false;
        loadPremiumFeed();
    }
}

document.querySelectorAll('.premium-tab').forEach(btn => {
    btn.addEventListener('click', () => switchPremiumTab(btn.dataset.ptab));
});

async function loadPremiumFeed() {
    const list = document.getElementById('premium-feed-list');
    if (!list) return;
    if (!meHasPremium) {
        updatePremiumNav();
        list.innerHTML = '<div class="empty-state" style="padding:40px 20px"><i class="fa-solid fa-crown" style="font-size:36px;color:#fbbf24;display:block;margin-bottom:12px"></i>Вкладка Premium<br><span style="font-size:13px;color:var(--muted)">Доступна с активной подпиской</span></div>';
        const compose = document.querySelector('.premium-feed-compose');
        if (compose) compose.style.display = 'none';
        return;
    }
    const compose = document.querySelector('.premium-feed-compose');
    if (compose) compose.style.display = '';
    list.innerHTML = '<div class="empty-state">Загрузка…</div>';
    try {
        const res = await fetch('/api/premium/feed');
        const data = await res.json();
        if (res.status === 403) {
            meHasPremium = false;
            updatePremiumNav();
            list.innerHTML = '<div class="empty-state">Только для Premium</div>';
            return;
        }
        const posts = data.posts || [];
        list.innerHTML = '';
        if (!posts.length) {
            list.innerHTML = '<div class="empty-state">Пока тихо — напишите первым</div>';
            return;
        }
        posts.forEach(p => {
            const card = document.createElement('div');
            card.className = 'pf-card';
            const author = premiumNickHtml(p.username, p.author_premium);
            let media = '';
            if (p.media_url) media = '<img class="pf-media" src="' + p.media_url + '" alt="" loading="lazy">';
            const del = p.can_delete ? '<button type="button" class="pf-del" data-id="' + p.id + '"><i class="fa-solid fa-trash"></i></button>' : '';
            card.innerHTML = '<div class="pf-card-top">' + avatarHtml(p.username, p.avatar) +
                '<div class="pf-card-meta"><div class="pf-author">' + author + '</div>' +
                '<div class="pf-time">' + escapeHtml(p.created_at || '') + '</div></div>' + del + '</div>' +
                '<div class="pf-text">' + escapeHtml(p.content || '') + '</div>' + media;
            card.querySelector('.pf-del')?.addEventListener('click', async () => {
                await fetch('/api/premium/feed/' + p.id, { method: 'DELETE' });
                loadPremiumFeed();
            });
            card.querySelector('.avatar')?.addEventListener('click', () => { if (p.user_id) openUserProfile(p.user_id); });
            list.appendChild(card);
            enhanceLinkPreviews(card);
        });
    } catch (e) {
        list.innerHTML = '<div class="empty-state">Ошибка загрузки</div>';
    }
}

document.getElementById('btn-pf-photo')?.addEventListener('click', () => document.getElementById('pf-photo-input')?.click());
document.getElementById('pf-photo-input')?.addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    pendingPfPhoto = f || null;
    const prev = document.getElementById('pf-photo-preview');
    if (prev) {
        if (f) {
            prev.classList.remove('hidden');
            prev.innerHTML = '<img src="' + URL.createObjectURL(f) + '" style="max-width:100%;border-radius:12px">';
        } else { prev.classList.add('hidden'); prev.innerHTML = ''; }
    }
    e.target.value = '';
});
document.getElementById('btn-pf-post')?.addEventListener('click', async () => {
    if (!meHasPremium) return showToast('Premium', 'Нужен Premium', '!');
    const content = (document.getElementById('pf-input')?.value || '').trim();
    let media_url = '', media_type = '';
    if (pendingPfPhoto) {
        const fd = new FormData();
        fd.append('file', pendingPfPhoto);
        const up = await fetch('/api/upload', { method: 'POST', body: fd });
        const ud = await up.json();
        if (ud.error) return showToast('Ошибка', ud.error, '!');
        media_url = ud.url; media_type = 'photo';
    }
    if (!content && !media_url) return showToast('Пост', 'Добавьте текст или фото', '!');
    const res = await fetch('/api/premium/feed', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ content, media_url, media_type })
    });
    const d = await res.json();
    if (d.error) return showToast('Ошибка', d.error, '!');
    document.getElementById('pf-input').value = '';
    pendingPfPhoto = null;
    const prev = document.getElementById('pf-photo-preview');
    if (prev) { prev.classList.add('hidden'); prev.innerHTML = ''; }
    showToast('Premium', 'Опубликовано', '✓');
    loadPremiumFeed();
});

function renderPremiumChatMsg(m) {
    const div = document.createElement('div');
    const isMine = m.is_mine || (m.user_id && typeof meId !== 'undefined' && m.user_id === meId);
    div.className = 'pc-msg' + (isMine ? ' mine' : '');
    div.dataset.id = m.id || '';
    const nick = premiumNickHtml(m.username || '?', true);
    const body = formatMessage(m.content || '', false);
    div.innerHTML =
        '<div class="pc-msg-author">' + nick + '</div>' +
        '<div class="pc-msg-text">' + body + '</div>' +
        '<div class="pc-msg-time">' + escapeHtml(m.created_at || '') + '</div>';
    div.querySelectorAll('.media-clickable').forEach(el => {
        el.onclick = () => openLightbox(el.dataset.type, el.dataset.src);
    });
    bindMentions(div);
    bindVoicePlayers(div);
    enhanceLinkPreviews(div);
    return div;
}

async function openPremiumChat() {
    const box = document.getElementById('premium-chat-messages');
    if (!box) return;
    if (!meHasPremium) {
        box.innerHTML = '<div class="premium-chat-empty"><i class="fa-solid fa-crown"></i><span>Чат только для Premium</span></div>';
        return;
    }
    box.innerHTML = '<div class="premium-chat-empty"><span>Загрузка…</span></div>';
    try {
        const res = await fetch('/api/premium/chat');
        const data = await res.json();
        if (res.status === 403) {
            meHasPremium = false;
            updatePremiumNav();
            box.innerHTML = '<div class="premium-chat-empty"><i class="fa-solid fa-lock"></i><span>Только для Premium</span></div>';
            return;
        }
        const msgs = data.messages || [];
        box.innerHTML = '';
        if (!msgs.length) {
            box.innerHTML = '<div class="premium-chat-empty"><i class="fa-solid fa-comments"></i><span>Общий чат Premium<br>Напишите первым</span></div>';
        } else {
            msgs.forEach(m => box.appendChild(renderPremiumChatMsg(m)));
            box.scrollTop = box.scrollHeight;
        }
        if (!premiumChatJoined) {
            socket.emit('join_premium_chat');
            premiumChatJoined = true;
        }
    } catch (e) {
        box.innerHTML = '<div class="premium-chat-empty"><span>Ошибка загрузки</span></div>';
    }
}

function sendPremiumChat(content) {
    if (!meHasPremium) return showToast('Premium', 'Нужен Premium', '!');
    const input = document.getElementById('premium-chat-input');
    const text = (content != null ? content : (input?.value || '')).trim();
    if (!text) return;
    if (!premiumChatJoined) socket.emit('join_premium_chat');
    socket.emit('premium_chat_message', { content: text });
    if (content == null && input) input.value = '';
}

document.getElementById('btn-premium-chat-send')?.addEventListener('click', () => sendPremiumChat());
document.getElementById('premium-chat-input')?.addEventListener('keypress', e => {
    if (e.key === 'Enter') { e.preventDefault(); sendPremiumChat(); }
});

document.getElementById('btn-premium-attach')?.addEventListener('click', () => document.getElementById('premium-chat-file')?.click());
document.getElementById('premium-chat-file')?.addEventListener('change', async e => {
    const file = e.target.files && e.target.files[0];
    if (!file || !meHasPremium) return;
    const fd = new FormData();
    fd.append('file', file);
    const up = await fetch('/api/upload', { method: 'POST', body: fd });
    const ud = await up.json();
    if (ud.error) return showToast('Ошибка', ud.error, '!');
    const content = file.type.startsWith('video') ? '[video]' + ud.url : '[photo]' + ud.url;
    sendPremiumChat(content);
    e.target.value = '';
});

// Premium voice (separate recorder state so private chat not broken)
let premMediaRecorder = null, premVoiceChunks = [], premVoiceStream = null, premVoiceTimer = null, premVoiceSecs = 0, premVoiceCancelled = false;

function showPremiumVoiceBar(on) {
    const bar = document.getElementById('premium-voice-rec-bar');
    const input = document.querySelector('#premium-page-chat .premium-chat-input-area');
    if (!bar) return;
    if (on) {
        bar.classList.remove('hidden');
        if (input) input.style.display = 'none';
        const t = document.getElementById('premium-voice-rec-timer');
        if (t) t.textContent = '0:00';
    } else {
        bar.classList.add('hidden');
        if (input) input.style.display = '';
        document.getElementById('btn-premium-voice')?.classList.remove('active');
    }
}
function stopPremiumVoice(send) {
    premVoiceCancelled = !send;
    if (premVoiceTimer) { clearInterval(premVoiceTimer); premVoiceTimer = null; }
    if (premMediaRecorder && premMediaRecorder.state === 'recording') {
        try { premMediaRecorder.stop(); } catch (e) {}
    } else {
        if (premVoiceStream) premVoiceStream.getTracks().forEach(t => t.stop());
        premVoiceStream = null;
        showPremiumVoiceBar(false);
    }
}
async function startPremiumVoice() {
    if (premMediaRecorder && premMediaRecorder.state === 'recording') return;
    try {
        premVoiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' :
                     MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
        premMediaRecorder = new MediaRecorder(premVoiceStream, mime ? { mimeType: mime } : undefined);
        premVoiceChunks = [];
        premVoiceSecs = 0;
        premVoiceCancelled = false;
        premMediaRecorder.ondataavailable = e => { if (e.data && e.data.size) premVoiceChunks.push(e.data); };
        premMediaRecorder.onstop = async () => {
            if (premVoiceStream) premVoiceStream.getTracks().forEach(t => t.stop());
            premVoiceStream = null;
            showPremiumVoiceBar(false);
            if (premVoiceCancelled || !premVoiceChunks.length || premVoiceSecs < 1) return;
            const blob = new Blob(premVoiceChunks, { type: 'audio/webm' });
            const fd = new FormData();
            fd.append('file', blob, 'voice.webm');
            const up = await fetch('/api/upload', { method: 'POST', body: fd });
            const ud = await up.json();
            if (ud.url) sendPremiumChat('[voice]' + ud.url);
            else if (ud.error) showToast('Ошибка', ud.error, '!');
        };
        premMediaRecorder.start(200);
        document.getElementById('btn-premium-voice')?.classList.add('active');
        showPremiumVoiceBar(true);
        premVoiceTimer = setInterval(() => {
            premVoiceSecs++;
            const el = document.getElementById('premium-voice-rec-timer');
            if (el) el.textContent = formatVoiceTime(premVoiceSecs);
            if (premVoiceSecs >= 120) stopPremiumVoice(true);
        }, 1000);
    } catch (err) {
        showToast('Ошибка', 'Нет доступа к микрофону', '!');
    }
}
document.getElementById('btn-premium-voice')?.addEventListener('click', () => startPremiumVoice());
document.getElementById('btn-premium-voice-stop')?.addEventListener('click', () => stopPremiumVoice(true));
document.getElementById('btn-premium-voice-cancel')?.addEventListener('click', () => stopPremiumVoice(false));

document.getElementById('btn-premium-circle')?.addEventListener('click', () => {
    // reuse circle recorder; on stop send to premium if flag set
    window.__premiumCirclePending = true;
    startCircleRecording('premium');
});

// Patch circle onstop path: handled by wrapping startCircleRecording mode
const _origStartCircle = typeof startCircleRecording === 'function' ? startCircleRecording : null;

socket.on('premium_chat_new', data => {
    const box = document.getElementById('premium-chat-messages');
    if (!box) return;
    const empty = box.querySelector('.premium-chat-empty');
    if (empty) empty.remove();
    const myId = (typeof meId !== 'undefined') ? meId : null;
    if (myId != null) data.is_mine = data.user_id === myId;
    else if (typeof window.__meUsername === 'string') data.is_mine = data.username === window.__meUsername;
    box.appendChild(renderPremiumChatMsg(data));
    box.scrollTop = box.scrollHeight;
});

socket.on('premium_chat_joined', () => { premiumChatJoined = true; });


// ===== Premium+ studio =====
function plusSelectChip(rowId, value) {
    const row = document.getElementById(rowId);
    if (!row) return;
    const v = value == null ? '' : String(value);
    row.querySelectorAll('.plus-chip').forEach(c => {
        c.classList.toggle('active', (c.dataset.v || '') === v);
    });
}
function plusSelectedChip(rowId) {
    const row = document.getElementById(rowId);
    if (!row) return '';
    const active = row.querySelector('.plus-chip.active');
    return active ? (active.dataset.v || '') : '';
}
function updatePlusPreview() {
    const nameFx = plusSelectedChip('plus-name-fx');
    const frame = plusSelectedChip('plus-avatar-frame');
    const bannerFx = plusSelectedChip('plus-banner-fx');
    const badge = (document.getElementById('plus-badge')?.value || '').trim();
    const auraEl = document.getElementById('plus-aura');
    const aura = (auraEl && auraEl.dataset.cleared !== '1') ? (auraEl.value || '') : '';
    const nameEl = document.getElementById('plus-prev-name');
    const wrap = document.getElementById('plus-prev-avatar-wrap');
    const ban = document.getElementById('plus-prev-banner');
    const badgeEl = document.getElementById('plus-prev-badge');
    const prev = document.getElementById('plus-preview-profile');
    if (nameEl) nameEl.innerHTML = premiumNickHtml(window.__meUsername || 'you', true, nameFx);
    if (wrap) wrap.className = 'plus-prev-avatar-wrap' + (frame ? ' frame-' + frame : '');
    if (ban) {
        ban.className = 'plus-prev-banner';
        let layer = ban.querySelector('.banner-fx-layer') || document.getElementById('plus-prev-banner-fx');
        if (!layer) {
            layer = document.createElement('div');
            layer.className = 'banner-fx-layer';
            ban.appendChild(layer);
        }
        layer.className = 'banner-fx-layer';
        layer.innerHTML = '';
        const fxKeys = ['glare','aurora','neon','stardust','holo','rain','shutter','spark','trail','radar'];
        if (bannerFx && fxKeys.includes(bannerFx)) {
            ban.classList.add('bfx-' + bannerFx);
            layer.classList.add('bfx-' + bannerFx);
            if (bannerFx === 'stardust') {
                for (let i = 0; i < 16; i++) {
                    const d = document.createElement('span');
                    d.className = 'stardust-dot';
                    d.style.setProperty('--x', (Math.random()*100).toFixed(1)+'%');
                    d.style.setProperty('--delay', (Math.random()*6).toFixed(2)+'s');
                    d.style.setProperty('--dur', (4+Math.random()*5).toFixed(2)+'s');
                    layer.appendChild(d);
                }
            }
            if (bannerFx === 'spark') {
                for (let i = 0; i < 6; i++) {
                    const s = document.createElement('span');
                    s.className = 'spark-star';
                    s.style.setProperty('--x', (10+Math.random()*80).toFixed(1)+'%');
                    s.style.setProperty('--y', (15+Math.random()*60).toFixed(1)+'%');
                    s.style.setProperty('--delay', (Math.random()*2).toFixed(2)+'s');
                    layer.appendChild(s);
                }
            }
            if (bannerFx === 'rain') {
                for (let i = 0; i < 12; i++) {
                    const r = document.createElement('span');
                    r.className = 'rain-streak';
                    r.style.setProperty('--x', (Math.random()*100).toFixed(1)+'%');
                    r.style.setProperty('--delay', (Math.random()*2).toFixed(2)+'s');
                    r.style.setProperty('--dur', (1+Math.random()*2).toFixed(2)+'s');
                    layer.appendChild(r);
                }
            }
        }
    }
    if (badgeEl) badgeEl.textContent = badge;
    if (prev) {
        prev.style.boxShadow = aura ? ('0 0 28px ' + aura + '66') : '';
        const card = plusSelectedChip('plus-card-style');
        prev.className = 'plus-preview' + (card ? ' plus-card-' + card : '');
    }
}
async function openPlusStudio() {
    // always refresh from server
    try {
        const res = await fetch('/api/profile');
        if (res.ok) {
            const p = await res.json();
            setMePlusFromProfile(p);
            if (p.username) window.__meUsername = p.username;
        }
    } catch (e) {}
    if (!meHasPremiumPlus) {
        showToast('Premium+', 'Купи в магазине за 10000 ✦', '✦');
        return;
    }
    document.getElementById('modal-settings')?.classList.add('hidden');
    const m = document.getElementById('modal-plus-studio');
    if (!m) return showToast('Ошибка', 'Студия не найдена', '!');
    plusSelectChip('plus-name-fx', mePlus.plus_name_fx || '');
    plusSelectChip('plus-avatar-frame', mePlus.plus_avatar_frame || '');
    plusSelectChip('plus-banner-fx', mePlus.plus_banner_fx || '');
    plusSelectChip('plus-msg-style', mePlus.plus_msg_style || '');
    plusSelectChip('plus-card-style', mePlus.plus_card_style || '');
    const badge = document.getElementById('plus-badge');
    if (badge) badge.value = mePlus.plus_badge || '';
    const aura = document.getElementById('plus-aura');
    if (aura) {
        aura.dataset.cleared = mePlus.plus_aura ? '' : '1';
        aura.value = mePlus.plus_aura || '#fbbf24';
    }
    const accent = document.getElementById('plus-accent');
    if (accent) {
        accent.dataset.cleared = mePlus.plus_accent ? '' : '1';
        accent.value = mePlus.plus_accent || '#8b5cf6';
    }
    updatePlusPreview();
    try {
        const res = await fetch('/api/my_channels');
        const list = await res.json();
        const sel = document.getElementById('plus-channel-select');
        if (sel) {
            sel.innerHTML = '';
            (list || []).forEach(ch => {
                const o = document.createElement('option');
                o.value = ch.id;
                o.textContent = ch.name;
                sel.appendChild(o);
            });
            if (!list || !list.length) {
                const o = document.createElement('option');
                o.value = '';
                o.textContent = 'Нет своих каналов';
                sel.appendChild(o);
            } else {
                await loadPlusChannelForm(list[0].id);
            }
        }
    } catch (e) {}
    m.classList.remove('hidden');
    m.style.display = 'flex';
}
async function loadPlusChannelForm(id) {
    if (!id) return;
    try {
        const res = await fetch('/api/channel/' + id);
        const ch = await res.json();
        plusSelectChip('plus-ch-frame', ch.plus_frame || '');
        plusSelectChip('plus-ch-header-fx', ch.plus_header_fx || '');
        plusSelectChip('plus-ch-anim', ch.plus_anim || '');
        const b = document.getElementById('plus-ch-badge');
        if (b) b.value = ch.plus_badge || '';
        const g = document.getElementById('plus-ch-glow');
        if (g) {
            g.dataset.cleared = ch.plus_glow ? '' : '1';
            g.value = ch.plus_glow || '#8b5cf6';
        }
    } catch (e) {}
}

// Event delegation — works even if nodes re-rendered
document.addEventListener('click', async e => {
    if (e.target.closest('#btn-open-plus-studio')) {
        e.preventDefault();
        openPlusStudio();
        return;
    }
    if (e.target.closest('#btn-plus-studio-close')) {
        const m = document.getElementById('modal-plus-studio');
        if (m) { m.classList.add('hidden'); m.style.display = ''; }
        return;
    }
    const stab = e.target.closest('.plus-studio-tab');
    if (stab) {
        document.querySelectorAll('.plus-studio-tab').forEach(b => b.classList.toggle('active', b === stab));
        const tab = stab.dataset.stab;
        document.getElementById('plus-studio-profile')?.classList.toggle('hidden', tab !== 'profile');
        document.getElementById('plus-studio-channel')?.classList.toggle('hidden', tab !== 'channel');
        return;
    }
    const chip = e.target.closest('.plus-chip-row .plus-chip');
    if (chip) {
        const row = chip.closest('.plus-chip-row');
        row.querySelectorAll('.plus-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        if (row.id && !row.id.startsWith('plus-ch')) updatePlusPreview();
        return;
    }
    if (e.target.closest('#plus-aura-clear')) {
        const a = document.getElementById('plus-aura');
        if (a) { a.value = '#000000'; a.dataset.cleared = '1'; }
        updatePlusPreview();
        return;
    }
    if (e.target.closest('#plus-accent-clear')) {
        const a = document.getElementById('plus-accent');
        if (a) { a.value = '#000000'; a.dataset.cleared = '1'; }
        return;
    }
    if (e.target.closest('#plus-ch-glow-clear')) {
        const g = document.getElementById('plus-ch-glow');
        if (g) { g.value = '#000000'; g.dataset.cleared = '1'; }
        return;
    }
    if (e.target.closest('#btn-plus-save-profile')) {
        e.preventDefault();
        e.stopPropagation();
        const btn = e.target.closest('#btn-plus-save-profile');
        if (btn.disabled) return;
        btn.disabled = true;
        const auraEl = document.getElementById('plus-aura');
        const accentEl = document.getElementById('plus-accent');
        let aura = auraEl?.value || '';
        if (auraEl?.dataset.cleared === '1' || aura === '#000000') aura = '';
        let accent = accentEl?.value || '';
        if (accentEl?.dataset.cleared === '1' || accent === '#000000') accent = '';
        const body = {
            plus_name_fx: plusSelectedChip('plus-name-fx'),
            plus_avatar_frame: plusSelectedChip('plus-avatar-frame'),
            plus_banner_fx: plusSelectedChip('plus-banner-fx'),
            plus_msg_style: plusSelectedChip('plus-msg-style'),
            plus_card_style: plusSelectedChip('plus-card-style'),
            plus_badge: (document.getElementById('plus-badge')?.value || '').trim(),
            plus_aura: aura,
            plus_accent: accent,
        };
        try {
            const res = await fetch('/api/plus/profile', {
                method: 'POST',
                headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
                body: JSON.stringify(body)
            });
            const raw = await res.text();
            let d = {};
            try {
                const cleaned = (raw || '').replace(/^\uFEFF/, '').trim();
                d = cleaned ? JSON.parse(cleaned) : {};
            } catch (err) {
                console.error('plus profile raw', res.status, (raw || '').slice(0, 300));
                const looksHtml = /<html|<body|<!doctype/i.test(raw || '');
                showToast('Premium+', looksHtml ? 'Сессия сброшена — перезайди' : ('Битый ответ ' + res.status), '!');
                btn.disabled = false;
                return;
            }
            if (!res.ok || d.error) {
                showToast('Premium+', d.error || ('Ошибка ' + res.status), '!');
                btn.disabled = false;
                return;
            }
            const applied = {
                username: window.__meUsername || 'you',
                is_premium: true,
                is_premium_plus: true,
                plus_name_fx: d.plus_name_fx || body.plus_name_fx,
                plus_avatar_frame: d.plus_avatar_frame || body.plus_avatar_frame,
                plus_banner_fx: d.plus_banner_fx || body.plus_banner_fx,
                plus_msg_style: d.plus_msg_style || body.plus_msg_style,
                plus_card_style: d.plus_card_style || body.plus_card_style,
                plus_badge: d.plus_badge || body.plus_badge,
                plus_aura: d.plus_aura != null ? d.plus_aura : body.plus_aura,
                plus_accent: d.plus_accent != null ? d.plus_accent : body.plus_accent,
            };
            setMePlusFromProfile(applied);
            if (auraEl) auraEl.dataset.cleared = applied.plus_aura ? '' : '1';
            if (accentEl) accentEl.dataset.cleared = applied.plus_accent ? '' : '1';
            applyPlusToProfileHero(applied);
            showToast('Premium+', 'Профиль сохранён', '✓');
            try { if (typeof loadProfile === 'function') loadProfile(); } catch (e) {}
        } catch (err) {
            showToast('Ошибка', err.message || 'Сеть', '!');
        }
        btn.disabled = false;
        return;
    }
    if (e.target.closest('#btn-plus-save-channel')) {
        e.preventDefault();
        const btn = e.target.closest('#btn-plus-save-channel');
        const id = document.getElementById('plus-channel-select')?.value;
        if (!id) return showToast('Канал', 'Нет канала', '!');
        btn.disabled = true;
        const glowEl = document.getElementById('plus-ch-glow');
        let glow = glowEl?.value || '';
        if (glowEl?.dataset.cleared === '1' || glow === '#000000') glow = '';
        const body = {
            plus_frame: plusSelectedChip('plus-ch-frame'),
            plus_header_fx: plusSelectedChip('plus-ch-header-fx'),
            plus_anim: plusSelectedChip('plus-ch-anim'),
            plus_badge: (document.getElementById('plus-ch-badge')?.value || '').trim(),
            plus_glow: glow,
        };
        try {
            const res = await fetch('/api/plus/channel/' + id, {
                method: 'POST',
                headers: {'Content-Type':'application/json', 'Accept':'application/json'},
                body: JSON.stringify(body)
            });
            const raw = await res.text();
            let d = {};
            try {
                const cleaned = (raw || '').replace(/^\uFEFF/, '').trim();
                d = cleaned ? JSON.parse(cleaned) : {};
            } catch (err) {
                const looksHtml = /<html|<body|<!doctype/i.test(raw || '');
                showToast('Premium+', looksHtml ? 'Сессия сброшена — перезайди' : ('Битый ответ ' + res.status), '!');
                btn.disabled = false;
                return;
            }
            if (!res.ok || d.error) {
                showToast('Premium+', d.error || ('Ошибка ' + res.status), '!');
                btn.disabled = false;
                return;
            }
            if (glowEl) glowEl.dataset.cleared = body.plus_glow ? '' : '1';
            showToast('Premium+', 'Канал сохранён', '✓');
            if (typeof loadHome === 'function') loadHome();
        } catch (err) {
            showToast('Ошибка', err.message || 'Сеть', '!');
        }
        btn.disabled = false;
        return;
    }
});
document.getElementById('plus-badge')?.addEventListener('input', updatePlusPreview);
document.getElementById('plus-aura')?.addEventListener('input', () => {
    const a = document.getElementById('plus-aura');
    if (a) a.dataset.cleared = '';
    updatePlusPreview();
});
document.getElementById('plus-channel-select')?.addEventListener('change', e => loadPlusChannelForm(e.target.value));

document.getElementById('btn-buy-premium-plus')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-buy-premium-plus');
    if (btn) btn.disabled = true;
    try {
        const res = await fetch('/api/shop/premium-plus', { method: 'POST' });
        let d = {};
        try { d = await res.json(); } catch (e) { d = { error: 'Сервер вернул не JSON (' + res.status + ')' }; }
        if (!res.ok || d.error) {
            showToast('Premium+', d.error || ('Ошибка ' + res.status), '!');
            if (btn) btn.disabled = false;
            return;
        }
        meHasPremiumPlus = true;
        meHasPremium = true;
        setMePlusFromProfile({ ...d, is_premium: true, is_premium_plus: true });
        const bal = document.getElementById('shop-balance');
        if (bal && d.crystals != null) bal.textContent = d.crystals;
        if (btn) { btn.textContent = 'Активен'; btn.classList.add('owned'); btn.disabled = true; }
        showToast('Premium+', 'Активирован навсегда!', '✦');
        updatePremiumNav();
        if (typeof loadProfile === 'function') loadProfile();
        if (typeof loadShop === 'function') loadShop();
    } catch (e) {
        showToast('Ошибка', 'Сеть: ' + (e && e.message ? e.message : 'не удалось купить'), '!');
        if (btn) btn.disabled = false;
    }
});

// ===== Minesweeper Premium UI =====
const MS = {
    size: 12,
    bombs: 25,
    token: null,
    alive: false,
    flags: 0,
    grid: null,
    mode: 'open' // 'open' | 'flag'
};

function msNewGrid() {
    const n = MS.size, g = [];
    for (let r = 0; r < n; r++) {
        g[r] = [];
        for (let c = 0; c < n; c++) g[r][c] = { m: 0, o: 0, f: 0, a: 0 };
    }
    let left = MS.bombs;
    while (left) {
        const r = (Math.random() * n) | 0, c = (Math.random() * n) | 0;
        if (!g[r][c].m) { g[r][c].m = 1; left--; }
    }
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        if (g[r][c].m) continue;
        let a = 0;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            const rr = r + dr, cc = c + dc;
            if (rr >= 0 && rr < n && cc >= 0 && cc < n && g[rr][cc].m) a++;
        }
        g[r][c].a = a;
    }
    return g;
}

function msPaint() {
    const board = document.getElementById('mines-board');
    if (!board || !MS.grid) return;
    const n = MS.size;
    board.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
            const cell = MS.grid[r][c];
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'mines-cell';
            btn.dataset.r = r;
            btn.dataset.c = c;
            if (cell.o) {
                btn.classList.add('open');
                if (cell.m) {
                    btn.classList.add('boom');
                    btn.innerHTML = '<i class="fa-solid fa-bomb"></i>';
                } else if (cell.a) {
                    btn.textContent = String(cell.a);
                    btn.dataset.n = cell.a;
                }
            } else if (cell.f) {
                btn.classList.add('flag');
                btn.innerHTML = '<i class="fa-solid fa-flag"></i>';
            }
            frag.appendChild(btn);
        }
    }
    board.appendChild(frag);
    const fl = document.getElementById('mines-flags-label');
    if (fl) fl.textContent = String(MS.flags);
    const bm = document.getElementById('mines-bombs');
    if (bm) bm.textContent = String(MS.bombs);
}

function msFlood(r, c) {
    const n = MS.size, stack = [[r, c]];
    while (stack.length) {
        const [cr, cc] = stack.pop();
        const cell = MS.grid[cr][cc];
        if (cell.o || cell.f) continue;
        cell.o = 1;
        if (!cell.m && cell.a === 0) {
            for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
                const rr = cr + dr, cc2 = cc + dc;
                if (rr >= 0 && rr < n && cc2 >= 0 && cc2 < n && !MS.grid[rr][cc2].o)
                    stack.push([rr, cc2]);
            }
        }
    }
}

function msWon() {
    const n = MS.size;
    for (let r = 0; r < n; r++)
        for (let c = 0; c < n; c++)
            if (!MS.grid[r][c].m && !MS.grid[r][c].o) return false;
    return true;
}

async function msOpen(r, c) {
    if (!MS.alive) return;
    const cell = MS.grid[r][c];
    if (cell.o || cell.f) return;
    if (cell.m) {
        MS.alive = false;
        const n = MS.size;
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++)
            if (MS.grid[i][j].m) MS.grid[i][j].o = 1;
        msPaint();
        try { await fetch('/api/mines/lose', { method: 'POST' }); } catch (e) {}
        showToast('Сапёр', 'Мина!', '💣');
        return;
    }
    msFlood(r, c);
    msPaint();
    if (msWon()) {
        MS.alive = false;
        try {
            const res = await fetch('/api/mines/win', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: MS.token })
            });
            const d = await res.json();
            if (d.error) showToast('Сапёр', d.error, '!');
            else {
                showToast('Победа!', '+' + (d.reward || 10) + ' ✦', '✦');
                if (typeof loadProfile === 'function') loadProfile();
            }
        } catch (e) {
            showToast('Сапёр', 'Ошибка награды', '!');
        }
        MS.token = null;
    }
}

function msFlag(r, c) {
    if (!MS.alive) return;
    const cell = MS.grid[r][c];
    if (cell.o) return;
    cell.f = cell.f ? 0 : 1;
    MS.flags += cell.f ? 1 : -1;
    msPaint();
}

function msSetMode(mode) {
    MS.mode = mode;
    document.getElementById('btn-mines-mode-open')?.classList.toggle('active', mode === 'open');
    document.getElementById('btn-mines-mode-flag')?.classList.toggle('active', mode === 'flag');
}

async function msStart() {
    const st = await fetch('/api/mines/status').then(r => r.json()).catch(() => ({ left: 0, max: 10 }));
    const lab = document.getElementById('mines-left-label');
    if (lab) lab.textContent = (st.left ?? 0) + '/' + (st.max || 10);
    const res = await fetch('/api/mines/start', { method: 'POST' });
    const d = await res.json();
    if (d.error) {
        showToast('Сапёр', d.error, '!');
        return;
    }
    MS.token = d.token;
    MS.grid = msNewGrid();
    MS.alive = true;
    MS.flags = 0;
    MS.mode = 'open';
    msSetMode('open');
    if (lab) lab.textContent = d.left + '/10';
    msPaint();
}

async function openMinesModal() {
    const m = document.getElementById('modal-mines');
    if (!m) return;
    m.classList.remove('hidden');
    const st = await fetch('/api/mines/status').then(r => r.json()).catch(() => ({ left: '—', max: 10 }));
    const lab = document.getElementById('mines-left-label');
    if (lab) lab.textContent = (st.left ?? '—') + '/' + (st.max || 10);
    const bm = document.getElementById('mines-bombs');
    if (bm) bm.textContent = String(MS.bombs);
    if (!MS.alive) {
        const board = document.getElementById('mines-board');
        if (board) board.innerHTML = '<div class="mines-empty"><i class="fa-solid fa-bomb"></i><span>Нажми «Новая» чтобы начать</span></div>';
    }
}

// One-time board listeners (delegation)
(function bindMinesUI() {
    const board = document.getElementById('mines-board');
    if (board && !board.dataset.bound) {
        board.dataset.bound = '1';
        board.addEventListener('click', e => {
            const btn = e.target.closest('.mines-cell');
            if (!btn || !MS.alive) return;
            const r = +btn.dataset.r, c = +btn.dataset.c;
            if (MS.mode === 'flag') msFlag(r, c);
            else msOpen(r, c);
        });
        board.addEventListener('contextmenu', e => {
            e.preventDefault();
            const btn = e.target.closest('.mines-cell');
            if (!btn || !MS.alive) return;
            msFlag(+btn.dataset.r, +btn.dataset.c);
        });
        // long-press still works as quick flag
        let holdT = null;
        board.addEventListener('touchstart', e => {
            const btn = e.target.closest('.mines-cell');
            if (!btn || !MS.alive) return;
            holdT = setTimeout(() => {
                msFlag(+btn.dataset.r, +btn.dataset.c);
                holdT = null;
            }, 450);
        }, { passive: true });
        board.addEventListener('touchend', () => { if (holdT) clearTimeout(holdT); holdT = null; });
        board.addEventListener('touchmove', () => { if (holdT) clearTimeout(holdT); holdT = null; }, { passive: true });
    }

    document.getElementById('btn-mines-close')?.addEventListener('click', () => {
        document.getElementById('modal-mines')?.classList.add('hidden');
    });
    document.getElementById('btn-mines-new')?.addEventListener('click', () => msStart());

    document.getElementById('btn-mines-mode-open')?.addEventListener('click', () => msSetMode('open'));
    document.getElementById('btn-mines-mode-flag')?.addEventListener('click', () => msSetMode('flag'));

    // 3 taps on home logo
    let taps = 0, tmr = null;
    document.addEventListener('click', e => {
        const logo = e.target.closest('#home-logo-tap, #screen-home .header-logo, #screen-home .brand-logo');
        if (!logo) return;
        if (!document.getElementById('screen-home')?.classList.contains('active')) return;
        taps++;
        clearTimeout(tmr);
        tmr = setTimeout(() => { taps = 0; }, 900);
        if (taps >= 3) {
            taps = 0;
            try { openMinesModal(); } catch (err) { console.error(err); }
        }
    });
})();

