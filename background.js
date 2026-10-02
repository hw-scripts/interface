chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'interfaceService.request') {
        const { requestId, method, args } = message;
        if (method !== 'GET' && method !== 'POST') {
            sendResponse({ requestId, data: null, error: `Unsupported method: ${method}` });
            return;
        }

        Promise.resolve()
            .then(() => {
                const [url, options] = args;
                return fetch(url, { ...options, method });
            })
            .then(async response => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const contentType = (response.headers.get('content-type') || '')
                    .split(';')[0].trim().toLowerCase();
                const text = await response.text();
                if (!text) return {};
                return contentType === 'application/json' || contentType.endsWith('+json')
                    ? JSON.parse(text)
                    : text;
            })
            .then(data => sendResponse({ requestId, data, error: null }))
            .catch(error => sendResponse({ requestId, data: null, error: error.message }));

        return true;
    }
    return;
});
