from flask import Flask, render_template, request, redirect, url_for, session, jsonify
from flask_socketio import SocketIO, emit, join_room
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timedelta
import os
import secrets

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', secrets.token_hex(32))
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///sklews.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    avatar = db.Column(db.String(256), default='')
    status = db.Column(db.String(120), default='')
    crystals = db.Column(db.Integer, default=0)
    is_premium = db.Column(db.Boolean, default=False)
    premium_until = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_daily = db.Column(db.DateTime, nullable=True)
    referral_code = db.Column(db.String(20), unique=True, nullable=True)
    referred_by = db.Column(db.Integer, nullable=True)
    hide_friends = db.Column(db.Boolean, default=False)
    hide_channels = db.Column(db.Boolean, default=False)

class Channel(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.String(500), default='')
    avatar = db.Column(db.String(256), default='')
    owner_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    subscribers_count = db.Column(db.Integer, default=0)
    views = db.Column(db.Integer, default=0)
    is_boosted = db.Column(db.Boolean, default=False)
    boost_level = db.Column(db.String(20), default='')
    boost_until = db.Column(db.DateTime, nullable=True)
    accent_color = db.Column(db.String(20), default='#8b5cf6')

class Subscription(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    channel_id = db.Column(db.Integer, db.ForeignKey('channel.id'), nullable=False)
    notifications = db.Column(db.Boolean, default=True)
    joined_at = db.Column(db.DateTime, default=datetime.utcnow)
    unread = db.Column(db.Integer, default=0)

class Post(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    channel_id = db.Column(db.Integer, db.ForeignKey('channel.id'), nullable=False)
    author_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    content = db.Column(db.Text, nullable=False)
    media_type = db.Column(db.String(20), default='text')  # text / photo / video / circle
    media_url = db.Column(db.String(500), default='')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    likes = db.Column(db.Integer, default=0)
    comments_count = db.Column(db.Integer, default=0)
    views = db.Column(db.Integer, default=0)
    is_pinned = db.Column(db.Boolean, default=False)

class Friendship(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    friend_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    status = db.Column(db.String(20), default='pending')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Message(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    sender_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    receiver_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    content = db.Column(db.Text, nullable=False)
    is_super = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_read = db.Column(db.Boolean, default=False)

class ChannelRole(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    channel_id = db.Column(db.Integer, db.ForeignKey('channel.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    role = db.Column(db.String(20), default='moderator')  # admin / moderator / coauthor


class PostView(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    post_id = db.Column(db.Integer, db.ForeignKey('post.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

class PostLike(db.Model):

    id = db.Column(db.Integer, primary_key=True)
    post_id = db.Column(db.Integer, db.ForeignKey('post.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

class PostReaction(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    post_id = db.Column(db.Integer, db.ForeignKey('post.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    emoji = db.Column(db.String(16), nullable=False)

class Comment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    post_id = db.Column(db.Integer, db.ForeignKey('post.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

def current_user():
    if 'user_id' in session:
        return User.query.get(session['user_id'])
    return None

def login_required(f):
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        if not current_user():
            return redirect(url_for('auth'))
        return f(*args, **kwargs)
    return decorated

def can_post(user, channel):
    if channel.owner_id == user.id:
        return True
    role = ChannelRole.query.filter_by(channel_id=channel.id, user_id=user.id).first()
    return role and role.role in ('admin', 'coauthor')

def can_moderate(user, channel):
    if channel.owner_id == user.id:
        return True
    role = ChannelRole.query.filter_by(channel_id=channel.id, user_id=user.id).first()
    return role and role.role in ('admin', 'moderator')

@app.route('/')
def index():
    user = current_user()
    if not user:
        return redirect(url_for('auth'))
    return render_template('index.html', user=user)

@app.route('/auth', methods=['GET', 'POST'])
def auth():
    if current_user():
        return redirect(url_for('index'))
    if request.method == 'POST':
        action = request.form.get('action')
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')
        if not username or not password:
            return render_template('auth.html', error='Заполните все поля')
        if action == 'register':
            if User.query.filter_by(username=username).first():
                return render_template('auth.html', error='Логин уже занят')
            user = User(username=username, password_hash=generate_password_hash(password),
                        referral_code=secrets.token_hex(4))
            db.session.add(user)
            db.session.commit()
            session['user_id'] = user.id
            return redirect(url_for('index'))
        elif action == 'login':
            user = User.query.filter_by(username=username).first()
            if user and check_password_hash(user.password_hash, password):
                session['user_id'] = user.id
                return redirect(url_for('index'))
            return render_template('auth.html', error='Неверный логин или пароль')
    return render_template('auth.html')

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('auth'))

# ==================== CHANNELS ====================

@app.route('/api/channels')
@login_required
def api_channels():
    sort = request.args.get('sort', 'today')
    now = datetime.utcnow()
    # clean expired boosts
    for ch in Channel.query.filter(Channel.is_boosted == True).all():
        if ch.boost_until and ch.boost_until < now:
            ch.is_boosted = False
            ch.boost_level = ''
            ch.boost_until = None
    db.session.commit()

    me = current_user()
    sub_ids = {s.channel_id for s in Subscription.query.filter_by(user_id=me.id).all()}
    channels = Channel.query.all()
    scored = []
    for ch in channels:
        if ch.owner_id == me.id:
            continue
        if ch.id in sub_ids:
            continue
        posts = Post.query.filter_by(channel_id=ch.id).all()
        recent_posts = recent_likes = 0
        if sort == 'today': cutoff = now - timedelta(hours=24)
        elif sort == 'week': cutoff = now - timedelta(days=7)
        elif sort == 'month': cutoff = now - timedelta(days=30)
        else: cutoff = datetime(2000, 1, 1)
        for p in posts:
            if p.created_at >= cutoff:
                recent_posts += 1
                recent_likes += p.likes
        score = ch.subscribers_count * 3 + recent_posts * 15 + recent_likes * 5 + ch.views
        if ch.is_boosted:
            score += {'gold': 100000, 'silver': 50000, 'bronze': 20000}.get(ch.boost_level, 10000)
        scored.append((score, ch, recent_posts))
    scored.sort(key=lambda x: x[0], reverse=True)
    result = []
    for score, ch, rp in scored:
        label = ''
        if ch.is_boosted:
            label = {'gold': '👑 Легенда', 'silver': '⭐ Популярный', 'bronze': '🔥 В тренде'}.get(ch.boost_level, '🔥')
        elif rp > 5:
            label = f'+{rp} постов'
        result.append({
            'id': ch.id, 'name': ch.name, 'description': ch.description, 'avatar': ch.avatar,
            'subscribers': ch.subscribers_count, 'views': ch.views,
            'created_at': ch.created_at.strftime('%d.%m.%Y'),
            'is_boosted': ch.is_boosted, 'boost_level': ch.boost_level or '', 'label': label,
            'accent': ch.accent_color or '#8b5cf6'
        })
    return jsonify(result)

@app.route('/api/my_subscriptions')
@login_required
def api_my_subscriptions():
    user = current_user()
    result = []
    for s in Subscription.query.filter_by(user_id=user.id).all():
        ch = Channel.query.get(s.channel_id)
        if not ch: continue
        last = Post.query.filter_by(channel_id=ch.id).order_by(Post.created_at.desc()).first()
        result.append({
            'id': ch.id, 'name': ch.name, 'avatar': ch.avatar, 'unread': s.unread,
            'last_message': (last.content[:55] + '...') if last else 'Нет постов',
            'notifications': s.notifications
        })
    return jsonify(result)

@app.route('/api/channel/<int:channel_id>')
@login_required
def api_channel(channel_id):
    ch = Channel.query.get_or_404(channel_id)
    user = current_user()
    sub = Subscription.query.filter_by(user_id=user.id, channel_id=channel_id).first()
    role = ChannelRole.query.filter_by(channel_id=channel_id, user_id=user.id).first()
    return jsonify({
        'id': ch.id, 'name': ch.name, 'description': ch.description, 'avatar': ch.avatar,
        'subscribers': ch.subscribers_count, 'is_subscribed': bool(sub),
        'is_owner': ch.owner_id == user.id,
        'role': 'owner' if ch.owner_id == user.id else (role.role if role else None),
        'is_boosted': ch.is_boosted, 'boost_level': ch.boost_level or '',
        'accent': ch.accent_color or '#8b5cf6',
        'notifications': sub.notifications if sub else True
    })

@app.route('/api/channel/<int:channel_id>/join', methods=['POST'])
@login_required
def join_channel(channel_id):
    user = current_user()
    ch = Channel.query.get_or_404(channel_id)
    if Subscription.query.filter_by(user_id=user.id, channel_id=channel_id).first():
        return jsonify({'status': 'already'})
    db.session.add(Subscription(user_id=user.id, channel_id=channel_id))
    ch.subscribers_count += 1
    owner = User.query.get(ch.owner_id)
    if owner:
        if ch.subscribers_count % 10 == 0: owner.crystals += 5
        if ch.subscribers_count == 50: owner.crystals += 15
        if ch.subscribers_count == 100: owner.crystals += 30
    db.session.commit()
    return jsonify({'status': 'joined', 'subscribers': ch.subscribers_count})

@app.route('/api/channel/<int:channel_id>/leave', methods=['POST'])
@login_required
def leave_channel(channel_id):
    user = current_user()
    sub = Subscription.query.filter_by(user_id=user.id, channel_id=channel_id).first()
    if sub:
        ch = Channel.query.get(channel_id)
        if ch and ch.owner_id != user.id:
            ch.subscribers_count = max(0, ch.subscribers_count - 1)
        db.session.delete(sub)
        db.session.commit()
    return jsonify({'status': 'left'})

@app.route('/api/channel/<int:channel_id>/notifications', methods=['POST'])
@login_required
def toggle_notifications(channel_id):
    user = current_user()
    sub = Subscription.query.filter_by(user_id=user.id, channel_id=channel_id).first()
    if not sub:
        return jsonify({'error': 'Не подписан'}), 400
    sub.notifications = not sub.notifications
    db.session.commit()
    return jsonify({'notifications': sub.notifications})

@app.route('/api/channel/create', methods=['POST'])
@login_required
def create_channel():
    user = current_user()
    data = request.json or {}
    name = data.get('name', '').strip()
    description = data.get('description', '').strip()
    if not name:
        return jsonify({'error': 'Название обязательно'}), 400
    ch = Channel(name=name, description=description, owner_id=user.id, subscribers_count=1, avatar=(data.get('avatar') or '')[:256])
    db.session.add(ch)
    db.session.flush()
    db.session.add(Subscription(user_id=user.id, channel_id=ch.id))
    user.crystals += 10
    db.session.commit()
    return jsonify({'id': ch.id, 'name': ch.name, 'crystals': user.crystals})

@app.route('/api/channel/<int:channel_id>/posts')
@login_required
def channel_posts(channel_id):
    me = current_user()
    posts = Post.query.filter_by(channel_id=channel_id).order_by(Post.is_pinned.desc(), Post.created_at.desc()).limit(50).all()
    result = []
    for p in posts:
        author = User.query.get(p.author_id)
        liked = PostLike.query.filter_by(post_id=p.id, user_id=me.id).first() is not None
        reacts = {}
        for r in PostReaction.query.filter_by(post_id=p.id).all():
            reacts[r.emoji] = reacts.get(r.emoji, 0) + 1
        my_react = PostReaction.query.filter_by(post_id=p.id, user_id=me.id).first()
        # unique view
        viewed = PostView.query.filter_by(post_id=p.id, user_id=me.id).first()
        if not viewed:
            db.session.add(PostView(post_id=p.id, user_id=me.id))
            p.views += 1
        result.append({
            'id': p.id, 'content': p.content, 'author': author.username if author else '?',
            'likes': p.likes, 'comments': p.comments_count, 'views': p.views, 'is_pinned': p.is_pinned,
            'media_type': p.media_type, 'media_url': p.media_url,
            'liked': liked, 'reactions': reacts, 'my_reaction': my_react.emoji if my_react else None,
            'created_at': p.created_at.strftime('%H:%M')
        })
    db.session.commit()
    return jsonify(result)

@app.route('/api/channel/<int:channel_id>/post', methods=['POST'])
@login_required
def create_post(channel_id):
    user = current_user()
    ch = Channel.query.get_or_404(channel_id)
    if not can_post(user, ch):
        return jsonify({'error': 'Нет прав на публикацию'}), 403
    data = request.json or {}
    content = data.get('content', '').strip()
    if not content:
        return jsonify({'error': 'Пустой пост'}), 400
    post = Post(channel_id=channel_id, author_id=user.id, content=content,
                media_type=data.get('media_type', 'text'), media_url=data.get('media_url', ''))
    db.session.add(post)
    for s in Subscription.query.filter_by(channel_id=channel_id).all():
        if s.user_id != user.id and s.notifications:
            s.unread += 1
    db.session.commit()
    return jsonify({'id': post.id, 'status': 'ok'})

@app.route('/api/post/<int:post_id>/like', methods=['POST'])
@login_required
def like_post(post_id):
    user = current_user()
    post = Post.query.get_or_404(post_id)
    existing = PostLike.query.filter_by(post_id=post_id, user_id=user.id).first()
    if existing:
        db.session.delete(existing)
        post.likes = max(0, post.likes - 1)
        liked = False
    else:
        db.session.add(PostLike(post_id=post_id, user_id=user.id))
        post.likes += 1
        liked = True
        if post.likes in (50, 200):
            author = User.query.get(post.author_id)
            if author:
                author.crystals += 5 if post.likes == 50 else 15
    db.session.commit()
    return jsonify({'likes': post.likes, 'liked': liked})

@app.route('/api/post/<int:post_id>/pin', methods=['POST'])
@login_required
def pin_post(post_id):
    user = current_user()
    post = Post.query.get_or_404(post_id)
    ch = Channel.query.get(post.channel_id)
    if not can_moderate(user, ch):
        return jsonify({'error': 'Нет прав'}), 403
    # unpin others
    Post.query.filter_by(channel_id=ch.id, is_pinned=True).update({'is_pinned': False})
    post.is_pinned = True
    db.session.commit()
    return jsonify({'status': 'pinned'})

# ==================== ROLES ====================

@app.route('/api/channel/<int:channel_id>/roles')
@login_required
def get_roles(channel_id):
    ch = Channel.query.get_or_404(channel_id)
    user = current_user()
    if ch.owner_id != user.id and not can_moderate(user, ch):
        return jsonify({'error': 'Нет прав'}), 403
    roles = ChannelRole.query.filter_by(channel_id=channel_id).all()
    result = []
    for r in roles:
        u = User.query.get(r.user_id)
        if u:
            result.append({'id': r.id, 'user_id': u.id, 'username': u.username, 'role': r.role})
    # owner
    owner = User.query.get(ch.owner_id)
    if owner:
        result.insert(0, {'id': 0, 'user_id': owner.id, 'username': owner.username, 'role': 'owner'})
    return jsonify(result)

@app.route('/api/channel/<int:channel_id>/roles', methods=['POST'])
@login_required
def add_role(channel_id):
    user = current_user()
    ch = Channel.query.get_or_404(channel_id)
    if ch.owner_id != user.id:
        return jsonify({'error': 'Только владелец'}), 403
    data = request.json or {}
    target_id = data.get('user_id')
    role = data.get('role', 'moderator')
    if role not in ('admin', 'moderator', 'coauthor'):
        return jsonify({'error': 'Неверная роль'}), 400
    target = User.query.get(target_id)
    if not target:
        return jsonify({'error': 'Пользователь не найден'}), 404
    existing = ChannelRole.query.filter_by(channel_id=channel_id, user_id=target_id).first()
    if existing:
        existing.role = role
    else:
        db.session.add(ChannelRole(channel_id=channel_id, user_id=target_id, role=role))
    db.session.commit()
    return jsonify({'status': 'ok', 'role': role})

# ==================== PROFILE ====================

@app.route('/api/profile')
@login_required
def api_profile():
    user = current_user()
    my_channels = Channel.query.filter_by(owner_id=user.id).count()
    friends_count = Friendship.query.filter(
        ((Friendship.user_id == user.id) | (Friendship.friend_id == user.id)) &
        (Friendship.status == 'accepted')
    ).count()
    return jsonify({
        'username': user.username, 'status': user.status, 'avatar': user.avatar,
        'crystals': user.crystals, 'channels': my_channels, 'friends': friends_count,
        'is_premium': user.is_premium, 'referral_code': user.referral_code or '',
        'hide_friends': bool(getattr(user, 'hide_friends', False)),
        'hide_channels': bool(getattr(user, 'hide_channels', False))
    })

@app.route('/api/profile/update', methods=['POST'])
@login_required
def update_profile():
    user = current_user()
    data = request.json or {}
    if 'status' in data:
        user.status = str(data['status'])[:120]
    if 'avatar' in data:
        user.avatar = str(data['avatar'])[:256]
    if 'hide_friends' in data:
        user.hide_friends = bool(data['hide_friends'])
    if 'hide_channels' in data:
        user.hide_channels = bool(data['hide_channels'])
    db.session.commit()
    return jsonify({'status': 'ok'})

@app.route('/api/daily_bonus', methods=['POST'])
@login_required
def daily_bonus():
    user = current_user()
    now = datetime.utcnow()
    if user.last_daily and (now - user.last_daily).days < 1:
        return jsonify({'error': 'Бонус уже получен сегодня', 'crystals': user.crystals}), 400
    user.crystals += 5
    user.last_daily = now
    db.session.commit()
    return jsonify({'status': 'ok', 'crystals': user.crystals, 'bonus': 5})

# ==================== FRIENDS ====================

@app.route('/api/users/search')
@login_required
def search_users():
    q = request.args.get('q', '').strip()
    if len(q) < 2: return jsonify([])
    users = User.query.filter(User.username.ilike(f'%{q}%')).limit(20).all()
    me = current_user()
    result = []
    for u in users:
        if u.id == me.id: continue
        fr = Friendship.query.filter(
            ((Friendship.user_id == me.id) & (Friendship.friend_id == u.id)) |
            ((Friendship.user_id == u.id) & (Friendship.friend_id == me.id))
        ).first()
        result.append({
            'id': u.id, 'username': u.username, 'avatar': u.avatar,
            'status': u.status, 'friendship': fr.status if fr else 'none',
            'is_premium': u.is_premium
        })
    return jsonify(result)

@app.route('/api/friends/request', methods=['POST'])
@login_required
def friend_request():
    me = current_user()
    friend_id = (request.json or {}).get('user_id')
    if not friend_id or friend_id == me.id:
        return jsonify({'error': 'Некорректный ID'}), 400
    existing = Friendship.query.filter(
        ((Friendship.user_id == me.id) & (Friendship.friend_id == friend_id)) |
        ((Friendship.user_id == friend_id) & (Friendship.friend_id == me.id))
    ).first()
    if existing:
        return jsonify({'status': existing.status})
    db.session.add(Friendship(user_id=me.id, friend_id=friend_id, status='pending'))
    db.session.commit()
    return jsonify({'status': 'pending'})

@app.route('/api/friends/requests')
@login_required
def get_requests():
    me = current_user()
    result = []
    for r in Friendship.query.filter_by(friend_id=me.id, status='pending').all():
        u = User.query.get(r.user_id)
        if u:
            result.append({'id': r.id, 'user_id': u.id, 'username': u.username})
    return jsonify(result)

@app.route('/api/friends/respond', methods=['POST'])
@login_required
def respond_request():
    me = current_user()
    data = request.json or {}
    fr = Friendship.query.get(data.get('request_id'))
    if not fr or fr.friend_id != me.id:
        return jsonify({'error': 'Не найдено'}), 404
    fr.status = 'accepted' if data.get('action') == 'accept' else 'rejected'
    db.session.commit()
    return jsonify({'status': fr.status})

@app.route('/api/friends')
@login_required
def get_friends():
    me = current_user()
    result = []
    for f in Friendship.query.filter(
        ((Friendship.user_id == me.id) | (Friendship.friend_id == me.id)) &
        (Friendship.status == 'accepted')
    ).all():
        fid = f.friend_id if f.user_id == me.id else f.user_id
        u = User.query.get(fid)
        if u:
            result.append({'id': u.id, 'username': u.username, 'avatar': u.avatar, 'status': u.status})
    return jsonify(result)

@app.route('/api/messages/<int:user_id>')
@login_required
def get_messages(user_id):
    me = current_user()
    messages = Message.query.filter(
        ((Message.sender_id == me.id) & (Message.receiver_id == user_id)) |
        ((Message.sender_id == user_id) & (Message.receiver_id == me.id))
    ).order_by(Message.created_at.asc()).limit(100).all()
    return jsonify([{
        'id': m.id, 'content': m.content, 'is_mine': m.sender_id == me.id,
        'is_super': m.is_super, 'created_at': m.created_at.strftime('%H:%M')
    } for m in messages])

# ==================== SHOP ====================

@app.route('/api/shop/boost', methods=['POST'])
@login_required
def buy_boost():
    user = current_user()
    data = request.json or {}
    channel_id = data.get('channel_id')
    level = data.get('level')
    prices = {'bronze': 50, 'silver': 150, 'gold': 350}
    hours = {'bronze': 12, 'silver': 24, 'gold': 48}
    if level not in prices:
        return jsonify({'error': 'Неверный уровень'}), 400
    ch = Channel.query.get_or_404(channel_id)
    if ch.owner_id != user.id:
        return jsonify({'error': 'Только владелец'}), 403
    cost = prices[level]
    if user.crystals < cost:
        return jsonify({'error': f'Нужно {cost} ✦'}), 400
    user.crystals -= cost
    ch.is_boosted = True
    ch.boost_level = level
    ch.boost_until = datetime.utcnow() + timedelta(hours=hours[level])
    db.session.commit()
    return jsonify({'status': 'ok', 'crystals': user.crystals,
                    'boost_until': ch.boost_until.strftime('%d.%m %H:%M')})

@app.route('/api/shop/premium', methods=['POST'])
@login_required
def buy_premium():
    user = current_user()
    if user.crystals < 200:
        return jsonify({'error': 'Нужно 200 ✦'}), 400
    user.crystals -= 200
    user.is_premium = True
    user.premium_until = datetime.utcnow() + timedelta(days=30)
    db.session.commit()
    return jsonify({'status': 'ok', 'crystals': user.crystals})

@app.route('/api/shop/theme', methods=['POST'])
@login_required
def buy_theme():
    user = current_user()
    data = request.json or {}
    channel_id = data.get('channel_id')
    color = data.get('color', '#8b5cf6')
    if user.crystals < 100:
        return jsonify({'error': 'Нужно 100 ✦'}), 400
    ch = Channel.query.get_or_404(channel_id)
    if ch.owner_id != user.id:
        return jsonify({'error': 'Только владелец'}), 403
    user.crystals -= 100
    ch.accent_color = color
    db.session.commit()
    return jsonify({'status': 'ok', 'crystals': user.crystals, 'accent': color})

@app.route('/api/my_channels')
@login_required
def my_channels():
    user = current_user()
    channels = Channel.query.filter_by(owner_id=user.id).all()
    return jsonify([{
        'id': ch.id, 'name': ch.name, 'subscribers': ch.subscribers_count,
        'is_boosted': ch.is_boosted, 'boost_level': ch.boost_level or '',
        'accent': ch.accent_color or '#8b5cf6', 'avatar': ch.avatar or ''
    } for ch in channels])

# ==================== ANALYTICS (basic) ====================

@app.route('/api/channel/<int:channel_id>/analytics')
@login_required
def channel_analytics(channel_id):
    user = current_user()
    ch = Channel.query.get_or_404(channel_id)
    if ch.owner_id != user.id:
        return jsonify({'error': 'Только владелец'}), 403
    posts = Post.query.filter_by(channel_id=channel_id).all()
    total_likes = sum(p.likes for p in posts)
    total_views = sum(p.views for p in posts)
    return jsonify({
        'subscribers': ch.subscribers_count,
        'posts': len(posts),
        'likes': total_likes,
        'views': total_views,
        'created_at': ch.created_at.strftime('%d.%m.%Y')
    })

# ==================== SOCKETIO ====================

@socketio.on('connect')
def on_connect():
    user = current_user()
    if user:
        join_room(f'user_{user.id}')

@socketio.on('send_message')
def handle_message(data):
    user = current_user()
    if not user: return
    receiver_id = data.get('receiver_id')
    content = data.get('content', '').strip()
    is_super = data.get('is_super', False)
    if not content or not receiver_id: return
    if is_super and user.crystals < 30:
        emit('error', {'msg': 'Недостаточно кристаллов (30 ✦)'})
        return
    msg = Message(sender_id=user.id, receiver_id=receiver_id, content=content, is_super=is_super)
    if is_super:
        user.crystals -= 30
    db.session.add(msg)
    db.session.commit()
    payload = {
        'id': msg.id, 'content': content, 'sender_id': user.id,
        'sender_name': user.username, 'is_super': is_super,
        'created_at': msg.created_at.strftime('%H:%M')
    }
    emit('new_message', payload, room=f'user_{receiver_id}')
    emit('new_message', {**payload, 'is_mine': True}, room=f'user_{user.id}')

with app.app_context():
    db.create_all()



@app.route('/api/channel/<int:channel_id>/update', methods=['POST'])
@login_required
def update_channel(channel_id):
    user = current_user()
    ch = Channel.query.get_or_404(channel_id)
    if ch.owner_id != user.id:
        return jsonify({'error': 'Только владелец'}), 403
    data = request.json or {}
    if 'description' in data:
        ch.description = str(data['description'])[:500]
    if 'avatar' in data:
        ch.avatar = str(data['avatar'])[:256]
    if 'name' in data and data['name'].strip() and data['name'].strip() != ch.name:
        if user.crystals < 50:
            return jsonify({'error': 'Смена названия стоит 50 ✦'}), 400
        user.crystals -= 50
        ch.name = data['name'].strip()[:100]
    if 'accent_color' in data:
        ch.accent_color = data['accent_color']
    db.session.commit()
    return jsonify({'status': 'ok', 'crystals': user.crystals, 'name': ch.name})

@app.route('/api/post/<int:post_id>/comments')
@login_required
def get_comments(post_id):
    comments = Comment.query.filter_by(post_id=post_id).order_by(Comment.created_at.asc()).limit(100).all()
    result = []
    for c in comments:
        u = User.query.get(c.user_id)
        result.append({
            'id': c.id, 'content': c.content,
            'username': u.username if u else '?',
            'created_at': c.created_at.strftime('%H:%M')
        })
    return jsonify(result)

@app.route('/api/post/<int:post_id>/comments', methods=['POST'])
@login_required
def add_comment(post_id):
    user = current_user()
    post = Post.query.get_or_404(post_id)
    content = (request.json or {}).get('content', '').strip()
    if not content:
        return jsonify({'error': 'Пустой комментарий'}), 400
    c = Comment(post_id=post_id, user_id=user.id, content=content)
    post.comments_count += 1
    db.session.add(c)
    if post.comments_count == 20:
        author = User.query.get(post.author_id)
        if author:
            author.crystals += 3
    db.session.commit()
    return jsonify({'id': c.id, 'status': 'ok', 'comments': post.comments_count})

@app.route('/api/activity')
@login_required
def platform_activity():
    since = datetime.utcnow() - timedelta(hours=24)
    posts = Post.query.filter(Post.created_at >= since).count()
    return jsonify({'today': posts})



@app.route('/api/channel/<int:channel_id>/analytics/detailed')
@login_required
def channel_analytics_detailed(channel_id):
    user = current_user()
    ch = Channel.query.get_or_404(channel_id)
    if ch.owner_id != user.id:
        return jsonify({'error': 'Только владелец'}), 403
    period = request.args.get('period', '24h')
    now = datetime.utcnow()
    if period == '1h':
        cutoff = now - timedelta(hours=1)
        buckets = 6
        delta = timedelta(minutes=10)
    elif period == '24h':
        cutoff = now - timedelta(hours=24)
        buckets = 12
        delta = timedelta(hours=2)
    elif period == 'week':
        cutoff = now - timedelta(days=7)
        buckets = 7
        delta = timedelta(days=1)
    elif period == 'month':
        cutoff = now - timedelta(days=30)
        buckets = 10
        delta = timedelta(days=3)
    else:
        cutoff = ch.created_at or (now - timedelta(days=365))
        buckets = 12
        delta = (now - cutoff) / buckets if buckets else timedelta(days=30)

    posts = Post.query.filter_by(channel_id=channel_id).all()
    labels, likes_s, views_s, posts_s = [], [], [], []
    for i in range(buckets):
        start = cutoff + delta * i
        end = cutoff + delta * (i + 1)
        labels.append(start.strftime('%d.%m %H:%M') if period in ('1h', '24h') else start.strftime('%d.%m'))
        pl = [p for p in posts if p.created_at and start <= p.created_at < end]
        posts_s.append(len(pl))
        likes_s.append(sum(p.likes for p in pl))
        views_s.append(sum(p.views for p in pl))

    total_likes = sum(p.likes for p in posts)
    total_views = sum(p.views for p in posts)
    best = max(posts, key=lambda p: p.views) if posts else None
    return jsonify({
        'labels': labels,
        'likes': likes_s,
        'views': views_s,
        'posts': posts_s,
        'subscribers': ch.subscribers_count,
        'total_likes': total_likes,
        'total_views': total_views,
        'total_posts': len(posts),
        'best_post': {'content': best.content[:80], 'views': best.views, 'likes': best.likes} if best else None,
        'created_at': ch.created_at.strftime('%d.%m.%Y')
    })

@app.route('/api/post/<int:post_id>/react', methods=['POST'])
@login_required
def react_post(post_id):
    user = current_user()
    post = Post.query.get_or_404(post_id)
    emoji = (request.json or {}).get('emoji', '🔥')
    # only one reaction total per user
    existing_any = PostReaction.query.filter_by(post_id=post_id, user_id=user.id).all()
    same = next((r for r in existing_any if r.emoji == emoji), None)
    if same:
        db.session.delete(same)
        active = False
    else:
        for r in existing_any:
            db.session.delete(r)
        db.session.add(PostReaction(post_id=post_id, user_id=user.id, emoji=emoji))
        active = True
    db.session.commit()
    counts = {}
    for r in PostReaction.query.filter_by(post_id=post_id).all():
        counts[r.emoji] = counts.get(r.emoji, 0) + 1
    return jsonify({'reactions': counts, 'active': active, 'emoji': emoji})



@app.route('/api/user/<int:user_id>')
@login_required
def user_public(user_id):
    u = User.query.get_or_404(user_id)
    me = current_user()
    friends_count = Friendship.query.filter(
        ((Friendship.user_id == u.id) | (Friendship.friend_id == u.id)) &
        (Friendship.status == 'accepted')
    ).count()
    channels_count = Channel.query.filter_by(owner_id=u.id).count()
    fr = Friendship.query.filter(
        ((Friendship.user_id == me.id) & (Friendship.friend_id == u.id)) |
        ((Friendship.user_id == u.id) & (Friendship.friend_id == me.id))
    ).first()
    return jsonify({
        'id': u.id, 'username': u.username, 'avatar': u.avatar, 'status': u.status,
        'is_premium': u.is_premium,
        'friends_count': friends_count if not u.hide_friends else None,
        'channels_count': channels_count if not u.hide_channels else None,
        'hide_friends': bool(u.hide_friends),
        'hide_channels': bool(u.hide_channels),
        'friendship': fr.status if fr else 'none',
        'is_me': u.id == me.id
    })

@app.route('/api/user/<int:user_id>/friends')
@login_required
def user_friends_list(user_id):
    u = User.query.get_or_404(user_id)
    me = current_user()
    if u.hide_friends and u.id != me.id:
        return jsonify({'error': 'Скрыто настройками приватности', 'friends': []})
    result = []
    for f in Friendship.query.filter(
        ((Friendship.user_id == u.id) | (Friendship.friend_id == u.id)) &
        (Friendship.status == 'accepted')
    ).all():
        fid = f.friend_id if f.user_id == u.id else f.user_id
        fu = User.query.get(fid)
        if fu:
            result.append({'id': fu.id, 'username': fu.username, 'avatar': fu.avatar})
    return jsonify(result)

@app.route('/api/user/<int:user_id>/channels')
@login_required
def user_channels_list(user_id):
    u = User.query.get_or_404(user_id)
    me = current_user()
    if u.hide_channels and u.id != me.id:
        return jsonify({'error': 'Скрыто настройками приватности', 'channels': []})
    channels = Channel.query.filter_by(owner_id=u.id).all()
    return jsonify([{'id': c.id, 'name': c.name, 'avatar': c.avatar, 'subscribers': c.subscribers_count} for c in channels])

@app.route('/api/privacy', methods=['POST'])
@login_required
def update_privacy():
    user = current_user()
    data = request.json or {}
    if 'hide_friends' in data:
        user.hide_friends = bool(data['hide_friends'])
    if 'hide_channels' in data:
        user.hide_channels = bool(data['hide_channels'])
    db.session.commit()
    return jsonify({'hide_friends': user.hide_friends, 'hide_channels': user.hide_channels})


import uuid
from flask import send_from_directory

UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static', 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
ALLOWED_EXT = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'webm', 'mov', 'mp3', 'ogg', 'wav', 'm4a'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXT

@app.route('/uploads/<path:filename>')
def uploaded_file(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)

@app.route('/api/upload', methods=['POST'])
@login_required
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'Нет файла'}), 400
    f = request.files['file']
    if not f or not f.filename:
        return jsonify({'error': 'Пустой файл'}), 400
    if not allowed_file(f.filename):
        return jsonify({'error': 'Только изображения'}), 400
    ext = f.filename.rsplit('.', 1)[1].lower()
    name = f"{uuid.uuid4().hex}.{ext}"
    f.save(os.path.join(UPLOAD_FOLDER, name))
    return jsonify({'url': f"/uploads/{name}"})

@app.route('/api/profile/avatar', methods=['POST'])
@login_required
def update_avatar():
    user = current_user()
    if 'file' not in request.files:
        return jsonify({'error': 'Нет файла'}), 400
    f = request.files['file']
    if not f or not f.filename or not allowed_file(f.filename):
        return jsonify({'error': 'Только изображения'}), 400
    ext = f.filename.rsplit('.', 1)[1].lower()
    name = f"avatar_{user.id}_{uuid.uuid4().hex[:8]}.{ext}"
    f.save(os.path.join(UPLOAD_FOLDER, name))
    user.avatar = f"/uploads/{name}"
    db.session.commit()
    return jsonify({'status': 'ok', 'avatar': user.avatar})

@app.route('/api/analytics/overview')
@login_required
def analytics_overview():
    user = current_user()
    channels = Channel.query.filter_by(owner_id=user.id).all()
    result = []
    for ch in channels:
        posts = Post.query.filter_by(channel_id=ch.id).all()
        result.append({
            'id': ch.id, 'name': ch.name, 'avatar': ch.avatar or '',
            'subscribers': ch.subscribers_count,
            'posts': len(posts),
            'likes': sum(p.likes for p in posts),
            'views': sum(p.views for p in posts),
            'created_at': ch.created_at.strftime('%d.%m.%Y')
        })
    return jsonify(result)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    socketio.run(app, host='0.0.0.0', port=port, debug=False)
