(async function () {
    const phase = (...details) => console.log('[Interface]', window === window.top ? 'top' : 'frame', location.href, ...details);
    phase('Script started');
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
    phase('Manifest listener installed');
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
                AssetStorage: 'game.assets.storage.AssetStorage',
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
    theGame.setFunction('VipRuleValueObject', VipRuleValueObject => {
        const hook = () => {
            const prototype = VipRuleValueObject?.prototype;
            const method = prototype?.__properties__?.get_clanQuestsFastFarm;
            if (typeof prototype?.[method] !== 'function') return false;
            prototype[method] = function () { return 0; };
            return true;
        };
        if (!hook()) queueMicrotask(() => {
            if (!hook()) console.warn('Clan quests fast farm property was not available after registration');
        });
    });

    function navigateToGameSection(section) {
        const { MechanicStorage, PopupStashEventParams, Game, GameNavigator } = theGame.classes;
        const mechanic = MechanicStorage?.[section];
        const instance = Object.entries(Game?.__properties__ ?? {})
            .find(([, name]) => name === 'get_instance')?.[0];
        const navigator = Object.entries(Game?.prototype?.__properties__ ?? {})
            .find(([, name]) => name === 'get_navigator')?.[0];
        const navigate = Object.keys(GameNavigator?.prototype ?? {})[20];
        if (mechanic == null || !instance || !navigator || !navigate || !PopupStashEventParams)
            throw new Error(`Game navigation is unavailable: ${section}`);
        return Game[instance]()[navigator]()[navigate](mechanic, new PopupStashEventParams());
    }
    let valkyriesBlessing = false;
    theGame.setFunction('BattleGuiMediator', BattleGuiMediator => {
        const hook = () => {
            const prototype = BattleGuiMediator?.prototype;
            const keys = prototype && Object.keys(prototype);
            const method = keys?.[45];
            if (typeof prototype?.[method] !== 'function') return false;
            const original = prototype[method];
            prototype[method] = function (...args) {
                if (!valkyriesBlessing) return original.apply(this, args);
                try {
                    const setValue = Object.keys(theGame.classes.BooleanPropertyWriteable.prototype)[0];
                    this[keys[9]][setValue](true);
                    this[keys[10]][setValue](true);
                } catch (error) {
                    console.error('Unable to enable Valkyries blessing:', error);
                    return original.apply(this, args);
                }
            };
            return true;
        };
        if (!hook()) queueMicrotask(() => {
            if (!hook()) console.warn('BattleGuiMediator acceleration method was not available after registration');
        });
    });
    phase('Game hooks installed');
    theGame.lib = null;
    // Read-only diagnostics for the already loaded Outland rules; no game requests or battles.
    Object.defineProperty(window, 'interfaceOutlandData', {
        configurable: true,
        value: () => ({
            ready: theGame.lib != null,
            libraryKeys: Object.keys(theGame.lib ?? {}),
            bossTables: Object.fromEntries(Object.entries(theGame.lib ?? {})
                .filter(([name]) => /boss/i.test(name))),
            heroes: theGame.lib?.hero,
            relatedClasses: Object.keys(theGame.registry ?? {})
                .filter(name => /boss|teamgather/i.test(name))
        })
    });
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
                phase('Game library received');
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

    //#region Game assets
    class GameAssets {
        #game;
        #images = null;

        constructor(game) {
            this.#game = game;
            this.index = null;
            this.config = null;
            this.storage = null;
            let resolveReady;
            this.ready = new Promise(resolve => { resolveReady = resolve; });

            game.setFunction('AssetStorage', AssetStorage => {
                const hook = () => {
                    const prototype = AssetStorage?.prototype;
                    if (typeof prototype?.init !== 'function') return false;
                    if (game.originals.AssetStorage) return true;

                    const assets = this;
                    const original = prototype.init;
                    game.originals.AssetStorage = { init: original };
                    prototype.init = function (...args) {
                        const result = original.apply(this, args);
                        assets.storage = this;
                        assets.index = args[0];
                        assets.config = args[1];
                        resolveReady(assets);
                        phase('Game asset configuration received', assets.config);
                        phase('Game asset index received', assets.index);
                        return result;
                    };
                    return true;
                };
                if (!hook()) {
                    queueMicrotask(() => {
                        if (!hook()) console.warn('AssetStorage.init was not available after registration');
                    });
                }
            });
        }

        async getUrl(name) {
            this.#images ??= new GameImages();
            return this.#images.getUrl(name);
        }

        getAtlas(section, id) {
            return this.config?.[section]?.[id] ?? null;
        }

        async getAvatarUrl(avatarId) {
            const [library] = await Promise.all([this.#game.libraryReady, this.ready]);
            const avatar = library.playerAvatar?.[avatarId];
            if (!avatar) return '';

            if (avatar.assetType === 'external_file') {
                return this.getUrl(avatar.assetOwnerId);
            }

            let atlasKey;
            let textureName;
            if (avatar.assetType === 'hero_icon') {
                atlasKey = this.getAtlas('inventory', avatar.assetTypeAtlas)?.atlas;
                textureName = avatar.assetOwnerId;
                if (!atlasKey) {
                    this.#images ??= new GameImages();
                    const indexedAtlases = (await this.#images.getAssetKeys()).filter(key => key.endsWith('.xml'));
                    const atlases = [...new Set([
                        ...indexedAtlases,
                        ...Object.values(this.config?.inventory ?? {}).map(entry => entry?.atlas)
                    ].filter(Boolean))];
                    return this.#images.getBest(atlases, textureName, 64, 64);
                }
            } else if (avatar.assetType === 'hero') {
                const reference = library.hero?.[avatar.assetOwnerId]?.iconAssetTexture;
                if (!reference) return '';
                const texture = String(reference);
                const separator = texture.lastIndexOf(':');
                atlasKey = separator > 0
                    ? texture.slice(0, separator)
                    : 'hero_icons_only/hero_icons_only.xml';
                textureName = separator >= 0
                    ? texture.slice(separator + 1)
                    : texture.slice(texture.lastIndexOf('/') + 1);
            } else {
                return '';
            }

            if (!atlasKey || !textureName) return '';
            this.#images ??= new GameImages();
            return this.#images.get(atlasKey, textureName);
        }
    }
    const gameAssets = new GameAssets(theGame);
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
                ajax.gameApi?.observe(this.requestObject);
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
                    void ajax.fetchFilter.callFunction(
                        request.method,
                        request.url,
                        headers
                    ).catch(error => {
                        console.error('Fetch response processing failed:', error);
                    });
                } catch (error) {
                    console.error('Fetch response processing failed:', error);
                }

                return response;
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
    const gameApi = new InterfaceGameApi(ajax.original);
    // Explicit read-only export for inspecting current pet eligibility rules.
    Object.defineProperty(window, 'interfacePetData', {
        configurable: true,
        value: async () => {
            if (!theGame.lib || !gameApi.headers) throw new Error('Game data is not ready; wait for the game to load.');
            const library = theGame.lib;
            return {
                pets: await gameApi.call('pet_getAll'),
                petLibrary: library.pet,
                relatedTables: Object.fromEntries(Object.entries(library)
                    .filter(([name]) => /pet|favor|patron/i.test(name))),
                relatedRules: Object.fromEntries(Object.entries(library.rule ?? {})
                    .filter(([name, rule]) => /pet|favor|patron/i.test(name + ' ' + JSON.stringify(rule)))),
                relatedClasses: Object.keys(theGame.registry ?? {})
                    .filter(name => /pet|favor|patron/i.test(name))
            };
        }
    });
    ajax.gameApi = gameApi;
    phase('AJAX hooks installed');

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
            (value instanceof ArrayBuffer || ArrayBuffer.isView(value)
                ? value.byteLength === 0
                : Array.isArray(value)
                ? value.length === 0
                : typeof value === 'object' && Object.keys(value).length === 0);
        const data = {};
        if (!isEmpty(header)) data.header = header;
        if (!isEmpty(response)) data.response = response;
        if (!Object.keys(data).length) return;
        let json;
        try {
            const ancestors = [];
            json = JSON.stringify(data, function (key, value) {
                if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
                    return { type: value.constructor.name, byteLength: value.byteLength };
                }
                if (value === null || typeof value !== 'object') return value;
                while (ancestors.length && ancestors[ancestors.length - 1] !== this) ancestors.pop();
                if (ancestors.includes(value)) return '[Circular]';
                ancestors.push(value);
                return value;
            });
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
        phase('userGetInfo received', { userId: user.id, avatarId: user.avatarId });
        resolveUserStorage(user.id);
    });
    ajax.sendFilter.setFunction('post', '.*/api/$', async (header, response) => {
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

    phase('Response filters installed; waiting for manifest');
    await manifest.load(5000);
    phase('Manifest ready');
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
    phase('Waiting for userGetInfo');
    const userStorage = new UserStorage(await userStorageReady); // Await the real login and user info retrieval to ensure userStorage is ready for use
    const automation = new InterfaceAutomation(theGame, gameApi, userStorage);
    automation.communityRequest = (url, options) => bridge.get(url, options);
    valkyriesBlessing = userStorage.get('valkyriesBlessing') === 'true';

    phase('UserStorage ready');
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
    phase('Loading language', language);
    await i18n.load();
    phase('Language loading finished');
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

        async getUrl(name) {
            const flashVars = window.NXFlashVars;
            const indexUrl = String(flashVars?.index_url?.asset_index ?? '');
            const staticUrl = String(flashVars?.static_url ?? '').replace(/\/+$/, '');
            if (!indexUrl || !staticUrl) return '';
            const index = await this.fetchCached(this.assetIndexes, indexUrl, response =>
                indexUrl.toLowerCase().includes('.gz')
                    ? new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json()
                    : response.json());
            const path = index[name]?.path;
            return path ? `${staticUrl}/assets/${path}` : '';
        }

        async getAssetKeys() {
            const indexUrl = String(window.NXFlashVars?.index_url?.asset_index ?? '');
            if (!indexUrl) return [];
            const index = await this.fetchCached(this.assetIndexes, indexUrl, response =>
                indexUrl.toLowerCase().includes('.gz')
                    ? new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json()
                    : response.json());
            return Object.keys(index);
        }

        async getBest(atlases, textureName, width, height) {
            const candidates = [];
            const fileName = `${textureName}.png`;
            const files = (await this.getAssetKeys()).filter(key =>
                key === fileName || key.endsWith(`/${fileName}`));
            for (const assetKey of files) {
                try {
                    const imageUrl = await this.getUrl(assetKey);
                    const blob = await this.fetchCached(this.images, imageUrl, response => response.blob());
                    const image = await createImageBitmap(blob);
                    candidates.push({ assetKey, imageUrl, width: image.width, height: image.height });
                    image.close?.();
                } catch (error) {
                    console.warn('Unable to inspect avatar image', assetKey, error);
                }
            }
            for (const atlas of atlases) {
                const texture = await this.readTexture(atlas, textureName);
                if (texture && !candidates.some(item => item.atlasKey === texture.atlasKey))
                    candidates.push(texture);
            }
            const sufficient = candidates.filter(item => item.width >= width && item.height >= height);
            const ranked = sufficient.length ? sufficient : candidates;
            ranked.sort((a, b) => sufficient.length
                ? a.width * a.height - b.width * b.height
                : Math.min(b.width / width, b.height / height) - Math.min(a.width / width, a.height / height));
            const selected = ranked[0];
            phase('Avatar texture candidates', {
                textureName, requestedWidth: width, requestedHeight: height,
                scannedAtlases: atlases.length,
                candidates: candidates.map(({ atlasKey, assetKey, width, height }) => ({ atlasKey, assetKey, width, height })),
                selected: selected && { atlasKey: selected.atlasKey, assetKey: selected.assetKey, width: selected.width, height: selected.height }
            });
            if (!selected) return '';
            return selected.assetKey ? selected.imageUrl : this.get(selected.atlasKey, textureName);
        }

        // Reads a named texture from a game atlas, using the HWrunner algorithm.
        // Mapping user.avatarId to atlasKey and textureName is added separately.
        async readTexture(atlasKey, textureName) {
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
                if (!index[atlasKey]) {
                    const matches = Object.keys(index).filter(key => key.endsWith(`/${atlasKey}`));
                    if (matches.length === 1) atlasKey = matches[0];
                }
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
                phase('Game image texture found', { atlasKey, textureName, imagePath, x, y, width, height, frame });
                const imageKey = atlasKey.slice(0, atlasKey.lastIndexOf('/') + 1) + imagePath;
                const imageAssetPath = index[imageKey]?.path;
                if (!imageAssetPath || ![x, y, width, height].every(Number.isFinite)
                    || x < 0 || y < 0 || width <= 0 || height <= 0) {
                    return '';
                }
                const imageUrl = `${staticUrl}/assets/${imageAssetPath}`;
                return { atlasKey, imageUrl, x, y, width, height };
            } catch (error) {
                console.warn('Unable to read game texture', atlasKey, textureName, error);
                return null;
            }
        }

        async load(atlasKey, textureName) {
            try {
                const texture = await this.readTexture(atlasKey, textureName);
                if (!texture) return '';
                const { imageUrl, x, y, width, height } = texture;
                const blob = await this.fetchCached(this.images, imageUrl, response => response.blob());
                const image = await createImageBitmap(blob);
                phase('Game image atlas loaded', { atlasKey, imageUrl, width: image.width, height: image.height });
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

    //#endregion

    //#region Template source
    const gameNavigationSections = [
        'MISSION',
        'ARENA',
        'GRAND',
        'CHEST',
        'SKILLS',
        'SOCIAL_GIFT',
        'CLAN',
        'ENCHANT',
        'TOWER',
        'RATING',
        'CHALLENGE',
        'BOSS',
        'CHAT',
        'CLAN_DUNGEON',
        'CLAN_CHEST',
        'TITAN_GIFT',
        'CLAN_RAID',
        'ASGARD',
        'HERO_ASCENSION',
        'ROLE_ASCENSION',
        'ASCENSION_CHEST',
        'TITAN_MISSION',
        'TITAN_ARENA',
        'TITAN_ARTIFACT',
        'TITAN_ARTIFACT_CHEST',
        'TITAN_VALLEY',
        'TITAN_SPIRITS',
        'TITAN_ARTIFACT_MERCHANT',
        'TITAN_ARENA_HALL_OF_FAME',
        'CLAN_PVP',
        'CLAN_PVP_MERCHANT',
        'CLAN_GLOBAL_PVP',
        'CLAN_GLOBAL_PVP_TITAN',
        'ARTIFACT',
        'ZEPPELIN',
        'ARTIFACT_CHEST',
        'ARTIFACT_MERCHANT',
        'EXPEDITIONS',
        'SUBSCRIPTION',
        'NY2018_GIFTS',
        'NY2018_TREE',
        'NY2018_WELCOME',
        'ADVENTURE',
        'ADVENTURESOLO',
        'SANCTUARY',
        'PET_MERCHANT',
        'PET_LIST',
        'PET_SUMMON',
        'BOSS_RATING_EVENT',
        'BRAWL',
    ];
    const menuSections = [
        { id: 'settings', title: 'MENU_GENERAL_SETTINGS' },
        { id: 'startup', title: 'MENU_STARTUP' },
        { id: 'scripts', title: 'MENU_SCRIPTS' },
        { id: 'autopilot', title: 'MENU_AUTOPILOT' },
        { id: 'navigation', title: 'MENU_NAVIGATION', hidden: true },
        { id: 'heroes', title: 'MENU_FARM_HEROES', hidden: true }
    ];
    const menuTemplate = `
<style>
    #interfaceSidebar .interface-menu-header { display: flex; align-items: center; gap: 12px; padding: 16px 20px; }
    #interfaceSidebar .interface-menu-brand { flex: 1; color: inherit; text-decoration: none; font-weight: 700; }
    #interfaceSidebar .interface-menu-version { display: block; font-size: 14px; font-weight: 400; opacity: .7; }
    #interfaceSidebar .interface-language { flex: 0 0 auto; padding: 4px 6px; border: 1px solid #d9bd7b; border-radius: 6px; background: #fffad6; color: #47230e; font: inherit; font-size: 16px; cursor: pointer; }
    #interfaceSidebar .interface-language:focus-visible { outline: 2px solid #f2bf69; outline-offset: 3px; }
    #interfaceSidebar .interface-menu-close, #interfacePanel .interface-cancel { background: transparent; border: 0; color: inherit; font: inherit; font-size: 26px; cursor: pointer; padding: 4px 10px; }
    #interfaceSidebar .interface-menu-actions { display: grid; gap: 5px; padding: 10px 12px; }
    #interfaceSidebar .interface-menu-action, #interfacePanel .interface-menu-action { box-sizing: border-box; width: 100%; padding: 7px 10px; margin: 0; height: auto; min-height: 36px; justify-content: flex-start; font: inherit; font-size: 16px; line-height: 1.3; text-align: left; cursor: pointer; }
    #interfaceSidebar .interface-menu-row { display: flex; align-items: center; gap: 5px; min-width: 0; }
    #interfaceSidebar .interface-menu-row > .interface-menu-action { flex: 1; min-width: 0; }
    #interfaceSidebar .interface-log-action { box-sizing: border-box; flex: 0 0 38px; width: 38px; height: 38px; padding: 8px; border: 1px solid #d9bd7b; border-radius: 7px; background: #fffad6; color: #704018; cursor: pointer; }
    #interfaceSidebar .interface-log-action svg { display: block; width: 100%; height: 100%; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    #interfaceSidebar .interface-menu-action:hover, #interfacePanel .interface-menu-action:hover { background: #ffebab; }
    #interfaceSidebar button:focus-visible, #interfaceSidebar a:focus-visible, #interfacePanel button:focus-visible { outline: 2px solid #f2bf69; outline-offset: 3px; }
    #interfaceSidebar { position: fixed; top: 0; right: 0; bottom: 0; width: min(360px, 90vw); height: 100dvh; z-index: 10002; transform: translateX(100%); color: #47230e; font-family: "Noto Sans", sans-serif; font-size: 16px; }
    #interfaceSidebar.sidebar_open { transform: translateX(0); }
    #interfaceSidebar .sidebar__content { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
    #interfaceSidebar .interface-menu-header { flex-shrink: 0; }
    #interfaceSidebar .interface-menu-version { display: inline; margin-left: 6px; }
    #interfaceSidebar.interface-section-open { width: min(560px, 90vw); }
    #interfaceSidebar [hidden], #interfaceLog[hidden] { display: none !important; }
    #interfacePanel { flex: 1; min-height: 0; }
    #interfacePanelForm { display: flex; flex-direction: column; height: 100%; }
    #interfacePanel .interface-panel-header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #d9bd7b; }
    #interfacePanel h2 { flex: 1; margin: 0; font-size: 18px; }
    #interfacePanel .interface-log-save, #interfacePanel .interface-header-add { flex: 0 0 38px; }
    #interfacePanel .interface-confirm, #interfacePanel .interface-cancel { border: 0; border-radius: 4px; padding: 6px 12px; color: white; font-size: 20px; cursor: pointer; }
    #interfacePanel .interface-confirm { background: #28783c; }
    #interfacePanel .interface-cancel { background: #a33333; }
    #interfacePanel .interface-panel-body { overflow-y: auto; min-height: 0; padding: 10px 12px; }
    #interfacePanel .interface-setting { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }
    #interfacePanel input, #interfacePanel select, #interfacePanel .interface-script-picker { font: inherit; }
    #interfacePanel input[type="number"] { width: 80px; }
    #interfaceLog { position: fixed; z-index: 10001; top: 16px; left: 16px; right: calc(min(560px, 90vw) + 16px); bottom: 16px; overflow-y: auto; color: #f5f5f5; text-shadow: 0 1px 2px #000; overflow-wrap: anywhere; pointer-events: none; }
    #interfaceLog > div { margin-bottom: 6px; padding: 8px 12px; background: #fffad6ed; color: #47230e; text-shadow: none; border-radius: 8px; font: 14px/1.5 "Noto Sans", sans-serif; }
    @media (max-width: 720px) { #interfaceLog { right: 16px; bottom: 55vh; } #interfaceSidebar.interface-section-open { top: 45vh; height: 55vh; width: 100vw; } }
    #interfacePanel .interface-script-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
    #interfacePanel .interface-script-list li { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 4px 8px; padding: 6px 8px; border: 1px solid #e2cd98; background: #fff4c4; border-radius: 4px; font-size: 16px; }
    #interfacePanel .interface-script-picker { margin: 0 0 10px; font-size: 16px; }
    #interfacePanel .interface-script-picker summary { cursor: pointer; padding: 6px; }
    #interfacePanel .interface-picker-children { margin-left: 16px; border-left: 1px solid #d9bd7b; padding-left: 8px; }
    #interfacePanel .interface-picker-row { display: list-item; min-height: 42px; }
    #interfacePanel .interface-picker-row > .interface-tree-icon { float: right; }
    #interfacePanel .interface-picker-script { width: 100%; text-align: left; padding: 7px; border: 0; background: transparent; color: inherit; font: inherit; cursor: pointer; }
    #interfacePanel .interface-script-list > li[hidden] { display: none; }
    #interfacePanel .interface-collect-accordion { grid-column: 1 / -1; min-width: 0; }
    #interfacePanel .interface-collect-children { display: grid; gap: 4px; padding-left: 16px; }
    #interfacePanel .interface-collect-group summary { cursor: grab; padding: 5px 0; font-weight: 600; }
    #interfacePanel .interface-collect-group.interface-dragging { opacity: .45; }
    #interfacePanel .interface-collect-group-items { display: grid; gap: 4px; padding-left: 12px; }
    #interfacePanel .interface-collect-order { margin: 4px 0; }
    #interfacePanel .interface-collect-order-hint { font-size: 12px; opacity: .75; margin: 4px 0; }
    #interfacePanel .interface-collect-position { font-size: 11px; opacity: .7; margin-right: 5px; }
    #interfacePanel .interface-collect-child[draggable] { cursor: grab; }
    #interfacePanel .interface-collect-child.interface-dragging { opacity: .45; }
    #interfacePanel .interface-collect-child { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 4px 8px; align-items: center; padding: 5px; border-left: 2px solid #d9bd7b; }
    #interfacePanel .interface-script-actions { display: flex; flex-wrap: nowrap; align-items: center; gap: 5px; }
    #interfacePanel .interface-tree-tools { display: flex; flex-wrap: nowrap; gap: 3px; align-items: center; }
    #interfacePanel .interface-tree-icon { box-sizing: border-box; display: inline-flex; flex: 0 0 38px; width: 38px; height: 38px; align-items: center; justify-content: center; border: 1px solid #d9bd7b; border-radius: 7px; background: #fffad6; color: #704018; cursor: pointer; padding: 8px; }
    #interfacePanel .interface-tree-icon svg { display: block; width: 100%; height: 100%; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    #interfacePanel .interface-tree-icon:hover { background: #f7e8b5; }
    #interfacePanel .interface-tree-icon.interface-run { flex-basis: 152px; width: 152px; background: #28783c; border-color: #28783c; color: white; }
    #interfacePanel .interface-tree-icon.interface-run:hover { background: #1e6330; }
    #interfacePanel .interface-tree-icon.interface-confirm { background: #28783c; color: white; border-color: #28783c; padding: 8px; }
    #interfacePanel .interface-tree-icon.interface-confirm.interface-header-run { flex-basis: 152px; width: 152px; }
    #interfacePanel .interface-header-run svg { width: 20px; height: 20px; }
    #interfacePanel .interface-tree-icon.interface-cancel { background: #a33333; color: white; border-color: #a33333; padding: 8px; }
    #interfacePanel .interface-tree-icon.interface-run svg { width: 20px; height: 20px; }
    #interfacePanel .interface-tree-children .interface-tree-icon:not(.interface-run) { flex-basis: 34px; width: 34px; height: 34px; }
    #interfacePanel .interface-tree-children .interface-tree-icon.interface-run { flex-basis: 136px; width: 136px; }
    #interfacePanel .interface-folder-edit { grid-column: 1 / -1; display: flex; align-items: center; gap: 6px; padding: 6px 0 2px 18px; }
    #interfacePanel .interface-folder-edit input { flex: 1; min-width: 0; }
    #interfacePanel .interface-script-actions .interface-menu-action { flex: 0 1 auto; width: auto; padding: 4px 6px; min-height: 32px; font-size: 13px; text-align: center; }
    #interfacePanel .interface-script-name { min-width: 0; overflow-wrap: anywhere; }
    #interfacePanel .interface-script-list li.interface-sequence-item { grid-template-columns: auto minmax(0, 1fr) auto; }
    #interfacePanel .interface-script-list li[data-reference-id] { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    #interfacePanel [data-reference-id] .interface-script-name { flex: 1 1 120px; }
    #interfacePanel [data-reference-id] input[type=number] { width: 65px; }
    #interfacePanel [data-sequence-script] { position: relative; z-index: 1; pointer-events: auto; cursor: pointer; margin: 0 4px 0 0; }
    #interfacePanel .interface-script-link { padding: 0; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
    #interfacePanel .interface-script-link:hover { text-decoration: underline; }
    #interfacePanel .interface-script-list li[draggable] { cursor: grab; }
    #interfacePanel .interface-script-list li.interface-dragging { opacity: .45; }
    #interfacePanel .interface-script-status:empty { display: none; }
    @media (max-width: 520px) { #interfacePanel .interface-script-list li { grid-template-columns: minmax(0, 1fr); } }
    #interfacePanel .interface-menu-action:disabled { opacity: .45; cursor: default; }
    #interfacePanel .interface-tree-children { grid-column: 1 / -1; margin-left: 20px; padding-left: 12px; border-left: 1px solid #d9bd7b; }
    #interfacePanel .interface-script-status { opacity: .7; font-size: 14px; }
</style>
<section id="interfaceSidebar" class="sidebar">
    <div class="sidebar__content">
        <div class="sidebar__control interface-menu-header">
            <a class="interface-menu-brand menu__help-title" href="{{ manifest.homepage_url }}" target="_blank" rel="noopener noreferrer">
                {{ manifest.name }}
                <span class="interface-menu-version">{{ manifest.version }}</span>
            </a>
            <select id="interfaceLanguage" class="interface-language" aria-label="{{ I18N('MENU_LANGUAGE') }}">
                <option value="uk">Українська</option>
                <option value="en">English</option>
                <option value="ru">Русский</option>
            </select>
            <button type="button" class="interface-menu-close" data-interface-close aria-label="{{ I18N('MENU_CLOSE') }}">&times;</button>
        </div>
        <nav class="interface-menu-actions">
            ${menuSections.filter(section => !section.hidden).map(section => `<div class="interface-menu-row"><button type="button" class="interface-menu-action menu__help-support-button" data-interface-dialog="${section.id}">{{ I18N('${section.title}') }}</button>${section.id === 'settings' ? `<button type="button" class="interface-log-action" data-interface-log-save title="{{ I18N('MESSAGE_LOG_SAVE') }}" aria-label="{{ I18N('MESSAGE_LOG_SAVE') }}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h12l2 2v16H5zM8 3v6h8V3M8 21v-8h8v8"/></svg></button><button type="button" class="interface-log-action" data-interface-log-clear title="{{ I18N('MESSAGE_LOG_CLEAR') }}" aria-label="{{ I18N('MESSAGE_LOG_CLEAR') }}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 10v7M14 10v7"/></svg></button>` : ''}</div>`).join('')}
        </nav>
        <section id="interfacePanel" hidden aria-labelledby="interfacePanelTitle">
            <form id="interfacePanelForm">
                <div class="interface-panel-header">
                    <h2 id="interfacePanelTitle" class="menu__help-title"></h2>
                    <button type="button" class="interface-tree-icon interface-header-add" data-interface-add-folder title="{{ I18N('SCRIPT_ADD_FOLDER') }}" aria-label="{{ I18N('SCRIPT_ADD_FOLDER') }}" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>
                    <button type="submit" class="interface-tree-icon interface-confirm" aria-label="{{ I18N('SCRIPT_SAVE') }}" title="{{ I18N('SCRIPT_SAVE') }}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L19 7"/></svg></button>
                    <button type="button" class="interface-tree-icon interface-cancel" aria-label="{{ I18N('MENU_CLOSE') }}" title="{{ I18N('MENU_CLOSE') }}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
                </div>
                <div class="interface-panel-body"></div>
            </form>
        </section>
    </div>
</section>
<aside id="interfaceLog" hidden aria-label="{{ I18N('MESSAGE_LOG') }}" aria-live="polite"></aside>

`;
    //#endregion

    //#region Interface layout
    phase('Templates ready; waiting for .layout-header');
    const header = await (async () => {
        let element;
        while (!(element = document.querySelector('.layout-header')))
            await new Promise(resolve => setTimeout(resolve, 100));
        return element;
    })();

    phase('Header found');
    const logo = header.querySelector('.layout-header__logo-hw');
    phase('Rendering menu button', { logoFound: Boolean(logo) });

    // Interface button
    const buttonTemplate = `
<nav class="layout-nav" id="interfaceNav">
    <ul class="user-control-list">
        <li class="user-control-list-item">
            <button type="button" class="user-control-lang-button">
                <span class="user-control-lang-button-label">\u23F8\u25B6</span>
            </button>
        </li>
    </ul>
</nav>
`;
    logo.afterTemplate(buttonTemplate,
        (code, callback) => eval(code));

    phase('Menu button rendered');
    // Interface message
    class MessageLog {
        constructor(element, ttl = 0, { overwrite = true, limit = Infinity } = {}) {
            this.element = element;
            this.entries = new Map();
            this.overwrite = overwrite;
            this.limit = limit;
            this.setTTL(ttl);
        }

        setTTL(value) {
            const seconds = Number(value);
            this.ttl = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
            if (!this.ttl && this.overwrite) {
                const entries = [...this.entries.values()];
                for (const entry of entries.slice(0, -1)) this.remove(entry.id);
            }
            for (const entry of this.entries.values()) this.schedule(entry);
        }

        remove(id) {
            const entry = this.entries.get(id);
            if (!entry) return;
            clearTimeout(entry.timer);
            entry.element.remove();
            this.entries.delete(id);
        }

        clear() {
            for (const id of this.entries.keys()) this.remove(id);
        }

        setLimit(value) {
            this.limit = Math.max(1, Math.floor(Number(value) || 20));
            while (this.entries.size > this.limit) this.remove(this.entries.keys().next().value);
        }

        schedule(entry) {
            clearTimeout(entry.timer);
            if (this.ttl && !entry.pending)
                entry.timer = setTimeout(() => this.remove(entry.id), this.ttl * 1000);
        }

        write(text, { id = Symbol(), pending = false } = {}) {
            // Countdown updates reuse id with pending: true; the final update clears pending to start TTL.
            if (!this.ttl && this.overwrite) {
                for (const previous of this.entries.keys()) {
                    if (previous !== id) this.remove(previous);
                }
            }
            let entry = this.entries.get(id);
            if (!entry) {
                entry = { id, element: document.createElement('div') };
                this.entries.set(id, entry);
                this.element.append(entry.element);
            }
            entry.element.textContent = text;
            entry.pending = pending;
            this.schedule(entry);
            while (this.entries.size > this.limit) this.remove(this.entries.keys().next().value);
            return id;
        }
    }

    const message = document.createElement('div');
    message.id = 'interfaceMessage';
    message.style.cssText = 'flex: 1; height: 0; min-width: 0; position: relative; z-index: 100; overflow: visible; cursor: pointer; color: #f5f5f5; text-shadow: 0 1px 2px #000; overflow-wrap: anywhere';
    const currentLog = new MessageLog(message, 0, { overwrite: false });
    currentLog.setLimit(userStorage.get('messageLimit') ?? 20);
    message.addEventListener('click', () => currentLog.clear());
    document.querySelector('#interfaceNav').before(message);

    const sidebar = document.querySelector('.sidebar');
    phase('Rendering sidebar', { sidebarFound: Boolean(sidebar) });
    sidebar.afterTemplate(
        menuTemplate,
        (code, callback) => eval(code)
    );
    const languageSelector = document.getElementById('interfaceLanguage');
    languageSelector.value = i18n.language;
    languageSelector.addEventListener('change', () => {
        userStorage.set('language', languageSelector.value);
        location.reload();
    });
    class CompactExecutionLog {
        constructor(storage, limit = 131072, recordLimit = 32768, retention = 48 * 60 * 60 * 1000) {
            Object.assign(this, { storage, limit, recordLimit, retention });
            this.pending = new Map();
            try {
                const saved = JSON.parse(storage.get('executionLog:v1') ?? '[]');
                this.entries = Array.isArray(saved) ? saved.filter(row => Array.isArray(row) && row.length === 4 &&
                    typeof row[0] === 'string' && typeof row[1] === 'number' && typeof row[2] === 'string' &&
                    Array.isArray(row[3]) && row[3].every(event => Array.isArray(event) && event.length === 4 &&
                        typeof event[0] === 'string' && Array.isArray(event[1]) && event[1].every(bucket => Array.isArray(bucket) && bucket.length === 2 && Number.isSafeInteger(bucket[0]) && Number.isSafeInteger(bucket[1]) && bucket[1] > 0) &&
                        typeof event[2] === 'number' && typeof event[3] === 'string')) : [];
            } catch { this.entries = []; }
            this.trim();
        }
        trim() {
            const cutoff = Date.now() - this.retention;
            const cutoffHour = Math.floor(cutoff / 3600000);
            for (const row of this.entries) {
                for (const event of row[3]) event[1] = event[1].filter(bucket => bucket[0] >= cutoffHour);
                row[3] = row[3].filter(event => event[1].length);
            }
            this.entries = this.entries.filter(row => row[3].length || row[1] >= cutoff);
            for (const row of this.entries)
                while (JSON.stringify(row[3]).length > this.recordLimit && row[3].length > 1) row[3].shift();
            let serialized = JSON.stringify(this.entries);
            while (serialized.length > this.limit && this.entries.length > 1) {
                this.entries.shift(); serialized = JSON.stringify(this.entries);
            }
            while (serialized.length > this.limit && this.entries.length && this.entries[0][3].length) {
                this.entries[0][3].shift(); serialized = JSON.stringify(this.entries);
            }
            return serialized;
        }
        persist() {
            try { this.storage.set('executionLog:v1', this.trim()); }
            catch (error) { console.warn('Unable to save execution log:', error); }
        }
        clear() { this.entries = []; this.pending.clear(); this.persist(); }
        start(section, name) {
            this.trim();
            let row = this.entries.find(item => item[0] === section);
            if (!row) { row = [section, Date.now(), String(name).slice(0, 128), []]; this.entries.push(row); }
            else { row[1] = Date.now(); row[2] = String(name).slice(0, 128); }
            for (const [id, state] of this.pending) if (state.section === section) this.pending.delete(id);
            this.persist();
        }
        write(section, key, text, { id, pending = false } = {}) {
            this.trim();
            let row = this.entries.find(item => item[0] === section);
            if (!row) { this.start(section, section); row = this.entries.find(item => item[0] === section); }
            const now = Date.now(), raw = String(text), value = raw.length > 24000 ? `${raw.slice(0, 24000)}\n[truncated]` : raw, eventKey = String(key).slice(0, 512);
            let event = row[3].find(item => item[0] === eventKey);
            const prior = id !== undefined ? this.pending.get(id) : null;
            const isNew = !event;
            if (isNew) { event = [eventKey, [], now, value]; row[3].push(event); }
            if (isNew || !prior || prior.section !== section || prior.key !== eventKey) {
                const hour = Math.floor(now / 3600000);
                let bucket = event[1].find(item => item[0] === hour);
                if (!bucket) { bucket = [hour, 0]; event[1].push(bucket); }
                bucket[1]++;
            }
            event[2] = now; event[3] = value;
            if (id !== undefined) {
                if (pending) this.pending.set(id, {section, key: eventKey});
                else this.pending.delete(id);
            }
            row[1] = now;
            row[3].splice(row[3].indexOf(event), 1); row[3].push(event);
            this.entries.splice(this.entries.indexOf(row), 1); this.entries.push(row);
            this.persist();
        }
        text() {
            this.trim();
            return this.entries.map(([, time, name, events]) => `${name} (${new Date(time).toLocaleString()})\n  ${events.map(([, buckets, eventTime, text]) => { const count = buckets.reduce((sum, bucket) => sum + bucket[1], 0); return `${new Date(eventTime).toLocaleString()} ${text}${count > 1 ? ` ×${count}` : ''}`; }).join('\n  ')}`).join('\n\n');
        }
        static diagnostic(value, limit = 10000) {
            const seen = new WeakSet();
            try {
                const json = JSON.stringify(value, (key, item) => {
                    if (item && typeof item === 'object') {
                        if (seen.has(item)) return '[circular]';
                        seen.add(item);
                    }
                    return item;
                }, 2);
                if (json === undefined) return 'null';
                return json.length > limit ? `${json.slice(0, limit)}\n[truncated]` : json;
            } catch { return '[unserializable]'; }
        }
    }
    const interfaceSidebar = document.getElementById('interfaceSidebar');
    const panel = document.getElementById('interfacePanel');
    const panelForm = document.getElementById('interfacePanelForm');
    const panelTitle = panel.querySelector('h2');
    const panelBody = panel.querySelector('.interface-panel-body');
    const mainMenu = interfaceSidebar.querySelector('.interface-menu-actions');
    const executionLog = new CompactExecutionLog(userStorage);
    const logSave = mainMenu.querySelector('[data-interface-log-save]');
    const logClear = mainMenu.querySelector('[data-interface-log-clear]');
    const headerAdd = panel.querySelector('[data-interface-add-folder]');
    let headerAddAction = null;
    headerAdd.addEventListener('click', () => headerAddAction?.());
    logSave.addEventListener('click', () => {
        const blob = new Blob(['\uFEFF', executionLog.text()], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const nickname = String(memoryStorage.memoryStorage.user?.info?.name || memoryStorage.memoryStorage.user?.info?.id || 'account')
            .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim() || 'account';
        link.href = url; link.download = `${nickname}-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    logClear.addEventListener('click', () => executionLog.clear());
    const logElement = document.getElementById('interfaceLog');
    const messageLog = new MessageLog(logElement, userStorage.get('messageTTL') ?? 0);
    const scriptText = value => i18n.translations[value] || value;
    const scriptReports = new Map();
    const logProgress = new Map();
    let savePanel;
    let cancelPanel;
    let sequenceRunning = false;
    let sequenceView = false;
    let pilot;
    const syncOverlay = document.querySelector('.sidebar__overlay');
    const reloadNotice = document.createElement('button');
    reloadNotice.type = 'button';
    reloadNotice.textContent = I18N('SCRIPT_RELOAD_REQUIRED');
    reloadNotice.style.cssText = 'position:absolute;bottom:24px;left:24px;padding:16px;background:#fff8d6;color:#49270e;border:2px solid #c89445;border-radius:8px;font-size:16px;cursor:pointer;';
    reloadNotice.hidden = true;
    reloadNotice.addEventListener('click', event => {
        event.stopPropagation();
        location.reload();
    });
    syncOverlay?.append(reloadNotice);
    automation.onRequiresReload = () => {
        syncOverlay?.classList.add('sidebar__overlay_show');
        reloadNotice.hidden = false;
    };
    const returnToMenu = () => {
        panel.hidden = true;
        mainMenu.hidden = false;
        logElement.hidden = true;
        interfaceSidebar.classList.remove('interface-section-open');
        panelBody.replaceChildren();
        savePanel = cancelPanel = null;
        sequenceView = false;
    };
    const closeMenu = () => {
        returnToMenu();
        interfaceSidebar.classList.remove('sidebar_open');
        if (!automation.requiresReload) syncOverlay?.classList.remove('sidebar__overlay_show');
    };
    const openPanel = (title, scripts = false) => {
        mainMenu.hidden = true;
        panel.hidden = false;
        panelTitle.textContent = title;
        panelBody.replaceChildren();
        interfaceSidebar.classList.add('interface-section-open');
        logElement.hidden = !scripts;
        headerAdd.hidden = true; headerAddAction = null;
        savePanel = cancelPanel = returnToMenu;
        sequenceView = false;
        panel.querySelector('.interface-confirm').disabled = false;
        panel.querySelector('.interface-confirm').setAttribute('aria-label', I18N('SCRIPT_SAVE'));
        panel.querySelector('.interface-confirm').title = I18N('SCRIPT_SAVE');
        panel.querySelector('.interface-confirm').classList.remove('interface-header-run');
        panel.querySelector('.interface-confirm').innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L19 7"/></svg>';
    };
    panelForm.addEventListener('submit', event => {
        event.preventDefault();
        savePanel?.();
    });
    panel.querySelector('.interface-cancel').addEventListener('click', () => cancelPanel?.());
    document.querySelector('#interfaceNav button').addEventListener('click', () => {
        interfaceSidebar.classList.add('sidebar_open');
        document.querySelector('.sidebar__overlay')?.classList.add('sidebar__overlay_show');
    });
    document.querySelector('.sidebar__overlay')?.addEventListener('click', closeMenu);
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && interfaceSidebar.classList.contains('sidebar_open')) closeMenu();
    });
    const refreshRunButtons = () => {
        if (sequenceView) panel.querySelector('.interface-confirm').disabled = sequenceRunning || Boolean(automation.running);
        for (const button of panelBody.querySelectorAll('[data-interface-run]')) {
            const active = automation.running?.section === button.dataset.interfaceRun;
            const label = I18N(active ? 'SCRIPT_STOP' : 'SCRIPT_RUN_CONFIGURED');
            button.title = label; button.setAttribute('aria-label', label);
            button.innerHTML = active ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10v10H7z"/></svg>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z"/></svg>';
            button.disabled = Boolean(automation.running && (!active || automation.running.stopped)) || sequenceRunning && !active;
        }
    };
    const reportScript = (section, key, detail, options = {}) => {
        const text = `${scriptText(key)}${detail == null ? '' : `: ${detail}`}`;
        scriptReports.set(section, text);
        for (const status of panelBody.querySelectorAll(`[data-interface-status="${section}"]`)) status.textContent = ` (${text})`;
        const entry = { ...options, id: options.id ?? Symbol() };
        const isError = /FAILED|ERROR/.test(key);
        const final = options.final === true || ['SCRIPT_DONE', 'SCRIPT_STOPPED', 'SCRIPT_NOTHING_TO_COLLECT', 'SCRIPT_DAILY_BONUS_ALREADY_COLLECTED', 'SCRIPT_DAILY_BONUS_COLLECTED'].includes(key);
        if (isError || final) {
            const progress = logProgress.get(section);
            const noAction = automation.lastResult?.changed === false && ['SCRIPT_DONE', 'SCRIPT_NOTHING_TO_COLLECT', 'SCRIPT_DAILY_BONUS_ALREADY_COLLECTED'].includes(key);
            const summary = [...(progress?.results?.values() || [])].join('; ');
            const result = noAction ? I18N('SCRIPT_CHECKED_NO_ACTION') : key === 'SCRIPT_DONE' || key === 'SCRIPT_NOTHING_TO_COLLECT' && automation.lastResult?.changed ? summary || progress?.last || text : text;
            const diagnostic = options.error ? [options.error.rpcMethod && `RPC: ${options.error.rpcMethod}`,
                options.error.rpcErrorName && `RPC error: ${options.error.rpcErrorName}`,
                options.error.httpStatus && `HTTP: ${options.error.httpStatus}`,
                options.error.rpcRequest && `Request: ${CompactExecutionLog.diagnostic(options.error.rpcRequest)}`,
                Object.prototype.hasOwnProperty.call(options.error, 'rpcResponse') && `Response: ${CompactExecutionLog.diagnostic(options.error.rpcResponse)}`,
                options.error.stack].filter(Boolean).join('\n') : '';
            const record = diagnostic ? `${result}\n${diagnostic}` : result;
            currentLog.write(`${I18N(`NAV_${section}`)}: ${result}`, entry);
            messageLog.write(`${I18N(`NAV_${section}`)}: ${record}`, entry);
            const errorKey = isError ? `${key}:${detail ?? ''}:${options.error?.rpcRequest ? CompactExecutionLog.diagnostic(options.error.rpcRequest, 300) : ''}` : key;
            executionLog.write(section, errorKey, record, entry);
        } else if (key !== 'SCRIPT_RUNNING' && !options.pending) {
            const progress = logProgress.get(section) || { last: '', results: new Map() };
            progress.last = text;
            if (/COLLECTED|SENT|OPENED|RAIDED|CHEST|BOUGHT|UPGRADED|EXCHANGE_COINS|_DONE|GIFT_AMOUNT|GIFT_COLLECTED/.test(key)) progress.results.set(key, text);
            logProgress.set(section, progress);
        }
    };
    const settingInput = (label, type, value, min = 0) => {
        const wrapper = document.createElement('label');
        wrapper.className = 'interface-setting';
        const input = document.createElement('input');
        input.type = type;
        if (type === 'checkbox') input.checked = value;
        else { input.min = String(min); input.step = '1'; input.required = true; input.value = String(value); }
        wrapper.append(input, label);
        panelBody.append(wrapper);
        return input;
    };
    const showScriptSettings = (section, reference = null, kind = null) => {
        openPanel(`${I18N(`NAV_${section}`)} — ${I18N('SCRIPT_CONFIGURE')}`, true);
        const settings = reference ? { ...automation.settings(section), ...reference.settings } : automation.settings(section);
        const inputs = {};
        for (const [name, initial] of Object.entries(automation.definitions[section].fields))
            inputs[name] = settingInput(I18N(section === 'BOSS' && name === 'battles'
                ? 'SCRIPT_OPTION_OUTLANDBATTLES' : `SCRIPT_OPTION_${name.toUpperCase()}`),
                typeof initial === 'number' ? 'number' : typeof initial === 'string' ? 'text' : 'checkbox', typeof initial === 'boolean' ? settings[name] === true : settings[name], section === 'HERO_UPGRADE' || section === 'ITEM_EXCHANGE' || section === 'ENERGY_BOXES' || section === 'TITAN_ARENA' || section === 'ADVENTURE' || section === 'ADVENTURE_SOLO' || name === 'limit' ? 0 : 1);
        if (!Object.keys(inputs).length) { const note = document.createElement('p'); note.textContent = I18N('SCRIPT_NO_SETTINGS'); panelBody.append(note); }
        if (section === 'HERO_UPGRADE') {
            const note = document.createElement('p');
            note.textContent = I18N('SCRIPT_UPGRADE_STAGE');
            panelBody.append(note);
        }
        savePanel = () => {
            if (section === 'HERO_UPGRADE' && Object.values(inputs).some(input =>
                !Number.isSafeInteger(Number(input.value)) || Number(input.value) < 0)) return;
            const values = Object.fromEntries(Object.entries(inputs).map(([name, input]) =>
                [name, input.type === 'number' ? Number(input.value) : input.type === 'checkbox' ? input.checked : input.value]));
            if (reference) references.update(kind, reference.id, values); else automation.save(section, values);
            showSection(kind || 'scripts');
        };
        cancelPanel = () => showSection(kind || 'scripts');
    };
    const runScript = async (section, button, status, inSequence = false, overrideSettings = null) => {
        if (automation.running || sequenceRunning && !inSequence) {
            if (status) status.textContent = I18N('SCRIPT_ALREADY_RUNNING');
            return false;
        }
        currentLog.clear();
        logProgress.delete(section);
        executionLog.start(section, I18N(`NAV_${section}`));
        const executedSettings = pilot.fingerprint(section);
        let stopped = false;
        const report = (key, detail, options) => {
            if (key === 'SCRIPT_STOPPED') stopped = true;
            reportScript(section, key, detail, options);
        };
        report('SCRIPT_RUNNING');
        try {
            const execution = automation.run(section, report, overrideSettings);
            refreshRunButtons();
            await execution;
            const completed = !stopped && automation.lastResult?.completed !== false;
            if (completed && !inSequence) pilot.checkpoint(section, executedSettings);
            return completed;
        } catch (error) {
            console.error('Automation failed:', section, error);
            report('SCRIPT_FAILED', scriptText(error.message), { error });
            return false;
        } finally { refreshRunButtons(); }
    };
    const menuTree = automation.menuTree = new InterfaceMenuTree(automation, userStorage, menuSections, gameNavigationSections);
    const references = new InterfaceScriptReferences(automation, userStorage);
    if (userStorage.get('scriptReferences:autopilot:v1') === null) {
        let oldOptions; try { oldOptions = JSON.parse(userStorage.get('autopilotSettings') || '{}'); } catch { oldOptions = {}; }
        let oldProgress; try { oldProgress = JSON.parse(userStorage.get('autopilotProgress') || '{}'); } catch { oldProgress = {}; }
        oldProgress.completed ??= {};
        oldOptions.intervals ??= {};
        for (const section of menuTree.sequence('scripts', { atomicCollect: true })) {
            const entry = references.add('autopilot', section);
            if (!entry) continue;
            if (oldOptions.intervals[section] != null) oldOptions.intervals[entry.id] = oldOptions.intervals[section];
            const checkpoint = oldProgress.completed[section];
            if (section !== 'COLLECT_ALL' && checkpoint?.settings === JSON.stringify(entry.settings))
                oldProgress.completed[entry.id] = { ...checkpoint, settings: JSON.stringify({ section, settings: entry.settings }) };
        }
        userStorage.set('autopilotSettings', JSON.stringify(oldOptions));
        userStorage.set('autopilotProgress', JSON.stringify(oldProgress));
        if (userStorage.get('scriptReferences:autopilot:v1') === null) references.save('autopilot', []);
    }
    const applyMenuOrder = () => {
        for (const node of menuTree.nodes) {
            const button = mainMenu.querySelector(`[data-interface-dialog="${node.id}"]`);
            if (button) { button.dataset.nodeId = node.id; mainMenu.append(button.closest('.interface-menu-row')); }
        }
    };
    applyMenuOrder();
    let draggedMenu = null;
    for (const button of mainMenu.querySelectorAll('[data-interface-dialog]')) {
        button.draggable = true;
        button.addEventListener('dragstart', event => { draggedMenu = button.dataset.nodeId; event.dataTransfer.setData('text/plain', draggedMenu); });
        button.addEventListener('dragend', () => { draggedMenu = null; });
        button.addEventListener('dragover', event => { if (draggedMenu) event.preventDefault(); });
        button.addEventListener('drop', event => {
            if (!draggedMenu) return;
            event.preventDefault();
            const bounds = button.getBoundingClientRect();
            menuTree.move(draggedMenu, button.dataset.nodeId, event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after');
            draggedMenu = null; applyMenuOrder();
        });
    }
    pilot = new InterfaceAutopilot(automation, userStorage, {
        execute: entry => typeof entry === 'object' ? runScript(entry.section, null, null, true, entry.settings) : runScript(entry, null, null, true),
        sections: () => references.entries('autopilot'),
        ready: () => Boolean(gameApi.headers && theGame.lib),
        userInfo: () => memoryStorage.memoryStorage.user.info,
        changed: () => {
            sequenceRunning = pilot.running;
            refreshRunButtons();
        }
    });
    const runSequence = sections => pilot.run(sections, 'manual_explicit');
    if (!pilot.state.pending && references.entries('startup').length) {
        const startWhenReady = () => {
            if (!gameApi.headers || !theGame.lib || pilot.running || automation.running) { setTimeout(startWhenReady, 500); return; }
            void pilot.run(references.entries('startup'), 'startup');
        };
        setTimeout(startWhenReady, 0);
    }
    const inputDocuments = new Set();
    const onActivity = event => { if (event.isTrusted) pilot.activity(); };
    const watchActivity = doc => {
        if (inputDocuments.has(doc)) return;
        inputDocuments.add(doc);
        for (const name of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'])
            doc.addEventListener(name, onActivity, { capture: true, passive: true });
        for (const frame of doc.querySelectorAll('iframe')) {
            try { if (frame.contentDocument) watchActivity(frame.contentDocument); } catch {}
        }
        doc.addEventListener('load', event => {
            try { if (event.target.tagName === 'IFRAME' && event.target.contentDocument) watchActivity(event.target.contentDocument); } catch {}
        }, true);
    };
    watchActivity(document);
    window.addEventListener('pagehide', () => {
        pilot.dispose();
        for (const doc of inputDocuments)
            for (const name of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'])
                doc.removeEventListener(name, onActivity, true);
    }, { once: true });
    const treeOpen = new Set();
    let autopilotDraft = null;
    const treeIcon = (symbol, label, action) => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'interface-tree-icon';
        const icons = { '+': 'M12 5v14M5 12h14', '✎': 'M4 20l4-.7L19 8l-3-3L5 16zM14.5 6.5l3 3',
            '×': 'M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 10v7M14 10v7',
            '▶': 'M8 5l11 7-11 7z', '▸': 'M9 6l6 6-6 6', '▾': 'M6 9l6 6 6-6',
            '⚙': 'M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z' };
        button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[symbol] || icons['⚙']}"/></svg>`;
        button.title = label; button.setAttribute('aria-label', label); button.addEventListener('click', action); return button;
    };
    const manualFolderLabel = folderId => {
        const groups = { collection_main: 'MAIN', collection_events: 'EVENTS', collection_resources: 'RESOURCES', collection_exchange: 'EXCHANGE', collection_other: 'OTHER' };
        const fallback = folderId === 'collect_all' ? I18N('NAV_COLLECT_ALL') : folderId.startsWith('sequence_') ? I18N('SCRIPT_SEQUENCE_NAME') : I18N(`SCRIPT_COLLECT_GROUP_${groups[folderId] ?? 'OTHER'}`);
        return menuTree.folderName(folderId, i18n.language, fallback);
    };
    const showSection = id => {
        const section = menuSections.find(item => item.id === id);
        if (!section) return;
        openPanel(I18N(section.title), id === 'scripts');
        if (id === 'settings') {
            const blessing = settingInput(I18N('VALKYRIES_BLESSING'), 'checkbox', valkyriesBlessing);
            const ttl = settingInput(I18N('MESSAGE_TTL'), 'number', messageLog.ttl);
            const limit = settingInput(I18N('MESSAGE_LIMIT'), 'number', currentLog.limit, 1);
            const battles = document.createElement('h3');
            battles.textContent = I18N('SETTINGS_BATTLES');
            panelBody.append(battles);
            const dungeonAvoidDeaths = settingInput(I18N('SETTING_DUNGEON_AVOID_DEATHS'), 'checkbox',
                automation.settings('CLAN_DUNGEON').avoidDeaths);
            savePanel = () => {
                valkyriesBlessing = blessing.checked;
                userStorage.set('valkyriesBlessing', String(valkyriesBlessing));
                messageLog.setTTL(ttl.value);
                userStorage.set('messageTTL', String(messageLog.ttl));
                currentLog.setLimit(limit.value);
                userStorage.set('messageLimit', String(currentLog.limit));
                userStorage.set('battle:dungeonAvoidDeaths', String(dungeonAvoidDeaths.checked));
                returnToMenu();
            };
        } else if (id === 'autopilot' || id === 'startup') {
            let enabled, idle;
            if (id === 'autopilot') {
                autopilotDraft ??= { ...pilot.options, intervals: { ...pilot.options.intervals } };
                const description = document.createElement('p');
                description.textContent = I18N('AUTOPILOT_DESCRIPTION'); panelBody.append(description);
                enabled = settingInput(I18N('AUTOPILOT_ENABLED'), 'checkbox', autopilotDraft.enabled);
                idle = settingInput(I18N('AUTOPILOT_IDLE_MINUTES'), 'number', autopilotDraft.idleMinutes, 5);
                enabled.addEventListener('change', () => { autopilotDraft.enabled = enabled.checked; });
                idle.addEventListener('input', () => { autopilotDraft.idleMinutes = Number(idle.value); });
                cancelPanel = () => { autopilotDraft = null; returnToMenu(); };
            }
            const inputs = {};
            const existing = new Set(references.list(id).filter(entry => !entry.folder).map(entry => entry.section));
            const picker = document.createElement('details'); picker.className = 'interface-script-picker';
            const pickerTitle = document.createElement('summary'); pickerTitle.textContent = I18N('SCRIPT_ADD_REFERENCE'); picker.append(pickerTitle);
            const addOptions = (nodes, parent) => { for (const node of nodes) {
                if (node.children) {
                    const folder = document.createElement('details'); folder.dataset.pickerFolder = node.id;
                    const summary = document.createElement('summary'); summary.className = 'interface-picker-row';
                    const name = document.createElement('span'); name.textContent = manualFolderLabel(node.id); summary.append(name);
                    const add = treeIcon('+', I18N('SCRIPT_ADD_FOLDER'), event => { event.preventDefault(); event.stopPropagation(); for (const added of references.addTree(id, node.id) || []) treeOpen.add(added); showSection(id); });
                    summary.append(add); folder.append(summary);
                    const children = document.createElement('div'); children.className = 'interface-picker-children';
                    addOptions(node.children, children); folder.append(children); parent.append(folder);
                } else {
                    const section = menuTree.scripts.get(node.id); if (!section || existing.has(section)) continue;
                    const button = document.createElement('button'); button.type = 'button'; button.className = 'interface-picker-script'; button.dataset.pickerScript = section;
                    button.textContent = I18N(`NAV_${section}`); button.addEventListener('click', () => { references.add(id, section); showSection(id); }); parent.append(button);
                }
            } };
            addOptions(menuTree.find('scripts')?.children ?? [], picker);
            headerAdd.hidden = false;
            headerAddAction = () => { const name = prompt(I18N('SCRIPT_ADD_FOLDER'), I18N('SCRIPT_SEQUENCE_NAME')); if (name?.trim()) { references.addFolder(id, name.trim()); showSection(id); } };
            panelBody.append(picker);
            const list = document.createElement('ul'); list.className = 'interface-script-list';
            let dragged = null;
            const referenceItems = references.ordered(id);
            for (const entry of referenceItems) {
                let ancestor = entry.parent, hidden = false; const checked = new Set();
                while (ancestor && !checked.has(ancestor)) { checked.add(ancestor); if (!treeOpen.has(ancestor)) hidden = true; ancestor = referenceItems.find(value => value.id === ancestor)?.parent; }
                if (hidden) continue;
                const item = document.createElement('li'); item.className = 'interface-sequence-item'; item.draggable = true; item.dataset.referenceId = entry.id;
                let depth = 0, parent = entry.parent; const ancestors = new Set();
                while (parent && !ancestors.has(parent)) { ancestors.add(parent); depth++; parent = referenceItems.find(value => value.id === parent)?.parent; }
                item.style.marginLeft = `${Math.min(depth, 8) * 18}px`;
                item.addEventListener('dragstart', event => { if (event.target.closest('button, input, select')) { event.preventDefault(); return; } dragged = entry.id; event.dataTransfer.setData('text/plain', entry.id); });
                item.addEventListener('dragover', event => { if (dragged) event.preventDefault(); });
                item.addEventListener('drop', event => { if (dragged) { event.preventDefault(); references.move(id, dragged, entry.id); showSection(id); dragged = null; } });
                const folderName = entry.names?.[i18n.language] || (entry.sourceId ? manualFolderLabel(entry.sourceId) : '') || entry.name || I18N(entry.nameKey || 'SCRIPT_SEQUENCE_NAME');
                const name = document.createElement('span'); name.className = 'interface-script-name'; name.textContent = entry.folder ? folderName : I18N(`NAV_${entry.section}`); item.append(name);
                if (id === 'autopilot' && !entry.folder) {
                    const input = document.createElement('input'); input.type = 'number'; input.min = '1'; input.step = '1'; input.value = autopilotDraft.intervals[entry.id] ?? 5; input.title = I18N('AUTOPILOT_INTERVAL');
                    input.addEventListener('input', () => { autopilotDraft.intervals[entry.id] = Math.max(1, Number(input.value) || 5); });
                    inputs[entry.id] = input; item.append(input);
                }
                if (entry.folder) {
                    item.append(treeIcon('✎', I18N('SCRIPT_CONFIGURE'), () => { if (treeOpen.has(entry.id)) treeOpen.delete(entry.id); else treeOpen.add(entry.id); showSection(id); }));
                    item.append(treeIcon('×', I18N('SCRIPT_REMOVE_FOLDER'), () => { references.remove(id, entry.id); showSection(id); }));
                    const run = treeIcon('▶', I18N('SCRIPT_RUN_CONFIGURED'), () => {
                        const descendants = new Set([entry.id]); let changed;
                        do { changed = false; for (const value of references.list(id)) if (descendants.has(value.parent) && !descendants.has(value.id)) { descendants.add(value.id); changed = true; } } while (changed);
                        void pilot.run(references.entries(id).filter(value => descendants.has(value.id)), 'manual_explicit');
                    }); run.classList.add('interface-run'); item.append(run);
                    if (treeOpen.has(entry.id)) {
                        const edit = document.createElement('div'); edit.className = 'interface-folder-edit'; edit.style.flexBasis = '100%';
                        const input = document.createElement('input'); input.type = 'text'; input.value = folderName; input.setAttribute('aria-label', I18N('SCRIPT_RENAME_FOLDER'));
                        input.addEventListener('change', () => { references.renameFolder(id, entry.id, i18n.language, input.value); name.textContent = input.value || folderName; });
                        edit.append(input, treeIcon('+', I18N('SCRIPT_ADD_FOLDER'), () => { const child = references.addFolder(id, I18N('SCRIPT_SEQUENCE_NAME'), entry.id); treeOpen.add(entry.id); treeOpen.add(child); showSection(id); })); item.append(edit);
                    }
                } else {
                    if (Object.keys(automation.definitions[entry.section].fields).length) item.append(treeIcon('⚙', I18N('SCRIPT_CONFIGURE'), () => showScriptSettings(entry.section, entry, id)));
                    item.append(treeIcon('×', I18N('SCRIPT_REMOVE_REFERENCE'), () => { references.remove(id, entry.id); showSection(id); }));
                    const run = treeIcon('▶', I18N('SCRIPT_RUN_CONFIGURED'), () => { if (pilot.running) pilot.stop(); else void pilot.run([entry], 'manual_explicit'); });
                    run.classList.add('interface-run'); run.dataset.interfaceRun = entry.section; item.append(run);
                }
                list.append(item);
            }
            list.addEventListener('dragover', event => { if (dragged && event.target === list) event.preventDefault(); });
            list.addEventListener('drop', event => { if (dragged && event.target === list) {
                event.preventDefault(); const items = references.list(id), item = items.find(value => value.id === dragged);
                if (item) { delete item.parent; references.save(id, items); showSection(id); } dragged = null;
            } });
            panelBody.append(list);
            savePanel = () => {
                if (id === 'autopilot') {
                    pilot.configure({ enabled: enabled.checked, idleMinutes: Number(idle.value),
                        intervals: { ...autopilotDraft.intervals, ...Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, Number(input.value)])) } });
                    autopilotDraft = null;
                }
                returnToMenu();
            };
        } else if (id === 'scripts') {
            sequenceView = true;
            panel.querySelector('.interface-confirm').setAttribute('aria-label', I18N('SCRIPT_RUN_SEQUENCE'));
            panel.querySelector('.interface-confirm').title = I18N('SCRIPT_RUN_SEQUENCE');
            panel.querySelector('.interface-confirm').classList.add('interface-header-run');
            panel.querySelector('.interface-confirm').innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z"/></svg>';
            headerAdd.hidden = false;
            headerAddAction = () => { const folder = menuTree.addFolder(); treeOpen.add(folder); showSection('scripts'); };
            savePanel = () => void runSequence(menuTree.sequence('scripts', { atomicCollect: true }));
            cancelPanel = () => { if (sequenceRunning) pilot.stop(); returnToMenu(); };
            const list = document.createElement('ul');
            list.className = 'interface-script-list';
            let dragging = null;
            const render = (node, parent) => {
                const item = document.createElement('li');
                item.dataset.nodeId = node.id;
                item.className = 'interface-sequence-item';
                item.draggable = true;
                item.addEventListener('dragstart', event => {
                    if (event.target !== item && event.target.closest('input, button, select, a')) { event.preventDefault(); return; }
                    event.stopPropagation(); dragging = node.id; event.dataTransfer.setData('text/plain', node.id);
                });
                item.addEventListener('dragend', () => { dragging = null; });
                item.addEventListener('dragover', event => { if (dragging) { event.preventDefault(); event.stopPropagation(); } });
                item.addEventListener('drop', event => {
                    if (!dragging) return;
                    event.preventDefault(); event.stopPropagation();
                    const box = item.getBoundingClientRect();
                    const relative = (event.clientY - box.top) / Math.max(box.height, 1);
                    const position = menuTree.folders.has(node.id) && relative > .25 && relative < .75 ? 'inside' : relative < .5 ? 'before' : 'after';
                    if (menuTree.move(dragging, node.id, position)) showSection('scripts');
                    dragging = null;
                });
                const section = menuTree.scripts.get(node.id);
                if (section) item.dataset.script = section;
                const check = document.createElement('input'); check.type = 'checkbox';
                check.checked = menuTree.enabled(node.id);
                if (section) check.dataset.sequenceScript = section;
                check.addEventListener('change', () => menuTree.setEnabled(node.id, check.checked));
                check.id = `interfaceEnabled_${node.id}`;
                const label = document.createElement('label'); label.htmlFor = check.id; label.className = 'interface-script-name';
                label.textContent = node.children ? manualFolderLabel(node.id) : I18N(`NAV_${section}`);
                const status = document.createElement('span'); status.className = 'interface-script-status';
                if (section) { status.dataset.interfaceStatus = section; status.textContent = scriptReports.has(section) ? ` (${scriptReports.get(section)})` : ''; }
                label.append(status);
                const actions = document.createElement('div'); actions.className = 'interface-script-actions';
                const children = document.createElement('ul'); children.className = 'interface-script-list interface-tree-children';
                let folderEditor = null;
                if (node.children) {
                    children.hidden = !treeOpen.has(node.id);
                    actions.classList.add('interface-tree-tools');
                    folderEditor = document.createElement('div'); folderEditor.className = 'interface-folder-edit'; folderEditor.hidden = children.hidden;
                    const name = document.createElement('input'); name.type = 'text'; name.value = manualFolderLabel(node.id); name.setAttribute('aria-label', I18N('SCRIPT_RENAME_FOLDER'));
                    name.addEventListener('change', () => { menuTree.renameFolder(node.id, i18n.language, name.value); label.firstChild.textContent = manualFolderLabel(node.id); });
                    folderEditor.append(name, treeIcon('+', I18N('SCRIPT_ADD_FOLDER'), () => { const child = menuTree.addFolder(node.id); if (child) { treeOpen.add(node.id); treeOpen.add(child); showSection('scripts'); } }));
                    const toggle = treeIcon('✎', I18N('SCRIPT_CONFIGURE'), () => { children.hidden = !children.hidden; folderEditor.hidden = children.hidden; if (children.hidden) treeOpen.delete(node.id); else treeOpen.add(node.id); toggle.setAttribute('aria-expanded', String(!children.hidden)); });
                    toggle.setAttribute('aria-expanded', String(!children.hidden));
                    actions.append(toggle);
                    actions.append(treeIcon('×', I18N('SCRIPT_REMOVE_FOLDER'), () => { menuTree.removeFolder(node.id); showSection('scripts'); }));
                } else if (section && Object.keys(automation.definitions[section].fields).length) {
                    actions.append(treeIcon('⚙', I18N('SCRIPT_CONFIGURE'), () => showScriptSettings(section)));
                }
                if (section) {
                    const run = treeIcon('▶', I18N('SCRIPT_RUN_CONFIGURED'), () => {
                        if (automation.running?.section === section) { if (sequenceRunning) pilot.stop(); automation.stop(); refreshRunButtons(); }
                        else void runScript(section, run, status);
                    });
                    run.classList.add('interface-run'); run.dataset.interfaceRun = section;
                    actions.append(run);
                } else if (node.children) {
                    const run = treeIcon('▶', I18N('SCRIPT_RUN_CONFIGURED'), () => void runSequence(menuTree.sequence(node.id, { atomicCollect: true, ignoreRootEnabled: true })));
                    run.classList.add('interface-run');
                    actions.append(run);
                }
                item.append(check, label, actions);
                if (folderEditor) item.append(folderEditor);
                if (node.children) { for (const child of node.children) render(child, children); item.append(children); }
                parent.append(item);
            };
            for (const node of menuTree.find('scripts')?.children ?? []) render(node, list);
            list.addEventListener('dragover', event => { if (dragging && event.target === list) event.preventDefault(); });
            list.addEventListener('drop', event => { if (dragging && event.target === list) { event.preventDefault(); if (menuTree.move(dragging, 'scripts')) showSection('scripts'); dragging = null; } });
            panelBody.append(list); refreshRunButtons();
        } else if (id === 'navigation') {
            const list = document.createElement('ul'); list.className = 'interface-script-list';
            const entries = menuTree.find('navigation')?.children ?? [];
            let dragged = null;
            for (const node of entries) {
                const section = menuTree.navigation.get(node.id);
                if (!section) continue;
                const item = document.createElement('li'); item.dataset.script = section; item.dataset.nodeId = node.id; item.draggable = true;
                item.addEventListener('dragstart', event => {
                    if (event.target.closest('button, input, a')) { event.preventDefault(); return; }
                    dragged = node.id; event.dataTransfer.setData('text/plain', node.id);
                });
                item.addEventListener('dragend', () => { dragged = null; });
                item.addEventListener('dragover', event => { if (dragged) event.preventDefault(); });
                item.addEventListener('drop', event => {
                    if (!dragged) return;
                    event.preventDefault();
                    const box = item.getBoundingClientRect();
                    if (menuTree.move(dragged, node.id, event.clientY < box.top + box.height / 2 ? 'before' : 'after')) showSection('navigation');
                    dragged = null;
                });
                const button = document.createElement('button'); button.type = 'button'; button.className = 'interface-script-link';
                button.textContent = I18N(`NAV_${section}`);
                button.addEventListener('click', () => {
                    try { navigateToGameSection(section); closeMenu(); interfaceSidebar.classList.remove('sidebar_open');
                        if (!automation.requiresReload) syncOverlay?.classList.remove('sidebar__overlay_show');
                    } catch (error) { console.error('Unable to open game section:', section, error); button.textContent = `${I18N(`NAV_${section}`)} — ${I18N('NAV_UNAVAILABLE')}`; }
                });
                item.append(button); list.append(item);
            }
            panelBody.append(list);
        } else {
            const text = document.createElement('p');
            text.textContent = I18N('MENU_SECTION_PENDING');
            panelBody.append(text);
        }
    };
    interfaceSidebar.addEventListener('click', event => {
        if (event.target.closest('[data-interface-close]')) { closeMenu(); return; }
        const button = event.target.closest('[data-interface-dialog]');
        if (button) showSection(button.dataset.interfaceDialog);
    });
    phase('Sidebar rendered');
    //#endregion

})();
