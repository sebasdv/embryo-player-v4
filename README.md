# Embryo Player v4

Step into the future of browser-based music creation. **Embryo Player v4** is a 16-pad sampler and sequencer featuring a high-fidelity 3D audio visualizer.

## Features

### 🎹 16-Pad Sampler
- **MPC-style Layout:** 4x4 grid max ergonomic efficiency.
- **Custom Samples:** Drag & drop your own audio, or load entire kits via the `[LOAD]` button.
- **Persistence:** All your samples and settings are saved automatically using IndexedDB. Reload the page and pick up where you left off.

### 🎤 Smart Mic Recording
- **Zero-Latency Capture:** Pre-check permission logic ensuring instant recording when you hit the pad.
- **Auto-Save:** Recordings are persisted to the local database.
- **Visual Feedback:** 3-second countdown and clear status indicators.

### 🌌 3D Reactive Visualizer
- **Neon Aesthetic:** High-contrast, retro-futuristic visuals.
- **Three.js Engine:** Real-time 3D rendering.
- **Reactive Particles:** 2000-point starfield that pulses with the beat.
- **Post-Processing:** UnrealBloom for that deep, glowing atmosphere.

### 🎛️ Audio Engine
- **Effects:** Distortion and Low-Pass Filter sliders.
- **Master Control:** Global volume and BPM management.
- **Audio Worklet:** Low-latency audio processing.

## Setup & Running

This project uses [Vite](https://vitejs.dev/) for lightning-fast development.

1.  **Install Dependencies:**
    ```bash
    npm install
    ```

2.  **Run Development Server:**
    ```bash
    npm run dev
    ```

3.  **Build for Production:**
    ```bash
    npm run build
    ```

## Tech Stack
- **TypeScript**
- **Three.js**
- **Web Audio API (AudioWorklet)**
- **IndexedDB**
- **Vite**

---
*Created with the help of Antigravity AI.*
