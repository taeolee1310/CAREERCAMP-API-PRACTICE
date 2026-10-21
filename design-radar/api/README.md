# 외부 출처와 한도

새 출처를 넣기 전에 키가 필요 없는지, 약관과 호출 한도를 확인해서 여기에 한 줄 적는다.

| 출처 | 주소 | 키 | 한도 | 쓰는 범위 | 확인일 |
| --- | --- | --- | --- | --- | --- |
| Nielsen Norman Group | https://www.nngroup.com/feed/rss/ | 없음 | 명시 없음, 30분 캐시 | 제목·링크·날짜 | 2026-10-21 |
| Smashing Magazine | https://www.smashingmagazine.com/feed/ | 없음 | 명시 없음, 30분 캐시 | 제목·링크·날짜 | 2026-10-21 |
| UX Collective | https://uxdesign.cc/feed | 없음 | 명시 없음, 30분 캐시 | 제목·링크·날짜 | 2026-10-21 |
| 요즘IT | https://yozm.wishket.com/magazine/feed/ | 없음 | 명시 없음, 30분 캐시 | 디자인 키워드 글만 | 2026-10-21 |
| 토스 테크 | https://toss.tech/rss.xml | 없음 | 명시 없음, 30분 캐시 | 디자인 키워드 글만 | 2026-10-21 |
| 우아한형제들 | https://techblog.woowahan.com/feed/ | 없음 | 명시 없음, 30분 캐시 | 디자인 키워드 글만 | 2026-10-21 |
| 카카오 기술블로그 | https://tech.kakao.com/feed/ | 없음 | 명시 없음, 30분 캐시 | 디자인 키워드 글만 | 2026-10-21 |
| Gemini API | generativelanguage.googleapis.com | `GEMINI_API_KEY` (헤더) | 계정·모델마다 다름, AI Studio에서 확인. 코드에서 분당 10회 제한 | 아이디어 원문 → 제목·요약·키워드·할 일 | 2026-10-21 |

Gemini 모델은 `gemini-3.5-flash-lite`(문서에서 새 프로젝트용으로 권장하는 안정판). 무료 사용분의 입력은 Google이 서비스 개선에 쓸 수 있어서 화면에 안내 문구를 둔다.

제외: 브런치 태그(태그 RSS 없음), 디자인정글(RSS 주소 404).
확인일 기준으로 응답이 오는지만 확인했고, 각 사이트 약관 원문은 읽지 않았다. 배포 전에 한 번 확인한다.
