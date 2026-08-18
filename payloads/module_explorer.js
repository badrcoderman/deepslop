// module_explorer.js — In-Memory Live Module & NID Export Explorer for PS5
(async () => {
    //note: Parses loaded ELF64 headers and PT_DYNAMIC symbol tables in-memory using aimRead, listing Sony exported NIDs and function names directly on the PS5 screen.
    const log = (m) => { if (window.addLog) window.addLog(m); if (typeof console !== "undefined") console.log(m); };
    const out = (m) => { if (window.payOut) window.payOut(m); };
    const hx  = (v) => "0x" + BigInt(v).toString(16);

    log("[MOD] ── In-Memory SPRX Module & Symbol Explorer ──");

    if (typeof window.aimRead !== "function") {
        const msg = "[MOD] FAIL: aimRead unavailable — run the exploit first";
        log(msg); return msg;
    }

    const info = window.deepslopInfo || {};
    const kb = info.kernelBase ? Number(info.kernelBase) : 0;
    const wb = info.webkitBase ? Number(info.webkitBase) : 0;

    log(`[MOD] Target Scope: kernelBase=${hx(kb)} webkitBase=${hx(wb)}`);

    function parseElfHeaders(baseAddr, label) {
        log(`[*] Probing ELF structure for ${label} @ ${hx(baseAddr)}...`);
        const hdr = window.aimRead(baseAddr, 0x40);
        if (!hdr || hdr[0] !== 0x7F || hdr[1] !== 0x45 || hdr[2] !== 0x4C || hdr[3] !== 0x46) {
            log(`[-] Invalid ELF magic at ${hx(baseAddr)}`);
            return null;
        }

        const dv = new DataView(hdr.buffer);
        const phoff = Number(dv.getBigUint64(0x20, true));
        const phentsize = dv.getUint16(0x36, true) || 0x38;
        const phnum = dv.getUint16(0x38, true);

        log(`[+] ${label}: ELF64 Valid | phoff=${hx(phoff)} phnum=${phnum}`);

        // Read Program Headers to locate PT_DYNAMIC (type 2)
        let dynAddr = 0, dynSize = 0;
        const phBuf = window.aimRead(baseAddr + phoff, Math.min(phnum * phentsize, 0x1000));
        if (phBuf) {
            const pdv = new DataView(phBuf.buffer);
            for (let i = 0; i < phnum; i++) {
                const off = i * phentsize;
                const p_type = pdv.getUint32(off, true);
                if (p_type === 2) { // PT_DYNAMIC
                    dynAddr = Number(pdv.getBigUint64(off + 0x10, true));
                    dynSize = Number(pdv.getBigUint64(off + 0x28, true));
                    break;
                }
            }
        }

        const res = { label, baseAddr: hx(baseAddr), dynAddr: hx(dynAddr), dynSize, symbols: [] };

        if (dynAddr > 0) {
            //note: Handle relative offsets vs absolute virtual addresses in mapped ELF dynamic tables to prevent double-base addition.
            const dynAddrActual = dynAddr >= baseAddr ? dynAddr : baseAddr + dynAddr;
            log(`[+] PT_DYNAMIC found @ ${hx(dynAddrActual)} (size: ${dynSize}B)`);
            const dynTable = window.aimRead(dynAddrActual, Math.min(dynSize || 0x400, 0x1000));
            if (dynTable) {
                let symtab = 0, strtab = 0, strsz = 0;
                const dDv = new DataView(dynTable.buffer);
                for (let ptr = 0; ptr + 16 <= dynTable.length; ptr += 16) {
                    const d_tag = Number(dDv.getBigUint64(ptr, true));
                    const d_val = Number(dDv.getBigUint64(ptr + 8, true));
                    if (d_tag === 0) break;
                    if (d_tag === 6) symtab = d_val; // DT_SYMTAB
                    if (d_tag === 5) strtab = d_val; // DT_STRTAB
                    if (d_tag === 10) strsz = d_val; // DT_STRSZ
                }

                if (symtab && strtab) {
                    const strtabActual = strtab >= baseAddr ? strtab : baseAddr + strtab;
                    log(`[+] Symbol Table: symtab=${hx(symtab)} strtab=${hx(strtabActual)} strsz=${strsz}`);
                    // Read strings
                    const strBlob = window.aimRead(strtabActual, Math.min(strsz || 0x1000, 0x1000));
                    if (strBlob) {
                        let currentStr = "";
                        for (let i = 0; i < strBlob.length; i++) {
                            const c = strBlob[i];
                            if (c === 0) {
                                if (currentStr.length > 2 && (currentStr.startsWith("sce") || currentStr.includes("_"))) {
                                    res.symbols.push(currentStr);
                                    if (res.symbols.length <= 8) {
                                        log(`    🏷️ Export: ${currentStr}`);
                                    }
                                }
                                currentStr = "";
                            } else if (c >= 32 && c <= 126) {
                                currentStr += String.fromCharCode(c);
                            }
                        }
                    }
                }
            }
        }
        return res;
    }

    const modules = [];
    if (kb) {
        const kMod = parseElfHeaders(kb, "libkernel_web");
        if (kMod) modules.push(kMod);
    }
    if (wb) {
        const wMod = parseElfHeaders(wb, "WebKit");
        if (wMod) modules.push(wMod);
    }

    const summary = `MODULE_EXPLORER: Cataloged ${modules.length} active SPRX modules (${modules.reduce((a,m)=>a+m.symbols.length, 0)} symbols indexed)`;
    log("[OK] " + summary);
    out(JSON.stringify(modules, null, 2));

    // Display in Hex Viewer if available
    if (kb && window.showHexViewer) {
        const dump = window.aimRead(kb, 256);
        if (dump) window.showHexViewer("libkernel_web ELF Header", dump, kb);
    }

    return summary;
})();
