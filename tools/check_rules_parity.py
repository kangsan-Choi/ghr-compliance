"""
rules.py(파이썬) ↔ web/rules.js(자바스크립트) 판정 결과 일치 검사

8개국 data/*.json 의 모든 점검 항목을 가능한 입력값·인원 규모 조합으로 돌려
두 엔진의 findings 가 글자 단위까지 같은지 확인한다. rules.py 나 data 를 고친 뒤 실행.

사용법:  python tools/check_rules_parity.py      (node 필요)
"""

import glob
import json
import os
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import rules  # noqa: E402

BOOL = ["예", "아니오", "해당 없음"]
POSTURE = ["점검 완료 · 문제 없음", "점검했으나 미흡/리스크 있음", "미점검 / 모름", "해당 없음"]
HEADCOUNTS = [1, 10, 50, 100, 101, 300, 1000]

NODE_RUNNER = r"""
import fs from 'node:fs';
import { createRequire } from 'node:module';
const R = createRequire(import.meta.url)(process.argv[2]);
const cases = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const out = cases.map(c => {
  const ctx = { headcount: c.headcount };
  const f = R.evaluate(c.data, c.numeric)
    .concat(R.evaluateStandardChecks(c.data, c.std, ctx))
    .concat(R.evaluateSpecifics(c.data, c.spec, ctx))
    .concat(R.evaluateAmendmentChecks(c.data, c.amend, ctx));
  const counts = R.summarize(f);
  return { findings: f, counts, score: R.riskScore(counts) };
});
fs.writeFileSync(process.argv[4], JSON.stringify(out));
"""


def check_values(checks, variant):
    """variant 번째 입력 조합: 각 check 의 가능한 값을 순환시켜 모든 값이 한 번 이상 나오게 한다."""
    vals = {}
    for i, chk in enumerate(checks):
        t = chk["type"]
        if t in ("number_min", "number_max"):
            thr = float(chk.get("threshold") or 0)
            opts = [thr, thr - 1, thr + 1, 0.0, thr + 0.5]
        elif t == "boolean":
            opts = BOOL
        elif t == "posture":
            opts = POSTURE
        elif t == "choice":
            opts = [o["label"] for o in chk.get("options", [])] + ["(없는 선택지)"]
        else:
            continue
        vals[chk["id"]] = opts[(variant + i) % len(opts)]
    return vals


def build_cases():
    cases = []
    for path in sorted(glob.glob(os.path.join(ROOT, "data", "*.json"))):
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        std = data["standards"]
        spec_checks = [c for item in data.get("country_specifics", []) for c in item.get("checks", [])]
        legal = {k: std.get(k) for k in ("standard_weekly_hours", "max_weekly_hours_incl_overtime",
                                          "annual_leave_min_days", "termination_notice_min_days")}
        mw = std.get("min_wage", {}).get("amount") or 0
        for variant in range(5):
            for hc in HEADCOUNTS:
                d = (variant - 2) * 1.0  # -2..+2 로 법정 기준 주변 흔들기
                numeric = {
                    "std_weekly": float(legal["standard_weekly_hours"] or 40) + d,
                    "max_weekly": float(legal["max_weekly_hours_incl_overtime"] or 52) + d,
                    "annual_leave": float(legal["annual_leave_min_days"] or 0) + d,
                    "notice_days": float(legal["termination_notice_min_days"] or 0) + d,
                    "monthly_wage": (float(mw) + d * 1234.5) if variant != 4 else None,
                }
                cases.append({
                    "name": f"{os.path.basename(path)} v{variant} hc{hc}",
                    "data": data, "headcount": float(hc), "numeric": numeric,
                    "std": check_values(data.get("standard_checks", []), variant),
                    "spec": check_values(spec_checks, variant),
                    "amend": check_values(data.get("amendment_checks", []), variant),
                })
    return cases


def run_python(c):
    ctx = {"headcount": c["headcount"]}
    f = (rules.evaluate(c["data"], c["numeric"])
         + rules.evaluate_standard_checks(c["data"], c["std"], ctx)
         + rules.evaluate_specifics(c["data"], c["spec"], ctx)
         + rules.evaluate_amendment_checks(c["data"], c["amend"], ctx))
    counts = rules.summarize(f)
    total = max(1, sum(counts.values()))
    return {"findings": f, "counts": counts,
            "score": round(100 * (counts["high"] * 1.0 + counts["medium"] * 0.5) / total)}


def main():
    cases = build_cases()
    py_out = [run_python(c) for c in cases]
    with tempfile.TemporaryDirectory() as tmp:
        runner, cin, cout = (os.path.join(tmp, n) for n in ("run.mjs", "cases.json", "out.json"))
        with open(runner, "w", encoding="utf-8") as f:
            f.write(NODE_RUNNER)
        with open(cin, "w", encoding="utf-8") as f:
            json.dump(cases, f, ensure_ascii=False)
        subprocess.run(["node", runner, os.path.join(ROOT, "web", "rules.js"), cin, cout], check=True)
        with open(cout, encoding="utf-8") as f:
            js_out = json.load(f)

    mismatches = 0
    total_findings = 0
    for c, p, j in zip(cases, py_out, js_out):
        total_findings += len(p["findings"])
        p_norm = json.loads(json.dumps(p, ensure_ascii=False))
        if p_norm != j:
            mismatches += 1
            if mismatches <= 3:
                print(f"✗ {c['name']}")
                for i, (a, b) in enumerate(zip(p_norm["findings"], j["findings"])):
                    if a != b:
                        print("   py:", json.dumps(a, ensure_ascii=False)[:300])
                        print("   js:", json.dumps(b, ensure_ascii=False)[:300])
                        break
                else:
                    print("   counts/score/length differ:", p_norm["counts"], j["counts"], p_norm["score"], j["score"])
    print(f"{len(cases)}개 조합 · findings {total_findings}건 비교 → 불일치 {mismatches}건")
    sys.exit(1 if mismatches else 0)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
