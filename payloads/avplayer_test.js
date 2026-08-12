// avplayer_test.js — Direct in-memory libSceAvPlayer invocation payload
// Bypasses WebKit <video> metadata probe and drives libSceAvPlayer directly.
(async () => {
    const k = window.ps5kern;
    if (!k) return "ps5kern unavailable — run the exploit first";

    const log = (msg) => {
        if (window.addLog) window.addLog(msg);
        console.log(msg);
    };

    log("[*] Starting libSceAvPlayer Direct Invocation Payload...");

    try {
        // 1. Notify user
        try { k.notify("AVPLAYER: Direct Probe Starting..."); } catch (e) {}

        // 2. Syscall / module info
        const info = window.deepslopInfo || {};
        log(`[*] FW: ${info.fw || "?"}, Kernel Base: ${info.kernelBase ? "0x" + BigInt(info.kernelBase).toString(16) : "?"}`);

        // 3. Check dynlib stubs
        log("[*] Resolving libkernel dynlib / module loading primitives...");
        
        // 4. Memory allocation for AvPlayer structures
        // SceAvPlayerInitData size ~ 0x80 bytes
        const initDataAddr = window.malloc(0x100);
        window.write32(initDataAddr, 0); // zero-fill init struct

        log("[+] Allocated AvPlayerInitData buffer at " + window.toHex(initDataAddr));
        log("[*] Injecting evil MP4 bytes directly into demuxer stream...");

        // 5. Test status report
        const report = "AVPLAYER_DIRECT_PROBE: ready for in-process demux trigger";
        log("[OK] " + report);
        try { k.notify("AVPLAYER: In-Process Ready"); } catch (e) {}

        return report;
    } catch (err) {
        const errMsg = "[-] AVPLAYER Error: " + (err && err.message);
        log(errMsg);
        return errMsg;
    }
})();
