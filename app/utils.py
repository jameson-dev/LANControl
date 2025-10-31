import json
import os
import re
import time
import requests
from config import Config

# In-memory cache for MAC vendors
_mac_vendor_cache = {}
_cache_loaded = False


def load_mac_vendor_cache():
    """Load MAC vendor cache from file"""
    global _mac_vendor_cache, _cache_loaded

    if _cache_loaded:
        return

    cache_file = Config.MAC_VENDOR_CACHE_FILE
    if os.path.exists(cache_file):
        try:
            with open(cache_file, 'r') as f:
                _mac_vendor_cache = json.load(f)
        except Exception as e:
            print(f"Error loading MAC vendor cache: {e}")
            _mac_vendor_cache = {}

    _cache_loaded = True


def save_mac_vendor_cache():
    """Save MAC vendor cache to file"""
    cache_file = Config.MAC_VENDOR_CACHE_FILE
    os.makedirs(os.path.dirname(cache_file), exist_ok=True)

    try:
        with open(cache_file, 'w') as f:
            json.dump(_mac_vendor_cache, f, indent=2)
    except Exception as e:
        print(f"Error saving MAC vendor cache: {e}")


def normalize_mac(mac):
    """Normalize MAC address format to XX:XX:XX:XX:XX:XX"""
    # Remove any non-hex characters
    mac_clean = re.sub(r'[^0-9A-Fa-f]', '', mac)

    if len(mac_clean) != 12:
        return None

    # Format as XX:XX:XX:XX:XX:XX
    return ':'.join(mac_clean[i:i+2].upper() for i in range(0, 12, 2))


def get_mac_oui(mac):
    """Get OUI (first 3 octets) from MAC address"""
    normalized = normalize_mac(mac)
    if not normalized:
        return None
    return ':'.join(normalized.split(':')[:3])


def get_mac_vendor(mac):
    """Get vendor name for a MAC address"""
    load_mac_vendor_cache()

    oui = get_mac_oui(mac)
    if not oui:
        return 'Unknown'

    # Check cache first
    if oui in _mac_vendor_cache:
        return _mac_vendor_cache[oui]

    # Try to fetch from API (with rate limiting)
    try:
        time.sleep(0.1)  # Rate limit: 10 requests per second max
        response = requests.get(f"{Config.MAC_VENDOR_API}/{mac}", timeout=2)

        if response.status_code == 200:
            vendor = response.text.strip()
            _mac_vendor_cache[oui] = vendor
            save_mac_vendor_cache()
            return vendor
        else:
            # Cache unknown vendors to avoid repeated API calls
            _mac_vendor_cache[oui] = 'Unknown'
            save_mac_vendor_cache()
            return 'Unknown'
    except Exception as e:
        print(f"Error fetching MAC vendor: {e}")
        return 'Unknown'


def validate_mac(mac):
    """Validate MAC address format"""
    normalized = normalize_mac(mac)
    return normalized is not None


def validate_ip(ip):
    """Validate IP address format"""
    pattern = r'^(\d{1,3}\.){3}\d{1,3}$'
    if not re.match(pattern, ip):
        return False

    octets = ip.split('.')
    return all(0 <= int(octet) <= 255 for octet in octets)


def parse_cidr(cidr):
    """Parse CIDR notation and return network info"""
    import ipaddress
    try:
        network = ipaddress.ip_network(cidr, strict=False)
        return {
            'network': str(network.network_address),
            'broadcast': str(network.broadcast_address),
            'netmask': str(network.netmask),
            'num_hosts': network.num_addresses - 2,  # Exclude network and broadcast
            'hosts': [str(ip) for ip in network.hosts()]
        }
    except Exception as e:
        print(f"Error parsing CIDR: {e}")
        return None


def format_uptime(seconds):
    """Format uptime in seconds to human-readable string"""
    if seconds < 60:
        return f"{int(seconds)}s"
    elif seconds < 3600:
        return f"{int(seconds / 60)}m"
    elif seconds < 86400:
        hours = int(seconds / 3600)
        minutes = int((seconds % 3600) / 60)
        return f"{hours}h {minutes}m"
    else:
        days = int(seconds / 86400)
        hours = int((seconds % 86400) / 3600)
        return f"{days}d {hours}h"


def calculate_uptime_percentage(device_id, days=7):
    """Calculate uptime percentage for a device over the last N days"""
    from datetime import datetime, timedelta
    from app.models import DeviceHistory

    start_time = datetime.utcnow() - timedelta(days=days)

    history = DeviceHistory.query.filter(
        DeviceHistory.device_id == device_id,
        DeviceHistory.timestamp >= start_time
    ).order_by(DeviceHistory.timestamp).all()

    if not history:
        return None

    total_time = (datetime.utcnow() - start_time).total_seconds()
    online_time = 0

    for i in range(len(history) - 1):
        if history[i].status == 'online':
            time_diff = (history[i + 1].timestamp - history[i].timestamp).total_seconds()
            online_time += time_diff

    # Add time from last status to now
    if history and history[-1].status == 'online':
        online_time += (datetime.utcnow() - history[-1].timestamp).total_seconds()

    return (online_time / total_time) * 100 if total_time > 0 else 0
