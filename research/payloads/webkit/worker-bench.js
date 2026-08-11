(function() {
    const manifest = {
        name: "wk-worker-bench",
        version: "1.0.0",
        description: "Worker spawn and IPC latency",
        category: "webkit",
        minimum_firmware: "9.00",
        maximum_firmware: "99.99",
        required_capabilities: ["Worker"],
        estimated_duration_ms: 5000
    };

    async function run(opts) {
        const start = performance.now();
        
        if (typeof Worker === 'undefined') {
            return { status: "UNAVAILABLE", reason: "Worker not supported" };
        }

        let worker;
        let objectUrl;
        try {
            // Create worker blob
            const workerCode = `
                self.onmessage = function(e) {
                    if (e.data === 'ping') {
                        self.postMessage('pong');
                    } else if (e.data === 'close') {
                        self.close();
                    }
                };
            `;
            const blob = new Blob([workerCode], { type: 'application/javascript' });
            objectUrl = URL.createObjectURL(blob);
            
            const spawnStart = performance.now();
            worker = new Worker(objectUrl);
            
            // Measure spawn + first message
            const firstMsgTime = await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error("Worker spawn timeout")), 5000);
                worker.onmessage = (e) => {
                    clearTimeout(timeout);
                    resolve(performance.now() - spawnStart);
                };
                worker.postMessage('ping');
            });

            // Measure IPC latency
            const pingCount = 100;
            const ipcStart = performance.now();
            
            await new Promise((resolve, reject) => {
                let count = 0;
                const timeout = setTimeout(() => reject(new Error("Worker IPC timeout")), 5000);
                worker.onmessage = (e) => {
                    count++;
                    if (count >= pingCount) {
                        clearTimeout(timeout);
                        resolve();
                    } else {
                        worker.postMessage('ping');
                    }
                };
                worker.postMessage('ping');
            });
            
            const ipcTime = performance.now() - ipcStart;

            worker.postMessage('close');
            
            return {
                status: "AVAILABLE",
                total_time_ms: performance.now() - start,
                results: {
                    spawn_and_first_msg_ms: firstMsgTime,
                    ipc_round_trips: pingCount,
                    total_ipc_time_ms: ipcTime,
                    avg_ipc_latency_ms: ipcTime / pingCount
                }
            };
        } catch (e) {
            return {
                status: "FAILED",
                error: e.message,
                total_time_ms: performance.now() - start
            };
        } finally {
            if (worker) {
                worker.terminate();
            }
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        }
    }

    if (typeof DSResearch !== 'undefined') {
        DSResearch.register(manifest, run);
    }
})();
