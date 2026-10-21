"""
Firebase Hosting 배포용 정적 빌드 스크립트

기본: 새 프론트엔드(web/) + 법령 데이터(data/)를 public/ 에 복사한다(서버·파이썬 런타임 불필요).
--stlite: 기존 Streamlit 앱을 stlite(브라우저 안에서 파이썬 실행)로 감싸 public/ 에 만든다.
어느 쪽이든 정적 파일이라 Firebase 무료(Spark) 요금제로 호스팅 가능.

사용법:
    python build_firebase.py            # 새 프론트엔드 → public/
    python build_firebase.py --stlite   # Streamlit 앱(stlite) → public/
    firebase deploy --only hosting      # 배포 (firebase login 후)

data/*.json 이나 앱 코드를 고친 뒤에는 다시 빌드해야 반영된다.
"""

import glob
import json
import os
import shutil
import sys
import tomllib

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "public")
STLITE_VERSION = "1.9.2"  # Streamlit 1.62 기반
REQUIREMENTS = ["markdown"]  # streamlit 은 stlite 에 포함됨

APP_FILES = ["compliance_app.py", "rules.py"] + sorted(
    os.path.relpath(p, ROOT).replace(os.sep, "/") for p in glob.glob(os.path.join(ROOT, "data", "*.json"))
)

INDEX_TEMPLATE = """<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>글로벌 HR 노동법 컴플라이언스 점검</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@stlite/browser@{ver}/build/stlite.css" />
  <style>
    #loading {{ font-family: sans-serif; color: #1F2937; text-align: center; margin-top: 30vh; }}
    #loading b {{ color: #F04C23; }}
  </style>
</head>
<body>
  <div id="root"><div id="loading"><b>앱을 불러오는 중입니다…</b><br/>처음 접속 시 10~30초 정도 걸릴 수 있습니다.</div></div>
  <script type="module">
    import {{ mount }} from "https://cdn.jsdelivr.net/npm/@stlite/browser@{ver}/build/stlite.js";
    mount({{
      requirements: {requirements},
      entrypoint: "compliance_app.py",
      files: {files},
      streamlitConfig: {config},
    }}, document.getElementById("root"));
  </script>
</body>
</html>
"""


def flatten_streamlit_config() -> dict:
    """.streamlit/config.toml → {"theme.primaryColor": ...} 형태 (stlite streamlitConfig 형식)."""
    path = os.path.join(ROOT, ".streamlit", "config.toml")
    if not os.path.exists(path):
        return {}
    with open(path, "rb") as f:
        cfg = tomllib.load(f)
    flat = {f"{sec}.{k}": v for sec, kv in cfg.items() for k, v in kv.items()}
    flat.pop("server.headless", None)  # 브라우저 실행에선 무의미
    flat["client.toolbarMode"] = "viewer"  # 우측 상단 Deploy 버튼 등 개발자 메뉴 숨김
    return flat


def clean_out():
    # 폴더 자체가 아닌 내용만 비움 (탐색기·로컬 서버가 폴더를 잡고 있어도 실패하지 않도록)
    os.makedirs(OUT, exist_ok=True)
    for name in os.listdir(OUT):
        path = os.path.join(OUT, name)
        shutil.rmtree(path) if os.path.isdir(path) else os.remove(path)


def build_web():
    sys.path.insert(0, os.path.join(ROOT, "tools"))
    import sync_web_data
    sync_web_data.sync()  # data/*.json → web/data.js 최신화
    clean_out()
    shutil.copytree(os.path.join(ROOT, "web"), OUT, dirs_exist_ok=True)
    print(f"빌드 완료(새 프론트엔드): {OUT}")


def build_stlite():
    clean_out()
    os.makedirs(os.path.join(OUT, "app"))

    for rel in APP_FILES:
        dst = os.path.join(OUT, "app", rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(os.path.join(ROOT, rel), dst)

    files = {rel: {"url": f"./app/{rel}"} for rel in APP_FILES}
    html = INDEX_TEMPLATE.format(
        ver=STLITE_VERSION,
        requirements=json.dumps(REQUIREMENTS),
        files=json.dumps(files, ensure_ascii=False),
        config=json.dumps(flatten_streamlit_config()),
    )
    with open(os.path.join(OUT, "index.html"), "w", encoding="utf-8") as f:
        f.write(html)

    print(f"빌드 완료(stlite): {OUT}  (앱 파일 {len(APP_FILES)}개)")


if __name__ == "__main__":
    build_stlite() if "--stlite" in sys.argv else build_web()
