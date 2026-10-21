const API = {
  news: "/api/news", // 🔌 우리 서버 함수. 외부 RSS는 api/news.py가 대신 부른다
  organize: "/api/organize", // 🔌 아이디어 정리. Gemini는 api/organize.py가 대신 부른다
  ideas: "/api/ideas", // 🔌 아이디어 md 저장·목록. 로컬 dev.py에만 있다
};

const GROUPS = [
  { id: "all", label: "전체" },
  { id: "ux", label: "UI/UX" },
  { id: "kr", label: "국내" },
];

const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const kst = (opts, d = new Date()) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", ...opts }).format(d);
const cssSec = (name) => parseFloat(getComputedStyle(root).getPropertyValue(name)) / 1000;

let news = null;
let group = "all";

/* 테마 */
function applyTheme(t) {
  if (t) root.dataset.theme = t;
  const dark = root.dataset.theme
    ? root.dataset.theme === "dark"
    : matchMedia("(prefers-color-scheme: dark)").matches;
  $("theme").textContent = dark ? "라이트로" : "다크로";
}
try { applyTheme(localStorage.getItem("theme")); } catch { applyTheme(); }
$("theme").addEventListener("click", () => {
  const dark = $("theme").textContent === "라이트로";
  const next = dark ? "light" : "dark";
  try { localStorage.setItem("theme", next); } catch {}
  applyTheme(next);
});

/* 움직임: 등장은 opacity+translateY, 전체 길이 600ms 안 */
function reveal(nodes) {
  if (!window.gsap || !nodes.length) return;
  const dur = cssSec("--dur-enter");
  const stagger = Math.min(0.04, 0.25 / nodes.length);
  gsap.fromTo(
    nodes,
    reduced.matches ? { opacity: 0 } : { opacity: 0, y: 8 },
    { opacity: 1, y: 0, duration: dur, stagger, ease: "power3.out", clearProps: "transform,opacity" }
  );
}

/* 렌더 */
function relTime(iso) {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 36e5;
  if (diff < 1) return "방금";
  if (diff < 24) return `${Math.floor(diff)}시간 전`;
  if (diff < 24 * 7) return `${Math.floor(diff / 24)}일 전`;
  return kst({ month: "long", day: "numeric" }, new Date(iso));
}

function card(item) {
  const li = document.createElement("li");
  li.className = "card";
  const a = document.createElement("a");
  a.href = item.link;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  const t = document.createElement("h3");
  t.className = "title";
  t.textContent = item.title;
  const meta = document.createElement("div");
  meta.className = "meta";
  const s = document.createElement("span");
  s.className = "src";
  s.textContent = item.source;
  const d = document.createElement("span");
  d.textContent = relTime(item.date);
  meta.append(s, d);
  a.append(t, meta);
  li.append(a);
  return li;
}

function setState(kind, title, body, retry) {
  const box = $("state");
  box.replaceChildren();
  if (!kind) return;
  const div = document.createElement("div");
  div.className = `state ${kind}`;
  const strong = document.createElement("strong");
  strong.textContent = title;
  div.append(strong, body);
  if (retry) {
    const b = document.createElement("button");
    b.className = "retry";
    b.type = "button";
    b.textContent = "다시 불러오기";
    b.addEventListener("click", load);
    div.append(b);
  }
  box.append(div);
  $("live").textContent = `${title} ${body}`;
}

function renderList() {
  const items = news.items.filter((i) => group === "all" || i.group === group);
  const grid = $("grid");
  grid.replaceChildren(...items.map(card));
  if (!items.length) {
    setState("empty", "아직 소식이 없어요", "다른 분야를 눌러 보세요.");
  } else {
    setState(null);
    $("live").textContent = `${items.length}개의 소식을 보여 줘요`;
  }
  reveal([...grid.children]);
}

function renderChips() {
  const box = $("chips");
  box.replaceChildren(
    ...GROUPS.map((g) => {
      const n = news.items.filter((i) => g.id === "all" || i.group === g.id).length;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.setAttribute("aria-pressed", String(g.id === group));
      b.textContent = g.label;
      const c = document.createElement("span");
      c.className = "n";
      c.textContent = n;
      b.append(c);
      b.addEventListener("click", () => switchGroup(g.id));
      return b;
    })
  );
}

function switchGroup(id) {
  if (id === group) return;
  group = id;
  renderChips();
  if (!window.gsap) return renderList();
  gsap.to($("grid"), {
    opacity: 0,
    duration: cssSec("--dur-fade"),
    onComplete: () => {
      gsap.set($("grid"), { opacity: 1 });
      renderList();
    },
  });
}

function renderFooter(asOf) {
  $("today").textContent = kst({ year: "numeric", month: "long", day: "numeric", weekday: "long" });
  const failed = news.sources.filter((s) => !s.ok).map((s) => s.name);
  const p = $("credit");
  p.replaceChildren();
  p.append(
    `출처: ${news.sources.filter((s) => s.ok).map((s) => s.name).join(", ")}. 제목과 링크만 보여 주고 본문은 원문에서 읽어요. `,
    `기준 ${kst({ month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }, new Date(asOf))} (30분마다 갱신)`
  );
  if (failed.length) {
    const f = document.createElement("span");
    f.className = "fails";
    f.textContent = ` · 지금은 ${failed.join(", ")}를 못 가져왔어요.`;
    p.append(f);
  }
  $("api-url").textContent = location.origin + API.news;
  $("api-raw").href = API.news;
}

function showLoading() {
  $("chips").replaceChildren();
  setState(null);
  const sk = Array.from({ length: 6 }, () => {
    const li = document.createElement("li");
    li.className = "skeleton";
    return li;
  });
  $("grid").replaceChildren(...sk);
  $("live").textContent = "소식을 불러오는 중이에요";
}

async function load() {
  showLoading();
  try {
    const res = await fetch(API.news); // 🔌 API 호출
    const json = await res.json();
    if (!json.ok) throw Object.assign(new Error(json.error), { friendly: true });
    news = json.data;
    renderChips();
    renderFooter(json.asOf);
    renderList();
  } catch (e) {
    $("grid").replaceChildren();
    const msg = e.friendly
      ? e.message
      : location.protocol === "file:"
        ? "서버를 켠 뒤 localhost 주소로 열어 주세요."
        : "인터넷 연결을 확인하고 다시 불러와 주세요.";
    setState("fail", "소식을 불러오지 못했어요", msg, true);
  }
}

load();
