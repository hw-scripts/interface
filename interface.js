(async function () {
    //#region Get manifest data
    class Manifest {
        #ready;

        constructor() {
            this.#ready = new Promise(resolve => {
                const receive = event => {
                    if (event.source !== window) return;
                    if (event.data?.type !== 'interface.Manifest') return;
                    for (const [name, value] of Object.entries(event.data.data)) {
                        Object.defineProperty(this, name, { value, enumerable: true });
                    }
                    window.removeEventListener('message', receive);
                    resolve();
                };
                window.addEventListener('message', receive);
            });
        }

        async load(timeout = 5000) {
            let timer;
            try {
                await Promise.race([
                    this.#ready,
                    new Promise((_, reject) => {
                        timer = setTimeout(() => reject(new Error('Manifest timeout')), timeout);
                    })
                ]);
            } finally {
                clearTimeout(timer);
            }
            return this;
        }
    }
    const manifest = new Manifest();
    //#endregion

    //#region Game integration
    class Game {
        constructor() {
            this.classes = Object.create(null);
            this.originals = Object.create(null);
            this.lambdaFunctions = Object.create(null);
            this.registry = null;
            const names = {
                BattlePresets: 'game.battle.controller.thread.BattlePresets',
                DataStorage: 'game.data.storage.DataStorage',
                BattleConfigStorage: 'game.data.storage.battle.BattleConfigStorage',
                BattleInstantPlay: 'game.battle.controller.instant.BattleInstantPlay',
                MultiBattleInstantReplay: 'game.battle.controller.instant.MultiBattleInstantReplay',
                MultiBattleResult: 'game.battle.controller.MultiBattleResult',
                PlayerMissionData: 'game.model.user.mission.PlayerMissionData',
                PlayerMissionBattle: 'game.model.user.mission.PlayerMissionBattle',
                GameModel: 'game.model.GameModel',
                CommandManager: 'game.command.CommandManager',
                MissionCommandList: 'game.command.rpc.mission.MissionCommandList',
                RPCCommandBase: 'game.command.rpc.RPCCommandBase',
                PlayerTowerData: 'game.model.user.tower.PlayerTowerData',
                TowerCommandList: 'game.command.tower.TowerCommandList',
                PlayerHeroTeamResolver: 'game.model.user.hero.PlayerHeroTeamResolver',
                BattlePausePopup: 'game.view.popup.battle.BattlePausePopup',
                BattlePopup: 'game.view.popup.battle.BattlePopup',
                DisplayObjectContainer: 'starling.display.DisplayObjectContainer',
                GuiClipContainer: 'engine.core.clipgui.GuiClipContainer',
                BattlePausePopupClip: 'game.view.popup.battle.BattlePausePopupClip',
                ClipLabel: 'game.view.gui.components.ClipLabel',
                ClipLabelBase: 'game.view.gui.components.ClipLabelBase',
                Translate: 'com.progrestar.common.lang.Translate',
                ClipButtonLabeledCentered: 'game.view.gui.components.ClipButtonLabeledCentered',
                BattlePausePopupMediator: 'game.mediator.gui.popup.battle.BattlePausePopupMediator',
                SettingToggleButton: 'game.mechanics.settings.popup.view.SettingToggleButton',
                PlayerDungeonData: 'game.mechanics.dungeon.model.PlayerDungeonData',
                NextDayUpdatedManager: 'game.model.user.NextDayUpdatedManager',
                BattleController: 'game.battle.controller.BattleController',
                BattleSettingsModel: 'game.battle.controller.BattleSettingsModel',
                BooleanProperty: 'engine.core.utils.property.BooleanProperty',
                RuleStorage: 'game.data.storage.rule.RuleStorage',
                BattleConfig: 'battle.BattleConfig',
                BattleGuiMediator: 'game.battle.gui.BattleGuiMediator',
                BooleanPropertyWriteable: 'engine.core.utils.property.BooleanPropertyWriteable',
                BattleLogEncoder: 'battle.log.BattleLogEncoder',
                BattleLogReader: 'battle.log.BattleLogReader',
                PlayerSubscriptionInfoValueObject: 'game.model.user.subscription.PlayerSubscriptionInfoValueObject',
                AdventureMapCamera: 'game.mechanics.adventure.popup.map.AdventureMapCamera',
                GameNavigator: 'game.screen.navigator.GameNavigator',
                TitanArtifactChestRewardPopupMediator: 'game.mechanics.titan_arena.mediator.chest.TitanArtifactChestRewardPopupMediator',
                ArtifactChestRewardPopupMediator: 'game.view.popup.artifactchest.rewardpopup.ArtifactChestRewardPopupMediator',
                GameBattleView: 'game.mediator.gui.popup.battle.GameBattleView',
                BattleThread: 'game.battle.controller.thread.BattleThread',
                Slider: 'feathers.controls.Slider',
                BuyItemPopup: 'game.view.popup.shop.buy.BuyItemPopup',
                BuyTitanArtifactItemPopup: 'game.view.popup.shop.buy.BuyTitanArtifactItemPopup',
                BuyTitanArtifactItemPopupMediator: 'game.mediator.gui.popup.shop.buy.BuyTitanArtifactItemPopupMediator',
                BuyItemPopupMediator: 'game.mediator.gui.popup.shop.buy.BuyItemPopupMediator',
                PopupMediatorBase: 'game.mediator.gui.popup.PopupMediatorBase',
                VipRuleValueObject: 'game.data.storage.rule.VipRuleValueObject',
                WorldMapStoryDrommerHelper: 'game.mediator.gui.worldmap.WorldMapStoryDrommerHelper',
                TeamGatherPopupMediator: 'game.mediator.gui.popup.team.TeamGatherPopupMediator',
                InvasionBossTeamGatherPopupMediator: 'game.mechanics.invasion.mediator.boss.InvasionBossTeamGatherPopupMediator',
                TeamGatherPopupHeroValueObject: 'game.mediator.gui.popup.team.TeamGatherPopupHeroValueObject',
                ObjectPropertyWriteable: 'engine.core.utils.property.ObjectPropertyWriteable',
                Player: 'game.model.user.Player',
                PlayerInventory: 'game.model.user.inventory.PlayerInventory',
                PlayerClanDominationData: 'game.mechanics.clanDomination.model.PlayerClanDominationData',
                Game: 'Game',
                MechanicStorage: 'game.data.storage.mechanic.MechanicStorage',
                PopupStashEventParams: 'game.mediator.gui.popup.PopupStashEventParams',
                CrossClanWarSelectModeMediator: 'game.mechanics.cross_clan_war.popup.selectMode.CrossClanWarSelectModeMediator',
                ClanIslandPopupMediator: 'game.view.gui.ClanIslandPopupMediator',
                PlayerShopData: 'game.model.user.shop.PlayerShopData',
                IntMap: 'haxe.ds.IntMap',
                PlayerShopDataEntry: 'game.model.user.shop.PlayerShopDataEntry',
                BrawlShopPopupMediator: 'game.mechanics.brawl.mediator.BrawlShopPopupMediator',
                PlayerSeasonAdventureData: 'game.mechanics.season_adventure.model.PlayerSeasonAdventureData',
            };
            for (const [name, property] of Object.entries(names))
                this.watchClass(name, property);
        }

        watchClass(name, property) {
            const game = this;
            const descriptor = Object.getOwnPropertyDescriptor(Object.prototype, property);
            if (descriptor) {
                console.warn('Game class registration is already intercepted:', property);
                return;
            }
            Object.defineProperty(Object.prototype, property, {
                configurable: true,
                set(value) {
                    // Preserve the game's own registry entry and class identity.
                    Object.defineProperty(this, property, {
                        value, writable: true, enumerable: true, configurable: true
                    });
                    game.registry ??= this;
                    game.classes[name] = value;
                    delete Object.prototype[property];
                    game.callFunction(name, value);
                }
            });
        }

        setFunction(name, lambda) {
            if (typeof name !== 'string' || typeof lambda !== 'function')
                throw new TypeError('setFunction requires a class name and a function');
            this.lambdaFunctions[name] = lambda;
            return this;
        }

        callFunction(name, value) {
            return this.lambdaFunctions[name]?.(value);
        }
    }
    const theGame = new Game();
    theGame.lib = null;
    theGame.libraryReady = new Promise(resolve => { theGame.resolveLibrary = resolve; });
    theGame.setFunction('GameModel', GameModel => {
        const hook = () => {
            const prototype = GameModel?.prototype;
            if (typeof prototype?.start !== 'function')
                return false;
            if (theGame.originals.GameModel)
                return true;

            const original = prototype.start;
            theGame.originals.GameModel = { start: original };
            prototype.start = function (...args) {
                theGame.lib = args[1]?.raw;
                console.log('playerAvatar:', theGame.lib?.playerAvatar);
                debugger;
                if (theGame.lib != null)
                    theGame.resolveLibrary(theGame.lib);
                return original.apply(this, args);
            };
            return true;
        };
        if (!hook()) {
            // Some builds finish defining the prototype after registration.
            queueMicrotask(() => {
                if (!hook())
                    console.warn('GameModel.start was not available after registration');
            });
        }
    });
    //#endregion

    //#region Working with AJAX
    // AJAX send filter
    class AjaxSendFilter {
        constructor() {
            this.lambdaFunctions = Object.create(null);
        }

        setFunction(method, url, lambda) {
            if (typeof method !== 'string' || typeof url !== 'string')
                throw new TypeError('Method and URL pattern must be strings');
            if (typeof lambda !== 'function')
                throw new TypeError('The last argument must be a function');

            // Validate the regular expression before registering the callback.
            new RegExp(url);
            const key = method.toLowerCase();
            this.lambdaFunctions[key] ??= Object.create(null);
            this.lambdaFunctions[key][url] = lambda;
            return this;
        }

        async callFunction(method, url, header, response) {
            const functions = this.lambdaFunctions[method.toLowerCase()];
            if (!functions)
                return;

            for (const [pattern, lambda] of Object.entries(functions)) {
                if (!new RegExp(pattern).test(url))
                    continue;

                try {
                    await lambda(header, response);
                } catch (error) {
                    console.error('AjaxSendFilter callback failed:', method, pattern, error);
                }
            }
        }
    }
    // Overriding the methods for sending requests to the server and receiving responses
    class AJAX {
        /**
         * @property sendFilter
         * @property fetchFilter
         * @property socketFilter
         */
        constructor() {
            const ajax = this;
            // Original functions
            ajax.original = {
                open: XMLHttpRequest.prototype.open,
                setRequestHeader: XMLHttpRequest.prototype.setRequestHeader,
                send: XMLHttpRequest.prototype.send,
                sendWebSocket: WebSocket.prototype.send,
                fetch: window.fetch
            };
            // XMLHttpRequest
            XMLHttpRequest.prototype.open = function (method, url) {
                this.requestObject = {
                    method,
                    url,
                    request: {
                        headers: {}
                    },
                    response: {
                        status: null,
                        headers: {}
                    }
                };
                return ajax.original.open.apply(this, arguments);
            };
            XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
                this.requestObject.request.headers[name] = value;
                return ajax.original.setRequestHeader.apply(this, arguments);
            };
            ajax.sendFilter = new AjaxSendFilter(); // Create sending filters set
            XMLHttpRequest.prototype.send = function (body) {
                this.requestObject.request.body = body;
                this.addEventListener('loadend', () => {
                    this.requestObject.response.status = this.status;
                    this.getAllResponseHeaders()
                        .trim()
                        .split(/[\r\n]+/)
                        .filter(Boolean)
                        .forEach(line => {
                            const index = line.indexOf(':');
                            if (index >= 0) {
                                const name = line.slice(0, index).trim();
                                const value = line.slice(index + 1).trim();
                                this.requestObject.response.headers[name] = value;
                            }
                        });
                    this.requestObject.response.body = this.response;
                    const headers = ((request, response) => Object.fromEntries(
                        new Map(
                            [...Object.entries(request), ...Object.entries(response)]
                                .map(([name, value]) => [name.toLowerCase(), [name, value]])
                        ).values()
                    ))(
                        this.requestObject.request.headers,
                        this.requestObject.response.headers
                    );
                    void ajax.sendFilter.callFunction(
                        this.requestObject.method,
                        this.requestObject.url,
                        headers,
                        this.response
                    );
                }, { once: true });
                return ajax.original.send.apply(this, arguments);
            };
            // fetch
            ajax.fetchFilter = new AjaxSendFilter(); // Create sending filters set
            window.fetch = async function (input, init) {
                const request = new Request(input, init);
                const response = await ajax.original.fetch.call(this, request);
                const headers = Object.fromEntries([
                    ...request.headers,
                    ...response.headers
                ]);
                try {
                    const body = await response.clone().text();
                    ajax.fetchFilter.callFunction(
                        request.method,
                        request.url,
                        headers,
                        body
                    );
                } catch (error) {
                    console.error('Fetch response processing failed:', error);
                }

                return response; return response;
            };

            // WebSocket
            ajax.socketFilter = new AjaxSendFilter(); // Create sending filters set
            const sockets = new WeakSet();
            const listen = socket => {
                if (sockets.has(socket)) return;
                sockets.add(socket);
                socket.addEventListener('message', event => {
                    void ajax.socketFilter.callFunction(
                        'receive', socket.url, { url: socket.url }, event.data
                    );
                });
            };
            window.WebSocket = new Proxy(window.WebSocket, {
                construct(target, args, newTarget) {
                    const socket = Reflect.construct(target, args, newTarget);
                    listen(socket);
                    return socket;
                }
            });
            WebSocket.prototype.send = function (body) {
                listen(this);
                ajax.socketFilter.callFunction(
                    'send',
                    this.url,
                    {},
                    body
                );
                return ajax.original.sendWebSocket.apply(this, arguments);
            };
        }
    }
    //#endregion
    const ajax = new AJAX();

    //#region Tasks
    class Task {
        #lambda = null;
        #enabled = true;
        #rules = [];
        #delay = 0;
        #timer = null;
        #run = null;
        #execution = null;
        #listeners = new Map();

        listen(name, lambda) {
            if (typeof lambda !== 'function') throw new TypeError('Expected an event handler');
            this.#listeners.set(name, lambda);
            return this;
        }

        async handleEvent(name, event) {
            if (!this.#enabled) return;
            return this.#listeners.get(name)?.call(this, event);
        }

        set(properties) {
            Object.assign(this, properties);
            return this;
        }

        callFunction(lambda) {
            if (typeof lambda !== 'function') throw new TypeError('Expected a function');
            this.#lambda = lambda;
            return this;
        }

        async call(properties) {
            this.set(properties);
            if (!this.#enabled) return;
            if (!this.#lambda) throw new Error('Task function is not set');
            return this.#lambda.call(this, this);
        }

        enable(enabled) {
            this.#enabled = Boolean(enabled);
            if (!this.#enabled) this.stop();
            return this;
        }

        repeatFor(count, interval = 0) {
            if (!Number.isInteger(count) || count < 0)
                throw new TypeError('Count must be a non-negative integer');
            return this.#addRule(completed => completed < count, interval);
        }

        repeatUntil(condition, interval = 0) {
            if (typeof condition !== 'function') throw new TypeError('Expected a condition function');
            return this.#addRule(() => !condition.call(this, this), interval);
        }

        repeatWhile(condition, interval = 0) {
            if (typeof condition !== 'function') throw new TypeError('Expected a condition function');
            return this.#addRule(() => condition.call(this, this), interval);
        }

        #addRule(test, interval) {
            this.#checkDelay(interval);
            this.#rules.push({ test, interval });
            return this;
        }

        #checkDelay(ms) {
            if (!Number.isFinite(ms) || ms < 0)
                throw new TypeError('Delay must be a non-negative number');
        }

        timeout(ms) {
            this.#checkDelay(ms);
            this.#delay = ms;
            return this;
        }

        start() {
            if (!this.#enabled || this.#run) return this;
            if (!this.#lambda) throw new Error('Task function is not set');

            const run = { completed: 0 };
            this.#run = run;
            const tick = async () => {
                try {
                    // A stopped invocation may still be finishing after a restart.
                    if (this.#execution) await this.#execution;
                    if (this.#run !== run) return;
                    if (!this.#rules.every(rule => rule.test(run.completed))) {
                        this.stop();
                        return;
                    }

                    const execution = this.call();
                    this.#execution = execution;
                    try {
                        await execution;
                    } finally {
                        if (this.#execution === execution) this.#execution = null;
                    }
                    if (this.#run !== run) return;
                    run.completed++;

                    if (!this.#rules.length) {
                        this.stop();
                        return;
                    }
                    const interval = Math.max(...this.#rules.map(rule => rule.interval));
                    this.#timer = setTimeout(tick, interval);
                } catch (error) {
                    if (this.#run === run) this.stop();
                    console.error('Task failed:', error);
                }
            };
            this.#timer = setTimeout(tick, this.#delay);
            return this;
        }

        stop() {
            clearTimeout(this.#timer);
            this.#timer = null;
            this.#run = null;
            return this;
        }
    }

    class Tasks {
        #tasks = new Map();
        #listeners = new Map();

        sendTo(signals) {
            for (const [signal, names] of Object.entries(signals)) {
                this.#listeners.get(signal)?.();
                const unsubscribe = Events.listen(signal, event => {
                    const tasks = names === true
                        ? this.#tasks.values()
                        : names.map(name => this.#tasks.get(name));
                    for (const task of tasks) {
                        if (!task) continue;
                        void task.handleEvent(signal, event).catch(error => {
                            console.error('Task event handler failed:', signal, error);
                        });
                    }
                });
                this.#listeners.set(signal, unsubscribe);
            }
            return this;
        }

        add(name) {
            if (this.#tasks.has(name)) throw new Error(`Task already exists: ${name}`);
            const task = new Task();
            this.#tasks.set(name, task);
            return task;
        }

        get(name) {
            return this.#tasks.get(name);
        }

        use(name) {
            return this.get(name);
        }

        start(name) {
            this.get(name)?.start();
            return this;
        }

        stop(name) {
            this.get(name)?.stop();
            return this;
        }
    }
    //#endregion

    //#region Bridge
    class Bridge {
        constructor(typeName) {
            let _lastId = 0;
            const _requests = new Map();
            const _typeName = typeName;

            // Register the Promise before sending its request.
            const send = (method, url, ...args) => new Promise((resolve, reject) => {
                const requestId = _lastId++;
                _requests.set(requestId, { resolve, reject });
                try {
                    window.postMessage({
                        type: `${_typeName}.request`,
                        requestId,
                        method,
                        args: [url, ...args]
                    });
                } catch (error) {
                    _requests.delete(requestId);
                    reject(error);
                }
            });

            Object.defineProperties(this, {
                get: { value: (url, ...args) => send('GET', url, ...args) },
                post: { value: (url, ...args) => send('POST', url, ...args) }
            });

            const publish = data => {
                if (data === null || typeof data !== 'object') return;
                for (const [name, value] of Object.entries(data)) {
                    Object.defineProperty(this, name, {
                        value,
                        writable: false,
                        enumerable: true,
                        configurable: true
                    });
                }
            };

            window.addEventListener('message', event => {
                if (event.source !== window) return;
                if (event.data?.type !== `${_typeName}.result`) return;

                const { requestId, data, error } = event.data;
                const registered = _requests.get(requestId);
                if (!registered) return;
                _requests.delete(requestId);

                if (error != null) {
                    registered.reject(new Error(error));
                    return;
                }

                try {
                    // Publish the properties before completing the Promise.
                    publish(data);
                    registered.resolve(data);
                } catch (error) {
                    registered.reject(error);
                }
            });
        }
    }
    //#endregion

    //#region Temporary debug logger filters
    ajax.logger = (protocol, method, header, response) => {
        const isEmpty = value =>
            value == null ||
            value === '' ||
            (Array.isArray(value)
                ? value.length === 0
                : typeof value === 'object' && Object.keys(value).length === 0);
        const data = {};
        if (!isEmpty(header)) data.header = header;
        if (!isEmpty(response)) data.response = response;
        if (!Object.keys(data).length) return;
        let json;
        try {
            json = JSON.stringify(data);
        } catch (error) {
            console.error('Stringify error:', error);
            return;
        }
        const text = json.length > 256
            ? json.slice(0, 253) + '...'
            : json;
        const key = `${protocol}:${method}.${Date.now()}`;

        while (true) {
            try {
                sessionStorage.setItem(key, text);
                return;
            } catch (error) {
                if (error.name !== 'QuotaExceededError')
                    throw error;
                const keys = Object.keys(sessionStorage)
                    .filter(key => key.startsWith(`${protocol}:`))
                    .sort((a, b) =>
                        Number(a.slice(a.lastIndexOf('.') + 1)) -
                        Number(b.slice(b.lastIndexOf('.') + 1)));
                if (!keys.length) throw error;
                keys
                    .slice(0, Math.max(1, Math.ceil(keys.length / 10)))
                    .forEach(key => sessionStorage.removeItem(key));
            }
        }
    };

    ajax.sendFilter.setFunction('get', '.*', (header, response) => {
        return ajax.logger('ajax', 'get', header, response);
    });
    ajax.sendFilter.setFunction('post', '.*', (header, response) => {
        return ajax.logger('ajax', 'post', header, response);
    });
    ajax.fetchFilter.setFunction('get', '.*', (header, response) => {
        return ajax.logger('fetch', 'get', header, response);
    });
    ajax.fetchFilter.setFunction('post', '.*', (header, response) => {
        return ajax.logger('fetch', 'post', header, response);
    });
    ajax.socketFilter.setFunction('send', '.*', (header, response) => {
        return ajax.logger('socket', 'send', header, response);
    });
    ajax.socketFilter.setFunction('receive', '.*', (header, response) => {
        return ajax.logger('socket', 'receive', header, response);
    });
    //#endregion

    //#region Storage for internal variables
    class MemoryStorage {
        constructor() {
            this.memoryStorage = {};
            this.lambdaFunctions = {};
        }

        set(...args) {
            if (args.length < 2)
                throw new TypeError('set requires a path and a value');

            const value = args.pop();
            return this.setAtPath(this.memoryStorage, args, value);
        }

        setFunction(...args) {
            if (args.length < 2)
                throw new TypeError('setFunction requires a path and a function');

            const lambda = args.pop();
            if (typeof lambda !== 'function')
                throw new TypeError('The last argument must be a function');

            return this.setAtPath(this.lambdaFunctions, args, lambda);
        }

        callFunction(...args) {
            if (args.length < 2)
                throw new TypeError('callFunction requires a path and a body');

            const body = args.pop();
            this.validatePath(args);
            let lambda = this.lambdaFunctions;

            for (const key of args) {
                if (lambda === null || typeof lambda !== 'object'
                    || !Object.prototype.hasOwnProperty.call(lambda, key))
                    return;
                lambda = lambda[key];
            }

            if (typeof lambda === 'function')
                return lambda(body);
        }

        setAtPath(storage, path, value) {
            this.validatePath(path);
            let current = storage;

            for (const key of path.slice(0, -1)) {
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

            Object.defineProperty(current, path[path.length - 1], {
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

    let resolveUserStorage;
    const userStorageReady = new Promise(resolve => { resolveUserStorage = resolve; });
    //#region Prepare awaiting definitions
    memoryStorage.setFunction('userGetInfo', result => {
        const user = result?.response;
        if (user?.id == null)
            return;
        memoryStorage.set('user', 'info', user);
        resolveUserStorage(user.id);
    });
    ajax.sendFilter.setFunction('post', '.*/api$', async (header, response) => {
        const data = typeof response === 'string' ? JSON.parse(response) : response;
        if (!Array.isArray(data?.results))
            return;

        for (const item of data.results) {
            if (!item || (typeof item.ident !== 'string' && typeof item.ident !== 'number'))
                continue;
            try {
                await memoryStorage.callFunction(item.ident, item.result);
            } catch (error) {
                console.error('MemoryStorage callback failed:', item.ident, error);
            }
        }
    });
    //#endregion

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
    
    await manifest.load(5000);
    //#region Events pseudo-class
    const Events = (() => {
        const prefix = `${manifest.typeName}:`;
        return {
            send(name, ...detail) {
                return window.dispatchEvent(new CustomEvent(prefix + name, { detail }));
            },
            listen(name, listener) {
                window.addEventListener(prefix + name, listener);
                return () => window.removeEventListener(prefix + name, listener);
            }
        };
    })();
    //#endregion
    
    const bridge = new Bridge(manifest.typeName);
    const userStorage = new UserStorage(await userStorageReady); // Await the real login and user info retrieval to ensure userStorage is ready for use

    //#region Language
    class Language {
        constructor(language) {
            this.language = language;
            this.translations = {};
            if (language)
                userStorage.set('language', language);
        }
        async load() {
            if (!this.language)
                return;
            try {
                const url = `${manifest.resource_BaseUrl}locales/${encodeURIComponent(this.language)}.json`;
                const response = await ajax.original.fetch.call(window, url);
                if (!response.ok)
                    throw new Error(`Language file returned HTTP ${response.status}`);
                const dictionary = await response.json();
                if (!dictionary || typeof dictionary !== 'object' || Array.isArray(dictionary))
                    throw new TypeError('Language file must contain an object');

                this.translations = dictionary;
            } catch (e) {
                console.error("Error dictionary load:", e);
            }
        }

        get(key) {
            return Object.prototype.hasOwnProperty.call(this.translations, key)
                && typeof this.translations[key] === 'string'
                ? this.translations[key]
                : `%${key}%`;
        }
    }
    const language = userStorage.get('language')?.trim().toLowerCase()
        || document.querySelector('.user-control-lang-button-label')
            ?.textContent.trim().toLowerCase()
        || null;
    const i18n = new Language(language);
    await i18n.load();
    //#endregion
    function I18N(key_name) { return i18n.get(key_name); }

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
            this.renderOverrides(fragment);
            this.renderExpressions(fragment, this.evaluate);
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

    //#region Game images
    class GameImages {
        constructor() {
            this.cache = new Map();
            this.assetIndexes = new Map();
            this.atlases = new Map();
            this.images = new Map();
        }

        async get(atlasKey, textureName) {
            const key = JSON.stringify([atlasKey, textureName]);
            if (!this.cache.has(key))
                this.cache.set(key, this.load(atlasKey, textureName));

            const result = await this.cache.get(key);
            if (!result)
                this.cache.delete(key);
            return result;
        }

        fetchCached(cache, url, read) {
            if (!cache.has(url)) {
                const request = ajax.original.fetch.call(window, url)
                    .then(response => {
                        if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
                        return read(response);
                    })
                    .catch(error => {
                        if (cache.get(url) === request) cache.delete(url);
                        throw error;
                    });
                cache.set(url, request);
            }
            return cache.get(url);
        }

        // Reads a named texture from a game atlas, using the HWrunner algorithm.
        // Mapping user.avatarId to atlasKey and textureName is added separately.
        async load(atlasKey, textureName) {
            try {
                atlasKey = String(atlasKey)
                    .replace(/^.*?\/assets\//i, '')
                    .replace(/\.([a-f0-9]{16,})\.xml$/i, '.xml');
                textureName = String(textureName);
                const flashVars = window.NXFlashVars;
                const indexUrl = String(flashVars?.index_url?.asset_index ?? '');
                const staticUrl = String(flashVars?.static_url ?? '').replace(/\/+$/, '');
                if (!indexUrl || !staticUrl) {
                    return '';
                }
                const index = await this.fetchCached(this.assetIndexes, indexUrl, response =>
                    indexUrl.toLowerCase().includes('.gz')
                        ? new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json()
                        : response.json());
                const atlasPath = index[atlasKey]?.path;
                if (!atlasPath) {
                    return '';
                }
                const atlasUrl = `${staticUrl}/assets/${atlasPath}`;
                const atlas = await this.fetchCached(this.atlases, atlasUrl, response => response.text());
                const imagePath = atlas.match(/<TextureAtlas\b[^>]*\bimagePath\s*=\s*["'](.*?)["']/i)?.[1];
                const frame = atlas.match(new RegExp(`<SubTexture\\b(?=[^>]*\\bname\\s*=\\s*["']${textureName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'])[^>]*>`, 'i'))?.[0];
                if (!imagePath || !frame) {
                    return '';
                }
                const readAttribute = (name) => Number(frame.match(new RegExp(`\\b${name}\\s*=\\s*["'](\\d+)["']`, 'i'))?.[1]);
                const [x, y, width, height] = ['x', 'y', 'width', 'height'].map(readAttribute);
                const imageKey = atlasKey.slice(0, atlasKey.lastIndexOf('/') + 1) + imagePath;
                const imageAssetPath = index[imageKey]?.path;
                if (!imageAssetPath || ![x, y, width, height].every(Number.isFinite)
                    || x < 0 || y < 0 || width <= 0 || height <= 0) {
                    return '';
                }
                const imageUrl = `${staticUrl}/assets/${imageAssetPath}`;
                const blob = await this.fetchCached(this.images, imageUrl, response => response.blob());
                const image = await createImageBitmap(blob);
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                canvas.getContext('2d').drawImage(image, x, y, width, height, 0, 0, width, height);
                image.close?.();
                return canvas.toDataURL();
            } catch (error) {
                console.warn('Unable to load game image', atlasKey, textureName, error);
                return '';
            }
        }
    }

    const gameImages = new GameImages();
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
        <div class="sidebar__profile-data" data-avatar-id="{{ memoryStorage.memoryStorage.user.info.avatarId }}">
            <div class="sidebar__profile-data-avatar"><img
                    src="https://heroesweb-a.akamaihd.net/i/hw-web/v2/2042276//images/hw/avatar.png" alt="user avatar"
                    class="sidebar__profile-data-avatar-image"></div>
            <div class="sidebar__profile-data-name">{{ memoryStorage.memoryStorage.user.info.name }}</div>
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

})();
