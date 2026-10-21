"""
배포용 정적 빌드 스크립트

법령 데이터 검사 → web/data.js 갱신 → web/ 를 public/ 에 복사한다.
public/ 은 서버·파이썬 없이 동작하는 정적 사이트라 Firebase Hosting·Netlify·Cloudflare Pages 등
어디에나 그대로 올릴 수 있다.

사용법:
    python build_firebase.py            # public/ 생성
    firebase deploy --only hosting      # (Firebase 사용 시) 배포
"""

import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "public")


def clean_out():
    # 폴더 자체가 아닌 내용만 비움 (탐색기·로컬 서버가 폴더를 잡고 있어도 실패하지 않도록)
    os.makedirs(OUT, exist_ok=True)
    for name in os.listdir(OUT):
        path = os.path.join(OUT, name)
        shutil.rmtree(path) if os.path.isdir(path) else os.remove(path)


def build():
    tools = os.path.join(ROOT, "tools")
    subprocess.run([sys.executable, os.path.join(tools, "validate_data.py")], check=True)
    subprocess.run([sys.executable, os.path.join(tools, "sync_web_data.py")], check=True)
    clean_out()
    shutil.copytree(os.path.join(ROOT, "web"), OUT, dirs_exist_ok=True)
    print(f"빌드 완료: {OUT}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    build()
