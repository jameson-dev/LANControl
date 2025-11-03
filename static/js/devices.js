// Global variables
let allDevices = [];
let currentSort = { field: 'nickname', direction: 'asc' };
let refreshInterval = null;
let fastRefreshInterval = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    loadDevices();
    loadStats();
    setupEventListeners();

    // Auto-refresh every 30 seconds
    startNormalRefresh();
});

function startNormalRefresh() {
    // Clear any existing intervals
    if (refreshInterval) clearInterval(refreshInterval);
    if (fastRefreshInterval) clearInterval(fastRefreshInterval);

    // Normal refresh every 30 seconds
    refreshInterval = setInterval(() => {
        loadDevices();
        loadStats();
    }, 30000);
}

function startFastRefresh() {
    // Clear any existing intervals
    if (refreshInterval) clearInterval(refreshInterval);
    if (fastRefreshInterval) clearInterval(fastRefreshInterval);

    // Fast refresh every 2 seconds during scan
    fastRefreshInterval = setInterval(() => {
        loadDevices();
        loadStats();
    }, 2000);
}

// Setup event listeners
function setupEventListeners() {
    document.getElementById('searchInput').addEventListener('input', filterDevices);
    document.getElementById('groupFilter').addEventListener('change', filterDevices);
    document.getElementById('statusFilter').addEventListener('change', filterDevices);
    document.getElementById('favoritesOnly').addEventListener('change', filterDevices);
    document.getElementById('deviceForm').addEventListener('submit', saveDevice);
}

// Load devices from API
async function loadDevices() {
    try {
        const data = await apiCall('/api/devices');
        allDevices = data.devices;

        // Update group filter options
        updateGroupFilter();

        // Apply current filters and display
        filterDevices();
    } catch (error) {
        showToast('Error loading devices: ' + error.message, 'error');
    }
}

// Load statistics
async function loadStats() {
    try {
        const data = await apiCall('/api/stats');
        const stats = data.stats;

        document.getElementById('stat-total').textContent = stats.total_devices;
        document.getElementById('stat-online').textContent = stats.online;
        document.getElementById('stat-offline').textContent = stats.offline;
        document.getElementById('stat-favorites').textContent = stats.favorites;
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Update group filter dropdown
function updateGroupFilter() {
    const groups = [...new Set(allDevices.map(d => d.group).filter(g => g))];
    const groupFilter = document.getElementById('groupFilter');
    const currentValue = groupFilter.value;

    groupFilter.innerHTML = '<option value="">All Groups</option>';
    groups.forEach(group => {
        const option = document.createElement('option');
        option.value = group;
        option.textContent = group;
        groupFilter.appendChild(option);
    });

    groupFilter.value = currentValue;
}

// Filter devices based on search and filters
function filterDevices() {
    const search = document.getElementById('searchInput').value.toLowerCase();
    const group = document.getElementById('groupFilter').value;
    const status = document.getElementById('statusFilter').value;
    const favoritesOnly = document.getElementById('favoritesOnly').checked;

    let filtered = allDevices.filter(device => {
        // Search filter
        if (search && !matchesSearch(device, search)) {
            return false;
        }

        // Group filter
        if (group && device.group !== group) {
            return false;
        }

        // Status filter
        if (status && device.status !== status) {
            return false;
        }

        // Favorites filter
        if (favoritesOnly && !device.is_favorite) {
            return false;
        }

        return true;
    });

    // Sort devices
    filtered.sort((a, b) => sortCompare(a, b, currentSort.field, currentSort.direction));

    // Display devices
    displayDevices(filtered);
}

// Check if device matches search term
function matchesSearch(device, search) {
    return (
        (device.ip && device.ip.toLowerCase().includes(search)) ||
        (device.hostname && device.hostname.toLowerCase().includes(search)) ||
        (device.mac && device.mac.toLowerCase().includes(search)) ||
        (device.nickname && device.nickname.toLowerCase().includes(search)) ||
        (device.vendor && device.vendor.toLowerCase().includes(search))
    );
}

// Sort devices
function sortDevices(field) {
    if (currentSort.field === field) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.field = field;
        currentSort.direction = 'asc';
    }

    filterDevices();
}

// Compare function for sorting
function sortCompare(a, b, field, direction) {
    let aVal = a[field] || '';
    let bVal = b[field] || '';

    // Handle status sorting (online > offline > unknown)
    if (field === 'status') {
        const statusOrder = { 'online': 0, 'offline': 1, 'unknown': 2 };
        aVal = statusOrder[aVal] || 3;
        bVal = statusOrder[bVal] || 3;
    }

    if (aVal < bVal) return direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return direction === 'asc' ? 1 : -1;
    return 0;
}

// Display devices in table
function displayDevices(devices) {
    const tbody = document.getElementById('devicesTable');
    const cards = document.getElementById('devicesCards');

    if (devices.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="px-6 py-4 text-center text-gray-400">
                    No devices found
                </td>
            </tr>
        `;
        cards.innerHTML = `
            <div class="text-center text-gray-400 py-4">
                No devices found
            </div>
        `;
        return;
    }

    // Desktop table view
    tbody.innerHTML = devices.map(device => `
        <tr class="hover:bg-dark-hover transition">
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="inline-block w-3 h-3 rounded-full ${device.status === 'online' ? 'bg-green-500' : 'bg-gray-500'}"
                      title="${device.status}">
                </span>
            </td>
            <td class="px-6 py-4">
                <div class="flex items-center">
                    ${device.is_favorite ? '<span class="text-yellow-400 mr-2">★</span>' : ''}
                    <div>
                        <div class="text-sm font-medium text-white">
                            ${device.nickname || device.hostname || '-'}
                        </div>
                    </div>
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                ${device.ip || '-'}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-300 font-mono">
                ${device.mac}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                ${device.vendor || 'Unknown'}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                ${device.group || '-'}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                ${device.last_seen ? formatDateTime(device.last_seen) : 'Never'}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                <button onclick="wakeDevice(${device.id})"
                        class="text-green-400 hover:text-green-300 transition"
                        title="Wake on LAN">
                    ⚡
                </button>
                <button onclick="scanDevicePorts(${device.id}, 'quick')"
                        class="text-purple-400 hover:text-purple-300 transition"
                        title="Scan Ports"
                        ${!device.ip ? 'disabled style="opacity:0.3"' : ''}>
                    🔍
                </button>
                <button onclick="toggleFavorite(${device.id}, ${!device.is_favorite})"
                        class="text-yellow-400 hover:text-yellow-300 transition"
                        title="Toggle favorite">
                    ${device.is_favorite ? '★' : '☆'}
                </button>
                <button onclick="showEditDeviceModal(${device.id})"
                        class="text-blue-400 hover:text-blue-300 transition"
                        title="Edit device">
                    ✏️
                </button>
                <button onclick="deleteDevice(${device.id})"
                        class="text-red-400 hover:text-red-300 transition"
                        title="Delete device">
                    🗑️
                </button>
            </td>
        </tr>
    `).join('');

    // Mobile card view
    cards.innerHTML = devices.map(device => `
        <div class="glass rounded-lg p-4 hover:glass-hover transition">
            <div class="flex items-start justify-between mb-3">
                <div class="flex items-center gap-2">
                    <span class="inline-block w-3 h-3 rounded-full ${device.status === 'online' ? 'bg-green-500' : 'bg-gray-500'}"
                          title="${device.status}">
                    </span>
                    ${device.is_favorite ? '<span class="text-yellow-400">★</span>' : ''}
                    <div class="text-base font-medium text-white">
                        ${device.nickname || device.hostname || '-'}
                    </div>
                </div>
                <div class="flex gap-3 text-lg">
                    <button onclick="wakeDevice(${device.id})"
                            class="text-green-400 active:text-green-300 transition"
                            title="Wake on LAN">
                        ⚡
                    </button>
                    <button onclick="scanDevicePorts(${device.id}, 'quick')"
                            class="text-purple-400 active:text-purple-300 transition"
                            title="Scan Ports"
                            ${!device.ip ? 'disabled style="opacity:0.3"' : ''}>
                        🔍
                    </button>
                    <button onclick="toggleFavorite(${device.id}, ${!device.is_favorite})"
                            class="text-yellow-400 active:text-yellow-300 transition"
                            title="Toggle favorite">
                        ${device.is_favorite ? '★' : '☆'}
                    </button>
                    <button onclick="showEditDeviceModal(${device.id})"
                            class="text-blue-400 active:text-blue-300 transition"
                            title="Edit device">
                        ✏️
                    </button>
                    <button onclick="deleteDevice(${device.id})"
                            class="text-red-400 active:text-red-300 transition"
                            title="Delete device">
                        🗑️
                    </button>
                </div>
            </div>
            <div class="space-y-2 text-sm">
                <div class="flex justify-between">
                    <span class="text-gray-400">IP:</span>
                    <span class="text-gray-300">${device.ip || '-'}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-400">MAC:</span>
                    <span class="text-gray-300 font-mono text-xs">${device.mac}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-400">Vendor:</span>
                    <span class="text-gray-300">${device.vendor || 'Unknown'}</span>
                </div>
                ${device.group ? `
                <div class="flex justify-between">
                    <span class="text-gray-400">Group:</span>
                    <span class="text-gray-300">${device.group}</span>
                </div>
                ` : ''}
                <div class="flex justify-between">
                    <span class="text-gray-400">Last Seen:</span>
                    <span class="text-gray-300">${device.last_seen ? formatDateTime(device.last_seen) : 'Never'}</span>
                </div>
            </div>
        </div>
    `).join('');
}

// Format datetime
function formatDateTime(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000); // seconds

    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;

    return date.toLocaleDateString();
}

// Trigger network scan
async function triggerScan() {
    const btn = document.getElementById('scanBtn');
    const btnText = document.getElementById('scanBtnText');

    btn.disabled = true;
    btnText.textContent = 'Scanning...';

    try {
        const data = await apiCall('/api/scan/now', { method: 'POST' });
        showToast(data.message, 'success');

        // Switch to fast refresh during scan
        startFastRefresh();

        // Poll for scan completion
        const pollInterval = setInterval(async () => {
            try {
                const status = await apiCall('/api/scan/status');
                if (!status.in_progress) {
                    clearInterval(pollInterval);
                    btn.disabled = false;
                    btnText.textContent = 'Scan Network';

                    // Do one final refresh
                    await loadDevices();
                    await loadStats();

                    // Switch back to normal refresh after scan completes
                    setTimeout(() => {
                        startNormalRefresh();
                    }, 5000); // Keep fast refresh for 5 more seconds

                    showToast('Scan completed', 'success');
                }
            } catch (error) {
                clearInterval(pollInterval);
                btn.disabled = false;
                btnText.textContent = 'Scan Network';
                startNormalRefresh(); // Return to normal refresh on error
            }
        }, 2000);

    } catch (error) {
        showToast('Error starting scan: ' + error.message, 'error');
        btn.disabled = false;
        btnText.textContent = 'Scan Network';
        startNormalRefresh(); // Return to normal refresh on error
    }
}

// Wake device
async function wakeDevice(deviceId) {
    try {
        const data = await apiCall(`/api/devices/${deviceId}/wol`, { method: 'POST' });
        if (data.success) {
            showToast('WOL packet sent successfully', 'success');
        } else {
            showToast('Failed to send WOL packet: ' + data.message, 'error');
        }
    } catch (error) {
        showToast('Error sending WOL packet: ' + error.message, 'error');
    }
}

// Toggle favorite
async function toggleFavorite(deviceId, isFavorite) {
    try {
        await apiCall(`/api/devices/${deviceId}`, {
            method: 'PUT',
            body: JSON.stringify({ is_favorite: isFavorite })
        });

        // Update local data
        const device = allDevices.find(d => d.id === deviceId);
        if (device) {
            device.is_favorite = isFavorite;
        }

        filterDevices();
        loadStats();
    } catch (error) {
        showToast('Error updating favorite: ' + error.message, 'error');
    }
}

// Show add device modal
function showAddDeviceModal() {
    document.getElementById('modalTitle').textContent = 'Add Device';
    document.getElementById('deviceForm').reset();
    document.getElementById('deviceId').value = '';
    document.getElementById('deviceMac').disabled = false;
    document.getElementById('deviceModal').classList.remove('hidden');
}

// Show edit device modal
function showEditDeviceModal(deviceId) {
    const device = allDevices.find(d => d.id === deviceId);
    if (!device) return;

    document.getElementById('modalTitle').textContent = 'Edit Device';
    document.getElementById('deviceId').value = device.id;
    document.getElementById('deviceMac').value = device.mac;
    document.getElementById('deviceMac').disabled = true;
    document.getElementById('deviceNickname').value = device.nickname || '';
    document.getElementById('deviceIp').value = device.ip || '';
    document.getElementById('deviceHostname').value = device.hostname || '';
    document.getElementById('deviceGroup').value = device.group || '';
    document.getElementById('deviceFavorite').checked = device.is_favorite;

    document.getElementById('deviceModal').classList.remove('hidden');
}

// Close device modal
function closeDeviceModal() {
    document.getElementById('deviceModal').classList.add('hidden');
}

// Save device (add or edit)
async function saveDevice(e) {
    e.preventDefault();

    const deviceId = document.getElementById('deviceId').value;
    const deviceData = {
        mac: document.getElementById('deviceMac').value,
        nickname: document.getElementById('deviceNickname').value || null,
        ip: document.getElementById('deviceIp').value || null,
        hostname: document.getElementById('deviceHostname').value || null,
        group: document.getElementById('deviceGroup').value || null,
        is_favorite: document.getElementById('deviceFavorite').checked
    };

    try {
        if (deviceId) {
            // Update existing device
            await apiCall(`/api/devices/${deviceId}`, {
                method: 'PUT',
                body: JSON.stringify(deviceData)
            });
            showToast('Device updated successfully', 'success');
        } else {
            // Add new device
            await apiCall('/api/devices', {
                method: 'POST',
                body: JSON.stringify(deviceData)
            });
            showToast('Device added successfully', 'success');
        }

        closeDeviceModal();
        loadDevices();
        loadStats();
    } catch (error) {
        showToast('Error saving device: ' + error.message, 'error');
    }
}

// Delete device
async function deleteDevice(deviceId) {
    if (!confirm('Are you sure you want to delete this device?')) {
        return;
    }

    try {
        await apiCall(`/api/devices/${deviceId}`, { method: 'DELETE' });
        showToast('Device deleted successfully', 'success');
        loadDevices();
        loadStats();
    } catch (error) {
        showToast('Error deleting device: ' + error.message, 'error');
    }
}

// Export devices
async function exportDevices() {
    try {
        const format = prompt('Export format (json or csv):', 'json');
        if (!format) return;

        const response = await fetch(`/api/devices/export?format=${format}`);
        const blob = await response.blob();

        // Create download link
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `devices.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        showToast('Devices exported successfully', 'success');
    } catch (error) {
        showToast('Error exporting devices: ' + error.message, 'error');
    }
}

// Scan device ports
async function scanDevicePorts(deviceId, scanType = 'quick') {
    const device = allDevices.find(d => d.id === deviceId);
    if (!device) return;

    if (!device.ip) {
        showToast('Device has no IP address', 'error');
        return;
    }

    try {
        showToast(`Scanning ports on ${device.nickname || device.hostname || device.mac}...`, 'info');

        const data = await apiCall(`/api/devices/${deviceId}/ports/scan`, {
            method: 'POST',
            body: JSON.stringify({ scan_type: scanType })
        });

        showToast(data.message, 'success');
        showPortScanResults(device, data.ports, data.device_type);
    } catch (error) {
        showToast('Error scanning ports: ' + error.message, 'error');
    }
}

// Show port scan results modal
function showPortScanResults(device, ports, deviceType) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.id = 'portScanModal';

    const deviceName = device.nickname || device.hostname || device.mac;

    modal.innerHTML = `
        <div class="glass rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div class="flex justify-between items-start mb-4">
                <div>
                    <h3 class="text-xl font-bold text-white">Port Scan Results</h3>
                    <p class="text-gray-400 text-sm mt-1">${deviceName} (${device.ip})</p>
                    ${deviceType !== 'unknown' ? `<p class="text-blue-400 text-sm mt-1">Detected: ${deviceType.replace('_', ' ').toUpperCase()}</p>` : ''}
                </div>
                <button onclick="closePortScanModal()" class="text-gray-400 hover:text-white text-2xl">&times;</button>
            </div>

            ${ports.length === 0 ? `
                <div class="text-center text-gray-400 py-8">
                    No open ports found
                </div>
            ` : `
                <div class="space-y-2">
                    ${ports.map(port => `
                        <div class="glass-input rounded-lg p-3 flex justify-between items-center">
                            <div>
                                <div class="text-white font-medium">Port ${port.port}/${port.protocol}</div>
                                <div class="text-gray-400 text-sm">${port.service}</div>
                            </div>
                            <span class="px-3 py-1 bg-green-900/30 text-green-400 rounded-full text-sm">${port.state}</span>
                        </div>
                    `).join('')}
                </div>
            `}

            <div class="mt-6 flex gap-3">
                <button onclick="scanDevicePorts(${device.id}, 'full')"
                        class="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition">
                    Run Full Scan
                </button>
                <button onclick="closePortScanModal()"
                        class="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition">
                    Close
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

// Close port scan modal
function closePortScanModal() {
    const modal = document.getElementById('portScanModal');
    if (modal) {
        document.body.removeChild(modal);
    }
}
