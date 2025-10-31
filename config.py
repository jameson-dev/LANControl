import os
from datetime import timedelta

class Config:
    # Base directory
    BASE_DIR = os.path.abspath(os.path.dirname(__file__))

    # Secret key for session management
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key-change-in-production'

    # Database
    DATABASE_PATH = os.path.join(BASE_DIR, 'data', 'lancontrol.db')
    SQLALCHEMY_DATABASE_URI = f'sqlite:///{DATABASE_PATH}'
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Session configuration
    PERMANENT_SESSION_LIFETIME = timedelta(days=30)
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'

    # Server configuration
    BIND_HOST = os.environ.get('BIND_HOST', '127.0.0.1')
    BIND_PORT = int(os.environ.get('BIND_PORT', 5000))

    # Scanning defaults
    DEFAULT_SCAN_RANGE = '192.168.1.0/24'
    DEFAULT_SCAN_INTERVAL = 300  # 5 minutes
    DEFAULT_HISTORY_RETENTION = 30  # days

    # MAC vendor lookup
    MAC_VENDOR_API = 'https://api.macvendors.com'
    MAC_VENDOR_CACHE_FILE = os.path.join(BASE_DIR, 'data', 'mac_vendors.json')
