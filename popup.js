document.addEventListener('DOMContentLoaded', async () => {
    const blockingToggle = document.getElementById('blockingToggle');
    const lockBrowserBtn = document.getElementById('lockBrowser');
    const openOptionsBtn = document.getElementById('openOptions');

    // 1. Load the current blocking state from storage
    try {
        const data = await chrome.storage.local.get({ isBlockingEnabled: true }); // Default to true
        blockingToggle.checked = data.isBlockingEnabled;
    } catch (e) {
        console.error("Error loading blocking state:", e);
        blockingToggle.checked = true; // Fallback
    }

    // 2. Add listener for the toggle
    blockingToggle.addEventListener('change', async () => {
        const isEnabled = blockingToggle.checked;
        try {
            await chrome.storage.local.set({ isBlockingEnabled: isEnabled });
            // The background.js script reads this value on-the-fly,
            // so no message is needed.
        } catch (e) {
            console.error("Error saving blocking state:", e);
        }
    });

    // 3. Add listeners for the buttons
    lockBrowserBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'lockBrowser' }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Error locking browser:', chrome.runtime.lastError.message);
                // Don't close the popup if there's an error
                return;
            }
            if (response && response.success === false) {
                console.error('Failed to lock browser:', response.error);
                // Don't close the popup if there's an error
                return;
            }
            window.close(); // Only close popup after successful action
        });
    });

    openOptionsBtn.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
        window.close(); // Close popup after action
    });
});