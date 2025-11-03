import socket
import subprocess
import re
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from app.utils import normalize_mac, validate_ip, parse_cidr

# Global flag for scan status
_scan_in_progress = False
_last_scan_time = None
_last_scan_results = []


def get_local_ip():
    """
    Get the local machine's IP address.

    Returns:
        str: Local IP address or None
    """
    try:
        # Create a dummy socket to determine local IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        return local_ip
    except Exception:
        return None


def get_local_mac():
    """
    Get the local machine's MAC address.

    Returns:
        str: MAC address or None
    """
    try:
        # Get all network interfaces
        result = subprocess.run(
            ['/bin/ip', 'link', 'show'],
            capture_output=True,
            text=True,
            timeout=5
        )

        if result.returncode != 0:
            return None

        # Find the interface with an IP (not loopback)
        local_ip = get_local_ip()
        if not local_ip:
            return None

        # Get the interface name for our IP
        ip_result = subprocess.run(
            ['/bin/ip', 'addr', 'show'],
            capture_output=True,
            text=True,
            timeout=5
        )

        current_interface = None
        for line in ip_result.stdout.split('\n'):
            if line.startswith(' ') or line.startswith('\t'):
                if f'inet {local_ip}/' in line:
                    break
            else:
                # Line with interface name
                match = re.match(r'\d+:\s+(\S+):', line)
                if match:
                    current_interface = match.group(1)

        if not current_interface:
            return None

        # Get MAC for this interface
        for line in result.stdout.split('\n'):
            if current_interface in line:
                # Next line should have MAC
                continue
            if 'link/ether' in line:
                match = re.search(r'([0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2})', line)
                if match:
                    return normalize_mac(match.group(1))

        return None
    except Exception as e:
        print(f"Error getting local MAC: {e}")
        return None


def get_scan_status():
    """Get current scan status"""
    return {
        'in_progress': _scan_in_progress,
        'last_scan_time': _last_scan_time.isoformat() if _last_scan_time else None,
        'last_scan_count': len(_last_scan_results)
    }


def ping_host(ip, timeout=1):
    """
    Ping a host to check if it's online (Linux only).

    Args:
        ip: IP address to ping
        timeout: Timeout in seconds

    Returns:
        bool: True if host is reachable, False otherwise
    """
    try:
        command = ['/bin/ping', '-c', '1', '-W', str(timeout), ip]

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


def get_ssdp_info(ip, timeout=2):
    """
    Try to get device info via SSDP (UPnP discovery).

    Args:
        ip: IP address to query
        timeout: Timeout in seconds

    Returns:
        str: Device friendly name or None
    """
    try:
        import socket as sock

        # SSDP M-SEARCH message
        ssdp_request = (
            'M-SEARCH * HTTP/1.1\r\n'
            'HOST: 239.255.255.250:1900\r\n'
            'MAN: "ssdp:discover"\r\n'
            'MX: 1\r\n'
            'ST: ssdp:all\r\n'
            '\r\n'
        ).encode('utf-8')

        # Create UDP socket
        s = sock.socket(sock.AF_INET, sock.SOCK_DGRAM)
        s.settimeout(timeout)

        # Send to specific IP on SSDP port
        s.sendto(ssdp_request, (ip, 1900))

        # Try to receive response
        try:
            data, addr = s.recvfrom(8192)
            response = data.decode('utf-8', errors='ignore')

            # Look for LOCATION header to fetch device description
            for line in response.split('\r\n'):
                if line.lower().startswith('location:'):
                    location_url = line.split(':', 1)[1].strip()

                    # Fetch device description XML
                    import urllib.request
                    try:
                        with urllib.request.urlopen(location_url, timeout=2) as resp:
                            xml_data = resp.read().decode('utf-8', errors='ignore')

                            # Extract friendly name from XML (simple regex, not full XML parser)
                            import re
                            match = re.search(r'<friendlyName>([^<]+)</friendlyName>', xml_data, re.IGNORECASE)
                            if match:
                                return match.group(1).strip()
                    except Exception:
                        pass
        except sock.timeout:
            pass
        finally:
            s.close()

    except Exception:
        pass

    return None


def get_hostname(ip):
    """
    Get hostname for an IP address using multiple methods.

    Args:
        ip: IP address

    Returns:
        str: Hostname or None if not found
    """
    # Try DNS reverse lookup first (fastest)
    try:
        hostname = socket.gethostbyaddr(ip)[0]
        if hostname and hostname != ip:
            # Clean up .local suffix if present
            return hostname.replace('.local', '')
    except Exception:
        pass

    # Try avahi-resolve (mDNS) - many devices broadcast their names
    try:
        result = subprocess.run(['/usr/bin/avahi-resolve-address', ip],
                               capture_output=True, text=True, timeout=2)
        if result.returncode == 0:
            # Output format: "192.168.0.x    hostname.local"
            parts = result.stdout.strip().split()
            if len(parts) >= 2:
                hostname = parts[1].replace('.local', '')
                if hostname and hostname != ip:
                    return hostname
    except FileNotFoundError:
        # avahi-resolve not installed, skip
        pass
    except Exception:
        pass

    # Try SSDP/UPnP discovery (good for smart TVs, printers, IoT devices)
    try:
        ssdp_name = get_ssdp_info(ip, timeout=2)
        if ssdp_name:
            return ssdp_name
    except Exception:
        pass

    # Try nmblookup for Windows/NetBIOS names
    try:
        result = subprocess.run(['/usr/bin/nmblookup', '-A', ip],
                               capture_output=True, text=True, timeout=2)
        if result.returncode == 0:
            # Parse NetBIOS name from output
            for line in result.stdout.split('\n'):
                if '<00>' in line and 'GROUP' not in line:
                    # Extract hostname before <00>
                    hostname = line.split()[0].strip()
                    if hostname and hostname != ip:
                        return hostname
    except FileNotFoundError:
        # nmblookup not installed, skip
        pass
    except Exception:
        pass

    return None


def get_mac_address_arp(ip):
    """
    Get MAC address from neighbor table (Linux only, uses 'ip neigh').

    Args:
        ip: IP address

    Returns:
        str: MAC address or None if not found
    """
    try:
        # First ping to ensure neighbor entry exists
        ping_host(ip, timeout=1)

        # Get neighbor table using modern 'ip neigh' command (iproute2)
        result = subprocess.run(['/bin/ip', 'neigh', 'show', ip],
                               capture_output=True, text=True, timeout=5)

        output = result.stdout

        # Parse MAC address from output
        # Format: 192.168.0.1 dev eth0 lladdr 00:11:22:33:44:55 REACHABLE
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
    is_online = ping_host(ip)
    if not is_online:
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
                        print(f"Found device: {result['ip']} - {result['hostname'] or 'Unknown'} - {result['mac']}")
                except Exception as e:
                    print(f"Error scanning {ip}: {e}")

                # Call progress callback if provided
                if progress_callback:
                    progress_callback(completed, total_hosts)

        # Add the local host machine to the scan results
        local_ip = get_local_ip()
        local_mac = get_local_mac()

        if local_ip and local_mac:
            # Check if local IP is already in results
            if not any(d['ip'] == local_ip for d in devices):
                try:
                    local_hostname = socket.gethostname()
                except Exception:
                    local_hostname = 'LANControl-Server'

                devices.append({
                    'ip': local_ip,
                    'hostname': local_hostname,
                    'mac': local_mac,
                    'last_seen': datetime.utcnow(),
                    'is_local_host': True
                })
                print(f"Added local host: {local_ip} - {local_hostname} - {local_mac}")

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
