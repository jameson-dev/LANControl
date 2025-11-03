# LANControl

A modern Python web application for comprehensive home LAN device management with network scanning, Wake-on-LAN, bandwidth monitoring, and advanced device documentation.

![Python](https://img.shields.io/badge/python-3.8+-blue.svg)
![Flask](https://img.shields.io/badge/flask-3.0-green.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

## Features

### Core Functionality
- **Network Scanning** - Automatic discovery of devices on your LAN using ARP scanning
- **Wake-on-LAN** - Send magic packets to wake up sleeping devices (single or bulk)
- **Device Management** - Add, edit, delete, and organize your network devices
- **Real-time Status** - Monitor which devices are online/offline
- **Persistent Sessions** - Stay logged in without automatic timeouts

### Device Management
- **Device Nicknames** - Assign friendly names to devices
- **Grouping** - Organize devices by room or category
- **Favorites** - Mark important devices with visual indicators
- **Manual Entry** - Add devices that don't appear in scans
- **MAC Vendor Lookup** - Automatically identify device manufacturers
- **Device Notes** - Add documentation, purchase dates, warranty info
- **Custom Types** - Categorize devices beyond auto-detection

### Advanced Features (V3)
- **Network Topology** - Auto-discover and visualize network connections
- **Bandwidth Monitoring** - Track network usage per device over time
- **Port Scanning** - Discover open ports and running services
- **Device Type Detection** - Automatic identification based on port signatures
- **Bulk Actions** - Perform operations on multiple devices simultaneously

### Monitoring & Alerts
- **Status Tracking** - Real-time online/offline status
- **Device History** - Track when devices were last seen
- **Uptime Statistics** - Monitor device availability over time
- **Alert System** - Notifications for device status changes
- **Email Notifications** - SMTP-based alerts
- **Webhooks** - Discord, Slack, and custom integrations
- **Desktop Notifications** - Browser-based alerts

### User Interface
- **Glassmorphism Theme** - Modern frosted-glass design with dark mode
- **Responsive Design** - Works on desktop, tablet, and mobile
- **Search & Filter** - Quickly find devices by name, IP, MAC, or group
- **Sort Options** - Sort by any column (status, name, IP, etc.)
- **Export Data** - Export device list to CSV or JSON
- **Context Menus** - Right-click for quick actions

### Automation
- **Scheduled Scanning** - Automatic periodic network scans
- **Background Tasks** - Status checks run independently
- **Auto-discovery** - New devices automatically added to inventory
- **Topology Discovery** - Daily automatic network mapping
- **Bandwidth Collection** - Continuous traffic monitoring (every 5 minutes)

## Screenshots

*(Add screenshots here after first run)*

## Requirements

- Python 3.8 or higher
- Linux server (recommended for full scanning capabilities)
- Root/sudo access for network scanning (see setup instructions)

## Installation

### Quick Installation (Recommended)

**Automated setup with one command:**

```bash
chmod +x install.sh && ./install.sh
```

This will automatically:
- Set up virtual environment
- Install all dependencies
- Initialize database
- Create admin user
- Configure network settings
- Grant network permissions

**Then install as a system service (auto-start on boot):**

```bash
chmod +x setup-service.sh && ./setup-service.sh
```

For detailed installation instructions, see **[INSTALL.md](INSTALL.md)**.

### Manual Installation

If you prefer manual installation:

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/LANControl.git
   cd LANControl
   ```

2. **Run installation script** OR **follow manual steps in [INSTALL.md](INSTALL.md)**

## Usage

### If Installed as Service

```bash
# Start
sudo systemctl start lancontrol

# Stop
sudo systemctl stop lancontrol

# Restart
sudo systemctl restart lancontrol

# View logs
sudo journalctl -u lancontrol -f
```

### If Running Manually

```bash
source venv/bin/activate
python run.py
```

The application will start on `http://127.0.0.1:5000` by default.

### Configuration

You can configure the application using environment variables:

- `SECRET_KEY` - Flask secret key for sessions (auto-generated if not set)
- `BIND_HOST` - Host to bind to (default: 127.0.0.1)
- `BIND_PORT` - Port to bind to (default: 5000)

Example:

```bash
export BIND_HOST=0.0.0.0
export BIND_PORT=8080
python run.py
```

### First Time Setup

1. Navigate to `http://127.0.0.1:5000` in your web browser
2. Log in with the credentials you created
3. Go to Settings and configure your network scan range
4. Click "Scan Network" to discover devices

## Features Guide

### Network Scanning

The application scans your network to discover devices:

1. **Manual Scan** - Click "Scan Network" button on dashboard
2. **Automatic Scan** - Configure interval in Settings (default: 5 minutes)
3. **Scan Range** - Set your network CIDR in Settings (e.g., `192.168.1.0/24`)

### Wake-on-LAN

To use WOL, devices must:
- Have WOL enabled in BIOS/UEFI
- Have WOL enabled in network adapter settings
- Be connected via Ethernet (most WiFi devices don't support WOL)

Click the "Wake" button next to any device to send a magic packet.

### Device Organization

**Nicknames**: Give devices friendly names like "Living Room TV" or "Gaming PC"

**Groups**: Organize devices by location or type:
- Living Room
- Bedroom
- Office
- IoT Devices
- etc.

**Favorites**: Star frequently accessed devices for quick access

### Search & Filter

- **Search Bar** - Search by IP, hostname, MAC, nickname, or vendor
- **Group Filter** - Show only devices in a specific group
- **Status Filter** - Show only online, offline, or unknown devices
- **Favorites Toggle** - Show only favorite devices

### Settings

**Scan Range**: Network range to scan (CIDR notation)
- Example: `192.168.1.0/24` scans 192.168.1.1 - 192.168.1.254

**Scan Interval**: How often to automatically scan (60-3600 seconds)
- Recommended: 300 seconds (5 minutes)

**Auto Scan**: Enable/disable automatic scanning

**History Retention**: How long to keep device history (1-365 days)

### Export

Export your device inventory to:
- **JSON** - Structured data with all fields
- **CSV** - Spreadsheet-compatible format

## Cloudflare Tunnel Setup

To access LANControl remotely via Cloudflare Tunnel:

1. Install cloudflared on your server
2. Create a tunnel pointing to `localhost:5000`
3. Configure your domain in Cloudflare
4. Access securely from anywhere

LANControl's authentication will still protect your application.

## Troubleshooting

### Network Scanning Not Working

**Linux**:
- Ensure Python has `CAP_NET_RAW` capability
- Try running with sudo temporarily to test
- Check firewall rules

**Windows**:
- Run as Administrator
- Ensure Windows Firewall allows the application
- Some antivirus software may block network scanning

### Devices Not Discovered

- Verify scan range matches your network
- Some devices have firewalls that block ARP/ping
- Try adding devices manually
- Check if devices are actually on the network

### Wake-on-LAN Not Working

- Verify WOL is enabled in device BIOS
- Check network adapter WOL settings
- Ensure device is connected via Ethernet
- Some switches/routers block WOL packets
- Try waking from another device on the same network

### Permission Denied Errors

- On Linux, ensure proper capabilities are set
- Check file permissions in the `data/` directory
- Ensure write access to database file

## Development

### Project Structure

```
LANControl/
├── app/
│   ├── __init__.py       # Flask app initialization
│   ├── models.py         # Database models
│   ├── auth.py           # Authentication routes
│   ├── api.py            # REST API endpoints
│   ├── scanner.py        # Network scanning
│   ├── wol.py            # Wake-on-LAN
│   ├── scheduler.py      # Background tasks
│   └── utils.py          # Helper functions
├── static/
│   └── js/
│       ├── devices.js    # Dashboard JavaScript
│       └── settings.js   # Settings JavaScript
├── templates/            # HTML templates
├── data/                 # Database and cache
├── config.py             # Configuration
├── run.py                # Application entry point
└── requirements.txt      # Python dependencies
```

### Running in Development Mode

The application runs in debug mode by default when using `python run.py`.

### Database Schema

See [CLAUDE.md](CLAUDE.md) for detailed database schema documentation.

## Security Considerations

### For Home Use

- Default binding to localhost only (127.0.0.1)
- Use strong passwords
- Change default secret key in production
- Consider HTTPS via reverse proxy
- Regular password changes recommended

### Network Access

To allow access from other devices on your network:

```bash
export BIND_HOST=0.0.0.0
python run.py
```

**Warning**: This makes the application accessible to anyone on your network.

### Cloudflare Tunnel (Recommended)

For external access, use Cloudflare Tunnel instead of port forwarding:
- Automatic HTTPS
- No open ports
- DDoS protection
- Zero Trust security

## API Documentation

### Authentication

All API endpoints require authentication via session cookies.

### Endpoints

**Devices**
- `GET /api/devices` - List all devices
- `POST /api/devices` - Add device
- `GET /api/devices/<id>` - Get device details
- `PUT /api/devices/<id>` - Update device
- `DELETE /api/devices/<id>` - Delete device

**Wake-on-LAN**
- `POST /api/devices/<id>/wol` - Wake device
- `POST /api/devices/bulk-wol` - Wake multiple devices

**Scanning**
- `POST /api/scan/now` - Trigger scan
- `GET /api/scan/status` - Get scan status
- `POST /api/scan/check-device/<id>` - Check device status

**Statistics**
- `GET /api/stats` - Get network statistics

**Settings**
- `GET /api/settings` - Get settings
- `PUT /api/settings` - Update settings

**Export**
- `GET /api/devices/export?format=json|csv` - Export devices

See [CLAUDE.md](CLAUDE.md) for complete API documentation.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Flask - Web framework
- Scapy - Network scanning
- Tailwind CSS - UI styling
- APScheduler - Background tasks

## Support

For issues, questions, or suggestions:
- Open an issue on GitHub
- Check existing issues for solutions
- Consult [CLAUDE.md](CLAUDE.md) for technical details

## Future Enhancements

See [CLAUDE.md](CLAUDE.md) for planned v2 features including:
- Multi-user support
- Port scanning
- Shutdown/sleep commands
- Mobile app (PWA)
- WebSocket real-time updates
- Home Assistant integration

## Changelog

### Version 1.0.0 (Current)
- Initial release
- Network scanning
- Wake-on-LAN
- Device management
- Dark theme UI
- Scheduled tasks
- Device history
- Export functionality
