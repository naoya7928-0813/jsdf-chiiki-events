#!/usr/bin/env python3
import json
import sys


def load_engine():
    from rapidocr_onnxruntime import RapidOCR
    return RapidOCR()


def main():
    if len(sys.argv) >= 2 and sys.argv[1] == "--check":
        load_engine()
        print(json.dumps({"ok": True}))
        return 0

    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "missing image path"}))
        return 2

    image_path = sys.argv[1]
    engine = load_engine()
    result, _ = engine(image_path)

    lines = []
    for item in result or []:
        if isinstance(item, (list, tuple)) and len(item) >= 2:
            text = item[1]
            if text:
                lines.append(str(text))

    print(json.dumps({"ok": True, "text": "\n".join(lines)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
        raise SystemExit(1)
