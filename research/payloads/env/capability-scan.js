(function() {
    const manifest = {
        name: "env-capability-scan",
        version: "1.0.0",
        description: "Exhaustive API availability test",
        category: "environment",
        minimum_firmware: "9.00",
        maximum_firmware: "99.99",
        required_capabilities: [],
        estimated_duration_ms: 500
    };

    async function run(opts) {
        try {
            const apisToCheck = [
                'fetch',
                'indexedDB',
                'Worker',
                'SharedWorker',
                'ServiceWorker',
                'WebSocket',
                'WebRTC',
                'RTCPeerConnection',
                'AudioContext',
                'webkitAudioContext',
                'OffscreenCanvas',
                'requestAnimationFrame',
                'IntersectionObserver',
                'MutationObserver',
                'ResizeObserver',
                'PerformanceObserver',
                'navigator.geolocation',
                'navigator.credentials',
                'navigator.bluetooth',
                'navigator.usb',
                'navigator.clipboard',
                'navigator.mediaCapabilities',
                'navigator.mediaDevices',
                'navigator.serviceWorker',
                'navigator.storage',
                'navigator.wakeLock',
                'navigator.hid',
                'navigator.serial',
                'navigator.gpu',
                'crypto.subtle'
            ];

            const capabilities = {};
            let totalAvailable = 0;

            for (const api of apisToCheck) {
                let available = false;
                try {
                    const parts = api.split('.');
                    let current = window;
                    for (const part of parts) {
                        current = current[part];
                        if (current === undefined || current === null) {
                            break;
                        }
                    }
                    available = (current !== undefined && current !== null);
                } catch (e) {
                    available = false;
                }
                capabilities[api] = available;
                if (available) totalAvailable++;
            }

            return {
                status: "AVAILABLE",
                totalAvailable: totalAvailable,
                capabilities: capabilities
            };
        } catch (e) {
            if (typeof DSResearch !== 'undefined' && DSResearch.log) {
                DSResearch.log("env-capability-scan failed: " + e.message);
            }
            return {
                status: "FAILED",
                error: e.message
            };
        }
    }

    if (typeof DSResearch !== 'undefined') {
        DSResearch.register(manifest, run);
    }
})();
