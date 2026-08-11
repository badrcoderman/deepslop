(function() {
    const manifest = {
        name: "env-clock-bench",
        version: "1.0.0",
        description: "Timer precision and stability",
        category: "environment",
        minimum_firmware: "9.00",
        maximum_firmware: "99.99",
        required_capabilities: [],
        estimated_duration_ms: 5000
    };

    function measurePerformanceNowResolution() {
        if (typeof performance === 'undefined' || !performance.now) return null;
        let last = performance.now();
        let current = last;
        const diffs = [];
        // Capture a few transitions to find the minimum non-zero difference
        for (let i = 0; i < 10000 && diffs.length < 50; i++) {
            current = performance.now();
            if (current !== last) {
                diffs.push(current - last);
                last = current;
            }
        }
        if (diffs.length === 0) return null;
        let minDiff = diffs[0];
        for (let i = 1; i < diffs.length; i++) {
            if (diffs[i] < minDiff && diffs[i] > 0) minDiff = diffs[i];
        }
        return minDiff;
    }

    function measureDateNowResolution() {
        let last = Date.now();
        let current = last;
        const diffs = [];
        for (let i = 0; i < 50000 && diffs.length < 50; i++) {
            current = Date.now();
            if (current !== last) {
                diffs.push(current - last);
                last = current;
            }
        }
        if (diffs.length === 0) return null;
        let minDiff = diffs[0];
        for (let i = 1; i < diffs.length; i++) {
            if (diffs[i] < minDiff && diffs[i] > 0) minDiff = diffs[i];
        }
        return minDiff;
    }

    async function measureSetTimeoutLatency(runs, timeout_ms) {
        return new Promise((resolve) => {
            const start = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
            let count = 0;
            let lastTime = start;
            let totalLatency = 0;
            let minLatency = Infinity;
            let maxLatency = 0;
            const targetRuns = Math.min(runs || 100, 500);

            function tick() {
                const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
                const latency = now - lastTime;
                
                totalLatency += latency;
                if (latency < minLatency) minLatency = latency;
                if (latency > maxLatency) maxLatency = latency;
                
                count++;
                lastTime = now;

                if (count >= targetRuns || (now - start) > timeout_ms) {
                    resolve({
                        count: count,
                        average: totalLatency / count,
                        min: minLatency,
                        max: maxLatency,
                        totalDuration: now - start
                    });
                } else {
                    setTimeout(tick, 0);
                }
            }
            
            setTimeout(tick, 0);
        });
    }

    async function run(opts) {
        try {
            const timeout_ms = opts.timeout_ms || 30000;
            const runs = opts.runs || 100;
            
            const perfNowRes = measurePerformanceNowResolution();
            const dateNowRes = measureDateNowResolution();
            
            const timeoutLatency = await measureSetTimeoutLatency(runs, Math.min(timeout_ms, 4000));
            
            return {
                status: "AVAILABLE",
                performanceNowResolutionMs: perfNowRes,
                dateNowResolutionMs: dateNowRes,
                setTimeoutZeroLatency: timeoutLatency
            };
        } catch (e) {
            if (typeof DSResearch !== 'undefined' && DSResearch.log) {
                DSResearch.log("env-clock-bench failed: " + e.message);
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
