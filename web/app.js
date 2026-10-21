/**
 * Global ER Compliance — 프론트엔드 (빌드 도구 없는 순수 ES 모듈)
 * ─────────────────────────────────────────
 * 흐름: 홈(관할 선택) → 국가 작업공간 [01 법령 브리핑 · 02 제도 점검 · 03 진단 결과]
 * 입력이 바뀌면 rules.js 로 즉시 재판정하고, 우측 요약·행별 상태·결과 탭을 갱신한다.
 * 입력값은 서버로 보내지 않고 브라우저 메모리에만 둔다(새로고침 시 초기화).
 */
import * as R from "./rules.js";
import { buildReport, buildPrompt, fmtAmount } from "./report.js";

const DATA_BASE = document.querySelector('meta[name="ghr-data"]')?.content || "data/";

const COUNTRIES = [
  { slug: "us", file: "us_houston.json", code: "US", region: "americas", sub: "텍사스" },
  { slug: "cn", file: "china_beijing.json", code: "CN", region: "asia" },
  { slug: "jp", file: "japan_tokyo.json", code: "JP", region: "asia" },
  { slug: "ru", file: "russia_moscow.json", code: "RU", region: "europe" },
  { slug: "nl", file: "netherlands_amsterdam.json", code: "NL", region: "europe" },
  { slug: "es", file: "spain_cartagena.json", code: "ES", region: "europe" },
  { slug: "id", file: "indonesia_dumai.json", code: "ID", region: "asia" },
  { slug: "in", file: "india_gurgaon.json", code: "IN", region: "asia", sub: "하리아나" },
];
const REGION_LABEL = { asia: "Asia", europe: "Europe", americas: "Americas" };
const REGION_KO = { all: "전체", asia: "아시아", europe: "유럽", americas: "미주" };

const TIMELINE_STATUS = {
  "시행 중": ["st-live", "시행 중"],
  "시행 확정(예정)": ["st-fixed", "시행 확정"],
  "추진 중(미확정)": ["st-pending", "추진 중 · 미확정"],
  "정정 필요(미시행)": ["st-void", "미시행 · 정정"],
  "정정 필요": ["st-void", "정정"],
};
const CONF = { high: ["높음", ""], medium: ["보통", "medium"], low: ["낮음", "low"] };
const LEVEL_ORDER = { high: 0, medium: 1, info: 2, ok: 3 };
const LEVEL_SHORT = { high: "위반 소지", medium: "주의", ok: "적합", info: "확인 필요" };
const POSTURE = [
  ["점검 완료 · 문제 없음", "문제 없음", "good"],
  ["점검했으나 미흡/리스크 있음", "미흡", "warn"],
  ["미점검 / 모름", "미점검", ""],
  ["해당 없음", "해당 없음", ""],
];
const BOOL = [["예", "예", "good"], ["아니오", "아니오", "bad"], ["해당 없음", "해당 없음", ""]];
const NUMERIC_CATEGORY = {
  std_weekly: "정규 근로시간", max_weekly: "최대 근로시간", annual_leave: "연차휴가",
  notice_days: "해고 예고", monthly_wage: "최저임금",
};

const ICON = {
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  ext: '<path d="M14 5h5v5M19 5l-8 8M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
  flame: '<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.1 0-3.4 2.6-5.3 3.6-8.4.4 1.9 1.5 3 2.6 3.6.2-2.7 1.4-5.1 3.6-7.1-.3 3 2.7 5.6 2.7 10 0 4.4-2.4 8-6 8Z"/>',
  alert: '<path d="M12 4 2.8 19.5h18.4L12 4Z"/><path d="M12 10v4.2M12 17.2v.1"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.4 3.1 8.2 7.5 9.5 4.4-1.3 7.5-5.1 7.5-9.5V6L12 3Z"/><path d="m9 12 2 2 4-4"/>',
};
const icon = (n, cls = "") => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (v, fb) => (typeof v === "number" && isFinite(v) ? v : fb);
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ── 상태 ──────────────────────────────────────────────────────
const S = {
  all: {},            // slug → data
  inputs: {},         // slug → 입력값(국가 전환 시 유지)
  slug: null,
  tab: "brief",
  homeFilter: "all",
  resultFilter: "all",
  findings: [],
};
const app = $("#app");

// ── 데이터 ────────────────────────────────────────────────────
async function loadAll() {
  const list = await Promise.all(COUNTRIES.map(async (c) => {
    const res = await fetch(DATA_BASE + c.file, { cache: "no-cache" });
    if (!res.ok) throw new Error(`${c.file}: HTTP ${res.status}`);
    return [c.slug, await res.json()];
  }));
  for (const [slug, data] of list) S.all[slug] = data;
}

function defaultCheckValue(chk, isAmend) {
  if (chk.type === "number_min" || chk.type === "number_max") return num(chk.threshold, num(chk.default, 0));
  if (chk.type === "boolean") return isAmend ? "아니오" : "해당 없음";
  if (chk.type === "choice") return (chk.options || [])[0]?.label ?? "";
  if (chk.type === "posture") return "미점검 / 모름";
  return null;
}

function defaultInputs(data) {
  const std = data.standards || {};
  const mw = std.min_wage || {};
  const inp = {
    headcount: 50,
    numeric: {
      std_weekly: num(std.standard_weekly_hours, 40),
      max_weekly: num(std.max_weekly_hours_incl_overtime || std.standard_weekly_hours || 52, 52),
      annual_leave: num(std.annual_leave_min_days, 0),
      notice_days: num(std.termination_notice_min_days, 0),
      monthly_wage: mw.period === "월" && typeof mw.amount === "number" ? mw.amount : 0,
    },
    std: {}, spec: {}, amend: {}, memos: {}, questions: "", answers: {},
  };
  for (const c of data.standard_checks || []) inp.std[c.id] = defaultCheckValue(c, false);
  for (const it of data.country_specifics || []) for (const c of it.checks || []) inp.spec[c.id] = defaultCheckValue(c, false);
  for (const c of data.amendment_checks || []) inp.amend[c.id] = defaultCheckValue(c, true);
  return inp;
}

const cur = () => ({ meta: COUNTRIES.find((c) => c.slug === S.slug), data: S.all[S.slug], inp: S.inputs[S.slug] });

function numericForRules(inp) {
  return { ...inp.numeric, monthly_wage: inp.numeric.monthly_wage ? inp.numeric.monthly_wage : null };
}

function computeFindings(data, inp) {
  const ctx = { headcount: inp.headcount };
  return R.evaluate(data, numericForRules(inp))
    .concat(R.evaluateStandardChecks(data, inp.std, ctx))
    .concat(R.evaluateSpecifics(data, inp.spec, ctx))
    .concat(R.evaluateAmendmentChecks(data, inp.amend, ctx));
}

/** 리포트·프롬프트용 입력 요약(스트림릿 앱과 동일 형식). */
function inputSummaries(data, inp) {
  const mw = data.standards.min_wage || {};
  const n = inp.numeric;
  const base = {
    "정규 주당 근로시간": `${R.fmtG(n.std_weekly)} 시간`,
    "최대 주당 근로시간": `${R.fmtG(n.max_weekly)} 시간`,
    "연차 부여일수": `${R.fmtG(n.annual_leave)} 일`,
    "해고 예고기간": `${R.fmtG(n.notice_days)} 일`,
    "월 기본급": n.monthly_wage ? `${R.fmtComma0(n.monthly_wage)} ${mw.currency || ""}` : "(미입력)",
  };
  const specific = {};
  (data.country_specifics || []).forEach((item, i) => {
    const name = item.name || `제도 ${i + 1}`;
    const parts = (item.checks || []).map((c) => {
      const v = inp.spec[c.id];
      const lbl = c.label || name;
      return typeof v === "number" ? `${lbl}=${R.fmtG(v)}${c.unit || ""}` : `${lbl}=${v}`;
    });
    const memo = (inp.memos[i] || "").trim();
    if (memo) parts.push(`메모: ${memo}`);
    specific[name] = parts.join(" · ");
  });
  return { base, specific };
}

const questionsOf = (inp) => inp.questions.split("\n").map((q) => q.trim()).filter(Boolean);

// ── 자가점검(데이터 신선도·정합성) — compliance_app.self_audit 포팅 ──
function monthsBetween(ymd, today) {
  const [y, m] = String(ymd || "").split("-").map((x) => parseInt(x, 10));
  if (!isFinite(y) || !isFinite(m)) return -1;
  return (today.getFullYear() - y) * 12 + (today.getMonth() + 1 - m);
}
function selfAudit(data) {
  const warns = [];
  const today = new Date();
  const age = monthsBetween(data.as_of, today);
  if (age >= 12) warns.push(`법령 기준시점(as_of ${data.as_of})이 ${age}개월 경과 — 재검증 권장.`);
  else if (age >= 6) warns.push(`법령 기준시점(as_of ${data.as_of})이 ${age}개월 경과 — 최신성 확인 권장.`);
  for (const a of data.amendment_timeline || []) {
    if (a.effective_date && (a.status || "").includes("예정") && monthsBetween(a.effective_date, today) > 0) {
      warns.push(`‘${a.title}’ — 발효일(${a.effective_date})이 지났으나 상태가 ‘${a.status}’ → ‘시행 중’으로 정정 필요.`);
    }
  }
  if (!(data.sources || []).length) warns.push("출처(sources)가 비어 있습니다 — 1차 출처 링크를 보강하세요.");
  return warns;
}

/** 데이터 전체에서 인원 규모(applies_if: headcount) 조건 항목 수집 — collect_size_rules 포팅. */
function sizeRules(data) {
  const found = [];
  const walk = (node, hint = "") => {
    if (Array.isArray(node)) { node.forEach((x) => walk(x, hint)); return; }
    if (node && typeof node === "object") {
      const c = node.applies_if;
      if (c && typeof c === "object" && c.field === "headcount") {
        found.push({ label: node.label || hint || "규모 조건 항목", op: c.op || ">=", value: c.value, basis: node.based_on || node.legal_basis || "" });
      }
      for (const v of Object.values(node)) walk(v, node.name || node.label || hint);
    }
  };
  walk(data);
  return found;
}
const opHolds = (a, op, b) => ({ ">=": a >= b, "<=": a <= b, ">": a > b, "<": a < b, "==": a === b }[op]);

// ── 공통 조각 ─────────────────────────────────────────────────
const wageShort = (mw) => (typeof mw?.amount === "number"
  ? `${mw.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${mw.currency || ""}<small>/${esc(mw.period || "")}</small>` : "—");
const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } };
const confBadge = (v) => {
  const [txt, cls] = CONF[v?.confidence] || ["미검증", "none"];
  return `<span class="conf"><span class="dot ${cls}"></span>신뢰도 ${txt}</span>`;
};
const totalChecks = (d) => (d.standard_checks || []).length + (d.amendment_checks || []).length
  + (d.country_specifics || []).reduce((n, it) => n + (it.checks || []).length, 0) + 5;

function setTopbar(html) { $("#topbar-slot").innerHTML = html; }

// ══════════════════════════════════════════════════════════════
// 홈
// ══════════════════════════════════════════════════════════════
function renderHome() {
  const datas = COUNTRIES.map((c) => S.all[c.slug]);
  const asOf = datas.map((d) => d.as_of || "").sort().pop();
  const verified = datas.map((d) => d.verification?.last_verified || "").sort().pop();
  const checks = datas.reduce((n, d) => n + totalChecks(d), 0);
  setTopbar(`<span class="chip-meta"><span class="dot"></span>데이터 기준 ${esc(asOf)} · 검증 ${esc(verified)}</span>`);
  document.title = "Global ER Compliance";

  app.innerHTML = `
  <section class="hero">
    <div class="wrap fade-in">
      <div class="eyebrow">Global Employee Relations · Compliance Review</div>
      <h1>해외 사업장의 노동법 리스크를<br/><em>한 화면에서</em> 진단합니다.</h1>
      <p class="lead">국가·도시별 법정 기준과 최근 개정, 분쟁이 잦은 제도를 우리 회사 운영 기준과 나란히 놓고 비교합니다.
        입력하는 즉시 판정되며, 결과는 보고용 리포트로 내려받을 수 있습니다.</p>
      <div class="hero-stats">
        <div class="hero-stat"><b>${COUNTRIES.length}</b><span>관할(국가·도시)</span></div>
        <div class="hero-stat"><b>${checks}</b><span>자동 판정 점검 항목</span></div>
        <div class="hero-stat"><b>${esc(verified.slice(2).replaceAll("-", "."))}</b><span>최종 법령 검증일</span></div>
      </div>
    </div>
  </section>

  <div class="wrap">
    <section class="section" style="padding-top:36px">
      ${privacyNotice(false)}
    </section>

    <section class="section" style="padding-top:44px">
      <div class="section-head">
        <div><div class="eyebrow">Jurisdictions</div><h2>점검할 관할을 선택하세요</h2></div>
        <div class="seg-filter" role="group" aria-label="지역 필터">
          ${Object.entries(REGION_KO).map(([k, v]) => `<button type="button" data-region="${k}" aria-pressed="${S.homeFilter === k}">${v}</button>`).join("")}
        </div>
      </div>
      <div class="grid-countries">
        ${COUNTRIES.filter((c) => S.homeFilter === "all" || c.region === S.homeFilter).map(countryCard).join("")}
      </div>
    </section>

    <section class="section" style="padding-bottom:64px">
      <div class="features">
        <div class="feature"><div class="num">01</div><h3>법령 브리핑</h3><p>핵심 법정 기준, 최근 3개년 개정 타임라인(확정 여부 포함), 주요 판례와 1차 출처를 한 번에 확인합니다.</p></div>
        <div class="feature"><div class="num">02</div><h3>제도 점검</h3><p>사업장 규모에 따라 달라지는 의무까지 반영해, 우리 회사 운영 기준을 항목별로 입력하면 즉시 판정됩니다.</p></div>
        <div class="feature"><div class="num">03</div><h3>진단 · 리포트</h3><p>위반 소지와 주의 항목을 우선순위로 정리하고, 근거와 권고가 담긴 HTML 리포트를 내려받습니다.</p></div>
      </div>
    </section>
  </div>`;
}

function countryCard(c) {
  const d = S.all[c.slug];
  const std = d.standards || {};
  const v = d.verification || {};
  return `
  <a class="c-card fade-in" href="#/${c.slug}">
    <div class="c-top"><span class="c-code">${c.code}</span><span class="c-region">${REGION_LABEL[c.region]}</span></div>
    <div class="c-name">${esc(d.country)}</div>
    <div class="c-city">${esc(d.city)}${c.sub ? ` · ${esc(c.sub)}` : ""}</div>
    <div class="c-facts">
      <div class="c-fact"><span>최저임금</span><b>${typeof std.min_wage?.amount === "number" ? `${std.min_wage.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${esc(std.min_wage.currency)}/${esc(std.min_wage.period)}` : "—"}</b></div>
      <div class="c-fact"><span>법정 주 근로시간</span><b>${esc(std.standard_weekly_hours ?? "—")}시간</b></div>
      <div class="c-fact"><span>법정 최소 연차</span><b>${std.annual_leave_min_days ? `${esc(std.annual_leave_min_days)}일` : "의무 없음"}</b></div>
    </div>
    <div class="c-foot">${confBadge(v)}<span>${esc(v.last_verified || "")}</span><span class="c-go">${icon("arrow")}</span></div>
  </a>`;
}

function privacyNotice(compact) {
  if (compact) {
    return `<div class="notice compact"><div class="notice-icon">${icon("lock")}</div>
      <p><b>회사·법인·사람을 특정할 수 있는 정보는 입력하지 마세요.</b> 제도 값(시간·일수·금액·예/아니오)만으로 진단에 충분합니다. 입력값은 이 브라우저 안에서만 처리됩니다.</p></div>`;
  }
  return `<div class="notice"><div class="notice-icon">${icon("lock")}</div><div>
    <h4>입력 주의 — 회사·법인을 특정할 수 있는 정보는 입력하지 마세요</h4>
    <ul>
      <li><b>회사명·법인명·사업장명·브랜드명, 담당자·임직원 이름, 주소·사업자번호</b> 등 식별 정보를 적지 마세요.</li>
      <li>이 점검은 “어느 회사가 무엇을 못 지키고 있다”는 민감한 결과를 만듭니다. 식별 정보가 없으면 <b>설령 외부로 유출되어도 특정 회사로 연결되지 않습니다.</b></li>
      <li>제도 값(시간·일수·금액·예/아니오)만 입력하면 진단에 충분합니다. 메모란에도 회사 식별 표현은 피해주세요.</li>
    </ul></div></div>`;
}

// ══════════════════════════════════════════════════════════════
// 국가 작업공간
// ══════════════════════════════════════════════════════════════
function renderCountry() {
  const { meta, data, inp } = cur();
  const v = data.verification || {};
  const issueCount = (v.issues_found || []).length + selfAudit(data).length;
  document.title = `${data.country} ${data.city} · Global ER Compliance`;
  setTopbar(`
    <label class="switcher"><span class="sr-only">관할 전환</span>
      <select id="switch">${COUNTRIES.map((c) => `<option value="${c.slug}" ${c.slug === S.slug ? "selected" : ""}>${esc(S.all[c.slug].country)} · ${esc(S.all[c.slug].city)}</option>`).join("")}</select>
    </label>`);

  app.innerHTML = `
  <section class="band">
    <div class="wrap">
      <div class="crumb"><a href="#/">관할 선택</a><span>/</span><span>${esc(data.country)}</span></div>
      <div class="band-title">
        <h1>${esc(data.country)} ${esc(data.city)}<small>${meta.sub ? esc(meta.sub) + " · " : ""}${esc(data.currency || "")}</small></h1>
        <span class="band-code">${meta.code}</span>
      </div>
      <p class="band-note">${esc(data.jurisdiction_note)}</p>
      <div class="band-chips">
        <span class="band-chip"><span class="k">법령 기준시점</span>${esc(data.as_of)}</span>
        <span class="band-chip"><span class="k">최종 검증</span>${esc(v.last_verified || "—")}</span>
        <span class="band-chip"><span class="k">데이터 신뢰도</span>${esc((CONF[v.confidence] || ["미검증"])[0])}</span>
        ${issueCount ? `<button class="band-chip" type="button" data-goto="verify">${icon("alert")}<span>데이터 점검 메모 ${issueCount}건</span></button>` : ""}
      </div>
      <div class="tabs" role="tablist">
        ${tabBtn("brief", "01", "법령 브리핑")}
        ${tabBtn("check", "02", "제도 점검")}
        ${tabBtn("result", "03", "진단 결과", '<span class="n" id="tab-n">0</span>')}
      </div>
    </div>
  </section>
  <div class="wrap">
    <div class="workspace">
      <div id="pane" class="fade-in"></div>
      <aside class="aside" aria-label="실시간 리스크 요약">${asideHTML()}</aside>
    </div>
  </div>
  <div class="mbar">
    <div class="score"><span id="m-score">0</span><small> /100</small></div>
    <div class="counts" id="m-counts"></div>
    <button class="btn btn-primary btn-sm" type="button" data-action="report">${icon("download")}리포트</button>
  </div>`;
  refreshLive();
  renderPane();
}

const tabBtn = (id, no, label, extra = "") =>
  `<button class="tab" role="tab" type="button" data-tab="${id}" aria-selected="${S.tab === id}"><span class="step">${no}</span>${label}${extra}</button>`;

function asideHTML() {
  const C = 2 * Math.PI * 46;
  return `
  <div class="panel panel-pad">
    <div class="eyebrow">Risk Index</div>
    <div class="risk-head" style="margin-top:12px">
      <div class="ring">
        <svg viewBox="0 0 104 104"><circle class="track" cx="52" cy="52" r="46"/><circle class="val" id="ring-val" cx="52" cy="52" r="46" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${C.toFixed(2)}"/></svg>
        <div class="center"><div><b id="score">0</b><span>/ 100</span></div></div>
      </div>
      <div class="risk-meta"><h3>종합 리스크 지수</h3><p>위반 소지 1.0 · 주의 0.5 가중 평균. 입력을 바꾸면 즉시 다시 계산됩니다.</p></div>
    </div>
    <div class="lvl-rows">
      ${["high", "medium", "info", "ok"].map((l) => `
        <div class="lvl-row lv-${l}"><span class="lvl-name"><span class="sw"></span>${R.LEVEL_LABEL[l]}</span>
        <span class="bar"><i id="bar-${l}" style="background:var(--c)"></i></span><b id="cnt-${l}">0</b></div>`).join("")}
    </div>
    <div class="aside-actions">
      <button class="btn btn-primary btn-block" type="button" data-action="report">${icon("download")}최종 리포트 다운로드</button>
      <button class="btn btn-block" type="button" data-tab="result">진단 결과 보기${icon("arrow")}</button>
    </div>
    <p class="aside-note">${icon("shield")}입력값은 서버로 전송되지 않습니다.</p>
  </div>
  <button class="btn btn-ghost btn-sm" type="button" data-action="reset" style="justify-self:start">${icon("refresh")}이 관할 입력 초기화</button>`;
}

function renderPane() {
  const pane = $("#pane");
  if (!pane) return;
  $$(".tab").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === S.tab)));
  pane.classList.remove("fade-in"); void pane.offsetWidth; pane.classList.add("fade-in");
  pane.innerHTML = S.tab === "brief" ? briefHTML() : S.tab === "check" ? checkHTML() : resultHTML();
  if (S.tab === "check") refreshLive();
}

// ── 01 법령 브리핑 ────────────────────────────────────────────
function briefHTML() {
  const { data } = cur();
  const std = data.standards || {};
  const mw = std.min_wage || {};
  const v = data.verification || {};
  const audit = selfAudit(data);
  const stat = (k, val, unit, s = "") => `<div class="stat"><div class="k">${k}</div><div class="v">${val}${unit ? `<small>${unit}</small>` : ""}</div>${s ? `<div class="s">${s}</div>` : ""}</div>`;
  return `
  <section class="block">
    <div class="block-head"><span class="no">01</span><h2>핵심 법정 기준</h2></div>
    <div class="stats">
      ${stat("법정 주 근로시간", esc(std.standard_weekly_hours ?? "—"), "시간")}
      ${stat("주 최대 (연장 포함)", std.max_weekly_hours_incl_overtime ? esc(std.max_weekly_hours_incl_overtime) : "—", std.max_weekly_hours_incl_overtime ? "시간" : "", std.max_weekly_hours_incl_overtime ? "" : "상한 없음 · 협정 방식")}
      ${stat("최저임금", wageShort(mw), "", esc(mw.locality || ""))}
      ${stat("법정 최소 연차", std.annual_leave_min_days ? esc(std.annual_leave_min_days) : "—", std.annual_leave_min_days ? "일" : "", std.annual_leave_min_days ? "" : "법정 의무 없음")}
      ${stat("해고 예고", std.termination_notice_min_days ? esc(std.termination_notice_min_days) : "—", std.termination_notice_min_days ? "일" : "", std.termination_notice_min_days ? "" : "없음 · 특수(at-will 등)")}
    </div>
  </section>

  <section class="block">
    <div class="block-head"><span class="no">02</span><h2>세부 기준</h2></div>
    <dl class="deflist">
      ${[["연장근로 가산", std.overtime_premium], ["최저임금 비고", mw.note], ["병가", std.sick_leave], ["퇴직금 · 해고수당", std.severance],
        ["수습기간", std.probation], ["사회보험", std.social_insurance]]
        .filter(([, x]) => x).map(([k, x]) => `<div><dt>${k}</dt><dd>${esc(x)}</dd></div>`).join("")}
    </dl>
  </section>

  <section class="block">
    <div class="block-head"><span class="no">03</span><h2>최근 개정 타임라인</h2><p>확정 여부 포함</p></div>
    <ol class="timeline">
      ${(data.amendment_timeline || []).map((a) => {
        const [cls, label] = TIMELINE_STATUS[a.status] || ["st-void", a.status || "—"];
        return `<li class="tl ${cls}"><div class="tl-date">${esc(a.date)}</div><div class="tl-body">
          <h4>${esc(a.title)} <span class="pill sm ${cls}">${esc(label)}</span></h4>
          <p>${esc(a.impact)}</p>${a.effective_date ? `<div class="eff">발효 ${esc(a.effective_date)}</div>` : ""}</div></li>`;
      }).join("")}
    </ol>
  </section>

  <section class="block">
    <div class="block-head"><span class="no">04</span><h2>주요 판례 · 행정해석</h2></div>
    <div class="cards-2">
      ${(data.precedents || []).map((p) => `<article class="case"><h4>${esc(p.title)}</h4><dl>
        <div><dt>쟁점</dt><dd>${esc(p.issue)}</dd></div><div><dt>시사점</dt><dd>${esc(p.implication)}</dd></div></dl></article>`).join("")}
    </div>
  </section>

  <section class="block">
    <div class="block-head"><span class="no">05</span><h2>1차 출처</h2></div>
    <ul class="sources">
      ${(data.sources || []).map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer"><span>${esc(s.title)}</span><span class="host">${esc(host(s.url))}${icon("ext")}</span></a></li>`).join("")}
    </ul>
  </section>

  <section class="block" id="verify">
    <div class="block-head"><span class="no">06</span><h2>데이터 검증 기록</h2></div>
    <div class="verify">
      <div class="verify-top">
        <div><div class="k">최종 검증일</div><div class="v">${esc(v.last_verified || "—")}</div></div>
        <div><div class="k">데이터 신뢰도</div><div class="v">${confBadge(v)}</div></div>
        <div><div class="k">검증 메모</div><div class="note">${esc(v.notes || "—")}</div></div>
      </div>
      ${(v.issues_found || []).length || audit.length ? `
      <details class="issues"><summary>${icon("alert")}점검 메모 ${(v.issues_found || []).length + audit.length}건 — 확인 필요·수정 이력</summary>
        <ul>${(v.issues_found || []).map((it) => typeof it === "object"
          ? `<li><b>${esc(it.field)}</b> — ${esc(it.problem)} → ${esc(it.action)}</li>` : `<li>${esc(it)}</li>`).join("")}
          ${audit.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></details>` : ""}
    </div>
  </section>`;
}

// ── 02 제도 점검 ──────────────────────────────────────────────
function stepper(group, key, value, unit, step = 1, wide = false) {
  return `<span class="stepper ${wide ? "wide" : ""}">
    <button type="button" data-step="-${step}" data-group="${group}" data-key="${esc(key)}" aria-label="감소">−</button>
    <input type="number" inputmode="decimal" min="0" step="any" value="${value}" data-group="${group}" data-key="${esc(key)}" aria-label="값" />
    <button type="button" data-step="${step}" data-group="${group}" data-key="${esc(key)}" aria-label="증가">+</button>
    ${unit ? `<span class="unit">${esc(unit)}</span>` : ""}</span>`;
}

function segmented(group, key, value, options) {
  return `<span class="seg" role="radiogroup">${options.map(([val, label, tone]) =>
    `<button type="button" role="radio" aria-checked="${val === value}" data-tone="${tone}" data-group="${group}" data-key="${esc(key)}" data-val="${esc(val)}">${esc(label)}</button>`).join("")}</span>`;
}

function control(group, chk, value) {
  if (chk.type === "number_min" || chk.type === "number_max") return stepper(group, chk.id, value, chk.unit || "");
  if (chk.type === "boolean") return segmented(group, chk.id, value, BOOL);
  if (chk.type === "posture") return segmented(group, chk.id, value, POSTURE);
  if (chk.type === "choice") {
    return `<span class="select"><select data-group="${group}" data-key="${esc(chk.id)}">${(chk.options || []).map((o) =>
      `<option ${o.label === value ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select></span>`;
  }
  return "";
}

function checkSub(chk) {
  const parts = [];
  if (chk.type === "number_min" || chk.type === "number_max") parts.push(`법정 ${chk.type === "number_min" ? "최소" : "최대"} ${esc(chk.threshold)}${esc(chk.unit || "")}`);
  if (chk.applies_if?.field === "headcount") parts.push(`직원 ${esc(chk.applies_if.op)} ${esc(chk.applies_if.value)}명 적용`);
  if (chk.legal_basis) parts.push(esc(chk.legal_basis));
  return parts.join(" · ");
}

const row = (statusKey, label, sub, ctrl) => `
  <div class="row"><div><div class="row-label">${label}</div>${sub ? `<div class="row-sub">${sub}</div>` : ""}</div>
  <div class="row-ctrl">${ctrl}<span class="row-status" data-status="${esc(statusKey)}"></span></div></div>`;

function checkHTML() {
  const { data, inp } = cur();
  const std = data.standards || {};
  const mw = std.min_wage || {};
  const n = inp.numeric;

  const cats = {};
  for (const c of data.standard_checks || []) (cats[c.category || "기타"] ||= []).push(c);

  const qs = questionsOf(inp);
  return `
  <div style="margin-bottom:28px">${privacyNotice(true)}</div>

  <section class="block">
    <div class="block-head"><span class="no">01</span><h2>사업장 규모</h2><p>직원 수에 따라 달라지는 의무를 자동 반영합니다</p></div>
    <div class="group"><div class="size-grid">
      <div class="size-input"><label>상시 직원 수</label>${stepper("headcount", "headcount", inp.headcount, "명")}
        <div class="muted">여러 사업장은 각각 점검하세요.</div></div>
      <div class="size-list" id="size-list"></div>
    </div></div>
  </section>

  <section class="block">
    <div class="block-head"><span class="no">02</span><h2>핵심 정량 항목</h2><p>기본값은 법정 기준값입니다 — 우리 회사 실제 값으로 조정하세요</p></div>
    <div class="group">
      ${row("n:std_weekly", "정규 주당 근로시간", `법정 표준 ${esc(std.standard_weekly_hours)}시간`, stepper("numeric", "std_weekly", n.std_weekly, "시간"))}
      ${row("n:max_weekly", "최대 주당 근로시간 (연장 포함)", `법정 최대 ${esc(std.max_weekly_hours_incl_overtime || "상한 없음 · 협정 방식")}`, stepper("numeric", "max_weekly", n.max_weekly, "시간"))}
      ${row("n:annual_leave", "연차 부여일수 (연)", `법정 최소 ${esc(std.annual_leave_min_days)}일`, stepper("numeric", "annual_leave", n.annual_leave, "일"))}
      ${row("n:notice_days", "해고 예고기간", `법정 ${esc(std.termination_notice_min_days || "없음 · 특수")}${std.termination_notice_min_days ? "일" : ""}`, stepper("numeric", "notice_days", n.notice_days, "일"))}
      ${row("n:monthly_wage", "월 기본급", `법정 최저임금 ${esc(fmtAmount(mw))} · 0이면 비교 생략`, stepper("numeric", "monthly_wage", n.monthly_wage, mw.currency || "", 100, true))}
    </div>
  </section>

  ${Object.keys(cats).length ? `
  <section class="block">
    <div class="block-head"><span class="no">03</span><h2>표준 항목 상세 점검</h2><p>휴게·휴가·사회보험·수습·근로계약 등 공통 항목</p></div>
    ${Object.entries(cats).map(([cat, list]) => `
      <div class="group"><div class="group-head"><h3>${esc(cat)}</h3></div>
        ${list.map((c) => row("std:" + c.id, esc(c.label), checkSub(c), control("std", c, inp.std[c.id]))).join("")}
      </div>`).join("")}
  </section>` : ""}

  <section class="block">
    <div class="block-head"><span class="no">04</span><h2>이 국가 핵심 제도</h2><p>분쟁이 잦은 항목은 별도로 표시됩니다</p></div>
    ${(data.country_specifics || []).map((item, i) => {
      const auto = (item.checks || []).some((c) => ["number_min", "number_max", "boolean", "choice"].includes(c.type));
      const fire = item.dispute_risk === "high";
      return `<details class="spec" ${i === 0 ? "open" : ""}>
        <summary><span class="t">${esc(item.name)}</span>
          ${fire ? `<span class="pill sm pill-fire">${icon("flame")}분쟁 다발</span>` : ""}
          <span class="pill sm" style="--c:var(--ink-3);--bg:var(--sunken)">${auto ? "자동 판정" : "자가 진단"}</span>
          <span class="row-status" data-status="spec-item:${i}"></span><span class="chev"></span></summary>
        <div class="spec-intro">
          ${item.detail ? `<p>${esc(item.detail)}</p>` : ""}
          ${fire ? `<div class="dispute">${icon("flame")}<div><b>분쟁 다발</b> — ${esc(item.dispute_note || "이 국가에서 직원–회사 법률 분쟁이 잦은 영역입니다.")}</div></div>` : ""}
          ${item.risk_hint ? `<div class="hint">${icon("alert")}<div><b>유의점</b> — ${esc(item.risk_hint)}</div></div>` : ""}
        </div>
        ${(item.checks || []).map((c) => row("spec:" + c.id, esc(c.label), checkSub(c), control("spec", c, inp.spec[c.id]))).join("")}
        <div class="memo"><label for="memo-${i}">추가 메모 (선택)</label>
          <textarea class="field" id="memo-${i}" rows="1" data-group="memo" data-key="${i}" placeholder="특이사항·예외 등 — 회사 식별 정보 제외">${esc(inp.memos[i] || "")}</textarea></div>
      </details>`;
    }).join("")}
  </section>

  ${(data.amendment_checks || []).length ? `
  <section class="block">
    <div class="block-head"><span class="no">05</span><h2>최근 3개년 개정 대응</h2><p>기본값은 ‘아니오(미반영)’ — 이미 반영한 항목만 바꾸세요</p></div>
    <div class="group">
      ${data.amendment_checks.map((c) => {
        const [cls, label] = TIMELINE_STATUS[c.status] || ["st-void", c.status || ""];
        return row("amend:" + c.id, `${esc(c.label)} ${label ? `<span class="pill sm ${cls}">${esc(label)}</span>` : ""}`,
          `근거 개정: ${esc(c.based_on || "")}${c.applies_if?.field === "headcount" ? ` · 직원 ${esc(c.applies_if.op)} ${esc(c.applies_if.value)}명 적용` : ""}`,
          control("amend", c, inp.amend[c.id]));
      }).join("")}
    </div>
  </section>` : ""}

  <section class="block">
    <div class="block-head"><span class="no">06</span><h2>주관식 질문</h2><p>한 줄에 하나 — 질문마다 AI에 붙여넣을 프롬프트를 만들어 드립니다</p></div>
    <div class="group">
      <div style="padding:16px 20px">
        <textarea class="field" rows="3" data-group="questions" data-key="q" placeholder="예) 포괄임금제가 이 나라에서 문제가 되나요?&#10;주 4일제 도입 시 법적으로 걸리는 부분은?">${esc(inp.questions)}</textarea>
      </div>
      <div id="q-list">${qs.map((q, i) => qItemHTML(q, i)).join("")}</div>
    </div>
  </section>`;
}

function qItemHTML(q, i) {
  const { inp } = cur();
  return `<div class="q-item" data-q="${i}">
    <h4><span class="grow">Q${i + 1}. ${esc(q)}</span>
      <button class="btn btn-sm" type="button" data-action="copy" data-q="${i}">${icon("copy")}프롬프트 복사</button></h4>
    <div class="prompt" id="prompt-${i}"></div>
    <textarea class="field" rows="2" data-group="answer" data-key="${esc(q)}" placeholder="AI 답변을 붙여넣으면 최종 리포트에 포함됩니다 (선택)">${esc(inp.answers[q] || "")}</textarea>
  </div>`;
}

// ── 03 진단 결과 ──────────────────────────────────────────────
function resultHTML() {
  const counts = R.summarize(S.findings);
  const list = S.findings
    .filter((f) => S.resultFilter === "all" || (S.resultFilter === "dispute" ? f.dispute_risk === "high" : f.level === S.resultFilter))
    .sort((a, b) => (LEVEL_ORDER[a.level] ?? 9) - (LEVEL_ORDER[b.level] ?? 9));
  const disputes = S.findings.filter((f) => f.dispute_risk === "high").length;
  const { inp } = cur();
  const qs = questionsOf(inp);
  return `
  <section class="block">
    <div class="block-head"><span class="no">03</span><h2>리스크 진단 결과</h2><span class="grow"></span>
      <button class="btn btn-sm" type="button" data-tab="check">입력 수정</button></div>
    <div class="result-summary">
      ${["high", "medium", "info", "ok"].map((l) => `<button type="button" class="r-card lv-${l}" data-filter="${l}" aria-pressed="${S.resultFilter === l}">
        <div class="k"><span class="sw"></span>${R.LEVEL_LABEL[l]}</div><div class="v">${counts[l]}</div></button>`).join("")}
    </div>
    <div class="filter-bar">
      <div class="seg" role="radiogroup" aria-label="결과 필터">
        ${[["all", `전체 ${S.findings.length}`], ["high", "위반 소지"], ["medium", "주의"], ["info", "수동확인"], ["ok", "적합"], ["dispute", `분쟁 다발 ${disputes}`]]
          .map(([k, l]) => `<button type="button" role="radio" aria-checked="${S.resultFilter === k}" data-filter="${k}">${l}</button>`).join("")}
      </div>
      <span class="grow"></span>
      <button class="btn btn-primary btn-sm" type="button" data-action="report">${icon("download")}리포트 다운로드</button>
    </div>
    <div class="findings">
      ${list.length ? list.map(findingHTML).join("") : `<div class="empty">해당 조건의 항목이 없습니다.</div>`}
    </div>
  </section>
  ${qs.length ? `
  <section class="block">
    <div class="block-head"><span class="no">+</span><h2>주관식 질문</h2><p>룰 자동 판정 대상이 아닙니다 — 생성된 프롬프트로 건별 질의하세요</p></div>
    <div class="group">${qs.map((q, i) => `<div class="row"><div class="row-label">Q${i + 1}. ${esc(q)}</div>
      <div class="row-ctrl">${(inp.answers[q] || "").trim() ? '<span class="status-txt lv-ok">답변 입력됨</span>' : '<span class="status-txt lv-info">답변 미입력</span>'}</div></div>`).join("")}</div>
  </section>` : ""}`;
}

function findingHTML(f) {
  return `<article class="finding lv-${f.level}">
    <div class="finding-top"><span class="pill sm">${R.LEVEL_LABEL[f.level]}</span><span class="finding-cat">${esc(f.category)}</span>
      ${f.dispute_risk === "high" ? `<span class="pill sm pill-fire">${icon("flame")}분쟁 다발</span>` : ""}</div>
    <h4>${esc(f.title)}</h4>
    ${f.detail ? `<p class="detail">${esc(f.detail)}</p>` : ""}
    ${f.dispute_note ? `<p class="detail" style="margin-top:6px;color:var(--high)">${esc(f.dispute_note)}</p>` : ""}
    <div class="finding-meta">
      <div><div class="k">법적 근거</div><div class="v">${esc(f.legal_basis || "—")}</div></div>
      <div><div class="k">권고</div><div class="v rec">${esc(f.recommendation || "—")}</div></div>
    </div></article>`;
}

// ── 실시간 갱신 ───────────────────────────────────────────────
function refreshLive() {
  const { data, inp } = cur();
  if (!data) return;
  S.findings = computeFindings(data, inp);
  const counts = R.summarize(S.findings);
  const total = Math.max(1, S.findings.length);
  const score = R.riskScore(counts);

  const ring = $("#ring-val");
  if (ring) {
    const C = 2 * Math.PI * 46;
    ring.style.strokeDashoffset = String(C * (1 - score / 100));
    $("#score").textContent = score;
    for (const l of ["high", "medium", "info", "ok"]) {
      $(`#bar-${l}`).style.width = `${(100 * counts[l]) / total}%`;
      $(`#cnt-${l}`).textContent = counts[l];
    }
  }
  const tn = $("#tab-n"); if (tn) tn.textContent = counts.high + counts.medium;
  const ms = $("#m-score"); if (ms) ms.textContent = score;
  const mc = $("#m-counts");
  if (mc) mc.innerHTML = ["high", "medium", "ok"].map((l) => `<span class="lv-${l}">${LEVEL_SHORT[l]} ${counts[l]}</span>`).join("");

  if (S.tab === "check") refreshRowStatuses(data, inp);
  if (S.tab === "result") { /* 결과 탭은 입력이 없으므로 탭 진입 시 렌더 */ }
}

function statusHTML(level) {
  return level ? `<span class="status-txt lv-${level}">${LEVEL_SHORT[level]}</span>` : "";
}

function refreshRowStatuses(data, inp) {
  const ctx = { headcount: inp.headcount };
  const core = R.evaluate(data, numericForRules(inp));
  const levels = {};
  for (const [k, cat] of Object.entries(NUMERIC_CATEGORY)) levels["n:" + k] = core.find((f) => f.category === cat)?.level;
  for (const c of data.standard_checks || []) levels["std:" + c.id] = R.evalCheck(c, inp.std[c.id], "", ctx)?.level;
  (data.country_specifics || []).forEach((item, i) => {
    let worst = null;
    for (const c of item.checks || []) {
      const l = R.evalCheck(c, inp.spec[c.id], "", ctx)?.level;
      levels["spec:" + c.id] = l;
      if (l && (worst === null || LEVEL_ORDER[l] < LEVEL_ORDER[worst])) worst = l;
    }
    levels["spec-item:" + i] = worst;
  });
  for (const c of data.amendment_checks || []) levels["amend:" + c.id] = R.evalCheck(c, inp.amend[c.id], "", ctx)?.level;
  $$("[data-status]").forEach((el) => { el.innerHTML = statusHTML(levels[el.dataset.status]); });

  const sl = $("#size-list");
  if (sl) {
    const rules = sizeRules(data);
    sl.innerHTML = rules.length ? rules.map((r) => {
      const on = opHolds(inp.headcount, r.op, Number(r.value));
      return `<div class="size-item"><span class="tag ${on ? "on" : "off"}">${on ? "적용 대상" : "미해당"}</span>
        <span>${esc(r.label)}${r.basis ? `<span class="basis">${esc(r.basis)}</span>` : ""}</span><span class="thr">직원 ${esc(r.op)} ${esc(r.value)}명</span></div>`;
    }).join("") : `<div class="size-item" style="grid-template-columns:1fr"><span class="muted">이 관할에는 직원 수에 따라 달라지는 규제가 별도로 등록되어 있지 않습니다. 일반 기준으로 점검됩니다.</span></div>`;
  }

  const { base, specific } = inputSummaries(data, inp);
  questionsOf(inp).forEach((q, i) => { const p = $(`#prompt-${i}`); if (p) p.textContent = buildPrompt(data, q, base, specific); });
}

// ── 이벤트 ────────────────────────────────────────────────────
function setValue(group, key, value) {
  const { inp } = cur();
  if (group === "headcount") inp.headcount = Math.max(1, value);
  else if (group === "numeric") inp.numeric[key] = value;
  else if (group === "std" || group === "spec" || group === "amend") inp[group][key] = value;
  else if (group === "memo") inp.memos[key] = value;
  else if (group === "answer") inp.answers[key] = value;
  else if (group === "questions") {
    inp.questions = value;
    const list = $("#q-list");
    if (list) list.innerHTML = questionsOf(inp).map((q, i) => qItemHTML(q, i)).join("");
  }
  refreshLive();
}

app.addEventListener("click", (e) => {
  const t = e.target.closest("button, [data-region]");
  if (!t) return;
  if (t.dataset.region) { S.homeFilter = t.dataset.region; renderHome(); return; }
  if (t.dataset.tab) { go(S.slug, t.dataset.tab); return; }
  if (t.dataset.goto === "verify") { go(S.slug, "brief"); setTimeout(() => $("#verify")?.scrollIntoView({ behavior: "smooth" }), 60); return; }
  if (t.dataset.filter) { S.resultFilter = S.resultFilter === t.dataset.filter && t.classList.contains("r-card") ? "all" : t.dataset.filter; renderPane(); return; }
  if (t.dataset.step) {
    const input = t.parentElement.querySelector("input");
    const v = Math.max(0, Math.round(((parseFloat(input.value) || 0) + parseFloat(t.dataset.step)) * 100) / 100);
    input.value = v;
    setValue(t.dataset.group, t.dataset.key, t.dataset.group === "headcount" ? Math.max(1, v) : v);
    return;
  }
  if (t.dataset.val !== undefined && t.dataset.group) {
    $$("button", t.parentElement).forEach((b) => b.setAttribute("aria-checked", String(b === t)));
    setValue(t.dataset.group, t.dataset.key, t.dataset.val);
    return;
  }
  if (t.dataset.action === "report") { downloadReport(); return; }
  if (t.dataset.action === "reset") {
    if (confirm("이 관할의 입력값을 모두 법정 기준 기본값으로 되돌릴까요?")) {
      S.inputs[S.slug] = defaultInputs(cur().data); S.resultFilter = "all"; renderPane(); refreshLive(); toast("입력값을 초기화했습니다.");
    }
    return;
  }
  if (t.dataset.action === "copy") {
    const txt = $(`#prompt-${t.dataset.q}`)?.textContent || "";
    navigator.clipboard?.writeText(txt).then(() => toast("프롬프트를 복사했습니다."), () => toast("복사하지 못했습니다. 직접 선택해 복사하세요."));
  }
});

app.addEventListener("input", (e) => {
  const t = e.target;
  if (!t.dataset.group) return;
  if (t.type === "number") {
    const v = parseFloat(t.value);
    if (!isFinite(v)) return;
    setValue(t.dataset.group, t.dataset.key, Math.max(0, v));
  } else if (t.tagName === "TEXTAREA") {
    setValue(t.dataset.group, t.dataset.key, t.value);
    t.style.height = "auto"; t.style.height = `${t.scrollHeight + 2}px`;
  }
});
app.addEventListener("change", (e) => {
  const t = e.target;
  if (t.tagName === "SELECT" && t.dataset.group) setValue(t.dataset.group, t.dataset.key, t.value);
  if (t.type === "number" && !isFinite(parseFloat(t.value))) { t.value = 0; setValue(t.dataset.group, t.dataset.key, 0); }
});
document.addEventListener("change", (e) => { if (e.target.id === "switch") go(e.target.value, S.tab); });

function downloadReport() {
  const { data, inp } = cur();
  const { base, specific } = inputSummaries(data, inp);
  const subj = questionsOf(inp).map((q) => [q, inp.answers[q] || ""]);
  const html = buildReport({ data, findings: S.findings, baseInputs: base, specificInputs: specific, subjItems: subj, headcount: inp.headcount });
  const today = new Date().toISOString().slice(0, 10);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  a.download = `compliance_report_${data.country}_${today}.html`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast("리포트를 내려받았습니다.");
}

let toastTimer;
function toast(msg) {
  const el = $("#toast"); el.textContent = msg; el.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

// ── 테마 ──────────────────────────────────────────────────────
function effectiveTheme() {
  return document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}
function paintThemeBtn() { $("#theme-btn").innerHTML = icon(effectiveTheme() === "dark" ? "sun" : "moon"); }
$("#theme-btn").addEventListener("click", () => {
  const next = effectiveTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem("ghr-theme", next); } catch { /* 저장 불가 환경 무시 */ }
  paintThemeBtn();
});

// ── 라우팅: #/ · #/jp · #/jp/check · #/jp/result ─────────────
function go(slug, tab = "brief") { location.hash = slug ? `#/${slug}${tab === "brief" ? "" : "/" + tab}` : "#/"; }

function route() {
  const [, slug, tab] = location.hash.replace(/^#/, "").split("/");
  const meta = COUNTRIES.find((c) => c.slug === slug);
  if (!meta) { S.slug = null; renderHome(); window.scrollTo(0, 0); return; }
  const newTab = ["brief", "check", "result"].includes(tab) ? tab : "brief";
  if (!S.inputs[slug]) S.inputs[slug] = defaultInputs(S.all[slug]);
  if (S.slug !== slug || !$("#pane")) {
    S.slug = slug; S.tab = newTab; S.resultFilter = "all";
    renderCountry(); window.scrollTo(0, 0);
  } else {
    S.tab = newTab;
    refreshLive();
    renderPane();
    const band = $(".band");
    if (band && window.scrollY > band.offsetHeight) window.scrollTo({ top: band.offsetHeight - 120, behavior: "smooth" });
  }
}

// ── 시작 ──────────────────────────────────────────────────────
paintThemeBtn();
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", paintThemeBtn);
app.innerHTML = `<div class="wrap muted" style="padding:120px 16px;text-align:center">법령 데이터를 불러오는 중…</div>`;
loadAll().then(() => {
  window.addEventListener("hashchange", route);
  route();
}).catch((err) => {
  app.innerHTML = `<div class="wrap" style="padding:100px 16px"><div class="notice"><div class="notice-icon">${icon("alert")}</div><div>
    <h4>법령 데이터를 불러오지 못했습니다</h4>
    <ul><li>${esc(err.message)}</li><li>파일을 더블클릭해 연 경우 브라우저가 데이터 읽기를 막습니다. 저장소 폴더에서 <b>python -m http.server</b> 실행 후 <b>http://localhost:8000/web/</b> 로 여세요.</li></ul></div></div></div>`;
});
