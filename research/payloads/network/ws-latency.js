(function() {
    const manifest = {
        name: "net-ws-latency",
        version: "1.0.0",
        description: "WebSocket RTT and connect time",
        category: "network",
        minimum_firmware: "9.00",
        maximum_firmware: "99.99",
        required_capabilities: ["WebSocket"],
        estimated_duration_ms: 5000
    };

    async function run(opts) {
        if (typeof WebSocket === "undefined") {
            return { status: "UNAVAILABLE" };
        }

        let wsUrl;
        if (window.location.protocol === "https:") {
            wsUrl = "wss://" + window.location.host + "/ws";
        } else if (window.location.protocol === "http:") {
            wsUrl = "ws://" + window.location.host + "/ws";
        } else {
            return { status: "NOT_TESTED", reason: "Cannot infer WebSocket URL from current protocol" };
        }

        const connectStart = performance.now();
        let ws;
        let connectLatency = 0;
        
        try {
            ws = new WebSocket(wsUrl);
        } catch (e) {
            return { status: "FAILED", error: "WebSocket instantiation failed: " + e.message };
        }

        const timeoutMs = opts.timeout_ms || 30000;
        const connectTimeout = Math.min(timeoutMs, 3000);

        const connectPromise = new Promise((resolve) => {
            let timeout = setTimeout(() => {
                if (ws.readyState !== WebSocket.OPEN) {
                    ws.close();
                    resolve({ success: false, reason: "Connection timeout" });
                }
            }, connectTimeout);

            ws.onopen = () => {
                clearTimeout(timeout);
                connectLatency = performance.now() - connectStart;
                resolve({ success: true });
            };

            ws.onerror = (err) => {
                clearTimeout(timeout);
                resolve({ success: false, reason: "Connection error" });
            };
        });

        const connRes = await connectPromise;
        if (!connRes.success) {
            return {
                status: "FAILED",
                error: "Failed to connect to " + wsUrl,
                reason: connRes.reason
            };
        }
        
        const rttStart = performance.now();
        const rttPromise = new Promise((resolve) => {
            let timeout = setTimeout(() => {
                resolve({ success: false, rtt: performance.now() - rttStart, reason: "No echo received" });
            }, 2000);

            ws.onmessage = (msg) => {
                clearTimeout(timeout);
                resolve({ success: true, rtt: performance.now() - rttStart });
            };

            try {
                ws.send(JSON.stringify({ type: "ping", timestamp: Date.now() }));
            } catch (e) {
                clearTimeout(timeout);
                resolve({ success: false, reason: "Send error: " + e.message });
            }
        });

        const rttRes = await rttPromise;
        
        try {
            ws.close();
        } catch (e) {}

        return {
            status: "AVAILABLE",
            ws_url: wsUrl,
            connect_latency_ms: parseFloat(connectLatency.toFixed(2)),
            echo_success: rttRes.success,
            rtt_ms: rttRes.success ? parseFloat(rttRes.rtt.toFixed(2)) : null,
            reason: rttRes.reason || null
        };
    }

    if (typeof DSResearch !== "undefined") {
        DSResearch.register(manifest, run);
    }
})();
