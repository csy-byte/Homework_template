/* =========================================================
   config.js — 바꾸고 싶은 값은 거의 다 여기 있어요
   (색, 이름, 시간, 서버 주소, 기본 돌봄 목록)
   ========================================================= */

const CONFIG = {
  // ---------- 사람 ----------
  // key(seoyoung / seoin)는 코드 안에서 쓰는 이름이라 바꾸지 마세요.
  // name, color만 바꾸면 화면 전체에 반영돼요.
  PLAYERS: {
    seoyoung: { name: "서영", color: "#ffa269", light: "#ffc7a3", pale: "#ffe6d6" },
    seoin:    { name: "서인", color: "#eb5555", light: "#f39997", pale: "#fbdada" },
  },

  // ---------- 멀티플레이 서버 ----------
  // p5.party 공개 데모 서버 (프로토타입용 — 서버가 재시작되면 방 데이터는 사라져요)
  SERVER_URL: "wss://demoserver.p5party.org",
  // 앱 이름은 서버 전체에서 겹치면 안 돼요. 다른 사람과 겹치지 않게 고유하게!
  APP_NAME: "choiseoyoung_seojin_care_v1",
  // 같은 방 코드를 입력한 두 폰끼리만 연결돼요.
  DEFAULT_ROOM: "",

  // ---------- 시간 (밀리초: 1000 = 1초) ----------
  CONNECT_TIMEOUT_MS: 10000,      // 서버 연결을 이만큼 기다려도 안 되면 '연결 실패'
  ROULETTE_MS: 3200,              // '오늘의 대결은…' 룰렛이 도는 시간
  COUNTDOWN_MS: 3600,             // 3, 2, 1, 시작!
  PLAY_MS: 20000,                 // 게임 한 판 길이 (20초)
  JUDGE_GRACE_MS: 8000,           // 게임이 끝나고 상대 점수를 기다려 주는 최대 시간
  DISCONNECT_GRACE_MS: 12000,     // 상대가 끊겨도 이 시간 안에 돌아오면 게임 계속 (새로고침 대비)
  STALE_MS: 9000,                 // 상대 신호(beat)가 이 시간 동안 안 오면 '나간 것'으로 판단
  BEAT_MS: 2000,                  // 내가 '살아 있어요' 신호를 보내는 간격

  // ---------- 거품내기 ----------
  BUBBLE: {
    SHAKE_THRESHOLD: 4,   // 이 값보다 약한 흔들림은 무시 (숫자↑ = 세게 흔들어야 함)
    ENERGY_PER_BUBBLE: 28,// 흔들림 에너지가 이만큼 모이면 거품 1개 (숫자↓ = 거품이 잘 생김)
    MAX_ENERGY_PER_SEC: 600, // 1초에 얻을 수 있는 최대 에너지 (폰을 미친 듯이 흔들어도 상한)
    MAX_VISIBLE: 140,     // 화면에 동시에 떠 있는 거품 최대 개수 (넘으면 오래된 것부터 터짐)
    // 센서가 없는 기기(PC 등)에서 화면 문지르기로 대신 플레이할 수 있게 할지
    ALLOW_TOUCH_FALLBACK: true,
    COLORS: {
      stroke: "#9fc6f5",
      center: "#8fc5fb",
      edgeBlue: "#e6f0fb",
      edgePink: "#f3e3f5",
    },
  },

  // ---------- 지니 잡기 (카메라) ----------
  JINI: {
    // 판단 기준은 '어깨너비'의 몇 배인지 → 카메라에서 가깝든 멀든 똑같이 동작해요
    OPEN_RATIO: 2.0,       // 두 손목 사이가 어깨너비의 이 배수보다 멀면 '팔 벌림' (숫자↑ = 더 크게 벌려야 함)
    ELBOW_OPEN_RATIO: 1.6, // 손목이 화면 밖일 때 팔꿈치 사이로 판단하는 기준
    CLOSE_RATIO: 0.7,      // 이 배수보다 가까워지면 '오므림' → 포획 시도 (숫자↑ = 덜 붙여도 됨)
    CATCH_RADIUS: 1.5,     // 지니 크기의 몇 배 안에서 오므려야 잡히는지 (숫자↑ = 쉬워짐)
    COOLDOWN_MS: 350,      // 한 번 오므린 뒤 다음 시도까지 최소 간격
    MIN_CONFIDENCE: 0.2,   // 이보다 확신이 낮은 관절은 무시 (0~1, 숫자↓ = 흐릿해도 인정)
    SHOW_SKELETON: true,
    // 동작 인식 계산 장치: "auto"(기기에 맞게 자동) / "webgl" / "webgpu" / "cpu"
    BACKEND: "auto",   // 인식된 관절(뼈대)을 화면에 표시 — 잘 되면 false로 꺼도 돼요
    SIZE: 46,              // 지니 반지름 (412px 폭 기준)
    SPEED: 3.0,            // 처음 속도
    SPEED_UP: 0.35,        // 한 번 잡힐 때마다 빨라지는 정도
    MAX_SPEED: 8.5,        // 최고 속도
    PAUSE_CHANCE: 0.2,     // 방향 바꿀 때 잠깐 멈칫할 확률 (잡을 기회)
    DASH_CHANCE: 0.22,     // 방향 바꿀 때 우다다 돌진할 확률
    // 카메라가 없는 기기에서 지니를 직접 눌러서 잡을 수 있게 할지
    ALLOW_TOUCH_FALLBACK: true,
    COLORS: {
      body: "#fffdf8",
      line: "#e3d3c0",
      ear: "#e9d9c4",
      net: "#ffd462",
    },
  },

  // ---------- 지니 부르기 (마이크 · 음 높이) ----------
  CALL: {
    // 가사와 멜로디 (음 하나당 글자 하나). 숫자는 MIDI 번호: 60 = 도(C4), 62 = 레, 64 = 미, 65 = 파, 67 = 솔, 69 = 라
    // 한 옥타브(12) 안에서만 쓰세요. 몇 옥타브로 부르든 같은 음이면 인정돼요 (낮은 목소리도 OK).
    LYRICS: ["아", "이", "구", "예", "뻐", "우", "리", "서", "진", "이"],
    NOTES:  [67,   69,   65,   60,   59,   62,   64,   67,   67,   67],
    PERFECT_CENTS: 50,   // 이 안이면 '딱 맞음' (100센트 = 반음 하나) — 초록 칸
    OK_CENTS: 300,       // 이 밖이면 점수 0 — 노란 칸 (숫자↑ = 쉬워짐)
    HOLD_SEC: 0.5,       // 이만큼 맞게 소리 내면 다음 글자로 (숫자↓ = 빨리 넘어감)
    NOTE_TIMEOUT_SEC: 4, // 한 글자에서 이만큼 못 맞추면 0점으로 넘어가요
    MIN_VOLUME: 0.012,   // 이보다 작은 소리는 무시 (시끄러운 곳이면 올리기)
    // 마이크가 없는 기기에서 화면을 위아래로 문질러 음 높이를 대신할 수 있게 할지
    ALLOW_TOUCH_FALLBACK: true,
    COLORS: {
      bar: "#fffdf8",
      ok: "#fff38a",       // 노란 칸 (괜찮음)
      perfect: "#8ff07a",  // 초록 칸 (딱 맞음)
      line: "#1a1a1a",     // 내 목소리 선
      ear: "#f2c896",
      tongue: "#ff8a8a",
      tail: ["#f7e0c3", "#f2cfa4", "#eec08c"],
    },
  },

  // ---------- 서진이 산책시키기 (카메라 · 몸 기울이기) ----------
  WALK: {
    // 몸 기울기 (도): 세로로 똑바로 서 있으면 0°
    MAX_LEAN_DEG: 16,     // 이만큼 기울이면 길 끝까지 (숫자↓ = 조금만 기울여도 끝까지)
    DEADZONE_DEG: 3,      // 이보다 작게 기울면 가운데 (서 있을 때 흔들림 무시)
    SHOULDER_GAIN: 1.3,   // 엉덩이가 안 보여서 '어깨선'으로 잴 때 보정 (어깨선은 덜 기울어져 보여서)
    FOLLOW: 0.14,         // 지니가 목표 위치를 따라가는 빠르기 (0~1, 숫자↑ = 반응 빠름)
    MIN_CONFIDENCE: 0.25, // 이보다 확신이 낮은 관절은 무시
    SHOW_SKELETON: true,  // 어깨선·몸통선과 기울기 각도 표시 — 잘 되면 false로

    // 속도와 장애물 (m = 점수 단위)
    START_SPEED: 3.0,     // 처음 속도 (m/초). 부딪히면 이 속도로 돌아가요
    SPEED_UP: 0.18,       // 안 부딪히면 1초마다 이만큼 빨라짐
    MAX_SPEED: 5.5,       // 최고 속도
    PX_PER_M: 100,        // 1m가 화면에서 몇 px인지 (412px 폭 기준) — 숫자↑ = 장애물이 빨리 내려옴
    FIRST_GAP_M: 4,       // 시작하고 첫 장애물까지 거리
    GAP_M: [3.4, 5.4],    // 장애물 사이 거리 (최소, 최대) — 숫자↓ = 장애물이 촘촘
    PAIR_CHANCE: 0.3,     // 장애물이 두 개 나란히 나올 확률 (틈으로 빠져나가기)
    WEIGHTS: { poop: 3, trash: 2.5, chicken: 2, bush: 2 }, // 장애물이 나오는 비율
    STUN_SEC: { poop: 1.1, trash: 1.0, chicken: 1.6, bush: 0.8 }, // 부딪혔을 때 멈추는 시간 (치킨은 먹느라 오래)
    HIT_FORGIVE: 0.72,    // 부딪힘 판정 크기 (숫자↓ = 살짝 스쳐도 안 부딪힘 = 쉬움)
    DOG_SCALE: 0.78,      // 지니 크기 (Figma = 1)

    // 카메라가 없는 기기에서 화면을 좌우로 밀어 조종할 수 있게 할지
    ALLOW_TOUCH_FALLBACK: true,
    COLORS: {             // Figma '미니게임2 _ 서진이 산책시키기'에서 가져온 색
      bg: "#fff7e2",
      panel: "#fffaed",
      videoVeil: "rgba(255,250,237,0.78)", // 카메라 영상 위 막 (숫자↓ = 내 모습이 더 잘 보임)
      grass: "rgba(203,255,203,0.55)",
      body: "#ffffff",
      ear: "#f4c797",     // 귀 · 꼬리
      paw: "#f6ece0",
      poop: "#7e4d4d",
      trash: "#a2a2a2",
      trashTie: "#c6c6c6",
      chicken: "#ffc384",
      bush: "#cbffcb",
      ink: "#350505",
    },
  },

  // ---------- 기본 돌봄 목록 ----------
  // type: "daily"(매일) / "periodic"(주기)
  // everyDays: 주기 관리일 때 며칠마다 해야 하는지 → '다음 예정일' 계산에 사용
  // time: 화면에 같이 보여줄 시간 (없으면 "")
  DEFAULT_TASKS: [
    { id: "breakfast", title: "아침밥주기", type: "daily", time: "" },
    { id: "dinner",    title: "저녁밥주기", type: "daily", time: "" },
    { id: "walk",      title: "산책하기",   type: "daily", time: "" },
    { id: "teeth",     title: "양치하기",   type: "daily", time: "23:00" },
    { id: "bath",      title: "목욕시키기", type: "periodic", everyDays: 14 },
    { id: "nails",     title: "발톱깎기",   type: "periodic", everyDays: 21 },
    { id: "heartworm", title: "심장사상충약", type: "periodic", everyDays: 30 },
  ],
};
