# Archived Research Material

These files are retained for source comparison and historical analysis. They are
not part of the active FW 13.60 userland payload set and must not be loaded by the
launcher or payload dispatcher.

## Directory Policy

- `payloads/redundant`: duplicate sanity checks.
- `payloads/unsupported`: requires an unprofiled or unavailable interface.
- `payloads/destructive`: can fuzz, mutate, or stress a target interface.
- `payloads/incomplete`: useful research direction, but not safe or complete enough for the active route.
- `payloads/legacy`: superseded implementation.
- `research/unsafe-benchmarks`: unbounded or high-pressure browser workloads.
- `research/duplicate`: overlapping research reports.
- `research/broken`: expects removed or nonexistent runtime state.
- `reference/p2jb-worker`: P2JB-derived worker and adapter code retained for audit only.

The active route is exact FW 13.60 userland research. No archived file is a
13.60 kernel exploit profile, and none should be re-enabled by aliasing another
firmware's offsets.
