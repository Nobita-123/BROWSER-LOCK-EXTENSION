document.addEventListener('DOMContentLoaded', () => {
    const passwordInput = document.getElementById('password');
    const unlockButton = document.getElementById('unlockButton'); // Fixed: Correct ID
    const messageEl = document.getElementById('message-box');

    // Focus on the password input when the page loads
    passwordInput.focus();

    // Event listener for unlock button click
    unlockButton.addEventListener('click', async () => {
        const password = passwordInput.value;
        if (password) {
            messageEl.classList.remove('show'); // Hide previous error
            
            // Send message to background script to unlock
            chrome.runtime.sendMessage({ action: 'unlockBrowser', password: password }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("Error sending unlock message:", chrome.runtime.lastError.message);
                    showMessage("An unexpected error occurred. Please try again.", "error");
                    return;
                }
                if (response && response.success) {
                    // Browser unlocked, this window will be replaced or closed by background.js
                } else {
                    showMessage(response.error || 'Incorrect Password', "error");
                }
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