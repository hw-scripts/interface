// Client-side battle calculation using the game classes, adapted from HWrunner.
class InterfaceBattleCalculator {
    constructor(game) {
        this.game = game;
    }

    assertAvailable() {
        const game = this.game.classes;
        for (const name of ['BattlePresets', 'BattleConfigStorage', 'DataStorage', 'BattleInstantPlay', 'MultiBattleResult', 'BattleLogEncoder', 'BattleLogReader']) {
            if (!game[name]) throw new Error('SCRIPT_BATTLE_UNAVAILABLE');
        }
    }

    property(Class, getter) {
        const properties = Class?.prototype?.__properties__;
        const name = Object.entries(properties ?? {}).find(([, name]) => name === getter)?.[0];
        if (!name) throw new Error('SCRIPT_BATTLE_UNAVAILABLE');
        return name;
    }

    calculate(data, config) {
        const game = this.game.classes;
        const property = (Class, name) => this.property(Class, name);
        const presets = new game.BattlePresets(data.progress, false, true,
            game.DataStorage[Object.keys(game.DataStorage)[25]][property(game.BattleConfigStorage, config)](), false);
        const Battle = data.progress?.length > 1 ? game.MultiBattleInstantReplay : game.BattleInstantPlay;
        const player = new Battle(data, presets);
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('SCRIPT_BATTLE_TIMEOUT')), 60000);
            player[Object.keys(game.BattleInstantPlay.prototype)[9]].add(instant => {
                clearTimeout(timer);
                try {
                    const results = instant[property(game.BattleInstantPlay, 'get_result')]();
                    const timeLimit = presets[property(game.BattlePresets, 'get_timeLimit')]();
                    let waitSeconds = 0;
                    for (const result of results[Object.keys(game.MultiBattleResult.prototype)[2]]) {
                        const log = game.BattleLogEncoder.read(new game.BattleLogReader(result));
                        const duration = Math.max(0, ...log.map(event => event.time < timeLimit && event.time !== 168.8 ? event.time : 0));
                        waitSeconds += Math.max(Math.ceil(duration / 1.5 + 1.5), 4);
                    }
                    resolve({ result: results[property(game.MultiBattleResult, 'get_result')](),
                        progress: results[property(game.MultiBattleResult, 'get_progress')](), waitSeconds });
                } catch (error) { reject(error); }
            });
            try { player.start(); } catch (error) { clearTimeout(timer); reject(error); }
        });
    }

}
