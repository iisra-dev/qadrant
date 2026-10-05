"""Measure the int8 ONNX build the app will run, against the full model (docs/06, phase 0).

Embeds with onnxruntime + the tokenizer from model/ (as the browser will:
mean pooling over tokens, L2 normalisation, 128 tokens at most), repeats the
leave-one-out measurement of eval_embed.py and checks that agreement does not
drop more than 2 points. Writes:
  calibration.json  default calibration p = sigmoid(a * s + b), fitted on all tasks (03, step 6)
  reference.json    per task: similarities, score and probability, for the phase 2 parity test
and appends a section to report.md.
"""
import json
import time
from pathlib import Path

import numpy as np
import onnxruntime as ort
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from tokenizers import Tokenizer

import eval_embed as ref

HERE = Path(__file__).parent
MODEL = HERE / "model"
MAX_TOKENS = 128


class OnnxEmbedder:
    def __init__(self):
        self.tok = Tokenizer.from_file(str(MODEL / "tokenizer.json"))
        self.tok.enable_truncation(MAX_TOKENS)
        self.session = ort.InferenceSession(str(MODEL / "onnx" / "model_quantized.onnx"), providers=["CPUExecutionProvider"])

    def __call__(self, text):
        enc = self.tok.encode(text)
        ids = np.array([enc.ids], dtype=np.int64)
        mask = np.array([enc.attention_mask], dtype=np.int64)
        out = self.session.run(None, {"input_ids": ids, "attention_mask": mask, "token_type_ids": np.zeros_like(ids)})[0]
        pooled = (out * mask[..., None]).sum(1) / mask.sum(1, keepdims=True)
        return (pooled / np.linalg.norm(pooled, axis=1, keepdims=True))[0]


def main():
    rows = pd.read_csv(ref.DATA / "tasks.csv")
    rows = rows[rows["important"].isin([0, 1])].reset_index(drop=True)
    titles = list(rows["title"])
    goals = [g.strip() for g in (ref.DATA / "goals.txt").read_text(encoding="utf-8").splitlines() if g.strip()]
    y = rows["important"].to_numpy().astype(int)
    delegable = pd.to_numeric(rows["delegable"], errors="coerce").to_numpy(dtype=float)

    embed = OnnxEmbedder()
    goal_vecs = np.stack([embed(g) for g in goals])
    embed("warm-up")
    start = time.perf_counter()
    task_vecs = np.stack([embed(t) for t in titles])
    ms = (time.perf_counter() - start) * 1000 / len(titles)
    sims = task_vecs @ goal_vecs.T
    score = sims.max(axis=1)

    # Same embeddings with the full model, to see what quantisation changes.
    from sentence_transformers import SentenceTransformer
    full = SentenceTransformer(ref.EMBEDDERS["paraphrase-multilingual-MiniLM-L12-v2"]["id"], device="cpu")
    full_tasks = full.encode(titles, normalize_embeddings=True)
    full_goals = full.encode(goals, normalize_embeddings=True)
    full_score = (full_tasks @ full_goals.T).max(axis=1)
    cosine = float(np.mean(np.sum(task_vecs * full_tasks, axis=1)))

    results = {}
    for name, s, vecs, sm in (("completo (fp32)", full_score, full_tasks, full_tasks @ full_goals.T), ("ONNX int8", score, task_vecs, sims)):
        learned = ref.learned_loo(np.hstack([vecs, sm]), y)
        doubt, decided = ref.app_loo(s, y)
        results[name] = {
            "auc": roc_auc_score(y, s),
            "acc": ref.threshold_loo(s, y),
            "learned_acc": float(((learned >= 0.5) == y).mean()),
            "doubt": doubt,
            "decided": decided,
        }
    # Whole tasks: compare in task counts, not floats (1 task of 50 = 2 points).
    drop_tasks = max(
        round((results["completo (fp32)"]["acc"] - results["ONNX int8"]["acc"]) * len(y)),
        round((results["completo (fp32)"]["learned_acc"] - results["ONNX int8"]["learned_acc"]) * len(y)),
    )
    drop = drop_tasks / len(y)
    allowed = drop <= 0.02 + 1e-9

    platt = LogisticRegression(C=1e6).fit(score.reshape(-1, 1), y)
    a, b = float(platt.coef_[0][0]), float(platt.intercept_[0])
    info = json.loads((MODEL / "model-info.json").read_text())
    (HERE / "calibration.json").write_text(json.dumps({
        "model": info["repo"], "revision": info["revision"], "maxTokens": MAX_TOKENS,
        "importance": {"a": a, "b": b}, "fittedOn": {"tasks": int(len(y)), "goals": len(goals)},
    }, indent=2), encoding="utf-8")
    p = 1 / (1 + np.exp(-(a * score + b)))
    (HERE / "reference.json").write_text(json.dumps({
        "goals": goals,
        "tasks": [{"title": t, "similarities": [round(float(v), 6) for v in sims[i]], "score": round(float(score[i]), 6), "p": round(float(p[i]), 6)} for i, t in enumerate(titles)],
    }, indent=2, ensure_ascii=False), encoding="utf-8")

    def pct(x):
        return "—" if x != x else f"{x * 100:.0f} %"

    def es(x, digits=2):
        return f"{x:.{digits}f}".replace(".", ",")

    lines = [
        "",
        "## ONNX int8 frente al modelo completo",
        "",
        f"Misma medición (validación cruzada dejando una tarea fuera) con el ONNX int8 en `onnxruntime` y el tokenizador de `model/`, como lo hará el navegador (media de tokens, normalización, {MAX_TOKENS} tokens como máximo). Similitud coseno media entre los embeddings int8 y los completos: {es(cosine, 3)}. Latencia int8 en CPU de escritorio: {ms:.0f} ms por tarea.",
        "",
        "| Modelo | Similitud: AUC / acuerdo | Aprendido: acuerdo | Umbrales de 03: duda / acierto al decidir |",
        "| --- | --- | --- | --- |",
    ]
    for name, r in results.items():
        lines.append(f"| {name} | {es(r['auc'])} / {pct(r['acc'])} | {pct(r['learned_acc'])} | {pct(r['doubt'])} / {pct(r['decided'])} |")
    lines += [
        "",
        f"Caída máxima de acuerdo: {drop_tasks} tarea(s) de {len(y)}, {drop * 100:.0f} puntos (límite: 2). {'Cumple.' if allowed else 'No cumple.'}",
        f"Calibración por defecto (`calibration.json`): p = sigmoid({es(a)} · s {'+' if b >= 0 else '−'} {es(abs(b))}), ajustada con las {len(y)} tareas. Referencia para la paridad de la fase 2: `reference.json`.",
    ]
    text = "\n".join(lines) + "\n"
    with open(HERE / "report.md", "a", encoding="utf-8") as fh:
        fh.write(text)
    print(text)
    if not allowed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
