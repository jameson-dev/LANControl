from flask import Blueprint, request, jsonify, current_app
from flask_login import login_required
from datetime import datetime, timedelta
import json
import csv
import io
from threading import Thread
from app.models import db, Device, DeviceHistory, Setting
from app.scanner import scan_network, check_device_status, get_scan_status, update_device_from_scan, quick_scan_known_devices
from app.wol import send_wol_packet, send_bulk_wol
from app.utils import validate_mac, validate_ip, normalize_mac, calculate_uptime_percentage
from config import Config

api_bp = Blueprint('api', __name__, url_prefix='/api')


# ============================================================================
# DEVICE ENDPOINTS
# ============================================================================

@api_bp.route('/devices', methods=['GET'])
@login_required
def get_devices():
    """Get all devices with optional filtering"""
    # Get query parameters
    group = request.args.get('group')
    favorite = request.args.get('favorite')
    status = request.args.get('status')
    search = request.args.get('search')

    # Build query
    query = Device.query

    if group:
        query = query.filter_by(group=group)

    if favorite:
        query = query.filter_by(is_favorite=(favorite.lower() == 'true'))

    if search:
        search_term = f"%{search}%"
        query = query.filter(
            db.or_(
                Device.ip.like(search_term),
                Device.hostname.like(search_term),
                Device.mac.like(search_term),
                Device.nickname.like(search_term)
            )
        )

    devices = query.all()

    # Filter by status if requested (done after query because it's a property)
    if status:
        devices = [d for d in devices if d.status == status]

    return jsonify({
        'success': True,
        'devices': [d.to_dict() for d in devices],
        'count': len(devices)
    })


@api_bp.route('/devices/<int:device_id>', methods=['GET'])
@login_required
def get_device(device_id):
    """Get a single device"""
    device = Device.query.get_or_404(device_id)
    return jsonify({
        'success': True,
        'device': device.to_dict()
    })


@api_bp.route('/devices', methods=['POST'])
@login_required
def add_device():
    """Add a new device manually"""
    data = request.get_json()

    mac = data.get('mac')
    if not mac:
        return jsonify({'success': False, 'message': 'MAC address required'}), 400

    # Normalize and validate MAC
    mac = normalize_mac(mac)
    if not validate_mac(mac):
        return jsonify({'success': False, 'message': 'Invalid MAC address format'}), 400

    # Check if device already exists
    existing = Device.query.filter_by(mac=mac).first()
    if existing:
        return jsonify({'success': False, 'message': 'Device with this MAC already exists'}), 400

    # Validate IP if provided
    ip = data.get('ip')
    if ip and not validate_ip(ip):
        return jsonify({'success': False, 'message': 'Invalid IP address format'}), 400

    # Create device
    device = Device(
        mac=mac,
        ip=ip,
        hostname=data.get('hostname'),
        nickname=data.get('nickname'),
        group=data.get('group'),
        icon=data.get('icon', 'device'),
        is_favorite=data.get('is_favorite', False),
        is_manual=True
    )

    db.session.add(device)
    db.session.commit()

    return jsonify({
        'success': True,
        'message': 'Device added successfully',
        'device': device.to_dict()
    }), 201


@api_bp.route('/devices/<int:device_id>', methods=['PUT'])
@login_required
def update_device(device_id):
    """Update device information"""
    device = Device.query.get_or_404(device_id)
    data = request.get_json()

    # Update allowed fields
    if 'nickname' in data:
        device.nickname = data['nickname']

    if 'group' in data:
        device.group = data['group']

    if 'icon' in data:
        device.icon = data['icon']

    if 'is_favorite' in data:
        device.is_favorite = data['is_favorite']

    if 'ip' in data:
        ip = data['ip']
        if ip and not validate_ip(ip):
            return jsonify({'success': False, 'message': 'Invalid IP address'}), 400
        device.ip = ip

    if 'hostname' in data:
        device.hostname = data['hostname']

    device.updated_at = datetime.utcnow()
    db.session.commit()

    return jsonify({
        'success': True,
        'message': 'Device updated successfully',
        'device': device.to_dict()
    })


@api_bp.route('/devices/<int:device_id>', methods=['DELETE'])
@login_required
def delete_device(device_id):
    """Delete a device"""
    device = Device.query.get_or_404(device_id)

    db.session.delete(device)
    db.session.commit()

    return jsonify({
        'success': True,
        'message': 'Device deleted successfully'
    })


# ============================================================================
# WAKE-ON-LAN ENDPOINTS
# ============================================================================

@api_bp.route('/devices/<int:device_id>/wol', methods=['POST'])
@login_required
def wake_device(device_id):
    """Send WOL packet to a device"""
    device = Device.query.get_or_404(device_id)

    result = send_wol_packet(device.mac)

    return jsonify(result)


@api_bp.route('/devices/bulk-wol', methods=['POST'])
@login_required
def bulk_wake():
    """Send WOL packets to multiple devices"""
    data = request.get_json()
    device_ids = data.get('device_ids', [])

    if not device_ids:
        return jsonify({'success': False, 'message': 'No devices specified'}), 400

    devices = Device.query.filter(Device.id.in_(device_ids)).all()
    mac_addresses = [d.mac for d in devices]

    result = send_bulk_wol(mac_addresses)

    return jsonify(result)


# ============================================================================
# DEVICE HISTORY & STATS ENDPOINTS
# ============================================================================

@api_bp.route('/devices/<int:device_id>/history', methods=['GET'])
@login_required
def get_device_history(device_id):
    """Get device status history"""
    device = Device.query.get_or_404(device_id)

    # Get days parameter (default 7)
    days = request.args.get('days', 7, type=int)
    start_time = datetime.utcnow() - timedelta(days=days)

    history = DeviceHistory.query.filter(
        DeviceHistory.device_id == device_id,
        DeviceHistory.timestamp >= start_time
    ).order_by(DeviceHistory.timestamp.desc()).all()

    # Calculate uptime percentage
    uptime_pct = calculate_uptime_percentage(device_id, days)

    return jsonify({
        'success': True,
        'device_id': device_id,
        'history': [h.to_dict() for h in history],
        'uptime_percentage': uptime_pct,
        'days': days
    })


# ============================================================================
# SCANNING ENDPOINTS
# ============================================================================

@api_bp.route('/scan/now', methods=['POST'])
@login_required
def trigger_scan():
    """Trigger an immediate network scan"""
    print("[SCAN] /api/scan/now endpoint called")

    status = get_scan_status()
    print(f"[SCAN] Current scan status: {status}")

    if status['in_progress']:
        print("[SCAN] Scan already in progress, returning 409")
        return jsonify({
            'success': False,
            'message': 'Scan already in progress'
        }), 409

    # Get scan range from settings or use default
    scan_range = Setting.get('scan_range', Config.DEFAULT_SCAN_RANGE)
    print(f"[SCAN] Scan range from settings: {scan_range}")

    def scan_task(app):
        """Background scan task"""
        try:
            print(f"[SCAN] Starting background scan task for range: {scan_range}")

            # Run within Flask app context
            with app.app_context():
                print("[SCAN] Calling scan_network function...")
                devices_found = scan_network(scan_range)
                print(f"[SCAN] Scan complete. Found {len(devices_found)} devices")

                # Update or create devices in database
                for device_data in devices_found:
                    existing = Device.query.filter_by(mac=device_data['mac']).first()

                    if existing:
                        # Update existing device
                        update_device_from_scan(existing, device_data)

                        # Record status change
                        if existing.status != 'online':
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
                        db.session.flush()  # Get the ID

                        # Record initial status
                        history = DeviceHistory(device_id=new_device.id, status='online')
                        db.session.add(history)

                db.session.commit()
                print(f"[SCAN] Database updated successfully")

        except Exception as e:
            print(f"[SCAN] ERROR in scan_task: {e}")
            import traceback
            traceback.print_exc()

    # Start scan in background thread with app context
    print("[SCAN] Creating thread...")
    thread = Thread(target=scan_task, args=(current_app._get_current_object(),))
    thread.daemon = True
    print("[SCAN] Starting thread...")
    thread.start()
    print(f"[SCAN] Thread started: {thread.is_alive()}")

    return jsonify({
        'success': True,
        'message': 'Scan started',
        'scan_range': scan_range
    })


@api_bp.route('/scan/status', methods=['GET'])
@login_required
def scan_status():
    """Get current scan status"""
    status = get_scan_status()
    return jsonify({
        'success': True,
        **status
    })


@api_bp.route('/scan/check-device/<int:device_id>', methods=['POST'])
@login_required
def check_device(device_id):
    """Check status of a single device"""
    device = Device.query.get_or_404(device_id)

    result = check_device_status(device)

    # Update last_seen if online
    if result['online']:
        device.last_seen = datetime.utcnow()

        # Record status change if needed
        latest_history = DeviceHistory.query.filter_by(device_id=device_id).order_by(
            DeviceHistory.timestamp.desc()
        ).first()

        if not latest_history or latest_history.status != 'online':
            history = DeviceHistory(device_id=device_id, status='online')
            db.session.add(history)

        db.session.commit()
    else:
        # Record offline status if needed
        latest_history = DeviceHistory.query.filter_by(device_id=device_id).order_by(
            DeviceHistory.timestamp.desc()
        ).first()

        if not latest_history or latest_history.status != 'offline':
            history = DeviceHistory(device_id=device_id, status='offline')
            db.session.add(history)
            db.session.commit()

    return jsonify({
        'success': True,
        'device_id': device_id,
        **result
    })


# ============================================================================
# EXPORT ENDPOINTS
# ============================================================================

@api_bp.route('/devices/export', methods=['GET'])
@login_required
def export_devices():
    """Export devices list"""
    format_type = request.args.get('format', 'json')

    devices = Device.query.all()
    devices_data = [d.to_dict() for d in devices]

    if format_type == 'csv':
        # Create CSV
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=devices_data[0].keys() if devices_data else [])
        writer.writeheader()
        writer.writerows(devices_data)

        return output.getvalue(), 200, {
            'Content-Type': 'text/csv',
            'Content-Disposition': 'attachment; filename=devices.csv'
        }
    else:
        # Return JSON
        return jsonify({
            'success': True,
            'devices': devices_data,
            'count': len(devices_data),
            'exported_at': datetime.utcnow().isoformat()
        })


# ============================================================================
# SETTINGS ENDPOINTS
# ============================================================================

@api_bp.route('/settings', methods=['GET'])
@login_required
def get_settings():
    """Get all settings"""
    settings = Setting.query.all()

    settings_dict = {s.key: s.value for s in settings}

    # Add defaults for missing settings
    if 'scan_range' not in settings_dict:
        settings_dict['scan_range'] = Config.DEFAULT_SCAN_RANGE

    if 'scan_interval' not in settings_dict:
        settings_dict['scan_interval'] = str(Config.DEFAULT_SCAN_INTERVAL)

    if 'auto_scan' not in settings_dict:
        settings_dict['auto_scan'] = 'true'

    if 'history_retention_days' not in settings_dict:
        settings_dict['history_retention_days'] = str(Config.DEFAULT_HISTORY_RETENTION)

    return jsonify({
        'success': True,
        'settings': settings_dict
    })


@api_bp.route('/settings', methods=['PUT'])
@login_required
def update_settings():
    """Update settings"""
    data = request.get_json()

    for key, value in data.items():
        Setting.set(key, str(value))

    return jsonify({
        'success': True,
        'message': 'Settings updated successfully'
    })


# ============================================================================
# STATS ENDPOINTS
# ============================================================================

@api_bp.route('/stats', methods=['GET'])
@login_required
def get_stats():
    """Get network statistics"""
    total_devices = Device.query.count()
    devices = Device.query.all()

    online_count = sum(1 for d in devices if d.status == 'online')
    offline_count = sum(1 for d in devices if d.status == 'offline')
    unknown_count = sum(1 for d in devices if d.status == 'unknown')

    favorites_count = Device.query.filter_by(is_favorite=True).count()
    manual_count = Device.query.filter_by(is_manual=True).count()

    # Get groups
    groups = db.session.query(Device.group, db.func.count(Device.id)).group_by(Device.group).all()
    groups_dict = {g[0] or 'Ungrouped': g[1] for g in groups}

    return jsonify({
        'success': True,
        'stats': {
            'total_devices': total_devices,
            'online': online_count,
            'offline': offline_count,
            'unknown': unknown_count,
            'favorites': favorites_count,
            'manual': manual_count,
            'groups': groups_dict
        }
    })
