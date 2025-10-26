// --- Globals ---
let autoLockSettings = { enabled: false, delay: 5 };

// --- Utility Functions ---

// Hashing function for password verification
async function hashPassword(password) {
  if (!password) return null;
  const textEncoder = new TextEncoder();
  const data = textEncoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Load settings from storage into memory
async function loadAutoLockSettings() {
  const data = await chrome.storage.local.get({ autoLockEnabled: false, autoLockDelay: 5 });
  autoLockSettings = {
    enabled: data.autoLockEnabled,
    delay: data.autoLockDelay
  };
  console.log('Browser Lock: Auto-lock settings reloaded.', autoLockSettings);
  updateIdleListener();
}

// --- Blocking Logic ---
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  const storage = await chrome.storage.local.get({ isBlockingEnabled: true });
  if (storage.isBlockingEnabled === false) return;

  if (changeInfo.url) {
    const url = changeInfo.url;

    // A. Always allow lock/reset screen
    const passwordUrl = chrome.runtime.getURL('password.html');
    const resetUrl = chrome.runtime.getURL('reset_password.html');
    if (url.startsWith(passwordUrl) || url.startsWith(resetUrl)) {
      return;
    }

    // B. Check if browser is locked
    const data = await chrome.storage.local.get('isLocked');

    // C. If LOCKED, block *everything* else
    if (data.isLocked) {
      try {
        // This is the main lock. Any tab navigation gets redirected.
        chrome.tabs.update(tabId, { url: passwordUrl });
      } catch (e) { console.warn('Failed to redirect locked tab:', e.message); }
      return;
    }

    // D. Site-specific blocking has been removed.
  }
});

// --- Installation & Startup ---
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage();
  }
  await chrome.storage.local.set({ isLocked: false, isBlockingEnabled: true });
  await chrome.storage.session.set({ tempWhitelist: [] }); // Clear any old data
  await loadAutoLockSettings();
});

chrome.runtime.onStartup.addListener(async () => {
  const data = await chrome.storage.local.get('passwordHash');
  if (data.passwordHash) {
    await chrome.storage.local.set({ isLocked: true });
  }
  await loadAutoLockSettings();
});

// --- Auto-Lock Logic ---
function updateIdleListener() {
  chrome.idle.onStateChanged.removeListener(onIdleStateChanged);
  if (autoLockSettings.enabled) {
    chrome.idle.setDetectionInterval(autoLockSettings.delay * 60);
    chrome.idle.onStateChanged.addListener(onIdleStateChanged);
  }
}

async function onIdleStateChanged(newState) {
  if (newState === 'idle') {
    const storage = await chrome.storage.local.get({ isLocked: false, passwordHash: null });
    if (!storage.isLocked && storage.passwordHash) {
        lockBrowser(null);
    }
  }
}

// --- Message Handling ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
      if (request.action === 'lockBrowser') {
        await lockBrowser(sendResponse); // Manual lock
      } else if (request.action === 'unlockBrowser') {
        await unlockBrowser(request.password, sender.tab.id, sendResponse);
      } else if (request.action === 'getSecurityQuestion') {
        const data = await chrome.storage.local.get('securityQuestion');
        sendResponse({ question: data.securityQuestion });
      } else if (request.action === 'verifySecurityAnswer') {
        const data = await chrome.storage.local.get('securityAnswer');
        if (data.securityAnswer && request.answer.toLowerCase() === data.securityAnswer.toLowerCase()) {
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'Incorrect answer' });
        }
      } 
      // --- Centralized Hashing ---
      else if (request.action === 'savePassword') { // From options page
        const hashedPassword = await hashPassword(request.password);
        await chrome.storage.local.set({ passwordHash: hashedPassword });
        sendResponse({ success: true });
      } else if (request.action === 'setNewPassword') { // From reset page
        const hashedPassword = await hashPassword(request.password);
        await chrome.storage.local.set({ passwordHash: hashedPassword });
        sendResponse({ success: true });
      }
      // --- UX Improvement ---
      else if (request.action === 'unlockAfterReset') {
        // This is a special unlock from the reset page.
        await chrome.storage.local.set({ isLocked: false });
        // Just send a simple success, password.js will handle redirect.
        sendResponse({ success: true, redirectUrl: "chrome://newtab" });
      }
      // --- Settings Updates ---
      else if (request.action === 'updateGeneralSettings') {
        await loadAutoLockSettings();
        sendResponse({ success: true });
      } else if (request.action === 'resetAllData') {
        await loadAutoLockSettings(); 
        await chrome.storage.session.set({ tempWhitelist: [] });
        sendResponse({ success: true });
      }
    } catch (error) {
      console.error('Error in onMessage listener:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  return true; // Indicates async response
});


// --- CORE FUNCTIONS (CHANGED) ---

async function lockBrowser(sendResponse) {
  try {
    const storage = await chrome.storage.local.get(['passwordHash', 'isBlockingEnabled']);
    
    if (storage.isBlockingEnabled === false) {
      if (sendResponse) sendResponse({ success: false, error: 'Extension is disabled.' });
      return;
    }

    if (!storage.passwordHash) {
      chrome.runtime.openOptionsPage();
      if (sendResponse) sendResponse({ success: false, error: 'No password set.' });
      return;
    }

    // Clear any session data
    await chrome.storage.session.set({ tempWhitelist: [] });

    // Set lock state
    await chrome.storage.local.set({ isLocked: true });

    // --- NEW LOGIC: Redirect all tabs instead of closing ---
    const passwordUrl = chrome.runtime.getURL('password.html');
    const allTabs = await chrome.tabs.query({ status: 'complete' });
    
    for (const tab of allTabs) {
      // Don't redirect tabs that are already on the lock page or special pages
      if (tab.url && !tab.url.startsWith(passwordUrl) && tab.url.startsWith('http')) {
        try {
          await chrome.tabs.update(tab.id, { url: passwordUrl });
        } catch (e) {
          console.warn(`Could not update tab ${tab.id}: ${e.message}`);
        }
      }
    }
    // --- End of new logic ---

    if (sendResponse) sendResponse({ success: true });

  } catch (error) {
    console.error('Error in lockBrowser:', error);
    if (sendResponse) sendResponse({ success: false, error: error.message });
  }
}

async function unlockBrowser(password, senderTabId, sendResponse) {
  try {
    const data = await chrome.storage.local.get('passwordHash');
    const storedPasswordHash = data.passwordHash;
    const hashedPassword = await hashPassword(password);

    if (hashedPassword === storedPasswordHash) {
      await chrome.storage.local.set({ isLocked: false });

      // --- NEW LOGIC: Send default redirect URL ---
      const redirectUrl = "chrome://newtab"; // Default redirect
      
      // Clear the whitelist now that we're unlocked
      await chrome.storage.session.set({ tempWhitelist: [] });

      sendResponse({ success: true, redirectUrl: redirectUrl });
      // --- End of new logic ---

    } else {
      sendResponse({ success: false, error: 'Incorrect Password' });
    }
  } catch (error) {
    console.error('Error in unlockBrowser:', error);
    sendResponse({ success: false, error: error.message });
  }
}