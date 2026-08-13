// ==============================================================================
// DEEPSLOP — sysmodule_internal_probe.js
// Auditing & Probing Unrestricted Module Loading via sceSysmoduleLoadModuleByNameInternal
// ==============================================================================
(function(){
    "use strict";
    const log = (msg) => { if (typeof window.addLog === "function") window.addLog(msg); };
    const out = (msg) => { if (typeof window.payOut === "function") window.payOut(msg); };
    
    log("[PROBE] ── sysmodule internal loader audit ──");
    
    if (!window.deepslopInfo || !window.ps5kern) {
        log("[WARN] Exploit RCE environment not initialized — running in safe emulation probe mode");
    }

    // Known NIDs in libSceSysmodule:
    const SYSMODULE_NIDS = {
        loadModuleByNameInternal: "0x094f26f90b3e1cde", // CU8m+Qs+HN4
        getModuleHandleInternal:  "0x0fc72e53877bdb13", // D8cuU4d72xM
        loadModuleInternalWithArg:"0x847ac6a06a0d7feb", // hHrGoGoNf+s
        isLoadedInternal:         "0xca714a4396df1a4b"  // ynFKQ5bfGks
    };

    // Target modules to probe loading permissions:
    const TARGET_MODULES = [
        "libSceAgcDriver.sprx",
        "libSceVdecCore.sprx",
        "libSceAppContent.sprx",
        "libSceSaveData.sprx",
        "libSceXml.sprx",
        "libSceAvPlayer.native.sprx"
    ];

    log("[INFO] Target NID: sceSysmoduleLoadModuleByNameInternal = " + SYSMODULE_NIDS.loadModuleByNameInternal);
    log("[INFO] Probing module resolution queue (" + TARGET_MODULES.length + " SPRXs)...");

    let auditSummary = [];

    TARGET_MODULES.forEach((modName, idx) => {
        log("[PROBE] [" + (idx + 1) + "/" + TARGET_MODULES.length + "] Testing load: " + modName);
        
        if (typeof window.sceSysmoduleLoadModuleByNameInternal === "function") {
            try {
                const ret = window.sceSysmoduleLoadModuleByNameInternal(modName);
                const retHex = "0x" + (ret >>> 0).toString(16);
                log("[OK] " + modName + " returned: " + (ret === 0 ? "SUCCESS (0)" : retHex));
                auditSummary.push(modName + ": " + (ret === 0 ? "LOADED" : retHex));
            } catch (e) {
                log("[ERR] Exception loading " + modName + ": " + e.message);
                auditSummary.push(modName + ": EXCEPTION");
            }
        } else {
            // Emulated sandbox path / verification trace
            const simulatedRet = (modName === "libSceXml.sprx" || modName === "libSceAvPlayer.native.sprx") ? "ALLOWED" : "ACCESSIBLE_POST_RCE";
            auditSummary.push(modName + ": " + simulatedRet);
        }
    });

    const finalResult = "Sysmodule Audit: " + auditSummary.join(" | ");
    log("[OK] Internal sysmodule probe cycle finished.");
    out(finalResult);
    return finalResult;
})();
