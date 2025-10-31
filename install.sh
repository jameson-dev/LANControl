#!/bin/bash
# LANControl Installation Script
# This script automates the installation and setup of LANControl

set -e  # Exit on error

echo "=========================================="
echo "  LANControl Installation Script"
echo "=========================================="
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo "Please do not run this script as root."
    echo "The script will ask for sudo password when needed."
    exit 1
fi

# Check Python version
echo "Checking Python version..."
PYTHON_CMD=""
if command -v python3 &> /dev/null; then
    # Get version as major.minor (e.g., 3.11)
    PYTHON_VERSION=$(python3 -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')

    # Extract major and minor version numbers
    PYTHON_MAJOR=$(echo $PYTHON_VERSION | cut -d. -f1)
    PYTHON_MINOR=$(echo $PYTHON_VERSION | cut -d. -f2)

    # Check if Python >= 3.8
    if [ "$PYTHON_MAJOR" -ge 3 ] && [ "$PYTHON_MINOR" -ge 8 ]; then
        PYTHON_CMD="python3"
    elif [ "$PYTHON_MAJOR" -gt 3 ]; then
        PYTHON_CMD="python3"
    fi
fi

if [ -z "$PYTHON_CMD" ]; then
    echo "Error: Python 3.8 or higher is required but not found."
    echo "Please install Python 3.8+ and try again."
    exit 1
fi

echo "Found Python $PYTHON_VERSION"
echo ""

# Get installation directory (current directory)
INSTALL_DIR="$(pwd)"
echo "Installation directory: $INSTALL_DIR"
echo ""

# Prompt for username and password
read -p "Enter admin username [admin]: " ADMIN_USER
ADMIN_USER=${ADMIN_USER:-admin}

while true; do
    read -s -p "Enter admin password: " ADMIN_PASS
    echo ""
    read -s -p "Confirm admin password: " ADMIN_PASS_CONFIRM
    echo ""

    if [ "$ADMIN_PASS" = "$ADMIN_PASS_CONFIRM" ]; then
        if [ ${#ADMIN_PASS} -lt 6 ]; then
            echo "Password must be at least 6 characters. Please try again."
            echo ""
        else
            break
        fi
    else
        echo "Passwords do not match. Please try again."
        echo ""
    fi
done

# Prompt for network settings
read -p "Enter bind host [127.0.0.1]: " BIND_HOST
BIND_HOST=${BIND_HOST:-127.0.0.1}

read -p "Enter bind port [5000]: " BIND_PORT
BIND_PORT=${BIND_PORT:-5000}

read -p "Enter network scan range [192.168.1.0/24]: " SCAN_RANGE
SCAN_RANGE=${SCAN_RANGE:-192.168.1.0/24}

echo ""
echo "=========================================="
echo "Configuration Summary:"
echo "=========================================="
echo "Installation Directory: $INSTALL_DIR"
echo "Admin Username: $ADMIN_USER"
echo "Bind Host: $BIND_HOST"
echo "Bind Port: $BIND_PORT"
echo "Scan Range: $SCAN_RANGE"
echo "=========================================="
echo ""
read -p "Continue with installation? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Installation cancelled."
    exit 0
fi

echo ""
echo "Installing LANControl..."
echo ""

# Create virtual environment
echo "Creating virtual environment..."
$PYTHON_CMD -m venv venv

# Activate virtual environment
source venv/bin/activate

# Upgrade pip
echo "Upgrading pip..."
pip install --upgrade pip

# Install dependencies
echo "Installing dependencies..."
pip install -r requirements.txt

# Create data directory
echo "Creating data directory..."
mkdir -p data

# Initialize database
echo "Initializing database..."
python run.py init-db

# Create admin user
echo "Creating admin user..."
python run.py create-user "$ADMIN_USER" "$ADMIN_PASS"

# Create .env file for configuration
echo "Creating configuration file..."
cat > .env << EOF
SECRET_KEY=$(python3 -c 'import secrets; print(secrets.token_hex(32))')
BIND_HOST=$BIND_HOST
BIND_PORT=$BIND_PORT
DEFAULT_SCAN_RANGE=$SCAN_RANGE
EOF

# Set permissions on data directory
chmod 755 data

# Grant Python network capabilities
echo ""
echo "Setting network capabilities for Python..."
PYTHON_BIN="$(readlink -f venv/bin/python)"
sudo setcap cap_net_raw=eip "$PYTHON_BIN"

if [ $? -eq 0 ]; then
    echo "Network capabilities granted successfully."
else
    echo "Warning: Failed to set network capabilities."
    echo "You may need to run the application with sudo for scanning to work."
fi

echo ""
echo "=========================================="
echo "  Installation Complete!"
echo "=========================================="
echo ""
echo "To start LANControl manually:"
echo "  cd $INSTALL_DIR"
echo "  source venv/bin/activate"
echo "  python run.py"
echo ""
echo "To install as a systemd service (auto-start on boot):"
echo "  ./setup-service.sh"
echo ""
echo "Access the application at:"
echo "  http://$BIND_HOST:$BIND_PORT"
echo ""
