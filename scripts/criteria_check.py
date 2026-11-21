#!/usr/bin/env python3
"""Enforce CRITERIA.md: every row has a known status, and every `done` row has evidence that exists.

Exit code 1 on any violation. Called by scripts/verify_handoff.py; also runs on its own.
"""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
STATUSES = {"done", "partial", "planned", "limited by access"}
ID = re.compile(r"^[A-Z]\d+$")


def rows(text):
    for n, line in enumerate(text.splitlines(), 1):
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 4 or not ID.match(cells[0]):
            continue
        yield n, cells


def check(path=ROOT / "CRITERIA.md"):
    errors, counts, seen = [], {s: 0 for s in sorted(STATUSES)}, set()
    if not path.is_file():
        return [f"Missing {path.name}"], counts
    for n, cells in rows(path.read_text(encoding="utf-8")):
        rid, status, evidence = cells[0], cells[2], cells[3]
        if rid in seen:
            errors.append(f"CRITERIA.md:{n}: duplicate ID {rid}")
        seen.add(rid)
        if status not in STATUSES:
            errors.append(f"CRITERIA.md:{n}: {rid} has unknown status '{status}'")
            continue
        counts[status] += 1
        paths = re.findall(r"`([^`]+)`", evidence)
        missing = [p for p in paths if not (ROOT / p).exists()]
        for p in missing:
            errors.append(f"CRITERIA.md:{n}: {rid} evidence path does not exist: {p}")
        if status == "done" and not paths:
            errors.append(f"CRITERIA.md:{n}: {rid} is done but names no evidence path")
    if not seen:
        errors.append("CRITERIA.md has no criteria rows")
    return errors, counts


def main():
    errors, counts = check()
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    total = sum(counts.values())
    summary = ", ".join(f"{k} {v}" for k, v in counts.items())
    print(f"PASS: {total} criteria rows; {summary}. Every done row has existing evidence.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
