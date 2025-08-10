/* =========================================================
   Disabled Hunter — Runner (parallax + HUD + overlay start)
   main.js  (full replacement)
   ========================================================= */

/* ---------- CONFIG ÚNICA QUE TE INTERESA ---------- */
const CFG = {
  // Velocidad base del scroll (px por segundo)
  scrollSpeed: 150,      // antes 220 (≈ -15%)
  scrollAccelEachSec: 0,

  // Movimiento del jugador
  playerSpeed: 300,          // velocidad lateral (px/s)
  jump: -950,                // fuerza salto (px/s)
  gravity: 2200,             // gravedad (px/s^2)
  coyote: 0.18,              // “coyote time” para saltar justo al borde

  // Gaps de spawns en distancia recorrida (px de mundo)
  gaps: {
    coin:  [280, 520],
    spec:  [1600, 2400],
    zom:   [900, 1300],
    obst:  [1100, 1700],
    obstChance: 0.55
  },

  // HUD / juego
  powerMax: 100,
  beamCost: 20,
  beamSpeed: 900,

  // Obstáculos (hitbox vs dibujo)
  obst: { hitW: 65, hitH: 50, drawW: 112, drawH: 112 }
};

/* =========================================================
   CANVAS & SCALING (16:9 virtual, pixel-perfect with DPR)
   ========================================================= */
const VIRTUAL_W = 960;
const VIRTUAL_H = 540;

const CANVAS = document.getElementById('game');
const CTX = CANVAS.getContext('2d', { alpha: false });

let DPR = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
let viewW = 0, viewH = 0, scale = 1, offsetX = 0, offsetY = 0;

function fitCanvas() {
  DPR = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));

  // Mantener 16:9 dentro de la ventana (letterbox si hace falta)
  const ww = window.innerWidth;
  const wh = window.innerHeight;
  const targetRatio = VIRTUAL_W / VIRTUAL_H;

  let cssW = ww, cssH = Math.round(ww / targetRatio);
  if (cssH > wh) { cssH = wh; cssW = Math.round(wh * targetRatio); }

  CANVAS.style.width = cssW + 'px';
  CANVAS.style.height = cssH + 'px';

  CANVAS.width  = Math.round(cssW * DPR);
  CANVAS.height = Math.round(cssH * DPR);

  viewW = CANVAS.width;
  viewH = CANVAS.height;

  scale = Math.min(viewW / VIRTUAL_W, viewH / VIRTUAL_H);
  offsetX = Math.round((viewW - VIRTUAL_W * scale) * 0.5);
  offsetY = Math.round((viewH - VIRTUAL_H * scale) * 0.5);

  CTX.setTransform(1,0,0,1,0,0);
  CTX.imageSmoothingEnabled = false; // pixel-crisp
}

window.addEventListener('resize', fitCanvas);
fitCanvas();

/* =========================================================
   ASSETS
   ========================================================= */
const IMG = {};
const SFX = {};

const IMAGES_TO_LOAD = {
  bg:        'assets/tiles/bg_static_1920x1080.png',
  fog:       'assets/tiles/tile_fog.png',
  mid:       'assets/tiles/tile_middleok.png',
  ground:    'assets/tiles/tile_ground_soft.png',
  tomb:      'assets/tiles/tile_tomb_1x1.png',
  maus:      'assets/tiles/tile_mausoleum_1x1.png',
  player:    'player.png',
  zombie:    'zombie.png',
  coin:      'coin.png',
  coinS:     'coin_special.png',
  heart:     'assets/ui/ui_heart_32.png'
};

// SFX si los tienes con esos nombres
const SOUNDS_TO_LOAD = {
  coin:  'sfx_coin.wav',
  pow:   'sfx_power.wav',
  beam:  'sfx_beam.wav',
  zdie:  'sfx_zombie_die.wav',
  over:  'sfx_gameover.wav'
};

function loadImages(map) {
  const keys = Object.keys(map);
  const jobs = keys.map(k => new Promise(res => {
    const im = new Image(); im.onload = () => res(IMG[k] = im);
    im.src = map[k];
  }));
  return Promise.all(jobs);
}
function loadAudio(map) {
  const keys = Object.keys(map);
  const jobs = keys.map(k => new Promise(res => {
    const a = new Audio(); a.oncanplaythrough = () => res(SFX[k] = a);
    a.src = map[k];
  }));
  return Promise.all(jobs);
}

/* =========================================================
   WORLD STATE
   ========================================================= */
let running = false;
let last = 0;
let worldX = 0;             // distancia recorrida global (px)
let scroll = 0;             // para parallax
let score = 0, best = +(localStorage.getItem('dh_best')||0);

let lives = 3;
let power = CFG.powerMax;

const player = {
  x: 160, y: 0, w: 48, h: 64,
  vy: 0, onGround: false, coyote: 0
};

const coins = [];
const zombies = [];
const obstacles = [];
const beams = [];

let nextCoinAt = 0;
let nextSpecAt = 0;
let nextZomAt  = 0;
let nextObsAt  = 0;

/* =========================================================
   UTIL
   ========================================================= */
const rand = (a,b)=> a + Math.random()*(b-a);
const rint = (a,b)=> (Math.random()*(b-a+1)|0)+a;

function pushCoin(x) {
  coins.push({x, y: groundY - 38, r: 16, special:false});
}
function pushSpec(x) {
  coins.push({x, y: groundY - 38, r: 16, special:true});
}
function pushZombie(x) {
  zombies.push({x, y: groundY - 62, w: 44, h: 60, alive:true});
}
function pushObstacle(x) {
  const isM = Math.random() < 0.5;
  obstacles.push({x, y: groundY - CFG.obst.drawH + 8, w: CFG.obst.hitW, h: CFG.obst.hitH, isM});
}

/* =========================================================
   INPUT
   ========================================================= */
const Keys = { left:false, right:false, jump:false, fire:false };
window.addEventListener('keydown', e=>{
  if (e.code==='ArrowLeft'  || e.code==='KeyA') Keys.left = true;
  if (e.code==='ArrowRight' || e.code==='KeyD') Keys.right = true;
  if (e.code==='ArrowUp'    || e.code==='Space' || e.code==='KeyW') Keys.jump = true;
  if (e.code==='KeyX') Keys.fire = true;
});
window.addEventListener('keyup', e=>{
  if (e.code==='ArrowLeft'  || e.code==='KeyA') Keys.left = false;
  if (e.code==='ArrowRight' || e.code==='KeyD') Keys.right = false;
  if (e.code==='ArrowUp'    || e.code==='KeyW') Keys.jump = false;
  if (e.code==='KeyX') Keys.fire = false;
});

/* =========================================================
   OVERLAY START / GAME OVER
   ========================================================= */
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');
if (startBtn) startBtn.onclick = () => {
  overlay.style.display = 'none';
  start();
};

function gameOver() {
  running = false;
  SFX.over && SFX.over.play();
  best = Math.max(best, score);
  localStorage.setItem('dh_best', best);
  overlay.innerHTML = `
    <h1>Game Over</h1>
    <p>Score: ${score} &nbsp; | &nbsp; Best: ${best}</p>
    <button id="startBtn">Restart</button>
  `;
  overlay.style.display = 'flex';
  document.getElementById('startBtn').onclick = ()=>{
    overlay.style.display='none';
    reset();
    start();
  };
}

/* =========================================================
   LEVEL LAYOUT
   ========================================================= */
const groundY = 440; // altura del piso en virtual (ajusta si quieres)

function reset() {
  worldX = 0; scroll = 0; score = 0; lives = 3; power = CFG.powerMax;
  coins.length = zombies.length = obstacles.length = beams.length = 0;
  nextCoinAt = CFG.gaps.coin[0];
  nextSpecAt = CFG.gaps.spec[0];
  nextZomAt  = CFG.gaps.zom[0];
  nextObsAt  = CFG.gaps.obst[0];
  player.x = 160; player.y = groundY - player.h; player.vy = 0; player.onGround = true; player.coyote = 0;
}

function start() {
  reset();
  running = true;
  last = performance.now();
  requestAnimationFrame(loop);
}

/* =========================================================
   UPDATE
   ========================================================= */
function spawnByProgress(dt) {
  // Se basan en worldX (distancia recorrida)
  if (worldX >= nextCoinAt) {
    const gap = rand(...CFG.gaps.coin);
    nextCoinAt += gap;
    // a veces tiramos 3 monedas seguidas
    const base = worldX + 800;
    const n = Math.random() < 0.5 ? 3 : 1;
    for (let i=0;i<n;i++) pushCoin(base + i*90);
  }
  if (worldX >= nextSpecAt) {
    nextSpecAt += rand(...CFG.gaps.spec);
    pushSpec(worldX + 1000);
  }
  if (worldX >= nextZomAt) {
    nextZomAt += rand(...CFG.gaps.zom);
    pushZombie(worldX + 1000);
  }
  if (worldX >= nextObsAt) {
    nextObsAt += rand(...CFG.gaps.obst);
    if (Math.random() < CFG.gaps.obstChance) {
      pushObstacle(worldX + 1000);
    }
  }
}

function rectsOverlap(a,b){
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function update(dt) {
  // progreso y velocidad global
  const vx = CFG.scrollSpeed;
  worldX += vx * dt;
  scroll  += vx * dt;

  // spawns por progreso
  spawnByProgress(dt);

  // jugador: input lateral
  if (Keys.left)  player.x -= CFG.playerSpeed * dt;
  if (Keys.right) player.x += CFG.playerSpeed * dt;

  // gravedad y salto (con coyote time)
  player.vy += CFG.gravity * dt;
  player.y  += player.vy * dt;
  if (player.onGround) player.coyote = CFG.coyote;
  else player.coyote = Math.max(0, player.coyote - dt);

  if ((Keys.jump) && (player.onGround || player.coyote>0)) {
    player.vy = CFG.jump;
    player.onGround = false;
    player.coyote = 0;
  }

  // suelo
  if (player.y + player.h >= groundY) {
    player.y = groundY - player.h;
    player.vy = 0;
    player.onGround = true;
  } else {
    player.onGround = false;
  }

  // Desplazamiento relativo de entidades (vienen hacia el jugador)
  const rel = vx * dt;

  // Obstáculos: mover a la izquierda, colisión sólida (no nos quedamos pegados)
  for (let i=obstacles.length-1;i>=0;i--){
    const o = obstacles[i];
    o.x -= rel;

    // hitbox (más pequeño que el dibujo)
    const hit = {x:o.x + (CFG.obst.drawW - CFG.obst.hitW)/2, y:o.y + (CFG.obst.drawH - CFG.obst.hitH), w:CFG.obst.hitW, h:CFG.obst.hitH};

    if (rectsOverlap({x:player.x,y:player.y,w:player.w,h:player.h}, hit)) {
      // Resolución: si veníamos por la derecha, nos colocamos justo antes
      if (player.x + player.w > hit.x && player.x < hit.x && player.vy >= 0) {
        player.x = hit.x - player.w - 0.1;
      }
      // Si caemos encima, aterrizamos en el tope del obstáculo
      if (player.y + player.h > hit.y && player.y < hit.y && player.vy > 0) {
        player.y = hit.y - player.h;
        player.vy = 0;
        player.onGround = true;
      }
    }

    if (o.x + CFG.obst.drawW < -200) obstacles.splice(i,1);
  }

  // Monedas
  for (let i=coins.length-1;i>=0;i--){
    const c = coins[i]; c.x -= rel;
    const dx = (player.x + player.w/2) - c.x;
    const dy = (player.y + player.h/2) - c.y;
    if (dx*dx + dy*dy < (c.r+18)*(c.r+18)) {
      score += c.special ? 200 : 50;
      if (c.special) { power = Math.min(CFG.powerMax, power + 60); SFX.pow && SFX.pow.play();}
      else { SFX.coin && SFX.coin.play(); }
      coins.splice(i,1);
    } else if (c.x < -200) coins.splice(i,1);
  }

  // Disparo
  if (Keys.fire && power >= CFG.beamCost) {
    // dispara corto (no continuo, simple rate-limit)
    Keys.fire = false;
    power = Math.max(0, power - CFG.beamCost);
    beams.push({x: player.x + player.w, y: player.y + player.h/2 - 4, w: 24, h: 8, vx: CFG.beamSpeed});
    SFX.beam && SFX.beam.play();
  }

  // Beams
  for (let i=beams.length-1;i>=0;i--){
    const b = beams[i];
    b.x += b.vx * dt;
    // colisión con zombies (si hay tumba delante del zombie, la tumba bloquea)
    let hitSomething = false;
    for (let j=zombies.length-1;j>=0;j--){
      const z = zombies[j];
      if (!z.alive) continue;

      // si hay obstáculo entre el beam y el zombie, bloquea
      const beamFront = b.x + b.w;
      let blocked = false;
      for (const o of obstacles) {
        const left = o.x, right = o.x + CFG.obst.drawW;
        if (left < beamFront && right > b.x) {
          // Está en el corredor horizontal del disparo; si la altura cruza, bloquea:
          const top = o.y, bot = o.y + CFG.obst.drawH;
          if (b.y < bot && b.y + b.h > top) { blocked = true; break; }
        }
      }
      if (blocked) continue;

      if (rectsOverlap(b, {x:z.x,y:z.y,w:z.w,h:z.h})) {
        z.alive = false; SFX.zdie && SFX.zdie.play(); score += 150; hitSomething = true;
      }
    }
    if (hitSomething || b.x > VIRTUAL_W + 200) beams.splice(i,1);
  }

  // Zombies
  for (let i=zombies.length-1;i>=0;i--){
    const z = zombies[i];
    z.x -= rel * 0.9;
    if (!z.alive) { zombies.splice(i,1); continue; }

    // choque con jugador
    if (rectsOverlap({x:player.x,y:player.y,w:player.w,h:player.h}, z)) {
      lives -= 1;
      z.alive = false;
      if (lives <= 0) return gameOver();
    }
    if (z.x < -200) zombies.splice(i,1);
  }

  // power se recarga lento
  power = Math.min(CFG.powerMax, power + 12 * dt);
}

/* =========================================================
   RENDER
   ========================================================= */
function drawImageScaled(img, x, y, w, h) {
  // transforma a espacio de canvas (DPR + scale + letterbox)
  CTX.drawImage(
    img,
    Math.round(offsetX + x*scale),
    Math.round(offsetY + y*scale),
    Math.round(w*scale),
    Math.round(h*scale)
  );
}

function render() {
  // limpiar
  CTX.fillStyle = '#0b0e13';
  CTX.fillRect(0,0, CANVAS.width, CANVAS.height);

  // fondo fijo (cubre todo el área virtual, centrado)
  drawImageScaled(IMG.bg, 0, 0, VIRTUAL_W, VIRTUAL_H);

  // parallax middle (muy lento)
  const midShift = (scroll * 0.15) % VIRTUAL_W;
  for (let i=-1;i<=1;i++){
    drawImageScaled(IMG.mid, -midShift + i*VIRTUAL_W, 240, VIRTUAL_W, 220);
  }

  // parallax fog (medio)
  const fogShift = (scroll * 0.30) % VIRTUAL_W;
  for (let i=-1;i<=1;i++){
    drawImageScaled(IMG.fog, -fogShift + i*VIRTUAL_W, 360, VIRTUAL_W, 120);
  }

  // ground (rápido, “pared/piso” pero pegado abajo)
  const gShift = (scroll * 1.0) % VIRTUAL_W;
  for (let i=-1;i<=1;i++){
    drawImageScaled(IMG.ground, -gShift + i*VIRTUAL_W, groundY - 40, VIRTUAL_W, 120);
  }

  // Obstáculos (dibujo)
  for (const o of obstacles) {
    const sprite = o.isM ? IMG.maus : IMG.tomb;
    drawImageScaled(sprite, o.x, o.y, CFG.obst.drawW, CFG.obst.drawH);
  }

  // Monedas
  for (const c of coins) {
    drawImageScaled(c.special ? IMG.coinS : IMG.coin, c.x-16, c.y-16, 32, 32);
  }

  // Zombies
  for (const z of zombies) {
    if (z.alive) drawImageScaled(IMG.zombie, z.x, z.y, z.w, z.h);
  }

  // Player
  drawImageScaled(IMG.player, player.x, player.y, player.w, player.h);

  // Beams
  CTX.fillStyle = '#7cc3ff';
  for (const b of beams) {
    const x = Math.round(offsetX + b.x*scale);
    const y = Math.round(offsetY + b.y*scale);
    const w = Math.round(b.w*scale), h = Math.round(b.h*scale);
    CTX.fillRect(x,y,w,h);
  }

  // HUD
  // Score panel
  CTX.fillStyle = 'rgba(0,0,0,.65)';
  CTX.fillRect(offsetX + 16*scale, offsetY + 16*scale, 420*scale, 82*scale);
  CTX.fillStyle = '#fff';
  CTX.font = `${Math.round(36*scale)}px system-ui, -apple-system, sans-serif`;
  CTX.fillText(`Score: ${score}`, offsetX + 28*scale, offsetY + 52*scale);
  CTX.fillText(`Best:  ${best}`,  offsetX + 28*scale, offsetY + 90*scale);

  // Hearts
  const hx = offsetX + 470*scale, hy = offsetY + 26*scale, hs = 24*scale;
  for (let i=0;i<3;i++){
    CTX.globalAlpha = i < lives ? 1 : .25;
    CTX.drawImage(IMG.heart, hx + i*(hs+10), hy, hs, hs);
  }
  CTX.globalAlpha = 1;

  // Power bar
  const barW = 360, barH = 12;
  const bx = offsetX + 540*scale, by = offsetY + 40*scale;
  CTX.fillStyle = '#3a3a3a';
  CTX.fillRect(bx, by, barW*scale, barH*scale);
  CTX.fillStyle = '#64a8ff';
  const pw = (power/CFG.powerMax) * barW;
  CTX.fillRect(bx, by, pw*scale, barH*scale);
}

/* =========================================================
   LOOP
   ========================================================= */
function loop(t) {
  if (!running) return;
  const dt = Math.min(0.033, (t - last) / 1000);
  last = t;

  update(dt);
  render();

  requestAnimationFrame(loop);
}

/* =========================================================
   BOOT
   ========================================================= */
Promise.all([loadImages(IMAGES_TO_LOAD), loadAudio(SOUNDS_TO_LOAD)])
  .then(()=>{
    // Mostrar overlay de inicio si existe
    if (overlay) {
      overlay.innerHTML = `
        <h1>Disabled Hunter</h1>
        <p>Move: ← →  |  Jump: ↑ / Space  |  Shoot: X</p>
        <button id="startBtn">Start</button>
      `;
      overlay.style.display = 'flex';
      document.getElementById('startBtn').onclick = ()=>{
        overlay.style.display='none';
        start();
      };
    } else {
      start();
    }
  });
