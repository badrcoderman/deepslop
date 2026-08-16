# 💥 DEEPSLOP — PS5 WebKit Exploit & Research Kit

> 🚀 **Standalone On-Device WebKit RCE & Vulnerability Research Framework for PlayStation 5 (FW 13.60)**

[![Firmware](https://img.shields.io/badge/PS5%20FW-13.60%20%7C%2012.00%20%7C%2011.60-blue.svg)](#-firmware-support)
[![Architecture](https://img.shields.io/badge/Mode-100%25%20Standalone%20On--Device-emerald.svg)](#-key-features)
[![UI](https://img.shields.io/badge/UI-Modern%20Glassmorphic%20(<20KB)-purple.svg)](#-user-interface)
[![License](https://img.shields.io/badge/License-Research%20Only-lightgrey.svg)](#)

---

## 🌟 Overview

**DEEPSLOP** is an advanced, standalone WebKit RCE and security research toolkit designed specifically for the PlayStation 5 (Prospero) browser environment. It enables arbitrary memory read/write, native syscall invocation, in-memory ELF64 parsing, POSIX shared memory auditing, and on-device module dumping without requiring any external PC servers.

Live Deployment: [https://badrcoderman.github.io/deepslop/](https://badrcoderman.github.io/deepslop/)

---

## 🎮 Firmware Support

| PS5 Firmware | WebKit Userland RCE | In-Memory Dynamic `dlsym` | Kernel Scope |
|:---:|:---:|:---:|:---:|
| **13.60** | ✅ **Active & Verified** | ✅ **Full ELF64 Table Parsing** | Sandbox Userland (`NKWebProcess`) |
| **12.00** | ✅ **Active & Verified** | ✅ **Full ELF64 Table Parsing** | Sandbox Userland (`NKWebProcess`) |
| **11.60** | ✅ **Active & Verified** | ✅ **Full ELF64 Table Parsing** | Sandbox Userland (`NKWebProcess`) |
| **9.00 – 10.01** | ✅ **Supported** | ✅ **Full ELF64 Table Parsing** | Sandbox Userland + Lapse Hooks |

---

## ⚡ Key Features

1. **Arbitrary Memory Read Primitive (`window.aimRead`)**:
   - Re-aims the exploit's carrier vector (`rwView`) dynamically to read any arbitrary memory address across the entire 64-bit userland address space, bypassing previous 8KB arena constraints safely.
2. **Dynamic In-Memory Symbol Resolver (`_ds.dlsym` / `window.resolveSymbol`)**:
   - Parses mapped ELF64 headers (`PT_DYNAMIC`, `DT_SYMTAB`, `DT_STRTAB`) directly from memory to resolve function pointers and Sony NIDs on the fly without hardcoded offset databases.
3. **Web Audio WakeLock Engine**:
   - Inaudible 1Hz `AudioContext` oscillator prevents PS5 WebKit tab freezing, sleep mode, and CPU throttling during long payload runs.
4. **Crash-Safe Forensic Recorder**:
   - Tracks execution milestones in `localStorage`. If an unexpected crash or tab reload occurs, a forensic banner reports exactly which stage failed.
5. **Interactive In-Browser Hex Inspector & Dump Exporter**:
   - Real-time address inspection with Quick-Jump targets (`libkernel_web`, `WebKit Base`, `Arena Backing`) and one-click binary `.bin` export.
6. **Zero-Allocation OOM Protections**:
   - Memory scanning loops reuse pre-allocated buffer caches (`scanChunk`), eliminating garbage collector (GC) spikes and tab crashes.
7. **100% Standalone On-Device**:
   - All PC dependencies removed. Payloads execute, display results, and trigger browser downloads directly on the console.

---

## 📦 Built-In Payloads (16 Research Modules)

| Payload File | Name | Description |
|:---|:---|:---|
| `syscore_connect_probe.js` | **SceSysCore Ipmi Probe** | Probes kernel IPC transport (`syscall 0x26e ipmimgr_call`) & reachability (F-021/F-022) |
| `sprx_dumper2.js` | **Streaming Dumper (v2)** | Memory-frugal ELF-aware streaming dumper with chunked output |
| `sprx_dumper.js` | **SPRX Direct Dumper** | Dumps mapped modules (`libkernel_web`, `libSceAvPlayer`) to browser downloads via Blob |
| `fsprobe.js` | **FS & Module Probe** | Audits sandbox filesystem permissions & dumps `libkernel_web` ELF header to Hex Viewer |
| `shm_probe.js` | **Shared Memory Probe** | Tests POSIX shared memory descriptors (`/VideoParserThumbnail`, `/VideoParserTimecode`) |
| `sysinfo.js` | **System Telemetry** | Reads PID, TID, pipe file descriptors, and verified syscall stubs |
| `avplayer_test.js` | **AvPlayer Demuxer** | Tests in-process MP4 sample table allocation bounds and atom parsing |
| `ipmi_fuzzer.js` | **IPMI Handler Fuzzer** | Fuzzes `libSceIpmi` client sessions and method dispatchers |
| `mem_canary_probe.js` | **Heap Canary Probe** | Validates heap integrity and memory canary layouts |
| `sysmodule_internal_probe.js` | **Sysmodule Loader** | Probes internal module loading interfaces |
| `xml_test.js` | **XML Decoder Test** | Tests in-memory XML entity decoder buffer limits |
| `api_return_checker.js` | **Syscall Matrix** | Systematically tests syscall return codes and sandbox restrictions |
| `deepslop_info.js` | **DeepSlop RCE Report** | Generates detailed telemetry report of base addresses and memory layout |
| `notification.js` | **OS Notification** | Sends customizable on-screen pop-up notification via `/dev/notification0` |
| `helloworld.js` | **Hello World** | Basic RCE verification self-test |
| `telemetry.js` | **Telemetry Logger** | Captures execution timings and diagnostic events |

---

## 🖥️ User Interface

The UI is built with a lightweight (~18KB) obsidian dark glassmorphism design optimized for PS5 rendering:
- **Status Banner**: Real-time state indicators (`ARMED`, `RUNNING`, `RCE ACTIVE`).
- **Hero Controls**: Quick `▶ RUN (Full RCE)` (OOM-safe by default) and `🔍 PROBE (Scan Offsets)`.
- **Pinned Payloads Grid**: 8 one-click quick-action cards for top research modules.
- **Universal Payload Injector**: Dropdown selector supporting all 16 payloads with instant injection.
- **Hex Inspector**: Live memory viewer with ASCII decoding and raw binary download button.
- **Live Terminal Console**: Color-coded, auto-scrolling execution log.

---

## 🕹️ Quick Start

1. Open the PS5 Internet Browser or User's Guide.
2. Navigate to:
   ```text
   https://badrcoderman.github.io/deepslop/
   ```
3. Click **`▶ RUN (Full RCE)`** to initialize the exploit chain.
4. Once the notification **`PS5 OK`** appears, select any payload or inspect memory in the Hex Viewer!

---

## 📜 Disclaimer & Research Scope

This software is strictly for security research, vulnerability analysis, and educational purposes on hardware owned by the user. No DRM circumvention, piracy tools, or destructive exploits are contained within this repository.
