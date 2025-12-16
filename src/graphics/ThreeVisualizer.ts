import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

export class ThreeVisualizer {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private composer: EffectComposer | null = null;

    // Waveforms
    private lines: THREE.Line[] = [];
    private geometries: THREE.BufferGeometry[] = [];
    private numPoints = 512;
    private numWaves = 4;

    // private container: HTMLElement | null = null; // Unused
    // private animationFrameId: number | null = null; // Unused but used in animate... actually used in animate!
    private animationFrameId: number | null = null; // Used in animate

    // Data Source
    private dataProvider: (() => Float32Array[]) | null = null;

    constructor() {
        this.scene = new THREE.Scene();
        // Fog for depth
        this.scene.fog = new THREE.FogExp2(0x000000, 0.1);

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

        // Setup Renderer
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true // Transparent background to let CSS bg show through
        });
        this.renderer.setSize(800, 600); // Default, will resize
        this.renderer.setPixelRatio(window.devicePixelRatio);

        // Camera Position
        this.camera.position.z = 5;
        this.camera.position.y = 0;
        this.camera.lookAt(0, 0, 0);

        this.initWaveforms();
    }

    private initWaveforms() {
        // Create 4 lines
        for (let i = 0; i < this.numWaves; i++) {
            const geometry = new THREE.BufferGeometry();
            const positions = new Float32Array(this.numPoints * 3);

            // Init positions (Line flat on X axis)
            for (let j = 0; j < this.numPoints; j++) {
                const x = (j / (this.numPoints - 1)) * 10 - 5; // -5 to 5
                positions[j * 3] = x;
                positions[j * 3 + 1] = 0;
                positions[j * 3 + 2] = 0;
            }

            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

            // Material - Neon Green
            // Vary opacity/brightness slightly per line
            const material = new THREE.LineBasicMaterial({
                color: 0x9bf00b, // Retro Green
                transparent: true,
                opacity: 0.8 - (i * 0.15),
                linewidth: 2 // Note: WebGL linewidth often ignored by browsers, always 1
            });

            const line = new THREE.Line(geometry, material);

            // Positioning them in 3D space
            // Stacking them vertically or in depth?
            // Let's stack them vertically like the 2D one first, but with 3D tilt
            line.position.y = 1.5 - (i * 1.0); // 1.5, 0.5, -0.5, -1.5

            // slight rotation for 3D feel
            line.rotation.x = 0.1;

            this.scene.add(line);
            this.lines.push(line);
            this.geometries.push(geometry);
        }

        // Add a "Grid" or "Floor" for retro feel?
        const gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x222222);
        gridHelper.position.y = -3;
        gridHelper.rotation.x = 0.1;
        this.scene.add(gridHelper);
    }

    init(canvas: HTMLCanvasElement) {
        this.renderer.domElement.remove(); // Remove old if any

        // Re-create renderer with specific canvas
        this.renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            antialias: true,
            alpha: true
        });
        this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);

        // --- POST PROCESSING ---
        this.composer = new EffectComposer(this.renderer);

        const renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(renderPass);

        // Resolution, Strength, Radius, Threshold
        const bloomPass = new UnrealBloomPass(
            new THREE.Vector2(canvas.clientWidth, canvas.clientHeight),
            1.5, // Strength (Glow intensity)
            0.4, // Radius
            0.0 // Threshold (0 = glow everything)
        );
        this.composer.addPass(bloomPass);
    }

    setDataProvider(provider: () => Float32Array[]) {
        this.dataProvider = provider;
    }

    start() {
        this.animate();
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

        // Pendular rotation (Oscillate smoother: slower speed, smaller angle)
        this.scene.rotation.y = Math.sin(Date.now() * 0.0005) * 0.15;

        // Render via Composer (includes Bloom)
        if (this.composer) {
            this.composer.render();
        } else {
            this.renderer.render(this.scene, this.camera);
        }
    }

    private updateWaveforms() {
        if (!this.dataProvider) return;

        const waves = this.dataProvider(); // Expecting 4 arrays
        const { distortion, filter } = this.effectParams;

        // Filter coeff (Simple one-pole)
        // filter 0-100 -> alpha 0.05 - 1.0
        const alpha = Math.max(0.05, Math.pow(filter / 100, 2));

        // Distortion mult
        // dist 0-100 -> gain 1.0 - 10.0
        const distGain = 1.0 + (distortion / 10);

        for (let i = 0; i < this.numWaves; i++) {
            const waveData = waves[i];
            if (!waveData) continue;

            const positionAttribute = this.geometries[i].getAttribute('position');
            const positions = positionAttribute.array as Float32Array;

            let prevVal = 0;

            // Update Y values
            for (let j = 0; j < this.numPoints; j++) {
                // positions[j * 3] is X (constant)
                // positions[j * 3 + 1] is Y (amplitude)

                let val = waveData[j] || 0;

                // 1. Apply Distortion Visual (Hard Clip/Boost)
                val = val * distGain;
                if (distortion > 10) {
                    // Soft clip look
                    val = Math.tanh(val);
                }

                val = val * alpha + prevVal * (1.0 - alpha);
                prevVal = val;

                // Smooth / Scale for Display
                positions[j * 3 + 1] = val * 2.5;
            }

            positionAttribute.needsUpdate = true;
        }
    }

    resize(width: number, height: number) {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
        this.composer?.setSize(width, height);
    }
}
