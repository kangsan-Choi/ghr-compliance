/**
 * 룰 기반 리스크 판정 엔진 (API 키 불필요)
 * ─────────────────────────────────────────
 * data/<국가>.json 의 법정 기준과 우리 회사 제도(사용자 응답)를 비교해 리스크를 판정한다.
 *
 * - 모든 점검 항목을 HR 카테고리(domain) 7개로 묶은 하나의 목록(checkList)으로 다룬다.
 * - 기본값은 '미응답'. 답하지 않은 항목은 판정·리스크 지수에서 빠지고 진행률에만 잡힌다.
 * - 인원 규모 조건(applies_if)에 해당하지 않는 항목은 자동으로 '규모 기준 미해당'(info)이 된다.
 *
 * 레벨: high(위반 소지) / medium(주의) / ok(적합) / info(참고·수동확인 — 리스크 지수에서 제외)
 */
(function (root) {
"use strict";

const DOMAINS = [
  { key: "hire", name: "채용·근로계약", desc: "근로계약·수습·고용형태·외국인 고용" },
  { key: "time", name: "근로시간·안전보건", desc: "법정·연장 근로시간, 휴게·휴일, 근태기록, 안전보건" },
  { key: "leave", name: "휴가·휴직", desc: "연차·병가·출산·육아 등 법정 휴가" },
  { key: "pay", name: "임금·보상", desc: "최저임금, 가산수당, 지급 방법, 법정 수당, 동일임금" },
  { key: "benefits", name: "사회보험·복리후생", desc: "사회보험·연금·산재 가입과 법정 복리후생" },
  { key: "people", name: "인사운영·노사관계", desc: "취업규칙·근로자대표, 괴롭힘·차별, 개인정보, 내부고발" },
  { key: "exit", name: "퇴직·해고", desc: "해고 사유·절차·예고, 퇴직금·해고수당" },
];
const DOMAIN_KEYS = DOMAINS.map((d) => d.key);

/** standards 필드 → 카테고리 (data/SCHEMA.md 3장) */
const STANDARD_FIELDS = [
  ["standard_weekly_hours", "time", "법정 주 근로시간", "시간"],
  ["max_weekly_hours_incl_overtime", "time", "주 최대 근로시간(연장 포함)", "시간"],
  ["overtime_premium", "pay", "연장근로 가산"],
  ["min_wage", "pay", "최저임금"],
  ["annual_leave_min_days", "leave", "법정 최소 연차", "일"],
  ["sick_leave", "leave", "병가"],
  ["probation", "hire", "수습기간"],
  ["social_insurance", "benefits", "사회보험"],
  ["termination_notice_min_days", "exit", "해고 예고기간", "일"],
  ["severance", "exit", "퇴직금·해고수당"],
];

const LEVEL_LABEL = { high: "위반 소지", medium: "주의", ok: "적합", info: "참고" };
const LEVEL_ORDER = { high: 0, medium: 1, info: 2, ok: 3 };

// ── 숫자 헬퍼 ────────────────────────────────────────────────
function fmtG(x) {
  if (!isFinite(x)) return String(x);
  return String(Number(Number(x).toPrecision(6)));
}
function fmtComma0(x) {
  return Math.round(x).toLocaleString("en-US", { maximumFractionDigits: 0 });
}
function num(x) {
  if (typeof x === "number") return isFinite(x) ? x : null;
  if (typeof x === "string" && x.trim() !== "" && isFinite(Number(x))) return Number(x);
  return null;
}
const isBlank = (v) => v === null || v === undefined || v === "";

// ── 점검 항목 목록 ────────────────────────────────────────────

/**
 * 데이터의 모든 점검 항목을 하나의 목록으로.
 * 항목: { key, source: core|std|spec|amend, domain, chk, category, item? }
 *  - core: 핵심 수치 5개(법정 기준값과 직접 비교)
 *  - std: standard_checks / spec: country_specifics[].checks / amend: amendment_checks
 */
function checkList(data) {
  const std = data.standards || {};
  const mw = std.min_wage || {};
  const out = [];
  const core = (id, domain, label, unit, extra = {}) =>
    out.push({ key: "core:" + id, source: "core", domain, category: label, chk: { id, type: "core", label, unit, ...extra } });

  if (num(std.standard_weekly_hours) !== null) core("std_weekly", "time", "정규 주당 근로시간", "시간", { legal: std.standard_weekly_hours });
  core("max_weekly", "time", "최대 주당 근로시간(연장 포함)", "시간", { legal: std.max_weekly_hours_incl_overtime ?? null });
  core("annual_leave", "leave", "연차 부여일수(연)", "일", { legal: std.annual_leave_min_days ?? null });
  core("notice_days", "exit", "해고 예고기간", "일", { legal: std.termination_notice_min_days ?? null });
  if (num(mw.amount) !== null) {
    // 법정 최저임금과 같은 단위(월·시간 등)로 받아 직접 비교
    const per = mw.period || "월";
    core("monthly_wage", "pay", per === "월" ? "월 기본급" : `기본급 (${per}당 환산)`, `${mw.currency || ""}/${per}`,
      { legal: mw.amount, step: mw.amount >= 1000 ? 100 : mw.amount >= 100 ? 10 : 0.5 });
  }

  for (const c of data.standard_checks || []) {
    out.push({ key: "std:" + c.id, source: "std", domain: c.domain, category: c.category || "표준 점검", chk: c });
  }
  (data.country_specifics || []).forEach((item, idx) => {
    for (const c of item.checks || []) {
      out.push({ key: "spec:" + c.id, source: "spec", domain: c.domain || item.domain, category: item.name || "", chk: c, item, itemIndex: idx });
    }
  });
  for (const c of data.amendment_checks || []) {
    out.push({ key: "amend:" + c.id, source: "amend", domain: c.domain, category: c.based_on || "개정 대응", chk: c });
  }
  for (const e of out) if (!DOMAIN_KEYS.includes(e.domain)) e.domain = "people";
  return out;
}

// ── 판정 ──────────────────────────────────────────────────────

function checkApplies(chk, context) {
  const cond = chk.applies_if;
  if (!cond) return true;
  const cur = num((context || {})[cond.field]);
  const val = num(cond.value);
  if (cur === null || val === null) return true;
  return { ">=": cur >= val, "<=": cur <= val, ">": cur > val, "<": cur < val, "==": cur === val }[cond.op] ?? true;
}

/** 핵심 수치(core) 판정. 미응답이면 null. */
function evalCore(data, chk, value) {
  const std = data.standards || {};
  const mw = std.min_wage || {};
  const legal = num(chk.legal);
  const v = num(value);

  if (chk.id === "annual_leave" && legal === 0) {
    return { level: "info", title: "이 국가는 법정 연차 의무가 없습니다",
      detail: "법정 최소 연차가 0일입니다(예: 미국 연방·텍사스). 회사 정책으로 자율 부여합니다.",
      legal_basis: "법정 연차 의무 없음", recommendation: "법적 의무는 없으나 경쟁력 있는 연차 정책을 검토하세요.", auto: true };
  }
  if (v === null) return null;

  if (chk.id === "std_weekly") {
    return v > legal
      ? { level: "medium", title: `정규 주당 근로시간이 법정 기준(${fmtG(legal)}시간)을 초과`,
          detail: `입력값 ${fmtG(v)}시간 > 법정 ${fmtG(legal)}시간. 초과분은 연장근로로 처리·가산수당 지급 대상일 수 있습니다.`,
          legal_basis: `법정 표준 주당 근로시간 ${fmtG(legal)}시간`, recommendation: "초과분을 연장근로로 분류하고 가산수당·한도 준수 여부를 점검하세요." }
      : { level: "ok", title: `정규 주당 근로시간 적합 (${fmtG(v)} ≤ ${fmtG(legal)}시간)`, detail: "법정 표준 근로시간 이내입니다.",
          legal_basis: `법정 표준 ${fmtG(legal)}시간`, recommendation: "현행 유지." };
  }
  if (chk.id === "max_weekly") {
    if (legal === null) {
      return { level: "info", title: "이 국가는 주당 절대 상한이 없거나 협정·한도 방식입니다",
        detail: "주당 고정 상한 대신 노사협정(예: 일본 36협정)이나 월/연 단위 한도로 규율되어 자동 판정이 어렵습니다.",
        legal_basis: std.overtime_premium || "연장근로 규정 참조", recommendation: "월/연 단위 연장근로 한도와 협정 체결 여부를 확인하세요." };
    }
    return v > legal
      ? { level: "high", title: `연장 포함 주당 최대 근로시간이 법정 상한(${fmtG(legal)}시간) 초과`,
          detail: `입력값 ${fmtG(v)}시간 > 법정 상한 ${fmtG(legal)}시간. 법 위반 소지가 큽니다.`,
          legal_basis: `법정 주당 최대 ${fmtG(legal)}시간`, recommendation: "연장근로 한도를 즉시 점검하고 근무 스케줄을 조정하세요." }
      : { level: "ok", title: `연장 포함 주당 근로시간 적합 (${fmtG(v)} ≤ ${fmtG(legal)}시간)`, detail: "법정 주당 최대 시간 이내입니다.",
          legal_basis: `법정 최대 ${fmtG(legal)}시간`, recommendation: "현행 유지." };
  }
  if (chk.id === "annual_leave") {
    if (legal === null) return null;
    return v < legal
      ? { level: "high", title: `연차 부여일수가 법정 최소(${fmtG(legal)}일)에 미달`,
          detail: `입력값 ${fmtG(v)}일 < 법정 최소 ${fmtG(legal)}일. 미달분만큼 위반입니다.`,
          legal_basis: `법정 최소 연차 ${fmtG(legal)}일`, recommendation: `연차를 최소 ${fmtG(legal)}일 이상으로 상향하세요.` }
      : { level: "ok", title: `연차 부여일수 적합 (${fmtG(v)} ≥ ${fmtG(legal)}일)`, detail: "법정 최소 연차 이상입니다.",
          legal_basis: `법정 최소 ${fmtG(legal)}일`, recommendation: "현행 유지." };
  }
  if (chk.id === "notice_days") {
    if (legal === null) {
      return { level: "info", title: "법정 해고 예고기간이 없거나 특수합니다",
        detail: "예: 미국 텍사스의 at-will 고용, 인도네시아의 협의 절차 방식 등. 자동 판정 대상이 아닙니다.",
        legal_basis: std.severance || "해고/퇴직 규정 참조", recommendation: "현지 해고 절차(협의·승인·보상)를 확인하세요." };
    }
    return v < legal
      ? { level: "high", title: `해고 예고기간이 법정 기준(${fmtG(legal)}일)에 미달`,
          detail: `입력값 ${fmtG(v)}일 < 법정 ${fmtG(legal)}일. 예고 부족분은 수당 지급 또는 무효 사유가 될 수 있습니다.`,
          legal_basis: `법정 해고 예고 ${fmtG(legal)}일`, recommendation: `예고기간을 ${fmtG(legal)}일 이상으로 하거나 부족분을 예고수당으로 보전하세요.` }
      : { level: "ok", title: `해고 예고기간 적합 (${fmtG(v)} ≥ ${fmtG(legal)}일)`, detail: "법정 예고기간 이상입니다.",
          legal_basis: `법정 ${fmtG(legal)}일`, recommendation: "현행 유지." };
  }
  if (chk.id === "monthly_wage") {
    const unit = `${mw.currency || ""}/${mw.period || "월"}`;
    const amt = (x) => x.toLocaleString("en-US", { maximumFractionDigits: 2 });
    return v < legal
      ? { level: "high", title: `기본급이 법정 최저임금(${amt(legal)} ${unit}) 미만`,
          detail: `입력값 ${amt(v)} < 법정 ${amt(legal)} ${unit}. ${mw.note || ""}`,
          legal_basis: `법정 최저임금 ${amt(legal)} ${unit} (${mw.locality || ""})`, recommendation: "기본급을 법정 최저임금 이상으로 즉시 조정하세요." }
      : { level: "ok", title: `기본급 적합 (${amt(v)} ≥ ${amt(legal)} ${unit})`, detail: "법정 최저임금 이상입니다.",
          legal_basis: `법정 최저임금 ${amt(legal)} ${unit}`, recommendation: "현행 유지." };
  }
  return null;
}

/** 구조화 check 판정. 미응답이면 null. */
function evalCheck(chk, val) {
  const label = chk.label || "";
  const unit = chk.unit || "";
  const lb = chk.legal_basis || "";
  const rec = chk.recommendation || "";
  const fail = chk.fail_level || "high";
  if (isBlank(val)) return null;

  if (chk.type === "number_min" || chk.type === "number_max") {
    const v = num(val);
    if (v === null) return null;
    const thr = num(chk.threshold);
    const isMin = chk.type === "number_min";
    if (isMin && v === 0) {
      return { level: "info", title: `${label} — 0 입력 (판정 보류)`,
        detail: `실제 운영 기준을 입력하면 법정 최소 ${fmtG(thr)}${unit}와 비교 판정합니다.`, legal_basis: lb, recommendation: rec };
    }
    if (isMin ? v >= thr : v <= thr) {
      return { level: "ok", title: `${label} 적합 (${fmtG(v)}${unit})`,
        detail: `법정 기준 ${isMin ? "≥" : "≤"} ${fmtG(thr)}${unit} 충족.`, legal_basis: lb, recommendation: "현행 유지." };
    }
    return { level: fail, title: `${label}: 법정 기준(${isMin ? "최소" : "최대"} ${fmtG(thr)}${unit}) ${isMin ? "미달" : "초과"}`,
      detail: `입력 ${fmtG(v)}${unit} ${isMin ? "<" : ">"} 기준 ${fmtG(thr)}${unit}.`, legal_basis: lb, recommendation: rec };
  }
  if (chk.type === "boolean") {
    if (val === "예") return { level: "ok", title: `${label} — 이행`, detail: "법정/권고 사항을 이행 중입니다.", legal_basis: lb, recommendation: "현행 유지." };
    if (val === "아니오") return { level: fail, title: `${label} — 미이행`, detail: "법정/권고 사항을 충족하지 못하고 있습니다.", legal_basis: lb, recommendation: rec };
    return { level: "info", title: `${label} — 해당 없음`, detail: "우리 회사에 해당되지 않음으로 표시됨.", legal_basis: lb, recommendation: "해당 시 재평가하세요." };
  }
  if (chk.type === "choice") {
    const m = (chk.options || []).find((o) => o.label === val);
    if (!m) return null;
    return { level: m.level || "info", title: `${label}: ${val}`, detail: m.detail || "", legal_basis: lb,
      recommendation: m.level === "high" || m.level === "medium" ? rec : "현행 유지." };
  }
  if (chk.type === "posture") {
    if (val === "점검 완료 · 문제 없음") return { level: "ok", title: `${label} — 점검 완료`, detail: "자가진단상 문제 없음으로 평가됨.", legal_basis: lb, recommendation: "현행 유지." };
    if (val === "점검했으나 미흡/리스크 있음") return { level: "medium", title: `${label} — 미흡·리스크 있음`, detail: "자가진단상 보완이 필요합니다.", legal_basis: lb, recommendation: rec };
    if (val === "해당 없음") return { level: "info", title: `${label} — 해당 없음`, detail: "우리 회사에 해당되지 않음으로 표시됨.", legal_basis: lb, recommendation: "해당 시 재평가하세요." };
    return { level: "info", title: `${label} — 확인 필요(모름)`, detail: "현황을 아직 파악하지 못했습니다. 법령·유의점을 근거로 확인하세요.", legal_basis: lb, recommendation: rec };
  }
  return null;
}

/**
 * 항목 1개 판정 → finding | null(미응답).
 * finding 에는 key·domain·category·source, 분쟁 다발 정보, auto(자동 판정) 여부가 붙는다.
 */
function evaluateEntry(data, entry, answers, context) {
  const chk = entry.chk;
  let f;
  if (entry.source !== "core" && !checkApplies(chk, context)) {
    const c = chk.applies_if;
    f = { level: "info", title: `${chk.label} — 규모 기준 미해당`,
      detail: `적용 기준: 직원 ${c.op} ${c.value}명. 현재 규모에서는 대상이 아닙니다.`,
      legal_basis: chk.legal_basis || "", recommendation: "규모 변동 시 재평가하세요.", auto: true };
  } else {
    f = entry.source === "core" ? evalCore(data, chk, answers[entry.key]) : evalCheck(chk, answers[entry.key]);
  }
  if (!f) return null;
  f.key = entry.key;
  f.domain = entry.domain;
  f.category = entry.category;
  f.source = entry.source;
  if (entry.item?.dispute_risk) {
    f.dispute_risk = entry.item.dispute_risk;
    if (entry.item.dispute_note) f.dispute_note = entry.item.dispute_note;
  }
  return f;
}

/** 전체 판정 → { findings, byKey, progress: {domain: {answered,total}}, total } */
function evaluateAll(data, answers, context) {
  const list = checkList(data);
  const findings = [];
  const byKey = {};
  const progress = Object.fromEntries(DOMAIN_KEYS.map((k) => [k, { answered: 0, total: 0 }]));
  for (const e of list) {
    const f = evaluateEntry(data, e, answers, context);
    progress[e.domain].total += 1;
    if (f) { findings.push(f); byKey[e.key] = f; progress[e.domain].answered += 1; }
  }
  const total = list.length;
  const answered = findings.length;
  // shown: 화면·리포트에 보여 줄 판정(규모 기준 미해당 같은 자동 판정은 진행률에만 반영)
  const shown = findings.filter((f) => !f.auto);
  return { list, findings, shown, byKey, progress, total, answered, autoCount: answered - shown.length };
}

function summarize(findings) {
  const counts = { high: 0, medium: 0, ok: 0, info: 0 };
  for (const f of findings) counts[f.level] = (counts[f.level] || 0) + 1;
  return counts;
}

/** 종합 리스크 지수(0~100): 판정된 항목(위반·주의·적합) 중 위반 1.0, 주의 0.5 가중. 판정 항목이 없으면 null. */
function riskScore(counts) {
  const judged = counts.high + counts.medium + counts.ok;
  if (!judged) return null;
  return Math.round((100 * (counts.high + counts.medium * 0.5)) / judged);
}

const GHRRules = {
  DOMAINS, DOMAIN_KEYS, STANDARD_FIELDS, LEVEL_LABEL, LEVEL_ORDER,
  fmtG, fmtComma0, checkList, checkApplies, evalCheck, evalCore, evaluateEntry, evaluateAll, summarize, riskScore,
};
if (typeof module !== "undefined" && module.exports) module.exports = GHRRules;
else root.GHRRules = GHRRules;
})(typeof window !== "undefined" ? window : globalThis);
