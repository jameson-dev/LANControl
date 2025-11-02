"""
Alert system for device status changes and notifications.
"""
import json
import smtplib
import requests
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from app.models import db, Device, DeviceAlert, AlertRule, Setting


def create_alert(device_id, alert_type, message, severity='info', metadata=None):
    """
    Create a new alert for a device.

    Args:
        device_id: Device ID
        alert_type: Type of alert (status_change, new_device, port_change)
        message: Alert message
        severity: Severity level (info, warning, critical)
        metadata: Optional JSON-serializable metadata

    Returns:
        DeviceAlert: Created alert object
    """
    alert = DeviceAlert(
        device_id=device_id,
        alert_type=alert_type,
        message=message,
        severity=severity,
        metadata=json.dumps(metadata) if metadata else None
    )
    db.session.add(alert)
    db.session.commit()

    # Process alert rules
    process_alert_rules(alert)

    return alert


def process_alert_rules(alert):
    """
    Process alert against configured rules and send notifications.

    Args:
        alert: DeviceAlert object
    """
    device = Device.query.get(alert.device_id)
    if not device:
        return

    # Get matching alert rules
    rules = AlertRule.query.filter_by(enabled=True).all()

    for rule in rules:
        # Check if rule applies to this alert type
        if not matches_alert_type(rule.event_type, alert.alert_type):
            continue

        # Check device filter
        if not matches_device_filter(rule.device_filter, device):
            continue

        # Send notifications
        if rule.notify_email:
            send_email_notification(alert, device, rule)

        if rule.notify_webhook and rule.webhook_url:
            send_webhook_notification(alert, device, rule)

    # Mark as notified
    alert.is_notified = True
    db.session.commit()


def matches_alert_type(rule_event_type, alert_type):
    """
    Check if alert type matches rule event type.

    Args:
        rule_event_type: Event type from alert rule
        alert_type: Alert type from alert

    Returns:
        bool: True if matches
    """
    mapping = {
        'device_offline': 'status_change',
        'device_online': 'status_change',
        'new_device': 'new_device',
        'port_change': 'port_change'
    }

    return mapping.get(rule_event_type) == alert_type


def matches_device_filter(device_filter, device):
    """
    Check if device matches the filter criteria.

    Args:
        device_filter: Filter from alert rule ('all', 'favorites', group name)
        device: Device object

    Returns:
        bool: True if matches
    """
    if not device_filter or device_filter == 'all':
        return True

    if device_filter == 'favorites':
        return device.is_favorite

    # Check if it's a group name
    return device.group == device_filter


def send_email_notification(alert, device, rule):
    """
    Send email notification for an alert.

    Args:
        alert: DeviceAlert object
        device: Device object
        rule: AlertRule object
    """
    try:
        # Get email settings
        smtp_server = Setting.get('smtp_server')
        smtp_port = int(Setting.get('smtp_port', '587'))
        smtp_username = Setting.get('smtp_username')
        smtp_password = Setting.get('smtp_password')
        smtp_from = Setting.get('smtp_from', smtp_username)
        alert_email = Setting.get('alert_email')

        if not all([smtp_server, smtp_username, smtp_password, alert_email]):
            print("Email settings not configured, skipping email notification")
            return

        # Create message
        msg = MIMEMultipart('alternative')
        msg['Subject'] = f"LANControl Alert: {alert.alert_type.replace('_', ' ').title()}"
        msg['From'] = smtp_from
        msg['To'] = alert_email

        # Create message body
        device_name = device.nickname or device.hostname or device.mac
        text_body = f"""
LANControl Alert

Device: {device_name}
IP: {device.ip or 'N/A'}
MAC: {device.mac}
Alert Type: {alert.alert_type.replace('_', ' ').title()}
Severity: {alert.severity.upper()}
Time: {alert.created_at.strftime('%Y-%m-%d %H:%M:%S')}

Message: {alert.message}

---
This is an automated alert from LANControl
        """.strip()

        html_body = f"""
<html>
<body style="font-family: Arial, sans-serif; color: #333;">
    <h2 style="color: #1e40af;">LANControl Alert</h2>

    <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
        <tr>
            <td style="padding: 8px; font-weight: bold;">Device:</td>
            <td style="padding: 8px;">{device_name}</td>
        </tr>
        <tr>
            <td style="padding: 8px; font-weight: bold;">IP:</td>
            <td style="padding: 8px;">{device.ip or 'N/A'}</td>
        </tr>
        <tr>
            <td style="padding: 8px; font-weight: bold;">MAC:</td>
            <td style="padding: 8px;">{device.mac}</td>
        </tr>
        <tr>
            <td style="padding: 8px; font-weight: bold;">Alert Type:</td>
            <td style="padding: 8px;">{alert.alert_type.replace('_', ' ').title()}</td>
        </tr>
        <tr>
            <td style="padding: 8px; font-weight: bold;">Severity:</td>
            <td style="padding: 8px;"><span style="color: {'#dc2626' if alert.severity == 'critical' else '#f59e0b' if alert.severity == 'warning' else '#3b82f6'};">{alert.severity.upper()}</span></td>
        </tr>
        <tr>
            <td style="padding: 8px; font-weight: bold;">Time:</td>
            <td style="padding: 8px;">{alert.created_at.strftime('%Y-%m-%d %H:%M:%S')}</td>
        </tr>
    </table>

    <p style="margin-top: 20px;"><strong>Message:</strong> {alert.message}</p>

    <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
    <p style="color: #666; font-size: 12px;">This is an automated alert from LANControl</p>
</body>
</html>
        """.strip()

        part1 = MIMEText(text_body, 'plain')
        part2 = MIMEText(html_body, 'html')
        msg.attach(part1)
        msg.attach(part2)

        # Send email
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(smtp_username, smtp_password)
            server.send_message(msg)

        print(f"Email notification sent for alert {alert.id}")

    except Exception as e:
        print(f"Error sending email notification: {e}")


def send_webhook_notification(alert, device, rule):
    """
    Send webhook notification for an alert.

    Args:
        alert: DeviceAlert object
        device: Device object
        rule: AlertRule object
    """
    try:
        payload = {
            'alert_id': alert.id,
            'alert_type': alert.alert_type,
            'severity': alert.severity,
            'message': alert.message,
            'timestamp': alert.created_at.isoformat(),
            'device': {
                'id': device.id,
                'name': device.nickname or device.hostname or device.mac,
                'ip': device.ip,
                'mac': device.mac,
                'vendor': device.vendor,
                'status': device.status
            }
        }

        if alert.metadata:
            payload['metadata'] = json.loads(alert.metadata)

        response = requests.post(
            rule.webhook_url,
            json=payload,
            headers={'Content-Type': 'application/json'},
            timeout=10
        )

        if response.status_code < 300:
            print(f"Webhook notification sent for alert {alert.id}")
        else:
            print(f"Webhook failed with status {response.status_code}: {response.text}")

    except Exception as e:
        print(f"Error sending webhook notification: {e}")


def check_device_status_change(device, new_status):
    """
    Check if device status changed and create alert if needed.

    Args:
        device: Device object
        new_status: New status ('online' or 'offline')

    Returns:
        bool: True if alert was created
    """
    old_status = device.status

    if old_status == new_status:
        return False

    # Status changed - create alert
    device_name = device.nickname or device.hostname or device.mac
    severity = 'warning' if new_status == 'offline' else 'info'

    message = f"Device '{device_name}' changed from {old_status} to {new_status}"

    create_alert(
        device_id=device.id,
        alert_type='status_change',
        message=message,
        severity=severity,
        metadata={'old_status': old_status, 'new_status': new_status}
    )

    return True


def check_new_device(device):
    """
    Create alert for newly discovered device.

    Args:
        device: Device object
    """
    if device.is_manual:
        # Don't alert for manually added devices
        return

    device_name = device.nickname or device.hostname or device.mac

    message = f"New device discovered: '{device_name}' ({device.ip})"

    create_alert(
        device_id=device.id,
        alert_type='new_device',
        message=message,
        severity='info',
        metadata={'vendor': device.vendor}
    )


def check_port_changes(device, new_ports, old_ports):
    """
    Check for port changes and create alerts.

    Args:
        device: Device object
        new_ports: List of current open ports
        old_ports: List of previously open ports
    """
    new_port_numbers = {p['port'] for p in new_ports}
    old_port_numbers = {p['port'] for p in old_ports}

    newly_opened = new_port_numbers - old_port_numbers
    newly_closed = old_port_numbers - new_port_numbers

    if not newly_opened and not newly_closed:
        return

    device_name = device.nickname or device.hostname or device.mac

    if newly_opened:
        ports_str = ', '.join(str(p) for p in sorted(newly_opened))
        message = f"New ports opened on '{device_name}': {ports_str}"
        severity = 'warning' if any(p in [23, 21, 3389] for p in newly_opened) else 'info'

        create_alert(
            device_id=device.id,
            alert_type='port_change',
            message=message,
            severity=severity,
            metadata={'opened_ports': list(newly_opened)}
        )

    if newly_closed:
        ports_str = ', '.join(str(p) for p in sorted(newly_closed))
        message = f"Ports closed on '{device_name}': {ports_str}"

        create_alert(
            device_id=device.id,
            alert_type='port_change',
            message=message,
            severity='info',
            metadata={'closed_ports': list(newly_closed)}
        )
