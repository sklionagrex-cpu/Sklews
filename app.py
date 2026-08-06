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

# ==================== MODELS ====================

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    avatar = db.Column(db.String(256), default='')
    status = db.Column(db.String(120), default='')
    crystals = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

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
    boost_until = db.Column(db.DateTime, nullable=True)

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
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    likes = db.Column(db.Integer, default=0)
    comments_count = db.Column(db.Integer, default=0)
    views = db.Column(db.Integer, default=0)

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

# ==================== HELPERS ====================

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

# ==================== ROUTES ====================

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
            user = User(
                username=username,
                password_hash=generate_password_hash(password)
            )
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

# ---------- API ----------

@app.route('/api/channels')
@login_required
def api_channels():
    sort = request.args.get('sort', 'today')
    channels = Channel.query.order_by(Channel.subscribers_count.desc()).all()
    
    result = []
    for ch in channels:
        result.append({
            'id': ch.id,
            'name': ch.name,
            'description': ch.description,
            'avatar': ch.avatar,
            'subscribers': ch.subscribers_count,
            'views': ch.views,
            'created_at': ch.created_at.strftime('%d.%m.%Y'),
            'is_boosted': ch.is_boosted
        })
    return jsonify(result)

@app.route('/api/my_subscriptions')
@login_required
def api_my_subscriptions():
    user = current_user()
    subs = Subscription.query.filter_by(user_id=user.id).all()
    result = []
    for s in subs:
        ch = Channel.query.get(s.channel_id)
        if not ch:
            continue
        last_post = Post.query.filter_by(channel_id=ch.id).order_by(Post.created_at.desc()).first()
        result.append({
            'id': ch.id,
            'name': ch.name,
            'avatar': ch.avatar,
            'unread': s.unread,
            'last_message': (last_post.content[:50] + '...') if last_post else 'Нет постов',
            'notifications': s.notifications
        })
    return jsonify(result)

@app.route('/api/channel/<int:channel_id>')
@login_required
def api_channel(channel_id):
    ch = Channel.query.get_or_404(channel_id)
    user = current_user()
    sub = Subscription.query.filter_by(user_id=user.id, channel_id=channel_id).first()
    return jsonify({
        'id': ch.id,
        'name': ch.name,
        'description': ch.description,
        'avatar': ch.avatar,
        'subscribers': ch.subscribers_count,
        'is_subscribed': bool(sub),
        'is_owner': ch.owner_id == user.id
    })

@app.route('/api/channel/<int:channel_id>/join', methods=['POST'])
@login_required
def join_channel(channel_id):
    user = current_user()
    ch = Channel.query.get_or_404(channel_id)
    existing = Subscription.query.filter_by(user_id=user.id, channel_id=channel_id).first()
    if existing:
        return jsonify({'status': 'already'})
    
    sub = Subscription(user_id=user.id, channel_id=channel_id)
    ch.subscribers_count += 1
    db.session.add(sub)

    if ch.subscribers_count % 10 == 0:
        owner = User.query.get(ch.owner_id)
        if owner:
            owner.crystals += 1

    db.session.commit()
    return jsonify({'status': 'joined', 'subscribers': ch.subscribers_count})

@app.route('/api/channel/<int:channel_id>/leave', methods=['POST'])
@login_required
def leave_channel(channel_id):
    user = current_user()
    sub = Subscription.query.filter_by(user_id=user.id, channel_id=channel_id).first()
    if sub:
        ch = Channel.query.get(channel_id)
        if ch:
            ch.subscribers_count = max(0, ch.subscribers_count - 1)
        db.session.delete(sub)
        db.session.commit()
    return jsonify({'status': 'left'})

@app.route('/api/channel/create', methods=['POST'])
@login_required
def create_channel():
    user = current_user()
    data = request.json
    name = data.get('name', '').strip()
    description = data.get('description', '').strip()

    if not name:
        return jsonify({'error': 'Название обязательно'}), 400

    ch = Channel(
        name=name,
        description=description,
        owner_id=user.id,
        subscribers_count=1
    )
    db.session.add(ch)
    db.session.flush()

    sub = Subscription(user_id=user.id, channel_id=ch.id)
    db.session.add(sub)

    user.crystals += 10
    db.session.commit()

    return jsonify({'id': ch.id, 'name': ch.name})

@app.route('/api/channel/<int:channel_id>/posts')
@login_required
def channel_posts(channel_id):
    posts = Post.query.filter_by(channel_id=channel_id).order_by(Post.created_at.desc()).limit(50).all()
    result = []
    for p in posts:
        author = User.query.get(p.author_id)
        result.append({
            'id': p.id,
            'content': p.content,
            'author': author.username if author else '?',
            'likes': p.likes,
            'comments': p.comments_count,
            'views': p.views,
            'created_at': p.created_at.strftime('%d.%m %H:%M')
        })
    return jsonify(result)

@app.route('/api/channel/<int:channel_id>/post', methods=['POST'])
@login_required
def create_post(channel_id):
    user = current_user()
    ch = Channel.query.get_or_404(channel_id)
    
    if ch.owner_id != user.id:
        return jsonify({'error': 'Нет прав'}), 403

    content = request.json.get('content', '').strip()
    if not content:
        return jsonify({'error': 'Пустой пост'}), 400

    post = Post(
        channel_id=channel_id,
        author_id=user.id,
        content=content
    )
    db.session.add(post)
    db.session.commit()
    return jsonify({'id': post.id, 'status': 'ok'})

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
        'username': user.username,
        'status': user.status,
        'avatar': user.avatar,
        'crystals': user.crystals,
        'channels': my_channels,
        'friends': friends_count
    })

@app.route('/api/users/search')
@login_required
def search_users():
    q = request.args.get('q', '').strip()
    if len(q) < 2:
        return jsonify([])
    users = User.query.filter(User.username.ilike(f'%{q}%')).limit(20).all()
    me = current_user()
    result = []
    for u in users:
        if u.id == me.id:
            continue
        friendship = Friendship.query.filter(
            ((Friendship.user_id == me.id) & (Friendship.friend_id == u.id)) |
            ((Friendship.user_id == u.id) & (Friendship.friend_id == me.id))
        ).first()
        status = friendship.status if friendship else 'none'
        result.append({
            'id': u.id,
            'username': u.username,
            'avatar': u.avatar,
            'friendship': status
        })
    return jsonify(result)

@app.route('/api/friends/request', methods=['POST'])
@login_required
def friend_request():
    me = current_user()
    friend_id = request.json.get('user_id')
    if not friend_id or friend_id == me.id:
        return jsonify({'error': 'Некорректный ID'}), 400

    existing = Friendship.query.filter(
        ((Friendship.user_id == me.id) & (Friendship.friend_id == friend_id)) |
        ((Friendship.user_id == friend_id) & (Friendship.friend_id == me.id))
    ).first()
    if existing:
        return jsonify({'status': existing.status})

    fr = Friendship(user_id=me.id, friend_id=friend_id, status='pending')
    db.session.add(fr)
    db.session.commit()
    return jsonify({'status': 'pending'})

@app.route('/api/messages/<int:user_id>')
@login_required
def get_messages(user_id):
    me = current_user()
    messages = Message.query.filter(
        ((Message.sender_id == me.id) & (Message.receiver_id == user_id)) |
        ((Message.sender_id == user_id) & (Message.receiver_id == me.id))
    ).order_by(Message.created_at.asc()).limit(100).all()

    result = []
    for m in messages:
        result.append({
            'id': m.id,
            'content': m.content,
            'is_mine': m.sender_id == me.id,
            'is_super': m.is_super,
            'created_at': m.created_at.strftime('%H:%M')
        })
    return jsonify(result)

# ==================== SOCKETIO ====================

@socketio.on('connect')
def on_connect():
    user = current_user()
    if user:
        join_room(f'user_{user.id}')

@socketio.on('send_message')
def handle_message(data):
    user = current_user()
    if not user:
        return
    receiver_id = data.get('receiver_id')
    content = data.get('content', '').strip()
    is_super = data.get('is_super', False)

    if not content or not receiver_id:
        return

    if is_super and user.crystals < 30:
        emit('error', {'msg': 'Недостаточно кристаллов'})
        return

    msg = Message(
        sender_id=user.id,
        receiver_id=receiver_id,
        content=content,
        is_super=is_super
    )
    if is_super:
        user.crystals -= 30

    db.session.add(msg)
    db.session.commit()

    payload = {
        'id': msg.id,
        'content': content,
        'sender_id': user.id,
        'sender_name': user.username,
        'is_super': is_super,
        'created_at': msg.created_at.strftime('%H:%M')
    }

    emit('new_message', payload, room=f'user_{receiver_id}')
    emit('new_message', {**payload, 'is_mine': True}, room=f'user_{user.id}')

# ==================== INIT ====================

with app.app_context():
    db.create_all()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    socketio.run(app, host='0.0.0.0', port=port, debug=False)
