import socket
import struct
from app.utils import normalize_mac


def create_magic_packet(mac_address):
    """
    Create a Wake-on-LAN magic packet for the given MAC address.

    Magic packet format:
    - 6 bytes of 0xFF (broadcast)
    - 16 repetitions of the target MAC address (96 bytes)
    - Total: 102 bytes
    """
    # Normalize MAC address
    normalized_mac = normalize_mac(mac_address)
    if not normalized_mac:
        raise ValueError(f"Invalid MAC address: {mac_address}")

    # Convert MAC to bytes
    mac_bytes = bytes.fromhex(normalized_mac.replace(':', ''))

    # Create magic packet: FF * 6 + (MAC * 16)
    magic_packet = b'\xFF' * 6 + mac_bytes * 16

    return magic_packet


def send_wol_packet(mac_address, broadcast='255.255.255.255', port=9):
    """
    Send a Wake-on-LAN magic packet to wake up a device.

    Args:
        mac_address: MAC address of the target device
        broadcast: Broadcast address (default: 255.255.255.255)
        port: UDP port (default: 9, alternative: 7)

    Returns:
        dict: Result with success status and message
    """
    try:
        # Create magic packet
        magic_packet = create_magic_packet(mac_address)

        # Create UDP socket
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)

        # Send to primary port (9)
        sock.sendto(magic_packet, (broadcast, port))

        # Also send to alternative port (7) for better compatibility
        if port != 7:
            sock.sendto(magic_packet, (broadcast, 7))

        sock.close()

        return {
            'success': True,
            'message': f'WOL packet sent to {mac_address}'
        }

    except Exception as e:
        return {
            'success': False,
            'message': f'Error sending WOL packet: {str(e)}'
        }


def send_bulk_wol(mac_addresses, broadcast='255.255.255.255'):
    """
    Send WOL packets to multiple devices.

    Args:
        mac_addresses: List of MAC addresses
        broadcast: Broadcast address

    Returns:
        dict: Results for each MAC address
    """
    results = {}

    for mac in mac_addresses:
        result = send_wol_packet(mac, broadcast)
        results[mac] = result

    return {
        'results': results,
        'total': len(mac_addresses),
        'success_count': sum(1 for r in results.values() if r['success'])
    }


def test_wol_capability():
    """
    Test if the system can send WOL packets.
    Returns dict with capability info.
    """
    try:
        # Try to create a UDP socket with broadcast
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        sock.close()

        return {
            'capable': True,
            'message': 'System can send WOL packets'
        }
    except Exception as e:
        return {
            'capable': False,
            'message': f'System cannot send WOL packets: {str(e)}'
        }
