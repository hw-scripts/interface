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

    let resolveUserStorage;
    //#region AJAX overriding
    const userStorageReady = new Promise(resolve => {
        resolveUserStorage = resolve;
    });
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
            },
            response: {
                status: null,
                headers: {},
            }
        };

        return originalAJAX.open.apply(this, arguments);
    };

    XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
        this.__interfaceAjaxLog.request.headers[name] = value;

        return originalAJAX.setRequestHeader.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function (body) {
        if (typeof body === 'string')
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

            if (typeof this.response === 'string')
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

        const requestHeaders = {};
        request.headers.forEach((value, name) => {
            requestHeaders[name] = value;
        });

        const responseHeaders = {};
        response.headers.forEach((value, name) => {
            responseHeaders[name] = value;
        });

        const requestData = {
            headers: requestHeaders
        };

        const responseData = {
            status: response.status,
            headers: responseHeaders
        };

        try {
            if (request.method !== 'GET' && request.method !== 'HEAD')
                requestData.body = await request.clone().text();
        } catch {
        }

        try {
            responseData.body = await response.clone().text();
        } catch {
        }

        logAJAX({
            method: request.method,
            url: request.url,
            request: requestData,
            response: responseData
        });

        return response;
    };

    // WebSocket
    WebSocket.prototype.send = function (body) {

        // Catch incoming messages once for this WebSocket
        if (!this.__interfaceMessageListener) {
            this.addEventListener('message', event => {
                const log = {
                    method: 'WebSocket',
                    url: this.url,
                    direction: 'receive'
                };

                if (typeof event.data === 'string')
                    log.body = event.data;
                else
                    log.type = event.data?.constructor?.name ?? typeof event.data;

                logAJAX(log);
            });

            this.__interfaceMessageListener = true;
        }

        // Log outgoing message
        const log = {
            method: 'WebSocket',
            url: this.url,
            direction: 'send'
        };

        if (typeof body === 'string')
            log.body = body;
        else
            log.type = body?.constructor?.name ?? typeof body;

        logAJAX(log);

        return originalAJAX.sendWebSocket.apply(this, arguments);
    };
    //#endregion

    // Store/restore tool
    //#region memoryStorage
    class MemoryStorage {
        constructor() {
            this.memoryStorage = {};
        }

        set(...args) {
            if (args.length < 2)
                throw new TypeError('set requires a path and a value');

            const value = args.pop();
            this.validatePath(args);
            let current = this.memoryStorage;

            for (const key of args.slice(0, -1)) {
                if (!Object.prototype.hasOwnProperty.call(current, key)
                    || current[key] === null
                    || typeof current[key] !== 'object'
                    || Array.isArray(current[key])) {
                    Object.defineProperty(current, key, {
                        value: {}, writable: true, enumerable: true, configurable: true
                    });
                }
                current = current[key];
            }

            Object.defineProperty(current, args[args.length - 1], {
                value, writable: true, enumerable: true, configurable: true
            });
            return this;
        }

        remove(...path) {
            this.validatePath(path);
            let current = this.memoryStorage;

            for (const key of path.slice(0, -1)) {
                if (!Object.prototype.hasOwnProperty.call(current, key))
                    return false;
                current = current[key];
                if (current === null || typeof current !== 'object')
                    return false;
            }

            const key = path[path.length - 1];
            return Object.prototype.hasOwnProperty.call(current, key)
                && delete current[key];
        }

        validatePath(path) {
            if (!path.length || path.some(key => typeof key !== 'string' && typeof key !== 'number'))
                throw new TypeError('Path must contain string or number keys');
        }
    }
    //#endregion
    const memoryStorage = new MemoryStorage();

    const userStorage = await userStorageReady;
    //#region userStorage
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
        get(key) {
            return localStorage.getItem(this.prefix + key);
        }
        set(key, value) {
            localStorage.setItem(this.prefix + key, value);
        }
        remove(key) {
            localStorage.removeItem(this.prefix + key);
        }
    }
    //#endregion

    //#region Template renderer
    class TemplateRenderer {
        constructor(template, evaluate) {
            this.template = template;
            this.evaluate = evaluate;
        }

        render() {
            const template = document.createElement('template');
            template.innerHTML = this.template;

            const fragment = template.content;

            // 1. Tag-specific DOM transformations
            this.renderOverrides(fragment);

            // 2. General {{ ... }} processing
            this.renderExpressions(fragment, this.evaluate);

            // 3. Tag-specific finalisation
            this.renderFinalisations(fragment);

            return fragment;
        }

        renderOverrides(root) {
            this.renderTagMethods(root, 'Override');
        }

        renderFinalisations(root) {
            this.renderTagMethods(root, 'Finalisation');
        }

        renderTagMethods(root, suffix) {
            const processed = new WeakSet();

            while (true) {
                let element = null;

                /*
                 * DOM is queried again on every iteration,
                 * so newly created elements participate
                 * in the same pass.
                 */
                for (const candidate of root.querySelectorAll('*')) {
                    if (!processed.has(candidate)) {
                        element = candidate;
                        break;
                    }
                }

                if (!element)
                    break;

                processed.add(element);

                const method =
                    this[element.tagName.toLowerCase() + suffix];

                if (typeof method === 'function')
                    method.call(this, element);
            }
        }

        optionsOverride(options) {
            const forExpr = options.getAttribute('for');

            if (!forExpr)
                return;

            const attributes = [...options.attributes]
                .filter(attribute => attribute.name !== 'for');

            const content = options.innerHTML;

            this.evaluate(`
			for (const ${forExpr}) {
				callback(code => eval(code));
			}
		`, localEvaluate => {
                const option = document.createElement('option');

                for (const attribute of attributes)
                    option.setAttribute(
                        attribute.name,
                        attribute.value
                    );

                option.innerHTML = content;

                this.renderAttributes(option, localEvaluate);
                this.renderExpressions(option, localEvaluate);

                options.before(option);
            });

            options.remove();
        }

        selectFinalisation(select) {
            if (select.hasAttribute('value'))
                select.value = select.getAttribute('value');
        }

        renderExpressions(root, evaluate) {
            const walker = document.createTreeWalker(
                root,
                NodeFilter.SHOW_ELEMENT |
                NodeFilter.SHOW_TEXT
            );

            let node;

            while ((node = walker.nextNode())) {
                if (node.nodeType === Node.TEXT_NODE)
                    node.nodeValue =
                        this.renderExpression(node.nodeValue, evaluate);

                else
                    this.renderAttributes(node, evaluate);
            }
        }

        renderAttributes(element, evaluate) {
            for (const attribute of element.attributes)
                attribute.value =
                    this.renderExpression(attribute.value, evaluate);
        }

        renderExpression(text, evaluate) {
            return text.replace(
                /\{\{(.*?)\}\}/gs,
                (match, expression) =>
                    evaluate(expression.trim())
            );
        }
    }

    Element.prototype.appendTemplate = function (template, evaluate) {
        const renderer = new TemplateRenderer(template, evaluate);
        this.append(renderer.render());
    };
    Element.prototype.beforeTemplate = function (template, evaluate) {
        const renderer = new TemplateRenderer(template, evaluate);
        this.before(renderer.render());
    };
    Element.prototype.afterTemplate = function (template, evaluate) {
        const renderer = new TemplateRenderer(template, evaluate);
        this.after(renderer.render());
    };
    //#endregion

    //#region Template source
    const menuTemplate =
        `
<section id="interfaceSidebar" class="sidebar">
<div class="sidebar__content">
    <div class="sidebar__control">
        <ul class="sidebar__control-button-list">
            <li class="sidebar__control-button-list-item">
                <button class="sidebar__control-close-button" onclick="document.getElementById('interfaceSidebar').classList.remove('sidebar_open');
                         document.querySelector('.sidebar__overlay').classList.remove('sidebar__overlay_show');">
                    <svg class="sidebar__control-close-button-icon">
                        <use href="#hwa_sprite_close" data-href="close"></use>
                    </svg>
                </button>
            </li>
        </ul>
    </div>
    <div class="sidebar__content-item">
        <div class="sidebar__profile-data">
            <div class="sidebar__profile-data-avatar"><img
                    src="https://heroesweb-a.akamaihd.net/i/hw-web/v2/2042276//images/hw/avatar.png" alt="user avatar"
                    class="sidebar__profile-data-avatar-image"></div>
        </div>
    </div>
    <div class="sidebar__content-item">
        <div class="menu__politicies">
            <ul class="menu__politicies-list">
                <li class="menu__politicies-list-item"><a target="_blank" href="/policy/privacy/ru"
                        class="menu__politicies-link"><span class="menu__politicies-link-label">
                            Конфиденциальность
                        </span></a></li>
                <li class="menu__politicies-list-item"><a target="_blank" href="/policy/fan_content/ru"
                        class="menu__politicies-link"><span class="menu__politicies-link-label">
                            Фанатское соглашение
                        </span></a></li>
                <li class="menu__politicies-list-item"><a target="_blank" href="/drop-rates"
                        class="menu__politicies-link"><span class="menu__politicies-link-label">
                            Шансы на выпадение
                        </span></a></li>
            </ul>
        </div>
    </div>
</div>
</section>
`;
    //#endregion

    //#region Interface layout
    const header = await (async () => {
        let element;
        while (!(element = document.querySelector('.layout-header')))
            await new Promise(resolve => setTimeout(resolve, 100));
        return element;
    })();

    const logo = header.querySelector('.layout-header__logo-hw');

    // Interface button
    const buttonTemplate = `
<nav class="layout-nav" id="interfaceNav">
    <ul class="user-control-list">
        <li class="user-control-list-item">
            <button class="user-control-lang-button"
                onclick="document.getElementById('interfaceSidebar').classList.add('sidebar_open');
                         document.querySelector('.sidebar__overlay').classList.add('sidebar__overlay_show');">
                <span class="user-control-lang-button-label">\u23F8\u25B6</span>
            </button>
        </li>
    </ul>
</nav>
`;
    logo.afterTemplate(buttonTemplate,
        (code, callback) => eval(code));

    // Interface message
    const message = document.createElement('div');
    message.id = 'interfaceMessage';
    message.style.cssText = 'flex: 1; position: relative; overflow: visible';
    document.querySelector('#interfaceNav').after(message);

    const sidebar = document.querySelector('.sidebar');
    sidebar.afterTemplate(
        menuTemplate,
        (code, callback) => eval(code)
    );
    //#endregion

    // Fetch basic settings


})();
