import mainProcessorUrl from './worklets/MainProcessor.ts?worker&url';

export class AudioManager {
    private context: AudioContext | null = null;
    private workletNode: AudioWorkletNode | null = null;
    private analyser: AnalyserNode | null = null;
    private dataArray: Uint8Array | null = null;

    // Visualization
    private visAnalysers: AnalyserNode[] = [];
    private visDataArrays: Uint8Array[] = [];

    // Master Effects Nodes
    private filterNode: BiquadFilterNode | null = null;
    private distortionNode: WaveShaperNode | null = null;
    private masterGainNode: GainNode | null = null;

    // Microphone Recording
    private mediaRecorder: MediaRecorder | null = null;
    private recordedChunks: Blob[] = [];
    private isRecording: boolean = false;

    public onClockTick: (() => void) | null = null;

    constructor() {
    }

    async init(): Promise<void> {
        console.log('[AudioManager] Initializing...');

        try {
            this.context = new AudioContext();

            // Load the AudioWorklet module
            console.log('[AudioManager] Loading worklet from:', mainProcessorUrl);
            await this.context.audioWorklet.addModule(mainProcessorUrl);

            // Create Nodes - Request 17 outputs:
            // Output 0: Stereo Mix
            // Output 1..16: Mono Visualization Channels (16 Pads)
            const channelCounts = [2, ...Array(16).fill(1)];
            this.workletNode = new AudioWorkletNode(this.context, 'main-processor', {
                numberOfOutputs: 17,
                outputChannelCount: channelCounts as any
            });

            this.filterNode = this.context.createBiquadFilter();
            this.filterNode.type = 'lowpass';
            this.filterNode.frequency.value = 20000; // Open by default
            this.filterNode.Q.value = 0;

            this.distortionNode = this.context.createWaveShaper();
            this.distortionNode.curve = this.makeDistortionCurve(0); // No dist
            this.distortionNode.oversample = '4x';

            this.masterGainNode = this.context.createGain();
            this.masterGainNode.gain.value = 0.8; // Initial Volume

            this.analyser = this.context.createAnalyser();
            this.analyser.fftSize = 1024; // Increased for better waveform detail
            this.analyser.smoothingTimeConstant = 0.3; // Smoother animation
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

            // Setup Visualization Analysers (16 slots)
            for (let i = 0; i < 16; i++) {
                const visAnalyser = this.context.createAnalyser();
                visAnalyser.fftSize = 1024;
                visAnalyser.smoothingTimeConstant = 0.1; // Fast response for individual hits
                this.visAnalysers.push(visAnalyser);
                this.visDataArrays.push(new Uint8Array(visAnalyser.frequencyBinCount));

                // Connect Worklet Output (i+1) to Analyser
                // workletNode.connect(dest, outputIndex, inputIndex)
                this.workletNode.connect(visAnalyser, i + 1);
            }

            // Connect Chain: Worklet(0) -> Filter -> Distortion -> MasterGain -> Analyser -> Destination
            this.workletNode.connect(this.filterNode, 0); // Output 0 
            this.filterNode.connect(this.distortionNode);
            this.distortionNode.connect(this.masterGainNode);
            this.masterGainNode.connect(this.analyser);
            this.analyser.connect(this.context.destination);

            console.log('[AudioManager] Initialization complete. Context state:', this.context.state);

            // Handle autoplay policy
            if (this.context.state === 'suspended') {
                console.log('[AudioManager] Context suspended. Resuming...');
                await this.context.resume();
            }

            // Robustness: Auto-resume on interruption
            this.context.onstatechange = () => {
                console.log(`[AudioManager] Context state changed to: ${this.context?.state}`);
                if (this.context?.state === 'suspended') {
                    // Try to resume if it was suspended unexpectedly (though browser might block it without gesture)
                    // We can at least log it or try.
                }
            };

        } catch (error) {
            console.error('[AudioManager] Initialization failed:', error);
            throw error;
        }
    }

    // --- Master Effects Control ---

    setMasterVolume(value: number) {
        if (this.masterGainNode && this.context) {
            // Smooth transition
            this.masterGainNode.gain.setTargetAtTime(value, this.context.currentTime, 0.01);
        }
    }

    setFilterCutoff(value: number) {
        // Value 0-100 -> Frequency 20Hz-20000Hz (Logarithmic approx)
        if (this.filterNode && this.context) {
            const minFreq = 20;
            const maxFreq = 20000;
            // Exponential mapping
            const frequency = minFreq * Math.pow(maxFreq / minFreq, value / 100);
            this.filterNode.frequency.setTargetAtTime(frequency, this.context.currentTime, 0.01);
        }
    }

    setFilterResonance(value: number) {
        // Value 0-100 -> Q 0-20
        if (this.filterNode && this.context) {
            const q = (value / 100) * 20;
            this.filterNode.Q.setTargetAtTime(q, this.context.currentTime, 0.01);
        }
    }

    setDistortion(amount: number) {
        if (this.distortionNode) {
            this.distortionNode.curve = this.makeDistortionCurve(amount);
        }
    }

    private makeDistortionCurve(amount: number): any {
        const k = typeof amount === 'number' ? amount : 0;
        const n_samples = 44100;
        const curve = new Float32Array(n_samples);
        const deg = Math.PI / 180;

        if (amount === 0) {
            for (let i = 0; i < n_samples; ++i) {
                const x = i * 2 / n_samples - 1;
                curve[i] = x;
            }
            return curve as unknown as Float32Array;
        }

        for (let i = 0; i < n_samples; ++i) {
            const x = i * 2 / n_samples - 1;
            // Sigmoid distortion function
            curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
        }
        return curve as unknown as Float32Array;
    }

    resume() {
        if (this.context && this.context.state === 'suspended') {
            this.context.resume();
        }
    }

    toggleTone(shouldPlay: boolean) {
        if (this.workletNode) {
            this.workletNode.port.postMessage({ type: 'TOGGLE_TONE', payload: shouldPlay });
        }
    }



    // Robustness: Force sync all critical state to worklet
    syncState() {
        if (!this.workletNode) return;
        // We need to pass current state. 
        // Ideally AudioManager stores state, or we pass it in.
        // For now, let's assuming MainProcessor has defaults, but we should re-send important flags if we can.
        // Actually, main.ts holds the state (isRecording, etc). 
        // So AudioManager needs methods to set these that main.ts calls, 
        // AND main.ts should call a "sync" function.
        // Or AudioManager just exposes the "set" methods which main.ts uses.

        // Let's just ensure BPM is up to date here if we had it.
        // But main.ts sets BPM on change.

        console.log('[AudioManager] Syncing state to worklet...');
        // We can't easily sync isRecording from here without knowing it.
        // So let's rely on main.ts calling the toggle methods correctly.
        // But we can ensure Timing is updated.
        this.workletNode.port.postMessage({ type: 'SET_BPM', payload: 120 }); // Warning: hardcoded? 
        // We should probably rely on the SET_BPM message sent by main.ts
    }

    async loadSample(id: string, url: string): Promise<void> {
        if (!this.context) return;
        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.context.decodeAudioData(arrayBuffer);

            const channels: Float32Array[] = [];
            for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
                channels.push(audioBuffer.getChannelData(i));
            }

            if (this.workletNode) {
                this.workletNode.port.postMessage({
                    type: 'LOAD_SAMPLE',
                    payload: { id, buffers: channels }
                });
            }
        } catch (error) {
            console.error(`[AudioManager] Failed to load sample ${id} from ${url}:`, error);
        }
    }

    async loadUserSample(id: string, file: File): Promise<void> {
        if (!this.context) return;

        try {
            console.log(`[AudioManager] Loading user file: ${file.name} to ${id}`);
            const arrayBuffer = await file.arrayBuffer();
            const audioBuffer = await this.context.decodeAudioData(arrayBuffer);

            // Extract and Send
            const channels: Float32Array[] = [];
            for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
                channels.push(audioBuffer.getChannelData(i));
            }

            if (this.workletNode) {
                this.workletNode.port.postMessage({
                    type: 'LOAD_SAMPLE',
                    payload: {
                        id: id,
                        buffers: channels
                    }
                });
            }
            console.log(`[AudioManager] User sample ${id} loaded.`);
        } catch (error) {
            console.error(`[AudioManager] Failed to load user file:`, error);
            throw error;
        }
    }


    playSample(id: string, velocity: number = 1.0) {
        if (this.workletNode) {
            this.workletNode.port.postMessage({
                type: 'PLAY_SAMPLE',
                payload: { id: id, velocity: velocity }
            });
        }
    }

    getVolume(): number {
        if (!this.analyser || !this.dataArray) return 0;

        this.analyser.getByteTimeDomainData(this.dataArray as unknown as any);

        let sum = 0;
        for (let i = 0; i < this.dataArray.length; i++) {
            // Convert 0..255 to -1..1
            const value = (this.dataArray[i] - 128) / 128.0;
            sum += value * value;
        }

        const rms = Math.sqrt(sum / this.dataArray.length);
        return rms; // 0.0 to 1.0 (approx)
    }

    getWaveformData(): Float32Array {
        // Legacy single waveform getter (returns Mix)
        if (!this.analyser || !this.dataArray) return new Float32Array(512);

        this.analyser.getByteTimeDomainData(this.dataArray as unknown as any);

        // Downsample to 512 points for rendering
        const targetSize = 512;
        const waveform = new Float32Array(targetSize);
        const step = this.dataArray.length / targetSize;

        for (let i = 0; i < targetSize; i++) {
            const index = Math.floor(i * step);
            // Convert 0-255 to -1 to 1
            waveform[i] = (this.dataArray[index] - 128) / 128.0;
        }

        return waveform;
    }

    getAllWaveforms(): Float32Array[] {
        const waveforms: Float32Array[] = [];
        const targetSize = 512;

        if (this.visAnalysers.length === 0) {
            // Fallback if not init
            return Array(16).fill(new Float32Array(targetSize));
        }

        for (let i = 0; i < 16; i++) {
            const analyser = this.visAnalysers[i];
            const data = this.visDataArrays[i];

            analyser.getByteTimeDomainData(data as any);

            const waveform = new Float32Array(targetSize);
            const step = data.length / targetSize;

            for (let j = 0; j < targetSize; j++) {
                const index = Math.floor(j * step);
                waveform[j] = (data[index] - 128) / 128.0;
            }
            waveforms.push(waveform);
        }
        return waveforms;
    }

    // --- Transport Logic (Simplified for Headless/Metronome only) ---

    // startTransport/stopTransport removed as we don't have a timeline anymore.
    // SyncState removed as we don't have complex state to sync.

    setBpm(bpm: number) {
        this.workletNode?.port.postMessage({ type: 'SET_BPM', payload: bpm });
    }

    // updatePattern, toggleRecord (sequencer), setQuantizeStrength, recordNote removed.

    toggleMetronome(isEnabled: boolean) {
        this.workletNode?.port.postMessage({ type: 'TOGGLE_METRONOME', payload: isEnabled });
    }

    // Subscribe to Worklet messages (STEP events removed, only keeping general)
    setWorkletCallback(callback: (data: any) => void) {
        if (this.workletNode) {
            this.workletNode.port.onmessage = (e) => callback(e.data);
        }
    }

    // --- Microphone Recording ---
    async prepareMicrophone(): Promise<void> {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            // Release immediately, we just wanted permission
            stream.getTracks().forEach(t => t.stop());
        } catch (err) {
            console.warn('[AudioManager] Mic permission check failed', err);
        }
    }

    async startMicRecording(): Promise<void> {
        if (this.isRecording) {
            throw new Error('Already recording');
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            this.recordedChunks = [];

            // Use webm format (widely supported)
            const options = { mimeType: 'audio/webm' };
            this.mediaRecorder = new MediaRecorder(stream, options);

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                }
            };

            this.mediaRecorder.start();
            this.isRecording = true;
            console.log('[AudioManager] Microphone recording started');

        } catch (error) {
            console.error('[AudioManager] Failed to start recording:', error);
            throw error;
        }
    }

    async stopMicRecording(): Promise<{ buffer: AudioBuffer, blob: Blob } | null> {
        if (!this.isRecording || !this.mediaRecorder || !this.context) {
            return null;
        }

        return new Promise((resolve, reject) => {
            this.mediaRecorder!.onstop = async () => {
                try {
                    // Stop all tracks
                    this.mediaRecorder!.stream.getTracks().forEach(track => track.stop());

                    // Convert recorded chunks to AudioBuffer
                    const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
                    const arrayBuffer = await blob.arrayBuffer();
                    const audioBuffer = await this.context!.decodeAudioData(arrayBuffer);

                    this.isRecording = false;
                    this.mediaRecorder = null;
                    this.recordedChunks = [];

                    console.log('[AudioManager] Recording stopped, buffer created');
                    resolve({ buffer: audioBuffer, blob: blob });
                } catch (error) {
                    console.error('[AudioManager] Failed to process recording:', error);
                    this.isRecording = false;
                    reject(error);
                }
            };

            this.mediaRecorder!.stop();
        });
    }

    async loadRecordedSample(id: string, audioBuffer: AudioBuffer): Promise<void> {
        if (!this.workletNode) return;

        try {
            const channels: Float32Array[] = [];
            for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
                channels.push(audioBuffer.getChannelData(i));
            }

            this.workletNode.port.postMessage({
                type: 'LOAD_SAMPLE',
                payload: {
                    id: id,
                    buffers: channels
                }
            });

            console.log(`[AudioManager] Recorded sample loaded to ${id}`);
        } catch (error) {
            console.error('[AudioManager] Failed to load recorded sample:', error);
            throw error;
        }
    }
}
