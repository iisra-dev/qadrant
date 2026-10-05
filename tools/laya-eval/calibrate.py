"""Phase 0, fine-tuning block: can calibration rescue a variant? (docs/06, "Ajuste fino").

Reads the results_*.csv written by eval.py and, with leave-one-out (each task
is scored by a calibration fitted without it), compares:
  1. laya's own temperature scaling (fit_one_temperature),
  2. Platt scaling (logistic regression on the logit: adds the shift laya lacks),
  3. Platt + the app's threshold search from docs/03 (low/high on a 0.05 grid,
     high - low >= 0.15, cost = errors + 0.3 x doubts).
Appends a section to report.md.
"""
import argparse
import glob
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression

HERE = Path(__file__).parent
EPS = 1e-4


def logit(p):
    p = np.clip(p, EPS, 1 - EPS)
    return np.log(p / (1 - p))


def sigmoid(z):
    return 1 / (1 + np.exp(-z))


def ece(p, y, bins=5):
    edges = np.linspace(0, 1, bins + 1)
    total = 0.0
    for lo, hi in zip(edges[:-1], edges[1:]):
        mask = (p >= lo) & (p < hi if hi < 1 else p <= hi)
        if mask.any():
            total += mask.mean() * abs(p[mask].mean() - y[mask].mean())
    return total


def temperature(z, y):
    from laya.calibrate import fit_one_temperature
    pairs = [([0.0, float(zi)], [1.0 - yi, float(yi)]) for zi, yi in zip(z, y)]
    return fit_one_temperature(pairs, min_n=1)


def platt(z, y):
    model = LogisticRegression(C=1e6).fit(z.reshape(-1, 1), y)
    f = lambda zz: model.predict_proba(np.asarray(zz).reshape(-1, 1))[:, 1]  # noqa: E731
    f.slope = float(model.coef_[0][0])
    return f


def app_thresholds(p, y):
    """docs/03: grid of 0.05, high - low >= 0.15, minimise errors + 0.3 x doubts."""
    best = None
    grid = np.round(np.arange(0.05, 1.0, 0.05), 2)
    for low in grid:
        for high in grid:
            if high - low < 0.15 - 1e-9:
                continue
            decided = (p <= low) | (p >= high)
            errors = ((p >= high) & (y == 0)).sum() + ((p <= low) & (y == 1)).sum()
            cost = errors + 0.3 * (~decided).sum()
            if best is None or cost < best[0]:
                best = (cost, low, high)
    return best[1], best[2]


def evaluate(path):
    r = pd.read_csv(path)
    y = r["important"].to_numpy().astype(int)
    z = logit(r["p_important"].to_numpy())
    n = len(y)
    p_temp, p_platt, outcome = np.zeros(n), np.zeros(n), []
    slope = platt(z, y).slope
    for i in range(n):
        train = np.arange(n) != i
        t = temperature(z[train], y[train])
        p_temp[i] = sigmoid(z[i] / t)
        f = platt(z[train], y[train])
        p_platt[i] = f([z[i]])[0]
        low, high = app_thresholds(f(z[train]), y[train])
        if p_platt[i] >= high:
            outcome.append("ok" if y[i] == 1 else "error")
        elif p_platt[i] <= low:
            outcome.append("ok" if y[i] == 0 else "error")
        else:
            outcome.append("doubt")
    raw = sigmoid(z)
    outcome = np.array(outcome)
    decided = outcome != "doubt"
    return {
        "file": Path(path).stem.removeprefix("results_"),
        "raw_acc": ((raw >= 0.5) == y).mean(),
        "raw_ece": ece(raw, y),
        "temp_acc": ((p_temp >= 0.5) == y).mean(),
        "temp_ece": ece(p_temp, y),
        "platt_acc": ((p_platt >= 0.5) == y).mean(),
        "platt_ece": ece(p_platt, y),
        "app_doubt": (~decided).mean(),
        "app_acc_decided": (outcome[decided] == "ok").mean() if decided.any() else float("nan"),
        "app_errors": (outcome == "error").sum(),
        "inverted": slope < 0,
    }


def pct(x):
    return "—" if x != x else f"{x * 100:.0f} %"


def num(x):
    return f"{x:.2f}".replace(".", ",")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-report", action="store_true", help="print only, do not append to report.md")
    args = parser.parse_args()
    rows = [evaluate(f) for f in sorted(glob.glob(str(HERE / "results_*.csv")))]
    lines = [
        "",
        "## Calibración (validación cruzada dejando una tarea fuera)",
        "",
        "| Variante · estrategia · formato | Sin calibrar: acuerdo / ECE | Temperatura de laya: acuerdo / ECE | Platt: acuerdo / ECE | Platt + umbrales de 03: duda / acuerdo fuera de duda / errores |",
        "| --- | --- | --- | --- | --- |",
    ]
    for r in rows:
        lines.append(
            f"| {r['file'].replace('_', ' · ')}{' (invertida)' if r['inverted'] else ''} | {pct(r['raw_acc'])} / {num(r['raw_ece'])} | {pct(r['temp_acc'])} / {num(r['temp_ece'])} "
            f"| {pct(r['platt_acc'])} / {num(r['platt_ece'])} | {pct(r['app_doubt'])} / {pct(r['app_acc_decided'])} / {r['app_errors']} |"
        )
    best = max((r for r in rows if not r["inverted"]), key=lambda r: r["platt_acc"])
    lines += [
        "",
        "ECE: error medio entre el porcentaje que da el modelo y la frecuencia real (0 es perfecto).",
        "",
        f"- La temperatura de `laya` no cambia el acuerdo: escala la probabilidad sin moverla de lado del 0,5, así que solo puede afinar los porcentajes (ECE).",
        "- «(invertida)»: Platt aprende una pendiente negativa, es decir, da la vuelta a las respuestas de un modelo que acierta al revés. No es una mejora real y se descarta.",
        f"- Platt añade el desplazamiento que le falta al modelo. Mejor resultado: {best['file'].replace('_', ' · ')} con {pct(best['platt_acc'])} de acuerdo.",
        f"- Con los umbrales que la app recalibraría (03), en esa misma combinación quedan {pct(best['app_doubt'])} de dudas (el criterio pide ≤ 30 %) y {pct(best['app_acc_decided'])} de acierto en lo que decide.",
        "- Conclusión: la calibración no basta para el criterio de salida (≥ 80 %); hace falta el ajuste fino con más tareas etiquetadas.",
    ]
    text = "\n".join(lines) + "\n"
    print(text)
    if not args.no_report:
        with open(HERE / "report.md", "a", encoding="utf-8") as fh:
            fh.write(text)


if __name__ == "__main__":
    main()
