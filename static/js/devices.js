// Global variables
let allDevices = [];
let currentSort = { field: 'nickname', direction: 'asc' };

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    loadDevices();
    loadStats();
    setupEventListeners();

    // Auto-refresh every 30 seconds
    setInterval(() => {
        loadDevices();
        loadStats();
    }, 30000);
});

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

    if (devices.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="px-6 py-4 text-center text-gray-400">
                    No devices found
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = devices.map(device => `
        <tr class="hover:bg-dark-hover transition">
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium status-${device.status}">
                    ${device.status}
                </span>
            </td>
            <td class="px-6 py-4">
                <div class="flex items-center">
                    ${device.is_favorite ? '<span class="text-yellow-400 mr-2">★</span>' : ''}
                    <div>
                        <div class="text-sm font-medium text-white">
                            ${device.nickname || device.hostname || 'Unknown'}
                        </div>
                        ${device.nickname && device.hostname ? `<div class="text-xs text-gray-400">${device.hostname}</div>` : ''}
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
                        class="text-green-400 hover:text-green-300"
                        title="Wake on LAN">
                    Wake
                </button>
                <button onclick="toggleFavorite(${device.id}, ${!device.is_favorite})"
                        class="text-yellow-400 hover:text-yellow-300"
                        title="Toggle favorite">
                    ${device.is_favorite ? '★' : '☆'}
                </button>
                <button onclick="showEditDeviceModal(${device.id})"
                        class="text-blue-400 hover:text-blue-300"
                        title="Edit">
                    Edit
                </button>
                <button onclick="deleteDevice(${device.id})"
                        class="text-red-400 hover:text-red-300"
                        title="Delete">
                    Delete
                </button>
            </td>
        </tr>
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

        // Poll for scan completion
        const pollInterval = setInterval(async () => {
            try {
                const status = await apiCall('/api/scan/status');
                if (!status.in_progress) {
                    clearInterval(pollInterval);
                    btn.disabled = false;
                    btnText.textContent = 'Scan Network';
                    loadDevices();
                    loadStats();
                    showToast('Scan completed', 'success');
                }
            } catch (error) {
                clearInterval(pollInterval);
                btn.disabled = false;
                btnText.textContent = 'Scan Network';
            }
        }, 2000);

    } catch (error) {
        showToast('Error starting scan: ' + error.message, 'error');
        btn.disabled = false;
        btnText.textContent = 'Scan Network';
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
