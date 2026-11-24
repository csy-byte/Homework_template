/* =========================================================
   games/walk.js — 미니게임: 서진이 산책시키기 (p5.js + ml5 bodyPose)
   ---------------------------------------------------------
   1) 카메라 앞에서 몸을 왼쪽/오른쪽으로 기울이면 → 지니도 그쪽으로 이동
   2) 위에서 내려오는 똥 · 쓰레기 · 치킨 · 덤불을 피해요
   3) 부딪히면 지니가 멈춰 서고(치킨은 먹느라 더 오래!) 속도도 처음으로
   점수 = 걸은 거리(m)  → 안 부딪히고 오래 갈수록 빨라져서 더 멀리 가요

   ★ 두 사람에게 '똑같은 길'이 나와요 (결투 번호로 장애물 순서를 정함) → 공평!
   카메라가 없거나 거부되면 → 화면을 좌우로 밀어서 조종 (PC는 ← → 키도 돼요)

   몸 기울기 계산
   - 엉덩이까지 보이면: 엉덩이 가운데 → 어깨 가운데 선이 세로에서 몇 도 기울었는지
   - 엉덩이가 안 보이면: 양쪽 어깨를 잇는 선이 몇 도 기울었는지
   (화면은 거울처럼 보여서, 내가 오른쪽으로 기울면 화면에서도 오른쪽)
   ========================================================= */

const WalkGame = {
  /**
   * @param {HTMLElement} stage  캔버스를 넣을 상자
   * @param {object} opts
   *   onScore(n)    점수가 바뀔 때마다
   *   onHint(text)  화면 위 안내 문구 ("" 이면 숨김)
   *   color         내 색
   *   seed          장애물 순서를 정하는 값 (두 폰이 같으면 같은 길)
   */
  create(stage, opts = {}) {
    const C = CONFIG.WALK;
    const myColor = opts.color || "#ffa269";
    let running = false;
    let mode = null;          // "camera" | "touch"
    let hint = null;

    // ---------- 진행 상태 ----------
    let dist = 0;             // 걸은 거리 (m) = 점수
    let speed = C.START_SPEED;// 지금 속도 (m/초)
    let stunUntil = 0;        // 이 시각까지 멈춤 (부딪힘)
    let safeUntil = 0;        // 이 시각까지 무적 (깜빡깜빡)
    let lastScore = 0;
    let resumeSafe = false;   // 새로고침 직후 잠깐 무적

    // 지니 가로 위치: 0 = 길 왼쪽 끝, 1 = 오른쪽 끝
    let dogX = 0.5, targetX = 0.5;
    let lean = 0;             // 지금 몸 기울기 (도) — 부드럽게
    let leanSeenAt = -9999;
    let bodyMode = "";        // "torso"(엉덩이까지) | "shoulder"(어깨만)
    let touchX = null;        // 대체 조작: 손가락 위치 (0~1)
    let keyDir = 0;           // PC: ← → 키

    const obstacles = [];
    const prints = [];        // 발자국
    const fx = [];            // "으악 똥!" 같은 글자 효과
    let reaction = null;      // 지금 지니 반응 { type, t0 }

    // ---------- 같은 길 만들기: 씨앗(seed)이 같으면 항상 같은 난수가 나와요 ----------
    function makeRandom(seed) {
      let h = 1779033703;
      const s = String(seed == null ? Math.random() : seed);
      for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
      let a = h >>> 0;
      return () => { // mulberry32
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    const rand = makeRandom(opts.seed);
    let nextRowM = C.FIRST_GAP_M; // 다음 장애물 줄이 나올 거리

    function setHint(t) {
      if (t === hint) return;
      hint = t;
      if (opts.onHint) opts.onHint(t);
    }

    // ---------- 대체 조작 (카메라 없을 때) ----------
    let panelRect = { x: 0, y: 0, w: 1, h: 1 }; // 아래 스케치에서 채워요
    function onPointer(e) {
      if (mode !== "touch") return;
      const r = stage.getBoundingClientRect();
      touchX = Math.max(0, Math.min(1, (e.clientX - r.left - panelRect.x) / panelRect.w));
    }
    function onKey(e) {
      if (e.key === "ArrowLeft") keyDir = e.type === "keydown" ? -1 : 0;
      if (e.key === "ArrowRight") keyDir = e.type === "keydown" ? 1 : 0;
    }
    stage.addEventListener("pointerdown", onPointer);
    stage.addEventListener("pointermove", onPointer);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);

    // ---------- p5 스케치 ----------
    const sketch = (p) => {
      let u = 1;      // 412px 폭 기준 비율
      let P;          // 길(둥근 판) 위치 { x, y, w, h }
      const K = () => C.DOG_SCALE * u; // 지니 크기 비율

      function layout() {
        // 크기 비율: 가로(412)와 세로(917) 중 더 빠듯한 쪽에 맞춰요
        // → 폰(세로 화면)은 가로 기준, 노트북(가로로 넓은 화면)은 세로 기준이라 안 잘려요
        u = Math.min(p.width / 412, p.height / 917);
        // Figma: 412×917 화면에서 판 = x 22, y 160, 362×716
        const top = Math.min(p.height * (160 / 917), 170 * u);
        const h = p.height - top - Math.max(16 * u, p.height * (41 / 917));
        // 판 너비: 폰은 화면 꽉 차게, 노트북은 높이의 0.75배까지만 (너무 넓으면 지니가 끝까지 못 감)
        const w = Math.min(p.width - 44 * u, h * 0.75);
        P = { x: (p.width - w) / 2, y: top, w, h };
        panelRect = P;
      }

      p.setup = () => {
        const c = p.createCanvas(stage.clientWidth, stage.clientHeight);
        c.parent(stage);
        p.pixelDensity(Math.min(2, window.devicePixelRatio || 1));
        layout();
      };
      p.windowResized = () => { p.resizeCanvas(stage.clientWidth, stage.clientHeight); layout(); };

      // 지니 몸통 가운데 높이 (Figma: 판의 68% 지점)
      const dogY = () => P.y + P.h * 0.66;
      const laneX = (x) => P.x + P.w * (0.08 + x * 0.84); // 0~1 → 화면 x
      const pxPerM = () => C.PX_PER_M * u;
      const obsY = (o) => dogY() - (o.atM - dist) * pxPerM();

      // ---------- 장애물 만들기 ----------
      // 종류별 모양 크기(가로 반지름 rx, 세로 반지름 ry)는 부딪힘 판정에도 써요
      const TYPES = {
        poop:    { rx: 30, ry: 16, oy: -8,  stun: C.STUN_SEC.poop,    text: "으악 똥!" },
        trash:   { rx: 52, ry: 56, oy: 0,   stun: C.STUN_SEC.trash,   text: "킁킁… 쓰레기" },
        chicken: { rx: 50, ry: 24, oy: 0,   stun: C.STUN_SEC.chicken, text: "치킨 냠냠!" },
        bush:    { rx: 100, ry: 105, oy: 0, stun: C.STUN_SEC.bush,    text: "부스럭!" },
      };
      function pickType() {
        const w = C.WEIGHTS;
        let r = rand() * (w.poop + w.trash + w.chicken + w.bush);
        for (const k of ["poop", "trash", "chicken", "bush"]) { if ((r -= w[k]) < 0) return k; }
        return "poop";
      }
      function addRow(atM) {
        const type = pickType();
        if (type === "bush") {
          // 덤불은 한쪽 벽에 붙어서 크게 (Figma처럼 판 밖으로 삐져나옴)
          const side = rand() < 0.5 ? -1 : 1;
          obstacles.push({ type, atM, x: side < 0 ? -0.06 : 1.06, side, s: 0.75 + rand() * 0.2, hit: false });
          return;
        }
        const x = 0.1 + rand() * 0.8;
        obstacles.push({ type, atM, x, side: rand() < 0.5 ? -1 : 1, s: 1, hit: false });
        // 가끔 두 개가 나란히 → 사이 틈으로 빠져나가야 해요 (틈은 항상 지니가 지나갈 만큼)
        if (rand() < C.PAIR_CHANCE) {
          const t2 = rand() < 0.5 ? "poop" : "trash";
          const x2 = x < 0.5 ? Math.min(0.95, x + 0.62 + rand() * 0.2) : Math.max(0.05, x - 0.62 - rand() * 0.2);
          obstacles.push({ type: t2, atM: atM + (rand() - 0.5) * 0.6, x: x2, side: 1, s: 1, hit: false });
        }
      }
      function spawn() {
        const aheadM = (dogY() - P.y + 180 * u) / pxPerM();
        while (nextRowM < dist + aheadM) {
          addRow(nextRowM);
          nextRowM += C.GAP_M[0] + rand() * (C.GAP_M[1] - C.GAP_M[0]);
        }
        // 화면 아래로 지나간 건 지우기
        for (let i = obstacles.length - 1; i >= 0; i--) {
          if (obsY(obstacles[i]) > P.y + P.h + 260 * u) obstacles.splice(i, 1);
        }
      }

      // ---------- 부딪힘 판정 ----------
      // 지니 = 머리 원 + 몸통 원, 장애물 = 타원. 조금 봐줘서(C.HIT_FORGIVE) 스치면 OK
      function hits(o) {
        const T = TYPES[o.type], k = K(), sc = o.s * u;
        const ox = laneX(o.x), oy = obsY(o) + T.oy * sc;
        const circles = [
          { x: laneX(dogX), y: dogY() - 86 * k, r: 40 * k }, // 머리
          { x: laneX(dogX), y: dogY(), r: 42 * k },          // 몸통
        ];
        const f = C.HIT_FORGIVE;
        return circles.some((c) => {
          const dx = (c.x - ox) / (T.rx * sc * f + c.r * f);
          const dy = (c.y - oy) / (T.ry * sc * f + c.r * f);
          return dx * dx + dy * dy < 1;
        });
      }

      function bump(o, now) {
        o.hit = true;
        const T = TYPES[o.type];
        stunUntil = now + T.stun * 1000;
        safeUntil = stunUntil + 700;
        speed = C.START_SPEED;
        reaction = { type: o.type, t0: now };
        fx.push({ text: T.text, x: laneX(dogX), y: dogY() - 150 * K(), t0: now, type: o.type });
        if (navigator.vibrate) navigator.vibrate(o.type === "chicken" ? [40, 60, 40] : 120);
      }

      // ---------- 몸 기울기 읽기 ----------
      // 카메라 영상을 판(P) 크기에 꽉 차게(cover) + 거울 반전
      function videoRect() {
        const v = Cam.video;
        const vw = v.videoWidth, vh = v.videoHeight;
        const s = Math.max(P.w / vw, P.h / vh);
        return { vw, vh, s, ox: P.x + (P.w - vw * s) / 2, oy: P.y + (P.h - vh * s) / 2 };
      }
      const toCanvas = (k, vr) => ({ x: vr.ox + (vr.vw - k.x) * vr.s, y: vr.oy + k.y * vr.s });
      const deg = (r) => (r * 180) / Math.PI;

      function readLean(vr) {
        if (!Cam.poseFresh) return;
        const c = C.MIN_CONFIDENCE;
        const ls = Cam.point("left_shoulder", c), rs = Cam.point("right_shoulder", c);
        if (!ls || !rs) return;
        const A = toCanvas(ls, vr), B = toCanvas(rs, vr);
        const S = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
        const lh = Cam.point("left_hip", c + 0.1), rh = Cam.point("right_hip", c + 0.1);
        let d;
        if (lh && rh) {
          // 엉덩이 가운데 → 어깨 가운데 선이 세로에서 몇 도? (오른쪽 +)
          const H1 = toCanvas(lh, vr), H2 = toCanvas(rh, vr);
          const H = { x: (H1.x + H2.x) / 2, y: (H1.y + H2.y) / 2 };
          d = deg(Math.atan2(S.x - H.x, H.y - S.y));
          bodyMode = "torso";
        } else {
          // 어깨선이 가로에서 몇 도? (화면 오른쪽 어깨가 내려가면 +)
          const L = A.x < B.x ? A : B, R = A.x < B.x ? B : A;
          d = deg(Math.atan2(R.y - L.y, R.x - L.x)) * C.SHOULDER_GAIN;
          bodyMode = "shoulder";
        }
        if (!isFinite(d)) return;
        lean += (d - lean) * 0.35; // 덜덜 떨림 줄이기
        leanSeenAt = p.millis();
      }

      // 기울기(도) → 지니 목표 위치 (0~1)
      function leanToX(a) {
        const s = Math.sign(a);
        const m = Math.max(0, Math.min(1, (Math.abs(a) - C.DEADZONE_DEG) / (C.MAX_LEAN_DEG - C.DEADZONE_DEG)));
        return 0.5 + s * m * 0.5;
      }

      // ---------- 한 프레임 진행 ----------
      function update(dtSec) {
        const now = p.millis();
        // 조종: 카메라면 몸 기울기, 아니면 손가락/키
        if (mode === "camera") {
          if (now - leanSeenAt < 1200) targetX = leanToX(lean);
        } else {
          if (keyDir) touchX = Math.max(0, Math.min(1, (touchX == null ? dogX : touchX) + keyDir * dtSec * 1.4));
          if (touchX != null) targetX = touchX;
        }
        const stunned = now < stunUntil;
        const follow = 1 - Math.pow(1 - C.FOLLOW, dtSec * 60) ; // 프레임 속도와 상관없이 같은 느낌
        dogX += (targetX - dogX) * follow * (stunned ? 0.35 : 1);

        if (!running) return;
        if (resumeSafe) { resumeSafe = false; safeUntil = now + 1500; }
        if (!stunned) {
          const before = dist;
          speed = Math.min(C.MAX_SPEED, speed + C.SPEED_UP * dtSec);
          dist += speed * dtSec;
          // 발자국 (0.55m마다 왼발/오른발)
          if (Math.floor(before / 0.55) !== Math.floor(dist / 0.55)) {
            prints.push({ x: dogX, atM: dist, side: Math.floor(dist / 0.55) % 2 ? 1 : -1 });
            if (prints.length > 30) prints.shift();
          }
        }
        spawn();
        if (now > safeUntil) {
          for (const o of obstacles) { if (!o.hit && hits(o)) { bump(o, now); break; } }
        }
        const sc = Math.floor(dist);
        if (sc !== lastScore) { lastScore = sc; if (opts.onScore) opts.onScore(sc); }
      }

      function updateHint() {
        if (!running) return setHint("");
        if (mode === "touch") return setHint("카메라 없음 · 화면을 좌우로 밀어서 피하기");
        const now = p.millis();
        if (now - leanSeenAt > 900) {
          if (!Cam.poseFresh) return setHint("동작 인식 준비 중…");
          if (!Cam.hasPose) return setHint("몸이 안 보여요 · 한 걸음 뒤로!");
          return setHint("어깨가 화면에 보이게 서 주세요");
        }
        setHint("");
      }

      // ======================================================
      //  그리기
      // ======================================================
      function roundRectPath(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
      }

      function drawPanel(vr) {
        const ctx = p.drawingContext;
        p.noStroke(); p.fill(C.COLORS.panel);
        p.rect(P.x, P.y, P.w, P.h, 10 * u);
        if (!vr) return;
        // 카메라 영상: 판 안에만, 거울처럼, 흐리게 (내 모습은 보이되 장애물이 더 잘 보이게)
        ctx.save();
        roundRectPath(ctx, P.x, P.y, P.w, P.h, 10 * u);
        ctx.clip();
        ctx.translate(P.x * 2 + P.w, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(Cam.video, vr.ox, vr.oy, vr.vw * vr.s, vr.vh * vr.s);
        ctx.restore();
        ctx.save();
        roundRectPath(ctx, P.x, P.y, P.w, P.h, 10 * u);
        ctx.fillStyle = C.COLORS.videoVeil;
        ctx.fill();
        ctx.restore();
      }

      // 길이 움직이는 느낌: 작은 풀잎 점들이 아래로 흘러가요
      function drawGround() {
        const gap = 90 * u;
        const off = (dist * pxPerM()) % gap;
        p.noStroke(); p.fill(C.COLORS.grass);
        for (let y = P.y - gap + off; y < P.y + P.h; y += gap) {
          const row = Math.round((y - off) / gap);
          for (let k = 0; k < 4; k++) {
            const x = P.x + P.w * (((row * 37 + k * 71) % 100) / 100);
            p.ellipse(x, y + ((k * 29) % 40) * u, 10 * u, 4 * u);
          }
        }
      }

      function drawPrints() {
        p.noStroke();
        for (const pr of prints) {
          const y = dogY() + 60 * K() - (pr.atM - dist) * pxPerM();
          const a = Math.max(0, 1 - (dist - pr.atM) / 6);
          if (a <= 0 || y > P.y + P.h) continue;
          const x = laneX(pr.x) + pr.side * 14 * K();
          p.fill(244, 199, 151, 140 * a);
          p.ellipse(x, y, 11 * K(), 13 * K());
          for (let t = -1; t <= 1; t++) p.circle(x + t * 6 * K(), y - 10 * K(), 5 * K());
        }
      }

      // ---------- 장애물 그림 (Figma 모양 그대로) ----------
      function drawPoop(o, x, y, s) {
        const t = p.millis();
        // 냄새 꼬불꼬불
        p.noFill(); p.stroke(C.COLORS.ink); p.strokeWeight(1.3 * s);
        for (const [dx, dy] of [[-17, -34], [0, -45], [15, -34]]) {
          p.beginShape();
          for (let k = 0; k <= 8; k++) {
            const yy = dy - k * 4.2;
            p.vertex(x + (dx + Math.sin(k * 0.9 + t * 0.006 + dx) * 3) * s, y + yy * s);
          }
          p.endShape();
        }
        p.noStroke(); p.fill(C.COLORS.poop);
        p.ellipse(x, y, 58 * s, 14 * s);
        p.ellipse(x, y - 10.5 * s, 44 * s, 15 * s);
        p.ellipse(x - 0.5 * s, y - 21.5 * s, 19 * s, 15 * s);
      }

      function drawTrash(o, x, y, s) {
        // 묶은 부분 (잎 두 장)
        p.noStroke(); p.fill(C.COLORS.trashTie);
        p.push(); p.translate(x + 6 * s, y - 58 * s);
        p.push(); p.rotate(-0.5); p.ellipse(-6 * s, -6 * s, 12 * s, 22 * s); p.pop();
        p.push(); p.rotate(0.9); p.ellipse(8 * s, -10 * s, 12 * s, 26 * s); p.pop();
        p.pop();
        // 봉투 (아래가 넓은 둥근 자루)
        p.fill(C.COLORS.trash);
        p.beginShape();
        p.vertex(x - 4 * s, y - 62 * s);
        p.bezierVertex(x + 30 * s, y - 62 * s, x + 54 * s, y - 40 * s, x + 56 * s, y + 10 * s);
        p.bezierVertex(x + 58 * s, y + 52 * s, x + 30 * s, y + 66 * s, x - 6 * s, y + 64 * s);
        p.bezierVertex(x - 44 * s, y + 62 * s, x - 58 * s, y + 46 * s, x - 54 * s, y + 6 * s);
        p.bezierVertex(x - 50 * s, y - 38 * s, x - 36 * s, y - 62 * s, x - 4 * s, y - 62 * s);
        p.endShape(p.CLOSE);
        p.fill(255); p.textFont("Pretendard"); p.textSize(13 * s); p.textAlign(p.CENTER, p.CENTER);
        p.text("쓰레기", x - 3 * s, y - 18 * s);
      }

      function drawChicken(o, x, y, s, eaten) {
        p.push(); p.translate(x, y); p.scale(o.side, 1); // 좌우 방향 랜덤
        if (eaten > 0) p.scale(1 - eaten * 0.85);       // 먹히는 중이면 점점 작아짐
        p.noStroke(); p.fill(C.COLORS.chicken);
        // 뼈 + 끝 동그라미
        p.stroke(C.COLORS.chicken); p.strokeWeight(9 * s); p.strokeCap(p.ROUND);
        p.line(20 * s, 2 * s, 50 * s, -2 * s);
        p.noStroke();
        p.circle(54 * s, -7 * s, 11 * s); p.circle(57 * s, 2 * s, 11 * s);
        // 살 (아래가 평평한 덩어리)
        p.beginShape();
        p.vertex(-56 * s, 24 * s);
        p.bezierVertex(-60 * s, 0, -48 * s, -26 * s, -16 * s, -28 * s);
        p.bezierVertex(12 * s, -30 * s, 30 * s, -8 * s, 30 * s, 8 * s);
        p.bezierVertex(26 * s, 22 * s, 0, 28 * s, -56 * s, 24 * s);
        p.endShape(p.CLOSE);
        p.scale(o.side, 1); // 글자는 뒤집히지 않게
        p.fill(C.COLORS.ink); p.textFont("Pretendard"); p.textSize(12 * s); p.textAlign(p.CENTER, p.CENTER);
        p.text("치킨", -16 * o.side * s, 2 * s);
        p.pop();
      }

      // 덤불: Figma의 동그라미 5개 뭉치
      const BUSH = [[-21.5, -52], [54.5, 2], [-21.5, 14], [16.5, 53], [-54.5, 53]];
      function drawBush(o, x, y, s) {
        const wob = o.hit ? Math.sin(p.millis() * 0.06) * 4 * s : 0;
        p.noStroke(); p.fill(C.COLORS.bush);
        for (const [bx, by] of BUSH) p.ellipse(x + (bx * -o.side) * s + wob, y + by * s, 109 * s, 124 * s);
      }

      // front = false: 지니보다 위(뒤)에 있는 것 / true: 지니보다 아래(앞)에 있는 것
      // → 지니 그리기 전후로 나눠 그려서 겹칠 때 앞뒤가 자연스럽게
      function drawObstacles(front) {
        const now = p.millis();
        for (const o of obstacles) {
          const y = obsY(o);
          if ((y > dogY()) !== front) continue;
          if (y < P.y - 200 * u || y > P.y + P.h + 200 * u) continue;
          const x = laneX(o.x), s = o.s * u;
          // 치킨은 부딪힌 순간부터 냠냠 먹혀서 사라져요
          const eaten = o.type === "chicken" && o.hit && reaction ? Math.min(1, (now - reaction.t0) / (C.STUN_SEC.chicken * 1000)) : 0;
          if (o.type === "poop") drawPoop(o, x, y, s);
          else if (o.type === "trash") drawTrash(o, x, y, s);
          else if (o.type === "chicken") { if (eaten < 1) drawChicken(o, x, y, s, eaten); }
          else drawBush(o, x, y, s);
        }
      }

      // ---------- 지니 (뒷모습, Figma: 머리 + 몸통 + 귀 2 + 꼬리) ----------
      function drawDog() {
        const now = p.millis();
        const k = K();
        const x = laneX(dogX), y = dogY();
        const stunned = now < stunUntil;
        // 무적 시간엔 깜빡깜빡
        if (!stunned && now < safeUntil && Math.floor(now / 90) % 2) return;
        const moving = running && !stunned;
        const step = moving ? now * 0.012 * (speed / C.START_SPEED) : 0;
        const bob = moving ? Math.abs(Math.sin(step)) * 4 * k : 0;
        const shake = stunned && reaction && reaction.type !== "chicken" ? Math.sin(now * 0.07) * 5 * k : 0;
        const lean01 = (targetX - dogX) * 0.9; // 움직이는 쪽으로 몸이 살짝 기울어요

        p.push();
        p.translate(x + shake, y - bob);
        p.rotate(lean01 * 0.5);

        // 그림자
        p.noStroke(); p.fill(53, 5, 5, 25);
        p.ellipse(0, 70 * k + bob, 96 * k, 22 * k);

        // 꼬리 (살랑살랑 — 신나면 빨리)
        const wagSpeed = stunned ? (reaction && reaction.type === "chicken" ? 0.03 : 0.004) : 0.016;
        const wag = Math.sin(now * wagSpeed) * 0.45;
        p.push();
        p.translate(-2 * k, 55 * k);
        p.rotate(wag);
        p.noFill(); p.stroke(C.COLORS.ear); p.strokeWeight(26 * k); p.strokeCap(p.ROUND);
        p.bezier(0, 0, 4 * k, 40 * k, -10 * k, 70 * k, -42 * k, 92 * k);
        p.pop();

        // 뒷발 (걸을 때 번갈아)
        p.noStroke(); p.fill(C.COLORS.paw);
        const legA = moving ? Math.sin(step * 2) * 7 * k : 0;
        p.ellipse(-30 * k, 52 * k + legA, 22 * k, 26 * k);
        p.ellipse(30 * k, 52 * k - legA, 22 * k, 26 * k);

        // 몸통
        p.fill(C.COLORS.body);
        p.ellipse(0, 0, 93 * k, 135 * k);
        // 머리
        const headTurn = stunned && reaction && reaction.type === "chicken" ? Math.sin(now * 0.02) * 6 * k : 0;
        p.circle(4 * k + headTurn, -88 * k, 93 * k);
        // 귀 (팔랑팔랑)
        const flap = moving ? Math.sin(step * 2) * 0.18 : 0;
        p.fill(C.COLORS.ear);
        p.push(); p.translate(-40 * k + headTurn, -78 * k); p.rotate(-0.55 + flap); p.ellipse(0, 0, 50 * k, 60 * k); p.pop();
        p.push(); p.translate(48 * k + headTurn, -78 * k); p.rotate(0.55 - flap); p.ellipse(0, 0, 50 * k, 60 * k); p.pop();
        p.pop();

        // 반응 말풍선 아이콘
        if (stunned && reaction) {
          p.textAlign(p.CENTER, p.CENTER); p.textSize(26 * u);
          const icon = { poop: "💢", trash: "👃", chicken: "🍗", bush: "🌿" }[reaction.type];
          p.text(icon, x + 52 * k, y - 140 * k + Math.sin(now * 0.01) * 4 * u);
        }
      }

      function drawFx() {
        const now = p.millis();
        p.textAlign(p.CENTER, p.CENTER);
        p.textFont("Black Han Sans");
        for (let i = fx.length - 1; i >= 0; i--) {
          const f = fx[i];
          const t = (now - f.t0) / 1100;
          if (t >= 1) { fx.splice(i, 1); continue; }
          const a = 1 - t, yy = f.y - t * 26 * u;
          p.noStroke();
          p.textSize(22 * u);
          const tw = p.textWidth(f.text) + 26 * u;
          p.fill(255, 255, 251, 230 * a);
          p.rect(f.x - tw / 2, yy - 19 * u, tw, 38 * u, 19 * u);
          if (f.type === "chicken") p.fill(217, 130, 43, 255 * a); // 치킨은 주황 글자
          else p.fill(53, 5, 5, 255 * a);
          p.text(f.text, f.x, yy);
        }
      }

      // 아래쪽 기울기 막대: 내 몸이 얼마나 기울었는지 보여 줘요
      function drawLeanMeter() {
        const w = P.w * 0.62, x0 = P.x + (P.w - w) / 2, y = P.y + P.h - 22 * u;
        p.noStroke(); p.fill(53, 5, 5, 30);
        p.rect(x0, y - 4 * u, w, 8 * u, 4 * u);
        // 가운데 '안 움직임' 구역
        const dz = (C.DEADZONE_DEG / C.MAX_LEAN_DEG) * (w / 2);
        p.fill(53, 5, 5, 45); p.rect(x0 + w / 2 - dz, y - 4 * u, dz * 2, 8 * u, 4 * u);
        const fresh = mode === "camera" ? p.millis() - leanSeenAt < 1200 : true;
        const v = mode === "camera" ? Math.max(-1, Math.min(1, lean / C.MAX_LEAN_DEG)) : targetX * 2 - 1;
        p.fill(fresh ? myColor : "#bbaaaa"); p.stroke(255); p.strokeWeight(2.5 * u);
        p.circle(x0 + w / 2 + v * (w / 2), y, 18 * u);
        p.noStroke(); p.fill(53, 5, 5, 150); p.textFont("Pretendard"); p.textSize(11 * u);
        p.textAlign(p.RIGHT, p.CENTER); p.text("◀", x0 - 8 * u, y);
        p.textAlign(p.LEFT, p.CENTER); p.text("▶", x0 + w + 8 * u, y);
      }

      // 뼈대 보기 (인식이 잘 되는지 확인용): 어깨선 + 몸통선만
      function drawSkeleton(vr) {
        if (!C.SHOW_SKELETON || !Cam.poseFresh) return;
        const c = 0.15;
        const get = (n) => { const k = Cam.point(n, c); return k ? toCanvas(k, vr) : null; };
        const ls = get("left_shoulder"), rs = get("right_shoulder"), lh = get("left_hip"), rh = get("right_hip");
        p.stroke(255, 255, 255, 200); p.strokeWeight(4 * u);
        if (ls && rs) p.line(ls.x, ls.y, rs.x, rs.y);
        if (ls && rs && lh && rh) {
          p.stroke(myColor);
          p.line((ls.x + rs.x) / 2, (ls.y + rs.y) / 2, (lh.x + rh.x) / 2, (lh.y + rh.y) / 2);
        }
        p.noStroke(); p.fill(53, 5, 5, 150); p.textAlign(p.LEFT, p.BOTTOM); p.textSize(10 * u); p.textFont("Pretendard");
        p.text(`인식: ${Cam.backend || "-"} · ${bodyMode === "torso" ? "몸통" : bodyMode === "shoulder" ? "어깨" : "-"} ${Math.round(lean)}°`, P.x + 10 * u, P.y + P.h - 40 * u);
      }

      p.draw = () => {
        const dtSec = Math.min(0.05, p.deltaTime / 1000);
        const camOn = Cam.ready && Cam.video && Cam.video.videoWidth > 0;
        if (camOn) {
          if (mode !== "camera") { mode = "camera"; Cam.startDetect(); }
        } else {
          mode = C.ALLOW_TOUCH_FALLBACK ? "touch" : "camera";
        }

        p.background(C.COLORS.bg);
        let vr = null;
        if (camOn) { Cam.syncSize(); vr = videoRect(); readLean(vr); }
        update(dtSec);
        updateHint();

        drawPanel(vr);
        const ctx = p.drawingContext;
        ctx.save(); // 판 밖으로 삐져나오는 덤불/장애물은 잘라내기 (Figma는 왼쪽 덤불만 밖으로 나가지만 깔끔하게)
        roundRectPath(ctx, P.x - 22 * u, P.y, P.w + 44 * u, P.h, 0);
        ctx.clip();
        drawGround();
        if (vr) drawSkeleton(vr);
        drawPrints();
        drawObstacles(false);
        drawDog();
        drawObstacles(true);
        ctx.restore();
        drawFx();
        drawLeanMeter();
      };
    };

    const instance = new p5(sketch);

    // ---------- 바깥(app.js)에서 쓰는 기능 ----------
    return {
      start() { running = true; },
      stop() { running = false; setHint(""); },
      score() { return Math.floor(dist); },
      // 새로고침 후 이어 하기: 그 거리부터 + 1.5초 무적 (같은 길이 이어지도록 장애물 순서는 그대로)
      setScore(n) { dist = n; lastScore = n; resumeSafe = true; },
      destroy() {
        running = false;
        stage.removeEventListener("pointerdown", onPointer);
        stage.removeEventListener("pointermove", onPointer);
        window.removeEventListener("keydown", onKey);
        window.removeEventListener("keyup", onKey);
        instance.remove();
      },
    };
  },
};
