// =========================
// Disabled Hunter - Maze (logic) + Debug Walls
// =========================

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// ---- Assets ----
const ASSETS = {
  bg: 'assets/background.jpg',
  player: 'assets/player.png',
  zombie: 'assets/zombie.png',
  coin: 'assets/coin.png',
  coinSpecial: 'assets/coin_special.png', // si no existe, se hace glow
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

// ---- Input ----
const keys = {};
document.addEventListener('keydown', e => {
  keys[e.key.toLowerCase()] = true;
  if (e.key.toLowerCase()==='d') showWalls = !showWalls; // toggle debug
});
document.addEventListener('keyup',   e => keys[e.key.toLowerCase()] = false);

// ---- Game state ----
const state = {
  running: false,
  gameover: false,
  score: 0,
  hiScore: Number(localStorage.getItem('dh_hiscore')||0),
  hunter: 0,     // frames
  lives: 3
};
const player = { x: 80, y: 360, w: 72, h: 72, speed: 4.0, facing: 1, inv: 0 };
let zombies = [];
let coins = [];
let specialCoin = null;
let beam = null;
let specialCooldown = 240;   // ~4s entre intentos
let showWalls = false;       // pulsa D para verlas

// ---- Maze lógico (rects) ----
const walls = [
  // Bordes (dejan un margen superior e inferior jugable)
  {x:0,y:0,w:960,h:64},
  {x:0,y:508,w:960,h:32},
  {x:-30,y:0,w:30,h:540},
  {x:960,y:0,w:30,h:540},

  // Tres bloques “mausoleo” centrales
  {x:180,y:220,w:180,h:95},
  {x:420,y:220,w:180,h:95},
  {x:660,y:220,w:180,h:95},

  // Tumbas bajas que forman pasillos (no llegan al borde)
  {x:120,y:448,w:160,h:42},
  {x:360,y:448,w:160,h:42},
  {x:600,y:448,w:160,h:42},

  // Islas laterales
  {x:36,y:300,w:120,h:60},
  {x:804,y:320,w:120,h:60}
];

// Rango vertical amplio (casi todo el cementerio, evita franja negra)
const playMinY = 200;
const playMaxY = 500;

// ---- Overlay ----
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');
if (startBtn) startBtn.onclick = () => startGame();
function startGame(){
  reset();
  overlay.style.display = 'none';
  startMusic();
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

// ---- Spawns ----
function reset(){
  state.running = true; state.gameover = false;
  state.score = 0; state.lives = 3; state.hunter = 0;
  player.x = 80; player.y = 360; player.facing = 1; player.inv = 0;
  zombies.length = 0; coins.length = 0; specialCoin = null;
  specialCooldown = 60; // primera special rápido
  spawnCoins();
  ensureZombies(2); // inicia con 2
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
  // y dentro del rango accesible
  const sx = 120 + Math.random()*(canvas.width-240);
  const sy = clamp(280 + Math.random()*160, playMinY+24, playMaxY-24);
  const area = {x:sx-18,y:sy-18,w:36,h:36};
  if (!rectHitsAnyWall(area)) specialCoin = {x:sx,y:sy,r:18,alive:true};
}
function spawnZombie(){
  const fromRight = Math.random() < 0.5;
  const startX = fromRight ? canvas.width + 60 : -80;
  const y = clamp(260 + (Math.random()*200), playMinY+8, playMaxY-80);
  const z = { x:startX, y, w:72, h:72, speed: 0.9 + Math.random()*0.9, alive:true, dir: fromRight?-1:1 };
  zombies.push(z);
}
function ensureZombies(min){
  const alive = zombies.filter(z=>z.alive).length;
  for (let i=alive; i<min; i++) spawnZombie();
}

// ---- Utils ----
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
function rectsOverlap(a,b){
  const insetA = 8, insetB = 8;
  const ax1 = a.x + insetA, ay1 = a.y + insetA;
  const ax2 = a.x + a.w - insetA, ay2 = a.y + a.h - insetA;
  const bx1 = b.x + insetB, by1 = b.y + insetB;
  const bx2 = b.x + b.w - insetB, by2 = b.y + b.h - insetB;
  return !(ax2 < bx1 || ax1 > bx2 || ay2 < by1 || ay1 > by2);
}
function rectHitsAnyWall(r){
  for (const w of walls){
    if (!(r.x + r.w < w.x || r.x > w.x+w.w || r.y + r.h < w.y || r.y > w.y+w.h)) return true;
  }
  return false;
}

// ---- Loop ----
let last = 0, zombieSpawnTimer = 0;
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

  // Movimiento con pruebas de pared
  let dx = 0, dy = 0;
  if (keys['arrowleft'] || keys['z'])  { dx -= player.speed; player.facing = -1; }
  if (keys['arrowright']|| keys['c'])  { dx += player.speed; player.facing =  1; }
  if (keys['arrowup']   || keys['s'])  { dy -= player.speed; }
  if (keys['arrowdown'] || keys['x'])  { dy += player.speed; }

  let next = {x: player.x + dx, y: player.y, w: player.w, h: player.h};
  if (!rectHitsAnyWall(next)) player.x = next.x;
  next = {x: player.x, y: player.y + dy, w: player.w, h: player.h};
  if (!rectHitsAnyWall(next)) player.y = next.y;

  player.x = clamp(player.x, 10, canvas.width - player.w - 10);
  player.y = clamp(player.y, playMinY, playMaxY - player.h);

  if (state.hunter>0) state.hunter--;
  if (player.inv>0)   player.inv--;

  // Special coin spawn control
  if (specialCooldown>0){ specialCooldown--; if (specialCooldown<=0){ trySpawnSpecial(); specialCooldown = 240; } }

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
    ensureZombies(3); // sube la presión con cada ola
  }

  // Moneda especial
  if (specialCoin && specialCoin.alive){
    const dxs = (player.x+player.w/2)-specialCoin.x, dys=(player.y+player.h/2)-specialCoin.y;
    if (Math.hypot(dxs,dys) < specialCoin.r+28){
      specialCoin.alive=false;
      state.hunter = 8*60;
      state.score += 25;
      sfx.power.currentTime=0; sfx.power.play().catch(()=>{});
    }
  }

  // Ataque con Hunter
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

  // Zombies: movimiento + daño
  zombies.forEach(z=>{
    if (!z.alive) return;

    // steer básico con prueba de paredes
    const stepX = (player.x > z.x) ? z.speed : -z.speed;
    const tryX = {x: z.x + stepX, y: z.y, w: z.w, h: z.h};
    if (!rectHitsAnyWall(tryX)) z.x += stepX;

    const stepY = (player.y > z.y) ? z.speed*0.4 : -z.speed*0.4;
    const tryY = {x: z.x, y: z.y + stepY, w: z.w, h: z.h};
    if (!rectHitsAnyWall(tryY)) z.y += stepY;

    if (rectsOverlap(player, z) && state.hunter<=0 && player.inv<=0){
      state.lives--;
      player.inv = 60; // 1s
      const dir = (player.x < z.x) ? -1 : 1;
      player.x += dir * -40; // knockback
      if (state.lives <= 0){ state.running=false; gameOver(); }
    }
  });

  // Garantiza zombies activos (máx 4)
  zombieSpawnTimer += dt;
  if (zombieSpawnTimer > 1500){ // cada ~1.5s intenta
    const alive = zombies.filter(z=>z.alive).length;
    if (alive < 4) spawnZombie();
    zombieSpawnTimer = 0;
  }
}

// ---- Draw ----
function draw(){
  if (bgImg.complete) ctx.drawImage(bgImg, 0,0, canvas.width, canvas.height);
  else { ctx.fillStyle='#0b0e13'; ctx.fillRect(0,0,canvas.width,canvas.height); }

  if (showWalls) debugWalls();

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
      const grd = ctx.createRadialGradient(specialCoin.x, specialCoin.y, 4, specialCoin.x, specialCoin.y, 26);
      grd.addColorStop(0,'rgba(0,120,255,0.9)');
      grd.addColorStop(1,'rgba(0,120,255,0)');
      ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(specialCoin.x, specialCoin.y, 24, 0, Math.PI*2); ctx.fill();
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
  ctx.fillRect(10, 10, 300, 58);
  ctx.globalAlpha = 1;

  ctx.fillStyle = '#fff'; ctx.font = '16px system-ui, sans-serif';
  ctx.fillText('Score: '+state.score, 20, 32);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('Best: '+state.hiScore, 20, 52);

  if (state.hunter>0){
    const max = 8*60, pct = Math.max(0, Math.min(1, state.hunter/max));
    ctx.fillStyle = '#9fdcff'; ctx.fillRect(130, 22, 110*pct, 10);
    ctx.strokeStyle = '#335'; ctx.strokeRect(130, 22, 110, 10);
    ctx.fillStyle = '#cfeaff'; ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('HUNTER', 130, 50);
  }

  // vidas
  for (let i=0;i<state.lives;i++){
    const hx = 260 + i*30, hy = 16;
    if (heartImg.complete) ctx.drawImage(heartImg, hx, hy, 24, 24);
    else { ctx.fillStyle='#ff6b6b'; ctx.beginPath(); ctx.arc(hx+12,hy+12,10,0,Math.PI*2); ctx.fill(); }
  }
  ctx.restore();
}

// ---- Debug walls ----
function debugWalls(){
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#00d1ff';
  walls.forEach(w => ctx.fillRect(w.x, w.y, w.w, w.h));
  ctx.restore();

  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('DEBUG WALLS (press D to hide)', 700, 24);
  ctx.restore();
}

