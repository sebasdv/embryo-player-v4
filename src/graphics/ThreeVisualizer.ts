import * as THREE from 'three';
// EffectComposer/RenderPass removed unused imports

export class ThreeVisualizer {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    // composer removed

    // Waveforms
    private lines: THREE.Line[] = [];
    private geometries: THREE.BufferGeometry[] = [];
    private numPoints = 512;
    private numWaves = 4;

    private animationFrameId: number | null = null;

    // Data Source
    private dataProvider: (() => Float32Array[]) | null = null;

    constructor() {
        this.scene = new THREE.Scene();
        // No Fog

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

        // Setup Renderer
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true
        });
        this.renderer.setSize(300, 150);
        this.renderer.setPixelRatio(window.devicePixelRatio);

        // Camera Position
        this.camera.position.z = 5;
        this.camera.position.y = 0;
        this.camera.lookAt(0, 0, 0);

        this.initWaveforms();
    }

    private initWaveforms() {
        for (let i = 0; i < this.numWaves; i++) {
            const geometry = new THREE.BufferGeometry();
            const positions = new Float32Array(this.numPoints * 3);

            for (let j = 0; j < this.numPoints; j++) {
                const x = (j / (this.numPoints - 1)) * 10 - 5;
                positions[j * 3] = x;
                positions[j * 3 + 1] = 0;
                positions[j * 3 + 2] = 0;
            }

            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

            // Material - PURE BLACK
            const material = new THREE.LineBasicMaterial({
                color: 0x000000,
                transparent: true,
                opacity: 0.9 - (i * 0.15),
                linewidth: 2
            });

            const line = new THREE.Line(geometry, material);
            line.position.y = 1.5 - (i * 1.0);
            line.rotation.x = 0.05;

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

        // Subtle idle motion
        this.scene.rotation.y = Math.sin(Date.now() * 0.0002) * 0.05;

        this.renderer.render(this.scene, this.camera);
    }

    private updateWaveforms() {
        if (!this.dataProvider) return;

        const waves = this.dataProvider();
        const { distortion, filter } = this.effectParams;

        const alpha = Math.max(0.05, Math.pow(filter / 100, 2));
        const distGain = 1.0 + (distortion / 10);

        for (let i = 0; i < this.numWaves; i++) {
            const waveData = waves[i];
            if (!waveData) continue;

            const positionAttribute = this.geometries[i].getAttribute('position');
            const positions = positionAttribute.array as Float32Array;

            let prevVal = 0;

            for (let j = 0; j < this.numPoints; j++) {
                // positions[j * 3] is X
                let val = waveData[j] || 0;

                // Apply Gain/Clip
                val = val * distGain;
                if (distortion > 10) val = Math.tanh(val);

                // Filter smoothing
                val = val * alpha + prevVal * (1.0 - alpha);
                prevVal = val;

                // Scale Y
                positions[j * 3 + 1] = val * 3.0;
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
