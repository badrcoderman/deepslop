// userland_report.js — read-only runtime capability report.
window.__DEEPSLOP_PAYLOAD_PROMISE = (async () => {
    const log = (message) => {
        if (typeof window.addLog === "function") window.addLog(message);
        if (typeof console !== "undefined" && console.log) console.log(message);
    };
    const out = (message) => { if (typeof window.payOut === "function") window.payOut(message); };
    const info = window.deepslopInfo || {};
    const stubs = window.deepslopStubs || {};
    const report = {
        firmware: info.fw || "unknown",
        build: info.buildId || "unknown",
        webkitBase: info.webkitBase || null,
        kernelBase: info.kernelBase || null,
        primitiveReady: info.primitiveReady === true,
        promotedReadWriteReady: info.promotedReadWriteReady === true,
        nativeCallArity: info.nativeCallArity || "unknown",
        stubScan: info.stubScan || "unavailable",
        discoveredStubCount: stubs.addresses ? Object.keys(stubs.addresses).length : 0,
        workerRop: "disabled until exact 13.60 profile exists",
        kernelStage: "disabled",
    };
    const message = "USERLAND REPORT\n" + JSON.stringify(report, null, 2);
    log("[INFO] " + message.replace(/\n/g, " "));
    out(message);
    return message;
})();
