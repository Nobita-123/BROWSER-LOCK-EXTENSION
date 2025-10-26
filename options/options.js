// Function to show status messages (success/error)
function showStatusMessage(message, type = 'info') {
    const statusMessageDiv = document.getElementById('statusMessage');
    statusMessageDiv.textContent = message;
    statusMessageDiv.className = `status-message ${type}`;
    statusMessageDiv.style.display = 'block';

    setTimeout(() => {
        statusMessageDiv.style.display = 'none';
        statusMessageDiv.textContent = '';
        statusMessageDiv.className = 'status-message';
    }, 5000);
}

document.addEventListener('DOMContentLoaded', async () => {
    // Get references
    const newPasswordInput = document.getElementById('newPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const securityQuestionInput = document.getElementById('securityQuestion');
    const securityAnswerInput = document.getElementById('securityAnswer');
    const saveSecurityBtn = document.getElementById('saveSecurityBtn');
    
    const autoLockCheckbox = document.getElementById('autoLockCheckbox');
    const autoLockDelayInput = document.getElementById('autoLockDelay');
    const saveGeneralSettingsBtn = document.getElementById('saveGeneralSettingsBtn');
    const resetAllDataBtn = document.getElementById('resetAllData');

    // Load settings from storage
    async function loadSettings() {
        const settings = await chrome.storage.local.get(['passwordHash', 'securityQuestion', 'autoLockEnabled', 'autoLockDelay']);

        if (settings.securityQuestion) {
            securityQuestionInput.value = settings.securityQuestion;
        }

        autoLockCheckbox.checked = settings.autoLockEnabled || false;
        autoLockDelayInput.value = settings.autoLockDelay || 5;

        if (!settings.passwordHash) {
            showStatusMessage('Welcome! Please set your password and security question to activate Browser Lock.', 'info');
        }
    }

    // --- NEW: Single Save Button Logic ---
    saveSecurityBtn.addEventListener('click', async (e) => {
        e.preventDefault(); // Prevent form submission
        
        const newPassword = newPasswordInput.value;
        const confirmPassword = confirmPasswordInput.value;
        const question = securityQuestionInput.value.trim();
        const answer = securityAnswerInput.value.trim();

        let passwordUpdated = false;
        let securityUpdated = false;
        
        // --- 1. Handle Password Update ---
        if (newPassword || confirmPassword) {
            if (newPassword !== confirmPassword) {
                showStatusMessage('Passwords do not match.', 'error');
                return;
            }
            if (!newPassword) { // Will also catch !confirmPassword due to above check
                showStatusMessage('Please enter and confirm your new password to update it.', 'error');
                return;
            }

            // Send to background to be hashed
            try {
                const response = await chrome.runtime.sendMessage({ action: "savePassword", password: newPassword });
                if (chrome.runtime.lastError || !response.success) {
                    throw new Error(chrome.runtime.lastError?.message || "Failed to save password.");
                }
                passwordUpdated = true;
            } catch (error) {
                showStatusMessage('Error saving password. Please try again.', 'error');
                return; // Stop if password save fails
            }
        }

        // --- 2. Handle Security Q/A Update ---
        if (question || answer) {
            if (!question || !answer) {
                showStatusMessage('Please provide both a security question and an answer to update.', 'error');
                return;
            }

            try {
                await chrome.storage.local.set({
                    securityQuestion: question,
                    securityAnswer: answer.toLowerCase() // Store answer as lowercase
                });
                securityUpdated = true;
            } catch (error) {
                showStatusMessage('Error saving security settings.', 'error');
                return; // Stop if security save fails
            }
        }

        // --- 3. Show Success Message ---
        if (passwordUpdated && securityUpdated) {
            showStatusMessage('Password and security settings saved!', 'success');
        } else if (passwordUpdated) {
            showStatusMessage('Password saved successfully!', 'success');
        } else if (securityUpdated) {
            showStatusMessage('Security settings saved successfully!', 'success');
        } else {
            showStatusMessage('No changes were made.', 'info');
            return; // Nothing to clear
        }

        // Clear inputs on success
        newPasswordInput.value = '';
        confirmPasswordInput.value = '';
        securityAnswerInput.value = ''; // Only clear answer for security
    });

    // --- General Settings Logic (Unchanged) ---
    saveGeneralSettingsBtn.addEventListener('click', async () => {
        const autoLockEnabled = autoLockCheckbox.checked;
        const autoLockDelay = parseInt(autoLockDelayInput.value);

        if (isNaN(autoLockDelay) || autoLockDelay < 1) {
            showStatusMessage('Auto lock delay must be a positive number.', 'error');
            return;
        }

        await chrome.storage.local.set({
            autoLockEnabled: autoLockEnabled,
            autoLockDelay: autoLockDelay
        });
        showStatusMessage('General settings saved successfully!', 'success');
        chrome.runtime.sendMessage({ action: "updateGeneralSettings" });
    });

    // --- Reset Logic (Unchanged) ---
    resetAllDataBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (confirm('Are you sure you want to reset ALL Browser Lock data (password, security settings)? This action cannot be undone.')) {
            await chrome.storage.local.clear();
            showStatusMessage('All Browser Lock data has been reset.', 'success');
            loadSettings(); // Reload to show default state
            chrome.runtime.sendMessage({ action: "resetAllData" });
        }
    });

    // Initial load
    loadSettings();
});