(async () => {
    const log = (msg) => {
        if (window.addLog) window.addLog(msg);
        console.log(msg);
    };

    log("[*] HELLO WORLD payload running...");
    const msg = "HELLO WORLD from DeepSlop Userland RCE!";
    
    try {
        if (window.ps5kern && typeof window.ps5kern.notify === "function") {
            window.ps5kern.notify("HELLO WORLD: RCE Active");
        } else if (typeof window.send_notification === "function") {
            window.send_notification("HELLO WORLD: RCE Active");
        }
    } catch (e) {
        log("[WARN] Notification error: " + (e && e.message));
    }

    log("[OK] " + msg);
    return msg;
})();
