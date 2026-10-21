/**
 * 룰 기반 리스크 판정 엔진 — rules.py 의 1:1 JavaScript 포팅 (API 키 불필요)
 * ─────────────────────────────────────────
 * data/<국가>.json 의 법정 기준과 사용자가 입력한 우리 회사 제도를
 * 숫자/규칙으로 비교하여 컴플라이언스 리스크를 판정한다.
 *
 * rules.py 를 고치면 이 파일도 같이 고치고, tools/check_rules_parity.py 로
 * 두 엔진의 출력이 글자 단위까지 같은지 확인한다.
 *
 * 레벨: high(위반/미달 가능성 큼) / medium(주의) / ok(적합) / info(수동 확인)
 */
(function (root) {
"use strict";


// ── 파이썬 동작 재현 헬퍼 ─────────────────────────────────────

/** dict.get(k, default): 키가 있으면 값이 null 이어도 그대로 반환. */
function get(obj, key, dflt = null) {
  return obj && Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : dflt;
}

/** f-string 의 {x} — None 은 'None' 으로 찍힌다. */
function py(x) {
  if (x === null || x === undefined) return "None";
  if (x === true) return "True";
  if (x === false) return "False";
  return String(x);
}

/** 파이썬 format(x, 'g') */
function fmtG(x) {
  if (!isFinite(x)) return String(x);
  if (x === 0) return "0";
  const exp = Math.floor(Math.log10(Math.abs(Number(x.toPrecision(6)))));
  if (exp < -4 || exp >= 6) {
    let [m, e] = x.toExponential(5).split("e");
    m = m.includes(".") ? m.replace(/0+$/, "").replace(/\.$/, "") : m;
    const en = Number(e);
    return `${m}e${en < 0 ? "-" : "+"}${String(Math.abs(en)).padStart(2, "0")}`;
  }
  return String(Number(x.toPrecision(6)));
}

/** 파이썬 round(x) — 0.5 는 짝수 쪽으로(banker's rounding). */
function pyRound(x) {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

/** 파이썬 format(x, ',.0f') */
function fmtComma0(x) {
  return pyRound(x).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function _num(x) {
  if (x === null || x === undefined || typeof x === "boolean") return x === true ? 1 : x === false ? 0 : null;
  if (typeof x === "number") return isFinite(x) ? x : null;
  if (typeof x === "string" && x.trim() !== "" && isFinite(Number(x))) return Number(x);
  return null;
}

// ── 핵심 정량 비교 ────────────────────────────────────────────

/** 법정 기준(data) vs 우리 제도(inputs) 비교 → findings 리스트. */
function evaluate(data, inputs) {
  const std = get(data, "standards", {});
  const findings = [];

  // ── 1. 정규 주당 근로시간 ──
  const legalStd = _num(get(std, "standard_weekly_hours"));
  const userStd = _num(get(inputs, "std_weekly"));
  if (userStd !== null && legalStd !== null) {
    if (userStd > legalStd) {
      findings.push({
        category: "정규 근로시간",
        level: "medium",
        title: `정규 주당 근로시간이 법정 기준(${fmtG(legalStd)}시간)을 초과`,
        detail: `입력값 ${fmtG(userStd)}시간 > 법정 ${fmtG(legalStd)}시간. 초과분은 연장근로로 처리·가산수당 지급 대상일 수 있습니다.`,
        legal_basis: `법정 표준 주당 근로시간 ${fmtG(legalStd)}시간`,
        recommendation: "초과분을 연장근로로 분류하고 가산수당·한도 준수 여부를 점검하세요.",
      });
    } else {
      findings.push({
        category: "정규 근로시간",
        level: "ok",
        title: `정규 주당 근로시간 적합 (${fmtG(userStd)} ≤ ${fmtG(legalStd)}시간)`,
        detail: "법정 표준 근로시간 이내입니다.",
        legal_basis: `법정 표준 ${fmtG(legalStd)}시간`,
        recommendation: "현행 유지.",
      });
    }
  }

  // ── 2. 최대(연장 포함) 주당 근로시간 ──
  const legalMax = _num(get(std, "max_weekly_hours_incl_overtime"));
  const userMax = _num(get(inputs, "max_weekly"));
  if (legalMax !== null && userMax !== null) {
    if (userMax > legalMax) {
      findings.push({
        category: "최대 근로시간",
        level: "high",
        title: `연장 포함 주당 최대 근로시간이 법정 상한(${fmtG(legalMax)}시간) 초과`,
        detail: `입력값 ${fmtG(userMax)}시간 > 법정 상한 ${fmtG(legalMax)}시간. 법 위반 소지가 큽니다.`,
        legal_basis: `법정 주당 최대 ${fmtG(legalMax)}시간`,
        recommendation: "연장근로 한도를 즉시 점검하고 근무 스케줄을 조정하세요.",
      });
    } else {
      findings.push({
        category: "최대 근로시간",
        level: "ok",
        title: `연장 포함 주당 근로시간 적합 (${fmtG(userMax)} ≤ ${fmtG(legalMax)}시간)`,
        detail: "법정 주당 최대 시간 이내입니다.",
        legal_basis: `법정 최대 ${fmtG(legalMax)}시간`,
        recommendation: "현행 유지.",
      });
    }
  } else if (legalMax === null && userMax !== null) {
    findings.push({
      category: "최대 근로시간",
      level: "info",
      title: "이 국가는 주당 절대 상한이 없거나 협정·한도 방식입니다",
      detail: "주당 고정 상한 대신 노사협정(예: 일본 36협정)이나 월/연 단위 한도로 규율될 수 있어 자동 판정이 어렵습니다.",
      legal_basis: get(std, "overtime_premium", "연장근로 규정 참조"),
      recommendation: "월/연 단위 연장근로 한도와 협정 체결 여부를 수동으로 확인하세요.",
    });
  }

  // ── 3. 연차휴가 ──
  const legalLeave = _num(get(std, "annual_leave_min_days"));
  const userLeave = _num(get(inputs, "annual_leave"));
  if (legalLeave !== null && legalLeave === 0) {
    findings.push({
      category: "연차휴가",
      level: "info",
      title: "이 국가는 법정 연차 의무가 없습니다",
      detail: "법정 최소 연차가 0일입니다(예: 미국 연방·텍사스). 회사 정책으로 자율 부여합니다.",
      legal_basis: "법정 연차 의무 없음",
      recommendation: "법적 의무는 없으나 인재 유치를 위한 경쟁력 있는 연차 정책을 검토하세요.",
    });
  } else if (legalLeave !== null && userLeave !== null) {
    if (userLeave < legalLeave) {
      findings.push({
        category: "연차휴가",
        level: "high",
        title: `연차 부여일수가 법정 최소(${fmtG(legalLeave)}일)에 미달`,
        detail: `입력값 ${fmtG(userLeave)}일 < 법정 최소 ${fmtG(legalLeave)}일. 미달분만큼 위반입니다.`,
        legal_basis: `법정 최소 연차 ${fmtG(legalLeave)}일`,
        recommendation: `연차를 최소 ${fmtG(legalLeave)}일 이상으로 상향하세요.`,
      });
    } else {
      findings.push({
        category: "연차휴가",
        level: "ok",
        title: `연차 부여일수 적합 (${fmtG(userLeave)} ≥ ${fmtG(legalLeave)}일)`,
        detail: "법정 최소 연차 이상입니다.",
        legal_basis: `법정 최소 ${fmtG(legalLeave)}일`,
        recommendation: "현행 유지.",
      });
    }
  }

  // ── 4. 해고 예고기간 ──
  const legalNotice = _num(get(std, "termination_notice_min_days"));
  const userNotice = _num(get(inputs, "notice_days"));
  if (legalNotice === null) {
    if (userNotice !== null) {
      findings.push({
        category: "해고 예고",
        level: "info",
        title: "법정 해고 예고기간이 없거나 특수합니다",
        detail: "예: 미국 텍사스의 at-will 고용, 인도네시아의 협의 절차 방식 등. 자동 판정 대상이 아닙니다.",
        legal_basis: get(std, "severance", "해고/퇴직 규정 참조"),
        recommendation: "현지 해고 절차(협의·승인·보상)를 수동으로 확인하세요.",
      });
    }
  } else if (userNotice !== null) {
    if (userNotice < legalNotice) {
      findings.push({
        category: "해고 예고",
        level: "high",
        title: `해고 예고기간이 법정 기준(${fmtG(legalNotice)}일)에 미달`,
        detail: `입력값 ${fmtG(userNotice)}일 < 법정 ${fmtG(legalNotice)}일. 예고 부족분은 수당 지급 또는 무효 사유가 될 수 있습니다.`,
        legal_basis: `법정 해고 예고 ${fmtG(legalNotice)}일`,
        recommendation: `예고기간을 ${fmtG(legalNotice)}일 이상으로 하거나 부족분을 예고수당으로 보전하세요.`,
      });
    } else {
      findings.push({
        category: "해고 예고",
        level: "ok",
        title: `해고 예고기간 적합 (${fmtG(userNotice)} ≥ ${fmtG(legalNotice)}일)`,
        detail: "법정 예고기간 이상입니다.",
        legal_basis: `법정 ${fmtG(legalNotice)}일`,
        recommendation: "현행 유지.",
      });
    }
  }

  // ── 5. 최저임금 (월급 입력 + 데이터가 월 기준 + 통화 일치 시) ──
  const mw = get(std, "min_wage", {});
  const legalWage = _num(get(mw, "amount"));
  const userWage = _num(get(inputs, "monthly_wage"));
  if (userWage !== null && legalWage !== null && get(mw, "period") === "월") {
    const cur = get(mw, "currency", "");
    if (userWage < legalWage) {
      findings.push({
        category: "최저임금",
        level: "high",
        title: `월 임금이 법정 최저임금(${fmtComma0(legalWage)} ${py(cur)}) 미만`,
        detail: `입력값 ${fmtComma0(userWage)} ${py(cur)} < 법정 ${fmtComma0(legalWage)} ${py(cur)}. ${py(get(mw, "note", ""))}`,
        legal_basis: `법정 최저임금 ${fmtComma0(legalWage)} ${py(cur)}/월 (${py(get(mw, "locality", ""))})`,
        recommendation: "기본급을 법정 최저임금 이상으로 즉시 조정하세요.",
      });
    } else {
      findings.push({
        category: "최저임금",
        level: "ok",
        title: `월 임금 적합 (${fmtComma0(userWage)} ≥ ${fmtComma0(legalWage)} ${py(cur)})`,
        detail: "법정 최저임금 이상입니다.",
        legal_basis: `법정 최저임금 ${fmtComma0(legalWage)} ${py(cur)}/월`,
        recommendation: "현행 유지.",
      });
    }
  } else if (userWage !== null && legalWage !== null) {
    findings.push({
      category: "최저임금",
      level: "info",
      title: "최저임금 자동 비교 보류 (단위 상이)",
      detail: `이 국가의 법정 최저임금은 ${py(get(mw, "period", ""))} 단위(${fmtComma0(legalWage)} ${py(get(mw, "currency", ""))})로, 입력하신 월 임금과 직접 비교가 어렵습니다.`,
      legal_basis: `${py(get(mw, "note", ""))}`,
      recommendation: "동일 기준(월 환산 등)으로 수동 비교하세요.",
    });
  }

  // ── 6. 연장근로 가산율 (텍스트 안내) ──
  if (get(std, "overtime_premium")) {
    findings.push({
      category: "연장근로 가산",
      level: "info",
      title: "연장근로 가산율은 사규와 대조가 필요합니다",
      detail: `법정 가산 규정: ${py(get(std, "overtime_premium"))}`,
      legal_basis: "연장/휴일/심야 가산 규정",
      recommendation: "우리 회사 가산수당 지급률이 위 법정 최저율 이상인지 확인하세요.",
    });
  }

  return findings;
}

// ── 구조화 점검(check) ────────────────────────────────────────

/** check 의 applies_if 조건(인원 규모 등)을 평가. 조건 없으면 항상 true. */
function checkApplies(chk, context) {
  const cond = get(chk, "applies_if");
  if (!cond) return true;
  const cur = _num(get(context || {}, get(cond, "field")));
  const val = _num(get(cond, "value"));
  const op = get(cond, "op");
  if (cur === null || val === null) return true;
  if (op === ">=") return cur >= val;
  if (op === "<=") return cur <= val;
  if (op === ">") return cur > val;
  if (op === "<") return cur < val;
  if (op === "==") return cur === val;
  return true;
}

/** 단일 구조화 검사(check)를 평가하여 finding 반환. 평가 불가 시 null. */
function evalCheck(chk, val, category, context = null) {
  if (!checkApplies(chk, context)) {
    const cond = get(chk, "applies_if", {});
    return {
      category, level: "info",
      title: `${py(get(chk, "label", category))} — 규모 기준 미해당`,
      detail: `적용 기준: 인원 ${py(get(cond, "op", ""))} ${py(get(cond, "value", ""))}명. 현재 규모에서는 대상이 아닙니다.`,
      legal_basis: get(chk, "legal_basis", ""),
      recommendation: "규모 변동 시 재평가하세요.",
    };
  }
  const t = get(chk, "type");
  const label = get(chk, "label", category);
  const unit = get(chk, "unit", "");
  const lb = get(chk, "legal_basis", "");
  const rec = get(chk, "recommendation", "");
  const failLevel = get(chk, "fail_level", "high");

  if (t === "number_min" || t === "number_max") {
    const v = _num(val);
    if (v === null) return null;
    const thr = _num(get(chk, "threshold"));
    if (t === "number_min" && v === 0) {
      return {
        category, level: "info",
        title: `${py(label)} — 미입력/0 (판정 보류)`,
        detail: `값이 0입니다. 실제 운영 기준을 입력하면 법정 최소 ${fmtG(thr)}${py(unit)}와 비교 판정합니다.`,
        legal_basis: lb, recommendation: rec,
      };
    }
    const passed = t === "number_min" ? v >= thr : v <= thr;
    if (passed) {
      return {
        category, level: "ok",
        title: `${py(label)} 적합 (${fmtG(v)}${py(unit)})`,
        detail: `법정 기준 ${t === "number_min" ? "≥" : "≤"} ${fmtG(thr)}${py(unit)} 충족.`,
        legal_basis: lb, recommendation: "현행 유지.",
      };
    }
    return {
      category, level: failLevel,
      title: `${py(label)}: 법정 기준(${t === "number_min" ? "최소" : "최대"} ${fmtG(thr)}${py(unit)}) ${t === "number_min" ? "미달" : "초과"}`,
      detail: `입력 ${fmtG(v)}${py(unit)} ${t === "number_min" ? "<" : ">"} 기준 ${fmtG(thr)}${py(unit)}.`,
      legal_basis: lb, recommendation: rec,
    };
  }

  if (t === "boolean") {
    if (val === "예") {
      return { category, level: "ok", title: `${py(label)} 이행`,
        detail: "법정/권고 사항을 이행 중입니다.", legal_basis: lb, recommendation: "현행 유지." };
    }
    if (val === "아니오") {
      return { category, level: failLevel, title: `${py(label)} 미이행`,
        detail: "법정/권고 사항을 충족하지 못하고 있습니다.", legal_basis: lb, recommendation: rec };
    }
    return { category, level: "info", title: `${py(label)} — 해당 없음/미상`,
      detail: "'해당 없음'으로 표시됨. 필요 시 수동 확인하세요.", legal_basis: lb, recommendation: rec };
  }

  if (t === "choice") {
    const match = (get(chk, "options", []) || []).find((o) => get(o, "label") === val);
    if (match) {
      const lvl = get(match, "level", "info");
      return { category, level: lvl, title: `${py(label)}: ${py(val)}`,
        detail: get(match, "detail", ""), legal_basis: lb,
        recommendation: lvl === "high" || lvl === "medium" ? rec : "현행 유지." };
    }
    return null;
  }

  if (t === "posture") {
    if (val === "점검 완료 · 문제 없음") {
      return { category, level: "ok", title: `${py(label)}: 점검 완료`,
        detail: "자가진단상 문제 없음으로 평가됨.", legal_basis: lb, recommendation: "현행 유지." };
    }
    if (val === "점검했으나 미흡/리스크 있음") {
      return { category, level: "medium", title: `${py(label)}: 미흡/리스크 있음`,
        detail: "자가진단상 보완이 필요합니다.", legal_basis: lb, recommendation: rec };
    }
    if (val === "해당 없음") {
      return { category, level: "info", title: `${py(label)}: 해당 없음`,
        detail: "우리 회사에 해당되지 않음으로 표시됨.", legal_basis: lb, recommendation: "해당 시 재평가 필요." };
    }
    return { category, level: "info", title: `${py(label)}: 미점검 — 확인 필요`,
      detail: "아직 점검되지 않았습니다. 위 법령·유의점을 근거로 점검하세요.", legal_basis: lb, recommendation: rec };
  }

  return null;
}

/** 국가 특유 제도(country_specifics)의 구조화 검사를 평가. dispute_risk 는 finding 에 전달. */
function evaluateSpecifics(data, checkValues, context = null) {
  const findings = [];
  for (const item of get(data, "country_specifics", []) || []) {
    const name = get(item, "name", "");
    const dispute = get(item, "dispute_risk");
    for (const chk of get(item, "checks", []) || []) {
      const cid = get(chk, "id");
      if (cid === null || !(cid in checkValues)) continue;
      const f = evalCheck(chk, checkValues[cid], name, context);
      if (f) {
        if (dispute) {
          f.dispute_risk = dispute;
          if (get(item, "dispute_note")) f.dispute_note = item.dispute_note;
        }
        findings.push(f);
      }
    }
  }
  return findings;
}

/** 표준 항목 상세 점검(standard_checks)을 평가. */
function evaluateStandardChecks(data, checkValues, context = null) {
  const findings = [];
  for (const chk of get(data, "standard_checks", []) || []) {
    const cid = get(chk, "id");
    if (cid === null || !(cid in checkValues)) continue;
    const f = evalCheck(chk, checkValues[cid], get(chk, "category", "표준 점검"), context);
    if (f) findings.push(f);
  }
  return findings;
}

/** 최근 3개년 개정 대응 점검(amendment_checks)을 평가. category 는 '📌 <근거 개정>'. */
function evaluateAmendmentChecks(data, checkValues, context = null) {
  const findings = [];
  for (const chk of get(data, "amendment_checks", []) || []) {
    const cid = get(chk, "id");
    if (cid === null || !(cid in checkValues)) continue;
    const f = evalCheck(chk, checkValues[cid], "📌 " + py(get(chk, "based_on", "개정 대응")), context);
    if (f) findings.push(f);
  }
  return findings;
}

/** 레벨별 개수 집계. */
function summarize(findings) {
  const counts = { high: 0, medium: 0, ok: 0, info: 0 };
  for (const f of findings) counts[f.level] = (counts[f.level] || 0) + 1;
  return counts;
}

/** 종합 리스크 지수(0~100): high 1.0, medium 0.5 가중. 앱·리포트 공통. */
function riskScore(counts) {
  const total = Math.max(1, counts.high + counts.medium + counts.ok + counts.info);
  return pyRound((100 * (counts.high * 1.0 + counts.medium * 0.5)) / total);
}

const LEVEL_LABEL = {
  high: "위반 소지",
  medium: "주의",
  ok: "적합",
  info: "수동확인",
};

const GHRRules = {
  fmtG, pyRound, fmtComma0, evaluate, checkApplies, evalCheck,
  evaluateSpecifics, evaluateStandardChecks, evaluateAmendmentChecks, summarize, riskScore, LEVEL_LABEL,
};
if (typeof module !== "undefined" && module.exports) module.exports = GHRRules;
else root.GHRRules = GHRRules;
})(typeof window !== "undefined" ? window : globalThis);
