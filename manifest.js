const manifest = chrome.runtime.getManifest();

window.postMessage({
    type: 'interfaceManifest',
    manifest
});