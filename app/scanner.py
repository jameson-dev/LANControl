import socket
import platform
import subprocess
import re
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from app.utils import normalize_mac, validate_ip, parse_cidr

# Global flag for scan status
_scan_in_progress = False
_last_scan_time = None
_last_scan_results = []


def get_scan_status():
    """Get current scan status"""
    return {
        'in_progress': _scan_in_progress,
        'last_scan_time': _last_scan_time.isoformat() if _last_scan_time else None,
        'last_scan_count': len(_last_scan_results)
    }


def ping_host(ip, timeout=1):
    """
    Ping a host to check if it's online.

    Args:
        ip: IP address to ping
        timeout: Timeout in seconds

    Returns:
        bool: True if host is reachable, False otherwise
    """
    try:
        # Platform-specific ping command
        param = '-n' if platform.system().lower() == 'windows' else '-c'
        timeout_param = '-w' if platform.system().lower() == 'windows' else '-W'

        command = ['ping', param, '1', timeout_param, str(timeout * 1000 if platform.system().lower() == 'windows' else timeout), ip]

        result = subprocess.run(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout + 1
        )

        return result.returncode == 0

    except Exception as e:
        print(f"Error pinging {ip}: {e}")
        return False


def get_hostname(ip):
    """
    Get hostname for an IP address using DNS lookup.

    Args:
        ip: IP address

    Returns:
        str: Hostname or None if not found
    """
    try:
        hostname = socket.gethostbyaddr(ip)[0]
        return hostname if hostname != ip else None
    except Exception:
        return None


def get_mac_address_arp(ip):
    """
    Get MAC address from ARP table (works on both Windows and Linux).

    Args:
        ip: IP address

    Returns:
        str: MAC address or None if not found
    """
    try:
        # First ping to ensure ARP entry exists
        ping_host(ip, timeout=1)

        # Get ARP table
        if platform.system().lower() == 'windows':
            result = subprocess.run(['arp', '-a', ip], capture_output=True, text=True, timeout=5)
        else:
            result = subprocess.run(['arp', '-n', ip], capture_output=True, text=True, timeout=5)

        output = result.stdout

        # Parse MAC address from output
        # Windows format: 192.168.1.1       00-11-22-33-44-55     dynamic
        # Linux format:   192.168.1.1      ether   00:11:22:33:44:55   C   eth0
        mac_pattern = r'([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})'
        match = re.search(mac_pattern, output)

        if match:
            mac = match.group(0)
            return normalize_mac(mac)

        return None

    except Exception as e:
        print(f"Error getting MAC for {ip}: {e}")
        return None


def scan_host(ip):
    """
    Scan a single host and return device information.

    Args:
        ip: IP address to scan

    Returns:
        dict: Device information or None if host is not reachable
    """
    # Check if host is online
    if not ping_host(ip):
        return None

    # Get hostname
    hostname = get_hostname(ip)

    # Get MAC address
    mac = get_mac_address_arp(ip)

    if not mac:
        # If we can't get MAC, skip this device
        return None

    return {
        'ip': ip,
        'hostname': hostname,
        'mac': mac,
        'last_seen': datetime.utcnow()
    }


def scan_network(cidr, max_workers=50, progress_callback=None):
    """
    Scan a network range for active devices.

    Args:
        cidr: Network in CIDR notation (e.g., '192.168.1.0/24')
        max_workers: Maximum number of concurrent threads
        progress_callback: Optional callback function for progress updates

    Returns:
        list: List of discovered devices
    """
    global _scan_in_progress, _last_scan_time, _last_scan_results

    _scan_in_progress = True
    devices = []

    try:
        # Parse CIDR to get list of hosts
        network_info = parse_cidr(cidr)
        if not network_info:
            print(f"Invalid CIDR notation: {cidr}")
            return []

        hosts = network_info['hosts']
        total_hosts = len(hosts)

        print(f"Scanning {total_hosts} hosts in {cidr}...")

        # Scan hosts concurrently
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_ip = {executor.submit(scan_host, ip): ip for ip in hosts}

            completed = 0
            for future in as_completed(future_to_ip):
                completed += 1
                ip = future_to_ip[future]

                try:
                    result = future.result()
                    if result:
                        devices.append(result)
                        print(f"Found device: {result['ip']} - {result['hostname']} - {result['mac']}")
                except Exception as e:
                    print(f"Error scanning {ip}: {e}")

                # Call progress callback if provided
                if progress_callback:
                    progress_callback(completed, total_hosts)

        print(f"Scan complete. Found {len(devices)} devices.")

        _last_scan_results = devices
        _last_scan_time = datetime.utcnow()

    except Exception as e:
        print(f"Error during network scan: {e}")
    finally:
        _scan_in_progress = False

    return devices


def check_device_status(device):
    """
    Check if a single device is currently online.

    Args:
        device: Device object with IP address

    Returns:
        dict: Status information
    """
    if not device.ip:
        return {
            'online': False,
            'message': 'No IP address'
        }

    online = ping_host(device.ip, timeout=2)

    return {
        'online': online,
        'timestamp': datetime.utcnow(),
        'message': 'Device is reachable' if online else 'Device is not reachable'
    }


def update_device_from_scan(device, scan_result):
    """
    Update device information from scan result.

    Args:
        device: Device model instance
        scan_result: Dictionary with scan results

    Returns:
        bool: True if device was updated
    """
    updated = False

    if scan_result.get('ip') and scan_result['ip'] != device.ip:
        device.ip = scan_result['ip']
        updated = True

    if scan_result.get('hostname') and scan_result['hostname'] != device.hostname:
        device.hostname = scan_result['hostname']
        updated = True

    if scan_result.get('last_seen'):
        device.last_seen = scan_result['last_seen']
        updated = True

    if updated:
        device.updated_at = datetime.utcnow()

    return updated


def quick_scan_known_devices(devices):
    """
    Quickly scan known devices to check their status.

    Args:
        devices: List of Device objects

    Returns:
        dict: Results for each device
    """
    results = {}

    with ThreadPoolExecutor(max_workers=20) as executor:
        future_to_device = {executor.submit(check_device_status, device): device for device in devices}

        for future in as_completed(future_to_device):
            device = future_to_device[future]
            try:
                result = future.result()
                results[device.id] = result
            except Exception as e:
                print(f"Error checking device {device.id}: {e}")
                results[device.id] = {
                    'online': False,
                    'message': f'Error: {str(e)}'
                }

    return results
