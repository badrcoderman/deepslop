# P2JB Execution Audit

Read-only source audit of the P2JB path in `pooP2JB`. References identify the
critical execution boundaries; this document is not a 13.60 compatibility claim.

## Execution Order

1. `p2jb.html:281-304` loads the ROP, main, firmware offsets, syscall table,
   primitive, memory, and helper modules.
2. `p2jb.html:1378-1433` validates required assets, offsets, gadgets, syscall
   entries, and the worker script.
3. `core.js:503-1166` builds and validates the serialized-history JSC primitive.
4. `mem.js:408-729` promotes the arbitrary-read carrier to a typed-array
   read/write pair and rolls back on failure.
5. `main.js:145-202` derives module bases and prepares userland addresses.
6. `main.js:302-410` finds the parked Worker stack, installs the worker chain,
   and proves execution with `getpid`.
7. `p2jb.html:1984-2014` loads the worker, kernel-stage adapter, and P2JB engine.
8. `p2jb.js:761-1979` prepares descriptors, sockets, pipes, and the trigger.
9. `p2jb.js:2017-2851` performs the `cr_ref` overflow, alias reclaim, kernel
   read/write, and cleanup stages.
10. `p2jb.js:2853-3818` modifies credentials, kernel policy, and launches kexp.

## Reusable Userland Methods

- Exact firmware gating: `main.js:7-26`.
- Primitive structural checks: `core.js:703-925`.
- Promotion rollback and home-state verification: `mem.js:661-729`.
- Worker stack and parked-slot diagnostics: `rop-worker.js:143-170` and
  `rop-worker.js:218-284`.
- Completion flag ordering and torn-read avoidance: `rop-worker.js:327-466`.
- Worker wedge classification and failure latching: `rop-worker.js:468-510`.
- Async/sync worker smoke tests: `rop-worker.js:697-731`.

## Excluded From FW 13.60

- `p2jb.js` kernel trigger and escalation stages.
- `p2jb_lk.js` 12.00-12.70 worker profiles.
- `p2jb_poops.js` kernel adapter and kexp contract.
- 12.x offsets and `13.20.js` as a proxy profile.
- `kqueueex`, `setuid`, IPv6 sprays, credential writes, `allproc`, `rootvnode`,
  dynlib patches, kexp, and ELF loader handoff.

No 13.60 worker, kernel, or P2JB profile is present in this project.
