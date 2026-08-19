// memory_integrity.js — bounded repeated-read integrity checks without writes.
(async () => {
    const log = (message) => {
        if (typeof window.addLog === "function") window.addLog(message);
        if (typeof console !== "undefined" && console.log) console.log(message);
    };
    const out = (message) => { if (typeof window.payOut === "function") window.payOut(message); };
    const read = window.aimRead;
    const info = window.deepslopInfo || {};

    function same(left, right) {
        if (!left || !right || left.length !== right.length) return false;
        for (let index = 0; index < left.length; index++) if (left[index] !== right[index]) return false;
        return true;
    }
    function check(name, address) {
        if (!address || typeof read !== "function") return { name, status: "SKIP" };
        const first = read(Number(address), 8);
        const second = read(Number(address), 8);
        return { name, address: "0x" + BigInt(address).toString(16), stable: same(first, second), nonzero: first.some((value) => value !== 0) };
    }

    try {
        const checks = [
            check("getpid stub", info.getpidAddress),
            check("close stub", info.closeAddress),
            check("WebKit base", info.webkitBase),
            check("kernel base", info.kernelBase),
        ];
        const passed = checks.filter((item) => item.status !== "SKIP").every((item) => item.stable && item.nonzero);
        const message = "MEMORY INTEGRITY " + (passed ? "PASS" : "WARN") + "\n" + JSON.stringify(checks, null, 2);
        log((passed ? "[OK] " : "[WARN] ") + message.replace(/\n/g, " "));
        out(message);
        return message;
    } catch (error) {
        const message = "MEMORY INTEGRITY FAIL: " + String(error && error.message || error);
        log("[ERR] " + message);
        out(message);
        return message;
    }
})();
