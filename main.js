/* ==========================
   Disabled Hunter — runner
   main.js (full replace)
========================== */

// ---------- helpers ----------
const CANVAS = document.getElementById('game');
const CTX = CANVAS.getContext('2d', { alpha: false });
let DPR = Math.max(1, Math.floor(window.devicePixelRatio || 1));
let W = 0, H = 0;

function fitCanvas() {
  const cssW = window.innerWidth;
  const cssH = window.innerHeight;
  DPR = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  CANVAS.width = Math.floor(cssW * DPR);
  CANVAS.height = Math.floor(cssH * DPR);
  CANVAS.style.width = cssW + 'px';
  CANVAS.style.height = cssH + 'px';
  CTX.setTransform(DPR, 0, 0, DPR, 0, 0); // unidad en px CSS
  W = cssW; H = cssH;
}
fitCanvas();
window.addEventListener('resize', fitCanvas);

function load(src) { const i = new Image(); i.src = src; return i; }
function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

// ---------- config ----------
/* ---------- CONFIG ÚNICA QUE TE INTERESA ---------- */
const CFG = {
  // Velocidad base del scroll (px por segundo)
  scrollSpeed: 150,           // antes 220 (≈ -15%)
  scrollAccelEachSec: 0,

  // Movimiento del jugador
  playerSpeed: 300,           // velocidad lateral (px/s)
  jump: -950,                 // fuerza salto (px/s)
  gravity: 2200,              // gravedad (px/s^2)
  coyote: 0.18,               // “coyote time”

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

// Offset global (mueve TODO junto si quieres bajar el juego)
const WORLD_Y_OFFSET = 0; // prueba 24 o 32 si quieres que todo se vea más abajo

// Parallax Y (alineados a tu ajuste final)
function yGround(){ return Math.round(H*0.66) + WORLD_Y_OFFSET; }
function yMid(){    return Math.round(H*0.12) + WORLD_Y_OFFSET; }
function yFog(){    return Math.round(H*0.50) + WORLD_Y_OFFSET; }

// Scroll de cada capa (parallax)
const LAYER_SCROLL = { mid: 0.35, fog: 0.55, ground: 1.0 };

// HUD dimensiones
const HUD = {
  margin: 16,
  fontPx: 36,
  heartSize: 22,
  heartGap: 8,
  power: { w: 520, h: 12, gapTop: 10 }
};

// ---------- assets ----------
const IMG = {
  bg:        load('assets/tiles/bg_static_1920x1080.png'),
  mid:       load('assets/tiles/tile_middleok.png'),
  fog:       load('assets/tiles/tile_fog_256x128.png'),
  ground:    load('assets/tiles/tile_ground_soft.png'),
  tomb:      load('assets/tiles/tile_tomb_1x1.png'),
  maus:      load('assets/tiles/tile_mausoleum_1x1.png'),

  player:    load('assets/player.png'),
  zombie:    load('assets/zombie.png'),
  coin:      load('assets/coin.png'),
  coinSpecial: load('assets/coin_special.png'),

  fx_beam:   load('assets/fx/fx_beam_128.png'),
  fx_hit:    load('assets/fx/fx_hit_48.png'),
  fx_puff:   load('assets/fx/fx_zombie_puff_64.png'),

  ui_heart:  load('assets/ui/ui_heart_32.png')
};

const SFX = {};
function loadSfx(key, src, vol=1){
  try { const a = new Audio(src); a.volume = vol; SFX[key]=a; } catch {}
}
loadSfx('coin','assets/sfx_coin.wav',0.45);
loadSfx('power','assets/sfx_power.wav',0.6);
loadSfx('beam','assets/sfx_beam.wav',0.5);
loadSfx('zdie','assets/sfx_zombie_die.wav',0.5);
loadSfx('gameover','assets/sfx_gameover.wav',0.6);
loadSfx('music','assets/music.mp3',0.35);

// ---------- estado ----------
let running = false;
let gameOver = false;
let best = parseInt(localStorage.getItem('best')||'0',10);

let score = 0;
let lives = 3;
let power = 0;

let scroll = 0;              // mundo recorrido
let speed = CFG.scrollSpeed; // velocidad actual del mundo

const player = {
  x: 180, y: 0, w: 52, h: 64,
  vy: 0, onGround: false,
  lastGroundTime: 0
};

const coins = [];    // {x,y,kind:'norm'|'spec',r}
const zombies = [];  // {x,y,w,h,alive:true}
const obsts = [];    // {x,y,w,h,img}

let nextSpawn = {
  coin: 300,
  spec: 1400,
  zom:  800,
  obst: 1000
};

// ---------- input ----------
const keys = new Set();
window.addEventListener('keydown', (e)=>{
  if (['ArrowLeft','ArrowRight','ArrowUp',' ','x','X'].includes(e.key)) e.preventDefault();
  keys.add(e.key);
});
window.addEventListener('keyup', (e)=> keys.delete(e.key));

function wantLeft(){  return keys.has('ArrowLeft'); }
function wantRight(){ return keys.has('ArrowRight'); }
function wantJump(){  return keys.has('ArrowUp') || keys.has(' '); }
function wantShoot(){ return keys.has('x') || keys.has('X'); }

// ---------- overlay ----------
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');
startBtn?.addEventListener('click', startGame);
function showOverlay(title,sub,btn='Start'){
  if (!overlay) return;
  overlay.querySelector('h1').textContent = title;
  let p = overlay.querySelector('p');
  if (p) p.textContent = sub || 'Move: ← → • Jump: ↑ / Space • Shoot: X';
  startBtn.textContent = btn;
  overlay.style.display = 'flex';
}
function hideOverlay(){ if (overlay) overlay.style.display='none'; }

// ---------- util spawn ----------
function rand(a,b){ return Math.random()*(b-a)+a; }
function choose(a,b){ return Math.random()<0.5 ? a : b; }

function scheduleNext(kind){
  const [A,B] = CFG.gaps[kind];
  nextSpawn[kind] += rand(A,B);
}

// ---------- reset / start ----------
function resetGame() {
  score=0; lives=3; power=0;
  scroll=0; speed=CFG.scrollSpeed;

  player.y = yGround()-player.h; player.vy=0; player.onGround=true; player.lastGroundTime=0;

  coins.length=0; zombies.length=0; obsts.length=0;

  nextSpawn.coin = scroll + rand(...CFG.gaps.coin);
  nextSpawn.spec = scroll + rand(...CFG.gaps.spec);
  nextSpawn.zom  = scroll + rand(...CFG.gaps.zom);
  nextSpawn.obst = scroll + rand(...CFG.gaps.obst);
}
function startGame(){
  hideOverlay();
  resetGame();
  gameOver=false; running=true;
  try { SFX.music?.loop = true; SFX.music?.play?.(); } catch {}
}

// ---------- colisiones ----------
function aabb(ax,ay,aw,ah,bx,by,bw,bh){
  return ax<bx+bw && ax+aw>bx && ay<by+bh && ay+ah>by;
}

// ---------- lógica ----------
let last = performance.now();
function loop(t){
  const dt = Math.min(0.033, (t-last)/1000); last=t;
  if (running) update(dt);
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

function update(dt){
  // avanzar mundo
  scroll += speed * dt;

  // input lateral
  if (wantLeft())  player.x -= CFG.playerSpeed*dt;
  if (wantRight()) player.x += CFG.playerSpeed*dt;
  player.x = clamp(player.x, 40, W-80);

  // salto (coyote)
  if (wantJump()){
    if (player.onGround || (t - player.lastGroundTime) < CFG.coyote*1000) {
      player.vy = CFG.jump;
      player.onGround = false;
    }
  }

  // gravedad
  player.vy += CFG.gravity * dt;
  player.y += player.vy * dt;

  // suelo
  const gy = yGround()-player.h;
  if (player.y >= gy){ player.y=gy; player.vy=0; if (!player.onGround){ player.onGround=true; player.lastGroundTime=performance.now(); } }

  // disparo
  if (wantShoot() && power >= CFG.beamCost){
    power -= CFG.beamCost;
    SFX.beam?.currentTime=0; SFX.beam?.play?.();
    fireBeam();
  }

  // spawns por distancia (a la derecha del jugador/pantalla)
  spawnByDistance();

  // monedas
  for (const c of coins){
    if (c.dead) continue;
    c.x -= speed*dt;
    if (Math.hypot(player.x + player.w*0.5 - c.x, player.y + player.h*0.5 - c.y) < 28){
      onPickupCoin(c);
    }
    if (c.x < -80) c.dead=true;
  }

  // zombies
  for (const z of zombies){
    if (!z.alive) continue;
    z.x -= speed*dt * 0.85; // se mueven un poco más lento que el suelo para sentir “peso”
    if (z.x < -120) z.alive=false;

    // colisión con jugador (si no hay tumba tapando)
    let blocked = false;
    for (const o of obsts){
      if (aabb(z.x,z.y,z.w,z.h,o.x,o.y,o.w,o.h)) blocked=true;
    }
    if (!blocked && aabb(player.x,player.y,player.w,player.h, z.x,z.y,z.w,z.h)){
      hitPlayer();
    }
  }

  // obstáculos
  for (const o of obsts){
    o.x -= speed*dt;
    if (o.x < -200) o.dead=true;

    // si te estampas contra el obstáculo
    if (aabb(player.x,player.y,player.w,player.h, o.x,o.y,o.w,o.h)){
      hitPlayer();
    }
  }

  // limpiar muertos
  prune(coins); prune(zombies, z=>z.alive===false || z.dead); prune(obsts);

  // dificultad por tiempo (si quieres, está 0)
  speed += CFG.scrollAccelEachSec * dt;
}

function prune(arr, pred){
  for (let i=arr.length-1;i>=0;i--){
    const e = arr[i];
    const dead = pred ? pred(e) : e.dead;
    if (dead) arr.splice(i,1);
  }
}

function hitPlayer(){
  if (gameOver) return;
  lives--;
  if (lives<=0){
    gameOver=true; running=false;
    best = Math.max(best, score);
    localStorage.setItem('best', best);
    SFX.gameover?.play?.();
    showOverlay('Disabled Hunter', `Score: ${score}\nBest: ${best}`, 'Restart');
  }
}

function onPickupCoin(c){
  if (c.kind === 'spec'){
    power = clamp(power + 50, 0, CFG.powerMax);
    SFX.power?.play?.();
  } else {
    score += 50;
    SFX.coin?.play?.();
  }
  c.dead = true;
}

function fireBeam(){
  // desde la boca del arma
  const MUZZLE = { x: player.x + 28, y: player.y - 10 + player.h/2 };
  const maxLen = 900;
  let hitX = MUZZLE.x + maxLen, hitY = MUZZLE.y;

  // choca con primer obstáculo o zombie
  let firstHitX = Infinity, firstT = null;

  // colisión con obstáculo (bloquea)
  for (const o of obsts){
    if (MUZZLE.y < o.y || MUZZLE.y > o.y+o.h) continue;
    if (o.x > MUZZLE.x && o.x < firstHitX){ firstHitX=o.x; firstT=o; }
  }
  // si no hay obstáculo, busca zombie
  if (firstHitX === Infinity){
    for (const z of zombies){
      if (!z.alive) continue;
      if (MUZZLE.y < z.y || MUZZLE.y > z.y+z.h) continue;
      if (z.x > MUZZLE.x && z.x < firstHitX){ firstHitX=z.x; firstT=z; }
    }
  }

  if (firstHitX !== Infinity){
    hitX = firstHitX;
    // si es zombie => matarlo
    if (firstT && firstT.w && firstT.h && firstT.hasOwnProperty('alive')){
      firstT.alive=false;
      score += 150;
      SFX.zdie?.play?.();
    }
  }

  // dibujar beam un frame “largo”
  beams.push({ x1:MUZZLE.x, y1:MUZZLE.y, x2:hitX, y2:hitY, t:0.08 });
}
const beams = [];

// spawns controlados por distancia
function spawnByDistance(){
  const rightWorld = scroll + W*1.1; // nacen fuera de pantalla a la derecha

  // monedas normales
  if (scroll >= nextSpawn.coin){
    const y = yGround()-Math.random()*120-40;
    coins.push({ x:rightWorld, y, r:16, kind:'norm', img:IMG.coin });
    scheduleNext('coin');
  }
  // especiales
  if (scroll >= nextSpawn.spec){
    const y = yGround()-Math.random()*140-60;
    coins.push({ x:rightWorld, y, r:18, kind:'spec', img:IMG.coinSpecial });
    scheduleNext('spec');
  }
  // zombies
  if (scroll >= nextSpawn.zom){
    const y = yGround()-64;
    zombies.push({ x:rightWorld, y, w:52, h:64, alive:true });
    scheduleNext('zom');
  }
  // obstáculos (prob)
  if (scroll >= nextSpawn.obst){
    if (Math.random() < CFG.gaps.obstChance){
      const img = Math.random()<0.5 ? IMG.tomb : IMG.maus;
      const y = yGround() - CFG.obst.drawH + 8;
      obsts.push({ x:rightWorld, y, w:CFG.obst.hitW, h:CFG.obst.hitH, img, drawW:CFG.obst.drawW, drawH:CFG.obst.drawH });
    }
    scheduleNext('obst');
  }
}

// ---------- dibujo ----------
function drawBGStatic(){
  if (!IMG.bg.complete) return;
  // cubrir y centrar
  const iw = IMG.bg.naturalWidth || 1920;
  const ih = IMG.bg.naturalHeight || 1080;
  const sx = 0, sy = 0, sw = iw, sh = ih;
  // cover
  const r = Math.max(W/iw, H/ih);
  const dw = iw*r, dh=ih*r;
  const dx = (W-dw)/2, dy=(H-dh)/2;
  CTX.drawImage(IMG.bg, sx, sy, sw, sh, dx, dy, dw, dh);
}

function drawTiled(img, y, factor, tileW){
  if (!img.complete) return;
  const scrollX = (scroll*factor) % (tileW);
  let x = -scrollX - tileW;
  while (x < W + tileW){
    CTX.drawImage(img, x, y);
    x += tileW;
  }
}

function drawHearts(hx, hy){
  for (let i=0;i<3;i++){
    const a = i<lives ? 1 : 0.25;
    drawHeart(hx + i*(HUD.heartSize+HUD.heartGap), hy, HUD.heartSize, a);
  }
}
function drawHeart(x,y,size,alpha=1){
  CTX.save();
  CTX.globalAlpha = alpha;
  CTX.drawImage(IMG.ui_heart, x, y, size, size);
  CTX.restore();
}

function drawHUD(){
  const m = HUD.margin;
  CTX.save();
  CTX.shadowColor = 'rgba(0,0,0,.6)';
  CTX.shadowBlur = 12;

  // caja score
  const boxW = 290, boxH = HUD.fontPx * 1.7;
  CTX.fillStyle='rgba(0,0,0,.6)';
  CTX.fillRect(m,m,boxW,boxH);

  CTX.fillStyle='#fff';
  CTX.font = `bold ${HUD.fontPx}px Inter, system-ui, sans-serif`;
  CTX.fillText(`Score: ${score}`, m+18, m+HUD.fontPx);
  CTX.fillText(`Best: ${best}`,  m+18, m+HUD.fontPx*1.9);

  // corazones
  const hx = m + boxW + 20;
  const hy = m + 6;
  drawHearts(hx,hy);

  // barra poder
  const bx=hx, by=hy + HUD.heartSize + HUD.power.gapTop;
  const bw=HUD.power.w, bh=HUD.power.h;
  CTX.fillStyle='rgba(30,30,30,.9)';
  CTX.fillRect(bx,by,bw,bh);
  CTX.fillStyle='#5aa7ff';
  CTX.fillRect(bx,by,bw*(power/CFG.powerMax),bh);

  CTX.restore();
}

function drawBeamSeg(x1,y1,x2,y2){
  if (!IMG.fx_beam.complete){
    // fallback: línea
    CTX.strokeStyle='#7ec0ff'; CTX.lineWidth=6; CTX.beginPath(); CTX.moveTo(x1,y1); CTX.lineTo(x2,y2); CTX.stroke();
    return;
  }
  const dx=x2-x1, dy=y2-y1, len=Math.hypot(dx,dy), ang=Math.atan2(dy,dx);
  const segW=128, segH=28;
  let drawn=0;
  CTX.save();
  CTX.translate(x1,y1); CTX.rotate(ang); CTX.globalAlpha=0.95;
  while (drawn < len){
    const w=Math.min(segW, len-drawn);
    CTX.drawImage(IMG.fx_beam, 0,0,segW,segH, drawn, -segH/2, w, segH);
    drawn += w;
  }
  CTX.restore();
}

function draw(){
  // fondo estático
  drawBGStatic();

  // middle (cementerio desenfocado móvil)
  drawTiled(IMG.mid, yMid(), LAYER_SCROLL.mid, IMG.mid.width || 960);

  // niebla
  drawTiled(IMG.fog, yFog(), LAYER_SCROLL.fog, IMG.fog.width || 960);

  // ground
  drawTiled(IMG.ground, yGround(), LAYER_SCROLL.ground, IMG.ground.width || 960);

  // entidades
  // obstáculos (debajo de zombies)
  for (const o of obsts){
    CTX.drawImage(o.img, o.x - (o.drawW - o.w)/2, o.y - (o.drawH - CFG.obst.hitH), o.drawW, o.drawH);
  }

  // monedas
  for (const c of coins){
    if (c.dead) continue;
    const img = c.kind==='spec'? IMG.coinSpecial : IMG.coin;
    CTX.drawImage(img, c.x-24, c.y-24, 48, 48);
  }

  // zombies
  for (const z of zombies){
    if (!z.alive) continue;
    CTX.drawImage(IMG.zombie, z.x-26, z.y, 52, 64);
  }

  // player
  CTX.drawImage(IMG.player, player.x-26, player.y, 52, 64);

  // beams (efecto corto)
  for (let i=beams.length-1;i>=0;i--){
    const b=beams[i];
    drawBeamSeg(b.x1,b.y1,b.x2,b.y2);
    b.t -= 1/60;
    if (b.t<=0) beams.splice(i,1);
  }

  // HUD
  drawHUD();
}

// ---------- inicio ----------
showOverlay('Disabled Hunter', 'Move: ← →  |  Jump: ↑ / Space  |  Shoot: X', 'Start');
