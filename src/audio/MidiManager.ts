// MIDIMessageEvent removed as it was unused and causing build error
// MIDIConnectionEvent removed as it was unused and causing build error

export class MidiManager {
    private midiAccess: any = null; // Use any to bypass strict type check for now

    private noteOnCallback: ((note: number, velocity: number) => void) | null = null;
    private ccCallback: ((cc: number, value: number) => void) | null = null;

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

    private onMidiMessage(event: any) {
        const data = event.data;
        if (!data || data.length < 3) return;

        const cmd = data[0] & 0xf0; // Mask channel
        const byte1 = data[1];
        const byte2 = data[2];

        // Note On (144 / 0x90)
        if (cmd === 144 && byte2 > 0) {
            if (this.noteOnCallback) {
                this.noteOnCallback(byte1, byte2); // note, velocity
            }
        }
        // Note Off (128 / 0x80)
        else if (cmd === 128 || (cmd === 144 && byte2 === 0)) {
            // Optional: Handle Note Off
        }
        // Control Change (176 / 0xB0)
        else if (cmd === 176) {
            if (this.ccCallback) {
                this.ccCallback(byte1, byte2); // cc, value
            }
        }
    }
}
