/* ===================== Disabled Hunter — main.js (full) ===================== */
/* ======================= CONFIG QUE TE INTERESA ======================== */
const CFG = {
  // Scroll del mundo
  scrollSpeed: 150,            // <- tu valor -15% ya aplicado
  scrollAccelEachSec: 0,

  // Jugador
  playerSpeed: 300,
  jump: -950,
  gravity: 2200,
  coyote: 0.18,

  // Spawns (px de mundo recorridos)
  gaps: {
    coin:  [280, 520],
    spec:  [1600, 2400],
    zom:   [900, 1300],
    obst:  [1100, 1700],
    obstChance: 0.55
  },

  // Beam / power
  powerMax: 100,
  beamCost: 20,
  beamSpeed: 900,

  // Obstáculos (hitbox vs dibujo)
  obst: { hitW: 65, hitH: 50, drawW: 112, drawH: 112 },

  // HUD
  hud: {
    scoreFont: 'bold 42px Inter, system-ui, sans-serif',
    bestFont:  'bold 32px Inter, system-ui, sans-serif',
    heartsY:  26,
    heartSize: 22,
    powerX:  560,
    powerY:  42,
    powerW:  520,
    powerH:   10
  }
};

/* ========================== CORE (canvas + assets) ========================== */
const CANVAS = document.getElementById('game');
const CTX = CANVAS.getContext('2d');
let W = 0, H = 0;

function fitCanvas() {
  CANVAS.width  = window.innerWidth;
  CANVAS.height = window.innerHeight;
  W = CANVAS.width;
  H = CANVAS.height;
}
fitCanvas();
window.addEventListener('resize', fitCanvas);

const IMG = {};
const SFX = {};

function loadImage(key, src) {
  return new Promise(res => {
    const im = new Image();
    im.onload = () => { IMG[key] = im; res(); };
    im.src = src;
  });
}
function loadAudio(key, src, volume=1) {
  try {
    const a = new Audio(src);
    a.volume = volume;
    SFX[key] = a;
  } catch {}
}

async function loadAll() {
  const jobs = [
    loadImage('bg',   'assets/tiles/bg_static_1920x1080.png'),
    loadImage('mid',  'assets/tiles/tile_middleok.png'),
    loadImage('fog',  'assets/tiles/tile_fog.png'),
    loadImage('ground','assets/tiles/tile_ground_soft.png'),

    loadImage('player','assets/player.png'),
    loadImage('zombie','assets/zombie.png'),
    loadImage('coin','assets/coin.png'),
    loadImage('coinS','assets/coin_special.png'),

    loadImage('tomb', 'assets/tiles/tile_tomb_1x1.png'),
    loadImage('maus', 'assets/tiles/tile_mausoleum_1x1.png'),

    // FX (opcionales)
    loadImage('fx_beam','assets/fx/fx_beam_128.png'),
  ];
  await Promise.all(jobs);

  // Sonidos (opcionales; si no existen, no rompe)
  loadAudio('coin',  'assets/sfx_coin.wav', 0.35);
  loadAudio('power', 'assets/sfx_power.wav',0.45);
  loadAudio('beam',  'assets/sfx_beam.wav', 0.45);
  loadAudio('zdie',  'assets/sfx_zombie_die.wav',0.45);
  loadAudio('over',  'assets/sfx_gameover.wav',0.55);
  // Música opcional:
  // loadAudio('music','assets/music.mp3',0.25);
}

/* ========================= LAYOUT PARALLAX (ANCLAJES) ======================= */
// Puedes reajustar si quieres “bajar” todo el juego sin tocar sprites
const GROUND_Y = () => H * 0.66;  // línea de piso
const MID_Y    = () => H * 0.12;  // middle
const FOG_Y    = () => H * 0.50;  // fog

const LAYER_SCROLL = { mid: 0.35, fog: 0.55, ground: 1.0 };

/* =============================== UTILIDADES ================================= */
const rand = (a,b) => Math.random()*(b-a)+a;
const clamp = (v,a,b) => Math.max(a, Math.min(b,v));

function drawBGStatic() {
  const im = IMG.bg; if (!im) return;
  // cover
  const r = Math.max(W/im.width, H/im.height);
  const dw = im.width*r, dh = im.height*r;
  CTX.globalAlpha = 1;
  CTX.drawImage(im, (W-dw)/2, (H-dh)/2, dw, dh);
}

function drawTiled(img, y, speed, tileW=img.width||960) {
  if (!img) return;
  const segW = tileW;
  // offset en función del mundo recorrido
  const off = (worldX * speed) % segW;
  let x = -off;
  while (x < W) {
    CTX.drawImage(img, x, y, segW, img.height);
    x += segW;
  }
}

/* ================================ ESTADO ==================================== */
let running = false;
let worldX = 0;            // distancia recorrida
let scrollSpeed = CFG.scrollSpeed;
let bestScore = Number(localStorage.getItem('dh_best')||0);
let score = 0;

// Jugador
const player = {
  x: 180, y: 0, vy: 0, onGround: false, coyote: 0,
  w: 48, h: 64, lives: 3, power: 0
};

// Entidades
const coins = [];     // {x,y,sp}  sp:false=normal, true=especial
const zombies = [];   // {x,y,w,h,alive}
const obst = [];      // {x,y,w,h,kind:'tomb'|'maus'}

// Spawn control
let nextCoinAt = 0, nextSpecAt = 0, nextZAt = 0, nextObAt = 0;

/* ============================== INPUT ======================================= */
const keys = {};
window.addEventListener('keydown', e=>{
  keys[e.key.toLowerCase()] = true;
  if (e.code === 'Space') keys[' '] = true;
});
window.addEventListener('keyup', e=>{
  keys[e.key.toLowerCase()] = false;
  if (e.code === 'Space') keys[' '] = false;
});

/* ============================== GAME LOOP =================================== */
function reset() {
  worldX = 0;
  scrollSpeed = CFG.scrollSpeed;
  score = 0;
  coins.length = 0;
  zombies.length = 0;
  obst.length = 0;

  player.y = GROUND_Y()-player.h;
  player.vy = 0;
  player.onGround = true;
  player.coyote = 0;
  player.lives = 3;
  player.power = 0;

  // schedule
  nextCoinAt = rand(...CFG.gaps.coin);
  nextSpecAt = rand(...CFG.gaps.spec);
  nextZAt    = rand(...CFG.gaps.zom);
  nextObAt   = rand(...CFG.gaps.obst);
}

function update(dt) {
  // Avance del mundo
  worldX += scrollSpeed * dt;
  scrollSpeed += CFG.scrollAccelEachSec * dt;

  // Movimiento lateral jugador (opcional: limitado a carril)
  if (keys['arrowright']) player.x += CFG.playerSpeed*dt;
  if (keys['arrowleft'])  player.x -= CFG.playerSpeed*dt;
  player.x = clamp(player.x, 80, W*0.6);

  // Gravedad y salto
  player.vy += CFG.gravity * dt;
  player.y  += player.vy * dt;

  const gy = GROUND_Y()-player.h;
  if (player.y >= gy) {
    player.y = gy;
    player.vy = 0;
    player.onGround = true;
    player.coyote = CFG.coyote;
  } else {
    player.onGround = false;
    player.coyote -= dt;
  }
  // Saltar
  if (keys[' '] && (player.onGround || player.coyote>0)) {
    player.vy = CFG.jump;
    player.onGround = false;
    player.coyote = 0;
  }

  // Disparo (X) — consume power
  if (keys['x'] && player.power >= CFG.beamCost) {
    player.power -= CFG.beamCost;
    shootBeam();
    keys['x'] = false; // click único
  }

  // Spawns atados a worldX
  spawnWhile();

  // Actualizar entidades (colisiones + limpieza)
  updateEntities(dt);

  // GAME OVER
  if (player.lives <= 0) {
    SFX.over?.play?.();
    localStorage.setItem('dh_best', Math.max(bestScore, score));
    bestScore = Number(localStorage.getItem('dh_best')||0);
    running = false;
    showOverlay('Disabled Hunter', `Score: ${score}\nBest: ${bestScore}`);
  }
}

function spawnWhile() {
  // moneda normal
  while (worldX >= nextCoinAt) {
    const y = GROUND_Y() - 28 - rand(0, 110);
    coins.push({ x: worldX + W + rand(80,220), y, sp:false });
    nextCoinAt += rand(...CFG.gaps.coin);
  }
  // moneda especial
  while (worldX >= nextSpecAt) {
    const y = GROUND_Y() - 28 - rand(40, 140);
    coins.push({ x: worldX + W + rand(140,260), y, sp:true });
    nextSpecAt += rand(...CFG.gaps.spec);
  }
  // zombie
  while (worldX >= nextZAt) {
    const y = GROUND_Y() - 58;
    zombies.push({ x: worldX + W + rand(240, 380), y, w:44, h:58, alive:true });
    nextZAt += rand(...CFG.gaps.zom);
  }
  // obstáculo
  while (worldX >= nextObAt) {
    if (Math.random() < CFG.gaps.obstChance) {
      const kind = Math.random()<0.5 ? 'tomb' : 'maus';
      const y = GROUND_Y() - CFG.obst.drawH + 6;
      obst.push({ x: worldX + W + rand(260,420), y, w:CFG.obst.hitW, h:CFG.obst.hitH, kind });
    }
    nextObAt += rand(...CFG.gaps.obst);
  }
}

function updateEntities(dt) {
  const leftEdge = worldX - 120;

  // coins
  for (let i=coins.length-1; i>=0; i--) {
    const c = coins[i];
    // colisión jugador
    const cx = c.x - worldX;
    if (AABB(player.x, player.y, 36, 48, cx-16, c.y-16, 32, 32)) {
      if (c.sp) {
        player.power = clamp(player.power + 35, 0, CFG.powerMax);
        SFX.power?.currentTime=0; SFX.power?.play?.();
      } else {
        score += 10;
        SFX.coin?.currentTime=0; SFX.coin?.play?.();
      }
      coins.splice(i,1);
      continue;
    }
    if (c.x < leftEdge) coins.splice(i,1);
  }

  // zombies
  for (let i=zombies.length-1; i>=0; i--) {
    const z = zombies[i];
    if (!z.alive) { zombies.splice(i,1); continue; }
    const zx = z.x - worldX;
    // choque con jugador
    if (AABB(player.x, player.y, 36, 48, zx, z.y, z.w, z.h)) {
      z.alive = false;
      player.lives--;
      zombies.splice(i,1);
      continue;
    }
    if (z.x < leftEdge) zombies.splice(i,1);
  }

  // obstáculos (si pisas/choque, vida--)
  for (let i=obst.length-1; i>=0; i--) {
    const o = obst[i];
    const ox = o.x - worldX;
    if (AABB(player.x, player.y, 36, 48, ox+16, o.y+CFG.obst.drawH-CFG.obst.hitH, o.w, o.h)) {
      player.lives--;
      obst.splice(i,1);
      continue;
    }
    if (o.x < leftEdge) obst.splice(i,1);
  }
}

function AABB(ax,ay,aw,ah, bx,by,bw,bh){
  return ax<bx+bw && ax+aw>bx && ay<by+bh && ay+ah>by;
}

/* ============================= DISPARO (BEAM) =============================== */
const beams = []; // {x,y,dx,dy,len}
function shootBeam() {
  const x = player.x + 34;
  const y = player.y + 30;
  beams.push({ x, y, dx: 1, dy: 0, len: 220 });
  SFX.beam?.currentTime=0; SFX.beam?.play?.();
}

function updateBeams(dt) {
  for (let i=beams.length-1; i>=0; i--) {
    const b = beams[i];
    b.x += CFG.beamSpeed*dt*b.dx;
    b.y += CFG.beamSpeed*dt*b.dy;

    // choca con obstáculo primero (lo bloquea)
    let blocked = false;
    for (const o of obst) {
      const ox = o.x - worldX + 18;
      const oy = o.y + CFG.obst.drawH - CFG.obst.hitH;
      if (AABB(b.x, b.y-4, b.len, 8, ox, oy, CFG.obst.hitW, CFG.obst.hitH)) {
        blocked = true; break;
      }
    }
    if (blocked) { beams.splice(i,1); continue; }

    // mata zombie
    for (let j=zombies.length-1; j>=0; j--) {
      const z = zombies[j];
      const zx = z.x - worldX;
      if (z.alive && AABB(b.x, b.y-4, b.len, 8, zx, z.y, z.w, z.h)) {
        z.alive = false; zombies.splice(j,1);
        score += 25;
        SFX.zdie?.currentTime=0; SFX.zdie?.play?.();
      }
    }

    if (b.x > W+80) beams.splice(i,1);
  }
}

/* ================================ DIBUJO ==================================== */
function drawGame() {
  // fondo fijo (blur grande)
  drawBGStatic();

  // parallax middle + fog + ground
  CTX.globalAlpha = 1;
  drawTiled(IMG.mid,  MID_Y(),  LAYER_SCROLL.mid,   IMG.mid.width||960);
  drawTiled(IMG.fog,  FOG_Y(),  LAYER_SCROLL.fog,   IMG.fog.width||960);
  drawTiled(IMG.ground, GROUND_Y(), LAYER_SCROLL.ground, IMG.ground.width||960);

  // entidades (mundo->pantalla = x - worldX)
  // coins
  for (const c of coins) {
    const x = c.x - worldX;
    CTX.drawImage(c.sp?IMG.coinS:IMG.coin, x-16, c.y-16, 32, 32);
  }
  // obstáculos
  for (const o of obst) {
    const x = o.x - worldX;
    const img = o.kind==='tomb'? IMG.tomb : IMG.maus;
    CTX.drawImage(img, x, o.y, CFG.obst.drawW, CFG.obst.drawH);
  }
  // zombies
  for (const z of zombies) {
    const x = z.x - worldX;
    if (z.alive) CTX.drawImage(IMG.zombie, x-6, z.y-6, z.w+12, z.h+12);
  }
  // player
  CTX.drawImage(IMG.player, player.x-16, player.y-10, 56, 72);

  // beams
  drawBeams();

  // HUD
  drawHUD();
}

function drawBeams() {
  CTX.save();
  CTX.globalAlpha = 0.95;
  for (const b of beams) {
    const seg = IMG.fx_beam;
    if (seg) {
      // repite la textura del beam
      const h = 10, segW = 32;
      let drawn = 0;
      while (drawn < b.len) {
        const w = Math.min(segW, b.len-drawn);
        CTX.drawImage(seg, 0,0, segW, seg.height, b.x+drawn, b.y-h/2, w, h);
        drawn += w;
      }
    } else {
      // fallback: barra simple
      CTX.fillStyle = 'rgba(120,190,255,.9)';
      CTX.fillRect(b.x, b.y-3, b.len, 6);
    }
  }
  CTX.restore();
}

function drawHUD() {
  // caja score
  CTX.save();
  CTX.fillStyle = 'rgba(0,0,0,.65)';
  CTX.fillRect(16,16, 420, 92);
  CTX.fillStyle = '#fff';
  CTX.font = CFG.hud.scoreFont;
  CTX.fillText(`Score: ${score}`, 28, 62);
  CTX.font = CFG.hud.bestFont;
  CTX.fillText(`Best: ${bestScore}`, 28, 98);
  CTX.restore();

  // hearts (3)
  const s = CFG.hud.heartSize;
  const y = CFG.hud.heartsY;
  for (let i=0;i<3;i++){
    CTX.globalAlpha = i<player.lives?1:0.25;
    CTX.fillStyle = i<player.lives?'#e14':'#555';
    CTX.beginPath();
    CTX.arc(480+i*(s+8), y+12, s/2, 0, Math.PI*2);
    CTX.fill();
  }
  CTX.globalAlpha = 1;

  // barra power (no autorrellena)
  const bx = CFG.hud.powerX, by = CFG.hud.powerY, bw = CFG.hud.powerW, bh = CFG.hud.powerH;
  CTX.fillStyle = 'rgba(0,0,0,.45)';
  CTX.fillRect(bx, by, bw, bh);
  CTX.fillStyle = '#6fb9ff';
  const p = player.power/CFG.powerMax;
  CTX.fillRect(bx, by, bw*p, bh);
}

/* ============================== OVERLAY UI ================================== */
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');

function showOverlay(title, subtitle) {
  overlay.style.display = 'flex';
  overlay.innerHTML = `
    <h1>${title}</h1>
    <p>${subtitle.replace('\n','<br>')}</p>
    <button id="startBtn">Restart</button>
  `;
  overlay.querySelector('#startBtn').onclick = ()=>{
    overlay.style.display = 'none';
    startGame();
  };
}

/* ============================== BUCLE PRINCIPAL ============================= */
let last = performance.now();
function tick(t) {
  const dt = clamp((t-last)/1000, 0, 0.033);
  last = t;
  if (running) {
    update(dt);
    updateBeams(dt);
    CTX.clearRect(0,0,W,H);
    drawGame();
  }
  requestAnimationFrame(tick);
}

function startGame() {
  bestScore = Number(localStorage.getItem('dh_best')||0);
  reset();
  running = true;
}

loadAll().then(()=>{
  // SFX.music?.loop = true; SFX.music?.play?.();
  showOverlay('Disabled Hunter', 'Move: ← →  |  Jump: Space  |  Shoot: X');
  requestAnimationFrame(tick);
});
/* ============================================================================ */
