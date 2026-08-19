window.__DEEPSLOP_PAYLOAD_PROMISE = (async () => {
    // deepslop_info.js — complete status report (bases + scan offsets + memory)
    const log = (msg) => {
        if (window.addLog) window.addLog(msg);
        console.log(msg);
    };

    log("[*] deepslop_info: generating report...");

    const report = {
        info: (typeof window.deepslopInfo !== "undefined") ? window.deepslopInfo : null,
        scan: (typeof window.deepslopScanOffsets === "function") ? window.deepslopScanOffsets() : null,
        mem:  (typeof window.deepslopMemEstimate === "function") ? window.deepslopMemEstimate() : null,
    };

    const toHex = (n) => (n == null ? "—" : "0x" + BigInt(n).toString(16));

    if (report.info) {
        log(`[INFO] webkitBase=${toHex(report.info.webkitBase)} kernelBase=${toHex(report.info.kernelBase)}`);
    }

    if (report.scan) {
        log(`[INFO] scan: hc=${toHex(report.scan.hc)} gd=${toHex(report.scan.gd)} nt=${toHex(report.scan.nt)}`);
        for (const k of ["gps", "cls", "ers"]) {
            const f = (report.scan.found || {})[k] || [];
            log(`[INFO] ${k}=${f.length ? f.map(toHex).join(",") : "none"}`);
        }
        log(`[INFO] trampoline=${(report.scan.verified && report.scan.verified.trampolineBytes) ?? "none"}`);
    }

    if (report.mem) {
        log(`[INFO] memTotal=${Math.round(report.mem.totalBytes / 1048576)}MB`);
    }

    try {
        if (window.ps5kern && typeof window.ps5kern.notify === "function") {
            window.ps5kern.notify("DEEPSLOP: Info report generated");
        } else if (typeof window.send_notification === "function") {
            window.send_notification("DEEPSLOP: Info report generated");
        }
    } catch (e) {}

    const res = "deepslop_info OK";
    log("[OK] " + res);
    return res;
})();
