#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const registry = JSON.parse(fs.readFileSync(path.join(root, "profiles", "poop2jb_profiles.json"), "utf8"));
const runtime = JSON.parse(fs.readFileSync(path.join(root, "profiles", "deepslop_runtime_profiles.json"), "utf8"));
const profiles = registry.profiles;
const keys = profiles.map(profile => profile.firmware);
const adapter = fs.readFileSync(path.join(root, "adapters", "deepslop-p2jb-adapter.js"), "utf8");

assert.strictEqual(registry.schemaVersion, 1);
assert.strictEqual(registry.firmwareCount, 48);
assert.strictEqual(new Set(keys).size, 48);
assert.ok(profiles.every(profile => profile.schemaVersion === 1));
assert.ok(profiles.every(profile => profile.webkit && profile.libkernelWeb && profile.status));
assert.ok(Object.keys(profiles.find(profile => profile.firmware === "12.70").webkit.gadgets).length >= 24);
assert.strictEqual(Object.keys(profiles.find(profile => profile.firmware === "12.70").libkernelWeb.syscalls).length, 331);
assert.ok(profiles.find(profile => profile.firmware === "12.70").libkernelWeb.worker.syscallWrapper);
assert.strictEqual(profiles.find(profile => profile.firmware === "13.20").status.worker, "unavailable");
assert.strictEqual(runtime.profiles["13.60"].status.worker, "unavailable");
assert.strictEqual(runtime.profiles["13.60"].status.p2jb, "unsupported");
assert.ok(fs.readFileSync(path.join(root, "exploit.js"), "utf8").includes("promotedReadWriteReady: false"));
assert.ok(adapter.includes("Array.isArray(profiles)"));
assert.ok(adapter.includes("worker.configure(cfg)"));

const worker = fs.readFileSync(path.join(root, "adapters", "poop2jb-rop-worker.js"), "utf8");
assert.ok(worker.includes("adapters/poop2jb-rop-slave.js"));
assert.ok(worker.includes("syscallSync"));
assert.ok(worker.includes("r9"));

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
for (const id of ["p2jbDeck", "btnP2JBCheck", "btnP2JBWorker", "p2jbDeckStatus", "p2jbProfileStatus"])
    assert.ok(html.includes("id=\"" + id + "\""), "missing UI id: " + id);
assert.ok(html.includes("adapters/deepslop-p2jb-adapter.js"));
assert.ok(!html.includes('data["13.60"] || data["11.60"]'));

console.log("p2jb profile and UI contract: PASS");
