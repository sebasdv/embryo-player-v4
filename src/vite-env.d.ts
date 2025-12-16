/// <reference types="@webgpu/types" />

declare class AudioWorkletProcessor {
    constructor(options?: any);
    readonly port: MessagePort;
    process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
}

declare function registerProcessor(name: string, processorCtor: (new (options?: any) => AudioWorkletProcessor)): void;
