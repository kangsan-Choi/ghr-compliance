/**
 * 최종 리포트(독립 HTML) · 주관식 AI 프롬프트 생성
 * compliance_app.build_html_report / build_llm_prompt 를 새 디자인으로 포팅.
 */
import { summarize, riskScore, LEVEL_LABEL } from "./rules.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pyStr = (x) => (x === null || x === undefined ? "None" : String(x));

/** 파이썬 fmt_amount: "2,540 CNY / 월 (베이징)" */
export function fmtAmount(mw) {
  const a = mw?.amount;
  if (typeof a !== "number") return "-";
  return `${a.toLocaleString("en-US", { maximumFractionDigits: 20 })} ${mw.currency ?? ""} / ${mw.period ?? ""} (${mw.locality ?? ""})`;
}

/** 질문 1건에 대한 AI 프롬프트(법령 컨텍스트 번들). */
export function buildPrompt(data, question, baseInputs, specificInputs) {
  const std = data.standards || {};
  const mw = std.min_wage || {};
  const specifics = (data.country_specifics || []).map((s) => s.name || "").join("; ");
  const timeline = (data.amendment_timeline || []).map((a) => `${pyStr(a.date)}(${a.status || ""}) ${pyStr(a.title)}`).join("; ");
  const ourBase = Object.entries(baseInputs).filter(([, v]) => String(v).trim()).map(([k, v]) => `${k}=${v}`).join("; ");
  const ourSpec = Object.entries(specificInputs).filter(([, v]) => String(v).trim()).map(([k, v]) => `${k}=${v}`).join("; ");
  return `당신은 ${data.country}(${data.city})의 노동법 컴플라이언스 전문가입니다.
아래 현지 법령 요약과 우리 회사 상황을 근거로 질문에 답하고, 컴플라이언스 리스크와 실무 제언을 제시하세요.
확실하지 않은 부분은 추정임을 밝히고 현지 노무사/변호사 확인이 필요한 사항을 표시하세요.

[현지 법령 요약 · 기준시점 ${data.as_of || ""}]
- 관할: ${data.jurisdiction_note || ""}
- 정규 주당 근로시간: ${pyStr(std.standard_weekly_hours)} 시간 / 최대(연장 포함): ${std.max_weekly_hours_incl_overtime || "상한없음·협정방식"}
- 연장근로 가산: ${std.overtime_premium || ""}
- 최저임금: ${fmtAmount(mw)}
- 법정 최소 연차: ${pyStr(std.annual_leave_min_days)} 일
- 해고 예고: ${std.termination_notice_min_days || "없음/특수"} / 퇴직·해고수당: ${std.severance || ""}
- 병가: ${std.sick_leave || ""}
- 국가 특유 제도: ${specifics}
- 최근 개정(확정/예정/미확정): ${timeline}

[우리 회사 현행 제도]
- 정량: ${ourBase || "(미입력)"}
- 국가 특유 제도 대응: ${ourSpec || "(미입력)"}

[질문]
${question.trim()}
`;
}

/** 다운로드용 독립 HTML 리포트. */
export function buildReport({ data, findings, baseInputs, specificInputs, subjItems, headcount }) {
  const today = new Date().toISOString().slice(0, 10);
  const std = data.standards || {};
  const v = data.verification || {};
  const counts = summarize(findings);
  const score = riskScore(counts);
  const order = { high: 0, medium: 1, info: 2, ok: 3 };
  const hcTxt = typeof headcount === "number" ? `상시 직원 ${headcount}명 기준` : "직원 수 미입력";

  const lawRows = [
    ["정규 주당 근로시간", `${std.standard_weekly_hours ?? "-"} 시간`],
    ["주당 최대(연장 포함)", `${std.max_weekly_hours_incl_overtime || "상한 없음/협정 방식"}`],
    ["연장근로 가산", std.overtime_premium || "-"],
    ["최저임금", fmtAmount(std.min_wage)],
    ["법정 최소 연차", `${std.annual_leave_min_days ?? "-"} 일`],
    ["해고 예고기간", `${std.termination_notice_min_days || "없음/특수"}`],
    ["퇴직금/해고수당", std.severance || "-"],
  ].map(([k, x]) => `<tr><th>${k}</th><td>${esc(x)}</td></tr>`).join("");

  const timeline = (data.amendment_timeline || []).map((a) =>
    `<li><span class="d">${esc(a.date)}</span><div><b>${esc(a.title)}</b> <span class="st">${esc(a.status || "")}${a.effective_date ? " · 발효 " + esc(a.effective_date) : ""}</span><br><span class="muted">${esc(a.impact)}</span></div></li>`).join("");

  const baseRows = Object.entries(baseInputs).map(([k, x]) => `<tr><th>${esc(k)}</th><td>${esc(x || "-")}</td></tr>`).join("");
  const specRows = Object.entries(specificInputs).filter(([, x]) => String(x).trim())
    .map(([k, x]) => `<tr><th>${esc(k)}</th><td>${esc(x)}</td></tr>`).join("") || "<tr><td colspan='2'>입력 없음</td></tr>";

  const findRows = [...findings].sort((a, b) => (order[a.level] ?? 9) - (order[b.level] ?? 9)).map((f) => `
    <tr data-level="${f.level}" class="lv-${f.level}">
      <td><span class="pill">${LEVEL_LABEL[f.level]}</span></td>
      <td>${esc(f.category)}${f.dispute_risk === "high" ? ' <span class="fire">분쟁 다발</span>' : ""}</td>
      <td><b>${esc(f.title)}</b><br><span class="muted">${esc(f.detail)}</span></td>
      <td>${esc(f.legal_basis)}</td><td>${esc(f.recommendation)}</td></tr>`).join("");

  const subj = subjItems.length ? subjItems.map(([q, ans], i) =>
    `<li><b>Q${i + 1}. ${esc(q)}</b><br>${ans.trim() ? `<span class="muted">AI 답변</span><div class="ans">${esc(ans)}</div>` : '<span class="muted">(답변 미입력 — 앱에서 생성된 프롬프트로 별도 질의 필요)</span>'}</li>`).join("")
    : "<li>(주관식 질문 없음)</li>";

  const cards = ["high", "medium", "ok", "info"].map((l) =>
    `<div class="card lv-${l}"><div class="n">${counts[l]}</div><div class="l">${LEVEL_LABEL[l]}</div></div>`).join("");

  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(data.country)} ${esc(data.city)} HR 컴플라이언스 리포트</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@600&display=swap">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>
 :root { --navy:#0F1F36; --accent:#B4532A; --ink:#15171C; --ink2:#4A4E57; --ink3:#7F838C; --line:#E6E2D9; --paper:#F6F4EF;
   --high:#B42318; --high-bg:#FBEAE8; --medium:#B25E09; --medium-bg:#FBF0E1; --ok:#2F7A55; --ok-bg:#E6F1EA; --info:#3159A6; --info-bg:#E8EEF8; }
 * { box-sizing:border-box; }
 body { margin:0; background:var(--paper); color:var(--ink); font-family:"Pretendard Variable","Pretendard","Malgun Gothic",sans-serif; line-height:1.65; letter-spacing:-.01em; }
 .page { max-width:1040px; margin:0 auto; padding:28px 28px 64px; }
 .toolbar { position:sticky; top:0; z-index:5; display:flex; gap:8px; padding:12px 0; background:rgba(246,244,239,.92); backdrop-filter:blur(8px); }
 .btn { border:1px solid #D3CDBF; background:#fff; border-radius:10px; padding:8px 14px; font:inherit; font-size:13.5px; font-weight:600; cursor:pointer; }
 .btn.primary { background:var(--navy); color:#F3EFE6; border-color:var(--navy); }
 .hero { background:var(--navy); color:#F3EFE6; border-radius:16px; padding:32px 34px; position:relative; overflow:hidden; }
 .hero:after { content:""; position:absolute; left:0; right:0; bottom:0; height:4px; background:var(--accent); }
 .eyebrow { font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:#A9B3C4; font-weight:600; }
 .hero h1 { font-family:"Noto Serif KR",serif; font-weight:600; font-size:28px; letter-spacing:-.03em; margin:10px 0 8px; }
 .hero .meta { font-size:13px; color:#A9B3C4; }
 .score { display:flex; align-items:center; gap:18px; margin-top:22px; }
 .score b { font-family:"Noto Serif KR",serif; font-size:40px; font-weight:600; line-height:1; }
 .meter { flex:1; height:8px; background:rgba(255,255,255,.14); border-radius:999px; overflow:hidden; }
 .meter i { display:block; height:100%; width:${score}%; background:#E9A27C; border-radius:999px; }
 .cards { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin:18px 0 6px; }
 .card { background:#fff; border:1px solid var(--line); border-top:3px solid var(--c); border-radius:12px; padding:14px 16px; }
 .card .n { font-family:"Noto Serif KR",serif; font-size:30px; font-weight:600; color:var(--c); line-height:1.1; }
 .card .l { font-size:12.5px; color:var(--ink2); font-weight:600; }
 .lv-high { --c:var(--high); --bg:var(--high-bg); } .lv-medium { --c:var(--medium); --bg:var(--medium-bg); }
 .lv-ok { --c:var(--ok); --bg:var(--ok-bg); } .lv-info { --c:var(--info); --bg:var(--info-bg); }
 h2 { font-family:"Noto Serif KR",serif; font-weight:600; font-size:21px; letter-spacing:-.03em; margin:44px 0 12px; display:flex; gap:12px; align-items:baseline; }
 h2 .no { color:var(--accent); font-size:15px; }
 h3 { font-size:15px; margin:24px 0 8px; }
 table { width:100%; table-layout:fixed; border-collapse:collapse; background:#fff; border:1px solid var(--line); border-radius:12px; overflow:hidden; }
 th, td { padding:11px 13px; text-align:left; vertical-align:top; font-size:13.5px; border-top:1px solid var(--line); }
 thead th { background:#FBFAF7; font-size:12px; color:var(--ink3); letter-spacing:.06em; border-top:0; }
 tbody th { width:200px; color:var(--ink2); font-weight:600; background:#FBFAF7; }
 tr.lv-high td:first-child, tr.lv-medium td:first-child, tr.lv-ok td:first-child, tr.lv-info td:first-child { box-shadow:inset 3px 0 0 var(--c); }
 .pill { display:inline-block; padding:2px 9px; border-radius:999px; background:var(--bg); color:var(--c); font-weight:700; font-size:12px; white-space:nowrap; }
 .fire { font-size:11.5px; font-weight:700; color:var(--high); border:1px solid #E7B4AE; border-radius:999px; padding:1px 7px; white-space:nowrap; }
 .muted { color:var(--ink3); font-size:12.5px; }
 .filters { display:flex; gap:6px; flex-wrap:wrap; margin:0 0 12px; }
 .filters button { border:1px solid #D3CDBF; background:#fff; border-radius:999px; padding:5px 13px; font:inherit; font-size:12.5px; font-weight:600; cursor:pointer; color:var(--ink2); }
 .filters button.on { background:var(--navy); border-color:var(--navy); color:#F3EFE6; }
 ul.tl { list-style:none; padding:0; margin:0; background:#fff; border:1px solid var(--line); border-radius:12px; }
 ul.tl li { display:grid; grid-template-columns:90px 1fr; gap:16px; padding:12px 16px; font-size:13.5px; }
 ul.tl li + li { border-top:1px solid var(--line); }
 ul.tl .d { font-family:"Noto Serif KR",serif; font-weight:600; }
 ul.tl .st { font-size:12px; color:var(--accent); font-weight:600; }
 ul.subj { padding-left:18px; } ul.subj li { margin-bottom:12px; font-size:14px; }
 .ans { white-space:pre-wrap; background:#fff; border:1px solid var(--line); border-radius:10px; padding:10px 12px; margin-top:4px; font-size:13.5px; }
 .note { margin-top:40px; padding-top:18px; border-top:1px solid var(--line); font-size:12.5px; color:var(--ink3); }
 @media (max-width:720px) { .cards { grid-template-columns:repeat(2,1fr); } .page { padding:16px 16px 48px; } table { display:block; overflow-x:auto; } }
 @media print { .toolbar, .filters { display:none; } body { background:#fff; } .hero, .card, .pill { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
</style></head><body><div class="page">
 <div class="toolbar"><button class="btn primary" onclick="window.print()">인쇄 / PDF 저장</button>
   <button class="btn" onclick="document.getElementById('findings').scrollIntoView({behavior:'smooth'})">진단 결과로 이동</button></div>

 <header class="hero">
   <div class="eyebrow">Global ER Compliance · Report</div>
   <h1>${esc(data.country)} ${esc(data.city)} 노동법 컴플라이언스 리포트</h1>
   <div class="meta">생성일 ${today} · 데이터 기준시점 ${esc(data.as_of)} · ${hcTxt}</div>
   <div class="meta">법령 검증 ${esc(v.last_verified || "미검증")} · 데이터 신뢰도 ${esc({ high: "높음", medium: "보통", low: "낮음" }[v.confidence] || "미검증")}</div>
   <div class="score"><div><div class="eyebrow">Risk Index</div><b>${score}</b><span class="meta"> / 100</span></div><div class="meter"><i></i></div></div>
 </header>
 <div class="cards">${cards}</div>

 <h2 id="findings"><span class="no">01</span>리스크 진단 결과</h2>
 <div class="filters">
   <button class="on" data-f="all">전체</button><button data-f="high">위반 소지</button><button data-f="medium">주의</button>
   <button data-f="info">수동확인</button><button data-f="ok">적합</button></div>
 <table id="ft"><colgroup><col style="width:92px"><col style="width:120px"><col><col style="width:24%"><col style="width:22%"></colgroup><thead><tr><th>판정</th><th>항목</th><th>내용</th><th>법적 근거</th><th>권고</th></tr></thead><tbody>${findRows}</tbody></table>

 <h2><span class="no">02</span>주관식 검토 사항</h2>
 <ul class="subj">${subj}</ul>
 <p class="muted">주관식은 자동 룰 판정 대상이 아니며, 앱에서 생성한 프롬프트로 AI에 건별 질의해 답변을 채웁니다.</p>

 <h2><span class="no">03</span>적용 법령 요약</h2>
 <p class="muted">${esc(data.jurisdiction_note)}</p>
 <table><tbody>${lawRows}</tbody></table>
 <h3>최근 개정 타임라인</h3><ul class="tl">${timeline}</ul>

 <h2><span class="no">04</span>우리 회사 현행 제도 <span class="muted">(${hcTxt})</span></h2>
 <h3>정량 입력값</h3><table><tbody>${baseRows}</tbody></table>
 <h3>국가 핵심 제도별 운영 기준</h3><table><tbody>${specRows}</tbody></table>

 <div class="note">
   <p><b>취급 주의</b> — 본 리포트는 컴플라이언스 미준수 가능성을 담고 있습니다. 회사·법인을 특정할 수 있는 정보는 입력하지 않는 것을 전제로 작성되었으며, 파일 공유·보관 시 접근 권한에 유의하세요.</p>
   <p>본 리포트는 사전 수집된 법령 데이터(기준시점 ${esc(data.as_of)})와 자동 룰 판정에 기반하며, 최종 의사결정 전 현지 노무사/변호사 확인이 필요합니다.</p>
 </div>
</div>
<script>
 document.querySelectorAll('.filters button').forEach(function (b) {
   b.addEventListener('click', function () {
     document.querySelectorAll('.filters button').forEach(function (x) { x.classList.toggle('on', x === b); });
     var f = b.getAttribute('data-f');
     document.querySelectorAll('#ft tbody tr').forEach(function (tr) { tr.style.display = (f === 'all' || tr.getAttribute('data-level') === f) ? '' : 'none'; });
   });
 });
</script>
</body></html>`;
}
