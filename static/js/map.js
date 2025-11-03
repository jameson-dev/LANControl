/**
 * Network Topology Map - Visualization
 */

let network = null;
let nodes = null;
let edges = null;
let topologyData = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    initializeNetwork();
    loadTopology();
});

/**
 * Initialize the network visualization
 */
function initializeNetwork() {
    const container = document.getElementById('networkCanvas');

    // Create empty datasets
    nodes = new vis.DataSet([]);
    edges = new vis.DataSet([]);

    // Network options
    const options = {
        nodes: {
            shape: 'dot',
            size: 16,
            font: {
                size: 14,
                color: '#ffffff',
                background: 'rgba(0, 0, 0, 0.5)'
            },
            borderWidth: 2,
            shadow: true
        },
        edges: {
            width: 2,
            color: {
                color: 'rgba(255, 255, 255, 0.3)',
                highlight: 'rgba(59, 130, 246, 0.8)',
                hover: 'rgba(59, 130, 246, 0.5)'
            },
            smooth: {
                type: 'continuous'
            }
        },
        physics: {
            enabled: true,
            stabilization: {
                enabled: true,
                iterations: 100
            },
            barnesHut: {
                gravitationalConstant: -2000,
                springConstant: 0.001,
                springLength: 200
            }
        },
        layout: {
            hierarchical: {
                enabled: true,
                direction: 'UD',
                sortMethod: 'directed',
                levelSeparation: 150,
                nodeSpacing: 200
            }
        },
        interaction: {
            hover: true,
            dragNodes: true,
            dragView: true,
            zoomView: true
        }
    };

    // Create network
    network = new vis.Network(container, { nodes, edges }, options);

    // Event listeners
    network.on('click', function(params) {
        if (params.nodes.length > 0) {
            showDeviceInfo(params.nodes[0]);
        } else {
            hideDeviceInfo();
        }
    });

    network.on('dragEnd', function(params) {
        if (params.nodes.length > 0) {
            const nodeId = params.nodes[0];
            const position = network.getPositions([nodeId])[nodeId];
            saveNodePosition(nodeId, position.x, position.y);
        }
    });
}

/**
 * Load topology data from API
 */
async function loadTopology() {
    try {
        const data = await apiCall('/api/topology');
        topologyData = data.topology;
        renderTopology(topologyData);
    } catch (error) {
        console.error('Error loading topology:', error);
        showToast('Failed to load network topology', 'error');
    }
}

/**
 * Render topology on canvas
 */
function renderTopology(topology) {
    if (!topology || !topology.nodes) {
        showToast('No topology data available', 'warning');
        return;
    }

    // Clear existing data
    nodes.clear();
    edges.clear();

    // Add nodes
    topology.nodes.forEach(node => {
        const statusColors = {
            'online': '#10b981',
            'offline': '#ef4444',
            'unknown': '#6b7280'
        };

        const color = statusColors[node.status] || '#6b7280';

        nodes.add({
            id: node.id,
            label: node.label,
            color: {
                background: color,
                border: node.is_gateway ? '#fbbf24' : color,
                highlight: {
                    background: color,
                    border: '#60a5fa'
                }
            },
            x: node.x || undefined,
            y: node.y || undefined,
            title: `${node.label}\nStatus: ${node.status}`,
            borderWidth: node.is_gateway ? 4 : 2
        });
    });

    // Add edges
    topology.edges.forEach(edge => {
        edges.add({
            from: edge.from,
            to: edge.to,
            title: edge.type
        });
    });

    // Update count
    document.getElementById('nodeCount').textContent = `${topology.nodes.length} devices`;

    // Fit network to view
    setTimeout(() => {
        network.fit({
            animation: {
                duration: 1000,
                easingFunction: 'easeInOutQuad'
            }
        });
    }, 100);
}

/**
 * Show device information panel
 */
async function showDeviceInfo(nodeId) {
    try {
        const data = await apiCall(`/api/devices/${nodeId}`);
        const device = data.device;

        const infoContent = document.getElementById('deviceInfoContent');
        infoContent.innerHTML = `
            <div class="grid grid-cols-2 gap-2">
                <div class="text-gray-400">Name:</div>
                <div class="text-white font-medium">${device.nickname || device.hostname || 'N/A'}</div>

                <div class="text-gray-400">IP Address:</div>
                <div class="text-white">${device.ip || 'N/A'}</div>

                <div class="text-gray-400">MAC Address:</div>
                <div class="text-white font-mono text-xs">${device.mac}</div>

                <div class="text-gray-400">Status:</div>
                <div>
                    <span class="px-2 py-1 rounded text-xs ${
                        device.status === 'online' ? 'bg-green-600' :
                        device.status === 'offline' ? 'bg-red-600' : 'bg-gray-600'
                    }">${device.status}</span>
                </div>

                <div class="text-gray-400">Vendor:</div>
                <div class="text-white text-sm">${device.vendor || 'Unknown'}</div>

                ${device.group ? `
                    <div class="text-gray-400">Group:</div>
                    <div class="text-white">${device.group}</div>
                ` : ''}
            </div>
            <div class="mt-4 flex gap-2">
                <button onclick="wakeDevice(${device.id})" class="flex-1 px-3 py-2 bg-green-600/20 hover:bg-green-600/30 rounded text-sm transition">
                    Wake Device
                </button>
                <button onclick="window.location.href='/dashboard'" class="flex-1 px-3 py-2 bg-blue-600/20 hover:bg-blue-600/30 rounded text-sm transition">
                    View Details
                </button>
            </div>
        `;

        document.getElementById('deviceInfo').classList.remove('hidden');
    } catch (error) {
        console.error('Error loading device info:', error);
    }
}

/**
 * Hide device information panel
 */
function hideDeviceInfo() {
    document.getElementById('deviceInfo').classList.add('hidden');
}

/**
 * Save node position to backend
 */
async function saveNodePosition(nodeId, x, y) {
    try {
        await apiCall('/api/topology/position', {
            method: 'PUT',
            body: JSON.stringify({
                device_id: nodeId,
                x: Math.round(x),
                y: Math.round(y)
            })
        });
    } catch (error) {
        console.error('Error saving position:', error);
    }
}

/**
 * Trigger topology discovery
 */
async function discoverTopology() {
    const btn = document.getElementById('discoverBtn');
    const btnText = document.getElementById('discoverBtnText');

    btn.disabled = true;
    btnText.textContent = 'Discovering...';

    try {
        await apiCall('/api/topology/discover', { method: 'POST' });
        showToast('Topology discovery started', 'success');

        // Reload topology after a delay
        setTimeout(() => {
            loadTopology();
        }, 3000);
    } catch (error) {
        console.error('Error discovering topology:', error);
        showToast('Failed to discover topology', 'error');
    } finally {
        btn.disabled = false;
        btnText.textContent = 'Discover Topology';
    }
}

/**
 * Center network view
 */
function centerNetwork() {
    if (network) {
        network.fit({
            animation: {
                duration: 500,
                easingFunction: 'easeInOutQuad'
            }
        });
    }
}

/**
 * Export topology as PNG
 */
function exportTopology() {
    if (!network) return;

    const canvas = document.querySelector('#networkCanvas canvas');
    if (canvas) {
        canvas.toBlob(blob => {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.download = `network-topology-${new Date().toISOString().slice(0,10)}.png`;
            link.href = url;
            link.click();
            URL.revokeObjectURL(url);
        });
        showToast('Network map exported', 'success');
    }
}

/**
 * Change network layout
 */
function changeLayout() {
    const layoutType = document.getElementById('layoutSelect').value;

    const layouts = {
        hierarchical: {
            hierarchical: {
                enabled: true,
                direction: 'UD',
                sortMethod: 'directed',
                levelSeparation: 150,
                nodeSpacing: 200
            }
        },
        force: {
            hierarchical: {
                enabled: false
            }
        },
        circular: {
            hierarchical: {
                enabled: false
            }
        }
    };

    network.setOptions({ layout: layouts[layoutType] });

    if (layoutType === 'circular') {
        // Arrange nodes in a circle
        const nodeIds = nodes.getIds();
        const radius = 300;
        const angleStep = (2 * Math.PI) / nodeIds.length;

        nodeIds.forEach((id, index) => {
            const angle = index * angleStep;
            const x = radius * Math.cos(angle);
            const y = radius * Math.sin(angle);
            nodes.update({ id, x, y });
        });
    }
}

/**
 * Toggle labels visibility
 */
function toggleLabels() {
    const showLabels = document.getElementById('showLabels').checked;
    network.setOptions({
        nodes: {
            font: {
                size: showLabels ? 14 : 0
            }
        }
    });
}

/**
 * Toggle physics simulation
 */
function togglePhysics() {
    const physicsEnabled = document.getElementById('physicsEnabled').checked;
    network.setOptions({
        physics: {
            enabled: physicsEnabled
        }
    });
}

/**
 * Wake device from map
 */
async function wakeDevice(deviceId) {
    try {
        await apiCall(`/api/devices/${deviceId}/wol`, { method: 'POST' });
        showToast('Magic packet sent', 'success');
    } catch (error) {
        console.error('Error waking device:', error);
        showToast('Failed to wake device', 'error');
    }
}
