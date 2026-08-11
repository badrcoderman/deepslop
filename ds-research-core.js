/**
 * ds-research-core.js — DeepSlop Userland Research Framework
 *
 * Provides window.DSResearch namespace with:
 *   - Telemetry engine (structured result collection, JSON/CSV/text export)
 *   - Benchmark engine (run fn N times, compute stats)
 *   - Payload manager (manifest-driven registration, validation, execution)
 *   - Capability detection (probes browser APIs, caches results)
 *   - Firmware detection (UA parsing, WebKit build info)
 *   - Logging (leveled, forwarded to _ds.mark or console)
 *
 * Loading: <script src="ds-research-core.js"></script> or eval() via ws_server.
 * No ES modules. ES6 OK (PS5 WebKit 9.00+ handles const/let/arrow/BigInt).
 */
(function () {
    "use strict";

    if (window.DSResearch) return;

    // ── Firmware / environment detection ─────────────────────────────────────

    var _ds = window._ds || {};
    var _c  = _ds.c || {};

    function detectFirmware() {
        // From modular config
        if (_c.FW_LABEL && _c.FW_LABEL !== "??.??") return _c.FW_LABEL;
        // From UA
        var ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";
        var m = /PlayStation 5\/(\d+\.\d+)/.exec(ua);
        if (m) return m[1];
        return "unknown";
    }

    function detectWebKitVersion() {
        var ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";
        var m = /AppleWebKit\/(\d+(?:\.\d+)*)/.exec(ua);
        return m ? m[1] : "unknown";
    }

    var sessionId = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    var firmware = detectFirmware();
    var webkitVersion = detectWebKitVersion();

    // ── Logging ──────────────────────────────────────────────────────────────

    var LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
    var logLevel = LOG_LEVELS.INFO;
    var logHistory = [];

    function log(level, msg) {
        var lvl = LOG_LEVELS[level];
        if (lvl === undefined) lvl = LOG_LEVELS.INFO;
        if (lvl < logLevel) return;
        var entry = {
            ts: new Date().toISOString(),
            level: level,
            msg: msg
        };
        logHistory.push(entry);
        if (logHistory.length > 2000) logHistory.splice(0, 500);

        var formatted = "[DSR:" + level + "] " + msg;
        // Forward to exploit logging if available
        if (_ds && typeof _ds.mark === "function") {
            _ds.mark("DSR", level + " " + msg);
        }
        // Forward to dashboard log if available
        if (typeof window.addLog === "function") {
            window.addLog(formatted);
        }
        // Console
        if (typeof console !== "undefined") {
            if (level === "ERROR" && console.error) console.error(formatted);
            else if (level === "WARN" && console.warn) console.warn(formatted);
            else if (console.log) console.log(formatted);
        }
    }

    // ── Capability detection ─────────────────────────────────────────────────

    function probeCapability(name, testFn) {
        try {
            return !!testFn();
        } catch (e) {
            return false;
        }
    }

    function detectCapabilities() {
        var G = typeof globalThis !== "undefined" ? globalThis : window;
        return Object.freeze({
            bigInt: probeCapability("BigInt", function () { return typeof BigInt === "function" && BigInt(1) === 1n; }),
            symbol: probeCapability("Symbol", function () { return typeof Symbol === "function" && typeof Symbol() === "symbol"; }),
            proxy: probeCapability("Proxy", function () { return typeof Proxy === "function" && new Proxy({}, {}); }),
            weakRef: probeCapability("WeakRef", function () { return typeof WeakRef === "function" && new WeakRef({}); }),
            finalizationRegistry: probeCapability("FinalizationRegistry", function () { return typeof FinalizationRegistry === "function"; }),
            promiseAllSettled: probeCapability("Promise.allSettled", function () { return typeof Promise.allSettled === "function"; }),
            promiseAny: probeCapability("Promise.any", function () { return typeof Promise.any === "function"; }),
            optionalChaining: probeCapability("?.", function () { return eval("({a:{b:1}})?.a?.b") === 1; }),
            nullishCoalescing: probeCapability("??", function () { return eval("null ?? 42") === 42; }),
            arrayAt: probeCapability("Array.at", function () { return typeof [].at === "function"; }),
            structuredClone: probeCapability("structuredClone", function () { return typeof structuredClone === "function"; }),
            messageChannel: probeCapability("MessageChannel", function () { var c = new MessageChannel(); c.port1.close(); c.port2.close(); return true; }),
            webWorkers: probeCapability("Worker", function () { return typeof Worker === "function"; }),
            sharedArrayBuffer: probeCapability("SharedArrayBuffer", function () { return typeof SharedArrayBuffer === "function" && new SharedArrayBuffer(8); }),
            atomics: probeCapability("Atomics", function () { return typeof Atomics === "object" && typeof Atomics.wait === "function"; }),
            webAssembly: probeCapability("WebAssembly", function () { return typeof WebAssembly === "object" && typeof WebAssembly.compile === "function"; }),
            webGL: probeCapability("WebGL", function () {
                var c = document.createElement("canvas");
                var gl = c.getContext("webgl") || c.getContext("experimental-webgl");
                return !!gl;
            }),
            webGL2: probeCapability("WebGL2", function () {
                var c = document.createElement("canvas");
                return !!c.getContext("webgl2");
            }),
            webGPU: probeCapability("WebGPU", function () { return typeof navigator.gpu !== "undefined"; }),
            canvas2D: probeCapability("Canvas2D", function () {
                var c = document.createElement("canvas");
                return !!c.getContext("2d");
            }),
            offscreenCanvas: probeCapability("OffscreenCanvas", function () { return typeof OffscreenCanvas === "function" && new OffscreenCanvas(1, 1); }),
            indexedDB: probeCapability("IndexedDB", function () { return typeof indexedDB !== "undefined" && !!indexedDB; }),
            localStorage: probeCapability("localStorage", function () { localStorage.setItem("_dsr_test", "1"); localStorage.removeItem("_dsr_test"); return true; }),
            sessionStorage: probeCapability("sessionStorage", function () { sessionStorage.setItem("_dsr_test", "1"); sessionStorage.removeItem("_dsr_test"); return true; }),
            fetch: probeCapability("fetch", function () { return typeof fetch === "function"; }),
            webSocket: probeCapability("WebSocket", function () { return typeof WebSocket === "function"; }),
            xmlHttpRequest: probeCapability("XMLHttpRequest", function () { return typeof XMLHttpRequest === "function"; }),
            serviceWorker: probeCapability("ServiceWorker", function () { return "serviceWorker" in navigator; }),
            broadcastChannel: probeCapability("BroadcastChannel", function () { var c = new BroadcastChannel("_dsr_test"); c.close(); return true; }),
            abortController: probeCapability("AbortController", function () { return typeof AbortController === "function"; }),
            textEncoder: probeCapability("TextEncoder", function () { return typeof TextEncoder === "function" && new TextEncoder().encode("a").length === 1; }),
            textDecoder: probeCapability("TextDecoder", function () { return typeof TextDecoder === "function"; }),
            url: probeCapability("URL", function () { return typeof URL === "function" && new URL("http://x").href; }),
            urlSearchParams: probeCapability("URLSearchParams", function () { return typeof URLSearchParams === "function"; }),
            formData: probeCapability("FormData", function () { return typeof FormData === "function"; }),
            blob: probeCapability("Blob", function () { return typeof Blob === "function" && new Blob(["x"]).size === 1; }),
            file: probeCapability("File", function () { return typeof File === "function"; }),
            readableStream: probeCapability("ReadableStream", function () { return typeof ReadableStream === "function"; }),
            writableStream: probeCapability("WritableStream", function () { return typeof WritableStream === "function"; }),
            crypto: probeCapability("crypto", function () { return typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function"; }),
            subtleCrypto: probeCapability("SubtleCrypto", function () { return typeof crypto !== "undefined" && typeof crypto.subtle === "object"; }),
            performanceNow: probeCapability("performance.now", function () { return typeof performance !== "undefined" && typeof performance.now === "function"; }),
            performanceMemory: probeCapability("performance.memory", function () { return typeof performance !== "undefined" && typeof performance.memory === "object"; }),
            performanceMark: probeCapability("performance.mark", function () { return typeof performance !== "undefined" && typeof performance.mark === "function"; }),
            performanceObserver: probeCapability("PerformanceObserver", function () { return typeof PerformanceObserver === "function"; }),
            requestAnimationFrame: probeCapability("rAF", function () { return typeof requestAnimationFrame === "function"; }),
            requestIdleCallback: probeCapability("rIC", function () { return typeof requestIdleCallback === "function"; }),
            intersectionObserver: probeCapability("IntersectionObserver", function () { return typeof IntersectionObserver === "function"; }),
            resizeObserver: probeCapability("ResizeObserver", function () { return typeof ResizeObserver === "function"; }),
            mutationObserver: probeCapability("MutationObserver", function () { return typeof MutationObserver === "function"; }),
            audioContext: probeCapability("AudioContext", function () { return typeof (G.AudioContext || G.webkitAudioContext) === "function"; }),
            mediaDevices: probeCapability("mediaDevices", function () { return typeof navigator.mediaDevices !== "undefined"; }),
            gamepad: probeCapability("Gamepad", function () { return "getGamepads" in navigator; }),
            vibration: probeCapability("Vibration", function () { return "vibrate" in navigator; }),
            battery: probeCapability("Battery", function () { return "getBattery" in navigator; }),
            geolocation: probeCapability("Geolocation", function () { return "geolocation" in navigator; }),
            notification: probeCapability("Notification", function () { return typeof Notification === "function"; }),
        });
    }

    var capabilities = detectCapabilities();

    // ── Telemetry engine ─────────────────────────────────────────────────────

    var results = [];

    function recordResult(testName, data) {
        var entry = {
            timestamp: new Date().toISOString(),
            session: sessionId,
            firmware: firmware,
            webkit_version: webkitVersion,
            user_agent: (typeof navigator !== "undefined" && navigator.userAgent) || "",
            test: testName,
            data: data
        };
        results.push(entry);
        log("INFO", testName + " → " + (data.status || "recorded"));
        return entry;
    }

    function allResults() {
        return results.slice();
    }

    function exportJSON() {
        return JSON.stringify({
            framework: "DSResearch",
            version: "1.0.0",
            session: sessionId,
            firmware: firmware,
            webkit_version: webkitVersion,
            capabilities: capabilities,
            generated: new Date().toISOString(),
            results: results
        }, null, 2);
    }

    function exportCSV(testName) {
        var filtered = testName
            ? results.filter(function (r) { return r.test === testName; })
            : results;
        if (filtered.length === 0) return "";

        // Collect all data keys across entries
        var keys = {};
        for (var i = 0; i < filtered.length; i++) {
            var d = filtered[i].data;
            if (d && typeof d === "object") {
                for (var k in d) {
                    if (d.hasOwnProperty(k)) keys[k] = true;
                }
            }
        }
        var dataKeys = Object.keys(keys);
        var header = ["timestamp", "firmware", "test"].concat(dataKeys);
        var lines = [header.join(",")];

        for (var j = 0; j < filtered.length; j++) {
            var r = filtered[j];
            var row = [r.timestamp, r.firmware, r.test];
            for (var m = 0; m < dataKeys.length; m++) {
                var val = r.data ? r.data[dataKeys[m]] : "";
                if (val === undefined || val === null) val = "";
                else if (typeof val === "object") val = JSON.stringify(val);
                // Escape CSV
                val = String(val);
                if (val.indexOf(",") >= 0 || val.indexOf('"') >= 0 || val.indexOf("\n") >= 0) {
                    val = '"' + val.replace(/"/g, '""') + '"';
                }
                row.push(val);
            }
            lines.push(row.join(","));
        }
        return lines.join("\n");
    }

    function exportHuman() {
        var lines = [];
        lines.push("═══════════════════════════════════════════════════════════════");
        lines.push("  DeepSlop Research Report");
        lines.push("  Firmware: " + firmware + "  WebKit: " + webkitVersion);
        lines.push("  Session:  " + sessionId);
        lines.push("  Generated: " + new Date().toISOString());
        lines.push("═══════════════════════════════════════════════════════════════");
        lines.push("");

        // Group by test name
        var groups = {};
        for (var i = 0; i < results.length; i++) {
            var r = results[i];
            if (!groups[r.test]) groups[r.test] = [];
            groups[r.test].push(r);
        }

        for (var test in groups) {
            if (!groups.hasOwnProperty(test)) continue;
            lines.push("── " + test + " ──────────────────────────────────────────");
            var entries = groups[test];
            for (var j = 0; j < entries.length; j++) {
                var e = entries[j];
                lines.push("  [" + e.timestamp + "] " + (e.data.status || ""));
                var d = e.data;
                for (var k in d) {
                    if (!d.hasOwnProperty(k) || k === "status") continue;
                    var v = d[k];
                    if (typeof v === "object") v = JSON.stringify(v);
                    lines.push("    " + k + ": " + v);
                }
            }
            lines.push("");
        }
        return lines.join("\n");
    }

    // ── Benchmark engine ─────────────────────────────────────────────────────

    var perfNow = (typeof performance !== "undefined" && typeof performance.now === "function")
        ? function () { return performance.now(); }
        : function () { return Date.now(); };

    function computeStats(timings) {
        if (timings.length === 0) return { median_ms: 0, p95_ms: 0, min_ms: 0, max_ms: 0, mean_ms: 0, stddev_ms: 0 };
        var sorted = timings.slice().sort(function (a, b) { return a - b; });
        var n = sorted.length;
        var sum = 0;
        for (var i = 0; i < n; i++) sum += sorted[i];
        var mean = sum / n;
        var variance = 0;
        for (var j = 0; j < n; j++) {
            var diff = sorted[j] - mean;
            variance += diff * diff;
        }
        variance /= n;
        return {
            median_ms: sorted[Math.floor(n / 2)],
            p95_ms: sorted[Math.floor(n * 0.95)],
            min_ms: sorted[0],
            max_ms: sorted[n - 1],
            mean_ms: Math.round(mean * 1000) / 1000,
            stddev_ms: Math.round(Math.sqrt(variance) * 1000) / 1000,
        };
    }

    function bench(name, fn, opts) {
        opts = opts || {};
        var runs = opts.runs || 100;
        var warmup = opts.warmup || 3;
        var timeout_ms = opts.timeout_ms || 30000;
        var cooldown_ms = opts.cooldown_ms || 0;

        log("INFO", "bench(" + name + ") starting: " + runs + " runs, " + warmup + " warmup");

        // Warmup
        for (var w = 0; w < warmup; w++) {
            try { fn(); } catch (e) {}
        }

        var timings = [];
        var successes = 0;
        var failures = 0;
        var errors = [];
        var start = perfNow();

        for (var i = 0; i < runs; i++) {
            if (perfNow() - start > timeout_ms) {
                log("WARN", "bench(" + name + ") timeout at iteration " + i);
                break;
            }
            var t0 = perfNow();
            try {
                fn();
                var t1 = perfNow();
                timings.push(t1 - t0);
                successes++;
            } catch (e) {
                failures++;
                if (errors.length < 5) errors.push(String(e));
            }
        }

        var stats = computeStats(timings);
        var result = {
            status: successes > 0 ? "AVAILABLE" : "FAILED",
            test: name,
            runs: runs,
            completed: successes + failures,
            successes: successes,
            failures: failures,
            timeouts: runs - (successes + failures),
            median_ms: stats.median_ms,
            p95_ms: stats.p95_ms,
            min_ms: stats.min_ms,
            max_ms: stats.max_ms,
            mean_ms: stats.mean_ms,
            stddev_ms: stats.stddev_ms,
            total_ms: Math.round((perfNow() - start) * 1000) / 1000,
            errors: errors.length > 0 ? errors : undefined
        };
        recordResult(name, result);
        return result;
    }

    async function benchAsync(name, fn, opts) {
        opts = opts || {};
        var runs = opts.runs || 100;
        var warmup = opts.warmup || 3;
        var timeout_ms = opts.timeout_ms || 30000;

        log("INFO", "benchAsync(" + name + ") starting: " + runs + " runs");

        for (var w = 0; w < warmup; w++) {
            try { await fn(); } catch (e) {}
        }

        var timings = [];
        var successes = 0;
        var failures = 0;
        var errors = [];
        var start = perfNow();

        for (var i = 0; i < runs; i++) {
            if (perfNow() - start > timeout_ms) {
                log("WARN", "benchAsync(" + name + ") timeout at iteration " + i);
                break;
            }
            var t0 = perfNow();
            try {
                await fn();
                var t1 = perfNow();
                timings.push(t1 - t0);
                successes++;
            } catch (e) {
                failures++;
                if (errors.length < 5) errors.push(String(e));
            }
        }

        var stats = computeStats(timings);
        var result = {
            status: successes > 0 ? "AVAILABLE" : "FAILED",
            test: name,
            runs: runs,
            completed: successes + failures,
            successes: successes,
            failures: failures,
            timeouts: runs - (successes + failures),
            median_ms: stats.median_ms,
            p95_ms: stats.p95_ms,
            min_ms: stats.min_ms,
            max_ms: stats.max_ms,
            mean_ms: stats.mean_ms,
            stddev_ms: stats.stddev_ms,
            total_ms: Math.round((perfNow() - start) * 1000) / 1000,
            errors: errors.length > 0 ? errors : undefined
        };
        recordResult(name, result);
        return result;
    }

    // ── Payload manager ──────────────────────────────────────────────────────

    var payloads = {};    // name → { manifest, runFn, lastResult }

    function parseFw(fw) {
        var parts = String(fw).split(".");
        return (parseInt(parts[0], 10) || 0) * 100 + (parseInt(parts[1], 10) || 0);
    }

    function register(manifest, runFn) {
        if (!manifest || !manifest.name) {
            log("ERROR", "register: manifest missing name");
            return;
        }
        if (typeof runFn !== "function") {
            log("ERROR", "register(" + manifest.name + "): runFn not a function");
            return;
        }
        payloads[manifest.name] = {
            manifest: manifest,
            runFn: runFn,
            lastResult: null,
            status: "NOT_TESTED"
        };
        log("DEBUG", "registered payload: " + manifest.name + " (" + (manifest.category || "uncategorized") + ")");
    }

    function validate(name) {
        var p = payloads[name];
        if (!p) return { valid: false, reason: "Payload not registered: " + name };

        var m = p.manifest;
        var fwNum = parseFw(firmware);
        var minFw = parseFw(m.minimum_firmware || "0.00");
        var maxFw = parseFw(m.maximum_firmware || "99.99");

        if (firmware !== "unknown" && fwNum < minFw) {
            return { valid: false, reason: "Firmware " + firmware + " below minimum " + m.minimum_firmware };
        }
        if (firmware !== "unknown" && fwNum > maxFw) {
            return { valid: false, reason: "Firmware " + firmware + " above maximum " + m.maximum_firmware };
        }

        // Check required capabilities
        var reqs = m.required_capabilities || [];
        for (var i = 0; i < reqs.length; i++) {
            if (!capabilities[reqs[i]]) {
                return { valid: false, reason: "Missing capability: " + reqs[i] };
            }
        }

        return { valid: true };
    }

    async function run(name, opts) {
        opts = opts || {};
        var p = payloads[name];
        if (!p) {
            log("ERROR", "run: unknown payload: " + name);
            return { status: "FAILED", error: "Unknown payload: " + name };
        }

        var v = validate(name);
        if (!v.valid) {
            log("WARN", "run(" + name + "): validation failed: " + v.reason);
            p.status = "UNAVAILABLE";
            var skipped = { status: "UNAVAILABLE", reason: v.reason };
            p.lastResult = skipped;
            recordResult(name, skipped);
            return skipped;
        }

        log("INFO", "running payload: " + name);
        var t0 = perfNow();
        var timeout = opts.timeout_ms || p.manifest.estimated_duration_ms || 30000;

        try {
            var result = await Promise.race([
                Promise.resolve(p.runFn(opts)),
                new Promise(function (_, reject) {
                    setTimeout(function () { reject(new Error("Timeout after " + timeout + "ms")); }, timeout);
                })
            ]);
            result = result || {};
            result.duration_ms = Math.round((perfNow() - t0) * 1000) / 1000;
            p.lastResult = result;
            p.status = result.status || "AVAILABLE";
            recordResult(name, result);
            return result;
        } catch (e) {
            var failed = {
                status: "FAILED",
                error: String(e),
                duration_ms: Math.round((perfNow() - t0) * 1000) / 1000
            };
            p.lastResult = failed;
            p.status = "FAILED";
            recordResult(name, failed);
            return failed;
        }
    }

    async function runAll(category, opts) {
        opts = opts || {};
        var names = Object.keys(payloads);
        if (category) {
            names = names.filter(function (n) {
                return payloads[n].manifest.category === category;
            });
        }
        names.sort();
        log("INFO", "runAll: " + names.length + " payloads" + (category ? " in category " + category : ""));

        var results = [];
        for (var i = 0; i < names.length; i++) {
            var r = await run(names[i], opts);
            results.push({ name: names[i], result: r });
        }
        return results;
    }

    function list() {
        var out = [];
        for (var name in payloads) {
            if (!payloads.hasOwnProperty(name)) continue;
            var p = payloads[name];
            out.push({
                name: name,
                version: p.manifest.version || "1.0.0",
                description: p.manifest.description || "",
                category: p.manifest.category || "uncategorized",
                status: p.status,
                firmware_range: (p.manifest.minimum_firmware || "0.00") + " – " + (p.manifest.maximum_firmware || "99.99"),
                required_capabilities: p.manifest.required_capabilities || [],
                estimated_duration_ms: p.manifest.estimated_duration_ms || 0
            });
        }
        return out;
    }

    // ── Comparison utility (for use in Node.js tools or dashboard) ───────────

    function compareReports(a, b) {
        var delta = {
            firmware: { a: a.firmware, b: b.firmware },
            webkit_version: { a: a.webkit_version, b: b.webkit_version },
            capability_diff: {},
            result_diff: {}
        };

        // Capability diffs
        var allCaps = {};
        var aCaps = a.capabilities || {};
        var bCaps = b.capabilities || {};
        for (var k in aCaps) allCaps[k] = true;
        for (var k2 in bCaps) allCaps[k2] = true;
        for (var cap in allCaps) {
            if (aCaps[cap] !== bCaps[cap]) {
                delta.capability_diff[cap] = { a: !!aCaps[cap], b: !!bCaps[cap] };
            }
        }

        // Result diffs (by test name)
        var aResults = {};
        var bResults = {};
        (a.results || []).forEach(function (r) { aResults[r.test] = r.data; });
        (b.results || []).forEach(function (r) { bResults[r.test] = r.data; });

        var allTests = {};
        for (var t1 in aResults) allTests[t1] = true;
        for (var t2 in bResults) allTests[t2] = true;

        for (var test in allTests) {
            var ra = aResults[test];
            var rb = bResults[test];
            if (!ra) {
                delta.result_diff[test] = { status: "only_in_b", b: rb };
            } else if (!rb) {
                delta.result_diff[test] = { status: "only_in_a", a: ra };
            } else if (ra.status !== rb.status) {
                delta.result_diff[test] = { status: "status_changed", a: ra.status, b: rb.status };
            } else if (ra.median_ms !== undefined && rb.median_ms !== undefined) {
                var pctChange = ra.median_ms > 0
                    ? Math.round((rb.median_ms - ra.median_ms) / ra.median_ms * 10000) / 100
                    : 0;
                if (Math.abs(pctChange) > 5) {
                    delta.result_diff[test] = {
                        status: "timing_changed",
                        a_median_ms: ra.median_ms,
                        b_median_ms: rb.median_ms,
                        change_pct: pctChange
                    };
                }
            }
        }

        return delta;
    }

    // ── Public API ───────────────────────────────────────────────────────────

    window.DSResearch = Object.freeze({
        // Metadata
        version: "1.0.0",
        sessionId: sessionId,
        firmware: firmware,
        webkitVersion: webkitVersion,
        capabilities: capabilities,

        // Logging
        log: log,
        setLogLevel: function (level) {
            if (LOG_LEVELS[level] !== undefined) logLevel = LOG_LEVELS[level];
        },
        getLogHistory: function () { return logHistory.slice(); },

        // Telemetry
        result: recordResult,
        allResults: allResults,
        exportJSON: exportJSON,
        exportCSV: exportCSV,
        exportHuman: exportHuman,

        // Benchmarks
        bench: bench,
        benchAsync: benchAsync,
        computeStats: computeStats,
        perfNow: perfNow,

        // Payload manager
        register: register,
        validate: validate,
        run: run,
        runAll: runAll,
        list: list,

        // Comparison
        compareReports: compareReports,

        // Internals (for payload use)
        _parseFw: parseFw,
        _probeCapability: probeCapability,
    });

    log("INFO", "DSResearch v1.0.0 initialized — FW " + firmware + " WebKit " + webkitVersion);
    log("INFO", "Capabilities: " + Object.keys(capabilities).filter(function (k) { return capabilities[k]; }).length
        + "/" + Object.keys(capabilities).length + " available");

})();
