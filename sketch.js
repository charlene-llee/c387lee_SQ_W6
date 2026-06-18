const WORLD_W = 1716; // total world width in pixels
const WORLD_H = 1080; // total world height in pixels

let camX = 0;
let camY = 0;
const CAM_SMOOTHING = 0.1;

const PLAYER_SPEED = 3;
const BULLET_SPEED = 10;
const SHOOT_COOLDOWN = 12;
const INVINCIBLE_FRAMES = 90;

const SPRITE_FRAME_W = 32;
const SPRITE_FRAME_H = 48;
const SPRITE_COLS = 4;

const DIR_DOWN = 0;
const DIR_LEFT = 1;
const DIR_RIGHT = 2;
const DIR_UP = 3;

const ANIM_FRAME_DELAY = 8;

let player = {
  x: WORLD_W / 2,
  y: WORLD_H - 200,
  r: 22,
  direction: { x: 0, y: -1 },
  facing: DIR_UP,
  animFrame: 0,
  animTimer: 0,
  shootTimer: 0,
  health: 5,
  maxHealth: 5,
  invincible: false,
  invincibleTimer: 0,
  bounceVX: 0,
  bounceVY: 0,
};

// ------------------------------------------------------------
// BULLETS and ENEMIES
// Positions are in world coordinates.
// ------------------------------------------------------------
let bullets = [];
let enemies = [];

// ------------------------------------------------------------
// OBSTACLES
// Loaded from data/obstacles.json in preload().
// Positioned in world coordinates — drawn and collided in
// world space. Player takes damage and bounces on contact.
// ------------------------------------------------------------
let obstacleData;
let obstacles = [];

// ------------------------------------------------------------
// WAVE SYSTEM
// Each wave has a triggerY — spawns when player.y < triggerY.
// nextWave tracks which wave to check next.
// ------------------------------------------------------------
let enemyData;
let nextWave = 0;

// ------------------------------------------------------------
// BOSS
// Spawns when player enters the boss zone (player.y < bossZoneY).
// ------------------------------------------------------------
let boss = null;
let bossData = null;
const BOSS_ZONE_Y = 300; // world Y — enter this zone to trigger boss

// ------------------------------------------------------------
// BACKGROUND SHAPES
// Scattered across the world — drawn in world coordinates.
// ------------------------------------------------------------
let bgShapes = [];

// ------------------------------------------------------------
// MINIMAP
// Drawn in screen coordinates after pop().
// Shows a scaled-down version of the world with dots for
// the player (teal) and enemies (orange).
// ------------------------------------------------------------
const MAP_W = 120; // minimap width in pixels
const MAP_H = 120; // minimap height in pixels
const MAP_X = 16; // screen position — bottom left
const MAP_Y_OFFSET = 16; // offset from bottom of screen

// ------------------------------------------------------------
// GAME STATE
// ------------------------------------------------------------
let score = 0;

const STATE_PLAY = "play";
const STATE_BOSS = "boss";
const STATE_WIN = "win";
const STATE_OVER = "over";
let gameState = STATE_PLAY;

let playerSheet;

function preload() {
  enemyData = loadJSON("data/enemies.json");
  obstacleData = loadJSON("data/obstacles.json");

  playerSheet = loadImage("assets/images/player_grey.png");
  enemySheet = loadImage("assets/images/enemy_blue.png");
  bossSheet = loadImage("assets/images/enemy_blue.png");
  // NEW — background image
  backgroundImg = loadImage("assets/images/background.jpeg");

  // NEW — sounds
  mainTheme = loadSound("assets/sounds/maintheme.mp3");
  shootSound = loadSound("assets/sounds/damage.mp3");
  hitSound = loadSound("assets/sounds/gunshot.mp3");
}

function setup() {
  createCanvas(800, 450);
  bossData = enemyData.boss;

  // Build obstacle objects from JSON
  for (let i = 0; i < obstacleData.obstacles.length; i++) {
    let o = obstacleData.obstacles[i];
    obstacles.push({ x: o.x, y: o.y, size: o.size });
  }

  for (let i = 0; i < 120; i++) {
    bgShapes.push({
      x: random(WORLD_W),
      y: random(WORLD_H),
      type: random() > 0.5 ? "circle" : "rect",
      size: random(10, 50),
      r: floor(random(30, 70)),
      g: floor(random(30, 70)),
      b: floor(random(50, 100)),
    });
  }

  camX = player.x - width / 2;
  camY = player.y - height / 2;
}

function draw() {
  background(20);

  updateCamera();

  // Everything inside push/pop is drawn in world coordinates
  push();
  translate(-camX, -camY);

  drawBackground();
  drawBossZone();

  if (gameState === STATE_PLAY) {
    handleInput();
    applyBounce();
    updateBullets();
    updateEnemies();
    checkWaveSpawns();
    checkBossZone();
    checkBulletEnemyCollisions();
    checkEnemyPlayerCollision();
    checkObstaclePlayerCollision();
    updateInvincibility();
    drawObstacles();
    drawEnemies();
    drawBullets();
    drawPlayer();
  } else if (gameState === STATE_BOSS) {
    handleInput();
    applyBounce();
    updateBullets();
    updateBoss();
    checkBulletBossCollision();
    checkBossPlayerCollision();
    checkObstaclePlayerCollision();
    updateInvincibility();
    drawObstacles();
    drawBoss();
    drawBullets();
    drawPlayer();
  }

  pop(); // restore screen coordinates

  // HUD and minimap are drawn in screen coordinates
  drawHUD();
  drawMinimap();

  if (gameState === STATE_BOSS) drawBossHUD();
  if (gameState === STATE_WIN) drawWinScreen();
  if (gameState === STATE_OVER) drawGameOver();
}

function updateCamera() {
  let targetX = player.x - width / 2;
  let targetY = player.y - height / 2;

  targetX = constrain(targetX, 0, WORLD_W - width);
  targetY = constrain(targetY, 0, WORLD_H - height);

  camX = lerp(camX, targetX, CAM_SMOOTHING);
  camY = lerp(camY, targetY, CAM_SMOOTHING);
}

function drawObstacles() {
  for (let i = 0; i < obstacles.length; i++) {
    let o = obstacles[i];

    // Skip if off screen
    if (
      o.x + o.size < camX ||
      o.x - o.size > camX + width ||
      o.y + o.size < camY ||
      o.y - o.size > camY + height
    )
      continue;

    let x = o.x - o.size / 2;
    let y = o.y - o.size / 2;
    let s = o.size;

    // Base box
    fill(40); // dark grey
    stroke(255); // white diagonal lines
    strokeWeight(2);
    rect(x, y, s, s);

    // Diagonal stripes
    line(x, y, x + s, y + s);
    line(x + s * 0.25, y, x + s, y + s * 0.75);
    line(x, y + s * 0.25, x + s * 0.75, y + s);
  }
}

function checkObstaclePlayerCollision() {
  if (player.invincible) return;

  for (let i = 0; i < obstacles.length; i++) {
    let o = obstacles[i];

    let closestX = constrain(player.x, o.x - o.size / 2, o.x + o.size / 2);
    let closestY = constrain(player.y, o.y - o.size / 2, o.y + o.size / 2);
    let d = dist(player.x, player.y, closestX, closestY);

    if (d < player.r) {
      player.health--;
      player.invincible = true;
      player.invincibleTimer = INVINCIBLE_FRAMES;

      // Bounce direction — away from obstacle centre
      let dx = player.x - o.x;
      let dy = player.y - o.y;
      let len = dist(0, 0, dx, dy);
      if (len > 0) {
        player.bounceVX = (dx / len) * 8;
        player.bounceVY = (dy / len) * 8;
      }

      // playerHitSound.play();

      if (player.health <= 0) {
        gameState = STATE_OVER;
        // music.stop();
      }
      break;
    }
  }
}

// ------------------------------------------------------------
// applyBounce()
// Applies and decays bounce velocity each frame.
// ------------------------------------------------------------
function applyBounce() {
  if (abs(player.bounceVX) > 0.1 || abs(player.bounceVY) > 0.1) {
    player.x += player.bounceVX;
    player.y += player.bounceVY;
    player.bounceVX *= 0.75;
    player.bounceVY *= 0.75;

    player.x = constrain(player.x, player.r, WORLD_W - player.r);
    player.y = constrain(player.y, player.r, WORLD_H - player.r);
  }
}

// ------------------------------------------------------------
// drawBackground()
// Draws background shapes in world coordinates.
// Only shapes near the camera are drawn for performance.
// ------------------------------------------------------------
function drawBackground() {
  // Draw background image stretched to world size
  image(backgroundImg, 0, 0, WORLD_W, WORLD_H);
}

function drawBossZone() {
  noStroke();
  if (gameState === STATE_BOSS) {
    fill(255, 80, 80, 30); // red when boss is active
  } else {
    fill(255, 0, 0, 20); // red hint before boss
  }
  rect(0, 0, WORLD_W, BOSS_ZONE_Y);

  // Dashed boundary line
  stroke(
    gameState === STATE_BOSS ? color(255, 0, 0, 100) : color(255, 0, 0, 60),
  );
  strokeWeight(2);
  drawingContext.setLineDash([10, 8]);
  line(0, BOSS_ZONE_Y, WORLD_W, BOSS_ZONE_Y);
  drawingContext.setLineDash([]);
  noStroke();
}

// ------------------------------------------------------------
// handleInput()
// WASD moves the player in world coordinates.
// Constrained to world boundaries.
// Spacebar fires in the current facing direction.
// ------------------------------------------------------------
function handleInput() {
  let moved = false;

  if (keyIsDown(87)) {
    player.y -= PLAYER_SPEED;
    player.direction = { x: 0, y: -1 };
    player.facing = DIR_UP;
    moved = true;
  }
  if (keyIsDown(83)) {
    player.y += PLAYER_SPEED;
    player.direction = { x: 0, y: 1 };
    player.facing = DIR_DOWN;
    moved = true;
  }
  if (keyIsDown(65)) {
    player.x -= PLAYER_SPEED;
    player.direction = { x: -1, y: 0 };
    player.facing = DIR_LEFT;
    moved = true;
  }
  if (keyIsDown(68)) {
    player.x += PLAYER_SPEED;
    player.direction = { x: 1, y: 0 };
    player.facing = DIR_RIGHT;
    moved = true;
  }

  player.x = constrain(player.x, player.r, WORLD_W - player.r);
  player.y = constrain(player.y, player.r, WORLD_H - player.r);

  if (moved) {
    player.animTimer++;
    if (player.animTimer >= ANIM_FRAME_DELAY) {
      player.animTimer = 0;
      player.animFrame = (player.animFrame + 1) % SPRITE_COLS;
    }
  } else {
    player.animFrame = 0;
    player.animTimer = 0;
  }

  if (player.shootTimer > 0) player.shootTimer--;

  if (keyIsDown(32) && player.shootTimer === 0) {
    bullets.push({
      x: player.x + player.direction.x * (player.r + 4),
      y: player.y + player.direction.y * (player.r + 4),
      vx: player.direction.x * BULLET_SPEED,
      vy: player.direction.y * BULLET_SPEED,
    });

    shootSound.play(); // 🔊 SHOOT SOUND

    player.shootTimer = SHOOT_COOLDOWN;
  }
}

function updateBullets() {
  for (let i = bullets.length - 1; i >= 0; i--) {
    bullets[i].x += bullets[i].vx;
    bullets[i].y += bullets[i].vy;

    if (
      bullets[i].x < 0 ||
      bullets[i].x > WORLD_W ||
      bullets[i].y < 0 ||
      bullets[i].y > WORLD_H
    ) {
      bullets.splice(i, 1);
    }
  }
}

function checkWaveSpawns() {
  if (nextWave >= enemyData.waves.length) return;

  let wave = enemyData.waves[nextWave];
  if (player.y < wave.spawnAt) {
    for (let i = 0; i < wave.enemies.length; i++) {
      let data = wave.enemies[i];
      enemies.push({
        x: random(100, WORLD_W - 100),
        y: random(BOSS_ZONE_Y + 50, BOSS_ZONE_Y + 300),
        r: 20,
        speed: data.speed,
        blobT: random(100),

        // NEW:
        animFrame: 0,
        animTimer: 0,
        facing: DIR_DOWN,
      });
    }
    nextWave++;
  }
}

// ------------------------------------------------------------
function checkBossZone() {
  if (boss !== null) return;
  if (player.y > BOSS_ZONE_Y) return;

  spawnBoss();
}

function spawnBoss() {
  boss = {
    x: WORLD_W / 2,
    y: bossData.retreatY,
    r: bossData.r,
    health: bossData.health,
    maxHealth: bossData.health,

    // NEW sprite animation fields
    animFrame: 0,
    animTimer: 0,
    facing: DIR_DOWN,

    // existing fields
    blobT: 0,
    state: "pausing",
    pauseTimer: bossData.chargePause,
    chargeSpeed: bossData.chargeSpeed,
    retreatSpeed: bossData.retreatSpeed,
    retreatY: bossData.retreatY,
    chargeVX: 0,
    chargeVY: 0,
  };

  enemies = [];
  gameState = STATE_BOSS;
}

function updateEnemies() {
  for (let i = 0; i < enemies.length; i++) {
    let e = enemies[i]; // FIXED

    let dx = player.x - e.x;
    let dy = player.y - e.y;
    let d = dist(e.x, e.y, player.x, player.y);

    if (d > 0) {
      e.x += (dx / d) * e.speed;
      e.y += (dy / d) * e.speed;

      // Facing direction
      if (abs(dx) > abs(dy)) {
        e.facing = dx > 0 ? DIR_RIGHT : DIR_LEFT;
      } else {
        e.facing = dy > 0 ? DIR_DOWN : DIR_UP;
      }

      e.animTimer++;
      if (e.animTimer >= ANIM_FRAME_DELAY) {
        e.animTimer = 0;
        e.animFrame = (e.animFrame + 1) % SPRITE_COLS;
      }
    }
  }
}

function updateBoss() {
  if (!boss) return;

  if (boss.state === "pausing") {
    boss.pauseTimer--;
    if (boss.pauseTimer <= 0) {
      let dx = player.x - boss.x;
      let dy = player.y - boss.y;
      let d = dist(boss.x, boss.y, player.x, player.y);
      boss.chargeVX = (dx / d) * boss.chargeSpeed;
      boss.chargeVY = (dy / d) * boss.chargeSpeed;
      boss.state = "charging";
    }
  } else if (boss.state === "charging") {
    boss.x += boss.chargeVX;
    boss.y += boss.chargeVY;

    let pastPlayer =
      dist(boss.x, boss.y, player.x, player.y) > 200 && boss.y > player.y;
    let offWorld =
      boss.x < 0 || boss.x > WORLD_W || boss.y < 0 || boss.y > WORLD_H;

    if (pastPlayer || offWorld) {
      boss.state = "retreating";
    }
  } else if (boss.state === "retreating") {
    let targetX = WORLD_W / 2;
    let targetY = boss.retreatY;
    let dx = targetX - boss.x;
    let dy = targetY - boss.y;
    let d = dist(boss.x, boss.y, targetX, targetY);

    if (d < 8) {
      boss.x = targetX;
      boss.y = targetY;
      boss.state = "pausing";
      boss.pauseTimer = bossData.chargePause;
    } else {
      boss.x += (dx / d) * boss.retreatSpeed;
      boss.y += (dy / d) * boss.retreatSpeed;
    }
  }
  if (abs(boss.chargeVX) > abs(boss.chargeVY)) {
    boss.facing = boss.chargeVX > 0 ? DIR_RIGHT : DIR_LEFT;
  } else {
    boss.facing = boss.chargeVY > 0 ? DIR_DOWN : DIR_UP;
  }

  boss.animTimer++;
  if (boss.animTimer >= ANIM_FRAME_DELAY) {
    boss.animTimer = 0;
    boss.animFrame = (boss.animFrame + 1) % SPRITE_COLS;
  }
}

function checkBulletBossCollision() {
  if (!boss) return;

  for (let i = bullets.length - 1; i >= 0; i--) {
    let d = dist(bullets[i].x, bullets[i].y, boss.x, boss.y);
    if (d < boss.r + 6) {
      bullets.splice(i, 1);
      boss.health--;
      hitSound.play();

      if (boss.health <= 0) {
        gameState = STATE_WIN;
      }
      break;
    }
  }
}

function checkBossPlayerCollision() {
  if (!boss || player.invincible) return;

  let d = dist(player.x, player.y, boss.x, boss.y);
  if (d < player.r + boss.r - 10) {
    player.health--;
    player.invincible = true;
    player.invincibleTimer = INVINCIBLE_FRAMES;
    hitSound.play(); // 🔊 HIT SOUND

    if (player.health <= 0) {
      gameState = STATE_OVER;
      // bossMusic.stop();
    }
  }
}

// ------------------------------------------------------------
// checkEnemyPlayerCollision()
// ------------------------------------------------------------
function checkEnemyPlayerCollision() {
  if (player.invincible) return;

  for (let i = 0; i < enemies.length; i++) {
    let d = dist(player.x, player.y, enemies[i].x, enemies[i].y);
    if (d < player.r + enemies[i].r - 8) {
      player.health--;
      player.invincible = true;
      player.invincibleTimer = INVINCIBLE_FRAMES;
      // playerHitSound.play();

      if (player.health <= 0) {
        gameState = STATE_OVER;
        // music.stop();
      }
      break;
    }
  }
}

// ------------------------------------------------------------
// checkBulletEnemyCollisions()
// ------------------------------------------------------------
function checkBulletEnemyCollisions() {
  for (let i = bullets.length - 1; i >= 0; i--) {
    for (let j = enemies.length - 1; j >= 0; j--) {
      let d = dist(bullets[i].x, bullets[i].y, enemies[j].x, enemies[j].y);
      if (d < enemies[j].r + 6) {
        bullets.splice(i, 1);
        enemies.splice(j, 1);
        score++;
        hitSound.play();
        break;
      }
    }
  }
}

// ------------------------------------------------------------
// updateInvincibility()
// ------------------------------------------------------------
function updateInvincibility() {
  if (player.invincible) {
    player.invincibleTimer--;
    if (player.invincibleTimer <= 0) {
      player.invincible = false;
    }
  }
}

// ------------------------------------------------------------
// drawBoss()
// Drawn in world coordinates inside push/pop.
// ------------------------------------------------------------
function drawBoss() {
  if (!boss) return;

  let scale = (boss.r * 2) / SPRITE_FRAME_H;

  drawSpriteFrame(
    bossSheet,
    boss.x,
    boss.y,
    boss.facing,
    boss.animFrame,
    scale,
  );
}

// ------------------------------------------------------------
// drawEnemies()
// Drawn in world coordinates.
// ------------------------------------------------------------
function drawEnemies() {
  for (let i = 0; i < enemies.length; i++) {
    let e = enemies[i];

    let scale = (e.r * 2) / SPRITE_FRAME_H;

    drawSpriteFrame(enemySheet, e.x, e.y, e.facing, e.animFrame, scale);
  }
}

// ------------------------------------------------------------
// drawBullets()
// Drawn in world coordinates.
// ------------------------------------------------------------
function drawBullets() {
  fill(255);
  noStroke();
  for (let i = 0; i < bullets.length; i++) {
    ellipse(bullets[i].x, bullets[i].y, 10);
  }
}

function drawSpriteFrame(sheet, x, y, facing, frame, scale) {
  let sx = frame * SPRITE_FRAME_W;
  let sy = facing * SPRITE_FRAME_H;
  let drawW = SPRITE_FRAME_W * scale;
  let drawH = SPRITE_FRAME_H * scale;

  push();
  imageMode(CENTER);
  image(sheet, x, y, drawW, drawH, sx, sy, SPRITE_FRAME_W, SPRITE_FRAME_H);
  pop();
}

function drawPlayer() {
  if (player.invincible && floor(player.invincibleTimer / 6) % 2 === 0) return;

  let scale = (player.r * 2) / SPRITE_FRAME_H;
  drawSpriteFrame(
    playerSheet,
    player.x,
    player.y,
    player.facing,
    player.animFrame,
    scale,
  );
}

function drawMinimap() {
  let mapX = MAP_X;
  let mapY = height - MAP_H - MAP_Y_OFFSET;

  // Background
  fill(0, 0, 0, 180); // keep this (black)
  stroke(150); // grey border instead of purple

  strokeWeight(1);
  rect(mapX, mapY, MAP_W, MAP_H, 4);
  noStroke();

  // Boss zone indicator
  let zoneH = map(BOSS_ZONE_Y, 0, WORLD_H, 0, MAP_H);
  fill(180, 180, 180, 40); // light grey
  rect(mapX, mapY, MAP_W, zoneH, 4);

  // Helper — converts world position to minimap screen position
  function worldToMap(wx, wy) {
    return {
      x: mapX + map(wx, 0, WORLD_W, 0, MAP_W),
      y: mapY + map(wy, 0, WORLD_H, 0, MAP_H),
    };
  }

  // Enemy dots
  fill(80); // dark grey
  for (let i = 0; i < enemies.length; i++) {
    let p = worldToMap(enemies[i].x, enemies[i].y);
    ellipse(p.x, p.y, 5);
  }

  // Boss dot
  if (boss) {
    fill(255, 0, 0); // pure red
    let p = worldToMap(boss.x, boss.y);
    ellipse(p.x, p.y, 8);
  }

  // Player dot — drawn last so it's always on top
  fill(255); // white
  let pp = worldToMap(player.x, player.y);
  ellipse(pp.x, pp.y, 7);

  // Camera viewport rectangle — shows what's currently visible
  noFill();
  stroke(255, 255, 255, 60);
  strokeWeight(1);
  let vp = worldToMap(camX, camY);
  let vpW = map(width, 0, WORLD_W, 0, MAP_W);
  let vpH = map(height, 0, WORLD_H, 0, MAP_H);
  rect(vp.x, vp.y, vpW, vpH);
  noStroke();

  // Label
  fill(120);
  textSize(9);
  textAlign(LEFT);
  textFont("monospace");
  text("MAP", mapX + 4, mapY + MAP_H - 4);
}

function drawHUD() {
  noStroke();

  fill(160);
  textSize(13);
  textAlign(LEFT);
  textFont("monospace");
  text("Move: WASD   Shoot: Spacebar   B: Boss fight", 16, 24);

  fill(255);
  textSize(16);
  textAlign(RIGHT);
  text("Score: " + score, width - 16, 28);

  let barW = 160;
  let barH = 14;
  let barX = width - barW - 16;
  let barY = 40;
  let fillW = map(player.health, 0, player.maxHealth, 0, barW);

  fill(40);
  rect(barX, barY, barW, barH, 4);

  let healthColour = lerpColor(
    color("red"),
    color("red"),
    player.health / player.maxHealth,
  );
  fill(healthColour);
  rect(barX, barY, fillW, barH, 4);

  fill("red");
  textSize(11);
  textAlign(RIGHT);
  text("Health", width - 16, barY + barH + 12);

  // Boss zone hint — appears when player gets close
  // Boss zone hint — appears when player gets close
  if (gameState === STATE_PLAY && player.y < 600) {
    fill(255, 0, 0, map(player.y, 600, BOSS_ZONE_Y, 0, 255)); // red fade-in
    textAlign(CENTER);
    textSize(14);
    text("Boss zone ahead — proceed carefully", width / 2, height - 20);
  }
}

function drawBossHUD() {
  if (!boss) return;

  let barW = 400;
  let barH = 18;
  let barX = (width - barW) / 2;
  let barY = 10;
  let fillW = map(boss.health, 0, boss.maxHealth, 0, barW);

  fill(40);
  rect(barX, barY, barW, barH, 4);

  let bossColour = lerpColor(
    color(255, 0, 0), // bright red
    color(120, 0, 0), // dark red
    boss.health / boss.maxHealth,
  );
  fill(bossColour);
  rect(barX, barY, fillW, barH, 4);

  fill(255);
  textSize(12);
  textAlign(CENTER);
  textFont("monospace");
  text("BOSS", width / 2, barY + barH + 14);
}

// ------------------------------------------------------------
// drawWinScreen()
// ------------------------------------------------------------
function drawWinScreen() {
  fill(0, 0, 0, 160);
  rect(0, 0, width, height);

  fill(255);
  textAlign(CENTER);
  textSize(52);
  text("Boss Defeated!", width / 2, height / 2 - 30);

  fill(180);
  textSize(18);
  text("Score: " + score, width / 2, height / 2 + 20);

  fill(120);
  textSize(14);
  text("Press R to play again", width / 2, height / 2 + 60);
}

// ------------------------------------------------------------
// drawGameOver()
// ------------------------------------------------------------
function drawGameOver() {
  fill(0, 0, 0, 160);
  rect(0, 0, width, height);

  fill(255);
  textAlign(CENTER);
  textSize(52);
  text("Game Over", width / 2, height / 2 - 30);

  fill(180);
  textSize(18);
  text("Score: " + score, width / 2, height / 2 + 20);

  fill(120);
  textSize(14);
  text("Press R to play again", width / 2, height / 2 + 60);
}

// ------------------------------------------------------------
// keyPressed()
// R restarts. B skips to boss fight.
// ------------------------------------------------------------
function keyPressed() {
  // Start music on first interaction
  if (!mainTheme.isPlaying()) {
    mainTheme.loop();
  }

  // B — skip to boss fight for testing
  if (key === "b" || key === "B") {
    player.y = BOSS_ZONE_Y - 10;
    if (!boss) spawnBoss();
  }

  // R — restart
  if (
    (key === "r" || key === "R") &&
    gameState !== STATE_PLAY &&
    gameState !== STATE_BOSS
  ) {
    gameState = STATE_PLAY;
    score = 0;
    nextWave = 0;
    bullets = [];
    enemies = [];
    boss = null;

    player.x = WORLD_W / 2;
    player.y = WORLD_H - 200;
    player.direction = { x: 0, y: -1 };
    player.shootTimer = 0;
    player.health = player.maxHealth;
    player.invincible = false;
    player.invincibleTimer = 0;
    player.bounceVX = 0;
    player.bounceVY = 0;

    camX = player.x - width / 2;
    camY = player.y - height / 2;
  }
}
