# 법령 데이터 스키마 (data/*.json)

국가·도시 1곳 = JSON 파일 1개. 프론트엔드(`web/`)는 `tools/sync_web_data.py`가 만든 `web/data.js`를 읽는다.
JSON을 고친 뒤에는 `python tools/validate_data.py` → `python tools/sync_web_data.py` 순서로 실행한다.

## 1. HR 카테고리 (domain) — 고정 7개

모든 점검 항목·국가 특유 제도·개정 타임라인·판례에 `domain` 키를 단다(아래 영문 키 중 하나).

| key | 화면 이름 | 범위 |
|---|---|---|
| `hire` | 채용·근로계약 | 근로계약 서면·필수기재, 수습, 기간제·정규직 전환, 파견·도급·위장 자영업, 외국인 고용·취업허가, 채용 차별 |
| `time` | 근로시간·안전보건 | 법정·최대 근로시간, 연장근로 한도·협정, 휴게·주휴, 근태기록, 과로·산업안전보건 |
| `leave` | 휴가·휴직 | 연차, 병가, 출산·육아·가족돌봄, 기타 법정휴가 |
| `pay` | 임금·보상 | 최저임금, 연장·휴일 가산, 지급 주기·방법, 법정 수당(13·14월 급여, 명절수당, 휴가수당), 임금 정의, 동일임금·임금 투명성 |
| `benefits` | 사회보험·복리후생 | 사회보험·연금·산재·고용보험 가입·납부, 법정 복리후생 |
| `people` | 인사운영·노사관계 | 취업규칙·단체협약, 근로자대표·노조·종업원평의회 협의, 평가·징계·전보, 괴롭힘·차별, 직원 개인정보, 내부고발, 공시 의무, 경업금지, 정년 |
| `exit` | 퇴직·해고 | 해고 사유·절차, 예고, 퇴직금·해고수당, 정리해고 승인·협의, 해고 분쟁 |

판단 기준: **그 항목을 어긴 결과가 주로 어느 HR 업무에서 터지는가**. 예) 고정잔업수당 유효성 → `pay`, 36협정 → `time`, 저성과 해고 증빙 → `exit`, 경업금지 → `people`.

## 2. 최상위 필드

| 필드 | 설명 |
|---|---|
| `country`, `city`, `currency`, `as_of`, `jurisdiction_note` | 기본 정보 |
| `standards` | 핵심 법정 기준 수치·서술 (아래 3장) |
| `domain_briefs` | `{domain: "이 관할에서 해당 영역의 핵심 법적 요구 2~4문장"}` — 7개 모두 작성, 한국어, 사실만 |
| `standard_checks[]` | 공통 점검 항목 (check 스키마 + `domain` + `category`) |
| `country_specifics[]` | 국가 특유 제도 `{name, domain, detail, risk_hint, dispute_risk?, dispute_note?, checks[]}` — check 는 item 의 domain 을 따르며 다르면 check 에 `domain` 지정 |
| `amendment_checks[]` | 최근 3개년 개정 대응 점검 (check 스키마 + `domain` + `based_on` + `status`) |
| `amendment_timeline[]` | `{date, title, impact, status, effective_date?, confirmed, domain}` |
| `precedents[]` | `{title, issue, implication, domain}` |
| `sources[]` | `{title, url}` — 1차 출처 우선 |
| `verification` | 검증 기록 `{last_verified, verified_by, confidence, issues_found[], notes}` |

## 3. standards → 카테고리 매핑 (화면 표시용, 고정)

`standard_weekly_hours`, `max_weekly_hours_incl_overtime` → time · `overtime_premium` → pay · `min_wage` → pay ·
`annual_leave_min_days`, `sick_leave` → leave · `probation` → hire · `social_insurance` → benefits ·
`termination_notice_min_days`, `severance` → exit

## 4. check 스키마

```json
{ "id": "jp_harass_policy",            // 파일 전체에서 유일, 국가 접두어
  "domain": "people",
  "category": "괴롭힘·차별",           // standard_checks 만: 아래 통일 분류명 중 하나
  "label": "직장 내 괴롭힘 방지 방침·상담창구 운영",
  "type": "boolean",                    // number_min | number_max | boolean | choice | posture
  "threshold": 60, "unit": "분",        // number_* 만
  "options": [{"label": "...", "level": "ok|medium|high|info", "detail": "..."}],  // choice 만
  "applies_if": {"field": "headcount", "op": ">=", "value": 50},  // 인원 규모 조건(선택)
  "fail_level": "high",                 // 미이행 시 등급: high(법 위반) | medium(권고·리스크)
  "legal_basis": "법령명 조항: 요구 내용",
  "recommendation": "실무 조치 한 문장" }
```

- `boolean`: 법정 의무 이행 여부(예/아니오/해당 없음). `posture`: 맥락형 자가진단(문제 없음/미흡/미점검/해당 없음).
- 기본값은 모두 **미응답** — 사용자가 답한 항목만 판정·리스크 지수에 반영된다.

### standard_checks 통일 분류명 (category)

hire: `근로계약` · `수습기간` · `기간제·파견` · `외국인 고용`
time: `휴게시간` · `주휴일` · `근태기록` · `안전보건`
leave: `연차` · `병가` · `출산·육아` · `기타 휴가`
pay: `임금지급` · `법정수당` · `동일임금·임금투명성`
benefits: `사회보험`
people: `취업규칙·단체협약` · `근로자대표·노사협의` · `괴롭힘·차별` · `개인정보` · `내부고발` · `공시` · `경업금지`
exit: `해고절차` · `해고보상`

## 5. 품질 원칙

- 숫자·날짜·조항은 1차 출처(정부·관보·법원)로 확인한다. 확인 못 한 것은 `confirmed: false` 또는 `verification.issues_found`에 남긴다. 추정으로 채우지 않는다.
- 회사·개인 식별 정보는 데이터에 넣지 않는다.
