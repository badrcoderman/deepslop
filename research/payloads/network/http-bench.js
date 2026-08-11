(function() {
    const manifest = {
        name: "net-http-bench",
        version: "1.0.0",
        description: "HTTP latency and throughput",
        category: "network",
        minimum_firmware: "9.00",
        maximum_firmware: "99.99",
        required_capabilities: ["XMLHttpRequest"],
        estimated_duration_ms: 15000
    };

    async function run(opts) {
        if (typeof XMLHttpRequest === "undefined") {
            return { status: "UNAVAILABLE" };
        }

        const runs = opts.runs || 10;
        const targetUrl = window.location.href.split('#')[0];
        let latencies = [];
        let errors = 0;
        let totalBytes = 0;

        const measureLatency = () => {
            return new Promise((resolve) => {
                const start = performance.now();
                const xhr = new XMLHttpRequest();
                // Add cache buster
                const url = targetUrl + (targetUrl.includes('?') ? '&' : '?') + 'r=' + Math.random();
                
                xhr.open("GET", url, true);
                xhr.timeout = 2000;
                
                xhr.onload = () => {
                    const duration = performance.now() - start;
                    if (xhr.status >= 200 && xhr.status < 300) {
                        resolve({ success: true, latency: duration, bytes: xhr.responseText.length });
                    } else {
                        resolve({ success: false, latency: duration, bytes: 0 });
                    }
                };
                
                xhr.onerror = () => resolve({ success: false, latency: performance.now() - start, bytes: 0 });
                xhr.ontimeout = () => resolve({ success: false, latency: performance.now() - start, bytes: 0 });
                
                try {
                    xhr.send();
                } catch (e) {
                    resolve({ success: false, latency: performance.now() - start, bytes: 0 });
                }
            });
        };

        const startTime = performance.now();
        const timeoutMs = opts.timeout_ms || 30000;

        for (let i = 0; i < runs; i++) {
            if ((performance.now() - startTime) > timeoutMs) {
                if (typeof DSResearch !== "undefined" && DSResearch.log) {
                    DSResearch.log("http-bench timed out early");
                }
                break;
            }

            const res = await measureLatency();
            if (res.success) {
                latencies.push(res.latency);
                totalBytes += res.bytes;
            } else {
                errors++;
            }
        }

        if (latencies.length === 0) {
            return {
                status: "FAILED",
                error: "All requests failed",
                errors: errors
            };
        }

        latencies.sort((a, b) => a - b);
        const min = latencies[0];
        const max = latencies[latencies.length - 1];
        const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
        const median = latencies[Math.floor(latencies.length / 2)];

        return {
            status: "AVAILABLE",
            requests_attempted: runs,
            requests_succeeded: latencies.length,
            errors: errors,
            total_bytes_received: totalBytes,
            latency_ms: {
                min: parseFloat(min.toFixed(2)),
                max: parseFloat(max.toFixed(2)),
                avg: parseFloat(avg.toFixed(2)),
                median: parseFloat(median.toFixed(2))
            }
        };
    }

    if (typeof DSResearch !== "undefined") {
        DSResearch.register(manifest, run);
    }
})();
