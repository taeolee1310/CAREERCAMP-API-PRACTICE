/* 음성 아이디어: 말하기 → 원문 확인 → Gemini 정리 → ideas/ 저장(로컬) 또는 md 다운로드(배포판)
   API 주소·$·reduced·kst·cssSec는 app.js에 있다.
   app.js와 전역 이름이 겹치지 않게 IIFE로 감싼다. */

(() => {

  const MAX_TEXT = 2000;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  const voice = $("voice");
  const tp7 = $("tp7"); // <tp7-recorder>: 녹음 키를 누르면 tp7-state 이벤트가 온다
  const draft = $("draft");
  const organizeBtn = $("organize");

  const STATE_TEXT = {
    idle: "녹음 버튼을 누르고 말해 보세요.",
    listening: "듣고 있어요. 다 말했으면 정지 버튼을 눌러 주세요.",
    organizing: "키워드로 정리하고 있어요.",
    saved: "정리했어요. 다른 아이디어도 이어서 말해 보세요.",
  };

  let mode = "loading"; // loading | local | online | error
  let canSave = false;
  let ideas = [];
  let sessionKeywords = [];
  let rec = null;
  let listening = false;
  let base = "";

  function setState(state, message) {
    voice.dataset.state = state;
    $("micState").textContent = message || STATE_TEXT[state];
    // 받아쓰기가 오류로 멈추거나 시작에 실패하면 녹음 키도 같이 올라온다
    tp7.toggleAttribute("recording", state === "listening");
    tp7.toggleAttribute("disabled", !SR || state === "organizing");
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
    const ERRORS = {
      "not-allowed": "마이크 권한이 꺼져 있어요. 주소창 왼쪽에서 마이크를 허용해 주세요.",
      "service-not-allowed": "마이크 권한이 꺼져 있어요. 주소창 왼쪽에서 마이크를 허용해 주세요.",
      "audio-capture": "마이크를 찾지 못했어요. 마이크가 연결됐는지 확인하거나 글로 적어 주세요.",
      "no-speech": "목소리가 들리지 않았어요. 마이크에 조금 더 가까이 대고 다시 눌러 주세요.",
      network: "음성 인식에 연결하지 못했어요. 인터넷 연결을 확인하거나 글로 적어 주세요.",
      "language-not-supported": "이 브라우저는 한국어 음성 인식을 지원하지 않아요. 글로 적어 주세요.",
    };
    rec.onerror = (e) => {
      if (e.error === "aborted") return; // 직접 멈춘 경우
      stopListening("error", ERRORS[e.error] || "음성 인식이 멈췄어요. 다시 눌러 주세요.");
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
  }

  function stopListening(state = "idle", message) {
    listening = false;
    if (rec) {
      rec.onend = null;
      rec.stop();
      rec = null;
    }
    setState(state, message || (draft.value.trim() ? "다 들었어요. 내용을 확인하고 정리하기를 눌러 주세요." : undefined));
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
    foot.append(el("span", "", savedAs ? `ideas/${savedAs}에 저장했어요.` : mode === "online" ? "온라인 버전은 저장하지 않아요. md 파일로 받아 두세요." : "폴더에 저장하지 못했어요. md 파일로 받아 두세요."));
    const dl = el("button", "ghost", "md 파일 받기");
    dl.type = "button";
    dl.addEventListener("click", () => download(idea));
    foot.append(dl);
    card.append(foot);
    box.replaceChildren(card);

    // 시그니처 순간: 키워드가 하나씩 떠오른다. 전체 길이(stagger 합 + 한 칸 시간)를 600ms 안으로
    if (window.gsap) {
      const dur = cssSec("--dur-enter");
      gsap.fromTo(card, { opacity: 0, y: reduced.matches ? 0 : 8 }, { opacity: 1, y: 0, duration: dur, ease: cssVar("--gsap-ease-out"), clearProps: "transform,opacity" });
      const n = kws.children.length;
      gsap.fromTo(
        kws.children,
        reduced.matches ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.9 },
        { opacity: 1, y: 0, scale: 1, duration: dur, stagger: Math.min(cssSec("--stagger"), 0.25 / Math.max(1, n - 1)), ease: cssVar("--gsap-ease-pop"), clearProps: "transform,opacity" }
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

  /* 쌓인 아이디어: 불러오는 중 · 비어 있음 · 실패 · 온라인 버전을 따로 보여 준다 */
  function renderIdeas() {
    const cloud = $("kwCloud");
    const list = $("ideaList");
    if (mode === "loading") {
      cloud.replaceChildren();
      list.replaceChildren(...[0, 1, 2].map(() => el("li", "idea-skel")));
      return;
    }
    if (mode === "error") {
      cloud.replaceChildren();
      const li = el("li", "ideas-fail", "모아 둔 아이디어를 불러오지 못했어요. 서버가 켜져 있는지 확인하고 다시 불러와 주세요.");
      const retry = el("button", "ghost", "다시 불러오기");
      retry.type = "button";
      retry.addEventListener("click", loadIdeas);
      li.append(document.createElement("br"), retry);
      list.replaceChildren(li);
      return;
    }
    if (mode === "online") {
      cloud.replaceChildren();
      list.replaceChildren(el("li", "empty", "온라인 버전은 아이디어를 모아 두지 않아요. 정리한 뒤 md 파일로 받아 두세요."));
      return;
    }
    if (!ideas.length) {
      cloud.replaceChildren();
      list.replaceChildren(el("li", "empty", "아직 모아 둔 아이디어가 없어요. 첫 아이디어를 말해 보세요."));
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

  const MODE_TEXT = {
    loading: "저장 방식을 확인하고 있어요",
    local: "내 컴퓨터 · ideas 폴더에 저장",
    online: "온라인 · md 파일로 받기",
    error: "저장 폴더에 연결하지 못했어요",
  };

  async function loadIdeas() {
    mode = "loading";
    $("mode").textContent = MODE_TEXT.loading;
    renderIdeas();
    try {
      const res = await fetch(API.ideas); // 🔌 API 호출
      if (res.status === 404) {
        mode = "online"; // 배포판에는 /api/ideas가 없다
      } else {
        const json = await res.json();
        if (!json.ok) throw new Error();
        ideas = json.data;
        mode = "local";
      }
    } catch {
      mode = "error"; // 로컬 서버가 꺼졌거나 오류. 배포판으로 착각하지 않는다
    }
    canSave = mode === "local";
    $("mode").textContent = MODE_TEXT[mode];
    renderIdeas();
  }

  /* 시작 */
  tp7.addEventListener("tp7-state", (e) => {
    if (e.detail.state === "recording") {
      if (!listening) startListening();
    } else if (listening) {
      stopListening();
    }
  });
  organizeBtn.addEventListener("click", organize);
  draft.addEventListener("input", updateCount);
  draft.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) organize();
  });

  if (SR) {
    setState("idle");
  } else {
    voice.classList.add("no-speech");
    setState("idle", "이 브라우저는 음성 인식을 지원하지 않아요. 아래 칸에 글로 적어 주세요. Chrome이나 Edge에서는 말로도 남길 수 있어요.");
  }
  loadIdeas();
})();
