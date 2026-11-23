/* =========================================================
   games/registry.js — 미니게임 목록
   ---------------------------------------------------------
   새 게임을 추가하는 법
   1) js/games/새게임.js 파일을 만들고 bubble.js와 같은 모양으로 작성
      (create(stageElement, options) → { start, stop, score, setScore, destroy })
   2) index.html에 <script src="js/games/새게임.js"></script> 추가
   3) 아래 목록에서 그 게임의 module에 이름을 넣고 playable: true
   → 룰렛에서 자동으로 뽑히기 시작해요.
   ========================================================= */

const GAMES = [
  {
    id: "blow",
    name: "바람 불기",
    icon: "💨",
    how: "마이크에 바람을 후— 불어요",
    win: "더 오래, 세게 분 사람이 승리",
    playable: false,
    module: null,
  },
  {
    id: "bubble",
    name: "거품내기",
    icon: "🫧",
    how: "폰을 꽉 쥐고 마구 흔들어요",
    win: "제한 시간 동안 거품을 더 많이 만든 사람이 승리",
    sub: "핸드폰을 흔드세요",
    input: "motion",
    unit: "개",
    scoreLabel: "거품",
    countdownSub: "폰을 꽉 쥐세요!",
    judging: "거품 세는 중…",
    tieText: "거품 수가 똑같아요!",
    practiceLine: "결투에서는 더 세게 흔들어 봐요!",
    playable: true,
    module: () => BubbleGame, // bubble.js
  },
  {
    id: "tilt",
    name: "기울이기",
    icon: "🎯",
    how: "폰을 기울여 간식을 굴려요",
    win: "간식을 더 많이 모은 사람이 승리",
    playable: false,
    module: null,
  },
  {
    id: "jini",
    name: "지니 잡기",
    icon: "🙌",
    how: "폰을 세워 두고 한 걸음 뒤로! 팔을 쫙 벌렸다가 지니 위에서 두 손을 모아요",
    win: "지니를 더 많이 잡은 사람이 승리",
    sub: "팔을 벌렸다가 지니 위에서 모으세요",
    input: "camera",
    unit: "번",
    scoreLabel: "포획",
    countdownSub: "폰을 세워 두고 한 걸음 뒤로!",
    judging: "포획 수 세는 중…",
    tieText: "잡은 수가 똑같아요!",
    practiceLine: "결투에서는 노란 조준점을 지니에 맞춰 봐요!",
    playable: true,
    module: () => JiniGame, // jini.js
  },
  {
    id: "call",
    name: "지니 부르기",
    icon: "🎤",
    how: "막대의 초록 칸에 맞춰 \"아이구 예뻐 우리 서진이~\"를 한 글자씩 노래해요",
    win: "음을 더 정확하게 맞춘 사람이 승리",
    sub: "음을 맞춰 서진이를 부르세요",
    input: "mic",
    unit: "점",
    scoreLabel: "",
    countdownSub: "목을 가다듬고… 아~",
    judging: "노래 점수 매기는 중…",
    tieText: "점수가 똑같아요!",
    practiceLine: "초록 칸에 오래 머물수록 점수가 높아요. 지니 꼬리를 봐요!",
    playable: true,
    module: () => CallGame, // call.js
  },
  {
    id: "hand",
    name: "손동작",
    icon: "✋",
    how: "카메라 앞에서 손동작을 따라 해요",
    win: "더 많이 맞힌 사람이 승리",
    playable: false,
    module: null,
  },
];

function gameById(id) {
  return GAMES.find((g) => g.id === id) || null;
}

// 룰렛에서 실제로 뽑을 수 있는 게임 (아직 안 만든 게임은 빠져요)
function pickRandomPlayableGame() {
  const list = GAMES.filter((g) => g.playable);
  return list[Math.floor(Math.random() * list.length)];
}
