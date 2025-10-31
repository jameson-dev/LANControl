# LANControl - Quick Start Guide

Get up and running with LANControl in 5 minutes!

## Prerequisites

- Python 3.8 or higher installed
- Linux server with systemd (for auto-start service)
- sudo access
- Basic knowledge of your network (subnet range)

## Automated Installation (Recommended)

### Step 1: Run Installation Script

```bash
chmod +x install.sh && ./install.sh
```

The script will prompt you for:
- Admin username and password
- Bind host (use `127.0.0.1` for localhost only)
- Bind port (default: 5000)
- Network scan range (e.g., `192.168.1.0/24`)

### Step 2: Install as System Service (Optional)

To have LANControl start automatically on boot:

```bash
chmod +x setup-service.sh && ./setup-service.sh
```

### Step 3: Access the Application

Open your browser and go to: **http://127.0.0.1:5000**

Login with the credentials you created.

## Manual Installation

If you prefer manual installation or are on Windows:

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Initialize Database

```bash
python run.py init-db
```

### 3. Create Your Admin Account

```bash
python run.py create-user admin YourSecurePassword123
```

Replace `YourSecurePassword123` with your desired password.

### 4. Grant Network Permissions (Linux Only)

```bash
sudo setcap cap_net_raw=eip $(readlink -f $(which python))
```

### 5. Start the Application

**Linux/Mac:**
```bash
python run.py
```

**Windows (Run as Administrator):**
```cmd
python run.py
```

### 6. Access the Web Interface

Open your browser and go to: **http://127.0.0.1:5000**

Login with the credentials you created.

## First Time Configuration

### Configure Network Scan Range

1. Click on **Settings** in the top navigation
2. Set your **Scan Range** to match your network (e.g., `192.168.1.0/24`)
3. Adjust **Scan Interval** if desired (default is 300 seconds = 5 minutes)
4. Click **Save Scan Settings**

### Discover Your Devices

1. Go back to **Dashboard**
2. Click the **Scan Network** button
3. Wait for the scan to complete (typically 30-60 seconds for a /24 network)
4. Your devices will appear in the table!

## Common Network Ranges

- `192.168.1.0/24` - Covers 192.168.1.1 to 192.168.1.254
- `192.168.0.0/24` - Covers 192.168.0.1 to 192.168.0.254
- `10.0.0.0/24` - Covers 10.0.0.1 to 10.0.0.254

Not sure which one? Check your computer's IP address:
- **Windows**: `ipconfig`
- **Linux/Mac**: `ifconfig` or `ip addr`

## Quick Tips

### Organize Your Devices

1. Click **Edit** next to any device
2. Add a **Nickname** (e.g., "Living Room TV")
3. Set a **Group** (e.g., "Living Room")
4. Check **Add to favorites** for frequently used devices
5. Click **Save**

### Wake a Device

Simply click the **Wake** button next to any device. Make sure:
- The device supports Wake-on-LAN
- WOL is enabled in the device's BIOS/network settings
- The device is connected via Ethernet (not WiFi)

### Search for a Device

Use the search bar to quickly find devices by:
- IP address
- Hostname
- MAC address
- Nickname
- Vendor name

### Filter Devices

Use the filter dropdowns to view:
- Devices by group
- Online/offline/unknown status
- Favorites only

## Troubleshooting

### "Permission denied" errors on Linux

Grant Python network capabilities:
```bash
sudo setcap cap_net_raw=eip $(readlink -f $(which python))
```

Or run with sudo:
```bash
sudo python run.py
```

### No devices found during scan

- Verify your scan range is correct
- Check that you're connected to the network
- Some devices may have firewalls blocking ARP/ping
- Try adding devices manually using the **Add Device** button

### Can't access from other devices

By default, LANControl only listens on localhost (127.0.0.1). To allow access from other devices on your network:

```bash
export BIND_HOST=0.0.0.0
python run.py
```

Then access via your server's IP address from other devices.

## Next Steps

- **Set up automatic scanning** - Enable auto-scan in Settings
- **Organize your devices** - Add nicknames and groups
- **Monitor uptime** - Check device history to see availability trends
- **Export your inventory** - Use the Export button to save your device list
- **Set up Cloudflare Tunnel** - For secure remote access (see README.md)

## Need Help?

- Check the main [README.md](README.md) for detailed documentation
- Review [CLAUDE.md](CLAUDE.md) for technical details
- Check your network configuration
- Verify device WOL settings (for wake functionality)

## Keyboard Shortcuts

- `Ctrl+F` / `Cmd+F` - Focus search bar (in most browsers)

## Security Reminder

- Use a strong password
- Don't expose the application directly to the internet
- Use Cloudflare Tunnel or VPN for remote access
- Change your password regularly in Settings

---

**Enjoy managing your home network with LANControl!**
