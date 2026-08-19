#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));

const page = read("index.html");
const exploit = read("exploit.js");
const sprxDump = read("payloads/sprx_dump.js");
const hosting = read("HOSTING.md");
const manifest = JSON.parse(read("payloads/manifest.json"));
const researchManifest = JSON.parse(read("research/payloads/manifest.json"));

assert.ok(page.includes("RUN USERLAND RCE"));
assert.ok(page.includes("P2JB/Poopsploit launcher surface"));
assert.ok(!page.includes("userland.html"));
assert.ok(!page.includes("p2jb.js"));
assert.ok(page.includes("kernel-stubs.js"));
assert.ok(page.includes("exploit.js?"));
for (const id of ["cap", "cat", "scr", "status-banner", "btnRun", "btnProbe", "payloadCard", "log"])
    assert.ok(page.includes("id=\"" + id + "\""), "missing exploit surface anchor: " + id);
assert.ok(page.indexOf("kernel-stubs.js") < page.indexOf("exploit.js?"));
assert.ok(!page.includes("DeepSlopP2JB"));
assert.ok(!page.includes("adapters/"));
assert.ok(page.includes("payloads/manifest.json"));
assert.ok(page.includes('id="dumpCard"'));
assert.ok(page.includes('id="dumpTargets"'));
assert.ok(page.includes('id="dumpEndpoint"'));
assert.ok(page.includes('id="dumpProgressFill"'));
assert.ok(page.includes('id="btnClearRuntimeLog"'));
assert.ok(page.includes('id="btnClearPayloadOutput"'));
assert.ok(!page.includes('id="memoryProfile"'));
assert.ok(!page.includes("background: #0c0c0f"));
assert.ok(page.includes("radial-gradient(ellipse at 50% -10%"));
assert.ok(hosting.includes("دليل استضافة DeepSlop"));
assert.ok(hosting.includes("tools/sprx_dump_receiver.py"));
assert.ok(page.includes("PREFLIGHT PASS"));
for (const speed of ["low", "medium", "high"])
    assert.ok(page.includes('data-speed="' + speed + '"'), "missing dump speed: " + speed);
assert.strictEqual((page.match(/class="dump-start" disabled/g) || []).length, 12);
assert.strictEqual((page.match(/class="dump-check" disabled/g) || []).length, 12);
for (const module of [
    "libkernel_web.sprx", "libSceNKWebKit.sprx", "libkernel.sprx",
    "libSceGvMp4Parser.sprx", "libSceAvPlayer.sprx", "libSceMetadataReaderWriter.sprx",
    "libSceEditMp4.sprx", "libSceWebmParserMdrw.sprx", "libSceContentSearch.sprx",
    "libSceAbstractStorage.sprx", "libSceAbstractLocal.sprx", "libSceIpmi.sprx",
]) assert.ok(page.includes('data-module="' + module + '"'), "missing dump target: " + module);
assert.ok(!page.includes("(0, eval)"));
for (const archivedName of [
    "helloworld", "ipmi_fuzzer", "shm_probe", "sprx_dumper", "sprx_dumper2",
    "fsprobe", "avplayer_test", "module_explorer", "syscall_extractor",
    "syscore_connect_probe", "sysmodule_internal_probe", "telemetry",
]) assert.ok(!page.includes("value=\"" + archivedName + "\""), "stale payload option: " + archivedName);
assert.ok(exploit.includes("REMOTE-JS-DISABLED"));
assert.ok(exploit.includes("remote JavaScript loading is disabled"));
assert.ok(!exploit.includes("CUSTOM_STUBS"));
assert.ok(exploit.includes("deepslopModuleRegistry"));
assert.ok(exploit.includes("memoryProfile"));
assert.ok(exploit.includes("carrierSlots: 4500000"));
assert.ok(exploit.includes("maxAttempts: 1"));
assert.ok(exploit.includes("chunkLimit"));
assert.ok(exploit.includes("address range exceeds userland bounds"));
assert.ok(!exploit.includes('Q.get("auto") !== "0"'));
assert.ok(!exploit.includes("MEMORY_PROFILES"));
assert.ok(!exploit.includes('Q.get("profile")'));
assert.ok(sprxDump.includes("programHeaderAddress"));
assert.ok(!sprxDump.includes("BigInt(base) + phoff"));
assert.ok(sprxDump.includes("verified module metadata is incomplete"));
assert.ok(sprxDump.includes("preflightOnly"));
assert.ok(sprxDump.includes("fullReadVerification"));

assert.strictEqual(manifest.schemaVersion, 1);
assert.deepStrictEqual(manifest.firmware, { min: "13.60", max: "13.60" });
assert.ok(manifest.payloads.length >= 10);
assert.deepStrictEqual(manifest.payloads.find((payload) => payload.name === "sprx_dump"), {
    name: "sprx_dump", file: "sprx_dump.js", mode: "userland-safe",
});
assert.ok(!manifest.payloads.some((payload) => ["ipmi_fuzzer", "shm_probe", "sprx_dumper", "helloworld"].includes(payload.name)));
for (const payload of manifest.payloads) {
    assert.ok(/^[a-z0-9_-]+\.js$/i.test(payload.file));
    assert.ok(payload.mode === "read-only" || payload.mode === "userland-safe");
    assert.ok(exists(path.join("payloads", payload.file)));
    assert.ok(read(path.join("payloads", payload.file)).includes("__DEEPSLOP_PAYLOAD_PROMISE"),
        "payload lacks completion promise: " + payload.name);
}

for (const archived of [
    "archive/payloads/redundant/helloworld.js",
    "archive/payloads/unsupported/shm_probe.js",
    "archive/payloads/destructive/ipmi_fuzzer.js",
    "archive/reference/p2jb-worker/poop2jb-rop-worker.js",
]) assert.ok(exists(archived), "missing archive file: " + archived);

assert.ok(!researchManifest.some((entry) => [
    "mem-alloc-bench", "mem-gc-bench", "mem-typed-array-bench", "mem-arraybuffer-bench",
    "mem-pressure", "wk-jsc-bench", "gfx-canvas-bench", "gfx-webgl-bench",
    "proc-cpu-bench", "proc-cap-matrix", "stab-exploit",
].includes(entry.name)));

console.log("active launcher and payload contract: PASS");
