"""Download the chosen engine, pinned: paraphrase-multilingual-MiniLM-L12-v2, int8 ONNX.

Takes the ONNX already exported and quantized for Transformers.js (Xenova repo,
dynamic int8 quantization of the sentence-transformers model) at a fixed
revision, plus its tokenizer, into ./model/ (not in git), and writes
model/model-info.json with size and SHA-256 of every file.
"""
import hashlib
import json
from pathlib import Path

from huggingface_hub import hf_hub_download

HERE = Path(__file__).parent
REPO = "Xenova/paraphrase-multilingual-MiniLM-L12-v2"
REVISION = "2c4055b12046f11709e9df2c122e59ffbdc2f900"
SOURCE = ("sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2", "e8f8c211226b894fcb81acc59f3b34ba3efd5f42")
FILES = ["onnx/model_quantized.onnx", "tokenizer.json", "tokenizer_config.json", "config.json", "special_tokens_map.json"]
OUT = HERE / "model"


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    OUT.mkdir(exist_ok=True)
    files = {}
    for name in FILES:
        local = Path(hf_hub_download(REPO, name, revision=REVISION, local_dir=OUT))
        files[name] = {"bytes": local.stat().st_size, "sha256": sha256(local)}
        print(f"{name}: {local.stat().st_size / 1e6:.1f} MB")
    info = {"repo": REPO, "revision": REVISION, "source": {"repo": SOURCE[0], "revision": SOURCE[1]}, "quantization": "dynamic int8 (Transformers.js 'q8')", "files": files}
    (OUT / "model-info.json").write_text(json.dumps(info, indent=2), encoding="utf-8")
    total = sum(f["bytes"] for f in files.values())
    print(f"total {total / 1e6:.1f} MB ({total / 2**20:.1f} MiB)")


if __name__ == "__main__":
    main()
