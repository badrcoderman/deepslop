// sprx_dump.js -- OOM-bounded, allowlisted in-memory SPRX dumper.
window.__DEEPSLOP_PAYLOAD_PROMISE = window.__DEEPSLOP_DUMP_PROMISE = (async () => {
    const MODULES = {
        "libkernel_web.sprx": "Verified runtime anchor",
        "libSceNKWebKit.sprx": "Verified WebKit runtime anchor",
        "libkernel.sprx": "Candidate; runtime base not verified",
        "libSceGvMp4Parser.sprx": "MP4 metadata / thumbnail parser",
        "libSceAvPlayer.sprx": "MP4 and TS playback parser",
        "libSceMetadataReaderWriter.sprx": "Metadata parser bridge",
        "libSceEditMp4.sprx": "MP4 editing and composition parser",
        "libSceWebmParserMdrw.sprx": "WebM thumbnail parser",
        "libSceContentSearch.sprx": "Media content-search consumer",
        "libSceAbstractStorage.sprx": "Abstract storage metadata consumer",
        "libSceAbstractLocal.sprx": "Local storage metadata consumer",
        "libSceIpmi.sprx": "System IPC framework",
    };
    const SPEEDS = {
        low: { chunk: 0x200, delay: 100 },
        medium: { chunk: 0x400, delay: 25 },
        high: { chunk: 0x800, delay: 0 },
    };
    const MAX_MODULE = 0x800000;
    const MAX_PHDR_BYTES = 0x1000;
    const request = window.__DEEPSLOP_DUMP_REQUEST || {};
    const preflightOnly = request.mode === "preflight";
    delete window.__DEEPSLOP_DUMP_REQUEST;

    const log = (message) => {
        if (typeof window.addLog === "function") window.addLog(message);
        if (typeof console !== "undefined" && console.log) console.log(message);
    };
    const out = (message) => {
        if (typeof window.payOut === "function") window.payOut(message);
        const box = document.getElementById("dumpStatus");
        if (box) box.textContent = message;
    };
    const status = (message) => {
        const box = document.getElementById("dumpStatus");
        if (box) box.textContent = message;
        if (typeof window.setDumpRowStatus === "function" && request.module)
            window.setDumpRowStatus(request.module, message, /STOPPED/.test(message) ? "bad" : "run");
        log("[DUMP] " + message);
    };
    const setProgress = (percent, sent, total, etaMs, state) => {
        if (typeof window.setDumpProgress === "function")
            window.setDumpProgress(percent, sent, total, etaMs, state);
    };
    const u16 = (bytes, offset) => bytes[offset] | (bytes[offset + 1] << 8);
    const u32 = (bytes, offset) => (bytes[offset] | (bytes[offset + 1] << 8)
        | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
    const u64 = (bytes, offset) => {
        let value = 0n;
        for (let index = 0; index < 8; index++) value |= BigInt(bytes[offset + index]) << BigInt(index * 8);
        return value;
    };
    const hex = (value) => "0x" + BigInt(value).toString(16);
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    function validAddress(value) {
        return Number.isSafeInteger(value) && value > 0x100000000 && value <= 0xffffffffffff;
    }

    function parseSegments(header, programHeaders, loadBias) {
        if (header.length < 0x40 || u32(header, 0) !== 0x464c457f
            || header[4] !== 2 || header[5] !== 1)
            throw new Error("module is not ELF64 little-endian");
        const phentsize = u16(header, 0x36);
        const phnum = u16(header, 0x38);
        if (phentsize < 0x38 || phentsize > 0x100 || phnum === 0 || phnum > 128)
            throw new Error("program-header bounds rejected");
        if (programHeaders.length < phentsize * phnum)
            throw new Error("program-header read incomplete");
        const segments = [];
        for (let index = 0; index < phnum; index++) {
            const offset = index * phentsize;
            if (u32(programHeaders, offset) !== 1) continue;
            const flags = u32(programHeaders, offset + 4);
            const pOffset = u64(programHeaders, offset + 8);
            const pVaddr = u64(programHeaders, offset + 0x10);
            const pFilesz = u64(programHeaders, offset + 0x20);
            const pMemsz = u64(programHeaders, offset + 0x28);
            if (pOffset > BigInt(MAX_MODULE)
                || pOffset + pFilesz > BigInt(MAX_MODULE)
                || pFilesz > BigInt(MAX_MODULE)
                || pMemsz < pFilesz)
                throw new Error("PT_LOAD size rejected");
            const source = BigInt(loadBias) + pVaddr;
            if (pFilesz > 0n && !validAddress(Number(source)))
                throw new Error("PT_LOAD address rejected");
            segments.push({
                index,
                flags: "0x" + flags.toString(16),
                address: hex(source),
                pOffset: Number(pOffset),
                pVaddr: hex(pVaddr),
                pFilesz: Number(pFilesz),
                pMemsz: hex(pMemsz),
            });
        }
        if (!segments.length) throw new Error("no PT_LOAD segments");
        return segments;
    }

    function normalizeModule(module) {
        if (!module || typeof module !== "object")
            throw new Error("module metadata is invalid");
        const base = Number(module.base ?? module.elfBase);
        const loadBias = Number(module.loadBias);
        const programHeaderAddress = Number(module.programHeaderAddress);
        if (!validAddress(base) || !validAddress(loadBias) || !validAddress(programHeaderAddress))
            throw new Error("verified module metadata is incomplete");
        return { ...module, base, loadBias, programHeaderAddress };
    }

    async function resolveModule(name) {
        const registry = window.deepslopModuleRegistry;
        if (registry && typeof registry.loadAndDescribe === "function"
            && (!registry.canDescribe || registry.canDescribe(name))) {
            return registry.loadAndDescribe(name);
        }
        const known = window.deepslopInfo && window.deepslopInfo.modules
            ? window.deepslopInfo.modules[name] : null;
        if (known) return known;
        throw new Error("verified 13.60 module loader is unavailable; refusing guessed base");
    }

    async function postJson(endpoint, body) {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            cache: "no-store",
        });
        if (!response.ok) throw new Error(endpoint + " returned HTTP " + response.status);
        return response.json();
    }

    async function pingReceiver(endpoint) {
        const response = await fetch(endpoint + "/ping", { cache: "no-store" });
        if (!response.ok) throw new Error("receiver ping returned HTTP " + response.status);
        const result = await response.json();
        if (!result || result.ok !== true) throw new Error("receiver ping was rejected");
        return result;
    }

    async function run() {
        const name = String(request.module || "");
        const speedName = String(request.speed || "low").toLowerCase();
        const speed = SPEEDS[speedName];
        const read = window.aimRead;
        const info = window.deepslopInfo || {};
        if (!MODULES[name]) throw new Error("module is not allowlisted");
        if (!speed) throw new Error("dump speed is invalid");
        if (String(info.fw || "") !== "13.60") throw new Error("exact firmware 13.60 required");
        if (typeof read !== "function") throw new Error("aimRead is unavailable");
        if (typeof fetch !== "function") throw new Error("fetch is unavailable");
        const endpoint = String(request.endpoint || "/__deepslop/dump").replace(/\/$/, "");
        const dumpId = "ds-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
        status(name + " / " + speedName.toUpperCase() + " / resolving module");
        const module = normalizeModule(await resolveModule(name));
        const base = module.base;
        const loadBias = module.loadBias;

        const header = read(base, 0x40);
        if (!header || header.length !== 0x40) throw new Error("ELF header read failed");
        const phoff = u64(header, 0x20);
        const phentsize = u16(header, 0x36);
        const phnum = u16(header, 0x38);
        const phBytes = BigInt(phentsize) * BigInt(phnum);
        if (phoff > 0x100000n || phBytes > BigInt(MAX_PHDR_BYTES))
            throw new Error("program-header request exceeds safety bound");
        const phAddress = module.programHeaderAddress;
        const programHeaders = read(phAddress, Number(phBytes));
        const segments = parseSegments(header, programHeaders, loadBias);
        const total = segments.reduce((sum, segment) => sum + segment.pFilesz, 0);
        if (total > MAX_MODULE) throw new Error("module total exceeds safety bound");
        status(name + " / " + (preflightOnly ? "PREFLIGHT" : speedName.toUpperCase()) + " / checking receiver");
        const receiver = await pingReceiver(endpoint);

        if (preflightOnly) {
            let verified = 0;
            const startedAt = Date.now();
            setProgress(0, 0, total, null, "run");
            for (const segment of segments) {
                for (let offset = 0; offset < segment.pFilesz; offset += speed.chunk) {
                    const length = Math.min(speed.chunk, segment.pFilesz - offset);
                    const source = Number(BigInt(loadBias) + BigInt(segment.pVaddr) + BigInt(offset));
                    if (!validAddress(source)) throw new Error("preflight source address rejected");
                    const bytes = read(source, length);
                    if (!bytes || bytes.length !== length)
                        throw new Error("preflight read failed at " + hex(source));
                    verified += length;
                    const elapsed = Math.max(1, Date.now() - startedAt);
                    const etaMs = verified ? Math.max(0, Math.round((total - verified) * elapsed / verified)) : null;
                    setProgress(total ? verified * 100 / total : 100, verified, total, etaMs, "run");
                    status(name + " / PREFLIGHT / verified " + verified + "/" + total + " bytes");
                    if (speed.delay) await sleep(speed.delay);
                    else await sleep(0);
                }
            }
            setProgress(100, total, total, 0, "ok");
            const message = "SPRX DUMP PREFLIGHT PASS\n" + JSON.stringify({
                module: name,
                firmware: info.fw,
                segments: segments.length,
                fileBackedBytes: total,
                verifiedBytes: verified,
                fullReadVerification: verified === total,
                receiver,
                readyForFullDump: true,
            }, null, 2);
            status(name + " / PREFLIGHT PASS");
            if (typeof window.setDumpRowStatus === "function")
                window.setDumpRowStatus(name, "PREFLIGHT PASS", "ok");
            out(message);
            return message;
        }

        await postJson(endpoint + "/start", {
            dumpId,
            firmware: String((window.deepslopInfo || {}).fw || ""),
            module: name,
            base: hex(base),
            loadBias: hex(loadBias),
            segments,
        });

        let sent = 0;
        const startedAt = Date.now();
        setProgress(0, 0, total, null, "run");
        for (const segment of segments) {
            for (let offset = 0; offset < segment.pFilesz; offset += speed.chunk) {
                const length = Math.min(speed.chunk, segment.pFilesz - offset);
                const source = Number(BigInt(loadBias) + BigInt(segment.pVaddr) + BigInt(offset));
                if (!validAddress(source)) throw new Error("chunk source address rejected");
                const chunk = read(source, length);
                if (!chunk || chunk.length !== length) throw new Error("chunk read failed at " + hex(source));
                const response = await fetch(endpoint + "/chunk", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/octet-stream",
                        "X-Dump-Id": dumpId,
                        "X-Module": name,
                        "X-Segment": String(segment.index),
                        "X-Offset": String(offset),
                    },
                    body: chunk,
                    cache: "no-store",
                });
                if (!response.ok) throw new Error("chunk upload HTTP " + response.status);
                const ack = await response.json();
                if (ack.nextOffset !== offset + length)
                    throw new Error("receiver acknowledgement mismatch");
                sent += length;
                const elapsed = Math.max(1, Date.now() - startedAt);
                const etaMs = sent ? Math.max(0, Math.round((total - sent) * elapsed / sent)) : null;
                setProgress(total ? sent * 100 / total : 100, sent, total, etaMs, "run");
                status(name + " / " + speedName.toUpperCase() + " / "
                    + sent + "/" + total + " bytes");
                if (speed.delay) await sleep(speed.delay);
                else await sleep(0);
            }
        }
        const finished = await postJson(endpoint + "/finish", { dumpId });
        setProgress(100, sent, total, 0, "ok");
        const message = "SPRX DUMP COMPLETE\n"
            + JSON.stringify({ module: name, speed: speedName, bytes: sent, dumpId, receiver: finished.manifest }, null, 2);
        status(name + " / complete");
        if (typeof window.setDumpRowStatus === "function")
            window.setDumpRowStatus(name, speedName.toUpperCase() + " / complete", "ok");
        out(message);
        return message;
    }

    try {
        await run();
    } catch (error) {
        const message = "SPRX DUMP STOPPED: " + String(error && error.message || error);
        setProgress(0, 0, 0, null, "bad");
        status(message);
        if (typeof window.setDumpRowStatus === "function" && request.module)
            window.setDumpRowStatus(request.module, "STOPPED", "bad");
        out(message);
    }
})();
