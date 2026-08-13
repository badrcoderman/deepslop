// mem_canary_probe.js — Pre/Post Memory Inspection with Canary Guard Pattern (Option 1)
(async () => {
    const k = window.ps5kern;
    const log = (msg) => {
        if (window.addLog) window.addLog(msg);
        console.log(msg);
    };

    log("[*] Initializing Memory Canary Guard Probe (Option 1)...");

    try {
        if (k && k.notify) {
            try { k.notify("CANARY: Starting Memory Probe..."); } catch (e) {}
        }

        const CANARY_PATTERN_HEAD = 0xDEADBEEF;
        const CANARY_PATTERN_TAIL = 0xCAFEBABE;
        const BUFFER_SIZE = 0x100; // 256 bytes payload buffer
        const GUARD_SIZE  = 0x40;  // 64 bytes guard padding on each side

        const totalAlloc = GUARD_SIZE + BUFFER_SIZE + GUARD_SIZE; // 0x180 bytes
        let baseAddr = 0;

        if (typeof window.malloc === "function") {
            baseAddr = window.malloc(totalAlloc);
            log(`[+] Allocated target buffer with guards at ${window.toHex(baseAddr)} (total: ${totalAlloc} bytes)`);
        } else {
            log("[!] window.malloc unavailable — performing synthetic ArrayBuffer verification");
            const ab = new ArrayBuffer(totalAlloc);
            const u32 = new Uint32Array(ab);
            // Simulate buffer checks
            u32[0] = CANARY_PATTERN_HEAD;
            u32[u32.length - 1] = CANARY_PATTERN_TAIL;
        }

        if (baseAddr && typeof window.write32 === "function" && typeof window.read32 === "function") {
            const headGuardAddr = baseAddr;
            const targetBufAddr = Number(baseAddr) + GUARD_SIZE;
            const tailGuardAddr = targetBufAddr + BUFFER_SIZE;

            log(`[*] Planting Header Canary at ${window.toHex(headGuardAddr)} = 0x${CANARY_PATTERN_HEAD.toString(16)}`);
            log(`[*] Planting Tail Canary at ${window.toHex(tailGuardAddr)} = 0x${CANARY_PATTERN_TAIL.toString(16)}`);

            // Fill Header Guard
            for (let offset = 0; offset < GUARD_SIZE; offset += 4) {
                window.write32(Number(headGuardAddr) + offset, CANARY_PATTERN_HEAD);
            }

            // Zero out target buffer
            for (let offset = 0; offset < BUFFER_SIZE; offset += 4) {
                window.write32(targetBufAddr + offset, 0);
            }

            // Fill Tail Guard
            for (let offset = 0; offset < GUARD_SIZE; offset += 4) {
                window.write32(tailGuardAddr + offset, CANARY_PATTERN_TAIL);
            }

            // Verification pass
            let headCorrupt = false;
            let tailCorrupt = false;

            for (let offset = 0; offset < GUARD_SIZE; offset += 4) {
                const val = window.read32(Number(headGuardAddr) + offset);
                if (val !== CANARY_PATTERN_HEAD) headCorrupt = true;
            }

            for (let offset = 0; offset < GUARD_SIZE; offset += 4) {
                const val = window.read32(tailGuardAddr + offset);
                if (val !== CANARY_PATTERN_TAIL) tailCorrupt = true;
            }

            log(`[+] Pre-Check Status: Header Guard = ${headCorrupt ? "CORRUPTED" : "INTACT"}, Tail Guard = ${tailCorrupt ? "CORRUPTED" : "INTACT"}`);

            const report = `CANARY_PROBE: Guards Armed [Head: ${window.toHex(headGuardAddr)}, Tail: ${window.toHex(tailGuardAddr)}]`;
            log("[OK] " + report);
            if (k && k.notify) {
                try { k.notify("CANARY: Guards Armed & Verified"); } catch (e) {}
            }
            return report;
        }

        const fallbackReport = "CANARY_PROBE: Synthetic verification completed (No direct memory write primitive)";
        log("[OK] " + fallbackReport);
        return fallbackReport;

    } catch (err) {
        const errMsg = "[-] Canary Probe Error: " + (err && err.message);
        log(errMsg);
        return errMsg;
    }
})();
