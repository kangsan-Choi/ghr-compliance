# 🌐 글로벌 HR 노동법 컴플라이언스 점검 (GHR Compliance Checker)

해외 법인의 노동법(ER) 리스크를 국가·도시별 법령과 사내 제도를 비교해 자동 진단하는 웹 앱입니다.
API 키 없이 사전 수집된 법령 데이터와 룰 기반 판정으로 동작합니다.

## 주요 기능
- 8개국(미국 휴스턴 · 중국 베이징 · 일본 도쿄 · 러시아 모스크바 · 네덜란드 암스테르담 · 스페인 카르타헤나 · 인도네시아 두마이 · 인도 구르가온) 법령 데이터
- 근로시간 · 연차 · 최저임금 · 해고 예고 등 정량 항목 자동 리스크 판정
- **사업장 직원 수(상시 인원)에 따른 규모별 규제 자동 적용**
- 최근 3개년 개정 타임라인 / 판례 / 개정 대응 점검
- 종합 리스크 게이지 + HTML 최종 리포트 다운로드(인쇄·PDF·필터 지원)

## 폴더 구성
| 항목 | 설명 |
|---|---|
| `compliance_app.py` | **메인 앱** (이 파일이 웹으로 실행됨) |
| `rules.py` | 룰 기반 리스크 판정 엔진 |
| `data/` | 국가별 법령 데이터(JSON) |
| `.streamlit/config.toml` | 디자인 테마(오렌지) 설정 |
| `requirements.txt` | 앱이 필요로 하는 파이썬 패키지 목록 |
| `build_firebase.py` · `firebase.json` | Firebase Hosting 배포용 정적 빌드(아래 참고) |
| `demo_app.py` | Streamlit 학습용 데모(배포와 무관) |
| `archive_html_초기버전/` | 초기 HTML 버전(참고용 보관) |

## 내 PC에서 실행
```powershell
streamlit run compliance_app.py
```
브라우저에서 http://localhost:8501 로 접속.

## 웹에 배포(누구나 링크로 접속)
[Streamlit Community Cloud](https://share.streamlit.io) 에 GitHub 저장소를 연결하고
메인 파일을 `compliance_app.py` 로 지정하면 공개 주소가 생성됩니다.

### Firebase Hosting 배포 (서버 없이, 잠들지 않음)
[stlite](https://github.com/whitphx/stlite)로 앱을 브라우저 안에서 실행하는 정적 사이트로 만들어 올립니다.
Streamlit Cloud처럼 일정 시간 미사용 시 잠드는 일이 없고, Firebase 무료(Spark) 요금제로 충분합니다.
첫 접속 시 파이썬 런타임을 내려받느라 10~20초 정도 걸립니다.

```powershell
python build_firebase.py              # public/ 폴더 생성 (data 수정 후에도 다시 실행)
npm install -g firebase-tools         # 최초 1회
firebase login                        # 최초 1회
firebase use --add                    # 최초 1회: Firebase 프로젝트 선택
firebase deploy --only hosting
```

---
※ 본 앱의 진단 결과는 참고용이며, 최종 의사결정 전 현지 노무사/변호사 확인이 필요합니다.
