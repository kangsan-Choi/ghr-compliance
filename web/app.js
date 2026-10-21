/**
 * Global ER Compliance — 프론트엔드 (빌드 도구 없는 일반 스크립트)
 * ─────────────────────────────────────────
 * 흐름: 홈(관할 선택) → 국가 작업공간
 *   [개요] · [HR 카테고리 7개: 법정 기준 → 최근 개정·판례 → 우리 회사 점검 → 판정] · [종합 결과·리포트]
 * 모든 항목의 기본값은 '미응답'. 답하는 즉시 rules.js 로 재판정하고 좌측 요약·진행률·행별 상태를 갱신한다.
 * 입력값은 서버로 보내지 않고 브라우저 메모리에만 둔다(새로고침 시 초기화).
 *
 * 법령 데이터는 data.js(window.GHR_DATA)에서 읽는다 — 파일을 더블클릭해 열어도(file://) 동작하도록
 * 모듈·fetch 를 쓰지 않는다. data/*.json 을 고치면 python tools/sync_web_data.py 로 data.js 를 갱신.
 */
(function () {
"use strict";
const R = window.GHRRules;
const { buildReport, buildPrompt, fmtAmount } = window.GHRReport;

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
const DOMAIN = Object.fromEntries(R.DOMAINS.map((d, i) => [d.key, { ...d, no: String(i + 1).padStart(2, "0") }]));

const TIMELINE_STATUS = {
  "시행 중": ["st-live", "시행 중"],
  "시행 확정(예정)": ["st-fixed", "시행 확정"],
  "추진 중(미확정)": ["st-pending", "추진 중 · 미확정"],
  "정정 필요(미시행)": ["st-void", "미시행 · 정정"],
  "정정 필요": ["st-void", "정정"],
};
const CONF = { high: ["높음", ""], medium: ["보통", "medium"], low: ["낮음", "low"] };
const POSTURE = [
  ["점검 완료 · 문제 없음", "문제 없음", "good"],
  ["점검했으나 미흡/리스크 있음", "미흡", "warn"],
  ["미점검 / 모름", "모름", ""],
  ["해당 없음", "해당 없음", ""],
];
const BOOL = [["예", "예", "good"], ["아니오", "아니오", "bad"], ["해당 없음", "해당 없음", ""]];
const ROW_FILTERS = [["all", "전체"], ["todo", "미응답"], ["risk", "위반·주의"], ["amend", "최근 개정"], ["dispute", "분쟁 다발"]];

const ICON = {
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
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
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  report: '<path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20V3.5Z"/><path d="M14 3.5V8h4M10 12h5M10 15.5h5"/>',
  pin: '<path d="M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/>',
};
const icon = (n, cls = "") => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const isBlank = (v) => v === null || v === undefined || v === "";

// ── 상태 ──────────────────────────────────────────────────────
const S = {
  all: {},          // slug → data
  inputs: {},       // slug → { headcount, answers, memos, questions, replies }
  slug: null,
  view: "overview", // overview | <domain key> | result
  homeFilter: "all",
  rowFilter: "all",
  resultFilter: "all",
  ev: null,         // 최근 판정 결과 (R.evaluateAll)
};
const app = $("#app");

function loadAll() {
  const bundle = window.GHR_DATA;
  if (!bundle) throw new Error("data.js 를 찾지 못했습니다. python tools/sync_web_data.py 를 실행하세요.");
  for (const c of COUNTRIES) {
    if (!bundle[c.file]) throw new Error(`data.js 에 ${c.file} 이 없습니다. python tools/sync_web_data.py 를 실행하세요.`);
    S.all[c.slug] = bundle[c.file];
  }
}
const newInputs = () => ({ headcount: 50, answers: {}, memos: {}, questions: "", replies: {} });
const cur = () => ({ meta: COUNTRIES.find((c) => c.slug === S.slug), data: S.all[S.slug], inp: S.inputs[S.slug] });
const questionsOf = (inp) => inp.questions.split("\n").map((q) => q.trim()).filter(Boolean);

function evaluate() {
  const { data, inp } = cur();
  S.ev = R.evaluateAll(data, inp.answers, { headcount: inp.headcount });
  return S.ev;
}

// ── 자가점검(데이터 신선도·정합성) ──────────────────────────────
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

// ── 공통 조각 ─────────────────────────────────────────────────
const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } };
const amountTxt = (mw) => (typeof mw?.amount === "number" ? mw.amount.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—");
const confBadge = (v) => {
  const [txt, cls] = CONF[v?.confidence] || ["미검증", "none"];
  return `<span class="conf"><span class="dot ${cls}"></span>신뢰도 ${txt}</span>`;
};
const statusPill = (status) => {
  if (!status) return "";
  const [cls, label] = TIMELINE_STATUS[status] || ["st-void", status];
  return `<span class="pill sm ${cls}">${esc(label)}</span>`;
};
const domTag = (key) => (DOMAIN[key] ? `<span class="dom-tag">${DOMAIN[key].name}</span>` : "");
function setTopbar(html) { $("#topbar-slot").innerHTML = html; }

// ══════════════════════════════════════════════════════════════
// 홈
// ══════════════════════════════════════════════════════════════
function renderHome() {
  const datas = COUNTRIES.map((c) => S.all[c.slug]);
  const asOf = datas.map((d) => d.as_of || "").sort().pop();
  const verified = datas.map((d) => d.verification?.last_verified || "").sort().pop();
  const checks = datas.reduce((n, d) => n + R.checkList(d).length, 0);
  setTopbar(`<span class="chip-meta"><span class="dot"></span>데이터 기준 ${esc(asOf)} · 검증 ${esc(verified)}</span>`);
  document.title = "Global ER Compliance";

  app.innerHTML = `
  <section class="hero">
    <div class="wrap fade-in">
      <div class="eyebrow">Global Employee Relations · Compliance Review</div>
      <h1>해외 사업장의 노동법 리스크를<br/><em>한 화면에서</em> 진단합니다.</h1>
      <p class="lead">채용부터 퇴직까지 7개 HR 영역으로 나눠, 각국 법정 기준·최근 개정·분쟁이 잦은 제도를 우리 회사 운영 기준과 나란히 비교합니다.
        답하는 즉시 판정되며, 결과는 보고용 리포트로 내려받을 수 있습니다.</p>
      <div class="hero-stats">
        <div class="hero-stat"><b>${COUNTRIES.length}</b><span>관할(국가·도시)</span></div>
        <div class="hero-stat"><b>${checks}</b><span>자동 판정 점검 항목</span></div>
        <div class="hero-stat"><b>${esc(verified.slice(2).replaceAll("-", "."))}</b><span>최종 법령 검증일</span></div>
      </div>
    </div>
  </section>

  <div class="wrap">
    <section class="section" style="padding-top:36px">${privacyNotice(false)}</section>

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
      <div class="section-head"><div><div class="eyebrow">Framework</div><h2>7개 HR 영역으로 점검합니다</h2></div></div>
      <div class="framework">
        ${R.DOMAINS.map((d, i) => `<div class="fw-item"><span class="num">${String(i + 1).padStart(2, "0")}</span><h3>${d.name}</h3><p>${d.desc}</p></div>`).join("")}
        <div class="fw-item fw-note"><span class="num">＋</span><h3>최근 개정 · 분쟁 다발</h3><p>영역마다 최근 3개년 개정과 노사분쟁이 잦은 제도를 따로 표시합니다.</p></div>
      </div>
    </section>
  </div>`;
}

function countryCard(c) {
  const d = S.all[c.slug];
  const std = d.standards || {};
  const mw = std.min_wage || {};
  const v = d.verification || {};
  return `
  <a class="c-card fade-in" href="#/${c.slug}">
    <div class="c-top"><span class="c-code">${c.code}</span><span class="c-region">${REGION_LABEL[c.region]}</span></div>
    <div class="c-name">${esc(d.country)}</div>
    <div class="c-city">${esc(d.city)}${c.sub ? ` · ${esc(c.sub)}` : ""}</div>
    <div class="c-facts">
      <div class="c-fact"><span>최저임금</span><b>${typeof mw.amount === "number" ? `${amountTxt(mw)} ${esc(mw.currency)}/${esc(mw.period)}` : "—"}</b></div>
      <div class="c-fact"><span>법정 주 근로시간</span><b>${esc(std.standard_weekly_hours ?? "—")}시간</b></div>
      <div class="c-fact"><span>점검 항목</span><b>${R.checkList(d).length}개</b></div>
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
    </div>
  </section>
  <div class="wrap">
    <div class="ws">
      <aside class="side" aria-label="점검 내비게이션">
        <div class="panel side-risk">
          <div class="eyebrow">Risk Index</div>
          <div class="side-score"><b id="score">–</b><span>/ 100</span></div>
          <p class="side-sub" id="score-sub">답한 항목이 판정되면 계산됩니다</p>
          <div class="prog"><i id="prog-bar"></i></div>
          <div class="side-prog"><span>응답 진행률</span><b id="prog-txt">0 / 0</b></div>
          <div class="side-counts" id="side-counts"></div>
          <div class="side-hc"><label>상시 직원 수</label>${stepperHTML("headcount", "headcount", inp.headcount, "명", { placeholder: "" })}</div>
          <button class="btn btn-primary btn-block" type="button" data-action="report">${icon("download")}최종 리포트 다운로드</button>
        </div>
        <nav class="navlist" id="navlist">${navHTML()}</nav>
        <button class="btn btn-ghost btn-sm side-reset" type="button" data-action="reset">${icon("refresh")}이 관할 응답 초기화</button>
      </aside>
      <div id="pane" class="pane"></div>
    </div>
  </div>
  <div class="mbar">
    <div class="score"><span id="m-score">–</span><small> /100</small></div>
    <div class="counts" id="m-counts"></div>
    <button class="btn btn-primary btn-sm" type="button" data-action="report">${icon("download")}리포트</button>
  </div>`;
  evaluate();
  renderPane();
}

function navHTML() {
  const item = (view, label, lead, extra = "") =>
    `<a class="nav-item" href="#/${S.slug}${view === "overview" ? "" : "/" + view}" data-view="${view}" aria-current="${S.view === view ? "page" : "false"}">
      <span class="nav-lead">${lead}</span><span class="nav-label">${label}</span>${extra}</a>`;
  return item("overview", "개요", icon("grid"))
    + `<div class="nav-sep">HR 영역</div>`
    + R.DOMAINS.map((d) => item(d.key, d.name, `<span class="nav-no">${DOMAIN[d.key].no}</span>`,
      `<span class="nav-meta" data-nav="${d.key}"></span>`)).join("")
    + `<div class="nav-sep"></div>`
    + item("result", "종합 결과 · 리포트", icon("report"), `<span class="nav-meta" data-nav="result"></span>`);
}

function renderPane() {
  const pane = $("#pane");
  if (!pane) return;
  $$(".nav-item").forEach((a) => a.setAttribute("aria-current", a.dataset.view === S.view ? "page" : "false"));
  pane.classList.remove("fade-in"); void pane.offsetWidth; pane.classList.add("fade-in");
  pane.innerHTML = S.view === "overview" ? overviewHTML() : S.view === "result" ? resultHTML() : domainHTML(S.view);
  refreshLive();
  $(`.nav-item[aria-current="page"]`)?.scrollIntoView({ block: "nearest", inline: "center" });
}

// ── 개요 ──────────────────────────────────────────────────────
function overviewHTML() {
  const { data } = cur();
  const std = data.standards || {};
  const mw = std.min_wage || {};
  const v = data.verification || {};
  const audit = selfAudit(data);
  const stat = (k, val, unit, s = "") => `<div class="stat"><div class="k">${k}</div><div class="v">${val}${unit ? `<small>${unit}</small>` : ""}</div>${s ? `<div class="s">${s}</div>` : ""}</div>`;
  const tl = [...(data.amendment_timeline || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return `
  <section class="block">
    <div class="block-head"><h2 class="serif-h">카테고리별 현황</h2><p>영역을 눌러 점검을 시작하세요. 답한 항목만 판정됩니다.</p></div>
    <div class="dom-grid" id="dom-grid">${R.DOMAINS.map((d) => domCardHTML(d.key)).join("")}</div>
  </section>

  <section class="block">
    <div class="block-head"><h2 class="serif-h">핵심 법정 기준</h2></div>
    <div class="stats">
      ${stat("법정 주 근로시간", esc(std.standard_weekly_hours ?? "—"), "시간")}
      ${stat("주 최대 (연장 포함)", std.max_weekly_hours_incl_overtime ? esc(std.max_weekly_hours_incl_overtime) : "—", std.max_weekly_hours_incl_overtime ? "시간" : "", std.max_weekly_hours_incl_overtime ? "" : "상한 없음 · 협정 방식")}
      ${stat("최저임금", amountTxt(mw), `${esc(mw.currency || "")}/${esc(mw.period || "")}`, esc(mw.locality || ""))}
      ${stat("법정 최소 연차", std.annual_leave_min_days ? esc(std.annual_leave_min_days) : "—", std.annual_leave_min_days ? "일" : "", std.annual_leave_min_days ? "" : "법정 의무 없음")}
      ${stat("해고 예고", std.termination_notice_min_days ? esc(std.termination_notice_min_days) : "—", std.termination_notice_min_days ? "일" : "", std.termination_notice_min_days ? "" : "없음 · 특수(at-will 등)")}
    </div>
  </section>

  <section class="block">
    <div class="block-head"><h2 class="serif-h">사업장 규모별 적용 의무</h2><p>좌측 ‘상시 직원 수’ 기준으로 자동 판정합니다</p></div>
    <div class="group"><div class="size-list" id="size-list"></div></div>
  </section>

  <section class="block">
    <div class="block-head"><h2 class="serif-h">최근 개정 동향</h2><p>확정 여부 포함 · 최신순</p></div>
    <ol class="timeline">${tl.map(timelineItemHTML).join("")}</ol>
  </section>

  <section class="block" id="verify">
    <div class="block-head"><h2 class="serif-h">데이터 검증 기록</h2></div>
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
      <details class="issues"><summary>${icon("ext")}1차 출처 ${(data.sources || []).length}건</summary>
        <ul class="src-list">${(data.sources || []).map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a> <span class="muted">${esc(host(s.url))}</span></li>`).join("")}</ul></details>
    </div>
  </section>`;
}

function domCardHTML(key) {
  const d = DOMAIN[key];
  return `<a class="dom-card" href="#/${S.slug}/${key}" data-domcard="${key}">
    <div class="dom-card-top"><span class="dom-no">${d.no}</span><span class="dom-state" data-domstate="${key}"></span></div>
    <h3>${d.name}</h3><p>${d.desc}</p>
    <div class="prog sm"><i data-domprog="${key}"></i></div>
    <div class="dom-card-foot"><span data-domtxt="${key}"></span><span class="c-go">${icon("arrow")}</span></div>
  </a>`;
}

function timelineItemHTML(a) {
  const [cls] = TIMELINE_STATUS[a.status] || ["st-void"];
  return `<li class="tl ${cls}"><div class="tl-date">${esc(a.date)}</div><div class="tl-body">
    <h4>${esc(a.title)} ${statusPill(a.status)} ${S.view === "overview" ? domTag(a.domain) : ""}</h4>
    <p>${esc(a.impact)}</p>${a.effective_date ? `<div class="eff">발효 ${esc(a.effective_date)}</div>` : ""}</div></li>`;
}

// ── HR 카테고리 ───────────────────────────────────────────────
function stepperHTML(group, key, value, unit, { step = 1, placeholder = "", wide = false } = {}) {
  return `<span class="stepper ${wide ? "wide" : ""}">
    <button type="button" data-step="-${step}" data-group="${group}" data-key="${esc(key)}" aria-label="감소">−</button>
    <input type="number" inputmode="decimal" min="0" step="any" value="${isBlank(value) ? "" : value}" placeholder="${esc(placeholder)}" data-group="${group}" data-key="${esc(key)}" aria-label="값" />
    <button type="button" data-step="${step}" data-group="${group}" data-key="${esc(key)}" aria-label="증가">+</button>
    ${unit ? `<span class="unit">${esc(unit)}</span>` : ""}</span>`;
}

function segmentedHTML(key, value, options) {
  return `<span class="seg" role="radiogroup">${options.map(([val, label, tone]) =>
    `<button type="button" role="radio" aria-checked="${val === value}" data-tone="${tone}" data-group="ans" data-key="${esc(key)}" data-val="${esc(val)}">${esc(label)}</button>`).join("")}</span>`;
}

function controlHTML(entry, value) {
  const c = entry.chk;
  if (c.type === "core") {
    const ph = c.legal === null || c.legal === undefined ? "입력" : `법정 ${c.legal}`;
    return stepperHTML("ans", entry.key, value, c.unit, { step: c.step || 1, placeholder: ph, wide: c.id === "monthly_wage" });
  }
  if (c.type === "number_min" || c.type === "number_max") return stepperHTML("ans", entry.key, value, c.unit || "", { placeholder: `법정 ${c.threshold}` });
  if (c.type === "boolean") return segmentedHTML(entry.key, value, BOOL);
  if (c.type === "posture") return segmentedHTML(entry.key, value, POSTURE);
  if (c.type === "choice") {
    return `<span class="select"><select data-group="ans" data-key="${esc(entry.key)}"><option value="">선택</option>${(c.options || []).map((o) =>
      `<option ${o.label === value ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select></span>`;
  }
  return "";
}

function subHTML(entry) {
  const c = entry.chk;
  const std = cur().data.standards || {};
  const parts = [];
  if (c.type === "core") {
    if (c.id === "std_weekly") parts.push(`법정 표준 ${esc(c.legal)}시간`);
    if (c.id === "max_weekly") parts.push(`법정 최대 ${esc(c.legal ?? "상한 없음 · 협정 방식")}`);
    if (c.id === "annual_leave") parts.push(c.legal ? `법정 최소 ${esc(c.legal)}일` : "법정 연차 의무 없음");
    if (c.id === "notice_days") parts.push(c.legal ? `법정 ${esc(c.legal)}일` : "법정 예고기간 없음 · 특수");
    if (c.id === "monthly_wage") parts.push(`법정 최저임금 ${esc(fmtAmount(std.min_wage))}`);
  }
  if (c.type === "number_min" || c.type === "number_max") parts.push(`법정 ${c.type === "number_min" ? "최소" : "최대"} ${esc(c.threshold)}${esc(c.unit || "")}`);
  if (c.applies_if?.field === "headcount") parts.push(`<span class="hc-rule">직원 ${esc(c.applies_if.op)} ${esc(c.applies_if.value)}명 적용</span>`);
  if (c.legal_basis) parts.push(esc(c.legal_basis));
  return parts.join(" · ");
}

function rowHTML(entry) {
  const { inp } = cur();
  const c = entry.chk;
  const badges = [
    entry.source === "amend" ? `<span class="pill sm st-fixed">${icon("pin")}최근 개정</span>${statusPill(c.status)}` : "",
    entry.item?.dispute_risk === "high" && entry.source !== "spec" ? `<span class="pill sm pill-fire">${icon("flame")}분쟁 다발</span>` : "",
  ].join("");
  return `<div class="row" data-row="${esc(entry.key)}" data-amend="${entry.source === "amend"}" data-dispute="${entry.item?.dispute_risk === "high"}">
    <div><div class="row-label">${esc(c.label)} ${badges}</div>
      ${entry.source === "amend" && c.based_on ? `<div class="row-sub">근거 개정: ${esc(c.based_on)}</div>` : ""}
      <div class="row-sub">${subHTML(entry)}</div></div>
    <div class="row-ctrl">${controlHTML(entry, inp.answers[entry.key])}<span class="row-status" data-status="${esc(entry.key)}"></span></div></div>`;
}

function domainHTML(key) {
  const { data, inp } = cur();
  const d = DOMAIN[key];
  const idx = R.DOMAINS.findIndex((x) => x.key === key);
  const prev = R.DOMAINS[idx - 1];
  const next = R.DOMAINS[idx + 1];
  const list = R.checkList(data).filter((e) => e.domain === key);
  const std = data.standards || {};
  const brief = data.domain_briefs?.[key];

  const fields = R.STANDARD_FIELDS.filter(([f, dom]) => dom === key && std[f] !== undefined && std[f] !== null && std[f] !== "");
  const fieldVal = (f, unit) => {
    if (f === "min_wage") return `${esc(fmtAmount(std.min_wage))}${std.min_wage?.note ? `<div class="muted" style="margin-top:4px">${esc(std.min_wage.note)}</div>` : ""}`;
    return esc(std[f]) + (unit && typeof std[f] === "number" ? unit : "");
  };
  const timeline = (data.amendment_timeline || []).filter((a) => a.domain === key).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const precedents = (data.precedents || []).filter((p) => p.domain === key);

  const core = list.filter((e) => e.source === "core");
  const stdByCat = {};
  for (const e of list.filter((x) => x.source === "std")) (stdByCat[e.chk.category || "기타"] ||= []).push(e);
  const specItems = [];
  for (const e of list.filter((x) => x.source === "spec")) {
    let g = specItems.find((s) => s.index === e.itemIndex);
    if (!g) specItems.push(g = { index: e.itemIndex, item: e.item, entries: [] });
    g.entries.push(e);
  }
  const amend = list.filter((e) => e.source === "amend");

  return `
  <header class="dom-head">
    <div class="eyebrow">HR Category ${d.no}</div>
    <h2>${d.name}</h2>
    <p>${d.desc}</p>
    <div class="dom-head-bar">
      <div class="dom-prog"><div class="prog"><i data-domprog="${key}"></i></div><span data-domtxt="${key}"></span></div>
      <div class="seg" role="radiogroup" aria-label="항목 필터">
        ${ROW_FILTERS.map(([k, l]) => `<button type="button" role="radio" data-rowfilter="${k}" aria-checked="${S.rowFilter === k}">${l}</button>`).join("")}
      </div>
    </div>
  </header>

  <section class="block">
    <div class="block-head"><span class="no">A</span><h2>법정 기준</h2></div>
    <div class="law-card">
      ${brief ? `<p class="lead-note">${esc(brief)}</p>` : ""}
      ${fields.length ? `<dl class="deflist flat">${fields.map(([f, , label, unit]) => `<div><dt>${label}</dt><dd>${fieldVal(f, unit)}</dd></div>`).join("")}</dl>` : ""}
      ${!brief && !fields.length ? `<p class="muted" style="margin:0">이 영역의 요약 정보가 아직 없습니다.</p>` : ""}
    </div>
  </section>

  ${timeline.length || precedents.length ? `
  <section class="block">
    <div class="block-head"><span class="no">B</span><h2>최근 개정 · 판례</h2></div>
    ${timeline.length ? `<ol class="timeline">${timeline.map(timelineItemHTML).join("")}</ol>` : ""}
    ${precedents.length ? `<div class="cards-2" style="margin-top:${timeline.length ? 8 : 0}px">${precedents.map((p) => `<article class="case"><h4>${esc(p.title)}</h4><dl>
      <div><dt>쟁점</dt><dd>${esc(p.issue)}</dd></div><div><dt>시사점</dt><dd>${esc(p.implication)}</dd></div></dl></article>`).join("")}</div>` : ""}
  </section>` : ""}

  <section class="block">
    <div class="block-head"><span class="no">C</span><h2>우리 회사 점검</h2><p>${list.length}개 항목 · 모르는 항목은 비워 두세요</p></div>
    <div style="margin-bottom:14px">${privacyNotice(true)}</div>
    <div id="rows">
    ${core.length ? `<div class="group"><div class="group-head"><h3>핵심 수치</h3><span class="muted">법정 기준값과 직접 비교</span></div>${core.map(rowHTML).join("")}</div>` : ""}
    ${Object.entries(stdByCat).map(([cat, es]) => `<div class="group"><div class="group-head"><h3>${esc(cat)}</h3></div>${es.map(rowHTML).join("")}</div>`).join("")}
    ${specItems.map((g) => specHTML(g)).join("")}
    ${amend.length ? `<div class="group"><div class="group-head"><h3>최근 개정 대응</h3><span class="muted">최근 3개년 개정·판례 반영 여부</span></div>${amend.map(rowHTML).join("")}</div>` : ""}
    <div class="empty filter-empty" hidden>조건에 맞는 항목이 없습니다.</div>
    </div>
  </section>

  <section class="block">
    <div class="block-head"><span class="no">D</span><h2>이 영역 판정</h2></div>
    <div class="findings" id="dom-findings"></div>
  </section>

  <nav class="pager">
    ${prev ? `<a class="btn" href="#/${S.slug}/${prev.key}">${icon("back")}${DOMAIN[prev.key].no} ${prev.name}</a>` : `<a class="btn" href="#/${S.slug}">${icon("back")}개요</a>`}
    ${next ? `<a class="btn btn-primary" href="#/${S.slug}/${next.key}">${DOMAIN[next.key].no} ${next.name}${icon("arrow")}</a>` : `<a class="btn btn-primary" href="#/${S.slug}/result">종합 결과 보기${icon("arrow")}</a>`}
  </nav>`;
}

function specHTML(g) {
  const { inp } = cur();
  const item = g.item;
  const fire = item.dispute_risk === "high";
  return `<details class="spec" data-spec="${g.index}" data-dispute="${fire}" open>
    <summary><span class="t">${esc(item.name)}</span>
      ${fire ? `<span class="pill sm pill-fire">${icon("flame")}분쟁 다발</span>` : ""}
      <span class="pill sm" style="--c:var(--ink-3);--bg:var(--sunken)">국가 특유 제도</span><span class="chev"></span></summary>
    <div class="spec-intro">
      ${item.detail ? `<p>${esc(item.detail)}</p>` : ""}
      ${fire ? `<div class="dispute">${icon("flame")}<div><b>분쟁 다발</b> — ${esc(item.dispute_note || "이 국가에서 직원–회사 법률 분쟁이 잦은 영역입니다.")}</div></div>` : ""}
      ${item.risk_hint ? `<div class="hint">${icon("alert")}<div><b>유의점</b> — ${esc(item.risk_hint)}</div></div>` : ""}
    </div>
    ${g.entries.map(rowHTML).join("")}
    <div class="memo"><label for="memo-${g.index}">메모 (선택)</label>
      <textarea class="field" id="memo-${g.index}" rows="1" data-group="memo" data-key="${g.index}" placeholder="특이사항·예외 등 — 회사 식별 정보 제외">${esc(inp.memos[g.index] || "")}</textarea></div>
  </details>`;
}

// ── 종합 결과 ─────────────────────────────────────────────────
function resultHTML() {
  const { inp } = cur();
  const qs = questionsOf(inp);
  return `
  <header class="dom-head">
    <div class="eyebrow">Summary</div>
    <h2>종합 결과 · 리포트</h2>
    <p>응답한 항목의 판정을 영역별로 모았습니다. 리스크 지수는 판정된 항목(위반·주의·적합)만으로 계산합니다.</p>
  </header>

  <section class="block">
    <div class="result-summary" id="r-cards"></div>
    <div class="group"><div class="group-head"><h3>영역별 진행 · 판정</h3><span class="grow"></span>
      <button class="btn btn-primary btn-sm" type="button" data-action="report">${icon("download")}리포트 다운로드</button></div>
      <div id="r-table"></div></div>
  </section>

  <section class="block">
    <div class="block-head"><h2 class="serif-h">판정 상세</h2><span class="grow"></span>
      <div class="seg" role="radiogroup" aria-label="결과 필터">
        ${[["all", "전체"], ["high", "위반 소지"], ["medium", "주의"], ["ok", "적합"], ["info", "참고"], ["dispute", "분쟁 다발"]]
          .map(([k, l]) => `<button type="button" role="radio" aria-checked="${S.resultFilter === k}" data-filter="${k}">${l}</button>`).join("")}
      </div></div>
    <div id="r-findings"></div>
  </section>

  <section class="block">
    <div class="block-head"><h2 class="serif-h">추가 검토 질문</h2><p>한 줄에 하나 — 질문마다 AI에 붙여넣을 프롬프트를 만들어 드립니다</p></div>
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
    <textarea class="field" rows="2" data-group="reply" data-key="${esc(q)}" placeholder="AI 답변을 붙여넣으면 최종 리포트에 포함됩니다 (선택)">${esc(inp.replies[q] || "")}</textarea>
  </div>`;
}

function findingHTML(f) {
  return `<article class="finding lv-${f.level}">
    <div class="finding-top"><span class="pill sm">${R.LEVEL_LABEL[f.level]}</span><span class="finding-cat">${esc(f.category)}</span>
      ${f.source === "amend" ? `<span class="pill sm st-fixed">${icon("pin")}최근 개정</span>` : ""}
      ${f.dispute_risk === "high" ? `<span class="pill sm pill-fire">${icon("flame")}분쟁 다발</span>` : ""}</div>
    <h4>${esc(f.title)}</h4>
    ${f.detail ? `<p class="detail">${esc(f.detail)}</p>` : ""}
    ${f.dispute_note && f.level !== "ok" ? `<p class="detail" style="margin-top:6px;color:var(--high)">${esc(f.dispute_note)}</p>` : ""}
    <div class="finding-meta">
      <div><div class="k">법적 근거</div><div class="v">${esc(f.legal_basis || "—")}</div></div>
      <div><div class="k">권고</div><div class="v rec">${esc(f.recommendation || "—")}</div></div>
    </div></article>`;
}

// ── 실시간 갱신 ───────────────────────────────────────────────
const LEVEL_SHORT = { high: "위반 소지", medium: "주의", ok: "적합", info: "참고" };
const sortFindings = (fs) => [...fs].sort((a, b) => R.LEVEL_ORDER[a.level] - R.LEVEL_ORDER[b.level]);

function domainStats(ev, key) {
  const fs = ev.shown.filter((f) => f.domain === key);
  return { ...R.summarize(fs), ...ev.progress[key] };
}

function refreshLive() {
  const { data, inp } = cur();
  if (!data) return;
  const ev = evaluate();
  const counts = R.summarize(ev.shown);
  const score = R.riskScore(counts);
  const judged = counts.high + counts.medium + counts.ok;

  // 좌측 요약 · 모바일 바
  const setTxt = (sel, t) => { const el = $(sel); if (el) el.textContent = t; };
  setTxt("#score", score ?? "–");
  setTxt("#m-score", score ?? "–");
  setTxt("#score-sub", judged ? `판정 ${judged}개 항목 기준` : "답한 항목이 판정되면 계산됩니다");
  setTxt("#prog-txt", `${ev.answered} / ${ev.total}`);
  const pb = $("#prog-bar"); if (pb) pb.style.width = `${(100 * ev.answered) / Math.max(1, ev.total)}%`;
  const sc = $("#side-counts");
  if (sc) sc.innerHTML = ["high", "medium", "ok", "info"].map((l) => `<span class="lv-${l}"><span class="sw"></span>${LEVEL_SHORT[l]} <b>${counts[l]}</b></span>`).join("");
  const mc = $("#m-counts");
  if (mc) mc.innerHTML = `<span style="--c:var(--ink-3)">응답 ${ev.answered}/${ev.total}</span>` + ["high", "medium"].map((l) => `<span class="lv-${l}">${LEVEL_SHORT[l]} ${counts[l]}</span>`).join("");

  // 내비게이션 · 개요 카드 · 영역 진행률
  for (const d of R.DOMAINS) {
    const st = domainStats(ev, d.key);
    const risk = st.high ? `<span class="nb lv-high">${st.high}</span>` : st.medium ? `<span class="nb lv-medium">${st.medium}</span>` : "";
    const done = st.total && st.answered === st.total;
    $$(`[data-nav="${d.key}"]`).forEach((el) => { el.innerHTML = `${risk}<span class="nav-frac ${done ? "done" : ""}">${st.answered}/${st.total}</span>`; });
    $$(`[data-domprog="${d.key}"]`).forEach((el) => { el.style.width = `${(100 * st.answered) / Math.max(1, st.total)}%`; });
    $$(`[data-domtxt="${d.key}"]`).forEach((el) => { el.textContent = `응답 ${st.answered} / ${st.total}`; });
    $$(`[data-domstate="${d.key}"]`).forEach((el) => {
      el.innerHTML = st.high + st.medium + st.ok + st.info === 0 ? `<span class="muted">미착수</span>`
        : [["high", st.high], ["medium", st.medium], ["ok", st.ok]].filter(([, n]) => n).map(([l, n]) => `<span class="status-txt lv-${l}">${LEVEL_SHORT[l]} ${n}</span>`).join("") || `<span class="muted">참고만</span>`;
    });
  }
  $$('[data-nav="result"]').forEach((el) => { el.innerHTML = counts.high ? `<span class="nb lv-high">${counts.high}</span>` : ""; });

  // 행별 상태
  for (const el of $$("[data-status]")) {
    const f = ev.byKey[el.dataset.status];
    const row = el.closest(".row");
    if (row) {
      row.dataset.state = f ? f.level : "todo";
      row.classList.toggle("na", !!(f && f.auto));
    }
    el.innerHTML = f ? `<span class="status-txt lv-${f.level}">${f.auto ? "미해당" : LEVEL_SHORT[f.level]}</span>` : `<span class="status-txt todo">미응답</span>`;
  }
  applyRowFilter();

  // 규모별 적용 의무
  const sl = $("#size-list");
  if (sl) {
    const rules = ev.list.filter((e) => e.chk.applies_if?.field === "headcount");
    sl.innerHTML = rules.length ? rules.map((e) => {
      const on = R.checkApplies(e.chk, { headcount: inp.headcount });
      return `<a class="size-item" href="#/${S.slug}/${e.domain}"><span class="tag ${on ? "on" : "off"}">${on ? "적용 대상" : "미해당"}</span>
        <span>${esc(e.chk.label)}<span class="basis">${DOMAIN[e.domain].name} · ${esc(e.chk.legal_basis || "")}</span></span><span class="thr">직원 ${esc(e.chk.applies_if.op)} ${esc(e.chk.applies_if.value)}명</span></a>`;
    }).join("") : `<div class="size-item" style="grid-template-columns:1fr"><span class="muted">이 관할에는 직원 수에 따라 달라지는 의무가 별도로 등록되어 있지 않습니다.</span></div>`;
  }

  // 영역 판정 목록
  const df = $("#dom-findings");
  if (df) {
    const fs = sortFindings(ev.shown.filter((f) => f.domain === S.view));
    df.innerHTML = fs.length ? fs.map(findingHTML).join("") : `<div class="empty">아직 답한 항목이 없습니다. 위에서 우리 회사 현황을 선택하면 바로 판정됩니다.</div>`;
  }

  // 종합 결과
  if (S.view === "result") renderResultParts(ev, counts);
  if ($("#q-list")) questionsOf(inp).forEach((q, i) => { const p = $(`#prompt-${i}`); if (p) p.textContent = buildPrompt(data, q, ev, inp.answers, inp.headcount); });
}

function renderResultParts(ev, counts) {
  const rc = $("#r-cards");
  if (rc) rc.innerHTML = ["high", "medium", "ok", "info"].map((l) => `<button type="button" class="r-card lv-${l}" data-filter="${l}" aria-pressed="${S.resultFilter === l}">
    <div class="k"><span class="sw"></span>${R.LEVEL_LABEL[l]}</div><div class="v">${counts[l]}</div></button>`).join("");
  const rt = $("#r-table");
  if (rt) {
    rt.innerHTML = R.DOMAINS.map((d) => {
      const st = domainStats(ev, d.key);
      return `<a class="r-row" href="#/${S.slug}/${d.key}"><span class="nav-no">${DOMAIN[d.key].no}</span><span class="r-name">${d.name}</span>
        <span class="prog sm"><i style="width:${(100 * st.answered) / Math.max(1, st.total)}%"></i></span><span class="r-frac">${st.answered}/${st.total}</span>
        <span class="r-counts">${[["high", st.high], ["medium", st.medium], ["ok", st.ok]].map(([l, n]) => `<span class="lv-${l}" style="color:var(--c)">${n || "·"}</span>`).join("")}</span></a>`;
    }).join("") + `<div class="r-legend"><span class="lv-high" style="color:var(--c)">위반</span> · <span class="lv-medium" style="color:var(--c)">주의</span> · <span class="lv-ok" style="color:var(--c)">적합</span></div>`;
  }
  const rf = $("#r-findings");
  if (rf) {
    const fs = ev.shown.filter((f) => S.resultFilter === "all" || (S.resultFilter === "dispute" ? f.dispute_risk === "high" : f.level === S.resultFilter));
    rf.innerHTML = fs.length ? R.DOMAINS.map((d) => {
      const g = sortFindings(fs.filter((f) => f.domain === d.key));
      return g.length ? `<div class="r-group"><h3 class="r-group-h"><span class="nav-no">${DOMAIN[d.key].no}</span>${d.name}<span class="muted">${g.length}건</span></h3><div class="findings">${g.map(findingHTML).join("")}</div></div>` : "";
    }).join("") : `<div class="empty">${ev.answered ? "해당 조건의 항목이 없습니다." : "아직 답한 항목이 없습니다. 좌측 영역에서 점검을 시작하세요."}</div>`;
  }
}

function applyRowFilter() {
  const rows = $$("#rows .row");
  if (!rows.length) return;
  const f = S.rowFilter;
  let shown = 0;
  for (const r of rows) {
    const st = r.dataset.state;
    const ok = f === "all" || (f === "todo" && st === "todo") || (f === "risk" && (st === "high" || st === "medium"))
      || (f === "amend" && r.dataset.amend === "true") || (f === "dispute" && (r.dataset.dispute === "true" || r.closest('details[data-dispute="true"]')));
    r.hidden = !ok;
    if (ok) shown++;
  }
  for (const g of $$("#rows .group, #rows details.spec")) g.hidden = !$$(".row", g).some((r) => !r.hidden);
  const em = $("#rows .filter-empty"); if (em) em.hidden = shown > 0;
}

// ── 이벤트 ────────────────────────────────────────────────────
function setValue(group, key, value) {
  const { inp } = cur();
  if (group === "headcount") inp.headcount = Math.max(1, value ?? 1);
  else if (group === "ans") { if (isBlank(value)) delete inp.answers[key]; else inp.answers[key] = value; }
  else if (group === "memo") inp.memos[key] = value;
  else if (group === "reply") inp.replies[key] = value;
  else if (group === "questions") {
    inp.questions = value;
    const list = $("#q-list");
    if (list) list.innerHTML = questionsOf(inp).map((q, i) => qItemHTML(q, i)).join("");
  }
  refreshLive();
}

function stepStart(group, key) {
  if (group === "headcount") return cur().inp.headcount;
  const e = S.ev.list.find((x) => x.key === key);
  const c = e?.chk || {};
  const base = c.type === "core" ? c.legal : c.threshold;
  return typeof base === "number" ? base : 0;
}

app.addEventListener("click", (e) => {
  const t = e.target.closest("button, [data-region]");
  if (!t) return;
  if (t.dataset.region) { S.homeFilter = t.dataset.region; renderHome(); return; }
  if (t.dataset.goto === "verify") { go(S.slug, "overview"); setTimeout(() => $("#verify")?.scrollIntoView({ behavior: "smooth" }), 80); return; }
  if (t.dataset.rowfilter) {
    S.rowFilter = t.dataset.rowfilter;
    $$("[data-rowfilter]").forEach((b) => b.setAttribute("aria-checked", String(b === t)));
    applyRowFilter(); return;
  }
  if (t.dataset.filter) {
    S.resultFilter = S.resultFilter === t.dataset.filter && t.classList.contains("r-card") ? "all" : t.dataset.filter;
    $$("[data-filter]").forEach((b) => b.matches(".seg button") && b.setAttribute("aria-checked", String(b.dataset.filter === S.resultFilter)));
    refreshLive(); return;
  }
  if (t.dataset.step) {
    const input = t.parentElement.querySelector("input");
    const curV = parseFloat(input.value);
    const base = isFinite(curV) ? curV + parseFloat(t.dataset.step) : stepStart(t.dataset.group, t.dataset.key);
    const v = Math.max(t.dataset.group === "headcount" ? 1 : 0, Math.round(base * 100) / 100);
    input.value = v;
    setValue(t.dataset.group, t.dataset.key, v);
    return;
  }
  if (t.dataset.val !== undefined && t.dataset.group) {
    const turnOff = t.getAttribute("aria-checked") === "true";
    $$("button", t.parentElement).forEach((b) => b.setAttribute("aria-checked", String(!turnOff && b === t)));
    setValue(t.dataset.group, t.dataset.key, turnOff ? null : t.dataset.val);
    return;
  }
  if (t.dataset.action === "report") { downloadReport(); return; }
  if (t.dataset.action === "reset") {
    if (confirm("이 관할의 응답을 모두 지우고 미응답 상태로 되돌릴까요?")) {
      S.inputs[S.slug] = newInputs(); S.rowFilter = "all"; S.resultFilter = "all"; renderCountry(); toast("응답을 초기화했습니다.");
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
    setValue(t.dataset.group, t.dataset.key, isFinite(v) ? Math.max(0, v) : null);
  } else if (t.tagName === "TEXTAREA") {
    setValue(t.dataset.group, t.dataset.key, t.value);
    t.style.height = "auto"; t.style.height = `${t.scrollHeight + 2}px`;
  }
});
app.addEventListener("change", (e) => {
  const t = e.target;
  if (t.tagName === "SELECT" && t.dataset.group) setValue(t.dataset.group, t.dataset.key, t.value || null);
  if (t.dataset.group === "headcount" && !isFinite(parseFloat(t.value))) { t.value = cur().inp.headcount; }
});
document.addEventListener("change", (e) => { if (e.target.id === "switch") go(e.target.value, S.view); });

function downloadReport() {
  const { data, inp } = cur();
  const ev = evaluate();
  const subj = questionsOf(inp).map((q) => [q, inp.replies[q] || ""]);
  const html = buildReport({ data, ev, answers: inp.answers, headcount: inp.headcount, subjItems: subj });
  const today = new Date().toISOString().slice(0, 10);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  a.download = `compliance_report_${data.country}_${today}.html`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast(ev.answered ? "리포트를 내려받았습니다." : "아직 응답이 없어 법령 요약 위주의 리포트입니다.");
}

let toastTimer;
function toast(msg) {
  const el = $("#toast"); el.textContent = msg; el.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
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

// ── 라우팅: #/ · #/jp · #/jp/<영역> · #/jp/result ─────────────
const VIEWS = ["overview", ...R.DOMAIN_KEYS, "result"];
function go(slug, view = "overview") { location.hash = slug ? `#/${slug}${view === "overview" ? "" : "/" + view}` : "#/"; }

function route() {
  const [, slug, view] = location.hash.replace(/^#/, "").split("/");
  const meta = COUNTRIES.find((c) => c.slug === slug);
  if (!meta) { S.slug = null; renderHome(); window.scrollTo(0, 0); return; }
  const newView = VIEWS.includes(view) ? view : "overview";
  if (!S.inputs[slug]) S.inputs[slug] = newInputs();
  if (S.view !== newView) S.rowFilter = "all";
  S.view = newView;
  if (S.slug !== slug || !$("#pane")) {
    S.slug = slug; S.resultFilter = "all";
    renderCountry(); window.scrollTo(0, 0);
  } else {
    renderPane();
    const band = $(".band");
    if (band && window.scrollY > band.offsetHeight) window.scrollTo({ top: band.offsetHeight - 70, behavior: "smooth" });
  }
}

// ── 시작 ──────────────────────────────────────────────────────
paintThemeBtn();
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", paintThemeBtn);
try {
  loadAll();
  window.addEventListener("hashchange", route);
  route();
} catch (err) {
  app.innerHTML = `<div class="wrap" style="padding:100px 16px"><div class="notice"><div class="notice-icon">${icon("alert")}</div><div>
    <h4>법령 데이터를 불러오지 못했습니다</h4><ul><li>${esc(err.message)}</li></ul></div></div></div>`;
}
})();
