(async () => {
    // deepslop_info.js — rapport complet de l'état deepslop (bases + scan offsets)
    await log("deepslop_info: generating report");

    const report = {
        info: (typeof window.deepslopInfo !== "undefined") ? window.deepslopInfo : null,
        scan: (typeof window.deepslopScanOffsets === "function") ? window.deepslopScanOffsets() : null,
        mem:  (typeof window.deepslopMemEstimate === "function") ? window.deepslopMemEstimate() : null,
    };

    await log("deepslop_info: webkitBase=" + (report.info ? "0x" + report.info.webkitBase.toString(16) : "?")
        + " kernelBase=" + (report.info ? "0x" + report.info.kernelBase.toString(16) : "?"));

    if (report.scan) {
        await log("deepslop_info: hc=0x" + report.scan.hc.toString(16)
            + " gd=0x" + report.scan.gd.toString(16)
            + " nt=0x" + report.scan.nt.toString(16));
        for (const k of ["gps", "cls", "ers"]) {
            const f = (report.scan.found || {})[k] || [];
            await log("deepslop_info: " + k + "=" + (f.length ? f.map(x => "0x" + x.toString(16)).join(",") : "none"));
        }
        await log("deepslop_info: trampoline=" + ((report.scan.verified && report.scan.verified.trampolineBytes) ?? "none"));
    }

    if (report.mem) {
        await log("deepslop_info: memTotal=" + Math.round(report.mem.totalBytes / 1048576) + "MB"
            + " lowmem=" + report.mem.lowmem);
    }

    send_notification("DEEPSLOP info report ready");
    return "deepslop_info OK";
})()
