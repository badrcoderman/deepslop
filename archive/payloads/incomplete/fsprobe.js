// fsprobe.js — Enhanced Standalone Filesystem & Module Probe on PS5 (FW 13.60)
(async () => {
    //note: Audits the WebKit AppCache SQLite storage paths within the sandbox and probes the in-memory libkernel_web ELF header using aimRead.
    const k = window.ps5kern;
    if (!k) return "ps5kern unavailable — run exploit first";

    const log = (msg) => {
        if (typeof window.addLog === "function") window.addLog(msg);
        if (typeof console !== "undefined") console.log(msg);
    };
    const out = (msg) => { if (typeof window.payOut === "function") window.payOut(msg); };
    const hx = (v) => "0x" + BigInt(v).toString(16);

    log("[*] Starting Enhanced FS & Module Probe (FW 13.60)...");

    // 1. Filesystem cleanup & AppCache database probe
    let summary = [];
    if (typeof k.fsProbe === "function") {
        const res = k.fsProbe();
        const nDel = (res && res.deleted) ? res.deleted.length : 0;
        const nErr = (res && res.errors) ? Object.keys(res.errors).length : 0;

        if (nDel > 0) {
            summary.push(`Deleted ${nDel} appcache file(s)`);
            log(`[OK] Unlinked ${nDel} appcache cache database(s)`);
        } else {
            log(`[INFO] Appcache check: ${nErr} sandbox paths tested`);
            summary.push(`Appcache paths tested: ${nErr}`);
        }
    }

    // 2. In-Memory Module Header Probing & Hex Dump via aimRead
    const info = window.deepslopInfo || {};
    const readFn = window.aimRead || window.readBytes;
    if (info.kernelBase && readFn && window.showHexViewer) {
        log(`[*] Probing in-memory libkernel_web ELF header @ ${hx(info.kernelBase)}...`);
        try {
            const elfBytes = readFn(Number(info.kernelBase), 256);
            if (elfBytes && elfBytes[0] === 0x7F && elfBytes[1] === 0x45 && elfBytes[2] === 0x4C && elfBytes[3] === 0x46) {
                log(`[OK] Found valid ELF64 header at ${hx(info.kernelBase)}`);
                window.showHexViewer(`libkernel_web ELF64 Header (${hx(info.kernelBase)})`, elfBytes, Number(info.kernelBase));
                summary.push("ELF64 Header Verified & Displayed in Hex Viewer");
            } else if (elfBytes) {
                window.showHexViewer(`Memory @ ${hx(info.kernelBase)}`, elfBytes, Number(info.kernelBase));
            }
        } catch(e) {
            log("[WARN] Module probe read error: " + (e && e.message));
        }
    }

    const reportMsg = summary.join(" | ") || "FS & Module probe complete";
    log("[OK] " + reportMsg);
    out(reportMsg);

    if (k && k.notify) {
        try { k.notify("FS & MODULE PROBE Complete"); } catch (e) {}
    }

    return reportMsg;
})();
