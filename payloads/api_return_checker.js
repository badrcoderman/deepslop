// api_return_checker.js — API Return Code & Flow Traversal Validator (Option 2)
(async () => {
    const k = window.ps5kern;
    const log = (msg) => {
        if (window.addLog) window.addLog(msg);
        console.log(msg);
    };

    log("[*] Initializing API Return Code & Flow Traversal Validator (Option 2)...");

    try {
        if (k && k.notify) {
            try { k.notify("API_CHECK: Auditing Return Codes..."); } catch (e) {}
        }

        const info = window.deepslopInfo || {};
        log(`[*] System Context: FW=${info.fw || "unknown"}, KernelBase=${info.kernelBase ? "0x" + BigInt(info.kernelBase).toString(16) : "none"}`);

        // Standard SCE Error code map for common subsystems
        const SCE_ERROR_MAP = {
            0: "SCE_OK (Success / No Error)",
            0x80010002: "SCE_ERROR_ENOENT (No such file or directory)",
            0x8001000E: "SCE_ERROR_EFAULT (Bad address / Invalid pointer)",
            0x80010016: "SCE_ERROR_EINVAL (Invalid argument / Parameter bounds)",
            0x8001000C: "SCE_ERROR_ENOMEM (Out of memory)",
            0x80410101: "SCE_XML_ERROR_INVALID_PARAM",
            0x80410102: "SCE_XML_ERROR_OUT_OF_MEMORY",
            0x80410103: "SCE_XML_ERROR_PARSER_ABORTED",
            0x80610001: "SCE_AVPLAYER_ERROR_INVALID_HANDLE",
            0x80610002: "SCE_AVPLAYER_ERROR_DECODE_FAILED"
        };

        const decodeSceCode = (code) => {
            const u32 = Number(code >>> 0);
            if (SCE_ERROR_MAP[u32]) return `${SCE_ERROR_MAP[u32]} (0x${u32.toString(16).toUpperCase()})`;
            if (u32 === 0) return "SCE_OK (0x0)";
            if ((u32 & 0x80000000) !== 0) {
                return `SCE_GENERIC_ERROR (0x${u32.toString(16).toUpperCase()})`;
            }
            return `STATUS_CODE (0x${u32.toString(16).toUpperCase()})`;
        };

        const results = [];

        //note: Only call the validated getpid wrapper here. The former generic
        //test_syscalls hook was absent on this build and could report simulated
        //success without proving that any native endpoint was callable.
        log("[*] Testing validated syscall return path...");
        if (k && typeof k.pid === "function") {
            try {
                const pid = k.pid();
                const ok = !!(pid && pid.ok && Number.isInteger(Number(pid.ret)) && Number(pid.ret) >= 0);
                results.push({ target: "getpid", status: ok ? "PASS" : "FAIL", value: ok ? Number(pid.ret) : null, error: ok ? null : pid && pid.error || "invalid result" });
                log((ok ? "[OK]" : "[WARN]") + " getpid return path: " + (ok ? pid.ret : pid && pid.error || "invalid result"));
            } catch (error) {
                results.push({ target: "getpid", status: "FAIL", error: String(error && error.message || error) });
                log("[WARN] getpid return path threw: " + (error && error.message || error));
            }
        } else {
            results.push({ target: "getpid", status: "UNAVAILABLE" });
            log("[WARN] getpid return path unavailable");
        }

        // 2. Native dispatch probe — DISABLED (was crashing the console).
        // naturalTrampolineAddress is the exploit's INTERNAL call gadget
        // (mov rcx,[rdi+0xe0]; ... ; ret) — passing it to call_native as the
        // "function" made it dereference rdi=0 => instant crash. Real native
        // probes need an actual function address (NID-resolved) + call5.
        log("[*] libSceXml native dispatch: SKIPPED (no real target address; trampoline misuse removed)");

        const report = typeof window.runBaselineDiagnostics === "function"
            ? window.runBaselineDiagnostics() : null;
        const status = report && report.status === "PASS" && results.every((r) => r.status === "PASS")
            ? "PASS" : "INCOMPLETE";
        const summary = `API_RETURN_CHECK: ${status} ${JSON.stringify({ results, baseline: report })}`;
        log((status === "PASS" ? "[OK] " : "[WARN] ") + summary);

        if (k && k.notify) {
            try { k.notify("API_CHECK: " + status); } catch (e) {}
        }

        return summary;
    } catch (err) {
        const errMsg = "[-] API Checker Error: " + (err && err.message);
        log(errMsg);
        return errMsg;
    }
})();
