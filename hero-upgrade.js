// Account-scoped settings and lifecycle are supplied by InterfaceAutomation.
class InterfaceHeroUpgrade {
    constructor(api) { this.api = api; }

    async run(settings, report, token) {
        for (const name of ['energyBudget', 'reserveEnergy', 'reserveGold']) {
            if (!Number.isSafeInteger(settings[name]) || settings[name] < 0)
                throw new Error('SCRIPT_UPGRADE_INVALID_LIMIT');
        }
        if (token.stopped) return;
        const heroes = await this.api.call('heroGetAll');
        if (token.stopped) return;
        const user = await this.api.call('userGetInfo');
        if (token.stopped) return;
        if (!heroes || typeof heroes !== 'object' || !user || typeof user !== 'object')
            throw new Error('SCRIPT_UPGRADE_NO_DATA');
        report('SCRIPT_UPGRADE_HERO_COUNT', Object.values(heroes).length);
        // Stage 2 is a read-only preflight. Queue editing and spending follow
        // in separate stages; do not checkpoint unfinished upgrades as done.
        return 'SCRIPT_UPGRADE_NEEDS_QUEUE';
    }
}
