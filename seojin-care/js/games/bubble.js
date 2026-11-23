/* =========================================================
   games/bubble.js — 미니게임: 거품내기 (p5.js 인스턴스 모드)
   ---------------------------------------------------------
   폰을 흔들면 → 흔들림 에너지가 쌓이고 → 일정량마다 거품 +1
   점수 = 만든 거품 개수 (터진 거품도 점수에 그대로 남아요)

   이 파일은 '게임 한 판'만 책임져요.
   언제 시작/끝낼지, 점수를 서버로 보내는 건 app.js가 해요.
   ========================================================= */

const BubbleGame = {
  /**
   * @param {HTMLElement} stage  캔버스를 넣을 상자
   * @param {object} opts
   *   onScore(n)     점수가 바뀔 때마다 호출
   *   onMode(mode)   "motion"(센서) / "touch"(문지르기 대체 조작) 바뀔 때
   */
  create(stage, opts = {}) {
    const C = CONFIG.BUBBLE;
    let score = 0;
    let energy = 0;
    let running = false;
    let spawnQueue = 0;
    let mode = "motion";
    let startedAt = 0;
    let bucket = { t: 0, e: 0 };
    const bubbles = [];
    const pops = [];
    let dogImg = null;

    // ---------- 에너지 → 거품 ----------
    function addEnergy(e) {
      if (!running) return;
      // 1초당 얻을 수 있는 에너지에 상한을 둬서 공정하게
      const now = performance.now();
      if (now - bucket.t > 1000) bucket = { t: now, e: 0 };
      const add = Math.max(0, Math.min(e, C.MAX_ENERGY_PER_SEC - bucket.e));
      bucket.e += add;
      energy += add;
      let changed = false;
      while (energy >= C.ENERGY_PER_BUBBLE) {
        energy -= C.ENERGY_PER_BUBBLE;
        score++;
        spawnQueue++;
        changed = true;
      }
      if (changed && opts.onScore) opts.onScore(score);
    }

    // ---------- 대체 조작: 화면 문지르기 (센서 없는 기기용) ----------
    let lastPt = null;
    function onPointerDown(e) { lastPt = { x: e.clientX, y: e.clientY }; }
    function onPointerMove(e) {
      if (mode !== "touch" || !lastPt) return;
      const d = Math.hypot(e.clientX - lastPt.x, e.clientY - lastPt.y);
      lastPt = { x: e.clientX, y: e.clientY };
      addEnergy(d / 3);
    }
    function onPointerUp() { lastPt = null; }
    stage.addEventListener("pointerdown", onPointerDown);
    stage.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    function setMode(m) {
      if (m === mode) return;
      mode = m;
      if (opts.onMode) opts.onMode(mode);
    }

    // ---------- p5 스케치 ----------
    const sketch = (p) => {
      let u = 1; // 412px 폭 기준 비율 (Figma 프레임 폭 412)

      p.setup = () => {
        const c = p.createCanvas(stage.clientWidth, stage.clientHeight);
        c.parent(stage);
        p.pixelDensity(Math.min(2, window.devicePixelRatio || 1));
        u = p.width / 412;
        // 서진이 사진: assets/seojin-wet.png (없으면 그림으로 대신 그려요)
        p.loadImage("assets/seojin-wet.png", (img) => { dogImg = img; }, () => { dogImg = null; });
      };

      p.windowResized = () => {
        p.resizeCanvas(stage.clientWidth, stage.clientHeight);
        u = p.width / 412;
      };

      // 서진이가 놓일 자리 (Figma: x37, y305, 317×497 / 412×917 프레임)
      function dogRect() {
        const ratio = dogImg ? dogImg.width / dogImg.height : 317 / 497;
        let h = p.height * 0.54;
        let w = h * ratio;
        if (w > p.width * 0.8) { w = p.width * 0.8; h = w / ratio; }
        return { x: p.width / 2 - w / 2 - 14 * u, y: p.height - h - p.height * 0.12, w, h };
      }

      function spawnBubble() {
        const d = dogRect();
        const onDog = Math.random() < 0.7; // 70%는 서진이 위에 → 점점 덮여요
        const big = Math.random() < 0.12;
        bubbles.push({
          x: onDog ? d.x + Math.random() * d.w : Math.random() * p.width,
          y: onDog ? d.y + Math.random() * d.h : p.height * (0.3 + Math.random() * 0.7),
          tr: (big ? 60 + Math.random() * 45 : 14 + Math.random() * 36) * u,
          vy: -(0.08 + Math.random() * 0.35) * u,
          wob: 0.6 + Math.random() * 1.4,
          ph: Math.random() * Math.PI * 2,
          pink: Math.random() < 0.35,
          born: p.millis(),
          life: 7000 + Math.random() * 9000,
        });
        // 너무 많으면 가장 오래된 거품부터 '퐁'
        while (bubbles.length > C.MAX_VISIBLE) popBubble(0);
      }

      function popBubble(i) {
        const b = bubbles[i];
        pops.push({ x: b.x, y: b.y, r: curR(b), t0: p.millis() });
        bubbles.splice(i, 1);
      }

      // 통! 하고 커지는 애니메이션 (살짝 넘쳤다가 돌아옴)
      function easeOutBack(t) {
        const c1 = 2.2, c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
      }
      function curR(b) {
        const age = p.millis() - b.born;
        const grow = easeOutBack(Math.min(1, age / 380));
        const breathe = 1 + 0.035 * Math.sin(age * 0.006 + b.ph);
        return Math.max(0, b.tr * grow * breathe);
      }

      function drawBubble(b) {
        const r = curR(b);
        if (r < 1) return;
        const ctx = p.drawingContext;
        const g = ctx.createRadialGradient(b.x - r * 0.12, b.y - r * 0.1, r * 0.05, b.x, b.y, r);
        g.addColorStop(0, hexA(C.COLORS.center, 0.85));
        g.addColorStop(1, hexA(b.pink ? C.COLORS.edgePink : C.COLORS.edgeBlue, 0.85));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
        ctx.fill();
        // 테두리
        ctx.lineWidth = Math.max(1.5, 3 * u);
        ctx.strokeStyle = C.COLORS.stroke;
        ctx.stroke();
        // 반짝이
        ctx.lineWidth = Math.max(1.5, r * 0.07);
        ctx.strokeStyle = "rgba(255,255,255,0.75)";
        ctx.beginPath();
        ctx.arc(b.x, b.y, r * 0.72, Math.PI * 1.15, Math.PI * 1.45);
        ctx.stroke();
      }

      function drawPop(pp) {
        const t = (p.millis() - pp.t0) / 320; // 0 → 1
        if (t >= 1) return false;
        const ctx = p.drawingContext;
        ctx.strokeStyle = hexA(C.COLORS.stroke, 1 - t);
        ctx.lineWidth = Math.max(1, 2.5 * u * (1 - t));
        ctx.beginPath();
        ctx.arc(pp.x, pp.y, pp.r * (1 + t * 0.35), 0, Math.PI * 2);
        ctx.stroke();
        // 물방울
        ctx.fillStyle = hexA(C.COLORS.center, 1 - t);
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + pp.r;
          const dist = pp.r * (1 + t * 0.9);
          ctx.beginPath();
          ctx.arc(pp.x + Math.cos(a) * dist, pp.y + Math.sin(a) * dist, 3 * u * (1 - t), 0, Math.PI * 2);
          ctx.fill();
        }
        return true;
      }

      // 사진이 없을 때 그리는 젖은 서진이
      function drawPlaceholderDog(d) {
        p.push();
        p.noStroke();
        const cx = d.x + d.w / 2;
        p.fill("#c8a27c");
        p.ellipse(cx, d.y + d.h * 0.66, d.w * 0.62, d.h * 0.62);           // 몸
        p.fill("#b98f68");
        p.ellipse(cx - d.w * 0.15, d.y + d.h * 0.95, d.w * 0.12, d.h * 0.1); // 발
        p.ellipse(cx + d.w * 0.15, d.y + d.h * 0.95, d.w * 0.12, d.h * 0.1);
        p.fill("#d4b08a");
        p.ellipse(cx, d.y + d.h * 0.28, d.w * 0.6, d.h * 0.36);             // 머리
        p.fill("#b98f68");
        p.ellipse(cx - d.w * 0.3, d.y + d.h * 0.3, d.w * 0.16, d.h * 0.28); // 귀
        p.ellipse(cx + d.w * 0.3, d.y + d.h * 0.3, d.w * 0.16, d.h * 0.28);
        p.fill("#2a1a12");
        p.circle(cx - d.w * 0.11, d.y + d.h * 0.26, d.w * 0.07);           // 눈
        p.circle(cx + d.w * 0.11, d.y + d.h * 0.26, d.w * 0.07);
        p.circle(cx, d.y + d.h * 0.34, d.w * 0.06);                          // 코
        // 젖은 털 가닥
        p.stroke("#a8805c");
        p.strokeWeight(2 * u);
        for (let i = 0; i < 9; i++) {
          const x = d.x + d.w * (0.25 + i * 0.06);
          p.line(x, d.y + d.h * 0.48, x + 2 * u, d.y + d.h * 0.58);
        }
        p.pop();
      }

      p.draw = () => {
        p.clear();
        p.background("#fff7e2");

        // 센서 신호가 안 들어오면 문지르기 모드로 전환 (게임 시작 1.5초 후 판단)
        if (running && p.millis() - startedAt > 1500) {
          if (Motion.isReceiving()) setMode("motion");
          else if (C.ALLOW_TOUCH_FALLBACK) setMode("touch");
        }

        // 쌓인 거품을 한 프레임에 최대 4개씩 생성 (부드럽게)
        for (let k = 0; k < 4 && spawnQueue > 0; k++, spawnQueue--) spawnBubble();

        const d = dogRect();
        if (dogImg) p.image(dogImg, d.x, d.y, d.w, d.h);
        else drawPlaceholderDog(d);

        // 거품 움직이기
        const now = p.millis();
        for (let i = bubbles.length - 1; i >= 0; i--) {
          const b = bubbles[i];
          b.y += b.vy;
          b.x += Math.sin((now - b.born) * 0.002 * b.wob + b.ph) * 0.35 * u;
          if (now - b.born > b.life) popBubble(i);
          else if (b.y < -b.tr) bubbles.splice(i, 1);
        }
        for (const b of bubbles) drawBubble(b);
        for (let i = pops.length - 1; i >= 0; i--) if (!drawPop(pops[i])) pops.splice(i, 1);
      };
    };

    const instance = new p5(sketch);

    // ---------- 바깥(app.js)에서 쓰는 기능 ----------
    return {
      start() {
        running = true;
        startedAt = instance.millis();
        Motion.setHandler(addEnergy);
        setMode(Motion.isReceiving() || !C.ALLOW_TOUCH_FALLBACK ? "motion" : mode);
      },
      stop() {
        running = false;
        Motion.setHandler(null);
      },
      score() { return score; },
      // 새로고침 후 이어 하기: 점수와 거품을 되살려요
      setScore(n) {
        score = n;
        spawnQueue = Math.min(n, C.MAX_VISIBLE);
      },
      destroy() {
        running = false;
        Motion.setHandler(null);
        stage.removeEventListener("pointerdown", onPointerDown);
        stage.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        instance.remove();
      },
    };
  },
};

// "#8fc5fb" + 0.5 → "rgba(143,197,251,0.5)"
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, a)})`;
}
