#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const adapterSource = fs.readFileSync(path.join(root, "adapters", "deepslop-p2jb-adapter.js"), "utf8");
const runtimeProfiles = JSON.parse(fs.readFileSync(path.join(root, "profiles", "deepslop_runtime_profiles.json"), "utf8"));
const poop2jbProfiles = JSON.parse(fs.readFileSync(path.join(root, "profiles", "poop2jb_profiles.json"), "utf8"));

async function loadAdapter(firmware, primitiveReady, promotedReadWriteReady = primitiveReady) {
    const elements = new Map();
    for (const id of ["p2jbProfileStatus", "p2jbDeckStatus", "p2jbProfileDetail", "p2jbDeckDetail"])
        elements.set(id, { textContent: "", dataset: {} });
    const window = {
        fw: firmware,
        deepslopInfo: {
            fw: firmware,
            primitiveReady,
            promotedReadWriteReady,
            webkitBase: 0x100000000,
            kernelBase: 0x200000000,
        },
        aimRead: primitiveReady ? function () {} : undefined,
        read64: primitiveReady ? function () { return 0n; } : undefined,
        write64: primitiveReady ? function () {} : undefined,
        addLog: function () {},
        payOut: function () {},
    };
    const document = {
        getElementById: function (id) { return elements.get(id) || null; },
        createElement: function () { return {}; },
        head: { appendChild: function () {} },
    };
    const context = {
        window,
        document,
        console,
        Promise,
        Date,
        encodeURIComponent,
        fetch: function (url) {
            const body = url.includes("deepslop_runtime_profiles") ? runtimeProfiles : poop2jbProfiles;
            return Promise.resolve({ ok: true, json: function () { return Promise.resolve(body); } });
        },
    };
    vm.runInNewContext(adapterSource, context, { filename: "deepslop-p2jb-adapter.js" });
    await window.DeepSlopP2JB.loadProfiles();
    return window.DeepSlopP2JB;
}

(async function () {
    const target = await loadAdapter("13.60", true);
    assert.strictEqual(target.getProfile("13.60").status.worker, "unavailable");
    assert.strictEqual(target.capabilities("13.60").status, "UNAVAILABLE");

    const profiled = await loadAdapter("12.70", true);
    assert.strictEqual(profiled.getProfile("12.70").status.worker, "hardware-reported");
    assert.strictEqual(profiled.capabilities("12.70").profileReady, true);
    assert.strictEqual(profiled.capabilities("12.70").gadgetReady, true);
    assert.strictEqual(profiled.capabilities("12.70").status, "BLOCKED");

    const unpromoted = await loadAdapter("12.70", false);
    assert.strictEqual(unpromoted.capabilities("12.70").primitiveReady, false);
    assert.strictEqual(unpromoted.capabilities("12.70").status, "BLOCKED");

    const notificationOnly = await loadAdapter("12.70", true, false);
    assert.strictEqual(notificationOnly.capabilities("12.70").primitiveReady, false);
    assert.strictEqual(notificationOnly.capabilities("12.70").reason, "promoted read/write primitive is unavailable");

    console.log("p2jb adapter runtime contract: PASS");
})().catch(function (error) {
    console.error(error);
    process.exitCode = 1;
});
