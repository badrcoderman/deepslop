(function() {
    const manifest = {
        name: "mem-alloc-bench",
        version: "1.0.0",
        description: "Allocation throughput across sizes",
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
            allocations: {},
            total_time_ms: 0
        };

        const sizes = [16, 64, 256, 1024, 4096, 16384, 65536];
        const iterations = opts.runs || 10000;

        try {
            for (const size of sizes) {
                if (performance.now() - start_time > timeout_ms) {
                    break;
                }

                const iter_start = performance.now();
                let keep_alive = [];
                for (let i = 0; i < iterations; i++) {
                    let arr = new Uint8Array(size);
                    if (i % 100 === 0) keep_alive.push(arr);
                }
                const iter_end = performance.now();
                
                results.allocations[`size_${size}`] = {
                    time_ms: iter_end - iter_start,
                    ops_per_sec: (iterations / (iter_end - iter_start)) * 1000
                };
                
                keep_alive = null;
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
