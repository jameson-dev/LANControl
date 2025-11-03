# LANControl - Development Notes

## Project Overview
A Python web application for home LAN device management with network scanning, Wake-on-LAN capabilities, and device monitoring.

## Code Rules
Don't add documentation for everything. Have a documentation that is updates as features are added/removed/changed.

## Tech Stack

### Backend
- **Flask** - Lightweight Python web framework
- **SQLite** - Database for device storage and history
- **Flask-Login** - Session management and authentication
- **Scapy** - Network scanning and packet manipulation
- **APScheduler** - Background task scheduling for periodic scans
- **Werkzeug** - Password hashing and security

### Frontend
- **Tailwind CSS** - Modern, dark theme styling
- **Vanilla JavaScript** - Lightweight, no heavy frameworks
- **Fetch API** - RESTful API communication
- **Chart.js** (optional) - Statistics visualization

## Project Structure
```
LANControl/
├── app/
│   ├── __init__.py          # Flask app initialization
│   ├── models.py            # SQLAlchemy database models
│   ├── auth.py              # Authentication routes and logic
│   ├── api.py               # REST API endpoints
│   ├── scanner.py           # Network scanning functionality
│   ├── wol.py               # Wake-on-LAN packet sending
│   ├── scheduler.py         # Background scheduled tasks
│   └── utils.py             # Helper functions (MAC vendor lookup, etc.)
├── static/
│   ├── css/
│   │   └── styles.css       # Custom styles (if needed beyond Tailwind)
│   ├── js/
│   │   ├── app.js           # Main application logic
│   │   ├── devices.js       # Device management UI
│   │   └── settings.js      # Settings page logic
│   └── icons/               # Device type icons
├── templates/
│   ├── base.html            # Base template with dark theme
│   ├── login.html           # Login page
│   ├── dashboard.html       # Main device management dashboard
│   └── settings.html        # Configuration page
├── data/                    # Created at runtime
│   └── lancontrol.db        # SQLite database
├── config.py                # Application configuration
├── requirements.txt         # Python dependencies
├── run.py                   # Application entry point
├── README.md                # User documentation
└── CLAUDE.md               # This file - development notes
```

## Database Schema

### Users Table
- `id` - Integer, Primary Key
- `username` - String(80), Unique, Not Null
- `password_hash` - String(255), Not Null
- `created_at` - DateTime, Default: now

### Devices Table
- `id` - Integer, Primary Key
- `ip` - String(15), Nullable (for manual entries without IP)
- `hostname` - String(255), Nullable
- `mac` - String(17), Unique, Not Null
- `nickname` - String(100), Nullable
- `group` - String(50), Nullable (e.g., "Living Room", "Office")
- `icon` - String(50), Default: "device" (icon identifier)
- `is_favorite` - Boolean, Default: False
- `is_manual` - Boolean, Default: False (manually added vs scanned)
- `last_seen` - DateTime, Nullable
- `created_at` - DateTime, Default: now
- `updated_at` - DateTime, Default: now, OnUpdate: now

### DeviceHistory Table
- `id` - Integer, Primary Key
- `device_id` - Integer, Foreign Key (devices.id)
- `status` - String(10), "online" or "offline"
- `timestamp` - DateTime, Default: now
- Index on (device_id, timestamp) for efficient queries

### Settings Table
- `id` - Integer, Primary Key
- `key` - String(100), Unique, Not Null
- `value` - Text, Nullable
- Default settings:
  - `scan_range` - "192.168.1.0/24" (default subnet)
  - `scan_interval` - "300" (5 minutes in seconds)
  - `auto_scan` - "true"
  - `history_retention_days` - "30"

## API Endpoints

### Authentication
- `POST /auth/login` - User login
- `GET /auth/logout` - User logout
- `POST /auth/change-password` - Change password

### Devices
- `GET /api/devices` - List all devices (with optional filters)
- `POST /api/devices` - Add manual device
- `GET /api/devices/<id>` - Get device details
- `PUT /api/devices/<id>` - Update device (nickname, group, icon, favorite)
- `DELETE /api/devices/<id>` - Delete device
- `POST /api/devices/<id>/wol` - Send WOL packet
- `POST /api/devices/bulk-wol` - Wake multiple devices
- `GET /api/devices/<id>/history` - Get device uptime history
- `GET /api/devices/export` - Export device list (CSV/JSON)

### Scanning
- `POST /api/scan/now` - Trigger immediate scan
- `GET /api/scan/status` - Get current scan status
- `POST /api/scan/check-device/<id>` - Check single device status

### Settings
- `GET /api/settings` - Get all settings
- `PUT /api/settings` - Update settings
- `GET /api/stats` - Get network statistics (total devices, online count, etc.)

## Key Features Implementation Notes

### Network Scanning
- Use `scapy` ARP scan for IP/MAC discovery
- Use socket/DNS for hostname resolution
- Run scans in background thread to avoid blocking
- Store scan results and update device last_seen timestamps
- Configurable scan range (supports CIDR notation)

### Wake-on-LAN
- Use magic packet (FF:FF:FF:FF:FF:FF followed by MAC x16)
- Send to broadcast address (255.255.255.255:9)
- Support both wired and wireless wake (port 7 and 9)
- Validate MAC address format before sending

### Device Status Detection
- Ping check for online/offline status
- Record status changes in history table
- Calculate uptime percentage from history
- Automatic cleanup of old history records

### MAC Vendor Lookup
- Use OUI (Organizationally Unique Identifier) database
- Local JSON file with common vendors (reduces API calls)
- Fallback to online API if needed (macvendors.com or similar)
- Cache results to minimize lookups

### Scheduled Tasks
- Use APScheduler with BackgroundScheduler
- Periodic network scan (configurable interval)
- Status check for known devices
- History cleanup (remove old records)

### Authentication
- Flask-Login for session management
- Werkzeug for password hashing (pbkdf2:sha256)
- Persistent sessions (remember_me enabled)
- No auto-logout unless user explicitly logs out
- CSRF protection on forms

### UI/UX Features
- Dark theme using Tailwind CSS dark classes
- Responsive design (mobile-friendly)
- Real-time status updates (auto-refresh or WebSocket)
- Toast notifications for actions (WOL sent, device added, etc.)
- Loading states for async operations
- Sortable/filterable device table
- Quick actions (favorite toggle, WOL button)
- Device grouping with collapsible sections
- Search across IP, hostname, MAC, nickname

## Security Considerations

### For Home Use
- Default to localhost only binding (can be configured)
- Strong password requirements
- Session timeout configuration
- HTTPS recommended (via reverse proxy like Cloudflare Tunnel)
- Rate limiting on API endpoints (prevent brute force)

### Linux Permissions
- Scapy requires root/sudo for ARP scanning
- Alternative: Use `setcap` to grant specific capabilities
  ```bash
  sudo setcap cap_net_raw=eip $(which python)
  ```
- Document permission requirements in README

## Deployment Notes

### Prerequisites
- Python 3.8+
- Linux server (for proper network scanning)
- Root/sudo access (for network operations)

### Installation Steps
1. Clone repository
2. Create virtual environment
3. Install requirements: `pip install -r requirements.txt`
4. Initialize database: `python run.py init-db`
5. Create admin user: `python run.py create-user`
6. Run application: `python run.py`

### Configuration
- Default config in `config.py`
- Override via environment variables
- `SECRET_KEY` - Flask secret (auto-generated on first run)
- `DATABASE_PATH` - SQLite database location
- `BIND_HOST` - Default: 127.0.0.1 (localhost only)
- `BIND_PORT` - Default: 5000

### Cloudflare Tunnel (Future)
- No special code needed
- Run cloudflared on server
- Point tunnel to localhost:5000
- Authentication still required

## Development Phases

### Phase 1: Core Infrastructure
- Flask app setup
- Database models and initialization
- Basic authentication system
- Project structure

### Phase 2: Network Operations
- Network scanning (ARP + hostname)
- Wake-on-LAN functionality
- Device status checking
- MAC vendor lookup

### Phase 3: API Development
- Device CRUD endpoints
- Scan trigger endpoints
- Settings management
- Export functionality

### Phase 4: Frontend UI
- Base template with dark theme
- Login page
- Dashboard with device list
- Device management modals
- Search/filter/sort

### Phase 5: Advanced Features
- Background scheduled scanning
- Device history tracking
- Uptime statistics
- Bulk operations
- Device grouping UI

### Phase 6: Polish
- Error handling
- Loading states
- Notifications/toasts
- Settings page
- Documentation

## Testing Checklist
- [ ] Authentication (login, logout, persistent session)
- [ ] Network scan discovers devices
- [ ] WOL packets send successfully
- [ ] Device CRUD operations
- [ ] Manual device entry
- [ ] Favorite/unfavorite devices
- [ ] Device grouping
- [ ] Search/filter functionality
- [ ] Export to CSV/JSON
- [ ] Scheduled scans run correctly
- [ ] History tracking works
- [ ] Settings persistence
- [ ] Dark theme renders correctly
- [ ] Mobile responsive design

## Future Enhancements (v2+)
- Multi-user support with roles
- Port scanning for device type detection
- Shutdown/sleep commands (SSH/WMI)
- Mobile app (PWA or native)
- WebSocket for real-time updates
- Device change notifications
- Network topology visualization
- Integration with Home Assistant
- VLAN support
- IPv6 support
- Custom device type templates
- Backup/restore functionality

## Known Limitations
- ARP scanning only works on local subnet
- Some devices may not respond to ARP (firewalls)
- WOL requires target device to support it and be configured
- Hostname resolution may fail for some devices
- Requires Linux for best scanning results (Windows has limitations)

## Resources
- Flask Documentation: https://flask.palletsprojects.com/
- Scapy Documentation: https://scapy.readthedocs.io/
- Tailwind CSS: https://tailwindcss.com/
- Wake-on-LAN Spec: https://en.wikipedia.org/wiki/Wake-on-LAN
- OUI Database: https://standards-oui.ieee.org/

## Notes
- Keep UI clean and minimal
- Focus on home use case (not enterprise)
- Prioritize ease of use over advanced features
- Dark theme is primary (no light theme needed initially)
- Performance: Target <100 devices efficiently
- Scan time: ~30 seconds for /24 subnet acceptable
