"""디자인 뉴스 수집 (Vercel Python 함수). 키가 필요 없는 공개 RSS만 쓴다.

제목·출처·링크·날짜만 내려 준다. 본문은 복사하지 않는다.
"""
import json
import re
import time
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from http.server import BaseHTTPRequestHandler

# 🔌 외부 주소: 공개 RSS (키 없음, 호출 한도 없음. 그래도 30분 캐시로 가볍게 부른다)
FEEDS = [
    {"id": "nng", "name": "Nielsen Norman Group", "group": "ux", "url": "https://www.nngroup.com/feed/rss/"},
    {"id": "smashing", "name": "Smashing Magazine", "group": "ux", "url": "https://www.smashingmagazine.com/feed/"},
    {"id": "uxcollective", "name": "UX Collective", "group": "ux", "url": "https://uxdesign.cc/feed"},
    {"id": "yozm", "name": "요즘IT", "group": "kr", "url": "https://yozm.wishket.com/magazine/feed/"},
    {"id": "toss", "name": "토스 테크", "group": "kr", "url": "https://toss.tech/rss.xml"},
    {"id": "woowa", "name": "우아한형제들", "group": "kr", "url": "https://techblog.woowahan.com/feed/"},
    {"id": "kakao", "name": "카카오 기술블로그", "group": "kr", "url": "https://tech.kakao.com/feed/"},
]

CACHE_SECONDS = 1800
PER_SOURCE = 15
MAX_BYTES = 2_000_000
TIMEOUT = 10

# 국내 출처는 개발·기획 글도 섞여 있어서 디자인 관련 글만 남긴다.
KR_KEYWORDS = re.compile(
    r"(?<![A-Za-z])(UX|UI|GUI)(?![A-Za-z])|디자인|디자이너|프로덕트|인터랙션|사용성|피그마|figma|design",
    re.IGNORECASE,
)

_cache = {"at": 0.0, "payload": None}


def _name(tag):
    return tag.split("}")[-1]


def _child_text(el, *names):
    for c in el:
        if _name(c.tag) in names and c.text and c.text.strip():
            return c.text.strip()
    return ""


def _link(el):
    for c in el:
        if _name(c.tag) != "link":
            continue
        href = c.get("href")
        if href and c.get("rel") in (None, "alternate"):
            return href.strip()
        if c.text and c.text.strip():
            return c.text.strip()
    return ""


def _date(el):
    raw = _child_text(el, "pubDate", "published", "updated", "date")
    if not raw:
        return None
    try:
        d = parsedate_to_datetime(raw)
    except (TypeError, ValueError):
        try:
            d = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.astimezone(timezone.utc)


def _fetch(feed):
    req = urllib.request.Request(feed["url"], headers={"User-Agent": "Mozilla/5.0 DesignRadar"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
        data = res.read(MAX_BYTES)
    if b"<!ENTITY" in data:  # 악성 XML 방지
        raise ValueError("entity")
    root = ET.fromstring(data)
    items = []
    for el in root.iter():
        if _name(el.tag) not in ("item", "entry"):
            continue
        title = re.sub(r"\s+", " ", _child_text(el, "title"))
        link = _link(el)
        if not title or not link.startswith(("http://", "https://")):
            continue
        if feed["group"] == "kr":
            text = title + " " + _child_text(el, "description", "summary", "category")
            if not KR_KEYWORDS.search(text):
                continue
        d = _date(el)
        items.append({
            "title": title[:160],
            "link": link,
            "source": feed["name"],
            "group": feed["group"],
            "date": d.isoformat() if d else None,
        })
        if len(items) >= PER_SOURCE:
            break
    return items


def _safe_fetch(feed):
    try:
        return feed, _fetch(feed), True
    except Exception as e:  # 한 출처가 실패해도 나머지는 보여 준다
        print("feed failed:", feed["id"], type(e).__name__)
        return feed, [], False


def get_news():
    now = time.time()
    if _cache["payload"] and now - _cache["at"] < CACHE_SECONDS:
        return _cache["payload"]
    with ThreadPoolExecutor(max_workers=len(FEEDS)) as pool:
        results = list(pool.map(_safe_fetch, FEEDS))
    items = [i for _, found, _ in results for i in found]
    sources = [{"id": f["id"], "name": f["name"], "group": f["group"], "ok": ok, "count": len(found)}
               for f, found, ok in results]
    if not any(s["ok"] for s in sources):
        return {"ok": False, "error": "뉴스를 가져오지 못했어요. 잠시 뒤에 다시 시도해 주세요."}
    items.sort(key=lambda i: i["date"] or "", reverse=True)
    payload = {
        "ok": True,
        "data": {"items": items[:80], "sources": sources},
        "asOf": datetime.now(timezone.utc).isoformat(),
    }
    _cache.update(at=now, payload=payload)
    return payload


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        payload = get_news()
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(200 if payload["ok"] else 502)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=3600")
        self.end_headers()
        self.wfile.write(body)
