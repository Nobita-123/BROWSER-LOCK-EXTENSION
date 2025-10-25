// --- Globals ---
let blockedHostnames = [];
let autoLockSettings = { enabled: false, delay: 5 };
const AUTO_LOCK_ALARM_NAME = 'browserAutoLock';

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
async function loadBlockedHostnames() {
  const data = await chrome.storage.local.get({ blockedUrls: [] });
  blockedHostnames = data.blockedUrls;
  console.log('Browser Lock: Blocklist reloaded.', blockedHostnames);
}

async function loadAutoLockSettings() {
  const data = await chrome.storage.local.get({ autoLockEnabled: false, autoLockDelay: 5 });
  autoLockSettings = {
    enabled: data.autoLockEnabled,
    delay: data.autoLockDelay
  };
  console.log('Browser Lock: Auto-lock settings reloaded.', autoLockSettings);
  // After loading, update idle listener state
  updateIdleListener();
}

// --- Blocking Logic ---
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // 1. Check if extension is toggled on
  const storage = await chrome.storage.local.get({ isBlockingEnabled: true });
  if (storage.isBlockingEnabled === false) {
    return; // Do nothing if the extension is disabled
  }

  // 2. Check if a URL is being updated
  if (changeInfo.url) {
    const url = changeInfo.url;

    // --- ENTIRE LOGIC BLOCK REPLACED ---

    // A. Check for pages that must ALWAYS be allowed (the lock screen itself)
    const passwordUrl = chrome.runtime.getURL('password.html');
    const resetUrl = chrome.runtime.getURL('reset_password.html');
    if (url.startsWith(passwordUrl) || url.startsWith(resetUrl)) {
      return; // Always allow lock/reset screen to load
    }

    // B. Check the browser's lock state
    const data = await chrome.storage.local.get('isLocked');

    // C. If LOCKED, block *everything* else
    if (data.isLocked) {
      // The URL is not the password page, so redirect it back to the password page.
      // This will correctly handle 'chrome://extensions', 'google.com', etc.
      try {
        chrome.tabs.update(tabId, { url: passwordUrl });
      } catch (e) {
        console.warn('Failed to redirect locked tab:', e.message);
      }
      return;
    }

    // D. If UNLOCKED, check for user-defined blocked sites (http/https only)
    if (url.startsWith('http://') || url.startsWith('https://')) {
      try {
        const currentUrl = new URL(url);
        let hostname = currentUrl.hostname;
        if (hostname.startsWith('www.')) {
          hostname = hostname.substring(4);
        }

        // Use the in-memory blocklist
        if (blockedHostnames.length > 0 && blockedHostnames.includes(hostname)) {
          try {
            chrome.tabs.remove(tabId); // Close user-blocked sites
          } catch (e) {
            console.warn('Could not remove tab:', e.message);
          }
          return;
        }
      } catch (e) {
        console.error('Error parsing URL for blocking:', url, e);
      }
    }
    
    // E. If UNLOCKED and not a user-blocked site (e.g., 'chrome://extensions'),
    //    do nothing and allow access.
    
    // --- END OF REPLACED LOGIC ---
  }
});

// --- Installation & Startup ---
chrome.runtime.onInstalled.addListener(async (details) => {
  // On first install, open options to set password
  if (details.reason === 'install') {
    const data = await chrome.storage.local.get('passwordHash');
    if (!data.passwordHash) {
      chrome.runtime.openOptionsPage();
    }
  }
  // Set defaults
  await chrome.storage.local.set({ isLocked: false, isBlockingEnabled: true });
  // Load settings into memory
  await loadBlockedHostnames();
  await loadAutoLockSettings();
});

chrome.runtime.onStartup.addListener(async () => {
  const data = await chrome.storage.local.get('passwordHash');
  if (data.passwordHash) {
    // Lock on startup if a password is set
    await chrome.storage.local.set({ isLocked: true });
  }
  // Load settings into memory
  await loadBlockedHostnames();
  await loadAutoLockSettings();
});

// --- Auto-Lock Logic ---
function updateIdleListener() {
  // Clear any existing listeners or alarms to prevent duplicates
  chrome.idle.onStateChanged.removeListener(onIdleStateChanged);
  chrome.alarms.clear(AUTO_LOCK_ALARM_NAME);
  
  if (autoLockSettings.enabled) {
    // Set detection interval and add listener ONLY if enabled
    chrome.idle.setDetectionInterval(autoLockSettings.delay * 60);
    chrome.idle.onStateChanged.addListener(onIdleStateChanged);
  }
}

async function onIdleStateChanged(newState) {
  if (newState === 'idle') {
    // User is idle, lock the browser.
    // We check settings again just in case.
    const storage = await chrome.storage.local.get({ isLocked: false, passwordHash: null });
    if (!storage.isLocked && storage.passwordHash) {
        lockBrowser(); // No sendResponse needed here
    }
  }
}

// --- Message Handling ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
      if (request.action === 'lockBrowser') {
        await lockBrowser(sendResponse);
      } else if (request.action === 'unlockBrowser') {
        await unlockBrowser(request.password, sender.tab.id, sendResponse);
      } else if (request.action === 'getSecurityQuestion') {
        const data = await chrome.storage.local.get('securityQuestion');
        sendResponse({ question: data.securityQuestion });
      } else if (request.action === 'verifySecurityAnswer') {
        const data = await chrome.storage.local.get('securityAnswer');
        // Check if securityAnswer exists before comparing
        if (data.securityAnswer && request.answer.toLowerCase() === data.securityAnswer.toLowerCase()) {
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'Incorrect answer' });
        }
      } else if (request.action === 'setNewPassword') {
        // Expecting a HASH from reset_password.js
        await chrome.storage.local.set({ passwordHash: request.passwordHash });
        sendResponse({ success: true });
      }
      // --- Listen for updates from Options page ---
      else if (request.action === 'updateBlockedUrls') {
        await loadBlockedHostnames();
        sendResponse({ success: true });
      } else if (request.action === 'updateGeneralSettings') {
        await loadAutoLockSettings();
        sendResponse({ success: true });
      } else if (request.action === 'resetAllData') {
        await loadBlockedHostnames(); // Will load empty array
        await loadAutoLockSettings(); // Will load defaults
        sendResponse({ success: true });
      }
      else if (request.action === 'toggleBlocking') {
        // State is already set in storage by popup.js. This just confirms receipt.
        sendResponse({ success: true });
      } else if (request.action === 'passwordUpdated') {
        // Password hash is read from storage on-demand, no in-memory state to update.
        sendResponse({ success: true });
      }
    } catch (error) {
      console.error('Error in onMessage listener:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  return true; // Indicates async response
});

// --- Core Functions ---
async function lockBrowser(sendResponse) {
  try {
    const storage = await chrome.storage.local.get(['passwordHash', 'isBlockingEnabled']);
    
    if (storage.isBlockingEnabled === false) {
      console.log('Cannot lock, extension is disabled.');
      if (sendResponse) sendResponse({ success: false, error: 'Extension is disabled.' });
      return;
    }

    if (!storage.passwordHash) {
      chrome.runtime.openOptionsPage();
      if (sendResponse) sendResponse({ success: false, error: 'No password set.' });
      return;
    }

    // Save all tabs (FILTERED)
    const passwordUrl = chrome.runtime.getURL('password.html');
    const resetUrl = chrome.runtime.getURL('reset_password.html');
    
    const allTabs = await chrome.tabs.query({});
    const tabsToSave = allTabs.filter(tab => 
        !tab.url.startsWith(passwordUrl) && 
        !tab.url.startsWith(resetUrl) &&
        !tab.url.startsWith('chrome-extension://')
    );

    const openTabs = tabsToSave.map((tab) => ({
      url: tab.url,
      windowId: tab.windowId,
    }));
    await chrome.storage.local.set({ openTabs: JSON.stringify(openTabs) });

    // Set lock state
    await chrome.storage.local.set({ isLocked: true });

    // Close all tabs
    // Use the 'allTabs' list we already queried
    for (const tab of allTabs) { 
      try {
        await chrome.tabs.remove(tab.id);
      } catch (e) {
        console.warn(`Could not close tab ${tab.id}: ${e.message}`);
      }
    }

    // Open the password page in a new window
    chrome.windows.create({ url: 'password.html' });

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
    
    // Hash the provided password to compare
    const hashedPassword = await hashPassword(password);

    if (hashedPassword === storedPasswordHash) {
      await chrome.storage.local.set({ isLocked: false });
      await restoreOpenTabs(sendResponse, senderTabId);
    } else {
      sendResponse({ success: false, error: 'Incorrect Password' });
    }
  } catch (error) {
    console.error('Error in unlockBrowser:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function restoreOpenTabs(sendResponse, senderTabId) {
  try {
    const data = await chrome.storage.local.get('openTabs');
    const openTabs = JSON.parse(data.openTabs || '[]');

    if (openTabs.length > 0) {
      const windowTabsMap = openTabs.reduce((acc, tab) => {
        if (!acc[tab.windowId]) acc[tab.windowId] = [];
        // Filter out blank tabs or internal extension pages
        if (tab.url && !tab.url.startsWith('chrome://newtab') && !tab.url.startsWith('chrome-extension://')) {
          acc[tab.windowId].push(tab.url);
        }
        return acc;
      }, {});

      for (const windowId of Object.keys(windowTabsMap)) {
        const urlsToOpen = windowTabsMap[windowId];
        if (urlsToOpen.length > 0) {
          await chrome.windows.create({ url: urlsToOpen });
        } else {
          await chrome.windows.create({}); // Create empty window
        }
      }
    } else {
      await chrome.windows.create({}); // Create a single empty window
    }
    
    await chrome.storage.local.remove('openTabs');
    sendResponse({ success: true });

    // After success, close the password tab that sent the message
    if (senderTabId) {
        try {
            await chrome.tabs.remove(senderTabId);
        } catch (e) {
            console.warn(`Could not close password tab ${senderTabId}: ${e.message}`);
        }
    }

  } catch (error)
 {
    console.error('Error in restoreOpenTabs:', error);
    sendResponse({ success: false, error: error.message });
  }
}