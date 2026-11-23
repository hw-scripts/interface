	function exchangeColorGroup(item, colorDefinitions) {
		const tier = [item?.color, item?.tier, item?.heroColor]
			.map(Number).find(value => Number.isInteger(value) && value > 0);
		if (!tier || !colorDefinitions?.[tier]) return null;
		const ident = String(colorDefinitions[tier].ident ?? '').toLowerCase();
		const names = ['white', 'green', 'blue', 'violet', 'orange', 'red', 'brown'];
		const index = names.findIndex(name => ident.includes(name) || (name === 'white' && /gray|grey/.test(ident)) || (name === 'violet' && ident.includes('purple')));
		return index < 0 ? null : index;
	}

	function calculateHeroEquipmentProtection(heroes, heroLibrary, items, inventory) {
		if (!heroes || typeof heroes !== 'object' || !heroLibrary || !items) throw new Error('Missing hero or equipment data');
		const demand = new Map();
		const ownedHeroes = Object.values(heroes).filter(hero => hero && Number(hero.id) > 0 && Number(hero.id) < 6000);
		if (!ownedHeroes.length) throw new Error('No owned heroes available for equipment calculation');
		if (ownedHeroes.some(hero => hero.power == null || !Number.isFinite(Number(hero.power)))) {
			throw new Error('Missing hero power for equipment calculation');
		}
		ownedHeroes.sort((a, b) => Number(b.power) - Number(a.power) || Number(a.id) - Number(b.id));
		for (const hero of ownedHeroes.slice(0, 15)) {
			const current = Number(hero.color);
			const tiers = heroLibrary[hero.id]?.color;
			if (!Number.isInteger(current) || !tiers || !tiers[current]) throw new Error(`Missing equipment tiers for hero ${hero.id}`);
			for (const [tierId, tier] of Object.entries(tiers)) {
				const level = Number(tierId);
				if (!Number.isInteger(level) || level < current) continue;
				if (!tier?.items || typeof tier.items !== 'object') throw new Error(`Missing equipment slots for hero ${hero.id}, tier ${tierId}`);
				for (const [slotId, itemId] of Object.entries(tier.items)) {
					if (level === current && Object.prototype.hasOwnProperty.call(hero.slots ?? {}, slotId)) continue;
					if (!(Number(itemId) > 0)) continue;
					const key = `gear:${itemId}`;
					demand.set(key, (demand.get(key) || 0) + 1);
				}
			}
		}
		const protectedItems = {};
		function reserve(type, id, amount, parents = new Set()) {
			const key = `${type}:${id}`;
			if (parents.has(key)) throw new Error(`Circular equipment recipe: ${key}`);
			if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error(`Invalid equipment demand: ${key}`);
			const available = Math.max(0, (Number(inventory[type]?.[id]) || 0) - (protectedItems[type]?.[id] || 0));
			const used = Math.min(available, amount);
			if (used) {
				protectedItems[type] ??= {};
				protectedItems[type][id] = (protectedItems[type][id] || 0) + used;
			}
			const missing = amount - used;
			if (!missing || type === 'fragmentGear' || type === 'fragmentScroll') return;
			if (type !== 'gear' && type !== 'scroll') throw new Error(`Unknown equipment component: ${key}`);
			const item = items[type]?.[id];
			if (!item) throw new Error(`Missing equipment definition: ${key}`);
			const next = new Set(parents).add(key);
			const recipe = item.craftRecipe;
			const components = Object.entries(recipe ?? {}).filter(([componentType]) => componentType !== 'gold');
			if (components.length) {
				for (const [componentType, entries] of components) {
					if (!entries || typeof entries !== 'object') throw new Error(`Invalid equipment recipe: ${key}`);
					for (const [componentId, quantity] of Object.entries(entries)) reserve(componentType, componentId, missing * Number(quantity), next);
				}
			} else if (item.fragmentMergeCost?.fragmentCount != null) {
				const fragments = Number(item.fragmentMergeCost.fragmentCount);
				if (!Number.isSafeInteger(fragments) || fragments <= 0) throw new Error(`Invalid fragment recipe: ${key}`);
				reserve(type === 'gear' ? 'fragmentGear' : 'fragmentScroll', id, missing * fragments, next);
			}
		}
		for (const [key, count] of demand) reserve('gear', key.slice(5), count);
		return protectedItems;
	}

	function planActivityExchange(inventory, items, colors, reserves, target, maxActivity, protectedItems = {}) {
		const candidates = [];
		for (const type of ['gear', 'scroll']) {
			for (const [inventoryType, valueKey] of [[type, 'enchantValue'], [type === 'gear' ? 'fragmentGear' : 'fragmentScroll', 'fragmentEnchantValue']]) {
				for (const [id, count] of Object.entries(inventory[inventoryType] ?? {})) {
					const item = items[type]?.[id];
					const group = exchangeColorGroup(item, colors);
					const value = Number(item?.[valueKey]);
					const available = Math.max(0, Math.floor(Number(count)) - (protectedItems[inventoryType]?.[id] || 0) - (reserves[group] ?? Infinity));
					if (group === null || !Number.isFinite(value) || value <= 0 || !Number.isSafeInteger(available) || !available) continue;
					candidates.push({ id, type: inventoryType, group, value, available });
				}
			}
		}
		candidates.sort((a, b) => a.group - b.group || b.available - a.available || a.type.localeCompare(b.type) || Number(a.id) - Number(b.id));
		const selected = {};
		let activity = 0;
		for (const item of candidates) {
			if (activity >= target) break;
			const desired = Math.ceil((target - activity) / item.value);
			const allowed = Math.floor((maxActivity - activity) / item.value);
			const amount = Math.min(item.available, desired, allowed);
			if (amount <= 0) continue;
			(selected[item.type] ??= {})[item.id] = amount;
			activity += amount * item.value;
		}
		return { items: selected, activity, eligibleCount: candidates.length,
			minItemValue: candidates.length ? Math.min(...candidates.map(item => item.value)) : null };
	}

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
            // Expedition and inventory changes synchronize with the canvas.
            // Other mutations lock before sending: a lost response can still
            // follow a successful server change. Keep an existing lock intact.
            const readOnly = new Set(['userGetInfo', 'expeditionGet', 'dailyBonusGetInfo',
                'mailGetAll', 'questGetAll', 'battlePass_getInfo', 'battlePass_getSpecial',
                'bossGetAll', 'heroGetAll', 'pet_getAll', 'teamGetAll', 'teamGetFavor', 'inventoryGet',
                'towerGetInfo', 'dungeonGetInfo', 'clanGetInfo', 'titanGetAll', 'specialOffer_getAll']);
            const synchronized = new Set(['expeditionFarm', 'expeditionSendHeroes', 'artifactChestOpen']);
            if (!readOnly.has(name) && !synchronized.has(name)) {
                this.requiresReload = true;
                this.onRequiresReload?.();
            }
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
                fields: {},
                run: (settings, report, token) => this.allRewards(report, token)
            },
            MAIL: {
                fields: {},
                run: (settings, report, token) => this.mail(settings, report, token)
            },
            EXPEDITIONS: {
                fields: { collect: true, send: true, openArtifactChest: false },
                run: (settings, report, token) => this.expeditions(settings, report, token)
            },
            TOWER: {
                fields: { buyBuffs: true, collectRewards: true, battles: true, avoidDeaths: true },
                run: (settings, report, token) => this.tower(settings, report, token)
            },
            BOSS: {
                fields: { raid: true, openChests: true, battles: false, autoTeam: true },
                run: (settings, report, token) => this.outland(settings, report, token)
            },
            CLAN_DUNGEON: {
                fields: { targetTitanite: 150, collectTalent: true },
                run: (settings, report, token) => new InterfaceDungeon(this.api, this.battleCalculator,
                    (report, token) => this.collectDungeonCards(report, token)).run(settings, report, token)
            },
            ITEM_EXCHANGE: {
                fields: { targetActivity: 2000, itemReserves: '200/200/200/200/200/200/200' },
                run: (settings, report, token) => this.exchangeItems(settings, report, token)
            },
            HERO_UPGRADE: {
                fields: { energyBudget: 0, reserveEnergy: 0, reserveGold: 0 },
                run: (settings, report, token) => new InterfaceHeroUpgrade(this.api).run(settings, report, token)
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
        const settings = { enabled: false, ...this.definitions[section].fields, ...saved };
        if (section === 'CLAN_DUNGEON') {
            const value = this.storage.get('battle:dungeonAvoidDeaths');
            settings.avoidDeaths = value === null ? saved?.avoidDeaths !== false : value === 'true';
        }
        return settings;
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

    async mail(settings, report, token, rewardFilter = reward => Boolean(reward && Object.keys(reward).length), collected = new Set()) {
        const result = await this.api.call('mailGetAll');
        if (token.stopped) return;
        const now = Date.now() / 1000;
        const letterIds = Object.values(result?.letters ?? {}).filter(letter => {
            if (!letter?.reward || !Object.keys(letter.reward).length) return false;
            const expires = Number(letter.availableUntil);
            if (expires && expires <= now) return false;
            return rewardFilter(letter.reward)
                || settings.collectExpiring && expires > now && expires - now < 86400;
        }).map(letter => Number(letter.id)).filter(id => Number.isSafeInteger(id) && !collected.has(id));
        if (!letterIds.length) return 'SCRIPT_NOTHING_TO_COLLECT';
        await this.api.call('mailFarm', { letterIds });
        letterIds.forEach(id => collected.add(id));
        report('SCRIPT_MAIL_COLLECTED', letterIds.length);
    }

    async questRewards(settings, report, token, rewardFilter = reward => Boolean(reward && Object.keys(reward).length), collected = new Set()) {
        let passes;
        do {
            const quests = await this.api.call('questGetAll');
            if (token.stopped) return;
            const ready = Object.values(quests ?? {}).filter(quest => quest.state == 2
                && !collected.has(`${quest.id}:${quest.createTime ?? ''}:${quest.farmCount ?? 0}`) && rewardFilter(quest.reward));
            const eligible = [];
            for (const quest of ready) {
                const questId = Number(quest.id);
                if (!Number.isSafeInteger(questId) || questId >= 20010100 && questId < 14e8) continue;
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
                eligible.push(quest);
            }
            if (!eligible.length) break;
            const claimKey = quest => `${quest.id}:${quest.createTime ?? ''}:${quest.farmCount ?? 0}`;
            const nonClan = eligible.filter(quest => Number(quest.id) < 1e6);
            if (nonClan.length) {
                if (token.stopped) return;
                await this.api.call('quest_farmNonClan', { questIds: nonClan.map(quest => Number(quest.id)) });
                nonClan.forEach(quest => collected.add(claimKey(quest)));
                report('SCRIPT_QUESTS_COLLECTED', collected.size);
            }
            for (const quest of eligible.filter(quest => Number(quest.id) >= 1e6)) {
                if (token.stopped) return;
                const questId = Number(quest.id);
                if (questId >= 2e7 && questId < 14e8 && questId !== 20000181)
                    await this.api.call('quest_questsFarm', { questIds: [questId] });
                else await this.api.call('questFarm', { questId });
                collected.add(claimKey(quest));
                report('SCRIPT_QUESTS_COLLECTED', collected.size);
            }
        } while (settings.followChains !== false && !token.stopped);
        if (!collected.size) return 'SCRIPT_NOTHING_TO_COLLECT';
    }

    async allRewards(report, token) {
        await this.dailyBonus(token);
        if (token.stopped) return;
        const claimedOffers = new Set();
        const claimedPrestige = new Set();
        const claimedQuests = new Set();
        const claimedLetters = new Set();
        while (!token.stopped) {
            let advanced = false;
            try {
                const result = await this.api.call('clan_prestigeFarmAllRewards');
                const levels = [...(result?.farmedPrestigeLevels ?? []).map(id => `free:${id}`),
                    ...(result?.farmedPrestigeLevelsPaid ?? []).map(id => `paid:${id}`)];
                for (const level of levels) if (!claimedPrestige.has(level)) { claimedPrestige.add(level); advanced = true; }
            } catch (error) {
                if (error?.message !== 'Level reward not available') throw error;
            }
            if (token.stopped) return;
            const offers = await this.api.call('specialOffer_getAll');
            for (const offer of Object.values(offers ?? {})) {
                if (token.stopped) return;
                if (offer.offerType !== 'dailyReward' || offer.type !== 'reward' || !offer.reward || claimedOffers.has(String(offer.id))) continue;
                try {
                    await this.api.call('specialOffer_farmReward', { offerId: offer.id });
                    advanced = true;
                } catch (error) {
                    if (error?.message !== 'Reward has been farmed') throw error;
                }
                claimedOffers.add(String(offer.id));
            }
            if (token.stopped) return;
            const before = claimedQuests.size;
            await this.questRewards({ followChains: true }, report, token, undefined, claimedQuests);
            if (token.stopped) return;
            const mailOutcome = await this.mail({}, report, token, undefined, claimedLetters);
            if (token.stopped) return;
            if (claimedQuests.size > before || mailOutcome !== 'SCRIPT_NOTHING_TO_COLLECT') advanced = true;
            if (!advanced) break;
        }
    }

    async collectDungeonCards(report, token) {
        const hasCards = reward => Number(reward?.consumable?.[81]) > 0;
        await this.mail({ collectExpiring: false }, report, token, hasCards);
        if (token.stopped) return;
        await this.questRewards({ followChains: true }, report, token, hasCards);
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

    async exchangeItems(settings, report, token) {
        const input = String(settings.itemReserves ?? '').trim();
        if (!/^\d+(?:\D+\d+){6}$/.test(input)) throw new Error('SCRIPT_EXCHANGE_INVALID_RESERVES');
        const reserves = input.split(/\D+/).map(Number);
        const requested = Number(settings.targetActivity);
        if (!reserves.every(Number.isSafeInteger) || !Number.isSafeInteger(requested) || requested < 1)
            throw new Error('SCRIPT_EXCHANGE_INVALID_RESERVES');
        const items = this.game.lib?.inventoryItem;
        const colors = this.game.lib?.enum?.heroColor;
        const heroLibrary = this.game.lib?.hero;
        if (!items || !colors || !heroLibrary) throw new Error('SCRIPT_LIBRARY_NOT_READY');
        let inventory = await this.api.call('inventoryGet');
        let clan = await this.api.call('clanGetInfo');
        let heroes = await this.api.call('heroGetAll');
        const initial = Number(clan?.stat?.todayItemsActivity);
        if (!Number.isFinite(initial)) throw new Error('SCRIPT_EXCHANGE_COUNTER');
        const target = Math.min(requested, Math.max(0, 2000 - initial));
        let current = initial;
        while (!token.stopped && current - initial < target && current < 2000) {
            const protectedItems = calculateHeroEquipmentProtection(heroes, heroLibrary, items, inventory);
            const plan = planActivityExchange(inventory, items, colors, reserves,
                target - (current - initial), 2000 - current, protectedItems);
            if (!(plan.activity > 0)) break;
            await this.api.call('clanItemsForActivity', { items: plan.items });
            if (token.stopped) return;
            inventory = await this.api.call('inventoryGet');
            clan = await this.api.call('clanGetInfo');
            heroes = await this.api.call('heroGetAll');
            const next = Number(clan?.stat?.todayItemsActivity);
            if (!Number.isFinite(next) || next <= current) throw new Error('SCRIPT_EXCHANGE_COUNTER');
            current = next;
            report('SCRIPT_EXCHANGE_PROGRESS', `${current - initial}/${target}`);
        }
        if (!token.stopped) report('SCRIPT_EXCHANGE_PROGRESS', `${current - initial}/${target}`);
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

    canPatron(pet, heroId) {
        const unlockColor = Number(this.game.lib?.rule?.petFavorUnlockColor);
        const definition = this.game.lib?.pet?.[pet?.id];
        // Color is the promotion rank. No separate level/star unlock is present
        // in the captured rules; require a summoned, valid pet, not invented thresholds.
        return Boolean(pet && Number.isInteger(Number(pet.id))
            && Number.isInteger(Number(pet.level)) && Number(pet.level) > 0
            && Number.isInteger(Number(pet.star)) && Number(pet.star) > 0
            && Number.isFinite(unlockColor) && unlockColor > 0
            && Number.isInteger(Number(pet.color)) && Number(pet.color) >= unlockColor
            && Array.isArray(definition?.favorHeroes)
            && definition.favorHeroes.some(id => Number(id) === Number(heroId)));
    }

    async outland(settings, report, token) {
        let { bosses } = await this.api.call('bossGetAll');
        if (settings.battles && Object.values(bosses).some(boss => !boss.mayRaid)) {
            this.battleCalculator.assertAvailable('get_boss');
            const teams = await this.api.call('teamGetAll');
            const favors = await this.api.call('teamGetFavor');
            const pets = new Map(Object.values(await this.api.call('pet_getAll') ?? {}).map(pet => [Number(pet.id), pet]));
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
                        if (!favor[hero] && this.canPatron(pets.get(patron), hero) && !patrons.has(patron)) {
                            favor[hero] = patron;
                            patrons.add(patron);
                        }
                    }
                }
                const args = { bossId: boss.id, heroes, favor };
                const pet = Array.isArray(team) ? team.find(id => Number.isInteger(id) && id >= 6000) : undefined;
                if (pet != null && pets.has(pet)) args.pet = pet;
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
        let savedTeam;
        try { savedTeam = JSON.parse(this.storage.get('tower:lastWinningTeam')); } catch {}
        // A changed game selection takes precedence over our last automatic team.
        const gameSelection = JSON.stringify([teams?.tower, favors?.tower]);
        let preferred = savedTeam?.gameSelection === gameSelection ? savedTeam.heroes : teams?.tower;
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
                    const living = heroes.filter(hero => {
                        const state = info.states?.heroes?.[hero.id];
                        return !state?.isDead && !(state?.hp != null && Number(state.hp) <= 0);
                    });
                    const available = new Set(living.map(hero => Number(hero.id)));
                    const selected = [...new Set((preferred || []).map(Number))].filter(id => available.has(id)).slice(0, 5);
                    // Fill only missing slots; never displace a living member of the chosen team.
                    for (const hero of living) {
                        if (selected.length >= 5) break;
                        if (!selected.includes(Number(hero.id))) selected.push(Number(hero.id));
                    }
                    if (!selected.length) throw new Error('SCRIPT_TOWER_NO_HEROES');
                    this.battleCalculator.assertAvailable();
                    const queue = [selected];
                    const seen = new Set([selected.slice().sort((a, b) => a - b).join(',')]);
                    let accepted;
                    let won = false;
                    // Bound the search on large rosters. Each attempt is sequential and cancellable.
                    for (let attempt = 0; attempt < queue.length && attempt < 80; attempt++) {
                        if (token.stopped) return;
                        const lineup = queue[attempt];
                        const favor = Object.fromEntries(Object.entries(favors.tower || {})
                            .filter(([hero]) => lineup.includes(Number(hero))));
                        const args = { heroes: lineup, favor };
                        const pet = teams.tower?.filter(id => id >= 6000).pop();
                        if (pet) args.pet = pet;
                        const started = performance.now();
                        const battle = await this.api.call('towerStartBattle', args);
                        if (token.stopped) return;
                        const calculated = await this.battleCalculator.calculate(battle, 'get_tower');
                        if (token.stopped) return;
                        const victory = calculated.result.win !== false && Number(calculated.result.stars) > 0;
                        won ||= victory;
                        const finalStates = calculated.progress?.[calculated.progress.length - 1]?.attackers?.heroes;
                        const endangered = finalStates ? lineup.filter(id => !finalStates[id]
                            || finalStates[id].isDead || Number(finalStates[id].hp) <= 0) : [];
                        if (victory && (!settings.avoidDeaths || (Number(calculated.result.stars) >= 3 && !endangered.length))) {
                            accepted = { lineup, calculated, started };
                            break;
                        }
                        if (!settings.avoidDeaths) break;
                        // Prefer replacing predicted casualties while retaining everyone else.
                        for (const id of endangered.length ? endangered : lineup) {
                            for (const hero of living) {
                                const replacement = Number(hero.id);
                                if (lineup.includes(replacement)) continue;
                                const candidate = lineup.map(member => member === id ? replacement : member);
                                const key = candidate.slice().sort((a, b) => a - b).join(',');
                                if (seen.has(key)) continue;
                                seen.add(key);
                                queue.push(candidate);
                            }
                        }
                    }
                    if (!accepted) {
                        if (!won) throw new Error('SCRIPT_TOWER_BATTLE_LOST');
                        return 'SCRIPT_TOWER_UNSAFE_BATTLE';
                    }
                    const { lineup, calculated, started } = accepted;
                    const end = started + calculated.waitSeconds * 1000;
                    while (!token.stopped && performance.now() < end)
                        await new Promise(resolve => setTimeout(resolve, Math.min(250, end - performance.now())));
                    if (token.stopped) return;
                    const result = await this.api.call('towerEndBattle', { result: calculated.result, progress: calculated.progress });
                    preferred = lineup;
                    this.storage.set('tower:lastWinningTeam', JSON.stringify({ heroes: lineup, gameSelection }));
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
