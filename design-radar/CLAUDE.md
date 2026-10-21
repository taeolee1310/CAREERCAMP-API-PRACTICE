# Design Radar (가칭) — 디자이너용 아이디어·트렌드 수집 도구

말로 던진 아이디어를 키워드로 정리해 폴더에 쌓고, 매일 디자인 뉴스를 한곳에서 보면서 "다음에 뭘 만들지"를 찾는 개인 도구다. 포트폴리오로도 보여 준다. 문제 정의는 `PROBLEM.md`.

## 구조
| 경로 | 내용 |
| --- | --- |
| `public/` (`index.html`, `css/`, `js/`) | 정적 화면. 빌드 단계 없음. 애니메이션은 GSAP(CDN, 버전 고정). 배포 때 이 폴더만 공개된다 |
| `public/css/tokens.css` | 색·간격·글자·움직임 값. 색을 바꿀 때는 이 파일만 고친다 |
| `public/css/type.css` | 타이포 위계(글꼴·크기·굵기·줄간격·자간). 규칙은 `.claude/rules/type.md` |
| `public/css/fonts.css`, `public/fonts/` | 머니그라피 `@font-face`와 원본 woff2(수정·재배포 금지) |
| `api/*.py` | Vercel Python 함수. 키는 환경변수로만 읽는다. 출처·한도는 `api/README.md` |
| `api/news.py` | 공개 RSS 7곳을 모아 `/api/news`로 내려 준다. 국내 출처는 디자인 키워드로 거른다 |
| `api/organize.py` | `POST /api/organize`. 원문을 Gemini로 정리해 `ideas.md` 형식의 md와 파일 이름을 돌려준다. 원문은 LLM이 고치지 않는다 |
| `public/js/app.js` | `const API`, 공통 도우미(`$`, `reduced`, `kst`, `cssSec`, `reveal`), 뉴스 화면 |
| `public/js/ideas.js` | 음성 받아쓰기·소리 크기 링·정리·저장. IIFE로 감싼다 |
| `dev.py` | 로컬 실행용 서버(`public/` + `/api/*` + `.env` 읽기). `/api/ideas` 저장·목록은 여기에만 있다. 배포에는 쓰지 않는다 |
| `ideas/` | 정리된 아이디어 md. 로컬에서만 쌓인다 |
| `.env` | 키. 커밋하지 않고 내용도 출력하지 않는다. 양식은 `.env.example` |
| `.claude/rules/` | 자동 적용 규칙 (`ui.md`, `type.md`, `api.md`, `ideas.md`) |
| `.claude/skills/` | `/rule-check` 규칙 검사기 |

규칙 파일이나 스킬을 새로 만들면 이 표에도 한 줄 적는다.

## 실행
- `.env.example`을 복사해 `.env`를 만들고 `GEMINI_API_KEY`를 넣는다. 키는 채팅에 붙여 넣지 않는다.
- `python dev.py` 후 http://localhost:3000. `127.0.0.1`에서만 열린다.
- 음성 인식은 Chrome·Edge에서 된다. 안 되는 브라우저는 글 입력으로 대신한다.
- `index.html`을 더블클릭으로 열면 API를 못 불러서 실패 화면이 뜬다. 꼭 서버로 연다.

## 만드는 순서
1. 규칙 md (완료)
2. 디자인 뉴스: `api/news.py` + 뉴스 화면 (완료, 1차)
3. 음성 아이디어: Web Speech API → `api/organize.py`(Gemini) → `ideas/*.md` (완료, 1차. 실제 키로는 아직 미확인)

## 작업 방식
- 화면을 만들거나 고친 뒤 `/rule-check`로 규칙을 지켰는지 검사한다. 이 스킬은 검사만 하고 고치지 않는다.
- 규칙에 없는 선택(색, 라이브러리, 파일 위치)을 새로 하면 멋대로 정하지 말고 먼저 묻는다. 정해지면 해당 규칙 파일에 한 줄 추가한다.
- AI가 실수하면 `.claude/rules/*.md`의 "실수에서 배운 규칙"에 한 줄씩 쌓는다.
- 실제 브라우저로 열어서 확인한다. 마이크·터치 느낌처럼 직접 못 본 것은 확인하지 못했다고 적는다.
- 커밋·푸시는 하지 않고 커밋 메시지만 제안한다.
- 작업을 마치면 Notion 공통 작업 노트에 기록한다(전역 규칙).
