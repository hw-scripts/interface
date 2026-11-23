// Dungeon walkthrough adapted from executeDungeon in ignored/HWrunner.js.
class InterfaceDungeon {
    constructor(api, calculator, collectCards) {
        this.api = api;
        this.calculator = calculator;
        this.collectCards = collectCards;
    }

    team(type, teams, favors, titans, states) {
        if (type === 'hero') {
            const saved = teams.dungeon_hero;
            if (!Array.isArray(saved)) return null;
            const heroes = saved.filter(id => Number.isInteger(id) && id > 0 && id < 6000 && !states.heroes?.[id]?.isDead);
            const args = { heroes, favor: Object.fromEntries(Object.entries(favors.dungeon_hero ?? {})
                .filter(([hero]) => heroes.includes(Number(hero)))) };
            const pet = saved.find(id => id >= 6000);
            if (pet != null) args.pet = pet;
            return args;
        }
        const elements = { water: '0', fire: '1', earth: '2' };
        if (type !== 'neutral' && !Object.hasOwn(elements, type)) return null;
        const heroes = Object.values(titans ?? {}).filter(titan => !states.titans?.[titan.id]?.isDead
            && (type === 'neutral' || String(titan.id).slice(2, 3) === elements[type]))
            .sort((a, b) => Number(b.power) - Number(a.power) || Number(a.id) - Number(b.id))
            .slice(0, 5).map(titan => Number(titan.id));
        return { heroes, favor: {} };
    }

    assess(battle, calculated, avoidDeaths) {
        if (!calculated?.result?.win || !Array.isArray(calculated.progress) || !calculated.progress.length) return -Infinity;
        const after = calculated.progress[calculated.progress.length - 1].attackers?.heroes;
        if (!after) return -Infinity;
        let score = 0;
        let fighters = 0;
        for (const [id, unit] of Object.entries(battle.attackers ?? {})) {
            // Active pets have hp=-1 and are not mortal combatants.
            if (!(Number(unit.hp) > 0)) continue;
            fighters++;
            const state = after[id];
            const died = !state || state.isDead || Number(state.hp) <= 0;
            if (avoidDeaths && died) return -Infinity;
            const before = unit.state ? Number(unit.state.hp) / Number(unit.hp) + Number(unit.state.energy ?? 0) / 20000 : 1;
            const remaining = died ? 0 : Number(state.hp) / Number(unit.hp) + Number(state.energy ?? 0) / 20000;
            score += remaining - before;
        }
        return fighters && Number.isFinite(score) ? score : -Infinity;
    }

    async simulate(args, token, avoidDeaths) {
        const started = performance.now();
        const battle = await this.api.call('dungeonStartBattle', args);
        if (token.stopped) return null;
        if (!battle?.attackers) throw new Error('SCRIPT_DUNGEON_INVALID_BATTLE');
        const config = battle.type === 'dungeon_titan' ? 'get_titan' : 'get_tower';
        let calculated;
        for (let attempt = 0; attempt < 20 && !token.stopped; attempt++) {
            const input = structuredClone(battle);
            input.progress = [{ attackers: { input: ['auto', 0, 0, 'auto', 0, attempt ? 1 + Math.random() * 14 : 0] } }];
            calculated = await this.calculator.calculate(input, config);
            if (Number.isFinite(this.assess(battle, calculated, avoidDeaths))) break;
        }
        return { args, battle, calculated, started };
    }

    async wait(candidate, report, token) {
        const end = candidate.started + Math.max(0, Number(candidate.calculated.waitSeconds) || 0) * 1000;
        const id = Symbol();
        let shown;
        while (!token.stopped && performance.now() < end) {
            const seconds = Math.ceil((end - performance.now()) / 1000);
            if (seconds !== shown) { report('SCRIPT_DUNGEON_WAIT', seconds, { id, pending: true }); shown = seconds; }
            if (!token.stopped) await new Promise(resolve => setTimeout(resolve, Math.min(250, end - performance.now())));
        }
        if (shown != null) report(token.stopped ? 'SCRIPT_STOPPED' : 'SCRIPT_DUNGEON_WAIT', token.stopped ? undefined : 0, { id, pending: false });
        return !token.stopped;
    }

    async run(settings, report, token) {
        const target = Number(settings.targetTitanite);
        if (!Number.isSafeInteger(target) || target < 1) throw new Error('SCRIPT_DUNGEON_INVALID_TARGET');
        await this.collectCards(report, token);
        if (token.stopped) return;
        const inventory = await this.api.call('inventoryGet');
        report('SCRIPT_DUNGEON_CARDS', Math.max(0, Number(inventory?.consumable?.[81]) || 0));
        if (token.stopped) return;
        let info = await this.api.call('dungeonGetInfo');
        if (!info) throw new Error('SCRIPT_DUNGEON_UNAVAILABLE');
        const teams = await this.api.call('teamGetAll');
        const favors = await this.api.call('teamGetFavor');
        const clan = await this.api.call('clanGetInfo');
        const titans = await this.api.call('titanGetAll');
        let activity = Number(clan?.stat?.todayDungeonActivity);
        if (!Number.isFinite(activity)) throw new Error('SCRIPT_DUNGEON_UNAVAILABLE');
        const collectedTalents = new Set();
        const apply = response => {
            if (!response || typeof response !== 'object') throw new Error('SCRIPT_DUNGEON_UNAVAILABLE');
            activity += Number(response.reward?.dungeonActivity ?? 0);
            info = response.dungeon ?? response;
        };
        while (!token.stopped) {
            report('SCRIPT_DUNGEON_PROGRESS', `${activity}/${target}`);
            if (!info.floor || info.floor.state == 2) {
                const previous = JSON.stringify([info.floorNumber, info.floor?.state]);
                apply(await this.api.call('dungeonSaveProgress'));
                if (JSON.stringify([info.floorNumber, info.floor?.state]) === previous)
                    throw new Error('SCRIPT_DUNGEON_STALLED');
                continue;
            }
            const talent = info.talent;
            const floor = Number(info.floorNumber);
            if (settings.collectTalent && talent?.conditions && floor === Number(talent.floorRandValue)
                && !collectedTalents.has(floor)
                && (!(3 - Number(talent.conditions.doorsAmount)) || !talent.conditions.farmedDoors?.[floor])) {
                await this.api.call('heroTalent_getReward', { talentType: 'tmntDungeonTalent', reroll: false });
                await this.api.call('heroTalent_farmReward', { talentType: 'tmntDungeonTalent' });
                collectedTalents.add(floor);
                report('SCRIPT_DUNGEON_TALENT', floor);
            }
            if (token.stopped) return;
            if (activity >= target) return;
            if (info.floorType !== 'battle') throw new Error('SCRIPT_DUNGEON_UNKNOWN_FLOOR');
            const states = info.states ?? {};
            const candidates = [];
            for (const [teamNum, choice] of Object.entries(info.floor.userData ?? {})) {
                if (token.stopped) return;
                const args = this.team(choice.attackerType, teams, favors, titans, states);
                if (!args?.heroes.length) continue;
                this.calculator.assertAvailable(choice.attackerType === 'hero' ? 'get_tower' : 'get_titan');
                args.teamNum = teamNum;
                const candidate = await this.simulate(args, token, settings.avoidDeaths);
                if (token.stopped) return;
                candidate.score = this.assess(candidate.battle, candidate.calculated, settings.avoidDeaths);
                candidates.push(candidate);
            }
            if (!candidates.length) return 'SCRIPT_DUNGEON_NO_TEAM';
            candidates.sort((a, b) => b.score - a.score);
            let best = candidates[0];
            if (!Number.isFinite(best.score)) return settings.avoidDeaths ? 'SCRIPT_DUNGEON_NO_SAFE_WIN' : 'SCRIPT_DUNGEON_NO_WIN';
            // Previewing another door changes the active server battle. Reopen the chosen door and recalculate its actual seed.
            if (candidates.length > 1) {
                best = await this.simulate(best.args, token, settings.avoidDeaths);
                if (token.stopped) return;
                if (!Number.isFinite(this.assess(best.battle, best.calculated, settings.avoidDeaths)))
                    return settings.avoidDeaths ? 'SCRIPT_DUNGEON_NO_SAFE_WIN' : 'SCRIPT_DUNGEON_NO_WIN';
            }
            report('SCRIPT_DUNGEON_DOOR', best.args.teamNum);
            const args = { result: best.calculated.result, progress: best.calculated.progress };
            if (!await this.wait(best, report, token)) return;
            if (token.stopped) return;
            const previous = JSON.stringify(info);
            apply(await this.api.call('dungeonEndBattle', args));
            if (JSON.stringify(info) === previous) throw new Error('SCRIPT_DUNGEON_STALLED');
        }
    }
}
