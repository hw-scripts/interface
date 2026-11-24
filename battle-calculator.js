// Client-side battle calculation using the game classes, adapted from HWrunner.
class InterfaceBattleCalculator {
    constructor(game) {
        this.game = game;
    }

    assertAvailable(config) {
        const game = this.game.classes;
        for (const name of ['BattlePresets', 'BattleConfigStorage', 'DataStorage', 'BattleInstantPlay', 'MultiBattleResult', 'BattleLogEncoder', 'BattleLogReader']) {
            if (!game[name]) throw new Error('SCRIPT_BATTLE_UNAVAILABLE');
        }
        if (config) {
            const getter = this.property(game.BattleConfigStorage, config);
            if (typeof game.BattleConfigStorage.prototype[getter] !== 'function') throw new Error('SCRIPT_BATTLE_UNAVAILABLE');
        }
    }

    property(Class, getter) {
        const properties = Class?.prototype?.__properties__;
        const name = Object.entries(properties ?? {}).find(([, name]) => name === getter)?.[0];
        if (!name) throw new Error('SCRIPT_BATTLE_UNAVAILABLE');
        return name;
    }

    // Locate game objects by their shape and semantic metadata, never by property order.
    values(object) {
        const values = [];
        const seen = new Set();
        for (let current = object; current && current !== Object.prototype; current = Object.getPrototypeOf(current)) {
            for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(current))) {
                if (seen.has(key)) continue;
                seen.add(key);
                if ('value' in descriptor && current === object) values.push(descriptor.value);
                else if (typeof descriptor.get === 'function') {
                    try { values.push(descriptor.get.call(object)); } catch {}
                }
            }
        }
        return values;
    }

    unique(values) {
        const distinct = [...new Set(values)];
        if (distinct.length !== 1) throw new Error('SCRIPT_BATTLE_UNAVAILABLE');
        return distinct[0];
    }

    calculate(data, config) {
        const game = this.game.classes;
        this.assertAvailable(config);
        const property = (Class, name) => this.property(Class, name);
        const configGetter = property(game.BattleConfigStorage, config);
        const stores = this.values(game.DataStorage).filter(value => value && typeof value[configGetter] === 'function');
        const store = this.unique(stores);
        const presets = new game.BattlePresets(data.progress, false, true, store[configGetter](), false);
        const Battle = data.progress?.length > 1 ? game.MultiBattleInstantReplay : game.BattleInstantPlay;
        if (typeof Battle !== 'function') throw new Error('SCRIPT_BATTLE_UNAVAILABLE');
        const player = new Battle(data, presets);
        const signal = this.unique(this.values(player).filter(value => value && typeof value.add === 'function'));
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('SCRIPT_BATTLE_TIMEOUT')), 60000);
            try {
                signal.add(instant => {
                    clearTimeout(timer);
                    try {
                        const results = instant[property(game.BattleInstantPlay, 'get_result')]();
                        const timeLimit = presets[property(game.BattlePresets, 'get_timeLimit')]();
                        const result = results[property(game.MultiBattleResult, 'get_result')]();
                        const progress = results[property(game.MultiBattleResult, 'get_progress')]();
                        const logs = this.unique(this.values(results).filter(value => Array.isArray(value) && value !== progress));
                        let waitSeconds = 0;
                        for (const part of logs) {
                            const log = game.BattleLogEncoder.read(new game.BattleLogReader(part));
                            const duration = Math.max(0, ...log.map(event => event.time < timeLimit && event.time !== 168.8 ? event.time : 0));
                            waitSeconds += Math.max(Math.ceil(duration / 1.5 + 1.5), 4);
                        }
                        resolve({ result, progress, waitSeconds });
                    } catch (error) { reject(error); }
                });
                player.start();
            } catch (error) { clearTimeout(timer); reject(error); }
        });
    }

}
