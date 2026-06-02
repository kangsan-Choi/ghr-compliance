"""
글로벌 HR 노동법 컴플라이언스 점검 앱 (데이터 기반 · API 키 불필요)
──────────────────────────────────────────────────────────────
좌측 사이드바 = 컨트롤 패널:
   국가 선택 → ① 노동법령·판례 불러오기 → ② 일괄 Risk 분석 → ③ 리포트 다운로드
본문 = 법령/판례 표시 + 우리 회사 제도 입력 + 분석 결과

법령 데이터는 data/ 폴더 JSON에 사전 저장(인터넷·API 키 불필요).
숫자 입력 기본값은 '해당 국가 법정 기준값'으로 채워지며 ± 조절할 수 있습니다.
"""

import os
import json
import datetime

import streamlit as st
import streamlit.components.v1 as components

import rules

# ── 브랜드 컬러 (오렌지 테마) ──────────────────────────────────
BRAND = "#F04C23"          # 메인 오렌지
BRAND_DARK = "#C23A18"     # 진한 오렌지 (hover/강조)
BRAND_SOFT = "#FFF4F0"     # 연한 오렌지 배경
BRAND_LINE = "#FAD9CF"     # 연한 오렌지 보더

LEVEL_COLOR = {            # 리스크 레벨별 색
    "high": "#DC2626",
    "medium": "#F59E0B",
    "ok": "#16A34A",
    "info": "#2563EB",
}

try:
    import markdown as md_lib
except ImportError:
    md_lib = None

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")

COUNTRY_CITY_FILES = {
    "미국 — 휴스턴 (텍사스)": "us_houston.json",
    "중국 — 베이징": "china_beijing.json",
    "일본 — 도쿄": "japan_tokyo.json",
    "러시아 — 모스크바": "russia_moscow.json",
    "네덜란드 — 암스테르담": "netherlands_amsterdam.json",
    "스페인 — 카르타헤나": "spain_cartagena.json",
    "인도네시아 — 두마이": "indonesia_dumai.json",
    "인도 — 구르가온 (하리아나)": "india_gurgaon.json",
}

STATUS_BADGE = {
    "시행 중": "🟢 시행 중",
    "시행 확정(예정)": "🔵 시행 확정(예정)",
    "추진 중(미확정)": "🟠 추진 중(미확정)",
    "정정 필요(미시행)": "⚪ 미시행/정정",
    "정정 필요": "⚪ 정정",
}


def load_data(filename: str) -> dict:
    with open(os.path.join(DATA_DIR, filename), encoding="utf-8") as f:
        return json.load(f)


def md_to_html(text: str) -> str:
    if not text:
        return ""
    if md_lib is None:
        return "<pre>" + text + "</pre>"
    return md_lib.markdown(text, extensions=["tables", "fenced_code", "nl2br", "sane_lists"])


def fmt_amount(mw: dict) -> str:
    a = mw.get("amount")
    if isinstance(a, (int, float)):
        return f"{a:,} {mw.get('currency','')} / {mw.get('period','')} ({mw.get('locality','')})"
    return "-"


def _f(v, fallback):
    return float(v) if isinstance(v, (int, float)) else float(fallback)


# ──────────────────────────────────────────────────────────────
# 법령 렌더링
# ──────────────────────────────────────────────────────────────
def render_law_section(data: dict):
    std = data["standards"]
    mw = std.get("min_wage", {})
    st.info(data.get("jurisdiction_note", ""))

    st.markdown("#### 📋 핵심 법정 기준")
    rows = [
        ("정규 주당 근로시간", f"{std.get('standard_weekly_hours','-')} 시간"),
        ("주당 최대(연장 포함)", f"{std.get('max_weekly_hours_incl_overtime') or '상한 없음/협정 방식'}"),
        ("연장근로 가산", std.get("overtime_premium", "-")),
        ("최저임금", fmt_amount(mw)),
        ("법정 최소 연차", f"{std.get('annual_leave_min_days','-')} 일"),
        ("해고 예고기간", f"{std.get('termination_notice_min_days') or '없음/특수(at-will 등)'}"),
        ("병가", std.get("sick_leave", "-")),
        ("퇴직금/해고수당", std.get("severance", "-")),
        ("수습기간", std.get("probation", "-")),
        ("사회보험", std.get("social_insurance", "-")),
    ]
    md = "| 항목 | 내용 |\n|---|---|\n"
    for k, v in rows:
        md += f"| **{k}** | {v} |\n"
    st.markdown(md)
    if mw.get("note"):
        st.caption("최저임금 비고: " + mw["note"])

    st.markdown("#### 🗓️ 최근 개정 타임라인 (확정 여부 포함)")
    st.caption("🟢 시행 중 · 🔵 시행 확정(예정, 발효일 확정) · 🟠 추진 중(미확정·법안단계) · ⚪ 미시행/정정")
    for a in data.get("amendment_timeline", []):
        badge = STATUS_BADGE.get(a.get("status", ""), "")
        eff = a.get("effective_date")
        eff_txt = f" · 발효 {eff}" if eff else ""
        st.markdown(f"- **{a.get('date','')}** {badge}{eff_txt} — {a.get('title','')}  \n  ↳ {a.get('impact','')}")

    st.markdown("#### ⚖️ 주요 판례 / 행정해석")
    for p in data.get("precedents", []):
        st.markdown(f"- **{p.get('title','')}**  \n  쟁점: {p.get('issue','')}  \n  시사점: {p.get('implication','')}")

    st.markdown("#### 🔗 출처")
    for s in data.get("sources", []):
        st.markdown(f"- [{s.get('title','')}]({s.get('url','')})")


# ──────────────────────────────────────────────────────────────
# 주관식 → LLM 프롬프트 생성
# ──────────────────────────────────────────────────────────────
def build_llm_prompt(data: dict, question: str, base_inputs: dict, specific_inputs: dict) -> str:
    std = data["standards"]
    mw = std.get("min_wage", {})
    specifics = "; ".join(s.get("name", "") for s in data.get("country_specifics", []))
    timeline = "; ".join(
        f"{a.get('date')}({a.get('status','')}) {a.get('title')}"
        for a in data.get("amendment_timeline", [])
    )
    our_base = "; ".join(f"{k}={v}" for k, v in base_inputs.items() if str(v).strip())
    our_spec = "; ".join(f"{k}={v}" for k, v in specific_inputs.items() if str(v).strip())

    return f"""당신은 {data['country']}({data['city']})의 노동법 컴플라이언스 전문가입니다.
아래 현지 법령 요약과 우리 회사 상황을 근거로 질문에 답하고, 컴플라이언스 리스크와 실무 제언을 제시하세요.
확실하지 않은 부분은 추정임을 밝히고 현지 노무사/변호사 확인이 필요한 사항을 표시하세요.

[현지 법령 요약 · 기준시점 {data.get('as_of','')}]
- 관할: {data.get('jurisdiction_note','')}
- 정규 주당 근로시간: {std.get('standard_weekly_hours')} 시간 / 최대(연장 포함): {std.get('max_weekly_hours_incl_overtime') or '상한없음·협정방식'}
- 연장근로 가산: {std.get('overtime_premium','')}
- 최저임금: {fmt_amount(mw)}
- 법정 최소 연차: {std.get('annual_leave_min_days')} 일
- 해고 예고: {std.get('termination_notice_min_days') or '없음/특수'} / 퇴직·해고수당: {std.get('severance','')}
- 병가: {std.get('sick_leave','')}
- 국가 특유 제도: {specifics}
- 최근 개정(확정/예정/미확정): {timeline}

[우리 회사 현행 제도]
- 정량: {our_base or '(미입력)'}
- 국가 특유 제도 대응: {our_spec or '(미입력)'}

[질문]
{question.strip()}
"""


# ──────────────────────────────────────────────────────────────
# HTML 리포트
# ──────────────────────────────────────────────────────────────
def build_html_report(data, base_inputs, specific_inputs, subjective_items, findings, headcount=None):
    today = datetime.date.today().isoformat()
    std = data["standards"]

    law_rows = "".join(
        f"<tr><th>{k}</th><td>{v}</td></tr>" for k, v in [
            ("정규 주당 근로시간", f"{std.get('standard_weekly_hours','-')} 시간"),
            ("주당 최대(연장 포함)", f"{std.get('max_weekly_hours_incl_overtime') or '상한 없음/협정 방식'}"),
            ("연장근로 가산", std.get("overtime_premium", "-")),
            ("법정 최소 연차", f"{std.get('annual_leave_min_days','-')} 일"),
            ("해고 예고기간", f"{std.get('termination_notice_min_days') or '없음/특수'}"),
            ("퇴직금/해고수당", std.get("severance", "-")),
        ]
    )
    timeline = "".join(
        f"<li><b>{a.get('date','')}</b> [{a.get('status','')}{(' · 발효 '+a['effective_date']) if a.get('effective_date') else ''}] "
        f"{a.get('title','')}<br><span class='muted'>{a.get('impact','')}</span></li>"
        for a in data.get("amendment_timeline", [])
    )
    base_rows = "".join(f"<tr><th>{k}</th><td>{v or '-'}</td></tr>" for k, v in base_inputs.items())
    spec_rows = "".join(
        f"<tr><th>{k}</th><td>{v or '-'}</td></tr>" for k, v in specific_inputs.items() if str(v).strip()
    ) or "<tr><td colspan='2'>입력 없음</td></tr>"

    color = {"high": "#DC2626", "medium": "#F59E0B", "ok": "#16A34A", "info": "#2563EB"}
    badge_bg = {"high": "#FEE2E2", "medium": "#FEF3C7", "ok": "#DCFCE7", "info": "#DBEAFE"}
    order = {"high": 0, "medium": 1, "info": 2, "ok": 3}
    find_rows = ""
    for f in sorted(findings, key=lambda x: order.get(x["level"], 9)):
        c = color.get(f["level"], "#555")
        bg = badge_bg.get(f["level"], "#eee")
        find_rows += (
            f"<tr data-level='{f['level']}'>"
            f"<td><span class='lv' style='color:{c};background:{bg}'>{rules.LEVEL_LABEL[f['level']]}</span></td>"
            f"<td>{f['category']}</td><td><b>{f['title']}</b><br><span class='muted'>{f['detail']}</span></td>"
            f"<td>{f['legal_basis']}</td><td>{f['recommendation']}</td></tr>"
        )

    subj_html = ""
    for i, (q, ans) in enumerate(subjective_items, 1):
        subj_html += f"<li><b>Q{i}. {q}</b><br>{('<span class=muted>LLM 답변: </span>' + md_to_html(ans)) if ans.strip() else '<span class=muted>(LLM 답변 미입력 — 생성된 프롬프트로 별도 질의 필요)</span>'}</li>"
    if not subj_html:
        subj_html = "<li>(주관식 질문 없음)</li>"

    counts = rules.summarize(findings)
    total = max(1, counts["high"] + counts["medium"] + counts["ok"] + counts["info"])
    score = round(100 * (counts["high"] * 1.0 + counts["medium"] * 0.5) / total)
    hc_txt = (f"상시 직원 {headcount:g}명 기준" if isinstance(headcount, (int, float)) else "직원 수 미입력")

    cards = ""
    for key, label, emoji in [("high", "위반 소지", "🔴"), ("medium", "주의", "🟡"),
                              ("ok", "적합", "🟢"), ("info", "수동확인", "🔎")]:
        cards += (f"<div class='card'><div class='emoji'>{emoji}</div>"
                  f"<div class='num' data-n='{counts[key]}' style='color:{color[key]}'>0</div>"
                  f"<div class='clbl'>{label}</div></div>")

    return f"""<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{data['country']} HR 컴플라이언스 리포트</title>
<style>
 :root {{ --brand:#F04C23; --brand-dark:#C23A18; --soft:#FFF4F0; --line:#FAD9CF; }}
 * {{ box-sizing:border-box; }}
 body {{ font-family:'Pretendard','Malgun Gothic','Segoe UI',sans-serif; max-width:1000px; margin:0 auto;
        padding:32px 28px 60px; color:#1f2937; line-height:1.65; background:#fff; }}
 .hero {{ background:linear-gradient(120deg,#F04C23 0%,#FF7A4D 60%,#FF9A6B 100%);
          color:#fff; border-radius:18px; padding:28px 30px; box-shadow:0 10px 30px rgba(240,76,35,.28); }}
 .hero h1 {{ margin:0; font-size:25px; font-weight:800; letter-spacing:-.5px; }}
 .hero .meta {{ margin-top:8px; font-size:13.5px; opacity:.95; }}
 .meter-wrap {{ margin-top:16px; }}
 .meter-top {{ display:flex; justify-content:space-between; font-size:13px; opacity:.95; margin-bottom:6px; }}
 .meter {{ height:12px; background:rgba(255,255,255,.35); border-radius:999px; overflow:hidden; }}
 .meter > div {{ height:100%; width:0; background:#fff; border-radius:999px; transition:width 1.1s cubic-bezier(.2,.8,.2,1); }}
 .cards {{ display:flex; gap:12px; margin:20px 0 8px; flex-wrap:wrap; }}
 .card {{ flex:1; min-width:120px; background:#fff; border:1px solid var(--line); border-radius:14px;
          padding:16px; text-align:center; box-shadow:0 2px 10px rgba(0,0,0,.04); }}
 .card .emoji {{ font-size:18px; }}
 .card .num {{ font-size:30px; font-weight:800; line-height:1.1; }}
 .card .clbl {{ font-size:13px; color:#6b7280; }}
 h2 {{ color:var(--brand-dark); margin-top:38px; border-left:5px solid var(--brand); padding-left:12px; font-size:20px; }}
 h3 {{ margin-top:22px; font-size:16px; }}
 table {{ border-collapse:collapse; width:100%; margin:12px 0; }}
 th,td {{ border:1px solid #e5e7eb; padding:9px 11px; text-align:left; vertical-align:top; font-size:14px; }}
 th {{ background:var(--soft); white-space:nowrap; color:var(--brand-dark); }}
 .muted {{ color:#6b7280; font-size:13px; }}
 .lv {{ display:inline-block; padding:3px 9px; border-radius:999px; font-weight:700; font-size:12.5px; white-space:nowrap; }}
 ul {{ padding-left:18px; }}
 .filters {{ margin:14px 0; display:flex; gap:8px; flex-wrap:wrap; }}
 .filters button {{ border:1.5px solid var(--line); background:#fff; color:#374151; border-radius:999px;
          padding:6px 14px; font-size:13px; font-weight:600; cursor:pointer; transition:all .15s; font-family:inherit; }}
 .filters button:hover {{ border-color:var(--brand); color:var(--brand); }}
 .filters button.active {{ background:var(--brand); border-color:var(--brand); color:#fff; }}
 .toolbar {{ position:sticky; top:0; background:rgba(255,255,255,.92); backdrop-filter:blur(6px);
          padding:10px 0; margin-bottom:6px; z-index:5; display:flex; gap:10px; align-items:center; }}
 .btn {{ background:var(--brand); color:#fff; border:none; border-radius:10px; padding:9px 16px;
          font-size:13.5px; font-weight:700; cursor:pointer; font-family:inherit; }}
 .btn:hover {{ background:var(--brand-dark); }}
 .btn.ghost {{ background:#fff; color:var(--brand); border:1.5px solid var(--line); }}
 @media print {{ .toolbar,.filters {{ display:none; }} .hero {{ -webkit-print-color-adjust:exact; print-color-adjust:exact; }} }}
</style></head><body>

 <div class="toolbar">
   <button class="btn" onclick="window.print()">🖨️ 인쇄 / PDF 저장</button>
   <button class="btn ghost" onclick="document.getElementById('findings').scrollIntoView({{behavior:'smooth'}})">⚖️ 진단 결과로 이동</button>
 </div>

 <div class="hero">
   <h1>🌐 {data['country']} ({data['city']}) HR 노동법 컴플라이언스 리포트</h1>
   <div class="meta">생성일 {today} · 데이터 기준시점 {data.get('as_of','')} · {hc_txt}</div>
   <div class="meter-wrap">
     <div class="meter-top"><span>종합 리스크 지수</span><span><b id="scoreTxt">0</b>/100</span></div>
     <div class="meter"><div id="meterfill" data-score="{score}"></div></div>
   </div>
 </div>

 <div class="cards">{cards}</div>

 <h2 id="findings">1. 리스크 진단 결과 (룰 기반 자동 판정)</h2>
 <div class="filters">
   <button data-f="all" class="active" onclick="filt(this,'all')">전체</button>
   <button data-f="high" onclick="filt(this,'high')">🔴 위반 소지</button>
   <button data-f="medium" onclick="filt(this,'medium')">🟡 주의</button>
   <button data-f="ok" onclick="filt(this,'ok')">🟢 적합</button>
   <button data-f="info" onclick="filt(this,'info')">🔎 수동확인</button>
 </div>
 <table id="findTable"><thead><tr><th>판정</th><th>항목</th><th>내용</th><th>법적 근거</th><th>권고</th></tr></thead>
 <tbody>{find_rows}</tbody></table>

 <h2>2. 주관식 검토 사항 (건별 LLM 질의)</h2>
 <ul>{subj_html}</ul>
 <p class="muted">※ 주관식은 자동 룰 판정 대상이 아니며, 앱에서 생성된 프롬프트로 LLM에 건별 질의하여 답변을 채웁니다.</p>

 <h2>3. 적용 법령 요약</h2>
 <p class="muted">{data.get('jurisdiction_note','')}</p>
 <table>{law_rows}</table>
 <h3>최근 개정 타임라인 (확정 여부 포함)</h3><ul>{timeline}</ul>

 <h2>4. 우리 회사 현행 HR 제도 ({hc_txt})</h2>
 <h3>정량 입력값</h3><table>{base_rows}</table>
 <h3>국가 핵심 제도별 운영 기준</h3><table>{spec_rows}</table>

 <hr><p class="muted">※ 본 리포트는 사전 수집된 법령 데이터(기준시점 {data.get('as_of','')})와 자동 룰 판정에 기반하며, 최종 의사결정 전 현지 노무사/변호사 확인이 필요합니다.</p>

<script>
 // 게이지 + 카드 카운트업 애니메이션
 window.addEventListener('load', function() {{
   var mf = document.getElementById('meterfill');
   var s = parseInt(mf.getAttribute('data-score'), 10) || 0;
   setTimeout(function() {{ mf.style.width = s + '%'; }}, 150);
   var st = document.getElementById('scoreTxt'); var cur = 0;
   var t = setInterval(function() {{
     cur += Math.max(1, Math.round(s/30));
     if (cur >= s) {{ cur = s; clearInterval(t); }}
     st.textContent = cur;
   }}, 30);
   document.querySelectorAll('.card .num').forEach(function(el) {{
     var n = parseInt(el.getAttribute('data-n'), 10) || 0, c = 0;
     if (n === 0) return;
     var iv = setInterval(function() {{
       c += Math.max(1, Math.round(n/20));
       if (c >= n) {{ c = n; clearInterval(iv); }}
       el.textContent = c;
     }}, 40);
   }});
 }});
 // 진단 결과 필터
 function filt(btn, lvl) {{
   document.querySelectorAll('.filters button').forEach(function(b) {{ b.classList.remove('active'); }});
   btn.classList.add('active');
   document.querySelectorAll('#findTable tbody tr').forEach(function(tr) {{
     tr.style.display = (lvl === 'all' || tr.getAttribute('data-level') === lvl) ? '' : 'none';
   }});
 }}
</script>
</body></html>"""


# ──────────────────────────────────────────────────────────────
# 디자인 (CSS) · 오렌지(#F04C23) 테마
# ──────────────────────────────────────────────────────────────
def inject_css():
    st.markdown(f"""
    <style>
    @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css');

    :root {{
        --brand: {BRAND};
        --brand-dark: {BRAND_DARK};
        --brand-soft: {BRAND_SOFT};
        --brand-line: {BRAND_LINE};
    }}

    html, body, [class*="css"] {{
        font-family: 'Pretendard', 'Malgun Gothic', 'Segoe UI', sans-serif;
    }}

    /* 본문 상단 여백 축소 */
    .block-container {{ padding-top: 1.6rem; }}

    /* ── 히어로 배너 ── */
    .ghr-hero {{
        background: linear-gradient(120deg, {BRAND} 0%, #FF7A4D 60%, #FF9A6B 100%);
        border-radius: 18px;
        padding: 26px 30px;
        color: #fff;
        box-shadow: 0 10px 30px rgba(240,76,35,0.28);
        margin-bottom: 18px;
        position: relative;
        overflow: hidden;
    }}
    .ghr-hero::after {{
        content: "🌐";
        position: absolute; right: 22px; top: 50%;
        transform: translateY(-50%);
        font-size: 92px; opacity: 0.14;
    }}
    .ghr-hero h1 {{ margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.5px; }}
    .ghr-hero p {{ margin: 8px 0 0; font-size: 14.5px; opacity: 0.95; }}

    /* ── 버튼 ── */
    .stButton > button, .stDownloadButton > button {{
        border-radius: 10px;
        font-weight: 700;
        border: 1.5px solid var(--brand-line);
        transition: all .15s ease;
    }}
    .stButton > button:hover, .stDownloadButton > button:hover {{
        border-color: var(--brand);
        color: var(--brand);
        transform: translateY(-1px);
    }}
    /* primary 버튼 */
    .stButton > button[kind="primary"], .stDownloadButton > button[kind="primary"] {{
        background: var(--brand); border-color: var(--brand); color: #fff;
    }}
    .stButton > button[kind="primary"]:hover, .stDownloadButton > button[kind="primary"]:hover {{
        background: var(--brand-dark); border-color: var(--brand-dark); color: #fff;
        box-shadow: 0 6px 16px rgba(240,76,35,0.35);
    }}

    /* ── 사이드바 ── */
    [data-testid="stSidebar"] {{
        background: var(--brand-soft);
        border-right: 1px solid var(--brand-line);
    }}
    [data-testid="stSidebar"] h2, [data-testid="stSidebar"] h1 {{ color: var(--brand-dark); }}

    /* ── 헤더/제목 ── */
    h2, h3 {{ letter-spacing: -0.3px; }}
    .main h2 {{
        border-left: 5px solid var(--brand);
        padding-left: 12px;
    }}

    /* ── metric 카드 ── */
    [data-testid="stMetric"] {{
        background: #fff;
        border: 1px solid var(--brand-line);
        border-radius: 14px;
        padding: 14px 16px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.04);
    }}
    [data-testid="stMetricValue"] {{ font-size: 30px; font-weight: 800; }}

    /* ── expander ── */
    [data-testid="stExpander"] {{
        border: 1px solid var(--brand-line);
        border-radius: 12px;
        overflow: hidden;
    }}
    [data-testid="stExpander"] summary:hover {{ color: var(--brand); }}

    /* ── 입력 위젯 포커스 ── */
    input:focus, textarea:focus {{ border-color: var(--brand) !important; }}

    /* ── 탭 강조 ── */
    .stTabs [aria-selected="true"] {{ color: var(--brand) !important; }}
    .stTabs [data-baseweb="tab-highlight"] {{ background: var(--brand) !important; }}

    /* ── 칩(배지) ── */
    .ghr-chip {{
        display:inline-block; padding:3px 11px; border-radius:999px;
        font-size:12.5px; font-weight:700; margin:2px 4px 2px 0;
    }}
    .ghr-chip.on  {{ background:#FEE2E2; color:#B91C1C; }}
    .ghr-chip.off {{ background:#F1F5F9; color:#64748B; }}
    .ghr-chip.brand {{ background:var(--brand-soft); color:var(--brand-dark); border:1px solid var(--brand-line); }}

    /* divider 색 */
    hr {{ border-color: var(--brand-line); }}
    </style>
    """, unsafe_allow_html=True)


def render_hero():
    st.markdown(f"""
    <div class="ghr-hero">
        <h1>글로벌 HR 노동법 컴플라이언스 점검</h1>
        <p>국가·도시별 법령과 우리 회사 제도를 비교하고, 사업장 규모에 맞춰 자동으로 리스크를 진단합니다.</p>
    </div>
    """, unsafe_allow_html=True)


def collect_size_rules(data: dict) -> list:
    """데이터 전체를 훑어 규모(applies_if) 조건이 걸린 점검 항목을 수집."""
    found = []

    def walk(node, label_hint=""):
        if isinstance(node, dict):
            if "applies_if" in node and isinstance(node["applies_if"], dict):
                c = node["applies_if"]
                if c.get("field") == "headcount":
                    found.append({
                        "label": node.get("label", label_hint or "규모 조건 항목"),
                        "op": c.get("op", ">="),
                        "value": c.get("value"),
                        "basis": node.get("based_on") or node.get("legal_basis", ""),
                    })
            for k, v in node.items():
                walk(v, node.get("name", node.get("label", label_hint)))
        elif isinstance(node, list):
            for x in node:
                walk(x, label_hint)

    walk(data)
    return found


def _op_holds(cur, op, val):
    if cur is None or val is None:
        return None
    return {">=": cur >= val, "<=": cur <= val, ">": cur > val,
            "<": cur < val, "==": cur == val}.get(op)


def render_size_panel(data: dict, headcount: float):
    """규모별 적용 규제를 헤드카운트 기준으로 표시."""
    rules_list = collect_size_rules(data)
    if not rules_list:
        st.success(f"이 국가 데이터에는 **직원 수에 따라 달라지는 규제가 별도로 등록되어 있지 않습니다.** "
                   f"(입력하신 상시 직원 수 {headcount:g}명은 일반 기준으로 점검됩니다.)")
        return
    st.caption("입력한 직원 수를 기준으로 각 규제의 적용 여부를 자동 판정합니다. "
               "직원 수를 바꾸면 적용 대상이 실시간으로 바뀝니다.")
    for r in rules_list:
        applies = _op_holds(headcount, r["op"], r["value"])
        if applies:
            chip = "<span class='ghr-chip on'>● 적용 대상</span>"
        else:
            chip = "<span class='ghr-chip off'>○ 미해당</span>"
        thr = f"직원 {r['op']} {r['value']}명"
        st.markdown(
            f"{chip} <b>{r['label']}</b> &nbsp;"
            f"<span class='ghr-chip brand'>{thr}</span>"
            + (f"<br><span style='color:#6b7280;font-size:12.5px;'>근거: {r['basis']}</span>" if r["basis"] else ""),
            unsafe_allow_html=True,
        )


def render_gauge(counts: dict):
    """JS 애니메이션 리스크 게이지 (components.html)."""
    total = max(1, counts["high"] + counts["medium"] + counts["ok"] + counts["info"])
    high, med, ok, info = counts["high"], counts["medium"], counts["ok"], counts["info"]
    # 위험 점수: high 가중치 높게
    score = round(100 * (high * 1.0 + med * 0.5) / total)
    bars = [
        ("위반 소지", high, LEVEL_COLOR["high"]),
        ("주의", med, LEVEL_COLOR["medium"]),
        ("적합", ok, LEVEL_COLOR["ok"]),
        ("수동확인", info, LEVEL_COLOR["info"]),
    ]
    bar_html = ""
    for name, n, col in bars:
        pct = round(100 * n / total)
        bar_html += f"""
        <div class="row">
          <span class="lbl">{name}</span>
          <div class="track"><div class="fill" style="--c:{col}" data-w="{pct}"></div></div>
          <span class="num">{n}</span>
        </div>"""

    html = f"""
    <div id="gauge" style="font-family:'Pretendard','Malgun Gothic',sans-serif;">
      <div class="hdr">종합 리스크 지수
        <b id="score" style="color:{BRAND};">0</b><span style="color:#9ca3af;">/100</span>
      </div>
      <div class="meter"><div id="meterfill"></div></div>
      {bar_html}
    </div>
    <style>
      #gauge .hdr {{ font-size:15px; font-weight:700; color:#1f2937; margin-bottom:8px; }}
      #gauge .hdr b {{ font-size:26px; }}
      #gauge .meter {{ height:12px; background:#F1F5F9; border-radius:999px; overflow:hidden; margin-bottom:16px; }}
      #gauge #meterfill {{ height:100%; width:0%;
          background:linear-gradient(90deg,#16A34A,#F59E0B 55%,#DC2626);
          border-radius:999px; transition:width 1.1s cubic-bezier(.2,.8,.2,1); }}
      #gauge .row {{ display:flex; align-items:center; gap:10px; margin:7px 0; }}
      #gauge .lbl {{ width:72px; font-size:13px; color:#374151; }}
      #gauge .num {{ width:26px; text-align:right; font-weight:700; font-size:13px; color:#374151; }}
      #gauge .track {{ flex:1; height:10px; background:#F1F5F9; border-radius:999px; overflow:hidden; }}
      #gauge .fill {{ height:100%; width:0%; background:var(--c); border-radius:999px;
          transition:width .9s cubic-bezier(.2,.8,.2,1); }}
    </style>
    <script>
      (function() {{
        const score = {score};
        setTimeout(function() {{
          document.getElementById('meterfill').style.width = score + '%';
          document.querySelectorAll('#gauge .fill').forEach(function(el) {{
            el.style.width = el.getAttribute('data-w') + '%';
          }});
          let cur = 0;
          const tick = setInterval(function() {{
            cur += Math.max(1, Math.round(score/28));
            if (cur >= score) {{ cur = score; clearInterval(tick); }}
            document.getElementById('score').textContent = cur;
          }}, 28);
        }}, 120);
      }})();
    </script>
    """
    components.html(html, height=210)


# ──────────────────────────────────────────────────────────────
# Streamlit UI
# ──────────────────────────────────────────────────────────────
st.set_page_config(page_title="글로벌 HR 컴플라이언스 점검", page_icon="🌐", layout="wide")
inject_css()

for key in ["data", "findings", "report_ctx"]:
    if key not in st.session_state:
        st.session_state[key] = None

# ── 사이드바 ①: 국가 선택 + 법령 불러오기 ──
with st.sidebar:
    st.header("🌐 해외사업장 ER 점검")
    st.caption("아래 순서대로 진행하세요.")
    st.markdown("**1단계 · 국가 선택**")
    choice = st.selectbox("대상 국가 — 도시", list(COUNTRY_CITY_FILES.keys()), label_visibility="collapsed")
    st.caption("도시는 주/지역별 법 차이(예: 미국 텍사스)를 반영해 한정되어 있습니다.")
    if st.button("🔍 노동법령·판례 불러오기", type="primary", use_container_width=True):
        st.session_state["data"] = load_data(COUNTRY_CITY_FILES[choice])
        st.session_state["findings"] = None
        st.session_state["report_ctx"] = None
    if st.button("🔄 처음부터 다시", use_container_width=True):
        for k in ["data", "findings", "report_ctx"]:
            st.session_state[k] = None
        st.rerun()

render_hero()

data = st.session_state["data"]

if not data:
    st.info("⬅️ 왼쪽 사이드바에서 **국가를 선택**하고 **‘노동법령·판례 불러오기’**를 누르면 시작됩니다.")
    st.caption("API 키 불필요 · 사전 수집된 8개국 법령 데이터(기준시점 2026-06) 기반 · 룰 자동 판정")
else:
    std = data["standards"]
    mw = std.get("min_wage", {})

    # ── 본문: 법령 ──
    st.header(f"📜 {data['country']} ({data['city']}) 노동법령 / 판례")
    render_law_section(data)

    # ── 본문: 사업장 규모 ──
    st.divider()
    st.header("🏢 사업장 규모 (직원 수)")
    st.caption("직원 수에 따라 의무가 달라지는 규제(예: 취업규칙·고충처리·여성위원회 등)를 자동 반영합니다.")
    sc1, sc2 = st.columns([1, 2])
    with sc1:
        headcount = st.number_input(
            "이 사업장 상시 직원 수 (명)", min_value=1.0, max_value=1000000.0,
            value=float(st.session_state.get("headcount_val", 50)), step=1.0, key="in_headcount",
            help="해당 사업장에서 상시 근무하는 직원 수를 입력하세요. 여러 사업장은 각각 점검하세요.")
        st.session_state["headcount_val"] = headcount
    with sc2:
        with st.container(border=True):
            st.markdown("**📏 규모별 적용 규제 판정**")
            render_size_panel(data, headcount)

    # ── 본문: 제도 입력 ──
    st.divider()
    st.header("📝 우리 회사 제도 입력")
    st.caption("기본값은 '해당 국가 법정 기준값'으로 채워져 있습니다. 우리 회사 실제 값으로 ▲▼ 조절하세요.")

    st.subheader("정량 항목 (숫자 — 자동 판정)")
    c1, c2, c3 = st.columns(3)
    with c1:
        std_weekly = st.number_input(
            "우리 정규 주당 근로시간", min_value=0.0, max_value=120.0,
            value=_f(std.get("standard_weekly_hours"), 40), step=1.0, key="in_std",
            help=f"법정 표준: {std.get('standard_weekly_hours')}시간")
        _max_def = std.get("max_weekly_hours_incl_overtime") or std.get("standard_weekly_hours") or 52
        max_weekly = st.number_input(
            "우리 최대 주당 근로시간(연장 포함)", min_value=0.0, max_value=168.0,
            value=_f(_max_def, 52), step=1.0, key="in_max",
            help=f"법정 최대: {std.get('max_weekly_hours_incl_overtime') or '상한없음/협정방식'}")
    with c2:
        annual_leave = st.number_input(
            "우리 연차 부여일수(연)", min_value=0.0, max_value=365.0,
            value=_f(std.get("annual_leave_min_days"), 0), step=1.0, key="in_leave",
            help=f"법정 최소: {std.get('annual_leave_min_days')}일")
        notice_days = st.number_input(
            "우리 해고 예고기간(일)", min_value=0.0, max_value=365.0,
            value=_f(std.get("termination_notice_min_days"), 0), step=1.0, key="in_notice",
            help=f"법정: {std.get('termination_notice_min_days') or '없음/특수'}")
    with c3:
        _wage_def = mw.get("amount") if (mw.get("period") == "월" and isinstance(mw.get("amount"), (int, float))) else 0
        monthly_wage = st.number_input(
            f"우리 월 기본급 ({mw.get('currency','현지통화')})", min_value=0.0,
            value=_f(_wage_def, 0), step=100.0, key="in_wage",
            help=f"법정 최저임금: {fmt_amount(mw)} · 0이면 비교 생략")

    # 구조화 점검 (국가 특유 제도)
    st.subheader("이 국가 핵심 제도별 점검")
    st.caption("✅ 자동판정(숫자/예-아니오/선택) · 🏷️ 자가진단(점검 상태 선택). 숫자 기본값은 법정 기준값입니다.")
    specific_inputs = {}
    check_values = {}
    for i, item in enumerate(data.get("country_specifics", [])):
        name = item.get("name", f"제도 {i+1}")
        checks = item.get("checks", [])
        has_auto = any(c.get("type") in ("number_min", "number_max", "boolean", "choice") for c in checks)
        icon = "✅" if has_auto else "🏷️"
        with st.expander(f"{icon} {name}", expanded=(i == 0)):
            st.caption(item.get("detail", ""))
            if item.get("risk_hint"):
                st.markdown(f"⚠️ **유의점:** {item['risk_hint']}")
            parts = []
            for chk in checks:
                cid, t = chk["id"], chk["type"]
                lbl, unit = chk.get("label", name), chk.get("unit", "")
                if t in ("number_min", "number_max"):
                    thr = chk.get("threshold")
                    sign = "최소" if t == "number_min" else "최대"
                    v = st.number_input(
                        f"{lbl} ({unit})" if unit else lbl,
                        min_value=0.0, value=_f(thr, chk.get("default", 0)), step=1.0,
                        key=f"chk_{cid}", help=f"법정 기준: {sign} {thr}{unit}")
                    check_values[cid] = v
                    parts.append(f"{lbl}={v:g}{unit}")
                elif t == "boolean":
                    v = st.radio(lbl, ["예", "아니오", "해당 없음"], index=2, key=f"chk_{cid}",
                                 horizontal=True, help=chk.get("legal_basis", ""))
                    check_values[cid] = v
                    parts.append(f"{lbl}={v}")
                elif t == "choice":
                    opts = [o["label"] for o in chk.get("options", [])]
                    v = st.selectbox(lbl, opts, key=f"chk_{cid}", help=chk.get("legal_basis", ""))
                    check_values[cid] = v
                    parts.append(f"{lbl}={v}")
                elif t == "posture":
                    opts = ["점검 완료 · 문제 없음", "점검했으나 미흡/리스크 있음", "미점검 / 모름", "해당 없음"]
                    v = st.selectbox(lbl + " (자가진단)", opts, index=2, key=f"chk_{cid}",
                                     help=chk.get("legal_basis", ""))
                    check_values[cid] = v
                    parts.append(f"{lbl}={v}")
            memo = st.text_area("추가 메모(선택)", key=f"memo_{i}", placeholder="특이사항·예외 등")
            if memo.strip():
                parts.append(f"메모: {memo.strip()}")
            specific_inputs[name] = " · ".join(parts)

    # 최근 3개년 개정 대응 점검
    amend_values = {}
    amend_list = data.get("amendment_checks", [])
    if amend_list:
        st.subheader("📌 최근 3개년 개정 대응 점검")
        st.caption("최근 개정·판례에 따라 반드시 점검해야 할 항목입니다. **기본값은 '미반영(아니오)'** 이며, 이미 반영한 항목만 '예'로 바꾸세요. 미반영은 위험으로 표시됩니다.")
        for chk in amend_list:
            cid = chk["id"]
            badge = STATUS_BADGE.get(chk.get("status", ""), "")
            with st.container(border=True):
                st.markdown(f"**{chk.get('label','')}**")
                st.caption(f"근거 개정: {chk.get('based_on','')}　{badge}")
                if chk["type"] == "posture":
                    opts = ["점검 완료 · 문제 없음", "점검했으나 미흡/리스크 있음", "미점검 / 모름", "해당 없음"]
                    amend_values[cid] = st.selectbox(
                        "점검 상태", opts, index=2, key=f"am_{cid}",
                        help=chk.get("legal_basis", ""), label_visibility="collapsed")
                else:  # boolean
                    amend_values[cid] = st.radio(
                        "우리 회사 반영 여부", ["예", "아니오", "해당 없음"], index=1,
                        key=f"am_{cid}", horizontal=True,
                        help=chk.get("legal_basis", ""), label_visibility="collapsed")

    # 주관식
    st.subheader("주관식 질문 (건별 LLM 질의)")
    st.caption("한 줄에 하나씩 적으면, 질문마다 'LLM에 붙여넣을 프롬프트'를 만들어 드립니다.")
    subj_raw = st.text_area(
        "주관식 질문 (한 줄에 하나)",
        placeholder="예) 포괄임금제가 이 나라에서 문제가 되나요?\n주 4일제 도입 시 법적으로 걸리는 부분은?",
        height=80, label_visibility="collapsed",
    )
    questions = [q.strip() for q in subj_raw.splitlines() if q.strip()]

    base_inputs = {
        "정규 주당 근로시간": f"{std_weekly:g} 시간",
        "최대 주당 근로시간": f"{max_weekly:g} 시간",
        "연차 부여일수": f"{annual_leave:g} 일",
        "해고 예고기간": f"{notice_days:g} 일",
        "월 기본급": (f"{monthly_wage:,.0f} {mw.get('currency','')}" if monthly_wage else "(미입력)"),
    }
    numeric_inputs = {
        "std_weekly": std_weekly, "max_weekly": max_weekly,
        "annual_leave": annual_leave, "notice_days": notice_days,
        "monthly_wage": monthly_wage if monthly_wage else None,
    }

    subjective_answers = {}
    if questions:
        st.markdown("##### 📋 질문별 LLM 프롬프트 (복사해서 Claude/claude.ai 등에 붙여넣기)")
        for i, q in enumerate(questions):
            with st.expander(f"Q{i+1}. {q}", expanded=False):
                st.code(build_llm_prompt(data, q, base_inputs, specific_inputs), language="text")
                subjective_answers[q] = st.text_area(
                    "LLM 답변 붙여넣기 (선택 — 리포트에 포함)",
                    key=f"ans_{i}", placeholder="LLM이 준 답변을 붙여넣으면 최종 리포트에 들어갑니다.",
                )
    subj_items = [(q, subjective_answers.get(q, "")) for q in questions]

    # ── 사이드바 ②: Risk 분석 + 리포트 (입력 변수 확보 후 렌더) ──
    with st.sidebar:
        st.divider()
        st.markdown("**2단계 · 분석 실행**")
        if st.button("⚖️ 일괄 Risk 분석하기", type="primary", use_container_width=True):
            context = {"headcount": headcount}
            st.session_state["findings"] = (
                rules.evaluate(data, numeric_inputs)
                + rules.evaluate_specifics(data, check_values, context)
                + rules.evaluate_amendment_checks(data, amend_values, context)
            )
            st.session_state["report_ctx"] = (base_inputs, specific_inputs, subj_items, headcount)

        st.markdown("**3단계 · 리포트**")
        if st.session_state["findings"] is not None and st.session_state["report_ctx"] is not None:
            b_in, s_in, subj_saved, hc_saved = st.session_state["report_ctx"]
            html_report = build_html_report(data, b_in, s_in, subj_saved, st.session_state["findings"], hc_saved)
            st.download_button(
                "📄 최종 리포트(HTML) 다운로드",
                data=html_report.encode("utf-8"),
                file_name=f"compliance_report_{data['country']}_{datetime.date.today().isoformat()}.html",
                mime="text/html", use_container_width=True)
        else:
            st.caption("분석을 실행하면 리포트 다운로드가 활성화됩니다.")

    # ── 본문: 분석 결과 ──
    if st.session_state["findings"] is not None:
        st.divider()
        st.header("⚖️ Risk 분석 결과")
        findings = st.session_state["findings"]
        counts = rules.summarize(findings)
        gcol, mcol = st.columns([1, 1])
        with gcol:
            render_gauge(counts)
        with mcol:
            m1, m2 = st.columns(2)
            m3, m4 = st.columns(2)
            m1.metric("🔴 위반 소지", counts["high"])
            m2.metric("🟡 주의", counts["medium"])
            m3.metric("🟢 적합", counts["ok"])
            m4.metric("🔎 수동확인", counts["info"])
        st.caption("입력을 변경했다면 사이드바에서 ‘일괄 Risk 분석하기’를 다시 눌러 갱신하세요.")

        order = {"high": 0, "medium": 1, "info": 2, "ok": 3}
        for f in sorted(findings, key=lambda x: order.get(x["level"], 9)):
            with st.container(border=True):
                st.markdown(f"**{rules.LEVEL_LABEL[f['level']]} · {f['category']}** — {f['title']}")
                st.caption(f["detail"])
                st.markdown(f"- 법적 근거: {f['legal_basis']}\n- 권고: **{f['recommendation']}**")

        if subj_items:
            st.markdown("#### 📝 주관식 (건별 LLM 질의 대상)")
            st.warning("아래 질문은 룰 자동 판정 대상이 아닙니다. 위 입력란에서 생성된 프롬프트로 LLM에 건별 질의하세요.")
            for i, (q, ans) in enumerate(subj_items, 1):
                st.markdown(f"**Q{i}. {q}** — {'✅ 답변 입력됨' if ans.strip() else '⬜ 답변 미입력'}")
