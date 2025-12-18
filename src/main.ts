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
             <div id="status-indicator" class="status-indicator">READY</div>
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
console.log('[System] Visualizer loaded', visualizer);
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
const statusIndicator = document.querySelector('#status-indicator') as HTMLDivElement;
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

    // 3. UI Generation
    generatePads();

    // 4. Load Saved Samples
    await loadAllSavedSamples();

    // 5. MIDI
    try {
      await midiManager.init();
      midiManager.setNoteOnCallback(handleMidiNote);
      statusIndicator.textContent = "AUDIO + MIDI";
    } catch (err) {
      console.warn('[System] MIDI Init failed', err);
      statusIndicator.textContent = "AUDIO ONLY";
    }

    isInitialized = true;
    startOverlay.style.display = 'none';
    mainInterface.style.display = 'flex';
    console.log('[System] Ready.');

    setupBpmControls();
    setupActionControls();
    setupDragAndDrop();

  } catch (err) {
    console.error('[System] Init Error:', err);
    startOverlay.innerHTML = '<h1>ERROR</h1><p>See Console</p>';
  }
});

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

    // Pad ID Label
    const label = document.createElement('span');
    label.textContent = pad.id.replace('pad', '');
    btn.appendChild(label);

    if (pad.key) {
      const hint = document.createElement('span');
      hint.className = 'key-hint';
      hint.textContent = pad.key.toUpperCase();
      btn.appendChild(hint);
    }

    // Click Event (Pointer)
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

    if (statusIndicator) {
      statusIndicator.textContent = `BPM ${currentBpm}`;
      setTimeout(() => statusIndicator.textContent = isInitialized ? "Active" : "Ready", 1000);
    }
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
      // Clear Audio (not exposed yet)
      // Clear UI
      document.querySelectorAll('.drum-pad').forEach(el => el.classList.remove('loaded'));
      console.log('[System] Kit Cleared');
    }
  });
}

// --- Sample Loading Logic ---

async function loadKitFiles(files: File[]) {
  // Sort alpha
  files.sort((a, b) => a.name.localeCompare(b.name));

  // Take max 16
  const filesToLoad = files.slice(0, 16);

  statusIndicator.textContent = "LOADING...";

  for (let i = 0; i < filesToLoad.length; i++) {
    // Pad 1-16 (indices 0-15)
    const padId = `pad${i + 1}`;
    const file = filesToLoad[i];

    await loadSampleToPad(padId, file);
  }

  statusIndicator.textContent = "LOADED";
  setTimeout(() => statusIndicator.textContent = "Active", 1500);
}

async function loadSampleToPad(padId: string, file: File) {
  try {
    // 1. Audio Manager
    await audioManager.loadUserSample(padId, file);

    // 2. Persistence
    await persistence.saveSample(padId, file);

    // 3. UI Update
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
        // Blob to File (mock)
        const file = new File([blob], "saved-sample.wav", { type: blob.type });
        await audioManager.loadUserSample(padId, file);

        // UI
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

  // Prevent default globally
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => e.preventDefault());

  // 1. Kit Drop (on container)
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

  // 2. Individual Pad Drop
  pads.forEach(pad => {
    // Cast to HTMLElement to access dataset
    const padEl = pad as HTMLElement;

    padEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation(); // Stop bubbling to container
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
        // Load single file to this specific pad
        const padId = padEl.dataset.padId; // We added data-padId in generate
        if (padId) {
          await loadSampleToPad(padId, files[0]);
        }
      }
    });
  });
}
