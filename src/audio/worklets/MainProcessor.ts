declare const sampleRate: number;

interface AudioMessage {
    type: 'TOGGLE_TONE' | 'LOAD_SAMPLE' | 'PLAY_SAMPLE' | 'SET_BPM' | 'TOGGLE_METRONOME' | 'LOG' | 'SET_CHOKE_GROUP';
    payload: any;
}

interface SampleVoice {
    sampleId: string;
    bufferIndex: number; // Current position in the buffer
    isPlaying: boolean;
    gain: number;
    visSlot: number;
}

class MainProcessor extends AudioWorkletProcessor {
    private phase: number = 0;
    private isTonePlaying: boolean = false;

    // Sampler State
    private sampleBuffers: Map<string, Float32Array[]> = new Map();
    private activeVoices: SampleVoice[] = [];

    // Metronome State
    private isMetronomeEnabled: boolean = false;
    private bpm: number = 120;
    private metronomePhase: number = 0;
    private currentBeat: number = 0;
    private clickFreq: number = 0.1; // Phase multiplier
    private clickAmp: number = 0.3;

    // Metronome Timing
    private nextClickCountdown: number = 0;
    private samplesPerBeat: number = 0;

    // MIDI Clock Timing
    private ticksUntilNextClock: number = 0;



    constructor() {
        super();
        this.updateTiming(); // Init timing

        this.port.onmessage = (event) => {
            const msg = event.data as AudioMessage;

            if (msg.type === 'TOGGLE_TONE') {
                this.isTonePlaying = msg.payload;
            } else if (msg.type === 'LOAD_SAMPLE') {
                const { id, buffers } = msg.payload;
                this.sampleBuffers.set(id, buffers);
                this.port.postMessage({ type: 'LOG', payload: `[Worklet] Loaded ${id}, channels: ${buffers.length}, length: ${buffers[0].length}` });
            } else if (msg.type === 'PLAY_SAMPLE') {
                const { id, velocity } = msg.payload;
                this.triggerVoice(id, velocity);
            } else if (msg.type === 'SET_BPM') {
                this.bpm = msg.payload;
                this.updateTiming();
                this.port.postMessage({ type: 'LOG', payload: `[Worklet] BPM set to ${this.bpm}` });
            } else if (msg.type === 'TOGGLE_METRONOME') {
                this.isMetronomeEnabled = msg.payload;
                if (this.isMetronomeEnabled) {
                    this.nextClickCountdown = 0; // Start immediately
                    this.currentBeat = 0; // Reset bar
                }
            } else if (msg.type === 'SET_CHOKE_GROUP') {
                const { id, group } = msg.payload;
                this.chokeGroups.set(id, group);
                this.port.postMessage({ type: 'LOG', payload: `[Worklet] Choke Group ${group} set for ${id}` });
            }
        };
    }

    updateTiming() {
        // Calculate samples per beat (Quarter note)
        this.samplesPerBeat = (sampleRate * 60) / this.bpm;
    }

    // Choke Groups Config
    private chokeGroups: Map<string, number> = new Map();

    triggerVoice(id: string, velocity: number = 1.0) {
        if (this.sampleBuffers.has(id)) {
            // 1. Choke Logic
            const group = this.chokeGroups.get(id);
            if (group !== undefined) {
                // Stop any playing voice in the same group
                for (const voice of this.activeVoices) {
                    if (voice.isPlaying && this.chokeGroups.get(voice.sampleId) === group) {
                        voice.isPlaying = false;
                        // Optional: Fade out quickly (e.g. 5ms) instead of hard cut to avoid pops
                        // For low latency drums, hard cut is standard for choke.
                    }
                }
            }

            // Direct Map: pad1 -> slot 0, pad16 -> slot 15
            // Parsing "padX"
            const padNum = parseInt(id.replace('pad', ''), 10);
            let slot = 0;
            if (!isNaN(padNum) && padNum >= 1 && padNum <= 16) {
                slot = padNum - 1;
            }

            this.activeVoices.push({
                sampleId: id,
                bufferIndex: 0,
                isPlaying: true,
                gain: velocity,
                visSlot: slot
            } as any);
        }
    }

    process(_inputs: Float32Array[][], outputs: Float32Array[][], _parameters: Record<string, Float32Array>): boolean {
        const mixOutput = outputs[0]; // Stereo Mix
        const frequency = 440.0;

        // Ensure we have an output buffer
        if (!mixOutput || mixOutput.length === 0) return true;

        const bufferSize = mixOutput[0].length;

        // 0. Clear All Outputs (Mix + 16 Vis Channels)
        for (let o = 0; o < outputs.length; o++) {
            const output = outputs[o];
            if (!output) continue;
            for (let ch = 0; ch < output.length; ch++) {
                output[ch].fill(0);
            }
        }

        // 1. Clock Logic (Always Running)
        // 24 PPQ Logic
        for (let i = 0; i < bufferSize; i++) {
            this.nextClickCountdown--;

            // Metronome (Quarter Note) Logic
            if (this.nextClickCountdown <= 0) {
                this.triggerMetronome();
                this.nextClickCountdown = this.samplesPerBeat;
            }

            // MIDI Clock (24 PPQ) Logic
            this.ticksUntilNextClock--;
            if (this.ticksUntilNextClock <= 0) {
                this.port.postMessage({ type: 'CLOCK_TICK' });
                this.ticksUntilNextClock = this.samplesPerBeat / 24;
            }
        }

        // 2. Metronome Sound Generation (Mix Only)
        if (this.isMetronomeEnabled && this.metronomePhase > 0) {
            for (let i = 0; i < bufferSize; i++) {
                if (this.metronomePhase > 0) {
                    // Simple Sine Sweep
                    const clickSample = Math.sin(this.metronomePhase * this.clickFreq) * this.clickAmp;
                    for (let ch = 0; ch < mixOutput.length; ch++) {
                        mixOutput[ch][i] += clickSample;
                    }
                    this.metronomePhase -= 15; // Faster Decay
                } else {
                    break;
                }
            }
        }

        // 3. Oscillator (Test Tone) - Mix Only
        if (this.isTonePlaying) {
            for (let i = 0; i < bufferSize; i++) {
                const sample = 0.5 * Math.sin(2 * Math.PI * this.phase);
                this.phase += frequency / sampleRate;
                if (this.phase > 1) this.phase -= 1;
                for (let ch = 0; ch < mixOutput.length; ch++) {
                    mixOutput[ch][i] += sample;
                }
            }
        }

        // 4. Sampler
        for (let v = this.activeVoices.length - 1; v >= 0; v--) {
            const voice = this.activeVoices[v];
            const buffer = this.sampleBuffers.get(voice.sampleId);

            if (!buffer) {
                this.activeVoices.splice(v, 1);
                continue;
            }

            // Target Vis Output
            // outputs[0] is Mix. outputs[1] is Vis 1 (Slot 0).
            const visOutputIndex = (voice as any).visSlot + 1;
            const visOutput = (outputs[visOutputIndex] && outputs[visOutputIndex].length > 0) ? outputs[visOutputIndex][0] : null; // Mono vis

            for (let i = 0; i < bufferSize; i++) {
                if (!voice.isPlaying) break;

                // Mix to Stereo Master
                for (let ch = 0; ch < mixOutput.length; ch++) {
                    const inputChannelIndex = Math.min(ch, buffer.length - 1);
                    const sampleValue = buffer[inputChannelIndex][voice.bufferIndex];
                    const outSample = sampleValue * voice.gain;

                    mixOutput[ch][i] += outSample;
                }

                // Mix to Vis Output (Mono Mix of the sample)
                if (visOutput) {
                    // Just take channel 0 of sample for vis, or average? simple is ch 0
                    const sampleValue = buffer[0][voice.bufferIndex];
                    visOutput[i] += sampleValue * voice.gain;
                }

                voice.bufferIndex++;
                if (voice.bufferIndex >= buffer[0].length) {
                    voice.isPlaying = false;
                    break;
                }
            }

            if (!voice.isPlaying) {
                this.activeVoices.splice(v, 1);
            }
        }

        return true;
    }

    triggerMetronome() {
        this.metronomePhase = 3000; // Reset length

        // Notify Main Thread (for Visuals)
        this.port.postMessage({ type: 'BEAT', payload: this.currentBeat });

        if (this.currentBeat === 0) {
            // Strong Beat (High Pitch, Louder)
            this.clickFreq = 0.25;
            this.clickAmp = 0.5;
        } else {
            // Weak Beat (Low Pitch, Softer)
            this.clickFreq = 0.15;
            this.clickAmp = 0.3;
        }

        this.currentBeat = (this.currentBeat + 1) % 4;
    }
}

registerProcessor('main-processor', MainProcessor);
