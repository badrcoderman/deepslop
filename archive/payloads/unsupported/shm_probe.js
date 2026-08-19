// shm_probe.js — POSIX Shared Memory Reachability Audit for PS5
(async () => {
    const k = window.ps5kern;
    const log = (m) => { if (window.addLog) window.addLog(m); if (typeof console !== "undefined") console.log(m); };
    const out = (m) => { if (window.payOut) window.payOut(m); };

    log("[SHM] ── POSIX Shared Memory Interface Reachability Audit ──");

    //note: shm_open requires 3 register arguments (const char *path [rdi], int oflag [rsi], mode_t mode [rdx]).
    // The clean natural trampoline only sets rdi and rcx; calling shm_open without rsi/rdx passes garbage flags/mode.
    // Full ROP chain dispatcher is required to audit shm_open with authentic flags.
    const msg = "[SHM] NOT PROBED: shm_open requires 3 register arguments (rdi, rsi, rdx); 2-arg natural trampoline cannot dispatch flags/mode safely. Multi-arg ROP chain dispatcher required.";
    log("[WARN] " + msg);
    out(msg);

    if (k && k.notify) {
        try { k.notify("SHM: multi-arg ROP required"); } catch (e) {}
    }

    return msg;
})();
