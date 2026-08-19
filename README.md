# 💥 DEEPSLOP — PS5 WebKit Exploit & Research Kit

> 🚀 **Standalone On-Device WebKit RCE & Vulnerability Research Framework for PlayStation 5 (FW 13.60)**

[![Firmware](https://img.shields.io/badge/PS5%20FW-13.60-blue.svg)](#-firmware-support)
[![Architecture](https://img.shields.io/badge/Mode-100%25%20Standalone%20On--Device-emerald.svg)](#-key-features)
[![UI](https://img.shields.io/badge/UI-P2JB--style%20preflight-purple.svg)](#user-interface)
[![License](https://img.shields.io/badge/License-Research%20Only-lightgrey.svg)](#)

---

## 🌟 Overview

**DEEPSLOP** is a standalone FW 13.60 WebKit userland research toolkit for the
PlayStation 5 browser. It provides the preserved userland RCE surface, bounded
arbitrary reads, read-only ELF inspection, and conservative diagnostic payloads.
Promoted arbitrary read/write, generic syscall dispatch, kernel escalation, and
payload-loader paths are not enabled.

Live Deployment: [https://badrcoderman.github.io/deepslop/](https://badrcoderman.github.io/deepslop/)

---

## 🎮 Firmware Support

| PS5 Firmware | WebKit Userland RCE | Read-only ELF inspection | Kernel Scope |
|:---:|:---:|:---:|:---:|
| **13.60** | ✅ **Preserved userland path** | ✅ **Bounded PT_LOAD map** | Userland diagnostics only |

---

## ⚡ Key Features

1. **Bounded Memory Read Primitive (`window.aimRead`)**:
   - Reads at most `0x1000` bytes per call and restores the carrier after every read.
2. **Read-only ELF Inspection**:
   - Validates ELF64 headers and PT_LOAD bounds from known userland bases without writing module or kernel memory.
3. **Web Audio WakeLock Engine**:
   - Inaudible 1Hz `AudioContext` oscillator prevents PS5 WebKit tab freezing, sleep mode, and CPU throttling during long payload runs.
4. **Crash-Safe Forensic Recorder**:
   - Tracks execution milestones in `localStorage`. If an unexpected crash or tab reload occurs, a forensic banner reports exactly which stage failed.
5. **Interactive In-Browser Hex Inspector & Dump Exporter**:
   - Real-time address inspection with Quick-Jump targets (`libkernel_web`, `WebKit Base`, `Arena Backing`) and one-click binary `.bin` export.
6. **Zero-Allocation OOM Protections**:
   - Memory scanning loops reuse pre-allocated buffer caches (`scanChunk`), eliminating garbage collector (GC) spikes and tab crashes.
7. **Exact Firmware Gating**:
   - The launcher accepts only FW 13.60 and never aliases neighboring firmware offsets.

---

## Built-In Payloads

| Payload File | Name | Description |
|:---|:---|:---|
| `primitive_preflight.js` | **Primitive Preflight** | Validates bounded reads and baseline getpid behavior |
| `userland_report.js` | **Userland Report** | Reports exact firmware, bases, and capability state |
| `module_map.js` | **ELF Module Map** | Validates ELF64 program headers and PT_LOAD bounds |
| `worker_preflight.js` | **Worker Preflight** | Tests ordinary Worker lifecycle without ROP or stack writes |
| `syscall_discovery.js` | **Stub Discovery** | Scans syscall patterns without registering unverified calls |
| `memory_integrity.js` | **Memory Integrity** | Performs bounded repeated-read checks without writes |
| `resizable_arraybuffer_probe.js` | **Typed-Array Semantics** | One-shot resizable-buffer and `copyWithin` probe |
| `baseline_diagnostics.js` | **Baseline Diagnostics** | Runs the existing safe getpid and aimRead checks |
| `sysinfo.js` | **System Telemetry** | Reports guarded userland runtime information |
| `xml_test.js` | **XML Decoder Test** | Runs a bounded in-process parser test |
| `api_return_checker.js` | **API Return Checker** | Reports safe return-code behavior where available |
| `deepslop_info.js` | **DeepSlop Report** | Reports userland RCE and memory layout state |
| `notification.js` | **OS Notification** | Performs the existing userland notification sanity check |
| `sprx_dump.js` | **SPRX Dump** | Streams allowlisted in-memory module segments to the PC with bounded chunks |

---

## User Interface

The root launcher uses the P2JB-style static preflight layout: black background,
large pill controls, stage/vitals/verdict panels, a capability table, and a
compact text-first status flow. It does not load exploit code.

The single `index.html` page keeps the existing exploit anchors and load order,
but presents the minimal P2JB-style launcher before RCE. It exposes only the
active FW 13.60 userland research payload manifest after RCE.

P2JB and Poopsploit kernel stages remain disabled. No neighboring firmware values
are inherited, and no promoted arbitrary read/write primitive is claimed.

Archived payloads and P2JB worker references are under `archive/` and are not
loaded. Active payloads are restricted by `payloads/manifest.json`; remote
JavaScript loading and dynamic payload evaluation are disabled.

---

## 🕹️ Quick Start

1. Open the PS5 Internet Browser or User's Guide.
2. Navigate to:
   ```text
   https://badrcoderman.github.io/deepslop/
   ```
3. Click **`RUN USERLAND RCE`** to open the preserved execution surface.
4. Select `LOW` memory profile for the first run. The launcher shows the live
   stage log and keeps the last short log tail after a renderer restart.
5. Use the userland-only preflight and diagnostic payloads after RCE succeeds.

The default RCE run is one-shot with automatic retry disabled. `STANDARD` uses
the historical allocation budget; use it only after LOW has been tested.

### Local SPRX Dump Receiver

Run the PC receiver from the repository root:
```bash
python3 tools/sprx_dump_receiver.py --bind 0.0.0.0 --port 8000
```

Open `http://192.168.8.47:8000/` on the PS5. Select a library in the SPRX dump
section and press `CHECK` first. The non-destructive preflight checks the
receiver, exact firmware, verified module metadata, ELF/PT_LOAD layout, and
reads every file-backed segment once in bounded chunks without uploading it.
Start `DUMP` only after `PREFLIGHT PASS`, using `LOW`
speed for the first full transfer. The progress bar shows acknowledged bytes,
percentage, and an estimated time remaining. The receiver writes one
acknowledged binary chunk directly to disk; the browser never stores the
complete module.
Dump buttons remain disabled until a verified FW 13.60 module registry supplies
the module base, load bias, and program-header address; guessed addresses are
rejected.

The verified runtime-anchor targets are `libkernel_web.sprx` and
`libSceNKWebKit.sprx`. The actual `libkernel.sprx` row is shown as a locked
candidate until its runtime base is independently verified.

Local contract checks:
```bash
node tests/active-contract.test.js
node tests/resizable_arraybuffer_probe.test.js
node tests/sprx_dump_preflight.test.js
python3 tests/sprx_dump_contract.test.py
node tools/scan-test.js
```

---

## 📜 Disclaimer & Research Scope

This software is strictly for security research, vulnerability analysis, and educational purposes on hardware owned by the user. No DRM circumvention, piracy tools, or destructive exploits are contained within this repository.
