(function() {
    const manifest = {
        name: "wk-api-compat",
        version: "1.0.0",
        description: "Browser API instantiation testing",
        category: "webkit",
        minimum_firmware: "9.00",
        maximum_firmware: "99.99",
        required_capabilities: [],
        estimated_duration_ms: 1000
    };

    async function run(opts) {
        const start = performance.now();
        
        try {
            const apis = [
                "WebSocket", "Worker", "SharedWorker", "ServiceWorker",
                "WebAssembly", "AudioContext", "webkitAudioContext",
                "RTCDataChannel", "RTCPeerConnection", "MediaStream",
                "OffscreenCanvas", "IntersectionObserver", "MutationObserver",
                "ResizeObserver", "PerformanceObserver", "Crypto",
                "SubtleCrypto", "FileReader", "TextEncoder", "TextDecoder"
            ];
            
            const results = {};
            let availableCount = 0;
            
            for (const api of apis) {
                try {
                    if (typeof window !== 'undefined' && api in window) {
                        results[api] = true;
                        availableCount++;
                    } else if (typeof self !== 'undefined' && api in self) {
                        results[api] = true;
                        availableCount++;
                    } else {
                        results[api] = false;
                    }
                } catch (e) {
                    results[api] = "error";
                }
            }

            return {
                status: "AVAILABLE",
                total_time_ms: performance.now() - start,
                results: {
                    total_checked: apis.length,
                    available_count: availableCount,
                    apis: results
                }
            };
        } catch (e) {
            return {
                status: "FAILED",
                error: e.message,
                total_time_ms: performance.now() - start
            };
        }
    }

    if (typeof DSResearch !== 'undefined') {
        DSResearch.register(manifest, run);
    }
})();
