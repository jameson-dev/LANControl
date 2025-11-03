"""
Bandwidth monitoring functionality for tracking network usage per device.
"""
import subprocess
import re
from datetime import datetime, timedelta
from app.models import db, Device, BandwidthUsage

def collect_bandwidth_data():
    """
    Collect current bandwidth usage for all devices.
    Uses conntrack to monitor active connections.
    """
    try:
        # Try to use conntrack to get connection info
        # This requires: apt-get install conntrack
        result = subprocess.run(
            ['conntrack', '-L', '-o', 'extended'],
            capture_output=True,
            text=True,
            timeout=10
        )

        if result.returncode != 0:
            print("conntrack not available or requires sudo")
            return

        # Parse conntrack output
        device_stats = {}

        for line in result.stdout.split('\n'):
            if not line.strip():
                continue

            # Extract IP addresses from conntrack line
            src_match = re.search(r'src=(\d+\.\d+\.\d+\.\d+)', line)
            dst_match = re.search(r'dst=(\d+\.\d+\.\d+\.\d+)', line)
            bytes_match = re.search(r'bytes=(\d+)', line)
            packets_match = re.search(r'packets=(\d+)', line)

            if src_match and bytes_match:
                ip = src_match.group(1)
                bytes_val = int(bytes_match.group(1))
                packets_val = int(packets_match.group(1)) if packets_match else 0

                if ip not in device_stats:
                    device_stats[ip] = {
                        'bytes_sent': 0,
                        'bytes_received': 0,
                        'packets_sent': 0,
                        'packets_received': 0,
                        'connections': 0
                    }

                device_stats[ip]['bytes_sent'] += bytes_val
                device_stats[ip]['packets_sent'] += packets_val
                device_stats[ip]['connections'] += 1

        # Store in database
        for ip, stats in device_stats.items():
            device = Device.query.filter_by(ip=ip).first()
            if device:
                usage = BandwidthUsage(
                    device_id=device.id,
                    bytes_sent=stats['bytes_sent'],
                    bytes_received=stats['bytes_received'],
                    packets_sent=stats['packets_sent'],
                    packets_received=stats['packets_received'],
                    active_connections=stats['connections']
                )
                db.session.add(usage)

        db.session.commit()
        print(f"Collected bandwidth data for {len(device_stats)} devices")

    except FileNotFoundError:
        print("conntrack command not found. Install with: apt-get install conntrack")
    except Exception as e:
        print(f"Error collecting bandwidth data: {e}")


def get_device_bandwidth(device_id, hours=24):
    """
    Get bandwidth usage for a device over the last N hours.

    Args:
        device_id: Device ID
        hours: Number of hours to look back

    Returns:
        list: Bandwidth usage records
    """
    cutoff = datetime.utcnow() - timedelta(hours=hours)

    usage = BandwidthUsage.query.filter(
        BandwidthUsage.device_id == device_id,
        BandwidthUsage.timestamp >= cutoff
    ).order_by(BandwidthUsage.timestamp.asc()).all()

    return [u.to_dict() for u in usage]


def get_top_bandwidth_users(limit=10, hours=24):
    """
    Get the top bandwidth consumers.

    Args:
        limit: Number of devices to return
        hours: Time window to analyze

    Returns:
        list: Top bandwidth users with total usage
    """
    cutoff = datetime.utcnow() - timedelta(hours=hours)

    # Query to sum bandwidth per device
    from sqlalchemy import func

    results = db.session.query(
        BandwidthUsage.device_id,
        func.sum(BandwidthUsage.bytes_sent + BandwidthUsage.bytes_received).label('total_bytes'),
        func.sum(BandwidthUsage.packets_sent + BandwidthUsage.packets_received).label('total_packets')
    ).filter(
        BandwidthUsage.timestamp >= cutoff
    ).group_by(
        BandwidthUsage.device_id
    ).order_by(
        func.sum(BandwidthUsage.bytes_sent + BandwidthUsage.bytes_received).desc()
    ).limit(limit).all()

    # Get device details
    top_users = []
    for device_id, total_bytes, total_packets in results:
        device = Device.query.get(device_id)
        if device:
            top_users.append({
                'device': device.to_dict(),
                'total_bytes': int(total_bytes) if total_bytes else 0,
                'total_packets': int(total_packets) if total_packets else 0
            })

    return top_users


def cleanup_old_bandwidth_data(days=30):
    """
    Clean up bandwidth data older than specified days.

    Args:
        days: Number of days to retain
    """
    cutoff = datetime.utcnow() - timedelta(days=days)

    deleted = BandwidthUsage.query.filter(
        BandwidthUsage.timestamp < cutoff
    ).delete()

    db.session.commit()

    print(f"Cleaned up {deleted} old bandwidth records (older than {days} days)")
