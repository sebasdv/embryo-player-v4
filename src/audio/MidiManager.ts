// MIDIMessageEvent removed as it was unused and causing build error
// MIDIConnectionEvent removed as it was unused and causing build error

export class MidiManager {
    private midiAccess: any = null; // Use any to bypass strict type check for now

    private noteOnCallback: ((note: number, velocity: number) => void) | null = null;
    private ccCallback: ((cc: number, value: number) => void) | null = null;
    private bpmCallback: ((bpm: number) => void) | null = null;

    // Clock State
    private lastTickTime: number = 0;
    private tickCount: number = 0;
    private tickIntervals: number[] = [];

    constructor() { }

    async init(): Promise<boolean> {
        if (!(navigator as any).requestMIDIAccess) {
            console.warn('[MidiManager] Web MIDI API not supported.');
            return false;
        }

        try {
            this.midiAccess = await (navigator as any).requestMIDIAccess();

            // Listen to inputs
            this.midiAccess.inputs.forEach((input: any) => {
                input.onmidimessage = this.onMidiMessage.bind(this);
            });

            this.midiAccess.onstatechange = (e: any) => {
                const event = e;
                console.log(`[MidiManager] Device ${event.port.state}: ${event.port.name}`);
                if (event.port.type === 'input' && event.port.state === 'connected') {
                    // Re-bind if a new device is connected
                    event.port.onmidimessage = this.onMidiMessage.bind(this);
                }
            };

            console.log('[MidiManager] Initialized.');
            return true;
        } catch (error) {
            console.error('[MidiManager] Init failed:', error);
            return false;
        }
    }

    setNoteOnCallback(callback: (note: number, velocity: number) => void) {
        this.noteOnCallback = callback;
    }

    setCcCallback(callback: (cc: number, value: number) => void) {
        this.ccCallback = callback;
    }

    setBpmCallback(callback: (bpm: number) => void) {
        this.bpmCallback = callback;
    }

    sendCC(cc: number, value: number) {
        if (!this.midiAccess) return;

        // Broadcast to all connected outputs
        // Status 0xB0 (176) = CC Channel 1
        const msg = [0xB0, cc, value];
        this.midiAccess.outputs.forEach((output: any) => {
            try {
                output.send(msg);
            } catch (err) {
                // Ignore send errors
            }
        });
    }

    sendClockTick() {
        if (!this.midiAccess) return;

        // 0xF8 = Timing Clock
        const msg = [0xF8];
        this.midiAccess.outputs.forEach((output: any) => {
            try {
                output.send(msg);
            } catch (err) {
                // Ignore
            }
        });
    }

    private onMidiMessage(event: any) {
        const data = event.data;
        if (!data || data.length === 0) return;

        const cmd = data[0];

        // --- Realtime Messages (System Realtime) ---
        if (cmd === 0xF8) { // Timing Clock
            this.handleClockTick();
            return;
        }

        if (cmd === 0xFA || cmd === 0xFB || cmd === 0xFC) {
            // Start, Continue, Stop - could handle transport here
            return;
        }

        if (data.length < 3) return;

        const status = data[0] & 0xf0; // Mask channel
        const byte1 = data[1];
        const byte2 = data[2];

        // Debug Log
        console.log(`[MIDI IN] cmd: ${status}, note: ${byte1}, velocity: ${byte2}`);

        // Note On (144 / 0x90)
        if (status === 144 && byte2 > 0) {
            if (this.noteOnCallback) {
                this.noteOnCallback(byte1, byte2); // note, velocity
            }
        }
        // Note Off (128 / 0x80)
        else if (status === 128 || (status === 144 && byte2 === 0)) {
            // Optional: Handle Note Off
        }
        // Control Change (176 / 0xB0)
        else if (status === 176) {
            if (this.ccCallback) {
                this.ccCallback(byte1, byte2); // cc, value
            }
        }
    }

    private handleClockTick() {
        // MIDI Clock sends 24 pulses per quarter note (PPQ).
        const now = performance.now();

        if (this.lastTickTime > 0) {
            const delta = now - this.lastTickTime;
            this.tickIntervals.push(delta);

            // Keep window small for responsiveness (e.g., 24 ticks = 1 beat)
            if (this.tickIntervals.length > 24) {
                this.tickIntervals.shift();
            }
        }

        this.lastTickTime = now;
        this.tickCount++;

        // Update BPM every 24 ticks (every quarter note)
        if (this.tickCount % 24 === 0) {
            this.calculateBpm();
        }
    }

    private calculateBpm() {
        if (this.tickIntervals.length < 24) return;

        // Average interval
        const sum = this.tickIntervals.reduce((a, b) => a + b, 0);
        const avgInterval = sum / this.tickIntervals.length;

        // BPM = 60000 ms / (interval * 24)
        const rawBpm = 60000 / (avgInterval * 24);

        // Round to 1 decimal place or integer
        const smoothedBpm = Math.round(rawBpm * 10) / 10;

        // Debounce / Check threshold to avoid UI jitter
        // Only update if change is significant (> 0.5 BPM) or enough time passed
        // For now, let's just callback.
        if (this.bpmCallback) {
            // Clamp reasonable values
            if (smoothedBpm >= 30 && smoothedBpm <= 300) {
                this.bpmCallback(Math.round(smoothedBpm));
            }
        }
    }
}
