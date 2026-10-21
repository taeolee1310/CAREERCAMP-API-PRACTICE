# Design Radar

떠오른 아이디어는 말로 남기고, 오늘의 디자인 소식은 한 화면에서 보는 개인 도구다. 디자이너 인턴으로 일하면서 "다음에 뭘 만들지"를 찾는 데 시간이 너무 많이 들어서 만들었다. 왜 만들었는지는 [PROBLEM.md](PROBLEM.md)에 정리해 두었다.

배포판: https://1021practice.vercel.app

## 할 수 있는 것

**아이디어 말하기**
TP-7 녹음기 모양의 녹음 키를 누르고 말하면 브라우저가 받아 적는다. 정지 키를 누르고 '정리하기'를 누르면 Gemini가 제목·요약·키워드·할 일을 뽑아 md 한 장으로 만든다. 말한 원문은 LLM이 손대지 않고 그대로 남긴다.

- 내 컴퓨터에서 돌리면 `ideas/` 폴더에 저장되고, 오른쪽 '모아 둔 아이디어'에 키워드별로 쌓인다.
- 배포판은 서버에 파일을 남기지 않는다. 정리한 md를 내려받는 방식이다.
- 음성 인식은 Chrome과 Edge에서 된다. 다른 브라우저에서는 글로 직접 입력하면 된다.

**오늘의 디자인 소식**
디자인 매체와 국내 기술 블로그 7곳의 RSS를 모아 카드로 보여 준다. 국내 블로그는 디자인 관련 글만 거른다. 제목·출처·링크·대표 이미지만 보여 주고 본문은 가져오지 않는다.

| 분야 | 출처 |
| --- | --- |
| UI/UX | Nielsen Norman Group, Smashing Magazine, UX Collective |
| 국내 | 요즘IT, 토스 테크, 우아한형제들, 카카오 기술블로그 |

출처별 주소와 호출 한도는 [api/README.md](api/README.md)에 있다.

## 내 컴퓨터에서 실행하기

Python 3만 있으면 된다. 따로 설치할 패키지는 없다.

```bash
cd design-radar
cp .env.example .env      # .env에 GEMINI_API_KEY를 넣는다
python dev.py             # http://localhost:3000
```

- Gemini 키는 [Google AI Studio](https://aistudio.google.com/apikey)에서 무료로 받는다. `.env`는 커밋하지 않는다.
- 키가 없어도 뉴스는 보인다. 아이디어 정리만 안 된다.
- `index.html`을 더블클릭으로 열면 API를 못 불러서 실패 화면이 뜬다. 꼭 `dev.py`로 연다.

## 구조

빌드 단계가 없는 정적 화면에 Python 서버 함수 두 개를 붙인 구성이다.

```
design-radar/
├─ public/              화면 (배포되는 부분)
│  ├─ index.html
│  ├─ css/              tokens(색·간격·움직임), type(글자 위계), style(배치)
│  ├─ js/               app.js(뉴스·공통), ideas.js(받아쓰기·정리·저장)
│  ├─ fonts/            머니그라피 원본 woff2
│  └─ vendor/tp7/       TP-7 녹음기 <tp7-recorder>, 미리 빌드한 파일
├─ api/
│  ├─ news.py           GET /api/news  RSS 7곳을 모아 30분 캐시
│  └─ organize.py       POST /api/organize  원문 → Gemini → md
├─ dev.py               로컬 서버. /api/ideas(저장·목록)는 여기에만 있다
├─ ideas/               정리된 아이디어 md (로컬 전용, 커밋 안 함)
└─ .claude/             규칙 md와 /rule-check 스킬
```

`/api/*`는 전부 `{ ok, data, asOf }` 또는 `{ ok: false, error }` 한 모양으로 응답한다. 화면은 외부 주소를 직접 부르지 않고 우리 `/api/...`만 부른다. 키는 서버 환경변수로만 읽는다.

## 디자인

- **색**: Teenage Engineering 무드. 알루미늄 회색 바탕에 검정 글자, 포인트 색은 `#f35901` 하나만 쓴다. 라이트·다크 둘 다 있다.
- **모양**: TP-7처럼 납작한 금속판 느낌. 모서리는 8px 하나로 맞추고, 그림자는 판 아래 1px 모서리만 둔다.
- **글꼴**: 본문은 Pretendard, 서비스 이름은 머니그라피 Rounded, 날짜·숫자는 머니그라피 Pixel.
- **움직임**: GSAP 하나로 처리한다. 화면에서 눈에 띄게 움직이는 건 정리 결과의 키워드가 나타나는 순간뿐이다. 동작 줄이기 설정을 켜면 투명도 변화만 남는다.

색과 간격 값은 `public/css/tokens.css` 한 곳에서만 바꾼다.

## 일관성을 지키는 방법

바이브코딩으로 만들다 보면 화면마다 스타일이 달라지기 쉽다. 그래서 규칙을 md로 적어 두고 AI가 작업할 때마다 읽게 했다.

| 파일 | 내용 |
| --- | --- |
| `.claude/rules/ui.md` | 토큰, 움직임, 상태 화면, 문구, 접근성 |
| `.claude/rules/type.md` | 글자 크기 단계와 역할 7개 |
| `.claude/rules/api.md` | 키 관리, 응답 모양, 캐시, 출처 표기 |
| `.claude/rules/ideas.md` | 아이디어 md 이름과 형식 |

화면을 고친 뒤에는 `/rule-check`로 규칙을 지켰는지 검사한다. AI가 같은 실수를 하면 각 규칙 파일의 "실수에서 배운 규칙"에 한 줄씩 쌓는다.

## 배포

GitHub `main`에 푸시하면 Vercel이 자동으로 배포한다. `.vercelignore`로 `.env`, `ideas/`, `dev.py`, `.claude/`, md 파일은 올라가지 않는다. Vercel 환경변수에 `GEMINI_API_KEY`를 넣어야 배포판에서도 정리가 된다.

## 알아 둘 것

- 받아쓰기와 정리 둘 다 Google 서버를 거친다. Gemini 무료 사용분의 입력은 Google이 서비스 개선에 쓸 수 있으니 민감한 내용은 빼고 말한다.
- 마이크 소리는 저장하지 않는다. 글로 바뀐 텍스트만 다룬다.
- 머니그라피 글꼴은 개인·기업 무료로 쓸 수 있고 웹 서버에 올려 쓰는 것도 허용되지만, 수정과 재배포는 금지다. 토스 공식 페이지의 원본 파일을 그대로 쓴다.
- 서비스 이름은 아직 가칭이다.
