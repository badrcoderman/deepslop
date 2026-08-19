(function() {
    const manifest = {
        name: "gfx-canvas-bench",
        version: "1.0.0",
        description: "Canvas 2D rendering throughput",
        category: "graphics",
        minimum_firmware: "9.00",
        maximum_firmware: "99.99",
        required_capabilities: ["Canvas2D"],
        estimated_duration_ms: 10000
    };

    async function run(opts) {
        if (typeof document === 'undefined' || !document.createElement) {
            return { status: "UNAVAILABLE", reason: "No DOM" };
        }
        const canvas = document.createElement('canvas');
        if (!canvas.getContext) {
            return { status: "UNAVAILABLE", reason: "No getContext" };
        }
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return { status: "UNAVAILABLE", reason: "No Canvas 2D" };
        }

        canvas.width = 1920;
        canvas.height = 1080;
        
        const timeout = opts.timeout_ms || 10000;
        const start = performance.now();
        let frames = 0;
        let operations = 0;
        
        try {
            while (performance.now() - start < timeout) {
                // Clear
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                
                // Draw many rectangles
                for (let i = 0; i < 1000; i++) {
                    ctx.fillStyle = `rgb(${i % 255}, ${(i * 2) % 255}, ${(i * 3) % 255})`;
                    ctx.fillRect((i * 7) % canvas.width, (i * 11) % canvas.height, 50, 50);
                    operations++;
                }

                // Draw some text
                ctx.fillStyle = "white";
                ctx.font = "48px serif";
                ctx.fillText(`Frame: ${frames}`, 50, 50);
                operations++;

                frames++;
            }
            
            const duration = performance.now() - start;
            
            return {
                status: "AVAILABLE",
                duration_ms: duration,
                frames: frames,
                fps: (frames / (duration / 1000)),
                operations: operations,
                ops_per_sec: (operations / (duration / 1000))
            };
        } catch (e) {
            return { status: "FAILED", error: e.message };
        }
    }

    if (typeof DSResearch !== 'undefined') {
        DSResearch.register(manifest, run);
    }
})();
