(async function () {
    let manifest = null;
    //#region  Load manifest data
    const manifestReady = new Promise(resolve => {
        window.addEventListener('message', event => {
            if (event.source !== window) return;
            if (event.data?.type !== 'interfaceManifest') return;

            manifest = event.data.manifest;
            resolve();
        });
    });
    await manifestReady;
    console.log('Interface manifest loaded:', manifest);
    //#endregion

    // Working with AJAX
    const originalAJAX = {
        //#region Overriding the methods for sending requests to the server and receiving responses
        open: XMLHttpRequest.prototype.open,
        send: XMLHttpRequest.prototype.send,
        setRequestHeader: XMLHttpRequest.prototype.setRequestHeader,
        sendWebSocket: WebSocket.prototype.send,
        fetch: window.fetch
        //#endregion
    };
    //#region AJAX overriding
    function logAJAX(data) {
        const key = `ajax:${Date.now()}`;
        const value = JSON.stringify(data);

        while (true) {
            try {
                sessionStorage.setItem(key, value);
                return;
            } catch (error) {
                if (error.name !== 'QuotaExceededError')
                    throw error;

                const keys = Object.keys(sessionStorage)
                    .filter(key => key.startsWith('ajax:'))
                    .sort();

                if (!keys.length)
                    throw error;

                keys
                    .slice(0, Math.max(1, Math.ceil(keys.length / 10)))
                    .forEach(key => sessionStorage.removeItem(key));
            }
        }
    }


    // XMLHttpRequest
    XMLHttpRequest.prototype.open = function (method, url) {
        this.__interfaceAjaxLog = {
            method,
            url,
            request: {
                headers: {},
                body: null
            },
            response: {
                status: null,
                headers: {},
                body: null
            }
        };

        return originalAJAX.open.apply(this, arguments);
    };

    XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
        this.__interfaceAjaxLog.request.headers[name] = value;

        return originalAJAX.setRequestHeader.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function (body) {
        this.__interfaceAjaxLog.request.body = body;

        this.addEventListener('loadend', () => {
            this.__interfaceAjaxLog.response.status = this.status;

            this.getAllResponseHeaders()
                .trim()
                .split(/[\r\n]+/)
                .filter(Boolean)
                .forEach(line => {
                    const index = line.indexOf(':');

                    if (index >= 0) {
                        const name = line.slice(0, index).trim();
                        const value = line.slice(index + 1).trim();

                        this.__interfaceAjaxLog.response.headers[name] = value;
                    }
                });

            this.__interfaceAjaxLog.response.body = this.response;

            logAJAX(this.__interfaceAjaxLog);

        }, { once: true });

        return originalAJAX.send.apply(this, arguments);
    };


    // fetch
    window.fetch = async function (input, init) {
        const request = input instanceof Request
            ? input
            : new Request(input, init);

        const response = await originalAJAX.fetch.apply(this, arguments);
        const responseClone = response.clone();

        const requestHeaders = {};
        request.headers.forEach((value, name) => {
            requestHeaders[name] = value;
        });

        const responseHeaders = {};
        response.headers.forEach((value, name) => {
            responseHeaders[name] = value;
        });

        let requestBody = null;
        let responseBody = null;

        try {
            if (request.method !== 'GET' && request.method !== 'HEAD')
                requestBody = await request.clone().text();
        } catch {
        }

        try {
            responseBody = await responseClone.text();
        } catch {
        }

        logAJAX({
            method: request.method,
            url: request.url,

            request: {
                headers: requestHeaders,
                body: requestBody
            },

            response: {
                status: response.status,
                headers: responseHeaders,
                body: responseBody
            }
        });

        return response;
    };

    // WebSocket
    WebSocket.prototype.send = function (body) {
        logAJAX({
            method: 'WebSocket',
            url: this.url,

            request: {
                headers: {},
                body
            },

            response: {
                status: null,
                headers: {},
                body: null
            }
        });

        return originalAJAX.sendWebSocket.apply(this, arguments);
    };
    //#endregion

    // Store/restore tool
    //#region userStorage
    let userId = 'default';
    class UserStorage {
        constructor(userId) {
            this.prefix = `${manifest.name}:${userId ?? 'default'}:`;
        }

        getItem(key) {
            return localStorage.getItem(this.prefix + key);
        }

        setItem(key, value) {
            localStorage.setItem(this.prefix + key, value);
        }

        removeItem(key) {
            localStorage.removeItem(this.prefix + key);
        }
    }
    //#endregion
    let userStorage = new UserStorage(userId);

    // Fetch basic settings


})();
