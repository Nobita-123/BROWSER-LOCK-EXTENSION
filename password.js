document.addEventListener('DOMContentLoaded', () => {
    const passwordInput = document.getElementById('password');
    const unlockButton = document.getElementById('unlockButton');
    const messageEl = document.getElementById('message-box');

    passwordInput.focus();

    // Event listener for unlock button click
    unlockButton.addEventListener('click', async () => {
        const password = passwordInput.value;
        if (password) {
            messageEl.classList.remove('show');
            
            // Send message to background script to unlock
            chrome.runtime.sendMessage({ action: 'unlockBrowser', password: password }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("Error sending unlock message:", chrome.runtime.lastError.message);
                    showMessage("An unexpected error occurred. Please try again.", "error");
                    return;
                }
                
                // --- NEW LOGIC: Handle the redirect response ---
                if (response && response.success) {
                    // Browser unlocked! Navigate to the intended page.
                    showMessage('Unlocked!', 'success');
                    if (response.redirectUrl) {
                        // Use window.location.replace to go to the new page
                        // and prevent the lock screen from being in the browser history.
                        window.location.replace(response.redirectUrl);
                    } else {
                        // Fallback just in case
                        window.location.replace('chrome://newtab');
                    }
                } else {
                    // Failed to unlock
                    showMessage(response.error || 'Incorrect Password', "error");
                }
                // --- End of new logic ---
            });
        } else {
            showMessage('Please enter your password.', "error");
        }
    });

    // Allow pressing Enter key to unlock
    passwordInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault(); // Prevent default form submission if any
            unlockButton.click(); // Simulate button click
        }
    });

    function showMessage(text, type = "error") {
        messageEl.textContent = text;
        // Clear existing type classes before adding new one
        messageEl.classList.remove('error', 'success'); 
        messageEl.classList.add(type, 'show'); // Add 'show' class to fade in
    }
});