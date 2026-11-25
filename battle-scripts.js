// The automation engine owns lifecycle, API wrapping, and account settings.
class InterfaceScriptGroup {
    constructor(engine) { this.engine = engine; }
    get api() { return this.engine.api; }
    get battleCalculator() { return this.engine.battleCalculator; }
}

class InterfaceAsgardScripts extends InterfaceScriptGroup {
    async asgardMinions(report, token) {
        const info = await this.api.call('clanRaid_getInfo');
        if (token.stopped) return;
        const teams = await this.api.call('teamGetAll');
        if (token.stopped) return;
        const favors = await this.api.call('teamGetFavor');
        if (token.stopped) return;
        const savedTeams = teams?.clanRaid_nodes;
        if (!Array.isArray(savedTeams) || !savedTeams.length || savedTeams.some(team => !Array.isArray(team) || team.length < 6))
            return 'SCRIPT_ASGARD_INCOMPLETE_TEAM';
        let attempts = Number(info?.attempts);
        if (!Number.isSafeInteger(attempts) || attempts < 0 || !info?.nodes) throw new Error('SCRIPT_API_ERROR');
        if (!attempts) return 'SCRIPT_NOTHING_TO_COLLECT';
        this.battleCalculator.assertAvailable('get_clanPvp');
        const lineups = savedTeams.map((team, battleIndex) => ({ data: {}, heroes: team.filter(id => id < 6000),
            pet: team.find(id => id >= 6000), battleIndex }));
        const heroes = new Set(lineups.flatMap(team => team.heroes).map(Number));
        const favor = Object.fromEntries(Object.entries(favors?.clanRaid_nodes ?? {}).filter(([hero]) => heroes.has(Number(hero))));
        for (const [nodeId, node] of Object.entries(info.nodes)) {
            if (token.stopped || !attempts) return;
            const now = Date.now() / 1000;
            if (!Array.isArray(node.teams) || !node.teams.length || node.teams.some(team => Number(team.points) !== 0) ||
                !(now > Number(node.timestamps?.start) && now < Number(node.timestamps?.end))) continue;
            if (node.teams.length > lineups.length) throw new Error('SCRIPT_ASGARD_INCOMPLETE_TEAM');
            const started = performance.now();
            const response = await this.api.call('clanRaid_startNodeBattles', { nodeId, teams: lineups.slice(0, node.teams.length), favor });
            if (token.stopped) return;
            if (!Array.isArray(response?.battles) || response.battles.length !== node.teams.length) throw new Error('SCRIPT_API_ERROR');
            const results = [];
            for (const [battleIndex, battle] of response.battles.entries()) {
                if (token.stopped) return;
                const calculated = await this.battleCalculator.calculate(battle, 'get_clanPvp');
                if (!calculated?.result || !Array.isArray(calculated.progress)) throw new Error('SCRIPT_BATTLE_UNAVAILABLE');
                results.push({ battle, battleIndex, calculated });
            }
            const losing = results.some(entry => !entry.calculated.result.win);
            if (losing) {
                const progress = results[0].calculated.progress;
                for (const side of ['attackers', 'defenders']) {
                    const units = progress?.[0]?.[side]?.heroes;
                    if (!units || typeof units !== 'object') throw new Error('SCRIPT_BATTLE_UNAVAILABLE');
                    for (const hero of Object.values(units)) {
                        hero.energy = 1 + Math.floor(Math.random() * 999);
                        if (hero.hp > 0) hero.hp = 1 + Math.floor(Math.random() * hero.hp);
                    }
                }
            }
            for (const entry of losing ? results.slice(0, 1) : results) {
                const until = started + Math.max(0, Number(entry.calculated.waitSeconds) || 0) * 1000;
                while (!token.stopped && performance.now() < until)
                    await new Promise(resolve => setTimeout(resolve, Math.min(250, until - performance.now())));
                if (token.stopped) return;
                try {
                    const result = await this.api.call('clanRaid_endNodeBattle', { nodeId: entry.battle?.result?.nodeId ?? nodeId,
                        battleIndex: entry.battleIndex, result: entry.calculated.result, progress: entry.calculated.progress });
                    if (result?.error && !(losing && result.reason === 'invalidBattle')) throw new Error(result.reason || 'SCRIPT_API_ERROR');
                    if (losing && !(result?.error && result.reason === 'invalidBattle')) throw new Error('SCRIPT_ASGARD_CANCEL_UNCONFIRMED');
                } catch (error) {
                    if (!(losing && /invalidBattle/i.test(String(error?.message)))) throw error;
                }
            }
            if (!losing) attempts--;
            report(losing ? 'SCRIPT_ASGARD_CANCELLED' : 'SCRIPT_ASGARD_NODE_DONE', nodeId);
        }
    }

}

class InterfaceTitanScripts extends InterfaceScriptGroup {
    async titanArena(settings, report, token) {
        const tests = Number(settings.testBattles), retries = Number(settings.retryBattles);
        if (!Number.isSafeInteger(tests) || tests < 0 || tests > 100 ||
            !Number.isSafeInteger(retries) || retries < 0 || retries > 100) throw new Error('SCRIPT_UPGRADE_INVALID_LIMIT');
        let status = await this.api.call('titanArenaGetStatus');
        if (token.stopped || status?.status === 'disabled' || status?.status === 'peace_time') return;
        const teams = await this.api.call('teamGetAll');
        if (token.stopped) return;
        const titans = teams?.titan_arena;
        if (!Array.isArray(titans) || !titans.length) throw new Error('SCRIPT_TITAN_ARENA_NO_TEAM');
        this.battleCalculator.assertAvailable('get_titanClanPvp');
        let checked = false;
        const calculate = async battle => {
            const result = await this.battleCalculator.calculate(battle, 'get_titanClanPvp');
            if (!result?.result || !Array.isArray(result.progress)) throw new Error('SCRIPT_BATTLE_UNAVAILABLE');
            return result;
        };
        const wait = async (started, seconds) => {
            const until = started + Math.max(0, Number(seconds) || 0) * 1000;
            while (!token.stopped && performance.now() < until)
                await new Promise(resolve => setTimeout(resolve, Math.min(250, until - performance.now())));
        };
        while (!token.stopped) {
            if (!status || status.status === 'disabled' || status.status === 'peace_time') return;
            report('SCRIPT_TITAN_ARENA_TIER', status.tier);
            if (status.status === 'completed_tier') {
                status = await this.api.call('titanArenaCompleteTier'); checked = false; continue;
            }
            if (status.canRaid) {
                const raid = await this.api.call('titanArenaStartRaid', { titans });
                if (token.stopped) return;
                if (!raid?.attackers || !raid.rivals || !Object.keys(raid.rivals).length) throw new Error('SCRIPT_API_ERROR');
                const results = {};
                const rivals = Object.entries(raid.rivals);
                for (const [index, [id, rival]] of rivals.entries()) {
                    if (token.stopped) return;
                    report('SCRIPT_TITAN_ARENA_CALCULATING', `${index + 1}/${rivals.length}`);
                    const calculated = await calculate({ attackers: raid.attackers, defenders: [rival.team], seed: rival.seed, typeId: id });
                    if (token.stopped) return;
                    results[id] = { progress: calculated.progress, result: calculated.result };
                }
                report('SCRIPT_TITAN_ARENA_FINISHING');
                const response = await this.api.call('titanArenaEndRaid', { results });
                if (token.stopped) return;
                const scores = response?.results;
                if (!scores || !Object.keys(scores).length) throw new Error('SCRIPT_API_ERROR');
                if (Object.values(scores).every(value => Number(value.attackScore) >= 250)) {
                    status = await this.api.call('titanArenaCompleteTier'); checked = false;
                } else status = await this.api.call('titanArenaGetStatus');
                continue;
            }
            if (checked) {
                try {
                    await this.api.call('titanArenaFarmDailyReward');
                } catch (error) {
                    // The server reports this exact condition when no daily reward is available.
                    if (error?.rpcErrorName !== 'NotAvailable' || error?.message !== 'titan arena daily reward') throw error;
                }
                return;
            }
            if (!status.rivals || typeof status.rivals !== 'object') throw new Error('SCRIPT_API_ERROR');
            const rivals = Object.keys(status.rivals).filter(id => Number(status.rivals[id].attackScore) < 250).reverse();
            for (const rivalId of rivals) {
                if (token.stopped) return;
                let started = performance.now();
                let response = await this.api.call('titanArenaStartBattle', { rivalId, titans });
                if (token.stopped) return;
                let battle = response?.battle;
                if (!battle) throw new Error('SCRIPT_API_ERROR');
                let calculated = await calculate(battle), possible = !!calculated.result.win;
                for (let n = 0; n < tests && !token.stopped; n++) {
                    const trial = structuredClone(battle);
                    trial.seed = Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 1001);
                    if ((await calculate(trial)).result.win) possible = true;
                }
                let remaining = possible ? retries : 0;
                while (!calculated.result.win && remaining-- > 0 && !token.stopped) {
                    started = performance.now();
                    response = await this.api.call('titanArenaStartBattle', { rivalId, titans });
                    if (token.stopped) return;
                    if (!response?.battle) throw new Error('SCRIPT_API_ERROR');
                    calculated = await calculate(response.battle);
                }
                await wait(started, calculated.waitSeconds);
                if (token.stopped) return;
                const result = await this.api.call('titanArenaEndBattle', { progress: calculated.progress, result: calculated.result, rivalId });
                report('SCRIPT_TITAN_ARENA_SCORE', `${rivalId}: ${result?.attackScore ?? 0}`);
            }
            if (token.stopped) return;
            checked = true;
            status = await this.api.call('titanArenaGetStatus');
        }
    }

}

class InterfaceAdventureScripts extends InterfaceScriptGroup {
    async adventure(solo, settings, report, token) {
        const prefix = solo ? 'adventureSolo' : 'adventure';
        const text = String(settings.path ?? '').trim();
        if (!/^\d+(?:\s*[, -]\s*\d+)+$/.test(text)) throw new Error('SCRIPT_ADVENTURE_INVALID_PATH');
        let path = text.split(/[, -]+/).map(Number);
        const tests = Number(settings.testBattles), retries = Number(settings.retryBattles);
        if (![tests, retries].every(n => Number.isSafeInteger(n) && n >= 0 && n <= 100)) throw new Error('SCRIPT_UPGRADE_INVALID_LIMIT');
        const info = await this.api.call(`${prefix}_getInfo`);
        if (token.stopped) return;
        if (!info) return 'SCRIPT_ADVENTURE_NOT_ACTIVE';
        const teams = await this.api.call('teamGetAll');
        if (token.stopped) return;
        const favors = await this.api.call('teamGetFavor');
        if (token.stopped) return;
        const user = await this.api.call('userGetInfo');
        if (token.stopped) return;
        const state = info.users?.[user?.id], team = teams?.adventure_hero;
        if (!state || !Array.isArray(team) || !team.length || !Array.isArray(info.nodes) || !Array.isArray(info.paths)) throw new Error('SCRIPT_API_ERROR');
        for (let i = 1; i < path.length; i++) {
            const a = path[i - 1], b = path[i];
            if (!info.paths.some(p => Number(p.from_id) === a && Number(p.to_id) === b || Number(p.from_id) === b && Number(p.to_id) === a))
                throw new Error('SCRIPT_ADVENTURE_INVALID_PATH');
        }
        if (Number(state.currentNode) === 1 && path[0] !== 1) path.unshift(1);
        const position = path.indexOf(Number(state.currentNode));
        if (position < 0) throw new Error('SCRIPT_ADVENTURE_INVALID_PATH');
        path = path.slice(position);
        let turns = Number(state.turnsLeft), segment = [path[0]];
        if (!Number.isSafeInteger(turns) || turns < 0) throw new Error('SCRIPT_API_ERROR');
        const args = { heroes: team.slice(0, 5), pet: team[5], favor: favors?.adventure_hero, path: [], broadcast: false };
        for (const id of path.slice(1)) {
            if (token.stopped || !turns) return;
            segment.push(id);
            const node = info.nodes.find(n => Number(n.id) === id);
            if (!node) throw new Error('SCRIPT_ADVENTURE_INVALID_PATH');
            if (node.type === 'TYPE_COMBAT' && node.state === 'empty') { turns--; continue; }
            if (node.type === 'TYPE_PLAYERBUFF') {
                const buffs = Object.entries(node.buffs ?? {}).filter(([, b]) => b.owner == null && Number(b.value) > 0)
                    .sort((a,b) => Number(b[1].value) - Number(a[1].value));
                if (!buffs.length) continue;
                await this.api.call(`${prefix}_turnCollectBuff`, { buff: buffs[0][0], path: segment });
                turns--; segment = [id]; report('SCRIPT_ADVENTURE_NODE', id); continue;
            }
            if (node.type !== 'TYPE_COMBAT') continue;
            this.battleCalculator.assertAvailable('get_clanPvp');
            let won = false, canRetry = false;
            for (let attempt = 0; attempt <= retries && !token.stopped; attempt++) {
                const started = performance.now();
                const startedBattle = await this.api.call(`${prefix}_turnStartBattle`, { ...args, path: segment });
                if (token.stopped) return;
                const battle = startedBattle?.battle;
                if (!battle) throw new Error('SCRIPT_API_ERROR');
                const result = await this.battleCalculator.calculate(battle, 'get_clanPvp');
                if (token.stopped) return;
                if (!result?.result || !Array.isArray(result.progress)) throw new Error('SCRIPT_BATTLE_UNAVAILABLE');
                if (!result.result.win) {
                    for (const side of ['attackers','defenders']) {
                        const units = result.progress?.[0]?.[side]?.heroes;
                        if (!units) throw new Error('SCRIPT_BATTLE_UNAVAILABLE');
                        for (const hero of Object.values(units)) {
                            hero.energy = 1 + Math.floor(Math.random() * 999);
                            if (hero.hp > 0) hero.hp = 1 + Math.floor(Math.random() * hero.hp);
                        }
                    }
                }
                const until = started + Math.max(0, Number(result.waitSeconds) || 0) * 1000;
                while (!token.stopped && performance.now() < until) await new Promise(resolve => setTimeout(resolve, Math.min(250, until - performance.now())));
                if (token.stopped) return;
                try {
                    const ended = await this.api.call(`${prefix}_endBattle`, { result: result.result, progress: result.progress });
                    if (result.result.win && ended?.error) throw new Error('SCRIPT_API_ERROR');
                    if (!result.result.win && !(ended?.error && ended.reason === 'invalidBattle')) throw new Error('SCRIPT_ADVENTURE_CANCEL_UNCONFIRMED');
                } catch (error) {
                    if (result.result.win || !/invalidBattle/i.test(String(error?.message))) throw error;
                }
                if (result.result.win) { won = true; break; }
                if (attempt === 0) {
                    for (let n = 0; n < tests && !token.stopped; n++) {
                        const trial = structuredClone(battle); trial.seed = Math.floor(Date.now()/1000) + Math.floor(Math.random()*1001);
                        if ((await this.battleCalculator.calculate(trial, 'get_clanPvp'))?.result?.win) { canRetry = true; break; }
                    }
                    if (!canRetry) return 'SCRIPT_ADVENTURE_NO_WIN';
                    segment = segment.slice(-2);
                }
            }
            if (!won) return 'SCRIPT_ADVENTURE_NO_WIN';
            turns--; segment = [id]; report('SCRIPT_ADVENTURE_NODE', id);
        }
    }

    async adventureRaid(settings, report, token) {
        const limit = Number(settings.limit);
        if (!Number.isSafeInteger(limit) || limit < 0) throw new Error('SCRIPT_RESOURCE_INVALID_LIMIT');
        const user = await this.api.call('userGetInfo');
        if (token.stopped) return;
        const info = await this.api.call('adventure_raidGetInfo');
        if (token.stopped) return;
        const portals = Number(Object.values(user?.refillable ?? {}).find(item => Number(item?.id) === 45)?.amount ?? 0);
        const id = Math.max(0, ...Object.entries(info?.raid ?? {}).filter(([, available]) => available)
            .map(([id]) => Number(id)).filter(Number.isSafeInteger));
        if (!Number.isSafeInteger(portals) || portals < 0) throw new Error('SCRIPT_API_ERROR');
        if (!portals || !id) return 'SCRIPT_NOTHING_TO_COLLECT';
        const count = limit ? Math.min(portals, limit) : portals;
        for (let index = 0; index < count; index++) {
            if (token.stopped) return;
            await this.api.call('adventure_raid', { adventureId: String(id) });
            report('SCRIPT_ADVENTURE_RAID_DONE', index + 1);
        }
    }

}

class InterfaceCampaignScripts extends InterfaceScriptGroup {
    async campaign(settings, report, token) {
        const text = String(settings.missions ?? '').trim();
        if (!/^\d+\s*:\s*\d+(?:\s*,\s*\d+\s*:\s*\d+)*$/.test(text)) throw new Error('SCRIPT_CAMPAIGN_INVALID');
        const missions = text.split(',').map(part => part.split(':').map(value => Number(value.trim())));
        if (missions.some(([id, count]) => !Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(count) || count <= 0)) throw new Error('SCRIPT_CAMPAIGN_INVALID');
        let args;
        if (!settings.raidCampaign) {
            this.battleCalculator.assertAvailable('get_pve');
            const teams = await this.api.call('teamGetAll');
            if (token.stopped) return;
            const favors = await this.api.call('teamGetFavor');
            if (token.stopped) return;
            if (!Array.isArray(teams?.mission) || !teams.mission.some(id => Number(id) > 0 && Number(id) < 6000)) throw new Error('SCRIPT_CAMPAIGN_NO_TEAM');
            args = { heroes: teams.mission.filter(id => Number(id) < 6000), favor: favors?.mission ?? {} };
            const pet = teams.mission.find(id => Number(id) >= 6000);
            if (pet != null) args.pet = pet;
        }
        for (const [id, count] of missions) {
            if (token.stopped) return;
            if (settings.raidCampaign) {
                await this.api.call('missionRaid', { id, times: count });
                report('SCRIPT_CAMPAIGN_DONE', `${id}: ${count}`);
                continue;
            }
            for (let i = 0; i < count && !token.stopped; i++) {
                const started = performance.now();
                const battle = await this.api.call('missionStart', { ...args, id });
                if (token.stopped) return;
                const calculated = await this.battleCalculator.calculate(battle, 'get_pve');
                if (token.stopped) return;
                if (!calculated?.result || !Array.isArray(calculated.progress)) throw new Error('SCRIPT_BATTLE_UNAVAILABLE');
                const until = started + Math.max(0, Number(calculated.waitSeconds) || 0) * 1000;
                while (!token.stopped && performance.now() < until) await new Promise(resolve => setTimeout(resolve, Math.min(250, until - performance.now())));
                if (token.stopped) return;
                await this.api.call('missionEnd', { id, result: calculated.result, progress: calculated.progress });
                report('SCRIPT_CAMPAIGN_DONE', `${id}: ${i + 1}/${count}`);
            }
        }
    }

}

