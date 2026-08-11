(function() {
    const manifest = {
        name: "mem-gc-bench",
        version: "1.0.0",
        description: "GC pause detection and measurement",
        category: "memory",
        minimum_firmware: "9.00",
        maximum_firmware: "99.99",
        required_capabilities: [],
        estimated_duration_ms: 10000
    };

    async function run(opts) {
        const timeout_ms = opts.timeout_ms || 10000;
        const start_time = performance.now();
        
        let results = {
            status: "AVAILABLE",
            max_pause_ms: 0,
            average_pause_ms: 0,
            pauses: [],
            total_time_ms: 0
        };

        try {
            let last_time = performance.now();
            let garbage = [];
            let pauses = [];
            
            while (performance.now() - start_time < timeout_ms) {
                for (let i = 0; i < 1000; i++) {
                    garbage.push(new Array(100).fill(Math.random()));
                }
                
                if (garbage.length > 50000) {
                    garbage = []; // Drop reference to trigger GC
                }
                
                const now = performance.now();
                const delta = now - last_time;
                
                // If delta is larger than 5ms, consider it a pause
                if (delta > 5) {
                    pauses.push(delta);
                }
                
                last_time = now;
                
                // Allow event loop to tick so we don't just hang the browser
                await new Promise(resolve => setTimeout(resolve, 0));
                last_time = performance.now(); // reset last time after async yield
            }
            
            if (pauses.length > 0) {
                results.max_pause_ms = Math.max(...pauses);
                results.average_pause_ms = pauses.reduce((a, b) => a + b, 0) / pauses.length;
                results.pauses = pauses;
            }
            results.total_time_ms = performance.now() - start_time;
            
        } catch (e) {
            results.status = "FAILED";
            results.error = e.toString();
        }

        return results;
    }

    if (typeof DSResearch !== 'undefined') {
        DSResearch.register(manifest, run);
    }
})();
