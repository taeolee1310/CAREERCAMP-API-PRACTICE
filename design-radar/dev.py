"""로컬 실행용 서버. 배포(Vercel)에서는 쓰지 않는다.

python dev.py 후 http://localhost:3000
/api/ideas(아이디어 md 저장·목록)는 로컬에만 있다. 배포판은 md 다운로드로 대신한다.
"""
import json
import mimetypes
import os
import re
import sys
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
IDEAS = ROOT / "ideas"
sys.path.insert(0, str(ROOT / "api"))


def load_env():
    """.env 값을 환경변수로 읽는다. 값은 출력하지 않는다."""
    path = ROOT / ".env"
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip("\"'"))


load_env()
import news  # noqa: E402
import organize  # noqa: E402

PORT = int(os.environ.get("PORT", "3000"))
FILENAME = re.compile(r"\d{4}-\d{2}-\d{2}-\d{4}-[a-z0-9-]{1,30}\.md")
MAX_MD = 20_000


def now_iso():
    return datetime.now(organize.KST).isoformat()


def read_ideas():
    """ideas/*.md의 앞부분(date, keywords, type, status)과 제목만 읽는다."""
    out = []
    for p in sorted(IDEAS.glob("*.md"), reverse=True)[:30]:
        text = p.read_text(encoding="utf-8", errors="replace")
        head = re.match(r"---\n(.*?)\n---", text, re.S)
        meta = dict(re.findall(r"^(\w+):\s*(.*)$", head.group(1), re.M)) if head else {}
        title = re.search(r"^# (.+)$", text, re.M)
        out.append({
            "filename": p.name,
            "title": title.group(1).strip() if title else p.stem,
            "date": meta.get("date", ""),
            "keywords": [k.strip() for k in meta.get("keywords", "").strip("[]").split(",") if k.strip()],
            "type": meta.get("type", ""),
            "status": meta.get("status", ""),
        })
    return out


def save_idea(body):
    name, md = body.get("filename"), body.get("markdown")
    if not isinstance(name, str) or not FILENAME.fullmatch(name):
        return 400, {"ok": False, "error": "파일 이름이 규칙과 달라요."}
    if not isinstance(md, str) or not md.startswith("---\n") or len(md) > MAX_MD:
        return 400, {"ok": False, "error": "아이디어 형식이 규칙과 달라요."}
    IDEAS.mkdir(exist_ok=True)
    target, n = IDEAS / name, 2
    while target.exists():  # 덮어쓰지 않는다
        target = IDEAS / name.replace(".md", f"-{n}.md")
        n += 1
    target.write_text(md, encoding="utf-8")
    return 200, {"ok": True, "data": {"filename": target.name}, "asOf": now_iso()}


class Dev(BaseHTTPRequestHandler):
    def _send(self, status, body, ctype):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.end_headers()
        self.wfile.write(body)

    def _json(self, status, payload):
        self._send(status, json.dumps(payload, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8")

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/news":
            payload = news.get_news()
            return self._json(200 if payload["ok"] else 502, payload)
        if path == "/api/ideas":
            try:
                return self._json(200, {"ok": True, "data": read_ideas(), "asOf": now_iso()})
            except OSError as e:
                print("read ideas failed:", type(e).__name__)
                return self._json(500, {"ok": False, "error": "ideas 폴더를 읽지 못했어요. 폴더 권한을 확인하고 다시 불러와 주세요."})
        target = (PUBLIC / ("index.html" if path == "/" else path.lstrip("/"))).resolve()
        if PUBLIC not in target.parents or not target.is_file():
            return self._send(404, "찾을 수 없어요".encode("utf-8"), "text/plain; charset=utf-8")
        ctype = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        self._send(200, target.read_bytes(), ctype + ("; charset=utf-8" if ctype.startswith("text/") or ctype.endswith("javascript") else ""))

    def do_POST(self):
        path = self.path.split("?")[0]
        # 다른 사이트가 이 로컬 서버에 글을 쓰지 못하게 막는다
        origin = self.headers.get("Origin")
        if origin and not re.fullmatch(rf"http://(localhost|127\.0\.0\.1):{PORT}", origin):
            return self._json(403, {"ok": False, "error": "이 주소에서는 저장할 수 없어요."})
        if "application/json" not in (self.headers.get("Content-Type") or ""):
            return self._json(415, {"ok": False, "error": "보낸 내용을 읽지 못했어요."})
        length = int(self.headers.get("Content-Length") or 0)
        try:
            if length > organize.MAX_BODY:
                raise ValueError
            body = json.loads(self.rfile.read(length) or b"{}")
            if not isinstance(body, dict):
                raise ValueError
        except ValueError:
            return self._json(400, {"ok": False, "error": "보낸 내용을 읽지 못했어요. 다시 시도해 주세요."})
        if path == "/api/organize":
            return self._json(*organize.organize(body.get("text"), body.get("known") or []))
        if path == "/api/ideas":
            try:
                return self._json(*save_idea(body))
            except OSError as e:
                print("save idea failed:", type(e).__name__)
                return self._json(500, {"ok": False, "error": "ideas 폴더에 저장하지 못했어요. md 파일로 받아 두세요."})
        self._json(404, {"ok": False, "error": "찾을 수 없어요."})

    def log_message(self, fmt, *args):
        pass


class Server(ThreadingHTTPServer):
    # Windows에서는 기본값(True)이면 같은 포트에 서버가 겹쳐 떠서 옛 서버가 요청을 받는다
    allow_reuse_address = False


if __name__ == "__main__":
    try:
        server = Server(("127.0.0.1", PORT), Dev)
    except OSError:
        sys.exit(f"{PORT}번 포트를 이미 쓰고 있어요. 켜져 있는 서버를 끈 뒤 다시 실행해 주세요.")
    print(f"http://localhost:{PORT}", flush=True)
    server.serve_forever()
