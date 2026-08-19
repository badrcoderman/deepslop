# pooP2JB Audit

Generated from the 48 offset files without evaluating source JavaScript.
The report separates offset presence from tested support. Kernel-stage execution is not enabled by the DeepSlop adapter.

## Component Classification

| Component | Classification | Integration decision |
|---|---|---|
| `core.js` / `mem.js` | userland primitive | adapter input; require promoted pair |
| `rop-worker.js` | worker-backed ROP executor | adapter input; profile-gated |
| `rop.js` | legacy chain builder | do not use without capacity wrapper |
| `rop_slave.js` | worker echo loop | copied only as executor dependency |
| `p2jb.js` / `poops.js` | destructive kernel stages | excluded from DeepSlop v2 route |
| `syscalls.js` | symbolic syscall names | keep separate from stub RVAs |

## Firmware Matrix

| Firmware | Userland | Worker | Kernel | P2JB | Gadgets | Syscalls |
|---|---|---|---|---|---:|---:|
| 3.00 | incomplete | unavailable | offset-file | unsupported | 24 | 326 |
| 3.10 | incomplete | unavailable | offset-file | unsupported | 24 | 326 |
| 3.20 | incomplete | unavailable | offset-file | unsupported | 24 | 326 |
| 3.21 | incomplete | unavailable | offset-file | unsupported | 24 | 326 |
| 4.00 | incomplete | unavailable | offset-file | unsupported | 24 | 326 |
| 4.02 | incomplete | unavailable | offset-file | unsupported | 24 | 326 |
| 4.03 | incomplete | unavailable | offset-file | unsupported | 26 | 326 |
| 4.50 | incomplete | unavailable | offset-file | unsupported | 24 | 326 |
| 4.51 | incomplete | unavailable | offset-file | unsupported | 24 | 326 |
| 5.00 | incomplete | unavailable | offset-file | unsupported | 24 | 326 |
| 5.02 | incomplete | unavailable | offset-file | unsupported | 24 | 326 |
| 5.10 | incomplete | unavailable | offset-file | unsupported | 24 | 326 |
| 5.50 | incomplete | unavailable | offset-file | unsupported | 26 | 326 |
| 6.00 | incomplete | unavailable | unavailable | unsupported | 26 | 327 |
| 6.02 | incomplete | unavailable | unavailable | unsupported | 26 | 327 |
| 6.50 | incomplete | unavailable | unavailable | unsupported | 26 | 327 |
| 7.00 | incomplete | unavailable | unavailable | unsupported | 26 | 328 |
| 7.01 | incomplete | unavailable | unavailable | unsupported | 26 | 328 |
| 7.20 | incomplete | unavailable | unavailable | unsupported | 26 | 329 |
| 7.40 | incomplete | unavailable | unavailable | unsupported | 26 | 329 |
| 7.60 | incomplete | unavailable | unavailable | unsupported | 26 | 329 |
| 7.61 | incomplete | unavailable | unavailable | unsupported | 26 | 329 |
| 8.00 | incomplete | unavailable | unavailable | unsupported | 26 | 330 |
| 8.20 | incomplete | unavailable | unavailable | unsupported | 26 | 330 |
| 8.40 | incomplete | unavailable | unavailable | unsupported | 26 | 330 |
| 8.60 | incomplete | unavailable | unavailable | unsupported | 26 | 330 |
| 9.00 | offset-file | unavailable | offset-file | unsupported | 26 | 331 |
| 9.05 | offset-file | unavailable | offset-file | unsupported | 26 | 331 |
| 9.20 | offset-file | unavailable | offset-file | unsupported | 26 | 331 |
| 9.40 | offset-file | unavailable | offset-file | unsupported | 26 | 331 |
| 9.60 | offset-file | unavailable | offset-file | unsupported | 26 | 331 |
| 10.00 | offset-file | unavailable | offset-file | unsupported | 26 | 331 |
| 10.01 | offset-file | unavailable | offset-file | unsupported | 26 | 331 |
| 10.20 | offset-file | unavailable | offset-file | unsupported | 26 | 331 |
| 10.40 | offset-file | unavailable | offset-file | unsupported | 26 | 331 |
| 10.60 | offset-file | unavailable | offset-file | unsupported | 26 | 331 |
| 11.00 | offset-file | unavailable | offset-file | unsupported | 26 | 331 |
| 11.20 | offset-file | unavailable | offset-file | unsupported | 26 | 331 |
| 11.40 | offset-file | unavailable | offset-file | unsupported | 26 | 331 |
| 11.60 | offset-file | unavailable | offset-file | unsupported | 26 | 331 |
| 12.00 | offset-file | offset-file | offset-file | offset-file | 26 | 331 |
| 12.02 | offset-file | offset-file | offset-file | offset-file | 26 | 331 |
| 12.20 | offset-file | offset-file | offset-file | offset-file | 26 | 331 |
| 12.40 | offset-file | offset-file | offset-file | offset-file | 26 | 331 |
| 12.60 | offset-file | offset-file | offset-file | offset-file | 26 | 331 |
| 12.70 | offset-file | offset-file | offset-file | offset-file | 26 | 331 |
| 13.00 | offset-file | unavailable | unavailable | unsupported | 26 | 331 |
| 13.20 | offset-file | unavailable | unavailable | unsupported | 26 | 331 |

## Core Layer Audit

| File | Audited surface | Result |
|---|---|---|
| `core.js` | primitive setup, serialized-history capture, pointer validation, retries | usable userland primitive; require promoted-pair status |
| `mem.js` | byte/word/qword access, address leaks, promotion and rollback | usable with strict address and promotion gates |
| `int64.js` | low/high arithmetic and conversions | usable; keep `hi` and `high` schema names separate |
| `syscalls.js` | symbolic syscall constants | incomplete relative to offset-map IDs; do not use as stub registry |
| `main.js` | base resolution, worker discovery, chain preparation | usable only when exact worker fields exist |
| `p2jb.js` | race, kernel writes, credential and loader stages | destructive; excluded from v2 route |
| `poops.js` | structured race and kernel-stage ladder | destructive; terminal power-cycle state after trigger |

## ROP and Worker Audit

- `rop-worker.js` supports `rdi`, `rsi`, `rdx`, `rcx`, `r8`, and `r9` through `syscallSync`.
- `Chain.commit()` bounds the copied chain; legacy `rop.js` `push()` does not.
- The worker requires exact `thread_list`, `syscall_wrapper`, setjmp/longjmp, slot fingerprint, and gadget fields.
- Worker slot recovery is runtime-sensitive; failure must latch the adapter as unavailable.
- `rop_slave.js` is only the worker wake/echo loop and is not a ROP implementation.

## Memory and Math Audit

- `mem.js` accepts numbers and low/high objects; normalized profiles use strings to avoid JavaScript integer truncation.
- `int64.js` emits `hi`; callers using `high` must be rejected or normalized explicitly.
- The adapter never treats the `aimRead` primitive as a promoted arbitrary write pair.

## Required Runtime Gates

1. Firmware must match an exact profile key.
2. The userland primitive must report a promoted pair.
3. Worker fields, gadget set, and syscall wrapper must all be present.
4. Hardware-tested status must be explicit; neighboring firmware values are never inherited.
5. Kernel and P2JB fields remain unavailable unless the profile says otherwise.

## Known Risks

- `rop.js` does not enforce chain capacity; the adapter uses `rop-worker.js` `Chain.commit()` instead.
- Worker stack slot selection is runtime-sensitive and must be fingerprinted before any call.
- 13.00 and 13.20 contain userland/gadget data but no complete worker/kernel profile.
- The current operator target 13.60 has no pooP2JB profile and remains userland-diagnostics-only.
