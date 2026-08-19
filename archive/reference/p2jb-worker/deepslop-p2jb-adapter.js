// deepslop-p2jb-adapter.js — capability-gated pooP2JB worker adapter.
(function () {
    "use strict";

    if (window.DeepSlopP2JB) return;

    const state = {
        profiles: {},
        selectedFirmware: null,
        workerLoaded: false,
        workerInitialized: false,
        scratch: null,
        loading: null,
    };

    const GADGET_NAMES = {
        "ret": "ret",
        "pop rsp": "pop_rsp",
        "pop rdi": "pop_rdi",
        "pop rsi": "pop_rsi",
        "pop rdx": "pop_rdx",
        "pop rcx": "pop_rcx",
        "pop rax": "pop_rax",
        "pop r8": "pop_r8",
        "pop r9": "pop_r9",
        "mov [rdi], rax": "mov_qword_rdi_rax",
    };

    const REQUIRED_GADGETS = [
        "pop_rsp", "pop_rdi", "pop_rsi", "pop_rax", "mov_qword_rdi_rax",
    ];

    function log(message) {
        if (typeof window.addLog === "function") window.addLog(message);
        if (typeof console !== "undefined" && console.log) console.log(message);
    }

    function currentFirmware() {
        const info = window.deepslopInfo || {};
        return String(info.fw || window.fw || "").trim();
    }

    function exactProfile(firmware) {
        return state.profiles[firmware] || null;
    }

    function workerFieldsComplete(profile) {
        if (!profile || !profile.libkernelWeb || !profile.libkernelWeb.worker) return false;
        const worker = profile.libkernelWeb.worker;
        return profile.status && profile.status.worker !== "unavailable"
            && [worker.threadList, worker.syscallWrapper, worker.setjmp,
                worker.longjmp, worker.pthreadCreate, worker.slotExpect]
            .every(function (value) { return value !== null && value !== undefined; });
    }

    function gadgetFields(profile) {
        const source = profile && profile.webkit && profile.webkit.gadgets;
        if (!source) return null;
        const base = Number((window.deepslopInfo || {}).webkitBase);
        if (!Number.isSafeInteger(base) || base <= 0) return null;
        const gadgets = {};
        for (const key of Object.keys(GADGET_NAMES)) {
            const offset = source[key];
            if (offset === null || offset === undefined) continue;
            gadgets[GADGET_NAMES[key]] = base + Number(offset);
        }
        return gadgets;
    }

    function gadgetsComplete(profile) {
        const gadgets = gadgetFields(profile);
        return !!gadgets && REQUIRED_GADGETS.every(function (name) {
            return Number.isSafeInteger(gadgets[name]) && gadgets[name] > 0;
        });
    }

    function profileEntries(document) {
        const profiles = document.profiles || {};
        if (Array.isArray(profiles))
            return profiles.filter(function (profile) { return profile && profile.firmware; })
                .map(function (profile) { return [String(profile.firmware), profile]; });
        return Object.keys(profiles).map(function (firmware) { return [firmware, profiles[firmware]]; });
    }

    function workerConfig(profile) {
        const info = window.deepslopInfo || {};
        const worker = profile.libkernelWeb.worker;
        return {
            kernelBase: info.kernelBase,
            webkitBase: info.webkitBase,
            gadgets: gadgetFields(profile),
            lk: {
                thread_list: worker.threadList,
                syscall_wrapper: worker.syscallWrapper,
                setjmp: worker.setjmp,
                longjmp: worker.longjmp,
                pthread_create: worker.pthreadCreate,
                slot_expect: worker.slotExpect,
                pthread_next: "0x38",
                pthread_stack: "0xa8",
                pthread_stacksz: "0xb0",
            },
        };
    }

    function capabilityReport(firmware) {
        const fw = firmware || currentFirmware();
        const profile = exactProfile(fw);
        const info = window.deepslopInfo || {};
        const primitiveReady = info.promotedReadWriteReady === true
            && typeof window.aimRead === "function"
            && typeof window.read64 === "function"
            && typeof window.write64 === "function";
        const workerBundle = typeof window.rop_worker === "object";
        const scratchReady = state.scratch !== null;
        const profileReady = workerFieldsComplete(profile);
        const gadgetReady = gadgetsComplete(profile);
        const canInitialize = !!(profileReady && gadgetReady && primitiveReady
            && workerBundle && scratchReady && state.workerInitialized);
        return {
            firmware: fw || "unknown",
            profile: profile,
            profileFound: !!profile,
            profileReady: profileReady,
            gadgetReady: gadgetReady,
            primitiveReady: primitiveReady,
            workerBundle: workerBundle,
            scratchReady: scratchReady,
            canInitialize: canInitialize,
            status: canInitialize ? "READY" : (!profile || !profileReady || !gadgetReady
                ? "UNAVAILABLE" : "BLOCKED"),
            reason: canInitialize ? null : (!profile
                ? "no exact firmware profile"
                : !profileReady
                    ? "worker profile is unavailable or incomplete"
                    : !gadgetReady
                        ? "worker gadget profile is unavailable or incomplete"
                        : !primitiveReady
                        ? "promoted read/write primitive is unavailable"
                        : !workerBundle
                            ? "worker bundle is not loaded"
                            : !scratchReady
                                ? "worker scratch arena is unavailable"
                                : "worker has not been initialized"),
        };
    }

    function updateUi(report) {
        const badges = ["p2jbProfileStatus", "p2jbDeckStatus"]
            .map(function (id) { return document.getElementById(id); }).filter(Boolean);
        const details = ["p2jbProfileDetail", "p2jbDeckDetail"]
            .map(function (id) { return document.getElementById(id); }).filter(Boolean);
        for (const badge of badges) {
            badge.textContent = report.status;
            badge.dataset.state = report.status.toLowerCase();
        }
        const source = report.profile && report.profile.source
            ? report.profile.source : "no exact profile";
        for (const detail of details)
            detail.textContent = source + " | " + (report.reason || "worker adapter ready");
    }

    async function loadProfiles() {
        const urls = [
            "profiles/deepslop_runtime_profiles.json",
            "profiles/poop2jb_profiles.json",
        ];
        const loaded = await Promise.all(urls.map(function (url) {
            return fetch(url + "?build=" + encodeURIComponent(window.DEEPSLOP_BUILD_ID || "v2")
                + "&_=" + Date.now()).then(function (response) {
                    if (!response.ok) throw new Error("profile request failed: " + response.status);
                    return response.json();
                });
        }));
        for (const document of loaded)
            for (const entry of profileEntries(document)) state.profiles[entry[0]] = entry[1];
        state.selectedFirmware = currentFirmware();
        const report = capabilityReport(state.selectedFirmware);
        updateUi(report);
        log("[P2JB] profile " + report.firmware + " -> " + report.status
            + (report.reason ? " (" + report.reason + ")" : ""));
        return report;
    }

    function loadWorkerBundle() {
        if (state.workerLoaded && window.rop_worker) return Promise.resolve(true);
        if (state.loading) return state.loading;
        state.loading = new Promise(function (resolve, reject) {
            const script = document.createElement("script");
            script.src = "adapters/poop2jb-rop-worker.js?build="
                + encodeURIComponent(window.DEEPSLOP_BUILD_ID || "v2") + "&_=" + Date.now();
            script.onload = function () {
                state.workerLoaded = typeof window.rop_worker === "object";
                state.loading = null;
                if (!state.workerLoaded) reject(new Error("pooP2JB worker API missing"));
                else resolve(true);
            };
            script.onerror = function () {
                state.loading = null;
                reject(new Error("pooP2JB worker asset failed to load"));
            };
            document.head.appendChild(script);
        });
        return state.loading;
    }

    async function check(firmware) {
        if (!Object.keys(state.profiles).length) await loadProfiles();
        const report = capabilityReport(firmware || currentFirmware());
        updateUi(report);
        if (typeof window.payOut === "function") window.payOut("P2JB PROFILE: " + JSON.stringify({
            firmware: report.firmware,
            status: report.status,
            profileReady: report.profileReady,
            primitiveReady: report.primitiveReady,
            workerBundle: report.workerBundle,
            scratchReady: report.scratchReady,
            reason: report.reason,
        }, null, 2));
        return report;
    }

    async function loadWorker() {
        const report = await check();
        if (!report.profileReady || !report.gadgetReady || !report.primitiveReady) {
            log("[WARN] [P2JB] worker load refused: " + report.reason);
            return report;
        }
        try {
            await loadWorkerBundle();
            const profile = exactProfile(report.firmware);
            const worker = window.rop_worker;
            const cfg = workerConfig(profile);
            //note: Configure first so survey can locate the parked worker stack;
            //the stack itself then provides the large scratch arena required by
            //the worker without relying on the 0x2000-byte DeepSlop arena.
            worker.configure(cfg);
            await worker.survey();
            state.scratch = worker.alloc(0x20000);
            worker.init(Object.assign({}, cfg, { scratch: state.scratch, scratchSize: 0x20000 }));
            state.workerInitialized = true;
            const updated = await check();
            log("[P2JB] worker initialized -> " + updated.status);
            return updated;
        } catch (error) {
            log("[ERR] [P2JB] " + String(error && error.message || error));
            state.workerInitialized = false;
            state.scratch = null;
            return Object.assign({}, report, {
                status: "FAIL",
                reason: String(error && error.message || error),
            });
        }
    }

    window.DeepSlopP2JB = {
        check: check,
        loadWorker: loadWorker,
        loadProfiles: loadProfiles,
        getProfile: exactProfile,
        capabilities: capabilityReport,
        state: state,
    };

    loadProfiles().catch(function (error) {
        log("[WARN] [P2JB] profile registry unavailable: " + String(error && error.message || error));
        updateUi(capabilityReport(currentFirmware()));
    });
})();
