export class ConstraintManager {
    private targetWidth: number = 375;
    private targetHeight: number = 667; // standard mobile reference
    private container: HTMLElement;

    constructor(containerId: string) {
        const el = document.getElementById(containerId);
        if (!el) throw new Error(`Container ${containerId} not found`);
        this.container = el;

        // Initial setup
        this.container.style.transformOrigin = 'center center';
        this.container.style.position = 'absolute';

        // Listen
        window.addEventListener('resize', this.handleResize);

        // Trigger
        this.handleResize();
    }

    private handleResize = () => {
        // Get actual available space
        const availW = window.innerWidth;
        const availH = window.innerHeight;

        // Calculate scale
        // We want to CONTAIN the target within available space
        const scaleW = availW / this.targetWidth;
        const scaleH = availH / this.targetHeight;

        // Use the smaller scale to ensure it fits both dimensions (Contain)
        const scale = Math.min(scaleW, scaleH);

        // Apply
        // We also need to center it manually if we are doing absolute positioning
        // But flexbox center on body is easier. Let's assume body centers it.
        // We just scale the container.

        this.container.style.width = `${this.targetWidth}px`;
        this.container.style.height = `${this.targetHeight}px`;
        this.container.style.transform = `scale(${scale})`;

        // Log for debug
        console.log(`[Constraint] Scale: ${scale.toFixed(3)} | Window: ${availW}x${availH}`);
    }
}
