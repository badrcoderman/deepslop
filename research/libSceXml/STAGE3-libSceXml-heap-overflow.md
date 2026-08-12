# STAGE 3 — libSceXml: heap overflow in entity text decoding

Target: `system/common/lib/libSceXml.sprx` (12.70 image)
Category: userland heap buffer overflow (attacker-controlled length + content)
Entry points: `sce::Xml::Sax::Parser::parse` (export @0x65a0), `sce::Xml::Dom::DocumentBuilder::parse` (export @0x2270)
Rating: high — reachable in-process from any XML-using service/app; no preconditions beyond parser input

## Summary

The XML text-decoding routines in libSceXml contain an incorrect buffer-growth
predicate on the "copy unknown entity verbatim" paths. When text is decoded,
the output buffer (malloc'd, initial cap 0x14, grown in +0x14 steps) is
overwritten past its allocation whenever it is more than `vlen-1` bytes full
(`vlen` = capacity of the entity-name buffer, attacker-controlled size).

Three identical bug sites:
- 0x1179c — type-6 path (char ref `&#...;` — valid AND malformed), decoder 0x115b0 (LIVE)
- 0x11849 — type-5 path (unknown entity `&name;`), in decoder 0x115b0 (LIVE)
- 0x11cf1 — same two paths in twin decoder 0x11af0 (DEAD CODE in 12.70 — no
  call/jmp/8-byte/4-byte references anywhere in the module; type-5 path is
  skipped there entirely, only type-6 exists)

## Verified call graph (12.70, both APIs reach the same live decoder)

```
SAX:  Sax::Parser::parse @0x65a0
        -> 0x68d0
          -> 0x143c0 @0x690d            (SAX run wrapper)
            -> 0x13860 @0x1446b         (tokenizer main loop)
              -> 0x125b0 @0x1396b       (element dispatch fn)
                -> 0x11e50 @0x126ec     (attribute-value handler, state 0xc)
                  -> 0x115b0 @0x12069   (VULNERABLE decoder; entity in attr value)
                -> 0x12190 @0x127a3     (tag/text handler)
                  -> 0x115b0 @0x123b0   (VULNERABLE decoder; entity in text)

DOM:  Dom::DocumentBuilder::parse @0x2270
        -> 0x28d0
          -> 0x15570 @0x2915            (DOM builder)
            -> 0x14810 @0x155a7/0x157e3
            -> 0x14940 @0x1560e
              -> 0x125b0 @0x14a52       (same element dispatch fn)
                -> 0x11e50 / 0x12190 -> 0x115b0
```

Both `parse()` APIs reach decoder 0x115b0 through the shared element-dispatch
function 0x125b0. Attribute values AND text content both hit it (0x12069 is
inside the attribute-value handler; 0x123b0 inside the tag/text handler).

Verified SAFE (audited, no flawed pattern):
- 0x114d0 + container 0x11400 — attribute-value scan/decode variants: they
  scan for terminator / `=` and append via flush helpers 0x10700 / 0x10690,
  which contain correct growth checks.
- 0x105a0 / 0x10700 — flush helpers, correct `available`-based growth.
- Tokenizer entity sites 0x13c0b / 0x14cac — callback-based copies (vtable
  *0x50 / *0x58), no linear output buffer.
- State dispatch table @0x1f8c0 (states 2/7/12 -> 0x7fcc/0x7fc8/0x7fc4) are
  three entry points of one callback emitter (0x7fc2), not decoders.

## Root cause

Stack layout in decoder 0x115b0 (same in twin 0x11af0):

```
-0x40: out buffer ptr   -0x38: out len    -0x34: out cap (init 0x14, +0x14/step)
-0x50: name buffer ptr  -0x48: name len   -0x44: name cap (init 0x14, +0x14/step)
```

Name accumulation (0x11746–0x11777) grows with a correct check
(`cap > len` → direct write; else grow via 0x136c0 = malloc/copy/free, cap += 0x14).

The buggy copy, type-6 path (0x1178c–0x117ee):

```
0x1178c: mov -0x34(%rbp),%esi     ; esi = OUT CAP
0x11794: mov -0x44(%rbp),%edx     ; edx = NAME CAP (copy length)
0x11797: mov -0x38(%rbp),%ecx     ; ecx = OUT LEN
0x1179a: add %edx,%esi            ; esi = OUT CAP + NAME CAP
0x1179c: cmp %ecx,%esi            ; OUT CAP + NAME CAP  vs  OUT LEN
0x1179e: jg  0x117c6              ; > OUT LEN  -> skip grow, copy now
...
0x117e0: byte copy loop           ; writes NAME CAP bytes at out[OUT LEN .. ]
0x117ee: jl 0x117e0
```

Correct predicate for skipping growth is `OUT LEN + vlen <= OUT CAP`.
The code tests `OUT CAP + vlen > OUT LEN`. Since OUT LEN <= OUT CAP always
(appends grow before exceeding), the tested condition is *always* true for
vlen >= 1 — growth is **never** performed, and the copy overflows whenever

    OUT LEN + NAME CAP > OUT CAP

i.e. whenever the output buffer is within `NAME CAP` bytes of full.

Overflow size: `OUT LEN + NAME CAP - OUT CAP` in [1, NAME CAP].
NAME CAP = 0x14 * ceil((name_len+1)/0x14) — 20 bytes minimum, grows with the
entity name length (attacker-controlled, bounded only by input size).

## Trigger

Reachable states for `OUT LEN == OUT CAP` (exact-full) are natural: the text
append path fills the buffer up to capacity before growing, so text of length
k*0x14 followed by an entity lands with OUT LEN == OUT CAP.

Minimal trigger (overflow >= 1 byte; e.g. outlen=1, namecap=0x14, outcap=0x14):

```xml
<root>A&amp;unknown;</root>
```

Wait — `&amp;` is a predefined entity (type 0, safe single-byte path). The
vulnerable types are 5 (unknown) and 6 (malformed char ref):

```xml
<root>A&zz;</root>          <!-- type 5: unknown entity, name "zz" -->
<root>A&#x41;</root>        <!-- type 6: VALID char ref 'A' (also vulnerable) -->
<root>A&#xGG;</root>        <!-- invalid ref -> type 7 error, safe -->
```

Full-size overflow (text of exactly 0x14*k chars, then long entity name):

```xml
<root>AAAAAAAAAAAAAAAAAAAA&amp;foobar...;</root>   <!-- 20 A's = cap 0x14, namecap 0x14.. -->
```

Any entity name length `n` gives NAME CAP >= n+1 rounded up; with OUT LEN ==
OUT CAP the overflow is NAME CAP bytes, first ~n bytes fully attacker-controlled
(the entity name itself), then NUL + uninitialized heap.

Type dispatch (mapper 0x119c0): predefined `lt/gt/amp/quot/apos` -> types 0-4
(safe). First char `#` -> char-ref parse; VALID code points = type 6
(vulnerable! encode is UTF-8'd into the name buffer by 0x15c00, then the
name-cap copy overflows), invalid (bad digits / surrogate / cp out of range)
= type 7 -> error 0x8085000b. Anything else = type 5 (vulnerable).

## Post-overflow parser state

- Type 6: after the copy, `OUT LEN += name_len` (0x117f7) — only the true name
  length, not the copied `name cap` bytes. Parser continues; buffer is freed at
  function exit (0xfff0).
- Type 5: `&` appended (correct check), then the flawed name copy, then
  `OUT LEN += name_len`, NUL, then `;` appended (correct check).
- Subsequent growth of the out buffer (0x136c0) memcpys `cap` bytes, i.e. the
  overrun bytes are preserved — no self-healing.
- Repeated entities keep overflowing while `OUT LEN` stays within the window;
  compounding corruptions possible.

Corrupted object: heap chunk adjacent to the out buffer (its user data /
size field / flink/blink). Primitive: OOB write of up to `name_len`-ish bytes,
first bytes attacker-controlled. Classic glibc-style chunk corruption to
arbitrary write; also trivially crashable.

## Verification notes

- All three sites verified by direct disassembly of libSceXml.sprx 12.70.
- Phase-2 emulation proof COMPLETE (2026-08): decoder 0x115b0 executed inside
  Unicorn with tracked malloc/free thunks; 22/22 trigger-matrix cases
  reproduced byte-exactly (types 5/6 overflow up to 41 bytes past a 0x14-byte
  allocation; error types 0/7/8 safe). Full report + reproducer:
  STAGE3B-libSceXml-unicorn-emulation-proof.md (harness
  /tmp/opencode/lscexml-verify/emu_decoder.py, transcript
  evidence/phase2_proof_transcript.txt).
- Phase-1 static re-verification (2026-08): full call graph re-derived from
  the SCE export table (ie_db/12.70.json) + one-pass capstone call scan;
  decoder twin 0x11af0 proven dead code; attr-value variants 0x114d0/0x11400
  and flush helpers 0x105a0/0x10700 proven safe. Evidence: /tmp/opencode/
  lscexml-verify/evidence/ (decoder_0x115b0, decoder_twin_0x11af0, mapper_0x119c0,
  grow_0x136c0, parse_dec/hex, validate, handler_0x12069, handler_0x123b0,
  tokenizer_0x13860, site_0x13c0b, site_0x14cac, flush_0x105a0, flush2_0x10700,
  attrval_decode_0x114d0, state_handlers_0x7fc4, dom_builder_0x15570, ...).
- 0x136c0 = grow helper (malloc 0xffe0 / memcpy 0x16c80 / free 0xfff0;
  new cap = cap + max(req, cap); called with req=0x14).
- Decoder reachability: 0x12069 / 0x123b0 both `mov 0x108(%rbx),%rsi;
  mov %rbx,%rdi; call 0x115b0` — the 0x108 field is an owned String
  {cap@0x4, len@0xc, ptr@0x18} (ctor 0x6ec0); parser state fields:
  0x84 state (0xc = attribute value), 0x88 dispatch state, 0xa8 input ptr,
  0xb0 pos, 0xb4 len, 0xba terminator char, 0x82 flag, 0x110 error.
- Tokenizer entity sites 0x13c0b/0x14cac in the tokenizer body use
  callback-based copies with correct checks (SAFE); they do NOT call the
  flawed decoder.
- No .dynsym in this sprx; exports resolved from the SCE export table in
  stage 1 (DocumentBuilder::parse @0x2270, Sax::Parser::parse @0x65a0).

## Next steps

1. ~~Phase 2 — unicorn emulation proof~~ DONE — see STAGE3B report: 22/22
   byte-exact reproduction; overflow up to 41 bytes past a 0x14-byte
   allocation, first N bytes attacker-controlled; valid char refs also
   vulnerable (type 6).
2. Phase 3 — attack-surface sweep: version sweep 1.00..12.70 (all present in
   ps5-libs/unp; same flawed pattern expected, verify each 0x115b0 twin);
   check importers of sce::Xml in 12.70 lib set; check webkit for a JS-facing
   XML path (webkit binary absent from 12.70 set — needs another source).
3. Phase 3.5 — 13.60 (user's test unit): no 13.xx dump exists; extract
   libSceXml.sprx on-device (ps5kern dlsym 0x24e + lapse-runtime.js bridge,
   see deepslop/ payloads) before computing harness offsets for the PS5 test.
4. Phase 4 — PS5 runtime proof: JS payload (sprx_dlopen + call export
   parse()) or ELF harness; heap grooming for chunk-size corruption ->
   allocator primitives; or use the uninitialized-heap tail as info leak.
