import unittest

from to_dataset import goals_from_export, merge, rows_from_export


def task(**overrides):
    base = {"id": "t", "title": "Llamar al taller", "rawInput": "Llamar al taller hoy", "quadrant": "do",
            "quadrantSource": "ai", "status": "open", "notes": "secret", "dueAt": "2026-10-02T16:00:00Z"}
    base.update(overrides)
    return base


class ToDatasetTest(unittest.TestCase):
    def test_labels(self):
        data = {"version": 1, "tasks": [
            task(important=True),
            task(rawInput="b", important=False, quadrant="delegate", quadrantSource="user"),
            task(rawInput="c", important=False, quadrant="do", quadrantSource="answer", decision={"ask": "delegable", "delegable": {"p": 0.5}}),
            task(rawInput="d", important=False, quadrant="delegate", decision={"delegable": {"p": None, "personId": "ana"}}),
            task(rawInput="unknown"),
            task(rawInput="deleted", important=True, deletedAt="2026-10-03T00:00:00Z"),
        ]}
        rows = rows_from_export(data)
        self.assertEqual([(r["text"], r["important"], r["delegable"]) for r in rows],
                         [("Llamar al taller hoy", "1", ""), ("b", "0", "1"), ("c", "0", "0"), ("d", "0", "1")])
        self.assertNotIn("secret", str(rows))
        self.assertNotIn("2026", str(rows))

    def test_rejects_other_files(self):
        with self.assertRaises(ValueError):
            rows_from_export({"version": 2})

    def test_goals_and_merge(self):
        data = {"version": 1, "goals": [
            {"title": "B", "summary": "B", "active": True, "order": 1},
            {"title": "A", "summary": "A", "active": True, "order": 0},
            {"title": "X", "summary": "X", "active": True, "order": 2, "deletedAt": "x"}]}
        self.assertEqual(goals_from_export(data), ["A", "B"])
        merged = merge([{"text": "Uno", "important": "1"}], [{"text": "uno ", "important": "0"}, {"text": "Dos", "important": "1"}])
        self.assertEqual([r["text"] for r in merged], ["Uno", "Dos"])


if __name__ == "__main__":
    unittest.main()
