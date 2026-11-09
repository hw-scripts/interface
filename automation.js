// Game request signing and automation adapted from ignored/HWrunner.js.
class InterfaceGameApi {
    constructor(original) {
        this.original = original;
        this.headers = null;
        this.url = null;
        this.requestId = 0;
        this.pending = Promise.resolve();
    }

    observe(request) {
        if (request.method?.toUpperCase() !== 'POST' || !/\/(api|rpc)\/$/.test(request.url)) return;
        const headers = Object.fromEntries(Object.entries(request.request.headers)
            .map(([name, value]) => [name.toLowerCase(), value]));
        if (!headers['x-auth-token'] || !headers['x-auth-session-id']) return;
        this.url = request.url;
        this.headers = headers;
        this.requestId = Math.max(this.requestId, Number(headers['x-request-id']) || 0);
    }

    static md5(text) {
        const bytes = new TextEncoder().encode(text);
        const buffer = new ArrayBuffer(Math.ceil((bytes.length + 9) / 64) * 64);
        const padded = new Uint8Array(buffer);
        padded.set(bytes);
        padded[bytes.length] = 128;
        const view = new DataView(buffer);
        view.setUint32(buffer.byteLength - 8, (bytes.length * 8) >>> 0, true);
        view.setUint32(buffer.byteLength - 4, Math.floor(bytes.length / 0x20000000), true);
        const state = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
        const shifts = [[7, 12, 17, 22], [5, 9, 14, 20], [4, 11, 16, 23], [6, 10, 15, 21]];
        for (let offset = 0; offset < buffer.byteLength; offset += 64) {
            let [a, b, c, d] = state;
            for (let i = 0; i < 64; i++) {
                const round = Math.floor(i / 16);
                const f = round === 0 ? (b & c) | (~b & d)
                    : round === 1 ? (d & b) | (~d & c)
                    : round === 2 ? b ^ c ^ d : c ^ (b | ~d);
                const g = round === 0 ? i : round === 1 ? (5 * i + 1) % 16
                    : round === 2 ? (3 * i + 5) % 16 : (7 * i) % 16;
                const sum = (a + f + Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000)
                    + view.getUint32(offset + g * 4, true)) | 0;
                const shift = shifts[round][i % 4];
                [a, b, c, d] = [d, (b + ((sum << shift) | (sum >>> (32 - shift)))) | 0, b, c];
            }
            [a, b, c, d].forEach((value, index) => { state[index] = (state[index] + value) | 0; });
        }
        return state.map(value => [0, 8, 16, 24]
            .map(shift => ((value >>> shift) & 255).toString(16).padStart(2, '0')).join('')).join('');
    }

    call(name, args = {}) {
        const execute = () => this.send(name, args);
        const result = this.pending.then(execute);
        this.pending = result.catch(() => {});
        return result;
    }

    async send(name, args) {
        if (!this.headers || !this.url) throw new Error('SCRIPT_API_NOT_READY');
        const body = JSON.stringify({ calls: [{ name, args, ident: 'body',
            context: { actionTs: Math.floor(performance.now()) } }] });
        const headers = { ...this.headers, 'x-request-id': String(++this.requestId) };
        let signature = `${headers['x-request-id']}:${headers['x-auth-token']}:${headers['x-auth-session-id']}:${body}:LIBRARY-VERSION=1UNIQUE-SESSION-ID=${headers['x-env-unique-session-id']}`;
        if (headers['x-env-unique-session-uuid']) signature += `UNIQUE-SESSION-UUID=${headers['x-env-unique-session-uuid']}`;
        headers['x-auth-signature'] = InterfaceGameApi.md5(signature);
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            this.original.open.call(xhr, 'POST', this.url, true);
            xhr.responseType = 'json';
            xhr.timeout = 30000;
            xhr.onerror = xhr.ontimeout = () => reject(new Error('SCRIPT_NETWORK_ERROR'));
            xhr.onload = () => {
                const response = xhr.response;
                const result = response?.results?.find(item => item.ident === 'body');
                const error = response?.error || result?.error || result?.result?.error || result?.result?.response?.error;
                if (xhr.status !== 200 || error || !result?.result || !('response' in result.result)) {
                    reject(new Error(error?.description || error?.name || 'SCRIPT_API_ERROR'));
                } else resolve(result.result.response);
            };
            for (const [key, value] of Object.entries(headers)) this.original.setRequestHeader.call(xhr, key, value);
            this.original.send.call(xhr, body);
        });
    }
}

class InterfaceAutomation {
    constructor(game, api, storage, battleCalculator = new InterfaceBattleCalculator(game)) {
        this.game = game;
        this.battleCalculator = battleCalculator;
        this.api = { call: async (name, args) => {
            if (this.running?.stopped) throw new Error('SCRIPT_STOPPED');
            const response = await api.call(name, args);
            if (name === 'userGetInfo') this.userInfo = response;
            if (name === 'expeditionGet') {
                for (const expedition of Object.values(response ?? {})) {
                    const time = Number(expedition.endTime) * 1000;
                    if (time > Date.now()) this.boundaries?.push(time);
                }
            }
            return response;
        } };
        this.storage = storage;
        this.running = null;
        this.definitions = {
            DAILY_BONUS: {
                fields: {},
                run: (settings, report, token) => this.dailyBonus(token)
            },
            QUEST_REWARDS: {
                fields: { collectStamina: false, collectPortals: false, collectBuffs: false,
                    collectVipPoints: false, collectHeroSouls: false, collectHeroes: false,
                    collectExperience: true, followChains: true },
                run: (settings, report, token) => this.questRewards(settings, report, token)
            },
            MAIL: {
                fields: { collectStamina: false, collectPortals: false, collectBuffs: false,
                    collectVipPoints: false, collectHeroSouls: false, collectHeroes: false,
                    collectExperience: true, collectExpiring: true },
                run: (settings, report, token) => this.mail(settings, report, token)
            },
            EXPEDITIONS: {
                fields: { collect: true, send: true, openArtifactChest: false },
                run: (settings, report, token) => this.expeditions(settings, report, token)
            },
            TOWER: {
                fields: { buyBuffs: true, collectRewards: true, battles: true },
                run: (settings, report, token) => this.tower(settings, report, token)
            },
            BOSS: {
                fields: { raid: true, openChests: true, battles: false, autoTeam: true },
                run: (settings, report, token) => this.outland(settings, report, token)
            },
            RESTART: {
                fields: {},
                endsSequence: true,
                run: (settings, report, token) => {
                    if (!token.stopped) window.location.reload();
                }
            }
        };
        let legacy = [];
        try { legacy = JSON.parse(storage.get('scriptSequence') ?? '[]'); } catch {}
        for (const section of Object.keys(this.definitions)) {
            let saved = {};
            try { saved = JSON.parse(storage.get(`script:${section}`)) || {}; } catch {}
            if (typeof saved.enabled !== 'boolean')
                storage.set(`script:${section}`, JSON.stringify({ ...saved, enabled: Array.isArray(legacy) && legacy.includes(section) }));
        }
    }

    settings(section) {
        let saved;
        try { saved = JSON.parse(this.storage.get(`script:${section}`)); } catch {}
        return { enabled: false, ...this.definitions[section].fields, ...saved };
    }

    save(section, settings) {
        this.storage.set(`script:${section}`, JSON.stringify({ ...this.settings(section), ...settings }));
    }

    async run(section, report) {
        if (this.running) throw new Error('SCRIPT_ALREADY_RUNNING');
        const token = { stopped: false, section };
        this.running = token;
        this.boundaries = [];
        this.lastResult = null;
        try {
            const outcome = await this.definitions[section].run(this.settings(section), report, token);
            this.lastResult = { completed: !token.stopped && [undefined, 'SCRIPT_DONE',
                'SCRIPT_DAILY_BONUS_ALREADY_COLLECTED', 'SCRIPT_DAILY_BONUS_COLLECTED', 'SCRIPT_NOTHING_TO_COLLECT'].includes(outcome),
                boundaries: this.boundaries };
            report(token.stopped ? 'SCRIPT_STOPPED' : outcome || 'SCRIPT_DONE');
        } catch (error) {
            if (!token.stopped) throw error;
            this.lastResult = { completed: false, boundaries: this.boundaries };
            report('SCRIPT_STOPPED');
        } finally { this.running = null; }
    }

    stop() { if (this.running) this.running.stopped = true; }

    rewardAllowed(reward, settings) {
        if (!reward || !Object.keys(reward).length) return false;
        return !(reward.stamina && !settings.collectStamina
            || reward.refillable?.[45] && !settings.collectPortals
            || reward.buff && !settings.collectBuffs
            || reward.vipPoints && !settings.collectVipPoints
            || reward.fragmentHero && !settings.collectHeroSouls
            || reward.bundleHeroReward && !settings.collectHeroes
            || (reward.exp || reward.teamExp) && !settings.collectExperience);
    }

    async mail(settings, report, token) {
        const result = await this.api.call('mailGetAll');
        if (token.stopped) return;
        const now = Date.now() / 1000;
        const letterIds = Object.values(result?.letters ?? {}).filter(letter => {
            if (!letter?.reward || !Object.keys(letter.reward).length) return false;
            const expires = Number(letter.availableUntil);
            if (expires && expires <= now) return false;
            return this.rewardAllowed(letter.reward, settings)
                || settings.collectExpiring && expires > now && expires - now < 86400;
        }).map(letter => Number(letter.id)).filter(Number.isSafeInteger);
        if (!letterIds.length) return 'SCRIPT_NOTHING_TO_COLLECT';
        await this.api.call('mailFarm', { letterIds });
        report('SCRIPT_MAIL_COLLECTED', letterIds.length);
    }

    async questRewards(settings, report, token) {
        const collected = new Set();
        let passes;
        do {
            const quests = await this.api.call('questGetAll');
            if (token.stopped) return;
            const ready = Object.values(quests ?? {}).filter(quest => quest.state == 2
                && !collected.has(Number(quest.id)) && this.rewardAllowed(quest.reward, settings));
            const eligible = [];
            for (const quest of ready) {
                const questId = Number(quest.id);
                if (!Number.isSafeInteger(questId) || questId >= 2001e4 && questId < 14e8) continue;
                if (quest.reward?.battlePassExp && !this.game.lib?.quest?.special?.[questId]) {
                    const library = this.game.lib;
                    const info = library?.quest?.battlePass?.[questId];
                    const chain = library?.battlePass?.questChain?.[info?.chain];
                    if (!chain) continue;
                    if (!passes) {
                        const regular = await this.api.call('battlePass_getInfo');
                        if (token.stopped) return;
                        const special = await this.api.call('battlePass_getSpecial');
                        if (token.stopped) return;
                        passes = { [regular.id]: regular.battlePass, ...special };
                    }
                    const pass = passes[chain.battlePass];
                    if (!pass) continue;
                    const now = Date.now() / 1000;
                    if (pass.startDate > now || pass.endDate < now) continue;
                    if (chain.requirement?.battlePassTicket && !pass.ticket) continue;
                    const level = Math.max(0, ...Object.values(library.battlePass.level ?? {})
                        .filter(entry => entry.battlePass == chain.battlePass && pass.exp >= entry.experience)
                        .map(entry => Number(entry.level)));
                    if (chain.requirement?.battlePassLevel && level < chain.requirement.battlePassLevel) continue;
                }
                eligible.push(questId);
            }
            if (!eligible.length) break;
            for (const questId of eligible) {
                if (token.stopped) return;
                if (questId >= 2e7 && questId < 14e8)
                    await this.api.call('quest_questsFarm', { questIds: [questId] });
                else await this.api.call('questFarm', { questId });
                collected.add(questId);
                report('SCRIPT_QUESTS_COLLECTED', collected.size);
            }
        } while (settings.followChains && !token.stopped);
        if (!collected.size) return 'SCRIPT_NOTHING_TO_COLLECT';
    }

    async dailyBonus(token) {
        const { availableToday, availableVip, currentDay } = await this.api.call('dailyBonusGetInfo');
        if (token.stopped) return;
        if (!availableToday) return 'SCRIPT_DAILY_BONUS_ALREADY_COLLECTED';

        const library = this.game.lib;
        const day = library?.dailyBonusStatic?.[`${currentDay}_0_0`];
        const vipLevels = library?.level?.vip;
        if (!day || !vipLevels) throw new Error('SCRIPT_LIBRARY_NOT_READY');
        const user = await this.api.call('userGetInfo');
        if (token.stopped) return;
        const vipLevel = Object.values(vipLevels).reduce((level, entry) =>
            Number(user.vipPoints) >= Number(entry.vipPoints) ? Math.max(level, Number(entry.level)) : level, 0);
        await this.api.call('dailyBonusFarm', {
            vip: availableVip && vipLevel >= Number(day.vipLevelDouble) ? 1 : 0
        });
        return 'SCRIPT_DAILY_BONUS_COLLECTED';
    }

    async expeditions(settings, report, token) {
        const slots = this.game.lib?.expedition?.slot;
        if (!slots) throw new Error('SCRIPT_LIBRARY_NOT_READY');
        let expeditions = await this.api.call('expeditionGet');
        if (settings.collect) {
            for (const expedition of Object.values(expeditions)) {
                if (token.stopped) return;
                if (slots[expedition.slotId]?.type === 'video') continue;
                if (expedition.status == 2 && expedition.endTime && Date.now() / 1000 > expedition.endTime) {
                    await this.api.call('expeditionFarm', { expeditionId: expedition.id });
                    report('SCRIPT_EXPEDITION_COLLECTED', expedition.id);
                }
            }
        }
        if (token.stopped) return;
        if (settings.openArtifactChest) {
            const inventory = await this.api.call('inventoryGet');
            if (token.stopped) return;
            const keys = Number(inventory?.consumable?.[45]);
            if (Number.isSafeInteger(keys) && keys > 0) {
                let remaining = keys;
                while (remaining > 0) {
                    if (token.stopped) return;
                    const amount = remaining >= 100 ? 100 : remaining > 10 ? 10 : 1;
                    await this.api.call('artifactChestOpen', { amount, free: true });
                    remaining -= amount;
                    report('SCRIPT_ARTIFACT_CHEST_OPENED', keys - remaining);
                }
            } else report('SCRIPT_ARTIFACT_CHEST_NO_KEY');
        }
        if (!settings.send || token.stopped) return;
        // Refresh after collecting so heroes and newly available expeditions are current.
        expeditions = await this.api.call('expeditionGet');
        const heroes = await this.api.call('heroGetAll');
        const used = new Set(Object.values(expeditions).filter(e => e.status != 1).flatMap(e => e.heroes || []));
        let available = Object.values(heroes).filter(hero => hero.power > 0 && !used.has(hero.id))
            .map(hero => ({ id: hero.id, power: hero.power * (hero.id == 63 && hero.color >= 16 ? 3 : 1) }))
            .sort((a, b) => a.power - b.power);
        for (const expedition of Object.values(expeditions).filter(e => e.status == 1)
            .sort((a, b) => b.power - a.power)) {
            if (token.stopped) return;
            if (!slots[expedition.slotId] || slots[expedition.slotId].type === 'video') continue;
            const selected = [];
            for (let count = 0; count < 5; count++) {
                const sum = selected.reduce((total, hero) => total + hero.power, 0);
                const need = Math.round((expedition.power - sum) / (5 - selected.length));
                const hero = available.find(hero => !selected.includes(hero) && hero.power > need);
                if (hero) selected.push(hero);
            }
            if (selected.length !== 5 || selected.reduce((sum, hero) => sum + hero.power, 0) < expedition.power) continue;
            const ids = selected.map(hero => hero.id);
            await this.api.call('expeditionSendHeroes', { expeditionId: expedition.id, heroes: ids });
            available = available.filter(hero => !ids.includes(hero.id));
            report('SCRIPT_EXPEDITION_SENT', expedition.id);
        }
    }

    async outland(settings, report, token) {
        let { bosses } = await this.api.call('bossGetAll');
        if (settings.battles && Object.values(bosses).some(boss => !boss.mayRaid)) {
            this.battleCalculator.assertAvailable('get_boss');
            const teams = await this.api.call('teamGetAll');
            const favors = await this.api.call('teamGetFavor');
            const owned = settings.autoTeam ? await this.api.call('heroGetAll') : null;
            for (const boss of Object.values(bosses)) {
                if (token.stopped) return;
                if (boss.mayRaid) continue;
                const key = `boss_${boss.id}`;
                const team = teams?.[key];
                let heroes;
                if (settings.autoTeam) {
                    const allowed = this.game.lib?.boss?.list?.[boss.id]?.recommendedHeroes;
                    if (!Array.isArray(allowed) || !allowed.length) {
                        report('SCRIPT_BOSS_NO_RULES', boss.id);
                        continue;
                    }
                    const candidates = new Set(allowed.map(Number));
                    heroes = [...new Map(Object.values(owned ?? {})
                        .filter(hero => candidates.has(Number(hero.id)) && Number(hero.power) > 0)
                        .map(hero => [Number(hero.id), hero])).values()]
                        .sort((a, b) => Number(b.power) - Number(a.power) || Number(a.id) - Number(b.id))
                        .slice(0, 5).map(hero => Number(hero.id));
                } else heroes = Array.isArray(team) ? team.filter(id => Number.isInteger(id) && id > 0 && id < 6000) : [];
                if (!heroes.length) { report('SCRIPT_BOSS_NO_TEAM', boss.id); continue; }
                const favor = {};
                const patrons = new Set();
                for (const mapping of [favors?.[key], ...(settings.autoTeam ? Object.values(favors ?? {}) : [])]) {
                    for (const hero of heroes) {
                        const patron = Number(mapping?.[hero]);
                        if (!favor[hero] && Number.isInteger(patron) && patron >= 6000 && !patrons.has(patron)) {
                            favor[hero] = patron;
                            patrons.add(patron);
                        }
                    }
                }
                const args = { bossId: boss.id, heroes, favor };
                const pet = Array.isArray(team) ? team.find(id => Number.isInteger(id) && id >= 6000) : undefined;
                if (pet != null) args.pet = pet;
                report('SCRIPT_BOSS_TEAM', `${boss.id}: ${heroes.join(', ')}`);
                report('SCRIPT_BOSS_ATTACK', boss.id);
                const started = performance.now();
                const battle = await this.api.call('bossAttack', args);
                if (token.stopped) return;
                const calculated = await this.battleCalculator.calculate(battle, 'get_boss');
                if (token.stopped) return;
                if (!calculated?.result || !Array.isArray(calculated.progress)) throw new Error('SCRIPT_BATTLE_UNAVAILABLE');
                const waitUntil = started + Math.max(0, Number(calculated.waitSeconds) || 0) * 1000;
                const timerId = Symbol();
                let shown;
                while (performance.now() < waitUntil && !token.stopped) {
                    const seconds = Math.ceil((waitUntil - performance.now()) / 1000);
                    if (seconds !== shown) {
                        report('SCRIPT_BOSS_WAIT', `${boss.id}: ${seconds}`, { id: timerId, pending: true });
                        shown = seconds;
                    }
                    if (!token.stopped) await new Promise(resolve => setTimeout(resolve, Math.min(250, waitUntil - performance.now())));
                }
                if (shown != null) report(token.stopped ? 'SCRIPT_STOPPED' : 'SCRIPT_BOSS_WAIT',
                    token.stopped ? boss.id : `${boss.id}: 0`, { id: timerId, pending: false });
                if (token.stopped) return;
                await this.api.call('bossEndBattle', { result: calculated.result, progress: calculated.progress });
                report(calculated.result.win ? 'SCRIPT_BOSS_WON' : 'SCRIPT_BOSS_LOST', boss.id);
            }
            if (token.stopped) return;
            ({ bosses } = await this.api.call('bossGetAll'));
        }
        for (const boss of Object.values(bosses)) {
            if (token.stopped) return;
            let raided = false;
            if (settings.raid && boss.mayRaid) {
                await this.api.call('bossRaid', { bossId: boss.id });
                raided = true;
                report('SCRIPT_BOSS_RAIDED', boss.id);
            }
            if (token.stopped) return;
            if (settings.openChests && (raided || boss.chestId == 1)) {
                await this.api.call('bossOpenChest', { bossId: boss.id, amount: 1, starmoney: 0 });
                report('SCRIPT_BOSS_CHEST', boss.id);
            }
        }
    }

    async tower(settings, report, token) {
        let info = await this.api.call('towerGetInfo');
        if (!info?.floor) throw new Error('SCRIPT_TOWER_UNAVAILABLE');
        const inventory = await this.api.call('inventoryGet');
        let skulls = inventory?.coin?.[7] || 0;
        let heroes, teams, favors;
        if (settings.battles) {
            heroes = Object.values(await this.api.call('heroGetAll')).sort((a, b) => b.power - a.power);
            teams = await this.api.call('teamGetAll');
            favors = await this.api.call('teamGetFavor');
        }
        const update = response => {
            skulls += (response?.reward?.coin?.[7] || 0) + (response?.skullReward?.coin?.[7] || 0);
            info = response?.tower || response;
        };
        let finished = false;
        // Each iteration makes one floor transition; guard against unchanged server state.
        for (let step = 0; step < 160 && !token.stopped; step++) {
            const floor = Number(info.floorNumber);
            report('SCRIPT_TOWER_FLOOR', floor);
            const opened = info.floorType === 'chest' && info.floor.chests.some(chest => chest.opened);
            if (floor >= 50 && opened) { finished = true; break; }
            if (info.mayFullSkip && Number(info.teamLevel) === 130) {
                if (info.floorType === 'chest' && !opened) {
                    await this.api.call('towerOpenChest', { num: 2 });
                    if (floor >= 50) { finished = true; break; }
                }
                update(await this.api.call('towerNextChest'));
                continue;
            }
            if (info.floorType === 'chest') {
                if (!opened) await this.api.call('towerOpenChest', { num: 2 });
                if (floor >= 50) { finished = true; break; }
            } else if (info.floorType === 'buff') {
                if (settings.buyBuffs) {
                    const costs = [0, 1, 6, 16, 40, 1, 6, 16, 40, 1, 6, 16, 40];
                    for (const buff of info.floor) {
                        if (token.stopped) return;
                        if (buff.id > 0 && buff.id <= 12 && costs[buff.id] <= skulls) {
                            await this.api.call('towerBuyBuff', { buffId: buff.id });
                            skulls -= costs[buff.id];
                        }
                    }
                }
            } else if (info.floorType === 'battle') {
                if (floor <= Number(info.maySkipFloor)) {
                    update(await this.api.call('towerSkipFloor'));
                    continue;
                }
                if (info.floor.state != 2) {
                    if (!settings.battles) return 'SCRIPT_TOWER_NEEDS_BATTLE';
                    const selected = heroes.filter(hero => !info.states?.heroes?.[hero.id]?.isDead).slice(0, 5).map(hero => hero.id);
                    if (!selected.length) throw new Error('SCRIPT_TOWER_NO_HEROES');
                    // Check calculator availability before starting a server-side battle.
                    this.battleCalculator.assertAvailable();
                    const favor = Object.fromEntries(Object.entries(favors.tower || {}).filter(([hero]) => selected.includes(Number(hero))));
                    const args = { heroes: selected, favor };
                    const pet = teams.tower?.filter(id => id >= 6000).pop();
                    if (pet) args.pet = pet;
                    const started = performance.now();
                    const battle = await this.api.call('towerStartBattle', args);
                    const calculated = await this.battleCalculator.calculate(battle, 'get_tower');
                    if (calculated.result.stars < 3) throw new Error('SCRIPT_TOWER_BATTLE_LOST');
                    const remaining = calculated.waitSeconds * 1000 - (performance.now() - started);
                    if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
                    const result = await this.api.call('towerEndBattle', { result: calculated.result, progress: calculated.progress });
                    skulls += result?.reward?.coin?.[7] || 0;
                }
            } else throw new Error('SCRIPT_TOWER_UNKNOWN_FLOOR');
            if (token.stopped) return;
            update(await this.api.call('towerNextFloor'));
        }
        if (!finished && !token.stopped) throw new Error('SCRIPT_TOWER_LIMIT');
        if (settings.collectRewards && !token.stopped) {
            // Refresh points after opening the last chest.
            info = await this.api.call('towerGetInfo');
            const points = Object.keys(info.pointRewards || {}).filter(point => Number(point) <= Number(info.points) && !info.pointRewards[point]);
            if (points.length) await this.api.call('tower_farmPointRewards', { points });
            if (skulls > 0) await this.api.call('tower_farmSkullReward');
        }
    }
}
