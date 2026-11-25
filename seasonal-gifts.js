// Seasonal rewards remain independent from other collection scripts.
class InterfaceSeasonalGifts {
    constructor(api) { this.api = api; }

    async run(report, token) {
        let response;
        try {
            response = await this.api.call('newYearGiftGet', { type: 0 });
        } catch (error) {
            if (error?.message !== 'Undefined call newYearGiftGet()') throw error;
            console.warn('New Year gifts unavailable:', error);
            report('SCRIPT_NEW_YEAR_UNAVAILABLE');
            return 'SCRIPT_NOTHING_TO_COLLECT';
        }
        if (token.stopped) return;
        if (!Array.isArray(response?.gifts)) throw new Error('SCRIPT_API_ERROR');
        const seen = new Set();
        let count = 0;
        for (const gift of response.gifts) {
            if (token.stopped) return;
            if (Number(gift?.opened) !== 0 || gift?.id == null || seen.has(String(gift.id))) continue;
            seen.add(String(gift.id));
            await this.api.call('newYearGiftOpen', { giftId: gift.id });
            report('SCRIPT_NEW_YEAR_GIFT_OPENED', ++count);
        }
        if (!count) return 'SCRIPT_NOTHING_TO_COLLECT';
    }
}
