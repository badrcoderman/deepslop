// sysinfo.js — REAL kernel data via clean syscalls (no crash, no PC)
// Output: PS5 notification + log. Requires ps5kern (post-RCE).
(async () => {
    const k = window.ps5kern;
    if (!k) { return "ps5kern unavailable — run the exploit first"; }

    const out = [];
    const info = window.deepslopInfo || {};
    out.push("FW " + (info.fw || "?"));

    const pid = k.pid();
    out.push("pid=" + (pid && pid.ok ? pid.ret : (pid && pid.error) || "err"));

    const pipe = k.pipe();
    out.push("pipe=" + (pipe && pipe.ok ? "fds[" + pipe.fds.join("/") + "]" : (pipe && pipe.error) || "err"));

    const tid = k.tid();
    out.push("tid=" + (tid && tid.ok ? tid.tid : (tid && tid.error) || "n/a"));

    const st = k.stubReport();
    out.push("stubs:" + st.stubScan + "(" + st.scanned.length + ")");

    const msg = "SYSINFO " + out.join(" · ");
    if (window.addLog) window.addLog("[OK] " + msg);
    try { k.notify("SYSINFO " + out.join(" ")); } catch (e) {}

    return msg;
})()
