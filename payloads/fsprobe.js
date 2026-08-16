// fsprobe.js — Enhanced Standalone Filesystem & Module Probe on PS5
(async () => {
    const k = window.ps5kern;
    if (!k) return "ps5kern unavailable — run exploit first";

    const log = (msg) => {
        if (window.addLog) window.addLog(msg);
        console.log(msg);
    };

    log("[*] Starting Enhanced FS & Module Probe...");

    // 1. Filesystem cleanup & probe
    const res = k.fsProbe();
    const nDel = res.deleted.length;
    const nErr = Object.keys(res.errors).length;

    let summary = [];
    if (nDel > 0) {
        summary.push(`Deleted ${nDel} appcache file(s)`);
        log(`[OK] Unlinked ${nDel} appcache cache database(s)`);
    } else {
        log(`[INFO] Appcache check: ${nErr} paths tested`);
    }

    // 2. In-Memory Module Header Probing & Hex Dump
    const info = window.deepslopInfo || {};
    if (info.kernelBase && window.readBytes && window.showHexViewer) {
        log("[*] Probing in-memory libkernel_web ELF header...");
        try {
            const elfBytes = window.readBytes(Number(info.kernelBase), 256);
            
            // Verify ELF magic (0x7F 'E' 'L' 'F')
            if (elfBytes[0] === 0x7F && elfBytes[1] === 0x45 && elfBytes[2] === 0x4C && elfBytes[3] === 0x46) {
                log("[OK] Found valid ELF64 header at " + window.toHex(info.kernelBase));
                window.showHexViewer("libkernel_web ELF64 Header (" + window.toHex(info.kernelBase) + ")", elfBytes, Number(info.kernelBase));
                summary.push("Dumped libkernel_web header to Hex Viewer");
            } else {
                window.showHexViewer("libkernel_web Base Memory (" + window.toHex(info.kernelBase) + ")", elfBytes, Number(info.kernelBase));
            }
        } catch(e) {
            log("[WARN] Module probe read error: " + (e && e.message));
        }
    }

    try { k.notify("FS & MODULE PROBE Complete"); } catch (e) {}

    return summary.join(" | ") || "FS probe complete";
})();
