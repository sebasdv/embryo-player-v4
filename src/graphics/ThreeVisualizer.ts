import * as THREE from 'three';
// EffectComposer/RenderPass removed unused imports

export class ThreeVisualizer {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    // composer removed

    // Waveforms
    // Waveforms & Grid
    private lines: THREE.Line[] = [];
    private geometries: THREE.BufferGeometry[] = [];
    private numPoints = 128; // Reduced for performance with more lines
    private numWaves = 16;
    private gridCols = 4;
    private gridRows = 4;

    // Physics (Springs)
    private springs: { position: number, velocity: number, target: number }[] = [];

    private animationFrameId: number | null = null;

    // Data Source
    private dataProvider: (() => Float32Array[]) | null = null;

    constructor() {
        this.scene = new THREE.Scene();
        // Camera setup for 3D perspective of the grid
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);

        // Setup Renderer
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true
        });
        this.renderer.setSize(300, 150);
        this.renderer.setPixelRatio(window.devicePixelRatio);

        // Position Camera to view the 4x4 grid centered
        this.camera.position.set(0, 0, 7);
        this.camera.lookAt(0, 0, 0);

        this.initWaveforms();
    }

    private initWaveforms() {
        // Grid Spacing
        const spacingX = 2.5;
        const spacingY = 2.0;
        const startX = -((this.gridCols - 1) * spacingX) / 2;
        const startY = ((this.gridRows - 1) * spacingY) / 2;

        for (let i = 0; i < this.numWaves; i++) {
            // Physics Init
            this.springs.push({ position: 0, velocity: 0, target: 0 });

            const geometry = new THREE.BufferGeometry();
            const positions = new Float32Array(this.numPoints * 3);

            // Init straight line
            for (let j = 0; j < this.numPoints; j++) {
                // Local X from -1 to 1
                const x = (j / (this.numPoints - 1)) * 2 - 1;
                positions[j * 3] = x;
                positions[j * 3 + 1] = 0;
                positions[j * 3 + 2] = 0;
            }

            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

            // Material - Technical Black
            const material = new THREE.LineBasicMaterial({
                color: 0x000000,
                transparent: true,
                opacity: 0.8,
                linewidth: 2
            });

            const line = new THREE.Line(geometry, material);

            // Grid Positioning
            const row = Math.floor(i / this.gridCols); // 0..3
            const col = i % this.gridCols;             // 0..3

            // Invert Row so 0 is top
            const visualRow = row;

            line.position.x = startX + (col * spacingX);
            // Flip Y so first pads are at top, or bottom?
            // Usually Pad 1 (Index 0) is bottom-left (MPC style) or top-left.
            // Let's assume standard reading order 0=TopLeft.
            line.position.y = startY - (visualRow * spacingY);
            line.position.z = 0;

            this.scene.add(line);
            this.lines.push(line);
            this.geometries.push(geometry);
        }
    }

    init(canvas: HTMLCanvasElement) {
        // Bind to existing canvas
        this.renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            antialias: true,
            alpha: true
        });

        const width = canvas.parentElement?.clientWidth || 300;
        const height = canvas.parentElement?.clientHeight || 150;

        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(window.devicePixelRatio);

        this.resize(width, height);
    }

    setDataProvider(provider: () => Float32Array[]) {
        this.dataProvider = provider;
    }

    // Trigger visual spring
    trigger(index: number, velocity: number = 1.0) {
        if (index >= 0 && index < this.springs.length) {
            // Kick the spring velocity
            this.springs[index].velocity += 0.3 * velocity;
            // Also brighten or thicken? (Optional logic/material update could go here)
        }
    }

    start() {
        if (!this.animationFrameId) {
            this.animate();
        }
    }

    stop() {
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    private effectParams = { distortion: 0, filter: 100 };

    setEffects(distortion: number, filter: number) {
        this.effectParams.distortion = distortion;
        this.effectParams.filter = filter;
    }

    private animate = () => {
        this.animationFrameId = requestAnimationFrame(this.animate);
        this.updateWaveforms();
        this.renderer.render(this.scene, this.camera);
    }

    private updateWaveforms() {
        if (!this.dataProvider) return;

        const waves = this.dataProvider(); // Expecting 16 arrays
        const { distortion } = this.effectParams;
        const distGain = 1.0 + (distortion / 10);

        // Physics Constants
        const tension = 0.2;
        const damping = 0.85;

        for (let i = 0; i < this.numWaves; i++) {
            // 1. Update Spring Physics
            const spring = this.springs[i];
            const force = (spring.target - spring.position) * tension;
            spring.velocity += force;
            spring.velocity *= damping;
            spring.position += spring.velocity;

            // Directionality: Even = Up (1), Odd = Down (-1)
            const direction = (i % 2 === 0) ? 1 : -1;

            // Apply "Kick" to Position Y
            // Base Position calculation (should be cached or recalculated)
            const spacingY = 2.0;
            const startY = ((this.gridRows - 1) * spacingY) / 2;
            const row = Math.floor(i / this.gridCols);
            const baseY = startY - (row * spacingY);

            // Add spring displacement
            // spring.position is roughly 0.0 to ~1.0 when hit
            const displacement = spring.position * 0.8 * direction;
            this.lines[i].position.y = baseY + displacement;

            // Apply "Kick" scale
            const scaleFactor = 1.0 + (spring.position * 1.0);
            this.lines[i].scale.setScalar(Math.max(0.5, scaleFactor));

            // Rotation for flavor
            this.lines[i].rotation.z = spring.position * 0.1 * direction;


            // 2. Update Waveform Geometry
            const waveData = waves[i];
            if (!waveData) continue;

            const positionAttribute = this.geometries[i].getAttribute('position');
            const positions = positionAttribute.array as Float32Array;

            for (let j = 0; j < this.numPoints; j++) {
                let val = waveData[j] || 0;

                // Apply Gain/Clip
                val = val * distGain;
                if (distortion > 10) val = Math.tanh(val);

                // Apply Direction & Scale to the waveform itself too
                positions[j * 3 + 1] = val * direction * 1.5;
            }

            positionAttribute.needsUpdate = true;
        }
    }

    resize(width: number, height: number) {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }
}
