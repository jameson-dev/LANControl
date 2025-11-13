import os
from flask import Flask, render_template, redirect, url_for
from flask_login import LoginManager, login_required
from config import Config
from app.models import db, User
from app.auth import auth_bp
from app.api import api_bp
from app.scheduler import init_scheduler, shutdown_scheduler
import atexit

login_manager = LoginManager()


def create_app(config_class=Config):
    """
    Create and configure the Flask application.

    Args:
        config_class: Configuration class to use

    Returns:
        Flask application instance
    """
    # Get the parent directory (project root) for templates and static files
    template_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'templates')
    static_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'static')

    app = Flask(__name__, template_folder=template_dir, static_folder=static_dir)
    app.config.from_object(config_class)

    # Initialize extensions
    db.init_app(app)
    login_manager.init_app(app)
    login_manager.login_view = 'auth.login'
    login_manager.login_message = None  # Disable the "Please log in" flash message
    login_manager.session_protection = 'strong'

    # Register blueprints
    app.register_blueprint(auth_bp)
    app.register_blueprint(api_bp)

    # User loader for Flask-Login
    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(int(user_id))

    # Main routes
    @app.route('/')
    def index():
        """Redirect to dashboard"""
        return redirect(url_for('main.dashboard'))

    @app.route('/dashboard')
    @login_required
    def dashboard():
        """Main dashboard view"""
        return render_template('dashboard.html')

    @app.route('/settings')
    @login_required
    def settings():
        """Settings page"""
        return render_template('settings.html')

    @app.route('/alerts')
    @login_required
    def alerts():
        """Alerts page"""
        return render_template('alerts.html')

    @app.route('/insights')
    @login_required
    def insights():
        """Device insights and statistics page"""
        return render_template('insights.html')

    # Register main blueprint
    from flask import Blueprint
    main_bp = Blueprint('main', __name__)
    main_bp.add_url_rule('/dashboard', 'dashboard', dashboard)
    main_bp.add_url_rule('/settings', 'settings', settings)
    main_bp.add_url_rule('/alerts', 'alerts', alerts)
    main_bp.add_url_rule('/insights', 'insights', insights)
    app.register_blueprint(main_bp)

    # Error handlers
    @app.errorhandler(404)
    def not_found(error):
        return render_template('404.html'), 404

    @app.errorhandler(500)
    def internal_error(error):
        db.session.rollback()
        return render_template('500.html'), 500

    # Initialize database
    with app.app_context():
        db.create_all()

        # Initialize default settings if not present
        from app.models import Setting
        if not Setting.query.filter_by(key='scan_range').first():
            Setting.set('scan_range', Config.DEFAULT_SCAN_RANGE)
        if not Setting.query.filter_by(key='scan_interval').first():
            Setting.set('scan_interval', str(Config.DEFAULT_SCAN_INTERVAL))
        if not Setting.query.filter_by(key='auto_scan').first():
            Setting.set('auto_scan', 'true')
        if not Setting.query.filter_by(key='history_retention_days').first():
            Setting.set('history_retention_days', str(Config.DEFAULT_HISTORY_RETENTION))

    # Initialize background scheduler
    init_scheduler(app)

    # Register cleanup on exit
    atexit.register(lambda: shutdown_scheduler())

    return app
