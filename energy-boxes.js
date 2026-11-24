// Uses the Runner energy loot box; a limit is checked between batches.
class InterfaceEnergyBoxes {
    constructor(api) { this.api = api; }

    stamina(value) {
        if (!value || typeof value !== 'object') return 0;
        let total = 0;
        for (const [key, part] of Object.entries(value)) {
            if (key === 'stamina' && Number.isFinite(Number(part)) && Number(part) > 0) total += Number(part);
            else if (part && typeof part === 'object') total += this.stamina(part);
        }
        return total;
    }

    async run(settings, report, token) {
        const limit = Number(settings.maxBoxes), target = Number(settings.targetEnergy);
        if (![limit, target].every(value => Number.isSafeInteger(value) && value >= 0)) throw new Error('SCRIPT_RESOURCE_INVALID_LIMIT');
        const inventory = await this.api.call('inventoryGet');
        if (token.stopped) return;
        const available = Number(inventory?.consumable?.[148] ?? 0);
        if (!Number.isSafeInteger(available) || available < 0) throw new Error('SCRIPT_API_ERROR');
        let remaining = limit ? Math.min(limit, available) : available, opened = 0, energy = 0;
        while (remaining > 0 && !token.stopped) {
            const amount = remaining >= 100 ? 100 : remaining > 10 ? 10 : 1;
            const result = await this.api.call('consumableUseLootBox', { libId: 148, amount });
            remaining -= amount; opened += amount; energy += this.stamina(result);
            report('SCRIPT_ENERGY_BOX_PROGRESS', `${opened}: +${energy}`);
            if (target && energy >= target) break;
        }
        if (!opened) return 'SCRIPT_NOTHING_TO_COLLECT';
    }
}
