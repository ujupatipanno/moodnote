# 커서 이동과 포커스의 실행 순서 분석

## 현재 구현 상태

```typescript
editor.setCursor({ line: targetLine, ch: targetCh });  // 1. 커서 이동
editor.focus();                                         // 2. 포커스
```

---

## 문제 증상

**보고된 문제:**
- moodnote에 내용이 길게 작성된 경우
- 명령어를 한 번 실행하면 스크롤이 완전히 이동하지 않음
- 명령어를 두 번 실행해야 제대로 스크롤됨

**분석:**
이는 스크롤이 두 단계로 나뉘어 발생함을 의미:
1. 첫 실행: 부분적 스크롤 (불완전)
2. 두 번째 실행: 나머지 스크롤 완료

---

## 옵션 1: 현재 순서 (커서 이동 → 포커스)

### 동작 흐름
```typescript
editor.setCursor({ line: targetLine, ch: targetCh });  // 커서 이동 시도
editor.focus();                                         // 포커스 설정
```

### 예상 동작
1. `setCursor()` 호출 시 CodeMirror가 내부적으로 스크롤 시도
2. 하지만 에디터에 포커스가 없으면 스크롤이 제대로 동작하지 않을 수 있음
3. `focus()` 호출 후 뷰가 업데이트되지만 이미 setCursor는 완료됨
4. **결과: 불완전한 스크롤**

### 문제점
- 포커스가 없는 상태에서 setCursor는 스크롤을 제대로 트리거하지 못할 수 있음
- CodeMirror는 포커스된 에디터에서 커서 이동을 더 잘 처리함

### 장점
- 직관적인 순서 (위치 설정 → 활성화)

---

## 옵션 2: 순서 변경 (포커스 → 커서 이동)

### 동작 흐름
```typescript
editor.focus();                                         // 먼저 포커스
editor.setCursor({ line: targetLine, ch: targetCh });  // 그다음 커서 이동
```

### 예상 동작
1. `focus()` 호출로 에디터가 완전히 활성화됨
2. 에디터의 뷰가 준비된 상태에서 `setCursor()` 호출
3. 포커스된 에디터에서 커서 이동이 발생하므로 스크롤이 제대로 트리거됨
4. **결과: 더 안정적인 스크롤**

### 장점
- 에디터가 활성 상태에서 커서 이동 처리
- 스크롤 동작이 더 신뢰성 있게 발생
- CodeMirror의 내부 동작과 더 잘 맞음

### 단점
- 약간 덜 직관적 (하지만 실용적)

---

## 옵션 3: 명시적 스크롤 메서드 추가

### 방법 A: scrollIntoView 사용
```typescript
editor.focus();
editor.setCursor({ line: targetLine, ch: targetCh });
editor.scrollIntoView({ line: targetLine, ch: targetCh }, true);
```

### 방법 B: CM6 API 직접 사용
```typescript
editor.focus();
const pos = editor.posToOffset({ line: targetLine, ch: targetCh });
editor.cm.dispatch({
    effects: EditorView.scrollIntoView(pos, { y: "center" })
});
editor.setCursor({ line: targetLine, ch: targetCh });
```

### 장점
- 스크롤을 명시적으로 제어
- 중앙 정렬 등 추가 옵션 가능

### 단점
- Obsidian API에서 scrollIntoView가 존재하는지 확인 필요
- 더 복잡한 코드
- CodeMirror 내부 API 의존

---

## 옵션 4: 비동기 처리로 타이밍 보장

### 방법: requestAnimationFrame 사용
```typescript
editor.focus();
await new Promise(resolve => requestAnimationFrame(resolve));
editor.setCursor({ line: targetLine, ch: targetCh });
```

### 설명
- `requestAnimationFrame`: 브라우저가 다음 프레임을 그리기 전에 실행
- 포커스 후 DOM이 완전히 업데이트될 시간을 줌
- 그다음 커서 이동을 수행하여 스크롤 보장

### 장점
- 렌더링 타이밍 문제 해결
- 추가 라이브러리 불필요

### 단점
- 비동기 코드 복잡도 증가
- 약간의 딜레이 (하지만 눈에 띄지 않음)

---

## 옵션 5: 복합 접근 (권장)

### 구현
```typescript
// 1. 먼저 포커스
editor.focus();

// 2. DOM 업데이트 대기
await new Promise(resolve => requestAnimationFrame(resolve));

// 3. 커서 이동 (자동으로 스크롤 트리거)
editor.setCursor({ line: targetLine, ch: targetCh });

// 4. 명시적 스크롤 (있다면)
if (typeof editor.scrollIntoView === 'function') {
    editor.scrollIntoView({ line: targetLine, ch: targetCh }, true);
}
```

### 장점
- 가장 안정적
- 여러 방어 레이어
- 다양한 환경에서 동작 보장

### 단점
- 코드가 가장 복잡

---

## 근본 원인 분석: 왜 두 번 실행하면 되는가?

### 첫 번째 실행
1. 파일이 열림
2. 커서 이동 시도 → 불완전한 스크롤
3. 포커스 설정
4. **하지만 이미 setCursor는 완료됨**

### 두 번째 실행
1. **파일이 이미 열려 있고 포커스되어 있음**
2. 커서 이동 → **이번엔 포커스된 상태에서 실행**
3. 스크롤이 제대로 동작 ✓

**결론:** 포커스된 상태에서 setCursor를 호출하면 스크롤이 제대로 됨

---

## CodeMirror 6 동작 원리

### setCursor의 내부 동작
1. 커서 위치를 변경
2. 에디터가 **포커스된 경우** 해당 위치를 화면에 보이도록 스크롤
3. 에디터가 **포커스되지 않은 경우** 스크롤 동작이 약하거나 생략될 수 있음

### focus의 내부 동작
1. DOM 요소에 포커스
2. 에디터 뷰 활성화
3. 현재 커서 위치를 기준으로 뷰 조정 (하지만 커서가 이미 설정된 경우 이동하지 않음)

---

## 실제 테스트 시나리오

### 시나리오: 긴 문서 (100줄 이상)
- 현재 뷰: 문서 맨 위
- 목표: 80번째 줄로 이동

#### 현재 구현 (커서 → 포커스)
```
setCursor(80) → 스크롤 시도하지만 포커스 없어서 실패
focus()       → 에디터 활성화하지만 커서는 이미 80에 있음, 스크롤 안 함
결과: 80줄에 커서는 있지만 화면은 여전히 위쪽
```

#### 제안 구현 (포커스 → 커서)
```
focus()       → 에디터 활성화
setCursor(80) → 포커스된 상태에서 80줄로 이동 + 자동 스크롤
결과: 80줄에 커서 있고 화면도 80줄 근처로 스크롤 ✓
```

---

## 추가 고려사항

### Obsidian의 파일 열기 타이밍
```typescript
await (leaf as any).openFile(file);
```

이 메서드는 async이지만:
- 파일을 완전히 렌더링하기 전에 반환될 수 있음
- 에디터 객체는 있지만 뷰가 완전히 초기화되지 않았을 수 있음

### 해결책
```typescript
await (leaf as any).openFile(file);
await new Promise(resolve => setTimeout(resolve, 0)); // 이벤트 루프 한 사이클 대기
// 또는
await new Promise(resolve => requestAnimationFrame(resolve));
```

---

## 최종 권장 사항

### 추천 순서: 포커스 → 대기 → 커서 이동

```typescript
// 1. 포커스 먼저
editor.focus();

// 2. 렌더링 완료 대기 (선택적이지만 안정성 향상)
await new Promise(resolve => requestAnimationFrame(resolve));

// 3. 커서 이동 (자동 스크롤 포함)
editor.setCursor({ line: targetLine, ch: targetCh });
```

### 이유
1. **포커스가 먼저 필요**: setCursor가 제대로 스크롤하려면 에디터가 활성화되어 있어야 함
2. **requestAnimationFrame**: DOM 업데이트 타이밍 보장
3. **순서가 중요**: CodeMirror의 내부 동작 특성상 이 순서가 가장 안정적

### 추가 개선 (선택)
```typescript
// 스크롤이 여전히 안정적이지 않다면
editor.focus();
await new Promise(resolve => requestAnimationFrame(resolve));
editor.setCursor({ line: targetLine, ch: targetCh });

// Obsidian의 scrollIntoView가 있다면 추가
if (typeof (editor as any).scrollIntoView === 'function') {
    (editor as any).scrollIntoView({ line: targetLine, ch: targetCh });
}
```

---

## 구현 우선순위

### 1단계: 순서 변경 (즉시 적용 가능)
```typescript
editor.focus();
editor.setCursor({ line: targetLine, ch: targetCh });
```
**예상 효과:** 70-80% 개선

### 2단계: requestAnimationFrame 추가
```typescript
editor.focus();
await new Promise(resolve => requestAnimationFrame(resolve));
editor.setCursor({ line: targetLine, ch: targetCh });
```
**예상 효과:** 90-95% 개선

### 3단계: 명시적 스크롤 추가 (필요시)
```typescript
editor.focus();
await new Promise(resolve => requestAnimationFrame(resolve));
editor.setCursor({ line: targetLine, ch: targetCh });
// 추가 스크롤 보장 코드
```
**예상 효과:** 99% 개선

---

## 요약

| 방법 | 순서 | 타이밍 제어 | 구현 난이도 | 효과 예상 |
|------|------|------------|-----------|----------|
| 현재 | 커서→포커스 | 없음 | 쉬움 | 불완전 |
| 제안1 | 포커스→커서 | 없음 | 쉬움 | 양호 |
| **제안2** | **포커스→대기→커서** | **RAF** | **중간** | **최상** |
| 제안3 | 포커스→커서+스크롤 | 명시적 | 어려움 | 최상 |

**최종 답변:**
1. **포커스를 먼저, 커서 이동을 나중에** 실행해야 함
2. **requestAnimationFrame으로 타이밍 보장** 추가 권장
3. 이렇게 하면 명령어 한 번에 완전한 스크롤 보장
