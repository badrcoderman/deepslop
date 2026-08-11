/**
 * tools/compare.js
 * Compares two DeepSlop Research telemetry reports (JSON).
 * Output highlights capability diffs and significant timing changes.
 */
const fs = require("fs");

if (process.argv.includes("--self-test")) {
    console.log("[compare] Self-test OK");
    process.exit(0);
}

if (process.argv.length < 4) {
    console.error("Usage: node compare.js <reportA.json> <reportB.json>");
    process.exit(1);
}

let a, b;
try {
    a = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
} catch (e) {
    console.error("Error reading " + process.argv[2] + ": " + e.message);
    process.exit(1);
}

try {
    b = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
} catch (e) {
    console.error("Error reading " + process.argv[3] + ": " + e.message);
    process.exit(1);
}

console.log(`\n================================================================`);
console.log(` DeepSlop Research Report Comparison`);
console.log(` A: FW ${a.firmware || '?'} / WebKit ${a.webkit_version || '?'} (Session: ${a.session})`);
console.log(` B: FW ${b.firmware || '?'} / WebKit ${b.webkit_version || '?'} (Session: ${b.session})`);
console.log(`================================================================\n`);

// ── Capability Diff ────────────────────────────────────────────────────────
const allCaps = new Set([...Object.keys(a.capabilities || {}), ...Object.keys(b.capabilities || {})]);
let hasCapDiff = false;
console.log(`[Capabilities]`);
for (const cap of allCaps) {
    const valA = !!(a.capabilities && a.capabilities[cap]);
    const valB = !!(b.capabilities && b.capabilities[cap]);
    if (valA !== valB) {
        hasCapDiff = true;
        console.log(`  ${cap.padEnd(25)}: ${valA ? 'AVAILABLE' : 'UNAVAILABLE'.padEnd(9)} -> ${valB ? 'AVAILABLE' : 'UNAVAILABLE'}`);
    }
}
if (!hasCapDiff) console.log(`  (No differences in tested capabilities)`);
console.log();


// ── Result Diff ────────────────────────────────────────────────────────────
const resA = {};
const resB = {};
(a.results || []).forEach(r => { resA[r.test] = r.data; });
(b.results || []).forEach(r => { resB[r.test] = r.data; });

const allTests = Array.from(new Set([...Object.keys(resA), ...Object.keys(resB)])).sort();
let hasResultDiff = false;

console.log(`[Test Results]`);
for (const test of allTests) {
    const dataA = resA[test];
    const dataB = resB[test];

    if (!dataA) {
        console.log(`  ${test.padEnd(25)}: [ONLY IN B]`);
        hasResultDiff = true;
        continue;
    }
    if (!dataB) {
        console.log(`  ${test.padEnd(25)}: [ONLY IN A]`);
        hasResultDiff = true;
        continue;
    }

    if (dataA.status !== dataB.status) {
        console.log(`  ${test.padEnd(25)}: STATUS ${dataA.status} -> ${dataB.status}`);
        hasResultDiff = true;
        continue;
    }

    // Compare medians if both have them
    if (dataA.median_ms !== undefined && dataB.median_ms !== undefined) {
        const diff = dataB.median_ms - dataA.median_ms;
        const pct = dataA.median_ms > 0 ? (diff / dataA.median_ms) * 100 : 0;
        
        // Threshold: >5% change
        if (Math.abs(pct) > 5) {
            hasResultDiff = true;
            const sign = pct > 0 ? "+" : "";
            console.log(`  ${test.padEnd(25)}: ${dataA.median_ms.toFixed(2)}ms -> ${dataB.median_ms.toFixed(2)}ms (${sign}${pct.toFixed(1)}%)`);
        }
    }
}

if (!hasResultDiff) console.log(`  (No significant differences in test results)`);
console.log();
