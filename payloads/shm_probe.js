// shm_probe.js — POSIX Shared Memory Probe for /VideoParserThumbnail on PS5
(async () => {
    const k = window.ps5kern;
    if (!k || !window.syscallClean) {
        return "ps5kern / syscall unavailable — run exploit first";
    }

    if (window.addLog) window.addLog("[SHM] Probing POSIX Shared Memory interfaces...");

    //note: shm_open needs a trusted 3-argument syscall wrapper. The current
    //clean dispatcher exposes only the validated two-argument path, so refusing
    //to call it is safer than producing a misleading restricted/ENOENT result.
    if (!window.deepslopStubs || window.deepslopStubs.verified !== true
        || typeof window.call5 !== "function") {
        const message = "SHM_PROBE: NOT RUN (trusted 3-argument syscall path unavailable)";
        if (window.addLog) window.addLog("[WARN] " + message);
        try { k.notify("SHM: not run"); } catch (e) {}
        return message;
    }

    const SC = window.SYSCALL || {};
    const O_RDWR = 0x0002;
    const O_CREAT = 0x0200;
    const O_EXCL = 0x0800;

    const shmTargets = [
        "/VideoParserThumbnail",
        "/VideoParserTimecode",
        "/SceWebTransportShm"
    ];

    let report = [];

    for (const name of shmTargets) {
        const pStr = window.alloc_string(name);
        // syscall shm_open (syscall 0x17e = 382)
        // int shm_open(const char *path, int flags, mode_t mode)
        const fdRes = window.syscallClean(0x17e, Number(pStr), O_RDWR, 0);
        
        if (fdRes && fdRes.ok && fdRes.ret >= 0) {
            const fd = Number(fdRes.ret);
            const msg = `[OK] shm_open("${name}") -> FD ${fd} (EXISTS & ACCESSIBLE)`;
            if (window.addLog) window.addLog(msg);
            report.push(msg);
            
            // Read first 64 bytes to inspect header
            const buf = window.malloc(64);
            const rRes = window.syscallClean(0x3, fd, Number(buf), 64);
            if (rRes && rRes.ok && rRes.ret > 0) {
                const bytes = window.readBytes(buf, Number(rRes.ret));
                if (window.showHexViewer) {
                    window.showHexViewer(`SHM: ${name} (FD ${fd})`, bytes);
                }
            }
            window.syscallClean(0x6, fd); // close
        } else {
            const msg = `[INFO] shm_open("${name}") -> Not created or restricted (${fdRes.error || fdRes.ret})`;
            if (window.addLog) window.addLog(msg);
            report.push(msg);
        }
    }

    try {
        k.notify("SHM PROBE Complete");
    } catch(e) {}

    return report.join("\n");
})();
