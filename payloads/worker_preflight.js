// worker_preflight.js — ordinary Worker lifecycle check, not ROP execution.
(async () => {
    const log = (message) => {
        if (typeof window.addLog === "function") window.addLog(message);
        if (typeof console !== "undefined" && console.log) console.log(message);
    };
    const out = (message) => { if (typeof window.payOut === "function") window.payOut(message); };

    if (typeof Worker !== "function" || typeof Blob !== "function" || !window.URL) {
        const message = "WORKER PREFLIGHT: ordinary Worker API unavailable";
        log("[WARN] " + message);
        out(message);
        return message;
    }

    let worker = null;
    let objectUrl = null;
    try {
        const source = "self.onmessage=function(){self.postMessage('worker-ok')};";
        objectUrl = URL.createObjectURL(new Blob([source], { type: "application/javascript" }));
        worker = new Worker(objectUrl);
        const result = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("worker response timeout")), 1500);
            worker.onmessage = (event) => { clearTimeout(timer); resolve(event.data); };
            worker.onerror = () => { clearTimeout(timer); reject(new Error("worker error")); };
            worker.postMessage(0);
        });
        const message = "WORKER PREFLIGHT: " + (result === "worker-ok" ? "PASS" : "MISMATCH")
            + " / ordinary worker only; ROP worker disabled";
        log(result === "worker-ok" ? "[OK] " + message : "[WARN] " + message);
        out(message);
        return message;
    } catch (error) {
        const message = "WORKER PREFLIGHT: FAIL / " + String(error && error.message || error);
        log("[WARN] " + message);
        out(message);
        return message;
    } finally {
        if (worker) worker.terminate();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
})();
