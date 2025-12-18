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

    <!-- Main Interface (Hidden Initially) -->
    <div id="main-interface" style="display: none; width: 100%; height: 100%; flex-direction: column;">
        
        <!-- Header: Status & BPM -->
        <div class="ui-header">
            <div id="status-indicator" class="status-indicator">READY</div>
            <div class="bpm-controls">
                <button id="bpm-minus" class="bpm-btn">-</button>
                <span id="bpm-display">120</span>
                <button id="bpm-plus" class="bpm-btn">+</button>
            </div>
        </div>

        <!-- Visualizer Area -->
        <div class="ui-visualizer" id="visualizer-container">
            <!-- Canvas will go here -->
            <span style="opacity: 0.3;">VISUALIZER</span>
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
// 16 Pads (4x4)
// MIDI 48 (C3) to 63 (Eb4)
const PAD_CONFIG: { id: string, key: string, midi: number }[] = [];
const BASE_MIDI = 48;
// ROWS/COLS constants removed to fix unused variable error

// Generate Config
for (let r = 3; r >= 0; r--) {
  for (let c = 1; c <= 4; c++) {
    // Pad Number 1-16
    const padNum = (r * 4) + c;
    const midiNote = BASE_MIDI + (padNum - 1);

    // Simple QWERTY mapping
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

    // 4. MIDI
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
    btn.textContent = pad.id.replace('pad', '');

    if (pad.key) {
      const hint = document.createElement('span');
      hint.className = 'key-hint';
      hint.textContent = pad.key.toUpperCase();
      btn.appendChild(hint);
    }

    // Touch/Click Events
    const trigger = (e: Event) => {
      e.preventDefault(); // Prevent ghost clicks
      triggerVoice(pad.id);
    };

    btn.addEventListener('touchstart', trigger);
    btn.addEventListener('mousedown', trigger);

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

// --- Inputs ---
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
