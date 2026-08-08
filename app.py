# Termux / environments without _sqlite3: use pysqlite3 if available
try:
    import pysqlite3
    import sys
    sys.modules["sqlite3"] = pysqlite3
except ImportError:
    pass

from flask import Flask, render_template, request, redirect, url_for, session, jsonify
from flask_socketio import SocketIO, emit, join_room
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timedelta
import uuid
import os
import secrets
import re
from urllib.parse import urlparse
from urllib.request import Request, urlopen
import html as html_lib

app = Flask(__name__)
_IS_PROD = bool(os.environ.get('DATABASE_URL') or os.environ.get('RENDER') or os.environ.get('PORT'))
# Static: long cache in prod (URL has cache_bust query on HTML)
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 604800 if _IS_PROD else 0
app.config['TEMPLATES_AUTO_RELOAD'] = not _IS_PROD
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', secrets.token_hex(32))

# Neon / Postgres if DATABASE_URL is set, otherwise local SQLite
_db_url = os.environ.get('DATABASE_URL', 'sqlite:///sklews.db')
if _db_url.startswith('postgres://'):
    _db_url = _db_url.replace('postgres://', 'postgresql://', 1)
app.config['SQLALCHEMY_DATABASE_URI'] = _db_url
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
# Connection pool — fewer round-trips / reconnect storms on Neon
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    'pool_pre_ping': True,
    'pool_recycle': 280,
    'pool_size': 5,
    'max_overflow': 10,
} if _db_url.startswith('postgresql') else {
    'pool_pre_ping': True,
}

db = SQLAlchemy(app)

# Cache-bust: git commit, or max mtime of app+static (so CSS/JS deploys invalidate)
def _compute_build_id():
    bid = os.environ.get('RENDER_GIT_COMMIT') or os.environ.get('BUILD_ID')
    if bid:
        return str(bid)[:16]
    paths = [__file__,
             os.path.join(os.path.dirname(__file__), 'static', 'js', 'script.js'),
             os.path.join(os.path.dirname(__file__), 'static', 'css', 'style.css'),
             os.path.join(os.path.dirname(__file__), 'templates', 'index.html')]
    mt = 0
    for p in paths:
        try:
            mt = max(mt, int(os.path.getmtime(p)))
        except OSError:
            pass
    return str(mt or int(os.path.getmtime(__file__)))
BUILD_ID = _compute_build_id()


# eventlet is flaky on Python 3.12+; keep threading (stable on Render 3.13)
import sys as _sys
_async_mode = 'threading'
if _sys.version_info < (3, 12):
    try:
        import eventlet  # noqa: F401
        _async_mode = 'eventlet'
    except Exception:
        pass
socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode=_async_mode,
    ping_timeout=60,
    ping_interval=25,
    logger=False,
    engineio_logger=False,
    # reduce transport upgrade churn on mobile
    cors_credentials=True,
)

# ---- simple in-memory TTL cache (per-process) ----
_cache = {}
def cache_get(key):
    item = _cache.get(key)
    if not item:
        return None
    exp, val = item
    if datetime.utcnow().timestamp() > exp:
        _cache.pop(key, None)
        return None
    return val

def cache_set(key, val, ttl=30):
    _cache[key] = (datetime.utcnow().timestamp() + ttl, val)

def cache_clear_prefix(prefix):
    for k in list(_cache.keys()):
        if k.startswith(prefix):
            _cache.pop(k, None)


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    avatar = db.Column(db.String(256), default='')
    banner = db.Column(db.String(256), default='')
    banner_type = db.Column(db.String(16), default='image')  # image | video
    banner_stretch = db.Column(db.Boolean, default=False)  # False=contain letterbox, True=cover
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
    last_seen = db.Column(db.DateTime, nullable=True)
    is_admin = db.Column(db.Boolean, default=False)
    muted_until = db.Column(db.DateTime, nullable=True)
    mines_day = db.Column(db.String(10), default='')
    mines_left = db.Column(db.Integer, default=10)
    owned_themes = db.Column(db.String(500), default='')  # comma-separated exclusive theme keys
    is_premium_plus = db.Column(db.Boolean, default=False)
    # Premium+ profile cosmetics
    plus_name_fx = db.Column(db.String(32), default='')      # gold | aurora | crystal | soft
    plus_avatar_frame = db.Column(db.String(32), default='') # gold | diamond | aurora | rose | obsidian
    plus_aura = db.Column(db.String(20), default='')         # hex glow color
    plus_badge = db.Column(db.String(24), default='')        # custom title under name
    plus_banner_fx = db.Column(db.String(32), default='')    # rays | particles | silk | none
    plus_msg_style = db.Column(db.String(32), default='')    # glow | gradient | neon | glass
    plus_card_style = db.Column(db.String(32), default='')   # glass | velvet | metal | royal
    plus_accent = db.Column(db.String(20), default='')       # personal accent hex

class ChatHide(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    peer_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

class MessageHide(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    message_id = db.Column(db.Integer, db.ForeignKey('message.id'), nullable=False)

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
    # Premium+ channel cosmetics
    plus_frame = db.Column(db.String(32), default='')      # gold | crystal | neon | silk
    plus_header_fx = db.Column(db.String(32), default='')  # shimmer | aurora | ember | none
    plus_badge = db.Column(db.String(24), default='')      # channel title badge
    plus_glow = db.Column(db.String(20), default='')       # hex
    plus_anim = db.Column(db.String(32), default='')       # pulse | float | border

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
    content = db.Column(db.Text, nullable=False, default='')
    media_url = db.Column(db.String(500), default='')
    media_type = db.Column(db.String(20), default='')  # photo
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class ProfilePost(db.Model):
    """Premium feed posts (global tab, premium only)."""
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    content = db.Column(db.Text, nullable=False, default='')
    media_url = db.Column(db.String(500), default='')
    media_type = db.Column(db.String(20), default='')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class PremiumChatMessage(db.Model):
    """Global chat for Premium members."""
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    content = db.Column(db.Text, nullable=False, default='')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class MediaFile(db.Model):
    """Persistent media storage in DB (survives Render redeploys)."""
    id = db.Column(db.String(32), primary_key=True)
    filename = db.Column(db.String(200), default='')
    content_type = db.Column(db.String(100), default='application/octet-stream')
    data = db.Column(db.LargeBinary, nullable=False)
    size = db.Column(db.Integer, default=0)
    user_id = db.Column(db.Integer, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

def current_user():
    """Request-scoped user lookup (one DB hit per request max)."""
    from flask import g
    if hasattr(g, '_current_user'):
        return g._current_user
    u = None
    if 'user_id' in session:
        u = User.query.get(session['user_id'])
    g._current_user = u
    return u


def format_last_seen(dt):
    if not dt:
        return 'давно'
    now = datetime.utcnow()
    diff = now - dt
    secs = int(diff.total_seconds())
    if secs < 90:
        return 'в сети'
    if secs < 3600:
        m = secs // 60
        return f'был(а) {m} мин. назад'
    if secs < 86400:
        h = secs // 3600
        return f'был(а) {h} ч. назад'
    d = secs // 86400
    if d == 1:
        return 'был(а) вчера'
    if d < 7:
        return f'был(а) {d} дн. назад'
    return dt.strftime('был(а) %d.%m.%Y')


ADMIN_USERNAMES = {'admin'}  # единственный аккаунт с админ-панелью

EMOJI_RE = re.compile(
    "["
    "\U0001F600-\U0001F64F"
    "\U0001F300-\U0001F5FF"
    "\U0001F680-\U0001F6FF"
    "\U0001F1E0-\U0001F1FF"
    "\U00002702-\U000027B0"
    "\U000024C2-\U0001F251"
    "\U0001F900-\U0001F9FF"
    "\U0001FA00-\U0001FA6F"
    "\U0001FA70-\U0001FAFF"
    "\U00002600-\U000026FF"
    "]+",
    flags=re.UNICODE
)

def has_emoji(s):
    return bool(EMOJI_RE.search(s or ''))

def is_admin_user(user):
    if not user:
        return False
    if getattr(user, 'is_admin', False):
        return True
    return (user.username or '').lower() in ADMIN_USERNAMES

def is_muted(user):
    if not user or not getattr(user, 'muted_until', None):
        return False
    return user.muted_until > datetime.utcnow()

def premium_active(user):
    if not user:
        return False
    if getattr(user, 'is_premium_plus', False):
        return True
    if user.premium_until and user.premium_until > datetime.utcnow():
        return True
    return bool(user.is_premium and user.premium_until is None)

def premium_plus_active(user):
    return bool(user and getattr(user, 'is_premium_plus', False))

def user_plus_payload(u):
    if not u:
        return {}
    return {
        'is_premium_plus': premium_plus_active(u),
        'plus_name_fx': getattr(u, 'plus_name_fx', '') or '',
        'plus_avatar_frame': getattr(u, 'plus_avatar_frame', '') or '',
        'plus_aura': getattr(u, 'plus_aura', '') or '',
        'plus_badge': getattr(u, 'plus_badge', '') or '',
        'plus_banner_fx': getattr(u, 'plus_banner_fx', '') or '',
        'plus_msg_style': getattr(u, 'plus_msg_style', '') or '',
        'plus_card_style': getattr(u, 'plus_card_style', '') or '',
        'plus_accent': getattr(u, 'plus_accent', '') or '',
    }

def channel_plus_payload(ch):
    if not ch:
        return {}
    return {
        'plus_frame': getattr(ch, 'plus_frame', '') or '',
        'plus_header_fx': getattr(ch, 'plus_header_fx', '') or '',
        'plus_badge': getattr(ch, 'plus_badge', '') or '',
        'plus_glow': getattr(ch, 'plus_glow', '') or '',
        'plus_anim': getattr(ch, 'plus_anim', '') or '',
    }



@app.after_request
def _perf_headers(resp):
    try:
        path = request.path or ''
        # API — never cache
        if path.startswith('/api/'):
            resp.headers['Cache-Control'] = 'no-store'
        # Versioned static assets — long cache (HTML uses ?v=cache_bust)
        elif path.startswith('/static/'):
            resp.headers['Cache-Control'] = 'public, max-age=604800, immutable'
        # Media blobs — already set in handler, reinforce
        elif path.startswith('/media/') or path.startswith('/uploads/'):
            if 'Cache-Control' not in resp.headers:
                resp.headers['Cache-Control'] = 'public, max-age=604800'
        # HTML shells — short cache so deploys show up quickly
        elif path in ('/', '/auth') or path.endswith('.html'):
            resp.headers['Cache-Control'] = 'no-cache'
        # Lightweight compression for text responses (when not already encoded)
        if resp.direct_passthrough is False and 'Content-Encoding' not in resp.headers:
            accept = (request.headers.get('Accept-Encoding') or '')
            ctype = (resp.headers.get('Content-Type') or '')
            compressible = any(x in ctype for x in ('text/', 'javascript', 'json', 'css', 'svg'))
            if 'gzip' in accept and compressible and resp.status_code == 200:
                data = resp.get_data()
                if data and 500 < len(data) < 2_000_000:
                    import gzip
                    compressed = gzip.compress(data, compresslevel=5)
                    if len(compressed) < len(data):
                        resp.set_data(compressed)
                        resp.headers['Content-Encoding'] = 'gzip'
                        resp.headers['Content-Length'] = str(len(compressed))
                        vary = resp.headers.get('Vary', '')
                        resp.headers['Vary'] = (vary + ', Accept-Encoding').strip(', ')
    except Exception:
        pass
    return resp

@app.route('/api/version')
def api_version():
    return jsonify({'build': '20260807-buildJ', 'features': ['premium-tab', 'mines', 'media-db']})


def login_required(f):
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        if not current_user():
            # API must never redirect to HTML — that breaks fetch JSON parsing (200 HTML)
            if (request.path or '').startswith('/api/'):
                return jsonify({'error': 'Нужно войти'}), 401
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

@app.route('/__build')
def __build():
    return "BUILD-20260807-1600", 200, {"Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store"}

@app.route('/')
def index():
    user = current_user()
    if not user:
        return redirect(url_for('auth'))
    return render_template('index.html', user=user, cache_bust=BUILD_ID)

@app.route('/auth', methods=['GET', 'POST'])
def auth():
    if current_user():
        return redirect(url_for('index'))
    if request.method == 'POST':
        action = request.form.get('action')
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')
        if not username or not password:
            return render_template('auth.html', cache_bust=BUILD_ID, error='Заполните все поля')
        if action == 'register':
            if has_emoji(username):
                return render_template('auth.html', cache_bust=BUILD_ID, error='В нике нельзя использовать эмодзи')
            if len(username) < 3 or len(username) > 24:
                return render_template('auth.html', cache_bust=BUILD_ID, error='Ник от 3 до 24 символов')
            if User.query.filter_by(username=username).first():
                return render_template('auth.html', cache_bust=BUILD_ID, error='Логин уже занят')
            user = User(username=username, password_hash=generate_password_hash(password),
                        referral_code=secrets.token_hex(4),
                        is_admin=(username.lower() in ADMIN_USERNAMES),
                        is_premium=True,
                        premium_until=datetime.utcnow() + timedelta(hours=24))
            db.session.add(user)
            db.session.commit()
            session['user_id'] = user.id
            return redirect(url_for('index'))
        elif action == 'login':
            user = User.query.filter_by(username=username).first()
            if user and check_password_hash(user.password_hash, password):
                session['user_id'] = user.id
                return redirect(url_for('index'))
            return render_template('auth.html', cache_bust=BUILD_ID, error='Неверный логин или пароль')
    return render_template('auth.html', cache_bust=BUILD_ID)

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('auth'))

# ==================== CHANNELS ====================

@app.route('/api/channels')
@login_required
def api_channels():
    from sqlalchemy import func
    sort = request.args.get('sort', 'today')
    now = datetime.utcnow()
    # clean expired boosts (single query + bulk update style)
    expired = Channel.query.filter(Channel.is_boosted == True, Channel.boost_until != None, Channel.boost_until < now).all()
    if expired:
        for ch in expired:
            ch.is_boosted = False
            ch.boost_level = ''
            ch.boost_until = None
        db.session.commit()

    me = current_user()
    q = (request.args.get('q') or '').strip()
    sub_ids = {s.channel_id for s in Subscription.query.filter_by(user_id=me.id).all()}
    if q:
        channels = Channel.query.filter(Channel.name.ilike(f'%{q}%')).limit(30).all()
        result = []
        for ch in channels:
            result.append({
                'id': ch.id, 'name': ch.name, 'description': ch.description, 'avatar': ch.avatar,
                'subscribers': ch.subscribers_count, 'views': ch.views,
                'created_at': ch.created_at.strftime('%d.%m.%Y'),
                'is_boosted': ch.is_boosted, 'boost_level': ch.boost_level or '', 'label': '',
                'accent': ch.accent_color or '#8b5cf6',
                **channel_plus_payload(ch),
            })
        return jsonify(result)

    # cache key per user+sort (subscriptions differ)
    ckey = f'channels:{me.id}:{sort}'
    cached = cache_get(ckey)
    if cached is not None:
        return jsonify(cached)

    if sort == 'today':
        cutoff = now - timedelta(hours=24)
    elif sort == 'week':
        cutoff = now - timedelta(days=7)
    elif sort == 'month':
        cutoff = now - timedelta(days=30)
    else:
        cutoff = datetime(2000, 1, 1)

    # one aggregate query instead of loading all posts per channel
    stats = db.session.query(
        Post.channel_id,
        func.count(Post.id).label('rp'),
        func.coalesce(func.sum(Post.likes), 0).label('rl')
    ).filter(Post.created_at >= cutoff).group_by(Post.channel_id).all()
    stats_map = {row.channel_id: (row.rp, int(row.rl or 0)) for row in stats}

    channels = Channel.query.order_by(Channel.id.desc()).limit(500).all()
    scored = []
    for ch in channels:
        if ch.owner_id == me.id or ch.id in sub_ids:
            continue
        recent_posts, recent_likes = stats_map.get(ch.id, (0, 0))
        score = ch.subscribers_count * 3 + recent_posts * 15 + recent_likes * 5 + (ch.views or 0)
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
            'created_at': ch.created_at.strftime('%d.%m.%Y') if ch.created_at else '',
            'is_boosted': ch.is_boosted, 'boost_level': ch.boost_level or '', 'label': label,
            'accent': ch.accent_color or '#8b5cf6',
        **channel_plus_payload(ch),
        })
    cache_set(ckey, result, ttl=45)
    return jsonify(result)

@app.route('/api/my_subscriptions')
@login_required
def api_my_subscriptions():
    user = current_user()
    subs = Subscription.query.filter_by(user_id=user.id).all()
    if not subs:
        return jsonify([])
    ch_ids = [s.channel_id for s in subs]
    channels = {c.id: c for c in Channel.query.filter(Channel.id.in_(ch_ids)).all()}
    from sqlalchemy import func
    last_map = {}
    if ch_ids:
        subq = db.session.query(
            Post.channel_id,
            func.max(Post.id).label('max_id')  # latest id ~ latest post
        ).filter(Post.channel_id.in_(ch_ids)).group_by(Post.channel_id).subquery()
        latest = Post.query.join(subq, Post.id == subq.c.max_id).all()
        last_map = {p.channel_id: p for p in latest}
    result = []
    for s in subs:
        ch = channels.get(s.channel_id)
        if not ch:
            continue
        last = last_map.get(ch.id)
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
    owner = User.query.get(ch.owner_id)
    return jsonify({
        'id': ch.id, 'name': ch.name, 'description': ch.description, 'avatar': ch.avatar,
        'subscribers': ch.subscribers_count, 'is_subscribed': bool(sub),
        'is_owner': ch.owner_id == user.id,
        'role': 'owner' if ch.owner_id == user.id else (role.role if role else None),
        'is_boosted': ch.is_boosted, 'boost_level': ch.boost_level or '',
        'accent': ch.accent_color or '#8b5cf6',
        'notifications': sub.notifications if sub else True,
        'owner_id': ch.owner_id,
        'owner_username': owner.username if owner else '?',
        'owner_avatar': owner.avatar if owner else '',
        **channel_plus_payload(ch),
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
        if ch.subscribers_count == 25: owner.crystals += 3
        if ch.subscribers_count == 50: owner.crystals += 7
        if ch.subscribers_count == 100: owner.crystals += 15
        if ch.subscribers_count == 250: owner.crystals += 30
        if ch.subscribers_count == 500: owner.crystals += 50
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

@app.route('/api/channel/<int:channel_id>/support', methods=['POST'])
@login_required
def support_channel(channel_id):
    user = current_user()
    ch = Channel.query.get_or_404(channel_id)
    if ch.owner_id == user.id:
        return jsonify({'error': 'Нельзя поддержать свой канал'}), 400
    data = request.json or {}
    try:
        amount = int(data.get('amount', 0))
    except (TypeError, ValueError):
        amount = 0
    if amount < 1:
        return jsonify({'error': 'Минимум 1 ✦'}), 400
    if amount > 10000:
        return jsonify({'error': 'Максимум 10000 ✦'}), 400
    if user.crystals < amount:
        return jsonify({'error': f'Недостаточно кристаллов (нужно {amount} ✦)'}), 400
    owner = User.query.get(ch.owner_id)
    if not owner:
        return jsonify({'error': 'Владелец не найден'}), 404
    user.crystals -= amount
    owner.crystals += amount
    db.session.commit()
    return jsonify({'status': 'ok', 'crystals': user.crystals, 'sent': amount})

@app.route('/api/channel/<int:channel_id>/delete', methods=['POST'])
@login_required
def delete_channel(channel_id):
    user = current_user()
    ch = Channel.query.get_or_404(channel_id)
    if ch.owner_id != user.id and not is_admin_user(user):
        return jsonify({'error': 'Только владелец или админ'}), 403
    posts = Post.query.filter_by(channel_id=channel_id).all()
    post_ids = [p.id for p in posts]
    if post_ids:
        PostLike.query.filter(PostLike.post_id.in_(post_ids)).delete(synchronize_session=False)
        PostReaction.query.filter(PostReaction.post_id.in_(post_ids)).delete(synchronize_session=False)
        PostView.query.filter(PostView.post_id.in_(post_ids)).delete(synchronize_session=False)
        Comment.query.filter(Comment.post_id.in_(post_ids)).delete(synchronize_session=False)
        Post.query.filter(Post.id.in_(post_ids)).delete(synchronize_session=False)
    Subscription.query.filter_by(channel_id=channel_id).delete(synchronize_session=False)
    ChannelRole.query.filter_by(channel_id=channel_id).delete(synchronize_session=False)
    db.session.delete(ch)
    db.session.commit()
    cache_clear_prefix('channels:')
    return jsonify({'status': 'deleted'})


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
    if is_muted(user):
        return jsonify({'error': 'Вы в муте до ' + user.muted_until.strftime('%d.%m %H:%M')}), 403
    data = request.json or {}
    name = data.get('name', '').strip()
    description = data.get('description', '').strip()
    if not name:
        return jsonify({'error': 'Название обязательно'}), 400
    owned = Channel.query.filter_by(owner_id=user.id).count()
    cost = 0
    if owned >= 2 and not is_admin_user(user):
        cost = 100
        if user.crystals < cost:
            return jsonify({'error': f'Бесплатно можно создать только 2 сообщества. Следующее стоит 100 ✦ (у вас {user.crystals})'}), 400
    ch = Channel(name=name, description=description, owner_id=user.id, subscribers_count=1, avatar=(data.get('avatar') or '')[:256])
    db.session.add(ch)
    db.session.flush()
    db.session.add(Subscription(user_id=user.id, channel_id=ch.id))
    if cost:
        user.crystals -= cost
    else:
        user.crystals += 3  # бонус только за бесплатные
    db.session.commit()
    cache_clear_prefix('channels:')
    return jsonify({'id': ch.id, 'name': ch.name, 'crystals': user.crystals, 'cost': cost})

@app.route('/api/channel/<int:channel_id>/posts')
@login_required
def channel_posts(channel_id):
    me = current_user()
    ch = Channel.query.get_or_404(channel_id)
    posts = Post.query.filter_by(channel_id=channel_id).order_by(
        Post.is_pinned.desc(), Post.created_at.desc()
    ).limit(50).all()
    if not posts:
        return jsonify([])

    post_ids = [p.id for p in posts]
    author_ids = list({p.author_id for p in posts})

    # batch authors
    authors = {u.id: u for u in User.query.filter(User.id.in_(author_ids)).all()} if author_ids else {}

    # batch my likes
    liked_ids = {
        row.post_id for row in PostLike.query.filter(
            PostLike.post_id.in_(post_ids), PostLike.user_id == me.id
        ).all()
    }

    # batch all reactions for these posts
    react_rows = PostReaction.query.filter(PostReaction.post_id.in_(post_ids)).all()
    reacts_map = {}  # post_id -> {emoji: count}
    my_react_map = {}  # post_id -> emoji
    for r in react_rows:
        d = reacts_map.setdefault(r.post_id, {})
        d[r.emoji] = d.get(r.emoji, 0) + 1
        if r.user_id == me.id:
            my_react_map[r.post_id] = r.emoji

    # batch already-viewed
    viewed_ids = {
        row.post_id for row in PostView.query.filter(
            PostView.post_id.in_(post_ids), PostView.user_id == me.id
        ).all()
    }

    can_mod = can_moderate(me, ch)
    is_adm = is_admin_user(me)
    is_owner = ch.owner_id == me.id

    new_views = []
    result = []
    for p in posts:
        author = authors.get(p.author_id)
        if p.id not in viewed_ids:
            new_views.append(PostView(post_id=p.id, user_id=me.id))
            p.views = (p.views or 0) + 1
        can_del = (p.author_id == me.id) or is_owner or can_mod or is_adm
        result.append({
            'id': p.id, 'content': p.content,
            'author': author.username if author else '?',
            'author_id': p.author_id,
            'author_premium': premium_active(author) if author else False,
            'likes': p.likes, 'comments': p.comments_count, 'views': p.views, 'is_pinned': p.is_pinned,
            'media_type': p.media_type, 'media_url': p.media_url,
            'liked': p.id in liked_ids,
            'reactions': reacts_map.get(p.id, {}),
            'my_reaction': my_react_map.get(p.id),
            'created_at': p.created_at.strftime('%H:%M') if p.created_at else '',
            'can_delete': can_del
        })
    if new_views:
        db.session.add_all(new_views)
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
    content = (data.get('content') or '').strip()
    media_type = (data.get('media_type') or 'text')[:20]
    media_url = (data.get('media_url') or '')[:500]
    if not content and not media_url:
        return jsonify({'error': 'Пустой пост'}), 400
    if not content and media_url:
        content = '📷' if media_type in ('photo', 'image') else ('🎥' if media_type == 'video' else '📎')
    post = Post(channel_id=channel_id, author_id=user.id, content=content,
                media_type=media_type, media_url=media_url)
    db.session.add(post)
    for s in Subscription.query.filter_by(channel_id=channel_id).all():
        if s.user_id != user.id and s.notifications:
            s.unread += 1
    db.session.commit()
    cache_clear_prefix('channels:')
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
        if post.likes in (100, 500, 1000):
            author = User.query.get(post.author_id)
            if author:
                author.crystals += {100: 5, 500: 15, 1000: 40}.get(post.likes, 0)
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

@app.route('/api/post/<int:post_id>/delete', methods=['POST'])
@login_required
def delete_post(post_id):
    user = current_user()
    post = Post.query.get_or_404(post_id)
    ch = Channel.query.get(post.channel_id)
    if post.author_id != user.id and not (ch and (ch.owner_id == user.id or can_moderate(user, ch))) and not is_admin_user(user):
        return jsonify({'error': 'Нет прав'}), 403
    PostLike.query.filter_by(post_id=post_id).delete(synchronize_session=False)
    PostReaction.query.filter_by(post_id=post_id).delete(synchronize_session=False)
    PostView.query.filter_by(post_id=post_id).delete(synchronize_session=False)
    Comment.query.filter_by(post_id=post_id).delete(synchronize_session=False)
    db.session.delete(post)
    db.session.commit()
    return jsonify({'status': 'deleted'})

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
            result.append({'id': r.id, 'user_id': u.id, 'username': u.username, 'avatar': u.avatar or '', 'role': r.role})
    # owner
    owner = User.query.get(ch.owner_id)
    if owner:
        result.insert(0, {'id': 0, 'user_id': owner.id, 'username': owner.username, 'avatar': owner.avatar or '', 'role': 'owner'})
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
    unread_total = Message.query.filter_by(receiver_id=user.id, is_read=False).count()
    pending_requests = Friendship.query.filter_by(friend_id=user.id, status='pending').count()
    # auto-expire premium
    if user.premium_until and user.premium_until < datetime.utcnow() and user.is_premium:
        user.is_premium = False
        db.session.commit()
    return jsonify({
        'id': user.id,
        'username': user.username, 'status': user.status, 'avatar': user.avatar,
        'banner': getattr(user, 'banner', '') or '',
        'banner_type': getattr(user, 'banner_type', 'image') or 'image',
        'banner_stretch': bool(getattr(user, 'banner_stretch', False)),
        'crystals': user.crystals, 'channels': my_channels, 'friends': friends_count,
        'is_premium': premium_active(user), 'referral_code': user.referral_code or '',
        'owned_themes': [t for t in (user.owned_themes or '').split(',') if t],
        **user_plus_payload(user),
        'hide_friends': bool(getattr(user, 'hide_friends', False)),
        'hide_channels': bool(getattr(user, 'hide_channels', False)),
        'unread_messages': unread_total,
        'friend_requests': pending_requests,
        'is_admin': is_admin_user(user),
        'muted_until': user.muted_until.isoformat() if getattr(user, 'muted_until', None) and is_muted(user) else None
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
    user.crystals += 2
    user.last_daily = now
    db.session.commit()
    return jsonify({'status': 'ok', 'crystals': user.crystals, 'bonus': 2})

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
    socketio.emit('friend_request', {
        'from_id': me.id, 'from_username': me.username, 'from_avatar': me.avatar or ''
    }, room=f'user_{friend_id}')
    return jsonify({'status': 'pending'})

@app.route('/api/friends/requests')
@login_required
def get_requests():
    me = current_user()
    result = []
    for r in Friendship.query.filter_by(friend_id=me.id, status='pending').all():
        u = User.query.get(r.user_id)
        if u:
            result.append({'id': r.id, 'user_id': u.id, 'username': u.username, 'avatar': u.avatar or ''})
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

@app.route('/api/friends/remove', methods=['POST'])
@login_required
def remove_friend():
    me = current_user()
    data = request.json or {}
    peer_id = data.get('user_id')
    if not peer_id:
        return jsonify({'error': 'Некорректный ID'}), 400
    fr = Friendship.query.filter(
        ((Friendship.user_id == me.id) & (Friendship.friend_id == peer_id)) |
        ((Friendship.user_id == peer_id) & (Friendship.friend_id == me.id))
    ).first()
    if not fr:
        return jsonify({'status': 'none'})
    db.session.delete(fr)
    db.session.commit()
    return jsonify({'status': 'removed'})


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
            unread = Message.query.filter_by(sender_id=u.id, receiver_id=me.id, is_read=False).count()
            last = Message.query.filter(
                ((Message.sender_id == me.id) & (Message.receiver_id == u.id)) |
                ((Message.sender_id == u.id) & (Message.receiver_id == me.id))
            ).order_by(Message.created_at.desc()).first()
            hidden = ChatHide.query.filter_by(user_id=me.id, peer_id=u.id).first()
            result.append({
                'id': u.id, 'username': u.username, 'avatar': u.avatar, 'status': u.status,
                'unread': unread,
                'last_message': (last.content[:40] + '...') if last and len(last.content) > 40 else (last.content if last else ''),
                'last_time': last.created_at.strftime('%H:%M') if last else '',
                'last_seen': format_last_seen(getattr(u, 'last_seen', None)),
                'hidden': bool(hidden)
            })
    result = [r for r in result if not r.get('hidden') or r.get('unread', 0) > 0]
    result.sort(key=lambda x: x['last_time'] or '', reverse=True)
    return jsonify(result)

@app.route('/api/messages/<int:user_id>')
@login_required
def get_messages(user_id):
    me = current_user()
    messages = Message.query.filter(
        ((Message.sender_id == me.id) & (Message.receiver_id == user_id)) |
        ((Message.sender_id == user_id) & (Message.receiver_id == me.id))
    ).order_by(Message.created_at.asc()).limit(100).all()
    # mark as read + unhide if was hidden for me
    for m in messages:
        if m.receiver_id == me.id and not m.is_read:
            m.is_read = True
    hid = ChatHide.query.filter_by(user_id=me.id, peer_id=user_id).first()
    if hid:
        db.session.delete(hid)
    db.session.commit()
    hidden_ids = {h.message_id for h in MessageHide.query.filter_by(user_id=me.id).all()}
    return jsonify([{
        'id': m.id, 'content': m.content, 'is_mine': m.sender_id == me.id,
        'is_super': m.is_super, 'created_at': m.created_at.strftime('%H:%M'),
        'is_read': m.is_read
    } for m in messages if m.id not in hidden_ids])


@app.route('/api/messages/<int:user_id>/delete', methods=['POST'])
@login_required
def delete_chat(user_id):
    me = current_user()
    data = request.json or {}
    mode = data.get('mode', 'me')  # me | both
    if mode == 'both':
        Message.query.filter(
            ((Message.sender_id == me.id) & (Message.receiver_id == user_id)) |
            ((Message.sender_id == user_id) & (Message.receiver_id == me.id))
        ).delete(synchronize_session=False)
        ChatHide.query.filter(
            ((ChatHide.user_id == me.id) & (ChatHide.peer_id == user_id)) |
            ((ChatHide.user_id == user_id) & (ChatHide.peer_id == me.id))
        ).delete(synchronize_session=False)
        db.session.commit()
        return jsonify({'status': 'deleted_both'})
    # for me only - hide conversation
    existing = ChatHide.query.filter_by(user_id=me.id, peer_id=user_id).first()
    if not existing:
        db.session.add(ChatHide(user_id=me.id, peer_id=user_id))
    db.session.commit()
    return jsonify({'status': 'deleted_me'})

@app.route('/api/message/<int:message_id>/delete', methods=['POST'])
@login_required
def delete_message(message_id):
    me = current_user()
    msg = Message.query.get_or_404(message_id)
    if msg.sender_id != me.id and msg.receiver_id != me.id:
        return jsonify({'error': 'Нет доступа'}), 403
    data = request.json or {}
    mode = data.get('mode', 'me')
    if mode == 'both':
        MessageHide.query.filter_by(message_id=message_id).delete(synchronize_session=False)
        db.session.delete(msg)
        db.session.commit()
        return jsonify({'status': 'deleted_both'})
    # for me only
    existing = MessageHide.query.filter_by(user_id=me.id, message_id=message_id).first()
    if not existing:
        db.session.add(MessageHide(user_id=me.id, message_id=message_id))
        db.session.commit()
    return jsonify({'status': 'deleted_me'})

# ==================== SHOP ====================

@app.route('/api/shop/boost', methods=['POST'])
@login_required
def buy_boost():
    user = current_user()
    data = request.json or {}
    channel_id = data.get('channel_id')
    level = data.get('level')
    prices = {'bronze': 120, 'silver': 350, 'gold': 800}
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

@app.route('/api/shop/premium-plus', methods=['POST'])
@login_required
def buy_premium_plus():
    """Permanent Premium+: all Premium features + profile/channel studio.
    Works even if the user already has regular Premium.
    """
    try:
        try:
            ensure_db_schema()
        except Exception:
            pass
        user = current_user()
        # refresh from DB
        db.session.refresh(user)
        if bool(getattr(user, 'is_premium_plus', False)):
            return jsonify({'error': 'Premium+ уже активен', 'is_premium_plus': True, 'crystals': user.crystals}), 400
        if (user.crystals or 0) < 10000:
            return jsonify({'error': f'Нужно 10000 ✦ (у вас {user.crystals or 0})', 'crystals': user.crystals or 0}), 400
        user.crystals = (user.crystals or 0) - 10000
        user.is_premium_plus = True
        user.is_premium = True
        # stack on top of existing premium time if any
        now = datetime.utcnow()
        base = user.premium_until if user.premium_until and user.premium_until > now else now
        user.premium_until = base + timedelta(days=90)
        db.session.commit()
        return jsonify({
            'status': 'ok',
            'crystals': user.crystals,
            'is_premium_plus': True,
            'is_premium': True,
            **user_plus_payload(user),
        })
    except Exception as e:
        db.session.rollback()
        print('buy_premium_plus error:', e, flush=True)
        return jsonify({'error': 'Ошибка сервера: ' + str(e)[:120]}), 500

@app.route('/api/plus/profile', methods=['POST'])
@login_required
def save_plus_profile():
    user = current_user()
    if not user or not premium_plus_active(user):
        return jsonify({'error': 'Нужен Premium+. Купи в магазине.'}), 403
    data = request.get_json(silent=True) or {}
    name_fx = str(data.get('plus_name_fx') or '')[:32]
    frame = str(data.get('plus_avatar_frame') or '')[:32]
    aura = str(data.get('plus_aura') or '')[:20]
    badge = str(data.get('plus_badge') or '')[:24]
    banner_fx = str(data.get('plus_banner_fx') or '')[:32]
    msg_style = str(data.get('plus_msg_style') or '')[:32]
    card_style = str(data.get('plus_card_style') or '')[:32]
    accent = str(data.get('plus_accent') or '')[:20]
    allowed_fx = {'', 'gold', 'aurora', 'crystal', 'soft', 'liquid', 'fire', 'matrix'}
    allowed_frame = {'', 'gold', 'diamond', 'aurora', 'rose', 'obsidian', 'prism', 'royal'}
    allowed_banner = {'', 'none', 'glare', 'aurora', 'neon', 'stardust', 'holo', 'rain', 'shutter', 'spark', 'trail', 'radar'}
    allowed_msg = {'', 'glow', 'gradient', 'neon', 'glass'}
    allowed_card = {'', 'glass', 'velvet', 'metal', 'royal'}
    if name_fx not in allowed_fx:
        return jsonify({'error': 'Неверный эффект ника'}), 400
    if frame not in allowed_frame:
        return jsonify({'error': 'Неверная рамка'}), 400
    if banner_fx not in allowed_banner:
        return jsonify({'error': 'Неверный эффект шапки'}), 400
    if msg_style not in allowed_msg:
        return jsonify({'error': 'Неверный стиль сообщений'}), 400
    if card_style not in allowed_card:
        return jsonify({'error': 'Неверный стиль карточки'}), 400
    if aura and not re.match(r'^#[0-9A-Fa-f]{6}$', aura):
        return jsonify({'error': 'Цвет ауры: #RRGGBB'}), 400
    if accent and not re.match(r'^#[0-9A-Fa-f]{6}$', accent):
        return jsonify({'error': 'Акцент: #RRGGBB'}), 400
    try:
        user.plus_name_fx = name_fx
        user.plus_avatar_frame = frame
        user.plus_aura = aura
        user.plus_badge = badge
        user.plus_banner_fx = '' if banner_fx in ('', 'none') else banner_fx
        user.plus_msg_style = msg_style
        user.plus_card_style = card_style
        user.plus_accent = accent
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        print('save_plus_profile commit error:', e, flush=True)
        return jsonify({'error': 'Не сохранилось: ' + str(e)[:120]}), 500
    payload = {
        'status': 'ok',
        'is_premium_plus': True,
        'plus_name_fx': name_fx,
        'plus_avatar_frame': frame,
        'plus_aura': aura or '',
        'plus_badge': badge or '',
        'plus_banner_fx': '' if banner_fx in ('', 'none') else banner_fx,
        'plus_msg_style': msg_style or '',
        'plus_card_style': card_style or '',
        'plus_accent': accent or '',
    }
    resp = jsonify(payload)
    resp.headers['Content-Type'] = 'application/json; charset=utf-8'
    return resp


@app.route('/api/plus/channel/<int:channel_id>', methods=['POST'])
@login_required
def save_plus_channel(channel_id):
    user = current_user()
    if not user or not premium_plus_active(user):
        return jsonify({'error': 'Нужен Premium+'}), 403
    ch = Channel.query.get_or_404(channel_id)
    if ch.owner_id != user.id:
        return jsonify({'error': 'Только владелец'}), 403
    data = request.get_json(silent=True) or {}
    frame = str(data.get('plus_frame') or '')[:32]
    header_fx = str(data.get('plus_header_fx') or '')[:32]
    badge = str(data.get('plus_badge') or '')[:24]
    glow = str(data.get('plus_glow') or '')[:20]
    anim = str(data.get('plus_anim') or '')[:32]
    allowed_frame = {'', 'gold', 'crystal', 'neon', 'silk', 'royal', 'prism'}
    allowed_fx = {'', 'none', 'shimmer', 'aurora', 'ember', 'wave'}
    allowed_anim = {'', 'pulse', 'float', 'border'}
    if frame not in allowed_frame:
        return jsonify({'error': 'Неверная рамка канала'}), 400
    if header_fx not in allowed_fx:
        return jsonify({'error': 'Неверный эффект шапки'}), 400
    if anim not in allowed_anim:
        return jsonify({'error': 'Неверная анимация'}), 400
    if glow and not re.match(r'^#[0-9A-Fa-f]{6}$', glow):
        return jsonify({'error': 'Цвет свечения: #RRGGBB'}), 400
    try:
        ch.plus_frame = frame
        ch.plus_header_fx = '' if header_fx in ('', 'none') else header_fx
        ch.plus_badge = badge
        ch.plus_glow = glow
        ch.plus_anim = anim
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        print('save_plus_channel error:', e, flush=True)
        return jsonify({'error': 'Не сохранилось: ' + str(e)[:120]}), 500
    return jsonify({
        'status': 'ok',
        'plus_frame': frame,
        'plus_header_fx': '' if header_fx in ('', 'none') else header_fx,
        'plus_badge': badge,
        'plus_glow': glow,
        'plus_anim': anim,
    })


EXCLUSIVE_THEMES = {
    'obsidian_gold': {'name': 'Obsidian Gold', 'price': 500},
    'aurora_void': {'name': 'Aurora Void', 'price': 500},
    'crimson_neon': {'name': 'Crimson Neon', 'price': 500},
    'honey_ember': {'name': 'Honey Ember', 'price': 750},
    'terracotta_dusk': {'name': 'Terracotta Dusk', 'price': 750},
    'cashmere_haze': {'name': 'Cashmere Haze', 'price': 750},
}

@app.route('/api/shop/exclusive-theme', methods=['POST'])
@login_required
def buy_exclusive_theme():
    try:
        try:
            ensure_db_schema()
        except Exception:
            pass
        user = current_user()
        data = request.json or {}
        key = (data.get('theme') or '').strip()
        info = EXCLUSIVE_THEMES.get(key)
        if not info:
            return jsonify({'error': 'Неизвестная тема'}), 400
        owned_raw = getattr(user, 'owned_themes', None) or ''
        owned = [t for t in owned_raw.split(',') if t]
        if key in owned:
            return jsonify({'error': 'Уже куплено', 'owned_themes': owned}), 400
        price = info['price']
        if (user.crystals or 0) < price:
            return jsonify({'error': f'Нужно {price} ✦ (у вас {user.crystals or 0})'}), 400
        user.crystals = (user.crystals or 0) - price
        owned.append(key)
        user.owned_themes = ','.join(owned)
        db.session.commit()
        return jsonify({'status': 'ok', 'crystals': user.crystals, 'owned_themes': owned, 'theme': key})
    except Exception as e:
        db.session.rollback()
        print('buy_exclusive_theme error:', e, flush=True)
        return jsonify({'error': 'Ошибка сервера: ' + str(e)[:120]}), 500

@app.route('/api/shop/exclusive-themes')
@login_required
def list_exclusive_themes():
    user = current_user()
    owned = set(t for t in (user.owned_themes or '').split(',') if t)
    items = []
    for key, info in EXCLUSIVE_THEMES.items():
        items.append({
            'key': key,
            'name': info['name'],
            'price': info['price'],
            'owned': key in owned,
        })
    return jsonify({'themes': items, 'owned_themes': list(owned), 'crystals': user.crystals})

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
    owned = Channel.query.filter_by(owner_id=user.id).all()
    sub_ids = [s.channel_id for s in Subscription.query.filter_by(user_id=user.id).all()]
    subscribed = Channel.query.filter(Channel.id.in_(sub_ids)).all() if sub_ids else []
    seen = set()
    result = []
    for ch in list(owned) + list(subscribed):
        if ch.id in seen:
            continue
        seen.add(ch.id)
        result.append({
            'id': ch.id, 'name': ch.name, 'subscribers': ch.subscribers_count,
            'description': (ch.description or '')[:200],
            'is_boosted': ch.is_boosted, 'boost_level': ch.boost_level or '',
            'accent': ch.accent_color or '#8b5cf6', 'avatar': ch.avatar or '',
            'banner': getattr(ch, 'banner', None) or ch.avatar or '',
            'is_owner': ch.owner_id == user.id,
            'is_subscribed': True,
            **channel_plus_payload(ch),
        })
    return jsonify(result)


@app.route('/api/channel/<int:channel_id>/subscribers')
@login_required
def channel_subscribers(channel_id):
    user = current_user()
    ch = Channel.query.get_or_404(channel_id)
    if ch.owner_id != user.id and not can_moderate(user, ch):
        return jsonify({'error': 'Нет доступа'}), 403
    subs = Subscription.query.filter_by(channel_id=channel_id).all()
    out = []
    for s in subs:
        u = User.query.get(s.user_id)
        if not u:
            continue
        out.append({
            'user_id': u.id,
            'username': u.username,
            'avatar': u.avatar or '',
        })
    return jsonify(out)


@app.route('/api/channel/<int:channel_id>/kick', methods=['POST'])
@login_required
def channel_kick(channel_id):
    user = current_user()
    ch = Channel.query.get_or_404(channel_id)
    if ch.owner_id != user.id and not can_moderate(user, ch):
        return jsonify({'error': 'Нет доступа'}), 403
    data = request.get_json(silent=True) or {}
    try:
        uid = int(data.get('user_id'))
    except (TypeError, ValueError):
        return jsonify({'error': 'user_id'}), 400
    if uid == ch.owner_id:
        return jsonify({'error': 'Нельзя кикнуть владельца'}), 400
    sub = Subscription.query.filter_by(user_id=uid, channel_id=channel_id).first()
    if sub:
        db.session.delete(sub)
        ch.subscribers_count = max(0, (ch.subscribers_count or 1) - 1)
        db.session.commit()
    return jsonify({'status': 'kicked'})

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
    # unhide for both so conversation reappears
    for uid, pid in ((user.id, receiver_id), (receiver_id, user.id)):
        h = ChatHide.query.filter_by(user_id=uid, peer_id=pid).first()
        if h:
            db.session.delete(h)
    db.session.commit()
    payload = {
        'id': msg.id, 'content': content, 'sender_id': user.id,
        'sender_name': user.username, 'is_super': is_super,
        'created_at': msg.created_at.strftime('%H:%M')
    }
    emit('new_message', payload, room=f'user_{receiver_id}')
    emit('new_message', {**payload, 'is_mine': True}, room=f'user_{user.id}')


# DB init moved to if __name__ == '__main__'



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
        if user.crystals < 100:
            return jsonify({'error': 'Смена названия стоит 100 ✦'}), 400
        user.crystals -= 100
        ch.name = data['name'].strip()[:100]
    if 'accent_color' in data:
        ch.accent_color = data['accent_color']
    db.session.commit()
    return jsonify({'status': 'ok', 'crystals': user.crystals, 'name': ch.name})

@app.route('/api/post/<int:post_id>/comments')
@login_required
def get_comments(post_id):
    me = current_user()
    post = Post.query.get_or_404(post_id)
    ch = Channel.query.get(post.channel_id)
    comments = Comment.query.filter_by(post_id=post_id).order_by(Comment.created_at.asc()).limit(100).all()
    result = []
    for c in comments:
        u = User.query.get(c.user_id)
        can_delete = (c.user_id == me.id) or (post.author_id == me.id) or (ch and ch.owner_id == me.id) or is_admin_user(me) or can_moderate(me, ch)
        result.append({
            'id': c.id, 'content': c.content,
            'user_id': c.user_id,
            'username': u.username if u else '?',
            'avatar': u.avatar if u else '',
            'media_url': getattr(c, 'media_url', '') or '',
            'media_type': getattr(c, 'media_type', '') or '',
            'created_at': c.created_at.strftime('%H:%M'),
            'can_delete': can_delete
        })
    return jsonify(result)

@app.route('/api/post/<int:post_id>/comments', methods=['POST'])
@login_required
def add_comment(post_id):
    user = current_user()
    if is_muted(user):
        return jsonify({'error': 'Вы в муте. Комментарии недоступны до ' + user.muted_until.strftime('%d.%m %H:%M UTC')}), 403
    post = Post.query.get_or_404(post_id)
    data = request.json or {}
    content = (data.get('content') or '').strip()
    media_url = (data.get('media_url') or '')[:500]
    media_type = (data.get('media_type') or '')[:20]
    if not content and not media_url:
        return jsonify({'error': 'Пустой комментарий'}), 400
    # Anti-spam: 10 comments in 30 seconds -> mute 30 minutes
    since = datetime.utcnow() - timedelta(seconds=30)
    recent = Comment.query.filter(Comment.user_id == user.id, Comment.created_at >= since).count()
    if recent >= 10 and not is_admin_user(user):
        user.muted_until = datetime.utcnow() + timedelta(minutes=30)
        db.session.commit()
        return jsonify({'error': 'Антиспам: слишком много комментариев. Мут на 30 минут.'}), 429
    c = Comment(post_id=post_id, user_id=user.id, content=content or ('📷' if media_url else ''),
                media_url=media_url, media_type=media_type)
    db.session.add(c)
    post.comments_count = (post.comments_count or 0) + 1
    if post.comments_count in (50, 200):
        author = User.query.get(post.author_id)
        if author:
            author.crystals += 5 if post.comments_count == 50 else 12
    db.session.commit()
    return jsonify({'id': c.id, 'status': 'ok', 'comments': post.comments_count})


@app.route('/api/post/<int:post_id>/comments/<int:comment_id>', methods=['DELETE'])
@login_required
def delete_comment(post_id, comment_id):
    me = current_user()
    post = Post.query.get_or_404(post_id)
    c = Comment.query.filter_by(id=comment_id, post_id=post_id).first_or_404()
    ch = Channel.query.get(post.channel_id)
    if c.user_id != me.id and post.author_id != me.id and (not ch or ch.owner_id != me.id) and not is_admin_user(me) and not can_moderate(me, ch):
        return jsonify({'error': 'Нет прав'}), 403
    db.session.delete(c)
    post.comments_count = max(0, (post.comments_count or 1) - 1)
    db.session.commit()
    return jsonify({'status': 'ok', 'comments': post.comments_count})

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
        'id': u.id, 'username': u.username, 'avatar': u.avatar,
        'banner': getattr(u, 'banner', '') or '',
        'banner_type': getattr(u, 'banner_type', 'image') or 'image',
        'banner_stretch': bool(getattr(u, 'banner_stretch', False)),
        'status': u.status,
        'is_premium': premium_active(u),
        **user_plus_payload(u),
        'friends_count': friends_count if not u.hide_friends else None,
        'channels_count': channels_count if not u.hide_channels else None,
        'hide_friends': bool(u.hide_friends),
        'hide_channels': bool(u.hide_channels),
        'friendship': fr.status if fr else 'none',
        'is_me': u.id == me.id,
        'last_seen': format_last_seen(getattr(u, 'last_seen', None))
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
    result = []
    for s in Subscription.query.filter_by(user_id=u.id).all():
        c = Channel.query.get(s.channel_id)
        if c:
            result.append({'id': c.id, 'name': c.name, 'avatar': c.avatar, 'subscribers': c.subscribers_count})
    return jsonify(result)

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



@app.route('/api/premium/feed')
@login_required
def premium_feed():
    me = current_user()
    if not premium_active(me):
        return jsonify({'error': 'premium_required', 'posts': []}), 403
    posts = ProfilePost.query.order_by(ProfilePost.created_at.desc()).limit(80).all()
    result = []
    for p in posts:
        u = User.query.get(p.user_id)
        result.append({
            'id': p.id,
            'user_id': p.user_id,
            'username': u.username if u else '?',
            'avatar': u.avatar if u else '',
            'author_premium': premium_active(u) if u else False,
            'content': p.content,
            'media_url': p.media_url or '',
            'media_type': p.media_type or '',
            'created_at': p.created_at.strftime('%d.%m %H:%M') if p.created_at else '',
            'can_delete': p.user_id == me.id or is_admin_user(me),
        })
    return jsonify({'posts': result})

@app.route('/api/premium/feed', methods=['POST'])
@login_required
def create_premium_feed_post():
    me = current_user()
    if not premium_active(me):
        return jsonify({'error': 'Только для Premium'}), 403
    data = request.json or {}
    content = (data.get('content') or '').strip()
    media_url = (data.get('media_url') or '')[:500]
    media_type = (data.get('media_type') or '')[:20]
    if not content and not media_url:
        return jsonify({'error': 'Пустой пост'}), 400
    if len(content) > 2000:
        return jsonify({'error': 'Слишком длинный текст'}), 400
    post = ProfilePost(user_id=me.id, content=content, media_url=media_url, media_type=media_type)
    db.session.add(post)
    db.session.commit()
    return jsonify({'id': post.id, 'status': 'ok'})

@app.route('/api/premium/feed/<int:post_id>', methods=['DELETE'])
@login_required
def delete_premium_feed_post(post_id):
    me = current_user()
    p = ProfilePost.query.get_or_404(post_id)
    if p.user_id != me.id and not is_admin_user(me):
        return jsonify({'error': 'Нет доступа'}), 403
    db.session.delete(p)
    db.session.commit()
    return jsonify({'status': 'ok'})


@app.route('/api/premium/chat')
@login_required
def premium_chat_history():
    me = current_user()
    if not premium_active(me):
        return jsonify({'error': 'premium_required', 'messages': []}), 403
    rows = PremiumChatMessage.query.order_by(PremiumChatMessage.id.desc()).limit(120).all()
    rows = list(reversed(rows))
    out = []
    for m in rows:
        u = User.query.get(m.user_id)
        out.append({
            'id': m.id,
            'user_id': m.user_id,
            'username': u.username if u else '?',
            'avatar': u.avatar if u else '',
            'author_premium': premium_active(u) if u else False,
            'content': m.content,
            'created_at': m.created_at.strftime('%H:%M') if m.created_at else '',
            'is_mine': m.user_id == me.id,
        })
    return jsonify({'messages': out})



@app.route('/api/premium/chat/<int:msg_id>/delete', methods=['POST'])
@login_required
def delete_premium_chat_message(msg_id):
    user = current_user()
    msg = PremiumChatMessage.query.get_or_404(msg_id)
    if msg.user_id != user.id and not is_admin_user(user):
        return jsonify({'error': 'Можно удалить только своё сообщение'}), 403
    db.session.delete(msg)
    db.session.commit()
    socketio.emit('premium_chat_deleted', {'id': msg_id}, room='premium_chat')
    return jsonify({'status': 'ok'})

@socketio.on('join_premium_chat')
def on_join_premium_chat():
    user = current_user()
    if user and premium_active(user):
        join_room('premium_chat')
        emit('premium_chat_joined', {'ok': True})


@socketio.on('leave_premium_chat')
def on_leave_premium_chat():
    from flask_socketio import leave_room
    leave_room('premium_chat')


@socketio.on('premium_chat_message')
def handle_premium_chat_message(data):
    user = current_user()
    if not user or not premium_active(user):
        emit('error', {'msg': 'Только для Premium'})
        return
    content = (data.get('content') or '').strip()
    if not content:
        return
    if len(content) > 2000:
        emit('error', {'msg': 'Слишком длинное сообщение'})
        return
    msg = PremiumChatMessage(user_id=user.id, content=content)
    db.session.add(msg)
    db.session.commit()
    payload = {
        'id': msg.id,
        'user_id': user.id,
        'username': user.username,
        'avatar': user.avatar or '',
        'author_premium': True,
        'content': content,
        'created_at': msg.created_at.strftime('%H:%M') if msg.created_at else '',
    }
    # broadcast to room; clients mark is_mine themselves
    emit('premium_chat_new', payload, room='premium_chat')



@app.route('/api/link-preview')
@login_required
def link_preview():
    """Fetch Open Graph / basic metadata for a URL (Telegram-style preview)."""
    url = (request.args.get('url') or '').strip()
    if not url or len(url) > 2000:
        return jsonify({'error': 'bad_url'}), 400
    if not re.match(r'^https?://', url, re.I):
        return jsonify({'error': 'bad_url'}), 400
    # Direct media by extension
    path = urlparse(url).path.lower()
    img_ext = ('.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.avif')
    vid_ext = ('.mp4', '.webm', '.mov', '.m4v', '.ogg')
    if any(path.endswith(e) for e in img_ext):
        return jsonify({'type': 'image', 'url': url, 'image': url, 'title': '', 'description': '', 'site': urlparse(url).netloc})
    if any(path.endswith(e) for e in vid_ext):
        return jsonify({'type': 'video', 'url': url, 'video': url, 'title': '', 'description': '', 'site': urlparse(url).netloc})
    try:
        req = Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (compatible; SklewsBot/1.0; +https://sklews.app)',
            'Accept': 'text/html,application/xhtml+xml',
        })
        with urlopen(req, timeout=5) as resp:
            ctype = (resp.headers.get('Content-Type') or '').lower()
            if 'image/' in ctype:
                return jsonify({'type': 'image', 'url': url, 'image': url, 'title': '', 'description': '', 'site': urlparse(url).netloc})
            if 'video/' in ctype:
                return jsonify({'type': 'video', 'url': url, 'video': url, 'title': '', 'description': '', 'site': urlparse(url).netloc})
            raw = resp.read(250000)
            try:
                text = raw.decode('utf-8', errors='ignore')
            except Exception:
                text = raw.decode('latin-1', errors='ignore')
        def meta(prop):
            # og:prop or name=
            patterns = [
                rf'<meta[^>]+property=["\']og:{prop}["\'][^>]+content=["\']([^"\']+)["\']',
                rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:{prop}["\']',
                rf'<meta[^>]+name=["\']{prop}["\'][^>]+content=["\']([^"\']+)["\']',
                rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']{prop}["\']',
            ]
            for p in patterns:
                m = re.search(p, text, re.I)
                if m:
                    return html_lib.unescape(m.group(1).strip())
            return ''
        title = meta('title')
        if not title:
            tm = re.search(r'<title[^>]*>([^<]+)</title>', text, re.I)
            title = html_lib.unescape(tm.group(1).strip()) if tm else ''
        image = meta('image')
        description = meta('description')
        site = meta('site_name') or urlparse(url).netloc
        # resolve relative image
        if image and image.startswith('//'):
            image = 'https:' + image
        elif image and image.startswith('/'):
            p = urlparse(url)
            image = f'{p.scheme}://{p.netloc}{image}'
        return jsonify({
            'type': 'page',
            'url': url,
            'title': title[:200],
            'description': description[:300],
            'image': image[:500] if image else '',
            'site': site[:100],
        })
    except Exception as e:
        return jsonify({'type': 'page', 'url': url, 'title': '', 'description': '', 'image': '', 'site': urlparse(url).netloc, 'error': str(e)[:80]})


def _mines_reset_if_needed(user):
    today = datetime.utcnow().strftime('%Y-%m-%d')
    day = getattr(user, 'mines_day', None) or ''
    left = getattr(user, 'mines_left', None)
    if left is None:
        left = 10
    if day != today:
        user.mines_day = today
        user.mines_left = 10
        left = 10
    return left

@app.route('/api/mines/status')
@login_required
def mines_status():
    me = current_user()
    left = _mines_reset_if_needed(me)
    db.session.commit()
    return jsonify({'left': left, 'max': 10, 'reward': 10})

@app.route('/api/mines/start', methods=['POST'])
@login_required
def mines_start():
    me = current_user()
    left = _mines_reset_if_needed(me)
    if left <= 0:
        return jsonify({'error': 'На сегодня попытки закончились (10/10)'}), 400
    me.mines_left = left - 1
    token = uuid.uuid4().hex
    session['mines_token'] = token
    session['mines_active'] = True
    db.session.commit()
    return jsonify({'status': 'ok', 'left': me.mines_left, 'token': token})

@app.route('/api/mines/win', methods=['POST'])
@login_required
def mines_win():
    me = current_user()
    data = request.json or {}
    token = data.get('token') or ''
    if not session.get('mines_active') or session.get('mines_token') != token:
        return jsonify({'error': 'Нет активной игры'}), 400
    session['mines_active'] = False
    session.pop('mines_token', None)
    me.crystals = (me.crystals or 0) + 10
    db.session.commit()
    return jsonify({'status': 'ok', 'crystals': me.crystals, 'reward': 10})

@app.route('/api/mines/lose', methods=['POST'])
@login_required
def mines_lose():
    session['mines_active'] = False
    session.pop('mines_token', None)
    return jsonify({'status': 'ok'})

from flask import send_from_directory, Response

UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static', 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
ALLOWED_EXT = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'webm', 'mov', 'mp3', 'ogg', 'wav', 'm4a'}
MAX_UPLOAD_BYTES = 12 * 1024 * 1024  # 12 MB

MIME_MAP = {
    'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'gif': 'image/gif', 'webp': 'image/webp',
    'mp4': 'video/mp4', 'webm': 'video/webm', 'mov': 'video/quicktime',
    'mp3': 'audio/mpeg', 'ogg': 'audio/ogg', 'wav': 'audio/wav', 'm4a': 'audio/mp4',
}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXT

def save_media_to_db(file_storage, user_id=None):
    """Read file into MediaFile row; return public URL /media/<id>."""
    if not file_storage or not file_storage.filename:
        raise ValueError('Пустой файл')
    if not allowed_file(file_storage.filename):
        raise ValueError('Неподдерживаемый формат')
    ext = file_storage.filename.rsplit('.', 1)[1].lower()
    data = file_storage.read()
    if not data:
        raise ValueError('Пустой файл')
    if len(data) > MAX_UPLOAD_BYTES:
        raise ValueError('Файл слишком большой (макс. 12 МБ)')
    mid = uuid.uuid4().hex
    ctype = file_storage.mimetype or MIME_MAP.get(ext, 'application/octet-stream')
    media = MediaFile(
        id=mid,
        filename=(file_storage.filename or mid)[:200],
        content_type=ctype[:100],
        data=data,
        size=len(data),
        user_id=user_id,
    )
    db.session.add(media)
    db.session.commit()
    return f'/media/{mid}'

@app.route('/media/<media_id>')
def serve_media_db(media_id):
    media = MediaFile.query.get(media_id)
    if not media:
        # legacy disk fallback
        path = os.path.join(UPLOAD_FOLDER, media_id)
        if os.path.isfile(path):
            return send_from_directory(UPLOAD_FOLDER, media_id, max_age=86400)
        return jsonify({'error': 'not found'}), 404
    size = media.size or (len(media.data) if media.data else 0)
    return Response(
        media.data,
        mimetype=media.content_type or 'application/octet-stream',
        headers={
            'Cache-Control': 'public, max-age=604800, immutable',
            'Content-Length': str(size),
            'Accept-Ranges': 'bytes',
        },
    )

@app.route('/uploads/<path:filename>')
@app.route('/static/uploads/<path:filename>')
def uploaded_file(filename):
    # Prefer DB if id-like without extension
    base = filename.split('/')[-1]
    stem = base.rsplit('.', 1)[0] if '.' in base else base
    media = MediaFile.query.get(stem) or MediaFile.query.get(base)
    if media:
        return Response(
            media.data,
            mimetype=media.content_type or 'application/octet-stream',
            headers={'Cache-Control': 'public, max-age=604800'},
        )
    path = os.path.join(UPLOAD_FOLDER, filename)
    if os.path.isfile(path):
        return send_from_directory(UPLOAD_FOLDER, filename, max_age=86400)
    return jsonify({'error': 'not found'}), 404





@app.route('/api/transcribe', methods=['POST'])
@login_required
def api_transcribe():
    user = current_user()
    if not user:
        return jsonify({'error': 'Нужно войти'}), 401
    if not (premium_active(user) or premium_plus_active(user)):
        return jsonify({'error': 'Расшифровка только для Premium'}), 403
    data = request.get_json(silent=True) or {}
    url = (data.get('url') or '')[:500]
    if not url:
        return jsonify({'error': 'Нет ссылки на голос'}), 400
    audio_bytes = None
    filename = 'voice.webm'
    ctype = 'audio/webm'
    if url.startswith('/media/'):
        mid = url.split('/media/')[-1].split('?')[0]
        media = MediaFile.query.get(mid)
        if media and media.data:
            audio_bytes = media.data
            filename = (media.filename or filename)[:80]
            ctype = media.content_type or ctype
    if not audio_bytes:
        return jsonify({'error': 'Файл голоса не найден'}), 404
    api_key = os.environ.get('OPENAI_API_KEY') or os.environ.get('WHISPER_API_KEY')
    if not api_key:
        return jsonify({'error': 'Распознавание не настроено (OPENAI_API_KEY)'}), 503
    try:
        import json as _json
        from urllib.request import Request, urlopen
        boundary = '----SklewsFormBoundary7MA4YWxk'
        nl = '\r\n'
        chunks = []
        chunks.append('--' + boundary + nl)
        chunks.append('Content-Disposition: form-data; name="model"' + nl + nl)
        chunks.append('whisper-1' + nl)
        chunks.append('--' + boundary + nl)
        chunks.append('Content-Disposition: form-data; name="file"; filename="%s"' % filename + nl)
        chunks.append('Content-Type: %s' % ctype + nl + nl)
        head = ''.join(chunks).encode('utf-8')
        tail = (nl + '--' + boundary + '--' + nl).encode('utf-8')
        body = head + audio_bytes + tail
        req = Request(
            'https://api.openai.com/v1/audio/transcriptions',
            data=body,
            headers={
                'Authorization': 'Bearer ' + api_key,
                'Content-Type': 'multipart/form-data; boundary=' + boundary,
            },
            method='POST',
        )
        with urlopen(req, timeout=90) as resp:
            out = _json.loads(resp.read().decode('utf-8', errors='replace'))
        text = (out.get('text') or '').strip()
        if not text:
            return jsonify({'error': 'Пустая расшифровка'}), 502
        return jsonify({'text': text})
    except Exception as e:
        print('whisper error:', e, flush=True)
        return jsonify({'error': 'Не удалось распознать речь'}), 502


@app.route('/api/upload', methods=['POST'])
@login_required
def upload_file():
    user = current_user()
    if 'file' not in request.files:
        return jsonify({'error': 'Нет файла'}), 400
    try:
        url = save_media_to_db(request.files['file'], user_id=user.id if user else None)
        return jsonify({'url': url})
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        db.session.rollback()
        print('upload error:', e, flush=True)
        return jsonify({'error': 'Ошибка сохранения'}), 500

@app.route('/api/profile/avatar', methods=['POST'])
@login_required
def update_avatar():
    user = current_user()
    if 'file' not in request.files:
        return jsonify({'error': 'Нет файла'}), 400
    try:
        url = save_media_to_db(request.files['file'], user_id=user.id)
        user.avatar = url
        db.session.commit()
        return jsonify({'status': 'ok', 'avatar': user.avatar})
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Ошибка сохранения'}), 500

@app.route('/api/profile/banner', methods=['POST'])
@login_required
def update_banner():
    user = current_user()
    if 'file' not in request.files:
        return jsonify({'error': 'Нет файла'}), 400
    f = request.files['file']
    ctype = (getattr(f, 'mimetype', None) or '').lower()
    is_video = ctype.startswith('video/')
    if is_video and not premium_plus_active(user):
        return jsonify({'error': 'Видео-шапка только для Premium+'}), 403
    try:
        url = save_media_to_db(f, user_id=user.id)
        user.banner = url
        user.banner_type = 'video' if is_video else 'image'
        stretch_raw = request.form.get('stretch') or request.form.get('banner_stretch') or ''
        user.banner_stretch = str(stretch_raw).lower() in ('1', 'true', 'yes', 'on')
        db.session.commit()
        return jsonify({
            'status': 'ok',
            'banner': user.banner,
            'banner_type': user.banner_type,
            'banner_stretch': bool(user.banner_stretch),
        })
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        db.session.rollback()
        print('banner upload error:', e, flush=True)
        return jsonify({'error': 'Ошибка сохранения'}), 500

@app.route('/api/profile/banner-fit', methods=['POST'])
@login_required
def update_banner_fit():
    """Toggle banner stretch (cover) vs contain (letterbox)."""
    user = current_user()
    data = request.get_json(silent=True) or {}
    stretch = data.get('stretch', data.get('banner_stretch', False))
    user.banner_stretch = bool(stretch)
    try:
        db.session.commit()
        return jsonify({'status': 'ok', 'banner_stretch': bool(user.banner_stretch)})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Ошибка сохранения'}), 500


@app.route('/api/channel/<int:channel_id>/avatar', methods=['POST'])
@login_required
def update_channel_avatar(channel_id):
    user = current_user()
    ch = Channel.query.get_or_404(channel_id)
    if ch.owner_id != user.id and not is_admin_user(user):
        return jsonify({'error': 'Только владелец'}), 403
    if 'file' not in request.files:
        return jsonify({'error': 'Нет файла'}), 400
    try:
        url = save_media_to_db(request.files['file'], user_id=user.id)
        ch.avatar = url
        db.session.commit()
        cache_clear_prefix('channels:')
        return jsonify({'status': 'ok', 'avatar': ch.avatar})
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Ошибка сохранения'}), 500


# ==================== ADMIN ====================

@app.route('/api/admin/stats')
@login_required
def admin_stats():
    me = current_user()
    if not is_admin_user(me):
        return jsonify({'error': 'Нет доступа'}), 403
    total = User.query.count()
    online_since = datetime.utcnow() - timedelta(minutes=5)
    online = User.query.filter(User.last_seen != None, User.last_seen >= online_since).count()
    channels = Channel.query.count()
    posts = Post.query.count()
    return jsonify({
        'total_users': total,
        'online_users': online,
        'channels': channels,
        'posts': posts
    })

@app.route('/api/admin/give_crystals', methods=['POST'])
@login_required
def admin_give_crystals():
    me = current_user()
    if not is_admin_user(me):
        return jsonify({'error': 'Нет доступа'}), 403
    data = request.json or {}
    username = (data.get('username') or '').strip()
    try:
        amount = int(data.get('amount') or 0)
    except (TypeError, ValueError):
        return jsonify({'error': 'Некорректное количество'}), 400
    if not username or amount == 0:
        return jsonify({'error': 'Укажите ник и количество'}), 400
    if abs(amount) > 100000:
        return jsonify({'error': 'Слишком большое значение'}), 400
    target = User.query.filter_by(username=username).first()
    if not target:
        return jsonify({'error': 'Пользователь не найден'}), 404
    target.crystals = max(0, (target.crystals or 0) + amount)
    db.session.commit()
    return jsonify({'status': 'ok', 'username': target.username, 'crystals': target.crystals})

@app.route('/api/admin/delete_channels', methods=['POST'])
@login_required
def admin_delete_channels():
    me = current_user()
    if not is_admin_user(me):
        return jsonify({'error': 'Нет доступа'}), 403
    data = request.json or {}
    ids = data.get('ids') or []
    if not isinstance(ids, list) or not ids:
        return jsonify({'error': 'Нет каналов для удаления'}), 400
    # limit safety
    ids = [int(x) for x in ids[:200]]
    deleted = 0
    for cid in ids:
        ch = Channel.query.get(cid)
        if ch:
            _purge_channel(ch)
            deleted += 1
    return jsonify({'status': 'ok', 'deleted': deleted})

@app.route('/api/admin/delete_channel/<int:channel_id>', methods=['POST'])
@login_required
def admin_delete_channel(channel_id):
    me = current_user()
    if not is_admin_user(me):
        return jsonify({'error': 'Нет доступа'}), 403
    ch = Channel.query.get_or_404(channel_id)
    _purge_channel(ch)
    return jsonify({'status': 'ok'})

@app.route('/api/admin/delete_post/<int:post_id>', methods=['POST'])
@login_required
def admin_delete_post(post_id):
    me = current_user()
    if not is_admin_user(me):
        return jsonify({'error': 'Нет доступа'}), 403
    post = Post.query.get_or_404(post_id)
    for model in (PostLike, PostReaction, PostView, Comment):
        model.query.filter_by(post_id=post.id).delete()
    db.session.delete(post)
    db.session.commit()
    return jsonify({'status': 'ok'})

@app.route('/api/admin/delete_comment/<int:comment_id>', methods=['POST'])
@login_required
def admin_delete_comment(comment_id):
    me = current_user()
    if not is_admin_user(me):
        return jsonify({'error': 'Нет доступа'}), 403
    c = Comment.query.get_or_404(comment_id)
    post = Post.query.get(c.post_id)
    db.session.delete(c)
    if post:
        post.comments_count = max(0, (post.comments_count or 1) - 1)
    db.session.commit()
    return jsonify({'status': 'ok'})

def _purge_channel(ch):
    """Delete channel and all related data."""
    posts = Post.query.filter_by(channel_id=ch.id).all()
    for p in posts:
        PostLike.query.filter_by(post_id=p.id).delete()
        PostReaction.query.filter_by(post_id=p.id).delete()
        PostView.query.filter_by(post_id=p.id).delete()
        Comment.query.filter_by(post_id=p.id).delete()
        db.session.delete(p)
    Subscription.query.filter_by(channel_id=ch.id).delete()
    ChannelRole.query.filter_by(channel_id=ch.id).delete()
    db.session.delete(ch)
    db.session.commit()
    cache_clear_prefix('channels:')


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


def ensure_db_schema():
    """Create tables and add missing columns (safe to call multiple times)."""
    from sqlalchemy import text, inspect
    db.create_all()
    dialect = db.engine.dialect.name
    user_table = '"user"' if dialect == 'postgresql' else 'user'

    def _existing_columns(table_name):
        try:
            insp = inspect(db.engine)
            return {c['name'] for c in insp.get_columns(table_name.strip('"'))}
        except Exception as e:
            print('inspect error:', e, flush=True)
            return set()

    def _add_col(table_sql_name, table_raw, col, typ):
        existing = _existing_columns(table_raw)
        if col in existing:
            return
        try:
            sql = f'ALTER TABLE {table_sql_name} ADD COLUMN {col} {typ}'
            print('Migrating:', sql, flush=True)
            db.session.execute(text(sql))
            db.session.commit()
            print(f'Added {table_raw}.{col}', flush=True)
        except Exception as e:
            db.session.rollback()
            print(f'ALTER {table_raw}.{col} failed:', e, flush=True)

    if dialect == 'postgresql':
        user_cols = [
            ('banner', "VARCHAR(256) DEFAULT ''"),
            ('banner_type', "VARCHAR(16) DEFAULT 'image'"),
            ('banner_stretch', 'BOOLEAN DEFAULT FALSE'),
            ('last_seen', 'TIMESTAMP'),
            ('is_admin', 'BOOLEAN DEFAULT FALSE'),
            ('muted_until', 'TIMESTAMP'),
            ('mines_day', 'VARCHAR(10)'),
            ('mines_left', 'INTEGER'),
            ('owned_themes', "VARCHAR(500) DEFAULT ''"),
            ('is_premium_plus', 'BOOLEAN DEFAULT FALSE'),
            ('plus_name_fx', "VARCHAR(32) DEFAULT ''"),
            ('plus_avatar_frame', "VARCHAR(32) DEFAULT ''"),
            ('plus_aura', "VARCHAR(20) DEFAULT ''"),
            ('plus_badge', "VARCHAR(24) DEFAULT ''"),
            ('plus_banner_fx', "VARCHAR(32) DEFAULT ''"),
            ('plus_msg_style', "VARCHAR(32) DEFAULT ''"),
            ('plus_card_style', "VARCHAR(32) DEFAULT ''"),
            ('plus_accent', "VARCHAR(20) DEFAULT ''"),
        ]
        comment_cols = [
            ('media_url', "VARCHAR(500) DEFAULT ''"),
            ('media_type', "VARCHAR(20) DEFAULT ''"),
        ]
    else:
        user_cols = [
            ('banner', "VARCHAR(256) DEFAULT ''"),
            ('banner_type', "VARCHAR(16) DEFAULT 'image'"),
            ('banner_stretch', 'BOOLEAN DEFAULT 0'),
            ('last_seen', 'DATETIME'),
            ('is_admin', 'BOOLEAN DEFAULT 0'),
            ('muted_until', 'DATETIME'),
            ('mines_day', 'VARCHAR(10)'),
            ('mines_left', 'INTEGER'),
            ('owned_themes', "VARCHAR(500) DEFAULT ''"),
            ('is_premium_plus', 'BOOLEAN DEFAULT 0'),
            ('plus_name_fx', "VARCHAR(32) DEFAULT ''"),
            ('plus_avatar_frame', "VARCHAR(32) DEFAULT ''"),
            ('plus_aura', "VARCHAR(20) DEFAULT ''"),
            ('plus_badge', "VARCHAR(24) DEFAULT ''"),
            ('plus_banner_fx', "VARCHAR(32) DEFAULT ''"),
            ('plus_msg_style', "VARCHAR(32) DEFAULT ''"),
            ('plus_card_style', "VARCHAR(32) DEFAULT ''"),
            ('plus_accent', "VARCHAR(20) DEFAULT ''"),
        ]
        comment_cols = [
            ('media_url', "VARCHAR(500) DEFAULT ''"),
            ('media_type', "VARCHAR(20) DEFAULT ''"),
        ]

    for col, typ in user_cols:
        _add_col(user_table, 'user', col, typ)
    for col, typ in comment_cols:
        _add_col('comment', 'comment', col, typ)
    for col, typ in [
        ('plus_frame', "VARCHAR(32) DEFAULT ''"),
        ('plus_header_fx', "VARCHAR(32) DEFAULT ''"),
        ('plus_badge', "VARCHAR(24) DEFAULT ''"),
        ('plus_glow', "VARCHAR(20) DEFAULT ''"),
        ('plus_anim', "VARCHAR(32) DEFAULT ''"),
    ]:
        _add_col('channel', 'channel', col, typ)


# Run schema ensure on import so columns exist even before first request
try:
    with app.app_context():
        ensure_db_schema()
except Exception as e:
    print('ensure_db_schema on import failed:', e, flush=True)

if __name__ == '__main__':
    import sys
    print("=== Sklews starting ===", flush=True)
    print("Python:", sys.version, flush=True)
    print("Init database...", flush=True)
    with app.app_context():
        db.create_all()
        from sqlalchemy import text, inspect
        dialect = db.engine.dialect.name  # 'sqlite' or 'postgresql'
        # Postgres needs quoted "user" (reserved word); SQLite is fine with either
        user_table = '"user"' if dialect == 'postgresql' else 'user'
        comment_table = 'comment'
        if dialect == 'postgresql':
            user_cols = [
                ('banner', "VARCHAR(256) DEFAULT ''"),
            ('banner_type', "VARCHAR(16) DEFAULT 'image'"),
                ('banner_stretch', 'BOOLEAN DEFAULT FALSE'),
                ('last_seen', 'TIMESTAMP'),
                ('is_admin', 'BOOLEAN DEFAULT FALSE'),
                ('muted_until', 'TIMESTAMP'),
            ]
            comment_cols = [
                ('media_url', "VARCHAR(500) DEFAULT ''"),
                ('media_type', "VARCHAR(20) DEFAULT ''"),
            ]
        else:
            user_cols = [
                ('banner', "VARCHAR(256) DEFAULT ''"),
            ('banner_type', "VARCHAR(16) DEFAULT 'image'"),
                ('banner_stretch', 'BOOLEAN DEFAULT 0'),
                ('last_seen', 'DATETIME'),
                ('is_admin', 'BOOLEAN DEFAULT 0'),
                ('muted_until', 'DATETIME'),
            ]
            comment_cols = [
                ('media_url', "VARCHAR(500) DEFAULT ''"),
                ('media_type', "VARCHAR(20) DEFAULT ''"),
            ]

        def _existing_columns(table_name):
            try:
                insp = inspect(db.engine)
                # inspect wants unquoted name
                raw = table_name.strip('"')
                return {c['name'] for c in insp.get_columns(raw)}
            except Exception as e:
                print('inspect error:', e, flush=True)
                return set()

        existing_user = _existing_columns('user')
        for col, typ in user_cols:
            if col in existing_user:
                continue
            try:
                sql = f'ALTER TABLE {user_table} ADD COLUMN {col} {typ}'
                print('Migrating:', sql, flush=True)
                db.session.execute(text(sql))
                db.session.commit()
                print(f'Added column user.{col}', flush=True)
            except Exception as e:
                print(f'ALTER user.{col} failed:', e, flush=True)
                db.session.rollback()

        existing_comment = _existing_columns('comment')
        for col, typ in comment_cols:
            if col in existing_comment:
                continue
            try:
                sql = f'ALTER TABLE {comment_table} ADD COLUMN {col} {typ}'
                print('Migrating:', sql, flush=True)
                db.session.execute(text(sql))
                db.session.commit()
                print(f'Added column comment.{col}', flush=True)
            except Exception as e:
                print(f'ALTER comment.{col} failed:', e, flush=True)
                db.session.rollback()

        
        for col, typ in [
            ('mines_day', 'VARCHAR(10)'),
            ('mines_left', 'INTEGER'),
            ('owned_themes', "VARCHAR(500) DEFAULT ''"),
            ('is_premium_plus', 'BOOLEAN DEFAULT FALSE' if dialect != 'postgresql' else 'BOOLEAN DEFAULT FALSE'),
            ('plus_name_fx', "VARCHAR(32) DEFAULT ''"),
            ('plus_avatar_frame', "VARCHAR(32) DEFAULT ''"),
            ('plus_aura', "VARCHAR(20) DEFAULT ''"),
            ('plus_badge', "VARCHAR(24) DEFAULT ''"),
            ('plus_banner_fx', "VARCHAR(32) DEFAULT ''"),
            ('plus_msg_style', "VARCHAR(32) DEFAULT ''"),
            ('plus_card_style', "VARCHAR(32) DEFAULT ''"),
            ('plus_accent', "VARCHAR(20) DEFAULT ''"),
        ]:
            # re-inspect in case previous adds changed set
            existing_user = _existing_columns('user')
            if col in existing_user:
                continue
            try:
                sql = f'ALTER TABLE {user_table} ADD COLUMN {col} {typ}'
                print('Migrating:', sql, flush=True)
                db.session.execute(text(sql))
                db.session.commit()
            except Exception as e:
                db.session.rollback()
                print('ALTER user col failed:', e, flush=True)


        # Channel plus columns
        existing_ch = _existing_columns('channel')
        for col, typ in [
            ('plus_frame', "VARCHAR(32) DEFAULT ''"),
            ('plus_header_fx', "VARCHAR(32) DEFAULT ''"),
            ('plus_badge', "VARCHAR(24) DEFAULT ''"),
            ('plus_glow', "VARCHAR(20) DEFAULT ''"),
        ]:
            if col in existing_ch:
                continue
            try:
                sql = f'ALTER TABLE channel ADD COLUMN {col} {typ}'
                print('Migrating:', sql, flush=True)
                db.session.execute(text(sql))
                db.session.commit()
            except Exception as e:
                db.session.rollback()
                print('ALTER channel col failed:', e, flush=True)

        # Ensure admin flag for reserved username (safe if column exists)
        try:
            for u in User.query.filter(User.username.in_(list(ADMIN_USERNAMES))).all():
                if not getattr(u, 'is_admin', False):
                    u.is_admin = True
            db.session.commit()
        except Exception as e:
            print('admin flag set failed:', e, flush=True)
            db.session.rollback()

        # One-time cleanup of channels (only if CLEANUP_CHANNELS=1 in env)
        if os.environ.get('CLEANUP_CHANNELS') == '1':
            try:
                keep_name = "Глава этой шляпы"
                to_delete = Channel.query.filter(Channel.name != keep_name).all()
                if to_delete:
                    print(f"Cleanup: deleting {len(to_delete)} channels, keeping '{keep_name}'", flush=True)
                    for ch in to_delete:
                        _purge_channel(ch)
                    print("Cleanup done", flush=True)
                else:
                    print("Cleanup: nothing to delete", flush=True)
            except Exception as e:
                print("Cleanup error:", e, flush=True)
                db.session.rollback()

        # Performance indexes (idempotent)
        try:
            from sqlalchemy import text as _t
            index_sqls = [
                'CREATE INDEX IF NOT EXISTS ix_post_channel_created ON post (channel_id, created_at)',
                'CREATE INDEX IF NOT EXISTS ix_post_channel_id ON post (channel_id)',
                'CREATE INDEX IF NOT EXISTS ix_postreaction_post ON post_reaction (post_id)',
                'CREATE INDEX IF NOT EXISTS ix_postlike_post_user ON post_like (post_id, user_id)',
                'CREATE INDEX IF NOT EXISTS ix_postview_post_user ON post_view (post_id, user_id)',
                'CREATE INDEX IF NOT EXISTS ix_subscription_user ON subscription (user_id)',
                'CREATE INDEX IF NOT EXISTS ix_subscription_channel ON subscription (channel_id)',
                'CREATE INDEX IF NOT EXISTS ix_message_receiver_read ON message (receiver_id, is_read)',
                'CREATE INDEX IF NOT EXISTS ix_comment_post ON comment (post_id)',
                'CREATE INDEX IF NOT EXISTS ix_user_last_seen ON "user" (last_seen)' if dialect == 'postgresql' else 'CREATE INDEX IF NOT EXISTS ix_user_last_seen ON user (last_seen)',
            ]
            for sql in index_sqls:
                try:
                    db.session.execute(_t(sql))
                    db.session.commit()
                except Exception as e:
                    db.session.rollback()
                    # postgres may not like IF NOT EXISTS on older versions — ignore
                    print('index skip:', e, flush=True)
            print('Indexes ready', flush=True)
        except Exception as e:
            print('index setup error:', e, flush=True)

    print("Database ready", flush=True)
    port = int(os.environ.get('PORT', 5000))
    print(f"Starting server on 0.0.0.0:{port} ...", flush=True)
    socketio.run(app, host='0.0.0.0', port=port, debug=False, allow_unsafe_werkzeug=True)



# cache-bust 20260807195406

# redesign-bust 20260808105026

# fix-bust 20260808110406

# media-ux 20260808112017

# ux2 20260808113836

# fix-media-borders 20260808115111
