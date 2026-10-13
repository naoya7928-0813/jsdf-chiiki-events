#!/usr/bin/env python3
"""RapidOCR を1枚の画像に対して実行し、認識テキストを JSON で標準出力へ返す。

認識モデルは **日本語**（PP-OCRv6 small / lang=japan）を使う。
旧実装の rapidocr-onnxruntime は既定が中国語モデルで、ひらがな・カタカナを落とし
簡体字に置き換える（「駐屯地」→「鞋屯地」、「お気軽に」→「书氮軽」）。
2026-10-13 の実測で、本番の文字化けタイトルの主因がこれだった。

- rapidocr（>=3.10）が入っていれば日本語モデルを使う（モデルは初回に自動ダウンロード）
- 入っていなければ旧 rapidocr_onnxruntime にフォールバックする（ローカル環境の後方互換）
  どちらを使ったかは "engine" に出す（ログで判別できるように）

使い方:
  python3 rapidocr_cli.py --check   … モデルを読み込んで1回推論できるかを確認（初回はダウンロードも兼ねる）
  python3 rapidocr_cli.py <画像パス>
"""
import json
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
        print(json.dumps({"ok": True, "engine": name}, ensure_ascii=False))
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
