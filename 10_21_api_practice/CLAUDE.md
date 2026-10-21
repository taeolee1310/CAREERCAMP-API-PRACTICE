# 빠른 하차 정보 (AX 강의 · API 화면 실습)

서울교통공사 빠른하차정보 API(공공데이터포털)를 불러와, 내릴 역의 계단·엘리베이터·에스컬레이터와 가장 가까운 칸·문을 보여 주는 화면이다.

| 파일 | 내용 |
| --- | --- |
| `server.js` | 인증키(`.env`)를 가진 Node 서버. 브라우저 대신 API를 부르고 결과만 `/api/exit`로 내려 준다. 외부 패키지 없음 |
| `subwaypath.html` | 화면 하나(CSS·JS 포함). 서버가 `/`와 `/subwaypath.html`로 내준다 |
| `.env` | `DATA_GO_KR_KEY`, `PORT`. 커밋하지 않고 내용도 출력하지 않는다. 양식은 `.env.example` |

## 실행
- 먼저 `node server.js`로 서버를 켠다. 그다음 `http://localhost:3000`으로 열거나, `subwaypath.html`을 더블클릭(`file://`)으로 열어도 된다. 어느 쪽이든 서버가 꺼져 있으면 검색이 안 되고 "서버가 켜져 있는지 확인해 주세요" 문구가 뜬다.
- 파일로 열면 화면이 `http://localhost:3000/api/exit`를 부른다. 서버는 Origin이 `null`인 요청(파일로 연 페이지)에만 CORS를 허용한다. `.env`의 `PORT`를 바꾸면 `subwaypath.html`의 `localhost:3000`도 같이 바꾼다.
- 이 화면은 서버가 필요해서 `.claude/rules/api.md`의 "키 없는 API만" · "더블클릭만으로 열려야 한다" 규칙의 예외다. 대신 키는 서버에만 두고 화면 코드와 로그에 넣지 않는다.

API 화면 규칙은 `.claude/rules/api.md`에 있고 자동으로 적용된다. 화면을 만들거나 고친 뒤 규칙을 지켰는지 보려면 `/api-check`(`.claude/skills/api-check/SKILL.md`)를 쓴다. 이 스킬은 검사만 하고 고치지 않는다. 규칙 파일이나 스킬을 새로 만들면 여기에도 한 줄 적는다.

## 서버 규칙 (`server.js`)
- 화면 파일은 `subwaypath.html` 하나만 내준다. 다른 파일(`.env` 등)은 내보내지 않는다.
- 화면에서 받는 값은 `CLEAN` 정규식(한글·영문·숫자·괄호·공백, 20자 이하)을 통과한 것만 쓴다. 받는 값은 `stnNm`(역명), `line`(호선), `stnCd`(역코드)뿐이다.
- 같은 검색은 10분간 캐시하고, 분당 60회까지만 받는다(일일 호출 한도 10,000건 보호).
- 업스트림 오류는 로그에 메시지만 남기고(키가 든 주소는 남기지 않는다) 화면에는 한국어 문구만 보낸다.
- `127.0.0.1`에서만 접속된다.

## API 메모
- 주소: `https://apis.data.go.kr/B553766/inout/getFstExit`, `dataType=JSON`, 한 번에 100건씩 최대 5쪽.
- 응답 `resultCode`: `00` 정상, `03` 결과 없음(빈 목록으로 처리), 그 밖은 오류.
- 쓰는 필드: `stnNm` 역명 · `lineNm` 호선 · `upbdnbSe` 상행/하행 · `drtnInfo` 방면 · `qckgffVhclDoorNo` 칸-문 번호(예: `8-1`) · `plfmCmgFac` 이동 설비 · `fwkPstnNm` 설비 위치 · `crtrYmd` 기준 날짜(YYYYMMDD).
- 칸-문 번호는 앞쪽 칸부터 센 값이다. 화면에 기준 날짜를 함께 보여 주고 "실시간"이라고 쓰지 않는다.
- 출처는 "서울교통공사 빠른하차정보 (공공데이터포털)"로 적는다.

## 화면 공통 규칙
- **다크/라이트 스위치**: `main` 안 첫 줄의 `.theme` 버튼, `localStorage`의 `theme`에 저장, 없으면 기기 설정을 따른다. 다크는 `:root[data-theme=dark]`와 `@media (prefers-color-scheme:dark){ :root:not([data-theme=light]) }` 두 곳에 같은 값을 넣는다. 다크 배경 `#0b0f17`, 버튼·강조색 `#3b6fe0`. `h1`에는 `padding-right:5rem`을 둔다.
- **상태 화면**: 로딩 중 문구와 실패 화면을 따로 둔다. 맨 아래에 "🔌 이 화면이 쓰는 API" 상자를 둔다.
- **문구**: 해요체로 통일하고 한 문장에 정보 하나만 담는다. 실패 문구는 "무슨 일이 생겼는지 → 사용자가 할 일" 순서로 쓴다. 영어 오류 문구나 HTTP 번호를 그대로 보여 주지 않는다(`whyFailed(e)`가 바꿔 붙인다). 사용자가 고칠 수 있는 실패(400·429)는 `err.friendly = true`로 던져 메시지만 보인다.
- **모션·성능**: `transform`과 `opacity`만 애니메이션하고 `transition: all`은 쓰지 않는다. 등장은 `translateY(8px)` + `opacity`, 곡선 `--ease`, 500ms 이내. 눌림은 `scale(.96)`, 120ms. `prefers-reduced-motion`이면 이동을 빼고 투명도만 남긴다. 블러는 `blur(14px)` 이하, 배경 그라디언트는 `body::before { position:fixed }` 레이어에 둔다. 터치 대상은 44px 이상이다.
- 시간은 한국 시간 기준으로 표시한다.

## 작업 방식
- 화면을 고친 뒤에는 서버를 띄우고 실제 브라우저로 검색해서 확인한다(헤드리스 Chrome 등). 임시 파일은 프로젝트 안에 두지 않는다.
- 없는 역 이름, 서버가 꺼진 상태 같은 실패 경로도 한 번씩 본다.
- 실제 기기에서 느낌을 봐야 하는 것(스크롤 부드러움, 스위치 손맛)은 확인하지 못했다고 솔직히 적는다.
- 커밋·푸시는 하지 않고 커밋 메시지만 제안한다.
