import streamlit as st
import datetime

# ── 페이지 기본 설정 ──────────────────────────────
st.set_page_config(page_title="Streamlit 데모", page_icon="✅", layout="centered")

# ── 제목 ─────────────────────────────────────────
st.title("✅ Streamlit 데모 앱")
st.write("축하합니다! 파이썬 파일 하나로 만든 웹 화면이 지금 브라우저에 떠 있습니다. 🎉")

st.divider()

# ── 입력 위젯들 ──────────────────────────────────
st.subheader("1. 입력해보기")

name = st.text_input("이름을 입력하세요", value="홍길동")

country = st.selectbox(
    "담당 국가를 선택하세요",
    ["한국", "일본", "베트남", "독일", "프랑스"],
)

if st.button("인사하기"):
    st.success(f"안녕하세요, {name}님! 현재 선택하신 국가는 **{country}** 입니다.")

st.divider()

# ── 슬라이더 + 결과 표시 ─────────────────────────
st.subheader("2. 값 조절해보기")

hours = st.slider("주당 근로시간", min_value=0, max_value=80, value=52)

if hours > 52:
    st.error(f"⚠️ 주 {hours}시간 — 한국 기준(주 52시간)을 초과합니다.")
else:
    st.info(f"주 {hours}시간 — 기준 이내입니다.")

st.divider()

# ── 표 보여주기 ──────────────────────────────────
st.subheader("3. 표로 보기")

st.table(
    {
        "국가": ["한국", "일본", "베트남"],
        "주당 최대 근로시간": ["52시간", "40시간 + 연장", "48시간"],
        "연차 시작일수": ["15일", "10일", "12일"],
    }
)

st.caption(f"오늘 날짜: {datetime.date.today()} · 이 화면은 demo_app.py 파일에서 생성되었습니다.")
