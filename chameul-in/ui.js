// ============================================================
// 참을 인(忍) — ui.js
// ------------------------------------------------------------
//   [A] 따라 쓰기 판 .... 忍을 마우스로 따라 쓰는 작은 p5 캔버스
//   [B] HTML 창 ......... 세 단계 글쓰기, 기록 보기, 확인 창
// ============================================================

// ############################################################
// [A] 따라 쓰기 판
// ############################################################
// ============================================================
// 忍 따라 쓰기 판 (두 번째 p5 캔버스)
// ------------------------------------------------------------
// 메인 화면([2] 메인)과는 별개로, 글쓰기 창 안에 들어가는 작은 p5 캔버스.
// 여러 개의 p5 캔버스를 쓰려면 "인스턴스 모드"를 쓴다:
//    new p5(function (p) { p.setup = ...; p.draw = ...; }, 붙일곳)
//  → 이 안에서는 createCanvas 대신 p.createCanvas처럼 앞에 p.를 붙인다.
//
// [따라 쓰기 판정 원리]
//   - 안 보이는 그림판(guide)에 忍을 크게 써 두고, 5px 간격으로 점을 찍어
//     "글자 위에 있는 점"들을 모아 둔다.
//   - 사용자가 먹으로 칠한 그림판(ink)에서 그 점들이 얼마나 칠해졌는지 센다.
//   - 글자를 60% 이상 덮고, 칠한 먹의 20% 넘게 글자 밖에 있지 않으면 통과.
// ============================================================

const PAD = 320;            // 판 크기(px)
const PASS_COVER = 0.6;     // 글자를 덮어야 하는 비율
const MAX_SPILL = 0.2;      // 칠한 먹 중에서 글자 밖에 묻은 비율의 한계

// ---------- 먹 브러시 설정 (이전에 만든 cham-eul-in-2의 brush.js에서 가져옴) ----------
const INK_RGB = [24, 20, 26];   // 먹색 (순수 검정보다 살짝 푸른 기)
const BRUSH = {
  maxWidth: 0.12,    // 가장 굵을 때 (판 크기 대비 비율)
  minWidth: 0.04,    // 가장 가늘 때
  speedForThin: 45,  // 이 속도(px/프레임)에 가까울수록 가늘어짐
  smoothing: 0.18,   // 굵기 변화의 부드러움 (작을수록 천천히 변함)
  bristles: 42,      // 붓모 개수 (많을수록 매끈, 적을수록 거칠고 갈라짐)
  bristleAlpha: 70,  // 붓모 하나의 진하기
  inkDecay: 0.0011,  // 이동 거리당 먹이 줄어드는 양 (클수록 금방 마름 → 비백)
  minInk: 0.3,       // 먹이 가장 적을 때
  bleedAlpha: 22,    // 가장자리 번짐 진하기
  bleedBlur: 1.2,    // 번짐 흐림 정도
  poolSpeed: 1.6     // 이 속도보다 느리면 붓이 '머문다'고 판단 → 먹이 고여 번짐
};

// =====================================================================
//  InkBrush — 먹 브러시
//  원리: 선(line)을 긋는 대신, 붓모 수십 가닥을 한 다발로 '도장 찍듯' 촘촘히 찍는다.
//   · 붓모 다발      → 가장자리가 고르지 않은 붓 자국
//   · 속도 → 굵기    → 천천히 누르면 굵고, 빨리 그으면 가늘게
//   · 먹 잔량        → 획이 길어질수록 먹이 줄어 연해지고 갈라짐(비백)
//   · 번짐 레이어    → 획 둘레에 옅은 먹을 따로 쌓아 흐리게 겹침 (한지에 스며든 느낌)
//   · 머무름 번짐    → 한 자리에 오래 머물면 먹이 고여 동그랗게 퍼져나감
//  그림은 두 장의 투명 레이어에 쌓인다.
//   layers.ink   : 진한 붓 자국 (따라 쓰기 판정에도 이 레이어를 쓴다)
//   layers.bleed : 옅은 번짐 (화면에 그릴 때 blur를 걸어서 흐리게)
//  ※ random, noise 같은 함수는 메인 스케치(전역 모드)의 것을 그대로 쓴다.
// =====================================================================
class InkBrush {
  constructor(size) {
    this.size = size;
    this.blobs = [];       // 퍼져나가는 번짐 목록
    this.makeBristles();
  }

  // 붓모 만들기: 가운데에 많이, 가장자리에 적게 흩뿌림
  makeBristles() {
    this.bristles = [];
    for (let i = 0; i < BRUSH.bristles; i++) {
      const a = random(TWO_PI);
      let r = abs(randomGaussian(0, 0.45));
      while (r > 1) r = abs(randomGaussian(0, 0.45));
      this.bristles.push({
        ox: cos(a) * r,
        oy: sin(a) * r * 0.72,      // 붓끝이 살짝 납작한 타원
        size: random(0.14, 0.28),   // 붓모 한 가닥의 굵기 (붓 폭 대비)
        load: random(0.55, 1),      // 이 붓모가 머금은 먹 양
        seed: random(1000)
      });
    }
  }

  // 새 획 시작
  begin(layers, x, y) {
    this.layers = layers;
    this.x = x;
    this.y = y;
    this.ink = 1;      // 먹을 새로 찍음
    this.len = 0;      // 지금까지 그은 길이
    this.pool = 0;
    this.w = this.size * BRUSH.maxWidth * 0.6;
    this.speed = 0;
    this.addBlob(x, y, this.w * 0.9, 1);   // 붓을 처음 대는 순간 먹이 살짝 퍼짐
    this.stamp(x, y);
  }

  // 붓을 (x, y)까지 움직임. 그 사이를 촘촘히 찍어 메운다.
  moveTo(x, y) {
    const d = dist(this.x, this.y, x, y);
    if (d < 0.3) { this.idle(); return; }
    // 속도 → 목표 굵기
    this.speed = lerp(this.speed, d, 0.5);
    const startRamp = min(1, 0.55 + this.len / (this.size * 0.05));
    const target = map(this.speed, 0, BRUSH.speedForThin, BRUSH.maxWidth, BRUSH.minWidth, true)
      * this.size * startRamp * lerp(0.75, 1, this.ink);
    this.w = lerp(this.w, target, BRUSH.smoothing);

    // 먹이 고이는지 (느리게 움직이면)
    if (this.speed < BRUSH.poolSpeed) this.pool += 1;
    else this.pool *= 0.85;

    const steps = max(1, ceil(d / (this.w * 0.05 + 0.6)));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      this.stamp(lerp(this.x, x, t), lerp(this.y, y, t));
    }
    this.len += d;
    this.ink = max(BRUSH.minInk, this.ink - d * BRUSH.inkDecay);
    this.x = x;
    this.y = y;
    if (this.pool > 10 && frameCount % 5 === 0) this.addBlob(x, y, this.w, 0.8);
  }

  // 마우스를 누른 채 가만히 있을 때: 먹이 고여 번짐
  idle() {
    this.pool += 1;
    this.speed *= 0.8;
    if (this.pool > 14 && frameCount % 10 === 0 && this.pool < 90) {
      this.addBlob(this.x, this.y, this.w * (1 + this.pool / 120), 0.7);
    }
  }

  // 한 지점에 붓 다발을 찍음 (붓 자국의 최소 단위)
  stamp(x, y) {
    const [r, g, b] = INK_RGB;
    const ink = this.layers.ink;
    const w = this.w;
    ink.noStroke();

    // 가운데 심: 먹이 가장 진한 부분
    ink.fill(r, g, b, 30 * this.ink);
    ink.ellipse(x, y, w * 0.62, w * 0.5);

    // 붓모가 마르는 정도: 먹이 적고 빠를수록 많이 갈라짐
    const dryness = constrain((1 - this.ink) * 1.3 + (this.speed / BRUSH.speedForThin) * 0.45 - 0.3, 0, 0.8);
    const cosA = cos(-0.6), sinA = sin(-0.6);   // 붓을 비스듬히 쥔 각도

    for (const br of this.bristles) {
      // 붓모마다 '마른 구간'이 길게 이어지도록 노이즈 사용 → 줄무늬 비백
      if (noise(br.seed, this.len * 0.015) < dryness * (1.25 - br.load)) continue;
      const jx = (noise(br.seed, this.len * 0.05) - 0.5) * w * 0.12;
      const ox = (br.ox * cosA - br.oy * sinA) * w * 0.5 + jx;
      const oy = (br.ox * sinA + br.oy * cosA) * w * 0.5;
      ink.fill(r, g, b, BRUSH.bristleAlpha * this.ink * br.load);
      ink.circle(x + ox, y + oy, w * br.size);
    }

    // 둘레 번짐: 먹이 한지 섬유를 타고 번진 작은 자국들 (보풀 같은 불규칙한 테두리)
    const bl = this.layers.bleed;
    bl.noStroke();
    const wet = this.ink * (1 + min(this.pool, 40) / 40);   // 먹이 많고 오래 머물수록 많이 번짐
    for (let k = 0; k < 3; k++) {
      if (random() > 0.55 * wet) continue;
      const a = random(TWO_PI);
      const d = w * (0.38 + pow(random(), 2) * 0.3 * wet);
      bl.fill(r, g, b, BRUSH.bleedAlpha * this.ink * random(0.4, 1));
      bl.circle(x + cos(a) * d, y + sin(a) * d * 0.85, w * random(0.06, 0.18));
    }
    // 아주 옅고 넓은 물기
    if (random() < 0.25) {
      bl.fill(r, g, b, BRUSH.bleedAlpha * 0.18 * this.ink);
      bl.circle(x, y, w * random(1.0, 1.2));
    }
  }

  // 퍼져나가는 번짐 하나 추가
  addBlob(x, y, w, strength) {
    if (this.blobs.length > 40) return;
    this.blobs.push({
      x, y,
      r: w * 0.35,
      max: w * random(0.6, 0.85) * (1 + min(this.pool, 80) / 200),
      a: 5 * strength * this.ink,
      seed: random(1000)
    });
  }

  // 매 프레임 호출: 번짐이 천천히 퍼짐
  update() {
    if (!this.layers) return;
    const [r, g, b] = INK_RGB;
    const L = this.layers.bleed;
    for (const bl of this.blobs) {
      bl.r += (bl.max - bl.r) * 0.05;
      L.noStroke();
      L.fill(r, g, b, bl.a * 0.25);
      L.beginShape();
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * TWO_PI;
        // 가장자리를 노이즈로 일그러뜨려 한지 섬유를 따라 번진 듯하게
        const rr = bl.r * (0.8 + noise(bl.seed + cos(a) * 1.5, bl.seed + sin(a) * 1.5, bl.r * 0.02) * 0.45);
        L.vertex(bl.x + cos(a) * rr, bl.y + sin(a) * rr);
      }
      L.endShape(CLOSE);
    }
    this.blobs = this.blobs.filter(bl => bl.r < bl.max * 0.96);
  }
}

const TracePad = {
  inst: null,
  holder: null,
  guidePts: [],     // 글자 위의 점
  outsidePts: [],   // 글자에서 멀리 떨어진 점
  allPts: [],       // 판 전체의 점
  ink: null,        // 진한 붓 자국 레이어
  bleed: null,      // 번짐 레이어
  brush: null,
  drawing: false,
  onUpdate: null,   // 판정 결과를 [B] HTML 창에 알려 주는 함수

  // 처음 한 번만 만든다
  init() {
    this.holder = document.createElement('div');
    this.holder.id = 'trace-holder';
    const pad = this;

    this.inst = new p5(function (p) {
      p.setup = function () {
        const cnv = p.createCanvas(PAD, PAD);
        pad.ink = p.createGraphics(PAD, PAD);
        pad.ink.pixelDensity(1);
        pad.bleed = p.createGraphics(PAD, PAD);
        pad.bleed.pixelDensity(1);
        pad.brush = new InkBrush(PAD);
        cnv.mousePressed(() => {
          pad.drawing = true;
          pad.brush.begin({ ink: pad.ink, bleed: pad.bleed }, p.mouseX, p.mouseY);
        });
        p.noLoop();
      };

      p.draw = function () {
        p.background('#f6efdf');
        drawPracticeGrid(p);

        // 흐릿한 안내 글자
        p.noStroke();
        p.fill(0, 0, 0, 38);
        p.textFont(HANJA_FONT);
        p.textStyle(p.BOLD);
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(250);
        p.text('忍', PAD / 2, PAD / 2 + 12);

        // 붓질
        if (pad.drawing && p.mouseIsPressed) pad.brush.moveTo(p.mouseX, p.mouseY);
        pad.brush.update();

        // 번짐 레이어는 흐리게, 그 위에 진한 먹
        const ctx = p.drawingContext;
        ctx.save();
        ctx.filter = `blur(${BRUSH.bleedBlur * p.pixelDensity()}px)`;
        ctx.drawImage(pad.bleed.elt, 0, 0, PAD, PAD);
        ctx.restore();
        p.image(pad.ink, 0, 0);
      };

      p.mouseReleased = function () {
        if (pad.drawing) {
          pad.drawing = false;
          pad.evaluate();
        }
      };
    }, this.holder);
  },

  // 판을 화면(글쓰기 창)에 붙이고 새로 시작
  async attach(container, onUpdate) {
    this.onUpdate = onUpdate;
    container.appendChild(this.holder);
    // 忍 글꼴이 다 불러와진 뒤에 판정용 점을 만든다
    try { await document.fonts.load(`700 250px "${HANJA_FONT}"`, '忍'); } catch (e) {}
    this.buildGuide();
    this.clear();
    this.inst.loop();
  },

  detach() {
    if (this.inst) this.inst.noLoop();
    if (this.holder.parentNode) this.holder.parentNode.removeChild(this.holder);
  },

  clear() {
    if (this.ink) this.ink.clear();
    if (this.bleed) this.bleed.clear();
    if (this.brush) this.brush.blobs = [];
    this.evaluate();
  },

  buildGuide() {
    const p = this.inst;
    const make = (strokeW) => {
      const g = p.createGraphics(PAD, PAD);
      g.pixelDensity(1);
      g.textFont(HANJA_FONT);
      g.textStyle(p.BOLD);
      g.textAlign(p.CENTER, p.CENTER);
      g.textSize(250);
      g.fill(0);
      if (strokeW) { g.stroke(0); g.strokeWeight(strokeW); } else g.noStroke();
      g.text('忍', PAD / 2, PAD / 2 + 12);
      g.loadPixels();
      return g;
    };
    const exact = make(0);    // 글자 그대로
    const wide = make(18);    // 글자 주변을 조금 넓힌 것 (살짝 벗어나는 건 봐주기)
    this.guidePts = [];
    this.outsidePts = [];
    this.allPts = [];
    for (let y = 2; y < PAD; y += 5) {
      for (let x = 2; x < PAD; x += 5) {
        const i = 4 * (y * PAD + x);
        this.allPts.push(i);
        if (exact.pixels[i + 3] > 128) this.guidePts.push(i);
        else if (wide.pixels[i + 3] < 20) this.outsidePts.push(i);
      }
    }
    exact.remove();
    wide.remove();
  },

  // 얼마나 잘 따라 썼는지 계산해서 알려 준다
  evaluate() {
    if (!this.ink || this.guidePts.length === 0) {
      if (this.onUpdate) this.onUpdate({ cover: 0, spill: 0, ok: false });
      return;
    }
    this.ink.loadPixels();
    const px = this.ink.pixels;
    // 붓이 글자 획보다 가늘 수 있으니, 점 주변 6px 안에 먹이 있으면 덮은 것으로 본다
    const near = [0, 24, -24, 24 * PAD, -24 * PAD];   // 픽셀 1칸 = 4, 6px = 24
    const cover = this.guidePts.filter(i => near.some(o => px[i + o + 3] > 40)).length / this.guidePts.length;
    // 칠한 먹 전체 중에서 글자와 먼 곳에 묻은 비율 (판 전체를 칠하면 높아진다)
    const inked = this.allPts.filter(i => px[i + 3] > 40).length;
    const spill = this.outsidePts.filter(i => px[i + 3] > 40).length / Math.max(1, inked);
    const ok = cover >= PASS_COVER && spill <= MAX_SPILL;
    if (this.onUpdate) this.onUpdate({ cover, spill, ok });
  }
};

// 서예 연습지의 미(米)자 칸
function drawPracticeGrid(p) {
  p.noFill();
  p.stroke(196, 15, 31, 70);
  p.strokeWeight(2);
  p.rect(8, 8, PAD - 16, PAD - 16);
  p.strokeWeight(1);
  p.drawingContext.setLineDash([6, 6]);
  p.line(PAD / 2, 8, PAD / 2, PAD - 8);
  p.line(8, PAD / 2, PAD - 8, PAD / 2);
  p.line(8, 8, PAD - 8, PAD - 8);
  p.line(PAD - 8, 8, 8, PAD - 8);
  p.drawingContext.setLineDash([]);
}


// ############################################################
// [B] HTML 창
// ############################################################
// ============================================================
// 글을 쓰고 읽는 HTML 창(모달)들
// ------------------------------------------------------------
// 글자 입력은 캔버스보다 HTML(<textarea>)이 훨씬 편해서,
// 글쓰기·기록 보기·확인 창은 일반 HTML로 만들었다.
// 모양은 style.css에서 바꿀 수 있다.
//
//   UI.promptName()        새 사람 이름 묻기
//   UI.confirm(...)        "정말 할까요?" 확인 창 (삭제·소각 전에 꼭 거친다)
//   UI.openWriter(...)     세 번의 忍 글쓰기
//   UI.openMemo(...)       忍 하나의 기록 보기·고치기·상태 바꾸기·지우기
// ============================================================

// 세 단계의 내용. 문구를 바꾸고 싶으면 여기만 고치면 된다.
const STAGES = [
  {
    key: 'vent', num: '첫 번째 忍', title: '쏟아내기',
    q: '지금 무슨 말을 하고 싶나요?'
  },
  {
    key: 'filter', num: '두 번째 忍', title: '걸러내기',
    q: '무엇 때문에 화가 났나요?',
    ref: 'vent', refLabel: '첫 번째 忍에 쓴 말'
  },
  {
    key: 'request', num: '세 번째 忍', title: '바로잡기',
    q: '상대에게 무엇을 바라나요?',
    ref: 'filter', refLabel: '두 번째 忍에 정리한 일과 감정'
  }
];

// 사용자가 쓴 글을 HTML에 넣기 전에 특수문자를 바꿔 준다 (<, > 등)
function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const UI = {
  root: null,
  onEscape: null,

  init() {
    this.root = document.getElementById('modal-root');
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this.onEscape && !document.querySelector('.confirm-layer')) this.onEscape();
    });
  },

  // 창이 하나라도 열려 있으면 캔버스 클릭을 막기 위해 메인 구역이 확인한다
  isOpen() {
    return !this.root.classList.contains('hidden') || !!document.querySelector('.confirm-layer');
  },

  show(html, onEscape) {
    const already = !this.root.classList.contains('hidden'); // 이미 열려 있으면 펼침 효과 생략
    this.root.innerHTML = `<div class="sheet-wrap${already ? ' still' : ''}"><div class="sheet">${html}</div></div>`;
    this.root.classList.remove('hidden');
    this.onEscape = onEscape || (() => this.close());
    return this.root.querySelector('.sheet');
  },

  close() {
    TracePad.detach();
    this.root.classList.add('hidden');
    this.root.innerHTML = '';
    this.onEscape = null;
  },

  toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('out'), 1400);
    setTimeout(() => t.remove(), 1900);
  },

  async copy(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      // 예전 방식(보안 제한이 있을 때)
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    this.toast('복사했어요');
  },

  // ---------- 확인 창 ----------
  // 사용법: if (await UI.confirm('제목', '설명', '지우기')) { ... }
  confirm(title, message, okLabel = '확인', danger = true) {
    return new Promise(resolve => {
      const layer = document.createElement('div');
      layer.className = 'confirm-layer';
      layer.innerHTML = `
        <div class="sheet-wrap small"><div class="sheet">
          <h3>${esc(title)}</h3>
          <p class="hint">${esc(message).replace(/\n/g, '<br>')}</p>
          <div class="actions">
            <button class="ghost" data-a="no">취소</button>
            <button class="${danger ? 'danger' : 'primary'}" data-a="yes">${esc(okLabel)}</button>
          </div>
        </div></div>`;
      document.body.appendChild(layer);
      const done = v => { layer.remove(); document.removeEventListener('keydown', key); resolve(v); };
      const key = e => { if (e.key === 'Escape') done(false); };
      document.addEventListener('keydown', key);
      layer.querySelector('[data-a="no"]').onclick = () => done(false);
      layer.querySelector('[data-a="yes"]').onclick = () => done(true);
      layer.querySelector('[data-a="yes"]').focus();
    });
  },

  // ---------- 새 사람 이름 ----------
  promptName() {
    return new Promise(resolve => {
      const sheet = this.show(`
        <h2>새 두루마리</h2>
        <!-- 브라우저(특히 Safari)는 id·placeholder에 "name"이나 "이름"이 있으면
             연락처 자동완성을 띄운다. 그래서 일부러 그런 단어를 피하고 자동완성을 끈다. -->
        <input id="scroll-label" type="text" maxlength="12" 
               autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
               data-lpignore="true" data-1p-ignore />
        <div class="actions">
          <button class="ghost" data-a="cancel">취소</button>
          <button class="primary" data-a="ok">두루마리 만들기</button>
        </div>`, () => { this.close(); resolve(null); });
      const input = sheet.querySelector('#scroll-label');
      const ok = () => {
        const v = input.value.trim();
        if (!v) { input.focus(); input.classList.add('shake'); setTimeout(() => input.classList.remove('shake'), 400); return; }
        this.close();
        resolve(v);
      };
      sheet.querySelector('[data-a="ok"]').onclick = ok;
      sheet.querySelector('[data-a="cancel"]').onclick = () => { this.close(); resolve(null); };
      input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) ok(); });
      input.focus();
    });
  },

  // ============================================================
  // 세 번의 忍 글쓰기
  // onSave(texts)는 마지막에 "두루마리에 忍 남기기"를 누르면 불린다.
  // ============================================================
  openWriter(person, onSave) {
    const st = { stage: 0, phase: 'write', texts: { vent: '', filter: '', request: '' } };

    const hasText = () => Object.values(st.texts).some(t => t.trim());
    const cancel = async () => {
      if (hasText() && !(await this.confirm('그만둘까요?', '작성 중인 글은 저장되지 않아요.', '그만두기'))) return;
      this.close();
    };

    const stepsHtml = () => `
      <div class="steps">${STAGES.map((s, i) => `
        <span class="step ${i < st.stage || st.phase === 'final' ? 'done' : ''} ${i === st.stage && st.phase !== 'final' ? 'now' : ''}">
          <b>忍</b>${s.title}</span>`).join('<i></i>')}
      </div>`;

    // ---- 1) 글 쓰기 화면 ----
    const renderWrite = () => {
      const s = STAGES[st.stage];
      const ref = s.ref ? `
        <div class="ref"><span>${s.refLabel}</span><p>${esc(st.texts[s.ref]).replace(/\n/g, '<br>')}</p></div>` : '';
      const sheet = this.show(`
        ${stepsHtml()}
        <p class="eyebrow">${s.num} · ${esc(person.name)}</p>
        <h2>${s.q}</h2>
        ${ref}
        <textarea id="stage-text" rows="6">${esc(st.texts[s.key])}</textarea>
        <div class="actions">
          <button class="ghost" data-a="cancel">그만두기</button>
          ${st.stage > 0 ? '<button class="ghost" data-a="back">← 이전 단계</button>' : ''}
          <button class="primary" data-a="next">忍 따라 쓰기 →</button>
        </div>`, cancel);
      const ta = sheet.querySelector('#stage-text');
      const next = sheet.querySelector('[data-a="next"]');
      const sync = () => { st.texts[s.key] = ta.value; next.disabled = !ta.value.trim(); };
      ta.addEventListener('input', sync);
      sync();
      ta.focus();
      sheet.querySelector('[data-a="cancel"]').onclick = cancel;
      const back = sheet.querySelector('[data-a="back"]');
      if (back) back.onclick = () => { st.stage--; st.phase = 'write'; renderWrite(); };
      next.onclick = () => { st.phase = 'trace'; renderTrace(); };
    };

    // ---- 2) 忍 따라 쓰기 화면 ----
    const renderTrace = () => {
      const s = STAGES[st.stage];
      const last = st.stage === 2;
      const sheet = this.show(`
        ${stepsHtml()}
        <p class="eyebrow">${s.num} · ${s.title}</p>
        <h2>忍을 따라 써 보세요</h2>
        <div class="pad-wrap"><div id="pad-slot"></div></div>
        <div class="meter"><div class="bar"></div></div>
        <p class="meter-text"></p>
        <div class="actions">
          <button class="ghost" data-a="edit">← 글 고치기</button>
          <button class="ghost" data-a="clear">다시 쓰기</button>
          <button class="primary" data-a="next" disabled>${last ? '마무리 →' : '다음 忍으로 →'}</button>
        </div>`, cancel);
      const bar = sheet.querySelector('.bar');
      const txt = sheet.querySelector('.meter-text');
      const next = sheet.querySelector('[data-a="next"]');
      TracePad.attach(sheet.querySelector('#pad-slot'), r => {
        bar.style.width = Math.round(Math.min(1, r.cover / PASS_COVER) * 100) + '%';
        bar.classList.toggle('ok', r.ok);
        next.disabled = !r.ok;
        // 안내 문구 없이 막대로만 보여 주고, 글자 밖으로 너무 칠했을 때만 알려 준다
        txt.textContent = r.spill > MAX_SPILL ? '글자 밖으로 너무 많이 칠했어요' : '';
      });
      sheet.querySelector('[data-a="edit"]').onclick = () => { TracePad.detach(); st.phase = 'write'; renderWrite(); };
      sheet.querySelector('[data-a="clear"]').onclick = () => TracePad.clear();
      next.onclick = () => {
        TracePad.detach();
        if (last) { st.phase = 'final'; renderFinal(); }
        else { st.stage++; st.phase = 'write'; renderWrite(); }
      };
    };

    // ---- 3) 마무리 화면 ----
    const renderFinal = () => {
      const sheet = this.show(`
        ${stepsHtml()}
        <p class="eyebrow">세 번의 忍을 마쳤습니다</p>
        <h2>상대에게 전할 말</h2>
        <textarea id="final-text" rows="5">${esc(st.texts.request)}</textarea>
        <div class="row-right"><button class="ghost small" data-a="copy">복사하기</button></div>
        <details>
          <summary>정리 과정 다시 보기</summary>
          <div class="ref"><span>첫 번째 忍 · 쏟아내기</span><p>${esc(st.texts.vent).replace(/\n/g, '<br>')}</p></div>
          <div class="ref"><span>두 번째 忍 · 걸러내기</span><p>${esc(st.texts.filter).replace(/\n/g, '<br>')}</p></div>
        </details>
        <div class="actions">
          <button class="ghost" data-a="cancel">그만두기</button>
          <button class="primary" data-a="save">두루마리에 忍 남기기</button>
        </div>`, cancel);
      const ta = sheet.querySelector('#final-text');
      ta.addEventListener('input', () => { st.texts.request = ta.value; });
      sheet.querySelector('[data-a="copy"]').onclick = () => this.copy(ta.value);
      sheet.querySelector('[data-a="cancel"]').onclick = cancel;
      sheet.querySelector('[data-a="save"]').onclick = () => {
        st.texts.request = ta.value.trim() || st.texts.request;
        this.close();
        onSave({ ...st.texts });
      };
    };

    renderWrite();
  },

  // ============================================================
  // 忍 하나의 기록 보기
  // actions: { onToggle(resolved), onDelete(), onEdit(texts) }
  // ============================================================
  openMemo(person, memo, actions) {
    const renderView = () => {
      const sheet = this.show(`
        <div class="memo-head">
          <span class="big-hanja ${memo.resolved ? 'green' : 'red'}">忍</span>
          <div>
            <p class="eyebrow">${esc(person.name)} · ${formatDate(memo.createdAt)}</p>
            <span class="chip ${memo.resolved ? 'green' : 'red'}">${memo.resolved ? '풀린 忍 ' + (memo.resolvedAt ? '· ' + formatDate(memo.resolvedAt) : '') : '풀리지 않은 忍'}</span>
          </div>
        </div>
        <h3>상대에게 전할 말</h3>
        <blockquote>${esc(memo.request).replace(/\n/g, '<br>')}</blockquote>
        <div class="row-right"><button class="ghost small" data-a="copy">복사하기</button></div>
        <details>
          <summary>정리 과정 보기</summary>
          <div class="ref"><span>첫 번째 忍 · 쏟아내기</span><p>${esc(memo.vent).replace(/\n/g, '<br>')}</p></div>
          <div class="ref"><span>두 번째 忍 · 걸러내기</span><p>${esc(memo.filter).replace(/\n/g, '<br>')}</p></div>
        </details>
        <div class="actions spread">
          <div>
            <button class="ghost danger-text" data-a="delete">기록 지우기</button>
            <button class="ghost" data-a="edit">고치기</button>
          </div>
          <div>
            <button class="${memo.resolved ? 'ghost' : 'green-btn'}" data-a="toggle">
              ${memo.resolved ? '다시 붉은 忍으로' : '풀렸어요 → 초록 忍'}</button>
            <button class="primary" data-a="close">닫기</button>
          </div>
        </div>`);
      sheet.querySelector('[data-a="copy"]').onclick = () => this.copy(memo.request);
      sheet.querySelector('[data-a="close"]').onclick = () => this.close();
      sheet.querySelector('[data-a="toggle"]').onclick = () => { actions.onToggle(!memo.resolved); renderView(); };
      sheet.querySelector('[data-a="edit"]').onclick = renderEdit;
      sheet.querySelector('[data-a="delete"]').onclick = async () => {
        if (await this.confirm('이 忍을 지울까요?', '이 기록과 세 단계의 글이 모두 사라지고 되돌릴 수 없어요.', '지우기')) {
          this.close();
          actions.onDelete();
        }
      };
    };

    const renderEdit = () => {
      const sheet = this.show(`
        <p class="eyebrow">${esc(person.name)} · ${formatDate(memo.createdAt)}</p>
        <h2>기록 고치기</h2>
        ${STAGES.map(s => `
          <label class="field"><span>${s.num} · ${s.title}</span>
            <textarea data-k="${s.key}" rows="3">${esc(memo[s.key])}</textarea></label>`).join('')}
        <div class="actions">
          <button class="ghost" data-a="cancel">취소</button>
          <button class="primary" data-a="save">저장</button>
        </div>`, renderView);
      sheet.querySelector('[data-a="cancel"]').onclick = renderView;
      sheet.querySelector('[data-a="save"]').onclick = () => {
        const texts = {};
        sheet.querySelectorAll('textarea').forEach(t => { texts[t.dataset.k] = t.value.trim() || memo[t.dataset.k]; });
        actions.onEdit(texts);
        renderView();
      };
    };

    renderView();
  }
};
