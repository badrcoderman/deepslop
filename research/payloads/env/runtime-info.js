(function() {
    const manifest = {
        name: "env-runtime-info",
        version: "1.0.0",
        description: "JSC/WebKit runtime properties and engine detection",
        category: "environment",
        minimum_firmware: "9.00",
        maximum_firmware: "99.99",
        required_capabilities: [],
        estimated_duration_ms: 100
    };

    function getWebGLInfo() {
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (gl) {
                const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                return {
                    vendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
                    renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
                    version: gl.getParameter(gl.VERSION),
                    shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION)
                };
            }
        } catch (e) {
            // Ignored
        }
        return null;
    }

    async function run(opts) {
        try {
            const runtimeInfo = {
                status: "AVAILABLE",
                javascript: {
                    hasBigInt: typeof BigInt !== 'undefined',
                    hasWebAssembly: typeof WebAssembly !== 'undefined',
                    hasSharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
                    hasAtomics: typeof Atomics !== 'undefined',
                    hasProxy: typeof Proxy !== 'undefined',
                    hasReflect: typeof Reflect !== 'undefined',
                    hasWeakRef: typeof WeakRef !== 'undefined',
                    hasPromise: typeof Promise !== 'undefined',
                    hasAsyncAwait: false
                },
                engine: {
                    isWebKit: 'webkitAppearance' in document.documentElement.style,
                    isGecko: 'MozAppearance' in document.documentElement.style,
                    isBlink: 'chrome' in window && !('opera' in window)
                },
                webgl: getWebGLInfo()
            };

            // Test async/await syntax support via Function constructor
            try {
                new Function('async function test() {}');
                runtimeInfo.javascript.hasAsyncAwait = true;
            } catch (e) {
                runtimeInfo.javascript.hasAsyncAwait = false;
            }

            return runtimeInfo;
        } catch (e) {
            if (typeof DSResearch !== 'undefined' && DSResearch.log) {
                DSResearch.log("env-runtime-info failed: " + e.message);
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
