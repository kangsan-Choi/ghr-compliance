"""
data/*.json → web/data.js (window.GHR_DATA) 생성

web/index.html 을 더블클릭(file://)으로 열어도 동작하도록, 프론트엔드는 JSON 을 fetch 하지 않고
이 스크립트가 만든 data.js 를 읽는다. data/*.json 을 고친 뒤 반드시 실행한다.
(build_firebase.py 는 빌드할 때 자동 실행)

사용법:  python tools/sync_web_data.py
"""

import glob
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "web", "data.js")


def sync():
    bundle = {}
    for path in sorted(glob.glob(os.path.join(ROOT, "data", "*.json"))):
        with open(path, encoding="utf-8") as f:
            bundle[os.path.basename(path)] = json.load(f)
    body = json.dumps(bundle, ensure_ascii=False, separators=(",", ":"))
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("// 자동 생성 파일 — 직접 고치지 마세요. data/*.json 수정 후 python tools/sync_web_data.py 실행\n")
        f.write(f"window.GHR_DATA = {body};\n")
    print(f"web/data.js 갱신: {len(bundle)}개 관할")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sync()
