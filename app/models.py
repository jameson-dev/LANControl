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

    # Relationships
    history = db.relationship('DeviceHistory', backref='device', lazy=True, cascade='all, delete-orphan')
    ports = db.relationship('DevicePort', backref='device', lazy=True, cascade='all, delete-orphan')
    alerts = db.relationship('DeviceAlert', backref='device', lazy=True, cascade='all, delete-orphan')

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


class DevicePort(db.Model):
    __tablename__ = 'device_ports'

    id = db.Column(db.Integer, primary_key=True)
    device_id = db.Column(db.Integer, db.ForeignKey('devices.id'), nullable=False)
    port = db.Column(db.Integer, nullable=False)
    protocol = db.Column(db.String(10), default='tcp')  # 'tcp' or 'udp'
    service = db.Column(db.String(50), nullable=True)  # HTTP, SSH, etc.
    state = db.Column(db.String(20), default='open')  # open, closed, filtered
    last_scanned = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.Index('idx_device_port', 'device_id', 'port', 'protocol'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'device_id': self.device_id,
            'port': self.port,
            'protocol': self.protocol,
            'service': self.service,
            'state': self.state,
            'last_scanned': self.last_scanned.isoformat()
        }

    def __repr__(self):
        return f'<DevicePort device={self.device_id} port={self.port}/{self.protocol}>'


class DeviceAlert(db.Model):
    __tablename__ = 'device_alerts'

    id = db.Column(db.Integer, primary_key=True)
    device_id = db.Column(db.Integer, db.ForeignKey('devices.id'), nullable=False)
    alert_type = db.Column(db.String(50), nullable=False)  # 'status_change', 'new_device', 'port_change'
    message = db.Column(db.Text, nullable=False)
    severity = db.Column(db.String(20), default='info')  # 'info', 'warning', 'critical'
    is_read = db.Column(db.Boolean, default=False)
    is_notified = db.Column(db.Boolean, default=False)  # Email sent or not
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    extra_data = db.Column(db.Text, nullable=True)  # JSON string for additional data

    __table_args__ = (
        db.Index('idx_alert_created', 'created_at'),
        db.Index('idx_alert_read', 'is_read'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'device_id': self.device_id,
            'alert_type': self.alert_type,
            'message': self.message,
            'severity': self.severity,
            'is_read': self.is_read,
            'is_notified': self.is_notified,
            'created_at': self.created_at.isoformat(),
            'extra_data': self.extra_data
        }

    def __repr__(self):
        return f'<DeviceAlert {self.alert_type} device={self.device_id}>'


class AlertRule(db.Model):
    __tablename__ = 'alert_rules'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    event_type = db.Column(db.String(50), nullable=False)  # 'device_offline', 'device_online', 'new_device', 'port_change'
    enabled = db.Column(db.Boolean, default=True)
    notify_email = db.Column(db.Boolean, default=False)
    notify_webhook = db.Column(db.Boolean, default=False)
    webhook_url = db.Column(db.String(500), nullable=True)
    device_filter = db.Column(db.String(100), nullable=True)  # 'all', 'favorites', or specific group name
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'event_type': self.event_type,
            'enabled': self.enabled,
            'notify_email': self.notify_email,
            'notify_webhook': self.notify_webhook,
            'webhook_url': self.webhook_url,
            'device_filter': self.device_filter,
            'created_at': self.created_at.isoformat()
        }

    def __repr__(self):
        return f'<AlertRule {self.name}>'
