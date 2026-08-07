const socket = io();
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

document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        showScreen('screen-' + tab);
        if (tab === 'home') loadHome();
        if (tab === 'profile') loadProfile();
        if (tab === 'create') loadMyChannels();
        if (tab === 'analytics') loadAnalyticsTab();
        if (tab === 'shop') loadShop();
        if (tab === 'chats') {
            document.getElementById('search-results').innerHTML = '';
            document.getElementById('search-users').value = '';
            loadFriendsAndRequests();
        }
    });
});

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
}

function showToast(title, text, icon) {
    document.getElementById('toast-title').textContent = title || 'Готово';
    document.getElementById('toast-text').textContent = text || '';
    document.getElementById('toast-icon').textContent = icon || '✦';
    document.getElementById('modal-toast').classList.remove('hidden');
}
document.getElementById('btn-toast-ok').onclick = () => document.getElementById('modal-toast').classList.add('hidden');

function avatarHtml(letter, url, cls) {
    const c = cls || 'avatar';
    if (url) return `<div class="${c}" style="background-image:url(${url});background-size:cover;background-position:center"></div>`;
    return `<div class="${c}">${(letter||'?')[0].toUpperCase()}</div>`;
}

function escapeHtml(t) {
    if (!t) return '';
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
}

function loadHome() { loadChannels(); loadMySubs(); loadActivity(); }

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
        const feed = document.getElementById('channels-feed');
        feed.innerHTML = '';
        if (!channels.length) {
            feed.innerHTML = '<div class="empty-state">Нет новых каналов</div>';
            return;
        }
        channels.forEach(ch => {
            const card = document.createElement('div');
            card.className = 'channel-card' + (ch.is_boosted ? ' boosted boosted-' + (ch.boost_level || 'bronze') : '');
            const badge = ch.label ? '<span class="boost-label">' + ch.label + '</span>' : '';
            card.innerHTML = avatarHtml(ch.name, ch.avatar) +
                '<div class="channel-info"><h3>' + escapeHtml(ch.name) + ' ' + badge + '</h3><p>' + ch.subscribers + ' участников</p></div>';
            card.onclick = () => openChannel(ch.id);
            feed.appendChild(card);
        });
    } catch (e) { console.error(e); }
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
        const ch = await res.json();
        document.getElementById('channel-title').textContent = ch.name;
        document.getElementById('channel-name').textContent = ch.name;
        document.getElementById('channel-subs').textContent = ch.subscribers + ' участников';
        document.getElementById('channel-desc').textContent = ch.description || 'Нет описания';
        const av = document.getElementById('channel-avatar');
        if (ch.avatar) {
            av.style.backgroundImage = 'url(' + ch.avatar + ')';
            av.style.backgroundSize = 'cover';
            av.textContent = '';
        } else {
            av.style.backgroundImage = '';
            av.textContent = ch.name[0].toUpperCase();
        }
        const head = document.querySelector('.channel-header');
        if (ch.avatar) {
            head.style.background = 'linear-gradient(to bottom, rgba(12,10,20,0.4), var(--bg)), url(' + ch.avatar + ') center/cover';
        } else head.style.background = '';
        const btnJoin = document.getElementById('btn-join');
        if (ch.is_subscribed) {
            btnJoin.textContent = 'Покинуть';
            btnJoin.classList.remove('btn-primary'); btnJoin.classList.add('btn-secondary');
        } else {
            btnJoin.textContent = 'Вступить';
            btnJoin.classList.add('btn-primary'); btnJoin.classList.remove('btn-secondary');
        }
        document.getElementById('btn-analytics').classList.toggle('hidden', !ch.is_owner);
        document.getElementById('btn-edit-channel').classList.toggle('hidden', !ch.is_owner);
    } catch (e) { console.error(e); }
}

document.getElementById('btn-back-channel').onclick = () => { showScreen('screen-home'); loadHome(); };
document.getElementById('btn-watch').onclick = () => openPostsPage(currentChannelId);
document.getElementById('btn-join').onclick = async () => {
    const isLeave = document.getElementById('btn-join').textContent === 'Покинуть';
    await fetch('/api/channel/' + currentChannelId + '/' + (isLeave ? 'leave' : 'join'), { method: 'POST' });
    openChannel(currentChannelId);
    loadMySubs();
};

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
document.getElementById('btn-back-posts').onclick = () => openChannel(currentChannelId);

document.getElementById('btn-channel-menu').onclick = async () => {
    const res = await fetch('/api/channel/' + currentChannelId);
    const ch = await res.json();
    if (ch.is_owner || ch.role === 'admin') openRolesModal();
    else showToast('Меню', 'Доступно владельцу и админам', '!');
};

async function openRolesModal() {
    document.getElementById('modal-roles').classList.remove('hidden');
    const res = await fetch('/api/channel/' + currentChannelId + '/roles');
    const roles = await res.json();
    const list = document.getElementById('roles-list');
    list.innerHTML = '';
    (roles || []).forEach(r => {
        list.innerHTML += '<div class="channel-card" style="margin-bottom:8px">' + avatarHtml(r.username) +
            '<div class="channel-info"><h3>' + escapeHtml(r.username) + '</h3><p>' + r.role + '</p></div></div>';
    });
}
document.getElementById('btn-close-roles').onclick = () => document.getElementById('modal-roles').classList.add('hidden');
document.getElementById('btn-add-role').onclick = async () => {
    const username = document.getElementById('role-username').value.trim();
    const role = document.getElementById('role-select').value;
    if (!username) return showToast('Ошибка', 'Введите логин', '!');
    const search = await fetch('/api/users/search?q=' + encodeURIComponent(username));
    const users = await search.json();
    const u = users.find(x => x.username.toLowerCase() === username.toLowerCase());
    if (!u) return showToast('Ошибка', 'Не найден', '!');
    await fetch('/api/channel/' + currentChannelId + '/roles', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ user_id: u.id, role })
    });
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
        if (p.media_type === 'video' && p.media_url) {
            media = '<video class="media-clickable" data-type="video" data-src="' + p.media_url + '" src="' + p.media_url + '" controls playsinline style="width:100%;border-radius:12px;margin-bottom:10px;max-height:280px;background:#000"></video>';
        }
        const reacts = p.reactions || {};
        const reactStr = Object.entries(reacts).map(([e, n]) => e + ' ' + n).join(' ');
        card.innerHTML = '<div style="display:flex;justify-content:space-between;margin-bottom:8px"><strong>' + pin + escapeHtml(p.author) + '</strong><span style="font-size:12px;color:var(--muted)">' + p.created_at + '</span></div>' +
            media +
            '<div style="margin-bottom:10px;white-space:pre-wrap">' + escapeHtml(p.content) + '</div>' +
            '<div style="display:flex;gap:16px;font-size:13px;color:var(--muted);align-items:center;flex-wrap:wrap">' +
            '<span class="like-btn" data-id="' + p.id + '" style="cursor:pointer;' + (p.liked ? 'color:var(--accent)' : '') + '"><i class="fa-solid fa-heart"></i> ' + p.likes + '</span>' +
            '<span class="comment-btn" data-id="' + p.id + '" style="cursor:pointer"><i class="fa-solid fa-comment"></i> ' + (p.comments || 0) + '</span>' +
            '<span><i class="fa-solid fa-eye"></i> ' + p.views + '</span>' +
            '<span class="pin-btn" data-id="' + p.id + '" style="cursor:pointer"><i class="fa-solid fa-thumbtack"></i></span></div>' +
            (reactStr ? '<div style="font-size:12px;color:var(--muted);margin-top:6px">' + reactStr + '</div>' : '');
        let lt;
        const startLP = () => { lt = setTimeout(() => openReactModal(p.id), 500); };
        const cancelLP = () => clearTimeout(lt);
        card.addEventListener('touchstart', startLP);
        card.addEventListener('mousedown', startLP);
        card.addEventListener('touchend', cancelLP);
        card.addEventListener('mouseup', cancelLP);
        card.addEventListener('touchmove', cancelLP);
        feed.appendChild(card);
    });
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
    img.style.display = 'none'; vid.style.display = 'none'; vid.pause();
    if (type === 'video') { vid.src = src; vid.style.display = 'block'; }
    else { img.src = src; img.style.display = 'block'; }
    document.getElementById('media-lightbox').classList.remove('hidden');
}
document.getElementById('btn-close-lightbox').onclick = () => {
    document.getElementById('media-lightbox').classList.add('hidden');
    document.getElementById('lightbox-video').pause();
};

document.getElementById('btn-add-post').onclick = () => {
    document.getElementById('new-post-content').value = '';
    document.getElementById('post-photo-preview').style.display = 'none';
    pendingPostPhoto = null;
    document.getElementById('modal-post').classList.remove('hidden');
};
document.getElementById('btn-cancel-post').onclick = () => document.getElementById('modal-post').classList.add('hidden');
document.getElementById('btn-add-photo').onclick = () => document.getElementById('post-photo-input').click();
document.getElementById('btn-add-video').onclick = () => document.getElementById('post-video-input').click();
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
    if (!content && !pendingPostPhoto) return;
    let media_url = '', media_type = 'text';
    if (pendingPostPhoto) {
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
        body: JSON.stringify({ content: content || '📷', media_type: media_type, media_url: media_url })
    });
    document.getElementById('modal-post').classList.add('hidden');
    pendingPostPhoto = null;
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
    document.getElementById('modal-create').classList.add('hidden');
    if (data.id) { openChannel(data.id); loadProfile(); loadMyChannels(); }
};

document.getElementById('btn-edit-channel').onclick = async () => {
    const res = await fetch('/api/channel/' + currentChannelId);
    const ch = await res.json();
    document.getElementById('edit-channel-name').value = ch.name;
    document.getElementById('edit-channel-desc').value = ch.description || '';
    document.getElementById('modal-edit-channel').classList.remove('hidden');
};
document.getElementById('btn-cancel-edit-ch').onclick = () => document.getElementById('modal-edit-channel').classList.add('hidden');
document.getElementById('btn-save-edit-ch').onclick = async () => {
    const name = document.getElementById('edit-channel-name').value.trim();
    const description = document.getElementById('edit-channel-desc').value.trim();
    const res = await fetch('/api/channel/' + currentChannelId + '/update', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ name: name, description: description })
    });
    const data = await res.json();
    if (data.error) showToast('Ошибка', data.error, '!');
    else {
        document.getElementById('modal-edit-channel').classList.add('hidden');
        showToast('Сохранено', 'Канал обновлён', '✓');
        openChannel(currentChannelId);
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
        list.appendChild(card);
    });
}

async function loadProfile() {
    const res = await fetch('/api/profile');
    const p = await res.json();
    document.getElementById('profile-username').textContent = p.username + (p.is_premium ? ' 💎' : '');
    document.getElementById('profile-status').textContent = p.status || 'Статус не указан';
    document.getElementById('profile-crystals').textContent = p.crystals;
    document.getElementById('profile-friends').textContent = p.hide_friends ? '•' : p.friends;
    const av = document.getElementById('profile-avatar');
    if (p.avatar) {
        av.style.backgroundImage = 'url(' + p.avatar + ')';
        av.style.backgroundSize = 'cover';
        av.textContent = '';
    } else {
        av.style.backgroundImage = '';
        av.textContent = p.username[0].toUpperCase();
    }
    const sb = document.getElementById('shop-balance');
    if (sb) sb.textContent = p.crystals;
}

document.getElementById('btn-settings').onclick = () => document.getElementById('modal-settings').classList.remove('hidden');
document.getElementById('btn-close-settings').onclick = () => document.getElementById('modal-settings').classList.add('hidden');
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
    const res = await fetch('/api/friends');
    const friends = await res.json();
    const list = document.getElementById('friends-page-list');
    list.innerHTML = '';
    if (!friends.length) list.innerHTML = '<div class="empty-state">Нет друзей</div>';
    friends.forEach(f => {
        const card = document.createElement('div');
        card.className = 'channel-card';
        card.innerHTML = avatarHtml(f.username, f.avatar) +
            '<div class="channel-info"><h3>' + escapeHtml(f.username) + '</h3><p style="font-size:12px;color:var(--muted)">' + escapeHtml(f.status||'') + '</p></div>' +
            '<button class="btn btn-primary btn-sm"><i class="fa-solid fa-paper-plane"></i></button>';
        card.querySelector('.channel-info').onclick = () => openUserProfile(f.id);
        const av = card.querySelector('.avatar');
        if (av) av.onclick = () => openUserProfile(f.id);
        card.querySelector('button').onclick = e => { e.stopPropagation(); openChat(f.id, f.username); };
        list.appendChild(card);
    });
};
document.getElementById('btn-back-friends').onclick = () => { showScreen('screen-profile'); loadProfile(); };

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
document.getElementById('btn-back-subs').onclick = () => { showScreen('screen-profile'); loadProfile(); };

async function openUserProfile(userId) {
    showScreen('screen-user');
    const res = await fetch('/api/user/' + userId);
    const u = await res.json();
    document.getElementById('user-username').textContent = u.username + (u.is_premium ? ' 💎' : '');
    document.getElementById('user-status').textContent = u.status || '';
    document.getElementById('user-friends').textContent = u.friends_count === null ? '•' : (u.friends_count ?? 0);
    document.getElementById('user-channels').textContent = u.channels_count === null ? '•' : (u.channels_count ?? 0);
    const av = document.getElementById('user-avatar');
    if (u.avatar) {
        av.style.backgroundImage = 'url(' + u.avatar + ')';
        av.style.backgroundSize = 'cover';
        av.textContent = '';
    } else {
        av.style.backgroundImage = '';
        av.textContent = u.username[0].toUpperCase();
    }
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
        mb.onclick = () => openChat(u.id, u.username);
    }
}
document.getElementById('btn-back-user').onclick = () => { showScreen('screen-chats'); };

async function loadShop() {
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

async function openComments(postId) {
    currentCommentPostId = postId;
    document.getElementById('modal-comments').classList.remove('hidden');
    const res = await fetch('/api/post/' + postId + '/comments');
    const comments = await res.json();
    const list = document.getElementById('comments-list');
    list.innerHTML = comments.length ? '' : '<div class="empty-state">Нет комментариев</div>';
    comments.forEach(c => {
        list.innerHTML += '<div class="channel-card" style="margin-bottom:8px"><div class="channel-info"><h3>' +
            escapeHtml(c.username) + '</h3><p style="white-space:normal">' + escapeHtml(c.content) +
            '</p><span style="font-size:11px;color:var(--muted)">' + c.created_at + '</span></div></div>';
    });
}
document.getElementById('btn-close-comments').onclick = () => document.getElementById('modal-comments').classList.add('hidden');
document.getElementById('btn-send-comment').onclick = async () => {
    const content = document.getElementById('comment-input').value.trim();
    if (!content || !currentCommentPostId) return;
    await fetch('/api/post/' + currentCommentPostId + '/comments', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ content: content })
    });
    document.getElementById('comment-input').value = '';
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
            '<div class="channel-info"><h3>' + escapeHtml(u.username) + (u.is_premium?' 💎':'') + '</h3>' +
            '<p style="font-size:12px;color:var(--muted)">' + escapeHtml(u.status||'') + '</p></div>' + btn;
        card.querySelector('.channel-info').onclick = () => openUserProfile(u.id);
        const b = card.querySelector('button');
        if (b) {
            if (u.friendship === 'none') b.onclick = e => { e.stopPropagation(); sendFriendRequest(u.id); };
            else if (u.friendship === 'accepted') b.onclick = e => { e.stopPropagation(); openChat(u.id, u.username); };
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
            card.querySelector('button').onclick = e => { e.stopPropagation(); openChat(f.id, f.username); };
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

function openChat(userId, username) {
    currentChatUserId = userId;
    isSuperMode = false;
    document.getElementById('btn-super').classList.remove('active');
    document.getElementById('chat-title').textContent = username;
    showScreen('screen-chat');
    loadMessages(userId);
}
document.getElementById('btn-back-chat').onclick = () => { showScreen('screen-chats'); currentChatUserId = null; };

function formatMessage(content, isSuper) {
    let body = content || '';
    if (body.startsWith('[photo]')) body = '<img class="media-clickable" data-type="photo" data-src="' + body.slice(7) + '" src="' + body.slice(7) + '" style="max-width:220px;border-radius:12px">';
    else if (body.startsWith('[video]')) body = '<video src="' + body.slice(7) + '" controls playsinline style="max-width:220px;border-radius:12px"></video>';
    else if (body.startsWith('[voice]')) body = '<audio src="' + body.slice(7) + '" controls style="max-width:220px"></audio>';
    else body = escapeHtml(body);
    return (isSuper ? '<span style="font-size:11px;opacity:.85"><i class="fa-solid fa-bolt"></i> SUPER</span><br>' : '') + body;
}

async function loadMessages(userId) {
    const res = await fetch('/api/messages/' + userId);
    const messages = await res.json();
    const box = document.getElementById('messages');
    box.innerHTML = '';
    messages.forEach(m => {
        const div = document.createElement('div');
        div.className = 'message ' + (m.is_mine ? 'mine' : 'theirs') + (m.is_super ? ' super' : '');
        div.innerHTML = formatMessage(m.content, m.is_super);
        box.appendChild(div);
    });
    box.querySelectorAll('.media-clickable').forEach(el => {
        el.onclick = () => openLightbox(el.dataset.type, el.dataset.src);
    });
    box.scrollTop = box.scrollHeight;
}

document.getElementById('btn-super').onclick = () => {
    isSuperMode = !isSuperMode;
    document.getElementById('btn-super').classList.toggle('active', isSuperMode);
};
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
    document.getElementById('btn-super').classList.remove('active');
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
let mediaRecorder = null, voiceChunks = [];
document.getElementById('btn-voice').onclick = async () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        document.getElementById('btn-voice').classList.remove('active');
        return;
    }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        voiceChunks = [];
        mediaRecorder.ondataavailable = e => voiceChunks.push(e.data);
        mediaRecorder.onstop = async () => {
            const blob = new Blob(voiceChunks, { type: 'audio/webm' });
            const fd = new FormData();
            fd.append('file', blob, 'voice.webm');
            const up = await fetch('/api/upload', { method: 'POST', body: fd });
            const ud = await up.json();
            if (ud.url && currentChatUserId) {
                socket.emit('send_message', { receiver_id: currentChatUserId, content: '[voice]' + ud.url, is_super: false });
            }
            stream.getTracks().forEach(t => t.stop());
        };
        mediaRecorder.start();
        document.getElementById('btn-voice').classList.add('active');
        showToast('Запись', 'Нажми ещё раз чтобы отправить', '🎤');
    } catch (err) {
        showToast('Ошибка', 'Нет доступа к микрофону', '!');
    }
};

socket.on('new_message', data => {
    if (!document.getElementById('screen-chat').classList.contains('active')) return;
    if (data.sender_id !== currentChatUserId && !data.is_mine) return;
    const box = document.getElementById('messages');
    const div = document.createElement('div');
    div.className = 'message ' + (data.is_mine ? 'mine' : 'theirs') + (data.is_super ? ' super' : '');
    div.innerHTML = formatMessage(data.content, data.is_super);
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
});
socket.on('error', d => showToast('Ошибка', d.msg || 'Ошибка', '!'));

loadHome();
