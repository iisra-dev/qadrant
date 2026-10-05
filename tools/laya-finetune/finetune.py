"""Fine-tune Laya's multilingual checkpoint on labelled tasks (docs/06, "Ajuste fino").

The multilingual model avoids the translation step (latency, docs/07). It is
trained on the importance question exactly as eval.py and the app ask it:
same state, same question, same tokenisation (laya's own encoder and collate).

  python finetune.py --data ../laya-eval/tasks.csv --goals ../laya-eval/goals.txt --out runs/first

By default only the decision head is trained (about 15 M of 322 M parameters),
which suits a few hundred examples; --train last also unfreezes the last two
encoder layers, --train all everything. --folds k first reports k-fold
cross-validation (out-of-fold agreement and AUC) and then trains on all rows.
"""
import argparse
import importlib.util
import json
import random
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from sklearn.metrics import roc_auc_score

HERE = Path(__file__).parent
EVAL = HERE.parent / "laya-eval" / "eval.py"
BASE = ("convaiinnovations/laya", "multilingual")


def load_eval_module():
    """eval.py builds the states and questions; reuse it so training and measuring ask the same thing."""
    spec = importlib.util.spec_from_file_location("laya_eval", EVAL)
    module = importlib.util.module_from_spec(spec)
    sys.modules["laya_eval"] = module
    spec.loader.exec_module(module)
    return module


def load_agent():
    import laya
    return laya.load("ml")


def trainable_names(model, mode):
    names = []
    for name, _ in model.named_parameters():
        top = name.split(".")[0]
        if mode == "all":
            names.append(name)
        elif top in ("head", "scorer", "type_emb"):
            names.append(name)
        elif mode == "last" and top == "encoder" and ".layers." in name:
            index = int(name.split(".layers.")[1].split(".")[0])
            if index >= model_layer_count(model) - 2:
                names.append(name)
    return names


def model_layer_count(model):
    return 1 + max(int(n.split(".layers.")[1].split(".")[0]) for n, _ in model.named_parameters() if n.startswith("encoder.layers."))


class Example:
    def __init__(self, state, label):
        self.state, self.label = state, label


def build_examples(ev, rows, goals, fmt, text_col):
    question = ev.FORMATS["A"]["importance"] if fmt == "fields" else {"type": "noul", "instructions": ev.Q_IMPORTANT_ES}
    states = [ev.build_state(fmt, "A", ("Objetivos", "Tarea"), "; ".join(goals), t) for t in rows[text_col]]
    return question, [Example(s, int(y)) for s, y in zip(states, rows["important"])]


def encode(agent, question, examples):
    internal = {"q": agent._to_internal(question)}
    encoded = []
    for ex in examples:
        [item] = agent._encode_state(ex.state, ["q"], internal)
        # noul options are [false, true]; the target is a distribution over them.
        item["target"] = [1.0 - ex.label, float(ex.label)]
        encoded.append(item)
    return encoded


def p_true(agent, items):
    from laya.common import collate_items
    b = collate_items([[it] for it in items], agent.tok.pad_token_id)
    logits, _ = agent.model(b["input_ids"], b["attention_mask"], b["marker_pos"], b["marker_mask"], b["qtype"])
    return torch.softmax(logits[:, :2].float(), -1)[:, 1], b


def train(agent, items, names, epochs, lr, batch_size, seed):
    torch.manual_seed(seed)
    random.seed(seed)
    model = agent.model
    params = dict(model.named_parameters())
    for n, p in params.items():
        p.requires_grad_(n in names)
    optim = torch.optim.AdamW([params[n] for n in names], lr=lr, weight_decay=0.01)
    model.train()
    for epoch in range(epochs):
        order = list(range(len(items)))
        random.shuffle(order)
        total = 0.0
        for start in range(0, len(order), batch_size):
            batch = [items[i] for i in order[start:start + batch_size]]
            probs, b = p_true(agent, batch)
            target = b["target"][:, 1]
            loss = torch.nn.functional.binary_cross_entropy(probs.clamp(1e-6, 1 - 1e-6), target)
            optim.zero_grad()
            loss.backward()
            optim.step()
            total += loss.item() * len(batch)
        print(f"  epoch {epoch + 1}/{epochs} loss {total / len(items):.4f}", flush=True)
    model.eval()


@torch.no_grad()
def predict(agent, items):
    agent.model.eval()
    return p_true(agent, items)[0].numpy()


def snapshot(model, names):
    params = dict(model.named_parameters())
    return {n: params[n].detach().clone() for n in names}


def restore(model, saved):
    params = dict(model.named_parameters())
    with torch.no_grad():
        for n, v in saved.items():
            params[n].copy_(v)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--goals", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--format", choices=["text", "fields"], default="text", dest="fmt")
    parser.add_argument("--train", choices=["head", "last", "all"], default="head")
    parser.add_argument("--epochs", type=int, default=12)
    parser.add_argument("--lr", type=float, default=5e-4)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--folds", type=int, default=5, help="0 skips cross-validation")
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()

    import laya
    ev = load_eval_module()
    rows = pd.read_csv(args.data)
    rows = rows[rows["important"].isin([0, 1])].reset_index(drop=True)
    text_col = "title" if "title" in rows.columns else "text"
    goals = [g.strip() for g in args.goals.read_text(encoding="utf-8").splitlines() if g.strip()]
    agent = load_agent()
    names = trainable_names(agent.model, args.train)
    initial = snapshot(agent.model, names)
    question, examples = build_examples(ev, rows, goals, args.fmt, text_col)
    items = encode(agent, question, examples)
    y = np.array([ex.label for ex in examples])
    print(f"{len(items)} examples, training {sum(initial[n].numel() for n in names) / 1e6:.1f} M parameters ({args.train})")

    report = {"n": int(len(items)), "format": args.fmt, "train": args.train, "epochs": args.epochs, "lr": args.lr}
    p_before = predict(agent, items)
    report["before"] = {"agreement": float(((p_before >= 0.5) == y).mean()), "auc": float(roc_auc_score(y, p_before))}

    if args.folds:
        rng = np.random.default_rng(args.seed)
        fold_of = rng.permutation(np.arange(len(items)) % args.folds)
        oof = np.zeros(len(items))
        for k in range(args.folds):
            print(f"fold {k + 1}/{args.folds}", flush=True)
            restore(agent.model, initial)
            train_idx = np.where(fold_of != k)[0]
            test_idx = np.where(fold_of == k)[0]
            train(agent, [items[i] for i in train_idx], names, args.epochs, args.lr, args.batch_size, args.seed + k)
            oof[test_idx] = predict(agent, [items[i] for i in test_idx])
        report["cross_validation"] = {
            "folds": args.folds,
            "agreement": float(((oof >= 0.5) == y).mean()),
            "auc": float(roc_auc_score(y, oof)),
            "doubt_rate": float(((oof > 0.35) & (oof < 0.65)).mean()),
        }

    print("final training on every row", flush=True)
    restore(agent.model, initial)
    start = time.perf_counter()
    train(agent, items, names, args.epochs, args.lr, args.batch_size, args.seed)
    report["train_seconds"] = round(time.perf_counter() - start, 1)

    args.out.mkdir(parents=True, exist_ok=True)
    torch.save(snapshot(agent.model, names), args.out / "weights.pt")
    report.update({
        "base": "/".join(BASE),
        "base_revision": laya.PINNED_REVISIONS.get("convaiinnovations/laya-multilingual"),
        "laya": laya.__version__,
        "trained_parameters": names if args.train != "all" else "all",
    })
    (args.out / "meta.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k != "trained_parameters"}, indent=2, ensure_ascii=False))


def apply_weights(agent, weights_dir):
    """Load fine-tuned weights into a freshly loaded multilingual agent (used by eval.py --weights)."""
    saved = torch.load(Path(weights_dir) / "weights.pt", map_location="cpu")
    restore(agent.model, saved)
    agent.model.eval()
    return agent


if __name__ == "__main__":
    main()
