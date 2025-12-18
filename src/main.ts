import './style.css'
import { AudioManager } from './audio/AudioManager'
import { ThreeVisualizer } from './graphics/ThreeVisualizer'
import { MidiManager } from './audio/MidiManager'
import { PersistenceManager } from './system/PersistenceManager'

// --- HTML Structure ---
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div class="main-frame">
    <!-- Start Overlay (Visible Initially) -->
    <div id="start-overlay">
        <h1 style="font-family: inherit;">CLICK TO START</h1>
    </div>

    <!-- Hidden File Input for Kit Loading -->
    <input type="file" id="kit-input" multiple accept="audio/*" style="display: none;" />

    <!-- Main Interface (Hidden Initially) -->
    <div id="main-interface" style="display: none; width: 100%; height: 100%; flex-direction: column;">
        
        <!-- Header: Status & BPM -->
        <div class="ui-header">
            <div class="action-controls">
                <button id="btn-load" class="action-btn">LOAD</button>
                <button id="btn-clear" class="action-btn">CLR</button>
            </div>
            
            <div class="bpm-controls">
                <button id="bpm-minus" class="bpm-btn">-</button>
                <span id="bpm-display">120</span>
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

// --- Pad Configuration ---
const PAD_CONFIG: { id: string, key: string, midi: number }[] = [];
const BASE_MIDI = 48;

// Generate Config
for (let r = 3; r >= 0; r--) {
  for (let c = 1; c <= 4; c++) {
    const padNum = (r * 4) + c;
    const midiNote = BASE_MIDI + (padNum - 1);

    let key = '';
    if (padNum === 1) key = 'z';
    if (padNum === 2) key = 'x';
    if (padNum === 3) key = 'c';
    if (padNum === 4) key = 'v';

    PAD_CONFIG.push({ id: `pad${padNum}`, key, midi: midiNote });
  }
}

// Maps
const MIDI_TO_PAD: Record<number, string> = {};
const KEY_TO_PAD: Record<string, string> = {};
PAD_CONFIG.forEach(p => {
  MIDI_TO_PAD[p.midi] = p.id;
  if (p.key) KEY_TO_PAD[p.key] = p.id;
});

// --- Initialization ---
const startOverlay = document.querySelector('#start-overlay') as HTMLDivElement;
const mainInterface = document.querySelector('#main-interface') as HTMLDivElement;
const bpmDisplay = document.querySelector('#bpm-display') as HTMLSpanElement;

startOverlay.addEventListener('click', async () => {
  if (isInitialized) return;
  startOverlay.innerHTML = '<h1>INITIALIZING...</h1>';

  try {
    console.log('[System] Starting initialization...');

    // 1. Persistence
    await persistence.init();

    // 2. Audio
    await audioManager.init();
    audioManager.setBpm(currentBpm);

    // 3. Visualizer Integration
    console.log('[System] Starting Visualizer...');
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

    // 4. UI Generation
    generatePads();

    // 5. Load Saved Samples
    await loadAllSavedSamples();

    // 6. MIDI
    try {
      await midiManager.init();
      midiManager.setNoteOnCallback(handleMidiNote);
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

  // Unified Update Handler
  const updateState = () => {
    const cutoff = Number(cutoffInput.value);
    const res = Number(resInput.value);
    const dist = Number(distInput.value);
    const vol = Number(volInput.value);

    // Audio
    audioManager.setFilterCutoff(cutoff);
    audioManager.setFilterResonance(res);
    audioManager.setDistortion(dist);
    audioManager.setMasterVolume(vol / 100);

    // Visuals (Link FX to Visualizer)
    // setEffects(distortion, filter)
    visualizer.setEffects(dist, cutoff);

    // Persistence
    persistence.saveSetting('fx-state', { cutoff, res, dist, vol });
  };

  cutoffInput.addEventListener('input', updateState);
  resInput.addEventListener('input', updateState);
  distInput.addEventListener('input', updateState);
  volInput.addEventListener('input', updateState);

  // Initial Sync for Visualizer
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

    if (pad.key) {
      const hint = document.createElement('span');
      hint.className = 'key-hint';
      hint.textContent = pad.key.toUpperCase();
      btn.appendChild(hint);
    }

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

  // Audio
  audioManager.playSample(padId, velocity);

  // Visual
  const btn = document.getElementById(`btn-${padId}`);
  if (btn) {
    btn.classList.add('active');
    setTimeout(() => btn.classList.remove('active'), 80);
  }

  console.log(`[Trigger] ${padId} v${velocity.toFixed(2)}`);
}

// --- Inputs (MIDI/Key) ---
function handleMidiNote(note: number, velocity: number) {
  const padId = MIDI_TO_PAD[note];
  if (padId) {
    triggerVoice(padId, velocity / 127);
  }
}

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const key = e.key.toLowerCase();
  if (KEY_TO_PAD[key]) {
    triggerVoice(KEY_TO_PAD[key]);
  }
});

// --- Controls Setup ---
function setupBpmControls() {
  const btnMinus = document.querySelector('#bpm-minus') as HTMLButtonElement;
  const btnPlus = document.querySelector('#bpm-plus') as HTMLButtonElement;
  if (!btnMinus || !btnPlus) return;

  const updateBpm = (delta: number) => {
    let newBpm = currentBpm + delta;
    if (newBpm < 40) newBpm = 40;
    if (newBpm > 240) newBpm = 240;
    currentBpm = newBpm;

    audioManager.setBpm(currentBpm);
    if (bpmDisplay) bpmDisplay.textContent = currentBpm.toString();
  };

  btnMinus.addEventListener('click', () => updateBpm(-1));
  btnPlus.addEventListener('click', () => updateBpm(1));
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
    fileInput.value = ''; // Reset
  });

  btnClear?.addEventListener('click', async () => {
    if (confirm('Clear all samples?')) {
      await persistence.clear();
      document.querySelectorAll('.drum-pad').forEach(el => el.classList.remove('loaded'));
      console.log('[System] Kit Cleared');
    }
  });
}

// --- Sample Loading Logic ---

async function loadKitFiles(files: File[]) {
  files.sort((a, b) => a.name.localeCompare(b.name));
  const filesToLoad = files.slice(0, 16);

  console.log('Loading...');

  for (let i = 0; i < filesToLoad.length; i++) {
    const padId = `pad${i + 1}`;
    const file = filesToLoad[i];
    await loadSampleToPad(padId, file);
  }
  console.log('Loaded.');
}

async function loadSampleToPad(padId: string, file: File) {
  try {
    await audioManager.loadUserSample(padId, file);
    await persistence.saveSample(padId, file);

    const btn = document.getElementById(`btn-${padId}`);
    if (btn) btn.classList.add('loaded');

    console.log(`[Load] ${file.name} -> ${padId}`);
  } catch (err) {
    console.error(`[Load] Failed for ${padId}`, err);
  }
}

async function loadAllSavedSamples() {
  try {
    const samples = await persistence.getAllSamples();
    if (Object.keys(samples).length > 0) {
      console.log('[Persistence] Found saved samples:', Object.keys(samples).length);
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

    padEl.addEventListener('dragleave', () => {
      padEl.classList.remove('drag-over');
    });

    padEl.addEventListener('drop', async (e: any) => {
      e.preventDefault();
      e.stopPropagation();
      padEl.classList.remove('drag-over');

      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        const padId = padEl.dataset.padId;
        if (padId) {
          await loadSampleToPad(padId, files[0]);
        }
      }
    });
  });
}
