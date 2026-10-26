// ============================================================
// 참을 인(忍) — sketch.js
// ------------------------------------------------------------
// 화면에 그리는 것과 동작은 모두 이 파일에 있다.
// 글쓰기 창(HTML)과 忍 따라 쓰기 판은 ui.js에 있다.
//
// [목차]  VS Code에서 Ctrl+F(맥은 Cmd+F)로 "[번호]"를 검색하면 바로 이동
//   [1] 설정 ............ 좌표와 색상 (★ 색·위치를 바꾸려면 여기)
//   [2] 메인 ............ setup / draw / 마우스 입력
//   [3] 데이터 저장 ..... localStorage에 기록 저장·수정·삭제
//   [4] 물리 ............ matter.js로 왼쪽 두루마리가 떨어져 쌓임
//   [5] 그리기: 배경·서안·호롱불·서랍·잿조각
//   [6] 그리기: 두루마리와 忍
//   [7] 효과 ............ 소각, 불티, 날려보내기
// ============================================================

// ############################################################
// [1] 설정
// ############################################################
// ============================================================
// 화면 배치(좌표)와 색상을 한곳에 모아 둔 파일
// ------------------------------------------------------------
// 화면은 항상 "1280 x 800" 크기라고 생각하고 그린다.
// 실제 브라우저 창 크기에 맞춰 메인 구역이 자동으로 확대/축소한다.
// → 위치나 색을 바꾸고 싶으면 이 파일의 숫자만 고치면 된다.
// ============================================================

const W = 1280; // 가상 화면 너비
const H = 800;  // 가상 화면 높이

const LAYOUT = {
  // 왼쪽 두루마리 보관함
  bin: { x: 15, y: 0, w: 227, h: 797, inset: 17 },
  addBtn: { x: 40, y: 22, w: 177, h: 42 },        // "+ 새 두루마리" 버튼
  listScroll: { len: 170, thick: 34 },             // 왼쪽 두루마리 하나의 크기

  // 서안(책상) 윗판
  desk: { x: 337, y: 90, w: 843, h: 500 },

  // 가운데에 펼쳐지는 두루마리
  scroll: { x: 418, y: 207, w: 550, h: 315 },      // 민트색 비단 테두리 전체
  paper: { x: 463, y: 234, w: 477, h: 256 },       // 흰 한지 부분 (忍이 쌓이는 곳)

  // 호롱불(컵 모양 초) — 여기로 두루마리를 끌어오면 태운다
  candle: { x: 1080, y: 178, flameY: 100, dropRadius: 95 },

  // 서랍
  drawer: { x: 519, y: 608, w: 460, h: 52 },
  handle: { x: 757, y: 655 },
  drawerPull: 73                                   // 서랍이 열릴 때 아래로 내려오는 거리
};

const COLORS = {
  bg: '#f9e4e1',
  binOuter: '#f4b8ab',
  binInner: '#c67467',
  deskA: '#ca796b',     // 서안 윗판 어두운 쪽 (갈색빛 분홍)
  deskB: '#eca89c',     // 서안 윗판 밝은 쪽
  deskCurl: '#eba79b',  // 말린 끝·서랍 옆판
  wood: '#5a1a12',
  woodDark: '#2e0a05',
  silk: '#aaf7f7',      // 두루마리 테두리(비단)
  rod: '#51470e',       // 두루마리 축
  paper: '#ffffff',     // 한지
  ink: '#1c140e',       // 먹
  red: '#c8102e',       // 미해결 忍
  green: '#0f5a2a',     // 해결 忍
  ash: '#8d8a86'
};

// 사람마다 다른 두루마리 색 (사람 id로 하나를 고른다)
// 시안에 쓴 세 가지 색만 돌려 쓴다
const SCROLL_PALETTE = ['#b3baff', '#79cce2', '#a8f5f5'];

// 忍 글씨에 쓰는 글꼴 이름 (index.html에서 불러온 Google Font)
const HANJA_FONT = 'Noto Serif KR';

// 문자열(id)을 숫자로 바꿔 주는 도우미. 같은 id면 항상 같은 숫자 → 같은 색/각도
function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// 0~1 사이 값을 부드럽게 만드는 함수 (애니메이션용)
function easeInOut(t) {
  t = Math.min(1, Math.max(0, t));
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
function easeOut(t) {
  t = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - t, 3);
}

// 점이 사각형 안에 있는지
function inRect(px, py, r) {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

// 날짜를 "2026. 10. 26." 형태로
function formatDate(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}


// ############################################################
// [2] 메인
// ############################################################
// ============================================================
// 메인 p5 스케치 (전체 흐름을 조율하는 곳)
// ------------------------------------------------------------
// setup()  : 처음 한 번 — 데이터 불러오기, 물리 세계 만들기
// draw()   : 1초에 60번 — 화면 전체를 다시 그린다
// 마우스 함수들 : 클릭·드래그에 따라 상태(state)를 바꾼다
//
// [두루마리가 있는 곳]
//   - 서안 위에 펼쳐진 두루마리(selectedId)는 왼쪽 보관함에서 빠진다.
//   - 서안 위 두루마리를 오른쪽 → 왼쪽으로 끌면 말리면서 닫히고, 보관함에 다시 떨어진다.
//   - 새 두루마리는 忍을 하나 이상 남겨야 만들어진다. (글쓰기를 그만두면 아무것도 안 생김)
//
// [마우스 동작 정리]
//   보관함 두루마리 : 클릭 → 펼치기 / 드래그 → 호롱불에 놓으면 태우기
//   서안 위 두루마리 : 忍 클릭 → 기록 보기 / 왼쪽으로 드래그 → 닫기
//                     꾹 누르고(0.45초) 드래그 → 호롱불에 놓으면 태우기
//   서랍 속 잿조각   : 서랍 밖 빈 곳으로 드래그 → 날려 보내기
// ============================================================

// ---------- 화면 확대/축소 ----------
let view = { s: 1, ox: 0, oy: 0 };   // 1280x800 화면을 창 크기에 맞추는 비율과 여백

// ---------- 앱의 현재 상태 ----------
let selectedId = null;     // 서안 위에 펼쳐진 두루마리의 사람 id
let openP = 0;             // 두루마리 펼침 정도 0~1
let openTarget = 1;        // openP가 향하는 값 (1 = 펼치기, 0 = 닫기)
let appear = null;         // 방금 추가된 忍 애니메이션 { memoId, start }
let hover = null;          // 마우스가 올라간 대상

let press = null;          // 보관함 두루마리를 누른 순간 { id, x, y }
let deskPress = null;      // 서안 위 두루마리를 누른 순간 { x, y, t, glyph, mode }
let drag = null;           // 태우려고 끌고 있는 두루마리 { id, fromDesk }
let ashPress = null;       // 잿조각을 누른 순간 { item, x, y }
let ashDrag = null;        // 끌고 있는 잿조각 { ash, sc }

let drawerOpen = false;    // 서랍이 열렸는지
let drawerP = 0;           // 서랍 열림 정도 0~1
let burnPending = null;    // 다음 프레임에 태울 사람 id

const LONG_PRESS = 450;    // 이 시간(ms) 이상 꾹 누르면 "들어 올리기"

function setup() {
  const cnv = createCanvas(windowWidth, windowHeight);
  cnv.parent('stage');
  computeView();
  textFont(HANJA_FONT);

  Store.load();
  Physics.init();
  Store.data.people.forEach((p, i) => Physics.addScroll(p.id, i)); // 차례로 떨어뜨리기
  paperTexture = makePaperTexture();
  UI.init();
  TracePad.init();

  // 캔버스 위를 눌렀을 때만 반응 (HTML 창을 누른 건 무시)
  cnv.mousePressed(onCanvasPress);

  // 忍 글꼴 미리 불러오기
  document.fonts.load(`700 20px "${HANJA_FONT}"`, '忍가나다');
  document.fonts.load(`400 20px "${HANJA_FONT}"`, '忍가나다');
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  computeView();
}

function computeView() {
  view.s = Math.min(windowWidth / W, windowHeight / H);
  view.ox = (windowWidth - W * view.s) / 2;
  view.oy = (windowHeight - H * view.s) / 2;
}

// 실제 마우스 위치 → 1280x800 기준 좌표
function vMouse() {
  return { x: (mouseX - view.ox) / view.s, y: (mouseY - view.oy) / view.s };
}

function selectedPerson() {
  return selectedId ? Store.getPerson(selectedId) : null;
}

// ============================================================
// draw — 매 프레임
// ============================================================
function draw() {
  Physics.update();
  const m = vMouse();

  // 서안 위 두루마리를 꾹 누르고 있으면 → 들어 올려서 태울 수 있는 상태로
  if (deskPress && !deskPress.mode && millis() - deskPress.t > LONG_PRESS) {
    deskPress.mode = 'lift';
    drag = { id: selectedId, fromDesk: true };
  }

  // 펼침 정도: 손으로 말고 있는 중이면 마우스를 따르고, 아니면 목표값으로 천천히
  if (deskPress && deskPress.mode === 'roll') {
    openP = constrain(1 - (deskPress.x - m.x) / (LAYOUT.scroll.w * 0.8), 0, 1);
  } else if (selectedId) {
    const step = deltaTime / 650;
    openP = openTarget === 1 ? Math.min(1, openP + step) : Math.max(0, openP - step * 1.5);
    if (openTarget === 0 && openP === 0) closeScroll();   // 다 말렸으면 보관함으로
  }
  drawerP = lerp(drawerP, drawerOpen ? 1 : 0, 0.15);
  const drawerShown = Math.max(drawerP, Burn.drawerBump());

  const busy = UI.isOpen() || drag || ashDrag || (deskPress && deskPress.mode);
  hover = busy ? null : findHover(m.x, m.y);
  cursor(drag || ashDrag || (deskPress && deskPress.mode) ? 'grabbing'
    : hover ? (['list', 'ash', 'desk'].includes(hover.type) ? 'grab' : 'pointer') : 'default');

  background(COLORS.bg);
  push();
  translate(view.ox, view.oy);
  scale(view.s);

  drawBackground();
  drawAddButton(hover && hover.type === 'add');
  drawListScrolls();
  drawDesk();

  // 호롱불: 끌고 오는 두루마리가 가까울수록 불꽃이 커진다
  let heat = 0;
  if (drag) heat = constrain(map(distToCandle(m.x, m.y), 260, 40, 0, 1), 0, 1);
  if (Burn.active && Burn.phase === 'burn') heat = 0.6;
  drawCandle(heat);

  if (Burn.active) Burn.updateAndDraw();
  else if (drag && drag.fromDesk) drawOpenScroll(null, 0, null, null, true); // 들어 올린 동안은 빈 서안
  else drawOpenScroll(selectedPerson(), openP, appear, hover);

  drawDrawer(drawerShown, hover && hover.type === 'drawer');
  drawTray(drawerShown);

  BlowAway.draw();
  Particles.updateAndDraw();

  // 끌고 있는 것들
  if (drag) drawDragGhost(m, heat);
  if (ashDrag) drawAsh(m.x, m.y, ashDrag.sc * 1.1, ashDrag.ash, 230);

  // 안내 문구
  if (hover && hover.type === 'glyph') drawGlyphTooltip(hover.item);

  pop();

  // 소각 시작: 펼쳐진 두루마리를 이미지로 찍은 뒤 데이터를 지운다
  if (burnPending) startBurn();
}

// ---------- 보관함 두루마리들 ----------
function drawListScrolls() {
  for (const person of Store.data.people) {
    const body = Physics.bodies[person.id];
    if (!body) continue;   // 서안 위에 있는 두루마리는 몸체가 없다
    const isDragged = drag && drag.id === person.id;
    drawListScroll(person, body.position.x, body.position.y, body.angle, { alpha: isDragged ? 70 : 255 });
  }
}

function drawDragGhost(m, heat) {
  const person = Store.getPerson(drag.id);
  if (!person) return;
  drawListScroll(person, m.x, m.y, Math.sin(frameCount * 0.1) * 0.08, { alpha: 235 });
}

function distToCandle(x, y) {
  return dist(x, y, LAYOUT.candle.x - 17, LAYOUT.candle.y - 20);
}

// ---------- 열린 서랍 속 잿조각 ----------
// 잿조각들의 자리 계산 (많아지면 작게)
function trayLayout(open) {
  const dr = LAYOUT.drawer;
  const ashes = Store.data.ashes.filter(a =>
    !(Burn.active && Burn.ash && Burn.ash.id === a.id) && !(ashDrag && ashDrag.ash.id === a.id));
  const area = { x: dr.x + 14, y: dr.y + 4, w: dr.w - 28, h: LAYOUT.drawerPull * open - 8 };
  let sc = 1, cols = 1;
  for (sc of [1, 0.8, 0.65, 0.5, 0.4]) {
    cols = Math.floor(area.w / (100 * sc));
    if (cols * Math.max(1, Math.floor((area.h + 6) / (62 * sc))) >= ashes.length) break;
  }
  const cw = 100 * sc, ch = 62 * sc;
  const startX = area.x + (area.w - cols * cw) / 2;
  return {
    area,
    items: ashes.map((ash, i) => ({
      ash, sc: 0.85 * sc,
      x: startX + (i % cols) * cw + cw / 2,
      y: area.y + Math.floor(i / cols) * ch + ch / 2 + 4
    }))
  };
}

// 서랍이 열린 자리 (여기 밖에 잿조각을 놓으면 날아간다)
function drawerOpeningRect() {
  const dr = LAYOUT.drawer;
  return { x: dr.x, y: dr.y, w: dr.w, h: LAYOUT.drawerPull * drawerP + dr.h };
}

function drawTray(open) {
  if (open < 0.3) return;
  const a = constrain(map(open, 0.3, 0.8, 0, 255), 0, 255);
  const { area, items } = trayLayout(open);
  if (items.length === 0 && !ashDrag) {
    fill(255, 255, 255, a * 0.6);
    textFont(HANJA_FONT);
    textStyle(NORMAL);
    textSize(13);
    textAlign(CENTER, CENTER);
    text('잿조각이 모입니다.', area.x + area.w / 2, area.y + area.h / 2);
  }
  for (const it of items) {
    const hv = hover && hover.type === 'ash' && hover.item.ash.id === it.ash.id;
    drawAsh(it.x, it.y, it.sc * (hv ? 1.08 : 1), it.ash, a);
  }
  // 서랍 앞판에 개수 표시
  fill(255, 255, 255, a * 0.85);
  textFont(HANJA_FONT);
  textStyle(NORMAL);
  textSize(12);
  textAlign(LEFT, CENTER);
  text(`잿조각 ${Store.data.ashes.length}`, LAYOUT.drawer.x + 12, LAYOUT.drawer.y + LAYOUT.drawerPull * open + 16);
}

// ============================================================
// 마우스가 무엇 위에 있는지 찾기 (위에 그려진 것부터)
// ============================================================
function findHover(mx, my) {
  if (Burn.active || BlowAway.active) return null;
  if (inRect(mx, my, LAYOUT.addBtn)) return { type: 'add' };

  // 열린 서랍 속 잿조각
  if (drawerP > 0.6) {
    for (const it of trayLayout(drawerP).items) {
      if (Math.abs(mx - it.x) < 44 * it.sc && Math.abs(my - it.y) < 28 * it.sc) return { type: 'ash', item: it };
    }
  }
  // 서랍 앞판과 손잡이
  const dr = LAYOUT.drawer;
  const frontY = dr.y + LAYOUT.drawerPull * drawerP;
  if (inRect(mx, my, { x: dr.x, y: frontY, w: dr.w, h: dr.h })) return { type: 'drawer' };
  if (dist(mx, my, LAYOUT.handle.x, frontY + 68) < 26) return { type: 'drawer' };

  // 서안 위 두루마리
  const person = selectedPerson();
  if (person && openP >= 1) {
    if (inRect(mx, my, writeButtonRect())) return { type: 'write' };
    const g = hitGlyph(mx, my, person);
    if (g) return { type: 'glyph', memoId: g.memo.id, item: g };
    if (inRect(mx, my, LAYOUT.scroll)) return { type: 'desk' };
  }
  const id = hitListScroll(mx, my);
  if (id) return { type: 'list', id };
  return null;
}

// ============================================================
// 마우스 입력
// ============================================================
async function onCanvasPress() {
  if (UI.isOpen() || Burn.active || BlowAway.active) return;
  const m = vMouse();
  const h = findHover(m.x, m.y);
  if (!h) return;

  if (h.type === 'add') {
    // 이름만 먼저 받고, 첫 忍을 남겨야 두루마리가 실제로 만들어진다
    const name = await UI.promptName();
    if (!name) return;
    UI.openWriter({ name, memos: [] }, texts => {
      const person = Store.addPerson(name);
      const memo = Store.addMemo(person.id, texts);
      selectScroll(person.id);
      appear = { memoId: memo.id, start: millis() + 500 }; // 다 펼쳐진 뒤 忍 등장
    });
  } else if (h.type === 'write') {
    const person = selectedPerson();
    UI.openWriter(person, texts => {
      const memo = Store.addMemo(person.id, texts);
      appear = { memoId: memo.id, start: millis() };
    });
  } else if (h.type === 'glyph' || h.type === 'desk') {
    // 클릭인지, 왼쪽으로 끄는 건지, 꾹 누르는 건지는 손을 뗄 때/움직일 때 정한다
    deskPress = { x: m.x, y: m.y, t: millis(), glyph: h.type === 'glyph' ? h.item : null, mode: null };
  } else if (h.type === 'drawer') {
    drawerOpen = !drawerOpen;
  } else if (h.type === 'ash') {
    ashPress = { item: h.item, x: m.x, y: m.y };
  } else if (h.type === 'list') {
    press = { id: h.id, x: m.x, y: m.y };
  }
}

function mouseDragged() {
  const m = vMouse();
  // 보관함 두루마리: 조금이라도 움직이면 끌기 시작
  if (press && !drag && dist(m.x, m.y, press.x, press.y) > 6) drag = { id: press.id, fromDesk: false };
  // 서안 위 두루마리: 꾹 누르기 전에 왼쪽으로 움직이면 "말아서 닫기"
  if (deskPress && !deskPress.mode && deskPress.x - m.x > 10) deskPress.mode = 'roll';
  // 잿조각
  if (ashPress && !ashDrag && dist(m.x, m.y, ashPress.x, ashPress.y) > 6) {
    ashDrag = { ash: ashPress.item.ash, sc: ashPress.item.sc };
  }
}

async function mouseReleased() {
  const m = vMouse();

  // 1) 두루마리를 끌고 있었다 → 호롱불 위면 태우기
  if (drag) {
    const id = drag.id;
    drag = null;
    press = null;
    deskPress = null;
    if (distToCandle(m.x, m.y) < LAYOUT.candle.dropRadius) await confirmBurn(id);
    return;
  }
  // 2) 보관함 두루마리를 클릭만 했다 → 펼치기
  if (press) {
    selectScroll(press.id);
    press = null;
    return;
  }
  // 3) 서안 위 두루마리
  if (deskPress) {
    const dp = deskPress;
    deskPress = null;
    if (dp.mode === 'roll') {
      openTarget = openP < 0.6 ? 0 : 1;   // 절반 넘게 말았으면 닫고, 아니면 다시 펼친다
    } else if (!dp.mode && dp.glyph) {
      openMemo(dp.glyph.memo);             // 그냥 클릭 → 기록 보기
    }
    return;
  }
  // 4) 잿조각
  if (ashDrag) {
    const { ash, sc } = ashDrag;
    ashDrag = null;
    ashPress = null;
    if (!inRect(m.x, m.y, drawerOpeningRect())) {
      const ok = await UI.confirm(`${ash.name}을(를) 날려 보낼까요?`, '이름까지 완전히 사라져요.', '날려보내기');
      if (ok) {
        BlowAway.begin({ ...ash }, m.x, m.y, sc * 1.1);
        Store.blowAway(ash.id);
      }
    }
    return;
  }
  ashPress = null;
}

function openMemo(memo) {
  const person = selectedPerson();
  UI.openMemo(person, memo, {
    onToggle: resolved => Store.setResolved(person.id, memo.id, resolved),
    onEdit: texts => Store.updateMemo(person.id, memo.id, texts),
    onDelete: () => Store.deleteMemo(person.id, memo.id)
  });
}

// 보관함의 두루마리를 서안 위로 (이미 펼쳐진 다른 두루마리는 보관함으로 돌아간다)
function selectScroll(id) {
  if (selectedId === id) return;
  if (selectedId && Store.getPerson(selectedId)) Physics.addScroll(selectedId, 0);
  Physics.removeScroll(id);
  selectedId = id;
  openP = 0;
  openTarget = 1;
  appear = null;
}

// 서안 위 두루마리를 보관함으로
function closeScroll() {
  if (selectedId && Store.getPerson(selectedId)) Physics.addScroll(selectedId, 0);
  selectedId = null;
  openP = 0;
  openTarget = 1;
  appear = null;
}

// ---------- 소각 ----------
async function confirmBurn(id) {
  const person = Store.getPerson(id);
  if (!person) return;
  const ok = await UI.confirm(
    `${person.name}의 두루마리를 태울까요?`,
    `忍 ${person.memos.length}개와 모든 글이 사라지고 이름만 남아요.`,
    '태우기'
  );
  if (!ok) return;
  // 태울 두루마리를 서안 위에 활짝 펼쳐 놓고, 다음 프레임 끝에서 이미지로 찍는다
  selectScroll(id);
  openP = 1;
  drawerOpen = false;
  burnPending = id;
}

function startBurn() {
  const id = burnPending;
  burnPending = null;
  const area = LAYOUT.scroll;
  const snapshot = get(view.ox + area.x * view.s, view.oy + area.y * view.s, area.w * view.s, area.h * view.s);
  const ash = Store.burnPerson(id);     // 데이터: 메모 삭제, 이름만 잿조각으로
  Physics.removeScroll(id);
  selectedId = null;
  openP = 0;
  if (ash) Burn.begin(snapshot, area, ash);
}

// ############################################################
// [3] 데이터 저장
// ############################################################
// ============================================================
// 데이터 저장소 (localStorage)
// ------------------------------------------------------------
// 모든 기록은 브라우저의 localStorage에 JSON 글자로 저장된다.
// 그래서 새로고침하거나 브라우저를 껐다 켜도 남아 있다.
// (단, 같은 브라우저·같은 주소에서만. 다른 컴퓨터와는 공유되지 않는다)
//
// 데이터 모양:
// {
//   people: [ { id, name, createdAt,
//               memos: [ { id, createdAt, vent, filter, request,
//                          resolved, resolvedAt } ] } ],
//   ashes:  [ { id, name, burnedAt } ]      ← 서랍 속 잿조각
// }
//   vent    = 첫 번째 忍 (쏟아내기)
//   filter  = 두 번째 忍 (걸러내기)
//   request = 세 번째 忍 (바로잡기) ← 최종 정리 문장
// ============================================================

const STORE_KEY = 'chameulin-v1';

const Store = {
  data: { people: [], ashes: [] },

  // 저장된 데이터를 불러온다 (없으면 빈 상태)
  load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.data.people = Array.isArray(parsed.people) ? parsed.people : [];
        this.data.ashes = Array.isArray(parsed.ashes) ? parsed.ashes : [];
      }
    } catch (e) {
      console.warn('저장된 데이터를 읽지 못했어요. 빈 상태로 시작합니다.', e);
    }
  },

  // 현재 데이터를 저장한다. 데이터를 바꾸는 모든 함수가 마지막에 이걸 부른다.
  save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.warn('저장하지 못했어요.', e);
    }
  },

  newId(prefix) {
    return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  },

  // ---------- 사람(두루마리) ----------
  addPerson(name) {
    const person = { id: this.newId('p'), name: name.trim(), createdAt: Date.now(), memos: [] };
    this.data.people.push(person);
    this.save();
    return person;
  },

  getPerson(id) {
    return this.data.people.find(p => p.id === id) || null;
  },

  // ---------- 메모(忍) ----------
  addMemo(personId, texts) {
    const person = this.getPerson(personId);
    if (!person) return null;
    const memo = {
      id: this.newId('m'),
      createdAt: Date.now(),
      vent: texts.vent,
      filter: texts.filter,
      request: texts.request,
      resolved: false,
      resolvedAt: null
    };
    person.memos.push(memo);
    this.save();
    return memo;
  },

  findMemo(personId, memoId) {
    const person = this.getPerson(personId);
    return person ? person.memos.find(m => m.id === memoId) || null : null;
  },

  // 붉은 忍 ↔ 초록 忍
  setResolved(personId, memoId, resolved) {
    const memo = this.findMemo(personId, memoId);
    if (!memo) return;
    memo.resolved = resolved;
    memo.resolvedAt = resolved ? Date.now() : null;
    this.save();
  },

  // 메모 내용 고치기
  updateMemo(personId, memoId, texts) {
    const memo = this.findMemo(personId, memoId);
    if (!memo) return;
    Object.assign(memo, texts);
    this.save();
  },

  deleteMemo(personId, memoId) {
    const person = this.getPerson(personId);
    if (!person) return;
    person.memos = person.memos.filter(m => m.id !== memoId);
    this.save();
  },

  // ---------- 소각 / 날려보내기 ----------
  // 두루마리를 태운다: 메모는 모두 지우고 이름만 잿조각으로 남긴다.
  burnPerson(personId) {
    const person = this.getPerson(personId);
    if (!person) return null;
    this.data.people = this.data.people.filter(p => p.id !== personId);
    const ash = { id: this.newId('a'), name: person.name, burnedAt: Date.now() };
    this.data.ashes.push(ash);
    this.save();
    return ash;
  },

  // 잿조각을 날려 보낸다: 이름까지 완전히 삭제
  blowAway(ashId) {
    this.data.ashes = this.data.ashes.filter(a => a.id !== ashId);
    this.save();
  }
};


// ############################################################
// [4] 물리
// ############################################################
// ============================================================
// 왼쪽 보관함의 두루마리 물리 (matter.js)
// ------------------------------------------------------------
// matter.js는 "보이지 않는 물리 세계"를 계산해 준다.
// 우리는 그 세계에 두루마리 크기의 직사각형(body)을 떨어뜨리고,
// 매 프레임 body의 위치·각도를 읽어서 p5로 두루마리를 그린다.
//   - 화면에 그리는 일: [6] 두루마리 그리기 (p5)
//   - 어디에 있는지 계산하는 일: 이 구역 (matter.js)
// ============================================================

const Physics = {
  engine: null,
  bodies: {},   // { 사람id: body }

  init() {
    const { Engine, Bodies, Composite } = Matter;
    this.engine = Engine.create();
    this.engine.gravity.y = 1;

    // 보관함의 바닥과 양쪽 벽 (눈에 보이지 않는 고정된 벽)
    const b = LAYOUT.bin;
    const left = b.x + b.inset;
    const right = b.x + b.w - b.inset;
    const floor = b.y + b.h - 22;
    const opts = { isStatic: true, friction: 0.8 };
    Composite.add(this.engine.world, [
      Bodies.rectangle((left + right) / 2, floor + 50, right - left + 200, 100, opts), // 바닥
      Bodies.rectangle(left - 50, 0, 100, 2400, opts),                                // 왼쪽 벽
      Bodies.rectangle(right + 50, 0, 100, 2400, opts)                                // 오른쪽 벽
    ]);
  },

  // 두루마리 하나를 위에서 떨어뜨린다. order가 클수록 더 높은 곳에서 출발(차례로 떨어짐)
  addScroll(id, order = 0) {
    const { Bodies, Composite, Body } = Matter;
    const s = LAYOUT.listScroll;
    const seed = hashString(id);
    const x = LAYOUT.bin.x + 70 + (seed % 90);
    const y = 110 - order * 70;
    const body = Bodies.rectangle(x, y, s.len, s.thick, {
      chamfer: { radius: 8 },
      friction: 0.7,
      frictionStatic: 0.9,
      restitution: 0.08,
      density: 0.002
    });
    Body.setAngle(body, ((seed % 100) / 100 - 0.5) * 1.6);
    Composite.add(this.engine.world, body);
    this.bodies[id] = body;
  },

  removeScroll(id) {
    const body = this.bodies[id];
    if (!body) return;
    Matter.Composite.remove(this.engine.world, body);
    delete this.bodies[id];
  },

  // 선택한 두루마리를 살짝 들썩이게 (클릭 반응)
  nudge(id) {
    const body = this.bodies[id];
    if (body) Matter.Body.setVelocity(body, { x: (Math.random() - 0.5) * 2, y: -4 });
  },

  // 매 프레임 물리 계산을 한 걸음 진행
  update() {
    Matter.Engine.update(this.engine, 1000 / 60);
  }
};


// ############################################################
// [5] 그리기: 배경·서안·호롱불·서랍
// ############################################################
// ============================================================
// 배경, 보관함, 서안(책상), 호롱불, 서랍, 잿조각 그리기
// ------------------------------------------------------------
// 여기 있는 함수들은 "그리기만" 한다. 클릭 처리는 [2] 메인에서 한다.
// 그라데이션은 p5에 기본 기능이 없어서 drawingContext(캔버스 원래 기능)를 쓴다.
// ============================================================

// 세로 그라데이션으로 사각형 채우기 도우미
function gradientRect(x, y, w, h, c1, c2, radius = 0) {
  const g = drawingContext.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  drawingContext.fillStyle = g;
  noStroke();
  rect(x, y, w, h, radius);
}

// ---------- 배경 + 왼쪽 보관함 ----------
function drawBackground() {
  background(COLORS.bg);
  const b = LAYOUT.bin;
  noStroke();
  fill(COLORS.binOuter);
  rect(b.x, b.y, b.w, b.h);
  fill(COLORS.binInner);
  rect(b.x + b.inset, b.y, b.w - b.inset * 2, b.h - 22);
}

function drawAddButton(hover) {
  const r = LAYOUT.addBtn;
  stroke(255, 255, 255, hover ? 230 : 140);
  strokeWeight(1.5);
  fill(hover ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.12)');
  rect(r.x, r.y, r.w, r.h, 21);
  noStroke();
  fill(255);
  textFont(HANJA_FONT);
  textStyle(BOLD);
  textSize(15);
  textAlign(CENTER, CENTER);
  text('+ 새 두루마리', r.x + r.w / 2, r.y + r.h / 2 + 1);
}

// ---------- 서안(책상) ----------
function drawDesk() {
  const d = LAYOUT.desk;
  noStroke();

  // 다리 (뒤쪽에 있으니 먼저 그린다)
  const legGrad = drawingContext.createLinearGradient(0, 660, 0, 765);
  legGrad.addColorStop(0, '#6f3224');
  legGrad.addColorStop(1, '#7c3b2c');
  drawingContext.fillStyle = legGrad;
  const legL = [[388, 650], [500, 650], [474, 678], [448, 705], [440, 765], [388, 765]];
  const legR = legL.map(([x, y]) => [1517 - x, y]); // 왼쪽 다리를 좌우 대칭
  for (const leg of [legL, legR]) {
    beginShape();
    for (const [x, y] of leg) vertex(x, y);
    endShape(CLOSE);
  }

  // 앞판(에이프런) — 짙은 나무
  const apronGrad = drawingContext.createLinearGradient(0, 565, 0, 670);
  apronGrad.addColorStop(0, '#4a1810');
  apronGrad.addColorStop(1, '#6f3224');
  drawingContext.fillStyle = apronGrad;
  rect(345, 565, 827, 103, 0, 0, 46, 46);

  // 윗판 — 왼쪽 위는 어둡고 오른쪽 아래로 갈수록 밝아지는 갈색빛 분홍
  const rg = drawingContext.createLinearGradient(370, 108, 1145, 590);
  rg.addColorStop(0, COLORS.deskA);
  rg.addColorStop(0.6, '#e5a294');
  rg.addColorStop(0.8, COLORS.deskB);
  rg.addColorStop(1, '#d58777');
  drawingContext.fillStyle = rg;
  rect(d.x + 33, d.y + 18, d.w - 68, d.h - 20);

  // 양 끝이 말려 올라간 부분(두루마리 형 서안)
  for (const x of [d.x, d.x + d.w - 35]) {
    const cg = drawingContext.createLinearGradient(x, 0, x + 35, 0);
    cg.addColorStop(0, '#c67467');
    cg.addColorStop(0.5, COLORS.deskCurl);
    cg.addColorStop(1, '#c67467');
    drawingContext.fillStyle = cg;
    rect(x, d.y, 35, d.h - 10, 18, 18, 4, 4);
  }
}

// ---------- 서랍 ----------
// open: 0(닫힘) ~ 1(활짝 열림)
function drawDrawer(open, hover) {
  const dr = LAYOUT.drawer;
  const pull = LAYOUT.drawerPull * open;            // 아래로 내려온 거리
  const frontY = dr.y + pull;

  if (open > 0.01) {
    // 열린 자리: 양옆의 얇은 옆판 + 가운데 어두운 속
    noStroke();
    fill(COLORS.deskCurl);
    rect(dr.x, dr.y, 11, pull);
    rect(dr.x + dr.w - 11, dr.y, 11, pull);
    fill('#282118');
    rect(dr.x + 11, dr.y, dr.w - 22, pull);
  }

  // 서랍 앞판
  gradientRect(dr.x, frontY, dr.w, dr.h, hover ? '#d27f71' : '#c47264', '#945230');

  // 손잡이(고리)
  const hx = LAYOUT.handle.x;
  const hy = frontY + 26;
  noFill();
  stroke('#1b2535');
  strokeWeight(11);
  strokeCap(SQUARE);
  arc(hx, hy, 96, 44, 0, PI);
  strokeWeight(9);
  circle(hx, hy + 42, 38);
  strokeCap(ROUND);
  noStroke();
}

// ---------- 호롱불(컵 초) ----------
// heat: 0~1, 두루마리를 가까이 끌고 오면 불꽃이 커진다
function drawCandle(heat) {
  const c = LAYOUT.candle;
  const cx = c.x - 17;

  // 불빛 번짐
  const glowR = 70 + heat * 110 + noise(frameCount * 0.05) * 15;
  const glow = drawingContext.createRadialGradient(cx, c.flameY, 0, cx, c.flameY, glowR);
  glow.addColorStop(0, `rgba(255,190,90,${0.35 + heat * 0.35})`);
  glow.addColorStop(1, 'rgba(255,190,90,0)');
  drawingContext.fillStyle = glow;
  noStroke();
  circle(cx, c.flameY, glowR * 2);

  // 컵 손잡이
  noFill();
  stroke('#f3fbf3');
  strokeWeight(9);
  rect(c.x + 20, 168, 30, 32, 10);
  noStroke();

  // 컵 몸통
  fill('#f3fbf3');
  rect(c.x - 53, 130, 84, 94, 30, 30, 8, 8);
  // 심지
  stroke('#e7e0b8');
  strokeWeight(5);
  line(cx, 115, cx, 134);
  noStroke();

  // 불꽃 (눈물방울 모양, noise로 흔들림)
  drawFlame(cx, c.flameY, 1 + heat * 0.9);
}

// 눈물방울 모양 불꽃. 공식: x = sin(t)·sin(t/2)^1.5, y = cos(t)
function drawFlame(x, y, scale) {
  const sway = (noise(frameCount * 0.04) - 0.5) * 10 * scale;
  const layers = [
    { col: '#f0623a', w: 17, h: 24 },
    { col: '#f7e07a', w: 9, h: 13 }
  ];
  for (const L of layers) {
    fill(L.col);
    beginShape();
    for (let t = 0; t < TWO_PI; t += 0.15) {
      const k = Math.pow(Math.sin(t / 2), 1.5);
      const tip = (Math.cos(t) + 1) / 2;        // 위쪽일수록 1
      vertex(x + Math.sin(t) * k * L.w * scale + sway * tip,
             y + 10 - Math.cos(t) * L.h * scale);
    }
    endShape(CLOSE);
  }
}

// ---------- 잿조각 ----------
// 사람 이름만 남은 작은 회색 조각. seed가 같으면 항상 같은 모양.
const _ashShapeCache = {};
function ashShape(seed) {
  if (_ashShapeCache[seed]) return _ashShapeCache[seed];
  const pts = [];
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    // 의사 난수로 테두리를 울퉁불퉁하게
    const r = 0.78 + ((Math.sin(seed * 0.37 + i * 12.9898) * 43758.5453) % 1 + 1) % 1 * 0.3;
    pts.push({ x: Math.cos(a) * 44 * r, y: Math.sin(a) * 26 * r });
  }
  _ashShapeCache[seed] = pts;
  return pts;
}

function drawAsh(x, y, sc, ash, alpha = 255, selected = false) {
  const seed = hashString(ash.id);
  const pts = ashShape(seed);
  push();
  translate(x, y);
  scale(sc);
  rotate(((seed % 40) - 20) * 0.01);
  if (selected) {
    noFill();
    stroke(255, 220, 160, alpha);
    strokeWeight(3);
    beginShape();
    for (const p of pts) vertex(p.x * 1.12, p.y * 1.18);
    endShape(CLOSE);
  }
  stroke(70, 66, 62, alpha);
  strokeWeight(1.5);
  fill(141, 138, 134, alpha);
  beginShape();
  for (const p of pts) vertex(p.x, p.y);
  endShape(CLOSE);
  // 탄 자국 점들
  noStroke();
  fill(90, 86, 82, alpha * 0.6);
  for (let i = 0; i < 7; i++) {
    const a = (seed * (i + 3)) % 628 / 100;
    const r = (seed * (i + 7)) % 20;
    circle(Math.cos(a) * r * 1.5, Math.sin(a) * r * 0.8, 2 + (i % 3));
  }
  // 이름
  fill(245, 242, 236, alpha);
  textFont(HANJA_FONT);
  textStyle(BOLD);
  textSize(13);
  textAlign(CENTER, CENTER);
  text(ash.name, 0, 1);
  pop();
}


// ############################################################
// [6] 그리기: 두루마리
// ############################################################
// ============================================================
// 두루마리 그리기
// ------------------------------------------------------------
// 1) 왼쪽 보관함의 작은 두루마리들 (위치·각도는 [4] 물리가 계산)
// 2) 가운데에 펼쳐지는 큰 두루마리와 그 위의 忍 기록들
// ============================================================

let paperTexture = null; // 한지 질감 이미지 (setup에서 한 번만 만든다)

// 한지 질감: 종이색 바탕 위에 가는 섬유 선과 작은 점을 흩뿌린다
function makePaperTexture() {
  const p = LAYOUT.paper;
  const g = createGraphics(p.w, p.h);
  g.background(COLORS.paper);
  g.noFill();
  for (let i = 0; i < 260; i++) {
    g.stroke(215, 205, 195, random(6, 16));
    g.strokeWeight(random(0.4, 1.1));
    const x = random(p.w), y = random(p.h);
    const a = random(TWO_PI), len = random(6, 28);
    g.line(x, y, x + cos(a) * len, y + sin(a) * len);
  }
  g.noStroke();
  for (let i = 0; i < 500; i++) {
    g.fill(210, 200, 190, random(4, 12));
    g.circle(random(p.w), random(p.h), random(1, 3));
  }
  return g;
}

// ------------------------------------------------------------
// 1) 왼쪽 보관함의 두루마리
// ------------------------------------------------------------
function scrollColor(person) {
  return SCROLL_PALETTE[hashString(person.id) % SCROLL_PALETTE.length];
}

// (x, y)를 중심으로 angle만큼 기울어진 작은 두루마리 하나 (시안 모양)
//   - 납작한 색 막대 + 양 끝 가운데에 튀어나온 축 손잡이
//   - 한쪽 끝 모서리에 작은 막대 표시: 빨강 = 풀리지 않은 忍, 초록 = 풀린 忍
function drawListScroll(person, x, y, angle, opt = {}) {
  const s = LAYOUT.listScroll;
  const L = s.len, T = s.thick;
  const a = opt.alpha ?? 255;
  push();
  translate(x, y);
  rotate(angle);
  noStroke();

  // 축 손잡이 (양 끝)
  const rod = color(COLORS.rod);
  rod.setAlpha(a);
  fill(rod);
  rect(-L / 2 - 12, -8, 14, 16, 3);
  rect(L / 2 - 2, -8, 14, 16, 3);

  // 몸통
  const c = color(scrollColor(person));
  c.setAlpha(a);
  fill(c);
  rect(-L / 2, -T / 2, L, T);

  // 이름
  fill(20, 20, 30, a);
  textFont(HANJA_FONT);
  textStyle(BOLD);
  textSize(13);
  textAlign(CENTER, CENTER);
  text(person.name, 0, 1);

  // 忍 표시 막대 (오른쪽 끝 아래 모서리, 각 색 최대 6개)
  const unresolved = Math.min(6, person.memos.filter(m => !m.resolved).length);
  const resolved = Math.min(6, person.memos.filter(m => m.resolved).length);
  let mx = L / 2 - 7;
  for (let i = 0; i < unresolved; i++) { fill(232, 20, 30, a); rect(mx, T / 2 - 12, 3, 9); mx -= 5; }
  for (let i = 0; i < resolved; i++) { fill(30, 220, 90, a); rect(mx, T / 2 - 12, 3, 9); mx -= 5; }
  pop();
}

// 화면 좌표 (mx, my)가 기울어진 두루마리 안에 있는지 검사
// → 점을 두루마리 기준 좌표로 "되돌려 회전"시킨 뒤 직사각형 검사
function pointInListScroll(mx, my, body) {
  const s = LAYOUT.listScroll;
  const dx = mx - body.position.x, dy = my - body.position.y;
  const c = Math.cos(-body.angle), sn = Math.sin(-body.angle);
  const lx = dx * c - dy * sn, ly = dx * sn + dy * c;
  return Math.abs(lx) <= s.len / 2 + 8 && Math.abs(ly) <= s.thick / 2 + 4;
}

// 마우스 아래 있는 두루마리의 사람 id (맨 위에 그려진 것부터 검사)
function hitListScroll(mx, my) {
  const people = Store.data.people;
  for (let i = people.length - 1; i >= 0; i--) {
    const body = Physics.bodies[people[i].id];
    if (body && pointInListScroll(mx, my, body)) return people[i].id;
  }
  return null;
}

// ------------------------------------------------------------
// 2) 가운데 큰 두루마리
// ------------------------------------------------------------

// 忍 개수에 따라 칸 크기를 정하고, 각 忍의 자리를 계산한다
function glyphLayout(person) {
  const p = LAYOUT.paper;
  const pad = 18;
  const aw = p.w - pad * 2, ah = p.h - pad * 2;
  const n = person.memos.length;
  let cell = 20;
  for (const c of [64, 52, 42, 34, 27, 22]) {
    if (Math.floor(aw / c) * Math.floor(ah / c) >= n) { cell = c; break; }
  }
  const cols = Math.floor(aw / cell);
  return person.memos.map((memo, i) => {
    const seed = hashString(memo.id);
    const jx = ((seed % 100) / 100 - 0.5) * cell * 0.36;
    const jy = (((seed >> 3) % 100) / 100 - 0.5) * cell * 0.36;
    return {
      memo,
      x: p.x + pad + (i % cols) * cell + cell / 2 + jx,
      y: p.y + pad + Math.floor(i / cols) * cell + cell / 2 + jy,
      size: cell * 0.62,
      rot: (((seed >> 5) % 100) / 100 - 0.5) * 0.25
    };
  });
}

// 忍 하나 (먹이 번진 느낌: 흐릿하고 큰 글자를 뒤에 한 번 더)
function drawGlyph(x, y, size, rot, col, alpha = 255) {
  push();
  translate(x, y);
  rotate(rot);
  textFont(HANJA_FONT);
  textStyle(BOLD);
  textAlign(CENTER, CENTER);
  const c = color(col);
  c.setAlpha(alpha * 0.18);
  fill(c);
  noStroke();
  textSize(size * 1.12);
  text('忍', 0.8, 1.2);
  c.setAlpha(alpha);
  fill(c);
  textSize(size);
  text('忍', 0, 0);
  pop();
}

function writeButtonRect() {
  const p = LAYOUT.paper;
  return { x: p.x + p.w - 128, y: p.y + p.h + 5, w: 128, h: 24 };
}

// person: 펼칠 사람(없으면 null) / openP: 펼쳐진 정도 0~1
// appear: 막 추가된 忍의 등장 애니메이션 정보 / hover: 마우스가 올라간 대상
// quiet: true면 빈 서안의 안내 글자를 숨긴다 (두루마리를 들어 올린 동안)
function drawOpenScroll(person, openP, appear, hover, quiet = false) {
  const s = LAYOUT.scroll;
  const p = LAYOUT.paper;
  const rodW = 19;
  const visW = rodW + (s.w - rodW) * easeInOut(openP);

  if (person && openP > 0.001) {
    // --- 보이는 폭만큼만 그리도록 잘라내기(clip) ---
    drawingContext.save();
    drawingContext.beginPath();
    drawingContext.rect(s.x, s.y - 20, visW, s.h + 40);
    drawingContext.clip();

    // 그림자
    noStroke();
    fill(80, 20, 40, 40);
    rect(s.x + 6, s.y + 8, s.w, s.h, 2);
    // 비단 테두리
    fill(COLORS.silk);
    rect(s.x, s.y, s.w, s.h);
    // 축 옆의 반투명 띠
    fill(163, 238, 249);
    rect(s.x, s.y, rodW, s.h);
    // 한지
    image(paperTexture, p.x, p.y);

    // 제목: 이름과 忍 개수
    const total = person.memos.length;
    const done = person.memos.filter(m => m.resolved).length;
    fill('#2a5a4a');
    textFont(HANJA_FONT);
    textStyle(BOLD);
    textSize(13);
    textAlign(LEFT, CENTER);
    text(`${person.name}`, p.x, s.y + 14);
    textStyle(NORMAL);
    textSize(12);
    text(`忍 ${total}  ·  풀린 忍 ${done}`, p.x + textWidthKo(person.name) + 14, s.y + 14);

    // 忍 기록들
    const items = glyphLayout(person);
    for (const it of items) {
      const col = it.memo.resolved ? COLORS.green : COLORS.red;
      if (appear && appear.memoId === it.memo.id) {
        drawAppearingGlyph(it, col, appear);
      } else {
        const isHover = hover && hover.type === 'glyph' && hover.memoId === it.memo.id;
        drawGlyph(it.x, it.y, it.size * (isHover ? 1.15 : 1), it.rot, col);
      }
    }
    if (total === 0) {
      fill(120, 110, 95);
      textStyle(NORMAL);
      textSize(14);
      textAlign(CENTER, CENTER);
      text('아직 忍이 없습니다.\n화나는 일이 생기면 아래 "새 忍 쓰기"를 눌러 보세요.', p.x + p.w / 2, p.y + p.h / 2);
    }

    // 새 忍 쓰기 버튼 (붉은 도장 느낌)
    const b = writeButtonRect();
    const hb = hover && hover.type === 'write';
    fill(hb ? '#e01426' : COLORS.red);
    rect(b.x, b.y, b.w, b.h, 3);
    fill(255);
    textStyle(BOLD);
    textSize(13);
    textAlign(CENTER, CENTER);
    text('+ 새 忍 쓰기', b.x + b.w / 2, b.y + b.h / 2 + 1);

    drawingContext.restore();

    // 펼쳐지는 중이면 오른쪽 끝에 말린 종이(원통)
    if (openP < 1) {
      const rx = s.x + visW;
      const g = drawingContext.createLinearGradient(rx - 8, 0, rx + 8, 0);
      g.addColorStop(0, '#d9fff3');
      g.addColorStop(0.5, '#ffffff');
      g.addColorStop(1, '#8fd9c3');
      drawingContext.fillStyle = g;
      noStroke();
      rect(rx - 8, s.y - 4, 16, s.h + 8, 6);
    }
  } else if (!quiet) {
    // 아무것도 펼치지 않았을 때: 서안 위에는 호롱불과 안내 한 줄만 (서안 윗판 한가운데)
    const d = LAYOUT.desk;
    fill(255, 255, 255, 230);
    textFont(HANJA_FONT);
    textStyle(NORMAL);
    textAlign(CENTER, CENTER);
    textSize(16);
    text(Store.data.people.length === 0 ? '새 두루마리를 만들어 보세요' : '좌측 두루마리를 눌러 펼치세요',
      d.x + d.w / 2, d.y + 18 + (d.h - 20) / 2);
  }

  // 왼쪽 축: 두루마리가 서안 위에 있을 때만
  if (person && openP > 0.001) {
    noStroke();
    fill(COLORS.rod);
    rect(s.x, s.y - 17, rodW, 17);
    rect(s.x, s.y + s.h, rodW, 19);
  }
}

// 새로 추가된 忍: 세 개의 흐릿한 忍이 모여 하나가 된다
function drawAppearingGlyph(it, col, appear) {
  const t = (millis() - appear.start) / 1600;
  const k = easeInOut(t);
  const offsets = [[-70, -40], [70, -25], [0, 60]];
  if (t < 1) {
    for (const [ox, oy] of offsets) {
      drawGlyph(it.x + ox * (1 - k), it.y + oy * (1 - k), it.size * 1.3, it.rot, COLORS.ink, 160 * (1 - k));
    }
    // 먹이 번지는 원
    noStroke();
    const c = color(col);
    c.setAlpha(60 * (1 - k));
    fill(c);
    circle(it.x, it.y, it.size * (0.5 + k * 1.8));
  }
  drawGlyph(it.x, it.y, it.size * (1 + (1 - easeOut(t)) * 0.4), it.rot, col, 255 * easeOut(t));
}

// 마우스 아래 忍 찾기
function hitGlyph(mx, my, person) {
  if (!person) return null;
  const items = glyphLayout(person);
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (Math.abs(mx - it.x) < it.size * 0.6 && Math.abs(my - it.y) < it.size * 0.6) return it;
  }
  return null;
}

// 한글 이름 폭 계산 도우미 (textWidth는 현재 글꼴 설정 기준)
function textWidthKo(str) {
  push();
  textFont(HANJA_FONT);
  textStyle(BOLD);
  textSize(13);
  const w = textWidth(str);
  pop();
  return w;
}

// 忍 위에 마우스를 올렸을 때 보이는 작은 설명
function drawGlyphTooltip(it) {
  const memo = it.memo;
  const line1 = `${formatDate(memo.createdAt)} · ${memo.resolved ? '풀림' : '풀리지 않음'}`;
  let line2 = (memo.request || '').replace(/\s+/g, ' ');
  if (line2.length > 24) line2 = line2.slice(0, 24) + '…';
  textFont(HANJA_FONT);
  textStyle(NORMAL);
  textSize(12);
  const w = Math.max(textWidth(line1), textWidth(line2)) + 20;
  let x = it.x + 18, y = it.y - 52;
  if (x + w > W - 10) x = it.x - w - 18;
  noStroke();
  fill(30, 22, 18, 225);
  rect(x, y, w, 44, 6);
  fill(255);
  textAlign(LEFT, TOP);
  text(line1, x + 10, y + 7);
  fill(230, 220, 200);
  text(line2, x + 10, y + 24);
}


// ############################################################
// [7] 효과
// ############################################################
// ============================================================
// 소각, 불티·재 입자, 잿조각 날려보내기 애니메이션
// ------------------------------------------------------------
// [소각 원리]
//   1) 펼쳐진 두루마리를 사진 찍듯 이미지로 복사한다(snapshot).
//   2) 그 이미지를 8px 크기의 작은 칸으로 나눈다.
//   3) 칸마다 "타기 시작하는 시간"을 정한다.
//      가장자리일수록 빨리, noise()로 불규칙하게.
//   4) 시간이 흐르면 칸이 [멀쩡 → 불씨(주황) → 그을음(검정) → 사라짐] 순서로 바뀐다.
// ============================================================

// ---------- 입자(불티, 재 가루) ----------
const Particles = {
  list: [],

  add(p) { this.list.push(p); },

  spark(x, y) {
    this.add({
      x, y, vx: random(-0.6, 0.6), vy: random(-2.6, -0.8),
      life: 0, maxLife: random(30, 70), size: random(2, 4.5),
      col: [255, random(120, 200), 60], glow: true
    });
  },

  flake(x, y) {
    this.add({
      x, y, vx: random(-0.8, 0.8), vy: random(-1.4, -0.3),
      life: 0, maxLife: random(60, 120), size: random(2, 5),
      col: [70, 64, 60], glow: false
    });
  },

  updateAndDraw() {
    noStroke();
    for (const p of this.list) {
      if (p.delay > 0) { p.delay -= 1; }
      else {
        // 바람(noise)으로 살짝씩 흔들리며 움직인다
        p.vx += (noise(p.x * 0.01, p.y * 0.01, frameCount * 0.01) - 0.5) * 0.25 + (p.wind || 0);
        p.vy += (p.gravity || -0.01);
        p.x += p.vx;
        p.y += p.vy;
        p.life++;
      }
      const a = 255 * (1 - p.life / p.maxLife);
      if (p.glow) { fill(p.col[0], p.col[1], p.col[2], a * 0.3); circle(p.x, p.y, p.size * 3); }
      fill(p.col[0], p.col[1], p.col[2], a);
      circle(p.x, p.y, p.size);
    }
    this.list = this.list.filter(p => p.life < p.maxLife && p.x < W + 40 && p.y > -40);
  }
};

// ---------- 소각 ----------
const Burn = {
  active: false,
  area: null,      // 태우는 영역(두루마리 + 축)
  layer: null,     // 타들어 가는 두루마리 이미지
  cells: [],
  start: 0,
  phase: 'burn',   // 'burn' → 'ash' → 끝
  ash: null,       // 남게 될 잿조각 데이터
  onDone: null,

  begin(snapshot, area, ash, onDone) {
    this.area = area;
    this.ash = ash;
    this.onDone = onDone;
    this.layer = createGraphics(area.w, area.h);
    this.layer.image(snapshot, 0, 0, area.w, area.h);
    this.layer.noStroke();

    // 칸마다 타기 시작하는 시간(th) 정하기
    const size = 8;
    this.cells = [];
    for (let y = 0; y < area.h; y += size) {
      for (let x = 0; x < area.w; x += size) {
        const edge = Math.min(x, area.w - x, y, area.h - y) / (area.h / 2); // 0(가장자리)~1(중앙)
        const th = 0.55 * edge + 0.45 * noise(x * 0.02, y * 0.02);
        this.cells.push({ x, y, size, th, state: 0 });
      }
    }
    this.start = millis();
    this.phase = 'burn';
    this.active = true;
  },

  updateAndDraw() {
    if (!this.active) return;
    const A = this.area;
    const elapsed = (millis() - this.start) / 1000;

    if (this.phase === 'burn') {
      const t = elapsed / 4.2 * 1.3;
      const L = this.layer;
      for (const c of this.cells) {
        const d = t - c.th;
        const st = d < 0 ? 0 : d < 0.05 ? 1 : d < 0.14 ? 2 : 3;
        if (st === c.state) continue;
        if (st >= 2 && c.state < 2) {            // 그을음
          L.fill(28, 14, 8, random(200, 245));
          L.rect(c.x, c.y, c.size, c.size);
        }
        if (st === 3) {                           // 완전히 타서 사라짐
          L.erase();
          L.rect(c.x - 0.5, c.y - 0.5, c.size + 1, c.size + 1);
          L.noErase();
          if (random() < 0.06) Particles.spark(A.x + c.x, A.y + c.y);
          if (random() < 0.03) Particles.flake(A.x + c.x, A.y + c.y);
        }
        c.state = st;
      }
      image(L, A.x, A.y);
      // 불씨(주황빛 가장자리)
      noStroke();
      for (const c of this.cells) {
        if (c.state === 1) {
          fill(255, random(110, 190), 40, random(170, 255));
          rect(A.x + c.x, A.y + c.y, c.size, c.size);
        } else if (c.state === 2 && t - c.th < 0.08) {
          fill(200, 60, 20, 120);
          rect(A.x + c.x, A.y + c.y, c.size, c.size);
        }
      }
      if (t > 1.3) { this.phase = 'ash'; this.start = millis(); }
    }

    if (this.phase === 'ash') {
      // 잿조각이 나타났다가 서랍으로 들어간다
      const from = { x: A.x + A.w / 2, y: A.y + A.h / 2 };
      const to = { x: LAYOUT.handle.x, y: LAYOUT.drawer.y + 20 };
      if (elapsed < 1.6) {
        drawAsh(from.x, from.y, 1.2, this.ash, 255 * easeOut(elapsed / 0.6));
      } else {
        const k = easeInOut((elapsed - 1.6) / 1.1);
        drawAsh(lerp(from.x, to.x, k), lerp(from.y, to.y, k) - Math.sin(k * PI) * 60,
          lerp(1.2, 0.45, k), this.ash, 255 * (1 - Math.max(0, k - 0.85) / 0.15));
      }
      if (elapsed > 2.8) {
        this.active = false;
        this.layer.remove();
        if (this.onDone) this.onDone();
      }
    }
  },

  // 잿조각이 서랍에 들어가는 순간 서랍을 살짝 열어 보이기 위한 값
  drawerBump() {
    if (!this.active || this.phase !== 'ash') return 0;
    const e = (millis() - this.start) / 1000;
    if (e < 1.6) return 0;
    return 0.25 * Math.sin(Math.min(1, (e - 1.6) / 1.2) * PI);
  }
};

// ---------- 잿조각 날려보내기 ----------
const BlowAway = {
  active: false,
  ash: null, x: 0, y: 0, sc: 1, start: 0,

  begin(ash, x, y, sc) {
    this.ash = ash; this.x = x; this.y = y; this.sc = sc;
    this.start = millis();
    this.active = true;

    // 잿조각 모양 안쪽에 점을 흩뿌려 입자로 만든다
    const pts = ashShape(hashString(ash.id));
    let made = 0;
    while (made < 340) {
      const lx = random(-48, 48), ly = random(-30, 30);
      if (!pointInPolygon(lx, ly, pts)) continue;
      const g = random(90, 160);
      Particles.add({
        x: x + lx * sc, y: y + ly * sc,
        vx: random(0.5, 2), vy: random(-1.2, 0.2),
        wind: 0.06, gravity: -0.012,
        delay: Math.floor(((lx + 48) / 96) * 50 + random(0, 15)), // 왼쪽부터 차례로 흩어짐
        life: 0, maxLife: random(110, 190), size: random(1.5, 4),
        col: [g, g - 4, g - 8], glow: false
      });
      made++;
    }
  },

  draw() {
    if (!this.active) return;
    const e = (millis() - this.start) / 1000;
    if (e < 1.2) drawAsh(this.x, this.y, this.sc, this.ash, 255 * (1 - e / 1.2));
    if (e > 4.5) this.active = false;
  }
};

// 점이 다각형 안에 있는지 (반직선 교차 방법)
function pointInPolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
