#!/usr/bin/env node
"use strict";

/*
 * Build a data-only audit of pooP2JB's firmware profiles.
 * The source files are JavaScript assignments, not trusted input. This tool
 * extracts hexadecimal literals with bounded regular expressions and never
 * evaluates the firmware files.
 */

const fs = require("fs");
const path = require("path");

const repoRoot = process.env.POO_P2JB_ROOT || "/home/user/Documents/webp5/pooP2JB";
const outRoot = process.env.DEEPSLOP_ROOT || path.resolve(__dirname, "..");
const offsetsDir = path.join(repoRoot, "offsets");
const outputJson = path.join(outRoot, "profiles", "poop2jb_profiles.json");
const outputReport = path.join(outRoot, "audit", "pooP2JB-audit.md");

function hex(value) {
    return "0x" + Number(value).toString(16);
}

function parseHex(value) {
    return Number.parseInt(value, 16);
}

function parseScalar(source, name) {
    const pattern = new RegExp("(?:const|let|var)\\s+" + name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&") + "\\s*=\\s*(0x[0-9a-f]+)", "i");
    const match = source.match(pattern);
    return match ? hex(parseHex(match[1])) : null;
}

function parseArray(source, name) {
    const pattern = new RegExp("(?:const|let|var)\\s+" + name + "\\s*=\\s*\\[([^\\]]*)\\]", "i");
    const match = source.match(pattern);
    if (!match) return [];
    return Array.from(match[1].matchAll(/0x[0-9a-f]+/gi), item => hex(parseHex(item[0])));
}

function parseMap(source, name) {
    const pattern = new RegExp("(?:const|let|var)\\s+" + name + "\\s*=\\s*\\{([\\s\\S]*?)\\n\\s*\\};", "i");
    const match = source.match(pattern);
    if (!match) return {};
    const result = {};
    for (const item of match[1].matchAll(/(?:"([^"]+)"|(0x[0-9a-f]+))\s*:\s*(0x[0-9a-f]+)/gi)) {
        const key = item[1] || item[2].toLowerCase();
        result[key] = hex(parseHex(item[3]));
    }
    return result;
}

function parseP2jbWorkerProfiles(source) {
    const result = {};
    for (const item of source.matchAll(/"(\d+\.\d+)"\s*:\s*\{([^}]+)\}/g)) {
        const fields = {};
        for (const field of item[2].matchAll(/([a-z_]+)\s*:\s*(0x[0-9a-f]+)/gi))
            fields[field[1]] = hex(parseHex(field[2]));
        result[item[1]] = fields;
    }
    return result;
}

function profileStatus(firmware, source, worker, kernel) {
    return {
      userland: source.hostConstructorCandidates.length ? "offset-file" : "incomplete",
      worker: worker ? "offset-file" : "unavailable",
      kernel: kernel ? "offset-file" : "unavailable",
      p2jb: kernel && worker && firmware !== "13.00" && firmware !== "13.20"
            ? "offset-file" : "unsupported",
    };
}

function readProfile(fileName, workerProfiles) {
    const firmware = fileName.replace(/\.js$/, "");
    const filePath = path.join(offsetsDir, fileName);
    const source = fs.readFileSync(filePath, "utf8");
    const gadgets = parseMap(source, "wk_gadgetmap");
    const syscalls = parseMap(source, "syscall_map");
    const hostConstructorCandidates = parseArray(source, "OFFSET_wk_host_constructor_candidates");
    const scalars = {};
    for (const name of [
        "OFFSET_wk_vtable_first_element", "OFFSET_wk_memset_import",
        "OFFSET_wk___stack_chk_guard_import", "OFFSET_lk___stack_chk_guard",
        "OFFSET_lk_pthread_create_name_np", "OFFSET_lk_pthread_join",
        "OFFSET_lk_pthread_exit", "OFFSET_lk_sleep", "OFFSET_lk_sceKernelGetCurrentCpu",
        "OFFSET_lc_memset", "OFFSET_lc_malloc", "OFFSET_lc_free", "OFFSET_lc_memcpy",
        "OFFSET_lc_strcmp", "OFFSET_lc_memcmp", "OFFSET_lc_vsnprintf",
        "OFFSET_WORKER_STACK_OFFSET", "OFFSET_lk__thread_list",
        "OFFSET_lk_worker_wait_return", "OFFSET_KERNEL_ALLPROC",
        "OFFSET_KERNEL_SECURITY_FLAGS", "OFFSET_KERNEL_TARGETID",
        "OFFSET_KERNEL_QA_FLAGS", "OFFSET_KERNEL_UTOKEN_FLAGS",
        "OFFSET_KERNEL_ROOTVNODE", "OFFSET_KERNEL_DATA",
    ]) scalars[name] = parseScalar(source, name);

    const worker = workerProfiles[firmware] || null;
    const kernel = Object.keys(scalars).some(name => name.startsWith("OFFSET_KERNEL_") && scalars[name] !== null);
    const sourceProfile = {
        hostConstructorCandidates,
        vtableFirstElement: scalars.OFFSET_wk_vtable_first_element,
        imports: {
            memset: scalars.OFFSET_wk_memset_import,
            stackChkGuard: scalars.OFFSET_wk___stack_chk_guard_import,
        },
        gadgets,
    };
    const profile = {
        schemaVersion: 1,
        firmware,
        source: "pooP2JB/offsets/" + fileName,
        status: profileStatus(firmware, sourceProfile, !!worker, kernel),
        webkit: sourceProfile,
        libkernelWeb: {
            exports: {
                stackChkGuard: scalars.OFFSET_lk___stack_chk_guard,
                pthreadCreateNameNp: scalars.OFFSET_lk_pthread_create_name_np,
                pthreadJoin: scalars.OFFSET_lk_pthread_join,
                pthreadExit: scalars.OFFSET_lk_pthread_exit,
                sleep: scalars.OFFSET_lk_sleep,
            },
            worker: {
                threadList: worker ? worker.thread_list : scalars.OFFSET_lk__thread_list,
                waitReturnFingerprint: scalars.OFFSET_lk_worker_wait_return,
                fallbackStackOffset: scalars.OFFSET_WORKER_STACK_OFFSET,
                syscallWrapper: worker ? worker.syscall_wrapper : null,
                setjmp: worker ? worker.setjmp : null,
                longjmp: worker ? worker.longjmp : null,
                pthreadCreate: worker ? worker.pthread_create : null,
                slotExpect: worker ? worker.slot_expect : null,
            },
            syscalls,
        },
        libcInternal: {
            memset: scalars.OFFSET_lc_memset,
            malloc: scalars.OFFSET_lc_malloc,
            free: scalars.OFFSET_lc_free,
            memcpy: scalars.OFFSET_lc_memcpy,
            strcmp: scalars.OFFSET_lc_strcmp,
            memcmp: scalars.OFFSET_lc_memcmp,
            vsnprintf: scalars.OFFSET_lc_vsnprintf,
        },
        kernel: {
            allproc: scalars.OFFSET_KERNEL_ALLPROC,
            securityFlags: scalars.OFFSET_KERNEL_SECURITY_FLAGS,
            targetId: scalars.OFFSET_KERNEL_TARGETID,
            qaFlags: scalars.OFFSET_KERNEL_QA_FLAGS,
            utokenFlags: scalars.OFFSET_KERNEL_UTOKEN_FLAGS,
            rootVnode: scalars.OFFSET_KERNEL_ROOTVNODE,
            dataBase: scalars.OFFSET_KERNEL_DATA,
        },
        evidence: {
            hardwareTested: false,
            note: "Presence in an offset file is not proof of target support.",
        },
    };
    return profile;
}

function build() {
    if (!fs.existsSync(offsetsDir)) throw new Error("offset directory missing: " + offsetsDir);
    const workerSource = fs.readFileSync(path.join(repoRoot, "p2jb_lk.js"), "utf8");
    const workerProfiles = parseP2jbWorkerProfiles(workerSource);
    const files = fs.readdirSync(offsetsDir).filter(name => /^\d+\.\d+\.js$/.test(name)).sort((a, b) => Number.parseFloat(a) - Number.parseFloat(b));
    const profiles = files.map(file => readProfile(file, workerProfiles));
    const summary = {
        schemaVersion: 1,
        generatedBy: "tools/build_poop2jb_profiles.js",
        sourceRoot: "pooP2JB",
        firmwareCount: profiles.length,
        profiles,
    };
    fs.writeFileSync(outputJson, JSON.stringify(summary, null, 2) + "\n");

    const lines = [
        "# pooP2JB Audit",
        "",
        "Generated from the 48 offset files without evaluating source JavaScript.",
        "The report separates offset presence from tested support. Kernel-stage execution is not enabled by the DeepSlop adapter.",
        "",
        "## Component Classification",
        "",
        "| Component | Classification | Integration decision |",
        "|---|---|---|",
        "| `core.js` / `mem.js` | userland primitive | adapter input; require promoted pair |",
        "| `rop-worker.js` | worker-backed ROP executor | adapter input; profile-gated |",
        "| `rop.js` | legacy chain builder | do not use without capacity wrapper |",
        "| `rop_slave.js` | worker echo loop | copied only as executor dependency |",
        "| `p2jb.js` / `poops.js` | destructive kernel stages | excluded from DeepSlop v2 route |",
        "| `syscalls.js` | symbolic syscall names | keep separate from stub RVAs |",
        "",
        "## Firmware Matrix",
        "",
        "| Firmware | Userland | Worker | Kernel | P2JB | Gadgets | Syscalls |",
        "|---|---|---|---|---|---:|---:|",
    ];
    for (const profile of profiles) {
        lines.push(`| ${profile.firmware} | ${profile.status.userland} | ${profile.status.worker} | ${profile.status.kernel} | ${profile.status.p2jb} | ${Object.keys(profile.webkit.gadgets).length} | ${Object.keys(profile.libkernelWeb.syscalls).length} |`);
    }
    lines.push(
        "",
        "## Core Layer Audit",
        "",
        "| File | Audited surface | Result |",
        "|---|---|---|",
        "| `core.js` | primitive setup, serialized-history capture, pointer validation, retries | usable userland primitive; require promoted-pair status |",
        "| `mem.js` | byte/word/qword access, address leaks, promotion and rollback | usable with strict address and promotion gates |",
        "| `int64.js` | low/high arithmetic and conversions | usable; keep `hi` and `high` schema names separate |",
        "| `syscalls.js` | symbolic syscall constants | incomplete relative to offset-map IDs; do not use as stub registry |",
        "| `main.js` | base resolution, worker discovery, chain preparation | usable only when exact worker fields exist |",
        "| `p2jb.js` | race, kernel writes, credential and loader stages | destructive; excluded from v2 route |",
        "| `poops.js` | structured race and kernel-stage ladder | destructive; terminal power-cycle state after trigger |",
        "",
        "## ROP and Worker Audit",
        "",
        "- `rop-worker.js` supports `rdi`, `rsi`, `rdx`, `rcx`, `r8`, and `r9` through `syscallSync`.",
        "- `Chain.commit()` bounds the copied chain; legacy `rop.js` `push()` does not.",
        "- The worker requires exact `thread_list`, `syscall_wrapper`, setjmp/longjmp, slot fingerprint, and gadget fields.",
        "- Worker slot recovery is runtime-sensitive; failure must latch the adapter as unavailable.",
        "- `rop_slave.js` is only the worker wake/echo loop and is not a ROP implementation.",
        "",
        "## Memory and Math Audit",
        "",
        "- `mem.js` accepts numbers and low/high objects; normalized profiles use strings to avoid JavaScript integer truncation.",
        "- `int64.js` emits `hi`; callers using `high` must be rejected or normalized explicitly.",
        "- The adapter never treats the `aimRead` primitive as a promoted arbitrary write pair.",
        "",
        "## Required Runtime Gates",
        "",
        "1. Firmware must match an exact profile key.",
        "2. The userland primitive must report a promoted pair.",
        "3. Worker fields, gadget set, and syscall wrapper must all be present.",
        "4. Hardware-tested status must be explicit; neighboring firmware values are never inherited.",
        "5. Kernel and P2JB fields remain unavailable unless the profile says otherwise.",
        "",
        "## Known Risks",
        "",
        "- `rop.js` does not enforce chain capacity; the adapter uses `rop-worker.js` `Chain.commit()` instead.",
        "- Worker stack slot selection is runtime-sensitive and must be fingerprinted before any call.",
        "- 13.00 and 13.20 contain userland/gadget data but no complete worker/kernel profile.",
        "- The current operator target 13.60 has no pooP2JB profile and remains userland-diagnostics-only.",
        "",
    );
    fs.writeFileSync(outputReport, lines.join("\n"));
    console.log(JSON.stringify({ firmwareCount: profiles.length, outputJson, outputReport }, null, 2));
}

build();
