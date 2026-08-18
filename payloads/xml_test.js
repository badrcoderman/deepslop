// xml_test.js — In-memory libSceXml Entity Expansion Exploit Payload
(async () => {
    const k = window.ps5kern;
    if (!k) return "ps5kern unavailable — run exploit first";

    const log = (msg) => {
        if (window.addLog) window.addLog(msg);
        console.log(msg);
    };

    log("[*] Starting safe XML parser boundary check...");

    try {
            try { k.notify("XML: Safe parser check starting"); } catch (e) {}

        //note: Keep this test small and standards-based. The WebProcess does not
        //have a verified libSceXml module address, so constructing a stress input
        //would only exercise the local arena and create misleading OOM signals.
        const safeXml = "<?xml version=\"1.0\"?><root><data>safe</data></root>";

        log("[*] Safe XML buffer size: " + safeXml.length + " bytes");

        let parserStatus = "UNAVAILABLE";
        if (typeof DOMParser === "function") {
            const doc = new DOMParser().parseFromString(safeXml, "application/xml");
            parserStatus = doc && !doc.querySelector("parsererror") ? "PASS" : "FAIL";
        }
        log("[INFO] DOMParser safe-input verdict: " + parserStatus);

        //note: Native dispatch remains intentionally disabled. No internal
        //trampoline is treated as a parser function, and no guessed module base
        //or function address is called.
        const report = "XML_TEST: " + parserStatus + " (native libSceXml dispatch not attempted)";
        log((parserStatus === "PASS" ? "[OK] " : "[WARN] ") + report);
        try { k.notify("XML: " + parserStatus); } catch (e) {}
        return report;

    } catch (err) {
        const errMsg = "[-] XML Exploit Error: " + (err && err.message);
        log(errMsg);
        return errMsg;
    }
})();
