(function() {
    const manifest = {
        name: "proc-event-loop",
        version: "1.0.0",
        description: "Microtask vs macrotask latency",
        category: "process",
        minimum_firmware: "9.00",
        maximum_firmware: "99.99",
        required_capabilities: [],
        estimated_duration_ms: 5000
    };

    async function run(opts) {
        const timeout = opts.timeout_ms || 30000;
        const runs = opts.runs || 100;
        let microtaskLatencies = [];
        let macrotaskLatencies = [];
        
        try {
            // Measure microtask latency (Promise.resolve)
            for (let i = 0; i < runs; i++) {
                const start = performance.now();
                await Promise.resolve();
                microtaskLatencies.push(performance.now() - start);
            }
            
            // Measure macrotask latency (setTimeout)
            for (let i = 0; i < runs; i++) {
                const start = performance.now();
                await new Promise(resolve => setTimeout(resolve, 0));
                macrotaskLatencies.push(performance.now() - start);
            }
            
            const avgMicrotask = microtaskLatencies.reduce((a, b) => a + b, 0) / runs;
            const avgMacrotask = macrotaskLatencies.reduce((a, b) => a + b, 0) / runs;
            
            return {
                status: "AVAILABLE",
                microtask_avg_ms: avgMicrotask,
                macrotask_avg_ms: avgMacrotask,
                runs: runs
            };
        } catch (e) {
            if (typeof DSResearch !== 'undefined' && DSResearch.log) {
                DSResearch.log("proc-event-loop error: " + e.message);
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
