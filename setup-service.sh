#!/bin/bash
# LANControl Systemd Service Setup Script

set -e  # Exit on error

echo "=========================================="
echo "  LANControl Service Setup"
echo "=========================================="
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo "Please do not run this script as root."
    echo "The script will ask for sudo password when needed."
    exit 1
fi

# Get current directory and user
INSTALL_DIR="$(pwd)"
CURRENT_USER="$(whoami)"

# Load environment variables if .env exists
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

BIND_HOST=${BIND_HOST:-127.0.0.1}
BIND_PORT=${BIND_PORT:-5000}

echo "Service Configuration:"
echo "  Installation Directory: $INSTALL_DIR"
echo "  User: $CURRENT_USER"
echo "  Bind Host: $BIND_HOST"
echo "  Bind Port: $BIND_PORT"
echo ""

read -p "Continue with service installation? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Service installation cancelled."
    exit 0
fi

# Create systemd service file
echo "Creating systemd service file..."

sudo tee /etc/systemd/system/lancontrol.service > /dev/null << EOF
[Unit]
Description=LANControl - Network Device Management
After=network.target

[Service]
Type=simple
User=$CURRENT_USER
WorkingDirectory=$INSTALL_DIR
Environment="PATH=$INSTALL_DIR/venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
Environment="PYTHONUNBUFFERED=1"
ExecStart=$INSTALL_DIR/venv/bin/python -u $INSTALL_DIR/run.py
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

# Network capabilities for ping/scanning
AmbientCapabilities=CAP_NET_RAW
CapabilityBoundingSet=CAP_NET_RAW

# Security settings
NoNewPrivileges=false
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd
echo "Reloading systemd daemon..."
sudo systemctl daemon-reload

# Enable service
echo "Enabling LANControl service..."
sudo systemctl enable lancontrol.service

# Start service
echo "Starting LANControl service..."
sudo systemctl start lancontrol.service

# Wait a moment for service to start
sleep 2

# Check status
echo ""
echo "=========================================="
echo "  Service Status"
echo "=========================================="
sudo systemctl status lancontrol.service --no-pager

echo ""
echo "=========================================="
echo "  Service Installation Complete!"
echo "=========================================="
echo ""
echo "Service Management Commands:"
echo "  Start:   sudo systemctl start lancontrol"
echo "  Stop:    sudo systemctl stop lancontrol"
echo "  Restart: sudo systemctl restart lancontrol"
echo "  Status:  sudo systemctl status lancontrol"
echo "  Logs:    sudo journalctl -u lancontrol -f"
echo ""
echo "The service is now running and will start automatically on boot."
echo ""
echo "Access the application at:"
echo "  http://$BIND_HOST:$BIND_PORT"
echo ""
