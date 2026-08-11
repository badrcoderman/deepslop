(function() {
    const manifest = {
        name: "gfx-frame-bench",
        version: "1.0.0",
        description: "rAF consistency and jank detection",
        category: "graphics",
        minimum_firmware: "9.00",
        maximum_firmware: "99.99",
        required_capabilities: ["rAF"],
        estimated_duration_ms: 10000
    };

    async function run(opts) {
        if (typeof requestAnimationFrame === 'undefined') {
            return { status: "UNAVAILABLE", reason: "No requestAnimationFrame" };
        }

        const timeout = opts.timeout_ms || 10000;
        
        return new Promise((resolve) => {
            const start = performance.now();
            const frameTimes = [];
            let lastFrameTime = start;
            let frameCount = 0;
            let isRunning = true;
            
            const timer = setTimeout(() => {
                isRunning = false;
            }, timeout + 500);

            function loop(now) {
                if (!isRunning || (now - start) >= timeout) {
                    clearTimeout(timer);
                    
                    if (frameTimes.length === 0) {
                        resolve({ status: "FAILED", reason: "No frames recorded" });
                        return;
                    }
                    
                    let sum = 0;
                    let max = 0;
                    let min = Infinity;
                    
                    for (let i = 0; i < frameTimes.length; i++) {
                        const t = frameTimes[i];
                        sum += t;
                        if (t > max) max = t;
                        if (t < min) min = t;
                    }
                    
                    const avg = sum / frameTimes.length;
                    
                    let varianceSum = 0;
                    for (let i = 0; i < frameTimes.length; i++) {
                        const diff = frameTimes[i] - avg;
                        varianceSum += diff * diff;
                    }
                    const variance = varianceSum / frameTimes.length;
                    
                    const expectedFrameTime = 1000 / 60;
                    let jankFrames = 0;
                    for (let i = 0; i < frameTimes.length; i++) {
                        if (frameTimes[i] > expectedFrameTime * 1.5) {
                            jankFrames++;
                        }
                    }

                    resolve({
                        status: "AVAILABLE",
                        duration_ms: now - start,
                        frame_count: frameCount,
                        fps_estimate: frameCount / ((now - start) / 1000),
                        frame_time_avg_ms: avg,
                        frame_time_min_ms: min,
                        frame_time_max_ms: max,
                        frame_time_variance: variance,
                        jank_frames: jankFrames,
                        sample_frame_times: frameTimes.slice(0, 100)
                    });
                    return;
                }
                
                const dt = now - lastFrameTime;
                if (frameCount > 0) {
                    frameTimes.push(dt);
                }
                
                lastFrameTime = now;
                frameCount++;
                
                requestAnimationFrame(loop);
            }
            
            requestAnimationFrame((now) => {
                lastFrameTime = now;
                requestAnimationFrame(loop);
            });
        });
    }

    if (typeof DSResearch !== 'undefined') {
        DSResearch.register(manifest, run);
    }
})();
