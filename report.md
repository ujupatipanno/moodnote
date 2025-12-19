# 커서 위치 로직 보고

## 요약
명령어 실행 후 에디터는 오늘 날짜 헤더(`### DD (ddd)`)가 있는 줄로 커서를 이동하며, `ch`는 헤더 문자열 길이만큼으로 설정됩니다. 헤더가 정확히 일치하지 않아 위치를 못 찾으면 문서 끝 줄로 폴백합니다.

## 상세 흐름
1. 파일 열기/생성 후 에디터 핸들러 획득
   - `const editor = view?.editor;` 없으면 종료.
2. 오늘 헤더 문자열/정규식 준비
   - `todayHeader = "### ${DD} (${ddd})"`
   - `headerRegex = /^###\s+DD\s+\([^)]\+\)/m`
3. 헤더 존재 검사 및 필요 시 삽입
   - `if (!headerRegex.test(content))` → 문서 끝에 `todayHeader + "\n\n"` 삽입.
   - 선행 줄바꿈은 문서가 비어있지 않고 마지막이 줄바꿈으로 끝나지 않을 때만 추가.
4. 커서 이동
   - `pos = editor.getValue().indexOf(todayHeader)`로 정확한 문자열 위치를 탐색.
   - `before = editor.getValue().slice(0, pos)`의 줄 수로 `line` 계산: `line = before.split("\n").length - 1`.
   - `editor.setCursor({ line, ch: todayHeader.length })`로 커서 설정.
   - Obsidian 에디터는 커서 이동 시 자동 스크롤.
5. 폴백
   - `pos < 0`이면 `lastLine = editor.lineCount() - 1`로 계산하고 `{ line: lastLine, ch: 0 }`로 이동.

## 설계 의도
- **정확 매칭 우선**: 헤더를 중복 삽입하지 않도록 정규식으로 존재를 판정하고, 위치 지정은 가독성을 위해 정확한 헤더 문자열로 찾습니다.
- **가독성**: 헤더 끝(`ch = todayHeader.length`)로 커서를 두어 바로 이어서 작성하거나 엔터 후 내용을 추가하기 편리합니다.
- **안전한 폴백**: 포맷이 살짝 다른 경우에도 동작을 멈추지 않고 문서 끝으로 이동합니다.

## 개선 제안(옵션)
- **정규식 기반 위치 지정**: `indexOf` 대신 정규식 매칭의 시작 오프셋을 사용하면 공백/이모지 등 포맷 변형에도 정확한 줄로 이동 가능합니다.
- **헤더 라인 강제 정규화**: 탐지 시 포맷이 미세하게 다른 헤더를 표준 포맷으로 교체하여 위치 지정의 일관성 확보.
