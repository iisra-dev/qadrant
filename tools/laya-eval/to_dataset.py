"""Turn a Qadrant JSON export (Settings > Data > Export tasks) into training rows.

Only what the user confirmed becomes a label, and only the text and labels
leave the export (no notes, dates or people):
  important  task.important (set when saving a proposal, an answer or a manual choice);
             tasks without it are skipped.
  delegable  1 if the task is in Delegate by the user's choice or by an assignment,
             0 if the user answered that nobody else can do it, empty otherwise.

Usage:
  python to_dataset.py export.json --out dataset.csv [--goals goals.txt] [--append tasks.csv]
"""
import argparse
import csv
import json
from pathlib import Path

FIELDS = ["text", "title", "important", "delegable", "source"]


def delegable_label(task):
    decision = task.get("decision") or {}
    if task.get("quadrant") == "delegate" and (
        task.get("quadrantSource") in ("user", "answer") or (decision.get("delegable") or {}).get("personId")
    ):
        return "1"
    if task.get("quadrantSource") == "answer" and decision.get("ask") == "delegable" and task.get("quadrant") == "do":
        return "0"
    return ""


def rows_from_export(data):
    if not isinstance(data, dict) or data.get("version") != 1:
        raise ValueError("not a Qadrant export (version 1)")
    rows = []
    for task in data.get("tasks", []):
        if task.get("deletedAt") or task.get("important") is None:
            continue
        rows.append(
            {
                "text": task.get("rawInput") or task.get("title", ""),
                "title": task.get("title", ""),
                "important": "1" if task["important"] else "0",
                "delegable": delegable_label(task),
                "source": task.get("quadrantSource", ""),
            }
        )
    return rows


def goals_from_export(data):
    goals = [g for g in data.get("goals", []) if g.get("active") and not g.get("deletedAt")]
    return [g.get("summary") or g.get("title", "") for g in sorted(goals, key=lambda g: g.get("order", 0))]


def merge(existing, new):
    """Append new rows, skipping texts already present (the existing label wins)."""
    seen = {r["text"].strip().lower() for r in existing}
    return existing + [r for r in new if r["text"].strip().lower() not in seen]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("export", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--goals", type=Path, help="also write the active goals, one per line")
    parser.add_argument("--append", type=Path, help="start from an existing CSV such as tasks.csv")
    args = parser.parse_args()

    data = json.loads(args.export.read_text(encoding="utf-8"))
    rows = rows_from_export(data)
    if args.append:
        with open(args.append, encoding="utf-8", newline="") as fh:
            existing = [{k: r.get(k, "") for k in FIELDS} for r in csv.DictReader(fh)]
        rows = merge(existing, rows)
    with open(args.out, "w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=FIELDS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    labelled = sum(1 for r in rows if r["important"] in ("0", "1"))
    print(f"{args.out}: {len(rows)} rows, {labelled} with importance, {sum(1 for r in rows if r['delegable'])} with delegability")
    if args.goals:
        args.goals.write_text("\n".join(goals_from_export(data)) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
