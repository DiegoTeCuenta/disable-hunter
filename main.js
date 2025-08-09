// =========================
// Disabled Hunter — DEBUG BUILD R13
// D=walls, B=play-band, L=spawn zombies x3, G=god mode
// =========================

const BUILD_TAG = 'R13';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// ---- Assets ----
const ASSETS = {
  bg: 'assets/background.jpg',
  player: 'assets/player.png',
  zombie: 'assets/zombie.png',
  coin: 'assets/coin.png',
  coinSpecial: 'assets/coin_special.png',
  music: 'assets/music.mp3',
  sfx: {
    coin: 'assets/sfx_coin.wav',
    power: 'assets/sfx_power.wav',
    beam: 'assets/sfx_beam.wav',
    zombieDie: 'assets/sfx_zombie_die.wav',
    gameover: 'assets/sfx_gameover.wav',
  },
  fx: {
    beam: 'assets/fx/fx_beam_128.png',
    hit:  'assets/fx/fx_hit_48.png',
    puff: 'assets/fx/fx_zombie_puff_64.png',
  },
  ui: { heart: 'assets/ui/ui_heart_32.png' }
};

// ---- Media ----
const bgImg = new Image(); bgImg.src = ASSETS.bg;
const playerImg = new Image(); playerImg.src = ASSETS.player;
const zombieImg = new Image(); zombieImg.src = ASSETS.zombie;
const coinImg = new Image(); coinImg.src = ASSETS.coin;
const coinSpecialImg = new Image(); coinSpecialImg.src = ASSETS.coinSpecial;
const fxBeamImg = new Image(); fxBeamImg.src = ASSETS.fx.beam;
const fxHitImg  = new Image(); fxHitImg.src  = ASSETS.fx.hit;
const fxPuffImg = new Image(); fxPuffImg.src = ASSETS.fx.puff;
const heartImg  = new Image(); heartImg.src = ASSETS.ui.heart;

let music;
function startMusic(){
  if (!music){
    music = new Audio(ASSETS.music);
    music.loop = true; music.volume = 0.45;
  }
  music.currentTime = 0;
  music.play().catch(()=>{});
}
const sfx = {
  coin: new Audio(ASSETS.sfx.coin),
  power: new Audio(ASSETS.sfx.power),
  beam: new Audio(ASSETS.sfx.beam),
  zombieDie: new Audio(ASSETS.sfx.zombieDie),
  gameover: new Audio(ASSETS.sfx.gameover),
};
Object.values(sfx).forEach(a => a.volume = 0.85);

// ---- Input / Debug ----
const keys = {};
let showWalls = false;
let showPlayBand = false;
let godMode = false;

document.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (k==='d') showWalls = !showWalls;
  if (k==='b') showPlayBand = !showPlayBand;
  if (k==='g') godMode = !godMode;
  if (k==='l') forceSpawnZombies(3);
});
document.addEventListener('keyup',   e => keys[e.key.toLowerCase()] = false);

// ---- Game state ----
const state = {
  running: false,
  gameover: false,
  score: 0,
  hiScore: Number(localStorage.getItem('dh_hiscore')||0),
  hunter: 0,
  lives: 3
};
const player = { x: 80, y: 360, w: 72, h: 72, speed: 4.0, facing: 1, inv: 0 };

let zombies = [];
let coins = [];
let specialCoin = null;
let beam = null;

let specialCooldown = 240;
let zombieSpawnTimer = 0;

// **gracia de arranque** (evita quedar pegado)
let startGraceFrames = 0;

// ---- Maze (rects) ----
const walls = [
  {x:0,y:-20,w:960,h:20},
  {x:0,y:508,w:960,h:32},
  {x:-30,y:0,w:30,h:540},
  {x:960,y:0,w:30,h:540},

  {x:180,y:260,w:180,h:80},
  {x:420,y:260,w:180,h:80},
  {x:660,y:260,w:180,h:80},

  {x:120,y:470,w:160,h:34},
  {x:360,y:470,w:160,h:34},
  {x:600,y:470,w:160,h:34},

  {x:36,y:300,w:120,h:60},
  {x:804,y:320,w:120,h:60}
];

// Banda vertical amplia
const playMinY = 120;
const playMaxY = 530;

// ---- Overlay ----
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');
if (startBtn) startBtn.onclick = () => startGame();

function startGame(){
  reset();
  overlay.style.display = 'none';
  startMusic();
  console.log('[DEBUG]', BUILD_TAG, 'started');
}
function gameOver(){
  state.gameover = true;
  sfx.gameover.currentTime=0; sfx.gameover.play().catch(()=>{});
  if (state.score > state.hiScore){
    state.hiScore = state.score;
    localStorage.setItem('dh_hiscore', String(state.hiScore));
  }
  setTimeout(()=>{
    overlay.innerHTML = `
      <h1>Game Over</h1>
      <p>Score: ${state.score} &nbsp;|&nbsp; Best: ${state.hiScore}</p>
      <button id="startBtn">Play again</button>`;
    overlay.style.display='flex';
    document.getElementById('startBtn').onclick = ()=> startGame();
  },600);
}

// ---- Colisiones / Utils ----
function hitboxFor(obj, inset=8){
  const w = Math.max(10, obj.w - inset*2);
  const h = Math.max(10, obj.h - inset*2);
  return { x: obj.x + inset, y: obj.y + inset, w, h };
}
function rectsOverlap(a,b){
  const ra = ('w' in a && 'h' in a) ? a : hitboxFor(a,8);
  const rb = ('w' in b && 'h' in b) ? b : hitboxFor(b,8);
  return !(ra.x+ra.w < rb.x || ra.x > rb.x+rb.w || ra.y+ra.h < rb.y || ra.y > rb.y+rb.h);
}
function rectHitsAnyWall(r){
  const rr = ('w' in r && 'h' in r) ? r : hitboxFor(r,8);
  for (const w of walls){
    if (!(rr.x+rr.w < w.x || rr.x > w.x+w.w || rr.y+rr.h < w.y || rr.y > w.y+w.h)) return true;
  }
  return false;
}
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }

function lineClear(x1,y1,x2,y2, steps=24){
  for (let i=0;i<=steps;i++){
    const t = i/steps;
    const px = x1 + (x2-x1)*t;
    const py = y1 + (y2-y1)*t;
    if (rectHitsAnyWall({x:px-4,y:py-4,w:8,h:8})) return false;
  }
  return true;
}

// Buscar un punto libre para el jugador al iniciar
function safeStartPlayer(){
  const candidates = [
    {x:80, y:360}, {x:80, y:320}, {x:80, y:400},
    {x:110, y:360}, {x:140, y:360}, {x:110, y:320}
  ];
  for (const c of candidates){
    const r = {x:c.x, y:c.y, w:player.w, h:player.h};
    if (!rectHitsAnyWall(r)) { player.x=c.x; player.y=c.y; return; }
  }
  // fallback: fuerza dentro de la franja
  player.x = 80; player.y = clamp(360, playMinY, playMaxY-player.h);
}

function unstick(obj){
  let tries = 40;
  while (rectHitsAnyWall(obj) && tries--){
    obj.y = clamp(obj.y - 4, playMinY, playMaxY - obj.h);
    obj.x = clamp(obj.x + 3, 10, canvas.width - obj.w - 10);
  }
}

// ---- Spawns ----
function reset(){
  state.running = true; state.gameover = false;
  state.score = 0; state.lives = 3; state.hunter = 0;
  player.facing = 1; player.inv = 0;

  safeStartPlayer();
  unstick(player);
  startGraceFrames = 20; // <<< gracia de arranque

  zombies.length = 0; coins.length = 0; specialCoin = null;
  specialCooldown = 60; zombieSpawnTimer = 0;

  spawnCoins();
  ensureZombies(2);
}

function spawnCoins(){
  coins.length = 0;
  const spots = [
    {x:140,y:380},{x:230,y:330},{x:300,y:420},
    {x:380,y:360},{x:470,y:420},{x:540,y:330},
    {x:620,y:390},{x:720,y:350},{x:820,y:390}
  ];
  for (const s of spots){
    const r = {x:s.x-10,y:s.y-10,w:20,h:20};
    if (Math.random()<0.9 && !rectHitsAnyWall(r)) coins.push({x:s.x,y:s.y,r:16,alive:true});
  }
}

function trySpawnSpecial(){
  if (specialCoin && specialCoin.alive) return;

  const pcx = player.x + player.w/2;
  const pcy = player.y + player.h/2;

  let tries = 30;
  while (tries--){
    const sx = 120 + Math.random()*(canvas.width-240);
    const sy = clamp( playMinY + 40 + Math.random()*(playMaxY - playMinY - 80),
                      playMinY+40, playMaxY-40 );
    const area = {x:sx-18,y:sy-18,w:36,h:36};
    if (rectHitsAnyWall(area)) continue;
    if (!lineClear(pcx, pcy, sx, sy)) continue;
    specialCoin = {x:sx,y:sy,r:18,alive:true};
    break;
  }
}

// zombi dentro del mapa y lejos del jugador
function safeZombieStart(fromRight, w=72, h=72){
  const pad = 8;
  let x = fromRight ? (canvas.width - w - pad) : pad;

  const distX = Math.abs((player.x + player.w/2) - (x + w/2));
  if (distX < 220) x = (x === pad) ? (canvas.width - w - pad) : pad;

  let y = clamp( 180 + Math.random()*260, playMinY+8, playMaxY - h - 8 );
  let tries = 16;
  while (rectHitsAnyWall({x,y,w,h}) && tries--){
    y = clamp(y + (Math.random()<0.5?-18:18), playMinY+8, playMaxY - h - 8);
  }
  const pcx = player.x + player.w/2, pcy = player.y + player.h/2;
  const zcx = x + w/2, zcy = y + h/2;
  if (Math.hypot(zcx-pcx, zcy-pcy) < 220){
    x = (x === pad) ? (canvas.width - w - pad) : pad;
  }
  return {x,y};
}

function spawnZombie(){
  let fromRight = Math.random() < 0.5;
  if (fromRight && player.x > canvas.width*0.55) fromRight = false;
  if (!fromRight && player.x < canvas.width*0.45) fromRight = true;
  const pos = safeZombieStart(fromRight);
  const z = { x: pos.x, y: pos.y, w:72, h:72, speed: 0.95 + Math.random()*0.9, alive:true, dir: fromRight?-1:1 };
  zombies.push(z);
}
function ensureZombies(min){
  const alive = zombies.filter(z=>z.alive).length;
  for (let i=alive; i<min; i++) spawnZombie();
}
function forceSpawnZombies(n=3){
  for (let i=0;i<n;i++) spawnZombie();
  console.log('[DEBUG] forced zombies:', n, 'total:', zombies.length);
}

// ---- Loop ----
let last = 0;
function loop(ts){
  const dt = Math.min(32, ts - last); last = ts;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ---- Update ----
function update(dt){
  if (!state.running || state.gameover) return;

  // Movimiento
  let dx = 0, dy = 0;
  if (keys['arrowleft'] || keys['z'])  { dx -= player.speed; player.facing = -1; }
  if (keys['arrowright']|| keys['c'])  { dx += player.speed; player.facing =  1; }
  if (keys['arrowup']   || keys['s'])  { dy -= player.speed; }
  if (keys['arrowdown'] || keys['x'])  { dy += player.speed; }

  if (startGraceFrames > 0){
    // durante la gracia: mover sin colisión para “despegarse”
    player.x += dx; player.y += dy;
    startGraceFrames--;
  } else {
    // con colisión normal
    let next = {x: player.x + dx, y: player.y, w: player.w, h: player.h};
    if (!rectHitsAnyWall(next)) player.x = next.x;
    next = {x: player.x, y: player.y + dy, w: player.w, h: player.h};
    if (!rectHitsAnyWall(next)) player.y = next.y;
  }

  player.x = clamp(player.x, 10, canvas.width - player.w - 10);
  player.y = clamp(player.y, playMinY, playMaxY - player.h);

  if (state.hunter>0) state.hunter--;
  if (player.inv>0)   player.inv--;

  // Spawns de zombies continuos (máx 4)
  zombieSpawnTimer += dt;
  if (zombieSpawnTimer > 1000){
    const alive = zombies.filter(z=>z.alive).length;
    if (alive < 4) spawnZombie();
    zombieSpawnTimer = 0;
  }
  if (zombies.filter(z=>z.alive).length === 0) spawnZombie();

  // Moneda especial
  if (specialCooldown>0){
    specialCooldown--;
    if (specialCooldown<=0){ trySpawnSpecial(); specialCooldown = 240; }
  }

  // Monedas normales
  for (const c of coins){
    if (!c.alive) continue;
    const dx = (player.x+player.w/2)-c.x, dy=(player.y+player.h/2)-c.y;
    if (Math.hypot(dx,dy) < c.r+26){
      c.alive=false; state.score += 10;
      sfx.coin.currentTime=0; sfx.coin.play().catch(()=>{});
    }
  }
  if (coins.every(c=>!c.alive)){
    spawnCoins();
    ensureZombies(3);
  }

  // Special
  if (specialCoin && specialCoin.alive){
    const dxs = (player.x+player.w/2)-specialCoin.x, dys=(player.y+player.h/2)-specialCoin.y;
    if (Math.hypot(dxs,dys) < specialCoin.r+28){
      specialCoin.alive=false;
      state.hunter = 8*60;
      state.score += 25;
      sfx.power.currentTime=0; sfx.power.play().catch(()=>{});
    }
  }

  // Beam
  if (state.hunter>0 && (keys[' '] || keys['space']) && !beam){
    const bx = player.facing===1 ? player.x + player.w - 8 : player.x - 120;
    beam = { x: bx, y: player.y + player.h*0.35, w: 120, h: 18, ttl: 10, dir: player.facing };
    sfx.beam.currentTime=0; sfx.beam.play().catch(()=>{});
  }
  if (beam){
    beam.ttl--;
    zombies.forEach(z=>{
      if (!z.alive) return;
      const bx1 = beam.x, bw = Math.abs(beam.w);
      const hit = !(z.x > bx1 + bw || z.x + z.w < bx1 || z.y > beam.y + beam.h || z.y + z.h < beam.y);
      if (hit){
        z.alive=false; state.score += 50;
        sfx.zombieDie.currentTime=0; sfx.zombieDie.play().catch(()=>{});
        z.puff = { x: z.x+z.w/2, y: z.y+z.h/2, ttl: 18 };
      }
    });
    if (beam.ttl<=0) beam=null;
  }

  // Zombies
  zombies.forEach(z=>{
    if (!z.alive) return;

    const stepX = (player.x > z.x) ? z.speed : -z.speed;
    const tryX = {x: z.x + stepX, y: z.y, w: z.w, h: z.h};
    if (!rectHitsAnyWall(tryX)) z.x += stepX;

    const stepY = (player.y > z.y) ? z.speed*0.45 : -z.speed*0.45;
    const tryY = {x: z.x, y: z.y + stepY, w: z.w, h: z.h};
    if (!rectHitsAnyWall(tryY)) z.y += stepY;

    if (!godMode && rectsOverlap(hitboxFor(player,10), hitboxFor(z,10)) && state.hunter<=0 && player.inv<=0){
      state.lives--;
      player.inv = 60;
      const dir = (player.x < z.x) ? -1 : 1;
      player.x += dir * -40;
      if (state.lives <= 0){ state.running=false; gameOver(); }
    }
  });
}

// ---- Draw ----
function draw(){
  if (bgImg.complete) ctx.drawImage(bgImg, 0,0, canvas.width, canvas.height);
  else { ctx.fillStyle='#0b0e13'; ctx.fillRect(0,0,canvas.width,canvas.height); }

  if (showWalls) debugWalls();
  if (showPlayBand) debugPlayBand();

  // coins
  for (const c of coins){
    if (!c.alive) continue;
    if (coinImg.complete) ctx.drawImage(coinImg, c.x-16, c.y-16, 32, 32);
    else { ctx.fillStyle='gold'; ctx.beginPath(); ctx.arc(c.x,c.y,16,0,Math.PI*2); ctx.fill(); }
  }
  // special
  if (specialCoin && specialCoin.alive){
    if (coinSpecialImg && coinSpecialImg.complete && coinSpecialImg.naturalWidth>0){
      ctx.drawImage(coinSpecialImg, specialCoin.x-18, specialCoin.y-18, 36,36);
    } else {
      ctx.save();
      const g = ctx.createRadialGradient(specialCoin.x, specialCoin.y, 4, specialCoin.x, specialCoin.y, 26);
      g.addColorStop(0,'rgba(0,120,255,0.9)');
      g.addColorStop(1,'rgba(0,120,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(specialCoin.x, specialCoin.y, 24, 0, Math.PI*2); ctx.fill();
      ctx.restore();
      if (coinImg.complete) ctx.drawImage(coinImg, specialCoin.x-16, specialCoin.y-16, 32,32);
    }
  }

  // zombies
  zombies.forEach(z=>{
    if (z.alive){
      if (zombieImg.complete) ctx.drawImage(zombieImg, z.x, z.y, z.w, z.h);
      else { ctx.fillStyle='#f33'; ctx.fillRect(z.x, z.y, z.w, z.h); }
    }
    if (z.puff){
      z.puff.ttl--;
      const a = Math.max(0, z.puff.ttl/18);
      ctx.save(); ctx.globalAlpha = a;
      if (fxPuffImg.complete) ctx.drawImage(fxPuffImg, z.puff.x-32, z.puff.y-32, 64,64);
      else { ctx.fillStyle='rgba(200,200,220,0.6)'; ctx.beginPath(); ctx.arc(z.puff.x, z.puff.y, 28*(1-a/2), 0, Math.PI*2); ctx.fill(); }
      ctx.restore();
      if (z.puff.ttl<=0) delete z.puff;
    }
  });

  // beam
  if (beam){
    ctx.save(); ctx.globalAlpha = 0.9;
    if (fxBeamImg.complete){
      const segW = 64, segH = 18, count = Math.ceil(Math.abs(beam.w)/segW);
      for (let i=0;i<count;i++) ctx.drawImage(fxBeamImg, beam.x + i*segW, beam.y, segW, segH);
    } else { ctx.fillStyle='#e6f7ff'; ctx.fillRect(beam.x, beam.y, Math.abs(beam.w), beam.h); }
    ctx.globalAlpha = 0.35;
    if (fxHitImg.complete) ctx.drawImage(fxHitImg, beam.x + Math.abs(beam.w)-24, beam.y-16, 48,48);
    ctx.restore();
  }

  // player
  if (playerImg.complete){
    ctx.save();
    if (state.hunter>0){ ctx.shadowBlur = 12; ctx.shadowColor = '#9fdcff'; }
    if (player.inv>0 && (Math.floor(performance.now()/100)%2===0)) ctx.globalAlpha = 0.5;
    ctx.drawImage(playerImg, player.x, player.y, player.w, player.h);
    ctx.restore();
  } else { ctx.fillStyle='#22c55e'; ctx.fillRect(player.x, player.y, player.w, player.h); }

  drawHUD();
}

function drawHUD(){
  ctx.save();
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = '#0b1320';
  ctx.fillRect(10, 10, 380, 70);
  ctx.globalAlpha = 1;

  ctx.fillStyle = '#fff'; ctx.font = '16px system-ui, sans-serif';
  ctx.fillText('Score: '+state.score, 20, 32);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('Best: '+state.hiScore, 20, 52);

  ctx.fillStyle = '#9fdcff';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText(`BUILD ${BUILD_TAG}  |  D: walls  B: play-band  L: zombies  G: god=${godMode?'ON':'OFF'}`, 20, 68);
  
  if (state.hunter>0){
    const max = 8*60, pct = Math.max(0, Math.min(1, state.hunter/max));
    ctx.fillStyle = '#9fdcff'; ctx.fillRect(205, 22, 110*pct, 10);
    ctx.strokeStyle = '#335'; ctx.strokeRect(205, 22, 110, 10);
    ctx.fillStyle = '#cfeaff'; ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('HUNTER', 205, 50);
  }

  for (let i=0;i<state.lives;i++){
    const hx = 335 + i*30, hy = 16;
    if (heartImg.complete) ctx.drawImage(heartImg, hx, hy, 24, 24);
    else { ctx.fillStyle='#ff6b6b'; ctx.beginPath(); ctx.arc(hx+12,hy+12,10,0,Math.PI*2); ctx.fill(); }
  }
  ctx.restore();
}

// ---- Debug helpers ----
function debugWalls(){
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#00d1ff';
  walls.forEach(w => ctx.fillRect(w.x, w.y, w.w, w.h));
  ctx.restore();

  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('DEBUG WALLS (press D to hide)', 700, 24);
  ctx.restore();
}
function debugPlayBand(){
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#0077ff';
  ctx.fillRect(0, playMinY, canvas.width, playMaxY - playMinY);
  ctx.restore();
}
