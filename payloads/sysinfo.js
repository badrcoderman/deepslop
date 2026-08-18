// sysinfo.js — REAL kernel data via clean syscalls (no crash, no PC)
// Output: PS5 notification + log. Requires ps5kern (post-RCE).
(async () => {
    const k = window.ps5kern;
    if (!k) { return "ps5kern unavailable — run the exploit first"; }

    const out = [];
    const info = window.deepslopInfo || {};
    out.push("FW " + (info.fw || "?"));

    //note: Each syscall is isolated so one unavailable stub cannot abort the
    //remaining telemetry or turn an unavailable value into a fake success.
    let pid;
    try { pid = k.pid(); } catch (e) { pid = { error: String(e && e.message || e) }; }
    out.push("pid=" + (pid && pid.ok ? String(pid.ret) : "unavailable:" + ((pid && pid.error) || "err")));

    let pipe;
    try { pipe = k.pipe(); } catch (e) { pipe = { error: String(e && e.message || e) }; }
    out.push("pipe=" + (pipe && pipe.ok ? "fds[" + pipe.fds.join("/") + "]" : "unavailable:" + ((pipe && pipe.error) || "err")));

    let tid;
    try { tid = k.tid(); } catch (e) { tid = { error: String(e && e.message || e) }; }
    out.push("tid=" + (tid && tid.ok ? String(tid.tid) : "unavailable:" + ((tid && tid.error) || "n/a")));

    const st = typeof k.stubReport === "function" ? k.stubReport() : { stubScan: "unavailable", scanned: [] };
    out.push("stubs:" + st.stubScan + "(" + st.scanned.length + ")");

    const msg = "SYSINFO " + out.join(" · ");
    const verdict = pid && pid.ok ? "PASS" : "INCOMPLETE";
    if (window.addLog) window.addLog((verdict === "PASS" ? "[OK] " : "[WARN] ") + msg + " · verdict=" + verdict);
    try { k.notify("SYSINFO " + out.join(" ")); } catch (e) {}

    return msg + " · verdict=" + verdict;
})()
