
const Engine = Matter.Engine;
const Bodies = Matter.Bodies;
const Body = Matter.Body;
const Composite = Matter.Composite;
const Constraint = Matter.Constraint;

// 색
const BACKGROUND_COLOR = "#ffffff";
const DROP_COLOR = "#0559ff";
const FIXED_COLOR = "#2461f09a";
const SEESAW_COLOR = "#000000";
const PIVOT_COLOR = "#bec5f276";

let engine;           // 물리 엔진
let unit;             // 창 크기에 맞춘 도형 크기
let seesaws = [];     // 시소와 축
let dropshapes = [];  // 떨어지는 물체
let fixedshapes = []; // 고정 물체

function setup() {
  // 브라우저 기본 여백 제거
  document.body.style.margin = "0";
  document.body.style.overflow = "hidden";
  document.body.style.background = BACKGROUND_COLOR;

  createCanvas(windowWidth, windowHeight);
  makeWorld();
}

function makeWorld() {
  // 실제 창 크기에서 배치
  unit = min(width / 1564, height / 1182);
  const left = width / 2 - 540 * unit;
  const top = height / 2 - 381 * unit;
  const u = unit;

  // 이전 물체 비우기
  seesaws = [];
  dropshapes = [];
  fixedshapes = [];

  // 아래쪽 중력
  engine = Engine.create();
  engine.constraintIterations = 8; // 축 위치 안정화

  // 고정 타원: x, y, 너비, 높이, 기울기
  addFixedOval(left + 1125*u, top + 130*u, 250*u, 100*u, 0);
  addFixedOval(left + 1007*u, top + 224*u, 228*u,  66*u,  0);
  addFixedOval(left +  926*u, top + 291*u, 228*u,  53*u, 0);
  addFixedOval(left +  822*u, top + 342*u, 228*u,  31*u, 0);
  addFixedOval(left +  733*u, top + 370*u, 184*u,  17*u, 0);

  addFixedOval(left - 149*u, top + 580*u, 104*u, 12*u,  0);
  addFixedOval(left -  99*u, top + 597*u, 130*u, 17*u, 0);
  addFixedOval(left -  39*u, top + 624*u, 128*u, 32*u, 0);
  addFixedOval(left +   8*u, top + 665*u, 130*u, 36*u, 0);
  addFixedOval(left +  75*u, top + 726*u, 176*u, 91*u,  0);

  // 시소: 중심 x, 중심 y, 길이, 축 x, 축 y
  addSeesaw(left + 372*u, top +  56*u, 670*u, left + 278*u, top +  56*u);
  addSeesaw(left +  72*u, top + 451*u, 450*u, left -   8*u, top + 451*u);
  addSeesaw(left + 726*u, top + 604*u, 670*u, left + 848*u, top + 604*u);

  // 떨어지는 물체: x, y, 반지름 또는 한 변
  addDropBall(left + 698*u, top -  85*u, 121*u);
  addDropDiamond(left + 146*u, top + 313*u, 108*u);
  addDropBall(left + 466*u, top + 391*u,  52*u);
  addDropBall(left + 566*u, top + 505*u,  52*u);

  // 위쪽 물체
  addDropBall(left +  98*u, top -  99*u, 92*u);
  addDropBall(left + 384*u, top - 105*u, 26*u);
  addDropBall(left + 493*u, top -  40*u, 26*u);
  addDropDiamond(left + 888*u, top - 110*u, 82*u);
}

function draw() {
  background(BACKGROUND_COLOR);

  // 중력과 충돌 계산
  Engine.update(engine, 1000 / 60);
  noStroke();

  // 고정 물체
  fill(FIXED_COLOR);
  for (const shape of fixedshapes) {
    push();
    translate(shape.body.position.x, shape.body.position.y);
    rotate(shape.body.angle);
    ellipse(0, 0, shape.width, shape.height);
    pop();
  }

  // 시소
  fill(SEESAW_COLOR);
  for (const seesaw of seesaws) {
    push();
    translate(seesaw.bar.position.x, seesaw.bar.position.y);
    rotate(seesaw.bar.angle);
    rectMode(CENTER);
    rect(0, 0, seesaw.width, 36 * unit);
    pop();
  }

  // 떨어지는 물체
  fill(DROP_COLOR);
  for (const shape of dropshapes) {
    if (shape.type === "ball") {
      circle(shape.body.position.x, shape.body.position.y, shape.radius * 2);
    } else {
      // 마름모의 현재 꼭짓점
      beginShape();
      for (const corner of shape.body.vertices) {
        vertex(corner.x, corner.y);
      }
      endShape(CLOSE);
    }
  }

  // 고정 축
  fill(PIVOT_COLOR);
  for (const seesaw of seesaws) {
    circle(seesaw.pivotX, seesaw.pivotY, 52 * unit);
  }
}

function addSeesaw(x, y, barWidth, pivotX, pivotY) {
  // 회전하는 막대
  const bar = Bodies.rectangle(x, y, barWidth, 36 * unit, {
    friction: 0.6,
    frictionAir: 0.01,
    restitution: 0.15,
  });

  // 축: pointA는 고정 위치, pointB는 막대 위 연결점
  const pin = Constraint.create({
    pointA: { x: pivotX, y: pivotY },
    bodyB: bar,
    pointB: { x: pivotX - x, y: pivotY - y },
    length: 0,
    stiffness: 1,
  });

  Composite.add(engine.world, [bar, pin]);
  seesaws.push({ bar: bar, width: barWidth, pivotX: pivotX, pivotY: pivotY });
}

function addDropBall(x, y, radius) {
  // 떨어지는 원
  const ball = Bodies.circle(x, y, radius, {
    restitution: 0.3,
  });

  Composite.add(engine.world, ball);
  dropshapes.push({ body: ball, type: "ball", radius: radius });
}

function addDropDiamond(x, y, side) {
  // 정사각형을 45도 회전
  const diamond = Bodies.rectangle(x, y, side, side, {
    angle: Math.PI / 4,
    restitution: 0.25,
  });

  Composite.add(engine.world, diamond);
  dropshapes.push({ body: diamond, type: "diamond" });
}

function addFixedOval(x, y, ovalWidth, ovalHeight, tiltDegrees) {
  // 다각형을 세로로 눌러 타원 만들기
  const obstacle = Bodies.polygon(x, y, 32, ovalWidth / 2, {
    isStatic: true, // 고정
    friction: 0.6,
  });

  Body.scale(obstacle, 1, ovalHeight / ovalWidth);
  Body.setAngle(obstacle, (tiltDegrees * Math.PI) / 180);

  Composite.add(engine.world, obstacle);
  fixedshapes.push({
    body: obstacle,
    width: ovalWidth,
    height: ovalHeight,
  });
}

function windowResized() {
  // 창 크기 변경 시 처음부터 시작
  resizeCanvas(windowWidth, windowHeight);
  makeWorld();
}