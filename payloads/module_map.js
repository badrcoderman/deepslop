// module_map.js — bounded ELF/PT_LOAD inspection for known userland bases.
window.__DEEPSLOP_PAYLOAD_PROMISE = (async () => {
    const log = (message) => {
        if (typeof window.addLog === "function") window.addLog(message);
        if (typeof console !== "undefined" && console.log) console.log(message);
    };
    const out = (message) => { if (typeof window.payOut === "function") window.payOut(message); };
    const read = window.aimRead;

    function u16(bytes, offset) { return bytes[offset] | (bytes[offset + 1] << 8); }
    function u32(bytes, offset) {
        return (bytes[offset] | (bytes[offset + 1] << 8)
            | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
    }
    function u64(bytes, offset) {
        let value = 0n;
        for (let index = 0; index < 8; index++) value |= BigInt(bytes[offset + index]) << BigInt(index * 8);
        return value;
    }
    function hex(value) { return "0x" + BigInt(value).toString(16); }

    function inspect(name, baseValue) {
        const base = BigInt(baseValue || 0);
        if (!base || typeof read !== "function") return { name, status: "UNAVAILABLE" };
        const header = read(Number(base), 0x40);
        if (header.length < 0x40 || u32(header, 0) !== 0x464c457f)
            return { name, status: "MISMATCH", base: hex(base) };
        if (header[4] !== 2 || header[5] !== 1)
            return { name, status: "MISMATCH", base: hex(base), reason: "not ELF64 little-endian" };
        const phoff = u64(header, 0x20);
        const phentsize = u16(header, 0x36);
        const phnum = u16(header, 0x38);
        if (phentsize < 0x38 || phentsize > 0x100 || phnum > 128)
            return { name, status: "REJECTED", base: hex(base), reason: "program header bounds" };
        const segments = [];
        for (let index = 0; index < phnum; index++) {
            const address = base + phoff + BigInt(index * phentsize);
            const entry = read(Number(address), Math.min(phentsize, 0x100));
            if (entry.length < 0x38) throw new Error(name + " program header read failed");
            if (u32(entry, 0) !== 1) continue;
            const vaddr = u64(entry, 0x10);
            const memsz = u64(entry, 0x28);
            if (memsz > 0x40000000n) throw new Error(name + " segment exceeds safety bound");
            segments.push({ flags: "0x" + u32(entry, 4).toString(16), vaddr: hex(vaddr), memsz: hex(memsz) });
        }
        return { name, status: segments.length ? "PASS" : "MISMATCH", base: hex(base), phnum, segments };
    }

    try {
        const info = window.deepslopInfo || {};
        const report = [
            inspect("WebKit", info.webkitBase),
            inspect("libkernel", info.kernelBase),
        ];
        const message = "MODULE MAP\n" + JSON.stringify(report, null, 2);
        log("[INFO] " + message.replace(/\n/g, " "));
        out(message);
        return message;
    } catch (error) {
        const message = "MODULE MAP FAIL: " + String(error && error.message || error);
        log("[ERR] " + message);
        out(message);
        return message;
    }
})();
