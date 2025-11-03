"""
Network topology discovery and management.
"""
import subprocess
import re
from datetime import datetime
from app.models import db, Device, NetworkTopology


def discover_topology():
    """
    Discover network topology by analyzing routing tables and ARP.
    This is a basic implementation - can be enhanced with traceroute, etc.
    """
    try:
        # Get default gateway
        gateway_ip = get_default_gateway()

        if not gateway_ip:
            print("Could not determine default gateway")
            return

        # Find the gateway device in our database
        gateway_device = Device.query.filter_by(ip=gateway_ip).first()

        if not gateway_device:
            print(f"Gateway {gateway_ip} not in device database")
            return

        # Get all devices
        devices = Device.query.all()

        for device in devices:
            if not device.ip or device.id == gateway_device.id:
                continue

            # Check if topology entry exists
            topology = NetworkTopology.query.filter_by(device_id=device.id).first()

            if not topology:
                # Create new topology entry
                # By default, assume all devices connect through the gateway
                topology = NetworkTopology(
                    device_id=device.id,
                    connected_to_id=gateway_device.id,
                    connection_type='unknown'
                )
                db.session.add(topology)
            else:
                # Update existing entry
                topology.connected_to_id = gateway_device.id
                topology.updated_at = datetime.utcnow()

        db.session.commit()
        print(f"Topology discovered: {len(devices)} devices connected to gateway {gateway_ip}")

    except Exception as e:
        print(f"Error discovering topology: {e}")


def get_default_gateway():
    """
    Get the default gateway IP address.

    Returns:
        str: Gateway IP address or None
    """
    try:
        # Linux: ip route
        result = subprocess.run(
            ['ip', 'route', 'show', 'default'],
            capture_output=True,
            text=True,
            timeout=5
        )

        if result.returncode == 0:
            match = re.search(r'default via (\d+\.\d+\.\d+\.\d+)', result.stdout)
            if match:
                return match.group(1)

    except Exception as e:
        print(f"Error getting default gateway: {e}")

    return None


def update_device_position(device_id, x, y):
    """
    Update the visual position of a device in the topology map.

    Args:
        device_id: Device ID
        x: X coordinate
        y: Y coordinate

    Returns:
        bool: Success status
    """
    topology = NetworkTopology.query.filter_by(device_id=device_id).first()

    if not topology:
        # Create if doesn't exist
        topology = NetworkTopology(
            device_id=device_id,
            position_x=x,
            position_y=y
        )
        db.session.add(topology)
    else:
        topology.position_x = x
        topology.position_y = y
        topology.updated_at = datetime.utcnow()

    db.session.commit()
    return True


def get_topology_graph():
    """
    Get the complete network topology as a graph structure.

    Returns:
        dict: Topology data with nodes and edges
    """
    devices = Device.query.all()
    topologies = NetworkTopology.query.all()

    # Build nodes
    nodes = []
    for device in devices:
        topology = next((t for t in topologies if t.device_id == device.id), None)

        nodes.append({
            'id': device.id,
            'label': device.nickname or device.hostname or device.ip or device.mac,
            'ip': device.ip,
            'mac': device.mac,
            'status': device.status,
            'device_type': device.device_type or 'unknown',
            'vendor': device.vendor,
            'x': topology.position_x if topology else 0,
            'y': topology.position_y if topology else 0
        })

    # Build edges (connections)
    edges = []
    for topology in topologies:
        if topology.connected_to_id:
            edges.append({
                'from': topology.device_id,
                'to': topology.connected_to_id,
                'type': topology.connection_type
            })

    return {
        'nodes': nodes,
        'edges': edges
    }


def set_device_connection(device_id, connected_to_id, connection_type='ethernet'):
    """
    Manually set the connection between two devices.

    Args:
        device_id: Source device ID
        connected_to_id: Target device ID (router/switch)
        connection_type: Type of connection (ethernet, wifi, unknown)

    Returns:
        bool: Success status
    """
    topology = NetworkTopology.query.filter_by(device_id=device_id).first()

    if not topology:
        topology = NetworkTopology(
            device_id=device_id,
            connected_to_id=connected_to_id,
            connection_type=connection_type
        )
        db.session.add(topology)
    else:
        topology.connected_to_id = connected_to_id
        topology.connection_type = connection_type
        topology.updated_at = datetime.utcnow()

    db.session.commit()
    return True
