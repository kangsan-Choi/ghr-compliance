# 글로벌 HR 컴플라이언스 앱 실행 스크립트
# 사용법: PowerShell에서  ./run_app.ps1  실행 (또는 파일 우클릭 > PowerShell로 실행)
$py = "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe"
& $py -m streamlit run "$PSScriptRoot\compliance_app.py" --server.port 8501
