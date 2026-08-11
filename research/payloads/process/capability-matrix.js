(function() {
    const manifest = {
        name: "proc-cap-matrix",
        version: "1.0.0",
        description: "Aggregate capability matrix",
        category: "process",
        minimum_firmware: "9.00",
        maximum_firmware: "99.99",
        required_capabilities: [],
        estimated_duration_ms: 1000
    };

    async function run(opts) {
        try {
            const matrix = {
                es6: {
                    promises: typeof Promise !== 'undefined',
                    bigint: typeof BigInt !== 'undefined',
                    arrow_functions: true, // If we parse this, it's supported
                    symbols: typeof Symbol !== 'undefined',
                    proxy: typeof Proxy !== 'undefined',
                    reflect: typeof Reflect !== 'undefined'
                },
                web: {
                    worker: typeof Worker !== 'undefined',
                    shared_array_buffer: typeof SharedArrayBuffer !== 'undefined',
                    atomics: typeof Atomics !== 'undefined',
                    wasm: typeof WebAssembly !== 'undefined',
                    indexeddb: typeof indexedDB !== 'undefined',
                    fetch: typeof fetch !== 'undefined',
                    websockets: typeof WebSocket !== 'undefined',
                    xmlhttprequest: typeof XMLHttpRequest !== 'undefined',
                    canvas: typeof HTMLCanvasElement !== 'undefined',
                    webgl: typeof WebGLRenderingContext !== 'undefined',
                    webrtc: typeof RTCPeerConnection !== 'undefined',
                    performance: typeof performance !== 'undefined'
                },
                gpu: {
                    webgl2: typeof WebGL2RenderingContext !== 'undefined',
                    webgpu: typeof navigator !== 'undefined' && 'gpu' in navigator
                },
                crypto: {
                    subtle: typeof crypto !== 'undefined' && !!crypto.subtle,
                    randomUUID: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                },
                storage: {
                    localStorage: typeof localStorage !== 'undefined',
                    sessionStorage: typeof sessionStorage !== 'undefined'
                },
                system: {
                    navigator: typeof navigator !== 'undefined',
                    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
                    hardwareConcurrency: typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : null,
                    deviceMemory: typeof navigator !== 'undefined' ? navigator.deviceMemory : null
                }
            };
            
            return {
                status: "AVAILABLE",
                matrix: matrix
            };
        } catch (e) {
            if (typeof DSResearch !== 'undefined' && DSResearch.log) {
                DSResearch.log("proc-cap-matrix error: " + e.message);
            }
            return {
                status: "FAILED",
                error: e.message
            };
        }
    }

    if (typeof DSResearch !== 'undefined' && DSResearch.register) {
        DSResearch.register(manifest, run);
    }
})();
