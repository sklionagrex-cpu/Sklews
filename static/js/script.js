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

function premiumNickHtml(username, isPremium) {
    if (isPremium) {
        return '<span class="premium-nick">@' + escapeHtml(username) + '<span class="prem-gem">✦</span></span>';
    }
    return '@' + escapeHtml(username);
}

let meIsAdmin = false;
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
        showScreen('screen-' + tab);
        if (tab === 'home') loadHome();
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

function linkifyMentions(text) {
    const esc = escapeHtml(text || '');
    return esc.replace(/@([a-zA-Z0-9_]{2,32})/g, '<span class="mention-link" data-username="$1">@$1</span>');
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
        feed.innerHTML = '';
        updateAdminSelectBar();
        if (!channels.length) {
            feed.innerHTML = '<div class="empty-state">Нет новых каналов</div>';
            return;
        }
        channels.forEach(ch => {
            const card = document.createElement('div');
            card.className = 'channel-card' + (ch.is_boosted ? ' boosted boosted-' + (ch.boost_level || 'bronze') : '');
            card.dataset.channelId = ch.id;
            if (adminSelectMode && adminSelectedChannels.has(ch.id)) card.classList.add('admin-selected');
            const badge = ch.label ? '<span class="boost-label">' + ch.label + '</span>' : '';
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
        if (ch.owner_username) {
            ownerName.textContent = ch.owner_username;
            if (ch.owner_avatar) {
                ownerAv.style.backgroundImage = 'url(' + ch.owner_avatar + ')';
                ownerAv.style.backgroundSize = 'cover';
                ownerAv.textContent = '';
            } else {
                ownerAv.style.backgroundImage = '';
                ownerAv.textContent = ch.owner_username[0].toUpperCase();
            }
            document.getElementById('channel-owner-row').onclick = () => openUserProfile(ch.owner_id);
        }
    } catch (e) { console.error(e); }
}
document.getElementById('btn-open-posts').onclick = () => openPostsPage(currentChannelId);

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
        card.innerHTML = '<div style="display:flex;justify-content:space-between;margin-bottom:8px">' + authorHtml + '<span style="font-size:12px;color:var(--muted)">' + p.created_at + '</span></div>' +
            media +
            '<div style="margin-bottom:10px;white-space:pre-wrap" class="post-text">' + linkifyMentions(p.content) + '</div>' +
            '<div style="display:flex;gap:16px;font-size:13px;color:var(--muted);align-items:center;flex-wrap:wrap">' +
            '<span class="like-btn" data-id="' + p.id + '" style="cursor:pointer;' + (p.liked ? 'color:var(--accent)' : '') + '"><i class="fa-solid fa-heart"></i> ' + p.likes + '</span>' +
            '<span class="comment-btn" data-id="' + p.id + '" style="cursor:pointer"><i class="fa-solid fa-comment"></i> ' + (p.comments || 0) + '</span>' +
            '<span class="react-btn" data-id="' + p.id + '" style="cursor:pointer"><i class="fa-regular fa-face-smile"></i></span>' +
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
    });
    document.querySelectorAll('.react-btn').forEach(btn => {
        btn.onclick = e => { e.stopPropagation(); openReactModal(btn.dataset.id); };
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
    const pun = document.getElementById('profile-username');
    pun.innerHTML = premiumNickHtml(p.username, p.is_premium);
    meIsAdmin = !!p.is_admin;
    const fab = document.getElementById('admin-fab');
    if (fab) {
        if (meIsAdmin) fab.classList.remove('hidden');
        else fab.classList.add('hidden');
    }
    updateAdminSelectBar();
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
    const banner = document.getElementById('profile-banner');
    if (banner) {
        if (p.banner) {
            banner.style.backgroundImage = 'url(' + p.banner + ')';
            banner.classList.add('has-banner');
        } else {
            banner.style.backgroundImage = '';
            banner.classList.remove('has-banner');
        }
    }
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
document.getElementById('btn-set-banner').onclick = () => document.getElementById('banner-input').click();
document.getElementById('banner-input').onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/profile/banner', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.error) showToast('Ошибка', data.error, '!');
    else { showToast('Шапка', 'Обновлена', '✓'); loadProfile(); }
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
    window._viewUserId = u.id;
    document.getElementById('user-username').innerHTML = premiumNickHtml(u.username, u.is_premium);
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
    const banner = document.getElementById('user-banner');
    if (banner) {
        if (u.banner) {
            banner.style.backgroundImage = 'url(' + u.banner + ')';
            banner.classList.add('has-banner');
        } else {
            banner.style.backgroundImage = '';
            banner.classList.remove('has-banner');
        }
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
            ? '<div class="avatar comment-av" style="background-image:url(' + c.avatar + ');background-size:cover;background-position:center"></div>'
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
    showScreen('screen-chats');
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
    else if (body.startsWith('[voice]')) body = '<audio src="' + body.slice(7) + '" controls style="max-width:220px"></audio>';
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
        div.className = 'message ' + (m.is_mine ? 'mine' : 'theirs') + (m.is_super ? ' super' : '');
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
            video: { facingMode: circleFacing, width: { ideal: 720 }, height: { ideal: 720 } },
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
    circleFacing = circleFacing === 'user' ? 'environment' : 'user';
    const wasRecording = circleRecorder && circleRecorder.state === 'recording';
    const savedSecs = circleSecs;
    // restart stream with new camera, keep recording if possible
    try {
        if (circleStream) circleStream.getTracks().forEach(t => t.stop());
        circleStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: circleFacing, width: { ideal: 720 }, height: { ideal: 720 } },
            audio: true
        });
        const preview = document.getElementById('circle-preview');
        preview.srcObject = circleStream;
        if (wasRecording) {
            // new recorder continues accumulating - start fresh recorder on new stream
            const mime = MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : '';
            const oldOnStop = circleRecorder.onstop;
            try { circleRecorder.onstop = null; circleRecorder.stop(); } catch(e) {}
            circleRecorder = new MediaRecorder(circleStream, mime ? { mimeType: mime } : undefined);
            circleRecorder.ondataavailable = e => { if (e.data.size) circleChunks.push(e.data); };
            circleRecorder.onstop = oldOnStop;
            circleRecorder.start(200);
            circleSecs = savedSecs;
        }
    } catch (err) {
        showToast('Ошибка', 'Не удалось переключить камеру', '!');
        circleFacing = circleFacing === 'user' ? 'environment' : 'user';
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
        div.className = 'message ' + (data.is_mine ? 'mine' : 'theirs') + (data.is_super ? ' super' : '');
        div.innerHTML = '<div class="msg-bubble">' + formatMessage(data.content, data.is_super) +
            '<div class="msg-time">' + (data.created_at || '') + '</div></div>';
        if (data.id) {
            div.dataset.msgId = data.id;
            bindMsgLongPress(div, data.id);
        }
        box.appendChild(div);
        box.scrollTop = box.scrollHeight;
        box.querySelectorAll('.media-clickable').forEach(el => {
            el.onclick = () => openLightbox(el.dataset.type, el.dataset.src);
        });
        bindMentions(box);
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

loadHome();


if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/static/sw.js').catch(() => {});
}

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

    document.getElementById('btn-close-admin').onclick = () => {
        document.getElementById('modal-admin').classList.add('hidden');
    };

    document.getElementById('btn-admin-give').onclick = async () => {
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
