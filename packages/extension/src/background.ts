export {};
const BRIDGE = 'http://localhost:5179';

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.set({ enabled: false });
});

// Restore enabled state on tab update
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
    if (changeInfo.status !== 'complete') return;
    const stored = await chrome.storage.local.get('enabled');
    if (stored.enabled) {
        chrome.tabs.sendMessage(tabId, { type: 'VISUAL_EDIT_ENABLE' }).catch(() => {});
    }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'BRIDGE_EDIT') {
        fetch(`${BRIDGE}/edit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(msg.payload),
        })
            .then((r) => r.json())
            .then((data) => sendResponse({ ok: true, data }))
            .catch((err) => sendResponse({ ok: false, error: String(err) }));
        return true; // async response
    }

    if (msg.type === 'BRIDGE_HEALTH') {
        fetch(`${BRIDGE}/health`, { signal: AbortSignal.timeout(1500) })
            .then((r) => r.json())
            .then((data) => sendResponse({ ok: true, data }))
            .catch(() => sendResponse({ ok: false }));
        return true;
    }
});
