// ====== CONFIG / ASSETS ======
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const ASSETS = {
  bg: 'assets/background.jpg',
  player: 'assets/player.png',
  zombie: 'assets/zombie.png',
  coin: 'assets/coin.png',
  // Si no tienes coin_special.png, usaremos coin normal + glow por código
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
  }
};

// ====== MEDIA ======
const bgImg = new Image(); bgImg.src = ASSETS.bg;
const playerImg = new Image(); playerImg.src = ASSETS.player;
const zombieImg = new Image(); zombieImg.src = ASSETS.zombie;
const coinImg = new Image(); coinImg.src = ASSETS.coin;
const coinSpecialImg = new Image(); coinSpecialImg.src = ASSETS.coinSpecial;
const fxBeamImg = new Image(); fxBeamImg.src = ASSETS.fx.beam;
const fxHitImg  = new Image(); fxHitImg.src  = ASSETS.fx.hit;
const fxPuffImg = new Image(); fxPuffImg.src = ASSETS.fx.puff;

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
Object.values(sfx).forEach(a => { a.volume = 0.8; });

// ====== INPUT ======
const keys = {};
document.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
document.addEventListener('keyup',   e => keys[e.key.toLowerCase()] = false);

// ====== GAME STATE ======
const state = {
  running: false,
  gameover: false,
  score: 0,
  hiScore: Number(localStorage.getItem('dh_hiscore')||0),
  hunter: 0,  // tiempo restante en frames (~60 = 1s)
};

const player = { x: 120, y: 380, w: 72, h: 72, speed: 4.0, facing: 1, inv: 0 };
let zombies = [];
let coins = [];
let specialCoin = null;
let beam = null; // {x,y,w,h,ttl}

// Zona jugable (dejamos “maze lógico” en área baja; luego colocaremos props)
const playMinY = 300, playMaxY = 440;

// ====== OVERLAY START / RESTART ======
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
  sfx.gameover.currentTime = 0; sfx.gameover.play().catch(()=>{});
  if (state.score > state.hiScore){
    state.hiScore = state.score;
    localStorage.setItem('dh_hiscore', String(state.hiScore));
  }
  setTimeout(()=>{ overlay.innerHTML = `
    <h1>Game Over</h1>
    <p>Score: ${state.score} &nbsp;|&nbsp; Best: ${state.hiScore}</p>
    <button id="startBtn">Play again</button>
  `; overlay.style.display='flex';
    document.getElementById('startBtn').onclick = ()=> startGame();
  }, 600);
}

// ====== SPAWNS ======
function reset(){
  state.running = true;
  state.gameover = false;
  state.score = 0;
  state.hunter = 0;
  player.x = 120; player.y = 380; player.facing = 1; player.inv = 0;
  zombies = [];
  coins = [];
  specialCoin = null;
  spawnCoins();
  spawnZombie();
  maybeSpawnSpecial();
}
function spawnCoins(){
  coins.length = 0;
  // 6–8 monedas distribuidas en pasillos bajos
  const spots = [
    {x: 180, y: 410}, {x: 280, y: 360}, {x: 380, y: 420},
    {x: 520, y: 370}, {x: 640, y: 415}, {x: 740, y: 360},
    {x: 860, y: 420}, {x: 980, y: 380}
  ];
  for (let i=0;i<spots.length;i++){
    if (Math.random()<0.85) coins.push({x:spots[i].x, y:spots[i].y, r:16, alive:true});
  }
}
function maybeSpawnSpecial(){
  // 30% de probabilidad de una moneda especial
  if (Math.random() < 0.3){
    specialCoin = { x: 120 + Math.random()*(canvas.width-240), y: 340 + Math.random()*80, r:18, alive:true };
  } else {
    specialCoin = null;
  }
}
function spawnZombie(){
  const sideRight = Math.random()<0.5;
  const startX = sideRight ? canvas.width+40 : -80;
  const speed = 0.8 + Math.random()*1.0;
  zombies.push({ x:startX, y: 392+ (Math.random()*40-20), w:72, h:72, speed, alive:true, dir: sideRight?-1:1 });
}

// ====== LOOP ======
let last = 0;
function loop(ts){
  const dt = Math.min(32, ts - last); last = ts;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ====== UPDATE ======
function update(dt){
  if (!state.running || state.gameover) return;

  // Movimiento
  if (keys['arrowleft'] || keys['z']) { player.x -= player.speed; player.facing = -1; }
  if (keys['arrowright']|| keys['c']) { player.x += player.speed; player.facing =  1; }
  if (keys['arrowup']   || keys['s']) { player.y -= player.speed; }
  if (keys['arrowdown'] || keys['x']) { player.y += player.speed; }
  // Límites “maze lógico” (pasillo bajo)
  player.x = Math.max(16, Math.min(canvas.width - player.w - 16, player.x));
  player.y = Math.max(playMinY, Math.min(playMaxY, player.y));

  // Hunter timer
  if (state.hunter>0) state.hunter--;

  // Invulnerabilidad pequeña tras golpe (si luego usamos vidas)
  if (player.inv>0) player.inv--;

  // Recoger monedas normales
  for (const c of coins){
    if (!c.alive) continue;
    const dx = (player.x+player.w/2)-c.x, dy=(player.y+player.h/2)-c.y;
    if (Math.hypot(dx,dy) < c.r+26){
      c.alive=false;
      state.score += 10;
      sfx.coin.currentTime=0; sfx.coin.play().catch(()=>{});
    }
  }
  // Si ya no quedan, respawn + chance especial
  if (coins.every(c=>!c.alive)){
    spawnCoins();
    maybeSpawnSpecial();
    // cada ronda, un zombi más (máx 4)
    if (zombies.filter(z=>z.alive).length < 4) spawnZombie();
  }

  // Moneda especial → modo Hunter
  if (specialCoin && specialCoin.alive){
    const dx = (player.x+player.w/2)-specialCoin.x, dy=(player.y+player.h/2)-specialCoin.y;
    if (Math.hypot(dx,dy) < specialCoin.r+28){
      specialCoin.alive=false;
      state.hunter = 8*60; // 8s
      state.score += 25;
      sfx.power.currentTime=0; sfx.power.play().catch(()=>{});
    }
  }

  // Ataque (solo con Hunter activo)
  if (state.hunter>0 && (keys[' '] || keys['space']) && !beam){
    const bx = player.facing===1 ? player.x + player.w - 8 : player.x - 120;
    beam = { x: bx, y: player.y + player.h*0.35, w: 120, h: 18, ttl: 10, dir: player.facing };
    sfx.beam.currentTime=0; sfx.beam.play().catch(()=>{});
  }
  if (beam){
    beam.ttl--;
    // Hit detection simple tipo rayo
    zombies.forEach(z=>{
      if (!z.alive) return;
      const bx1 = beam.dir===1 ? beam.x : beam.x;
      const bw  = Math.abs(beam.w);
      const hit = !(z.x > bx1 + bw || z.x + z.w < bx1 || z.y > beam.y + beam.h || z.y + z.h < beam.y);
      if (hit){
        z.alive=false;
        state.score += 50;
        sfx.zombieDie.currentTime=0; sfx.zombieDie.play().catch(()=>{});
        // puff visual (marcamos un efecto efímero)
        z.puff = { x: z.x+z.w/2, y:z.y+z.h/2, ttl: 18 };
      }
    });
    if (beam.ttl<=0) beam=null;
  }

  // Movimiento de zombies + daño al jugador
  zombies.forEach(z=>{
    if (!z.alive) return;
    // acercamiento básico
    const targetX = player.x + (player.facing===1? 10 : -10);
    if (z.x < targetX) z.x += z.speed; else z.x -= z.speed;
    // colisión con jugador (si NO hay hunter)
    if (rectsOverlap(player, z) && state.hunter<=0 && player.inv<=0){
      // muerte instantánea en esta versión
      state.running = false;
      gameOver();
    }
  });

  // Ocasionalmente spawnea otro zombie
  if (Math.random()<0.002 && zombies.filter(z=>z.alive).length<5) spawnZombie();
}
function rectsOverlap(a,b){
  return !(a.x+a.w < b.x || a.x > b.x+b.w || a.y+a.h < b.y || a.y > b.y+b.h);
}

// ====== DRAW ======
function draw(){
  // Fondo
  if (bgImg.complete) ctx.drawImage(bgImg, 0,0, canvas.width, canvas.height);
  else { ctx.fillStyle = '#0b0e13'; ctx.fillRect(0,0,canvas.width,canvas.height); }

  // Monedas normales
  for (const c of coins){
    if (!c.alive) continue;
    if (coinImg.complete) ctx.drawImage(coinImg, c.x-16, c.y-16, 32, 32);
    else { ctx.fillStyle='gold'; ctx.beginPath(); ctx.arc(c.x,c.y,16,0,Math.PI*2); ctx.fill(); }
  }
  // Moneda especial
  if (specialCoin && specialCoin.alive){
    if (coinSpecialImg.complete && coinSpecialImg.naturalWidth>0){
      ctx.drawImage(coinSpecialImg, specialCoin.x-18, specialCoin.y-18, 36,36);
    } else {
      // fallback: moneda normal + glow
      ctx.save();
      const grd = ctx.createRadialGradient(specialCoin.x, specialCoin.y, 4, specialCoin.x, specialCoin.y, 24);
      grd.addColorStop(0,'rgba(255,240,0,0.9)');
      grd.addColorStop(1,'rgba(255,240,0,0)');
      ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(specialCoin.x, specialCoin.y, 22, 0, Math.PI*2); ctx.fill();
      ctx.restore();
      if (coinImg.complete) ctx.drawImage(coinImg, specialCoin.x-16, specialCoin.y-16, 32,32);
    }
  }

  // Zombies
  zombies.forEach(z=>{
    if (z.alive){
      if (zombieImg.complete) ctx.drawImage(zombieImg, z.x, z.y, z.w, z.h);
      else { ctx.fillStyle = '#f33'; ctx.fillRect(z.x, z.y, z.w, z.h); }
    }
    // puff tras morir
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

  // Beam
  if (beam){
    ctx.save();
    ctx.globalAlpha = 0.9;
    if (fxBeamImg.complete) {
      // repetimos el sprite beam a lo largo del rayo
      const segW = 64, segH = 18;
      const count = Math.ceil(Math.abs(beam.w)/segW);
      for (let i=0;i<count;i++){
        ctx.drawImage(fxBeamImg, beam.x + i*segW, beam.y, segW, segH);
      }
    } else {
      ctx.fillStyle = '#e6f7ff'; ctx.fillRect(beam.x, beam.y, Math.abs(beam.w), beam.h);
    }
    // hit glow
    ctx.globalAlpha = 0.35;
    if (fxHitImg.complete) ctx.drawImage(fxHitImg, beam.x + Math.abs(beam.w)-24, beam.y-16, 48,48);
    ctx.restore();
  }

  // Player
  if (playerImg.complete) {
    ctx.save();
    if (state.hunter>0){
      // leve brillo en modo Hunter
      ctx.shadowBlur = 12; ctx.shadowColor = '#9fdcff';
    }
    ctx.drawImage(playerImg, player.x, player.y, player.w, player.h);
    ctx.restore();
  } else { ctx.fillStyle = '#22c55e'; ctx.fillRect(player.x, player.y, player.w, player.h); }

  // HUD (panel por código)
  drawHUD();
}
function drawHUD(){
  // panel
  ctx.save();
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = '#0b1320';
  ctx.fillRect(10, 10, 240, 58);
  ctx.globalAlpha = 1;

  // score
  ctx.fillStyle = '#fff'; ctx.font = '16px system-ui, sans-serif';
  ctx.fillText('Score: '+state.score, 20, 32);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText('Best: '+state.hiScore, 20, 52);

  // hunter timer bar
  if (state.hunter>0){
    const max = 8*60;
    const pct = Math.max(0, Math.min(1, state.hunter/max));
    ctx.fillStyle = '#9fdcff'; ctx.fillRect(130, 22, 110*pct, 10);
    ctx.strokeStyle = '#335'; ctx.strokeRect(130, 22, 110, 10);
    ctx.fillStyle = '#cfeaff'; ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('HUNTER', 130, 50);
  }
  ctx.restore();
}
