const socket = io();

let currentChannelId = null;
let currentChatUserId = null;
let currentSort = 'today';

// ========== NAVIGATION ==========
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
        }
    });
});

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
}

// ========== HOME ==========
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
            card.className = 'channel-card';
            card.innerHTML = `
                <div class="avatar">${ch.name[0].toUpperCase()}</div>
                <div class="channel-info">
                    <h3>${escapeHtml(ch.name)}</h3>
                    <p>${ch.subscribers} участников</p>
                </div>
            `;
            card.onclick = () => openChannel(ch.id);
            feed.appendChild(card);
        });
    } catch (e) {
        console.error(e);
    }
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
            card.innerHTML = `
                <div class="avatar">${s.name[0].toUpperCase()}</div>
                <div class="channel-info">
                    <h3>${escapeHtml(s.name)}</h3>
                    <p>${escapeHtml(s.last_message)}</p>
                </div>
                \( {s.unread > 0 ? `<div class="badge-unread"> \){s.unread}</div>` : ''}
            `;
            card.onclick = () => openChannel(s.id);
            feed.appendChild(card);
        });
    } catch (e) {
        console.error(e);
    }
}

document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentSort = btn.dataset.sort;
        loadChannels();
    });
});

// ========== CHANNEL ==========
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
        if (ch.is_owner) {
            btnPost.classList.remove('hidden');
        } else {
            btnPost.classList.add('hidden');
        }

        loadPosts(id);
    } catch (e) {
        console.error(e);
    }
}

document.getElementById('btn-back-channel').addEventListener('click', () => {
    showScreen('screen-home');
    loadHome();
});

document.getElementById('btn-join').addEventListener('click', async () => {
    const btn = document.getElementById('btn-join');
    try {
        if (btn.textContent.trim() === 'Вступить') {
            await fetch(`/api/channel/${currentChannelId}/join`, { method: 'POST' });
        } else {
            await fetch(`/api/channel/${currentChannelId}/leave`, { method: 'POST' });
        }
        openChannel(currentChannelId);
    } catch (e) {
        console.error(e);
    }
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
            card.className = 'post-card';
            card.innerHTML = `
                <div class="author">${escapeHtml(p.author)}</div>
                <div class="content">${escapeHtml(p.content)}</div>
                <div class="post-meta">
                    <span><i class="fa-regular fa-heart"></i> ${p.likes}</span>
                    <span><i class="fa-regular fa-comment"></i> ${p.comments}</span>
                    <span>${p.created_at}</span>
                </div>
            `;
            feed.appendChild(card);
        });
    } catch (e) {
        console.error(e);
    }
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
    } catch (e) {
        console.error(e);
    }
});

// ========== CREATE CHANNEL ==========
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

    if (!name) {
        alert('Введите название канала');
        return;
    }

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
        }
    } catch (e) {
        console.error(e);
        alert('Ошибка при создании');
    }
});

async function loadMyChannels() {
    loadMySubs();
}

// ========== PROFILE ==========
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
    } catch (e) {
        console.error(e);
    }
}

document.getElementById('btn-logout').addEventListener('click', () => {
    window.location.href = '/logout';
});

// ========== SEARCH ==========
let searchTimeout = null;

document.getElementById('search-users').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const q = e.target.value.trim();
    searchTimeout = setTimeout(() => searchUsers(q), 350);
});

async function searchUsers(q) {
    const feed = document.getElementById('search-results');

    if (q.length < 2) {
        feed.innerHTML = '';
        return;
    }

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
            card.className = 'user-card';

            let actionHtml = '';
            if (u.friendship === 'none') {
                actionHtml = `<button class="btn btn-primary" style="padding:8px 14px;font-size:13px;flex:0;" onclick="event.stopPropagation();sendFriendRequest(${u.id})">Добавить</button>`;
            } else if (u.friendship === 'pending') {
                actionHtml = `<span style="color:var(--muted);font-size:13px;">Ожидание</span>`;
            } else {
                actionHtml = `<button class="btn btn-secondary" style="padding:8px 14px;font-size:13px;flex:0;" onclick="event.stopPropagation();openChat(\( {u.id}, ' \){escapeHtml(u.username)}')">Написать</button>`;
            }

            card.innerHTML = `
                <div class="avatar">${u.username[0].toUpperCase()}</div>
                <div class="channel-info">
                    <h3>${escapeHtml(u.username)}</h3>
                </div>
                ${actionHtml}
            `;
            feed.appendChild(card);
        });
    } catch (e) {
        console.error(e);
    }
}

async function sendFriendRequest(userId) {
    try {
        await fetch('/api/friends/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId })
        });
        searchUsers(document.getElementById('search-users').value.trim());
    } catch (e) {
        console.error(e);
    }
}

// ========== CHAT ==========
function openChat(userId, username) {
    currentChatUserId = userId;
    document.getElementById('chat-title').textContent = username;
    showScreen('screen-chat');
    loadMessages(userId);
}

document.getElementById('btn-back-chat').addEventListener('click', () => {
    showScreen('screen-chats');
});

async function loadMessages(userId) {
    try {
        const res = await fetch(`/api/messages/${userId}`);
        const messages = await res.json();
        const box = document.getElementById('messages');
        box.innerHTML = '';

        messages.forEach(m => {
            const div = document.createElement('div');
            div.className = `message ${m.is_mine ? 'mine' : 'theirs'}`;
            div.textContent = m.content;
            box.appendChild(div);
        });

        box.scrollTop = box.scrollHeight;
    } catch (e) {
        console.error(e);
    }
}

document.getElementById('btn-send').addEventListener('click', sendMessage);

document.getElementById('message-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        sendMessage();
    }
});

function sendMessage() {
    const input = document.getElementById('message-input');
    const content = input.value.trim();
    if (!content || !currentChatUserId) return;

    socket.emit('send_message', {
        receiver_id: currentChatUserId,
        content: content
    });

    input.value = '';
}

socket.on('new_message', (data) => {
    if (!document.getElementById('screen-chat').classList.contains('active')) return;

    const box = document.getElementById('messages');
    const div = document.createElement('div');
    div.className = `message ${data.is_mine ? 'mine' : 'theirs'}`;
    div.textContent = data.content;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
});

// ========== HELPERS ==========
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Start
loadHome();
