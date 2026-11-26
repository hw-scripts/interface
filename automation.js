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

    call(name, args = {}, context = {}) {
        const execute = () => this.send(name, args, context);
        const result = this.pending.then(execute);
        this.pending = result.catch(() => {});
        return result;
    }

    async send(name, args, context = {}) {
        if (!this.headers || !this.url) throw new Error('SCRIPT_API_NOT_READY');
        const body = JSON.stringify({ calls: [{ name, args, ident: 'body',
            context: { actionTs: Math.floor(performance.now()), ...context } }] });
        const headers = { ...this.headers, 'x-request-id': String(++this.requestId) };
        let signature = `${headers['x-request-id']}:${headers['x-auth-token']}:${headers['x-auth-session-id']}:${body}:LIBRARY-VERSION=1UNIQUE-SESSION-ID=${headers['x-env-unique-session-id']}`;
        if (headers['x-env-unique-session-uuid']) signature += `UNIQUE-SESSION-UUID=${headers['x-env-unique-session-uuid']}`;
        headers['x-auth-signature'] = InterfaceGameApi.md5(signature);
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            const fail = (failure, response = null) => {
                failure.rpcMethod = name;
                failure.rpcRequest = JSON.parse(body);
                failure.rpcResponse = response;
                failure.httpStatus = xhr.status;
                reject(failure);
            };
            this.original.open.call(xhr, 'POST', this.url, true);
            xhr.responseType = 'json';
            xhr.timeout = 30000;
            xhr.onerror = xhr.ontimeout = () => fail(new Error('SCRIPT_NETWORK_ERROR'));
            xhr.onload = () => {
                const response = xhr.response;
                const result = response?.results?.find(item => item.ident === 'body');
                const error = response?.error || result?.error || result?.result?.error || result?.result?.response?.error;
                if (xhr.status !== 200 || error || !result?.result || !('response' in result.result)) {
                    const failure = new Error(error?.description || error?.name || 'SCRIPT_API_ERROR');
                    if (error?.name) failure.rpcErrorName = error.name;
                    fail(failure, response);
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
        this.mutationRevision = 0;
        this.battleCalculator = battleCalculator;
        this.api = { call: async (name, args, context) => {
            if (this.running?.stopped) throw new Error('SCRIPT_STOPPED');
            // Expedition and inventory changes synchronize with the canvas.
            // Other mutations lock before sending: a lost response can still
            // follow a successful server change. Keep an existing lock intact.
            const readOnly = new Set(['userGetInfo', 'expeditionGet', 'dailyBonusGetInfo',
                'mailGetAll', 'questGetAll', 'battlePass_getInfo', 'battlePass_getSpecial',
                'bossGetAll', 'heroGetAll', 'pet_getAll', 'teamGetAll', 'teamGetFavor', 'inventoryGet',
                'powerTournament_getState', 'saleShowcase_rewardInfo', 'newYearGiftGet', 'adventure_getInfo', 'adventureSolo_getInfo', 'clanRaid_getInfo', 'titanArenaGetStatus', 'towerGetInfo', 'dungeonGetInfo', 'clanGetInfo', 'clanGetAvailableDailyGifts', 'titanGetAll', 'specialOffer_getAll', 'offerGetAll', 'shopGetAll', 'subscriptionGetInfo', 'zeppelinGiftGet', 'adventure_raidGetInfo']);
            const synchronized = new Set(['expeditionFarm', 'expeditionSendHeroes', 'artifactChestOpen']);
            if (!readOnly.has(name) && !synchronized.has(name)) {
                this.requiresReload = true;
                this.onRequiresReload?.();
            }
            let response;
            try { response = await api.call(name, args, context); }
            catch (error) { if (error && typeof error === 'object' && !error.rpcMethod) error.rpcMethod = name; throw error; }
            if (!readOnly.has(name) && response != null && response !== false && response?.success !== false &&
                (!Array.isArray(response) || response.length > 0)) this.mutationRevision++;
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
        this.collectionSources = [
            ['includeRewards', 'QUEST_REWARDS', true], ['includeMail', 'MAIL', true],
            ['includeHeroArtifacts', 'HERO_ARTIFACT_CHESTS', false], ['includeTitanArtifacts', 'TITAN_ARTIFACT_CHESTS', false],
            ['includeTitanSummons', 'TITAN_SUMMONS', false], ['includePetEggs', 'PET_EGGS', false], ['includeAscension', 'ASCENSION_FREE', false],
            ['includeHeroSouls', 'HERO_SOUL_EXCHANGE', false], ['includeTitanSouls', 'TITAN_SOUL_EXCHANGE', false],
            ['includeCommunityGifts', 'COMMUNITY_GIFTS', false], ['includeOfferGifts', 'OFFER_GIFTS', true], ['includeStageOffers', 'FREE_OFFER_STAGES', true],
            ['includeBattlePass', 'BATTLE_PASS_REWARDS', true], ['includeSubscription', 'SUBSCRIPTION_GIFT', true],
            ['includeZeppelin', 'ZEPPELIN_GIFT', true], ['includeGrandCoins', 'GRAND_ARENA_COINS', true],
            ['includeSoulAtrium', 'SOUL_ATRIUM_REFILL', true], ['includeInventoryBoxes', 'INVENTORY_BOXES', false],
            ['includeNewYearGifts', 'NEW_YEAR_GIFTS', false], ['includePowerTournament', 'POWER_TOURNAMENT_REWARDS', true]
        ];
        this.definitions = {
            DAILY_BONUS: {
                fields: {},
                run: (settings, report, token) => this.dailyBonus(token)
            },
            QUEST_REWARDS: {
                fields: { collectDailyBonus: true, collectGuildPrestige: true, collectDailyOffers: true, collectQuests: true },
                run: (settings, report, token, context) => this.allRewards(settings, report, token, context)
            },
            MAIL: {
                fields: {},
                run: (settings, report, token, context) => this.mail(settings, report, token, undefined, context?.letters)
            },
            POWER_TOURNAMENT_REWARDS: { fields: {}, run: (s, r, t, context) => this.powerTournamentRewards(r, t, context) },
            NEW_YEAR_GIFTS: { fields: {}, run: (s, r, t) => new InterfaceSeasonalGifts(this.api).run(r, t) },
            HERO_POWER: { fields: {}, run: (s, r, t) => this.heroPower(r, t) },
            ENERGY_BOXES: { fields: { maxBoxes: 1, targetEnergy: 100 }, run: (s, r, t) => new InterfaceEnergyBoxes(this.api).run(s, r, t) },
            INVENTORY_BOXES: { fields: { equipmentBoxes: true, randomBoxes: true, artifactBoxes: true }, run: (s, r, t) => this.openInventoryBoxes(s, r, t) },
            HERO_ARTIFACT_UPGRADE: { fields: { levels: 10 }, run: (s, r, t) => this.upgradeCosmetics('heroArtifact', s, r, t) },
            TITAN_ARTIFACT_UPGRADE: { fields: { levels: 1 }, run: (s, r, t) => this.upgradeCosmetics('titanArtifact', s, r, t) },
            HERO_SKIN_UPGRADE: { fields: { levels: 10 }, run: (s, r, t) => this.upgradeCosmetics('heroSkin', s, r, t) },
            ASGARD_MINIONS: { fields: {}, run: (s, r, t) => new InterfaceAsgardScripts(this).asgardMinions(r, t) },
            TITAN_ARENA: { fields: { testBattles: 10, retryBattles: 10 }, run: (s, r, t) => new InterfaceTitanScripts(this).titanArena(s, r, t) },
            ADVENTURE: { fields: { path: '', testBattles: 10, retryBattles: 10 }, run: (s, r, t) => new InterfaceAdventureScripts(this).adventure(false, s, r, t) },
            ADVENTURE_SOLO: { fields: { path: '', testBattles: 10, retryBattles: 10 }, run: (s, r, t) => new InterfaceAdventureScripts(this).adventure(true, s, r, t) },
            CAMPAIGN: { fields: { missions: '', raidCampaign: true }, run: (s, r, t) => new InterfaceCampaignScripts(this).campaign(s, r, t) },
            ADVENTURE_RAID: { fields: { limit: 0 }, run: (s, r, t) => new InterfaceAdventureScripts(this).adventureRaid(s, r, t) },
            BUY_HERO_SOULS: { fields: {}, run: (s, r, t) => this.buyHeroSouls(r, t) },
            BUY_GOLD_SHOPS: { fields: {}, run: (s, r, t) => this.buyGoldShops(r, t) },
            HERO_SOUL_EXCHANGE: { fields: {}, run: (s, r, t) => this.exchangeSoulStones('hero', r, t) },
            TITAN_SOUL_EXCHANGE: { fields: {}, run: (s, r, t) => this.exchangeSoulStones('titan', r, t) },
            COMMUNITY_GIFTS: { fields: {}, run: (s, r, t) => this.communityGifts(r, t) },
            SEND_GUILD_GIFTS: { fields: {}, run: (s, r, t) => this.sendGuildGifts(r, t) },
            OFFER_GIFTS: { fields: {}, run: (s, r, t, c) => this.offerGifts(r, t, c) },
            SUBSCRIPTION_GIFT: { fields: {}, run: (s, r, t, c) => this.dailyFreeGift('subscription', r, t, c) },
            ZEPPELIN_GIFT: { fields: {}, run: (s, r, t, c) => this.dailyFreeGift('zeppelin', r, t, c) },
            GRAND_ARENA_COINS: { fields: {}, run: (s, r, t, c) => this.simpleFreeGift('grand', r, t, c) },
            SOUL_ATRIUM_REFILL: { fields: {}, run: (s, r, t, c) => this.simpleFreeGift('atrium', r, t, c) },
            BATTLE_PASS_REWARDS: { fields: {}, run: (s, r, t, c) => this.battlePassRewards(r, t, c) },
            FREE_OFFER_STAGES: { fields: {}, run: (s, r, t, c) => this.freeOfferStages(r, t, c) },
            HERO_ARTIFACT_CHESTS: { fields: { limit: 0 }, run: (s, r, t) => this.openResources('heroArtifact', s, r, t) },
            TITAN_ARTIFACT_CHESTS: { fields: { limit: 0 }, run: (s, r, t) => this.openResources('titanArtifact', s, r, t) },
            TITAN_SUMMONS: { fields: { limit: 0 }, run: (s, r, t) => this.openResources('titanSummon', s, r, t) },
            PET_EGGS: { fields: { limit: 0 }, run: (s, r, t) => this.openResources('petEgg', s, r, t) },
            ASCENSION_FREE: { fields: { limit: 0 }, run: (s, r, t) => this.openResources('ascension', s, r, t) },
            EXPEDITIONS: {
                fields: { collect: true, send: true },
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
                    if (!this.mutationRevision) return 'SCRIPT_NOTHING_TO_COLLECT';
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
        // Preserve previously enabled sequence actions when separating resources and mail.
        if (storage.get('resourceScriptsMigration:v1') !== 'done') {
            const read = section => { try { return JSON.parse(storage.get(`script:${section}`)) || {}; } catch { return {}; } };
            const enable = section => storage.set(`script:${section}`, JSON.stringify({ ...read(section), enabled: true }));
            const rewards = read('QUEST_REWARDS');
            const expeditions = read('EXPEDITIONS');
            if (rewards.enabled && rewards.collectMail !== false) enable('MAIL');
            if (rewards.enabled && rewards.collectTitanArtifacts !== false) enable('TITAN_ARTIFACT_CHESTS');
            if (expeditions.enabled && expeditions.openArtifactChest === true) enable('HERO_ARTIFACT_CHESTS');
            delete rewards.collectMail;
            delete rewards.collectTitanArtifacts;
            delete expeditions.openArtifactChest;
            storage.set('script:QUEST_REWARDS', JSON.stringify(rewards));
            storage.set('script:EXPEDITIONS', JSON.stringify(expeditions));
            storage.set('resourceScriptsMigration:v1', 'done');
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

    async run(section, report, overrideSettings = null) {
        if (this.running) throw new Error('SCRIPT_ALREADY_RUNNING');
        const token = { stopped: false, section };
        this.running = token;
        this.boundaries = [];
        this.lastResult = null;
        this.rewardFailures = [];
        try {
            let outcome = await this.definitions[section].run(overrideSettings ? { ...this.settings(section), ...overrideSettings } : this.settings(section), report, token);
            if (this.rewardFailures.length && !token.stopped) outcome = 'SCRIPT_REWARD_ERRORS';
            this.lastResult = { completed: !token.stopped && [undefined, 'SCRIPT_DONE',
                'SCRIPT_DAILY_BONUS_ALREADY_COLLECTED', 'SCRIPT_DAILY_BONUS_COLLECTED', 'SCRIPT_NOTHING_TO_COLLECT'].includes(outcome),
                boundaries: this.boundaries, stopped: token.stopped };
            report(token.stopped ? 'SCRIPT_STOPPED' : outcome || 'SCRIPT_DONE');
        } catch (error) {
            if (!token.stopped) throw error;
            this.lastResult = { completed: false, boundaries: this.boundaries, stopped: true };
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

    async questRewards(settings, report, token, rewardFilter = reward => Boolean(reward && Object.keys(reward).length), collected = new Set(), unavailable = new Set()) {
        let passes;
        // Confirmed by Runner HAR: these quests can hold rewards while state is 1.
        const accumulatedGuildQuests = new Set([20000182, 20000185, 20000186, 20000188, 20000189, 20000191, 20000901, 20000902]);
        do {
            const quests = await this.api.call('questGetAll');
            if (token.stopped) return;
            const ready = Object.values(quests ?? {}).filter(quest => (quest.state == 2
                || quest.state == 1 && accumulatedGuildQuests.has(Number(quest.id)) && Number(quest.farmCount) > 0)
                && !collected.has(`${quest.id}:${quest.createTime ?? ''}:${quest.farmCount ?? 0}`) && !unavailable.has(`${quest.id}:${quest.createTime ?? ''}:${quest.farmCount ?? 0}`) && rewardFilter(quest.reward));
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
                const result = await this.availableRewardSource('QUEST_REWARDS', () => this.api.call('quest_farmNonClan', { questIds: nonClan.map(quest => Number(quest.id)) }), report);
                if (result === 'SCRIPT_NOTHING_TO_COLLECT') {
                    for (const quest of nonClan) {
                        if (token.stopped) return;
                        const single = await this.availableRewardSource('QUEST_REWARDS', () => this.api.call('quest_farmNonClan', { questIds: [Number(quest.id)] }), report);
                        if (single === 'SCRIPT_NOTHING_TO_COLLECT') unavailable.add(claimKey(quest));
                        else { collected.add(claimKey(quest)); report('SCRIPT_QUESTS_COLLECTED', collected.size); }
                    }
                } else { nonClan.forEach(quest => collected.add(claimKey(quest))); report('SCRIPT_QUESTS_COLLECTED', collected.size); }
            }
            for (const quest of eligible.filter(quest => Number(quest.id) >= 1e6)) {
                if (token.stopped) return;
                const questId = Number(quest.id);
                const result = await this.availableRewardSource('QUEST_REWARDS', () =>
                    questId >= 2e7 && questId < 14e8 && questId !== 20000181 && !accumulatedGuildQuests.has(questId)
                        ? this.api.call('quest_questsFarm', { questIds: [questId] }) : this.api.call('questFarm', { questId }), report);
                if (result === 'SCRIPT_NOTHING_TO_COLLECT') unavailable.add(claimKey(quest));
                else { collected.add(claimKey(quest)); report('SCRIPT_QUESTS_COLLECTED', collected.size); }
            }
        } while (settings.followChains !== false && !token.stopped);
        if (!collected.size) return 'SCRIPT_NOTHING_TO_COLLECT';
    }

    async availableRewardSource(section, action, report) {
        try { return await action(); }
        catch (error) {
            const message = String(error?.message ?? '');
            if (/(^|[:\\])(NotAvailable|Already)$/.test(String(error?.rpcErrorName ?? '')) || /^Undefined call [A-Za-z0-9_]+\(\)$/.test(message)) return 'SCRIPT_NOTHING_TO_COLLECT';
            this.rewardFailures?.push({ section, error });
            console.warn('Reward source failed:', section, error);
            report('SCRIPT_REWARD_SOURCE_FAILED', `${section}: ${message || 'SCRIPT_API_ERROR'}`, { error });
            return 'SCRIPT_NOTHING_TO_COLLECT';
        }
    }

    async allRewards(settings, report, token, context = {}) {
        if (!['collectDailyBonus', 'collectGuildPrestige', 'collectDailyOffers', 'collectQuests'].some(key => settings[key])) return 'SCRIPT_NOTHING_TO_COLLECT';
        let collected = false;
        if (settings.collectDailyBonus && !context.dailyChecked) {
            collected = await this.availableRewardSource('DAILY_BONUS', () => this.dailyBonus(token), report) === 'SCRIPT_DAILY_BONUS_COLLECTED';
            context.dailyChecked = true;
        }
        if (token.stopped) return;
        const claimedOffers = context.claimedOffers ??= new Set();
        const claimedShowcases = context.claimedShowcases ??= new Set();
        const claimedPrestige = context.claimedPrestige ??= new Set();
        const claimedQuests = context.claimedQuests ??= new Set();
        const unavailableQuests = context.unavailableQuests ??= new Set();
        while (!token.stopped) {
            let advanced = false;
            if (settings.collectGuildPrestige) {
                try {
                    const result = await this.api.call('clan_prestigeFarmAllRewards');
                    const levels = [...(result?.farmedPrestigeLevels ?? []).map(id => `free:${id}`),
                        ...(result?.farmedPrestigeLevelsPaid ?? []).map(id => `paid:${id}`)];
                    for (const level of levels) if (!claimedPrestige.has(level)) { claimedPrestige.add(level); advanced = true; }
                } catch (error) {
                    if (error?.message !== 'Level reward not available' && !/(^|[:\\])NotAvailable$/.test(String(error?.rpcErrorName ?? ''))) { this.rewardFailures?.push({ section: 'CLAN_PRESTIGE', error }); console.warn('Reward source failed:', 'CLAN_PRESTIGE', error); report('SCRIPT_REWARD_SOURCE_FAILED', `CLAN_PRESTIGE: ${error?.message ?? 'SCRIPT_API_ERROR'}`, { error }); }
                }
            }
            if (token.stopped) return;
            if (settings.collectDailyOffers) {
                const offers = await this.availableRewardSource('DAILY_OFFERS', () => this.api.call('specialOffer_getAll'), report);
                for (const offer of Object.values(offers === 'SCRIPT_NOTHING_TO_COLLECT' ? {} : offers ?? {})) {
                    if (token.stopped) return;
                    if (offer.offerType !== 'dailyReward' || offer.type !== 'reward' || !offer.reward || claimedOffers.has(String(offer.id))) continue;
                    try {
                        await this.api.call('specialOffer_farmReward', { offerId: offer.id });
                        advanced = true;
                    } catch (error) {
                        if (error?.message !== 'Reward has been farmed' && !/(^|[:\\])(NotAvailable|Already)$/.test(String(error?.rpcErrorName ?? ''))) { this.rewardFailures?.push({ section: 'DAILY_OFFERS', error }); console.warn('Reward source failed:', 'DAILY_OFFERS', error); report('SCRIPT_REWARD_SOURCE_FAILED', `DAILY_OFFERS: ${error?.message ?? 'SCRIPT_API_ERROR'}`, { error }); }
                    }
                    claimedOffers.add(String(offer.id));
                }
                for (const offer of Object.values(offers === 'SCRIPT_NOTHING_TO_COLLECT' ? {} : offers ?? {})) {
                    if (token.stopped) return;
                    if (offer?.offerType !== 'saleShowcase' || !offer?.offerData?.refill || offer.id == null || claimedShowcases.has(String(offer.id))) continue;
                    if (Number(offer.endTime) > 0 && Number(offer.endTime) <= Date.now() / 1000) continue;
                    const info = await this.availableRewardSource('SALE_SHOWCASE', () => this.api.call('saleShowcase_rewardInfo', { offerId: offer.id }), report);
                    if (token.stopped) return;
                    if (info === 'SCRIPT_NOTHING_TO_COLLECT') { claimedShowcases.add(String(offer.id)); continue; }
                    const nextRefill = Number(info?.nextRefill);
                    if (info?.nextRefill == null || !Number.isFinite(nextRefill) || nextRefill < 0 || nextRefill > Date.now() / 1000) continue;
                    const result = await this.availableRewardSource('SALE_SHOWCASE', () => this.api.call('saleShowcase_farmReward', { offerId: offer.id }), report);
                    claimedShowcases.add(String(offer.id));
                    if (result !== 'SCRIPT_NOTHING_TO_COLLECT') { advanced = true; report('SCRIPT_SHOWCASE_COLLECTED', offer.id); }
                }
            }
            if (token.stopped) return;
            if (settings.collectQuests) {
                const before = claimedQuests.size;
                await this.availableRewardSource('QUEST_REWARDS', () => this.questRewards({ followChains: true }, report, token, undefined, claimedQuests, unavailableQuests), report);
                if (token.stopped) return;
                if (claimedQuests.size > before) advanced = true;
            }
            if (!advanced) break;
            collected = true;
        }
        if (!collected) return 'SCRIPT_NOTHING_TO_COLLECT';
    }

    orderedCollectionSources() {
        let saved;
        try { saved = JSON.parse(this.storage.get('collectAllOrder') ?? '[]'); } catch { saved = []; }
        const byName = new Map(this.collectionSources.map(source => [source[1], source]));
        const order = [...new Set([...(Array.isArray(saved) ? saved : []), ...byName.keys()])];
        return order.filter(name => byName.has(name)).map(name => byName.get(name));
    }

    async powerTournamentRewards(report, token, context = {}) {
        const state = await this.availableRewardSource('POWER_TOURNAMENT_REWARDS', () => this.api.call('powerTournament_getState'), report);
        if (token.stopped || state === 'SCRIPT_NOTHING_TO_COLLECT' || !state) return 'SCRIPT_NOTHING_TO_COLLECT';
        if (!Array.isArray(state.currentDayRewards) || !Number.isFinite(Number(state.currentDailyPoints))) return 'SCRIPT_NOTHING_TO_COLLECT';
        const claimed = context.powerTournamentRewards ??= new Set();
        let count = 0;
        for (const reward of state.currentDayRewards) {
            if (token.stopped) return;
            const id = Number(reward?.id), points = Number(reward?.points), key = `${state.id}:${id}`;
            if (!Number.isSafeInteger(id) || id <= 0 || !Number.isFinite(points) || points < 0 || points > Number(state.currentDailyPoints) || Number(reward?.isFarmed) !== 0 || claimed.has(key)) continue;
            const result = await this.availableRewardSource('POWER_TOURNAMENT_REWARDS', async () => { const response = await this.api.call('powerTournament_dailyFarm', { id }); if (response?.success !== true) throw new Error('SCRIPT_API_ERROR'); return response; }, report);
            claimed.add(key);
            if (result !== 'SCRIPT_NOTHING_TO_COLLECT') report('SCRIPT_POWER_TOURNAMENT_COLLECTED', ++count);
        }
        if (!count) return 'SCRIPT_NOTHING_TO_COLLECT';
    }

    async heroPower(report, token) {
        const user = await this.api.call('userGetInfo');
        if (token.stopped) return;
        const heroes = await this.api.call('heroGetAll');
        if (token.stopped) return;
        const peak = Number(user?.maxSumPower?.heroes);
        if (!Number.isFinite(peak) || !heroes || typeof heroes !== 'object') throw new Error('SCRIPT_API_ERROR');
        const values = Object.values(heroes).map(hero => Number(hero?.power));
        if (values.some(value => !Number.isFinite(value))) throw new Error('SCRIPT_API_ERROR');
        const current = values.reduce((sum, value) => sum + value, 0);
        report('SCRIPT_HERO_POWER', `${current} / ${peak} (${peak - current})`);
    }

    async openInventoryBoxes(settings, report, token) {
        const inventory = await this.api.call('inventoryGet');
        if (token.stopped) return;
        const groups = [
            [settings.equipmentBoxes, Array.from({length: 28}, (_, index) => 362 + index), null],
            [settings.randomBoxes, [169,170,171,172,173,207,208,209,210,211,271,272], null],
            [settings.artifactBoxes, [62,63,64], 4]
        ];
        let opened = 0;
        for (const [enabled, ids, choice] of groups) {
            if (!enabled) continue;
            for (const libId of ids) {
                let remaining = Number(inventory?.consumable?.[libId] ?? 0);
                if (!Number.isSafeInteger(remaining) || remaining < 0) throw new Error('SCRIPT_API_ERROR');
                while (remaining > 0) {
                    if (token.stopped) return;
                    const amount = remaining >= 100 ? 100 : remaining > 10 ? 10 : 1;
                    const args = { libId, amount };
                    if (choice !== null) args.playerRewardChoiceIndex = choice;
                    await this.api.call('consumableUseLootBox', args);
                    remaining -= amount;
                    opened += amount;
                    report('SCRIPT_RESOURCE_OPENED', opened);
                }
            }
        }
        if (!opened) return 'SCRIPT_NOTHING_TO_COLLECT';
    }

    async buyHeroSouls(report, token) {
        const inventory = await this.api.call('inventoryGet');
        if (token.stopped) return;
        const shops = await this.api.call('shopGetAll');
        if (token.stopped) return;
        const coins = { ...inventory?.coin };
        let count = 0;
        for (const shopId of [4, 5, 6, 8, 9, 10, 17]) {
            for (const slot of Object.values(shops?.[shopId]?.slots ?? {})) {
                if (token.stopped) return;
                if (!slot || slot.bought || slot.purchaseDisabled || !slot.reward?.fragmentHero) continue;
                const costs = slot.cost;
                if (!costs || Object.keys(costs).length !== 1 || !costs.coin || typeof costs.coin !== 'object') continue;
                const entries = Object.entries(costs.coin);
                if (!entries.length || entries.some(([id, value]) => !(Number(value) > 0) || !(Number(coins[id]) >= Number(value)))) continue;
                await this.api.call('shopBuy', { shopId, slot: slot.id, cost: slot.cost, reward: slot.reward });
                for (const [id, value] of entries) coins[id] = Number(coins[id]) - Number(value);
                report('SCRIPT_SHOP_BOUGHT', ++count);
            }
        }
        if (!count) return 'SCRIPT_NOTHING_TO_COLLECT';
    }

    async buyGoldShops(report, token) {
        const shops = await this.api.call('shopGetAll');
        if (token.stopped) return;
        const user = await this.api.call('userGetInfo');
        if (token.stopped) return;
        let gold = Number(user?.gold), count = 0;
        if (!Number.isFinite(gold) || gold < 0) throw new Error('SCRIPT_API_ERROR');
        const potion = shops?.[1]?.slots?.[2];
        let needExperience = false;
        if (potion && !potion.bought && !potion.purchaseDisabled && potion.cost?.gold &&
            Object.keys(potion.cost).length === 1 && [9, 10, 11, 12].some(id => potion.reward?.consumable?.[id])) {
            const heroes = await this.api.call('heroGetAll');
            if (token.stopped) return;
            const level = Number(user?.level);
            needExperience = Number.isFinite(level) && level > 0 && Object.values(heroes ?? {}).some(hero =>
                Number(hero?.level) > 0 && Number(hero.level) < level);
        }
        for (const [shopId, ids] of [[17, [1,2]], [1, needExperience ? [2,4,5,6] : [4,5,6]]]) {
            for (const id of ids) {
                if (token.stopped) return;
                const slot = shops?.[shopId]?.slots?.[id];
                if (!slot || slot.bought || slot.purchaseDisabled || !slot.reward || Object.keys(slot.cost ?? {}).length !== 1) continue;
                const price = Number(slot.cost?.gold);
                if (!(price > 0) || price > gold) continue;
                await this.api.call('shopBuy', { shopId, slot: id, cost: slot.cost, reward: slot.reward });
                gold -= price;
                report('SCRIPT_SHOP_BOUGHT', ++count);
            }
        }
        if (!count) return 'SCRIPT_NOTHING_TO_COLLECT';
    }

    upgradeCost(cost, inventory, user) {
        if (!cost || typeof cost !== 'object' || Array.isArray(cost) || !Object.keys(cost).length) return null;
        const entries = [];
        for (const [type, value] of Object.entries(cost)) {
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                if (!Object.keys(value).length) return null;
                for (const [id, amount] of Object.entries(value)) {
                    const required = Number(amount), available = Number(inventory?.[type]?.[id]);
                    if (!Number.isFinite(required) || required < 0 || !Number.isFinite(available) || available < required) return null;
                    entries.push({ owner: inventory, type, id, amount: required });
                }
            } else {
                const required = Number(value), available = Number(user?.[type]);
                if (!Number.isFinite(required) || required < 0 || !Number.isFinite(available) || available < required) return null;
                entries.push({ owner: user, type, id: null, amount: required });
            }
        }
        return entries;
    }

    async upgradeCosmetics(kind, settings, report, token) {
        const count = Number(settings.levels);
        if (!Number.isSafeInteger(count) || count <= 0) throw new Error('SCRIPT_UPGRADE_INVALID_LIMIT');
        const titan = kind === 'titanArtifact', skin = kind === 'heroSkin';
        const library = this.game.lib;
        const unitDefinitions = titan ? library?.titan : library?.hero;
        const definitions = skin ? library?.skin : titan ? library?.titanArtifact : library?.artifact;
        if (!unitDefinitions || !definitions) throw new Error('SCRIPT_LIBRARY_NOT_READY');
        const units = await this.api.call(titan ? 'titanGetAll' : 'heroGetAll');
        if (token.stopped) return;
        const inventory = await this.api.call('inventoryGet');
        if (token.stopped) return;
        const user = await this.api.call('userGetInfo');
        if (token.stopped) return;
        if (!units || !inventory || !user) throw new Error('SCRIPT_UPGRADE_NO_DATA');
        const ranked = Object.values(units).filter(unit => unit && Number(unit.id) > 0 &&
            (titan || Number(unit.id) < 6000) && unit.power != null && Number.isFinite(Number(unit.power)))
            .sort((a, b) => Number(b.power) - Number(a.power) || Number(a.id) - Number(b.id));
        const selected = titan ? ranked : ranked.slice(0, 15);
        let done = 0;
        while (done < count && !token.stopped) {
            let best = null;
            for (const unit of selected) {
                if (!titan && Number(unit.level) < 20) continue;
                for (const [slot, data] of Object.entries((skin ? unit.skins : unit.artifacts) ?? {})) {
                    if (!skin && !data?.star) continue;
                    const level = Number(skin ? data : data?.level);
                    if (!Number.isInteger(level) || level < 0 || level >= (skin ? 60 : titan ? 120 : 100) || best && level >= best.level) continue;
                    const definition = skin ? definitions?.[slot]?.statData?.levels?.[level + 1]
                        : definitions?.type?.[definitions?.id?.[unitDefinitions?.[unit.id]?.artifacts?.[slot]]?.type]?.levels?.[level + 1];
                    const cost = this.upgradeCost(definition?.cost, inventory, user);
                    if (cost) best = { unit, slot, level, cost };
                }
            }
            if (!best) break;
            const args = titan ? { titanId: best.unit.id, slotId: best.slot }
                : skin ? { heroId: best.unit.id, skinId: best.slot } : { heroId: best.unit.id, slotId: best.slot };
            await this.api.call(titan ? 'titanArtifactLevelUp' : skin ? 'heroSkinUpgrade' : 'heroArtifactLevelUp', args);
            for (const cost of best.cost) {
                if (cost.id === null) cost.owner[cost.type] -= cost.amount;
                else cost.owner[cost.type][cost.id] -= cost.amount;
            }
            if (skin) best.unit.skins[best.slot] = best.level + 1;
            else best.unit.artifacts[best.slot].level = best.level + 1;
            report('SCRIPT_COSMETIC_UPGRADED', ++done);
        }
        if (!done && !token.stopped) return 'SCRIPT_NOTHING_TO_COLLECT';
    }

    async exchangeSoulStones(kind, report, token) {
        const titan = kind === 'titan';
        const inventory = await this.api.call('inventoryGet');
        if (token.stopped) return;
        const stones = inventory?.[titan ? 'fragmentTitan' : 'fragmentHero'] ?? {};
        if (!Object.values(stones).some(count => Number(count) > 0)) return 'SCRIPT_NOTHING_TO_COLLECT';
        const heroes = await this.api.call(titan ? 'titanGetAll' : 'heroGetAll');
        if (token.stopped) return;
        if (!Object.entries(stones).some(([id, count]) => Number(count) > 0 && Number(heroes?.[id]?.star) === 6))
            return 'SCRIPT_NOTHING_TO_COLLECT';
        const result = await this.api.call(titan ? 'inventoryExchangeTitanStones' : 'inventoryExchangeStones');
        const coins = Number(result?.reward?.coin?.[titan ? 15 : 5]);
        if (!Number.isFinite(coins) || coins <= 0) throw new Error('SCRIPT_SOUL_EXCHANGE_INVALID');
        report('SCRIPT_SOUL_EXCHANGE_COINS', coins);
    }

    async simpleFreeGift(kind, report, token, context = {}) {
        const claimed = context.simpleGifts ??= new Set();
        if (claimed.has(kind)) return 'SCRIPT_NOTHING_TO_COLLECT';
        if (token.stopped) return;
        const args = kind === 'atrium' ? { ident: 'heroGacha' } : {};
        const result = await this.api.call(kind === 'atrium' ? 'gacha_refill' : 'grandFarmCoins', args);
        claimed.add(kind);
        const amount = kind === 'atrium' ? Number(result?.coin?.[38] ?? 0) : Number(result?.reward?.coin?.[2] ?? 0);
        if (!(amount > 0)) return 'SCRIPT_NOTHING_TO_COLLECT';
        report('SCRIPT_FREE_GIFT_AMOUNT', amount);
    }

    async dailyFreeGift(kind, report, token, context = {}) {
        const claimed = context.dailyGifts ??= new Set();
        if (claimed.has(kind)) return 'SCRIPT_NOTHING_TO_COLLECT';
        const subscription = kind === 'subscription';
        const info = await this.api.call(subscription ? 'subscriptionGetInfo' : 'zeppelinGiftGet');
        if (token.stopped) return;
        const available = subscription ? info?.dailyReward?.availableFarm : info?.available;
        if (!available) return 'SCRIPT_NOTHING_TO_COLLECT';
        await this.api.call(subscription ? 'subscriptionFarm' : 'zeppelinGiftFarm');
        claimed.add(kind);
        report('SCRIPT_FREE_GIFT_COLLECTED');
    }

    async battlePassRewards(report, token, context = {}) {
        const claimed = context.battlePassRewards ??= new Set();
        const definitions = this.game.lib?.battlePass?.level;
        if (!definitions) throw new Error('SCRIPT_LIBRARY_NOT_READY');
        const regular = await this.api.call('battlePass_getInfo');
        if (token.stopped) return;
        const special = await this.api.call('battlePass_getSpecial');
        if (token.stopped) return;
        const passes = [{ ...regular?.battlePass, regular: true }, ...Object.values(special ?? {})];
        let count = 0;
        for (const pass of passes) {
            if (token.stopped) return;
            if (!pass?.id) continue;
            const levels = Object.values(definitions).filter(level => level.battlePass == pass.id)
                .sort((a, b) => Number(a.level) - Number(b.level));
            if (!levels.length) continue;
            const last = levels[levels.length - 1];
            const exp = Number(pass.exp);
            if (!Number.isFinite(exp)) continue;
            let actual = Math.max(0, ...levels.filter(level => exp >= Number(level.experience)).map(level => Number(level.level)));
            if (exp > Number(last.experience) && Number(last.experienceByLevel) > 0)
                actual = Number(last.level) + Math.floor((exp - Number(last.experience)) / Number(last.experienceByLevel));
            if (!Number.isSafeInteger(actual) || actual < 0) throw new Error('SCRIPT_API_ERROR');
            for (let number = 1; number <= actual; number++) {
                const def = number >= Number(last.level) ? last : levels.find(level => Number(level.level) === number);
                if (!def) continue;
                for (const free of [true, false]) {
                    if (token.stopped) return;
                    const claimKey = `${pass.id}:${number}:${free}`;
                    if (!free && !pass.ticket || pass.rewards?.[number]?.[free ? 'free' : 'paid'] || claimed.has(claimKey)) continue;
                    const reward = free ? def.freeReward : def.paidReward;
                    if (!reward || reward.buff || reward.fragmentHero || reward.bundleHeroReward) continue;
                    const args = { level: number, free };
                    if (!pass.regular) args.id = pass.id;
                    await this.api.call('battlePass_farmReward', args);
                    claimed.add(claimKey);
                    report('SCRIPT_BATTLE_PASS_COLLECTED', ++count);
                }
            }
        }
        if (!count) return 'SCRIPT_NOTHING_TO_COLLECT';
    }

    async sendGuildGifts(report, token) {
        const available = await this.api.call('clanGetAvailableDailyGifts');
        if (token.stopped) return;
        if (!Array.isArray(available?.giftUids)) throw new Error('SCRIPT_API_ERROR');
        if (!available.giftUids.length) return 'SCRIPT_NOTHING_TO_COLLECT';
        const sent = await this.api.call('clanSendDailyGifts');
        if (!Array.isArray(sent)) throw new Error('SCRIPT_API_ERROR');
        if (!sent.length) return 'SCRIPT_NOTHING_TO_COLLECT';
        report('SCRIPT_GUILD_GIFTS_SENT', sent.length);
    }

    async communityGifts(report, token) {
        if (!this.communityRequest) throw new Error('SCRIPT_API_NOT_READY');
        const result = await this.communityRequest('https://community.hero-wars.com/api/posts/published?page=1');
        if (token.stopped) return;
        const posts = result?.data;
        if (!Array.isArray(posts)) throw new Error('SCRIPT_API_ERROR');
        let processed;
        try { processed = JSON.parse(this.storage.get('communityBonusGiftIds') || '[]'); } catch { processed = []; }
        const done = new Set(Array.isArray(processed) ? processed.map(String) : []);
        const candidates = [];
        for (const post of posts) for (const block of post.attributes?.body ?? []) {
            const doc = new DOMParser().parseFromString(String(block?.data?.text ?? ''), 'text/html');
            for (const link of doc.querySelectorAll('a[href]')) {
                try {
                    const url = new URL(link.href);
                    if (url.protocol === 'https:' && (url.searchParams.has('gift_id') ||
                        (url.hostname === 'herowars.me' && /bonus|gift|energy|claim|free box/i.test(doc.body.textContent || '')))) candidates.push(url);
                } catch { /* Ignore malformed links. */ }
            }
        }
        let claimed = 0, attempted = 0;
        const seen = new Set();
        for (const url of candidates) {
            if (token.stopped || attempted >= 10) break;
            let id = url.searchParams.get('gift_id');
            if (!id && url.hostname === 'herowars.me') {
                try {
                    const resolved = await this.communityRequest(url.href, { includeFinalUrl: true });
                    id = new URL(resolved.finalUrl).searchParams.get('gift_id');
                } catch (error) { console.warn('Unable to resolve Community bonus link', error); continue; }
            }
            if (token.stopped) break;
            if (!id || done.has(id) || seen.has(id)) continue;
            seen.add(id);
            attempted++;
            await this.api.call('registration', { user: { referrer: {} }, giftId: id },
                { cookie: window?.NXAppInfo?.session_id || null });
            done.add(id);
            this.storage.set('communityBonusGiftIds', JSON.stringify([...done].slice(-200)));
            report('SCRIPT_COMMUNITY_GIFTS_COLLECTED', ++claimed);
        }
        if (!claimed && !token.stopped) return 'SCRIPT_NOTHING_TO_COLLECT';
    }

    async offerGifts(report, token, context = {}) {
        const claimed = context.offerGifts ??= new Set();
        const offers = await this.api.call('offerGetAll');
        if (token.stopped) return;
        let count = 0;
        for (const offer of Object.values(offers ?? {})) {
            if (token.stopped) return;
            if (offer?.type !== 'reward' || offer.freeRewardObtained || !offer.reward || offer.id == null || claimed.has(String(offer.id))) continue;
            await this.api.call('offerFarmReward', { offerId: offer.id });
            claimed.add(String(offer.id));
            report('SCRIPT_OFFER_GIFTS_COLLECTED', ++count);
        }
        if (!count) return 'SCRIPT_NOTHING_TO_COLLECT';
    }

    async freeOfferStages(report, token, context = {}) {
        const claimed = context.offerStages ??= new Set();
        const offers = await this.api.call('specialOffer_getAll');
        if (token.stopped) return;
        let count = 0;
        for (const offer of Object.values(offers ?? {})) {
            if (token.stopped) return;
            if (offer?.offerType !== 'stagesOffer' || Number(offer.farmedStage) !== -1 || offer.id == null || claimed.has(String(offer.id)) || !Array.isArray(offer.offerData?.stages)) continue;
            claimed.add(String(offer.id));
            for (const stage of offer.offerData.stages) {
                if (token.stopped) return;
                if (!stage || stage.billingId) break;
                await this.api.call('specialOffer_farmReward', { offerId: offer.id });
                report('SCRIPT_STAGE_OFFERS_COLLECTED', ++count);
            }
        }
        if (!count) return 'SCRIPT_NOTHING_TO_COLLECT';
    }

    async openResources(kind, settings, report, token) {
        const limit = Number(settings.limit);
        if (!Number.isSafeInteger(limit) || limit < 0) throw new Error('SCRIPT_RESOURCE_INVALID_LIMIT');
        const definitions = {
            heroArtifact: { type: 'consumable', id: 45, rpc: 'artifactChestOpen', args: { free: true } },
            titanArtifact: { type: 'consumable', id: 55, rpc: 'titanArtifactChestOpen', args: { free: true } },
            titanSummon: { type: 'coin', id: 13, rpc: 'titanUseSummonCircle', args: { circleId: 1, paid: false } },
            petEgg: { type: 'consumable', id: 90, rpc: 'pet_chestOpen', args: { paid: false } },
            ascension: { type: 'refillable', id: 47, rpc: 'ascensionChest_open', args: { paid: false } }
        };
        const config = definitions[kind];
        if (!config) throw new Error('SCRIPT_API_ERROR');
        const state = await this.api.call(config.type === 'refillable' ? 'userGetInfo' : 'inventoryGet');
        if (token.stopped) return;
        const raw = config.type === 'refillable'
            ? Object.values(state?.refillable ?? {}).find(item => Number(item?.id) === config.id)?.amount
            : state?.[config.type]?.[config.id];
        const available = Number(raw ?? 0);
        if (!Number.isSafeInteger(available) || available < 0) throw new Error('SCRIPT_API_ERROR');
        let remaining = limit ? Math.min(available, limit) : available;
        if (!remaining) return 'SCRIPT_NOTHING_TO_COLLECT';
        let opened = 0;
        while (remaining > 0) {
            if (token.stopped) return;
            const amount = remaining >= 100 ? 100 : remaining > 10 ? 10 : 1;
            try {
                await this.api.call(config.rpc, { ...config.args, amount });
            } catch (error) {
                if (kind === 'heroArtifact' && /(^|[:\\])NotEnough$/.test(String(error?.rpcErrorName ?? ''))) {
                    if (!opened) return 'SCRIPT_NOTHING_TO_COLLECT';
                    break;
                }
                throw error;
            }
            remaining -= amount;
            opened += amount;
            report('SCRIPT_RESOURCE_OPENED', opened);
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

// Per-account layout. Identifiers belong to actions, not their position in the tree.
class InterfaceMenuTree {
    constructor(automation, storage, menuSections, navigationSections) {
        Object.assign(this, { automation, storage });
        this.menu = new Set(menuSections.map(section => section.id));
        this.scripts = new Map(Object.keys(automation.definitions).map(section => [section.toLowerCase(), section]));
        try { this.removedFolders = new Set(JSON.parse(storage.get('removedMenuFolders:v1') || '[]')); } catch { this.removedFolders = new Set(); }
        this.folders = new Set(['scripts', 'navigation', 'collect_all', 'collection_main', 'collection_events', 'collection_resources', 'collection_exchange', 'collection_other']);
        for (const id of this.removedFolders) this.folders.delete(id);
        const categories = {
            collection_main: ['QUEST_REWARDS', 'MAIL', 'GRAND_ARENA_COINS', 'SOUL_ATRIUM_REFILL'],
            collection_events: ['COMMUNITY_GIFTS', 'OFFER_GIFTS', 'FREE_OFFER_STAGES', 'BATTLE_PASS_REWARDS', 'SUBSCRIPTION_GIFT', 'ZEPPELIN_GIFT', 'NEW_YEAR_GIFTS', 'POWER_TOURNAMENT_REWARDS'],
            collection_resources: ['HERO_ARTIFACT_CHESTS', 'TITAN_ARTIFACT_CHESTS', 'TITAN_SUMMONS', 'PET_EGGS', 'ASCENSION_FREE', 'INVENTORY_BOXES'],
            collection_exchange: ['HERO_SOUL_EXCHANGE', 'TITAN_SOUL_EXCHANGE'],
            collection_other: []
        };
        const sourceIds = new Set(automation.collectionSources.map(([, section]) => section));
        const available = [...new Set([...navigationSections, ...Object.keys(automation.definitions)])]
            .filter(section => automation.definitions[section]);
        const read = key => { try { return JSON.parse(storage.get(key)); } catch { return null; } };
        const oldScriptOrder = read('scriptOrder:scripts');
        const ordered = [...new Set([...(Array.isArray(oldScriptOrder) ? oldScriptOrder : []), ...available, 'COLLECT_ALL'])]
            .filter(section => (available.includes(section) || section === 'COLLECT_ALL') && !sourceIds.has(section));
        const sourceOrder = automation.orderedCollectionSources().map(([, section]) => section);
        const oldNavigationOrder = read('scriptOrder:navigation');
        const navAvailable = navigationSections.filter(section => !automation.definitions[section]);
        const navOrder = [...new Set([...(Array.isArray(oldNavigationOrder) ? oldNavigationOrder : []), ...navAvailable])]
            .filter(section => navAvailable.includes(section));
        this.navigation = new Map(navAvailable.map(section => [`navigation_${section.toLowerCase()}`, section]));
        const oldCollectionOrder = read('collectAllOrder');
        const grouped = Object.entries(categories).map(([id, sections]) => ({ id, children: sourceOrder
            .filter(section => sections.includes(section) || id === 'collection_other' && !Object.values(categories).some(items => items.includes(section)))
            .map(section => ({ id: section.toLowerCase() })) }));
        const collection = { id: 'collect_all', children: Array.isArray(oldCollectionOrder)
            ? [...sourceOrder.map(section => ({ id: section.toLowerCase() })), ...grouped.map(group => ({ id: group.id, children: [] }))] : grouped };
        this.defaults = menuSections.map(({id}) => id === 'scripts'
            ? { id, children: ordered.map(section => section === 'COLLECT_ALL' ? collection : { id: section.toLowerCase() }) }
            : id === 'navigation' ? { id, children: navOrder.map(section => ({ id: `navigation_${section.toLowerCase()}` })) } : { id });
        const saved = read('menuTree:v1');
        if (storage.get('collectionFolderMigration:v1') !== 'done') {
            const legacy = read('script:COLLECT_ALL') || {};
            if (typeof legacy.enabled === 'boolean') storage.set('menuFolder:collect_all', String(legacy.enabled));
            storage.set('collectionFolderMigration:v1', 'done');
        }
        if (!Array.isArray(saved)) {
            const options = read('script:COLLECT_ALL') || { includeRewards: true, includeMail: true, includePowerTournament: true };
            for (const [option, section] of automation.collectionSources)
                automation.save(section, { enabled: options[option] === true });
        }
        this.nodes = this.reconcile(saved);
        this.save();
    }

    reconcile(saved) {
        const known = new Map(), defaults = new Map(), seen = new Set();
        const register = (nodes, parent = null) => {
            for (const node of nodes) { known.set(node.id, node); defaults.set(node.id, parent); register(node.children ?? [], node.id); }
        };
        register(this.defaults);
        const read = nodes => (Array.isArray(nodes) ? nodes : []).flatMap(node => {
            if (!node || (!known.has(node.id) && !/^sequence_[a-z0-9-]+$/.test(node.id)) || seen.has(node.id)) return [];
            if (this.removedFolders.has(node.id)) return [];
            seen.add(node.id);
            const item = { id: node.id };
            if (/^sequence_[a-z0-9-]+$/.test(node.id)) this.folders.add(node.id);
            if (this.folders.has(node.id)) item.children = read(node.children);
            return [item];
        });
        const result = read(Array.isArray(saved) ? saved : this.defaults);
        const find = (nodes, id) => { for (const node of nodes) { if (node.id === id) return node; const found = find(node.children ?? [], id); if (found) return found; } };
        const addMissing = nodes => { for (const node of nodes) {
            if (!seen.has(node.id) && !this.removedFolders.has(node.id)) {
                const parent = defaults.get(node.id), destination = parent && find(result, parent);
                const target = destination?.children ?? (parent && this.removedFolders.has(parent) ? find(result, 'scripts')?.children : null) ?? result;
                const item = this.folders.has(node.id) ? { id: node.id, children: [] } : { id: node.id };
                if (node.id === 'startup' && !parent) target.splice(Math.max(0, target.findIndex(value => value.id === 'settings') + 1), 0, item);
                else target.push(item);
                seen.add(node.id);
            }
            addMissing(node.children ?? []);
        } };
        addMissing(this.defaults);
        return result;
    }

    save() { this.storage.set('menuTree:v1', JSON.stringify(this.nodes)); }
    addFolder(parent = 'scripts') {
        const destination = this.find(parent);
        if (!destination || !this.folders.has(parent)) return null;
        const id = `sequence_${crypto.randomUUID()}`;
        const number = Math.max(0, ...Object.values(this.folderNumbers()).map(Number)) + 1;
        const numbers = this.folderNumbers(); numbers[id] = number;
        this.storage.set('sequenceNumbers:v1', JSON.stringify(numbers));
        this.folders.add(id); destination.children.push({ id, children: [] }); this.save();
        return id;
    }
    folderNumbers() { try { return JSON.parse(this.storage.get('sequenceNumbers:v1')) || {}; } catch { return {}; } }
    folderName(id, language, defaultName) {
        let names; try { names = JSON.parse(this.storage.get('sequenceNames:v1')) || {}; } catch { names = {}; }
        return names[id]?.[language] || (/^sequence_/.test(id) ? `${defaultName} ${this.folderNumbers()[id] || 1}` : defaultName);
    }
    renameFolder(id, language, name) {
        let names; try { names = JSON.parse(this.storage.get('sequenceNames:v1')) || {}; } catch { names = {}; }
        (names[id] ??= {})[language] = name.trim(); this.storage.set('sequenceNames:v1', JSON.stringify(names));
    }
    removeFolder(id) {
        if (!this.folders.has(id) || id === 'scripts' || id === 'navigation') return false;
        const findParent = nodes => { for (const node of nodes) { const index = node.children?.findIndex(child => child.id === id) ?? -1; if (index >= 0) return [node.children, index]; const result = findParent(node.children ?? []); if (result) return result; } };
        const found = findParent(this.nodes); if (!found) return false;
        const [siblings, index] = found, [folder] = siblings.splice(index, 1);
        const root = this.find('scripts').children;
        const unpack = children => { for (const child of children) {
            if (child.children && this.folders.has(child.id)) { const nested = child.children; child.children = []; root.push(child); unpack(nested); }
            else root.push(child);
        } };
        unpack(folder.children); this.folders.delete(id);
        if (!/^sequence_/.test(id)) this.removedFolders.add(id);
        this.storage.set('removedMenuFolders:v1', JSON.stringify([...this.removedFolders]));
        this.save(); return true;
    }
    find(id, nodes = this.nodes) {
        for (const node of nodes) { if (node.id === id) return node; const found = this.find(id, node.children ?? []); if (found) return found; }
    }
    move(id, target, position = 'inside') {
        const locate = nodes => { for (let i = 0; i < nodes.length; i++) {
            if (nodes[i].id === id) return [nodes, i];
            const found = locate(nodes[i].children ?? []); if (found) return found;
        } };
        const source = locate(this.nodes), dest = this.find(target);
        if (!source || !dest || id === target || this.find(target, [source[0][source[1]]])) return false;
        if (position === 'inside' && !this.folders.has(target)) return false;
        const node = source[0].splice(source[1], 1)[0];
        if (position === 'inside') dest.children.push(node);
        else {
            const findTarget = nodes => { for (let i = 0; i < nodes.length; i++) { if (nodes[i] === dest) return [nodes, i]; const found = findTarget(nodes[i].children ?? []); if (found) return found; } };
            const [siblings, index] = findTarget(this.nodes);
            siblings.splice(index + (position === 'after' ? 1 : 0), 0, node);
        }
        this.save(); return true;
    }
    enabled(id) {
        const section = this.scripts.get(id);
        return section ? this.automation.settings(section).enabled : this.storage.get(`menuFolder:${id}`) !== 'false';
    }
    setEnabled(id, value) {
        const section = this.scripts.get(id);
        if (section) this.automation.save(section, { enabled: value });
        else this.storage.set(`menuFolder:${id}`, String(value));
    }
    sequence(id, { atomicCollect = false, ignoreRootEnabled = false } = {}) {
        const root = this.find(id), result = [];
        const visit = (node, isRoot = false) => {
            if ((!isRoot || !ignoreRootEnabled) && !this.enabled(node.id)) return;
            const section = this.scripts.get(node.id);
            if (section) { result.push(section); return; }
            for (const child of node.children ?? []) visit(child);
        };
        if (root) visit(root, true);
        return result;
    }
}

// References retain their own settings and identity, independent of the source script.
class InterfaceScriptReferences {
    constructor(automation, storage) {
        this.automation = automation; this.storage = storage;
        for (const kind of ['startup', 'autopilot']) {
            let raw; try { raw = JSON.parse(storage.get(`scriptReferences:${kind}:v1`) || '[]'); } catch { raw = []; }
            if (Array.isArray(raw) && raw.some(item => item?.section === 'COLLECT_ALL')) {
                storage.set(`scriptReferences:${kind}:beforeCollectionMigration:v1`, JSON.stringify(raw));
                let options; try { options = JSON.parse(storage.get('autopilotSettings') || '{}'); } catch { options = {}; }
                options.intervals ??= {};
                const explicit = new Set(raw.filter(item => item?.section && item.section !== 'COLLECT_ALL').map(item => item.section));
                const migrated = [];
                for (const entry of raw) {
                    if (entry?.section !== 'COLLECT_ALL') { migrated.push(entry); continue; }
                    migrated.push({ id: entry.id, folder: true, sourceId: 'collect_all', nameKey: 'NAV_COLLECT_ALL', ...(entry.parent ? { parent: entry.parent } : {}) });
                    const collection = Array.isArray(entry.settings?._collection) ? entry.settings._collection.filter(item => entry.settings[item.option] === true)
                        : (automation.menuTree?.sequence('collect_all', { ignoreRootEnabled: true }) || []).map(section => ({ section, settings: automation.settings(section) }));
                    for (const item of collection) {
                        if (!automation.definitions[item.section] || explicit.has(item.section)) continue;
                        explicit.add(item.section);
                        const { enabled, ...settings } = item.settings || automation.settings(item.section);
                        const id = crypto.randomUUID();
                        migrated.push({ id, section: item.section, settings, parent: entry.id });
                        if (kind === 'autopilot' && options.intervals[entry.id] != null) options.intervals[id] = options.intervals[entry.id];
                    }
                }
                storage.set(`scriptReferences:${kind}:v1`, JSON.stringify(migrated));
                if (kind === 'autopilot') storage.set('autopilotSettings', JSON.stringify(options));
            }
            const items = this.list(kind), seen = new Set();
            const unique = items.filter(item => item.folder || (!seen.has(item.section) && seen.add(item.section)));
            if (unique.length !== items.length) {
                if (storage.get(`scriptReferences:${kind}:duplicates:v1`) === null)
                    storage.set(`scriptReferences:${kind}:duplicates:v1`, JSON.stringify(items));
                this.save(kind, unique);
            }
        }
        let progress; try { progress = JSON.parse(storage.get('autopilotProgress') || '{}'); } catch { progress = {}; }
        if (Array.isArray(progress.pending?.sections) && progress.pending.sections.some(item => item === 'COLLECT_ALL' || item?.section === 'COLLECT_ALL')) {
            storage.set('autopilotProgress:beforeCollectionMigration:v1', JSON.stringify(progress));
            const kind = progress.pending.mode === 'startup' ? 'startup' : 'autopilot';
            const entries = this.entries(kind);
            progress.pending.sections = progress.pending.sections.flatMap(item => {
                if (item !== 'COLLECT_ALL' && item?.section !== 'COLLECT_ALL') return [item];
                if (typeof item === 'object') {
                    const descendants = new Set([item.id]); let changed;
                    const all = this.list(kind);
                    do { changed = false; for (const value of all) if (descendants.has(value.parent) && !descendants.has(value.id)) { descendants.add(value.id); changed = true; } } while (changed);
                    return entries.filter(value => descendants.has(value.id));
                }
                return this.automation.menuTree?.sequence('collect_all', { ignoreRootEnabled: true }) || [];
            });
            storage.set('autopilotProgress', JSON.stringify(progress));
        }
    }
    list(kind) {
        try {
            const saved = JSON.parse(this.storage.get(`scriptReferences:${kind}:v1`) || '[]');
            return Array.isArray(saved) ? saved.filter(item => item && typeof item.id === 'string' && (item.folder === true || this.automation.definitions[item.section] && item.settings && typeof item.settings === 'object')) : [];
        } catch { return []; }
    }
    save(kind, items) { this.storage.set(`scriptReferences:${kind}:v1`, JSON.stringify(items)); }
    ordered(kind) {
        const items = this.list(kind), result = [], seen = new Set();
        const visit = parent => { for (const item of items.filter(value => (value.parent || null) === parent)) {
            if (seen.has(item.id)) continue; seen.add(item.id); result.push(item); if (item.folder) visit(item.id);
        } };
        visit(null); for (const item of items) if (!seen.has(item.id)) result.push(item);
        return result;
    }
    entries(kind) { return this.ordered(kind).filter(item => !item.folder); }
    addFolder(kind, name, parent = null) { const items = this.list(kind), id = crypto.randomUUID(); items.push({ id, folder: true, name, ...(parent ? { parent } : {}) }); this.save(kind, items); return id; }
    renameFolder(kind, id, language, name) { const items = this.list(kind), folder = items.find(item => item.id === id && item.folder); if (folder) { (folder.names ??= {})[language] = name.trim(); this.save(kind, items); } }
    add(kind, section) {
        const items = this.list(kind);
        if (!this.automation.definitions[section] || items.some(item => !item.folder && item.section === section)) return null;
        const { enabled, ...settings } = this.automation.settings(section);
        const item = { id: crypto.randomUUID(), section, settings }; items.push(item); this.save(kind, items); return item;
    }
    addTree(kind, folderId) {
        const tree = this.automation.menuTree, root = tree?.find(folderId);
        if (!root?.children || !tree.folders.has(folderId)) return null;
        const items = this.list(kind), opened = [];
        const place = (entry, parent) => {
            const index = items.indexOf(entry); if (index >= 0) items.splice(index, 1);
            if (parent) entry.parent = parent; else delete entry.parent;
            items.push(entry);
        };
        const copy = (node, parent = null) => {
            if (node.children) {
                let folder = items.find(item => item.folder && item.sourceId === node.id);
                if (!folder) folder = { id: crypto.randomUUID(), folder: true, sourceId: node.id };
                place(folder, parent); opened.push(folder.id);
                for (const child of node.children) copy(child, folder.id);
                return folder;
            }
            const section = tree.scripts.get(node.id);
            if (!section || !this.automation.definitions[section]) return null;
            let entry = items.find(item => !item.folder && item.section === section);
            if (!entry) { const { enabled, ...settings } = this.automation.settings(section); entry = { id: crypto.randomUUID(), section, settings }; }
            place(entry, parent); return entry;
        };
        copy(root); this.save(kind, items); return opened;
    }
    update(kind, id, settings) {
        const items = this.list(kind), item = items.find(value => value.id === id);
        if (item) { item.settings = { ...item.settings, ...settings }; this.save(kind, items); }
    }
    remove(kind, id) {
        const items = this.list(kind), descendants = new Set([id]);
        let changed; do { changed = false; for (const item of items) if (item.parent && descendants.has(item.parent) && !descendants.has(item.id)) { descendants.add(item.id); changed = true; } } while (changed);
        for (const item of items) if (descendants.has(item.id)) delete item.parent;
        this.save(kind, items.filter(item => item.id !== id));
    }
    move(kind, id, target) {
        const items = this.list(kind), from = items.findIndex(item => item.id === id), to = items.findIndex(item => item.id === target);
        if (from < 0 || to < 0 || from === to) return;
        const targetItem = items[to], item = items[from];
        if (targetItem.folder) {
            let parent = targetItem; while (parent) { if (parent.id === item.id) return; parent = items.find(value => value.id === parent.parent); }
            item.parent = targetItem.id;
        } else {
            item.parent = targetItem.parent;
            items.splice(from, 1); items.splice(items.indexOf(targetItem), 0, item);
        }
        this.save(kind, items);
    }
}
