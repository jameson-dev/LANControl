# LANControl V2 - New Features

## Overview
Version 2 adds port scanning and alert system functionality to LANControl.

## New Features

### 1. Port Scanning
Scan devices for open ports to identify services and detect device types.

**Features:**
- Quick scan (top 20 common ports) - ~10 seconds
- Full scan (all common ports) - ~30 seconds
- Service identification (HTTP, SSH, SMB, etc.)
- Automatic device type detection based on port signatures

**Device Types Detected:**
- Router
- NAS (Network Attached Storage)
- Printer
- Web Server
- Database Server
- IoT Device
- Media Server (Plex, Jellyfin)
- SSH Server
- Windows PC
- Raspberry Pi
- IP Camera

**API Endpoints:**
- `POST /api/devices/<id>/ports/scan` - Scan device ports
  - Body: `{"scan_type": "quick"}` or `{"scan_type": "full"}`
- `GET /api/devices/<id>/ports` - Get scanned ports for device

### 2. Alert System
Get notified when devices go offline, new devices appear, or ports change.

**Alert Types:**
- **Status Change** - Device goes online/offline
- **New Device** - Unknown device discovered on network
- **Port Change** - Ports opened or closed on device

**Alert Severities:**
- **Info** - Normal events (device online, new port opened)
- **Warning** - Notable events (device offline, insecure port opened)
- **Critical** - Security concerns (unexpected port changes)

**Notification Methods:**
- Email notifications (SMTP)
- Webhook notifications (Discord, Slack, custom)

**API Endpoints:**
- `GET /api/alerts` - Get all alerts (supports filtering)
  - Query params: `device_id`, `alert_type`, `is_read`, `limit`
- `POST /api/alerts/<id>/read` - Mark alert as read
- `POST /api/alerts/mark-all-read` - Mark all alerts as read
- `DELETE /api/alerts/<id>` - Delete specific alert
- `GET /api/alerts/stats` - Get alert statistics

### 3. Alert Rules
Configure which events trigger notifications and how.

**Rule Configuration:**
- **Event Types**: device_offline, device_online, new_device, port_change
- **Device Filters**: all, favorites, or specific group
- **Notifications**: Email and/or Webhook
- **Enable/Disable**: Toggle rules on/off

**API Endpoints:**
- `GET /api/alert-rules` - Get all alert rules
- `POST /api/alert-rules` - Create new rule
- `PUT /api/alert-rules/<id>` - Update existing rule
- `DELETE /api/alert-rules/<id>` - Delete rule

**Example Alert Rule:**
```json
{
  "name": "Critical Devices Offline",
  "event_type": "device_offline",
  "enabled": true,
  "notify_email": true,
  "notify_webhook": false,
  "webhook_url": null,
  "device_filter": "favorites"
}
```

## Database Schema

### New Tables

**device_ports:**
- id (Primary Key)
- device_id (Foreign Key → devices.id)
- port (Integer)
- protocol (tcp/udp)
- service (HTTP, SSH, etc.)
- state (open/closed/filtered)
- last_scanned (DateTime)

**device_alerts:**
- id (Primary Key)
- device_id (Foreign Key → devices.id)
- alert_type (status_change, new_device, port_change)
- message (Text)
- severity (info, warning, critical)
- is_read (Boolean)
- is_notified (Boolean)
- created_at (DateTime)
- metadata (JSON)

**alert_rules:**
- id (Primary Key)
- name (String)
- event_type (device_offline, device_online, new_device, port_change)
- enabled (Boolean)
- notify_email (Boolean)
- notify_webhook (Boolean)
- webhook_url (String)
- device_filter (all, favorites, or group name)
- created_at (DateTime)

## Email Configuration

To enable email notifications, add these settings via the Settings page:

- **smtp_server** - SMTP server address (e.g., smtp.gmail.com)
- **smtp_port** - SMTP port (usually 587 for TLS)
- **smtp_username** - SMTP username
- **smtp_password** - SMTP password
- **smtp_from** - From email address (optional, defaults to username)
- **alert_email** - Email address to send alerts to

**Gmail Example:**
```
smtp_server: smtp.gmail.com
smtp_port: 587
smtp_username: your-email@gmail.com
smtp_password: your-app-password
alert_email: recipient@example.com
```

## Webhook Integration

Webhooks send JSON payloads to your specified URL when events occur.

**Payload Format:**
```json
{
  "alert_id": 123,
  "alert_type": "status_change",
  "severity": "warning",
  "message": "Device 'Living Room TV' changed from online to offline",
  "timestamp": "2025-01-15T10:30:00",
  "device": {
    "id": 5,
    "name": "Living Room TV",
    "ip": "192.168.0.25",
    "mac": "AA:BB:CC:DD:EE:FF",
    "vendor": "Samsung",
    "status": "offline"
  },
  "metadata": {
    "old_status": "online",
    "new_status": "offline"
  }
}
```

**Discord Webhook Example:**
Create an alert rule with webhook URL from Discord channel settings.

## Installation & Migration

### New Installation
```bash
./install.sh
# Installer automatically creates all tables
```

### Existing Installation (Upgrade from V1)
```bash
# Stop the service
sudo systemctl stop lancontrol

# Activate virtual environment
cd /opt/lancontrol
source venv/bin/activate

# Update code (git pull or copy new files)

# Run database migration
python run.py migrate-db

# Restart service
sudo systemctl start lancontrol
```

## Usage Examples

### Scan Device Ports
```javascript
// Quick scan
fetch('/api/devices/5/ports/scan', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({scan_type: 'quick'})
});

// Full scan
fetch('/api/devices/5/ports/scan', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({scan_type: 'full'})
});
```

### Create Alert Rule
```javascript
fetch('/api/alert-rules', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    name: 'Notify on New Devices',
    event_type: 'new_device',
    enabled: true,
    notify_email: true,
    device_filter: 'all'
  })
});
```

### Get Unread Alerts
```javascript
fetch('/api/alerts?is_read=false&limit=50')
  .then(r => r.json())
  .then(data => console.log(data.alerts));
```

## Common Port Numbers

| Port  | Service      | Description                    |
|-------|--------------|--------------------------------|
| 21    | FTP          | File Transfer Protocol         |
| 22    | SSH          | Secure Shell                   |
| 23    | Telnet       | Insecure remote access         |
| 80    | HTTP         | Web server                     |
| 443   | HTTPS        | Secure web server              |
| 445   | SMB          | Windows file sharing           |
| 548   | AFP          | Apple file sharing             |
| 631   | IPP/CUPS     | Printing                       |
| 3306  | MySQL        | MySQL database                 |
| 3389  | RDP          | Remote Desktop Protocol        |
| 5432  | PostgreSQL   | PostgreSQL database            |
| 5900  | VNC          | Virtual Network Computing      |
| 8080  | HTTP-Alt     | Alternative HTTP port          |
| 27017 | MongoDB      | MongoDB database               |

## Security Considerations

**Port Scanning:**
- Port scanning is performed locally on your network only
- Scans may be detected by intrusion detection systems
- Use responsibly and only on networks you own/manage

**Email Credentials:**
- Passwords stored in plaintext in database (for simplicity)
- Consider using app-specific passwords (Gmail, etc.)
- Access restricted to authenticated users only

**Webhook URLs:**
- Webhook URLs may contain sensitive information
- Validate webhook destinations before adding
- Monitor for failed webhook deliveries

## Performance Notes

- **Quick Scan**: ~10 seconds, scans 20 most common ports
- **Full Scan**: ~30 seconds, scans ~30 common ports
- **Concurrent Scans**: Uses 50 parallel threads for speed
- **Timeout**: 1 second per port (configurable)

## Troubleshooting

**Port Scanning Not Working:**
1. Check device is online (`ping <ip>`)
2. Some devices may have firewalls blocking scans
3. Increase timeout for slow devices

**Email Notifications Not Sending:**
1. Verify SMTP settings in Settings page
2. Check SMTP credentials are correct
3. For Gmail, use App Password (not regular password)
4. Check spam folder

**Alerts Not Triggering:**
1. Verify alert rule is enabled
2. Check device filter matches device
3. Event type must match alert type
4. Review logs: `sudo journalctl -u lancontrol -f`

## Future Enhancements (V3)

Potential features for future versions:
- UI for managing alerts and port scans
- Alert notification settings in web UI
- Graphical network topology map
- More device type signatures
- UDP port scanning
- Service banner grabbing for better identification
- Alert notification history
- Custom alert templates
- Integration with Home Assistant
- Mobile push notifications

## API Reference

See [API_REFERENCE.md](API_REFERENCE.md) for complete API documentation (coming soon).

## Contributing

If you encounter bugs or have feature requests, please open an issue on GitHub.
