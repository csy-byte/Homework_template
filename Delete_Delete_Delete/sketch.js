// 색 바꾸기
const COLORS = {
  wall: '#d3dfe0', floor: '#414d44', table: '#fce4ce', leg: '#1b251f',
  ink: '#293b34', blue: '#3151c2', cyan: '#a7e7fa', aqua: '#9af1f5',
  mint: '#b8fbd4', green: '#cfffcc', greenDark: '#48a368',
  yellow: '#f4ffa5', lavender: '#a895ff', pink: '#eea4b7',
  white: '#fffefd', paperEdge: '#dce5e6', cutterDark: '#315735'
};

// 움직임 바꾸기
const SETTINGS = {
  wallHeight: 200,     // 책상 위로 보이는 벽 높이
  gravity: 1.5,        // 낙하 속도
  friction: 0.025,     // 책상 위에서 멈추는 정도
  throwPower: 1.1,     // 던지는 힘
  maxSpeed: 32,        // 최고 속도
  fragmentLife: 900    // 조각이 남는 시간
};

// x, y = 책상 안의 위치 비율 / w, h = 크기 / angle = 각도 / mass = 무게
const ITEM_CONFIG = [
  { id: 'blue-book', type: 'book', x: .19, y: .14, w: 187, h: 144, angle: -30, color: 'aqua', mass: 8 },
  { id: 'mint-book', type: 'book', x: .16, y: .43, w: 155, h: 181, angle: 28, color: 'mint', mass: 2.3 },
  { id: 'yellow-pencil', type: 'pencil', x: .46, y: .23, w: 18, h: 217, angle: 26, color: 'yellow', mass: .45 },
  { id: 'green-cup', type: 'cup', x: .65, y: .17, w: 114, h: 132, angle: 0, color: 'green', top: 'greenDark', handle: -1, mass: 1 },
  { id: 'blue-cup', type: 'cup', x: .84, y: .34, w: 144, h: 160, angle: 0, color: 'cyan', top: 'blue', handle: 1, mass: 1.2 },
  { id: 'eraser', type: 'eraser', x: .59, y: .54, w: 59, h: 122, angle: 25, color: 'cyan', mass: .65 },
  { id: 'paper', type: 'paper', x: .34, y: .79, w: 173, h: 206, angle: -5, color: 'white', mass: .5 },
  { id: 'purple-pencil', type: 'pencil', x: .04, y: .77, w: 19, h: 213, angle: -24, color: 'lavender', mass: .45 },
  { id: 'cutter', type: 'cutter', x: .80, y: .81, w: 65, h: 231, angle: -16, color: 'green', mass: 3.4 },
  { id: 'mint-pencil', type: 'pencil', x: .96, y: .81, w: 20, h: 204, angle: 27, color: 'mint', mass: .45 }
];

// 엔진 = 움직임 계산 / 바디 = 충돌용 도형
const { Engine, Bodies, Body, Composite, Constraint, Events } = Matter;
let engine, floorBody, canvasElement, layout;
let items = [], fragments = [], pendingBreaks = new Set();
let gesture = null, dragConstraint = null;
let clock = 0, accumulator = 0;
let showTitle = true;
let view = { scale: 1, x: 0, y: 0 };
const STEP = 1000 / 120;

function setup() {
  const canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent(document.querySelector('main'));
  canvasElement = canvas.elt;
  pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
  layout = makeLayout();
  engine = Engine.create({ positionIterations: 8, velocityIterations: 8 });
  engine.gravity.y = SETTINGS.gravity;
  Events.on(engine, 'collisionStart', handleCollisions);
  Events.on(engine, 'collisionActive', handleCollisions);
  canvasElement.addEventListener('pointerdown', pointerDown);
  canvasElement.addEventListener('pointermove', pointerMove);
  canvasElement.addEventListener('pointerup', pointerUp);
  canvasElement.addEventListener('pointercancel', cancelGesture);
  canvasElement.addEventListener('lostpointercapture', cancelGesture);
  canvasElement.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('blur', cancelGesture);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelGesture();
    accumulator = 0;
  });
  resetDesk();
}

function makeLayout() {
  // 창 전체를 사용. 오른쪽 책상은 화면 밖
  view.scale = height / 1000;
  const w = width / view.scale;
  return {
    w, h: 1000,
    left: w * .35,
    top: SETTINGS.wallHeight,
    back: SETTINGS.wallHeight + 70,
    front: 750,
    right: w * 1.08,
    horizon: 430,
    floor: 940,
    objectScale: Math.min(1, w / 1250),
    tilt: w * .07
  };
}

function leftEdge(y) {
  return layout.left + layout.tilt * (layout.front - y) / (layout.front - layout.back);
}

function homePosition(config) {
  const y = layout.back + (layout.front - layout.back) * config.y;
  const left = leftEdge(y);
  // 물건은 화면 안에, 책상은 화면 밖까지
  return { x: left + (layout.w * .94 - left) * config.x, y };
}

function resetDesk() {
  cancelGesture();
  Composite.clear(engine.world, false);
  Engine.clear(engine);
  fragments = [];
  pendingBreaks.clear();
  accumulator = 0;
  createFloor();
  items = ITEM_CONFIG.map(createItem);
  showTitle = true;
}

function createFloor() {
  floorBody = Bodies.rectangle(layout.w / 2, layout.floor + 80, layout.w + 3000, 160, {
    isStatic: true, collisionFilter: { category: 2, mask: 2 | 4 }
  });
  Composite.add(engine.world, floorBody);
}

function createItem(config) {
  const p = homePosition(config);
  const w = config.w * layout.objectScale, h = config.h * layout.objectScale;
  const body = Bodies.rectangle(p.x, p.y, w * .9, h * .9, {
    angle: config.angle * Math.PI / 180, restitution: .35,
    frictionAir: SETTINGS.friction, collisionFilter: { category: 1, mask: 1 }
  });
  Body.setMass(body, config.mass);
  const item = { config, body, w, h, state: 'surface' };
  body.plugin.item = item;
  Composite.add(engine.world, body);
  return item;
}

function draw() {
  accumulator += Math.min(deltaTime, 50);
  while (accumulator >= STEP) {
    clock += STEP;
    physicsStep();
    accumulator -= STEP;
  }
  background(COLORS.wall);
  push();
  scale(view.scale);
  noStroke();
  fill(COLORS.floor);
  rect(0, layout.horizon, layout.w, layout.h);
  fill(COLORS.leg);
  rect(layout.left, layout.front, 75 * layout.objectScale, layout.h);
  fill(COLORS.table);

  // 책상을 내려 벽을 보여주기. 오른쪽은 화면 밖
  const top = layout.top;
  quad(leftEdge(top), top, layout.right, top,
    layout.right, layout.front, layout.left, layout.front);

  for (const item of items) if (item.state === 'surface') drawItem(item);
  for (const item of items) if (item.state === 'falling') drawItem(item);
  drawFragments();

  // 처음에 나오는 문구
  if (showTitle) {
    fill(COLORS.ink);
    textAlign(CENTER, CENTER);
    textFont('Arial');
    textSize(Math.min(64, layout.w * .085));
    text('Clear the table', layout.w / 2, layout.top / 2);
  }
  pop();
}

function physicsStep() {
  for (const item of items) {
    if (item.state === 'removed') continue;
    const b = item.body;
    const held = gesture && gesture.dragging && gesture.item === item;
    if (item.state === 'surface' || held) {
      // 책상 또는 손이 받쳐주므로 중력을 상쇄
      Body.applyForce(b, b.position, {
        x: 0,
        y: -b.mass * engine.gravity.y * engine.gravity.scale
      });
    }
    if (item.state === 'surface' && !held) {
      keepInReach(item);
      if (b.position.x < leftEdge(b.position.y) - 8 || b.position.y > layout.front + 8) {
        beginFall(item);
      }
    }
    if (item.state === 'falling' && !held) {
      const margin = Math.max(item.w * .45, 12);
      if (b.position.x < margin || b.position.x > layout.w - margin) {
        Body.setPosition(b, {
          x: Math.max(margin, Math.min(layout.w - margin, b.position.x)),
          y: b.position.y
        });
        Body.setVelocity(b, { x: -b.velocity.x * .35, y: b.velocity.y });
      }
    }
  }
  Engine.update(engine, STEP);
  for (const item of pendingBreaks) {
    if (item.state === 'removed') continue;
    if (gesture && gesture.item === item) cancelGesture();
    burst(item);
    deleteItem(item);
  }
  pendingBreaks.clear();
  fragments = fragments.filter(f => {
    if (clock - f.born <= SETTINGS.fragmentLife) return true;
    Composite.remove(engine.world, f.body);
    return false;
  });
}

function keepInReach(item) {
  const b = item.body;
  const minY = layout.top + item.h * .5;
  const maxX = layout.w - item.w * .5;
  if (b.position.y < minY) {
    Body.setPosition(b, { x: b.position.x, y: minY });
    Body.setVelocity(b, { x: b.velocity.x, y: Math.abs(b.velocity.y) * .4 });
  }
  if (b.position.x > maxX) {
    Body.setPosition(b, { x: maxX, y: b.position.y });
    Body.setVelocity(b, { x: -Math.abs(b.velocity.x) * .4, y: b.velocity.y });
  }
}

function beginFall(item) {
  item.state = 'falling';
  item.body.frictionAir = .008;
  item.body.collisionFilter.category = 2;
  item.body.collisionFilter.mask = 2;
  Body.setAngularVelocity(item.body, item.body.angularVelocity + .018);
}

function handleCollisions(event) {
  // 바닥과 충돌하면 조각으로 바꾸기
  for (const pair of event.pairs) {
    for (const [floor, object] of [[pair.bodyA, pair.bodyB], [pair.bodyB, pair.bodyA]]) {
      const item = object.plugin.item;
      if (floor === floorBody && item && item.state === 'falling' &&
          !(gesture && gesture.dragging && gesture.item === item)) {
        pendingBreaks.add(item);
      }
    }
  }
}

function deleteItem(item) {
  Composite.remove(engine.world, item.body);
  item.state = 'removed';
}

function burst(item) {
  const p = item.body.position;
  const colors = [COLORS[item.config.color], COLORS.white];
  for (let i = 0; i < 7; i++) {
    const size = random(13, 30) * layout.objectScale;
    const b = Bodies.polygon(
      p.x + random(-item.w * .3, item.w * .3),
      Math.min(p.y, layout.floor - 20),
      3,
      size,
      {
        restitution: .42,
        frictionAir: .018,
        collisionFilter: { category: 4, mask: 2 }
      }
    );
    Body.setVelocity(b, { x: random(-5, 5), y: random(-8, -3) });
    Body.setAngularVelocity(b, random(-.18, .18));
    Composite.add(engine.world, b);
    fragments.push({ body: b, born: clock, color: colors[i % colors.length] });
  }
}

// 마우스와 터치를 같은 방식으로 받기
function pointerPosition(event) {
  const r = canvasElement.getBoundingClientRect();
  return {
    x: (event.clientX - r.left) / view.scale,
    y: (event.clientY - r.top) / view.scale
  };
}

function pickItem(p) {
  const padding = Math.min(30, 9 / view.scale);
  // 화면에 나중에 그린 물건부터 선택
  const visible = items.filter(i => i.state === 'surface')
    .concat(items.filter(i => i.state === 'falling'));
  for (const item of visible.reverse()) {
    const b = item.body, dx = p.x - b.position.x, dy = p.y - b.position.y;
    const x = dx * Math.cos(b.angle) + dy * Math.sin(b.angle);
    const y = -dx * Math.sin(b.angle) + dy * Math.cos(b.angle);
    const handle = item.config.type === 'cup' ? item.w * .25 : 0;
    if (Math.abs(x) < item.w / 2 + padding + handle &&
        Math.abs(y) < item.h / 2 + padding) return item;
  }
  return null;
}

function pointerDown(event) {
  if (gesture || event.isPrimary === false || event.button > 0) return;
  event.preventDefault();
  const p = pointerPosition(event), item = pickItem(p);
  if (!item) return;
  showTitle = false; // 처음 물건을 누르면 문구 숨기기
  const t = event.timeStamp;
  gesture = {
    id: event.pointerId,
    item,
    start: p,
    screenX: event.clientX,
    screenY: event.clientY,
    time: t,
    moved: 0,
    dragging: false,
    samples: [{ ...p, t }]
  };
  canvasElement.setPointerCapture(event.pointerId);
}

function updateGesture(event) {
  const g = gesture, p = pointerPosition(event), t = event.timeStamp;
  g.moved = Math.max(g.moved,
    Math.hypot(event.clientX - g.screenX, event.clientY - g.screenY));

  // 조금 움직였을 때부터 드래그 시작. 탭과 구별
  if (!g.dragging && g.moved > 9) {
    g.dragging = true;
    const b = g.item.body;
    dragConstraint = Constraint.create({
      pointA: p,
      bodyB: b,
      pointB: {
        x: g.start.x - b.position.x,
        y: g.start.y - b.position.y
      },
      length: 0,
      stiffness: .35,
      damping: .18
    });
    Composite.add(engine.world, dragConstraint);
    canvasElement.style.cursor = 'grabbing';
  }
  if (dragConstraint) dragConstraint.pointA = p;
  g.samples.push({ ...p, t });
  g.samples = g.samples.filter(s => t - s.t <= 110);
  return p;
}

function pointerMove(event) {
  if (!gesture) {
    canvasElement.style.cursor = pickItem(pointerPosition(event)) ? 'grab' : 'default';
    return;
  }
  if (event.pointerId !== gesture.id) return;
  event.preventDefault();
  updateGesture(event);
}

function pointerUp(event) {
  if (!gesture || event.pointerId !== gesture.id) return;
  event.preventDefault();
  const g = gesture, item = g.item;
  const end = updateGesture(event), first = g.samples[0];
  finishGesture();

  if (!g.dragging) {
    if (event.timeStamp - g.time < 700) deleteItem(item);
    return;
  }

  // 손을 뗄 때의 이동 속도를 물건에 전달
  const duration = Math.max(16, event.timeStamp - first.t);
  let vx = (end.x - first.x) / duration * 16.667 * SETTINGS.throwPower;
  let vy = (end.y - first.y) / duration * 16.667 * SETTINGS.throwPower;
  const speed = Math.hypot(vx, vy);
  if (speed > SETTINGS.maxSpeed) {
    vx *= SETTINGS.maxSpeed / speed;
    vy *= SETTINGS.maxSpeed / speed;
  }
  Body.setVelocity(item.body, { x: vx, y: vy });
  if (item.state === 'surface' &&
      (item.body.position.x < leftEdge(item.body.position.y) - 8 ||
       item.body.position.y > layout.front + 8)) {
    beginFall(item);
  }
}

function finishGesture() {
  const id = gesture && gesture.id;
  gesture = null;
  if (dragConstraint) Composite.remove(engine.world, dragConstraint);
  dragConstraint = null;
  if (id != null && canvasElement.hasPointerCapture(id)) {
    canvasElement.releasePointerCapture(id);
  }
  canvasElement.style.cursor = 'default';
}

function cancelGesture() {
  if (!gesture) return;
  const item = gesture.item;
  finishGesture();
  Body.setVelocity(item.body, { x: 0, y: 0 });
}

// 그림은 전부 p5 기본 도형
function drawItem(item) {
  const b = item.body;
  push();
  translate(b.position.x, b.position.y);
  rotate(b.angle);
  const w = item.w, h = item.h, config = item.config;
  noStroke();

  if (config.type === 'book') {
    fill(config.id === 'blue-book' ? '#819abe' : '#98d5b6');
    rect(-w / 2 - 7, -h / 2 + 5, w + 11, h);
    fill(COLORS[config.color]);
    rect(-w / 2, -h / 2, w, h);

  } else if (config.type === 'cup') {
    // 손잡이: 굵은 선으로 그린 타원
    noFill();
    stroke(COLORS[config.color]);
    strokeWeight(w * .085);
    ellipse(config.handle * w * .49, h * .18, w * .48, h * .45);
    noStroke();
    fill(COLORS[config.color]);
    quad(-w / 2, -h * .27, w / 2, -h * .27, w * .37, h / 2, -w * .38, h / 2);
    fill(COLORS[config.top]);
    ellipse(0, -h * .27, w, h * .49);

  } else if (config.type === 'pencil') {
    fill(COLORS[config.color]);
    rect(-w / 2, -h / 2 + 32, w, h - 32);
    fill(COLORS.pink);
    triangle(-w / 2, -h / 2 + 32, w / 2, -h / 2 + 32, 0, -h / 2);
    fill('#322e33');
    triangle(-w * .2, -h / 2 + 13, w * .2, -h / 2 + 13, 0, -h / 2);

  } else if (config.type === 'eraser') {
    fill(COLORS.white);
    rect(-w / 2, -h / 2, w, h);
    fill(COLORS[config.color]);
    rect(-w / 2, -h / 2 + h * .3, w, h * .7);

  } else if (config.type === 'paper') {
    push();
    rotate(-.13);
    fill(COLORS.white);
    rect(-w / 2 - 19, -h / 2 + 25, w, h);
    pop();
    fill(COLORS.paperEdge);
    rect(-w / 2 - 4, -h / 2 + 3, w + 4, h);
    fill(COLORS.white);
    rect(-w / 2, -h / 2, w, h);

  } else if (config.type === 'cutter') {
    fill('#f9faff');
    quad(-w * .35, -h / 2 + 53, w * .34, -h / 2 + 53,
      w * .34, -h / 2 + 18, -w * .35, -h / 2);
    fill(COLORS[config.color]);
    rect(-w / 2, -h / 2 + 53, w, h - 53);
    fill('#689e7c');
    rect(-w * .14, -h / 2 + 53, w * .28, h - 53);
    rect(w / 2 - 3, -h / 2 + 53, 3, h - 53);
    fill(COLORS.cutterDark);
    rect(-w * .33, -h * .02, w * .66, h * .19);
  }
  pop();
}

function drawFragments() {
  noStroke();
  for (const f of fragments) {
    const c = color(f.color);
    c.setAlpha(255 * Math.max(0, 1 - (clock - f.born) / SETTINGS.fragmentLife));
    fill(c);
    beginShape();
    for (const p of f.body.vertices) vertex(p.x, p.y);
    endShape(CLOSE);
  }
}

function windowResized() {
  cancelGesture();
  const old = layout;
  resizeCanvas(windowWidth, windowHeight);
  layout = makeLayout();
  const ratio = layout.objectScale / old.objectScale;
  for (const item of items) {
    if (item.state === 'removed') continue;
    const p = item.body.position;
    const oldLeft = old.left + old.tilt * (old.front - p.y) / (old.front - old.back);
    const x = (p.x - oldLeft) / (old.w * .94 - oldLeft);
    const y = (p.y - old.back) / (old.front - old.back);
    const next = item.state === 'surface'
      ? homePosition({ x, y })
      : { x: p.x / old.w * layout.w, y: p.y };
    Body.scale(item.body, ratio, ratio);
    Body.setMass(item.body, item.config.mass);
    Body.setPosition(item.body, next);
    item.w *= ratio;
    item.h *= ratio;
  }
  for (const f of fragments) Composite.remove(engine.world, f.body);
  fragments = [];
  pendingBreaks.clear();
  Composite.remove(engine.world, floorBody);
  createFloor();
  accumulator = 0;
}