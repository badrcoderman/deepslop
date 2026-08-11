(function() {
    const manifest = {
        name: "wk-jsc-bench",
        version: "1.0.0",
        description: "JSC JS micro-benchmarks",
        category: "webkit",
        minimum_firmware: "9.00",
        maximum_firmware: "99.99",
        required_capabilities: [],
        estimated_duration_ms: 15000
    };

    async function run(opts) {
        const timeout = opts.timeout_ms || 30000;
        const start = performance.now();
        
        let intScore = 0;
        let floatScore = 0;
        let objScore = 0;
        let stringScore = 0;

        try {
            // Integer math loop
            let sum = 0;
            const intStart = performance.now();
            for (let i = 0; i < 10000000; i++) {
                sum = (sum + i) | 0;
            }
            intScore = performance.now() - intStart;

            // Float math loop
            let fSum = 0.0;
            const floatStart = performance.now();
            for (let i = 0; i < 5000000; i++) {
                fSum += Math.sqrt(i) * Math.sin(i);
            }
            floatScore = performance.now() - floatStart;

            // Object allocation/property access
            const objStart = performance.now();
            const arr = new Array(100000);
            for (let i = 0; i < 100000; i++) {
                arr[i] = { id: i, val: i * 2 };
            }
            let sumProps = 0;
            for (let i = 0; i < 100000; i++) {
                sumProps += arr[i].val;
            }
            objScore = performance.now() - objStart;

            // String manipulation
            const strStart = performance.now();
            let str = "";
            for (let i = 0; i < 10000; i++) {
                str += "test" + i;
            }
            let idx = str.indexOf("test9999");
            stringScore = performance.now() - strStart;

            return {
                status: "AVAILABLE",
                total_time_ms: performance.now() - start,
                results: {
                    int_loop_ms: intScore,
                    float_loop_ms: floatScore,
                    object_loop_ms: objScore,
                    string_loop_ms: stringScore,
                    dummy_val: sum + fSum + sumProps + idx
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
