const manifest = chrome.runtime.getManifest();
const typeName = crypto.randomUUID();

window.addEventListener('message', event => {
    if (event.source !== window) return;
    if (event.data?.type !== `${typeName}.request`) return;

    const { requestId, method, args } = event.data;
    chrome.runtime.sendMessage({
        type: 'interfaceService.request',
        requestId,
        method,
        args
    }).then(response => {
        window.postMessage({
            type: `${typeName}.result`,
            requestId,
            data: response.data,
            error: response.error
        });
    }).catch(error => {
        window.postMessage({
            type: `${typeName}.result`,
            requestId,
            data: null,
            error: error.message
        });
    });
});

window.postMessage({
    type: 'interface.Manifest',
    data: {
        manifest_version: manifest.manifest_version,
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        author: manifest.author,
        homepage_url: manifest.homepage_url,
        resource_BaseUrl: chrome.runtime.getURL(''),
        typeName
    }
});
