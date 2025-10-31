// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    loadSettings();
    loadScanStatus();
    setupEventListeners();

    // Update scan status every 10 seconds
    setInterval(loadScanStatus, 10000);
});

// Setup event listeners
function setupEventListeners() {
    document.getElementById('scanSettingsForm').addEventListener('submit', saveScanSettings);
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
