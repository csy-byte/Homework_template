/* =========================================================
   storage.js — 돌봄 기록을 이 폰(브라우저)에 저장해요 (localStorage)
   ---------------------------------------------------------
   저장하는 것
   - tasks        : 돌봄 목록
   - log          : 누가 언제 했는지 (완료 기록)
   - assignments  : 결투로 정해진 담당자
   - appliedRounds: 이미 반영한 결투 번호 (새로고침해도 두 번 저장 안 되게)
   ========================================================= */

const Store = (() => {
  const KEY = "seojin_care_v1";
  const DAY = 24 * 60 * 60 * 1000;

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

  // ---- 불러오기 / 저장 ----
  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY));
      if (saved && Array.isArray(saved.tasks)) return saved;
    } catch (e) { /* 저장된 게 깨졌으면 새로 시작 */ }
    return {
      tasks: CONFIG.DEFAULT_TASKS.map((t) => ({ ...t })),
      log: [],
      assignments: {},
      appliedRounds: [],
    };
  }
  let data = load();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* 저장 공간 부족 등 */ }
  }

  // ---- 조회 ----
  function tasks() { return data.tasks; }
  function task(id) { return data.tasks.find((t) => t.id === id); }

  // 이 일의 마지막 완료 기록
  function lastDone(taskId) {
    for (let i = data.log.length - 1; i >= 0; i--) {
      if (data.log[i].taskId === taskId) return data.log[i];
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
    return data.log.filter((r) => r.taskId === taskId).slice(-n).map((r) => r.by);
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
    for (const r of data.log) {
      if (daysBetween(r.at, now) < 7 && counts[r.by] !== undefined) counts[r.by]++;
    }
    return counts;
  }

  // 어떤 날짜에 매일 할 일을 얼마나 끝냈는지 (0~1)
  function dayProgress(d) {
    const key = dateKey(d);
    const daily = data.tasks.filter((t) => t.type === "daily");
    if (!daily.length) return 0;
    const done = daily.filter((t) => data.log.some((r) => r.taskId === t.id && r.dateKey === key));
    return done.length / daily.length;
  }

  // ---- 변경 ----
  function complete(taskId, by) {
    const now = Date.now();
    data.log.push({ taskId, by, at: now, dateKey: dateKey(new Date(now)) });
    if (data.log.length > 1500) data.log = data.log.slice(-1000); // 너무 길어지지 않게
    delete data.assignments[taskId];
    save();
  }

  // 완료 취소 (가장 최근 기록 1개 지우기)
  function undo(taskId) {
    for (let i = data.log.length - 1; i >= 0; i--) {
      if (data.log[i].taskId === taskId) { data.log.splice(i, 1); break; }
    }
    save();
  }

  // 결투 결과 반영 — 같은 결투(roundId)는 한 번만
  function applyDuelResult(roundId, taskId, loser) {
    if (!roundId || data.appliedRounds.includes(roundId)) return false;
    data.appliedRounds.push(roundId);
    data.appliedRounds = data.appliedRounds.slice(-50);
    if (task(taskId)) {
      data.assignments[taskId] = { by: loser, dateKey: dateKey(), roundId };
    }
    save();
    return true;
  }

  function addTask(title, type, everyDays) {
    const id = "custom_" + Date.now().toString(36);
    data.tasks.push({ id, title, type, time: "", everyDays: type === "periodic" ? everyDays : undefined, custom: true });
    save();
    return id;
  }

  function removeTask(id) {
    data.tasks = data.tasks.filter((t) => t.id !== id);
    delete data.assignments[id];
    save();
  }

  return {
    dateKey, tasks, task, isDone, subText, history, assignment, lastDone,
    weekCounts, dayProgress, complete, undo, applyDuelResult, addTask, removeTask,
  };
})();
