/* =========================================================
   games/call.js — 미니게임: 지니 부르기 (p5.js + 마이크 음 높이)
   ---------------------------------------------------------
   "아 이 구 예 뻐 우 리 서 진 이" — 글자마다 막대가 하나씩 있어요.
   1) 막대 안 초록 칸 = 맞춰야 할 음, 노란 칸 = 그럭저럭 맞는 범위
   2) 소리를 내면 내 음 높이가 검은 선으로 보여요 → 선을 초록 칸에 맞추기
   3) 노란 칸 안에 0.5초 머물면 다음 글자로. 그동안 정확했을수록 점수↑ (글자당 최대 100점)
   4) 정확할수록 지니 꼬리가 빨리 흔들리고 더 활짝 웃어요
   점수 = 글자 점수의 합

   ※ 옥타브는 상관없어요. 높은 '솔'이든 낮은 '솔'이든 같은 '솔'로 쳐요.
   마이크가 없거나 거부되면 → 화면을 위아래로 문질러 음 높이를 대신 (대체 조작)
   ========================================================= */

const CallGame = {
  /**
   * @param {HTMLElement} stage  캔버스를 넣을 상자
   * @param {object} opts  onScore(n), onHint(text), color(내 색)
   */
  create(stage, opts = {}) {
    const C = CONFIG.CALL;
    const COL = C.COLORS;
    const myColor = opts.color || "#ffa269";
    const N = C.NOTES.length;
    // 막대가 보여 주는 음 범위: 멜로디 가운데를 기준으로 위아래 6반음씩 (= 한 옥타브)
    const MID = (Math.min(...C.NOTES) + Math.max(...C.NOTES)) / 2;
    const LOW = MID - 6, HIGH = MID + 6;

    let score = 0;
    let running = false;
    let mode = null;          // "mic" | "touch"
    let hint = null;

    // 게임 진행 상태
    let idx = 0;              // 지금 불러야 할 글자 번호 (0~9)
    let hold = 0;             // 이 글자에서 노란 칸 안에 머문 시간(초)
    let noteTime = 0;         // 이 글자를 시작한 뒤 지난 시간(초)
    let sumAcc = 0, voicedT = 0;   // 정확도 합, 소리 낸 시간 → 평균 정확도
    let sumDev = 0, inT = 0;       // 칸 안에 있을 때 평균 위치 (검은 선 남기기)
    let marks = new Array(N).fill(null); // 끝난 글자: { dev, miss }
    let live = null;          // 지금 내 음이 목표에서 몇 반음 떨어졌는지 (소리 없으면 null)
    let liveAcc = 0;
    let lastVoiceAt = 0;
    let touchMidi = null;     // 대체 조작용

    // 지니 기분 (0 = 시무룩, 1 = 신남)
    let mood = 0.15;
    let excite = 0;           // 글자를 맞췄을 때 잠깐 더 신남
    let wagPhase = 0;
    const pitchHist = [];     // 최근 음 높이 3개 (튀는 값 걸러내기)
    let lastReadAt = 0;
    const fx = [];

    function setHint(t) {
      if (t === hint) return;
      hint = t;
      if (opts.onHint) opts.onHint(t);
    }

    // 목표음과의 차이 (반음 단위, -6 ~ +6). 옥타브는 무시
    function devFrom(midi, target) {
      const d = midi - target;
      return ((((d + 6) % 12) + 12) % 12) - 6;
    }

    // 정확도 0~1 (초록 칸 안이면 1, 노란 칸 끝으로 갈수록 0)
    function accOf(dev) {
      const cents = Math.abs(dev) * 100;
      if (cents <= C.PERFECT_CENTS) return 1;
      return Math.max(0, 1 - (cents - C.PERFECT_CENTS) / (C.OK_CENTS - C.PERFECT_CENTS));
    }

    // ---------- 대체 조작: 화면 위아래 문지르기 ----------
    function onPointer(e) {
      if (mode !== "touch" || !running) return;
      if (e.type === "pointerup" || e.type === "pointercancel") { touchMidi = null; return; }
      if (e.type === "pointermove" && e.buttons === 0 && e.pointerType === "mouse") return;
      const r = stage.getBoundingClientRect();
      const t = (e.clientY - r.top) / r.height;          // 위 0 ~ 아래 1
      touchMidi = HIGH + 1 - t * 14;                      // 화면 위쪽 = 높은 음
    }
    ["pointerdown", "pointermove", "pointerup", "pointercancel"].forEach((ev) => stage.addEventListener(ev, onPointer));

    // ---------- p5 스케치 ----------
    const sketch = (p) => {
      let u = 1;                 // 412px 폭 기준 비율
      let L = {};                // 화면 배치 (막대 위치, 지니 위치)

      p.setup = () => {
        const c = p.createCanvas(stage.clientWidth, stage.clientHeight);
        c.parent(stage);
        p.pixelDensity(Math.min(2, window.devicePixelRatio || 1));
        layout();
      };
      p.windowResized = () => {
        p.resizeCanvas(stage.clientWidth, stage.clientHeight);
        layout();
      };

      // 위쪽 제목/타이머(HTML) 바로 아래부터 막대, 그 아래 남는 자리에 지니
      function layout() {
        // 폰(412×917) 기준 비율. 가로·세로 중 더 빡빡한 쪽에 맞춰요
        // (가로만 보면 노트북처럼 넓은 화면에서 막대가 엄청 커져서 지니가 잘려요)
        u = Math.min(p.width / 412, p.height / 860);
        // 점수 배지 아래 + 안내 문구 한 줄 자리(34px)를 비워 둬요
        const sc = document.querySelector("#hud-scores");
        const top = sc ? sc.getBoundingClientRect().bottom - stage.getBoundingClientRect().top : 200;
        const barTop = Math.max(top + 44 * u, 110 * u);
        const barH = 86 * u;
        const labelY = barTop + barH + 20 * u;
        const dogTop = labelY + 26 * u, dogBot = p.height - 16 * u;
        // 지니 그림은 Figma 좌표(x 10~375, y 389~700) 그대로 그리고 크기만 맞춰요
        const s = Math.max(0.4, Math.min(u * 1.05, (dogBot - dogTop) / 320, (p.width * 0.92) / 400));
        L = {
          barTop, barH, labelY,
          semi: barH / 12,
          s,
          tx: (p.width - 390 * s) / 2 - 10 * s,
          ty: dogTop + Math.max(0, (dogBot - dogTop - 311 * s) / 2) - 389 * s,
        };
      }

      const barX = (i) => p.width / 2 + (i - (N - 1) / 2) * 26 * u;
      const yOf = (midi) => L.barTop + L.barH - (midi - LOW) * L.semi;

      // ---------- 소리 듣기 ----------
      function hearPitch() {
        if (mode === "touch") return touchMidi;
        const now = p.millis();
        if (now - lastReadAt < 30) return pitchHist.length ? median() : null; // 0.03초마다 한 번만 계산
        lastReadAt = now;
        const { freq } = Mic.read();
        if (!freq) { pitchHist.length = 0; return null; }
        pitchHist.push(69 + 12 * Math.log2(freq / 440)); // Hz → MIDI 번호
        if (pitchHist.length > 3) pitchHist.shift();
        return median();
      }
      function median() {
        const a = [...pitchHist].sort((x, y) => x - y);
        return a[Math.floor(a.length / 2)];
      }

      // ---------- 한 글자 끝 ----------
      function finishNote(missed) {
        const avg = voicedT > 0 ? sumAcc / voicedT : 0;
        const pts = missed ? 0 : Math.round(10 + 90 * avg);
        marks[idx] = { dev: inT > 0 ? sumDev / inT : null, miss: missed };
        if (pts) {
          score += pts;
          if (opts.onScore) opts.onScore(score);
        }
        const word = missed ? "놓쳤다" : avg >= 0.85 ? "완벽!" : avg >= 0.6 ? "좋아요" : "아슬아슬";
        fx.push({ type: "pts", i: idx, text: missed ? word : `+${pts} ${word}`, good: !missed && avg >= 0.85, t0: p.millis() });
        if (!missed) {
          excite = Math.min(1, excite + 0.35 + 0.4 * avg);
          for (let k = 0; k < (avg >= 0.85 ? 3 : 1); k++) fx.push({ type: "heart", x: 130 + (Math.random() - 0.5) * 120, y: 400, t0: p.millis() + k * 120 });
        }
        idx++;
        hold = noteTime = sumAcc = voicedT = sumDev = inT = 0;
        if (idx >= N) {              // 한 소절 끝 → 지니가 신나서 하트 펑펑, 처음부터 다시
          fx.push({ type: "phrase", t0: p.millis() });
          for (let k = 0; k < 6; k++) fx.push({ type: "heart", x: 60 + k * 45, y: 420, t0: p.millis() + k * 90 });
          idx = 0;
          marks = new Array(N).fill(null);
        }
      }

      function update(dt) {
        const midi = hearPitch();
        const target = C.NOTES[idx];
        if (midi != null) {
          lastVoiceAt = p.millis();
          live = devFrom(midi, target);
          liveAcc = accOf(live);
        } else {
          live = null;
          liveAcc = 0;
        }
        if (!running) return;

        noteTime += dt;
        // 글자가 바뀐 직후 0.2초는 음을 옮겨 가는 시간이라 점수에서 빼 줘요
        if (live != null && noteTime > 0.2) {
          sumAcc += liveAcc * dt;
          voicedT += dt;
        }
        if (live != null) {
          if (Math.abs(live) * 100 <= C.OK_CENTS) {   // 노란 칸 안
            hold += dt;
            sumDev += live * dt;
            inT += dt;
          }
        }
        if (hold >= C.HOLD_SEC) finishNote(false);
        else if (noteTime >= C.NOTE_TIMEOUT_SEC) finishNote(true);

        // 안내 문구
        if (mode === "touch") setHint("마이크 없음 · 화면을 위아래로 문질러 음 높이 맞추기");
        else if (p.millis() - lastVoiceAt > 2000) setHint("소리가 안 들려요 · \"아~\" 하고 길게 불러 보세요");
        else setHint("");
      }

      // ---------- 지니 기분 → 꼬리 · 표정 ----------
      function updateMood(dt) {
        const silent = p.millis() - lastVoiceAt > 600;
        const target = running ? (silent ? 0.1 : 0.15 + 0.85 * liveAcc) : 0.3;
        mood += (target - mood) * Math.min(1, dt * 2.5);
        excite = Math.max(0, excite - dt * 0.8);
        const joy = Math.min(1, mood + excite * 0.6);
        const freq = 0.7 + 7.5 * joy;                 // 1초에 몇 번 흔드는지
        wagPhase += dt * Math.PI * 2 * freq;
        return joy;
      }

      // ---------- 그리기: 막대 ----------
      function drawBars() {
        p.rectMode(p.CORNER);
        for (let i = 0; i < N; i++) {
          const x = barX(i), w = 12 * u, x0 = x - w / 2;
          const cur = running && i === idx;
          const ty = yOf(C.NOTES[i]);
          // 막대
          p.noStroke(); p.fill(COL.bar);
          p.rect(x0, L.barTop, w, L.barH, 6 * u);
          // 노란 칸 / 초록 칸 (막대 밖으로는 안 나가게)
          const okH = (C.OK_CENTS / 100) * 2 * L.semi, pfH = (C.PERFECT_CENTS / 100) * 2 * L.semi;
          const clipRect = (y, h, col) => {
            const a = Math.max(L.barTop, y), b = Math.min(L.barTop + L.barH, y + h);
            if (b > a) { p.fill(col); p.rect(x0, a, w, b - a); }
          };
          clipRect(ty - okH / 2, okH, COL.ok);
          clipRect(ty - pfH / 2, pfH, COL.perfect);
          // 지금 글자: 내 색 테두리 + 머문 시간 게이지
          if (cur) {
            p.noFill(); p.stroke(myColor); p.strokeWeight(2.5 * u);
            p.rect(x0 - 2 * u, L.barTop - 2 * u, w + 4 * u, L.barH + 4 * u, 8 * u);
            p.noStroke(); p.fill(myColor);
            p.rect(x0, L.labelY + 14 * u, w * Math.min(1, hold / C.HOLD_SEC), 3 * u, 2 * u);
          }
          // 검은 선: 끝난 글자는 내가 부른 자리, 지금 글자는 실시간
          const m = marks[i];
          let dev = null, thick = 1.5 * u;
          if (m && m.dev != null) dev = m.dev;
          if (cur && live != null) { dev = live; thick = 3 * u; }
          if (dev != null) {
            const y = p.constrain(yOf(C.NOTES[i] + dev), L.barTop + 1, L.barTop + L.barH - 1);
            p.fill(COL.line);
            p.rect(x0 - (cur ? 3 * u : 0), y - thick / 2, w + (cur ? 6 * u : 0), thick, thick / 2);
          }
          // 글자
          p.textAlign(p.CENTER, p.CENTER);
          p.textSize(18 * u);
          p.textStyle(cur ? p.BOLD : p.NORMAL);
          p.fill(cur ? myColor : m && m.miss ? "#c9b8b0" : "#1a1a1a");
          p.text(C.LYRICS[i], x, L.labelY);
        }
        p.textStyle(p.NORMAL);
      }

      // ---------- 그리기: 지니 (Figma 좌표 그대로) ----------
      function plume(len, wid, lean) {
        p.beginShape();
        p.vertex(-wid * 0.35, 0);
        p.bezierVertex(-wid * 0.6, -len * 0.45, -wid * 0.25 + lean * 0.4, -len * 0.9, lean, -len);
        p.bezierVertex(lean + wid * 0.35, -len * 0.75, wid * 0.75, -len * 0.4, wid * 0.45, 0);
        p.bezierVertex(wid * 0.2, wid * 0.18, -wid * 0.1, wid * 0.18, -wid * 0.35, 0);
        p.endShape(p.CLOSE);
      }

      function drawDog(joy) {
        p.push();
        p.translate(L.tx, L.ty);
        p.scale(L.s);
        p.noStroke();
        const bob = -Math.abs(Math.sin(wagPhase * 0.5)) * 7 * Math.max(0, joy - 0.4);
        p.translate(0, bob);

        // 꼬리 (몸 뒤) — 세 겹이 살짝 늦게 따라와서 복슬복슬
        const amp = p.radians(7 + 20 * joy);
        for (let k = 0; k < 3; k++) {
          p.push();
          p.translate(298, 562);
          p.rotate(p.radians(28 - k * 9) + Math.sin(wagPhase - k * 0.45) * amp);
          p.fill(COL.tail[k]);
          plume(128 - k * 8, 72 - k * 6, 26 - k * 6);
          p.pop();
        }

        // 몸 + 다리
        p.fill(255);
        p.rectMode(p.CORNER);
        p.rect(92, 530, 220, 128, 60);
        p.rect(82, 585, 48, 112, 24);   // 앞다리
        p.rect(168, 610, 38, 88, 19);   // 앞다리 2
        p.rect(266, 605, 36, 83, 18);   // 뒷다리

        // 귀 (왼쪽은 머리 뒤)
        p.fill(COL.ear);
        p.push(); p.translate(62, 428); p.rotate(-0.4 - 0.08 * joy); p.ellipse(0, 0, 94, 70); p.pop();
        // 머리
        p.fill(255);
        p.ellipse(130, 478, 156, 156);
        // 오른쪽 귀 + 눈 무늬
        p.fill(COL.ear);
        p.push(); p.translate(208, 440); p.rotate(0.3 + 0.08 * joy); p.ellipse(0, 0, 84, 72); p.pop();
        p.push(); p.translate(166, 462); p.rotate(-0.5); p.ellipse(0, 0, 90, 60); p.pop();

        // 볼 터치 (신날수록 진하게)
        p.fill(255, 140, 140, 150 * joy);
        p.ellipse(72, 490, 26, 14);
        p.ellipse(170, 494, 24, 13);

        // 눈: 신나면 ^ ^
        p.fill(17);
        if (joy > 0.72) {
          p.noFill(); p.stroke(17); p.strokeWeight(4.5); p.strokeCap(p.ROUND);
          p.arc(87, 460, 20, 18, p.PI, p.TWO_PI);
          p.arc(144, 463, 20, 18, p.PI, p.TWO_PI);
          p.noStroke();
        } else {
          const blink = (p.millis() % 3200) < 120 ? 0.15 : 1;
          p.ellipse(87, 455, 19, 19 * blink);
          p.ellipse(144, 458, 19, 19 * blink);
        }

        // 혀 (웃을수록 길게, 꼬리 박자에 맞춰 살랑)
        const tl = 40 + 38 * joy;
        const sway = Math.sin(wagPhase * 0.5) * 4 * joy;
        p.fill(COL.tongue);
        p.beginShape();
        p.vertex(97, 506);
        p.bezierVertex(95, 506 + tl * 0.7, 106 + sway, 506 + tl, 119 + sway, 506 + tl);
        p.bezierVertex(132 + sway, 506 + tl, 143, 506 + tl * 0.7, 141, 506);
        p.endShape(p.CLOSE);
        p.stroke(230, 100, 100); p.strokeWeight(2.5);
        p.line(119, 512, 119 + sway * 0.6, 506 + tl * 0.55);

        // 입: 신날수록 넓게 웃는 'w'
        const mw = 14 + 16 * joy, lift = 4 + 8 * joy;
        p.noFill(); p.stroke(17); p.strokeWeight(3.5); p.strokeCap(p.ROUND);
        p.bezier(117, 500, 117, 508 + lift * 0.3, 117 - mw * 0.6, 508 + lift * 0.3, 117 - mw, 502 - lift * 0.4);
        p.bezier(117, 500, 117, 508 + lift * 0.3, 117 + mw * 0.6, 508 + lift * 0.3, 117 + mw, 502 - lift * 0.4);
        p.noStroke();

        // 코
        p.fill(17);
        p.ellipse(117, 492, 26, 24);
        p.fill(255, 255, 255, 170);
        p.ellipse(111, 487, 7, 5);

        // 아무 소리도 없으면 갸웃 "?"
        if (running && p.millis() - lastVoiceAt > 1500) {
          p.fill(53, 5, 5, 200);
          p.textAlign(p.CENTER, p.CENTER);
          p.textSize(44);
          p.text("?", 232, 388 + Math.sin(p.millis() * 0.004) * 5);
        }
        p.pop();
      }

      // ---------- 효과 (점수 글자, 하트) ----------
      function drawFx() {
        const now = p.millis();
        for (let k = fx.length - 1; k >= 0; k--) {
          const f = fx[k];
          const age = now - f.t0;
          if (age < 0) continue;
          const t = age / 900;
          if (t >= 1) { fx.splice(k, 1); continue; }
          p.noStroke();
          p.textAlign(p.CENTER, p.CENTER);
          if (f.type === "pts") {
            p.fill(f.good ? "#2fa84f" : "#350505");
            p.drawingContext.globalAlpha = 1 - t;
            p.textSize(15 * u);
            p.textStyle(p.BOLD);
            p.text(f.text, p.constrain(barX(f.i), 40 * u, p.width - 40 * u), L.barTop - 10 * u - t * 18 * u);
            p.textStyle(p.NORMAL);
            p.drawingContext.globalAlpha = 1;
          } else if (f.type === "heart") {
            const x = L.tx + (f.x + Math.sin(t * 6 + f.x) * 12) * L.s;
            const y = L.ty + (f.y - t * 110) * L.s;
            p.drawingContext.globalAlpha = 1 - t;
            p.fill("#ff7a8a");
            p.textSize(26 * L.s);
            p.text("♥", x, y);
            p.drawingContext.globalAlpha = 1;
          } else if (f.type === "phrase") {
            p.drawingContext.globalAlpha = 1 - t * t;
            p.fill(myColor);
            p.textSize(26 * u);
            p.textStyle(p.BOLD);
            p.text("지니가 달려와요!", p.width / 2, L.labelY + 40 * u - t * 20 * u);
            p.textStyle(p.NORMAL);
            p.drawingContext.globalAlpha = 1;
          }
        }
      }

      p.draw = () => {
        const dt = Math.min(0.05, p.deltaTime / 1000);   // 초 단위
        // 조작 방법 정하기 (마이크 → 안 되면 터치)
        mode = Mic.ready ? "mic" : C.ALLOW_TOUCH_FALLBACK ? "touch" : "mic";
        if (p.frameCount % 15 === 1) layout(); // 위쪽 점수 배지 크기가 바뀔 수 있어서 가끔 다시 배치
        p.background("#fff7e2");
        update(dt);
        const joy = updateMood(dt);
        drawBars();
        drawDog(joy);
        drawFx();
      };
    };

    const instance = new p5(sketch);

    // ---------- 바깥(app.js)에서 쓰는 기능 ----------
    return {
      start() { running = true; },
      stop() { running = false; setHint(""); },
      score() { return score; },
      setScore(n) { score = n; }, // 새로고침 후 이어 하기
      destroy() {
        running = false;
        ["pointerdown", "pointermove", "pointerup", "pointercancel"].forEach((ev) => stage.removeEventListener(ev, onPointer));
        instance.remove();
      },
    };
  },
};
