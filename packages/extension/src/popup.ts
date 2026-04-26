export {};

const BRIDGE = 'http://localhost:5179';

const toggle = document.getElementById('enableToggle') as HTMLInputElement;
const statusEl = document.getElementById('bridgeStatus') as HTMLElement;

async function checkBridge(): Promise<boolean> {
    try {
        const res = await fetch(`${BRIDGE}/health`, { signal: AbortSignal.timeout(1500) });
        return res.ok;
    } catch {
        return false;
    }
}

async function sendToActiveTab(type: string): Promise<void> {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id || !tab.url) return;

        // Só envia se for localhost (content script só existe lá)
        const isLocal =
            tab.url.startsWith('http://localhost') ||
            tab.url.startsWith('http://127.0.0.1');
        if (!isLocal) return;

        await chrome.tabs.sendMessage(tab.id, { type }).catch(() => {
            // Content script ainda não carregou — injeta programaticamente
            chrome.scripting
                .executeScript({
                    target: { tabId: tab.id! },
                    files: ['content.js'],
                })
                .then(() => chrome.tabs.sendMessage(tab.id!, { type }))
                .catch(() => {});
        });
    } catch {
        // Tab fechada ou sem permissão — ignora silenciosamente
    }
}

async function init() {
    const [online, stored] = await Promise.all([
        checkBridge(),
        chrome.storage.local.get('enabled'),
    ]);

    statusEl.textContent = online
        ? '● Bridge conectado'
        : '● Bridge offline — rode: bun run bridge';
    statusEl.className = `status ${online ? 'online' : 'offline'}`;

    toggle.checked = Boolean(stored.enabled);

    toggle.addEventListener('change', async () => {
        await chrome.storage.local.set({ enabled: toggle.checked });
        await sendToActiveTab(toggle.checked ? 'VISUAL_EDIT_ENABLE' : 'VISUAL_EDIT_DISABLE');
    });
}

init();
