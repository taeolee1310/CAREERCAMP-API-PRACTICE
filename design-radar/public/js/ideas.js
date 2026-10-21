/* 음성 아이디어: 말하기 → 원문 확인 → Gemini 정리 → ideas/ 저장(로컬) 또는 md 다운로드(배포판)
   API 주소·$·reduced·kst·cssSec는 app.js에 있다.
   app.js와 전역 이름이 겹치지 않게 IIFE로 감싼다. */

(() => {

  const MAX_TEXT = 2000;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  const voice = $("voice");
  const mic = $("mic");
  const ring = $("ring");
  const draft = $("draft");
  const organizeBtn = $("organize");

  const STATE_TEXT = {
    idle: "버튼을 누르고 말해 보세요.",
    listening: "듣고 있어요. 다 말했으면 버튼을 한 번 더 눌러 주세요.",
    organizing: "키워드로 정리하고 있어요.",
    saved: "정리했어요. 이어서 다른 아이디어도 말해 보세요.",
  };

  let canSave = false;
  let ideas = [];
  let sessionKeywords = [];
  let rec = null;
  let listening = false;
  let base = "";
  let meter = null;
  let level = 0;

  function setState(state, message) {
    voice.dataset.state = state;
    $("micState").textContent = message || STATE_TEXT[state];
    mic.setAttribute("aria-pressed", String(state === "listening"));
    mic.setAttribute("aria-label", state === "listening" ? "말하기 멈추기" : "말하기 시작");
    mic.disabled = !SR || state === "organizing";
    organizeBtn.disabled = state === "organizing" || draft.value.trim().length < 5;
  }

  function fail(message) {
    setState("error", message);
  }

  function updateCount() {
    $("count").textContent = `${draft.value.length} / ${MAX_TEXT}`;
    if (voice.dataset.state !== "organizing") {
      organizeBtn.disabled = draft.value.trim().length < 5;
    }
  }

  /* 소리 크기 → 링 크기. transform·opacity만 바꾼다 */
  async function startMeter() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      meter = { stream, ctx, raf: 0 };
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += ((v - 128) / 128) ** 2;
        level = level * 0.8 + Math.min(1, Math.sqrt(sum / buf.length) * 4) * 0.2;
        ring.style.opacity = String(0.25 + level * 0.6);
        ring.style.transform = reduced.matches ? "" : `scale(${1 + level * 0.8})`;
        meter.raf = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      meter = null; // 레벨 표시만 빠지고 받아쓰기는 계속된다
    }
  }

  function stopMeter() {
    if (meter) {
      cancelAnimationFrame(meter.raf);
      meter.stream.getTracks().forEach((t) => t.stop());
      meter.ctx.close();
      meter = null;
    }
    level = 0;
    ring.style.opacity = "";
    ring.style.transform = "";
  }

  function startListening() {
    base = draft.value.trim() ? `${draft.value.trim()} ` : "";
    rec = new SR();
    rec.lang = "ko-KR";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let text = "";
      for (const r of e.results) text += r[0].transcript;
      draft.value = (base + text).slice(0, MAX_TEXT);
      updateCount();
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        stopListening("error", "마이크 권한이 꺼져 있어요. 주소창 왼쪽에서 마이크를 허용해 주세요.");
      } else if (e.error === "network") {
        stopListening("error", "음성 인식에 연결하지 못했어요. 인터넷 연결을 확인하거나 글로 적어 주세요.");
      }
    };
    rec.onend = () => {
      if (listening) stopListening();
    };
    try {
      rec.start();
    } catch {
      return fail("음성 인식을 시작하지 못했어요. 잠시 뒤에 다시 눌러 주세요.");
    }
    listening = true;
    setState("listening");
    startMeter();
  }

  function stopListening(state = "idle", message) {
    listening = false;
    if (rec) {
      rec.onend = null;
      rec.stop();
      rec = null;
    }
    stopMeter();
    setState(state, message || (draft.value.trim() ? "다 들었어요. 원문을 확인하고 정리하기를 눌러 주세요." : undefined));
    if (state === "idle" && draft.value.trim()) organizeBtn.focus();
  }

  /* 저장 */
  function knownKeywords() {
    return [...new Set([...ideas.flatMap((i) => i.keywords), ...sessionKeywords])].slice(0, 100);
  }

  async function saveIdea(idea) {
    try {
      const res = await fetch(API.ideas, { // 🔌 API 호출
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: idea.filename, markdown: idea.markdown }),
      });
      const json = await res.json();
      return json.ok ? json.data.filename : null;
    } catch {
      return null;
    }
  }

  function download(idea) {
    const url = URL.createObjectURL(new Blob([idea.markdown], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = idea.filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function showResult(idea, savedAs) {
    const box = $("result");
    const card = el("article", "idea-card");
    const head = el("div", "idea-head");
    head.append(el("span", "badge", idea.type), el("h3", "idea-title", idea.title));
    const kws = el("div", "kws");
    idea.keywords.forEach((k) => kws.append(el("span", "kw", k)));
    card.append(head, el("p", "idea-summary", idea.summary), kws);
    if (idea.todos.length) {
      const ul = el("ul", "todos");
      idea.todos.forEach((t) => ul.append(el("li", "", t)));
      card.append(ul);
    }
    const foot = el("div", "idea-foot");
    foot.append(el("span", "", savedAs ? `ideas/${savedAs}에 저장했어요.` : canSave ? "폴더에 저장하지 못했어요. md로 받아 주세요." : "이 버전은 서버에 저장하지 않아요."));
    const dl = el("button", "ghost", "md 받기");
    dl.type = "button";
    dl.addEventListener("click", () => download(idea));
    foot.append(dl);
    card.append(foot);
    box.replaceChildren(card);

    // 시그니처 순간: 키워드가 하나씩 떠오른다
    if (window.gsap) {
      gsap.fromTo(card, { opacity: 0, y: reduced.matches ? 0 : 8 }, { opacity: 1, y: 0, duration: cssSec("--dur-enter"), ease: "power3.out", clearProps: "transform,opacity" });
      gsap.fromTo(
        kws.children,
        reduced.matches ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.9 },
        { opacity: 1, y: 0, scale: 1, duration: cssSec("--dur-enter"), stagger: 0.05, delay: 0.1, ease: "back.out(2)", clearProps: "transform,opacity" }
      );
    }
  }

  async function organize() {
    const text = draft.value.trim();
    if (text.length < 5) return;
    if (listening) stopListening();
    setState("organizing");
    try {
      const res = await fetch(API.organize, { // 🔌 API 호출
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, known: knownKeywords() }),
      });
      const json = await res.json().catch(() => ({ ok: false }));
      if (!json.ok) {
        throw Object.assign(new Error(json.error || "정리하지 못했어요. 잠시 뒤에 다시 시도해 주세요."), { friendly: true });
      }
      const idea = json.data;
      const savedAs = canSave ? await saveIdea(idea) : null;
      sessionKeywords.push(...idea.keywords);
      showResult(idea, savedAs);
      draft.value = "";
      updateCount();
      setState("saved");
      if (savedAs) loadIdeas();
    } catch (e) {
      // 원문은 지우지 않는다
      fail(e.friendly ? e.message : "서버에 연결하지 못했어요. 서버가 켜져 있는지 확인해 주세요.");
    }
  }

  /* 쌓인 아이디어 */
  function renderIdeas() {
    const cloud = $("kwCloud");
    const list = $("ideaList");
    if (!canSave) {
      cloud.replaceChildren();
      list.replaceChildren(el("li", "empty", "배포판은 아이디어를 서버에 쌓지 않아요. 정리한 뒤 md를 받아 ideas 폴더에 넣어 주세요."));
      return;
    }
    if (!ideas.length) {
      cloud.replaceChildren();
      list.replaceChildren(el("li", "empty", "아직 쌓인 아이디어가 없어요. 첫 아이디어를 말해 보세요."));
      return;
    }
    const counts = {};
    ideas.forEach((i) => i.keywords.forEach((k) => (counts[k] = (counts[k] || 0) + 1)));
    cloud.replaceChildren(
      ...Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([k, n]) => {
          const chip = el("span", "kw", k);
          if (n > 1) chip.append(el("span", "n", String(n)));
          return chip;
        })
    );
    list.replaceChildren(
      ...ideas.slice(0, 6).map((i) => {
        const li = el("li", "idea-row");
        li.append(el("strong", "", i.title), el("span", "idea-meta", [i.date.slice(5, 16), i.type, i.status].filter(Boolean).join(" · ")));
        return li;
      })
    );
    reveal([...list.children]);
  }

  async function loadIdeas() {
    try {
      const res = await fetch(API.ideas); // 🔌 API 호출
      const json = await res.json();
      if (!json.ok) throw new Error();
      ideas = json.data;
      canSave = true;
    } catch {
      canSave = false; // 배포판에는 /api/ideas가 없다
    }
    $("mode").textContent = canSave ? "로컬 · ideas 폴더에 저장" : "배포판 · md로 받기";
    renderIdeas();
  }

  /* 시작 */
  mic.addEventListener("click", () => (listening ? stopListening() : startListening()));
  organizeBtn.addEventListener("click", organize);
  draft.addEventListener("input", updateCount);
  draft.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) organize();
  });

  if (SR) {
    setState("idle");
  } else {
    voice.classList.add("no-speech");
    setState("idle", "이 브라우저는 음성 인식을 지원하지 않아요. 아래 칸에 글로 적어 주세요. (Chrome·Edge 권장)");
  }
  loadIdeas();
})();
