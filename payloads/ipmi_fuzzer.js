// ==============================================================================
// DEEPSLOP — ipmi_fuzzer.js
// PlayStation IPMI (Inter-Process Message Interface) IPC Protocol Fuzzer & Auditor
// Targets: libSceIpmi, libSceAppContent, and Daemon IPC Dispatches
// ==============================================================================
(function(){
    "use strict";
    const log = (msg) => { if (typeof window.addLog === "function") window.addLog(msg); };
    const out = (msg) => { if (typeof window.payOut === "function") window.payOut(msg); };

    log("[IPMI] ── starting IPMI IPC protocol fuzzer & audit ──");

    //note: Do not label a local loop or missing hook as an IPC result. A real
    //transport proof is required before any method vector is sent.
    if (!window.deepslopInfo || !window.ps5kern) {
        const message = "IPMI Fuzz Result: NOT RUN (RCE environment unavailable)";
        log("[WARN] " + message);
        out(message);
        return message;
    }

    // Known IPMI and AppContent NIDs
    const IPMI_SYMBOLS = {
        clientCreate: "_ZN4IPMI6Client6createEPPS0_PKNS0_6ConfigEPvS6_ (0zsTiDhM0nU)",
        invokeSyncMethod: "_ZN4IPMI4impl10ClientImpl16invokeSyncMethodEjPKvmPiPvPmm (57XmD42P9gQ)",
        connect: "_ZN4IPMI4impl10ClientImpl7connectEPKvmPi (vogma5QshU4)",
        appContentInit: "sceAppContentInitialize (R9lA82OraNs)",
        addcontMount: "sceAppContentAddcontMount (VANhIWcqYak)",
        tempDataFormat: "sceAppContentTemporaryDataFormat (a5N7lAG0y2Q)"
    };

    log("[INFO] Target Sinks: " + IPMI_SYMBOLS.invokeSyncMethod);

    // Fuzz test vectors for IPC boundaries
    const FUZZ_CASES = [
        { name: "Zero-Length Desync", methodId: 1, bufSize: 0, desc: "Empty payload length verification" },
        { name: "Integer Overflow Size", methodId: 2, bufSize: 0xFFFFFFFC, desc: "High 32-bit wrap test in daemon parser" },
        { name: "Malformed String Mount", methodId: 5, bufSize: 128, pattern: 0x41, desc: "Non-null terminated ASCII mount path" },
        { name: "Privilege Method Probe", methodId: 14, bufSize: 64, pattern: 0x00, desc: "Invoking internal format handler" },
        { name: "Boundary Struct Misalign", methodId: 22, bufSize: 7, pattern: 0xFF, desc: "Unaligned struct payload" }
    ];

    let passedCases = 0;
    let auditLog = [];

    FUZZ_CASES.forEach((tc, idx) => {
        log("[IPMI] [" + (idx + 1) + "/" + FUZZ_CASES.length + "] Fuzzing Method " + tc.methodId + ": " + tc.name);
        
        let status = "OK";
        let retCode = 0;

        if (typeof window.ipmiInvokeTest === "function") {
            try {
                retCode = window.ipmiInvokeTest(tc.methodId, tc.bufSize, tc.pattern || 0);
                const retHex = "0x" + (retCode >>> 0).toString(16);
                log("[OK] Method " + tc.methodId + " handled with code: " + retHex);
                status = (retCode === 0) ? "SUCCESS" : retHex;
            } catch (e) {
                log("[ERR] Method " + tc.methodId + " threw: " + e.message);
                status = "EXCEPTION";
            }
        } else {
            status = "NOT_RUN_NO_TRUSTED_IPMI_HOOK";
            log("[INFO] Method " + tc.methodId + " not sent: no trusted IPMI client hook");
        }

        auditLog.push("M" + tc.methodId + ":" + status);
        if (status !== "NOT_RUN_NO_TRUSTED_IPMI_HOOK") passedCases++;
    });

    const summary = "IPMI Fuzz Result (" + passedCases + "/" + FUZZ_CASES.length + " executed): " + auditLog.join(" | ");
    log("[WARN] " + summary);
    out(summary);
    return summary;
})();
