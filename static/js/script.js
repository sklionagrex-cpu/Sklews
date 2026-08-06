const socket = io();
let currentChannelId = null;
let currentChatUserId = null;
let currentSort = 'today';
let isSuperMode = false;

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

function loadHome() {
    loadChannels();
    loadMySubs();
}

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
            const badge = ch.is_boosted ? `<span style="font-size:11px;background:var(--accent);color:#fff;padding:2px 7px;border-radius:10px;margin-left:6px;">${ch.boost_level||'буст'}</span>` : '';
            card.innerHTML = `<div class="avatar">${ch.name[0].toUpperCase()}</div>
                <div class="channel-info"><h3>${escapeHtml(ch.name)}${badge}</h3>
                <p>${ch.subscribers} участников</p></div>`;
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
            feed.appendChild(card);
        });
    } catch (e) { console.error(e); }
}

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
            btnJoin.classList.remove('btn-primary');
            btnJoin.classList.add('btn-secondary');
        } else {
            btnJoin.textContent = 'Вступить';
            btnJoin.classList.add('btn-primary');
            btnJoin.classList.remove('btn-secondary');
        }
        const btnPost = document.getElementById('btn-add-post');
        if (ch.is_owner) btnPost.classList.remove('hidden');
        else btnPost.classList.add('hidden');
        loadPosts(id);
    } catch (e) { console.error(e); }
}

document.getElementById('btn-back-channel').addEventListener('click', () => {
    showScreen('screen-home');
    loadHome();
});

document.getElementById('btn-join').addEventListener('click', async () => {
    const isLeave = document.getElementById('btn-join').textContent === 'Покинуть';
    try {
        await fetch(`/api/channel/${currentChannelId}/${isLeave ? 'leave' : 'join'}`, { method: 'POST' });
        openChannel(currentChannelId);
        loadMySubs();
    } catch (e) { console.error(e); }
});

async function loadPosts(channelId) {
    try {
        const res = await fetch(`/api/channel/${channelId}/posts`);
        const posts = await res.json();
        const feed = document.getElementById('posts-feed');
        feed.innerHTML = '';
        if (!posts.length) {
            feed.innerHTML = '<div class="empty-state">Пока нет постов</div>';
            return;
        }
        posts.forEach(p => {
            const card = document.createElement('div');
            card.className = 'channel-card';
            card.style.flexDirection = 'column';
            card.style.alignItems = 'stretch';
            card.innerHTML = `<div style="display:flex;justify-content:space-between;margin-bottom:8px;">
                <strong>${escapeHtml(p.author)}</strong>
                <span style="font-size:12px;color:var(--muted)">${p.created_at}</span></div>
                <div style="margin-bottom:10px;white-space:pre-wrap;">${escapeHtml(p.content)}</div>
                <div style="display:flex;gap:16px;font-size:13px;color:var(--muted);">
                <span class="like-btn" data-id="${p.id}" style="cursor:pointer">❤️ ${p.likes}</span>
                <span>👁 ${p.views}</span></div>`;
            feed.appendChild(card);
        });
        document.querySelectorAll('.like-btn').forEach(btn => {
            btn.addEventListener('click', async e => {
                e.stopPropagation();
                const res = await fetch(`/api/post/${btn.dataset.id}/like`, { method: 'POST' });
                const data = await res.json();
                btn.innerHTML = `❤️ ${data.likes}`;
            });
        });
    } catch (e) { console.error(e); }
}

document.getElementById('btn-add-post').addEventListener('click', async () => {
    const content = prompt('Текст поста:');
    if (!content || !content.trim()) return;
    try {
        await fetch(`/api/channel/${currentChannelId}/post`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: content.trim() })
        });
        loadPosts(currentChannelId);
    } catch (e) { console.error(e); }
});

document.getElementById('btn-create-channel').addEventListener('click', () => {
    document.getElementById('modal-create').classList.remove('hidden');
    setTimeout(() => document.getElementById('new-channel-name').focus(), 100);
});

document.getElementById('btn-cancel-create').addEventListener('click', () => {
    document.getElementById('modal-create').classList.add('hidden');
});

document.getElementById('btn-confirm-create').addEventListener('click', async () => {
    const name = document.getElementById('new-channel-name').value.trim();
    const description = document.getElementById('new-channel-desc').value.trim();
    if (!name) return alert('Введите название канала');
    try {
        const res = await fetch('/api/channel/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description })
        });
        const data = await res.json();
        document.getElementById('modal-create').classList.add('hidden');
        document.getElementById('new-channel-name').value = '';
        document.getElementById('new-channel-desc').value = '';
        if (data.id) {
            openChannel(data.id);
            loadProfile();
        }
    } catch (e) {
        console.error(e);
        alert('Ошибка при создании');
    }
});

async function loadMyChannels() {
    loadMySubs();
}

async function loadProfile() {
    try {
        const res = await fetch('/api/profile');
        const p = await res.json();
        document.getElementById('profile-username').textContent = p.username;
        document.getElementById('profile-status').textContent = p.status || 'Статус не указан';
        document.getElementById('profile-crystals').textContent = p.crystals;
        document.getElementById('profile-friends').textContent = p.friends;
        document.getElementById('profile-channels').textContent = p.channels;
        document.getElementById('profile-avatar').textContent = p.username[0].toUpperCase();
    } catch (e) { console.error(e); }
}

document.getElementById('btn-logout').addEventListener('click', () => {
    window.location.href = '/logout';
});

document.getElementById('search-users').addEventListener('input', e => {
    const q = e.target.value.trim();
    if (q.length >= 2) searchUsers(q);
    else document.getElementById('search-results').innerHTML = '';
});

async function searchUsers(q) {
    const feed = document.getElementById('search-results');
    try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
        const users = await res.json();
        feed.innerHTML = '';
        if (!users.length) {
            feed.innerHTML = '<div class="empty-state">Никого не найдено</div>';
            return;
        }
        users.forEach(u => {
            const card = document.createElement('div');
            card.className = 'channel-card';
            let btn = '';
            if (u.friendship === 'none') {
                btn = `<button class="btn btn-primary" style="padding:8px 12px;font-size:13px;" onclick="sendFriendRequest(${u.id})">Добавить</button>`;
            } else if (u.friendship === 'pending') {
                btn = `<span class="muted" style="font-size:13px;">Запрос отправлен</span>`;
            } else {
                btn = `<button class="btn btn-primary" style="padding:8px 12px;font-size:13px;" onclick="openChat(${u.id}, '${escapeHtml(u.username)}')">Написать</button>`;
            }
            card.innerHTML = `<div class="avatar">${u.username[0].toUpperCase()}</div>
                <div class="channel-info"><h3>${escapeHtml(u.username)}</h3></div>${btn}`;
            feed.appendChild(card);
        });
    } catch (e) { console.error(e); }
}

async function sendFriendRequest(userId) {
    try {
        await fetch('/api/friends/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId })
        });
        const q = document.getElementById('search-users').value.trim();
        if (q) searchUsers(q);
    } catch (e) { console.error(e); }
}

async function loadFriendsAndRequests() {
    const feed = document.getElementById('search-results');
    try {
        const [friendsRes, reqsRes] = await Promise.all([
            fetch('/api/friends'),
            fetch('/api/friends/requests')
        ]);
        const friends = await friendsRes.json();
        const reqs = await reqsRes.json();
        let html = '';
        if (reqs.length) {
            html += '<div class="section-title" style="margin:12px 0 8px;">Входящие заявки</div>';
            reqs.forEach(r => {
                html += `<div class="channel-card">
                    <div class="avatar">${r.username[0].toUpperCase()}</div>
                    <div class="channel-info"><h3>${escapeHtml(r.username)}</h3></div>
                    <button class="btn btn-primary" style="padding:8px 12px;font-size:13px;" onclick="respondRequest(${r.id},'accept')">Принять</button>
                    <button class="btn btn-secondary" style="padding:8px 12px;font-size:13px;" onclick="respondRequest(${r.id},'reject')">Отклонить</button>
                </div>`;
            });
        }
        if (friends.length) {
            html += '<div class="section-title" style="margin:12px 0 8px;">Друзья</div>';
            friends.forEach(f => {
                html += `<div class="channel-card">
                    <div class="avatar">${f.username[0].toUpperCase()}</div>
                    <div class="channel-info"><h3>${escapeHtml(f.username)}</h3></div>
                    <button class="btn btn-primary" style="padding:8px 12px;font-size:13px;" onclick="openChat(${f.id}, '${escapeHtml(f.username)}')">Написать</button>
                </div>`;
            });
        }
        if (!html) html = '<div class="empty-state">Нет друзей и заявок<br>Найдите людей через поиск</div>';
        feed.innerHTML = html;
    } catch (e) { console.error(e); }
}

async function respondRequest(reqId, action) {
    try {
        await fetch('/api/friends/respond', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ request_id: reqId, action })
        });
        loadFriendsAndRequests();
    } catch (e) { console.error(e); }
}

function openChat(userId, username) {
    currentChatUserId = userId;
    isSuperMode = false;
    document.getElementById('chat-title').textContent = username;
    showScreen('screen-chat');
    loadMessages(userId);
}

document.getElementById('btn-back-chat').addEventListener('click', () => {
    showScreen('screen-chats');
    currentChatUserId = null;
});

async function loadMessages(userId) {
    try {
        const res = await fetch(`/api/messages/${userId}`);
        const messages = await res.json();
        const box = document.getElementById('messages');
        box.innerHTML = '';
        messages.forEach(m => {
            const div = document.createElement('div');
            div.className = `message ${m.is_mine ? 'mine' : 'theirs'}${m.is_super ? ' super' : ''}`;
            div.innerHTML = m.is_super
                ? `<span style="font-size:11px;opacity:0.85;">✦ SUPER</span><br>${escapeHtml(m.content)}`
                : escapeHtml(m.content);
            box.appendChild(div);
        });
        box.scrollTop = box.scrollHeight;
    } catch (e) { console.error(e); }
}

document.getElementById('btn-send').addEventListener('click', sendMessage);
document.getElementById('message-input').addEventListener('keypress', e => {
    if (e.key === 'Enter') { e.preventDefault(); sendMessage(); }
});

function sendMessage() {
    const input = document.getElementById('message-input');
    const content = input.value.trim();
    if (!content || !currentChatUserId) return;
    socket.emit('send_message', {
        receiver_id: currentChatUserId,
        content: content,
        is_super: isSuperMode
    });
    input.value = '';
    isSuperMode = false;
}

socket.on('new_message', data => {
    if (!document.getElementById('screen-chat').classList.contains('active')) return;
    if (data.sender_id !== currentChatUserId && !data.is_mine) return;
    const box = document.getElementById('messages');
    const div = document.createElement('div');
    div.className = `message ${data.is_mine ? 'mine' : 'theirs'}${data.is_super ? ' super' : ''}`;
    div.innerHTML = data.is_super
        ? `<span style="font-size:11px;opacity:0.85;">✦ SUPER</span><br>${escapeHtml(data.content)}`
        : escapeHtml(data.content);
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
});

socket.on('error', data => alert(data.msg || 'Ошибка'));

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

loadHome();
