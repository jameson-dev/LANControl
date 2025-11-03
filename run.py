#!/usr/bin/env python3
"""
LANControl - Network Device Management Application
Main entry point for running the application.
"""

import sys
import os

# Force unbuffered output for proper logging in systemd
sys.stdout = os.fdopen(sys.stdout.fileno(), 'w', buffering=1)
sys.stderr = os.fdopen(sys.stderr.fileno(), 'w', buffering=1)

from app import create_app
from app.models import db, User, DevicePort, DeviceAlert, AlertRule, NetworkTopology, BandwidthUsage
from config import Config


def create_user(username, password):
    """Create a new user"""
    app = create_app()
    with app.app_context():
        existing = User.query.filter_by(username=username).first()
        if existing:
            print(f"Error: User '{username}' already exists")
            return False

        user = User(username=username)
        user.set_password(password)
        db.session.add(user)
        db.session.commit()

        print(f"User '{username}' created successfully")
        return True


def init_database():
    """Initialize the database"""
    app = create_app()
    with app.app_context():
        db.create_all()
        print("Database initialized successfully")


def migrate_database():
    """Migrate database to add new tables (for existing installations)"""
    app = create_app()
    with app.app_context():
        # This will create new tables without affecting existing ones
        db.create_all()
        print("Database migration complete - new tables added")


def main():
    """Main entry point"""
    # Check for command-line arguments
    if len(sys.argv) > 1:
        command = sys.argv[1]

        if command == 'init-db':
            init_database()
            return

        elif command == 'migrate-db':
            migrate_database()
            return

        elif command == 'create-user':
            if len(sys.argv) < 4:
                print("Usage: python run.py create-user <username> <password>")
                return

            username = sys.argv[2]
            password = sys.argv[3]
            create_user(username, password)
            return

        else:
            print(f"Unknown command: {command}")
            print("Available commands:")
            print("  init-db              - Initialize the database")
            print("  migrate-db           - Migrate database (add new tables)")
            print("  create-user <user> <pass> - Create a new user")
            return

    # Run the application
    app = create_app()

    print("=" * 60)
    print("LANControl - Network Device Management")
    print("=" * 60)
    print(f"Server: http://{Config.BIND_HOST}:{Config.BIND_PORT}")
    print("=" * 60)
    print("\nPress Ctrl+C to stop the server\n")

    app.run(
        host=Config.BIND_HOST,
        port=Config.BIND_PORT,
        debug=False,
        threaded=True
    )


if __name__ == '__main__':
    main()
