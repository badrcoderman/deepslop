// sprx_dumper.js — On-Device Module Dumper with Direct Browser Download for PS5
(async () => {
    const k = window.ps5kern;
    if (!k || !window.readBytes) {
        return "ps5kern / readBytes unavailable — run exploit first";
    }

    const log = (msg) => {
        if (window.addLog) window.addLog(msg);
        console.log(msg);
    };

    log("[*] Initializing On-Device SPRX Module Dumper...");

    // Helper to download Uint8Array in browser
    function downloadBytes(filename, bytes) {
        try {
            const blob = new Blob([bytes], { type: "application/octet-stream" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 1000);
            return true;
        } catch(e) {
            log("[ERR] Download error: " + (e && e.message));
            return false;
        }
    }

    const info = window.deepslopInfo || {};
    let dumpedCount = 0;

    // 1. Dump in-memory libkernel_web
    if (info.kernelBase) {
        log("[*] Dumping libkernel_web from memory (Base: " + window.toHex(info.kernelBase) + ")...");
        try {
            const readFn = window.aimRead || window.readBytes;
            //note: Use safe 64KB dump size for browser direct dump to avoid large JS heap allocations on memory-constrained console WebKit.
            const dumpSize = 0x10000; // 64KB
            const kernelBytes = new Uint8Array(dumpSize);
            const chunkSize = 0x1000; // 4KB chunks
            
            for (let off = 0; off < dumpSize; off += chunkSize) {
                const len = Math.min(chunkSize, dumpSize - off);
                const chunk = readFn(Number(info.kernelBase) + off, len);
                if (chunk) kernelBytes.set(chunk, off);
            }
            
            if (kernelBytes[0] === 0x7F && kernelBytes[1] === 0x45 && kernelBytes[2] === 0x4C && kernelBytes[3] === 0x46) {
                log("[OK] Valid ELF64 header verified for libkernel_web");
                const fname = `libkernel_web_FW${info.fw || "13.60"}_dump.sprx`;
                if (downloadBytes(fname, kernelBytes)) {
                    log(`[OK] Saved ${fname} (${dumpSize / 1024} KB) to browser downloads!`);
                    dumpedCount++;
                }
            } else {
                log("[WARN] ELF magic not found at kernelBase, downloading raw dump...");
                downloadBytes(`kernel_memory_${window.toHex(info.kernelBase)}.bin`, kernelBytes);
            }
        } catch(e) {
            log("[ERR] Failed to dump libkernel_web: " + (e && e.message));
        }
    }

    //note: Filesystem open/read requires a verified multi-argument syscall
    //wrapper. The current diagnostic path has no trusted call5 implementation,
    //so stop after the bounded aimRead dump instead of calling open with the
    //wrong register layout.
    if (!window.deepslopStubs || window.deepslopStubs.verified !== true
        || typeof window.call5 !== "function") {
        const message = `SPRX Dumper: ${dumpedCount} in-memory module(s); filesystem stage not run`;
        log("[WARN] " + message);
        try { k.notify("SPRX: filesystem stage not run"); } catch (e) {}
        return message;
    }

    // 2. Dump from filesystem if possible via syscall open / read
    const targets = [
        "/system/common/lib/libSceAvPlayer.sprx",
        "/system/common/lib/libSceXml.sprx",
        "/system/common/lib/libSceSysBridge.sprx"
    ];

    for (const path of targets) {
        const baseName = path.split("/").pop();
        log(`[*] Probing filesystem read for ${baseName}...`);
        
        try {
            const pStr = window.alloc_string(path);
            const fdRes = window.syscallClean(0x5, Number(pStr), 0); // open(path, O_RDONLY)
            
            if (fdRes && fdRes.ok && fdRes.ret >= 0) {
                const fd = Number(fdRes.ret);
                log(`[OK] open("${baseName}") -> FD ${fd}`);
                
                // Read up to 512KB
                const maxRead = 0x80000; // 512KB
                const buf = window.malloc(maxRead);
                const rRes = window.syscallClean(0x3, fd, Number(buf), maxRead);
                
                if (rRes && rRes.ok && rRes.ret > 0) {
                    const actualLen = Number(rRes.ret);
                    const fileBytes = window.readBytes(buf, actualLen);
                    const fname = `${baseName.replace(".sprx", "")}_FW${info.fw || "13.60"}.sprx`;
                    
                    if (downloadBytes(fname, fileBytes)) {
                        log(`[OK] Successfully dumped ${fname} (${(actualLen / 1024).toFixed(1)} KB)!`);
                        dumpedCount++;
                    }
                }
                window.syscallClean(0x6, fd); // close
            } else {
                log(`[INFO] Path ${baseName} protected or restricted in WebKit sandbox`);
            }
        } catch(e) {
            log(`[WARN] File probe error for ${baseName}: ${e && e.message}`);
        }
    }

    try { k.notify("SPRX DUMPER: " + dumpedCount + " module(s) dumped"); } catch(e) {}

    return `SPRX Dumper complete: ${dumpedCount} module(s) downloaded`;
})();
