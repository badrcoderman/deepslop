(function() {
    const manifest = {
        name: "mem-arraybuffer-bench",
        version: "1.0.0",
        description: "ArrayBuffer transfers and cloning",
        category: "memory",
        minimum_firmware: "9.00",
        maximum_firmware: "99.99",
        required_capabilities: [],
        estimated_duration_ms: 5000
    };

    async function run(opts) {
        const timeout_ms = opts.timeout_ms || 5000;
        const start_time = performance.now();
        
        let results = {
            status: "AVAILABLE",
            slice_mbps: 0,
            message_channel_mbps: 0,
            total_time_ms: 0
        };

        try {
            const size = 1024 * 1024 * 1; // 1 MB
            const original = new ArrayBuffer(size);
            new Uint8Array(original).fill(0x41);
            
            let slice_ops = 0;
            const slice_start = performance.now();
            while (performance.now() - slice_start < (timeout_ms / 2)) {
                let copy = original.slice(0);
                slice_ops++;
            }
            const slice_end = performance.now();
            
            // Check MessageChannel for structured clone performance
            let channel_ops = 0;
            if (typeof MessageChannel !== 'undefined') {
                const channel_start = performance.now();
                while (performance.now() - channel_start < (timeout_ms / 2)) {
                    // synchronous clone estimation since MessagePort is async
                    // we can use structuredClone if available, otherwise fallback
                    if (typeof structuredClone !== 'undefined') {
                        let copy = structuredClone(original);
                        channel_ops++;
                    } else {
                        results.message_channel_mbps = "NOT_AVAILABLE";
                        break;
                    }
                }
                const channel_end = performance.now();
                if (typeof structuredClone !== 'undefined') {
                    const channel_time_s = (channel_end - channel_start) / 1000;
                    results.message_channel_mbps = channel_time_s > 0 ? (channel_ops * 1) / channel_time_s : 0;
                }
            }

            const slice_time_s = (slice_end - slice_start) / 1000;
            results.slice_mbps = slice_time_s > 0 ? (slice_ops * 1) / slice_time_s : 0;
            
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
