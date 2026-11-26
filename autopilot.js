// Persistent scheduling uses semantic response fields, never game implementation names.
class InterfaceAutopilot {
    constructor(automation, storage, { execute, sections, ready = () => true, userInfo = () => ({}),
        changed = () => {}, now = () => Date.now(), setTimer = (run, delay) => setTimeout(run, delay), clearTimer = id => clearTimeout(id) } = {}) {
        Object.assign(this, { automation, storage, execute, sections, ready, userInfo, changed, now, setTimer, clearTimer });
        this.running = false;
        this.automatic = false;
        this.stopped = false;
        this.timer = null;
        this.state = this.read('autopilotProgress', { completed: {}, lastActivity: now() });
        this.state.completed ??= {};
        // A new page starts a new inactivity period; only our own pending reload may resume immediately.
        if (this.state.pending?.mode !== 'auto' || this.state.pending?.internalReload !== true)
            this.state.lastActivity = now();
        else this.state.lastActivity = Math.min(now(), Number(this.state.lastActivity) || now());
        this.savedActivity = this.state.lastActivity;
        this.configure(this.read('autopilotSettings', {}), false);
    }

    read(key, fallback) {
        try { return JSON.parse(this.storage.get(key)) || fallback; } catch { return fallback; }
    }

    save() {
        this.storage.set('autopilotProgress', JSON.stringify(this.state));
        this.savedActivity = this.state.lastActivity;
    }

    configure(options, persist = true) {
        this.options = { enabled: options.enabled === true,
            idleMinutes: Math.max(5, Number(options.idleMinutes) || 5), intervals: options.intervals ?? {} };
        if (persist) {
            this.storage.set('autopilotSettings', JSON.stringify(this.options));
            if (!this.options.enabled && this.automatic) this.stop();
        }
        this.arm();
    }

    fingerprint(section) {
        if (typeof section === 'object') return JSON.stringify({ section: section.section, settings: section.settings });
        const { enabled, ...settings } = this.automation.settings(section);
        return JSON.stringify(settings);
    }

    due(section) {
        const entry = this.state.completed[typeof section === 'object' ? section.id : section];
        return !entry || entry.settings !== this.fingerprint(section) || entry.until <= this.now();
    }

    interval(section) { return Math.max(1, Number(this.options.intervals[typeof section === 'object' ? section.id : section]) || 5) * 60000; }

    checkpoint(section, settings = this.fingerprint(section)) {
        const key = typeof section === 'object' ? section.id : section;
        const script = typeof section === 'object' ? section.section : section;
        const now = this.now();
        const info = { ...this.userInfo(), ...this.automation.userInfo };
        const boundaries = [info.nextDayTs, info.nextServerDayTs]
            .map(value => Number(value) * 1000).filter(time => time > now);
        const daily = ['DAILY_BONUS', 'TOWER', 'BOSS', 'CLAN_DUNGEON'].includes(script);
        if (!daily || !boundaries.length) boundaries.push(now + this.interval(section));
        boundaries.push(...(this.automation.lastResult?.boundaries ?? []).filter(time => time > now));
        this.state.completed[key] = { settings,
            until: Math.min(...boundaries), finished: now, revision: (this.state.completed[key]?.revision ?? 0) + 1 };
        this.save();
    }

    activity() {
        this.state.lastActivity = this.now();
        if (this.automatic && !this.stopped) this.stop();
        const pending = this.state.pending;
        if (pending) delete this.state.pending;
        if (this.now() - this.savedActivity >= 1000 || pending) this.save();
        this.arm();
    }

    stop() {
        this.stopped = true;
        this.automation.stop();
        delete this.state.pending;
        this.save();
        this.changed();
    }

    restartSignature(sections, index) {
        return JSON.stringify(sections.slice(0, index).map(section =>
            [section, this.state.completed[typeof section === 'object' ? section.id : section]?.revision ?? 0, this.fingerprint(section)]));
    }

    async run(sections, mode = 'manual') {
        if (this.running || this.automation.running || !sections.length) return;
        this.running = true;
        this.automatic = mode === 'auto';
        this.stopped = false;
        this.clearTimer(this.timer);
        this.changed();
        try {
            for (let index = 0; index < sections.length && !this.stopped; index++) {
                const section = sections[index];
                const script = typeof section === 'object' ? section.section : section;
                const definition = this.automation.definitions[script];
                if (!definition) continue;
                if (typeof section !== 'object' && !this.automation.settings(script).enabled) continue;
                if (definition.endsSequence) {
                    if (!this.automation.mutationRevision) continue;
                    const signature = this.restartSignature(sections, index);
                    // Write the continuation before reload; no code after reload is required for recovery.
                    this.state.restartSignature = signature;
                    this.state.pending = { sections: sections.slice(index + 1), mode, internalReload: mode === 'auto' || mode === 'startup' };
                    this.save();
                    try {
                        if (!await this.execute(section)) {
                            delete this.state.restartSignature;
                            delete this.state.pending;
                            this.save();
                        }
                    } catch (error) {
                        delete this.state.restartSignature;
                        delete this.state.pending;
                        this.save();
                        throw error;
                    }
                    return;
                }
                if (mode !== 'startup' && mode !== 'manual_explicit' && !this.due(section)) continue;
                const settings = this.fingerprint(section);
                let succeeded = false;
                try { succeeded = await this.execute(section); }
                catch (error) { console.warn('Autopilot script failed:', section, error); }
                if (this.stopped || this.automation.lastResult?.stopped) return;
                if (!succeeded) {
                    this.retryAt = this.now() + this.interval(section);
                    continue;
                }
                this.checkpoint(section, settings);
            }
            delete this.state.pending;
            this.save();
        } catch (error) {
            this.retryAt = this.now() + 60000;
            console.warn('Autopilot sequence failed:', error);
        } finally {
            this.running = false;
            this.automatic = false;
            this.changed();
            // A reload continuation is resumed by the next document, never by this one.
            if (!this.state.pending) this.arm();
        }
    }

    arm(delay) {
        this.clearTimer(this.timer);
        if (this.running || !this.options.enabled && !this.state.pending) return;
        this.timer = this.setTimer(() => void this.tick(), delay ?? 1000);
    }

    async tick() {
        if (this.running) return;
        if (!this.options.enabled && !['manual', 'manual_explicit', 'startup'].includes(this.state.pending?.mode)) return;
        if (!this.ready() || this.automation.running) { this.arm(1000); return; }
        const idleAt = this.state.lastActivity + this.options.idleMinutes * 60000;
        const pending = this.state.pending;
        if (!['manual', 'manual_explicit', 'startup'].includes(pending?.mode) && !(pending?.mode === 'auto' && pending?.internalReload) && this.now() < idleAt) { this.arm(idleAt - this.now()); return; }
        if (pending) {
            delete this.state.pending;
            this.save();
            await this.run(pending.sections, pending.mode);
            if (!pending.sections.length) this.arm();
            return;
        }
        const sections = this.sections();
        const next = sections.filter(section => !this.automation.definitions[typeof section === 'object' ? section.section : section]?.endsSequence)
            .map(section => this.due(section) ? this.now() : this.state.completed[typeof section === 'object' ? section.id : section].until);
        const wake = Math.max(Math.min(...next), this.retryAt ?? 0);
        if (wake > this.now()) { this.arm(Number.isFinite(wake) ? wake - this.now() : 60000); return; }
        await this.run(sections, 'auto');
    }

    dispose() {
        this.clearTimer(this.timer);
        this.save();
    }
}
