import './style.css'
import { AudioManager } from './audio/AudioManager'
import { ThreeVisualizer } from './graphics/ThreeVisualizer'
import { MidiManager } from './audio/MidiManager'
import { PersistenceManager } from './system/PersistenceManager'

// --- Constants & Defaults ---
const DEFAULT_KEY_MAP: Record<string, string> = {
  'z': 'pad1', 'x': 'pad2', 'c': 'pad3', 'v': 'pad4'
  // Can be extended here
};

// --- HTML Structure ---
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div class="main-frame">
    <!-- Start Overlay (Visible Initially) -->
    <div id="start-overlay">
        <div class="glitch-wrapper">
          <img src="logo_demo.svg" id="start-logo" alt="Embryo Logo" />
        </div>
        <h1 style="font-family: inherit;">CLICK TO START</h1>
    </div>

    <!-- Hidden File Input for Kit Loading -->
    <input type="file" id="kit-input" multiple accept="audio/*" style="display: none;" />

    <!-- Help Modal (Hidden) -->
    <div id="help-modal" style="display: none;">
        <div class="modal-content">
            <button id="btn-help-close" class="close-btn">X</button>
            <h2>SYSTEM MANUAL</h2>
            
            <div class="manual-section">
                <h3>MIDI MAPPING (NOTE ON)</h3>
                <div class="data-table">
                    <span>PAD 1-4:</span> <span>48 - 51 (C3-D#3)</span>
                    <span>PAD 5-8:</span> <span>52 - 55 (E3-G3)</span>
                    <span>PAD 9-12:</span> <span>56 - 59 (G#3-B3)</span>
                    <span>PAD 13-16:</span> <span>60 - 63 (C4-D#4)</span>
                </div>
            </div>

            <div class="manual-section">
                <h3>MIDI CC (KNOBS)</h3>
                <div class="data-table">
                    <span>CUTOFF:</span> <span>CC 24</span>
                    <span>RES:</span> <span>CC 25</span>
                    <span>DIST:</span> <span>CC 26</span>
                    <span>VOL:</span> <span>CC 27</span>
                </div>
            </div>

            <div class="manual-section">
                <h3>KEYBOARD</h3>
                <div class="data-table">
                    <span>PAD 1-4:</span> <span>Z, X, C, V</span>
                    <span>Others:</span> <span>Map via Settings (WIP)</span>
                </div>
            </div>
        </div>
    </div>

    <!-- Main Interface (Hidden Initially) -->
    <div id="main-interface" style="display: none; width: 100%; height: 100%; flex-direction: column;">
        
        <!-- Header: Status & BPM -->
        <div class="ui-header">
            <div class="action-controls">
                <button id="btn-load" class="action-btn">LOAD</button>
                <button id="btn-clear" class="action-btn">CLR</button>
                <button id="btn-help" class="action-btn">?</button>
            </div>
            
            <div class="bpm-controls">
                <button id="btn-tap" class="bpm-btn" style="width: auto; padding: 0 10px; margin-right: 5px; font-size: 0.8rem; font-weight: 800;">TAP</button>
                <button id="bpm-minus" class="bpm-btn">-</button>
                <span id="bpm-display" style="min-width: 3.5rem; text-align: center;">120</span>
                <button id="bpm-plus" class="bpm-btn">+</button>
            </div>
        </div>

        <!-- Visualizer Area -->
        <div class="ui-visualizer" id="visualizer-container">
             <!-- Canvas -->
        </div>

        <!-- FX Panel -->
        <div class="fx-panel">
            <div class="fx-group">
                <label class="fx-label">FLT</label>
                <input type="range" id="fx-cutoff" class="fx-slider" min="0" max="100" value="100">
            </div>
            <div class="fx-group">
                <label class="fx-label">RES</label>
                <input type="range" id="fx-res" class="fx-slider" min="0" max="100" value="0">
            </div>
            <div class="fx-group">
                <label class="fx-label">DRV</label>
                <input type="range" id="fx-dist" class="fx-slider" min="0" max="100" value="0">
            </div>
             <div class="fx-group">
                <label class="fx-label">VOL</label>
                <input type="range" id="fx-vol" class="fx-slider" min="0" max="100" value="80">
            </div>
        </div>

        <!-- Controls Area (Pads) -->
        <div class="ui-controls">
            <div id="pad-container" class="pad-grid"></div>
        </div>
    </div>
  </div>
`;

// --- Systems ---
const audioManager = new AudioManager();
const visualizer = new ThreeVisualizer();
const midiManager = new MidiManager();
const persistence = new PersistenceManager();

// --- State ---
let currentBpm = 120;
let isInitialized = false;
let keyMap: Record<string, string> = { ...DEFAULT_KEY_MAP };
let invertedKeyMap: Record<string, string> = {}; // padId -> key

// --- Pad Configuration ---
const PAD_CONFIG: { id: string, midi: number }[] = [];
const BASE_MIDI = 48;

// Generate Sequential Pad Data
for (let r = 3; r >= 0; r--) {
  for (let c = 1; c <= 4; c++) {
    const padNum = (r * 4) + c;
    const midiNote = BASE_MIDI + (padNum - 1);
    PAD_CONFIG.push({ id: `pad${padNum}`, midi: midiNote });
  }
}

const MIDI_TO_PAD: Record<number, string> = {};
PAD_CONFIG.forEach(p => {
  MIDI_TO_PAD[p.midi] = p.id;
});

// --- Initialization ---
const startOverlay = document.querySelector('#start-overlay') as HTMLDivElement;
const mainInterface = document.querySelector('#main-interface') as HTMLDivElement;
const bpmDisplay = document.querySelector('#bpm-display') as HTMLSpanElement;

startOverlay.addEventListener('click', async () => {
  if (isInitialized) return;
  const startText = startOverlay.querySelector('h1');
  if (startText) startText.textContent = 'INITIALIZING...';

  try {
    console.log('[System] Starting initialization...');

    // 1. Persistence
    await persistence.init();

    // 2. Load Settings (Mappings, BPM, etc)
    const savedKeys = await persistence.loadSetting('key-map');
    if (savedKeys) keyMap = savedKeys;
    // Rebuild reverse map for UI hints
    invertedKeyMap = {};
    for (const [key, padId] of Object.entries(keyMap)) {
      invertedKeyMap[padId] = key;
    }

    // 3. Audio
    await audioManager.init();
    audioManager.setBpm(currentBpm);

    // Visual Metronome Handler
    audioManager.setWorkletCallback((msg) => {
      if (msg.type === 'BEAT') {
        if (bpmDisplay) {
          bpmDisplay.classList.remove('beat-pulse');
          void bpmDisplay.offsetWidth; // Trigger reflow
          bpmDisplay.classList.add('beat-pulse');
        }
      }
    });

    // 4. Visualizer Integration
    const visContainer = document.querySelector('#visualizer-container') as HTMLDivElement;
    if (visContainer) {
      visContainer.innerHTML = '';
      const canvas = document.createElement('canvas');
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      visContainer.appendChild(canvas);

      visualizer.init(canvas);
      visualizer.setDataProvider(() => audioManager.getAllWaveforms());
      visualizer.start();

      const resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
          const { width, height } = entry.contentRect;
          visualizer.resize(width, height);
        }
      });
      resizeObserver.observe(visContainer);
    }

    // 5. UI Generation
    generatePads();

    // 6. Load Saved Samples
    await loadAllSavedSamples();

    // 7. MIDI
    try {
      if (await midiManager.init()) {
        midiManager.setNoteOnCallback(handleMidiNote);
        midiManager.setCcCallback(handleMidiCC);
        midiManager.setBpmCallback((bpm) => {
          if (bpm !== currentBpm) {
            currentBpm = bpm;
            if (bpmDisplay) bpmDisplay.textContent = currentBpm.toString().padStart(3, '0');
            audioManager.setBpm(currentBpm);
          }
        });
      }
    } catch (err) {
      console.warn('[System] MIDI Init failed', err);
    }

    isInitialized = true;
    startOverlay.style.display = 'none';
    mainInterface.style.display = 'flex';
    console.log('[System] Ready.');

    setupBpmControls();
    setupActionControls();
    setupDragAndDrop();
    await setupFXControls();

  } catch (err) {
    console.error('[System] Init Error:', err);
    startOverlay.innerHTML = '<h1>ERROR</h1><p>See Console</p>';
  }
});

// --- FX Controls Logic ---
async function setupFXControls() {
  const cutoffInput = document.getElementById('fx-cutoff') as HTMLInputElement;
  const resInput = document.getElementById('fx-res') as HTMLInputElement;
  const distInput = document.getElementById('fx-dist') as HTMLInputElement;
  const volInput = document.getElementById('fx-vol') as HTMLInputElement;

  if (!cutoffInput || !resInput || !distInput || !volInput) return;

  // Load Saved
  try {
    const saved = await persistence.loadSetting('fx-state');
    if (saved) {
      cutoffInput.value = saved.cutoff;
      resInput.value = saved.res;
      distInput.value = saved.dist;
      volInput.value = saved.vol;

      // Apply immediately
      audioManager.setFilterCutoff(Number(saved.cutoff));
      audioManager.setFilterResonance(Number(saved.res));
      audioManager.setDistortion(Number(saved.dist));
      audioManager.setMasterVolume(Number(saved.vol) / 100);
    } else {
      // Defaults
      audioManager.setFilterCutoff(100);
      audioManager.setFilterResonance(0);
      audioManager.setDistortion(0);
      audioManager.setMasterVolume(0.8);
    }
  } catch (e) { console.warn('FX Load Failed', e); }

  const updateState = () => {
    const cutoff = Number(cutoffInput.value);
    const res = Number(resInput.value);
    const dist = Number(distInput.value);
    const vol = Number(volInput.value);

    audioManager.setFilterCutoff(cutoff);
    audioManager.setFilterResonance(res);
    audioManager.setDistortion(dist);
    audioManager.setMasterVolume(vol / 100);
    visualizer.setEffects(dist, cutoff);

    persistence.saveSetting('fx-state', { cutoff, res, dist, vol });
  };

  cutoffInput.addEventListener('input', updateState);
  resInput.addEventListener('input', updateState);
  distInput.addEventListener('input', updateState);
  volInput.addEventListener('input', updateState);

  visualizer.setEffects(Number(distInput.value), Number(cutoffInput.value));
}


// --- Pad Generation ---
function generatePads() {
  const container = document.getElementById('pad-container');
  if (!container) return;
  container.innerHTML = '';

  PAD_CONFIG.forEach(pad => {
    const btn = document.createElement('div');
    btn.className = 'drum-pad';
    btn.id = `btn-${pad.id}`;
    btn.dataset.padId = pad.id;

    const label = document.createElement('span');
    label.textContent = pad.id.replace('pad', '');
    btn.appendChild(label);

    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      triggerVoice(pad.id);
    });
    btn.addEventListener('mousedown', () => {
      triggerVoice(pad.id);
    });

    container.appendChild(btn);
  });
}

// --- Trigger Logic ---
function triggerVoice(padId: string, velocity: number = 1.0) {
  if (!isInitialized) return;
  audioManager.playSample(padId, velocity);
  const btn = document.getElementById(`btn-${padId}`);
  if (btn) {
    btn.classList.add('active');
    setTimeout(() => btn.classList.remove('active'), 80);
  }

  // Visualizer Trigger (Spring Physics)
  const padNum = parseInt(padId.replace('pad', ''), 10);
  if (!isNaN(padNum)) {
    // efficient mapping: pad1 -> index 0
    visualizer.trigger(padNum - 1, velocity);
  }
}

// --- MIDI Handling ---
function handleMidiNote(note: number, velocity: number) {
  const padId = MIDI_TO_PAD[note];
  if (padId) {
    triggerVoice(padId, velocity / 127);
  }
}

function handleMidiCC(cc: number, value: number) {
  // CC 24: Cutoff, 25: Res, 26: Dist, 27: Vol
  const normalized = (value / 127) * 100;

  if (cc === 24) {
    const input = document.getElementById('fx-cutoff') as HTMLInputElement;
    if (input) { input.value = normalized.toString(); input.dispatchEvent(new Event('input')); }
  } else if (cc === 25) {
    const input = document.getElementById('fx-res') as HTMLInputElement;
    if (input) { input.value = normalized.toString(); input.dispatchEvent(new Event('input')); }
  } else if (cc === 26) {
    const input = document.getElementById('fx-dist') as HTMLInputElement;
    if (input) { input.value = normalized.toString(); input.dispatchEvent(new Event('input')); }
  } else if (cc === 27) {
    const input = document.getElementById('fx-vol') as HTMLInputElement;
    if (input) { input.value = normalized.toString(); input.dispatchEvent(new Event('input')); }
  }
}

// --- Keyboard Handling ---
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const key = e.key.toLowerCase();
  const padId = keyMap[key];
  if (padId) {
    triggerVoice(padId);
  }
});

// --- Controls Setup ---
function setupBpmControls() {
  const btnMinus = document.querySelector('#bpm-minus') as HTMLButtonElement;
  const btnPlus = document.querySelector('#bpm-plus') as HTMLButtonElement;
  const btnTap = document.querySelector('#btn-tap') as HTMLButtonElement;

  if (!btnMinus || !btnPlus) return;

  const updateBpm = (delta: number, absolute?: number) => {
    let newBpm = absolute !== undefined ? absolute : currentBpm + delta;
    if (newBpm < 40) newBpm = 40;
    if (newBpm > 240) newBpm = 240;
    currentBpm = newBpm;

    audioManager.setBpm(currentBpm);
    if (bpmDisplay) {
      // Pad with leading zeros (0xx)
      bpmDisplay.textContent = currentBpm.toString().padStart(3, '0');
    }
  };

  // Initial display padding
  if (bpmDisplay) bpmDisplay.textContent = currentBpm.toString().padStart(3, '0');

  btnMinus.addEventListener('click', () => updateBpm(-1));
  btnPlus.addEventListener('click', () => updateBpm(1));

  // --- TAP TEMPO LOGIC ---
  let tapTimes: number[] = [];

  btnTap?.addEventListener('click', () => {
    const now = Date.now();
    if (tapTimes.length > 0 && now - tapTimes[tapTimes.length - 1] > 2000) {
      tapTimes = [];
    }

    tapTimes.push(now);
    if (tapTimes.length > 4) tapTimes.shift();

    if (tapTimes.length > 1) {
      let intervalsSum = 0;
      for (let i = 1; i < tapTimes.length; i++) {
        intervalsSum += tapTimes[i] - tapTimes[i - 1];
      }
      const avgInterval = intervalsSum / (tapTimes.length - 1);
      const bpm = Math.round(60000 / avgInterval);
      updateBpm(0, bpm);
    }
    // No text change, color is handled by CSS :active
  });
}

function setupActionControls() {
  const btnLoad = document.getElementById('btn-load');
  const btnClear = document.getElementById('btn-clear');
  const fileInput = document.getElementById('kit-input') as HTMLInputElement;

  btnLoad?.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', async (e) => {
    const files = (e.target as HTMLInputElement).files;
    if (files && files.length > 0) {
      await loadKitFiles(Array.from(files));
    }
    fileInput.value = '';
  });

  btnClear?.addEventListener('click', async () => {
    if (confirm('Clear all samples?')) {
      await persistence.clear();
      document.querySelectorAll('.drum-pad').forEach(el => el.classList.remove('loaded'));
    }
  });

  // Help Modal Logic
  const btnHelp = document.getElementById('btn-help');
  const helpModal = document.getElementById('help-modal');
  const btnHelpClose = document.getElementById('btn-help-close');

  btnHelp?.addEventListener('click', () => {
    if (helpModal) helpModal.style.display = 'flex';
  });

  btnHelpClose?.addEventListener('click', () => {
    if (helpModal) helpModal.style.display = 'none';
  });

  helpModal?.addEventListener('click', (e) => {
    if (e.target === helpModal) helpModal.style.display = 'none';
  });
}

// --- Sample Loading Logic ---
async function loadKitFiles(files: File[]) {
  files.sort((a, b) => a.name.localeCompare(b.name));
  const filesToLoad = files.slice(0, 16);

  for (let i = 0; i < filesToLoad.length; i++) {
    const padId = `pad${i + 1}`;
    await loadSampleToPad(padId, files[i]);
  }
}

async function loadSampleToPad(padId: string, file: File) {
  try {
    await audioManager.loadUserSample(padId, file);
    await persistence.saveSample(padId, file);
    const btn = document.getElementById(`btn-${padId}`);
    if (btn) btn.classList.add('loaded');
  } catch (err) {
    console.error(`[Load] Failed for ${padId}`, err);
  }
}

async function loadAllSavedSamples() {
  try {
    const samples = await persistence.getAllSamples();
    if (Object.keys(samples).length > 0) {
      for (const [padId, blob] of Object.entries(samples)) {
        const file = new File([blob], "saved-sample.wav", { type: blob.type });
        await audioManager.loadUserSample(padId, file);
        const btn = document.getElementById(`btn-${padId}`);
        if (btn) btn.classList.add('loaded');
      }
    }
  } catch (err) {
    console.warn('[Persistence] Failed to auto-load', err);
  }
}

// --- Drag and Drop ---
function setupDragAndDrop() {
  const padContainer = document.getElementById('pad-container');
  const pads = document.querySelectorAll('.drum-pad');

  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => e.preventDefault());

  padContainer?.addEventListener('dragover', (e) => {
    e.preventDefault();
    padContainer.classList.add('drag-over');
  });
  padContainer?.addEventListener('dragleave', () => padContainer.classList.remove('drag-over'));
  padContainer?.addEventListener('drop', async (e) => {
    e.preventDefault();
    padContainer.classList.remove('drag-over');
    if (e.dataTransfer && e.dataTransfer.files.length > 0) {
      await loadKitFiles(Array.from(e.dataTransfer.files));
    }
  });

  pads.forEach(pad => {
    const padEl = pad as HTMLElement;
    padEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      padEl.classList.add('drag-over');
    });
    padEl.addEventListener('dragleave', () => padEl.classList.remove('drag-over'));
    padEl.addEventListener('drop', async (e: any) => {
      e.preventDefault();
      e.stopPropagation();
      padEl.classList.remove('drag-over');
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        const padId = padEl.dataset.padId;
        if (padId) await loadSampleToPad(padId, files[0]);
      }
    });
  });
}
