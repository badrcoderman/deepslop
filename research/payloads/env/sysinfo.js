(function() {
    const manifest = {
        name: "env-sysinfo",
        version: "1.0.0",
        description: "System information, UA, hardware concurrency, memory",
        category: "environment",
        minimum_firmware: "9.00",
        maximum_firmware: "99.99",
        required_capabilities: [],
        estimated_duration_ms: 100
    };

    async function run(opts) {
        try {
            const result = {
                status: "AVAILABLE",
                userAgent: navigator.userAgent,
                platform: navigator.platform,
                language: navigator.language,
                vendor: navigator.vendor,
                hardwareConcurrency: navigator.hardwareConcurrency || null,
                deviceMemory: navigator.deviceMemory || null,
                screen: {
                    width: window.screen ? window.screen.width : null,
                    height: window.screen ? window.screen.height : null,
                    colorDepth: window.screen ? window.screen.colorDepth : null,
                    pixelDepth: window.screen ? window.screen.pixelDepth : null,
                    availWidth: window.screen ? window.screen.availWidth : null,
                    availHeight: window.screen ? window.screen.availHeight : null
                },
                timezoneOffset: new Date().getTimezoneOffset(),
                cookieEnabled: navigator.cookieEnabled
            };
            return result;
        } catch (e) {
            if (typeof DSResearch !== 'undefined' && DSResearch.log) {
                DSResearch.log("env-sysinfo failed: " + e.message);
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
