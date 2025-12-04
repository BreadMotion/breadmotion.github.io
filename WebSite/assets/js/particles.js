/**
 * particles.js
 * --------------------------------------------------
 * 背景パーティクルアニメーションを生成するスクリプト。
 * p5.js を使用し、5種類のビジュアルモードをランダムで表示。
 *
 * モード一覧:
 *   0: Network, 1: Cosmos, 2: Polygons,
 *   3: Circuit, 4: Grid
 * --------------------------------------------------
 */
let canvas;
let particles = [];
let mode = 0;
// 0: Network, 1: Cosmos, 2: Polygons
// 3: Circuit, 4: Grid
const NUM_MODES = 5;
const modeNames = [
  "Network",
  "Cosmos",
  "Polygons",
  "Circuit",
  "Grid",
];

// サイトのテーマカラー（Indigo, SkyBlue, Whiteish + Alpha variants）
const themeColors = [
  [99, 102, 241], // #6366f1
  [56, 189, 248], // #38bdf8
  [226, 232, 240], // #e2e8f0
];

function setup() {
  let w = document.documentElement.clientWidth;
  let h = windowHeight;

  canvas = createCanvas(w, h);
  canvas.position(0, 0);
  canvas.style("position", "fixed");
  canvas.style("z-index", "-1");
  canvas.style("pointer-events", "none");

  // ランダムにモード決定
  mode = floor(random(NUM_MODES));

  initParticles();
}

function draw() {
  clear(); // 背景クリア

  switch (mode) {
    case 0:
      drawNetwork();
      break;
    case 1:
      drawCosmos();
      break;
    case 2:
      drawPolygons();
      break;
    case 3:
      drawCircuit();
      break;
    case 4:
      drawGrid();
      break;
  }
}

function windowResized() {
  let w = document.documentElement.clientWidth;
  let h = windowHeight;
  resizeCanvas(w, h);
  initParticles();
}

function initParticles() {
  particles = [];
  let area = width * height;
  let count = 0;

  if (mode === 0) {
    // Network
    count = constrain(Math.floor(area / 12000), 40, 130);
    for (let i = 0; i < count; i++)
      particles.push(new NetworkParticle());
  } else if (mode === 1) {
    // Cosmos
    count = constrain(Math.floor(area / 4000), 80, 250);
    for (let i = 0; i < count; i++)
      particles.push(new StarParticle());
  } else if (mode === 2) {
    // Polygons
    count = constrain(Math.floor(area / 20000), 15, 40);
    for (let i = 0; i < count; i++)
      particles.push(new PolygonParticle());
  } else if (mode === 3) {
    // Circuit
    count = constrain(Math.floor(area / 15000), 15, 40);
    for (let i = 0; i < count; i++)
      particles.push(new CircuitPulse());
  } else if (mode === 4) {
    // Grid
    let step = 50; // グリッド間隔
    for (let x = step / 2; x < width; x += step) {
      for (let y = step / 2; y < height; y += step) {
        particles.push(new GridPoint(x, y));
      }
    }
  }
}

// ------------------------------------------------------------
// Mode 0: Network
// ------------------------------------------------------------
class NetworkParticle {
  constructor() {
    this.pos = createVector(random(width), random(height));
    this.vel = p5.Vector.random2D().mult(random(0.3, 0.8));
    this.size = random(2, 4.5);
    this.color = random(themeColors);
  }
  update() {
    this.pos.add(this.vel);
    if (this.pos.x < 0 || this.pos.x > width) {
      this.vel.x *= -1;
      this.pos.x = constrain(this.pos.x, 0, width);
    }
    if (this.pos.y < 0 || this.pos.y > height) {
      this.vel.y *= -1;
      this.pos.y = constrain(this.pos.y, 0, height);
    }
  }
  display() {
    noStroke();
    fill(this.color[0], this.color[1], this.color[2], 200);
    circle(this.pos.x, this.pos.y, this.size);
  }
}

function drawNetwork() {
  let mouse = createVector(mouseX, mouseY);
  let isMouseActive =
    mouseX > 0 &&
    mouseX < width &&
    mouseY > 0 &&
    mouseY < height;
  const connectionDistance = 150;
  const mouseInteractionDistance = 200;

  for (let i = 0; i < particles.length; i++) {
    let p = particles[i];
    p.update();
    p.display();

    // マウスとの線
    if (isMouseActive) {
      let d = p.pos.dist(mouse);
      if (d < mouseInteractionDistance) {
        let alpha = map(
          d,
          0,
          mouseInteractionDistance,
          150,
          0,
        );
        stroke(p.color[0], p.color[1], p.color[2], alpha);
        strokeWeight(1);
        line(p.pos.x, p.pos.y, mouse.x, mouse.y);
      }
    }

    // 粒子同士の線
    for (let j = i + 1; j < particles.length; j++) {
      let other = particles[j];
      let d = p.pos.dist(other.pos);
      if (d < connectionDistance) {
        let alpha = map(d, 0, connectionDistance, 120, 0);
        stroke(p.color[0], p.color[1], p.color[2], alpha);
        strokeWeight(1);
        line(p.pos.x, p.pos.y, other.pos.x, other.pos.y);
      }
    }
  }
}

// ------------------------------------------------------------
// Mode 1: Cosmos
// ------------------------------------------------------------
class StarParticle {
  constructor() {
    this.pos = createVector(random(width), random(height));
    this.vel = createVector(
      random(-0.1, 0.1),
      random(-0.1, 0.1),
    );
    this.baseSize = random(1, 3);
    this.color = random(themeColors);
    this.twinkleSpeed = random(0.02, 0.08);
    this.twinkleOffset = random(TWO_PI);
  }
  update() {
    this.pos.add(this.vel);
    if (this.pos.x < 0) this.pos.x = width;
    if (this.pos.x > width) this.pos.x = 0;
    if (this.pos.y < 0) this.pos.y = height;
    if (this.pos.y > height) this.pos.y = 0;
  }
  display() {
    let val = sin(
      frameCount * this.twinkleSpeed + this.twinkleOffset,
    );
    let size = map(
      val,
      -1,
      1,
      this.baseSize * 0.5,
      this.baseSize * 1.5,
    );
    let alpha = map(val, -1, 1, 100, 255);
    noStroke();
    fill(
      this.color[0],
      this.color[1],
      this.color[2],
      alpha * 0.3,
    );
    circle(this.pos.x, this.pos.y, size * 3);
    fill(255, 255, 255, alpha);
    circle(this.pos.x, this.pos.y, size * 0.8);
  }
}
function drawCosmos() {
  let mouse = createVector(mouseX, mouseY);
  let isMouseActive =
    mouseX > 0 &&
    mouseX < width &&
    mouseY > 0 &&
    mouseY < height;
  for (let p of particles) {
    if (isMouseActive) {
      let d = p.pos.dist(mouse);
      if (d < 100) {
        let force = p5.Vector.sub(p.pos, mouse);
        force.setMag(0.5);
        p.pos.add(force);
      }
    }
    p.update();
    p.display();
  }
}

// ------------------------------------------------------------
// Mode 2: Polygons
// ------------------------------------------------------------
class PolygonParticle {
  constructor() {
    this.pos = createVector(random(width), random(height));
    this.vel = p5.Vector.random2D().mult(random(0.2, 0.6));
    this.radius = random(10, 25);
    this.sides = floor(random(3, 6)); // 三角形〜五角形
    this.color = random(themeColors);
    this.rotation = random(TWO_PI);
    this.rotSpeed = random(-0.02, 0.02);
  }
  update() {
    this.pos.add(this.vel);
    this.rotation += this.rotSpeed;
    if (this.pos.x < -50 || this.pos.x > width + 50)
      this.vel.x *= -1;
    if (this.pos.y < -50 || this.pos.y > height + 50)
      this.vel.y *= -1;
  }
  display() {
    noFill();
    stroke(
      this.color[0],
      this.color[1],
      this.color[2],
      150,
    );
    strokeWeight(1);
    push();
    translate(this.pos.x, this.pos.y);
    rotate(this.rotation);
    beginShape();
    for (let i = 0; i < this.sides; i++) {
      let angle = map(i, 0, this.sides, 0, TWO_PI);
      let sx = cos(angle) * this.radius;
      let sy = sin(angle) * this.radius;
      vertex(sx, sy);
    }
    endShape(CLOSE);
    pop();
  }
}
function drawPolygons() {
  for (let p of particles) {
    p.update();
    p.display();
  }
}

// ------------------------------------------------------------
// Mode 3: Circuit (Electronic Circuit Pulse)
// ------------------------------------------------------------
class CircuitPulse {
  constructor() {
    this.init();
  }
  init() {
    this.pos = createVector(random(width), random(height));
    // 20px グリッドにスナップ
    this.pos.x = Math.round(this.pos.x / 20) * 20;
    this.pos.y = Math.round(this.pos.y / 20) * 20;

    this.history = [];
    this.maxLength = random(10, 40);
    this.color = random(themeColors);
    this.speed = 4; // グリッド上を移動する速度

    // 0: right, 1: down, 2: left, 3: up
    this.dir = floor(random(4));
    this.life = 255;
  }

  update() {
    this.life -= 1.5;
    if (this.life < 0) {
      this.init();
      return;
    }

    // 軌跡の保存
    this.history.push(this.pos.copy());
    if (this.history.length > this.maxLength) {
      this.history.shift();
    }

    // 移動
    if (this.dir === 0) this.pos.x += this.speed;
    else if (this.dir === 1) this.pos.y += this.speed;
    else if (this.dir === 2) this.pos.x -= this.speed;
    else if (this.dir === 3) this.pos.y -= this.speed;

    // 画面外リセット
    if (
      this.pos.x < 0 ||
      this.pos.x > width ||
      this.pos.y < 0 ||
      this.pos.y > height
    ) {
      this.init();
    }

    // ランダムに直角に曲がる
    if (random() < 0.03) {
      if (random() < 0.5) {
        this.dir = (this.dir + 1) % 4; // 右回転
      } else {
        this.dir = (this.dir + 3) % 4; // 左回転
      }
    }
  }

  display() {
    noFill();
    // 軌跡を描画
    stroke(
      this.color[0],
      this.color[1],
      this.color[2],
      this.life,
    );
    strokeWeight(1.5);
    beginShape();
    for (let v of this.history) {
      vertex(v.x, v.y);
    }
    vertex(this.pos.x, this.pos.y);
    endShape();

    // 先頭の点
    noStroke();
    fill(255, 255, 255, this.life);
    circle(this.pos.x, this.pos.y, 4);
  }
}
function drawCircuit() {
  for (let p of particles) {
    p.update();
    p.display();
  }
}

// ------------------------------------------------------------
// Mode 4: Grid
// ------------------------------------------------------------
class GridPoint {
  constructor(x, y) {
    this.origPos = createVector(x, y);
    this.pos = this.origPos.copy();
    this.color = random(themeColors);
    this.size = 3;
  }
  update() {
    let mouse = createVector(mouseX, mouseY);
    if (
      mouseX > 0 &&
      mouseX < width &&
      mouseY > 0 &&
      mouseY < height
    ) {
      let d = this.origPos.dist(mouse);
      if (d < 150) {
        let force = p5.Vector.sub(this.origPos, mouse);
        let strength = map(d, 0, 150, 30, 0);
        force.setMag(strength);
        this.pos = p5.Vector.add(this.origPos, force);
      } else {
        this.pos.lerp(this.origPos, 0.1);
      }
    } else {
      this.pos.lerp(this.origPos, 0.1);
    }
  }
  display() {
    noStroke();
    fill(this.color[0], this.color[1], this.color[2], 150);
    circle(this.pos.x, this.pos.y, this.size);
  }
}
function drawGrid() {
  for (let p of particles) {
    p.update();
    p.display();
  }
}
