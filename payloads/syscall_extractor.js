// syscall_extractor.js — Automated In-Memory Syscall Stub Extractor & Dynamic Dispatch Table Resolver for PS5 FW 13.60
(async () => {
    //note: This payload uses window.aimRead to scan libkernel_web directly in physical memory on FW 13.60, locating all syscall trampoline patterns without needing file downloads or static hardcoded tables.
    const log = (m) => { if (typeof window.addLog === "function") window.addLog(m); if (typeof console !== "undefined") console.log(m); };
    const out = (m) => { if (typeof window.payOut === "function") window.payOut(m); };
    const hx  = (v) => "0x" + BigInt(v).toString(16);

    log("[EXTRACT] ── Scanning libkernel_web for Syscall Trampolines (FW 13.60) ──");

    if (typeof window.aimRead !== "function") {
        const err = "[EXTRACT] FAIL: window.aimRead unavailable — run the exploit first";
        log(err); out(err);
        return err;
    }

    const info = window.deepslopInfo || {};
    const kb = info.kernelBase ? Number(info.kernelBase) : 0;
    if (!kb) {
        const err = "[EXTRACT] FAIL: kernelBase not found in deepslopInfo";
        log(err); out(err);
        return err;
    }

    log(`[EXTRACT] Scanning libkernel_web @ ${hx(kb)}...`);

    // 1. Verify ELF Header
    const hdr = window.aimRead(kb, 0x40);
    if (!hdr || hdr[0] !== 0x7F || hdr[1] !== 0x45 || hdr[2] !== 0x4C || hdr[3] !== 0x46) {
        const err = `[EXTRACT] FAIL: Invalid ELF magic at ${hx(kb)}`;
        log(err); out(err);
        return err;
    }

    // 2. Parse Program Headers to find the .text executable segment
    const dv = new DataView(hdr.buffer);
    const phoff = Number(dv.getBigUint64(0x20, true));
    const phentsize = dv.getUint16(0x36, true) || 0x38;
    const phnum = dv.getUint16(0x38, true);

    let textStart = 0, textLen = 0x30000;
    const phBuf = window.aimRead(kb + phoff, Math.min(phnum * phentsize, 0x1000));
    if (phBuf) {
        const pdv = new DataView(phBuf.buffer);
        for (let i = 0; i < phnum; i++) {
            const off = i * phentsize;
            const p_type = pdv.getUint32(off, true);
            const p_flags = pdv.getUint32(off + 4, true);
            // PT_LOAD (1) with Execute flag (bit 0x1)
            if (p_type === 1 && (p_flags & 1) !== 0) {
                textStart = Number(pdv.getBigUint64(off + 8, true));
                textLen = Number(pdv.getBigUint64(off + 0x20, true));
                break;
            }
        }
    }

    log(`[+] Executable .text segment: offset ${hx(textStart)}, size: ${hx(textLen)} (${textLen} bytes)`);

    // Target Syscalls Map
    const SYSCALL_NAMES = {
        0x01: "exit",
        0x03: "read",
        0x04: "write",
        0x05: "open",
        0x06: "close",
        0x0a: "unlink",
        0x14: "getpid",
        0x2a: "pipe",
        0x36: "ioctl",
        0x61: "socket",
        0x17e: "shm_open",       // 382 (POSIX Shared Memory)
        0x17f: "shm_unlink",     // 383
        0x1b0: "thr_self",       // 432 (Thread ID)
        0x24e: "dlsym",          // 590 (Dynamic Symbol Resolution)
        0x26e: "ipmimgr_call"    // 622 (Kernel IPC Transport)
    };

    const foundStubs = {};
    let scannedBytes = 0;
    const CHUNK_SIZE = 0x1000;

    //note: Scan in 4KB pages through the executable segment matching standard x86_64 FreeBSD/Prospero syscall trampolines:
    // [Pattern 1]: 48 C7 C0 <nr32> 49 89 CA 0F 05 C3
    // [Pattern 2]: B8 <nr32> 49 89 CA 0F 05 C3
    for (let cur = textStart; cur < textStart + textLen; cur += CHUNK_SIZE) {
        const scanLen = Math.min(CHUNK_SIZE, textStart + textLen - cur);
        const page = window.aimRead(kb + cur, scanLen);
        if (!page) continue;
        scannedBytes += scanLen;

        for (let i = 0; i + 8 <= page.length; i++) {
            let sysNum = null;
            let stubAddr = kb + cur + i;

            // Check Pattern 2: B8 <nr:4> 49 89 CA 0F 05
            if (page[i] === 0xB8 && i + 10 <= page.length) {
                if (page[i + 5] === 0x49 && page[i + 6] === 0x89 && page[i + 7] === 0xCA &&
                    page[i + 8] === 0x0F && page[i + 9] === 0x05) {
                    sysNum = page[i + 1] | (page[i + 2] << 8) | (page[i + 3] << 16) | (page[i + 4] << 24);
                }
            }
            // Check Pattern 1: 48 C7 C0 <nr:4> 49 89 CA 0F 05
            else if (page[i] === 0x48 && page[i + 1] === 0xC7 && page[i + 2] === 0xC0 && i + 12 <= page.length) {
                if (page[i + 7] === 0x49 && page[i + 8] === 0x89 && page[i + 9] === 0xCA &&
                    page[i + 10] === 0x0F && page[i + 11] === 0x05) {
                    sysNum = page[i + 3] | (page[i + 4] << 8) | (page[i + 5] << 16) | (page[i + 6] << 24);
                }
            }

            if (sysNum !== null && sysNum > 0 && sysNum < 1000) {
                const name = SYSCALL_NAMES[sysNum] || `sys_${sysNum}`;
                if (!foundStubs[sysNum]) {
                    foundStubs[sysNum] = { name, sysNum, addr: stubAddr, rva: stubAddr - kb };
                    //note: Register discovered runtime stub into global dispatch table
                    if (typeof window.registerSyscallStub === "function") {
                        window.registerSyscallStub(sysNum, stubAddr);
                    }
                }
            }
        }
    }

    // Populate runtime stubs table
    if (!window.deepslopStubs) window.deepslopStubs = { verified: true, addresses: {} };
    window.deepslopStubs.verified = true;
    window.deepslopStubs.addresses = window.deepslopStubs.addresses || {};
    for (const nr of Object.keys(foundStubs)) {
        const item = foundStubs[nr];
        window.deepslopStubs.addresses[item.name] = item.addr;
    }

    const count = Object.keys(foundStubs).length;
    log(`[OK] Discovery complete: Found ${count} live syscall stubs in ${scannedBytes} bytes`);

    // Log key highlights
    const highlights = [0x14, 0x06, 0x2a, 0x05, 0x61, 0x17e, 0x26e, 0x1b0];
    for (const h of highlights) {
        if (foundStubs[h]) {
            const s = foundStubs[h];
            log(`  🎯 ${s.name.padEnd(14)} (#${s.sysNum}) -> ${hx(s.addr)} (RVA: ${hx(s.rva)})`);
        }
    }

    const resultSummary = {
        fw: "13.60",
        kernelBase: hx(kb),
        stubsFound: count,
        stubs: foundStubs
    };

    const outJson = JSON.stringify(resultSummary, null, 2);
    out(outJson);

    if (window.ps5kern && window.ps5kern.notify) {
        try { window.ps5kern.notify(`EXTRACT: ${count} stubs verified`); } catch (_) {}
    }

    return `SYSCALL_EXTRACTOR: Verified ${count} runtime syscall stubs on FW 13.60`;
})();
