"""Phase 0: evaluate Laya on real Spanish tasks (variant A: multilingual, variant B: MarianMT es->en + English Laya)."""
import argparse
import time
from pathlib import Path

import pandas as pd
from sklearn.metrics import accuracy_score, confusion_matrix

HERE = Path(__file__).parent
Q_IMPORTANT_ES = "¿Esta tarea ayuda a alguno de estos objetivos?"
Q_DELEGABLE_ES = "¿Puede hacer esta tarea otra persona?"
Q_IMPORTANT_EN = "Does this task help with any of these goals?"
Q_DELEGABLE_EN = "Could someone else do this task?"
MIN_TASKS = 50
GATE_AGREEMENT = 0.80
GATE_MAX_DOUBT = 0.30


def load_router():
    from laya import Router  # verify import path against the installed package
    return Router()


def run_laya(router, text: str, question: str, model: str) -> float:
    """Return P(yes) for a binary 'noul' question.

    VERIFY: the questions/answer format below follows the published examples
    (router.predict(text, questions, model=...) -> result["answers"][key]).
    Check the installed laya README and adapt if needed.
    """
    questions = {"q": {"type": "noul", "question": question}}
    result = router.predict(text, questions, model=model)
    answer = result["answers"]["q"]
    for key in ("p", "prob", "probability", "yes"):
        if key in answer:
            return float(answer[key])
    raise KeyError(f"Unknown answer format, adapt run_laya(): {answer}")


class Translator:
    def __init__(self):
        from transformers import MarianMTModel, MarianTokenizer
        name = "Helsinki-NLP/opus-mt-es-en"
        self.tok = MarianTokenizer.from_pretrained(name)
        self.model = MarianMTModel.from_pretrained(name)

    def __call__(self, text: str) -> str:
        batch = self.tok([text], return_tensors="pt", padding=True)
        out = self.model.generate(**batch, max_new_tokens=128)
        return self.tok.decode(out[0], skip_special_tokens=True)


def score_importance(router, goals, task, question, model, strategy, prefixes):
    """Return (p, index of the best goal or None).

    combined: every goal in one input (one call).
    per-goal: one call per goal, keep the max; this is what the app needs for matchedGoalId.
    """
    prefix_goals, prefix_task = prefixes
    if strategy == "combined":
        return run_laya(router, f"{prefix_goals}: {'; '.join(goals)}\n{prefix_task}: {task}", question, model), None
    scores = [run_laya(router, f"{prefix_goals}: {g}\n{prefix_task}: {task}", question, model) for g in goals]
    best = max(range(len(scores)), key=scores.__getitem__)
    return scores[best], best


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--variant", choices=["A", "B"], required=True)
    parser.add_argument("--strategy", choices=["combined", "per-goal"], default="combined")
    parser.add_argument("--threshold", type=float, default=0.5)
    parser.add_argument("--low", type=float, default=0.35)
    parser.add_argument("--high", type=float, default=0.65)
    args = parser.parse_args()

    goals = [g.strip() for g in (HERE / "goals.txt").read_text(encoding="utf-8").splitlines() if g.strip()]
    tasks = pd.read_csv(HERE / "tasks.csv")
    if len(tasks) < MIN_TASKS:
        print(f"Aviso: {len(tasks)} tareas; el criterio de salida pide al menos {MIN_TASKS}.")
    # The app sends the cleaned title (no date or duration phrases); use it when the CSV has it.
    text_col = "title" if "title" in tasks.columns else "text"
    router = load_router()

    if args.variant == "A":
        translate = None
        model, q_imp, q_del = "multilingual", Q_IMPORTANT_ES, Q_DELEGABLE_ES
        prefixes = ("Objetivos", "Tarea")
        goals_used = goals
    else:
        translate = Translator()
        model, q_imp, q_del = "english", Q_IMPORTANT_EN, Q_DELEGABLE_EN
        prefixes = ("Goals", "Task")
        goals_used = [translate(g) for g in goals]  # once, as the app would cache them

    # Warm-up: keep model loading out of the first task's latency.
    run_laya(router, f"{prefixes[1]}: warm-up", q_del, model)

    rows = []
    for _, row in tasks.iterrows():
        start = time.perf_counter()
        task_txt = translate(row[text_col]) if translate else row[text_col]
        p_imp, goal_idx = score_importance(router, goals_used, task_txt, q_imp, model, args.strategy, prefixes)
        p_del = run_laya(router, f"{prefixes[1]}: {task_txt}", q_del, model)
        ms = (time.perf_counter() - start) * 1000
        rows.append({
            **row.to_dict(),
            "input_used": task_txt,
            "p_important": p_imp,
            "matched_goal": goals[goal_idx] if goal_idx is not None else "",
            "p_delegable": p_del,
            "ms": round(ms, 1),
        })

    res = pd.DataFrame(rows)
    res["pred_important"] = (res["p_important"] >= args.threshold).astype(int)
    res["pred_delegable"] = (res["p_delegable"] >= args.threshold).astype(int)
    # Same bounds as the engine: p <= low and p >= high are decided, only (low, high) asks.
    res["doubt_zone"] = (res["p_important"] > args.low) & (res["p_important"] < args.high)
    res.to_csv(HERE / f"results_{args.variant}_{args.strategy}.csv", index=False)

    acc_imp = accuracy_score(res["important"], res["pred_important"])
    acc_del = accuracy_score(res["delegable"], res["pred_delegable"])
    doubt_rate = res["doubt_zone"].mean()
    decided = res[~res["doubt_zone"]]
    acc_decided = accuracy_score(decided["important"], (decided["p_important"] >= args.high).astype(int)) if len(decided) else float("nan")
    cm = confusion_matrix(res["important"], res["pred_important"], labels=[1, 0])
    calls = 2 if args.strategy == "combined" else len(goals) + 1
    gate = acc_imp >= GATE_AGREEMENT and doubt_rate <= GATE_MAX_DOUBT
    es = lambda x: f"{x:.2f}".replace(".", ",")  # noqa: E731
    summary = (
        f"\n## Variante {args.variant} · {args.strategy}\n\n"
        f"- Tareas: {len(res)} (columna `{text_col}`)\n"
        f"- Acuerdo en importancia (umbral {es(args.threshold)}): {acc_imp:.1%}\n"
        f"- En zona de duda ({es(args.low)}-{es(args.high)}): {doubt_rate:.1%}\n"
        f"- Acuerdo fuera de la zona de duda: {acc_decided:.1%}\n"
        f"- Acuerdo en delegabilidad: {acc_del:.1%}\n"
        f"- Llamadas al modelo por tarea: {calls}\n"
        f"- Latencia por tarea: mediana {res['ms'].median():.0f} ms, p95 {res['ms'].quantile(0.95):.0f} ms (CPU de escritorio, no el móvil)\n"
        f"- Matriz de confusión importancia [real 1, real 0] x [pred 1, pred 0]: {cm.tolist()}\n"
        f"- Criterio de calidad (acuerdo ≥ {GATE_AGREEMENT:.0%} y duda ≤ {GATE_MAX_DOUBT:.0%}): {'cumple' if gate else 'no cumple'}\n"
    )
    with open(HERE / "report.md", "a", encoding="utf-8") as fh:
        fh.write(summary)
    print(summary)


if __name__ == "__main__":
    main()
