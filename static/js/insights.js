/**
 * Device Insights and Network Statistics Dashboard
 */

let activityChart = null;
let deviceUptimeChart = null;
let currentTimeRange = 24; // hours
let selectedDeviceId = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    initializeCharts();
    loadNetworkInsights();
    loadTopDevices();

    // Auto-refresh every 5 minutes
    setInterval(loadNetworkInsights, 300000);
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

    // Network Activity Chart
    const activityCtx = document.getElementById('activityChart').getContext('2d');
    activityChart = new Chart(activityCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Active Devices',
                data: [],
                borderColor: 'rgba(59, 130, 246, 1)',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: chartOptions
    });
}

/**
 * Load network-wide insights
 */
async function loadNetworkInsights() {
    try {
        const data = await apiCall(`/api/insights/network?hours=${currentTimeRange}`);

        // Update statistics cards
        document.getElementById('stat-total-devices').textContent = data.stats.total_devices;
        document.getElementById('stat-online-devices').textContent = data.stats.online_devices;
        document.getElementById('stat-offline-devices').textContent = data.stats.offline_devices;
        document.getElementById('stat-status-changes').textContent = data.stats.status_changes;
        document.getElementById('stat-new-devices').textContent = data.stats.new_devices;

        // Update activity chart
        if (data.timeline && data.timeline.length > 0) {
            activityChart.data.labels = data.timeline.map(t => {
                const date = new Date(t.timestamp);
                return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            });
            activityChart.data.datasets[0].data = data.timeline.map(t => t.active_count);
            activityChart.update();
        }

        // Update last updated time
        document.getElementById('stat-last-updated').textContent =
            new Date().toLocaleTimeString();

    } catch (error) {
        console.error('Error loading network insights:', error);
        showToast('Failed to load network insights', 'error');
    }
}

/**
 * Load top devices by various metrics
 */
async function loadTopDevices() {
    try {
        const data = await apiCall(`/api/insights/top-devices?hours=${currentTimeRange}`);

        // Render most active devices
        renderTopDevicesList('mostActiveList', data.most_active, 'change_count', 'status changes');

        // Render devices with most ports
        renderTopDevicesList('mostPortsList', data.most_ports, 'port_count', 'open ports');

    } catch (error) {
        console.error('Error loading top devices:', error);
    }
}

/**
 * Render a list of top devices
 */
function renderTopDevicesList(elementId, devices, metricKey, metricLabel) {
    const container = document.getElementById(elementId);

    if (!devices || devices.length === 0) {
        container.innerHTML = `
            <div class="text-center py-4">
                <div class="text-gray-400 text-sm mb-1">No data yet</div>
                <div class="text-gray-500 text-xs">Data will appear as devices are monitored</div>
            </div>`;
        return;
    }

    container.innerHTML = devices.slice(0, 5).map((item, index) => {
        const device = item.device;
        const metricValue = item[metricKey];
        const name = device.nickname || device.hostname || device.ip || 'Unknown';

        return `
            <div class="flex items-center justify-between py-2 hover:bg-white/5 rounded px-2 transition cursor-pointer"
                 onclick="showDeviceDetails(${device.id})">
                <div class="flex items-center gap-3">
                    <div class="text-gray-400 font-mono text-sm w-4">${index + 1}</div>
                    <div>
                        <div class="text-white font-medium text-sm">${name}</div>
                        <div class="text-gray-400 text-xs">${device.ip || 'N/A'}</div>
                    </div>
                </div>
                <div class="text-blue-400 font-medium text-sm">
                    ${metricValue} ${metricLabel}
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Show detailed device insights
 */
async function showDeviceDetails(deviceId) {
    selectedDeviceId = deviceId;

    try {
        const data = await apiCall(`/api/insights/device/${deviceId}?hours=168`);
        const device = data.device;

        // Update modal content
        document.getElementById('modalDeviceName').textContent =
            device.nickname || device.hostname || device.ip || 'Unknown Device';

        // Update uptime percentage
        document.getElementById('deviceUptime').textContent =
            `${data.uptime_percentage}% uptime`;

        // Update device info
        document.getElementById('deviceInfo').innerHTML = `
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <div class="text-gray-400 text-sm">IP Address</div>
                    <div class="text-white font-medium">${device.ip || 'N/A'}</div>
                </div>
                <div>
                    <div class="text-gray-400 text-sm">MAC Address</div>
                    <div class="text-white font-mono text-xs">${device.mac}</div>
                </div>
                <div>
                    <div class="text-gray-400 text-sm">Status</div>
                    <div>
                        <span class="px-2 py-1 rounded text-xs ${
                            device.status === 'online' ? 'bg-green-600' :
                            device.status === 'offline' ? 'bg-red-600' : 'bg-gray-600'
                        }">${device.status}</span>
                    </div>
                </div>
                <div>
                    <div class="text-gray-400 text-sm">Vendor</div>
                    <div class="text-white text-sm">${device.vendor || 'Unknown'}</div>
                </div>
                <div>
                    <div class="text-gray-400 text-sm">Device Type</div>
                    <div class="text-white text-sm">${device.device_type || 'Unknown'}</div>
                </div>
                <div>
                    <div class="text-gray-400 text-sm">Last Seen</div>
                    <div class="text-white text-sm">
                        ${device.last_seen ? new Date(device.last_seen).toLocaleString() : 'Never'}
                    </div>
                </div>
            </div>
        `;

        // Render device uptime chart
        renderDeviceUptimeChart(data.history);

        // Render open ports
        renderDevicePorts(data.ports);

        // Render recent alerts
        renderDeviceAlerts(data.alerts);

        // Show modal
        document.getElementById('deviceModal').classList.remove('hidden');

    } catch (error) {
        console.error('Error loading device details:', error);
        showToast('Failed to load device details', 'error');
    }
}

/**
 * Render device uptime chart
 */
function renderDeviceUptimeChart(history) {
    const ctx = document.getElementById('deviceUptimeChart').getContext('2d');

    if (deviceUptimeChart) {
        deviceUptimeChart.destroy();
    }

    const chartData = history.map(h => ({
        x: new Date(h.timestamp),
        y: h.status === 'online' ? 1 : 0
    }));

    deviceUptimeChart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                label: 'Status',
                data: chartData,
                borderColor: 'rgba(16, 185, 129, 1)',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                stepped: true,
                fill: true,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.parsed.y === 1 ? 'Online' : 'Offline';
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'hour',
                        displayFormats: {
                            hour: 'MMM d, HH:mm'
                        }
                    },
                    ticks: { color: '#9ca3af' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                },
                y: {
                    min: 0,
                    max: 1,
                    ticks: {
                        color: '#9ca3af',
                        callback: function(value) {
                            return value === 1 ? 'Online' : 'Offline';
                        }
                    },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                }
            }
        }
    });
}

/**
 * Render device open ports
 */
function renderDevicePorts(ports) {
    const container = document.getElementById('devicePorts');

    if (!ports || ports.length === 0) {
        container.innerHTML = '<div class="text-gray-400 text-sm">No open ports detected</div>';
        return;
    }

    container.innerHTML = `
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
            ${ports.map(p => `
                <div class="glass rounded px-3 py-2">
                    <div class="text-white font-medium">${p.port}/${p.protocol}</div>
                    <div class="text-gray-400 text-xs">${p.service || 'Unknown'}</div>
                </div>
            `).join('')}
        </div>
    `;
}

/**
 * Render device recent alerts
 */
function renderDeviceAlerts(alerts) {
    const container = document.getElementById('deviceAlerts');

    if (!alerts || alerts.length === 0) {
        container.innerHTML = '<div class="text-gray-400 text-sm">No recent alerts</div>';
        return;
    }

    container.innerHTML = alerts.slice(0, 5).map(alert => {
        const severityColors = {
            'info': 'bg-blue-600/20 text-blue-400',
            'warning': 'bg-yellow-600/20 text-yellow-400',
            'critical': 'bg-red-600/20 text-red-400'
        };
        const colorClass = severityColors[alert.severity] || 'bg-gray-600/20 text-gray-400';

        return `
            <div class="flex items-start gap-3 py-2">
                <span class="px-2 py-1 rounded text-xs ${colorClass} flex-shrink-0">
                    ${alert.severity}
                </span>
                <div class="flex-1 min-w-0">
                    <div class="text-white text-sm">${alert.message}</div>
                    <div class="text-gray-400 text-xs">
                        ${new Date(alert.created_at).toLocaleString()}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Close device details modal
 */
function closeDeviceModal() {
    document.getElementById('deviceModal').classList.add('hidden');
    selectedDeviceId = null;
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

    loadNetworkInsights();
    loadTopDevices();
}

/**
 * Refresh all data
 */
function refreshData() {
    loadNetworkInsights();
    loadTopDevices();
    showToast('Data refreshed', 'success');
}

/**
 * Export insights data
 */
async function exportInsightsData() {
    try {
        const data = await apiCall(`/api/insights/network?hours=${currentTimeRange}`);

        const csvContent = `Network Insights Report
Generated: ${new Date().toLocaleString()}
Time Range: Last ${currentTimeRange} hours

Total Devices,Online Devices,Offline Devices,Status Changes,New Devices
${data.stats.total_devices},${data.stats.online_devices},${data.stats.offline_devices},${data.stats.status_changes},${data.stats.new_devices}
`;

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `network-insights-${new Date().toISOString().slice(0,10)}.csv`;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);

        showToast('Insights data exported', 'success');
    } catch (error) {
        console.error('Error exporting data:', error);
        showToast('Failed to export data', 'error');
    }
}
