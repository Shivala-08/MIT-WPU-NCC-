# Phase 3.8 — Execution Record

**Status: permanent record of what was done, what passed and what remains
blocked. No production connection has ever been made in this phase.**

This document exists so that a future session can tell completed work from
blocked work without re-running the investigations. It records evidence; it
authorises nothing.

## Labels

| Label | Meaning |
| --- | --- |
| **[V]** | Verified — read from the file system, the archive itself, or the local database in an earlier recorded session. |
| **[H]** | Historical — taken from project documentation or a previous report; not re-verified in this session. |
| **[I]** | Inferred — a conclusion drawn from the verified facts. |
| **[P]** | Proposed — an action for a later stage. |
| **[A]** | Approval required. |

Repository state at the time of this record: branch `fix/auth-identity`, HEAD
`96987cf`. **[V]**

---

## 1. Gate summary

| Gate | Scope | Status |
| --- | --- | --- |
| **1A** | Verified local backup of `ncc_dev` | **PASS** |
| **1B** | Restore rehearsal into a disposable database | **PASS** (reported; no on-disk evidence — see §2.2) |
| **2A** | Production access preparation | **BLOCKED** |
| **2B** | Production connection verification | **BLOCKED** |
| **2** | Production schema and migration-history inspection | **NOT EXECUTED** |

Gate 1 (backup) is satisfied. Gate 2 (production evidence) is not, and nothing
downstream of Gate 2 has begun.

---

## 2. Gate 1A — Verified local backup

**Status: PASS.**

### 2.1 Artifact

| Field | Value |
| --- | --- |
| Path | `/Users/pallav/ncc-backups/ncc_dev-20261107T070354Z.dump` |
| Size | 49,602 bytes **[V]** |
| Permissions | `-rw-------` (0600), directory `0700` **[V]** |
| Format | PostgreSQL custom archive, gzip |
| Source database | `ncc_dev` @ `127.0.0.1:5432` |
| PostgreSQL version | 18.6 (Homebrew) |
| `pg_dump` exit status | 0 |
| `pg_restore --list` exit status | 0 |
| SHA-256 | `047826b73e3ebe0a44a316573c8df95d50b42fa722abbb5f1dc1a67e810cf502` |
| Sidecar | `ncc_dev-20261107T070354Z.dump.sha256`, `.toc`, `.manifest.json` **[V]** |

The SHA-256 above matches the value in the sidecar file and in the manifest.
**[V]**

### 2.2 Object inventory of the archive

| Object class | Count |
| --- | --- |
| Application tables | 21 |
| Enum types | 6 |
| Indexes | 49 (28 index TOC entries + 21 constraint-backed) |
| Foreign keys | 14 |
| Triggers | 3 |
| Functions | 2 |
| `_prisma_migrations` rows | 6 |

### 2.3 Checksum verification

**Passed.** The archive checksum equals the recorded sidecar value. **[V]**

### 2.4 Production access during Gate 1A

**None.** The dump was taken from the local development database. Gate 1A made
no production connection and read no production credential. **[V]**

### 2.5 Restore rehearsal — Gate 1B

| Item | Result |
| --- | --- |
| Disposable database | `ncc_restore_verify_20261107` |
| Restore completed | Reported successful **[H]** |
| 21 tables verified | Reported **[H]** |
| 6 enums verified | Reported **[H]** |
| 49 indexes verified | Reported **[H]** |
| 14 foreign keys verified | Reported **[H]** |
| 3 triggers verified | Reported **[H]** |
| 2 functions verified | Reported **[H]** |
| 6 migration rows preserved | Reported **[H]** |
| Table row counts matched | Reported **[H]** |
| Structural fingerprints matched | Reported **[H]** |
| Disposable database removed | Reported **[H]** |
| Original `ncc_dev` preserved | Reported **[H]** |

**Evidence caveat.** The manifest records `"restore_tested": false`, and no
restore log, report or artifact for `ncc_restore_verify_20261107` exists in
`~/ncc-backups/`, in `docs/`, in `scripts/` or in the shell history checked.
**[V]** The Gate 1B results above are therefore recorded as **reported by the
executing session**, not independently re-verified here. The backup's
archive-level integrity is verified (§2.3); its restore-tested status is
asserted but unevidenced on disk.

**Consequence.** If a future stage needs to rely on the restore rehearsal as
proof of rollback safety, re-run the rehearsal under its own approval and write
a log beside the dump. Until then, the dump should be described as
**archive-verified**, not **restore-proven**.

---

## 3. Gate 2A — Access preparation

**Status: BLOCKED.**

| Finding | State |
| --- | --- |
| Verified production database identity | **Not obtained** |
| Existing read-only role confirmed | **Not confirmed** |
| Production PostgreSQL credential configured | **Not configured** |
| Administrator confirmation | **Required, outstanding** |

At the time of the Gate 2B intake review (Phase 3.8.7), zero of the 18 required
fields in `docs/PHASE_3_8_ADMIN_ACCESS_REQUEST.md` had been answered. The
handoff document exists; no administrator response exists anywhere in the
workspace. **[V]**

The historical project reference `qkmpowtxkpbxelbbqdij` appears in the handoff
document for investigation only. It has **never** been verified as the
production project. **[H]**

---

## 4. Gate 2B — Connection verification

**Status: BLOCKED.**

| Item | State |
| --- | --- |
| Connection attempted | **No** |
| Production endpoint guessed | **No** |
| Credentials obtained | **No** |
| Read-only transaction established | **No** |
| Administrator response | **Outstanding** |

No network connection to any production endpoint has been made in this phase.
No endpoint has been inferred from the historical project reference. **[V]**

---

## 5. Gate 2 — Production inspection

**Status: NOT EXECUTED.**

No production schema has been read. No production `_prisma_migrations` history
has been read. No production row counts exist. No production enum, index,
constraint, trigger or function inventory exists.

**Every production value is UNKNOWN.** They must not be recorded as absent,
zero, or "same as local". "Unknown" and "absent" are different findings and the
difference determines whether a migration is needed at all. **[I]**

---

## 6. Known migration discrepancies (unresolved)

These are **local** findings recorded in
`docs/PHASE_3_8_MIGRATION_DECISION_MATRIX.md`. They are carried forward
verbatim and must not be silently corrected, "fixed" during an unrelated step,
or edited away.

### 6.1 Phase 3 attendance migration — checksum mismatch

Migration: `20261030080432_phase3_attendance_operations`

| Item | Value |
| --- | --- |
| Checksum stored in `_prisma_migrations` | `8031ecf3…` (`8031ecf36db288041efa2c4d741c12e74e402ba0ceda9b85111f7f745182bac8`) |
| Checksum of the current file on disk | `9b9c520d…` (`9b9c520d85b45ab1f98bec2c0aad803e47860e0c65fa56bd6a28ad49ce5915ce`) |
| Nature | bookkeeping only; the schema produced by the current file matches `ncc_dev` |
| Decision | **UNRESOLVED** — no option chosen |

Effect: Prisma refuses the chain for any database that already applied this
migration. A fresh database is unaffected. **[H]**

### 6.2 Account deactivation — schema present, history row absent

Migration: `20261101090000_account_deactivation`

| Item | State |
| --- | --- |
| Schema objects locally (`User.deactivatedAt`, `deactivatedById`, `deactivationReason`, index, FK, `CadetProfile` RESTRICT) | **present** |
| `_prisma_migrations` row | **absent** |
| Decision | **UNRESOLVED** — `resolve --applied` not run, not approved |

### 6.3 Approval decision source — not applied

Migration: `20261105000000_approval_decision_source` ("M1")

| Item | State |
| --- | --- |
| Enum `ApprovalDecisionSource` | **absent** |
| `User.approvalDecisionSource` column | **absent** |
| `_prisma_migrations` row | **absent** |
| Decision | **UNRESOLVED** — not applied, not approved |

The application tolerates the column's absence by probing the catalog, so code
deployment and this migration can occur in either order. That tolerance is not
a reason to skip the decision. **[H]**

### 6.4 Status of all three

All three discrepancies remain **open and unrecorded in any decision log**.
None has been corrected, and no correction may occur without its own written
approval. Any production comparison at Gate 2 must be performed with these
three known-local anomalies in mind, so that a production finding is not
mistaken for a new defect. **[I]**

---

## 7. The remaining closure sequence

This is the exact order of what is left. Each numbered step needs the approval
named against it. No step may be merged with another, and no step may be
skipped because it looks harmless.

| # | Step | Approval needed |
| --- | --- | --- |
| 1 | Administrator confirms production project identity | none (information) |
| 2 | Administrator confirms an existing suitable read-only role | none (information) |
| 3 | Secure credential configuration outside the repository | **required** |
| 4 | Explicit approval for Gate 2B | **required** |
| 5 | Gate 2B — connection verification | — |
| 6 | Explicit approval for Gate 2 | **required** |
| 7 | Production schema and migration-history inspection | — |
| 8 | Local-versus-production reconciliation | — |
| 9 | Final migration execution plan | — |
| 10 | Separate approval for each database-changing operation | **required, per operation** |
| 11 | Migration execution and verification | — |
| 12 | Full regression testing | — |
| 13 | Phase 3 closure review | — |

Steps 1–2 are blocked on the administrator. Step 3 is blocked because no
credential mechanism is configured (§8). Steps 4 onward cannot be scoped until
steps 1–3 resolve, because the endpoints, role and evidence bounds all depend
on them.

---

## 8. Credential readiness

Check performed at Gate 2B intake; existence and mode only, contents never read.

| Mechanism | State |
| --- | --- |
| `~/.pgpass` with `0600` | **Absent** **[V]** |
| `PGPASSFILE` | **Not set** **[V]** |
| Protected shell environment variable | **No evidence** **[V]** |

No credential file was created or modified. No password was read, printed or
retrieved at any point in Phase 3.8. **[V]**

---

## 9. What has NOT happened

Recorded explicitly, because "no finding" is not the same as "clean":

- No production connection of any kind.
- No production endpoint probed.
- No SQL executed against any database.
- No Prisma command run.
- No migration applied, resolved, rolled back or edited.
- No `_prisma_migrations` row written.
- No database role created; no privilege granted or revoked.
- No production setting modified.
- No migration file or application source modified.
- No entry of `prisma/baseline-candidate/` modified.
- No commit, push or deployment.

---

## 10. Current blocker

**The blocker is administrator-provided production access.** It is not a
technical defect in the repository, not a missing backup, and not an unresolved
test failure. Gate 1 is done; Gate 2 cannot start until a human supplies
verified production identity, a confirmed read-only role and a secure
credential path.

Until then, Stage 5 is **not complete** and must not be described as complete.

---

## 11. Document map

| Document | Role |
| --- | --- |
| `docs/PHASE_3_8_EXECUTION_RECORD.md` | this record — gate status and closure sequence |
| `docs/PHASE_3_8_ADMIN_ACCESS_REQUEST.md` | the handoff awaiting an administrator response |
| `docs/PHASE_3_8_BACKUP_INVENTORY.md` | backup inventory and restore-test status |
| `docs/PHASE_3_8_PRODUCTION_MIGRATION_INVENTORY.md` | read-only query set for Gate 2 |
| `docs/PHASE_3_8_MIGRATION_DECISION_MATRIX.md` | options for the three discrepancies; no option chosen |
| `docs/PHASE_3_6_STAGE_5_EXECUTION_PLAN.md` | the reconciliation plan and its prerequisites |
| `docs/PHASE_3_6_PRODUCTION_READINESS_CHECKLIST.md` | production readiness items |
| `docs/PRODUCTION_READINESS_CHECKLIST.md` | consolidated readiness checklist |
| `docs/MIGRATION_SAFETY.md`, `docs/MIGRATION_EQUIVALENCE_ANALYSIS.md` | migration safety analysis |

**STOP.** This record documents state. It does not authorise the next step.
