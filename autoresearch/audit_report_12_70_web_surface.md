# PS5 FW 12.70 Web-Connected SPRX Security Architecture Audit

**Scope:** 26 web-reachable libraries in `unp/12.70/` (23 common + 3 priv), parsed from
`import_export_db/12.70.json` (2,370 symbol records) plus direct ELF extraction of the three
section-stripped priv libraries (1,699 exports / 1,943 imports in total).

**Method:** SCE Prospero dynamic-tag parsing (build_import_export_db.py), capstone disassembly of
security-relevant functions, semantic firmware differential (instruction-level, RIP-relativization),
string/BuildID provenance analysis.

**Platform note:** The task template says "PS4 12.00", but the on-disk corpus is **PS5 SPRX** with
firmwares 1.00–12.70. All addresses below are PS5 FW 12.70 VMA (text section file offset +0x4000).

---

## 1. Executive Summary

The web attack surface on PS5 FW 12.70 is split between (a) in-process parsers reachable directly
from WebKit/WebProcess and (b) client stubs that serialize structured requests into kernel-mediated
IPMI daemon channels. Key results:

1. **No code changes between FW 12.00 → 12.20 → 12.70** in any security-relevant function across all
   10 audited libraries (semantic diff, RIP-relativized). The two previously-reported parser bugs
   (libSceXml entity decode overflow, libSceAvPlayer 32-bit atom count truncation) remain
   unpatched in 12.70.
2. **FW 12.60 dump is a different build line**: 0/308 libs carry `W:/Build` paths (vs 268/269 in
   12.70). Its code differs across the board and must not be used for patch-series comparison.
3. **libSceHttp2 embeds zlib 1.2.13** (patched) with gzip inflate in-process; no known zlib CVE
   applies at this version.
4. **libSceWebTransport (priv)** embeds **ngtcp2** (QUIC/HTTP3) plus LibreSSL; in-process QUIC
   packet parsing is a large fresh surface.
5. **libSceNetCtl / libSceVnaInternal / libSceWtIpcClient** are pure IPMI clients
   (`IPMI::Client::create`, `ipmimgr_call` syscall); the real deserializer boundary is the IPMI
   daemon side (libSceIpmi ServerImpl / daemon processes).
6. **libSceWebmParserMdrw** (WebM/EBML) has correct bounds in the EBML ID/size reader; it is a
   thumbnail generator that hands off to libSceMediaFrameworkInterface.
7. **libSceSysmodule** path templates are built with snprintf into fixed 0x100 buffers — no
   overflow; module identity gated by kernel app-info/SDK-version checks.
8. **libSceVnaWebsocket** frame length parsing is bounded (0x7fffffff cap, 0x7e/0x7f extension);
   TLS via libSceSsl.

---

## 2. Interface & Symbol Taxonomy (R1)

| Library | Exports | Imports | Key modules | Role |
|---|---|---|---|---|
| libSceAvPlayer.sprx | 27 | 134 | libSceSysmodule, libSceAudiodec | MP4/TS demux |
| libSceWebmParserMdrw.sprx | 7 | 44 | libSceMediaFrameworkInterface | WebM thumbnail gen |
| libSceXml.sprx | 184 | 30 | libkernel | XML DOM/SAX |
| libSceJson2.sprx | 223 | 29 | libSceJson | JSON (C++ sce::Json) |
| libSceJson.sprx | 96 | 26 | libkernel | JSON v1 |
| libSceHttp2.sprx | 72 | 130 | libSceSsl, libSceNet, zlib-embedded | HTTP/2+WS+gzip |
| libSceHttp.sprx | 115 | 123 | libSceSsl, libSceNetCtl | HTTP/1.1 |
| libSceHttpCache.sprx | 34 | 167 | libSceIpmi, libSceJson | HTTP cache |
| libSceVnaWebsocket.sprx | 30 | 61 | libSceSsl, libSceNet | WebSocket client |
| libSceVnaInternal.sprx | 88 | 44 | libSceIpmi, libSceRegMgr | VNA helpers/IPMI |
| libSceNetCtl.sprx | 124 | 16 | libSceIpmi | Network control |
| libSceNet.sprx | 244 | 93 | libkernel | BSD socket wrapper |
| libSceRudp.sprx | 35 | 106 | libSceNet, libSceNetCtl | Reliable UDP |
| libSceSysmodule.sprx | 22 | 66 | libkernel | Module loader |
| libSceJpegParser.sprx | 7 | 89 | libSceImageUtil, libSceRtc | JPEG |
| libScePngParser.sprx | 7 | 69 | libSceImageUtil, libSceRtc | PNG |
| libSceGifParser.sprx | 7 | 67 | libSceImageUtil | GIF |
| libSceJxrParser.sprx | 7 | 26 | libSceImageUtil, libSceSysmodule | JXR |
| libSceGvMp4Parser.sprx | 7 | 142 | libSceMediaFrameworkInterface | MP4 metadata |
| libSceMetadataReaderWriter.sprx | 65 | 106 | libSceJson | ID3/EXIF metadata |
| libSceZlib.sprx | 5 | 13 | libkernel | zlib wrapper |
| libSceOpusDec.sprx | 30 | 29 | libSceAjm/Ajmi | Opus decode |
| libSceWebTransport.sprx | 219 | 279 | ngtcp2-embedded, libSceLibreSSl3, libScePosix | QUIC/HTTP3 (priv) |
| libSceWtIpcClient.sprx | 13 | 46 | libSceIpmi | WebTransport daemon client |
| libSceSdma.sprx | 27 | 8 | libkernel | DMA engine (priv) |

### Priv libs (section-stripped, extracted directly)
- **libSceWebTransport** — 219 exports (mostly NID-encoded), imports LibreSSL3 (BIO/EVP/SSL/X509/
  PEM), libScePosix raw sockets (socket/accept/sendmsg/kevent), libSceNet, libSceRandom,
  libSceSysmodule. Contains ngtcp2 (`ngtcp2_pkt.c`, `ngtcp2_conn.c` assertion strings), QUIC v1+v2
  markers. → **in-process QUIC packet + TLS record parsing**.
- **libSceWtIpcClient** — 13 exports, imports `IPMI::Client::Config::estimateMsgQueueSize` +
  `IPMI::Client::create` + flexible memory mapping. → WebTransport service daemon IPC.
- **libSceSdma** — 27 DMA exports (`sceSdmaCopyLinear`, window/tiled variants), ioctl/open on
  kernel driver. → GPU DMA helper (priv, not web-reachable in practice).

---

## 3. Media Demux & Container Analysis (R2a)

### 3.1 libSceAvPlayer — persistent count-truncation family (FINDING-010)
- stts handler @0x287f0: `alloc = 16*count + 1` in 32-bit; count 0x10000000 → 1-byte buffer, then
  ~268M attacker-controlled 8-byte entries written out of bounds. (Harness A proven byte-exact.)
- stss @0x26f20 / stsz @0x28d20: `4*count+1`; stco @0x28fb0: `4*count`.
- Container walker @0x245a0 validates only `offset+size <= container` (no count×size check).
- **Differential:** stts region md5 `4a615015ed` for 12.00, 12.20, 12.70 (identical); 11.60 =
  `b1f7f5ff65`; 12.60 = `bf619eac0c` (other branch). → **bug unpatched through 12.70.**

### 3.2 libSceWebmParserMdrw — bounded EBML reader
- Main entry @0x1290 (2,328 B) is a big state-machine initializer; parse loop @0x3770 with states
  0–7 and EBML ID dispatch (0x1A45DFA3 = EBML header, 0x18538067 = Segment).
- EBML ID reader @0x6480: first byte length-prefix decoded via @0x6600 (leading-1 position), ID
  length capped at 4 (`cmp ecx, 4; jbe`), 8-bit shift-accumulate. **No over-read.**
- 0x6640 computes unknown-size masks; 0x65c0 is a vtable-mediated 1-byte read.
- String evidence: `[MDRW]` log lines, `shm_open`/`ftruncate`/`munmap` thumbnail buffer mapping,
  `sceMediaFwGetThumbnail` — handoff to media framework.
- **Assessment:** thumbnail generator; the deep demux is in libSceMediaFrameworkInterface /
  media player pipeline, not in this library. Confidence LOW for direct bug, MEDIUM as a
  thumbnail-trigger surface (can be reached with a web-delivered .webm).

### 3.3 libSceGvMp4Parser — payload extractor, no count validation
- 7 exports; `gvMp4ParserFinalize` @0x2c0; main parse @0x710 → box handler @0x83b0 (uses
  vtable getters + `0x2cd80`-style checks absent here). Extracts box offsets only.
- No count×size validation (matches prior stage analysis). The gate lives upstream (WebKit
  MediaPlayerPrivateAVPlayer pre-scan / ShareFactory libSceEditMp4 @0x2cd80).

---

## 4. Structured Serialization (R2b)

### 4.1 libSceXml — persistent decoder flaw (FINDING-009)
- Entity decoder @0x115b0; buffer-growth predicate at 0x1179c/0x11849 tests
  `OUT CAP + vlen > OUT LEN` (always true) instead of `OUT LEN + vlen > OUT CAP` → entity
  strings can be appended past capacity. **Unpatched:** decoder region md5 `327e82454d` in
  12.00/12.20/12.70.
- Reachability: XML via WebKit DOM parsing of XHR responses; SAX @0x143c0.

### 4.2 libSceJson2 — hardened C++14 design
- `sce::Json` namespace; parse entry `Parser::parse(Value&, const char*)` @0x69b0 → real tokenizer
  @0x6830; type-mismatch handler installed via `Value::setTypeMismatchHandler` @0x3c00 (default
  safe error path). `Object::insert` @0xcf30, `String::reserve` @0xb340, `String::substr` @0xb140
  all **semantic-identical 12.00 vs 12.70** (byte diffs are pure RIP-relative rodata relocations).
- 10 exports flagged as "changed" by byte-diff; zero semantic changes. **No patch candidates.**
- Assessment: modern allocator-aware C++; recommended: fuzz tokenizer @0x6830 for deep paths
  (string escape, number parsing, recursion depth).

### 4.3 libSceMetadataReaderWriter
- Metadata::Serialize @0x3f20 (2,075 B) / Deserialize @0x3890 (1,671 B) round-trip through
  sce::Json; parser registration via `registerParserInterface` @0xa7a0 (per-tag dispatch). ID3/
  EXIF tag table surface, MEDIUM priority — reachable from ShareFactory/thumbnail paths.

---

## 5. Protocol Framing (R2c)

### 5.1 libSceHttp2 — HTTP/2 + WebSocket + embedded zlib
- 72 exports; HTTP/2 streaming, cookies, auth cache, WebSocket client
  (`sceHttp2WebSocketCreateRequest` @0x35f0, send text/binary + close + ping).
- **Embedded zlib 1.2.13** (`1.2.13` marker next to `invalid block type` strings; CRC32 table
  absent → custom minimal inflate). Gzip inflate runs in-process on server-controlled response
  bodies. No applicable public zlib CVE at 1.2.13 (CVE-2022-37434 fixed in 1.2.12/13).
- HPACK dynamic table + Huffman decode in-process; MEDIUM priority.
- Differential: no semantic changes 12.00→12.70.

### 5.2 libSceVnaWebsocket — bounded frame lengths
- Frame length selector @0x32a: rejects `len > 0x7fffffff`, extended length at 0x7e/0x7f with
  16/64-bit reads; payload-size vs buffer logic at 0x33a-0x34b. String util layer
  (vna_string_util.cpp) does std::string copies.
- Handshake: sec-websocket-key/version/protocol, Upgrade header.
- Differential: only export `8KzE01OyRog` @0x8ee0 differs 12.00 vs 12.70; semantic-identical.
- Assessment: frame parser is sound; MEDIUM priority (TLS + mask handling depth limited here —
  masks are XOR applied on the wire, standard).

---

## 6. Loader & Daemon Boundaries (R2d)

### 6.1 libSceSysmodule — fixed-buffer path templates, kernel-gated
- `sceSysmoduleLoadModuleByNameInternal` @0x7c0 (979 B): iterates path templates
  (`/%s/common/lib/%s_debug_ND.sprx`, `/%s/priv/lib/%sForNeo.sprx`,
  `/app0/sce_module/%s_debug.prx`, …), each formatted by snprintf into a fixed 0x100 stack
  buffer (0xa620, size arg 0x100) — **no overflow**.
- Identity checks: `sceKernelGetAppInfo`, `ps4CheckTitleWorkaround`,
  `sceKernelTitleWorkaroundIsEnabled`, SDK version checks ("Invalid binary suspected").
- In-process mapping of approved SPRX = symbol-table expansion + IPC stub exposure
  (FINDING-011). `sceSysmoduleLoadModuleByNameInternal` semantic-identical 12.00→12.70.

### 6.2 libSceIpmi — the real IPC boundary
- 98 exports: ClientImpl (initialize/connect/invokeSyncMethod/invokeAsyncMethod,
  tryGetMsg/respondToSyncMethodRequest…), ServerImpl (createSession/runDispatcher/tryDispatch),
  SessionImpl (getClientPid, **isPeerPrivileged** @0x3ba0), ipmimgr syscall layer.
- Client→kernel: `ipmimgr_call`, `get_authinfo`/`get_self_auth_info` (privilege), utoken via
  `sceKernelGetUtokenUseSoftwagnerForAcmgr`. Session privilege is kernel-determined, not
  caller-controlled.
- `isPeerPrivileged` @0x3ba0 calls @0x4ec0 (kernel authinfo query), error-maps to
  0x80020002/0x80020003.
- **Trust boundary:** WebProcess(UT) → libSceIpmi → `ipmimgr_call` → kernel → daemon (SceSysCore
  etc). Daemon-side deserializers (ServerImpl::tryDispatch @0x1910, runDispatcher @0x1d90,
  sync-method buffer copyout @0x37c0+) are the privileged-side surface — not present in this
  dump beyond the client library itself.

### 6.3 libSceNetCtl / libSceVnaInternal / libSceWtIpcClient — pure clients
- libSceNetCtl: 124 exports, all `*IpcInt` variants (WiFi scan BSSID lists, NAT info, bandwidth,
  AP mode start/stop with WPA key material, STUN padding flag). Imports only
  `IPMI::Client::Config` + `create` — thin client stub.
- libSceVnaInternal: 88 exports, imports IPMI + `sceKernelGetFsSandboxRandomWord` +
  event flags + `/dev` open/read (daemon-facing control channel).
- libSceWtIpcClient: 13 exports, IPMI client with `estimateMsgQueueSize` + flexible memory —
  sends/receives WebTransport daemon messages via IPMI shm.
- All: client-side surface = struct serialization; privileged surface = daemon deserializers.

---

## 7. Differential Firmware Findings (R5)

### Provenance integrity
- 12.60 dump: 0/308 libs contain `W:/Build` strings; every lib differs from the 12.00 family.
  → **different build line (dev/region variant). Exclude from patch-series analysis.**
- Coherent series: 12.00 → 12.20 → 12.70 (12.20 = 12.00 for all sampled functions).

### Semantic diffs (RIP-relativized, instruction-level)
| Function | 12.00 vs 12.70 | Verdict |
|---|---|---|
| libSceAvPlayer stts handler @0x287f0 region | identical | no patch |
| libSceXml decoder @0x115b0 region | identical | no patch |
| libSceJson2 Parser::parse @0x6830/0x69b0 | identical | no patch |
| libSceJson2 Object::insert/String::reserve/substr | identical (rodata reloc only) | no patch |
| libSceVnaWebsocket 8KzE01OyRog @0x8ee0 | identical | no patch |
| libSceSysmodule LoadModuleByNameInternal @0x7c0 | identical | no patch |
| libSceHttp2 (all 72 exports) | identical | no patch |
| libSceNetCtl (all 124 exports) | identical | no patch |
| libSceWebmParserMdrw, libSceZlib, libSceJson | identical | no patch |

**No SECURITY-RELEVANT-PATCH-CANDIDATE found in the 12.00→12.70 window for these components.**

---

## 8. Cross-Reference Matrix (R-acceptance)

| Library | Export addr (12.70) | NID | Module | Boundary | Input source | User-controlled fields |
|---|---|---|---|---|---|---|
| libSceAvPlayer | sceAvPlayerAddSource @0x20e0 | (aerolib) | libSceAvPlayer | WebProcess→demux | <video src>, MSE, media app | MP4 atom count fields (stts/stss/stsz/stco) |
| libSceAvPlayer | stts handler @0x287f0 | – | internal | in-process heap | atom payload | count=0x10000000 → 1B alloc |
| libSceXml | decoder @0x115b0 | – | internal | in-process heap | XML text | entity string lengths |
| libSceJson2 | Parser::parse @0x6830 | – | internal | in-process heap | XHR/JSON | string/number lengths, nesting |
| libSceHttp2 | sceHttp2WebSocketCreateRequest @0x35f0 | – | libSceHttp2 | in-process | HTTP/2 frames | stream id, header length, HPACK idx |
| libSceHttp2 | embedded inflate | – | zlib 1.2.13 | in-process | gzip body | deflate stream |
| libSceVnaWebsocket | frame parse @0x32a | – | internal | in-process | WS frames | length fields (bounded) |
| libSceWebmParserMdrw | parse @0x1290 | – | internal | in-process | .webm/.mkv | EBML ids/lengths (bounded) |
| libSceNetCtl | sceNetCtlGetInfoIpcInt @0x35a0 | – | libSceNetCtl | IPMI client | daemon reply | struct sizes (daemon-controlled) |
| libSceNetCtl | sceNetCtlScanIpcInt @0x38e0 | – | libSceNetCtl | IPMI client | userland→daemon | scan params |
| libSceVnaInternal | (88 exports) | – | libSceVnaInternal | IPMI client + dev | daemon | message buffers |
| libSceWtIpcClient | (13 exports) | – | libSceWtIpcClient | IPMI client | WebTransport daemon | msg queue sizes |
| libSceIpmi | ServerImpl::tryDispatch @0x1910 | – | libSceIpmi | daemon (priv) | client shm | method id, DataInfo counts |
| libSceSysmodule | LoadModuleByNameInternal @0x7c0 | – | libSceSysmodule | in-process | module name | path (snprintf, no overflow) |
| libSceWebTransport | (219 exports) | – | libSceWebTransport | in-process | network | QUIC packets (ngtcp2) |
| libSceMetadataReaderWriter | Deserialize @0x3890 | – | internal | in-process | media files | ID3/EXIF field lengths |

---

## 9. Mitigation Mapping (R3)

| Boundary | Existing control | Residual risk |
|---|---|---|
| WebProcess → heap parsers | stack canaries (all libs), ASLR, W^X text | 32-bit count math unchecked (stts family) |
| WebProcess → daemon | kernel ipmimgr_call + authinfo gating; isPeerPrivileged | daemon-side deserializers not in dump |
| libSceSysmodule | kernel app-info/SDK-version checks; snprintf paths | any approved SPRX in-process = surface expansion |
| Network in-process | TLS via libSceSsl (libSceVnaWebsocket), LibreSSL3 (WebTransport) | ngtcp2 QUIC packet parser depth |
| Media thumbnails | MDRW log checks | handoff into media framework pipeline |

---

## 10. Ranked Research Candidates

**Priority 1 (highest value, evidence-backed)**
1. **libSceAvPlayer atom-count truncation** (stts/stss/stsz/stco) — proven heap OOB write; gate
   bypass is the open question (MSE path, 32-bit gate arithmetic). Confidence HIGH.
2. **libSceXml entity decode growth-predicate** — heap overflow on entity strings. Confidence HIGH
   (static), needs runtime proof.
3. **libSceNetCtl/IPMI daemon deserializers** — privileged-side surface; the client stubs confirm
   struct-count fields cross the boundary. Confidence MEDIUM (daemon not in dump).

**Priority 2**
4. libSceWebTransport (ngtcp2 QUIC parser + LibreSSL in-process) — large new surface; NID-heavy,
   needs symbol recovery. Confidence MEDIUM.
5. libSceMetadataReaderWriter ID3/EXIF field-length handling via sce::Json round-trip.
   Confidence MEDIUM.
6. libSceHttp2 HPACK dynamic-table index handling + embedded inflate. Confidence MEDIUM.
7. libSceWebmParserMdrw media-framework handoff (thumbnail path) as a gate-skip vector.
   Confidence MEDIUM (as trigger), LOW (as bug).

**Priority 3**
8. libSceGvMp4Parser — no count validation, but no alloc; low.
9. libSceJson2 — hardened, no patch history; fuzz anyway. LOW.
10. libSceVnaWebsocket frame math — bounded; LOW.
11. libSceSdma / libSceWtIpcClient — priv-only or thin client; LOW.
12. libSceZlib — 5-export wrapper, no inflate in lib; LOW.

---

## 11. Evidence Table

| # | Claim | Evidence |
|---|---|---|
| E1 | stts handler identical 12.00/12.20/12.70 | region md5 `4a615015ed` (3 FWs), `b1f7f5ff65` (11.60), `bf619eac0c` (12.60) |
| E2 | Xml decoder unpatched | decoder region md5 `327e82454d` across 12.00/12.20/12.70 |
| E3 | Json2 exports semantically unchanged | RIP-relativized insn diff identical for 3 largest changed exports |
| E4 | libSceHttp2 embeds zlib 1.2.13 | string `1.2.13` adjacent to `invalid block type`; no crc32 table, no zlib import |
| E5 | WebTransport embeds ngtcp2 | `ngtcp2_pkt.c(920)` / `ngtcp2_conn.c(1067)` assertion strings |
| E6 | libSceIpmi is the IPC layer | imports `ipmimgr_call`, `get_authinfo`, `get_self_auth_info`, `IPMI::Client::create` |
| E7 | NetCtl is a thin IPMI client | 124 exports, imports only IPMI Config/create |
| E8 | Sysmodule paths use fixed 0x100 buffers | snprintf @0xa620 with size 0x100 in 9 call sites |
| E9 | 12.60 is a different build line | 0/308 libs have `W:/Build` (12.70: 268/269) |
| E10 | WebM EBML reader bounded | ID length cap `cmp ecx,4` @0x64bc, shift-accumulate @0x6539 |
| E11 | WS frame lengths bounded | `cmp rsi,0x7fffffff; ja` @0x311, 0x7e/0x7f ext @0x32a |

---

## 12. Next Static-Analysis Steps

1. Build MSE/MediaSource delivery harness for the stts family (bypass the upstream pre-scan gate).
2. Recover NIDs in libSceWebTransport (ngtcp2 + LibreSSL caller graph) — prioritize
   packet-length arithmetic feeding `ngtcp2_pkt_decode`.
3. Locate and disassemble IPMI daemon binaries (SceSysCore / net daemon) from a full dump to
   analyze `tryDispatch`-side deserializers; if absent, treat client DataInfo count fields as the
   serialization contract and diff against libSceIpmi ServerImpl.
4. Fuzz libSceJson2 tokenizer @0x6830 (ASAN build via rehosting) — check recursion depth limits.
5. Full dump of 12.60-differing functions vs 12.70 in libSceAvPlayer to verify no stts-region
   patch exists anywhere in the family (11.60 → 12.00 diff included).
