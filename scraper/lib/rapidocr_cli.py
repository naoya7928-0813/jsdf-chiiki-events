#!/usr/bin/env python3
"""RapidOCR を1枚の画像に対して実行し、認識テキストを JSON で標準出力へ返す。

認識モデルは **日本語**（PP-OCRv6 small / lang=japan）を使う。
旧実装の rapidocr-onnxruntime は既定が中国語モデルで、ひらがな・カタカナを落とし
簡体字に置き換える（「駐屯地」→「鞋屯地」、「お気軽に」→「书氮軽」）。
2026-10-13 の実測で、本番の文字化けタイトルの主因がこれだった。

- rapidocr（>=3.10）が入っていれば日本語モデルを使う（モデルは wheel に同梱。欠けたときだけ自動ダウンロード）
- 入っていなければ旧 rapidocr_onnxruntime にフォールバックする（ローカル環境の後方互換）
  どちらを使ったかは "engine" に出す（ログで判別できるように）

モデルの改ざん検知（2026-10-28）: rapidocr 3.10.0 はモデルを新しくダウンロードした直後にハッシュを照合しない
（照合は次回起動時の「既存ファイルを使うか」の判定だけ）。--check で、モデル置き場の全ファイルを
default_models.yaml の SHA256 と照合し、一致しないものは消して失敗にする（RapidOCR を使わず Tesseract 等へ回る）。

使い方:
  python3 rapidocr_cli.py --check   … モデルを読み込んで1回推論できるか＋ハッシュ照合（欠けたモデルの取得も兼ねる）
  python3 rapidocr_cli.py <画像パス>
"""
import hashlib
import json
import os
import sys


def load_engine():
    try:
        from rapidocr import RapidOCR, LangRec, OCRVersion, ModelType
    except ImportError:
        from rapidocr_onnxruntime import RapidOCR as LegacyRapidOCR
        return LegacyRapidOCR(), "rapidocr_onnxruntime(ch)"
    engine = RapidOCR(params={
        "Rec.lang_type": LangRec.JAPAN,
        "Rec.ocr_version": OCRVersion.PPOCRV6,
        "Rec.model_type": ModelType.SMALL,
    })
    return engine, "rapidocr(japan PP-OCRv6 small)"


def expected_model_hashes(yaml_path):
    """default_models.yaml から「ファイル名 → SHA256」の対応を作る（model_dir の URL の末尾がファイル名）"""
    import yaml
    with open(yaml_path, encoding="utf-8") as f:
        data = yaml.safe_load(f)
    out = {}

    def walk(node):
        if isinstance(node, dict):
            url, digest = node.get("model_dir"), node.get("SHA256")
            if isinstance(url, str) and isinstance(digest, str):
                out.setdefault(url.rsplit("/", 1)[-1], set()).add(digest.lower())
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    walk(data)
    return out


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def verify_models(models_dir, yaml_path):
    """モデル置き場の .onnx を照合する。一致しないファイルは消す。
    戻り値: (照合したファイル名の一覧, 一致しなかったファイル名の一覧)"""
    expected = expected_model_hashes(yaml_path)
    checked, bad = [], []
    if not os.path.isdir(models_dir):
        return checked, bad
    for name in sorted(os.listdir(models_dir)):
        path = os.path.join(models_dir, name)
        if not os.path.isfile(path) or not name.endswith(".onnx"):
            continue
        if name not in expected:
            bad.append(name + "（既知のハッシュなし）")
        elif sha256_of(path) not in expected[name]:
            bad.append(name)
        else:
            checked.append(name)
            continue
        try:
            os.remove(path)   # 次回は正規のファイルを取り直させる
        except OSError:
            pass
    return checked, bad


def verify_installed_models():
    """rapidocr（>=3）のモデル置き場を照合する。旧 rapidocr_onnxruntime では何もしない"""
    try:
        import rapidocr
    except ImportError:
        return [], []
    pkg = os.path.dirname(rapidocr.__file__)
    return verify_models(os.path.join(pkg, "models"), os.path.join(pkg, "default_models.yaml"))


def run(engine, image):
    """新旧どちらの API でも行テキストの配列を返す"""
    out = engine(image)
    if hasattr(out, "txts"):            # rapidocr>=2: RapidOCROutput
        return [str(t) for t in (out.txts or ()) if t]
    result = out[0] if isinstance(out, tuple) else out   # rapidocr_onnxruntime: (result, elapse)
    lines = []
    for item in result or []:
        if isinstance(item, (list, tuple)) and len(item) >= 2 and item[1]:
            lines.append(str(item[1]))
    return lines


def main():
    if len(sys.argv) >= 2 and sys.argv[1] == "--check":
        engine, name = load_engine()
        # rapidocr>=3.10 はモデルを遅延読み込みするため、実際に1回推論させて
        # 「ダウンロード済み・読み込み可能」まで確かめる
        import numpy as np
        blank = np.full((64, 256, 3), 255, dtype=np.uint8)
        run(engine, blank)
        checked, bad = verify_installed_models()
        if bad:
            print(json.dumps({"ok": False, "engine": name,
                              "error": "モデルのハッシュが一致しません（削除しました）: " + ", ".join(bad)},
                             ensure_ascii=False))
            return 1
        print(json.dumps({"ok": True, "engine": name, "verifiedModels": checked}, ensure_ascii=False))
        return 0

    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "missing image path"}))
        return 2

    engine, name = load_engine()
    lines = run(engine, sys.argv[1])
    print(json.dumps({"ok": True, "engine": name, "text": "\n".join(lines)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
        raise SystemExit(1)
