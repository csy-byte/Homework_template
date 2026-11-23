/* =========================================================
   network.js — p5.party로 두 폰을 연결해요
   ---------------------------------------------------------
   ■ 공유 데이터 2종류
     1) game  (방 전체가 같이 보는 결투 상태)
        → '호스트' 한 명만 씁니다. 두 폰이 동시에 쓰면 한쪽 글이 사라지기 때문.
     2) me    (내 폰 전용 메모: 역할, 준비, 점수 …)
        → 각자 자기 것만 씁니다. 호스트가 이걸 읽고 판단해요.
     3) care_seoyoung / care_seoin  (돌봄 기록: 완료 체크, 담당자, 할 일 목록)
        → 각자 자기 이름 공책에만 쓰고, 화면엔 두 공책을 합쳐서 보여줘요 (storage.js 참고)

   ■ 호스트란?
     방에 있는 기기 중 p5.party가 정해 주는 '반장' 1명.
     반장이 나가면 남은 기기가 자동으로 반장이 되고, 상태는 game에 다 들어 있어서
     그대로 이어서 진행돼요.

   ■ 결투 단계 (game.phase)
     lobby → roulette → intro → countdown → play → result → lobby
   ========================================================= */

const Net = (() => {
  const ROLES = ["seoyoung", "seoin"];
  const ACTIVE = ["roulette", "intro", "countdown", "play"];
  const LS_DEVICE = "seojin_device_id";
  const LS_ROOM = "seojin_room";
  const LS_ROLE = "seojin_role";
  const SS_ROUND = "seojin_round_state";

  // 방이 비어 있을 때 처음 만들어지는 결투 상태
  const INIT_GAME = {
    v: 1,              // 데이터 모양 버전 (옛날 코드가 돌고 있는 탭과 구분)
    phase: "lobby",
    roundId: null,     // 판마다 새로 생기는 번호
    taskId: null,
    taskTitle: null,
    gameId: null,
    startedBy: null,
    result: null,
    lastResult: null,  // 결과 뒤 로비로 돌아와도 늦게 들어온 폰이 결과를 받을 수 있게
    notice: null,      // { id, text, to } 모두/특정 사람에게 띄울 알림
    lastReq: { seoyoung: null, seoin: null }, // 이미 처리한 시작 요청 번호
  };

  const rid = () => Math.random().toString(36).slice(2, 10);
  const name = (r) => CONFIG.PLAYERS[r]?.name || "?";
  // 이름 뒤 조사: 서영 → 서영이, 지수 → 지수가
  const iga = (r) => {
    const n = name(r);
    const c = n.charCodeAt(n.length - 1);
    if (c < 0xac00 || c > 0xd7a3) return n + "이(가)";
    return n + ((c - 0xac00) % 28 ? "이" : "가");
  };
  const plain = (o) => JSON.parse(JSON.stringify(o)); // 공유 객체 → 일반 객체 복사

  // 이 폰의 고유 번호 (새로고침해도 유지 → '나의 옛날 탭'을 알아볼 수 있어요)
  let deviceId = localStorage.getItem(LS_DEVICE);
  if (!deviceId) { deviceId = rid() + rid(); localStorage.setItem(LS_DEVICE, deviceId); }

  let status = "idle";   // idle | connecting | online | failed
  let failReason = "";
  let game = null;
  let me = null;
  let guests = [];
  let roomCode = null;
  let lastPong = 0;
  let onlineAt = 0;
  const seen = new Map(); // 다른 기기의 beat 변화 기록 (끊김 판단용)
  const hostMem = { key: null, since: 0, absentSince: null };
  const listeners = new Set();
  function notify() { listeners.forEach((fn) => fn()); }

  // ---------- 판 상태를 이 탭에 잠깐 저장 (새로고침 대비) ----------
  function readRoundState() {
    try { return JSON.parse(sessionStorage.getItem(SS_ROUND)); } catch (e) { return null; }
  }
  function saveRoundState(extra = {}) {
    if (!me || !game || !game.roundId) return;
    const prev = readRoundState();
    const keep = prev && prev.roundId === game.roundId ? prev : {};
    const st = {
      ...keep,
      roundId: game.roundId,
      me: { ready: me.ready, score: me.score, scoreRound: me.scoreRound, finished: me.finished, ack: me.ack },
      ...extra,
    };
    sessionStorage.setItem(SS_ROUND, JSON.stringify(st));
  }

  // ---------- 연결 ----------
  // 서버 주소는 개발 중 ?server=ws://localhost:6020 처럼 바꿔 볼 수 있어요
  function serverUrl() {
    const q = new URLSearchParams(location.search).get("server");
    return q || CONFIG.SERVER_URL;
  }

  async function connect(room) {
    if (status === "connecting" || status === "online") return status === "online";
    if (typeof p5party === "undefined") {
      status = "failed"; failReason = "p5.party 라이브러리를 불러오지 못했어요 (인터넷 확인)";
      notify(); return false;
    }
    roomCode = room;
    status = "connecting";
    notify();

    const work = (async () => {
      await p5party.connect(serverUrl(), CONFIG.APP_NAME, "room_" + room);
      game = await p5party.loadShared("game", plain(INIT_GAME));

      // 새로고침 전에 하던 판이 아직 진행 중이면 내 준비/점수 상태를 되살려요
      const saved = readRoundState();
      const init = {
        v: 1, deviceId, joinedAt: Date.now(), role: null, beat: 0,
        request: null, ready: null, score: 0, scoreRound: null, finished: null, ack: null, cancel: null,
      };
      if (saved && game.roundId && saved.roundId === game.roundId) Object.assign(init, saved.me);
      const savedRole = localStorage.getItem(LS_ROLE);
      if (ROLES.includes(savedRole)) init.role = savedRole;

      me = await p5party.loadMyShared(init);
      guests = p5party.loadGuestShareds();

      // 돌봄 기록 공유 — 사람마다 공책 1권씩 (자기 공책에만 써요. storage.js 설명 참고)
      const books = {};
      for (const r of ROLES) {
        books[r] = await p5party.loadShared("care_" + r, Store.emptyBook());
        p5party.watchShared(books[r], () => Store.pull()); // 상대가 체크하면 → 내 화면 갱신
      }
      Store.attach(books);
    })();

    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("timeout")), CONFIG.CONNECT_TIMEOUT_MS);
    });

    try {
      await Promise.race([work, timeout]);
      clearTimeout(timer);
    } catch (err) {
      status = "failed";
      failReason = err.message === "timeout"
        ? "서버가 응답하지 않아요. 인터넷을 확인하거나 잠시 뒤 다시 시도해 주세요."
        : "서버 연결 중 문제가 생겼어요.";
      try { p5party.disconnect(); } catch (e) { /* 무시 */ }
      notify();
      return false;
    }

    localStorage.setItem(LS_ROOM, room);
    status = "online";
    onlineAt = Date.now();
    lastPong = Date.now();

    // 내가 '살아 있어요' 신호 (상대가 이 숫자가 멈추면 내가 나간 걸로 판단)
    setInterval(() => { if (me) me.beat = (me.beat || 0) + 1; }, CONFIG.BEAT_MS);

    // 서버까지 왕복이 되는지 확인하는 핑 → 내 연결 상태 표시
    const myTag = deviceId + ":" + me.joinedAt;
    p5party.subscribe("ping", (d) => { if (d === myTag) lastPong = Date.now(); });
    setInterval(() => p5party.emit("ping", myTag), 3000);

    p5party.watchShared(game, () => notify());
    setInterval(() => { hostTick(); notify(); }, 250);

    // 페이지를 닫거나 새로고침할 때 바로 나가기 (iPhone은 beforeunload가 잘 안 와서 pagehide도)
    window.addEventListener("pagehide", () => { try { p5party.disconnect(); } catch (e) { /* 무시 */ } });

    notify();
    return true;
  }

  // ---------- 누가 방에 있나 ----------
  function validGuest(g) { return g && g.v === 1 && typeof g.deviceId === "string"; }

  // beat 숫자가 STALE_MS 동안 안 바뀌면 '나간 기기'(유령)로 봐요
  function isFresh(g, now) {
    if (g === me) return true;
    const k = g.deviceId + ":" + g.joinedAt;
    const s = seen.get(k);
    if (!s || s.beat !== g.beat) { seen.set(k, { beat: g.beat, at: now }); return true; }
    return now - s.at < CONFIG.STALE_MS;
  }

  // 역할별로 '진짜' 플레이어 한 명씩 고르기
  // - 같은 폰의 탭이 두 개(새로고침 직후 유령 포함)면 → 가장 최근에 들어온 탭
  // - 다른 폰 두 대가 같은 역할이면 → 기기 번호 순 (모든 폰이 똑같이 판단하도록)
  function players() {
    const now = Date.now();
    const out = { seoyoung: null, seoin: null };
    if (!guests) return out;
    for (const role of ROLES) {
      const c = guests.filter((g) => validGuest(g) && g.role === role && isFresh(g, now));
      c.sort((a, b) => (a.deviceId === b.deviceId
        ? b.joinedAt - a.joinedAt
        : (a.deviceId < b.deviceId ? -1 : 1)));
      out[role] = c[0] || null;
    }
    return out;
  }

  function otherRole(r) { return r === "seoyoung" ? "seoin" : "seoyoung"; }

  // 역할이 다른 폰에서 이미 쓰이는지 (설정 화면용)
  function roleTakenByOther(role) {
    const p = players()[role];
    return !!p && p.deviceId !== deviceId;
  }

  // ---------- 호스트(반장)만 하는 일 ----------
  function setGame(obj) { p5party.setShared(game, obj); }
  function notice(text, to = null) { return { id: rid(), text, to }; }
  function backToLobby(extra = {}) {
    const g = plain(game);
    setGame({ ...plain(INIT_GAME), lastReq: g.lastReq || plain(INIT_GAME.lastReq), lastResult: g.lastResult || null, ...extra });
  }
  function scoreOf(p, round) { return p && p.scoreRound === round ? Math.max(0, Math.floor(p.score || 0)) : 0; }

  function hostTick() {
    if (status !== "online" || !game || !p5party.isHost()) { hostMem.key = null; return; }
    if (game.v !== 1) { setGame(plain(INIT_GAME)); return; } // 옛날 데이터 정리

    const now = Date.now();
    const P = players();
    const both = !!(P.seoyoung && P.seoin);
    const round = game.roundId;

    // 단계가 바뀌면 시간 재기 다시 시작
    const key = game.phase + "|" + round;
    if (hostMem.key !== key) { hostMem.key = key; hostMem.since = now; hostMem.absentSince = null; }
    const elapsed = now - hostMem.since;

    if (ACTIVE.includes(game.phase)) {
      // 누가 취소 버튼을 눌렀나
      for (const r of ROLES) {
        if (P[r] && P[r].cancel === round) return backToLobby({ notice: notice(`${iga(r)} 결투를 취소했어요`) });
      }
      // 한 명이 사라졌나 → 잠깐 기다려 주고(새로고침일 수 있으니) 그래도 없으면 취소
      if (!both) {
        if (hostMem.absentSince === null) hostMem.absentSince = now;
        if (now - hostMem.absentSince > CONFIG.DISCONNECT_GRACE_MS) {
          const gone = !P.seoyoung ? "seoyoung" : "seoin";
          return backToLobby({ notice: notice(`${name(gone)} 연결이 끊겨서 결투가 취소됐어요`) });
        }
      } else {
        hostMem.absentSince = null;
      }
    }

    switch (game.phase) {
      case "lobby": {
        // 시작 요청 처리 — 먼저 온 요청 하나만 받고, 진행 중엔 새 요청을 무시 (중복 시작 방지)
        for (const r of ROLES) {
          const req = P[r] && P[r].request;
          if (!req || !req.id || (game.lastReq && req.id === game.lastReq[r])) continue;
          const lastReq = { ...plain(game.lastReq || {}), [r]: req.id };
          if (!both) {
            setGame({ ...plain(game), lastReq, notice: notice(`${iga(otherRole(r))} 아직 방에 없어요`, r) });
            return;
          }
          const picked = pickRandomPlayableGame();
          setGame({
            ...plain(INIT_GAME),
            phase: "roulette",
            roundId: rid(),
            taskId: req.taskId,
            taskTitle: req.taskTitle,
            gameId: picked.id,
            startedBy: r,
            lastReq,
            lastResult: game.lastResult ? plain(game.lastResult) : null,
          });
          return;
        }
        break;
      }
      case "roulette":
        if (elapsed > CONFIG.ROULETTE_MS) setGame({ ...plain(game), phase: "intro" });
        break;
      case "intro":
        if (both && P.seoyoung.ready === round && P.seoin.ready === round) {
          setGame({ ...plain(game), phase: "countdown" });
        }
        break;
      case "countdown":
        if (elapsed > CONFIG.COUNTDOWN_MS) setGame({ ...plain(game), phase: "play" });
        break;
      case "play": {
        const finished = both && P.seoyoung.finished === round && P.seoin.finished === round;
        const late = elapsed > CONFIG.PLAY_MS + CONFIG.JUDGE_GRACE_MS;
        if (both && (finished || late)) {
          const scores = { seoyoung: scoreOf(P.seoyoung, round), seoin: scoreOf(P.seoin, round) };
          const tie = scores.seoyoung === scores.seoin;
          const loser = tie ? null : (scores.seoyoung < scores.seoin ? "seoyoung" : "seoin");
          const result = {
            roundId: round, taskId: game.taskId, taskTitle: game.taskTitle, gameId: game.gameId,
            scores, tie, loser, winner: tie ? null : otherRole(loser),
          };
          setGame({ ...plain(game), phase: "result", result, lastResult: result });
        }
        break;
      }
      case "result": {
        const acked = ROLES.every((r) => !P[r] || P[r].ack === round);
        if (acked || elapsed > 120000) backToLobby();
        break;
      }
      default:
        backToLobby();
    }
  }

  // ---------- 내 폰이 하는 일 (내 me만 씀) ----------
  function myRole() { return me ? me.role : null; }

  // 내 역할이 다른 폰과 겹쳐서 밀려났는지
  function roleConflict() {
    const r = myRole();
    if (!r) return false;
    const p = players()[r];
    return !!p && p !== me;
  }

  function claimRole(role) {
    if (!me || !ROLES.includes(role)) return false;
    if (roleTakenByOther(role)) return false;
    me.role = role;
    localStorage.setItem(LS_ROLE, role);
    notify();
    return true;
  }

  function partnerOnline() {
    const r = myRole();
    return !!r && !!players()[otherRole(r)];
  }

  // 결투 시작 요청 → 결과: { ok, reason }
  function requestDuel(taskId, taskTitle) {
    if (status !== "online") return { ok: false, reason: "서버에 연결되어 있지 않아요" };
    if (!myRole()) return { ok: false, reason: "먼저 '나는 누구?'를 골라 주세요" };
    if (roleConflict()) return { ok: false, reason: `다른 폰이 ${name(myRole())} 자리를 쓰고 있어요` };
    if (game.phase !== "lobby") return { ok: false, reason: "이미 결투가 진행 중이에요" };
    if (!partnerOnline()) return { ok: false, reason: `${iga(otherRole(myRole()))} 아직 방에 없어요` };
    me.request = { id: rid(), taskId, taskTitle };
    return { ok: true };
  }

  // 새 판이 시작되면 내 메모 초기화 (한 번에 통째로 바꿔서 중간 상태가 안 보이게)
  function resetForRound(round) {
    p5party.setShared(me, {
      ...plain(me), request: null, ready: null, score: 0, scoreRound: round,
      finished: null, ack: null, cancel: null,
    });
    sessionStorage.removeItem(SS_ROUND);
    saveRoundState();
  }

  // 새 판을 처음 볼 때 호출 — 새로고침으로 돌아온 거면 저장된 상태를 그대로 두고, 아니면 초기화
  function enterRound(round) {
    const st = readRoundState();
    if (st && st.roundId === round) return "restored";
    resetForRound(round);
    return "new";
  }

  function ready() { me.ready = game.roundId; saveRoundState(); }
  function reportScore(n) {
    if (me.scoreRound !== game.roundId) me.scoreRound = game.roundId;
    me.score = n;
    saveRoundState();
  }
  function finish(n) {
    me.scoreRound = game.roundId;
    me.score = n;
    me.finished = game.roundId; // 점수 먼저, 그다음 '끝남' (순서대로 도착)
    saveRoundState();
  }
  function ack() { if (game && game.roundId) { me.ack = game.roundId; saveRoundState(); } }
  function cancel() { if (game && game.roundId) me.cancel = game.roundId; }

  // 이 판에서 내가 처음 '게임 시작'을 본 시각 (새로고침해도 남은 시간이 이어지게)
  function playStart() {
    const st = readRoundState();
    if (st && st.roundId === game.roundId && st.playStart) return st.playStart;
    const t = Date.now();
    saveRoundState({ playStart: t });
    return t;
  }

  function leaveRoom() {
    localStorage.removeItem(LS_ROOM);
    localStorage.removeItem(LS_ROLE);
    sessionStorage.removeItem(SS_ROUND);
    try { p5party.disconnect(); } catch (e) { /* 무시 */ }
    location.reload();
  }

  return {
    ROLES, otherRole, iga,
    get status() { return status; },
    get failReason() { return failReason; },
    get game() { return game; },
    get me() { return me; },
    get roomCode() { return roomCode; },
    get savedRoom() { return localStorage.getItem(LS_ROOM); },
    get savedRole() { return localStorage.getItem(LS_ROLE); },
    // 핑이 9초 넘게 안 돌아오면 연결이 불안정한 것
    get connectionOk() { return status === "online" && (Date.now() - onlineAt < 5000 || Date.now() - lastPong < 9000); },
    isHost: () => status === "online" && p5party.isHost(),
    connect, players, myRole, roleConflict, roleTakenByOther, claimRole, partnerOnline,
    requestDuel, enterRound, ready, reportScore, finish, ack, cancel, playStart, leaveRoom,
    onChange(fn) { listeners.add(fn); },
  };
})();
