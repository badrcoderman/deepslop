#!/usr/bin/env node
/* tools/scan-test.js — executable test for the kernel syscall-stub scanner.
 *
 * Builds a synthetic libkernel dump per firmware with the getpid/close stubs
 * planted at the offsets.json exports, plus extra stubs, decoys and misaligned
 * patterns. Runs the REAL shipped scanner (kernel-stubs.js — the same module
 * exploit.js delegates to) and asserts the expected layout.
 *
 * Usage: node tools/scan-test.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { scanKernelStubs, STUB_NR_BY_NAME } = require("../kernel-stubs.js");

const OFFSETS = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "offsets", "offsets.json"), "utf8"));
const KERNEL_BASE = 0x40000000;      // synthetic base, page-aligned
const WINDOW = 0x20000;              // must match kernel-stubs.js SCAN_WINDOW
const NR = { getpid: 0x14, close: 0x06, pipe: 0x2a, thr_self: 0x1b0, unlink: 0x0a };

function plant(dump, abs, nr) {
    dump[abs] = 0xb8;
    dump[abs + 1] = nr & 0xff;
    dump[abs + 2] = (nr >> 8) & 0xff;
    dump[abs + 3] = (nr >> 16) & 0xff;
    dump[abs + 4] = (nr >> 24) & 0xff;
}

/* Realistic libkernel: stubs sit ~0x10-0x40 apart, aligned at +0/+1 mod 16.
 * We place them at the canonical offsets used by the scanner's checks. */
function makeDump(o) {
    const gpe = parseInt(o.gpe, 16);
    const cle = parseInt(o.cle, 16);
    if (!(gpe > 0 && cle > 0)) throw new Error("bad offsets: gpe/cle missing");
    const gap = cle - gpe;
    if (gap > 2 * WINDOW) {
        throw new Error(`FW gap gpe->cle = 0x${gap.toString(16)} > window 0x${(2 * WINDOW).toString(16)} — close stub would be OUT OF SCAN WINDOW (scanner cannot verify this FW!)`);
    }
    const anchor = KERNEL_BASE + gpe;
    const start = anchor - WINDOW;
    const size = 2 * WINDOW + Math.max(0, gap) + 0x200; // cover [anchor±WINDOW]
    const dump = new Uint8Array(size + 0x100);
    const rel = a => a - start;

    const plantAt = (abs, nr) => plant(dump, rel(abs), nr);

    // Core exports (must be found exactly):
    plantAt(anchor, NR.getpid);
    plantAt(KERNEL_BASE + cle, NR.close);

    // Extra stubs inside the window (must be found):
    const extra = [
        [anchor + 0x300, NR.pipe],
        [anchor + 0x1f0, NR.unlink],
        [anchor + 0x4a0, NR.thr_self],
    ];
    for (const [a, nr] of extra) plantAt(a, nr);

    // Decoys (must be IGNORED):
    const decoys = [];
    // 1) syscall nr that is not in the watched set:
    decoys.push([anchor + 0x280, 0x777]);
    // 2) nr in set but at an unaligned address (&0xf == 2):
    const misaligned = anchor + 0x1000 + 2;
    decoys.push([misaligned, NR.pipe]);
    // 3) nr in set, aligned, but WRONG address for the wanted getpid slot:
    decoys.push([anchor - 0x180, NR.getpid]);
    for (const [a, nr] of decoys) plantAt(a, nr);

    return { dump, start, anchor, gpe, cle, extra: extra.map(e => e[0]), decoys };
}

let failures = 0;
function check(label, cond, extra) {
    if (!cond) {
        failures++;
        console.log(`  ✗ FAIL ${label}${extra ? " — " + extra : ""}`);
    } else {
        console.log(`  ✓ ${label}`);
    }
}

let first = true;
for (const fw of Object.keys(OFFSETS)) {
    const o = OFFSETS[fw];
    let env;
    try {
        env = makeDump(o);
    } catch (e) {
        if (first) console.log(`\n⚠ ${e.message}\n`);
        failures++;
        first = false;
        continue;
    }
    first = false;
    const { dump, start, anchor, gpe, cle } = env;
    const readChunk = addr => dump.slice(addr - start, addr - start + 0x100);

    let res;
    try {
        res = scanKernelStubs({ kernelBase: KERNEL_BASE, getpidExport: gpe, closeExport: cle, readChunk });
    } catch (e) {
        failures++;
        console.log(`  ✗ ${fw} THREW: ${e.message}`);
        continue;
    }

    const label = `FW ${fw} (gpe=0x${gpe.toString(16)} cle=0x${cle.toString(16)})`;
    check(label + " — verified", res.verified === true, JSON.stringify(res));
    check(label + " — getpid == anchor", res.addresses.getpid === anchor);
    check(label + " — close == export", res.addresses.close === KERNEL_BASE + cle);
    check(label + " — pipe found", res.addresses.pipe === anchor + 0x300);
    check(label + " — unlink found", res.addresses.unlink === anchor + 0x1f0);
    check(label + " — thr_self found", res.addresses.thr_self === anchor + 0x4a0);
    check(label + " — decoy nr-0x777 ignored", res.addresses[STUB_NR_BY_NAME[0x777]] === undefined);
    check(label + " — misaligned pipe ignored", res.addresses.pipe === anchor + 0x300);
    check(label + " — wrong-want getpid ignored", res.addresses.getpid === anchor);
}

/* Negative: empty kernel (no stubs) -> verified=false, no throw, no error. */
console.log("\n— negative: empty kernel —");
{
    const o = OFFSETS["13.60"];
    const gpe = parseInt(o.gpe, 16);
    const cle = parseInt(o.cle, 16);
    const start = KERNEL_BASE + gpe - WINDOW;
    const dump = new Uint8Array(2 * WINDOW + 0x200);
    const res = scanKernelStubs({
        kernelBase: KERNEL_BASE, getpidExport: gpe, closeExport: cle,
        readChunk: addr => dump.slice(addr - start, addr - start + 0x100),
    });
    check("verified === false", res.verified === false);
    check("no error set", res.error === undefined, res.error);
}

/* Negative: readChunk throws -> caught, error surfaced. */
console.log("\n— negative: read fault —");
{
    const o = OFFSETS["13.60"];
    const res = scanKernelStubs({
        kernelBase: KERNEL_BASE, getpidExport: parseInt(o.gpe, 16),
        closeExport: parseInt(o.cle, 16),
        readChunk: () => { throw new Error("page fault"); },
    });
    check("verified === false", res.verified === false);
    check("error surfaced", /page fault/.test(res.error || ""), res.error);
}

console.log(failures === 0
    ? `\n✅ ALL PASS — ${Object.keys(OFFSETS).length} FWs + negatives`
    : `\n❌ ${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
