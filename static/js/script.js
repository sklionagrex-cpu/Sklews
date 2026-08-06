const socket = io();
let currentChannelId = null;
let currentChatUserId = null;
let currentSort = 'today';
let isSuperMode = false;
let selectedBoostChannelId = null;
let longPressChannelId = null;

document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        showScreen('screen-' + tab);
        if (tab === 'home') loadHome();
        if (tab === 'profile') loadProfile();
        if (tab === 'create') loadMyChannels();
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

function loadHome() { loadChannels(); loadMySubs(); }

async function loadChannels() {
    try {
        const res = await fetch(`/api/channels?sort=${currentSort}`);
        const channels = await res.json();
        const feed = document.getElementById('channels-feed');
        feed.innerHTML = '';
        if (!channels.length) {
            feed.innerHTML = '<div class="empty-state">Пока нет каналов<br>Создай первый!</div>';
            return;
        }
        channels.forEach(ch => {
            const card = document.createElement('div');
            card.className = 'channel-card' + (ch.is_boosted ? ' boosted' : '');
            const badge = ch.label ? `<span class="boost-label">${ch.label}</span>` : '';
            card.innerHTML = `<div class="avatar" style="${ch.accent ? 'border-color:'+ch.accent : ''}">${ch.name[0].toUpperCase()}</div>
                <div class="channel-info"><h3>${escapeHtml(ch.name)} ${badge}</h3>
                <p>${ch.subscribers} участников${ch.views ? ' · ' + ch.views + ' просм.' : ''}</p></div>`;
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
            card.innerHTML = `<div class="avatar">${s.name[0].toUpperCase()}</div>
                <div class="channel-info"><h3>${escapeHtml(s.name)}</h3>
                <p>${escapeHtml(s.last_message)}</p></div>
                ${s.unread > 0 ? `<div class="badge-unread">${s.unread}</div>` : ''}`;
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
    await fetch(`/api/channel/${longPressChannelId}/notifications`, { method: 'POST' });
    document.getElementById('modal-sub-actions').classList.add('hidden');
    loadMySubs();
};
document.getElementById('btn-leave-from-modal').onclick = async () => {
    await fetch(`/api/channel/${longPressChannelId}/leave`, { method: 'POST' });
    document.getElementById('modal-sub-actions').classList.add('hidden');
    loadMySubs();
    loadHome();
};

document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentSort = btn.dataset.sort;
        loadChannels();
    });
});

async function openChannel(id) {
    currentChannelId = id;
    showScreen('screen-channel');
    try {
        const res = await fetch(`/api/channel/${id}`);
        const ch = await res.json();
        document.getElementById('channel-title').textContent = ch.name;
        document.getElementById('channel-name').textContent = ch.name;
        document.getElementById('channel-subs').textContent = ch.subscribers + ' участников';
        document.getElementById('channel-desc').textContent = ch.description || 'Нет описания';
        document.getElementById('channel-avatar').textContent = ch.name[0].toUpperCase();
        const btnJoin = document.getElementById('btn-join');
        if (ch.is_subscribed) {
            btnJoin.textContent = 'Покинуть';
            btnJoin.classList.remove('btn-primary'); btnJoin.classList.add('btn-secondary');
        } else {
            btnJoin.textContent = 'Вступить';
            btnJoin.classList.add('btn-primary'); btnJoin.classList.remove('btn-secondary');
        }
        const canPost = ch.is_owner || ch.role === 'admin' || ch.role === 'coauthor';
        document.getElementById('btn-add-post').classList.toggle('hidden', !canPost);
        document.getElementById('btn-analytics').classList.toggle('hidden', !ch.is_owner);
        loadPosts(id);
    } catch (e) { console.error(e); }
}

document.getElementById('btn-back-channel').onclick = () => { showScreen('screen-home'); loadHome(); };
document.getElementById('btn-join').onclick = async () => {
    const isLeave = document.getElementById('btn-join').textContent === 'Покинуть';
    await fetch(`/api/channel/${currentChannelId}/${isLeave ? 'leave' : 'join'}`, { method: 'POST' });
    openChannel(currentChannelId); loadMySubs();
};

document.getElementById('btn-channel-menu').onclick = async () => {
    if (!currentChannelId) return;
    const res = await fetch(`/api/channel/${currentChannelId}`);
    const ch = await res.json();
    if (ch.is_owner || ch.role === 'admin') {
        openRolesModal();
    } else {
        alert('Меню доступно владельцу и админам');
    }
};

async function openRolesModal() {
    document.getElementById('modal-roles').classList.remove('hidden');
    const res = await fetch(`/api/channel/${currentChannelId}/roles`);
    const roles = await res.json();
    const list = document.getElementById('roles-list');
    list.innerHTML = '';
    (roles || []).forEach(r => {
        list.innerHTML += `<div class="channel-card" style="margin-bottom:8px">
            <div class="avatar">${r.username[0].toUpperCase()}</div>
            <div class="channel-info"><h3>${escapeHtml(r.username)}</h3><p>${r.role}</p></div>
        </div>`;
    });
}
document.getElementById('btn-close-roles').onclick = () => document.getElementById('modal-roles').classList.add('hidden');
document.getElementById('btn-add-role').onclick = async () => {
    const username = document.getElementById('role-username').value.trim();
    const role = document.getElementById('role-select').value;
    if (!username) return alert('Введите логин');
    const search = await fetch(`/api/users/search?q=${encodeURIComponent(username)}`);
    const users = await search.json();
    const u = users.find(x => x.username.toLowerCase() === username.toLowerCase());
    if (!u) return alert('Пользователь не найден');
    await fetch(`/api/channel/${currentChannelId}/roles`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ user_id: u.id, role })
    });
    openRolesModal();
};

async function loadPosts(channelId) {
    try {
        const res = await fetch(`/api/channel/${channelId}/posts`);
        const posts = await res.json();
        const feed = document.getElementById('posts-feed');
        feed.innerHTML = '';
        if (!posts.length) { feed.innerHTML = '<div class="empty-state">Пока нет постов</div>'; return; }
        posts.forEach(p => {
            const card = document.createElement('div');
            card.className = 'channel-card';
            card.style.cssText = 'flex-direction:column;align-items:stretch';
            const pin = p.is_pinned ? '<span style="color:var(--accent);font-size:12px">📌 </span>' : '';
            card.innerHTML = `<div style="display:flex;justify-content:space-between;margin-bottom:8px">
                <strong>${pin}${escapeHtml(p.author)}</strong>
                <span style="font-size:12px;color:var(--muted)">${p.created_at}</span></div>
                <div style="margin-bottom:10px;white-space:pre-wrap">${escapeHtml(p.content)}</div>
                <div style="display:flex;gap:16px;font-size:13px;color:var(--muted)">
                <span class="like-btn" data-id="${p.id}" style="cursor:pointer">❤️ ${p.likes}</span>
                <span>👁 ${p.views}</span>
                <span class="pin-btn" data-id="${p.id}" style="cursor:pointer">📌</span></div>`;
            feed.appendChild(card);
        });
        document.querySelectorAll('.like-btn').forEach(btn => {
            btn.onclick = async e => {
                e.stopPropagation();
                const r = await fetch(`/api/post/${btn.dataset.id}/like`, { method: 'POST' });
                const d = await r.json();
                btn.innerHTML = `❤️ ${d.likes}`;
            };
        });
        document.querySelectorAll('.pin-btn').forEach(btn => {
            btn.onclick = async e => {
                e.stopPropagation();
                await fetch(`/api/post/${btn.dataset.id}/pin`, { method: 'POST' });
                loadPosts(channelId);
            };
        });
    } catch (e) { console.error(e); }
}

document.getElementById('btn-add-post').onclick = () => {
    document.getElementById('new-post-content').value = '';
    document.getElementById('modal-post').classList.remove('hidden');
};
document.getElementById('btn-cancel-post').onclick = () => document.getElementById('modal-post').classList.add('hidden');
document.getElementById('btn-confirm-post').onclick = async () => {
    const content = document.getElementById('new-post-content').value.trim();
    if (!content) return;
    await fetch(`/api/channel/${currentChannelId}/post`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ content })
    });
    document.getElementById('modal-post').classList.add('hidden');
    loadPosts(currentChannelId);
};

document.getElementById('btn-create-channel').onclick = () => {
    document.getElementById('new-channel-name').value = '';
    document.getElementById('new-channel-desc').value = '';
    document.getElementById('modal-create').classList.remove('hidden');
};
document.getElementById('btn-cancel-create').onclick = () => document.getElementById('modal-create').classList.add('hidden');
document.getElementById('btn-confirm-create').onclick = async () => {
    const name = document.getElementById('new-channel-name').value.trim();
    const description = document.getElementById('new-channel-desc').value.trim();
    if (!name) return alert('Введите название');
    const res = await fetch('/api/channel/create', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ name, description })
    });
    const data = await res.json();
    document.getElementById('modal-create').classList.add('hidden');
    if (data.id) { openChannel(data.id); loadProfile(); }
};

async function loadMyChannels() {
    try {
        const res = await fetch('/api/my_channels');
        const channels = await res.json();
        const list = document.getElementById('my-channels-list');
        list.innerHTML = '';
        if (!channels.length) {
            list.innerHTML = '<div class="empty-state">У вас пока нет каналов</div>';
            return;
        }
        channels.forEach(ch => {
            const card = document.createElement('div');
            card.className = 'channel-card';
            const badge = ch.is_boosted ? `<span class="boost-label">${ch.boost_level}</span>` : '';
            card.innerHTML = `<div class="avatar">${ch.name[0].toUpperCase()}</div>
                <div class="channel-info"><h3>${escapeHtml(ch.name)} ${badge}</h3>
                <p>${ch.subscribers} участников</p></div>
                <button class="btn btn-secondary btn-sm" data-id="${ch.id}">Буст</button>`;
            card.querySelector('.channel-info').onclick = () => openChannel(ch.id);
            card.querySelector('button').onclick = e => {
                e.stopPropagation();
                selectedBoostChannelId = ch.id;
                alert('Канал выбран для буста. Откройте Магазин в профиле.');
            };
            list.appendChild(card);
        });
    } catch (e) { console.error(e); }
}

async function loadProfile() {
    try {
        const res = await fetch('/api/profile');
        const p = await res.json();
        document.getElementById('profile-username').textContent = p.username + (p.is_premium ? ' 💎' : '');
        document.getElementById('profile-status').textContent = p.status || 'Нажми, чтобы изменить статус';
        document.getElementById('profile-crystals').textContent = p.crystals;
        document.getElementById('profile-friends').textContent = p.friends;
        document.getElementById('profile-channels').textContent = p.channels;
        document.getElementById('profile-avatar').textContent = p.username[0].toUpperCase();
        document.getElementById('shop-balance').textContent = p.crystals;
    } catch (e) { console.error(e); }
}

document.getElementById('btn-logout').onclick = () => location.href = '/logout';
document.getElementById('btn-edit-profile').onclick = () => {
    document.getElementById('edit-status').value = document.getElementById('profile-status').textContent;
    document.getElementById('modal-profile').classList.remove('hidden');
};
document.getElementById('btn-cancel-profile').onclick = () => document.getElementById('modal-profile').classList.add('hidden');
document.getElementById('btn-save-profile').onclick = async () => {
    const status = document.getElementById('edit-status').value.trim();
    await fetch('/api/profile/update', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ status })
    });
    document.getElementById('modal-profile').classList.add('hidden');
    loadProfile();
};
document.getElementById('profile-status').onclick = () => document.getElementById('btn-edit-profile').click();

document.getElementById('btn-daily').onclick = async () => {
    const res = await fetch('/api/daily_bonus', { method: 'POST' });
    const data = await res.json();
    alert(data.error || `+${data.bonus} ✦ получено!`);
    loadProfile();
};
document.getElementById('crystals-badge').onclick = () => document.getElementById('btn-daily').click();

document.getElementById('btn-open-shop').onclick = () => {
    loadProfile();
    document.getElementById('modal-shop').classList.remove('hidden');
};
document.getElementById('btn-close-shop').onclick = () => document.getElementById('modal-shop').classList.add('hidden');

document.querySelectorAll('.btn-boost').forEach(btn => {
    btn.onclick = async () => {
        if (!selectedBoostChannelId) return alert('Сначала выберите канал в разделе «Создать» (кнопка Буст)');
        const res = await fetch('/api/shop/boost', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ channel_id: selectedBoostChannelId, level: btn.dataset.level })
        });
        const data = await res.json();
        if (data.error) alert(data.error);
        else {
            alert(`Буст активирован до ${data.boost_until}\nОсталось: ${data.crystals} ✦`);
            loadProfile();
            loadMyChannels();
        }
    };
});
document.getElementById('btn-buy-premium').onclick = async () => {
    const res = await fetch('/api/shop/premium', { method: 'POST' });
    const data = await res.json();
    if (data.error) alert(data.error);
    else { alert('Премиум на 30 дней!'); loadProfile(); }
};

// Analytics
document.getElementById('btn-analytics').onclick = async () => {
    showScreen('screen-analytics');
    const res = await fetch(`/api/channel/${currentChannelId}/analytics`);
    const d = await res.json();
    document.getElementById('analytics-content').innerHTML = `
        <div class="profile-card" style="margin:0">
            <div class="profile-stats" style="margin-top:0">
                <div><span>${d.subscribers}</span>Подписчики</div>
                <div><span>${d.posts}</span>Посты</div>
            </div>
            <div class="profile-stats">
                <div><span>${d.likes}</span>Лайки</div>
                <div><span>${d.views}</span>Просмотры</div>
            </div>
            <p style="margin-top:16px;color:var(--muted);font-size:13px">Создан: ${d.created_at}</p>
        </div>`;
};
document.getElementById('btn-back-analytics').onclick = () => openChannel(currentChannelId);

// Search & Friends
document.getElementById('search-users').addEventListener('input', e => {
    const q = e.target.value.trim();
    if (q.length >= 2) searchUsers(q);
    else document.getElementById('search-results').innerHTML = '';
});

async function searchUsers(q) {
    const feed = document.getElementById('search-results');
    const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
    const users = await res.json();
    feed.innerHTML = '';
    if (!users.length) { feed.innerHTML = '<div class="empty-state">Никого не найдено</div>'; return; }
    users.forEach(u => {
        const card = document.createElement('div');
        card.className = 'channel-card';
        let btn = '';
        if (u.friendship === 'none') btn = `<button class="btn btn-primary btn-sm" onclick="sendFriendRequest(${u.id})">Добавить</button>`;
        else if (u.friendship === 'pending') btn = `<span class="muted" style="font-size:13px">Запрос отправлен</span>`;
        else btn = `<button class="btn btn-primary btn-sm" onclick="openChat(${u.id},'${escapeHtml(u.username)}')">Написать</button>`;
        card.innerHTML = `<div class="avatar">${u.username[0].toUpperCase()}</div>
            <div class="channel-info"><h3>${escapeHtml(u.username)}${u.is_premium?' 💎':''}</h3>
            <p style="font-size:12px;color:var(--muted)">${escapeHtml(u.status||'')}</p></div>${btn}`;
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
    let html = '';
    if (reqs.length) {
        html += '<div class="section-title">Входящие заявки</div>';
        reqs.forEach(r => {
            html += `<div class="channel-card">
                <div class="avatar">${r.username[0].toUpperCase()}</div>
                <div class="channel-info"><h3>${escapeHtml(r.username)}</h3></div>
                <button class="btn btn-primary btn-sm" onclick="respondRequest(${r.id},'accept')">Принять</button>
                <button class="btn btn-secondary btn-sm" onclick="respondRequest(${r.id},'reject')">Отклонить</button>
            </div>`;
        });
    }
    if (friends.length) {
        html += '<div class="section-title">Друзья</div>';
        friends.forEach(f => {
            html += `<div class="channel-card">
                <div class="avatar">${f.username[0].toUpperCase()}</div>
                <div class="channel-info"><h3>${escapeHtml(f.username)}</h3>
                <p style="font-size:12px;color:var(--muted)">${escapeHtml(f.status||'')}</p></div>
                <button class="btn btn-primary btn-sm" onclick="openChat(${f.id},'${escapeHtml(f.username)}')">Написать</button>
            </div>`;
        });
    }
    feed.innerHTML = html || '<div class="empty-state">Нет друзей и заявок<br>Ищите людей через поиск</div>';
}

async function respondRequest(id, action) {
    await fetch('/api/friends/respond', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ request_id: id, action })
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

async function loadMessages(userId) {
    const res = await fetch(`/api/messages/${userId}`);
    const messages = await res.json();
    const box = document.getElementById('messages');
    box.innerHTML = '';
    messages.forEach(m => {
        const div = document.createElement('div');
        div.className = `message ${m.is_mine?'mine':'theirs'}${m.is_super?' super':''}`;
        div.innerHTML = m.is_super ? `<span style="font-size:11px;opacity:.85">✦ SUPER</span><br>${escapeHtml(m.content)}` : escapeHtml(m.content);
        box.appendChild(div);
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
    socket.emit('send_message', { receiver_id: currentChatUserId, content, is_super: isSuperMode });
    input.value = '';
    isSuperMode = false;
    document.getElementById('btn-super').classList.remove('active');
}

socket.on('new_message', data => {
    if (!document.getElementById('screen-chat').classList.contains('active')) return;
    if (data.sender_id !== currentChatUserId && !data.is_mine) return;
    const box = document.getElementById('messages');
    const div = document.createElement('div');
    div.className = `message ${data.is_mine?'mine':'theirs'}${data.is_super?' super':''}`;
    div.innerHTML = data.is_super ? `<span style="font-size:11px;opacity:.85">✦ SUPER</span><br>${escapeHtml(data.content)}` : escapeHtml(data.content);
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
});
socket.on('error', d => alert(d.msg || 'Ошибка'));

function escapeHtml(t) {
    if (!t) return '';
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
}

loadHome();
