// telemetry.js — Live Memory & Kernel State Streamer to PC
(async () => {
    const k = window.ps5kern;
    const log = (msg) => {
        if (window.addLog) window.addLog(msg);
        console.log(msg);
    };

    log("[*] Initializing Live Telemetry Streamer...");

    const PC_IP = (function () {
        if (window.RCE_PC_IP && window.RCE_PC_IP.join) return window.RCE_PC_IP.join(".");
        if (window._ds && window._ds.c && window._ds.c.RCE_PC_IP) return window._ds.c.RCE_PC_IP.join(".");
        return "192.168.1.180";
    })();

    const TELEMETRY_PORT = 9020;
    const WS_URL = `ws://${PC_IP}:${TELEMETRY_PORT}`;

    log(`[*] Connecting to PC Telemetry Server at ${WS_URL}...`);

    try {
        const ws = new WebSocket(WS_URL);

        ws.onopen = () => {
            log("[+] Connected to PC Telemetry Server!");
            try { if (k && k.notify) k.notify("TELEMETRY: Connected to PC"); } catch (e) {}

            // Gather system & memory snapshot
            const info = window.deepslopInfo || {};
            const snapshot = {
                type: "SNAPSHOT",
                timestamp: Date.now(),
                fw: info.fw || "unknown",
                kernelBase: info.kernelBase ? "0x" + BigInt(info.kernelBase).toString(16) : "none",
                libcBase: info.libcBase ? "0x" + BigInt(info.libcBase).toString(16) : "none",
                webkitBase: info.webkitBase ? "0x" + BigInt(info.webkitBase).toString(16) : "none",
                userAgent: navigator.userAgent,
                memoryStats: {
                    heapAllocations: typeof window.malloc === "function" ? "Active" : "Unavailable",
                    naturalTrampoline: info.naturalTrampolineAddress || "none"
                }
            };

            ws.send(JSON.stringify(snapshot));
            log("[+] System snapshot telemetry sent to PC");
        };

        ws.onmessage = (evt) => {
            log(`[PC Command] ${evt.data}`);
        };

        ws.onerror = (err) => {
            log(`[-] Telemetry socket error. Ensure telemetry_logger.py is running on ${PC_IP}:${TELEMETRY_PORT}`);
        };

        ws.onclose = () => {
            log("[*] Telemetry connection closed");
        };

        return `TELEMETRY: Connected to ws://${PC_IP}:${TELEMETRY_PORT}`;
    } catch (e) {
        const errMsg = "[-] Telemetry stream failed: " + (e && e.message);
        log(errMsg);
        return errMsg;
    }
})();
