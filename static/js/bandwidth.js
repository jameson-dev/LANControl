/**
 * Bandwidth Monitoring Dashboard
 */

let topUsersChart = null;
let bandwidthTimeChart = null;
let deviceBandwidthChart = null;
let currentTimeRange = 24; // hours
let bandwidthData = [];
let sortColumn = 'total';
let sortDirection = 'desc';

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    initializeCharts();
    loadBandwidthData();

    // Auto-refresh every 5 minutes
    setInterval(loadBandwidthData, 300000);
});

/**
 * Initialize Chart.js charts
 */
function initializeCharts() {
    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                labels: {
                    color: '#e5e7eb'
                }
            }
        },
        scales: {
            y: {
                ticks: { color: '#9ca3af' },
                grid: { color: 'rgba(255, 255, 255, 0.1)' }
            },
            x: {
                ticks: { color: '#9ca3af' },
                grid: { color: 'rgba(255, 255, 255, 0.1)' }
            }
        }
    };

    // Top Users Chart
    const topUsersCtx = document.getElementById('topUsersChart').getContext('2d');
    topUsersChart = new Chart(topUsersCtx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: 'Total Bandwidth (MB)',
                data: [],
                backgroundColor: 'rgba(59, 130, 246, 0.6)',
                borderColor: 'rgba(59, 130, 246, 1)',
                borderWidth: 1
            }]
        },
        options: {
            ...chartOptions,
            indexAxis: 'y',
            plugins: {
                ...chartOptions.plugins,
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.parsed.x.toFixed(2)} MB`;
                        }
                    }
                }
            }
        }
    });

    // Bandwidth Over Time Chart
    const bandwidthTimeCtx = document.getElementById('bandwidthTimeChart').getContext('2d');
    bandwidthTimeChart = new Chart(bandwidthTimeCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Sent',
                    data: [],
                    borderColor: 'rgba(59, 130, 246, 1)',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'Received',
                    data: [],
                    borderColor: 'rgba(16, 185, 129, 1)',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    tension: 0.4,
                    fill: true
                }
            ]
        },
        options: {
            ...chartOptions,
            plugins: {
                ...chartOptions.plugins,
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${context.parsed.y.toFixed(2)} MB`;
                        }
                    }
                }
            }
        }
    });
}

/**
 * Load bandwidth data from API
 */
async function loadBandwidthData() {
    try {
        const data = await apiCall(`/api/bandwidth/top?hours=${currentTimeRange}`);
        bandwidthData = data.devices || [];

        renderTopUsers(bandwidthData);
        renderBandwidthTable(bandwidthData);
        await loadNetworkTotal();
    } catch (error) {
        console.error('Error loading bandwidth data:', error);
        showToast('Failed to load bandwidth data', 'error');
    }
}

/**
 * Load network-wide total bandwidth
 */
async function loadNetworkTotal() {
    try {
        const data = await apiCall(`/api/bandwidth/total?hours=${currentTimeRange}`);

        // Update stats
        document.getElementById('stat-sent').textContent = formatBytes(data.total_sent);
        document.getElementById('stat-received').textContent = formatBytes(data.total_received);
        document.getElementById('stat-connections').textContent = data.active_connections || 0;
        document.getElementById('stat-updated').textContent = data.last_updated ?
            new Date(data.last_updated).toLocaleTimeString() : 'N/A';

        // Update time chart
        if (data.timeline) {
            bandwidthTimeChart.data.labels = data.timeline.map(t =>
                new Date(t.timestamp).toLocaleTimeString()
            );
            bandwidthTimeChart.data.datasets[0].data = data.timeline.map(t =>
                t.bytes_sent / (1024 * 1024)
            );
            bandwidthTimeChart.data.datasets[1].data = data.timeline.map(t =>
                t.bytes_received / (1024 * 1024)
            );
            bandwidthTimeChart.update();
        }
    } catch (error) {
        console.error('Error loading network total:', error);
    }
}

/**
 * Render top users chart
 */
function renderTopUsers(devices) {
    const top10 = devices.slice(0, 10);

    topUsersChart.data.labels = top10.map(d => d.name);
    topUsersChart.data.datasets[0].data = top10.map(d =>
        (d.bytes_sent + d.bytes_received) / (1024 * 1024)
    );
    topUsersChart.update();
}

/**
 * Render bandwidth table
 */
function renderBandwidthTable(devices) {
    const tbody = document.getElementById('bandwidthTable');

    if (devices.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="px-4 py-4 text-center text-gray-400">
                    No bandwidth data available. Data collection runs every 5 minutes.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = devices.map(device => {
        const sent = device.bytes_sent || 0;
        const received = device.bytes_received || 0;
        const total = sent + received;
        const avgSpeed = device.avg_speed || 0;

        return `
            <tr class="hover:bg-white/5 transition">
                <td class="px-4 py-3 whitespace-nowrap">
                    <div class="text-white font-medium">${device.name}</div>
                    <div class="text-gray-400 text-sm">${device.ip || 'N/A'}</div>
                </td>
                <td class="px-4 py-3 whitespace-nowrap text-blue-400">
                    ${formatBytes(sent)}
                </td>
                <td class="px-4 py-3 whitespace-nowrap text-green-400">
                    ${formatBytes(received)}
                </td>
                <td class="px-4 py-3 whitespace-nowrap text-white font-medium">
                    ${formatBytes(total)}
                </td>
                <td class="px-4 py-3 whitespace-nowrap text-gray-300">
                    ${formatSpeed(avgSpeed)}
                </td>
                <td class="px-4 py-3 whitespace-nowrap text-right">
                    <button onclick="showDeviceBandwidth(${device.id})"
                            class="px-3 py-1 glass hover:glass-hover bg-blue-600/20 hover:bg-blue-600/30 text-white rounded text-sm transition">
                        View Details
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * Show device-specific bandwidth details
 */
async function showDeviceBandwidth(deviceId) {
    try {
        const data = await apiCall(`/api/bandwidth/device/${deviceId}?hours=${currentTimeRange}`);
        const device = data.device;
        const bandwidth = data.bandwidth || [];

        document.getElementById('modalDeviceName').textContent =
            device.nickname || device.hostname || device.ip;

        // Update device chart
        if (!deviceBandwidthChart) {
            const ctx = document.getElementById('deviceBandwidthChart').getContext('2d');
            deviceBandwidthChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [
                        {
                            label: 'Sent (MB)',
                            data: [],
                            borderColor: 'rgba(59, 130, 246, 1)',
                            backgroundColor: 'rgba(59, 130, 246, 0.1)',
                            tension: 0.4,
                            fill: true
                        },
                        {
                            label: 'Received (MB)',
                            data: [],
                            borderColor: 'rgba(16, 185, 129, 1)',
                            backgroundColor: 'rgba(16, 185, 129, 0.1)',
                            tension: 0.4,
                            fill: true
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            labels: { color: '#e5e7eb' }
                        }
                    },
                    scales: {
                        y: {
                            ticks: { color: '#9ca3af' },
                            grid: { color: 'rgba(255, 255, 255, 0.1)' }
                        },
                        x: {
                            ticks: { color: '#9ca3af' },
                            grid: { color: 'rgba(255, 255, 255, 0.1)' }
                        }
                    }
                }
            });
        }

        deviceBandwidthChart.data.labels = bandwidth.map(b =>
            new Date(b.timestamp).toLocaleTimeString()
        );
        deviceBandwidthChart.data.datasets[0].data = bandwidth.map(b =>
            b.bytes_sent / (1024 * 1024)
        );
        deviceBandwidthChart.data.datasets[1].data = bandwidth.map(b =>
            b.bytes_received / (1024 * 1024)
        );
        deviceBandwidthChart.update();

        // Update stats
        const totalSent = bandwidth.reduce((sum, b) => sum + b.bytes_sent, 0);
        const totalReceived = bandwidth.reduce((sum, b) => sum + b.bytes_received, 0);

        document.getElementById('deviceBandwidthStats').innerHTML = `
            <div class="glass rounded-lg p-4">
                <div class="text-gray-400 text-sm">Total Sent</div>
                <div class="text-2xl font-bold text-blue-400 mt-1">${formatBytes(totalSent)}</div>
            </div>
            <div class="glass rounded-lg p-4">
                <div class="text-gray-400 text-sm">Total Received</div>
                <div class="text-2xl font-bold text-green-400 mt-1">${formatBytes(totalReceived)}</div>
            </div>
        `;

        document.getElementById('bandwidthModal').classList.remove('hidden');
    } catch (error) {
        console.error('Error loading device bandwidth:', error);
        showToast('Failed to load device bandwidth', 'error');
    }
}

/**
 * Close bandwidth detail modal
 */
function closeBandwidthModal() {
    document.getElementById('bandwidthModal').classList.add('hidden');
}

/**
 * Change time range
 */
function changeTimeRange(hours) {
    currentTimeRange = hours;

    // Update active button
    document.querySelectorAll('.time-range-btn').forEach(btn => {
        btn.classList.remove('active', 'bg-blue-600/30');
    });
    event.target.classList.add('active', 'bg-blue-600/30');

    loadBandwidthData();
}

/**
 * Trigger bandwidth collection
 */
async function collectBandwidth() {
    const btn = document.getElementById('collectBtn');
    const btnText = document.getElementById('collectBtnText');

    btn.disabled = true;
    btnText.textContent = 'Collecting...';

    try {
        await apiCall('/api/bandwidth/collect', { method: 'POST' });
        showToast('Bandwidth collection started', 'success');

        // Reload data after a delay
        setTimeout(() => {
            loadBandwidthData();
        }, 3000);
    } catch (error) {
        console.error('Error collecting bandwidth:', error);
        showToast('Failed to collect bandwidth', 'error');
    } finally {
        btn.disabled = false;
        btnText.textContent = 'Collect Now';
    }
}

/**
 * Refresh all data
 */
function refreshData() {
    loadBandwidthData();
    showToast('Data refreshed', 'success');
}

/**
 * Export bandwidth data as CSV
 */
function exportBandwidthData() {
    if (bandwidthData.length === 0) {
        showToast('No data to export', 'warning');
        return;
    }

    const headers = ['Device', 'IP', 'Data Sent (MB)', 'Data Received (MB)', 'Total (MB)'];
    const rows = bandwidthData.map(d => [
        d.name,
        d.ip || 'N/A',
        (d.bytes_sent / (1024 * 1024)).toFixed(2),
        (d.bytes_received / (1024 * 1024)).toFixed(2),
        ((d.bytes_sent + d.bytes_received) / (1024 * 1024)).toFixed(2)
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `bandwidth-${new Date().toISOString().slice(0,10)}.csv`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);

    showToast('Bandwidth data exported', 'success');
}

/**
 * Filter device table
 */
function filterDeviceTable() {
    const search = document.getElementById('deviceSearch').value.toLowerCase();
    const rows = document.querySelectorAll('#bandwidthTable tr');

    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(search) ? '' : 'none';
    });
}

/**
 * Sort bandwidth table
 */
function sortBandwidthTable(column) {
    if (sortColumn === column) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortColumn = column;
        sortDirection = 'desc';
    }

    const sorted = [...bandwidthData].sort((a, b) => {
        let aVal, bVal;

        switch (column) {
            case 'name':
                aVal = a.name.toLowerCase();
                bVal = b.name.toLowerCase();
                break;
            case 'sent':
                aVal = a.bytes_sent;
                bVal = b.bytes_sent;
                break;
            case 'received':
                aVal = a.bytes_received;
                bVal = b.bytes_received;
                break;
            case 'total':
                aVal = a.bytes_sent + a.bytes_received;
                bVal = b.bytes_sent + b.bytes_received;
                break;
            default:
                return 0;
        }

        if (sortDirection === 'asc') {
            return aVal > bVal ? 1 : -1;
        } else {
            return aVal < bVal ? 1 : -1;
        }
    });

    renderBandwidthTable(sorted);
}

/**
 * Format bytes to human-readable
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format speed to human-readable
 */
function formatSpeed(bytesPerSec) {
    return formatBytes(bytesPerSec) + '/s';
}
