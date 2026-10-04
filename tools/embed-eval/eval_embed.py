"""Phase 0: is a small multilingual embedding model a better engine than Laya? (docs/07)

Same data and leave-one-out protocol as tools/laya-eval. For each model:
  similarity  importance score = highest cosine similarity between the task and a goal
              (no training; a threshold is fitted on the other tasks),
  learned     a logistic regression on the task embedding plus the similarity,
              trained on the other tasks (what the app could learn from corrections),
  app         Platt-calibrated similarity + the docs/03 threshold search (doubt rate).
Also a small multilingual NLI model in zero-shot mode, as a third option.
Writes report.md next to this file.
"""
import argparse
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score

HERE = Path(__file__).parent
DATA = HERE.parent / "laya-eval"
sys.path.insert(0, str(DATA))
from calibrate import app_thresholds  # noqa: E402  same threshold search as the app (docs/03)

EMBEDDERS = {
    "multilingual-e5-small": {"id": "intfloat/multilingual-e5-small", "prefix": "query: "},
    "paraphrase-multilingual-MiniLM-L12-v2": {"id": "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2", "prefix": ""},
}
NLI = "MoritzLaurer/multilingual-MiniLMv2-L6-mnli-xnli"


def loo(n):
    for i in range(n):
        yield np.arange(n) != i, i


def best_threshold(score, y):
    cands = np.unique(score)
    accs = [((score >= t) == y).mean() for t in cands]
    return cands[int(np.argmax(accs))]


def threshold_loo(score, y):
    hits = [int(score[i] >= best_threshold(score[m], y[m])) == y[i] for m, i in loo(len(y))]
    return float(np.mean(hits))


def learned_loo(features, y):
    p = np.zeros(len(y))
    for m, i in loo(len(y)):
        model = LogisticRegression(C=1.0, max_iter=2000, class_weight="balanced").fit(features[m], y[m])
        p[i] = model.predict_proba(features[i : i + 1])[0, 1]
    return p


def app_loo(score, y):
    """Platt on the score, then the app's low/high search; returns doubt rate and agreement when it decides."""
    out = []
    for m, i in loo(len(y)):
        platt = LogisticRegression(C=1e6).fit(score[m].reshape(-1, 1), y[m])
        cal = platt.predict_proba(score.reshape(-1, 1))[:, 1]
        low, high = app_thresholds(cal[m], y[m])
        out.append("ok" if (cal[i] >= high and y[i] == 1) or (cal[i] <= low and y[i] == 0) else ("doubt" if low < cal[i] < high else "error"))
    out = np.array(out)
    decided = out != "doubt"
    return float((~decided).mean()), float((out[decided] == "ok").mean()) if decided.any() else float("nan")


def evaluate_embedder(name, spec, titles, goals, y, delegable):
    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer(spec["id"], device="cpu")
    params = sum(p.numel() for p in model.parameters())
    goal_vecs = model.encode([spec["prefix"] + g for g in goals], normalize_embeddings=True)
    model.encode([spec["prefix"] + "warm-up"])
    start = time.perf_counter()
    task_vecs = np.stack([model.encode(spec["prefix"] + t, normalize_embeddings=True) for t in titles])
    ms = (time.perf_counter() - start) * 1000 / len(titles)
    sims = task_vecs @ goal_vecs.T
    score = sims.max(axis=1)
    learned = learned_loo(np.hstack([task_vecs, sims]), y)
    doubt, decided_acc = app_loo(score, y)
    # Delegability has no goal to compare with: only the learned variant applies.
    d_mask = ~np.isnan(delegable)
    d_y = delegable[d_mask].astype(int)
    d_p = learned_loo(task_vecs[d_mask], d_y)
    return {
        "delegable_auc": roc_auc_score(d_y, d_p),
        "delegable_acc": float(((d_p >= 0.5) == d_y).mean()),
        "engine": name,
        "params": params,
        "ms": ms,
        "sim_auc": roc_auc_score(y, score),
        "sim_acc": threshold_loo(score, y),
        "learned_auc": roc_auc_score(y, learned),
        "learned_acc": float(((learned >= 0.5) == y).mean()),
        "app_doubt": doubt,
        "app_acc": decided_acc,
    }


def evaluate_nli(titles, goals, y, lang_hypothesis):
    from transformers import pipeline
    clf = pipeline("zero-shot-classification", model=NLI, device=-1)
    params = sum(p.numel() for p in clf.model.parameters())
    clf(titles[0], goals, hypothesis_template=lang_hypothesis, multi_label=True)
    start = time.perf_counter()
    score = np.array([max(clf(t, goals, hypothesis_template=lang_hypothesis, multi_label=True)["scores"]) for t in titles])
    ms = (time.perf_counter() - start) * 1000 / len(titles)
    doubt, decided_acc = app_loo(score, y)
    return {
        "engine": f"NLI {NLI.split('/')[1]}",
        "params": params,
        "ms": ms,
        "sim_auc": roc_auc_score(y, score),
        "sim_acc": threshold_loo(score, y),
        "learned_auc": float("nan"),
        "learned_acc": float("nan"),
        "app_doubt": doubt,
        "app_acc": decided_acc,
        "delegable_auc": float("nan"),
        "delegable_acc": float("nan"),
    }


def pct(x):
    return "—" if x != x else f"{x * 100:.0f} %"


def num(x):
    return "—" if x != x else f"{x:.2f}".replace(".", ",")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, default=DATA / "tasks.csv")
    parser.add_argument("--goals", type=Path, default=DATA / "goals.txt")
    parser.add_argument("--no-nli", action="store_true")
    args = parser.parse_args()
    rows = pd.read_csv(args.data)
    rows = rows[rows["important"].isin([0, 1])].reset_index(drop=True)
    titles = list(rows["title"] if "title" in rows.columns else rows["text"])
    goals = [g.strip() for g in args.goals.read_text(encoding="utf-8").splitlines() if g.strip()]
    y = rows["important"].to_numpy().astype(int)

    delegable = pd.to_numeric(rows["delegable"], errors="coerce").to_numpy(dtype=float)
    results = [evaluate_embedder(n, s, titles, goals, y, delegable) for n, s in EMBEDDERS.items()]
    if not args.no_nli:
        nli = evaluate_nli(titles, goals, y, "Esta tarea ayuda a: {}.")
        results.append(nli)

    lines = [
        "# Fase 0 · Motor alternativo: embeddings multilingües",
        "",
        f"Datos: {len(y)} tareas de `tasks.csv` ({int(y.sum())} importantes) y {len(goals)} objetivos. Todo con validación cruzada dejando una tarea fuera. Latencia en CPU de escritorio (una tarea; los objetivos se calculan una vez). Referencia: Laya, mejor caso, 74 % con calibración y AUC 0,80 con traducción.",
        "",
        "| Motor | Parámetros | Latencia | Similitud: AUC / acuerdo | Aprendido de tus etiquetas: AUC / acuerdo | Umbrales de 03: duda / acierto al decidir | Delegabilidad aprendida: AUC / acuerdo |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for r in results:
        lines.append(
            f"| {r['engine']} | {r['params'] / 1e6:.0f} M | {r['ms']:.0f} ms | {num(r['sim_auc'])} / {pct(r['sim_acc'])} "
            f"| {num(r['learned_auc'])} / {pct(r['learned_acc'])} | {pct(r['app_doubt'])} / {pct(r['app_acc'])} | {num(r['delegable_auc'])} / {pct(r['delegable_acc'])} |"
        )
    text = "\n".join(lines) + "\n"
    (HERE / "report.md").write_text(text, encoding="utf-8")
    print(text)


if __name__ == "__main__":
    main()
