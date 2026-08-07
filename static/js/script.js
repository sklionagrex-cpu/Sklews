const socket = io();
let currentChannelId = null;
let currentChatUserId = null;
let currentSort = 'today';
let isSuperMode = false;
let selectedBoostChannelId = null;
let longPressChannelId = null;
let pendingPostPhoto = null;

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

function loadHome() { loadChannels(); loadMySubs(); loadActivity(); }
async function loadActivity() {
    try {
        const res = await fetch('/api/activity');
        const d = await res.json();
        const el = document.getElementById('activity-line');
        if (el) el.textContent = 'Активность: ' + (d.today || 0) + ' постов за сегодня';
    } catch(e) {}
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
            card.className = 'channel-card' + (ch.is_boosted ? ' boosted boosted-' + (ch.boost_level || 'bronze') : '');
            const badge = ch.label ? `<span class="boost-label">${ch.label}</span>` : '';
            card.innerHTML = `<div class="avatar">${ch.name[0].toUpperCase()}</div>
                <div class="channel-info"><h3>${escapeHtml(ch.name)} ${badge}</h3>
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
        document.getElementById('btn-edit-channel').classList.toggle('hidden', !ch.is_owner);
        document.getElementById('btn-watch').style.display = ch.is_subscribed || ch.is_owner ? 'none' : '';
        // wallpaper style header
        const head = document.querySelector('.channel-header');
        if (ch.avatar) {
            head.style.background = `linear-gradient(to bottom, rgba(12,10,20,0.3), var(--bg)), url(${ch.avatar}) center/cover`;
        } else {
            head.style.background = '';
        }
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
    if (ch.is_owner || ch.role === 'admin') openRolesModal();
    else showToast('Меню', 'Доступно владельцу и админам', '!');
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
    if (!username) return showToast('Ошибка', 'Введите логин', '!');
    const search = await fetch(`/api/users/search?q=${encodeURIComponent(username)}`);
    const users = await search.json();
    const u = users.find(x => x.username.toLowerCase() === username.toLowerCase());
    if (!u) return showToast('Ошибка', 'Пользователь не найден', '!');
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
            let mediaHtml = '';
            if (p.media_type === 'photo' && p.media_url) mediaHtml = `<img src="${p.media_url}" style="width:100%;border-radius:12px;margin-bottom:10px;max-height:280px;object-fit:cover">`;
            if (p.media_type === 'video' && p.media_url) mediaHtml = `<video src="${p.media_url}" controls playsinline style="width:100%;border-radius:12px;margin-bottom:10px;max-height:280px;background:#000"></video>`;
            const photo = mediaHtml;
            card.innerHTML = `<div style="display:flex;justify-content:space-between;margin-bottom:8px">
                <strong>${pin}${escapeHtml(p.author)}</strong>
                <span style="font-size:12px;color:var(--muted)">${p.created_at}</span></div>
                ${photo}
                <div style="margin-bottom:10px;white-space:pre-wrap">${escapeHtml(p.content)}</div>
                <div style="display:flex;gap:16px;font-size:13px;color:var(--muted)">
                <span class="like-btn" data-id="${p.id}" style="cursor:pointer">❤️ ${p.likes}</span>
                <span class="comment-btn" data-id="${p.id}" style="cursor:pointer">💬 ${p.comments || 0}</span>
                <span>👁 ${p.views}</span>
                <span class="pin-btn" data-id="${p.id}" style="cursor:pointer">📌</span></div>
                <div class="react-bar">
                    <button class="react-btn" data-id="${p.id}" data-emoji="🔥">🔥</button>
                    <button class="react-btn" data-id="${p.id}" data-emoji="✨">✨</button>
                    <button class="react-btn" data-id="${p.id}" data-emoji="❤️‍🔥">❤️‍🔥</button>
                </div>`;
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

        document.querySelectorAll('.comment-btn').forEach(btn => {
            btn.onclick = async e => {
                e.stopPropagation();
                openComments(btn.dataset.id);
            };
        });
        document.querySelectorAll('.react-btn').forEach(btn => {
            btn.onclick = async e => {
                e.stopPropagation();
                const r = await fetch(`/api/post/${btn.dataset.id}/react`, {
                    method: 'POST', headers: {'Content-Type':'application/json'},
                    body: JSON.stringify({ emoji: btn.dataset.emoji })
                });
                const d = await r.json();
                const likeBtn = btn.closest('.channel-card').querySelector('.like-btn');
                if (likeBtn) likeBtn.innerHTML = `❤️ ${d.likes}`;
            };
        });

    } catch (e) { console.error(e); }
}

let currentCommentPostId = null;
async function openComments(postId) {
    currentCommentPostId = postId;
    document.getElementById('modal-comments').classList.remove('hidden');
    const res = await fetch(`/api/post/${postId}/comments`);
    const comments = await res.json();
    const list = document.getElementById('comments-list');
    list.innerHTML = comments.length ? '' : '<div class="empty-state">Пока нет комментариев</div>';
    comments.forEach(c => {
        list.innerHTML += `<div class="channel-card" style="margin-bottom:8px">
            <div class="channel-info"><h3>${escapeHtml(c.username)}</h3>
            <p style="white-space:normal">${escapeHtml(c.content)}</p>
            <span style="font-size:11px;color:var(--muted)">${c.created_at}</span></div></div>`;
    });
}
document.getElementById('btn-close-comments').onclick = () => document.getElementById('modal-comments').classList.add('hidden');
document.getElementById('btn-send-comment').onclick = async () => {
    const content = document.getElementById('comment-input').value.trim();
    if (!content || !currentCommentPostId) return;
    await fetch(`/api/post/${currentCommentPostId}/comments`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ content })
    });
    document.getElementById('comment-input').value = '';
    openComments(currentCommentPostId);
    if (currentChannelId) loadPosts(currentChannelId);
};


document.getElementById('btn-add-post').onclick = () => {
    document.getElementById('new-post-content').value = '';
    document.getElementById('post-photo-preview').style.display = 'none';
    document.getElementById('post-photo-input').value = '';
    pendingPostPhoto = null;
    document.getElementById('modal-post').classList.remove('hidden');
};
document.getElementById('btn-cancel-post').onclick = () => document.getElementById('modal-post').classList.add('hidden');
document.getElementById('btn-add-photo').onclick = () => document.getElementById('post-photo-input').click();
document.getElementById('btn-add-video')?.addEventListener('click', () => document.getElementById('post-video-input').click());
document.getElementById('post-video-input')?.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    pendingPostPhoto = file; // reuse var for any media
    pendingPostPhoto._type = 'video';
    document.getElementById('post-photo-preview').style.display = 'block';
    document.getElementById('post-photo-img').src = '';
    document.getElementById('post-photo-img').alt = '🎬 ' + file.name;
    document.getElementById('post-photo-img').style.display = 'none';
    let v = document.getElementById('post-video-preview');
    if (!v) {
        v = document.createElement('video');
        v.id = 'post-video-preview';
        v.controls = true;
        v.style.cssText = 'width:100%;max-height:200px;border-radius:12px';
        document.getElementById('post-photo-preview').appendChild(v);
    }
    v.src = URL.createObjectURL(file);
    v.style.display = 'block';
});
document.getElementById('post-photo-input').onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    pendingPostPhoto = file;
    document.getElementById('post-photo-img').src = URL.createObjectURL(file);
    document.getElementById('post-photo-preview').style.display = 'block';
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
        media_type = (pendingPostPhoto._type === 'video') ? 'video' : 'photo';
    }
    await fetch(`/api/channel/${currentChannelId}/post`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ content: content || '📷', media_type, media_url })
    });
    document.getElementById('modal-post').classList.add('hidden');
    pendingPostPhoto = null;
    loadPosts(currentChannelId);
};

document.getElementById('btn-create-channel').onclick = () => {
    document.getElementById('new-channel-name').value = '';
    document.getElementById('new-channel-desc').value = '';
    document.getElementById('modal-create').classList.remove('hidden');
};
document.getElementById('btn-cancel-create').onclick = () => document.getElementById('modal-create').classList.add('hidden');
let pendingChannelAvatar = null;
document.getElementById('new-channel-avatar-preview')?.addEventListener('click', () => document.getElementById('new-channel-avatar').click());
document.getElementById('new-channel-avatar')?.addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    pendingChannelAvatar = f;
    const prev = document.getElementById('new-channel-avatar-preview');
    prev.style.backgroundImage = `url(${URL.createObjectURL(f)})`;
    prev.style.backgroundSize = 'cover';
    prev.textContent = '';
});
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
        body: JSON.stringify({ name, description, avatar })
    });
    const data = await res.json();
    document.getElementById('modal-create').classList.add('hidden');
    pendingChannelAvatar = null;
    if (data.id) { openChannel(data.id); loadProfile(); }
};
document.getElementById('btn-edit-channel').onclick = async () => {
    const res = await fetch(`/api/channel/${currentChannelId}`);
    const ch = await res.json();
    document.getElementById('edit-channel-name').value = ch.name;
    document.getElementById('edit-channel-desc').value = ch.description || '';
    document.getElementById('modal-edit-channel').classList.remove('hidden');
};
document.getElementById('btn-cancel-edit-ch').onclick = () => document.getElementById('modal-edit-channel').classList.add('hidden');
document.getElementById('btn-save-edit-ch').onclick = async () => {
    const name = document.getElementById('edit-channel-name').value.trim();
    const description = document.getElementById('edit-channel-desc').value.trim();
    const res = await fetch(`/api/channel/${currentChannelId}/update`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ name, description })
    });
    const data = await res.json();
    if (data.error) showToast('Ошибка', data.error, '!');
    else {
        document.getElementById('modal-edit-channel').classList.add('hidden');
        showToast('Сохранено', 'Канал обновлён', '✓');
        openChannel(currentChannelId);
        loadProfile();
    }
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
                <p>${ch.subscribers} участников</p></div>`;
            card.onclick = () => openAnalyticsDetail(ch.id, ch.name);
            list.appendChild(card);
        });
    } catch (e) { console.error(e); }
}

async function loadAnalyticsTab() {
    const list = document.getElementById('analytics-list');
    if (!list) return;
    list.innerHTML = '<div class="empty-state">Загрузка...</div>';
    try {
        const res = await fetch('/api/analytics/overview');
        const channels = await res.json();
        if (!channels.length) {
            list.innerHTML = '<div class="empty-state">Нет каналов<br>Создай канал, чтобы видеть статистику</div>';
            return;
        }
        list.innerHTML = '';
        channels.forEach(ch => {
            const avg = ch.posts ? Math.round(ch.views / ch.posts) : 0;
            const card = document.createElement('div');
            card.className = 'channel-card';
            card.style.cssText = 'flex-direction:column;align-items:stretch;cursor:pointer';
            card.innerHTML = `
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
                    <div class="avatar">${ch.name[0].toUpperCase()}</div>
                    <div class="channel-info"><h3>${escapeHtml(ch.name)}</h3><p>с ${ch.created_at}</p></div>
                </div>
                <div class="profile-stats" style="margin:0">
                    <div><span>${ch.subscribers}</span>подп.</div>
                    <div><span>${ch.posts}</span>посты</div>
                    <div><span>${ch.likes}</span>лайки</div>
                    <div><span>${ch.views}</span>просм.</div>
                </div>
                <p style="margin-top:12px;font-size:12px;color:var(--muted);text-align:center">Средний охват: ${avg}</p>`;
            card.onclick = () => openAnalyticsDetail(ch.id, ch.name);
            list.appendChild(card);
        });
    } catch (e) {
        console.error(e);
        list.innerHTML = '<div class="empty-state">Ошибка загрузки</div>';
    }
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
        document.getElementById('shop-balance').textContent = p.crystals;
        const av = document.getElementById('profile-avatar');
        if (p.avatar) {
            av.style.backgroundImage = `url(${p.avatar})`;
            av.style.backgroundSize = 'cover';
            av.style.backgroundPosition = 'center';
            av.textContent = '';
        } else {
            av.style.backgroundImage = '';
            av.textContent = p.username[0].toUpperCase();
        }
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
document.getElementById('profile-avatar').onclick = () => document.getElementById('avatar-input').click();
document.getElementById('avatar-input').onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/profile/avatar', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.error) showToast('Ошибка', data.error, '!');
    else { showToast('Аватар', 'Фото обновлено', '✓'); loadProfile(); }
};

document.getElementById('btn-daily').onclick = async () => {
    const res = await fetch('/api/daily_bonus', { method: 'POST' });
    const data = await res.json();
    if (data.error) showToast('Бонус', data.error, '⏳');
    else showToast('Бонус дня', `+${data.bonus} ✦ зачислено`, '✦');
    loadProfile();
};
document.getElementById('crystals-badge').onclick = () => document.getElementById('btn-daily').click();

document.getElementById('btn-open-shop').onclick = async () => {
    await loadProfile();
    try {
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
    } catch (e) { console.error(e); }
    document.getElementById('modal-shop').classList.remove('hidden');
};
document.getElementById('btn-close-shop').onclick = () => document.getElementById('modal-shop').classList.add('hidden');

document.querySelectorAll('.btn-boost').forEach(btn => {
    btn.onclick = async () => {
        const channelId = parseInt(document.getElementById('shop-channel-select').value);
        if (!channelId) return showToast('Ошибка', 'Создайте и выберите канал', '!');
        const res = await fetch('/api/shop/boost', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ channel_id: channelId, level: btn.dataset.level })
        });
        const data = await res.json();
        if (data.error) showToast('Ошибка', data.error, '!');
        else {
            document.getElementById('modal-shop').classList.add('hidden');
            showToast('Буст активен', `До ${data.boost_until}. Осталось ${data.crystals} ✦`, '🚀');
            loadProfile(); loadChannels();
        }
    };
});
document.getElementById('btn-buy-premium').onclick = async () => {
    const res = await fetch('/api/shop/premium', { method: 'POST' });
    const data = await res.json();
    if (data.error) showToast('Ошибка', data.error, '!');
    else {
        document.getElementById('modal-shop').classList.add('hidden');
        showToast('Премиум', 'Активирован на 30 дней 💎', '💎');
        loadProfile();
    }
};

document.getElementById('btn-analytics').onclick = () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.nav-btn[data-tab="analytics"]')?.classList.add('active');
    showScreen('screen-analytics');
    loadAnalyticsTab();
};
document.getElementById('btn-back-analytics')?.addEventListener('click', () => {
    if (currentChannelId) openChannel(currentChannelId);
    else showScreen('screen-home');
});

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
                <div class="channel-info"><h3>${escapeHtml(f.username)}</h3></div>
                <button class="btn btn-primary btn-sm" onclick="openChat(${f.id},'${escapeHtml(f.username)}')">Написать</button>
            </div>`;
        });
    }
    feed.innerHTML = html || '<div class="empty-state">Нет друзей и заявок<br>Ищите через поиск</div>';
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
        div.innerHTML = formatMessage(m.content, m.is_super);
        box.appendChild(div);
    });
    box.scrollTop = box.scrollHeight;
}
function formatMessage(content, isSuper) {
    let body = content || '';
    if (body.startsWith('[photo]')) body = `<img src="${body.slice(7)}" style="max-width:220px;border-radius:12px">`;
    else if (body.startsWith('[video]')) body = `<video src="${body.slice(7)}" controls playsinline style="max-width:220px;border-radius:12px"></video>`;
    else if (body.startsWith('[voice]')) body = `<audio src="${body.slice(7)}" controls style="max-width:220px"></audio>`;
    else body = escapeHtml(body);
    return (isSuper ? `<span style="font-size:11px;opacity:.85">✦ SUPER</span><br>` : '') + body;
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
    div.innerHTML = formatMessage(data.content, data.is_super);
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
});
socket.on('error', d => showToast('Ошибка', d.msg || 'Ошибка', '!'));

document.getElementById('btn-attach')?.addEventListener('click', () => document.getElementById('chat-file').click());
document.getElementById('chat-file')?.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file || !currentChatUserId) return;
    const fd = new FormData();
    fd.append('file', file);
    const up = await fetch('/api/upload', { method: 'POST', body: fd });
    const ud = await up.json();
    if (ud.error) return showToast('Ошибка', ud.error, '!');
    const isVideo = file.type.startsWith('video');
    const content = isVideo ? `[video]${ud.url}` : `[photo]${ud.url}`;
    socket.emit('send_message', { receiver_id: currentChatUserId, content, is_super: false });
    e.target.value = '';
});

let mediaRecorder = null;
let voiceChunks = [];
document.getElementById('btn-voice')?.addEventListener('click', async () => {
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
                socket.emit('send_message', { receiver_id: currentChatUserId, content: `[voice]${ud.url}`, is_super: false });
            }
            stream.getTracks().forEach(t => t.stop());
        };
        mediaRecorder.start();
        document.getElementById('btn-voice').classList.add('active');
        showToast('Запись', 'Нажми 🎤 ещё раз чтобы отправить', '🎤');
    } catch (err) {
        showToast('Ошибка', 'Нет доступа к микрофону', '!');
    }
});


function escapeHtml(t) {
    if (!t) return '';
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
}

loadHome();
