# LANControl Installation Guide

This guide covers automated installation and setup of LANControl as a systemd service.

## Quick Installation (Automated)

### Prerequisites

- Linux server with systemd
- Python 3.8 or higher
- sudo access
- Internet connection (for installing dependencies)

### One-Command Installation

```bash
chmod +x install.sh && ./install.sh
```

This script will:
1. Check Python version (requires 3.8+)
2. Create a virtual environment
3. Install all dependencies
4. Initialize the database
5. Create your admin user
6. Generate secure secret keys
7. Grant network capabilities to Python
8. Create configuration file (.env)

### Installation Prompts

The script will ask you for:

1. **Admin Username** (default: `admin`)
2. **Admin Password** (minimum 6 characters)
3. **Bind Host** (default: `127.0.0.1`)
   - Use `127.0.0.1` for localhost-only access
   - Use `0.0.0.0` to allow access from other devices on your network
4. **Bind Port** (default: `5000`)
5. **Network Scan Range** (default: `192.168.1.0/24`)
   - Set this to match your home network

## Setup as Systemd Service (Auto-Start)

After installation, set up LANControl to start automatically on boot:

```bash
chmod +x setup-service.sh && ./setup-service.sh
```

This will:
1. Create a systemd service file
2. Enable the service to start on boot
3. Start the service immediately
4. Display the service status

### Service Management

Once installed as a service, you can manage it with these commands:

```bash
# Start the service
sudo systemctl start lancontrol

# Stop the service
sudo systemctl stop lancontrol

# Restart the service
sudo systemctl restart lancontrol

# Check service status
sudo systemctl status lancontrol

# View logs (live tail)
sudo journalctl -u lancontrol -f

# View recent logs
sudo journalctl -u lancontrol -n 100

# Disable auto-start
sudo systemctl disable lancontrol

# Re-enable auto-start
sudo systemctl enable lancontrol
```

## Manual Installation

If you prefer to install manually:

### 1. Create Virtual Environment

```bash
python3 -m venv venv
source venv/bin/activate
```

### 2. Install Dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### 3. Initialize Database

```bash
python run.py init-db
```

### 4. Create Admin User

```bash
python run.py create-user admin yourpassword
```

### 5. Create Configuration File (Optional)

Create a `.env` file in the project root:

```bash
cat > .env << EOF
SECRET_KEY=$(python3 -c 'import secrets; print(secrets.token_hex(32))')
BIND_HOST=127.0.0.1
BIND_PORT=5000
DEFAULT_SCAN_RANGE=192.168.1.0/24
EOF
```

### 6. Grant Network Capabilities (Linux)

```bash
sudo setcap cap_net_raw=eip $(readlink -f venv/bin/python)
```

Or run with sudo:

```bash
sudo venv/bin/python run.py
```

### 7. Run the Application

```bash
python run.py
```

## Configuration

### Environment Variables

Create a `.env` file or set environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `SECRET_KEY` | Flask session secret key | Auto-generated |
| `BIND_HOST` | Host address to bind to | `127.0.0.1` |
| `BIND_PORT` | Port to listen on | `5000` |
| `DEFAULT_SCAN_RANGE` | Default network scan range | `192.168.1.0/24` |

### Configuration File Location

The `.env` file should be placed in the project root directory (same location as `run.py`).

## Network Configuration

### Common Scan Ranges

- `192.168.1.0/24` - 192.168.1.1 to 192.168.1.254
- `192.168.0.0/24` - 192.168.0.1 to 192.168.0.254
- `10.0.0.0/24` - 10.0.0.1 to 10.0.0.254
- `10.0.1.0/24` - 10.0.1.1 to 10.0.1.254

### Find Your Network Range

Check your computer's IP address:

```bash
# Linux/Mac
ip addr show
# or
ifconfig

# Windows
ipconfig
```

If your IP is `192.168.1.50`, your scan range is likely `192.168.1.0/24`.

### Firewall Configuration

If running on a server with a firewall, allow the port:

```bash
# UFW (Ubuntu)
sudo ufw allow 5000/tcp

# Firewalld (CentOS/RHEL)
sudo firewall-cmd --permanent --add-port=5000/tcp
sudo firewall-cmd --reload

# iptables
sudo iptables -A INPUT -p tcp --dport 5000 -j ACCEPT
```

## Troubleshooting

### Permission Errors

**Issue:** "Operation not permitted" when scanning

**Solution:**
```bash
sudo setcap cap_net_raw=eip $(readlink -f venv/bin/python)
```

Or run with sudo (less secure):
```bash
sudo venv/bin/python run.py
```

### Service Won't Start

**Check logs:**
```bash
sudo journalctl -u lancontrol -n 50
```

**Common issues:**
- Python path incorrect in service file
- Permissions on data directory
- Port already in use
- Missing dependencies

**Fix permissions:**
```bash
chmod 755 data/
chmod 644 data/lancontrol.db
```

### Port Already in Use

**Change the port:**

Edit `.env` file:
```bash
BIND_PORT=8080
```

Then restart:
```bash
sudo systemctl restart lancontrol
```

### Can't Access from Other Devices

**Issue:** Application only accessible from localhost

**Solution:** Change bind host to `0.0.0.0`

Edit `.env`:
```bash
BIND_HOST=0.0.0.0
```

Then restart:
```bash
sudo systemctl restart lancontrol
```

**Security Note:** This makes the application accessible to anyone on your network. Use strong passwords!

### Database Errors

**Reset database:**
```bash
sudo systemctl stop lancontrol
rm data/lancontrol.db
source venv/bin/activate
python run.py init-db
python run.py create-user admin newpassword
sudo systemctl start lancontrol
```

### Python Version Too Old

**Issue:** Python 3.7 or earlier detected

**Solution:** Install Python 3.8+

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install python3.8 python3.8-venv

# CentOS/RHEL
sudo yum install python38

# Then reinstall:
python3.8 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Uninstallation

### Remove Service

```bash
sudo systemctl stop lancontrol
sudo systemctl disable lancontrol
sudo rm /etc/systemd/system/lancontrol.service
sudo systemctl daemon-reload
```

### Remove Application

```bash
cd /path/to/LANControl
deactivate  # if virtual environment is active
cd ..
rm -rf LANControl
```

## Updating

To update LANControl:

```bash
# Stop the service
sudo systemctl stop lancontrol

# Pull latest changes (if using git)
git pull

# Update dependencies
source venv/bin/activate
pip install --upgrade -r requirements.txt

# Restart service
sudo systemctl start lancontrol
```

## Security Best Practices

1. **Use Strong Passwords** - Minimum 12 characters with mixed case, numbers, and symbols
2. **Bind to Localhost** - Use `127.0.0.1` unless you need network access
3. **Use Cloudflare Tunnel** - For external access instead of port forwarding
4. **Regular Updates** - Keep Python and dependencies updated
5. **Change Default Port** - Use a non-standard port if exposing to network
6. **Enable HTTPS** - Use a reverse proxy (nginx, Caddy) with SSL certificates
7. **Monitor Logs** - Regularly check `journalctl -u lancontrol` for suspicious activity

## Advanced Configuration

### Running Behind Reverse Proxy

Example nginx configuration:

```nginx
server {
    listen 80;
    server_name lancontrol.example.com;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Custom Service User

To run as a dedicated user:

```bash
# Create user
sudo useradd -r -s /bin/false lancontrol

# Change ownership
sudo chown -R lancontrol:lancontrol /path/to/LANControl

# Update service file User= line
sudo nano /etc/systemd/system/lancontrol.service
# Change: User=lancontrol

# Reload and restart
sudo systemctl daemon-reload
sudo systemctl restart lancontrol
```

## Support

For issues or questions:
- Check [README.md](README.md) for feature documentation
- Review [QUICKSTART.md](QUICKSTART.md) for basic usage
- Check logs: `sudo journalctl -u lancontrol -f`
- Verify configuration in `.env` file
- Test network connectivity and permissions

## Next Steps

After installation:
1. Access the web interface: `http://your-server-ip:5000`
2. Log in with your admin credentials
3. Go to Settings and verify scan range
4. Click "Scan Network" to discover devices
5. Organize devices with nicknames and groups

Enjoy managing your home network! 🚀
