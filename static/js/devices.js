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
        // Check if this is truly empty or just filtered
        const isFiltered = document.getElementById('searchInput').value ||
                          document.getElementById('groupFilter').value ||
                          document.getElementById('statusFilter').value ||
                          document.getElementById('favoritesOnly').checked;

        const emptyMessage = isFiltered ?
            'No devices match your filters' :
            allDevices.length === 0 ?
                `<div class="text-center py-8">
                    <svg class="w-16 h-16 mx-auto text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
                    </svg>
                    <h3 class="text-lg font-medium text-white mb-2">No Devices Yet</h3>
                    <p class="text-gray-400 mb-4">Get started by scanning your network or manually adding devices</p>
                    <div class="flex gap-3 justify-center">
                        <button onclick="triggerScan()" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition">
                            Scan Network
                        </button>
                        <button onclick="showAddDevice()" class="px-4 py-2 glass hover:glass-hover text-white rounded-lg font-medium transition">
                            Add Manually
                        </button>
                    </div>
                </div>` :
                'No devices match your filters';

        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="px-6 py-4 text-center text-gray-400">
                    ${emptyMessage}
                </td>
            </tr>
        `;
        cards.innerHTML = `
            <div class="text-center text-gray-400 py-4">
                ${emptyMessage}
            </div>
        `;
        return;
    }

    // Desktop table view
    tbody.innerHTML = devices.map(device => `
        <tr class="hover:bg-white/5 transition cursor-pointer ${device.is_favorite ? 'bg-yellow-500/5 border-l-2 border-yellow-500/50' : ''}" data-device-id="${device.id}">
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="inline-block w-3 h-3 rounded-full ${device.status === 'online' ? 'bg-green-500' : 'bg-gray-500'}"
                      title="${device.status}">
                </span>
            </td>
            <td class="px-6 py-4">
                <div class="text-sm font-medium text-white">
                    ${device.nickname || device.hostname || '-'}
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
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <button class="action-toggle text-gray-400 hover:text-white transition p-2 rounded-lg hover:bg-white/10"
                        onclick="showActionSheet(${device.id})"
                        title="Actions">
                    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"/>
                    </svg>
                </button>
            </td>
        </tr>
    `).join('');

    // Mobile card view
    cards.innerHTML = devices.map(device => `
        <div class="device-card glass rounded-lg p-4 hover:glass-hover transition cursor-pointer ${device.is_favorite ? 'bg-yellow-500/5 border-l-4 border-yellow-500/50' : ''}" data-device-id="${device.id}">
            <div class="flex items-start justify-between mb-3">
                <div class="flex items-center gap-2">
                    <span class="inline-block w-3 h-3 rounded-full ${device.status === 'online' ? 'bg-green-500' : 'bg-gray-500'}"
                          title="${device.status}">
                    </span>
                    <div class="text-base font-medium text-white">
                        ${device.nickname || device.hostname || '-'}
                    </div>
                </div>
                <button class="action-toggle text-gray-400 hover:text-white active:text-white transition p-2 rounded-lg hover:bg-white/10 active:bg-white/20"
                        onclick="showActionSheet(${device.id})"
                        title="Actions">
                    <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"/>
                    </svg>
                </button>
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
    btn.dataset.loadingText = 'Scanning...';
    setButtonLoading(btn, true);

    try {
        const data = await apiCall('/api/scan/now', { method: 'POST' });
        showToast('Network scan started', 'success');

        // Switch to fast refresh during scan
        startFastRefresh();

        let devicesFound = 0;

        // Poll for scan completion
        const pollInterval = setInterval(async () => {
            try {
                const status = await apiCall('/api/scan/status');

                // Update button with progress
                if (status.in_progress) {
                    const newCount = allDevices.filter(d => d.last_seen).length;
                    if (newCount > devicesFound) {
                        devicesFound = newCount;
                        btn.querySelector('span').textContent = `Scanning... (${devicesFound} found)`;
                    }
                }

                if (!status.in_progress) {
                    clearInterval(pollInterval);
                    setButtonLoading(btn, false);

                    // Do one final refresh
                    await loadDevices();
                    await loadStats();

                    // Switch back to normal refresh after scan completes
                    setTimeout(() => {
                        startNormalRefresh();
                    }, 5000); // Keep fast refresh for 5 more seconds

                    showToast(`Scan completed! Found ${devicesFound} device${devicesFound !== 1 ? 's' : ''}`, 'success');
                }
            } catch (error) {
                clearInterval(pollInterval);
                setButtonLoading(btn, false);
                startNormalRefresh(); // Return to normal refresh on error
            }
        }, 2000);

    } catch (error) {
        showToast('Error starting scan: ' + error.message, 'error');
        setButtonLoading(btn, false);
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
    document.getElementById('deviceType').value = device.device_type || '';
    document.getElementById('deviceFavorite').checked = device.is_favorite;

    // Switch to overview tab by default
    switchTabByName('overview');

    document.getElementById('deviceModal').classList.remove('hidden');
}

// Close device modal
function closeDeviceModal() {
    document.getElementById('deviceModal').classList.add('hidden');
}

// Save device (add or edit)
async function saveDevice(e) {
    e.preventDefault();

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.dataset.loadingText = 'Saving...';
    setButtonLoading(submitBtn, true);

    const deviceId = document.getElementById('deviceId').value;
    const deviceData = {
        mac: document.getElementById('deviceMac').value,
        nickname: document.getElementById('deviceNickname').value || null,
        ip: document.getElementById('deviceIp').value || null,
        hostname: document.getElementById('deviceHostname').value || null,
        group: document.getElementById('deviceGroup').value || null,
        device_type: document.getElementById('deviceType').value || null,
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
    } finally {
        setButtonLoading(submitBtn, false);
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

// Show action sheet for device
function showActionSheet(deviceId) {
    const device = allDevices.find(d => d.id === deviceId);
    if (!device) return;

    // Close any existing action sheet
    closeActionSheet();

    const deviceName = device.nickname || device.hostname || device.mac;

    // Create overlay
    const overlay = document.createElement('div');
    overlay.id = 'actionSheetOverlay';
    overlay.className = 'action-sheet-overlay';
    overlay.onclick = closeActionSheet;

    // Create action sheet
    const sheet = document.createElement('div');
    sheet.id = 'actionSheet';
    sheet.className = 'action-sheet';
    sheet.onclick = (e) => e.stopPropagation();

    sheet.innerHTML = `
        <div class="p-6">
            <!-- Header -->
            <div class="flex items-start justify-between mb-6">
                <div class="flex-1 min-w-0">
                    <h3 class="text-lg font-semibold text-white truncate">${deviceName}</h3>
                    <p class="text-sm text-gray-400 mt-1">
                        ${device.ip || 'No IP'} • ${device.status === 'online' ? '🟢 Online' : '⚫ Offline'}
                    </p>
                </div>
                <button onclick="closeActionSheet()" class="text-gray-400 hover:text-white ml-4 flex-shrink-0">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                </button>
            </div>

            <!-- Actions -->
            <div class="space-y-2">
                <button onclick="wakeDevice(${device.id}); closeActionSheet();"
                        class="action-menu-item w-full text-left px-4 py-3 rounded-lg text-white flex items-center gap-3">
                    <svg class="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                    </svg>
                    <span>Wake on LAN</span>
                </button>

                <button onclick="scanDevicePorts(${device.id}, 'quick'); closeActionSheet();"
                        class="action-menu-item w-full text-left px-4 py-3 rounded-lg text-white flex items-center gap-3 ${!device.ip ? 'opacity-50 cursor-not-allowed' : ''}"
                        ${!device.ip ? 'disabled' : ''}>
                    <svg class="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                    </svg>
                    <span>Scan Ports</span>
                </button>

                <button onclick="toggleFavorite(${device.id}, ${!device.is_favorite}); closeActionSheet();"
                        class="action-menu-item w-full text-left px-4 py-3 rounded-lg text-white flex items-center gap-3">
                    <svg class="w-5 h-5 text-yellow-400" fill="${device.is_favorite ? 'currentColor' : 'none'}" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>
                    </svg>
                    <span>${device.is_favorite ? 'Remove from Favorites' : 'Add to Favorites'}</span>
                </button>

                <div class="border-t border-white/10 my-2"></div>

                <button onclick="showEditDeviceModal(${device.id}); closeActionSheet();"
                        class="action-menu-item w-full text-left px-4 py-3 rounded-lg text-white flex items-center gap-3">
                    <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                    </svg>
                    <span>Edit Device</span>
                </button>

                <button onclick="deleteDevice(${device.id}); closeActionSheet();"
                        class="action-menu-item w-full text-left px-4 py-3 rounded-lg text-red-400 flex items-center gap-3">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                    <span>Delete Device</span>
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(sheet);

    // Trigger animation
    requestAnimationFrame(() => {
        overlay.classList.add('show');
        sheet.classList.add('show');
    });

    // Prevent body scrolling when action sheet is open
    document.body.style.overflow = 'hidden';
}

// Close action sheet
function closeActionSheet() {
    const overlay = document.getElementById('actionSheetOverlay');
    const sheet = document.getElementById('actionSheet');

    if (overlay && sheet) {
        overlay.classList.remove('show');
        sheet.classList.remove('show');

        setTimeout(() => {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            if (sheet.parentNode) sheet.parentNode.removeChild(sheet);
        }, 300);
    }

    // Restore body scrolling
    document.body.style.overflow = '';
}

// Close action sheet on escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeActionSheet();
    }
});

// Context menu functionality (right-click) - now uses action sheet
document.addEventListener('contextmenu', function(event) {
    const row = event.target.closest('tr[data-device-id]');
    const card = event.target.closest('.device-card[data-device-id]');

    if (row || card) {
        event.preventDefault();
        const deviceId = parseInt((row || card).getAttribute('data-device-id'));
        showActionSheet(deviceId);
    }
});

// Notes character counter
document.addEventListener('DOMContentLoaded', function() {
    const notesTextarea = document.getElementById('deviceNotes');
    if (notesTextarea) {
        notesTextarea.addEventListener('input', function() {
            document.getElementById('notesCharCount').textContent = `${this.value.length} characters`;
        });
    }
});

/**
 * V3 Features - Tab Management
 */

// Switch between tabs in device modal
function switchTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.add('hidden');
    });

    // Remove active from all tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active', 'border-blue-500', 'text-white');
        btn.classList.add('text-gray-400', 'border-transparent');
    });

    // Show selected tab
    document.getElementById(`${tabName}Tab`).classList.remove('hidden');

    // Mark button as active
    event.target.classList.add('active', 'border-blue-500', 'text-white');
    event.target.classList.remove('text-gray-400', 'border-transparent');

    // Load content for the tab
    const deviceId = document.getElementById('deviceId').value;
    if (deviceId) {
        if (tabName === 'notes') {
            loadDeviceNotes(deviceId);
        } else if (tabName === 'ports') {
            loadDevicePorts(deviceId);
        }
    }
}

// Programmatic tab switching (for modal initialization)
function switchTabByName(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.add('hidden');
    });

    // Remove active from all tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active', 'border-blue-500', 'text-white');
        btn.classList.add('text-gray-400', 'border-transparent');
    });

    // Show selected tab
    const targetTab = document.getElementById(`${tabName}Tab`);
    if (targetTab) {
        targetTab.classList.remove('hidden');
    }

    // Mark corresponding button as active
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(btn => {
        if (btn.getAttribute('onclick')?.includes(tabName)) {
            btn.classList.add('active', 'border-blue-500', 'text-white');
            btn.classList.remove('text-gray-400', 'border-transparent');
        }
    });
}

// Load device notes from API
async function loadDeviceNotes(deviceId) {
    try {
        const data = await apiCall(`/api/devices/${deviceId}`);
        const device = data.device;

        document.getElementById('deviceNotes').value = device.notes || '';
        document.getElementById('devicePurchaseDate').value = device.purchase_date || '';
        document.getElementById('deviceWarrantyUntil').value = device.warranty_until || '';
        document.getElementById('notesCharCount').textContent = `${(device.notes || '').length} characters`;
    } catch (error) {
        console.error('Error loading device notes:', error);
    }
}

// Save device notes
async function saveDeviceNotes() {
    const deviceId = document.getElementById('deviceId').value;
    if (!deviceId) return;

    const notesData = {
        notes: document.getElementById('deviceNotes').value,
        purchase_date: document.getElementById('devicePurchaseDate').value || null,
        warranty_until: document.getElementById('deviceWarrantyUntil').value || null,
        device_type: document.getElementById('deviceType').value || null
    };

    try {
        await apiCall(`/api/devices/${deviceId}/notes`, {
            method: 'PUT',
            body: JSON.stringify(notesData)
        });
        showToast('Notes saved successfully', 'success');
    } catch (error) {
        showToast('Error saving notes: ' + error.message, 'error');
    }
}

// Load device ports from API
async function loadDevicePorts(deviceId) {
    try {
        const data = await apiCall(`/api/devices/${deviceId}/ports`);
        const ports = data.ports || [];

        const portsContent = document.getElementById('portsContent');

        if (ports.length === 0) {
            portsContent.innerHTML = `
                <div class="text-gray-400 text-center py-8">
                    No port scan data available. Click a button above to scan.
                </div>
            `;
            return;
        }

        portsContent.innerHTML = `
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
        `;
    } catch (error) {
        console.error('Error loading ports:', error);
        document.getElementById('portsContent').innerHTML = `
            <div class="text-red-400 text-center py-8">
                Error loading port data
            </div>
        `;
    }
}

// Scan device ports from modal
async function scanDevicePortsInModal(scanType) {
    const deviceId = document.getElementById('deviceId').value;
    if (!deviceId) return;

    const device = allDevices.find(d => d.id == deviceId);
    if (!device || !device.ip) {
        showToast('Device has no IP address', 'error');
        return;
    }

    document.getElementById('portsContent').innerHTML = `
        <div class="text-blue-400 text-center py-8">
            <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
            <div class="mt-2">Scanning ports...</div>
        </div>
    `;

    try {
        const data = await apiCall(`/api/devices/${deviceId}/ports/scan`, {
            method: 'POST',
            body: JSON.stringify({ scan_type: scanType })
        });

        showToast(data.message, 'success');
        loadDevicePorts(deviceId);
    } catch (error) {
        showToast('Error scanning ports: ' + error.message, 'error');
        document.getElementById('portsContent').innerHTML = `
            <div class="text-red-400 text-center py-8">
                Error scanning ports
            </div>
        `;
    }
}
