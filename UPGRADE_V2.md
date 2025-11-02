# Upgrading to LANControl V2

This guide will help you upgrade an existing LANControl V1 installation to V2 with Port Scanning and Alert features.

## What's New in V2

- **Port Scanning**: Scan devices for open ports and identify services
- **Device Type Detection**: Automatically detect device types based on ports
- **Alert System**: Get notified of device status changes, new devices, and port changes
- **Email Notifications**: Send alerts via email (SMTP)
- **Webhook Support**: Integrate with Discord, Slack, or custom webhooks
- **Alert Rules**: Configure which events trigger notifications

## Upgrade Steps

### 1. Stop the Service

```bash
sudo systemctl stop lancontrol
```

### 2. Backup Your Data

```bash
# Backup database
cp /opt/lancontrol/data/lancontrol.db /opt/lancontrol/data/lancontrol.db.backup

# Backup config (if you have custom .env)
cp /opt/lancontrol/.env /opt/lancontrol/.env.backup
```

### 3. Update Code

If you installed via git:
```bash
cd /opt/lancontrol
git pull
```

If you installed manually:
- Copy all new/updated files to `/opt/lancontrol/`
- Make sure to copy:
  - `app/models.py` (updated with new tables)
  - `app/port_scanner.py` (new file)
  - `app/alerts.py` (new file)
  - `app/api.py` (updated with new endpoints)
  - `app/__init__.py` (updated with alerts route)
  - `run.py` (updated with migrate command)
  - `templates/alerts.html` (new file)
  - `templates/base.html` (updated navigation)
  - `static/js/alerts.js` (new file)
  - `static/js/devices.js` (updated with port scanning)

### 4. Activate Virtual Environment

```bash
cd /opt/lancontrol
source venv/bin/activate
```

### 5. Run Database Migration

```bash
python run.py migrate-db
```

You should see: `Database migration complete - new tables added`

### 6. Restart the Service

```bash
sudo systemctl start lancontrol
```

### 7. Verify the Upgrade

```bash
# Check service status
sudo systemctl status lancontrol

# Check logs
sudo journalctl -u lancontrol -n 50
```

Visit your LANControl web interface. You should now see:
- **Alerts** link in the navigation
- **🔍 Scan Ports** button on each device (purple icon)
- Alerts page at `/alerts`

## New Features Usage

### Port Scanning

1. Go to Dashboard
2. Find a device with an IP address
3. Click the **🔍** (purple magnifying glass) button
4. View open ports and detected device type
5. Optionally run a "Full Scan" for comprehensive results

### Setting Up Alerts

#### Create Alert Rules:

1. Go to **Settings**
2. Scroll to "Alert Rules" section (to be added in next step)
3. Click "Add Alert Rule"
4. Configure:
   - Rule name (e.g., "Critical Devices Offline")
   - Event type (device_offline, device_online, new_device, port_change)
   - Device filter (all, favorites, or specific group)
   - Enable email and/or webhook notifications

#### Configure Email Notifications:

1. Go to **Settings**
2. Find "Email Settings" section
3. Enter your SMTP details:
   - SMTP Server: `smtp.gmail.com` (for Gmail)
   - SMTP Port: `587`
   - SMTP Username: your email
   - SMTP Password: app password (not your regular password!)
   - Alert Email: where to send alerts

**Gmail Setup:**
- Use an [App Password](https://support.google.com/accounts/answer/185833)
- Don't use your regular Gmail password

#### Webhook Notifications (Discord Example):

1. In Discord, go to Server Settings → Integrations → Webhooks
2. Create a webhook and copy the URL
3. In LANControl, create an alert rule with webhook enabled
4. Paste the Discord webhook URL
5. Save the rule

### Viewing Alerts

1. Click **Alerts** in the navigation
2. See all alerts with color coding:
   - Red border = Critical
   - Yellow border = Warning
   - Blue border = Info
3. Filter by type, severity, or unread status
4. Mark alerts as read or delete them

## Troubleshooting

### Migration Failed

If `python run.py migrate-db` fails:

```bash
# Check if database file exists
ls -l /opt/lancontrol/data/lancontrol.db

# Check permissions
ls -la /opt/lancontrol/data/

# Try manual migration via Python
cd /opt/lancontrol
source venv/bin/activate
python -c "from app import create_app; from app.models import db; app = create_app(); app.app_context().push(); db.create_all(); print('Migration complete')"
```

### Port Scanning Not Working

**Symptom**: Port scans always return 0 ports

**Solutions**:
1. Verify device has IP address
2. Check device is online (ping works)
3. Some devices have firewalls that block port scans
4. Try increasing timeout in `app/port_scanner.py` if devices are slow

### Email Notifications Not Sending

**Symptoms**: Alerts created but no emails received

**Check**:
1. SMTP settings are correct in Settings page
2. SMTP password is correct (use app password for Gmail)
3. Check spam folder
4. Check logs: `sudo journalctl -u lancontrol | grep -i email`

**Test Email Settings**:
```python
# In Python console
from app.alerts import send_email_notification
from app.models import Device, DeviceAlert, AlertRule
# ... create test alert and rule ...
# send_email_notification(alert, device, rule)
```

### No Alerts Being Created

**Check**:
1. Make sure you have alert rules created and enabled
2. Verify scheduled scans are running: `sudo journalctl -u lancontrol | grep "scan"`
3. Check device status is changing (online → offline)

## Performance Notes

- **Quick Port Scan**: ~10 seconds (20 common ports)
- **Full Port Scan**: ~30 seconds (30+ ports)
- **Memory Usage**: +20-30MB for port scanning
- **Database Size**: Alerts table will grow over time
  - Configure history retention in settings
  - Manually delete old alerts from Alerts page

## Rollback (If Needed)

If you encounter issues and need to rollback:

```bash
# Stop service
sudo systemctl stop lancontrol

# Restore backup
cd /opt/lancontrol
cp data/lancontrol.db.backup data/lancontrol.db

# Restore old code (if you have it backed up)
# ... or git checkout to previous version ...

# Start service
sudo systemctl start lancontrol
```

## Next Steps

After upgrading, consider:

1. **Create Default Alert Rules**:
   - Device Offline (for favorites)
   - New Device Discovered
   - Critical Port Changes

2. **Configure Email** (if you want email alerts)

3. **Test Port Scanning** on a few devices

4. **Review Alerts** daily and mark as read

## Getting Help

If you encounter issues:

1. Check logs: `sudo journalctl -u lancontrol -f`
2. Verify all files were copied correctly
3. Check database was migrated successfully
4. Open an issue on GitHub with:
   - Error messages from logs
   - Steps to reproduce
   - Your environment (OS, Python version)

## See Also

- [FEATURES_V2.md](FEATURES_V2.md) - Detailed feature documentation
- [CLAUDE.md](CLAUDE.md) - Development notes
- [README.md](README.md) - General usage guide
