// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    loadSettings();
    loadEmailSettings();
    loadAlertRules();
    loadScanStatus();
    setupEventListeners();

    // Update scan status every 10 seconds
    setInterval(loadScanStatus, 10000);

    // Show/hide webhook URL field based on checkbox
    document.getElementById('ruleNotifyWebhook').addEventListener('change', function() {
        document.getElementById('webhookUrlDiv').classList.toggle('hidden', !this.checked);
    });
});

// Setup event listeners
function setupEventListeners() {
    document.getElementById('scanSettingsForm').addEventListener('submit', saveScanSettings);
    document.getElementById('emailSettingsForm').addEventListener('submit', saveEmailSettings);
    document.getElementById('alertRuleForm').addEventListener('submit', saveAlertRule);
    document.getElementById('passwordForm').addEventListener('submit', changePassword);
}

// Load current settings
async function loadSettings() {
    try {
        const data = await apiCall('/api/settings');
        const settings = data.settings;

        document.getElementById('scanRange').value = settings.scan_range || '192.168.1.0/24';
        document.getElementById('scanInterval').value = settings.scan_interval || '300';
        document.getElementById('autoScan').checked = settings.auto_scan === 'true';
        document.getElementById('historyRetention').value = settings.history_retention_days || '30';
    } catch (error) {
        showToast('Error loading settings: ' + error.message, 'error');
    }
}

// Load scan status
async function loadScanStatus() {
    try {
        const data = await apiCall('/api/scan/status');

        const lastScanTime = document.getElementById('lastScanTime');
        const scanStatus = document.getElementById('scanStatus');

        if (data.last_scan_time) {
            const date = new Date(data.last_scan_time);
            lastScanTime.textContent = formatDateTime(date);
        } else {
            lastScanTime.textContent = 'Never';
        }

        if (data.in_progress) {
            scanStatus.textContent = 'Scanning...';
            scanStatus.className = 'text-blue-400';
        } else {
            scanStatus.textContent = 'Idle';
            scanStatus.className = '';
        }
    } catch (error) {
        console.error('Error loading scan status:', error);
    }
}

// Format datetime
function formatDateTime(date) {
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Save scan settings
async function saveScanSettings(e) {
    e.preventDefault();

    const settings = {
        scan_range: document.getElementById('scanRange').value,
        scan_interval: document.getElementById('scanInterval').value,
        auto_scan: document.getElementById('autoScan').checked ? 'true' : 'false',
        history_retention_days: document.getElementById('historyRetention').value
    };

    // Validate scan interval
    const interval = parseInt(settings.scan_interval);
    if (interval < 60 || interval > 3600) {
        showToast('Scan interval must be between 60 and 3600 seconds', 'error');
        return;
    }

    // Validate history retention
    const retention = parseInt(settings.history_retention_days);
    if (retention < 1 || retention > 365) {
        showToast('History retention must be between 1 and 365 days', 'error');
        return;
    }

    try {
        await apiCall('/api/settings', {
            method: 'PUT',
            body: JSON.stringify(settings)
        });

        showToast('Settings saved successfully. Please restart the application for changes to take effect.', 'success');
    } catch (error) {
        showToast('Error saving settings: ' + error.message, 'error');
    }
}

// Change password
async function changePassword(e) {
    e.preventDefault();

    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    // Validate passwords
    if (newPassword !== confirmPassword) {
        showToast('New passwords do not match', 'error');
        return;
    }

    if (newPassword.length < 6) {
        showToast('Password must be at least 6 characters', 'error');
        return;
    }

    try {
        await apiCall('/auth/change-password', {
            method: 'POST',
            body: JSON.stringify({
                current_password: currentPassword,
                new_password: newPassword,
                confirm_password: confirmPassword
            })
        });

        showToast('Password changed successfully', 'success');
        document.getElementById('passwordForm').reset();
    } catch (error) {
        showToast('Error changing password: ' + error.message, 'error');
    }
}

// Load email settings
async function loadEmailSettings() {
    try {
        const data = await apiCall('/api/settings');
        const settings = data.settings;

        document.getElementById('smtpServer').value = settings.smtp_server || '';
        document.getElementById('smtpPort').value = settings.smtp_port || '587';
        document.getElementById('smtpUsername').value = settings.smtp_username || '';
        document.getElementById('smtpPassword').value = settings.smtp_password || '';
        document.getElementById('smtpFrom').value = settings.smtp_from || '';
        document.getElementById('alertEmail').value = settings.alert_email || '';
    } catch (error) {
        console.error('Error loading email settings:', error);
    }
}

// Save email settings
async function saveEmailSettings(e) {
    e.preventDefault();

    const settings = {
        smtp_server: document.getElementById('smtpServer').value,
        smtp_port: document.getElementById('smtpPort').value,
        smtp_username: document.getElementById('smtpUsername').value,
        smtp_password: document.getElementById('smtpPassword').value,
        smtp_from: document.getElementById('smtpFrom').value,
        alert_email: document.getElementById('alertEmail').value
    };

    try {
        await apiCall('/api/settings', {
            method: 'PUT',
            body: JSON.stringify(settings)
        });

        showToast('Email settings saved successfully', 'success');
    } catch (error) {
        showToast('Error saving email settings: ' + error.message, 'error');
    }
}

// Load alert rules
async function loadAlertRules() {
    try {
        const data = await apiCall('/api/alert-rules');
        displayAlertRules(data.rules);
    } catch (error) {
        console.error('Error loading alert rules:', error);
        showToast('Error loading alert rules', 'error');
    }
}

// Display alert rules
function displayAlertRules(rules) {
    const container = document.getElementById('alertRulesList');

    if (rules.length === 0) {
        container.innerHTML = `
            <div class="text-center text-gray-400 py-4">
                No alert rules configured. Click "Add Rule" to create one.
            </div>
        `;
        return;
    }

    const eventTypeLabels = {
        'device_offline': 'Device Goes Offline',
        'device_online': 'Device Comes Online',
        'new_device': 'New Device Discovered',
        'port_change': 'Port Changes Detected'
    };

    container.innerHTML = rules.map(rule => `
        <div class="bg-dark-bg border border-white/10 rounded-lg p-4">
            <div class="flex justify-between items-start">
                <div class="flex-1">
                    <div class="flex items-center gap-2 mb-2">
                        <h4 class="text-white font-medium">${escapeHtml(rule.name)}</h4>
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" ${rule.enabled ? 'checked' : ''} onchange="toggleRule(${rule.id}, this.checked)" class="sr-only peer">
                            <div class="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                    </div>
                    <div class="text-sm text-gray-400 space-y-1">
                        <div>Event: <span class="text-gray-300">${eventTypeLabels[rule.event_type]}</span></div>
                        <div>Devices: <span class="text-gray-300">${rule.device_filter === 'all' ? 'All' : rule.device_filter === 'favorites' ? 'Favorites' : rule.device_filter}</span></div>
                        <div class="flex gap-2 mt-2">
                            ${rule.notify_email ? '<span class="px-2 py-1 bg-blue-900/30 text-blue-400 rounded text-xs">📧 Email</span>' : ''}
                            ${rule.notify_webhook ? '<span class="px-2 py-1 bg-purple-900/30 text-purple-400 rounded text-xs">🔗 Webhook</span>' : ''}
                        </div>
                    </div>
                </div>
                <div class="flex gap-2 ml-4">
                    <button onclick="editAlertRule(${rule.id})" class="text-blue-400 hover:text-blue-300 text-sm" title="Edit">✏️</button>
                    <button onclick="deleteAlertRule(${rule.id})" class="text-red-400 hover:text-red-300 text-sm" title="Delete">🗑️</button>
                </div>
            </div>
        </div>
    `).join('');
}

// Show add rule modal
function showAddRuleModal() {
    document.getElementById('ruleModalTitle').textContent = 'Add Alert Rule';
    document.getElementById('alertRuleForm').reset();
    document.getElementById('ruleId').value = '';
    document.getElementById('webhookUrlDiv').classList.add('hidden');
    document.getElementById('alertRuleModal').classList.remove('hidden');
}

// Edit alert rule
async function editAlertRule(ruleId) {
    try {
        const data = await apiCall('/api/alert-rules');
        const rule = data.rules.find(r => r.id === ruleId);
        if (!rule) return;

        document.getElementById('ruleModalTitle').textContent = 'Edit Alert Rule';
        document.getElementById('ruleId').value = rule.id;
        document.getElementById('ruleName').value = rule.name;
        document.getElementById('ruleEventType').value = rule.event_type;
        document.getElementById('ruleDeviceFilter').value = rule.device_filter;
        document.getElementById('ruleNotifyEmail').checked = rule.notify_email;
        document.getElementById('ruleNotifyWebhook').checked = rule.notify_webhook;
        document.getElementById('ruleWebhookUrl').value = rule.webhook_url || '';

        if (rule.notify_webhook) {
            document.getElementById('webhookUrlDiv').classList.remove('hidden');
        }

        document.getElementById('alertRuleModal').classList.remove('hidden');
    } catch (error) {
        showToast('Error loading rule: ' + error.message, 'error');
    }
}

// Close alert rule modal
function closeAlertRuleModal() {
    document.getElementById('alertRuleModal').classList.add('hidden');
}

// Save alert rule
async function saveAlertRule(e) {
    e.preventDefault();

    const ruleId = document.getElementById('ruleId').value;
    const ruleData = {
        name: document.getElementById('ruleName').value,
        event_type: document.getElementById('ruleEventType').value,
        device_filter: document.getElementById('ruleDeviceFilter').value,
        notify_email: document.getElementById('ruleNotifyEmail').checked,
        notify_webhook: document.getElementById('ruleNotifyWebhook').checked,
        webhook_url: document.getElementById('ruleWebhookUrl').value || null,
        enabled: true
    };

    try {
        if (ruleId) {
            // Update existing rule
            await apiCall(`/api/alert-rules/${ruleId}`, {
                method: 'PUT',
                body: JSON.stringify(ruleData)
            });
            showToast('Alert rule updated successfully', 'success');
        } else {
            // Create new rule
            await apiCall('/api/alert-rules', {
                method: 'POST',
                body: JSON.stringify(ruleData)
            });
            showToast('Alert rule created successfully', 'success');
        }

        closeAlertRuleModal();
        loadAlertRules();
    } catch (error) {
        showToast('Error saving rule: ' + error.message, 'error');
    }
}

// Toggle rule enabled/disabled
async function toggleRule(ruleId, enabled) {
    try {
        await apiCall(`/api/alert-rules/${ruleId}`, {
            method: 'PUT',
            body: JSON.stringify({ enabled: enabled })
        });
        showToast(enabled ? 'Rule enabled' : 'Rule disabled', 'success');
    } catch (error) {
        showToast('Error toggling rule: ' + error.message, 'error');
        loadAlertRules(); // Reload to revert the toggle
    }
}

// Delete alert rule
async function deleteAlertRule(ruleId) {
    if (!confirm('Are you sure you want to delete this alert rule?')) return;

    try {
        await apiCall(`/api/alert-rules/${ruleId}`, { method: 'DELETE' });
        showToast('Alert rule deleted successfully', 'success');
        loadAlertRules();
    } catch (error) {
        showToast('Error deleting rule: ' + error.message, 'error');
    }
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
