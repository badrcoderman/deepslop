# Poopsploit Execution Audit

Read-only source audit of the Poopsploit path in `pooP2JB`. The kernel trigger
is intentionally excluded from the active FW 13.60 route.

## Execution Order

1. `poops.html:1897-2089` handles latches, preflight, and run selection.
2. `poops.html:1610-1737` acquires or reuses the JSC primitive.
3. `mem.js:408-730` validates and promotes the primitive.
4. `p2jb_poops.js:266-380` adapts memory, syscall, allocator, and worker APIs.
5. `poops.js:9824-10077` prepares socketpairs, pipes, racers, and routing headers.
6. `poops.js:4106-4119` executes the race sequence.
7. `poops.js:4250-7839` validates aliases, reclaims objects, and builds kernel R/W.
8. `poops.js:7971-8217` performs credential and root-directory escalation.
9. `poops.js:8432-9223` maps shellcode/ELF data and starts the post-escalation path.

## Reusable Research Discipline

- Negative controls before trigger activation: `poops.js:10092-10105`.
- Bounded loop and deadline handling: `poops.js:2105-2133` and
  `poops.html:350-360`.
- Independent or repeated alias or pointer oracles: `poops.js:1840-1945`,
  `4250-4284`, and `5150-5642`.
- Critical telemetry stays synchronous only when the worker may wedge; hot-path
  telemetry is queued: `poops.html:637-767` and `rop-worker.js:468-510`.
- JSC cleanup and promotion rollback: `core.js:325-399` and `mem.js:682-729`.
- UI elements and images are static/preloaded to avoid post-exploit DOM churn:
  `poops.html:198-202` and `542-560`.

## Excluded From FW 13.60

- IPv6 `rthdr` UAF trigger.
- Credential reference-count races and descriptor flooding.
- Kernel pointer discovery and pipe-buffer kernel R/W.
- UID, authority, root-directory, dynlib, pmap, GPU, and kexp writes.
- 9.00-12.00 worker, syscall, and kernel offsets.

The useful output for 13.60 is the validation and telemetry methodology, not the
Poopsploit vulnerability or its kernel stages.
