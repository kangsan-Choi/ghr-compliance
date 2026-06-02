"""
룰 기반 리스크 판정 엔진 (API 키 불필요)
─────────────────────────────────────────
data/<국가>.json 의 법정 기준과 사용자가 입력한 우리 회사 제도를
숫자/규칙으로 비교하여 컴플라이언스 리스크를 판정한다.
LLM 없이 결정론적으로 동작한다.

레벨: high(위반/미달 가능성 큼) / medium(주의) / ok(적합) / info(수동 확인)
"""


def _num(x):
    """입력값을 숫자로 변환, 실패 시 None."""
    if x is None:
        return None
    try:
        return float(x)
    except (ValueError, TypeError):
        return None


def evaluate(data: dict, inputs: dict) -> list:
    """법정 기준(data) vs 우리 제도(inputs) 비교 → findings 리스트."""
    std = data.get("standards", {})
    findings = []

    # ── 1. 정규 주당 근로시간 ──
    legal_std = _num(std.get("standard_weekly_hours"))
    user_std = _num(inputs.get("std_weekly"))
    if user_std is not None and legal_std is not None:
        if user_std > legal_std:
            findings.append({
                "category": "정규 근로시간",
                "level": "medium",
                "title": f"정규 주당 근로시간이 법정 기준({legal_std:g}시간)을 초과",
                "detail": f"입력값 {user_std:g}시간 > 법정 {legal_std:g}시간. 초과분은 연장근로로 처리·가산수당 지급 대상일 수 있습니다.",
                "legal_basis": f"법정 표준 주당 근로시간 {legal_std:g}시간",
                "recommendation": "초과분을 연장근로로 분류하고 가산수당·한도 준수 여부를 점검하세요.",
            })
        else:
            findings.append({
                "category": "정규 근로시간",
                "level": "ok",
                "title": f"정규 주당 근로시간 적합 ({user_std:g} ≤ {legal_std:g}시간)",
                "detail": "법정 표준 근로시간 이내입니다.",
                "legal_basis": f"법정 표준 {legal_std:g}시간",
                "recommendation": "현행 유지.",
            })

    # ── 2. 최대(연장 포함) 주당 근로시간 ──
    legal_max = _num(std.get("max_weekly_hours_incl_overtime"))
    user_max = _num(inputs.get("max_weekly"))
    if legal_max is not None and user_max is not None:
        if user_max > legal_max:
            findings.append({
                "category": "최대 근로시간",
                "level": "high",
                "title": f"연장 포함 주당 최대 근로시간이 법정 상한({legal_max:g}시간) 초과",
                "detail": f"입력값 {user_max:g}시간 > 법정 상한 {legal_max:g}시간. 법 위반 소지가 큽니다.",
                "legal_basis": f"법정 주당 최대 {legal_max:g}시간",
                "recommendation": "연장근로 한도를 즉시 점검하고 근무 스케줄을 조정하세요.",
            })
        else:
            findings.append({
                "category": "최대 근로시간",
                "level": "ok",
                "title": f"연장 포함 주당 근로시간 적합 ({user_max:g} ≤ {legal_max:g}시간)",
                "detail": "법정 주당 최대 시간 이내입니다.",
                "legal_basis": f"법정 최대 {legal_max:g}시간",
                "recommendation": "현행 유지.",
            })
    elif legal_max is None and user_max is not None:
        findings.append({
            "category": "최대 근로시간",
            "level": "info",
            "title": "이 국가는 주당 절대 상한이 없거나 협정·한도 방식입니다",
            "detail": "주당 고정 상한 대신 노사협정(예: 일본 36협정)이나 월/연 단위 한도로 규율될 수 있어 자동 판정이 어렵습니다.",
            "legal_basis": std.get("overtime_premium", "연장근로 규정 참조"),
            "recommendation": "월/연 단위 연장근로 한도와 협정 체결 여부를 수동으로 확인하세요.",
        })

    # ── 3. 연차휴가 ──
    legal_leave = _num(std.get("annual_leave_min_days"))
    user_leave = _num(inputs.get("annual_leave"))
    if legal_leave is not None and legal_leave == 0:
        findings.append({
            "category": "연차휴가",
            "level": "info",
            "title": "이 국가는 법정 연차 의무가 없습니다",
            "detail": "법정 최소 연차가 0일입니다(예: 미국 연방·텍사스). 회사 정책으로 자율 부여합니다.",
            "legal_basis": "법정 연차 의무 없음",
            "recommendation": "법적 의무는 없으나 인재 유치를 위한 경쟁력 있는 연차 정책을 검토하세요.",
        })
    elif legal_leave is not None and user_leave is not None:
        if user_leave < legal_leave:
            findings.append({
                "category": "연차휴가",
                "level": "high",
                "title": f"연차 부여일수가 법정 최소({legal_leave:g}일)에 미달",
                "detail": f"입력값 {user_leave:g}일 < 법정 최소 {legal_leave:g}일. 미달분만큼 위반입니다.",
                "legal_basis": f"법정 최소 연차 {legal_leave:g}일",
                "recommendation": f"연차를 최소 {legal_leave:g}일 이상으로 상향하세요.",
            })
        else:
            findings.append({
                "category": "연차휴가",
                "level": "ok",
                "title": f"연차 부여일수 적합 ({user_leave:g} ≥ {legal_leave:g}일)",
                "detail": "법정 최소 연차 이상입니다.",
                "legal_basis": f"법정 최소 {legal_leave:g}일",
                "recommendation": "현행 유지.",
            })

    # ── 4. 해고 예고기간 ──
    legal_notice = _num(std.get("termination_notice_min_days"))
    user_notice = _num(inputs.get("notice_days"))
    if legal_notice is None:
        if user_notice is not None:
            findings.append({
                "category": "해고 예고",
                "level": "info",
                "title": "법정 해고 예고기간이 없거나 특수합니다",
                "detail": "예: 미국 텍사스의 at-will 고용, 인도네시아의 협의 절차 방식 등. 자동 판정 대상이 아닙니다.",
                "legal_basis": std.get("severance", "해고/퇴직 규정 참조"),
                "recommendation": "현지 해고 절차(협의·승인·보상)를 수동으로 확인하세요.",
            })
    elif user_notice is not None:
        if user_notice < legal_notice:
            findings.append({
                "category": "해고 예고",
                "level": "high",
                "title": f"해고 예고기간이 법정 기준({legal_notice:g}일)에 미달",
                "detail": f"입력값 {user_notice:g}일 < 법정 {legal_notice:g}일. 예고 부족분은 수당 지급 또는 무효 사유가 될 수 있습니다.",
                "legal_basis": f"법정 해고 예고 {legal_notice:g}일",
                "recommendation": f"예고기간을 {legal_notice:g}일 이상으로 하거나 부족분을 예고수당으로 보전하세요.",
            })
        else:
            findings.append({
                "category": "해고 예고",
                "level": "ok",
                "title": f"해고 예고기간 적합 ({user_notice:g} ≥ {legal_notice:g}일)",
                "detail": "법정 예고기간 이상입니다.",
                "legal_basis": f"법정 {legal_notice:g}일",
                "recommendation": "현행 유지.",
            })

    # ── 5. 최저임금 (월급 입력 + 데이터가 월 기준 + 통화 일치 시) ──
    mw = std.get("min_wage", {})
    legal_wage = _num(mw.get("amount"))
    user_wage = _num(inputs.get("monthly_wage"))
    if user_wage is not None and legal_wage is not None and mw.get("period") == "월":
        cur = mw.get("currency", "")
        if user_wage < legal_wage:
            findings.append({
                "category": "최저임금",
                "level": "high",
                "title": f"월 임금이 법정 최저임금({legal_wage:,.0f} {cur}) 미만",
                "detail": f"입력값 {user_wage:,.0f} {cur} < 법정 {legal_wage:,.0f} {cur}. {mw.get('note','')}",
                "legal_basis": f"법정 최저임금 {legal_wage:,.0f} {cur}/월 ({mw.get('locality','')})",
                "recommendation": "기본급을 법정 최저임금 이상으로 즉시 조정하세요.",
            })
        else:
            findings.append({
                "category": "최저임금",
                "level": "ok",
                "title": f"월 임금 적합 ({user_wage:,.0f} ≥ {legal_wage:,.0f} {cur})",
                "detail": "법정 최저임금 이상입니다.",
                "legal_basis": f"법정 최저임금 {legal_wage:,.0f} {cur}/월",
                "recommendation": "현행 유지.",
            })
    elif user_wage is not None and legal_wage is not None:
        findings.append({
            "category": "최저임금",
            "level": "info",
            "title": "최저임금 자동 비교 보류 (단위 상이)",
            "detail": f"이 국가의 법정 최저임금은 {mw.get('period','')} 단위({legal_wage:,.0f} {mw.get('currency','')})로, 입력하신 월 임금과 직접 비교가 어렵습니다.",
            "legal_basis": f"{mw.get('note','')}",
            "recommendation": "동일 기준(월 환산 등)으로 수동 비교하세요.",
        })

    # ── 6. 연장근로 가산율 (텍스트 안내) ──
    if std.get("overtime_premium"):
        findings.append({
            "category": "연장근로 가산",
            "level": "info",
            "title": "연장근로 가산율은 사규와 대조가 필요합니다",
            "detail": f"법정 가산 규정: {std.get('overtime_premium')}",
            "legal_basis": "연장/휴일/심야 가산 규정",
            "recommendation": "우리 회사 가산수당 지급률이 위 법정 최저율 이상인지 확인하세요.",
        })

    return findings


def check_applies(chk: dict, context: dict) -> bool:
    """check의 applies_if 조건(인원 규모 등)을 평가. 조건 없으면 항상 True."""
    cond = chk.get("applies_if")
    if not cond:
        return True
    cur = _num((context or {}).get(cond.get("field")))
    val = _num(cond.get("value"))
    op = cond.get("op")
    if cur is None or val is None:
        return True
    if op == ">=":
        return cur >= val
    if op == "<=":
        return cur <= val
    if op == ">":
        return cur > val
    if op == "<":
        return cur < val
    if op == "==":
        return cur == val
    return True


def _eval_check(chk: dict, val, category: str, context: dict = None):
    """단일 구조화 검사(check)를 평가하여 finding(dict) 반환. 평가 불가 시 None."""
    if not check_applies(chk, context):
        cond = chk.get("applies_if", {})
        return {"category": category, "level": "info",
                "title": f"{chk.get('label', category)} — 규모 기준 미해당",
                "detail": f"적용 기준: 인원 {cond.get('op','')} {cond.get('value','')}명. 현재 규모에서는 대상이 아닙니다.",
                "legal_basis": chk.get("legal_basis", ""),
                "recommendation": "규모 변동 시 재평가하세요."}
    t = chk.get("type")
    label = chk.get("label", category)
    unit = chk.get("unit", "")
    lb = chk.get("legal_basis", "")
    rec = chk.get("recommendation", "")
    fail_level = chk.get("fail_level", "high")

    if t in ("number_min", "number_max"):
        v = _num(val)
        if v is None:
            return None
        thr = _num(chk.get("threshold"))
        if t == "number_min" and v == 0:
            return {"category": category, "level": "info",
                    "title": f"{label} — 미입력/0 (판정 보류)",
                    "detail": f"값이 0입니다. 실제 운영 기준을 입력하면 법정 최소 {thr:g}{unit}와 비교 판정합니다.",
                    "legal_basis": lb, "recommendation": rec}
        passed = (v >= thr) if t == "number_min" else (v <= thr)
        if passed:
            return {"category": category, "level": "ok",
                    "title": f"{label} 적합 ({v:g}{unit})",
                    "detail": f"법정 기준 {'≥' if t == 'number_min' else '≤'} {thr:g}{unit} 충족.",
                    "legal_basis": lb, "recommendation": "현행 유지."}
        return {"category": category, "level": fail_level,
                "title": f"{label}: 법정 기준({'최소' if t == 'number_min' else '최대'} {thr:g}{unit}) {'미달' if t == 'number_min' else '초과'}",
                "detail": f"입력 {v:g}{unit} {'<' if t == 'number_min' else '>'} 기준 {thr:g}{unit}.",
                "legal_basis": lb, "recommendation": rec}

    if t == "boolean":
        if val == "예":
            return {"category": category, "level": "ok", "title": f"{label} 이행",
                    "detail": "법정/권고 사항을 이행 중입니다.", "legal_basis": lb, "recommendation": "현행 유지."}
        if val == "아니오":
            return {"category": category, "level": fail_level, "title": f"{label} 미이행",
                    "detail": "법정/권고 사항을 충족하지 못하고 있습니다.", "legal_basis": lb, "recommendation": rec}
        return {"category": category, "level": "info", "title": f"{label} — 해당 없음/미상",
                "detail": "'해당 없음'으로 표시됨. 필요 시 수동 확인하세요.", "legal_basis": lb, "recommendation": rec}

    if t == "choice":
        match = next((o for o in chk.get("options", []) if o.get("label") == val), None)
        if match:
            lvl = match.get("level", "info")
            return {"category": category, "level": lvl, "title": f"{label}: {val}",
                    "detail": match.get("detail", ""), "legal_basis": lb,
                    "recommendation": rec if lvl in ("high", "medium") else "현행 유지."}
        return None

    if t == "posture":
        if val == "점검 완료 · 문제 없음":
            return {"category": category, "level": "ok", "title": f"{label}: 점검 완료",
                    "detail": "자가진단상 문제 없음으로 평가됨.", "legal_basis": lb, "recommendation": "현행 유지."}
        if val == "점검했으나 미흡/리스크 있음":
            return {"category": category, "level": "medium", "title": f"{label}: 미흡/리스크 있음",
                    "detail": "자가진단상 보완이 필요합니다.", "legal_basis": lb, "recommendation": rec}
        if val == "해당 없음":
            return {"category": category, "level": "info", "title": f"{label}: 해당 없음",
                    "detail": "우리 회사에 해당되지 않음으로 표시됨.", "legal_basis": lb, "recommendation": "해당 시 재평가 필요."}
        return {"category": category, "level": "info", "title": f"{label}: 미점검 — 확인 필요",
                "detail": "아직 점검되지 않았습니다. 위 법령·유의점을 근거로 점검하세요.", "legal_basis": lb, "recommendation": rec}

    return None


def evaluate_specifics(data: dict, check_values: dict, context: dict = None) -> list:
    """국가 특유 제도(country_specifics)의 구조화 검사를 평가."""
    findings = []
    for item in data.get("country_specifics", []):
        name = item.get("name", "")
        for chk in item.get("checks", []):
            cid = chk.get("id")
            if cid is None or cid not in check_values:
                continue
            f = _eval_check(chk, check_values[cid], name, context)
            if f:
                findings.append(f)
    return findings


def evaluate_amendment_checks(data: dict, check_values: dict, context: dict = None) -> list:
    """최근 3개년 개정 대응 점검(amendment_checks)을 평가.

    각 check는 최근 개정/판례를 근거로 한 '반영 여부' 점검 항목이다.
    category 는 '📌 <근거 개정>' 형태로 표시된다.
    """
    findings = []
    for chk in data.get("amendment_checks", []):
        cid = chk.get("id")
        if cid is None or cid not in check_values:
            continue
        cat = "📌 " + chk.get("based_on", "개정 대응")
        f = _eval_check(chk, check_values[cid], cat, context)
        if f:
            findings.append(f)
    return findings


def summarize(findings: list) -> dict:
    """레벨별 개수 집계."""
    counts = {"high": 0, "medium": 0, "ok": 0, "info": 0}
    for f in findings:
        counts[f["level"]] = counts.get(f["level"], 0) + 1
    return counts


LEVEL_LABEL = {
    "high": "🔴 위반 소지",
    "medium": "🟡 주의",
    "ok": "🟢 적합",
    "info": "🔎 수동확인",
}
