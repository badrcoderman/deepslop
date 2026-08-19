// resizable_arraybuffer_probe.js -- one-shot, non-corrupting FW 13.60 API probe.
(async () => {
    const log = (message) => {
        if (typeof window.addLog === "function") window.addLog(message);
        if (typeof console !== "undefined" && console.log) console.log(message);
    };
    const out = (message) => { if (typeof window.payOut === "function") window.payOut(message); };

    let buffer = null;
    try {
        if (typeof ArrayBuffer !== "function" || typeof Uint8Array !== "function")
            throw new Error("typed array API unavailable");
        //note: Keep the allocation tiny and perform one bounded resize/copyWithin
        //operation only. This probes API semantics without heap grooming or a JIT loop.
        buffer = new ArrayBuffer(0x1000, { maxByteLength: 0x4000 });
        if (buffer.resizable !== true || buffer.maxByteLength !== 0x4000)
            throw new Error("resizable ArrayBuffer is not supported");
        const view = new Uint8Array(buffer);
        for (let index = 0; index < 0x20; index++) view[index] = index;
        buffer.resize(0x2000);
        if (view.length !== 0x2000) throw new Error("view length did not follow resize");
        view.copyWithin(0x100, 0, 0x20);
        for (let index = 0; index < 0x20; index++)
            if (view[0x100 + index] !== index) throw new Error("copyWithin result mismatch");
        const report = {
            status: "PASS",
            initialByteLength: "0x1000",
            finalByteLength: "0x" + buffer.byteLength.toString(16),
            maxByteLength: "0x" + buffer.maxByteLength.toString(16),
            copyWithin: "PASS",
        };
        const message = "RESIZABLE ARRAYBUFFER PROBE\n" + JSON.stringify(report, null, 2);
        log("[OK] " + message.replace(/\n/g, " "));
        out(message);
        return message;
    } catch (error) {
        const unsupported = String(error && error.message || error).includes("not supported");
        const message = "RESIZABLE ARRAYBUFFER PROBE: " + (unsupported ? "UNAVAILABLE" : "STOPPED")
            + " / " + String(error && error.message || error);
        log((unsupported ? "[INFO] " : "[WARN] ") + message);
        out(message);
        return message;
    } finally {
        buffer = null;
    }
})();
