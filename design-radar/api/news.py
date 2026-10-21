"""디자인 뉴스 수집 (Vercel Python 함수). 키가 필요 없는 공개 RSS만 쓴다.

제목·출처·링크·날짜와 대표 이미지 주소만 내려 준다. 본문은 복사하지 않는다.
대표 이미지는 RSS에 있으면 그것을, 없으면 기사 페이지의 og:image(링크 미리보기용 이미지)를 쓴다.
"""
import html
import json
import re
import time
import urllib.parse
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
# 기사 페이지는 대표 이미지를 찾을 때만 앞부분을 읽는다. 한 번 찾은 결과는 서버가 켜져 있는 동안 기억한다
PAGE_BYTES = 300_000
PAGE_TIMEOUT = 6
PAGE_FETCH_MAX = 40  # 새로 받을 때마다 기사 페이지는 최대 40곳만 연다

# 국내 출처는 개발·기획 글도 섞여 있어서 디자인 관련 글만 남긴다.
KR_KEYWORDS = re.compile(
    r"(?<![A-Za-z])(UX|UI|GUI)(?![A-Za-z])|디자인|디자이너|프로덕트|인터랙션|사용성|피그마|figma|design",
    re.IGNORECASE,
)

_cache = {"at": 0.0, "payload": None}
_thumbs = {}  # 기사 링크 → 이미지 주소("" = 없음)

MEDIUM_SIZE = re.compile(r"medium\.com/(?:max/\d+|v2/resize:fit:\d+)/")
IMG_SRC = re.compile(r"<img[^>]+src=[\"']([^\"']+)[\"']", re.IGNORECASE)
OG_TAG = re.compile(r"<meta[^>]+(?:property|name)=[\"'](?:og:image|twitter:image)[\"'][^>]*>", re.IGNORECASE)
CONTENT_ATTR = re.compile(r"content=[\"']([^\"']+)[\"']", re.IGNORECASE)


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


def _clean_img(url):
    url = html.unescape(url or "").strip()
    if url.startswith("//"):
        url = "https:" + url
    if not url.startswith("https://") or len(url) > 600:  # 화면이 https라 http 이미지는 막힌다
        return ""
    # Medium(UX Collective) 원본은 수 MB라서 썸네일 크기로 받는다
    return MEDIUM_SIZE.sub("medium.com/v2/resize:fit:640/", url)


def _rss_image(el):
    for c in el.iter():
        tag = _name(c.tag)
        if tag in ("thumbnail", "content") and c.get("url") and c.get("medium", "image") == "image":
            return _clean_img(c.get("url"))
        if tag == "enclosure" and (c.get("type") or "").startswith("image/"):
            return _clean_img(c.get("url"))
    for c in el:
        if _name(c.tag) in ("encoded", "description", "content", "summary") and c.text:
            m = IMG_SRC.search(c.text)
            if m:
                return _clean_img(m.group(1))
    return ""


def _og_image(link):
    if link in _thumbs:
        return _thumbs[link]
    found = ""
    try:
        req = urllib.request.Request(link, headers={"User-Agent": "Mozilla/5.0 DesignRadar"})
        with urllib.request.urlopen(req, timeout=PAGE_TIMEOUT) as res:
            page = res.read(PAGE_BYTES).decode("utf-8", "replace")
        tag = OG_TAG.search(page)
        attr = CONTENT_ATTR.search(tag.group(0)) if tag else None
        if attr:
            found = urllib.parse.urljoin(link, html.unescape(attr.group(1)))
            found = _clean_img(found)
    except Exception:  # 이미지는 없어도 된다
        pass
    _thumbs[link] = found
    return found


def _fill_thumbs(items):
    for i in items:
        if not i["thumb"] and i["link"] in _thumbs:
            i["thumb"] = _thumbs[i["link"]]
    todo = [i for i in items if not i["thumb"] and i["link"] not in _thumbs][:PAGE_FETCH_MAX]
    with ThreadPoolExecutor(max_workers=16) as pool:
        for i, url in zip(todo, pool.map(lambda i: _og_image(i["link"]), todo)):
            i["thumb"] = url


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
            "thumb": _rss_image(el),
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
    items = items[:80]
    _fill_thumbs(items)
    payload = {
        "ok": True,
        "data": {"items": items, "sources": sources},
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
