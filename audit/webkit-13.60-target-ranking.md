# FW 13.60 WebKit Target Ranking

## First Target

`research/genericTypedArray/index.html` is the first candidate to turn into an
active probe. It uses a small resizable `ArrayBuffer`, one resize, and one
`copyWithin` operation. The active implementation is
`payloads/resizable_arraybuffer_probe.js`.

The probe is feature-gated and stops when resizable buffers are unavailable. It
does not warm up JIT code, spray objects, groom the heap, forge cells, write
native pointers, or retry after an unexpected result.

## Deferred Candidates

- `research/maxu/index.html`: safe WebGL compatibility test, but not evidence of
  a FW 13.60 WebKit vulnerability.
- `research/poc/index.html`: incomplete and CPU-heavy JIT behavior test.
- `research/dfg/index.html`: exploit-oriented UAF/addrof/fakeobj attempt with
  large allocations and repeated corruption attempts.
- `research/jordy/index.html`: explicitly targets FW 11.60/WebKit 616.1 and
  performs forged-object read/write.
- `research/userland_only/index.html`: contains zero 13.x offsets and several
  unfinished raw R/W, fcall, and RWX paths.
- `research/angler/index.html`: targets iOS/Chrome CVEs and deliberately uses
  WebKit/GPU corruption; it is not a PS5 13.60 candidate.
- `research/get_by_id_with_this/index.html`: depends on a JSC test-only API.

## Stop Conditions

Stop on unsupported API behavior, an unexpected exception, a hang, a page
failure, or any state that differs from the expected API result. A normal result
is recorded as `PASS` or `UNAVAILABLE`; it is not escalated into a primitive.
