// syscall_discovery.js — scan-only syscall pattern discovery.
window.__DEEPSLOP_PAYLOAD_PROMISE = (async () => {
    const log = (message) => {
        if (typeof window.addLog === "function") window.addLog(message);
        if (typeof console !== "undefined" && console.log) console.log(message);
    };
    const out = (message) => { if (typeof window.payOut === "function") window.payOut(message); };
    const read = window.aimRead;
    const info = window.deepslopInfo || {};

    function u32(bytes, offset) {
        return (bytes[offset] | (bytes[offset + 1] << 8)
            | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
    }
    function hex(value) { return "0x" + BigInt(value).toString(16); }

    if (typeof read !== "function" || !info.kernelBase) {
        const message = "STUB DISCOVERY: unavailable";
        log("[WARN] " + message);
        out(message);
        return message;
    }

    try {
        const base = BigInt(info.kernelBase);
        const found = [];
        const seen = new Set();
        const scanSize = 0x20000;
        const chunkSize = 0x1000;
        let carry = new Uint8Array(0);
        for (let offset = 0; offset < scanSize; offset += chunkSize) {
            const bytes = read(Number(base + BigInt(offset)), chunkSize);
            const windowBytes = new Uint8Array(carry.length + bytes.length);
            windowBytes.set(carry, 0);
            windowBytes.set(bytes, carry.length);
            const scanBase = offset - carry.length;
            for (let index = 0; index + 12 <= windowBytes.length; index++) {
                let number = null;
                if (windowBytes[index] === 0xb8 && windowBytes[index + 5] === 0x49
                    && windowBytes[index + 6] === 0x89 && windowBytes[index + 7] === 0xca
                    && windowBytes[index + 8] === 0x0f && windowBytes[index + 9] === 0x05) {
                    number = u32(windowBytes, index + 1);
                } else if (windowBytes[index] === 0x48 && windowBytes[index + 1] === 0xc7
                    && windowBytes[index + 2] === 0xc0 && windowBytes[index + 7] === 0x49
                    && windowBytes[index + 8] === 0x89 && windowBytes[index + 9] === 0xca
                    && windowBytes[index + 10] === 0x0f && windowBytes[index + 11] === 0x05) {
                    number = u32(windowBytes, index + 3);
                }
                if (number === null || number >= 1000) continue;
                const address = Number(base + BigInt(scanBase + index));
                const key = number + ":" + address;
                if (!seen.has(key)) {
                    seen.add(key);
                    found.push({ number, address: hex(address) });
                }
            }
            carry = bytes.slice(Math.max(0, bytes.length - 11));
        }
        const getpid = info.getpidAddress ? Number(info.getpidAddress) : 0;
        const close = info.closeAddress ? Number(info.closeAddress) : 0;
        const anchors = {
            getpid: found.some((item) => item.number === 0x14 && Number(item.address) === getpid),
            close: found.some((item) => item.number === 0x06 && Number(item.address) === close),
        };
        const report = { status: anchors.getpid && anchors.close ? "VERIFIED" : "DISCOVERED_ONLY", anchors, count: found.length, found };
        //note: Discovery is intentionally not connected to syscall dispatch. A pattern
        //hit is telemetry until both exact anchors and a separate call ABI are proven.
        const message = "STUB DISCOVERY\n" + JSON.stringify(report, null, 2);
        log("[INFO] " + message.replace(/\n/g, " "));
        out(message);
        return message;
    } catch (error) {
        const message = "STUB DISCOVERY FAIL: " + String(error && error.message || error);
        log("[ERR] " + message);
        out(message);
        return message;
    }
})();
