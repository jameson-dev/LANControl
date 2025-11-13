from apscheduler.schedulers.background import BackgroundScheduler
from datetime import datetime, timedelta
from app.models import db, Device, DeviceHistory, Setting
from app.scanner import scan_network, update_device_from_scan, quick_scan_known_devices
from config import Config

scheduler = BackgroundScheduler()


# ============================================================================
# EXISTING SCHEDULER JOBS
# ============================================================================


def scheduled_network_scan():
    """
    Perform a scheduled network scan.
    This runs in the background at intervals defined in settings.
    """
    print(f"[{datetime.utcnow()}] Running scheduled network scan...")

    try:
        with scheduler.app.app_context():
            # Get scan range from settings
            scan_range = Setting.get('scan_range', Config.DEFAULT_SCAN_RANGE)

            # Perform scan
            devices_found = scan_network(scan_range)

            # Update or create devices in database
            for device_data in devices_found:
                existing = Device.query.filter_by(mac=device_data['mac']).first()

                if existing:
                    # Update existing device
                    update_device_from_scan(existing, device_data)

                    # Record status change to online
                    latest_history = DeviceHistory.query.filter_by(
                        device_id=existing.id
                    ).order_by(DeviceHistory.timestamp.desc()).first()

                    if not latest_history or latest_history.status != 'online':
                        history = DeviceHistory(device_id=existing.id, status='online')
                        db.session.add(history)
                else:
                    # Create new device
                    new_device = Device(
                        ip=device_data['ip'],
                        hostname=device_data['hostname'],
                        mac=device_data['mac'],
                        last_seen=device_data['last_seen'],
                        is_manual=False
                    )
                    db.session.add(new_device)
                    db.session.flush()

                    # Record initial status
                    history = DeviceHistory(device_id=new_device.id, status='online')
                    db.session.add(history)

            db.session.commit()

            print(f"Scheduled scan complete. Found {len(devices_found)} devices.")

    except Exception as e:
        print(f"Error in scheduled scan: {e}")


def check_device_statuses():
    """
    Check status of all known devices.
    This is faster than a full network scan and updates device availability.
    """
    print(f"[{datetime.utcnow()}] Checking device statuses...")

    try:
        with scheduler.app.app_context():
            devices = Device.query.all()

            if not devices:
                return

            # Quick check all devices
            results = quick_scan_known_devices(devices)

            # Update database with results
            for device_id, result in results.items():
                device = Device.query.get(device_id)
                if not device:
                    continue

                if result['online']:
                    device.last_seen = datetime.utcnow()

                # Get latest history entry
                latest_history = DeviceHistory.query.filter_by(
                    device_id=device_id
                ).order_by(DeviceHistory.timestamp.desc()).first()

                new_status = 'online' if result['online'] else 'offline'

                # Only add history if status changed
                if not latest_history or latest_history.status != new_status:
                    history = DeviceHistory(device_id=device_id, status=new_status)
                    db.session.add(history)

            db.session.commit()

        print(f"Status check complete. Checked {len(devices)} devices.")

    except Exception as e:
        print(f"Error checking device statuses: {e}")


def cleanup_old_history():
    """
    Clean up old device history records based on retention setting.
    """
    print(f"[{datetime.utcnow()}] Cleaning up old history...")

    try:
        with scheduler.app.app_context():
            retention_days = int(Setting.get('history_retention_days', Config.DEFAULT_HISTORY_RETENTION))
            cutoff_date = datetime.utcnow() - timedelta(days=retention_days)

            # Delete old records
            deleted = DeviceHistory.query.filter(
                DeviceHistory.timestamp < cutoff_date
            ).delete()

            db.session.commit()

            print(f"Cleaned up {deleted} old history records (older than {retention_days} days).")

    except Exception as e:
        print(f"Error cleaning up history: {e}")


def init_scheduler(app):
    """
    Initialize and start the background scheduler.

    Args:
        app: Flask application instance
    """
    # Store app context for use in scheduled jobs
    scheduler.app = app

    # Get scan interval from settings (or use default)
    with app.app_context():
        auto_scan = Setting.get('auto_scan', 'true')
        scan_interval = int(Setting.get('scan_interval', Config.DEFAULT_SCAN_INTERVAL))

    # Add scheduled jobs
    if auto_scan.lower() == 'true':
        # Full network scan at configured interval
        scheduler.add_job(
            func=scheduled_network_scan,
            trigger='interval',
            seconds=scan_interval,
            id='network_scan',
            name='Network Scan',
            replace_existing=True
        )

        # Quick status check every 2 minutes
        scheduler.add_job(
            func=check_device_statuses,
            trigger='interval',
            seconds=120,
            id='status_check',
            name='Device Status Check',
            replace_existing=True
        )

    # Cleanup old history once per day at 3 AM
    scheduler.add_job(
        func=cleanup_old_history,
        trigger='cron',
        hour=3,
        minute=0,
        id='history_cleanup',
        name='History Cleanup',
        replace_existing=True
    )

    # Start the scheduler
    scheduler.start()
    print("Background scheduler started")


def update_scan_interval(interval_seconds):
    """
    Update the scan interval for the scheduled network scan.

    Args:
        interval_seconds: New interval in seconds
    """
    try:
        job = scheduler.get_job('network_scan')
        if job:
            scheduler.reschedule_job(
                'network_scan',
                trigger='interval',
                seconds=interval_seconds
            )
            print(f"Scan interval updated to {interval_seconds} seconds")
    except Exception as e:
        print(f"Error updating scan interval: {e}")


def toggle_auto_scan(enabled):
    """
    Enable or disable automatic scanning.

    Args:
        enabled: Boolean to enable/disable auto scan
    """
    try:
        if enabled:
            # Get current interval from settings
            with scheduler.app.app_context():
                scan_interval = int(Setting.get('scan_interval', Config.DEFAULT_SCAN_INTERVAL))

            scheduler.add_job(
                func=scheduled_network_scan,
                trigger='interval',
                seconds=scan_interval,
                id='network_scan',
                name='Network Scan',
                replace_existing=True
            )

            scheduler.add_job(
                func=check_device_statuses,
                trigger='interval',
                seconds=120,
                id='status_check',
                name='Device Status Check',
                replace_existing=True
            )

            print("Auto scan enabled")
        else:
            # Remove scan jobs
            if scheduler.get_job('network_scan'):
                scheduler.remove_job('network_scan')
            if scheduler.get_job('status_check'):
                scheduler.remove_job('status_check')

            print("Auto scan disabled")
    except Exception as e:
        print(f"Error toggling auto scan: {e}")


def shutdown_scheduler():
    """Shutdown the scheduler gracefully"""
    scheduler.shutdown()
    print("Background scheduler stopped")
