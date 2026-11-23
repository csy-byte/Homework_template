/* =========================================================
   games/jini.js — 미니게임: 날뛰는 지니 잡기 (p5.js + ml5 bodyPose)
   ---------------------------------------------------------
   1) 카메라 앞에서 팔을 쫙 벌리면 → '그물 준비' 상태 (두 손 사이에 노란 선)
   2) 지니 위에서 두 손을 모으면 → 손이 만난 자리에 지니가 있으면 포획 +1
   3) 잡을수록 지니가 빨라져요
   점수 = 잡은 횟수

   카메라가 없거나 거부되면 → 지니를 손가락으로 눌러서 잡기 (대체 조작)
   ========================================================= */

const JiniGame = {
  /**
   * @param {HTMLElement} stage  캔버스를 넣을 상자
   * @param {object} opts
   *   onScore(n)    점수가 바뀔 때마다
   *   onHint(text)  화면 위 안내 문구 ("" 이면 숨김)
   *   color         내 색 (손 표시)
   */
  create(stage, opts = {}) {
    const C = CONFIG.JINI;
    const myColor = opts.color || "#ffa269";
    let score = 0;
    let running = false;
    let mode = null;          // "camera" | "touch"
    let hint = null;
    let jiniImg = null;
    let catchAt = () => {};   // 아래 스케치 안에서 채워져요

    // 손 상태
    const hands = { l: null, r: null, seen: false, seenAt: 0 };
    let shoulderW = 0;        // 어깨너비 (화면 px) → 거리와 상관없이 '벌림/모음'을 판단하는 기준
    let armed = false;        // 팔을 벌린 상태인지
    let lastCloseAt = 0;

    // 지니
    const J = { x: 0, y: 0, vx: 1, vy: 0, face: 1, state: "run", stateAt: 0, nextTurn: 0, dashUntil: 0, pauseUntil: 0 };
    const fx = [];            // 잡았다! / 놓쳤다 효과

    function setHint(t) {
      if (t === hint) return;
      hint = t;
      if (opts.onHint) opts.onHint(t);
    }

    // ---------- 대체 조작: 지니 직접 누르기 ----------
    function onPointerDown(e) {
      if (!running || mode !== "touch") return;
      const r = stage.getBoundingClientRect();
      catchAt(e.clientX - r.left, e.clientY - r.top);
    }
    stage.addEventListener("pointerdown", onPointerDown);

    // ---------- p5 스케치 ----------
    const sketch = (p) => {
      let u = 1; // 412px 폭 기준 비율
      const R = () => C.SIZE * u; // 지니 반지름

      p.setup = () => {
        const c = p.createCanvas(stage.clientWidth, stage.clientHeight);
        c.parent(stage);
        p.pixelDensity(Math.min(2, window.devicePixelRatio || 1));
        u = p.width / 412;
        // 지니 사진: assets/jini.png (배경 투명 PNG 추천, 없으면 그림으로 대신)
        p.loadImage("assets/jini.png", (img) => { jiniImg = img; }, () => { jiniImg = null; });
        respawn(true);
      };

      p.windowResized = () => {
        p.resizeCanvas(stage.clientWidth, stage.clientHeight);
        u = p.width / 412;
      };

      // 지니가 돌아다닐 수 있는 범위 (위쪽은 제목/타이머 자리라 비워 둠)
      function bounds() {
        const r = R();
        return { x0: r * 1.2, x1: p.width - r * 1.2, y0: p.height * 0.34, y1: p.height * 0.84 - r };
      }

      // ---------- 지니 움직임 ----------
      function respawn(first) {
        const b = bounds();
        let x, y, tries = 0;
        // 방금 잡힌 자리에서 멀리 떨어진 곳에 다시 나타나기
        do {
          x = b.x0 + Math.random() * (b.x1 - b.x0);
          y = b.y0 + Math.random() * (b.y1 - b.y0);
          tries++;
        } while (!first && tries < 20 && Math.hypot(x - J.x, y - J.y) < p.width * 0.35);
        J.x = x; J.y = y;
        J.state = "run";
        J.stateAt = p.millis();
        fx.push({ type: "poof", x, y, t0: p.millis() });
        turn();
      }

      function speed() {
        return Math.min(C.MAX_SPEED, C.SPEED + score * C.SPEED_UP) * u;
      }

      // 방향 바꾸기: 가끔 멈칫(잡을 기회!), 가끔 우다다 돌진
      function turn() {
        const now = p.millis();
        const a = Math.random() * Math.PI * 2;
        const roll = Math.random();
        if (roll < C.PAUSE_CHANCE) J.pauseUntil = now + 350 + Math.random() * 400;
        else if (roll < C.PAUSE_CHANCE + C.DASH_CHANCE) J.dashUntil = now + 450;
        J.vx = Math.cos(a);
        J.vy = Math.sin(a) * 0.8;
        J.nextTurn = now + 600 + Math.random() * 1100;
      }

      function moveJini(dt) {
        const now = p.millis();
        if (J.state === "caught") {
          if (now - J.stateAt > 750) respawn(false);
          return;
        }
        if (now > J.nextTurn) turn();
        if (now < J.pauseUntil) return;
        const s = speed() * (now < J.dashUntil ? 2.1 : 1) * dt;
        J.x += J.vx * s;
        J.y += J.vy * s;
        // 벽에 닿으면 튕기기
        const b = bounds();
        if (J.x < b.x0) { J.x = b.x0; J.vx = Math.abs(J.vx); }
        if (J.x > b.x1) { J.x = b.x1; J.vx = -Math.abs(J.vx); }
        if (J.y < b.y0) { J.y = b.y0; J.vy = Math.abs(J.vy); }
        if (J.y > b.y1) { J.y = b.y1; J.vy = -Math.abs(J.vy); }
        if (Math.abs(J.vx) > 0.15) J.face = J.vx > 0 ? 1 : -1;
      }

      // 깡충깡충 높이 (멈칫할 땐 안 뜀)
      function hopY() {
        if (J.state !== "run" || p.millis() < J.pauseUntil) return 0;
        return -Math.abs(Math.sin(p.millis() * 0.013)) * R() * 0.35;
      }

      // ---------- 포획 판정 ----------
      catchAt = (x, y) => {
        if (!running) return;
        const now = p.millis();
        const d = Math.hypot(x - J.x, y - (J.y + hopY()));
        if (J.state === "run" && d < R() * C.CATCH_RADIUS) {
          J.state = "caught";
          J.stateAt = now;
          score++;
          if (opts.onScore) opts.onScore(score);
          fx.push({ type: "catch", x: J.x, y: J.y, t0: now });
          if (navigator.vibrate) navigator.vibrate(60);
        } else {
          fx.push({ type: "miss", x, y, t0: now });
        }
      };

      // ---------- 카메라 영상 → 캔버스 좌표 ----------
      // 영상을 화면에 꽉 차게(cover) + 거울처럼 좌우 반전해서 그려요
      function videoRect() {
        const v = Cam.video;
        const vw = v.videoWidth, vh = v.videoHeight;
        const s = Math.max(p.width / vw, p.height / vh);
        return { vw, vh, s, ox: (p.width - vw * s) / 2, oy: (p.height - vh * s) / 2 };
      }
      function toCanvas(k, vr) {
        return { x: vr.ox + (vr.vw - k.x) * vr.s, y: vr.oy + k.y * vr.s };
      }
      function drawVideo(vr) {
        const ctx = p.drawingContext;
        ctx.save();
        ctx.translate(p.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(Cam.video, vr.ox, vr.oy, vr.vw * vr.s, vr.vh * vr.s);
        ctx.restore();
        // 베이지 막을 살짝 씌워서 앱 색감 + 글자 잘 보이게
        ctx.fillStyle = "rgba(255,247,226,0.38)";
        ctx.fillRect(0, 0, p.width, p.height);
      }

      // ---------- 손 읽기 ----------
      const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
      const smooth = (prev, cur) => (prev ? { x: prev.x + (cur.x - prev.x) * 0.5, y: prev.y + (cur.y - prev.y) * 0.5 } : cur);

      function readHands(vr) {
        if (!Cam.poseFresh) { hands.seen = false; return; }
        const conf = C.MIN_CONFIDENCE;
        const ls = Cam.point("left_shoulder", conf), rs = Cam.point("right_shoulder", conf);
        if (ls && rs) {
          const sw = dist(ls, rs) * vr.s;
          if (sw > 5) shoulderW = shoulderW ? shoulderW * 0.85 + sw * 0.15 : sw;
        }
        const base = shoulderW || p.width * 0.3;
        const lw = Cam.point("left_wrist", conf), rw = Cam.point("right_wrist", conf);

        if (!lw || !rw) {
          hands.seen = false;
          // 팔을 크게 벌리면 손목이 화면 밖으로 나가기도 해요 → 팔꿈치가 멀리 벌어져 있으면 '벌림'으로 인정
          const le = Cam.point("left_elbow", conf), re = Cam.point("right_elbow", conf);
          if (le && re && dist(le, re) * vr.s > base * C.ELBOW_OPEN_RATIO) armed = true;
          return;
        }
        const a = toCanvas(lw, vr), b = toCanvas(rw, vr);
        hands.l = smooth(hands.l, a);
        hands.r = smooth(hands.r, b);
        hands.seen = true;
        hands.seenAt = p.millis();

        const d = dist(a, b); // 판정은 부드럽게 하기 전 값으로 (반응 빠르게)
        const now = p.millis();
        if (!armed && d > base * C.OPEN_RATIO) {
          armed = true;
        } else if (armed && d < base * C.CLOSE_RATIO && now - lastCloseAt > C.COOLDOWN_MS) {
          armed = false;
          lastCloseAt = now;
          catchAt((a.x + b.x) / 2, (a.y + b.y) / 2); // 두 손이 만난 자리
        }
      }

      function updateHint() {
        if (!running) return setHint("");
        if (mode === "touch") return setHint("카메라 없음 · 지니를 직접 눌러서 잡기");
        if (p.millis() - hands.seenAt > 900 && !armed) return setHint("손이 안 보여요 · 한 걸음 뒤로!");
        if (armed) return setHint("지금! 지니 위에서 두 손을 모아요 👏");
        setHint("팔을 쫙 벌려요");
      }

      // ---------- 그리기 ----------
      function drawHands() {
        if (!hands.seen) return;
        const ctx = p.drawingContext;
        const { l, r } = hands;
        if (armed) {
          // 그물: 두 손 사이 점선 + 가운데 조준점 (여기서 모으면 잡혀요)
          ctx.save();
          ctx.setLineDash([10 * u, 8 * u]);
          ctx.lineWidth = 4 * u;
          ctx.strokeStyle = C.COLORS.net;
          ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(r.x, r.y); ctx.stroke();
          ctx.restore();
          const mx = (l.x + r.x) / 2, my = (l.y + r.y) / 2;
          p.noFill(); p.stroke(C.COLORS.net); p.strokeWeight(3 * u);
          p.circle(mx, my, R() * 1.2);
          p.line(mx - R() * 0.3, my, mx + R() * 0.3, my);
          p.line(mx, my - R() * 0.3, mx, my + R() * 0.3);
        }
        for (const h of [l, r]) {
          p.stroke(255); p.strokeWeight(3 * u);
          p.fill(myColor);
          p.circle(h.x, h.y, 34 * u);
          p.noStroke(); p.fill(255, 220);
          p.circle(h.x, h.y + 3 * u, 12 * u);         // 발바닥 큰 볼록이
          for (let k = -1; k <= 1; k++) p.circle(h.x + k * 7 * u, h.y - 7 * u, 6 * u);
        }
      }

      // 사진이 없을 때 그리는 지니 (하얀 강아지)
      function drawPlaceholderJini(r, t, caught) {
        const legSwing = caught ? 0 : Math.sin(t * 0.03) * r * 0.18;
        p.noStroke();
        // 다리
        p.fill("#efe3d3");
        p.ellipse(-r * 0.5 + legSwing, r * 0.72, r * 0.32, r * 0.45);
        p.ellipse(r * 0.45 - legSwing, r * 0.72, r * 0.32, r * 0.45);
        // 꼬리 (살랑살랑)
        p.push();
        p.translate(-r * 0.9, -r * 0.05);
        p.rotate(Math.sin(t * 0.04) * 0.6 - 0.4);
        p.fill(C.COLORS.body); p.stroke(C.COLORS.line); p.strokeWeight(2 * u);
        p.ellipse(-r * 0.2, 0, r * 0.55, r * 0.3);
        p.pop();
        // 몸
        p.fill(C.COLORS.body); p.stroke(C.COLORS.line); p.strokeWeight(2.5 * u);
        p.ellipse(0, r * 0.2, r * 1.9, r * 1.3);
        // 머리
        p.circle(r * 0.62, -r * 0.42, r * 1.3);
        // 귀 (펄럭)
        p.noStroke(); p.fill(C.COLORS.ear);
        const flap = Math.sin(t * 0.025) * 0.25;
        p.push(); p.translate(r * 0.15, -r * 0.6); p.rotate(0.5 + flap); p.ellipse(0, r * 0.2, r * 0.38, r * 0.62); p.pop();
        p.push(); p.translate(r * 1.08, -r * 0.62); p.rotate(-0.4 - flap); p.ellipse(0, r * 0.2, r * 0.36, r * 0.58); p.pop();
        // 얼굴
        p.fill("#2a1a12");
        if (caught) {
          // 잡혀서 >_<
          p.stroke("#2a1a12"); p.strokeWeight(2.5 * u); p.noFill();
          p.line(r * 0.38, -r * 0.55, r * 0.5, -r * 0.47); p.line(r * 0.38, -r * 0.39, r * 0.5, -r * 0.47);
          p.line(r * 0.9, -r * 0.55, r * 0.78, -r * 0.47); p.line(r * 0.9, -r * 0.39, r * 0.78, -r * 0.47);
          p.noStroke(); p.fill("#2a1a12");
        } else {
          p.circle(r * 0.44, -r * 0.48, r * 0.15);
          p.circle(r * 0.84, -r * 0.48, r * 0.15);
        }
        p.circle(r * 0.66, -r * 0.28, r * 0.17); // 코
        if (!caught) { p.fill("#ff8a9a"); p.ellipse(r * 0.7, -r * 0.08, r * 0.16, r * 0.22); } // 혀
      }

      function drawJini() {
        const now = p.millis();
        const r = R();
        const caught = J.state === "caught";
        // 그림자
        p.noStroke(); p.fill(53, 5, 5, 35);
        p.ellipse(J.x, J.y + r * 0.95, r * 1.7, r * 0.35);

        p.push();
        p.translate(J.x, J.y + hopY());
        if (caught) {
          // 꾹 눌려서 찌그러졌다가 사라짐
          const k = Math.min(1, (now - J.stateAt) / 750);
          p.scale(1 + 0.3 * (1 - k), 0.7 * (1 - k * 0.7));
          p.rotate(Math.sin(now * 0.05) * 0.15);
        }
        p.scale(J.face, 1);
        if (jiniImg) {
          const h = r * 2.4, w = h * (jiniImg.width / jiniImg.height);
          p.imageMode(p.CENTER);
          p.image(jiniImg, 0, 0, w, h);
        } else {
          drawPlaceholderJini(r, now, caught);
        }
        p.pop();
      }

      function drawFx() {
        const now = p.millis();
        p.textAlign(p.CENTER, p.CENTER);
        p.textFont("Black Han Sans");
        for (let i = fx.length - 1; i >= 0; i--) {
          const f = fx[i];
          const t = (now - f.t0) / (f.type === "catch" ? 900 : 600);
          if (t >= 1) { fx.splice(i, 1); continue; }
          if (f.type === "catch") {
            p.noFill(); p.stroke(myColor); p.strokeWeight(5 * u * (1 - t));
            p.circle(f.x, f.y, R() * (2 + t * 2.5));
            // 별 튀기
            p.noStroke(); p.fill(255, 212, 98, 255 * (1 - t));
            for (let k = 0; k < 8; k++) {
              const a = (k / 8) * Math.PI * 2;
              p.circle(f.x + Math.cos(a) * R() * (1 + t * 1.6), f.y + Math.sin(a) * R() * (1 + t * 1.6), 9 * u * (1 - t));
            }
            p.fill(53, 5, 5, 255 * (1 - t));
            p.textSize(30 * u);
            p.text("잡았다! +1", f.x, f.y - R() * 1.6 - t * 30 * u);
          } else if (f.type === "miss") {
            p.noFill(); p.stroke(140, 120, 118, 200 * (1 - t)); p.strokeWeight(3 * u);
            p.circle(f.x, f.y, R() * (1 + t));
            p.noStroke(); p.fill(140, 120, 118, 255 * (1 - t));
            p.textSize(20 * u);
            p.text("놓쳤다", f.x, f.y - R() - t * 16 * u);
          } else if (f.type === "poof") {
            p.noStroke(); p.fill(255, 255, 251, 200 * (1 - t));
            for (let k = 0; k < 6; k++) {
              const a = (k / 6) * Math.PI * 2;
              p.circle(f.x + Math.cos(a) * R() * (0.6 + t), f.y + Math.sin(a) * R() * (0.6 + t), R() * 0.5 * (1 - t));
            }
          }
        }
      }

      p.draw = () => {
        const dt = Math.min(3, p.deltaTime / 16.67); // 60fps 기준 1
        const camOn = Cam.ready && Cam.video && Cam.video.videoWidth > 0;

        // 조작 방법 정하기 (카메라 → 안 되면 터치)
        if (camOn) {
          if (mode !== "camera") { mode = "camera"; Cam.startDetect(); }
        } else {
          mode = C.ALLOW_TOUCH_FALLBACK ? "touch" : "camera";
        }

        p.background("#fff7e2");
        let vr = null;
        if (camOn) { vr = videoRect(); drawVideo(vr); }
        if (running && camOn) readHands(vr);
        if (running) moveJini(dt);
        updateHint();

        drawJini();
        drawHands();
        drawFx();
      };
    };

    const instance = new p5(sketch);

    // ---------- 바깥(app.js)에서 쓰는 기능 ----------
    return {
      start() { running = true; armed = false; },
      stop() { running = false; setHint(""); },
      score() { return score; },
      setScore(n) { score = n; }, // 새로고침 후 이어 하기
      destroy() {
        running = false;
        stage.removeEventListener("pointerdown", onPointerDown);
        instance.remove();
      },
    };
  },
};
