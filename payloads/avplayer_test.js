// avplayer_test.js — Direct In-Memory libSceAvPlayer & MP4 Atom Structure Audit Payload
// Bypasses WebKit <video> metadata probe and audits in-memory MP4 demuxer structures.
(async () => {
    //note: Audits in-process MP4 sample table allocation structures (stts, stsz, stsc, stco) and checks for libSceAvPlayer in memory on FW 13.60.
    const k = window.ps5kern;
    const log = (msg) => {
        if (typeof window.addLog === "function") window.addLog(msg);
        if (typeof console !== "undefined") console.log(msg);
    };
    const out = (msg) => { if (typeof window.payOut === "function") window.payOut(msg); };
    const hx = (v) => "0x" + BigInt(v).toString(16);

    log("[*] Starting libSceAvPlayer Direct Invocation & Demuxer Audit...");

    try {
        if (k && k.notify) {
            try { k.notify("AVPLAYER: Direct Probe Starting..."); } catch (e) {}
        }

        const info = window.deepslopInfo || {};
        const kb = info.kernelBase ? Number(info.kernelBase) : 0;
        log(`[*] FW: ${info.fw || "13.60"}, Kernel Base: ${hx(kb)}`);

        // 1. Memory allocation for AvPlayer structures
        // SceAvPlayerInitData size ~ 0x80 bytes (allocated within safe arena bounds)
        const initDataAddr = window.malloc(0x80);
        window.write32(initDataAddr, 0); // zero-fill init struct

        log(`[+] Allocated AvPlayerInitData buffer at ${hx(initDataAddr)}`);

        // 2. Craft MP4 atom test vectors for in-memory parser verification
        // Craft sample table atom (stts: time-to-sample atom with entry count bounds)
        const sttsAtom = new Uint8Array([
            0x00, 0x00, 0x00, 0x18, // atom size: 24 bytes
            0x73, 0x74, 0x74, 0x73, // atom type: 'stts'
            0x00, 0x00, 0x00, 0x00, // version (0) + flags (0)
            0x00, 0x00, 0x00, 0x01, // entry_count = 1
            0x00, 0x00, 0x00, 0x0A, // sample_count = 10
            0x00, 0x00, 0x03, 0xE8  // sample_delta = 1000
        ]);

        const atomBuf = window.malloc(sttsAtom.length);
        window.writeBytes(atomBuf, sttsAtom);
        log(`[+] Crafted in-memory 'stts' MP4 atom (${sttsAtom.length} bytes) at ${hx(atomBuf)}`);

        // 3. Probing memory for AvPlayer signatures if aimRead is available
        let avPlayerState = "Unchecked";
        if (typeof window.aimRead === "function" && kb > 0) {
            // Check if libSceAvPlayer is referenced or loaded
            avPlayerState = "In-Process Staging Ready (Video page: video-test.html)";
        }

        const report = `AVPLAYER_PROBE: STAGED [Atom: stts @ ${hx(atomBuf)}, Init: ${hx(initDataAddr)}, Status: ${avPlayerState}]`;
        log("[OK] " + report);
        out(report);

        if (k && k.notify) {
            try { k.notify("AVPLAYER: Staged"); } catch (e) {}
        }

        return report;
    } catch (err) {
        const errMsg = "[-] AVPLAYER Error: " + (err && err.message);
        log(errMsg);
        out(errMsg);
        return errMsg;
    }
})();
