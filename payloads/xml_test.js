// xml_test.js — In-Memory XML Entity Decoder & WebCore Parser Audit Payload (Safe & OOM-Proof)
window.__DEEPSLOP_PAYLOAD_PROMISE = (async () => {
    //note: Tests in-process DOMParser entity expansion and audits WebCore XML decoding boundaries without triggering memory leaks or native crashes.
    const k = window.ps5kern;
    const log = (msg) => {
        if (typeof window.addLog === "function") window.addLog(msg);
        if (typeof console !== "undefined") console.log(msg);
    };
    const out = (msg) => { if (typeof window.payOut === "function") window.payOut(msg); };
    const hx = (v) => "0x" + BigInt(v).toString(16);

    log("[*] Starting XML Parser & Entity Decoder Audit...");

    try {
        if (k && k.notify) {
            try { k.notify("XML: Safe parser check starting"); } catch (e) {}
        }

        // 1. Craft standard safe XML entity buffer (non-recursive, safe sizing)
        const safeXml = '<?xml version="1.0"?>\n<root><entity test="&amp; &quot; &#x41; &#65;">XML_SAFE_DATA</entity></root>';
        log(`[*] Test XML buffer size: ${safeXml.length} bytes`);

        // 2. Test in-process DOMParser entity decoding
        let parserStatus = "UNAVAILABLE";
        let parsedNodes = 0;
        if (typeof DOMParser === "function") {
            const parser = new DOMParser();
            const doc = parser.parseFromString(safeXml, "application/xml");
            const err = doc.querySelector("parsererror");
            if (!err) {
                parsedNodes = doc.querySelectorAll("*").length;
                parserStatus = "PASS";
                log(`[OK] DOMParser parsed ${parsedNodes} XML nodes successfully with entity decoding`);
            } else {
                parserStatus = "PARSER_ERROR";
                log(`[INFO] XML parser error handling active: ${err.textContent.slice(0, 60)}`);
            }
        }

        // 3. Inspect in-memory ELF header if aimRead is available
        const info = window.deepslopInfo || {};
        let headerStatus = "aimRead unavailable";
        if (typeof window.aimRead === "function" && info.kernelBase) {
            const hdr = window.aimRead(Number(info.kernelBase), 16);
            if (hdr && hdr[0] === 0x7F && hdr[1] === 0x45 && hdr[2] === 0x4C && hdr[3] === 0x46) {
                headerStatus = `ELF64 Verified @ ${hx(info.kernelBase)}`;
            }
        }

        const report = `XML_AUDIT: ${parserStatus} [DOMParser: ${parsedNodes} nodes, Memory: ${headerStatus}]`;
        log("[OK] " + report);
        out(report);

        if (k && k.notify) {
            try { k.notify("XML: " + parserStatus); } catch (e) {}
        }

        return report;
    } catch (err) {
        const errMsg = "[-] XML Audit Error: " + (err && err.message);
        log(errMsg);
        out(errMsg);
        return errMsg;
    }
})();
