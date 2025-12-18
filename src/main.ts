import './style.css'
import { AudioManager } from './audio/AudioManager'
import { ThreeVisualizer } from './graphics/ThreeVisualizer'
import { MidiManager } from './audio/MidiManager'
import { PersistenceManager } from './system/PersistenceManager'

// --- Simplified HTML Structure ---
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div class="main-frame">
    <div id="start-overlay" style="display: flex; flex-direction: column; height: 100%; justify-content: center; align-items: center; cursor: pointer; user-select: none;">
        <h1 style="font-family: inherit;">CLICK TO START</h1>
    </div>
  </div>
`;

// --- Systems ---
const audioManager = new AudioManager();
const visualizer = new ThreeVisualizer(); // Kept for future use, not attached to canvas yet
console.log('[System] Visualizer loaded', visualizer);
const midiManager = new MidiManager();
const persistence = new PersistenceManager();

// --- Initialization ---
const startOverlay = document.querySelector('#start-overlay') as HTMLDivElement;

let isInitialized = false;

startOverlay.addEventListener('click', async () => {
  if (isInitialized) return;

  startOverlay.innerHTML = '<h1>INITIALIZING...</h1>';

  try {
    console.log('[System] Starting initialization...');

    // 1. Persistence
    await persistence.init();

    // 2. Audio (Requires user gesture, which we have)
    await audioManager.init();

    // 3. MIDI (Optional, don't block hard)
    try {
      await midiManager.init();
      midiManager.setNoteOnCallback((note, velocity) => {
        console.log(`[MIDI] Note On: ${note} v${velocity}`);
        // Simple debug triggering
        // audioManager.playNote(note, velocity); // If supported in future
      });
    } catch (err) {
      console.warn('[System] MIDI Init failed or timed out', err);
    }

    isInitialized = true;
    startOverlay.innerHTML = '<h1>SYSTEM READY</h1><p style="margin-top:10px; font-size: 0.8em;">Waiting for components...</p>';
    console.log('[System] Ready.');

  } catch (err) {
    console.error('[System] Initialization Error:', err);
    startOverlay.innerHTML = '<h1>ERROR</h1>';
  }
});
