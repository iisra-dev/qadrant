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
    # laya 0.3.25: the weights are pinned per repository in laya.PINNED_REVISIONS,
    # so pinning the package version (requirements.lock) pins the weights too.
    from laya import Router
    return Router()


def weights_revisions() -> dict:
    import laya
    return {"laya": laya.__version__, **laya.PINNED_REVISIONS}


def run_laya(router, state, question, model: str) -> float:
    """Return P(true) for a binary 'noul' question.

    Verified against laya 0.3.25: the question text goes in "instructions" and
    the answer is result["answers"][qid]["noul"] (P(true), rounded to 4 decimals).
    model="multilingual" forces the multilingual checkpoint (no language routing).
    """
    qdef = question if isinstance(question, dict) else {"type": "noul", "instructions": question}
    result = router.predict(state, {"q": qdef}, model=model)
    return float(result["answers"]["q"]["noul"])


def smoke() -> None:
    """Check the installed API with one call per checkpoint; writes nothing."""
    router = load_router()
    print("Revisiones:", weights_revisions())
    for model, goals, task, question in (
        ("multilingual", "Objetivos", "Tarea", Q_IMPORTANT_ES),
        ("english", "Goals", "Task", Q_IMPORTANT_EN),
    ):
        text = f"{goals}: Cerrar las ventas del trimestre\n{task}: Mandar la oferta al cliente"
        start = time.perf_counter()
        p = run_laya(router, text, question, model)
        print(f"{model}: p={p:.4f} ({(time.perf_counter() - start) * 1000:.0f} ms, primera llamada)")


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


# Two ways to ask, measured side by side (docs/03 uses "text" until phase 0 decides):
# text:   one string "Objetivos: ...\nTarea: ..." and a plain question.
# fields: a dict state, the question names its fields in backticks and true/false
#         criteria describe each answer, as in laya's own presets.
FORMATS = {
    "A": {
        "importance": {
            "type": "noul",
            "instructions": "¿La `tarea` ayuda a cumplir alguno de los `objetivos`?",
            "criteria": {
                "true": "hacer la tarea acerca a uno de los objetivos",
                "false": "la tarea no tiene que ver con ninguno de los objetivos",
            },
        },
        "delegable": {
            "type": "noul",
            "instructions": "¿Puede hacer la `tarea` otra persona en lugar de mí?",
            "criteria": {
                "true": "otra persona podría hacerla igual de bien",
                "false": "tengo que hacerla yo",
            },
        },
        "fields": ("objetivos", "tarea"),
    },
    "B": {
        "importance": {
            "type": "noul",
            "instructions": "Does `task` help achieve any of the `goals`?",
            "criteria": {
                "true": "doing the task moves one of the goals forward",
                "false": "the task is unrelated to every goal",
            },
        },
        "delegable": {
            "type": "noul",
            "instructions": "Could someone else do `task` instead of me?",
            "criteria": {
                "true": "another person could do it just as well",
                "false": "I have to do it myself",
            },
        },
        "fields": ("goals", "task"),
    },
}


def build_state(fmt, variant, prefixes, goals_text, task):
    if fmt == "text":
        return f"{prefixes[0]}: {goals_text}\n{prefixes[1]}: {task}"
    goals_key, task_key = FORMATS[variant]["fields"]
    return {goals_key: goals_text, task_key: task}


def build_delegable_state(fmt, variant, prefixes, task):
    if fmt == "text":
        return f"{prefixes[1]}: {task}"
    return {FORMATS[variant]["fields"][1]: task}


def score_importance(router, goals, task, question, model, strategy, prefixes, fmt="text", variant="A"):
    """Return (p, index of the best goal or None).

    combined: every goal in one input (one call).
    per-goal: one call per goal, keep the max; this is what the app needs for matchedGoalId.
    """
    if strategy == "combined":
        return run_laya(router, build_state(fmt, variant, prefixes, "; ".join(goals), task), question, model), None
    scores = [run_laya(router, build_state(fmt, variant, prefixes, g, task), question, model) for g in goals]
    best = max(range(len(scores)), key=scores.__getitem__)
    return scores[best], best


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--smoke", action="store_true", help="check the laya API and exit")
    parser.add_argument("--variant", choices=["A", "B"])
    parser.add_argument("--strategy", choices=["combined", "per-goal"], default="combined")
    parser.add_argument("--format", choices=["text", "fields"], default="text", dest="fmt")
    parser.add_argument("--threshold", type=float, default=0.5)
    parser.add_argument("--low", type=float, default=0.35)
    parser.add_argument("--high", type=float, default=0.65)
    args = parser.parse_args()
    if args.smoke:
        smoke()
        return
    if not args.variant:
        parser.error("--variant is required")

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

    if args.fmt == "fields":
        q_imp, q_del = FORMATS[args.variant]["importance"], FORMATS[args.variant]["delegable"]

    # Warm-up: keep model loading out of the first task's latency.
    run_laya(router, build_delegable_state(args.fmt, args.variant, prefixes, "warm-up"), q_del, model)

    rows = []
    for _, row in tasks.iterrows():
        start = time.perf_counter()
        task_txt = translate(row[text_col]) if translate else row[text_col]
        p_imp, goal_idx = score_importance(router, goals_used, task_txt, q_imp, model, args.strategy, prefixes, args.fmt, args.variant)
        p_del = run_laya(router, build_delegable_state(args.fmt, args.variant, prefixes, task_txt), q_del, model)
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
    res.to_csv(HERE / f"results_{args.variant}_{args.strategy}_{args.fmt}.csv", index=False)

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
        f"\n## Variante {args.variant} · {args.strategy} · formato {args.fmt}\n\n"
        f"- Tareas: {len(res)} (columna `{text_col}`)\n"
        f"- Versiones: {weights_revisions()}\n"
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
