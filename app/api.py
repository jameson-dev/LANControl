from flask import Blueprint, request, jsonify, current_app
from flask_login import login_required
from datetime import datetime, timedelta
import json
import csv
import io
from threading import Thread
from app.models import db, Device, DeviceHistory, Setting, DevicePort, DeviceAlert, AlertRule
from app.scanner import scan_network, check_device_status, get_scan_status, update_device_from_scan, quick_scan_known_devices
from app.wol import send_wol_packet, send_bulk_wol
from app.utils import validate_mac, validate_ip, normalize_mac, calculate_uptime_percentage
from app.port_scanner import scan_device_ports, quick_scan_common_ports, full_port_scan, detect_device_type
from app.alerts import create_alert, check_device_status_change, check_new_device, check_port_changes
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
    status = get_scan_status()

    if status['in_progress']:
        return jsonify({
            'success': False,
            'message': 'Scan already in progress'
        }), 409

    # Get scan range from settings or use default
    scan_range = Setting.get('scan_range', Config.DEFAULT_SCAN_RANGE)

    def scan_task(app):
        """Background scan task"""
        try:
            # Run within Flask app context
            with app.app_context():
                devices_found = scan_network(scan_range)

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

        except Exception as e:
            print(f"ERROR in scan_task: {e}")
            import traceback
            traceback.print_exc()

    # Start scan in background thread with app context
    thread = Thread(target=scan_task, args=(current_app._get_current_object(),))
    thread.daemon = True
    thread.start()

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


@api_bp.route('/scan/test-ping', methods=['POST'])
@login_required
def test_ping():
    """Test if ping works from the service"""
    import subprocess

    test_ip = request.get_json().get('ip', '192.168.0.1')

    try:
        result = subprocess.run(
            ['/bin/ping', '-c', '1', '-W', '1', test_ip],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=2
        )

        return jsonify({
            'success': True,
            'ip': test_ip,
            'returncode': result.returncode,
            'stdout': result.stdout.decode(),
            'stderr': result.stderr.decode(),
            'ping_worked': result.returncode == 0
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
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


# ============================================================================
# PORT SCANNING ENDPOINTS
# ============================================================================

@api_bp.route('/devices/<int:device_id>/ports/scan', methods=['POST'])
@login_required
def scan_device_ports_endpoint(device_id):
    """Scan ports on a specific device"""
    device = Device.query.get_or_404(device_id)

    if not device.ip:
        return jsonify({'success': False, 'message': 'Device has no IP address'}), 400

    data = request.get_json() or {}
    scan_type = data.get('scan_type', 'quick')  # 'quick' or 'full'

    try:
        # Perform port scan
        if scan_type == 'full':
            open_ports = full_port_scan(device.ip)
        else:
            open_ports = quick_scan_common_ports(device.ip)

        # Delete old port records
        DevicePort.query.filter_by(device_id=device_id).delete()

        # Add new port records
        for port_info in open_ports:
            port = DevicePort(
                device_id=device_id,
                port=port_info['port'],
                protocol=port_info['protocol'],
                service=port_info['service'],
                state=port_info['state']
            )
            db.session.add(port)

        db.session.commit()

        # Detect device type
        device_type = detect_device_type(open_ports)

        return jsonify({
            'success': True,
            'message': f'Found {len(open_ports)} open ports',
            'ports': open_ports,
            'device_type': device_type
        })

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@api_bp.route('/devices/<int:device_id>/ports', methods=['GET'])
@login_required
def get_device_ports(device_id):
    """Get scanned ports for a device"""
    ports = DevicePort.query.filter_by(device_id=device_id).order_by(DevicePort.port).all()

    return jsonify({
        'success': True,
        'ports': [p.to_dict() for p in ports]
    })


# ============================================================================
# ALERT ENDPOINTS
# ============================================================================

@api_bp.route('/alerts', methods=['GET'])
@login_required
def get_alerts():
    """Get all alerts with optional filtering"""
    # Get query parameters
    device_id = request.args.get('device_id', type=int)
    alert_type = request.args.get('alert_type')
    is_read = request.args.get('is_read')
    limit = request.args.get('limit', type=int, default=100)

    # Build query
    query = DeviceAlert.query

    if device_id:
        query = query.filter_by(device_id=device_id)

    if alert_type:
        query = query.filter_by(alert_type=alert_type)

    if is_read is not None:
        query = query.filter_by(is_read=(is_read.lower() == 'true'))

    # Order by most recent first
    alerts = query.order_by(DeviceAlert.created_at.desc()).limit(limit).all()

    return jsonify({
        'success': True,
        'alerts': [a.to_dict() for a in alerts]
    })


@api_bp.route('/alerts/<int:alert_id>/read', methods=['POST'])
@login_required
def mark_alert_read(alert_id):
    """Mark an alert as read"""
    alert = DeviceAlert.query.get_or_404(alert_id)
    alert.is_read = True
    db.session.commit()

    return jsonify({'success': True, 'message': 'Alert marked as read'})


@api_bp.route('/alerts/mark-all-read', methods=['POST'])
@login_required
def mark_all_alerts_read():
    """Mark all alerts as read"""
    DeviceAlert.query.filter_by(is_read=False).update({'is_read': True})
    db.session.commit()

    return jsonify({'success': True, 'message': 'All alerts marked as read'})


@api_bp.route('/alerts/<int:alert_id>', methods=['DELETE'])
@login_required
def delete_alert(alert_id):
    """Delete an alert"""
    alert = DeviceAlert.query.get_or_404(alert_id)
    db.session.delete(alert)
    db.session.commit()

    return jsonify({'success': True, 'message': 'Alert deleted'})


@api_bp.route('/alerts/stats', methods=['GET'])
@login_required
def get_alert_stats():
    """Get alert statistics"""
    total_alerts = DeviceAlert.query.count()
    unread_alerts = DeviceAlert.query.filter_by(is_read=False).count()

    # Count by severity
    critical = DeviceAlert.query.filter_by(severity='critical').count()
    warning = DeviceAlert.query.filter_by(severity='warning').count()
    info = DeviceAlert.query.filter_by(severity='info').count()

    # Count by type
    status_change = DeviceAlert.query.filter_by(alert_type='status_change').count()
    new_device = DeviceAlert.query.filter_by(alert_type='new_device').count()
    port_change = DeviceAlert.query.filter_by(alert_type='port_change').count()

    return jsonify({
        'success': True,
        'stats': {
            'total': total_alerts,
            'unread': unread_alerts,
            'by_severity': {
                'critical': critical,
                'warning': warning,
                'info': info
            },
            'by_type': {
                'status_change': status_change,
                'new_device': new_device,
                'port_change': port_change
            }
        }
    })


# ============================================================================
# ALERT RULE ENDPOINTS
# ============================================================================

@api_bp.route('/alert-rules', methods=['GET'])
@login_required
def get_alert_rules():
    """Get all alert rules"""
    rules = AlertRule.query.order_by(AlertRule.created_at.desc()).all()

    return jsonify({
        'success': True,
        'rules': [r.to_dict() for r in rules]
    })


@api_bp.route('/alert-rules', methods=['POST'])
@login_required
def create_alert_rule():
    """Create a new alert rule"""
    data = request.get_json()

    rule = AlertRule(
        name=data.get('name'),
        event_type=data.get('event_type'),
        enabled=data.get('enabled', True),
        notify_email=data.get('notify_email', False),
        notify_webhook=data.get('notify_webhook', False),
        webhook_url=data.get('webhook_url'),
        device_filter=data.get('device_filter', 'all')
    )

    db.session.add(rule)
    db.session.commit()

    return jsonify({
        'success': True,
        'message': 'Alert rule created',
        'rule': rule.to_dict()
    })


@api_bp.route('/alert-rules/<int:rule_id>', methods=['PUT'])
@login_required
def update_alert_rule(rule_id):
    """Update an alert rule"""
    rule = AlertRule.query.get_or_404(rule_id)
    data = request.get_json()

    if 'name' in data:
        rule.name = data['name']
    if 'event_type' in data:
        rule.event_type = data['event_type']
    if 'enabled' in data:
        rule.enabled = data['enabled']
    if 'notify_email' in data:
        rule.notify_email = data['notify_email']
    if 'notify_webhook' in data:
        rule.notify_webhook = data['notify_webhook']
    if 'webhook_url' in data:
        rule.webhook_url = data['webhook_url']
    if 'device_filter' in data:
        rule.device_filter = data['device_filter']

    db.session.commit()

    return jsonify({
        'success': True,
        'message': 'Alert rule updated',
        'rule': rule.to_dict()
    })


@api_bp.route('/alert-rules/<int:rule_id>', methods=['DELETE'])
@login_required
def delete_alert_rule(rule_id):
    """Delete an alert rule"""
    rule = AlertRule.query.get_or_404(rule_id)
    db.session.delete(rule)
    db.session.commit()

    return jsonify({'success': True, 'message': 'Alert rule deleted'})


# ============================================================================
# V3 FEATURES - DEVICE NOTES & DOCUMENTATION
# ============================================================================

@api_bp.route('/devices/<int:device_id>/notes', methods=['PUT'])
@login_required
def update_device_notes(device_id):
    """Update device notes"""
    device = Device.query.get_or_404(device_id)
    data = request.get_json() or {}

    device.notes = data.get('notes', '')
    device.purchase_date = data.get('purchase_date')
    device.warranty_until = data.get('warranty_until')
    device.device_type = data.get('device_type')

    db.session.commit()

    return jsonify({'success': True, 'device': device.to_dict()})


# ============================================================================
# V3 FEATURES - GROUPING & BULK ACTIONS
# ============================================================================

@api_bp.route('/groups', methods=['GET'])
@login_required
def get_groups():
    """Get all groups with device counts"""
    from sqlalchemy import func

    groups = db.session.query(
        Device.group,
        func.count(Device.id).label('count'),
        func.sum(db.case((Device.status == 'online', 1), else_=0)).label('online')
    ).filter(
        Device.group.isnot(None)
    ).group_by(Device.group).all()

    return jsonify({
        'success': True,
        'groups': [
            {
                'name': g[0],
                'total': g[1],
                'online': g[2] or 0
            }
            for g in groups
        ]
    })


@api_bp.route('/devices/bulk/wake', methods=['POST'])
@login_required
def bulk_wake_devices():
    """Wake multiple devices"""
    data = request.get_json() or {}
    device_ids = data.get('device_ids', [])

    if not device_ids:
        return jsonify({'success': False, 'message': 'No devices specified'}), 400

    results = []
    for device_id in device_ids:
        device = Device.query.get(device_id)
        if device and device.mac:
            try:
                send_wol_packet(device.mac)
                results.append({'id': device_id, 'success': True})
            except Exception as e:
                results.append({'id': device_id, 'success': False, 'error': str(e)})

    return jsonify({'success': True, 'results': results})


@api_bp.route('/devices/bulk/group', methods=['POST'])
@login_required
def bulk_assign_group():
    """Assign group to multiple devices"""
    data = request.get_json() or {}
    device_ids = data.get('device_ids', [])
    group_name = data.get('group')

    if not device_ids:
        return jsonify({'success': False, 'message': 'No devices specified'}), 400

    devices = Device.query.filter(Device.id.in_(device_ids)).all()
    for device in devices:
        device.group = group_name

    db.session.commit()

    return jsonify({'success': True, 'updated': len(devices)})


@api_bp.route('/devices/bulk/favorite', methods=['POST'])
@login_required
def bulk_toggle_favorite():
    """Toggle favorite for multiple devices"""
    data = request.get_json() or {}
    device_ids = data.get('device_ids', [])
    is_favorite = data.get('is_favorite', True)

    if not device_ids:
        return jsonify({'success': False, 'message': 'No devices specified'}), 400

    devices = Device.query.filter(Device.id.in_(device_ids)).all()
    for device in devices:
        device.is_favorite = is_favorite

    db.session.commit()

    return jsonify({'success': True, 'updated': len(devices)})


# ============================================================================
# V3 FEATURES - NETWORK TOPOLOGY
# ============================================================================

@api_bp.route('/topology', methods=['GET'])
@login_required
def get_topology():
    """Get complete network topology"""
    from app.topology import get_topology_graph

    graph = get_topology_graph()
    return jsonify({'success': True, 'topology': graph})


@api_bp.route('/topology/discover', methods=['POST'])
@login_required
def discover_topology():
    """Trigger topology discovery"""
    from app.topology import discover_topology

    Thread(target=discover_topology).start()

    return jsonify({'success': True, 'message': 'Topology discovery started'})


@api_bp.route('/topology/position', methods=['PUT'])
@login_required
def update_topology_position():
    """Update device position in topology map"""
    from app.topology import update_device_position

    data = request.get_json() or {}
    device_id = data.get('device_id')
    x = data.get('x', 0)
    y = data.get('y', 0)

    if not device_id:
        return jsonify({'success': False, 'message': 'Device ID required'}), 400

    update_device_position(device_id, x, y)

    return jsonify({'success': True})


@api_bp.route('/topology/connection', methods=['PUT'])
@login_required
def update_topology_connection():
    """Set manual connection between devices"""
    from app.topology import set_device_connection

    data = request.get_json() or {}
    device_id = data.get('device_id')
    connected_to_id = data.get('connected_to_id')
    connection_type = data.get('connection_type', 'ethernet')

    if not device_id:
        return jsonify({'success': False, 'message': 'Device ID required'}), 400

    set_device_connection(device_id, connected_to_id, connection_type)

    return jsonify({'success': True})


# ============================================================================
# V3 FEATURES - BANDWIDTH MONITORING
# ============================================================================

@api_bp.route('/bandwidth/device/<int:device_id>', methods=['GET'])
@login_required
def get_device_bandwidth(device_id):
    """Get bandwidth history for a device"""
    from app.bandwidth import get_device_bandwidth as get_bandwidth

    hours = request.args.get('hours', 24, type=int)
    data = get_bandwidth(device_id, hours)

    return jsonify({'success': True, 'bandwidth': data})


@api_bp.route('/bandwidth/top', methods=['GET'])
@login_required
def get_top_bandwidth_users():
    """Get top bandwidth users"""
    from app.bandwidth import get_top_bandwidth_users as get_top_users

    limit = request.args.get('limit', 10, type=int)
    hours = request.args.get('hours', 24, type=int)

    data = get_top_users(limit, hours)

    return jsonify({'success': True, 'top_users': data})


@api_bp.route('/bandwidth/collect', methods=['POST'])
@login_required
def collect_bandwidth():
    """Trigger bandwidth collection (admin)"""
    from app.bandwidth import collect_bandwidth_data

    Thread(target=collect_bandwidth_data).start()

    return jsonify({'success': True, 'message': 'Bandwidth collection started'})


@api_bp.route('/bandwidth/total', methods=['GET'])
@login_required
def get_total_bandwidth():
    """Get network-wide bandwidth stats"""
    from app.models import BandwidthUsage
    from sqlalchemy import func
    from datetime import timedelta

    hours = request.args.get('hours', 24, type=int)
    cutoff = datetime.utcnow() - timedelta(hours=hours)

    stats = db.session.query(
        func.sum(BandwidthUsage.bytes_sent).label('total_sent'),
        func.sum(BandwidthUsage.bytes_received).label('total_received'),
        func.count(func.distinct(BandwidthUsage.device_id)).label('active_devices')
    ).filter(
        BandwidthUsage.timestamp >= cutoff
    ).first()

    return jsonify({
        'success': True,
        'stats': {
            'total_sent': int(stats[0]) if stats[0] else 0,
            'total_received': int(stats[1]) if stats[1] else 0,
            'total_bytes': int(stats[0] or 0) + int(stats[1] or 0),
            'active_devices': stats[2] or 0,
            'hours': hours
        }
    })
