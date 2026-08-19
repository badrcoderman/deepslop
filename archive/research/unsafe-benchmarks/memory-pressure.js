(function() {
    const manifest = {
        name: "mem-pressure",
        version: "1.0.0",
        description: "Allocation ceiling to OOM",
        category: "memory",
        minimum_firmware: "9.00",
        maximum_firmware: "99.99",
        required_capabilities: [],
        estimated_duration_ms: 15000
    };

    async function run(opts) {
        const timeout_ms = opts.timeout_ms || 15000;
        const start_time = performance.now();
        
        let results = {
            status: "AVAILABLE",
            max_alloc_mb: 0,
            oom_hit: false,
            total_time_ms: 0
        };

        try {
            let keep_alive = [];
            let total_allocated = 0;
            const chunk_size = 1024 * 1024 * 10; // 10 MB per chunk
            
            try {
                while (performance.now() - start_time < timeout_ms) {
                    // Try to allocate
                    let chunk = new ArrayBuffer(chunk_size);
                    keep_alive.push(chunk);
                    total_allocated += 10; // MB
                    
                    if (total_allocated > 10000) {
                        // Hard limit to avoid completely locking the system if it has huge swap
                        break;
                    }
                    
                    // Yield occasionally to prevent total freeze
                    if (keep_alive.length % 10 === 0) {
                        await new Promise(resolve => setTimeout(resolve, 0));
                    }
                }
            } catch (oom) {
                results.oom_hit = true;
                results.error_message = oom.toString();
            }
            
            results.max_alloc_mb = total_allocated;
            
            // Clean up!
            keep_alive = null;
            
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
