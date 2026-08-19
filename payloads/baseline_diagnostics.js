// baseline_diagnostics.js — trusted post-RCE diagnostics only.
window.__DEEPSLOP_PAYLOAD_PROMISE = (async () => {
    const log = (message) => {
        if (typeof window.addLog === "function") window.addLog(message);
        if (typeof console !== "undefined" && console.log) console.log(message);
    };

    if (typeof window.runBaselineDiagnostics !== "function") {
        const message = "BASELINE: unavailable — run the exploit first";
        log("[WARN] " + message);
        if (typeof window.payOut === "function") window.payOut(message);
        return message;
    }

    try {
        //note: This invokes only the validated getpid path and bounded aimRead
        //checks. It does not probe IPMI, SHM, module loading, or native parsers.
        const report = window.runBaselineDiagnostics();
        const summary = "BASELINE " + report.status + " " + JSON.stringify(report);
        log((report.status === "PASS" ? "[OK] " : "[WARN] ") + summary);
        if (typeof window.payOut === "function") window.payOut(summary);
        return summary;
    } catch (error) {
        const message = "BASELINE FAIL: " + String(error && error.message || error);
        log("[ERR] " + message);
        if (typeof window.payOut === "function") window.payOut(message);
        return message;
    }
})();
