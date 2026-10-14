# Decisions

When an ADR must be read, and how a new one is recorded. Routed from
[`AGENTS.md`](../../AGENTS.md): match the trigger table here before touching code,
and read the whole file before recording an architectural or product-scope choice.

## When to read one

Every row names a **trigger** and a **file**. Follow the rows that match the task
and skip the rest. The traps live in the routed files, not here.

| If touching | READ |
| --- | --- |
| `run.ts`, a source in `src/sources/`, `report.ts`, the comment, `fail-on`, the workflow `permissions` the README asks for | [ADR 2026-10.wqdp](../memory/decisions/2026-10-wqdp-the-action-asks-one-keyless.md) |
| `api.ts`, `ecosystems.ts`, what a request carries, `exclude`, `record-misses`, the User-Agent | [ADR 2026-10.d86j](../memory/decisions/2026-10-d86j-only-names-and-versions-leave.md) |

## Where they live

One file per decision under [`../memory/decisions/`](../memory/decisions/). The
index at [`../memory/decisions.md`](../memory/decisions.md) is a **generated
router** over them.

## Adding one

```sh
python3 scripts/adr.py new "<title>" --topics a,b   # scaffolds the file, prints the citation
# write the body
python3 scripts/adr.py index                        # regenerates the router
```

**Never hand-edit the router.** `python3 scripts/adr.py index --check` fails
instead of writing, and CI runs it.
