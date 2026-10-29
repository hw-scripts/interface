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
        this.api = api;
        this.storage = storage;
        this.running = null;
        this.definitions = {
            EXPEDITIONS: {
                fields: { collect: true, send: true },
                run: (settings, report, token) => this.expeditions(settings, report, token)
            },
            TOWER: {
                fields: { buyBuffs: true, collectRewards: true, battles: true },
                run: (settings, report, token) => this.tower(settings, report, token)
            },
            BOSS: {
                fields: { raid: true, openChests: true },
                run: (settings, report, token) => this.outland(settings, report, token)
            }
        };
    }

    settings(section) {
        let saved;
        try { saved = JSON.parse(this.storage.get(`script:${section}`)); } catch {}
        return { ...this.definitions[section].fields, ...saved };
    }

    save(section, settings) {
        this.storage.set(`script:${section}`, JSON.stringify(settings));
    }

    async run(section, report) {
        if (this.running) throw new Error('SCRIPT_ALREADY_RUNNING');
        const token = { stopped: false, section };
        this.running = token;
        try {
            const outcome = await this.definitions[section].run(this.settings(section), report, token);
            report(token.stopped ? 'SCRIPT_STOPPED' : outcome || 'SCRIPT_DONE');
        } finally { this.running = null; }
    }

    stop() { if (this.running) this.running.stopped = true; }

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
        const { bosses } = await this.api.call('bossGetAll');
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
