"""
Port scanning and service detection functionality.
"""
import socket
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

# Common ports and their typical services
COMMON_PORTS = {
    20: 'FTP-Data',
    21: 'FTP',
    22: 'SSH',
    23: 'Telnet',
    25: 'SMTP',
    53: 'DNS',
    80: 'HTTP',
    110: 'POP3',
    143: 'IMAP',
    443: 'HTTPS',
    445: 'SMB',
    548: 'AFP',
    631: 'IPP/CUPS',
    993: 'IMAPS',
    995: 'POP3S',
    1433: 'MSSQL',
    1883: 'MQTT',
    3306: 'MySQL',
    3389: 'RDP',
    5000: 'UPnP/Flask',
    5432: 'PostgreSQL',
    5900: 'VNC',
    6379: 'Redis',
    8080: 'HTTP-Alt',
    8443: 'HTTPS-Alt',
    8883: 'MQTT-SSL',
    9000: 'SonarQube',
    27017: 'MongoDB',
}

# Device type detection based on port combinations
DEVICE_TYPE_SIGNATURES = {
    'router': {80, 443, 53},
    'nas': {80, 443, 445, 548, 22},
    'printer': {631, 9100, 80},
    'web_server': {80, 443},
    'database': {3306, 5432, 27017},
    'iot_device': {1883, 8883, 80},
    'media_server': {32400, 8096, 32469},  # Plex, Jellyfin
    'ssh_server': {22},
    'windows_pc': {445, 3389, 135},
    'raspberry_pi': {22, 80},
    'camera': {80, 554, 8000},  # HTTP, RTSP
}


def scan_port(ip, port, timeout=1):
    """
    Scan a single port on a device.

    Args:
        ip: IP address to scan
        port: Port number to scan
        timeout: Timeout in seconds

    Returns:
        dict: Port information or None if closed
    """
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        result = sock.connect_ex((ip, port))
        sock.close()

        if result == 0:
            # Port is open
            service = COMMON_PORTS.get(port, 'Unknown')
            return {
                'port': port,
                'protocol': 'tcp',
                'state': 'open',
                'service': service
            }
        return None
    except socket.error:
        return None
    except Exception as e:
        print(f"Error scanning {ip}:{port} - {e}")
        return None


def scan_device_ports(ip, port_list=None, timeout=1, max_workers=50):
    """
    Scan multiple ports on a device.

    Args:
        ip: IP address to scan
        port_list: List of ports to scan (defaults to COMMON_PORTS)
        timeout: Timeout per port in seconds
        max_workers: Maximum concurrent scans

    Returns:
        list: List of open port dictionaries
    """
    if port_list is None:
        port_list = list(COMMON_PORTS.keys())

    open_ports = []

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_port = {
            executor.submit(scan_port, ip, port, timeout): port
            for port in port_list
        }

        for future in as_completed(future_to_port):
            result = future.result()
            if result:
                open_ports.append(result)

    # Sort by port number
    open_ports.sort(key=lambda x: x['port'])
    return open_ports


def quick_scan_common_ports(ip, timeout=0.5):
    """
    Quick scan of most common ports (top 20).

    Args:
        ip: IP address to scan
        timeout: Timeout per port

    Returns:
        list: List of open port dictionaries
    """
    top_ports = [21, 22, 23, 25, 80, 110, 143, 443, 445, 3306,
                 3389, 5432, 5900, 8080, 8443, 27017]
    return scan_device_ports(ip, top_ports, timeout)


def full_port_scan(ip, timeout=1):
    """
    Comprehensive port scan (all common ports).

    Args:
        ip: IP address to scan
        timeout: Timeout per port

    Returns:
        list: List of open port dictionaries
    """
    return scan_device_ports(ip, None, timeout)


def detect_device_type(open_ports):
    """
    Detect device type based on open ports.

    Args:
        open_ports: List of open port dictionaries

    Returns:
        str: Detected device type or 'unknown'
    """
    if not open_ports:
        return 'unknown'

    port_numbers = {port['port'] for port in open_ports}

    # Check each signature
    best_match = ('unknown', 0)

    for device_type, signature_ports in DEVICE_TYPE_SIGNATURES.items():
        # Count how many signature ports are open
        matches = len(signature_ports & port_numbers)

        if matches > 0:
            # Calculate match percentage
            match_score = matches / len(signature_ports)

            if match_score > best_match[1]:
                best_match = (device_type, match_score)

    # Only return match if at least 50% of signature ports match
    if best_match[1] >= 0.5:
        return best_match[0]

    # Fallback to simple single-port detection
    if 22 in port_numbers and 80 not in port_numbers:
        return 'ssh_server'
    if 80 in port_numbers or 443 in port_numbers:
        return 'web_server'
    if 445 in port_numbers:
        return 'windows_pc'

    return 'unknown'


def get_service_banner(ip, port, timeout=2):
    """
    Try to get service banner for identification.

    Args:
        ip: IP address
        port: Port number
        timeout: Timeout in seconds

    Returns:
        str: Service banner or None
    """
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        sock.connect((ip, port))

        # Try to read banner
        sock.send(b'\r\n')
        banner = sock.recv(1024).decode('utf-8', errors='ignore').strip()
        sock.close()

        return banner if banner else None
    except:
        return None
