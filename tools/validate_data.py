"""
data/*.json 스키마 검사 (data/SCHEMA.md 기준)

사용법:  python tools/validate_data.py [파일 ...]     (인자 없으면 전체)
문제가 있으면 목록을 출력하고 종료코드 1.
"""

import glob
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DOMAINS = ["hire", "time", "leave", "pay", "benefits", "people", "exit"]
CATEGORIES = {
    "hire": ["근로계약", "수습기간", "기간제·파견", "외국인 고용"],
    "time": ["휴게시간", "주휴일", "근태기록", "안전보건"],
    "leave": ["연차", "병가", "출산·육아", "기타 휴가"],
    "pay": ["임금지급", "법정수당", "동일임금·임금투명성"],
    "benefits": ["사회보험"],
    "people": ["취업규칙·단체협약", "근로자대표·노사협의", "괴롭힘·차별", "개인정보", "내부고발", "공시", "경업금지"],
    "exit": ["해고절차", "해고보상"],
}
TYPES = {"number_min", "number_max", "boolean", "choice", "posture"}
LEVELS = {"high", "medium", "ok", "info"}
TIMELINE_STATUS = {"시행 중", "시행 확정(예정)", "추진 중(미확정)", "정정 필요(미시행)", "정정 필요"}


def check_check(chk, where, errs, ids, inherited_domain=None):
    cid = chk.get("id")
    if not cid:
        errs.append(f"{where}: id 없음")
    elif cid in ids:
        errs.append(f"{where}: id 중복 '{cid}'")
    else:
        ids.add(cid)
    dom = chk.get("domain", inherited_domain)
    if dom not in DOMAINS:
        errs.append(f"{where} ({cid}): domain '{dom}' 이 유효하지 않음")
    t = chk.get("type")
    if t not in TYPES:
        errs.append(f"{where} ({cid}): type '{t}' 이 유효하지 않음")
    if t in ("number_min", "number_max") and not isinstance(chk.get("threshold"), (int, float)):
        errs.append(f"{where} ({cid}): number 형인데 threshold 숫자 없음")
    if t == "choice":
        opts = chk.get("options") or []
        if not opts or any(o.get("level") not in LEVELS for o in opts):
            errs.append(f"{where} ({cid}): choice options/level 오류")
    if chk.get("fail_level", "high") not in LEVELS:
        errs.append(f"{where} ({cid}): fail_level 오류")
    for k in ("label", "legal_basis", "recommendation"):
        if not chk.get(k):
            errs.append(f"{where} ({cid}): {k} 비어 있음")
    cond = chk.get("applies_if")
    if cond is not None and (cond.get("field") != "headcount" or cond.get("op") not in (">=", "<=", ">", "<", "==")
                             or not isinstance(cond.get("value"), (int, float))):
        errs.append(f"{where} ({cid}): applies_if 형식 오류")
    return dom


def validate(path):
    errs = []
    with open(path, encoding="utf-8") as f:
        d = json.load(f)
    ids = set()
    for k in ("country", "city", "as_of", "standards", "sources", "verification"):
        if k not in d:
            errs.append(f"최상위 '{k}' 없음")
    briefs = d.get("domain_briefs") or {}
    for dom in DOMAINS:
        if not str(briefs.get(dom, "")).strip():
            errs.append(f"domain_briefs.{dom} 없음")
    for i, c in enumerate(d.get("standard_checks", [])):
        dom = check_check(c, f"standard_checks[{i}]", errs, ids)
        if dom in CATEGORIES and c.get("category") not in CATEGORIES[dom]:
            errs.append(f"standard_checks[{i}] ({c.get('id')}): category '{c.get('category')}' 가 {dom} 통일 분류명이 아님")
    for i, it in enumerate(d.get("country_specifics", [])):
        if it.get("domain") not in DOMAINS:
            errs.append(f"country_specifics[{i}] '{it.get('name')}': domain 오류")
        for j, c in enumerate(it.get("checks", [])):
            check_check(c, f"country_specifics[{i}].checks[{j}]", errs, ids, it.get("domain"))
    for i, c in enumerate(d.get("amendment_checks", [])):
        check_check(c, f"amendment_checks[{i}]", errs, ids)
    for i, a in enumerate(d.get("amendment_timeline", [])):
        if a.get("domain") not in DOMAINS:
            errs.append(f"amendment_timeline[{i}] '{a.get('title','')[:30]}': domain 오류")
        if a.get("status") not in TIMELINE_STATUS:
            errs.append(f"amendment_timeline[{i}]: status '{a.get('status')}' 오류")
    for i, p in enumerate(d.get("precedents", [])):
        if p.get("domain") not in DOMAINS:
            errs.append(f"precedents[{i}] '{p.get('title','')[:30]}': domain 오류")
    for i, s in enumerate(d.get("sources", [])):
        if not str(s.get("url", "")).startswith("http"):
            errs.append(f"sources[{i}]: url 오류")
    return d, errs


def main(paths):
    total = 0
    for p in paths:
        d, errs = validate(p)
        n = (len(d.get("standard_checks", [])) + len(d.get("amendment_checks", []))
             + sum(len(it.get("checks", [])) for it in d.get("country_specifics", [])))
        status = "OK" if not errs else f"{len(errs)}건 오류"
        print(f"{os.path.basename(p):28s} 점검항목 {n:3d}개 · {status}")
        for e in errs[:40]:
            print("   -", e)
        total += len(errs)
    sys.exit(1 if total else 0)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    args = sys.argv[1:] or sorted(glob.glob(os.path.join(ROOT, "data", "*.json")))
    main(args)
