// primitive_preflight.js — bounded FW 13.60 userland primitive checks.
(async () => {
    const log = (message) => {
        if (typeof window.addLog === "function") window.addLog(message);
        if (typeof console !== "undefined" && console.log) console.log(message);
    };
    const out = (message) => { if (typeof window.payOut === "function") window.payOut(message); };

    if (typeof window.runBaselineDiagnostics !== "function") {
        const message = "PREFLIGHT UNAVAILABLE: run the preserved userland RCE first";
        log("[WARN] " + message);
        out(message);
        return message;
    }

    try {
        //note: Reuse the exploit's bounded baseline instead of touching carrier
        //headers or attempting promotion from a notification-only primitive.
        const report = window.runBaselineDiagnostics();
        const info = window.deepslopInfo || {};
        const summary = {
            status: report.status,
            firmware: report.firmware || info.fw || "unknown",
            primitiveReady: info.primitiveReady === true,
            promotedReadWriteReady: info.promotedReadWriteReady === true,
            aimRead: report.aimRead,
            getpid: report.getpid,
            webkitHeader: report.webkitHeader,
        };
        const message = "PRIMITIVE PREFLIGHT\n" + JSON.stringify(summary, null, 2);
        log((report.status === "PASS" ? "[OK] " : "[WARN] ") + message.replace(/\n/g, " "));
        out(message);
        return message;
    } catch (error) {
        const message = "PREFLIGHT FAIL: " + String(error && error.message || error);
        log("[ERR] " + message);
        out(message);
        return message;
    }
})();
