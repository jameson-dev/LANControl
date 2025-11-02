// Alerts page JavaScript

let allAlerts = [];
let lastAlertId = null;

// Request desktop notification permission on page load
function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().then(checkNotificationButton);
    }
    checkNotificationButton();
}

// Enable notifications (called by button click)
async function enableNotifications() {
    if ('Notification' in window) {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            showToast('Desktop notifications enabled!', 'success');
            checkNotificationButton();
        } else if (permission === 'denied') {
            showToast('Notification permission denied. Please enable in browser settings.', 'error');
        }
    } else {
        showToast('Desktop notifications not supported in this browser', 'error');
    }
}

// Check if we should show the enable notifications button
function checkNotificationButton() {
    const btn = document.getElementById('enableNotificationsBtn');
    if (btn && 'Notification' in window) {
        if (Notification.permission === 'default') {
            btn.classList.remove('hidden');
        } else {
            btn.classList.add('hidden');
        }
    }
}

// Show desktop notification for new critical/warning alerts
function showDesktopNotification(alert) {
    if ('Notification' in window && Notification.permission === 'granted') {
        const title = `LANControl Alert: ${alert.alert_type.replace('_', ' ').toUpperCase()}`;
        const options = {
            body: alert.message,
            icon: '/static/icons/alert-icon.png', // Add icon if you want
            badge: '/static/icons/badge-icon.png',
            tag: `alert-${alert.id}`, // Prevents duplicate notifications
            requireInteraction: alert.severity === 'critical', // Keep critical alerts visible
            silent: false
        };

        const notification = new Notification(title, options);

        notification.onclick = function() {
            window.focus();
            window.location.href = '/alerts';
            notification.close();
        };

        // Auto-close after 10 seconds (except critical)
        if (alert.severity !== 'critical') {
            setTimeout(() => notification.close(), 10000);
        }
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    requestNotificationPermission();
    loadAlerts();
    loadStats();

    // Refresh every 30 seconds and check for new alerts
    setInterval(() => {
        loadAlerts(true); // Pass true to check for new alerts
        loadStats();
    }, 30000);
});

// Load alerts from API
async function loadAlerts(checkForNew = false) {
    try {
        const typeFilter = document.getElementById('typeFilter').value;
        const unreadOnly = document.getElementById('unreadOnly').checked;

        let url = '/api/alerts?limit=100';
        if (typeFilter) url += `&alert_type=${typeFilter}`;
        if (unreadOnly) url += `&is_read=false`;

        const data = await apiCall(url);
        const newAlerts = data.alerts;

        // Check for new critical/warning alerts
        if (checkForNew && newAlerts.length > 0) {
            const newestAlert = newAlerts[0];

            // If this is a new alert (higher ID than last seen)
            if (lastAlertId !== null && newestAlert.id > lastAlertId) {
                // Show desktop notification for critical and warning alerts
                if (newestAlert.severity === 'critical' || newestAlert.severity === 'warning') {
                    showDesktopNotification(newestAlert);
                }
            }

            // Update last seen alert ID
            if (newestAlert.id > (lastAlertId || 0)) {
                lastAlertId = newestAlert.id;
            }
        }

        // Store for initial page load
        if (lastAlertId === null && newAlerts.length > 0) {
            lastAlertId = newAlerts[0].id;
        }

        allAlerts = newAlerts;
        displayAlerts(allAlerts);
    } catch (error) {
        console.error('Error loading alerts:', error);
        showToast('Failed to load alerts', 'error');
    }
}

// Load alert statistics
async function loadStats() {
    try {
        const data = await apiCall('/api/alerts/stats');
        const stats = data.stats;

        document.getElementById('stat-total').textContent = stats.total;
        document.getElementById('stat-unread').textContent = stats.unread;
        document.getElementById('stat-critical').textContent = stats.by_severity.critical;
        document.getElementById('stat-warning').textContent = stats.by_severity.warning;
        document.getElementById('stat-info').textContent = stats.by_severity.info;
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Display alerts
function displayAlerts(alerts) {
    const container = document.getElementById('alertsList');

    // Apply severity filter
    const severityFilter = document.getElementById('severityFilter').value;
    if (severityFilter) {
        alerts = alerts.filter(a => a.severity === severityFilter);
    }

    if (alerts.length === 0) {
        container.innerHTML = `
            <div class="text-center text-gray-400 py-8">
                No alerts found
            </div>
        `;
        return;
    }

    container.innerHTML = alerts.map(alert => {
        const severityColors = {
            'critical': 'border-red-500 bg-red-900/20',
            'warning': 'border-yellow-500 bg-yellow-900/20',
            'info': 'border-blue-500 bg-blue-900/20'
        };

        const severityIcons = {
            'critical': '🔴',
            'warning': '⚠️',
            'info': 'ℹ️'
        };

        const typeLabels = {
            'status_change': 'Status Change',
            'new_device': 'New Device',
            'port_change': 'Port Change'
        };

        const borderClass = severityColors[alert.severity] || 'border-gray-700';
        const opacity = alert.is_read ? 'opacity-60' : '';

        return `
            <div class="bg-dark-card border-l-4 ${borderClass} rounded-lg p-4 ${opacity} transition-opacity">
                <div class="flex items-start justify-between gap-4">
                    <div class="flex-1">
                        <div class="flex items-center gap-2 mb-2">
                            <span class="text-xl">${severityIcons[alert.severity]}</span>
                            <span class="text-sm font-medium text-gray-400 uppercase">${typeLabels[alert.alert_type]}</span>
                            <span class="text-sm text-gray-500">•</span>
                            <span class="text-sm text-gray-400">${formatDateTime(alert.created_at)}</span>
                            ${!alert.is_read ? '<span class="px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full">NEW</span>' : ''}
                        </div>
                        <p class="text-white text-base mb-2">${escapeHtml(alert.message)}</p>
                        ${alert.metadata ? renderMetadata(alert.metadata) : ''}
                    </div>
                    <div class="flex flex-col gap-2">
                        ${!alert.is_read ? `
                            <button onclick="markRead(${alert.id})"
                                    class="text-blue-400 hover:text-blue-300 text-sm"
                                    title="Mark as read">
                                ✓ Read
                            </button>
                        ` : ''}
                        <button onclick="deleteAlert(${alert.id})"
                                class="text-red-400 hover:text-red-300 text-sm"
                                title="Delete">
                            🗑️ Delete
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Render metadata nicely
function renderMetadata(metadataJson) {
    try {
        const metadata = JSON.parse(metadataJson);
        const items = Object.entries(metadata).map(([key, value]) => {
            const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            return `<span class="text-xs text-gray-400">${label}: <span class="text-gray-300">${value}</span></span>`;
        });

        return `<div class="flex flex-wrap gap-3 mt-2">${items.join('')}</div>`;
    } catch {
        return '';
    }
}

// Mark alert as read
async function markRead(alertId) {
    try {
        await apiCall(`/api/alerts/${alertId}/read`, { method: 'POST' });
        showToast('Alert marked as read', 'success');
        loadAlerts();
        loadStats();
    } catch (error) {
        showToast('Failed to mark alert as read', 'error');
    }
}

// Mark all alerts as read
async function markAllRead() {
    if (!confirm('Mark all alerts as read?')) return;

    try {
        await apiCall('/api/alerts/mark-all-read', { method: 'POST' });
        showToast('All alerts marked as read', 'success');
        loadAlerts();
        loadStats();
    } catch (error) {
        showToast('Failed to mark alerts as read', 'error');
    }
}

// Delete a single alert
async function deleteAlert(alertId) {
    if (!confirm('Delete this alert?')) return;

    try {
        await apiCall(`/api/alerts/${alertId}`, { method: 'DELETE' });
        showToast('Alert deleted', 'success');
        loadAlerts();
        loadStats();
    } catch (error) {
        showToast('Failed to delete alert', 'error');
    }
}

// Clear all read alerts
async function clearReadAlerts() {
    const readAlerts = allAlerts.filter(a => a.is_read);

    if (readAlerts.length === 0) {
        showToast('No read alerts to clear', 'info');
        return;
    }

    if (!confirm(`Delete ${readAlerts.length} read alert(s)?`)) return;

    try {
        // Delete each read alert
        for (const alert of readAlerts) {
            await apiCall(`/api/alerts/${alert.id}`, { method: 'DELETE' });
        }

        showToast(`Deleted ${readAlerts.length} alert(s)`, 'success');
        loadAlerts();
        loadStats();
    } catch (error) {
        showToast('Failed to clear alerts', 'error');
    }
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

    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
