# 🌐 글로벌 HR 노동법 컴플라이언스 점검 (Global ER Compliance)

해외 법인의 노동법(ER) 리스크를 국가·도시별 법령과 사내 제도를 비교해 진단하는 웹 앱입니다.
서버·API 키 없이, 사전 수집·검증한 법령 데이터와 룰 기반 판정으로 브라우저에서 동작합니다.

## 주요 기능
- 8개 관할: 미국 휴스턴 · 중국 베이징 · 일본 도쿄 · 러시아 모스크바 · 네덜란드 암스테르담 · 스페인 카르타헤나 · 인도네시아 두마이 · 인도 구르가온
- **HR 7개 영역** 구성: 채용·근로계약 / 근로시간·안전보건 / 휴가·휴직 / 임금·보상 / 사회보험·복리후생 / 인사운영·노사관계 / 퇴직·해고
- 영역마다 법정 기준 → 최근 개정·판례 → 우리 회사 점검 → 판정을 한 화면에
- 기본값은 **미응답** — 답한 항목만 판정하고, 리스크 지수도 판정된 항목만으로 계산
- 사업장 직원 수에 따른 규모별 의무 자동 적용, 최근 개정·분쟁 다발 항목 표시
- 카테고리별 HTML 최종 리포트(인쇄·PDF), 추가 질문용 AI 프롬프트 생성

## 폴더 구성
| 항목 | 설명 |
|---|---|
| `web/` | **앱 본체** — `index.html` 더블클릭으로 실행 (HTML/CSS/JS, 빌드 도구 불필요) |
| `web/rules.js` | 룰 기반 판정 엔진 |
| `web/data.js` | 법령 데이터 묶음 (자동 생성 — 직접 수정 금지) |
| `data/*.json` | 국가별 법령 데이터 원본 |
| `data/SCHEMA.md` | 데이터 구조·HR 영역·분류명 규칙 |
| `tools/validate_data.py` | 데이터 구조 검사 |
| `tools/sync_web_data.py` | `data/*.json` → `web/data.js` 갱신 |
| `build_firebase.py` · `firebase.json` | 배포용 정적 빌드(`public/`) |
| `archive_streamlit/` | 이전 Streamlit 버전(사용 중지, 참고용 보관) |
| `archive_html_초기버전/` | 초기 HTML 버전(참고용 보관) |

## 실행
`web/index.html` 을 더블클릭해 브라우저로 엽니다.

## 법령 데이터를 고쳤을 때
```powershell
python tools/validate_data.py     # 구조 검사 (오류 0건이어야 함)
python tools/sync_web_data.py     # 앱에 반영
```

## 배포
`python build_firebase.py` 로 만든 `public/` 폴더는 정적 사이트라 어떤 호스팅에도 올릴 수 있습니다.
Firebase Hosting 예:
```powershell
npm install -g firebase-tools         # 최초 1회
firebase login                        # 최초 1회
firebase use --add                    # 최초 1회: Firebase 프로젝트 선택
python build_firebase.py
firebase deploy --only hosting
```

---
※ 진단 결과는 참고용이며, 최종 의사결정 전 현지 노무사/변호사 확인이 필요합니다.
