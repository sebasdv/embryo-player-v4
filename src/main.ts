import './style.css'
import { AudioManager } from './audio/AudioManager'
import { ThreeVisualizer } from './graphics/ThreeVisualizer'
import { MidiManager } from './audio/MidiManager'
import { PersistenceManager } from './system/PersistenceManager'

// --- Simplified HTML Structure ---
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
        <div class="ui-controls" id="controls-container">
            <!-- Pads will go here -->
            <span style="opacity: 0.3; align-self: center; margin-top: auto; margin-bottom: auto;">CONTROLS AREA</span>
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

// --- Initialization ---
const startOverlay = document.querySelector('#start-overlay') as HTMLDivElement;
const mainInterface = document.querySelector('#main-interface') as HTMLDivElement;
const statusIndicator = document.querySelector('#status-indicator') as HTMLDivElement;
const bpmDisplay = document.querySelector('#bpm-display') as HTMLSpanElement;

let isInitialized = false;

startOverlay.addEventListener('click', async () => {
  if (isInitialized) return;

  startOverlay.innerHTML = '<h1>INITIALIZING...</h1>';

  try {
    console.log('[System] Starting initialization...');

    // 1. Persistence
    await persistence.init();

    // 2. Audio (Requires user gesture)
    await audioManager.init();
    audioManager.setBpm(currentBpm);

    // 3. MIDI
    try {
      await midiManager.init();
      midiManager.setNoteOnCallback((note, velocity) => {
        console.log(`[MIDI] Note On: ${note} v${velocity}`);
      });
      statusIndicator.textContent = "AUDIO + MIDI";
    } catch (err) {
      console.warn('[System] MIDI Init failed or timed out', err);
      statusIndicator.textContent = "AUDIO ONLY";
    }

    isInitialized = true;

    // Transition UI
    startOverlay.style.display = 'none';
    mainInterface.style.display = 'flex';

    console.log('[System] Ready.');

    // Setup BPM Controls
    setupBpmControls();

  } catch (err) {
    console.error('[System] Initialization Error:', err);
    startOverlay.innerHTML = '<h1>ERROR</h1><p>See Console</p>';
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

    // Visual feedback
    if (statusIndicator) {
      statusIndicator.textContent = `BPM ${currentBpm}`;
      setTimeout(() => statusIndicator.textContent = isInitialized ? "Active" : "Ready", 1000);
    }
  };

  btnMinus.addEventListener('click', () => updateBpm(-1));
  btnPlus.addEventListener('click', () => updateBpm(1));
}
