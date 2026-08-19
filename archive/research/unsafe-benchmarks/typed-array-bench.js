(function() {
    const manifest = {
        name: "mem-typed-array-bench",
        version: "1.0.0",
        description: "Typed array read/write throughput",
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
            write_mbps: 0,
            read_mbps: 0,
            total_time_ms: 0
        };

        try {
            const size = 1024 * 1024 * 10; // 10 MB
            const buffer = new ArrayBuffer(size);
            const view = new Uint32Array(buffer);
            const length = view.length;
            
            let write_ops = 0;
            const write_start = performance.now();
            while (performance.now() - write_start < (timeout_ms / 2)) {
                for (let i = 0; i < length; i++) {
                    view[i] = i;
                }
                write_ops++;
            }
            const write_end = performance.now();
            
            let read_ops = 0;
            let sum = 0;
            const read_start = performance.now();
            while (performance.now() - read_start < (timeout_ms / 2)) {
                for (let i = 0; i < length; i++) {
                    sum += view[i];
                }
                read_ops++;
            }
            const read_end = performance.now();

            const write_time_s = (write_end - write_start) / 1000;
            const read_time_s = (read_end - read_start) / 1000;
            
            results.write_mbps = write_time_s > 0 ? (write_ops * 10) / write_time_s : 0;
            results.read_mbps = read_time_s > 0 ? (read_ops * 10) / read_time_s : 0;
            results.dummy_sum = sum; // prevent optimization
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
