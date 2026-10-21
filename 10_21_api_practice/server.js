// 빠른 하차 정보 서버: 인증키는 이 서버(.env)에만 있고, 브라우저에는 결과만 보낸다.
// 실행: node server.js  →  http://localhost:3000
const http = require("http");
const fs = require("fs");
const path = require("path");

// .env 읽기 (외부 패키지 없이)
try {
  for (const line of fs.readFileSync(path.join(__dirname, ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
} catch (e) { /* .env가 없으면 아래에서 안내 */ }

const KEY = process.env.DATA_GO_KR_KEY;
const PORT = Number(process.env.PORT) || 3000;
const UPSTREAM = "https://apis.data.go.kr/B553766/inout/getFstExit"; // 🔌 서울교통공사_빠른하차정보
const PAGE_ROWS = 100, MAX_PAGES = 5;

if (!KEY || KEY.includes("여기에")) {
  console.error("DATA_GO_KR_KEY가 없어요. .env.example을 .env로 복사해서 인증키를 넣어 주세요.");
  process.exit(1);
}

// 화면에서 받는 값만 통과시킨다 (역명 검색 문자열 · 호선 · 역코드)
const CLEAN = /^[0-9A-Za-z가-힣() ]{1,20}$/;

// 같은 검색은 10분 동안 다시 부르지 않는다 (일일 호출 한도 보호)
const cache = new Map();
const TTL = 10 * 60 * 1000;

// 분당 60회까지만 (한도 10,000건이 순식간에 닳지 않게)
let hits = [];
const tooMany = () => {
  const now = Date.now();
  hits = hits.filter(t => now - t < 60000);
  if (hits.length >= 60) return true;
  hits.push(now);
  return false;
};

async function fetchPage(params, pageNo) {
  const qs = new URLSearchParams({ serviceKey: KEY, dataType: "JSON", numOfRows: PAGE_ROWS, pageNo, ...params });
  const res = await fetch(UPSTREAM + "?" + qs, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error("upstream " + res.status);
  let json;
  try { json = JSON.parse(await res.text()); } catch (e) { throw new Error("upstream not json"); }
  const r = json.response;
  if (!r) throw new Error("upstream unexpected");
  if (r.header.resultCode === "03") return { total: 0, items: [] }; // 결과 없음
  if (r.header.resultCode !== "00") throw new Error("upstream code " + r.header.resultCode);
  const it = r.body.items && r.body.items.item;
  return { total: Number(r.body.totalCount) || 0, items: Array.isArray(it) ? it : it ? [it] : [] };
}

async function search(params) {
  const cacheKey = JSON.stringify(params);
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  let { total, items } = await fetchPage(params, 1);
  for (let p = 2; p <= MAX_PAGES && items.length < total; p++) {
    items = items.concat((await fetchPage(params, p)).items);
  }
  const data = { totalCount: total, truncated: items.length < total, items };
  cache.set(cacheKey, { at: Date.now(), data });
  return data;
}

const send = (res, code, body, type = "application/json; charset=utf-8") => {
  res.writeHead(code, {
    "Content-Type": type,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'",
  });
  res.end(body);
};
const fail = (res, code, message) => send(res, code, JSON.stringify({ error: message }));

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (req.method !== "GET") return fail(res, 405, "허용되지 않는 요청이에요.");
  // HTML을 파일(Origin "null")이나 IDE 미리보기·Live Server(localhost의 다른 포트)로 열어도 검색되게, 내 컴퓨터에서 온 요청만 허용한다
  const origin = req.headers.origin;
  if (origin === "null" || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || "")) res.setHeader("Access-Control-Allow-Origin", origin);

  // 화면 파일은 이것 하나만 내준다 (.env 같은 다른 파일은 절대 안 나간다)
  if (url.pathname === "/" || url.pathname === "/subwaypath.html") {
    return send(res, 200, fs.readFileSync(path.join(__dirname, "subwaypath.html")), "text/html; charset=utf-8");
  }

  if (url.pathname === "/api/exit") {
    const params = {};
    for (const [from, to] of [["stnNm", "stnNm"], ["line", "lineNm"], ["stnCd", "stnCd"]]) {
      const v = (url.searchParams.get(from) || "").trim();
      if (!v) continue;
      if (!CLEAN.test(v)) return fail(res, 400, "검색어를 확인해 주세요.");
      params[to] = v;
    }
    if (!params.stnNm && !params.stnCd) return fail(res, 400, "역 이름을 입력해 주세요.");
    if (tooMany()) return fail(res, 429, "요청이 너무 많아요. 잠시 뒤 다시 시도해 주세요.");
    try {
      return send(res, 200, JSON.stringify(await search(params)));
    } catch (e) {
      console.error("API 호출 실패:", e.message); // 키가 들어간 주소는 로그에도 남기지 않는다
      return fail(res, 502, "서울교통공사 서버에서 정보를 가져오지 못했어요.");
    }
  }

  fail(res, 404, "찾을 수 없어요.");
}).listen(PORT, "127.0.0.1", () => console.log(`빠른 하차 정보: http://localhost:${PORT}`)); // 내 컴퓨터에서만 접속 가능
