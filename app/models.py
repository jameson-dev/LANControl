from datetime import datetime
from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()

class User(UserMixin, db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def __repr__(self):
        return f'<User {self.username}>'


class Device(db.Model):
    __tablename__ = 'devices'

    id = db.Column(db.Integer, primary_key=True)
    ip = db.Column(db.String(15), nullable=True)
    hostname = db.Column(db.String(255), nullable=True)
    mac = db.Column(db.String(17), unique=True, nullable=False)
    nickname = db.Column(db.String(100), nullable=True)
    group = db.Column(db.String(50), nullable=True)
    icon = db.Column(db.String(50), default='device')
    is_favorite = db.Column(db.Boolean, default=False)
    is_manual = db.Column(db.Boolean, default=False)
    last_seen = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationship to history
    history = db.relationship('DeviceHistory', backref='device', lazy=True, cascade='all, delete-orphan')

    @property
    def status(self):
        """Get current online/offline status based on last_seen"""
        if not self.last_seen:
            return 'unknown'
        # Consider device offline if not seen in last 10 minutes
        time_diff = datetime.utcnow() - self.last_seen
        return 'online' if time_diff.total_seconds() < 600 else 'offline'

    @property
    def vendor(self):
        """Get MAC vendor (will be populated by utility function)"""
        from app.utils import get_mac_vendor
        return get_mac_vendor(self.mac)

    def to_dict(self):
        return {
            'id': self.id,
            'ip': self.ip,
            'hostname': self.hostname,
            'mac': self.mac,
            'nickname': self.nickname,
            'group': self.group,
            'icon': self.icon,
            'is_favorite': self.is_favorite,
            'is_manual': self.is_manual,
            'last_seen': self.last_seen.isoformat() if self.last_seen else None,
            'status': self.status,
            'vendor': self.vendor,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }

    def __repr__(self):
        return f'<Device {self.nickname or self.hostname or self.mac}>'


class DeviceHistory(db.Model):
    __tablename__ = 'device_history'

    id = db.Column(db.Integer, primary_key=True)
    device_id = db.Column(db.Integer, db.ForeignKey('devices.id'), nullable=False)
    status = db.Column(db.String(10), nullable=False)  # 'online' or 'offline'
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, index=True)

    __table_args__ = (
        db.Index('idx_device_timestamp', 'device_id', 'timestamp'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'device_id': self.device_id,
            'status': self.status,
            'timestamp': self.timestamp.isoformat()
        }

    def __repr__(self):
        return f'<DeviceHistory device={self.device_id} status={self.status}>'


class Setting(db.Model):
    __tablename__ = 'settings'

    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(100), unique=True, nullable=False)
    value = db.Column(db.Text, nullable=True)

    @staticmethod
    def get(key, default=None):
        """Get setting value by key"""
        setting = Setting.query.filter_by(key=key).first()
        return setting.value if setting else default

    @staticmethod
    def set(key, value):
        """Set or update setting value"""
        setting = Setting.query.filter_by(key=key).first()
        if setting:
            setting.value = value
        else:
            setting = Setting(key=key, value=value)
            db.session.add(setting)
        db.session.commit()

    def __repr__(self):
        return f'<Setting {self.key}={self.value}>'
