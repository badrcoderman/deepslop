#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "payloads/sprx_dump.js"), "utf8");

async function main() {
    const base = 0x800000000;
    const header = new Uint8Array(0x40);
    const headerView = new DataView(header.buffer);
    headerView.setUint32(0, 0x464c457f, true);
    header[4] = 2;
    header[5] = 1;
    headerView.setBigUint64(0x20, 0x40n, true);
    headerView.setUint16(0x36, 0x38, true);
    headerView.setUint16(0x38, 1, true);

    const programHeader = new Uint8Array(0x38);
    const programView = new DataView(programHeader.buffer);
    programView.setUint32(0, 1, true);
    programView.setUint32(4, 5, true);
    programView.setBigUint64(8, 0n, true);
    programView.setBigUint64(0x10, 0n, true);
    programView.setBigUint64(0x20, 0x300n, true);
    programView.setBigUint64(0x28, 0x300n, true);

    const output = [];
    const progress = [];
    const nodes = new Map();
    const node = () => ({ textContent: "", style: {} });
    const window = {
        __DEEPSLOP_DUMP_REQUEST: {
            module: "libSceAvPlayer.sprx",
            mode: "preflight",
            speed: "low",
            endpoint: "/__deepslop/dump",
        },
        deepslopInfo: { fw: "13.60" },
        deepslopModuleRegistry: {
            loadAndDescribe: async () => ({
                base,
                loadBias: base,
                programHeaderAddress: base + 0x40,
            }),
        },
        addLog: () => {},
        payOut: (message) => output.push(message),
        setDumpRowStatus: () => {},
        setDumpProgress: (...args) => progress.push(args),
    };
    const document = {
        getElementById: (id) => {
            if (!nodes.has(id)) nodes.set(id, node());
            return nodes.get(id);
        },
    };
    let reads = 0;
    window.aimRead = (address, length) => {
        reads++;
        const numeric = Number(address);
        if (numeric === base && length === header.length) return header.slice();
        if (numeric === base + 0x40 && length === programHeader.length) return programHeader.slice();
        if (numeric === base && length === 0x200) return new Uint8Array(length);
        if (numeric === base && length === 0x100) return new Uint8Array(length);
        if (numeric === base + 0x200 && length === 0x100) return new Uint8Array(length);
        throw new Error("unexpected test read " + numeric.toString(16) + "/" + length);
    };

    const context = {
        window,
        document,
        console: { log: () => {} },
        fetch: async (url) => {
            assert.strictEqual(url, "/__deepslop/dump/ping");
            return { ok: true, status: 200, json: async () => ({ ok: true, maxChunk: 0x800 }) };
        },
        Uint8Array,
        BigInt,
        Date,
        Math,
        Number,
        String,
        Object,
        JSON,
        Promise,
        setTimeout,
    };
    vm.runInNewContext(source, context, { filename: "sprx_dump.js" });
    await window.__DEEPSLOP_DUMP_PROMISE;

    assert.strictEqual(reads, 4);
    assert.ok(output[0].startsWith("SPRX DUMP PREFLIGHT PASS"));
    assert.ok(output[0].includes('"readyForFullDump": true'));
    assert.ok(progress.some((entry) => entry[0] === 100 && entry[4] === "ok"));
    console.log("SPRX dump preflight contract: PASS");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
