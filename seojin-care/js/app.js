/* =========================================================
   app.js — 화면을 그리고, 버튼을 누르면 무슨 일이 일어날지 정해요
   ---------------------------------------------------------
   화면 3개: setup(처음 설정) / main(메인) / duel(결투)
   결투 화면 안 단계: roulette → intro → countdown → play → result
   결투 단계는 서버(game.phase)를 따라가서 두 폰이 같은 화면을 봐요.
   ========================================================= */

const App = (() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const PL = CONFIG.PLAYERS;
  const nameOf = (r) => PL[r]?.name || "";

  let screen = null;          // 지금 보이는 화면
  let openTaskId = null;      // 펼쳐진 카드
  let duelLockUntil = 0;      // 결투 버튼 연타 방지
  const shownNotices = new Set();
  let noticesSeeded = false;

  // 결투 화면 상태 (이 폰에서만 쓰는 값)
  const duel = {
    round: null,        // 지금 보고 있는 판 번호
    phase: null,        // 지금 보여 주는 단계
    practice: false,    // 혼자 연습 중인지
    game: null,         // 게임 인스턴스 (BubbleGame.create 결과)
    gameDef: null,
    playStart: 0,
    finished: false,
    resultFor: null,    // 결과 화면을 보여 준 판 번호 (확인 누를 때까지 유지)
    doneRounds: new Set(), // 확인까지 누르고 나온 판 (다시 들어가지 않게)
    timers: [],
    loop: null,
    lastSent: -1,
    lastSentAt: 0,
  };

  // ---------- 공통 도우미 ----------
  function showScreen(id) {
    screen = id;
    $$(".screen").forEach((el) => { el.hidden = el.id !== "screen-" + id; });
    window.scrollTo(0, 0);
  }

  let toastTimer = null;
  function toast(text, ms = 2600) {
    const el = $("#toast");
    el.textContent = text;
    el.hidden = false;
    el.style.animation = "none"; void el.offsetWidth; el.style.animation = "";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, ms);
  }

  function openSheet(html) {
    $("#sheet").innerHTML = html;
    $("#sheet").hidden = false;
    $("#sheet-backdrop").hidden = false;
  }
  function closeSheet() {
    $("#sheet").hidden = true;
    $("#sheet-backdrop").hidden = true;
  }

  // 받침에 따라 은/는 고르기: 산책하기는, 심장사상충약은
  function eunNeun(word) {
    const c = word.charCodeAt(word.length - 1);
    if (c < 0xac00 || c > 0xd7a3) return word + "은(는)";
    return word + ((c - 0xac00) % 28 ? "은" : "는");
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ======================================================
  //  1. 처음 설정 화면
  // ======================================================
  function randomRoom() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let s = "";
    for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }
  function cleanRoom(v) { return v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12); }

  function showSetup() {
    showScreen("setup");
    $("#room-input").value = Net.savedRoom || CONFIG.DEFAULT_ROOM || "";
    $$(".role-btn").forEach((b) => {
      const r = b.dataset.role;
      b.innerHTML = `${pawSVG(PL[r].color)}<span>${nameOf(r)}</span><small></small>`;
    });
  }

  async function joinRoom() {
    const room = cleanRoom($("#room-input").value);
    if (room.length < 3) { $("#setup-status").textContent = "방 코드는 3글자 이상으로 정해 주세요."; return; }
    $("#room-input").value = room;
    $("#room-join").disabled = true;
    $("#setup-status").textContent = "서버에 연결하는 중…";
    const ok = await Net.connect(room);
    if (!ok) {
      $("#setup-status").innerHTML = `${escapeHtml(Net.failReason)}<br><button class="btn-link" onclick="location.reload()">다시 시도</button>`;
      return;
    }
    $("#setup-status").textContent = `방 ${room}에 들어왔어요.`;
    $("#setup-role").hidden = false;
    // 상대 정보가 도착할 시간을 잠깐 주고 역할 버튼 상태 표시
    setTimeout(renderRoleButtons, 700);
  }

  function renderRoleButtons() {
    if (screen !== "setup" || Net.status !== "online") return;
    $$(".role-btn").forEach((b) => {
      const taken = Net.roleTakenByOther(b.dataset.role);
      b.disabled = taken;
      b.querySelector("small").textContent = taken ? "다른 폰이 사용 중" : "";
    });
  }

  function pickRole(role) {
    if (!Net.claimRole(role)) {
      $("#role-note").textContent = `${nameOf(role)} 자리는 이미 다른 폰이 쓰고 있어요.`;
      renderRoleButtons();
      return;
    }
    goMain();
  }

  // ======================================================
  //  2. 메인 화면
  // ======================================================
  function goMain() {
    showScreen("main");
    renderMain();
  }

  function renderMain() {
    if (screen !== "main") return;
    renderWeek();
    renderPlayers();
    renderTasks();
    renderRoomBar();
  }

  function renderWeek() {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay()); // 이번 주 일요일
    const letters = ["S", "M", "T", "W", "T", "F", "S"];
    const hasAssigned = Store.tasks().some((t) => Store.assignment(t.id) && !Store.isDone(t));
    let html = letters.map((l, i) =>
      `<div class="week-day ${i === 0 ? "sun" : i === 6 ? "sat" : ""}">${l}</div>`).join("");
    html += `<div class="week-dates">`;
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const isToday = d.toDateString() === now.toDateString();
      html += `<div class="week-date ${isToday ? "today" : ""}"><span>${d.getDate()}</span>`;
      if (isToday) {
        // 오늘 매일 할 일을 얼마나 끝냈는지 막대로
        html += `<div class="bar"><i style="width:${Math.round(Store.dayProgress(d) * 100)}%"></i></div>`;
        if (hasAssigned) html += `<i class="dot" title="결투로 정해진 일이 남았어요"></i>`;
      }
      html += `</div>`;
    }
    html += `</div>`;
    $("#week").innerHTML = html;
  }

  // 이번 주에 더 많이 한 사람의 발바닥이 더 커요
  function renderPlayers() {
    const c = Store.weekCounts();
    const max = Math.max(c.seoyoung, c.seoin, 1);
    const online = Net.status === "online" ? Net.players() : {};
    $("#players").innerHTML = Net.ROLES.map((r) => {
      const size = c.seoyoung + c.seoin === 0 ? 70 : 45 + 53 * (c[r] / max);
      const isMe = Net.myRole() === r;
      return `
        <div class="player">
          <div style="width:${size}px;height:${size * 0.96}px">${pawSVG(PL[r].color)}</div>
          <div class="player-name"><i class="online ${online[r] ? "on" : ""}"></i>${nameOf(r)}${isMe ? " (나)" : ""}</div>
          <div class="player-count">이번 주 ${c[r]}번</div>
        </div>`;
    }).join("");
    $$("#players .paw-svg").forEach((s) => { s.style.width = "100%"; s.style.height = "100%"; });
  }

  function historyPaws(taskId) {
    const h = Store.history(taskId);
    const slots = [null, null, null].slice(h.length).concat(h);
    return slots.map((by, i) => {
      if (!by) return pawSVG("#f3e6e0");
      const shade = i === 2 ? PL[by].color : i === 1 ? PL[by].light : PL[by].pale;
      return pawSVG(shade);
    }).join("");
  }

  function cardHTML(t, done) {
    const a = Store.assignment(t.id);
    const last = Store.lastDone(t.id);
    const stripe = !done && a ? `<span class="task-stripe" style="background:${PL[a.by].color}"></span>` : "";
    const action = done && last ? pawSVG(PL[last.by].color) : pawSVG("#bb9999", true);
    const choices = done ? "" : `
      <div class="task-choices">
        <button class="choice" data-act="done" data-by="seoyoung" type="button">${pawSVG(PL.seoyoung.color)}<span>${nameOf("seoyoung")}</span></button>
        <button class="choice" data-act="done" data-by="seoin" type="button">${pawSVG(PL.seoin.color)}<span>${nameOf("seoin")}</span></button>
        <button class="choice" data-act="duel" type="button">${swordsSVG()}<span>결투</span></button>
      </div>`;
    return `
      <article class="task-card ${openTaskId === t.id && !done ? "is-open" : ""}" data-id="${t.id}" data-done="${done ? 1 : 0}">
        ${stripe}
        <div class="task-main">
          <h3 class="task-title">${escapeHtml(t.title)}</h3>
          <p class="task-sub">${escapeHtml(Store.subText(t))}</p>
        </div>
        <div class="task-history">${historyPaws(t.id)}</div>
        <div class="task-divider"></div>
        <div class="task-action">${action}</div>
        ${choices}
      </article>`;
  }

  function renderTasks() {
    const todo = [], done = [];
    for (const t of Store.tasks()) (Store.isDone(t) ? done : todo).push(t);
    // 담당자가 정해진 일을 위로
    todo.sort((a, b) => (Store.assignment(b.id) ? 1 : 0) - (Store.assignment(a.id) ? 1 : 0));
    $("#task-list").innerHTML = todo.map((t) => cardHTML(t, false)).join("");
    $("#done-list").innerHTML = done.map((t) => cardHTML(t, true)).join("");
    $("#done-label").hidden = done.length === 0;
  }

  function onTaskClick(e) {
    const card = e.target.closest(".task-card");
    if (!card) return;
    const id = card.dataset.id;
    const t = Store.task(id);
    if (!t) return;

    // 완료된 카드 → 취소할지 물어보기 (밥 중복 급여 방지 확인용)
    if (card.dataset.done === "1") return openUndoSheet(t);

    const choice = e.target.closest(".choice");
    if (!choice) {
      openTaskId = openTaskId === id ? null : id;
      return renderTasks();
    }
    if (choice.dataset.act === "done") {
      const by = choice.dataset.by;
      Store.complete(id, by);
      openTaskId = null;
      toast(`${Net.iga(by)} ${t.title} 완료!`);
      return renderMain();
    }
    if (choice.dataset.act === "duel") {
      if (Date.now() < duelLockUntil) return;
      const res = Net.requestDuel(t.id, t.title);
      if (!res.ok) {
        toast(res.reason);
        if (Net.status !== "online" || !Net.myRole()) openRoomSheet();
        return;
      }
      duelLockUntil = Date.now() + 2500;
      toast("결투 신청! 잠시만요…", 1800);
    }
  }

  function openUndoSheet(t) {
    const last = Store.lastDone(t.id);
    const when = last ? new Date(last.at) : null;
    const whenText = when ? `${when.getMonth() + 1}/${when.getDate()} ${when.getHours()}:${String(when.getMinutes()).padStart(2, "0")}` : "";
    openSheet(`
      <h3>${escapeHtml(t.title)}</h3>
      <p>${last ? `${whenText}에 <b>${Net.iga(last.by)}</b> 이미 했어요.` : ""}
      ${t.type === "daily" ? "<br>두 번 하지 않도록 확인해 주세요!" : ""}</p>
      <button class="btn btn-ghost" data-sheet="undo" type="button">완료 취소</button>
      ${t.custom ? `<button class="btn btn-link" data-sheet="remove" type="button">목록에서 삭제</button>` : ""}
      <button class="btn btn-main" data-sheet="close" type="button">닫기</button>`);
    $("#sheet").onclick = (e) => {
      const act = e.target.closest("[data-sheet]")?.dataset.sheet;
      if (!act) return;
      if (act === "undo") { Store.undo(t.id); toast("완료를 취소했어요"); }
      if (act === "remove") { Store.removeTask(t.id); toast("삭제했어요"); }
      closeSheet();
      renderMain();
    };
  }

  function openAddSheet() {
    let type = "daily";
    openSheet(`
      <h3>할 일 추가</h3>
      <input id="new-title" class="text-input" maxlength="14" placeholder="예: 병원가기" />
      <div class="seg"><button data-type="daily" class="on" type="button">매일</button><button data-type="periodic" type="button">주기</button></div>
      <div class="days-row" id="days-row" hidden><input id="new-days" class="text-input" type="number" min="1" max="365" value="7" /> 일마다</div>
      <button class="btn btn-main" data-sheet="add" type="button">추가</button>
      <button class="btn btn-link" data-sheet="close" type="button">닫기</button>`);
    $("#sheet").onclick = (e) => {
      const seg = e.target.closest("[data-type]");
      if (seg) {
        type = seg.dataset.type;
        $$(".seg button").forEach((b) => b.classList.toggle("on", b === seg));
        $("#days-row").hidden = type !== "periodic";
        return;
      }
      const act = e.target.closest("[data-sheet]")?.dataset.sheet;
      if (act === "close") return closeSheet();
      if (act === "add") {
        const title = $("#new-title").value.trim();
        if (!title) return toast("이름을 적어 주세요");
        const days = Math.max(1, Math.min(365, parseInt($("#new-days").value, 10) || 7));
        Store.addTask(title, type, days);
        closeSheet();
        renderMain();
      }
    };
    setTimeout(() => $("#new-title").focus(), 250);
  }

  // ---------- 아래 고정 띠 + 방 설정 시트 ----------
  function renderRoomBar() {
    const bar = $("#room-bar");
    if (!bar || screen !== "main") return;
    if (Net.status === "connecting") { bar.textContent = "서버 연결 중…"; return; }
    if (Net.status === "failed") { bar.textContent = "연결 실패 · 눌러서 다시 시도"; return; }
    if (Net.status !== "online") { bar.textContent = "방에 들어가기"; return; }
    const ps = Net.players();
    const who = Net.ROLES.map((r) => `<span class="who"><i class="${ps[r] ? "on" : ""}"></i>${nameOf(r)}</span>`).join("");
    bar.innerHTML = `방 ${escapeHtml(Net.roomCode)} ${who}`;
  }

  function openRoomSheet() {
    if (Net.status === "failed") return location.reload();
    if (Net.status !== "online") {
      return openSheet(`<h3>방 연결</h3><p>${Net.status === "connecting" ? "연결하는 중이에요…" : "아직 방에 들어가지 않았어요."}</p>
        <button class="btn btn-main" onclick="Net.leaveRoom()" type="button">방 코드 입력하기</button>
        <button class="btn btn-link" data-sheet="close" type="button">닫기</button>`);
    }
    const role = Net.myRole();
    const partner = role ? Net.otherRole(role) : null;
    const conflict = Net.roleConflict();
    openSheet(`
      <h3>방 ${escapeHtml(Net.roomCode)}</h3>
      <p>
        나: <b>${role ? nameOf(role) : "아직 안 고름"}</b>${conflict ? " — 다른 폰이 같은 이름을 쓰고 있어요" : ""}<br>
        ${partner ? `${nameOf(partner)}: ${Net.partnerOnline() ? "접속 중 ✅" : "아직 없음"}` : ""}<br>
        같은 방 코드로 들어온 폰끼리 결투할 수 있어요.
      </p>
      ${!role || conflict ? `<div class="role-row" style="margin-bottom:8px">${Net.ROLES.map((r) =>
        `<button class="role-btn" data-pick="${r}" type="button" ${Net.roleTakenByOther(r) ? "disabled" : ""}>${pawSVG(PL[r].color)}<span>${nameOf(r)}</span></button>`).join("")}</div>` : ""}
      <button class="btn btn-ghost" data-sheet="practice" type="button">거품내기 혼자 연습</button>
      <button class="btn btn-ghost" data-sheet="practice-jini" type="button">지니 잡기 혼자 연습</button>
      <button class="btn btn-ghost" data-sheet="practice-call" type="button">지니 부르기 혼자 연습</button>
      <button class="btn btn-ghost" data-sheet="practice-walk" type="button">서진이 산책시키기 혼자 연습</button>
      <button class="btn btn-link" data-sheet="leave" type="button">방 / 사람 바꾸기</button>
      <button class="btn btn-main" data-sheet="close" type="button">닫기</button>`);
    $("#sheet").onclick = (e) => {
      const pick = e.target.closest("[data-pick]");
      if (pick) {
        if (Net.claimRole(pick.dataset.pick)) { closeSheet(); renderMain(); }
        else toast("그 자리는 다른 폰이 쓰고 있어요");
        return;
      }
      const act = e.target.closest("[data-sheet]")?.dataset.sheet;
      if (act === "close") closeSheet();
      if (act === "leave") Net.leaveRoom();
      if (act === "practice") { closeSheet(); startPractice("bubble"); }
      if (act === "practice-jini") { closeSheet(); startPractice("jini"); }
      if (act === "practice-call") { closeSheet(); startPractice("call"); }
      if (act === "practice-walk") { closeSheet(); startPractice("walk"); }
    };
  }

  // ---------- 연결 상태 띠 ----------
  function renderBanner() {
    const b = $("#net-banner");
    let html = "";
    if (Net.status === "online" && !Net.connectionOk) {
      html = `서버와 연결이 불안정해요 <button onclick="location.reload()">새로고침</button>`;
    } else if (Net.status === "online" && Net.roleConflict()) {
      html = `다른 폰이 ${nameOf(Net.myRole())} 자리를 쓰고 있어요 <button onclick="App.openRoomSheet()">바꾸기</button>`;
    }
    b.hidden = !html;
    if (html && b.innerHTML !== html) b.innerHTML = html;
  }

  // ======================================================
  //  3. 결투 화면 — 서버 상태를 따라가요
  // ======================================================
  function onNetChange() {
    renderBanner();
    if (screen === "setup") renderRoleButtons();
    if (screen === "main") { renderRoomBar(); renderPlayersOnlineOnly(); }

    const g = Net.game;
    if (!g) return;

    // 알림 (처음 연결했을 때 남아 있던 옛 알림은 무시)
    if (!noticesSeeded) { if (g.notice) shownNotices.add(g.notice.id); noticesSeeded = true; }
    if (g.notice && !shownNotices.has(g.notice.id)) {
      shownNotices.add(g.notice.id);
      if (!g.notice.to || g.notice.to === Net.myRole()) toast(g.notice.text, 3200);
    }

    // 새로고침 등으로 결과를 놓쳤으면 조용히 기록에 반영
    const lr = g.lastResult;
    if (g.phase === "lobby" && lr && !lr.tie && Store.applyDuelResult(lr.roundId, lr.taskId, lr.loser) && duel.resultFor !== lr.roundId) {
      toast(`지난 결투 결과: ${lr.taskTitle} ${nameOf(lr.loser)} 담당`, 3200);
      renderMain();
    }

    const role = Net.myRole();
    const isPlayer = role && !Net.roleConflict();
    const finishedHere = duel.doneRounds.has(g.roundId) || (Net.me && Net.me.ack === g.roundId);
    const active = g.phase !== "lobby" && g.roundId && !finishedHere;

    // 혼자 연습 중에 상대가 결투를 걸면 연습을 접고 결투로
    if (duel.practice) {
      if (!(isPlayer && active)) return;
      clearTimers();
      destroyGame();
      duel.practice = false;
      duel.round = null;
    }

    if (isPlayer && active) {
      if (duel.round !== g.roundId) enterDuel(g);
      followPhase(g);
      liveUpdate(g);
    } else if (screen === "duel" && duel.resultFor !== duel.round) {
      // 결투가 취소됨 (알림은 위에서 띄움)
      leaveDuel();
    }
  }

  // 메인 화면에서 접속 점(초록)만 가볍게 갱신
  function renderPlayersOnlineOnly() {
    const ps = Net.status === "online" ? Net.players() : {};
    $$("#players .player").forEach((el, i) => {
      el.querySelector(".online")?.classList.toggle("on", !!ps[Net.ROLES[i]]);
    });
  }

  function clearTimers() {
    duel.timers.forEach(clearTimeout);
    duel.timers = [];
    clearInterval(duel.loop);
    duel.loop = null;
  }

  function enterDuel(g) {
    clearTimers();
    destroyGame();
    duel.round = g.roundId;
    duel.phase = null;
    duel.finished = false;
    duel.resultFor = null;
    duel.lastSent = -1;
    Net.enterRound(g.roundId); // 새 판이면 내 준비/점수 초기화, 새로고침이면 이어서
    closeSheet();
    openTaskId = null;
    showScreen("duel");
    $$("[data-fill=task]").forEach((el) => { el.textContent = g.taskTitle || "돌봄"; });
  }

  function leaveDuel() {
    if (duel.round && !duel.practice) duel.doneRounds.add(duel.round);
    clearTimers();
    destroyGame();
    Cam.stop(); // 카메라 불 끄기
    Mic.stop(); // 마이크 끄기
    duel.round = null;
    duel.phase = null;
    duel.practice = false;
    duel.resultFor = null;
    goMain();
  }

  function showPanel(name) {
    $$(".duel-panel").forEach((el) => { el.hidden = el.id !== "duel-" + name; });
  }

  function followPhase(g) {
    if (duel.phase === g.phase) return;
    // 결과를 보고 있는 동안 서버가 로비로 가도 화면은 그대로
    if (duel.resultFor === g.roundId) return;
    duel.phase = g.phase;
    const def = gameById(g.gameId);
    duel.gameDef = def;

    if (g.phase === "roulette") { showPanel("roulette"); runRoulette(def); }
    if (g.phase === "intro") showIntro(def, false);
    if (g.phase === "countdown") runCountdown();
    if (g.phase === "play") startPlay(def, false);
    if (g.phase === "result") showResult(g.result);
  }

  // 단계는 그대로인데 계속 바뀌는 것 (상대 준비 여부, 상대 점수)
  function liveUpdate(g) {
    if (g.phase === "intro") renderVs();
    if (g.phase === "play") renderHudScores();
  }

  // ---------- 룰렛 ----------
  function runRoulette(target) {
    const card = $("#roulette-card");
    const total = CONFIG.ROULETTE_MS - 400;
    // 점점 느려지는 간격 만들기
    const delays = [];
    let d = 60, sum = 0;
    while (sum + d < total) { delays.push(d); sum += d; d *= 1.13; }
    // 마지막 칸이 target이 되도록 시작 위치 계산
    const ti = GAMES.indexOf(target);
    let idx = ((ti - delays.length) % GAMES.length + GAMES.length) % GAMES.length;
    const paint = (g, landed) => {
      card.innerHTML = `<div class="emoji">${g.icon}</div><div class="label">${g.name}</div>`;
      card.classList.toggle("landed", landed);
    };
    paint(GAMES[idx], false);
    let t = 0;
    delays.forEach((dl, i) => {
      t += dl;
      duel.timers.push(setTimeout(() => {
        idx = (idx + 1) % GAMES.length;
        paint(GAMES[idx], i === delays.length - 1);
      }, t));
    });
  }

  // ---------- 안내 + 준비 ----------
  function showIntro(def, practice) {
    showPanel("intro");
    $("#intro-icon").textContent = def.icon;
    $("#intro-name").textContent = def.name;
    $("#intro-how").textContent = def.how;
    $("#intro-win").textContent = def.win;
    $(".intro-lose").hidden = practice;
    $("#intro-ready").textContent = practice ? "시작" : "준비 완료";
    $("#intro-ready").disabled = false;
    $("#intro-cancel").textContent = practice ? "그만하기" : "결투 취소";
    $("#intro-sensor").textContent = inputHint(def);
    // 카메라 게임이면 무거운 ml5를 미리 불러 두기 (준비 버튼 누를 때 덜 기다리게)
    if (def.input === "camera") Cam.loadModel().catch(() => {});
    if (practice) $("#intro-vs").innerHTML = "";
    else renderVs();
  }

  // 카메라 게임마다 '카메라가 안 될 때' 대체 조작이 달라요 (지니 잡기: 누르기 / 산책: 좌우로 밀기)
  function camFallback(def) {
    const walk = def && def.id === "walk";
    return {
      on: walk ? CONFIG.WALK.ALLOW_TOUCH_FALLBACK : CONFIG.JINI.ALLOW_TOUCH_FALLBACK,
      text: (def && def.touchHint) || "지니를 손가락으로 눌러서 잡아요",
    };
  }

  function inputHint(def) {
    if (def && def.input === "mic") {
      const touch = CONFIG.CALL.ALLOW_TOUCH_FALLBACK ? " → 화면을 위아래로 문질러 음 높이를 대신해요" : "";
      if (!window.isSecureContext) return "⚠️ https 주소가 아니라 마이크를 못 써요" + touch;
      if (!Mic.hasMic) return "이 기기에는 마이크가 없어요" + touch;
      if (Mic.ready) return "마이크 준비 완료 👌";
      return "준비 버튼을 누르면 마이크 허용을 물어봐요. 허용을 눌러 주세요!";
    }
    if (def && def.input === "camera") {
      const fb = camFallback(def);
      const touch = fb.on ? " → " + fb.text : "";
      if (!window.isSecureContext) return "⚠️ https 주소가 아니라 카메라를 못 써요" + touch;
      if (!Cam.hasCamera) return "이 기기에는 카메라가 없어요" + touch;
      if (Cam.ready) return "카메라 준비 완료 👌";
      return "준비 버튼을 누르면 카메라 허용을 물어봐요. 허용을 눌러 주세요!";
    }
    return sensorHint();
  }

  function sensorHint() {
    if (!window.isSecureContext) return "⚠️ https 주소가 아니라 흔들기 센서를 못 써요 → 화면 문지르기로 대신해요";
    if (!Motion.hasMotion) return "이 기기에는 흔들기 센서가 없어요 → 화면 문지르기로 대신해요";
    if (Motion.needsPermission && !Motion.granted) return "준비 버튼을 누르면 '동작 및 방향' 접근을 물어봐요. 허용을 눌러 주세요!";
    return "";
  }

  function renderVs() {
    const g = Net.game;
    const ps = Net.players();
    $("#intro-vs").innerHTML = Net.ROLES.map((r, i) => {
      const p = ps[r];
      const ok = p && p.ready === g.roundId;
      return `${i ? '<span class="vs-x">VS</span>' : ""}
        <div class="vs-player">${pawSVG(PL[r].color)}<span>${nameOf(r)}</span>
        <small class="${ok ? "ok" : ""}">${!p ? "연결 끊김…" : ok ? "준비 완료" : "준비 중"}</small></div>`;
    }).join("");
    const meReady = Net.me && Net.me.ready === g.roundId;
    $("#intro-ready").disabled = meReady;
    if (meReady) $("#intro-ready").textContent = "상대를 기다리는 중…";
  }

  async function onReadyClick() {
    const btn = $("#intro-ready");
    btn.disabled = true;
    const def = duel.gameDef;

    if (def && def.input === "mic") {
      // ⚠️ 버튼 누른 바로 이 순간에 마이크를 요청해야 허용 팝업이 떠요
      const res = await Mic.request();
      const fallback = CONFIG.CALL.ALLOW_TOUCH_FALLBACK;
      if (res !== "granted") {
        $("#intro-sensor").textContent = (res === "denied" ? "마이크가 거부됐어요. " : "이 기기/주소에선 마이크를 못 써요. ")
          + (fallback ? "화면을 위아래로 문질러서 할게요." : "다시 눌러 주세요.");
        if (!fallback) { btn.disabled = false; return; }
      } else {
        $("#intro-sensor").textContent = "마이크 준비 완료 👌 조용한 곳에서 해요";
      }
      if (duel.practice) return runCountdown();
      if (duel.phase !== "intro") return;
      Net.ready();
      renderVs();
      return;
    }

    if (def && def.input === "camera") {
      const ok = await prepareCamera(btn);
      if (!ok) return;
      // 모델 불러오는 사이에 결투가 취소됐으면 멈춤
      if (!duel.practice && duel.phase !== "intro") return;
      if (duel.practice) return runCountdown();
      Net.ready();
      renderVs();
      return;
    }

    // ⚠️ iPhone: 버튼을 누른 바로 이 순간에 센서 권한을 물어봐야 해요
    const res = await Motion.request();
    const fallback = CONFIG.BUBBLE.ALLOW_TOUCH_FALLBACK;
    if (res === "denied" || res === "need-tap") {
      $("#intro-sensor").textContent = fallback
        ? "센서가 거부됐어요. 화면 문지르기로 할게요. (다시 켜려면 Safari를 완전히 껐다 켜 주세요)"
        : "센서를 허용해야 할 수 있어요. 다시 눌러 주세요.";
      if (!fallback) { btn.disabled = false; return; }
    } else if (res === "insecure" || res === "unsupported") {
      if (!fallback) { $("#intro-sensor").textContent = "이 기기/주소에선 센서를 못 써요."; btn.disabled = false; return; }
    } else {
      $("#intro-sensor").textContent = "센서 준비 완료 👌";
    }

    if (duel.practice) return runCountdown();
    Net.ready();
    renderVs();
  }

  // 카메라 켜기 + 동작 인식 모델 준비. 진행해도 되면 true
  async function prepareCamera(btn) {
    const note = $("#intro-sensor");
    const fb = camFallback(duel.gameDef);
    const fallback = fb.on;
    const label = btn.textContent;
    const res = await Cam.request(); // ⚠️ 버튼 누른 순간에 요청해야 허용 팝업이 떠요
    if (res !== "granted") {
      note.textContent = res === "denied" ? "카메라가 거부됐어요. " : "이 기기/주소에선 카메라를 못 써요. ";
      if (!fallback) { btn.disabled = false; return false; }
      note.textContent += fb.text;
      return true;
    }
    btn.textContent = "동작 인식 불러오는 중…";
    note.textContent = "처음엔 10초 정도 걸릴 수 있어요";
    try {
      await Cam.loadModel();
      Cam.startDetect(); // 미리 돌려 두면 게임 시작하자마자 인식돼요
      note.textContent = (duel.gameDef && duel.gameDef.camReadyNote) || "카메라 준비 완료 👌 폰을 세워 두고 상체가 다 보이게 한 걸음 뒤로!";
      btn.textContent = label;
      return true;
    } catch (err) {
      btn.textContent = label;
      note.textContent = "동작 인식을 못 불러왔어요 (인터넷 연결 확인). " + (fallback ? fb.text : "다시 눌러 주세요.");
      if (!fallback) { btn.disabled = false; return false; }
      return true;
    }
  }

  function onCancelClick() {
    if (duel.practice) return leaveDuel();
    Net.cancel();
    $("#intro-cancel").disabled = true;
    setTimeout(() => { $("#intro-cancel").disabled = false; }, 1500);
  }

  // ---------- 카운트다운 ----------
  function runCountdown() {
    showPanel("countdown");
    $(".countdown-sub").textContent = (duel.gameDef && duel.gameDef.countdownSub) || "폰을 꽉 쥐세요!";
    const el = $("#countdown-num");
    const step = CONFIG.COUNTDOWN_MS / 4;
    ["3", "2", "1", "시작!"].forEach((txt, i) => {
      duel.timers.push(setTimeout(() => {
        el.textContent = txt;
        el.style.animation = "none"; void el.offsetWidth; el.style.animation = "";
      }, i * step));
    });
    if (duel.practice) {
      duel.timers.push(setTimeout(() => startPlay(duel.gameDef, true), CONFIG.COUNTDOWN_MS));
    }
  }

  // ---------- 게임 ----------
  function destroyGame() {
    if (duel.game) { duel.game.destroy(); duel.game = null; }
    $("#game-stage").innerHTML = "";
  }

  function startPlay(def, practice) {
    showPanel("play");
    $("#judging").hidden = true;
    $("#hud-title").textContent = def.name;
    $("#hud-sub").textContent = def.sub || def.how;
    $("#hud-mode").hidden = true;
    $("#judging p").textContent = def.judging || "거품 세는 중…";
    const cam = def.input === "camera";

    const mod = def.module ? def.module() : null;
    if (!mod) { toast("아직 준비 중인 게임이에요"); return; }

    destroyGame();
    duel.game = mod.create($("#game-stage"), {
      onScore: () => renderHudScores(),
      onMode: (m) => {
        $("#hud-mode").hidden = m !== "touch";
        $("#hud-mode").textContent = "센서 신호 없음 · 화면을 문질러서 거품 만들기";
      },
      onHint: (t) => {
        $("#hud-mode").hidden = !t;
        $("#hud-mode").textContent = t;
      },
      color: PL[Net.myRole() || "seoyoung"].color,
      // 산책 게임: 같은 결투면 두 폰에 똑같은 장애물 길이 나오게
      seed: practice ? Date.now() : Net.game.roundId,
    });

    // 새로고침 후 이어 하기: 저장된 점수부터 시작
    if (!practice && Net.me && Net.me.scoreRound === Net.game.roundId && Net.me.score > 0) {
      duel.game.setScore(Net.me.score);
    }

    duel.playStart = practice ? Date.now() : Net.playStart();
    duel.finished = false;
    duel.game.start();

    // iPhone에서 새로고침했다면 센서를 다시 허락받아야 해요 → 화면 탭 요청
    // (카메라 게임도 새로고침하면 카메라를 다시 켜야 해요)
    const mic = def.input === "mic";
    const needTap = mic
      ? Mic.hasMic && window.isSecureContext && (Mic.lastResult === null || (Mic.lastResult === "granted" && !Mic.ready))
      : cam
      ? Cam.hasCamera && window.isSecureContext && Cam.lastResult === null
      : Motion.needsPermission && !Motion.granted && window.isSecureContext;
    $("#sensor-resume").textContent = mic ? "화면을 눌러 마이크 다시 켜기" : cam ? "화면을 눌러 카메라 다시 켜기" : "화면을 눌러 센서 다시 켜기";
    $("#sensor-resume").hidden = !needTap;

    renderHudScores();
    clearInterval(duel.loop);
    duel.loop = setInterval(() => playTick(practice), 100);
    playTick(practice);
  }

  function playTick(practice) {
    if (!duel.game) return;
    const left = CONFIG.PLAY_MS - (Date.now() - duel.playStart);
    $("#hud-timer").textContent = Math.max(0, Math.ceil(left / 1000));
    const s = duel.game.score();

    // 점수는 0.3초마다 한 번만 서버로 (너무 자주 보내면 느려져요)
    if (!practice && !duel.finished && s !== duel.lastSent && Date.now() - duel.lastSentAt > 300) {
      Net.reportScore(s);
      duel.lastSent = s;
      duel.lastSentAt = Date.now();
    }

    if (left <= 0 && !duel.finished) {
      duel.finished = true;
      duel.game.stop();
      $("#sensor-resume").hidden = true;
      if (practice) {
        clearInterval(duel.loop);
        return showPracticeResult(s);
      }
      Net.finish(s);
      $("#judging").hidden = false;
    }
  }

  function renderHudScores() {
    if (!duel.game) return;
    const mine = duel.game.score();
    if (duel.practice) {
      $("#hud-scores").innerHTML = `<span class="hud-score me" style="color:${PL[Net.myRole() || "seoyoung"].color}">${pawSVG(PL[Net.myRole() || "seoyoung"].color)}<b style="color:var(--ink)">${mine}</b></span>`;
      return;
    }
    const ps = Net.players();
    const my = Net.myRole();
    const round = Net.game.roundId;
    $("#hud-scores").innerHTML = Net.ROLES.map((r) => {
      const isMe = r === my;
      const p = ps[r];
      const v = isMe ? mine : (p && p.scoreRound === round ? p.score : 0);
      return `<span class="hud-score ${isMe ? "me" : ""}" style="color:${PL[r].color}">${pawSVG(PL[r].color)}<b style="color:var(--ink)">${nameOf(r)} ${v}</b></span>`;
    }).join("");
  }

  // ---------- 결과 ----------
  function showResult(r) {
    if (!r) return;
    clearTimers();
    if (duel.game) duel.game.stop();
    duel.resultFor = r.roundId;
    showPanel("result");

    if (!r.tie) Store.applyDuelResult(r.roundId, r.taskId, r.loser);
    const gdef = gameById(r.gameId) || {};
    const unit = gdef.unit || "개";

    const max = Math.max(r.scores.seoyoung, r.scores.seoin, 1);
    $("#result-scores").innerHTML = Net.ROLES.map((k) => `
      <div class="result-row"><span>${nameOf(k)}</span>
      <div class="track"><i style="width:0;background:${PL[k].color}" data-w="${(r.scores[k] / max) * 100}"></i></div>
      <span>${r.scores[k]}${unit}</span></div>`).join("");
    requestAnimationFrame(() => requestAnimationFrame(() => {
      $$("#result-scores i").forEach((i) => { i.style.width = i.dataset.w + "%"; });
    }));

    if (r.tie) {
      $("#result-kicker").textContent = gdef.tieText || "점수가 똑같아요!";
      $("#result-paw").innerHTML = pawSVG("#bb9999", true);
      $("#result-name").textContent = "무승부";
      $("#result-name").style.color = "var(--ink)";
      $("#result-line").textContent = "한 판 더 해야겠는데요?";
      $("#result-again").hidden = false;
    } else {
      const loser = r.loser;
      const mine = Net.myRole() === loser;
      $("#result-kicker").textContent = "오늘의 희생양은…";
      $("#result-paw").innerHTML = pawSVG(PL[loser].color);
      $("#result-name").textContent = nameOf(loser) + "!";
      $("#result-name").style.color = PL[loser].color;
      $("#result-line").textContent = `오늘 ${eunNeun(r.taskTitle)} ${nameOf(loser)} 담당!${mine ? " 🫠" : " 🎉"}`;
      $("#result-again").hidden = true;
    }
    $("#result-ok").textContent = "확인";
  }

  function showPracticeResult(score) {
    showPanel("result");
    duel.resultFor = "practice";
    const r = Net.myRole() || "seoyoung";
    $("#result-kicker").textContent = "연습 기록";
    $("#result-paw").innerHTML = pawSVG(PL[r].color);
    const def = duel.gameDef || {};
    $("#result-name").textContent = `${def.scoreLabel || ""} ${score}${def.unit || "개"}`;
    $("#result-name").style.color = PL[r].color;
    $("#result-line").textContent = def.practiceLine || "";
    $("#result-scores").innerHTML = "";
    $("#result-again").hidden = false;
  }

  function onResultOk() {
    if (!duel.practice) Net.ack();
    leaveDuel();
  }

  function onAgain() {
    if (duel.practice) return startPractice(duel.gameDef ? duel.gameDef.id : "bubble");
    // 무승부 → 같은 일로 다시 결투 신청
    const r = Net.game && (Net.game.result || Net.game.lastResult);
    Net.ack();
    leaveDuel();
    if (r) setTimeout(() => {
      const res = Net.requestDuel(r.taskId, r.taskTitle);
      toast(res.ok ? "재대결 신청!" : res.reason);
    }, 600);
  }

  // ---------- 혼자 연습 (서버 없이) ----------
  function startPractice(gameId = "bubble") {
    clearTimers();
    destroyGame();
    duel.practice = true;
    duel.round = "practice";
    duel.resultFor = null;
    duel.gameDef = gameById(gameId);
    showScreen("duel");
    $$("[data-fill=task]").forEach((el) => { el.textContent = "혼자 연습"; });
    showIntro(duel.gameDef, true);
  }

  // ---------- iPhone 새로고침 후 센서 다시 켜기 ----------
  async function onSensorResume() {
    $("#sensor-resume").hidden = true;
    if (duel.gameDef && duel.gameDef.input === "mic") {
      const res = await Mic.request();
      if (res !== "granted") toast("마이크를 못 켰어요 · 화면을 위아래로 문질러서 해요");
      return;
    }
    if (duel.gameDef && duel.gameDef.input === "camera") {
      const res = await Cam.request();
      const fbText = camFallback(duel.gameDef).text;
      if (res !== "granted") return toast("카메라를 못 켰어요 · " + fbText);
      toast("동작 인식 불러오는 중…");
      try { await Cam.loadModel(); Cam.startDetect(); }
      catch (e) { toast("동작 인식을 못 불러왔어요 · " + fbText); }
      return;
    }
    const res = await Motion.request();
    if (res !== "granted") toast("센서를 못 켰어요 · 화면을 문질러서 계속해요");
  }

  // ======================================================
  //  시작!
  // ======================================================
  function init() {
    // config.js의 사람별 색을 CSS에도 전달
    document.documentElement.style.setProperty("--seoyoung", PL.seoyoung.color);
    document.documentElement.style.setProperty("--seoin", PL.seoin.color);

    // 이벤트 연결
    $("#room-random").onclick = () => { $("#room-input").value = randomRoom(); };
    $("#room-join").onclick = joinRoom;
    $("#room-input").addEventListener("keydown", (e) => { if (e.key === "Enter") joinRoom(); });
    $$(".role-btn").forEach((b) => { b.onclick = () => pickRole(b.dataset.role); });
    $("#setup-practice").onclick = () => startPractice("bubble");
    $("#setup-practice-jini").onclick = () => startPractice("jini");
    $("#setup-practice-call").onclick = () => startPractice("call");
    $("#setup-practice-walk").onclick = () => startPractice("walk");
    $("#task-list").onclick = onTaskClick;
    $("#done-list").onclick = onTaskClick;
    $("#add-task").onclick = openAddSheet;
    $("#room-bar").onclick = openRoomSheet;
    $("#sheet-backdrop").onclick = closeSheet;
    $("#sheet").addEventListener("click", (e) => { if (e.target.closest("[data-sheet=close]")) closeSheet(); });
    $("#intro-ready").onclick = onReadyClick;
    $("#intro-cancel").onclick = onCancelClick;
    $("#result-ok").onclick = onResultOk;
    $("#result-again").onclick = onAgain;
    $("#sensor-resume").onclick = onSensorResume;

    Net.onChange(onNetChange);

    // 돌봄 기록이 바뀌면(상대 폰에서 체크/취소/추가) 화면 다시 그리기
    Store.onChange((added) => {
      renderMain();
      // 방금(2분 안) 상대 폰에서 체크한 게 있으면 알림
      const r = added[added.length - 1];
      const t = r && Store.task(r.taskId);
      if (t && Date.now() - r.at < 120000 && screen === "main") toast(`${Net.iga(r.by)} ${t.title} 완료!`);
    });

    // 날짜가 바뀌거나 '며칠 전' 글자가 바뀌도록 1분마다 다시 그리기
    setInterval(renderMain, 60000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) renderMain(); });

    // 예전에 들어간 방이 있으면 바로 메인 → 뒤에서 연결
    // (서버가 안 돼도 돌봄 체크는 이 폰에서 계속 쓸 수 있어요)
    const room = Net.savedRoom;
    if (room && Net.savedRole) {
      goMain();
      Net.connect(room).then(() => renderMain());
    } else {
      showSetup();
    }
  }

  return { init, openRoomSheet, toast };
})();

App.init();
