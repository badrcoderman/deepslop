/* kernel-stubs.js — pure kernel syscall-stub pattern scanner.
 *
 * libkernel syscall stubs start with `mov eax, <nr>` (b8 <nr> 00 00 00) and sit
 * in a compact table near the getpid export. We scan a small window around the
 * per-FW getpid stub (offsets.json "gpe") and cross-verify the results against
 * the per-FW getpid/close exports — wrong layout -> fallback (verified=false).
 *
 * Pure: no DOM, no exploit globals, no side effects. Used by both exploit.js
 * (browser) and tools/scan-test.js (Node) so the tested code is the shipped
 * code. readChunk(addr) must return a Uint8Array(0x100) of bytes at addr.
 */
(function (root) {
    "use strict";

    const STUB_PATTERNS = [
        ["getpid", 0x14], ["close", 0x06], ["open", 0x05], ["read", 0x03],
        ["write", 0x04], ["unlink", 0x0a], ["pipe", 0x2a], ["socket", 0x61],
        ["setsockopt", 0x69], ["getsockopt", 0x6a], ["fcntl", 0x5c],
        ["socketpair", 0x87], ["nanosleep", 0x1ab], ["thr_self", 0x1b0],
    ];
    const STUB_NR_BY_NAME = {};
    for (const [n, nr] of STUB_PATTERNS) STUB_NR_BY_NAME[nr] = n;
    const STUB_NR_SET = new Set(Object.keys(STUB_NR_BY_NAME).map(Number));

    const SCAN_WINDOW = 0x20000; // bytes on each side of the getpid anchor

    function scanKernelStubs(opts) {
        const out = { verified: false, addresses: {}, scannedChunks: 0 };
        try {
            const kernelBase = Number(opts.kernelBase);
            const anchor = kernelBase + Number(opts.getpidExport);
            //note: Reject malformed inputs before scanning. A false verification
            //must produce an unavailable table, never a guessed syscall address.
            if (!Number.isSafeInteger(kernelBase) || !Number.isSafeInteger(anchor)
                || typeof opts.readChunk !== "function") {
                out.error = "invalid scanner inputs";
                return out;
            }
            const windowStart = anchor - SCAN_WINDOW;
            const windowEnd = anchor + SCAN_WINDOW;
            const chunk = new Uint8Array(0x100);
            const byNr = {};
            const want = {};
            want[0x14] = anchor;
            want[0x06] = kernelBase + Number(opts.closeExport);

            for (let addr = windowStart; addr <= windowEnd; addr += 0x100) {
                const data = opts.readChunk(addr);
                out.scannedChunks++;
                if (!data || data.length < 0x100) continue;
                for (let i = 0; i < 0x100; ++i)
                    chunk[i] = data[i];
                for (let off = 0; off + 5 <= 0x100; ++off) {
                    if (chunk[off] !== 0xb8) continue;
                    const nr = chunk[off + 1]
                        + (chunk[off + 2] << 8)
                        + (chunk[off + 3] << 16)
                        + ((chunk[off + 4] << 24) >>> 0);
                    if (!STUB_NR_SET.has(nr)) continue;
                    if (byNr[nr] !== undefined) continue;
                    const stubAddr = addr + off;
                    if ((stubAddr & 0xf) > 1) continue;   // stubs align at +0/+1 mod 16
                    if (want[nr] !== undefined && want[nr] !== stubAddr) continue;
                    byNr[nr] = stubAddr;
                }
            }

            out.verified = byNr[0x14] === anchor
                && byNr[0x06] === kernelBase + Number(opts.closeExport);
            if (!out.verified) out.reason = "anchor-or-close-mismatch";
            for (const [name, nr] of STUB_PATTERNS) {
                if (byNr[nr] !== undefined)
                    out.addresses[name] = byNr[nr];
            }
        } catch (error) {
            out.error = String((error && error.message) || error).slice(0, 120);
        }
        return out;
    }

    const api = { scanKernelStubs, STUB_PATTERNS, STUB_NR_BY_NAME, SCAN_WINDOW };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else root.KernelStubScanner = api;
})(typeof window !== "undefined" ? window : globalThis);
