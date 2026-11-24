// Planning rules adapted from the current Runner GearFarmer. No game mutations here.
class InterfaceGearFarmPlanner {
    constructor(library) { this.library = library; }
    item(type, id) { return this.library?.inventoryItem?.[type]?.[id] ?? {}; }
    owned(inventory, type, id) { return Math.max(0, Number(inventory?.[type]?.[id]) || 0); }
    slots(hero) {
        const tier = this.library?.hero?.[hero.id]?.color?.[hero.color];
        return Object.entries(tier?.items ?? {}).map(([slot, id]) => ({slot: Number(slot), id: Number(id)}))
            .filter(item => Number.isFinite(item.slot) && item.id > 0 && !Object.hasOwn(hero.slots ?? {}, item.slot)
                && Number(hero.level) >= (Number(this.item('gear', item.id).heroLevel) || 0));
    }
    components(type, id) {
        return Object.entries(this.item(type, id).craftRecipe ?? {}).flatMap(([kind, items]) =>
            kind === 'gold' || !items || typeof items !== 'object' ? [] : Object.entries(items)
                .map(([id, amount]) => ({type: kind, id: Number(id), amount: Number(amount)}))
                .filter(item => item.id > 0 && item.amount > 0));
    }
    needs(order, heroes, inventory) {
        const available = structuredClone(inventory ?? {}), needs = new Map();
        const add = (type, id, amount, parents = new Set()) => {
            const key = `${type}:${id}`;
            if (parents.has(key) || !(amount > 0)) return;
            const owned = this.owned(available, type, id), missing = Math.max(0, amount - owned);
            if (available[type]) available[type][id] = Math.max(0, owned - amount);
            if (!missing) return;
            needs.set(key, (needs.get(key) || 0) + missing);
            if (type !== 'gear' && type !== 'scroll') return;
            const next = new Set(parents).add(key), components = this.components(type, id);
            if (components.length) {
                for (const part of components) add(part.type, part.id, part.amount * missing, next);
            } else {
                const count = Number(this.item(type, id).fragmentMergeCost?.fragmentCount) || 0;
                if (count > 0) add(type === 'gear' ? 'fragmentGear' : 'fragmentScroll', id, count * missing, next);
            }
        };
        for (const id of order) {
            const hero = heroes?.[id];
            if (hero) for (const slot of this.slots(hero)) add('gear', slot.id, 1);
        }
        return needs;
    }
    purchase(shops, needs, inventory, user, skipped = new Set()) {
        for (const shopId of [1, 4, 5, 6, 8, 9, 10, 17]) {
            for (const slot of Object.values(shops?.[shopId]?.slots ?? {})) {
                const key = `${shopId}:${slot.id}`;
                if (skipped.has(key) || slot.bought || slot.purchaseDisabled || slot.amountAvailable != null && Number(slot.amountAvailable) === 0) continue;
                const rewards = Object.entries(slot.reward ?? {});
                if (rewards.length !== 1 || !['gear','scroll','fragmentGear','fragmentScroll'].includes(rewards[0][0])) continue;
                const [type, items] = rewards[0];
                if (!items || typeof items !== 'object' || Object.keys(items).length !== 1) continue;
                const [id, quantity] = Object.entries(items)[0];
                if (!(Number(quantity) > 0) || !(needs.get(`${type}:${id}`) > 0)) continue;
                const costs = Object.entries(slot.cost ?? {});
                if (!costs.length) continue;
                const affordable = costs.every(([currency, amount]) => {
                    if (currency === 'gold') return Number(amount) > 0 && Number(user?.gold) >= Number(amount);
                    if (currency !== 'coin' || !amount || typeof amount !== 'object' || !Object.keys(amount).length) return false;
                    return Object.entries(amount).every(([id,value]) => Number(value) > 0 && Number(inventory?.coin?.[id]) >= Number(value));
                });
                if (affordable) return {shopId, slot, key, type, itemId: id};
            }
        }
        return null;
    }
    missions(target, missions) {
        const options = [];
        for (const mission of Object.values(missions ?? {})) {
            const id = Number(mission.id), data = this.library?.mission?.[id], normal = data?.normalMode;
            if (!Number.isFinite(id) || Number(mission.stars) !== 3) continue;
            const cost = (Number(normal?.cost?.stamina) || 0) + (Number(normal?.tryCost?.stamina) || 0);
            if (cost <= 0) continue;
            let expectedYield = 0;
            for (const wave of Object.values(normal?.waves ?? {})) for (const enemy of Object.values(wave?.enemies ?? {}))
                for (const drop of Object.values(enemy?.drop ?? {})) {
                    const amount = Number(drop?.reward?.[target.type]?.[target.id]) || 0, chance = Number(drop?.chance) || 0;
                    expectedYield += amount * (chance > 1 ? chance / 100 : chance);
                }
            if (expectedYield <= 0) continue;
            const isHeroic = Number(data?.isHeroic) === 1;
            const attempts = isHeroic ? Math.max(0, 3 - (Number(mission.triesSpent) || 0)) : Infinity;
            if (attempts > 0) options.push({id,cost,expectedYield,attempts,isHeroic});
        }
        return options.sort((a,b) => Number(b.isHeroic) - Number(a.isHeroic) || b.id - a.id);
    }
}
