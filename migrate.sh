#!/bin/bash
#
# LANControl Migration Script
# Safely migrates database to V2 schema
#

set -e  # Exit on any error

echo "=========================================="
echo "  LANControl V2 Database Migration"
echo "=========================================="
echo ""

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo "⚠️  WARNING: Running as root"
    echo "This script will work, but the service should run as a regular user."
    echo ""
fi

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "❌ Error: Virtual environment not found!"
    echo "Please run install.sh first."
    exit 1
fi

# Check if database exists
if [ ! -f "data/lancontrol.db" ]; then
    echo "❌ Error: Database not found at data/lancontrol.db"
    echo "This appears to be a fresh installation."
    echo "Please run the application first to initialize the database."
    exit 1
fi

echo "✓ Virtual environment found"
echo "✓ Database found"
echo ""

# Backup database
BACKUP_DIR="data/backups"
BACKUP_FILE="$BACKUP_DIR/lancontrol_$(date +%Y%m%d_%H%M%S).db"

echo "Creating backup..."
mkdir -p "$BACKUP_DIR"
cp data/lancontrol.db "$BACKUP_FILE"

if [ -f "$BACKUP_FILE" ]; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo "✓ Backup created: $BACKUP_FILE ($BACKUP_SIZE)"
else
    echo "❌ Failed to create backup!"
    exit 1
fi
echo ""

# Stop service if it's running
SERVICE_RUNNING=false
if systemctl is-active --quiet lancontrol 2>/dev/null; then
    echo "Stopping lancontrol service..."
    sudo systemctl stop lancontrol
    SERVICE_RUNNING=true
    echo "✓ Service stopped"
    echo ""
fi

# Run migration
echo "Running database migration..."
echo "----------------------------------------"

# Check if V3 migration exists
if [ -f "migrate_v3.py" ]; then
    echo "V3 migration script found, running V3 migration..."
    if source venv/bin/activate; then
        python migrate_v3.py
        MIGRATION_STATUS=$?
        deactivate
    else
        echo "❌ Failed to activate virtual environment!"
        exit 1
    fi
else
    echo "Running standard migration..."
    # Activate venv and run migration
    if source venv/bin/activate; then
        python run.py migrate-db
        MIGRATION_STATUS=$?
        deactivate
    else
        echo "❌ Failed to activate virtual environment!"
        exit 1
    fi
fi

echo "----------------------------------------"
echo ""

# Check migration result
if [ $MIGRATION_STATUS -eq 0 ]; then
    echo "✓ Migration completed successfully!"
    echo ""

    # Show new tables
    echo "Database tables available:"
    echo "  - device_ports (for port scan results)"
    echo "  - device_alerts (for alert history)"
    echo "  - alert_rules (for notification rules)"
    echo "  - network_topology (for network map) [V3]"
    echo "  - bandwidth_usage (for bandwidth monitoring) [V3]"
    echo ""

    # Restart service if it was running
    if [ "$SERVICE_RUNNING" = true ]; then
        echo "Restarting lancontrol service..."
        sudo systemctl start lancontrol
        sleep 2

        if systemctl is-active --quiet lancontrol; then
            echo "✓ Service restarted successfully"
            echo ""
            echo "Checking service status..."
            sudo systemctl status lancontrol --no-pager -l
        else
            echo "❌ Service failed to start!"
            echo ""
            echo "Check logs with: sudo journalctl -u lancontrol -n 50"
            exit 1
        fi
    fi

    echo ""
    echo "=========================================="
    echo "  Migration Complete!"
    echo "=========================================="
    echo ""
    echo "Next steps:"
    echo "1. Visit your LANControl web interface"
    echo "2. Device notes now available in device edit modal"
    echo "3. Check bandwidth monitoring (requires conntrack package)"
    echo "4. Network topology will be discovered automatically"
    echo "5. Use bulk actions with multi-select (coming in UI update)"
    echo ""
    echo "Backup location: $BACKUP_FILE"
    echo ""
    echo "Features Available:"
    echo "  🔍 Port Scanning - Scan device ports"
    echo "  🔔 Alerts System - Device notifications"
    echo "  📧 Email Notifications - Configure in Settings"
    echo "  🔗 Webhooks - Discord, Slack integrations"
    echo "  💻 Desktop Notifications - Browser alerts"
    echo ""
    echo "V3 Features (Backend Ready):"
    echo "  📝 Device Notes - Document your devices"
    echo "  🗂️  Enhanced Grouping - Bulk actions API ready"
    echo "  🗺️  Network Topology - Auto-discovery enabled"
    echo "  📊 Bandwidth Monitoring - Collecting every 5 minutes"
    echo ""
    echo "Note: V3 frontend UI coming soon!"
    echo ""

else
    echo "❌ Migration failed!"
    echo ""
    echo "Restoring from backup..."
    cp "$BACKUP_FILE" data/lancontrol.db
    echo "✓ Database restored from backup"
    echo ""

    if [ "$SERVICE_RUNNING" = true ]; then
        echo "Restarting service..."
        sudo systemctl start lancontrol
    fi

    echo ""
    echo "Please check the error messages above and try again."
    echo "If the problem persists, check:"
    echo "  - Python version: python --version"
    echo "  - Virtual environment: ls -la venv/"
    echo "  - Database permissions: ls -la data/"
    echo ""
    exit 1
fi
