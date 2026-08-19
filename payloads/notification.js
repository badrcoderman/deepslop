window.__DEEPSLOP_PAYLOAD_PROMISE = (async () => {
    // notification.js — Send on-screen PS5 notification from active Userland RCE
    const log = (msg) => {
        if (window.addLog) window.addLog(msg);
        if (typeof console !== "undefined" && console.log) console.log(msg);
    };

    document.title = "PS5 RCE ACTIVE - " + new Date().toLocaleTimeString();

    try {
        const cap = document.getElementById("cap");
        if (cap) cap.textContent = "RCE ACTIVE - local payloads only";
        const status = document.getElementById("status-text");
        if (status) status.textContent = "RCE ACTIVE / notification payload";
    } catch (e) {}

    const text = "PS5 RCE: Notification Payload Executed";
    let sent = false;

    try {
        if (window.ps5kern && typeof window.ps5kern.notify === "function") {
            const res = window.ps5kern.notify(text);
            if (res && res.ok) sent = true;
        }
        if (!sent && typeof window.send_notification === "function") {
            sent = window.send_notification(text) === true;
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
