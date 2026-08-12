(async () => {
    // notification.js — Send on-screen PS5 notification from active Userland RCE
    const log = (msg) => {
        if (window.addLog) window.addLog(msg);
        console.log(msg);
    };

    document.title = "PS5 RCE ACTIVE - " + new Date().toLocaleTimeString();

    try {
        const cap = document.getElementById("cap");
        if (cap) cap.textContent = "RCE ACTIVE - Remote JS OK";
        const status = document.getElementById("status");
        if (status) { status.textContent = "Remote JS Connected"; status.className = "ok"; }
    } catch (e) {}

    const text = "PS5 RCE: Notification Payload Executed";
    let sent = false;

    try {
        if (window.ps5kern && typeof window.ps5kern.notify === "function") {
            const res = window.ps5kern.notify(text);
            if (res && res.ok) sent = true;
        }
        if (!sent && typeof window.send_notification === "function") {
            window.send_notification(text);
            sent = true;
        }
    } catch (e) {
        log("[WARN] Notification send failed: " + (e && e.message));
    }

    if (window._ds && typeof window._ds.mark === "function") {
        window._ds.mark("NOTIF-TEST", "notification.js executed successfully");
    }

    const msg = sent ? "Notification sent successfully" : "Notification queued/logged";
    log("[OK] " + msg);
    return msg;
})();
