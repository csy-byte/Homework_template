/* =========================================================
   storage.js — 돌봄 기록 (두 폰이 같이 보는 공유 기록)
   ---------------------------------------------------------
   ■ 핵심 아이디어: "각자 자기 공책에만 쓰고, 읽을 땐 두 공책을 합쳐 본다"
     p5.party 서버에 공책(공유 데이터)이 2권 있어요.
       care_seoyoung : 서영 폰만 씀
       care_seoin    : 서인 폰만 씀
     두 폰이 같은 공책에 '동시에' 쓰면 서버가 한쪽을 버려요 (실제로 테스트해 보니 생김).
     그래서 공책을 나눠서, 한 공책엔 한 폰만 쓰게 했어요 → 부딪힐 일이 없어요.

   ■ 공책 안의 칸 (전부 '이름표 붙은 칸' = 객체)
     tasks       : { 할일id: 할일 }            할 일 목록 (삭제 = removed: true)
     log         : { 기록id: 완료기록 | null }  누가 언제 했는지 (취소 = null)
     assignments : { 할일id: 담당 | null }      결투로 정해진 담당자
     applied     : { "r"+결투번호: true }       이미 반영한 결투
     각 칸에는 { v: 값, ts: 쓴 시각 } 이 들어가요.

   ■ 합치는 규칙
     같은 칸이 두 공책에 다 있으면 → ts(시각)가 더 늦은 쪽이 이겨요.
     예) 서영이 아침밥 체크(서영 공책) → 서인이 그걸 취소(서인 공책에 null, 더 늦은 시각)
         → 합치면 '취소됨'.

   ■ 이 폰의 localStorage에도 두 공책 복사본을 저장해요
     - 서버 연결 전/실패해도 앱이 열리고 체크할 수 있어요 (연결되면 그때 보내져요)
     - 데모 서버가 재시작돼서 방이 비어도 복사본으로 다시 채워요
   ========================================================= */

const Store = (() => {
  const KEY = "seojin_care_v3";
  const OLD_KEY = "seojin_care_v1";      // 예전(공유 전) 저장 데이터 → 자동으로 옮겨요
  const ROLES = ["seoyoung", "seoin"];
  const SECTIONS = ["tasks", "log", "assignments", "applied"];
  const DAY = 24 * 60 * 60 * 1000;

  // ---- 작은 도우미 ----
  const plain = (o) => JSON.parse(JSON.stringify(o ?? null)); // 공유 객체 → 일반 객체 (undefined 정리)
  // 고유 이름: 글자로 시작 (서버 경로에서 숫자로 시작하는 이름은 헷갈릴 수 있어요)
  const newId = (prefix) => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const emptyBook = () => ({ tasks: {}, log: {}, assignments: {}, applied: {} });
  const isEntry = (e) => !!e && typeof e === "object" && typeof e.ts === "number";

  // ---- 날짜 도우미 ----
  function dateKey(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  function daysBetween(a, b) {
    // 시각은 무시하고 날짜 차이만 (자정 기준)
    const da = new Date(a); da.setHours(0, 0, 0, 0);
    const db = new Date(b); db.setHours(0, 0, 0, 0);
    return Math.round((db - da) / DAY);
  }
  function timeText(ms) {
    const d = new Date(ms);
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  // ---- 내 역할 (= 내가 쓸 공책) ----
  function myRole() {
    const r = (typeof Net !== "undefined" && Net.myRole()) || localStorage.getItem("seojin_role");
    return ROLES.includes(r) ? r : "seoyoung";
  }

  // ======================================================
  //  불러오기 (이 폰의 복사본)
  // ======================================================
  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY));
      if (saved && saved.v === 3 && saved.books) {
        for (const r of ROLES) {
          saved.books[r] = { ...emptyBook(), ...(saved.books[r] || {}) };
        }
        return saved;
      }
    } catch (e) { /* 깨졌으면 새로 */ }

    const d = { v: 3, books: { seoyoung: emptyBook(), seoin: emptyBook() } };
    // 예전 데이터(공유 전)가 있으면 이 폰 주인의 공책으로 옮겨요
    try {
      const old = JSON.parse(localStorage.getItem(OLD_KEY));
      if (old && Array.isArray(old.tasks)) {
        const b = d.books[myRole()];
        old.tasks.forEach((t, i) => {
          if (t.custom) b.tasks[t.id] = { v: plain({ ...t, order: i, removed: false }), ts: 1 };
        });
        (old.log || []).forEach((r) => { b.log[newId("e")] = { v: plain(r), ts: r.at || 1 }; });
        for (const [k, a] of Object.entries(old.assignments || {})) b.assignments[k] = { v: plain(a), ts: 1 };
        (old.appliedRounds || []).forEach((r) => { b.applied["r" + r] = { v: true, ts: 1 }; });
      }
    } catch (e) { /* 무시 */ }
    return d;
  }

  let local = load();      // { v, books: { seoyoung: 공책, seoin: 공책 } }
  let records = null;      // 방에 연결되면 { seoyoung: 공유객체, seoin: 공유객체 }
  let data = null;         // 두 공책을 합친 결과 (화면은 이것만 봐요)
  let taskList = [];       // 순서대로, 삭제된 것 빼고
  let logList = [];        // 시간 순서대로, 취소된 것 빼고
  const listeners = new Set();

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(local)); } catch (e) { /* 저장 공간 부족 등 */ }
  }

  // 두 공책 합치기 → data, taskList, logList
  function rebuild() {
    // 기본 할 일(config.js)부터 깔고 (ts 0 = 누가 뭘 쓰면 그게 이김)
    const merged = emptyBook();
    const stamp = emptyBook();
    CONFIG.DEFAULT_TASKS.forEach((t, i) => {
      merged.tasks[t.id] = plain({ ...t, order: i, removed: false });
      stamp.tasks[t.id] = 0;
    });
    for (const r of ROLES) {
      const book = local.books[r];
      for (const s of SECTIONS) {
        for (const [k, e] of Object.entries(book[s] || {})) {
          if (!isEntry(e)) continue;
          if (!(k in stamp[s]) || e.ts > stamp[s][k]) {
            merged[s][k] = e.v;
            stamp[s][k] = e.ts;
          }
        }
      }
    }
    data = merged;
    data.stamp = stamp;
    taskList = Object.values(data.tasks)
      .filter((t) => t && !t.removed)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    logList = Object.entries(data.log)
      .filter(([, r]) => r)
      .map(([id, r]) => ({ ...r, id }))
      .sort((a, b) => a.at - b.at);
  }
  rebuild();
  save();

  // ======================================================
  //  서버(p5.party)와 주고받기
  // ======================================================

  // network.js가 연결 직후 불러요
  function attach(recs) {
    records = recs;
    sync(false);
    setInterval(() => sync(false), 3000); // 역할을 바꿨거나 보내다 끊긴 게 있으면 다시 보내기
  }

  // 1) 서버 공책 → 내 복사본 (더 새로운 칸만)
  // 2) 내 공책 복사본 → 서버 (서버보다 새로운 칸만) — 내 공책에만 써요!
  function sync(fromServer) {
    if (!records) return;
    const before = new Set(logList.map((r) => r.id));
    let changed = false;

    for (const r of ROLES) {
      const rec = records[r];
      if (!rec) continue;
      const book = local.books[r];
      for (const s of SECTIONS) {
        for (const [k, e] of Object.entries(rec[s] || {})) {
          if (!isEntry(e)) continue;
          if (!isEntry(book[s][k]) || e.ts > book[s][k].ts) { book[s][k] = plain(e); changed = true; }
        }
      }
    }

    // 내 공책 올리기
    const role = myRole();
    const rec = records[role];
    if (rec) {
      const book = local.books[role];
      const serverEmpty = SECTIONS.every((s) => !rec[s] || Object.keys(rec[s]).length === 0);
      if (serverEmpty) {
        // 방이 비어 있음 (처음이거나 서버 재시작) → 한 번에 통째로
        p5party.setShared(rec, plain(book));
      } else {
        for (const s of SECTIONS) {
          if (!rec[s] || typeof rec[s] !== "object") rec[s] = {};
          for (const [k, e] of Object.entries(book[s])) {
            const cur = rec[s][k];
            if (!isEntry(cur) || cur.ts < e.ts) rec[s][k] = plain(e);
          }
        }
      }
    }

    if (!changed) return;
    rebuild();
    save();
    // 새로 생긴 완료 기록 = 다른 폰에서 체크한 것 → 화면에 알려주기
    const added = fromServer ? logList.filter((r) => !before.has(r.id)) : [];
    listeners.forEach((fn) => fn(added));
  }

  // 서버 공책이 한 번에 여러 칸 바뀌어도 한 번만 처리하도록 살짝 모아서
  let pullTimer = null;
  function pull() {
    if (pullTimer) return;
    pullTimer = setTimeout(() => { pullTimer = null; sync(true); }, 30);
  }

  // 모든 변경은 여기를 지나가요: 내 공책에 쓰기 → 내 화면 바로 반영 → 서버로
  function write(section, key, value) {
    const role = myRole();
    // 지금 보이는 값보다 꼭 늦은 시각으로 (폰 시계가 조금 달라도 '취소'가 확실히 이기게)
    const ts = Math.max(Date.now(), (data.stamp[section][key] || 0) + 1);
    const e = { v: plain(value), ts };
    local.books[role][section][key] = e;
    rebuild();
    save();
    const rec = records && records[role];
    if (rec) {
      if (!rec[section] || typeof rec[section] !== "object") rec[section] = {};
      rec[section][key] = plain(e);
    }
  }

  // ======================================================
  //  조회
  // ======================================================
  function tasks() { return taskList; }
  function task(id) { return taskList.find((t) => t.id === id); }

  // 이 일의 마지막 완료 기록
  function lastDone(taskId) {
    for (let i = logList.length - 1; i >= 0; i--) {
      if (logList[i].taskId === taskId) return logList[i];
    }
    return null;
  }

  // 지금 '완료' 상태인지
  // - 매일 하는 일: 오늘 했으면 완료
  // - 주기 관리: 마지막으로 한 날부터 주기(everyDays)가 아직 안 지났으면 완료
  function isDone(t, now = Date.now()) {
    const last = lastDone(t.id);
    if (!last) return false;
    if (t.type === "daily") return last.dateKey === dateKey(new Date(now));
    return daysBetween(last.at, now) < (t.everyDays || 7);
  }

  // 카드 아래 작은 글씨
  function subText(t, now = Date.now()) {
    const last = lastDone(t.id);
    const who = (k) => CONFIG.PLAYERS[k]?.name || "";
    if (isDone(t, now)) {
      if (t.type === "daily") return `오늘 ${timeText(last.at)} · ${who(last.by)}`;
      const left = (t.everyDays || 7) - daysBetween(last.at, now);
      return `${who(last.by)} · ${left}일 뒤 다시`;
    }
    const parts = [];
    if (t.type === "daily") {
      parts.push("매일");
      if (t.time) parts.push(t.time);
    } else if (last) {
      const ago = daysBetween(last.at, now);
      parts.push(ago === 0 ? "오늘" : `${ago}일 전`);
      const over = ago - (t.everyDays || 7);
      if (over >= 0) parts.push(over === 0 ? "오늘 할 차례" : `${over}일 지남`);
    } else {
      parts.push(`${t.everyDays || 7}일마다 · 기록 없음`);
    }
    const a = assignment(t.id, now);
    if (a) parts.push(`${who(a.by)} 담당`);
    return parts.join("  ");
  }

  // 최근 3번 누가 했는지 (발바닥 3개)
  function history(taskId, n = 3) {
    return logList.filter((r) => r.taskId === taskId).slice(-n).map((r) => r.by);
  }

  // 결투로 정해진 담당자 (아직 유효한 것만)
  // - 매일 하는 일: 정해진 그 날까지만
  // - 주기 관리: 완료할 때까지
  function assignment(taskId, now = Date.now()) {
    const a = data.assignments[taskId];
    if (!a) return null;
    const t = task(taskId);
    if (!t) return null;
    if (t.type === "daily" && a.dateKey !== dateKey(new Date(now))) return null;
    return a;
  }

  // 최근 7일 동안 각자 몇 번 했는지
  function weekCounts(now = Date.now()) {
    const counts = { seoyoung: 0, seoin: 0 };
    for (const r of logList) {
      if (daysBetween(r.at, now) < 7 && counts[r.by] !== undefined) counts[r.by]++;
    }
    return counts;
  }

  // 어떤 날짜에 매일 할 일을 얼마나 끝냈는지 (0~1)
  function dayProgress(d) {
    const key = dateKey(d);
    const daily = taskList.filter((t) => t.type === "daily");
    if (!daily.length) return 0;
    const done = daily.filter((t) => logList.some((r) => r.taskId === t.id && r.dateKey === key));
    return done.length / daily.length;
  }

  // ======================================================
  //  변경 (전부 write()를 통해서 → 상대 폰에도 반영)
  // ======================================================
  function complete(taskId, by) {
    const now = Date.now();
    write("log", newId("e"), { taskId, by, at: now, dateKey: dateKey(new Date(now)) });
    if (data.assignments[taskId]) write("assignments", taskId, null);
  }

  // 완료 취소 (가장 최근 기록 1개를 null로) — 상대가 체크한 것도 취소할 수 있어요
  function undo(taskId) {
    const last = lastDone(taskId);
    if (last) write("log", last.id, null);
  }

  // 결투 결과 반영 — 같은 결투(roundId)는 한 번만
  // 두 폰이 둘 다 불러도 같은 내용이라 괜찮아요
  function applyDuelResult(roundId, taskId, loser) {
    const key = "r" + roundId;
    if (!roundId || data.applied[key]) return false;
    write("applied", key, true);
    if (task(taskId)) write("assignments", taskId, { by: loser, dateKey: dateKey(), roundId });
    return true;
  }

  function addTask(title, type, everyDays) {
    const id = newId("custom_");
    write("tasks", id, {
      id, title, type, time: "",
      everyDays: type === "periodic" ? everyDays : null,
      custom: true, order: Date.now(), removed: false,
    });
    return id;
  }

  function removeTask(id) {
    const t = data.tasks[id];
    if (!t) return;
    write("tasks", id, { ...t, removed: true });
    if (data.assignments[id]) write("assignments", id, null);
  }

  return {
    ROLES, SECTIONS, emptyBook,
    dateKey, tasks, task, isDone, subText, history, assignment, lastDone,
    weekCounts, dayProgress, complete, undo, applyDuelResult, addTask, removeTask,
    attach, pull,
    onChange(fn) { listeners.add(fn); },
  };
})();
