// fsprobe.js — REAL filesystem action: delete WebKit appcache DBs via
// the unlink syscall (clean path). Same files slopkit removes after its
// kernel exploit — here via raw syscalls, no kernel exploit needed.
// Output: PS5 notification + log.
(async () => {
    const k = window.ps5kern;
    if (!k) { return "ps5kern unavailable — run the exploit first"; }

    const res = k.fsProbe();
    const nDel = res.deleted.length;
    const nErr = Object.keys(res.errors).length;

    if (nDel > 0) {
        const msg = "FS: deleted " + nDel + " appcache file(s)";
        if (window.addLog) {
            for (const p of res.deleted) window.addLog("[OK] unlinked " + p);
            window.addLog("[OK] " + msg);
        }
        try { k.notify("FS PROBE " + msg); } catch (e) {}
        return msg;
    }
    if (nErr > 0) {
        const first = Object.keys(res.errors)[0];
        const msg = "FS: no writable appcache found (" + nErr + " fails, e.g. " + first + " → " + (res.errors[first] || "") + ")";
        if (window.addLog) window.addLog("[WARN] " + msg);
        try { k.notify("FS PROBE 0 files — sandbox paths?"); } catch (e) {}
        return msg;
    }
    return "FS: nothing to do";
})()
