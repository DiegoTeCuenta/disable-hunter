// =========================
// Disabled Hunter — main.js (Player-Driven + Ahead Spawns)
// =========================

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
function resize(){ canvas.width = innerWidth; canvas.height = innerHeight; }
addEventListener("resize", resize); resize();

/* ----------------- T U N I N G  ----------------- */
const CFG = {
  // Movimiento del jugador
  playerSpeed: 6.0,
  jump:       -21.0,
  gravity:     1.12,
  coyote:      0.10,

  // Parallax
  px: { middle: 0.25, fog: 0.45, ground: 0.85 },

  // Spawns por distancia recorrida
  spawn: {
    coinMin: 280,  coinMax: 520,
    specMin: 1800, specMax: 2600,
    zomMin:  700,  zomMax:  1100,
    obsMin:  900,  obsMax:  1500,
    obsChance: 0.55
  },

  // Obstáculos
  obst: { hitW: 78, hitH: 66, drawW: 112, drawH: 112 },

  // Power / disparo
  powerMax: 100,
  beamCost: 20,
  beamSpeed: 900
};
/* ------------------------------------------------ */

const rand = (a,b)=>Math.random()*(b-a)+a;
const chance = p => Math.random() < p;
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));

/* ------------ Carga de assets ------------ */
function loadImg(src){ const i=new Image(); i.src=src; return i; }
function loadSnd(src,loop=false){ try{const a=new Audio(src); a.loop=loop; return a;}catch{ return null; } }

const imgMid  = loadImg("assets/tiles/tile_middleok.png");
const imgFog  = loadImg("assets/tiles/tile_fog.png");
const imgGnd  = loadImg("assets/tiles/tile_ground_soft.png");

const imgPlayer = loadImg("assets/player.png");
const imgZombie = loadImg("assets/zombie.png");
const imgCoin   = loadImg("assets/coin.png");
const imgCoinS  = loadImg("assets/coin_special.png");
const imgPuff   = loadImg("assets/fx/fx_zombie_puff_64.png");

const imgTomb       = loadImg("assets/tiles/tile_tomb_1x1.png");
const imgMausoleum  = loadImg("assets/tiles/tile_mausoleum_1x1.png");

const sndMusic = loadSnd("assets/music.mp3", true);
const sfxCoin  = loadSnd("assets/sfx_coin.wav");
const sfxPower = loadSnd("assets/sfx_power.wav");
const sfxBeam  = loadSnd("assets/sfx_beam.wav");
const sfxZDie  = loadSnd("assets/sfx_zombie_die.wav");
const sfxOver  = loadSnd("assets/sfx_gameover.wav");

/* --------------- Estado ---------------- */
const GROUND_H = 120;
const groundY = ()=> canvas.height - GROUND_H;

const state = {
  started:false, over:false,
  score:0, best:0, lives:3,
  power:0,

  worldX:0,
  nextCoinAt:  400,
  nextSpecAt:  1800,
  nextZomAt:   800,
  nextObsAt:   1000,

  parallax: { mid:0, fog:0, gnd:0 },

  p: {
    x: 160, y:0, w:64, h:64,
    vx:0, vy:0,
    speed: CFG.playerSpeed,
    jump: CFG.jump,
    gravity: CFG.gravity,
    onGround: true,
    invul: 0,
    coyote: 0,
    shotCd: 0
  },

  zombies: [], coins: [], obstacles: [], beams: [], puffs: []
};

/* ----------- Input ----------- */
const keys = new Set();
addEventListener("keydown", e=>{
  keys.add(e.code);
  if (e.code==="Enter"){
    if (!state.started || state.over) startGame();
  }
  if (e.code==="Space" && state.started && !state.over){
    shoot();
  }
});
addEventListener("keyup", e=>keys.delete(e.code));

/* ----------- Ciclo de vida ----------- */
function resetPlayer(){
  const p = state.p;
  p.y = groundY()-p.h;
  p.vy=0; p.vx=0; p.onGround=true; p.invul=0.9; p.coyote=0; p.shotCd=0;
}

function startGame(){
  state.started=true; state.over=false;
  state.score=0; state.lives=3; state.power=0;

  state.worldX = 0;
  state.parallax.mid = state.parallax.fog = state.parallax.gnd = 0;

  state.zombies.length=0; state.coins.length=0;
  state.obstacles.length=0; state.beams.length=0; state.puffs.length=0;

  state.nextCoinAt = rand(CFG.spawn.coinMin, CFG.spawn.coinMax);
  state.nextSpecAt = rand(CFG.spawn.specMin, CFG.spawn.specMax);
  state.nextZomAt  = rand(CFG.spawn.zomMin,  CFG.spawn.zomMax);
  state.nextObsAt  = rand(CFG.spawn.obsMin,  CFG.spawn.obsMax);

  resetPlayer();
  if (sndMusic){ sndMusic.volume=0.38; sndMusic.currentTime=0; sndMusic.play().catch(()=>{}); }
}

function gameOver(){
  state.over=true;
  if (state.score>state.best) state.best=state.score;
  if (sfxOver){ sfxOver.currentTime=0; sfxOver.play().catch(()=>{}); }
  if (sndMusic){ sndMusic.pause(); }
}

/* ----------- Spawns por distancia (ADELANTE) ----------- */
// Distancias por delante de la cámara para aparecer en pantalla
function ahead(distFactor=0.85, jitter=60){
  return state.worldX + canvas.width*distFactor + rand(-jitter, jitter);
}

function spawnCoinAhead(special=false){
  state.coins.push({
    x: ahead(0.88, 90),
    y: groundY()-64 - rand(0,30),
    w:44, h:44, special
  });
}
function spawnZombieAhead(){
  state.zombies.push({
    x: ahead(0.93, 60),
    y: groundY()-64, w:64, h:64
  });
}
function spawnObstacleAhead(){
  const useM = chance(0.5);
  const img = useM ? imgMausoleum : imgTomb;
  const hbW = CFG.obst.hitW, hbH = CFG.obst.hitH;
  state.obstacles.push({
    x: ahead(0.90, 40),
    y: groundY()-hbH, w: hbW, h: hbH,
    drawW: CFG.obst.drawW, drawH: CFG.obst.drawH, img
  });
}

/* ----------- Disparo ----------- */
function shoot(){
  const p = state.p;
  if (p.shotCd>0) return;
  if (state.power < CFG.beamCost) return;

  p.shotCd = 0.18;
  state.power = Math.max(0, state.power - CFG.beamCost);

  state.beams.push({
    x: state.worldX + p.x + p.w - 6,
    y: p.y + p.h*0.35,
    w: 42, h: 10, vx: CFG.beamSpeed
  });

  if (sfxBeam){ sfxBeam.currentTime=0; sfxBeam.play().catch(()=>{}); }
}

/* ----------- Colisiones ----------- */
function overlaps(a,b){
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}

/* ----------- Update ----------- */
function update(dt){
  const p = state.p;

  // Movimiento horizontal
  let mv = 0;
  if (keys.has("ArrowLeft") || keys.has("KeyZ")) mv -= 1;
  if (keys.has("ArrowRight")|| keys.has("KeyC")) mv += 1;
  p.vx = mv * p.speed;

  // Coyote-time
  if (p.onGround) p.coyote = CFG.coyote;
  else if (p.coyote>0) p.coyote -= dt;

  // Salto
  if ((keys.has("ArrowUp")||keys.has("KeyS")) && (p.onGround || p.coyote>0)){
    p.vy = p.jump; p.onGround=false; p.coyote=0;
  }

  // Física
  p.vy += CFG.gravity;
  p.y  += p.vy;
  if (p.y >= groundY()-p.h){ p.y = groundY()-p.h; p.vy=0; p.onGround=true; }

  // Clamp pantalla
  p.x += p.vx;
  p.x = clamp(p.x, 120, canvas.width - (120 + p.w));

  // Avance del mundo
  state.worldX += p.vx;

  // Parallax
  state.parallax.mid =  state.worldX * CFG.px.middle;
  state.parallax.fog =  state.worldX * CFG.px.fog;
  state.parallax.gnd =  state.worldX * CFG.px.ground;

  if (p.invul>0)  p.invul -= dt;
  if (p.shotCd>0) p.shotCd -= dt;

  // ---------- Spawns por distancia (y ADELANTE) ----------
  while (state.worldX >= state.nextCoinAt){
    spawnCoinAhead(false);
    state.nextCoinAt += rand(CFG.spawn.coinMin, CFG.spawn.coinMax);
  }
  while (state.worldX >= state.nextSpecAt){
    spawnCoinAhead(true);
    state.nextSpecAt += rand(CFG.spawn.specMin, CFG.spawn.specMax);
  }
  while (state.worldX >= state.nextZomAt){
    spawnZombieAhead();
    state.nextZomAt += rand(CFG.spawn.zomMin, CFG.spawn.zomMax);
  }
  while (state.worldX >= state.nextObsAt){
    if (chance(CFG.spawn.obsChance)) spawnObstacleAhead();
    state.nextObsAt += rand(CFG.spawn.obsMin, CFG.spawn.obsMax);
  }

  // ---------- Lógica entidades ----------
  const camL = state.worldX - 80;
  const camR = state.worldX + canvas.width + 80;

  // Monedas
  for (let i=state.coins.length-1;i>=0;i--){
    const c = state.coins[i];
    if (c.x < camL){ state.coins.splice(i,1); continue; }
    const pr = { x: state.worldX + p.x, y: p.y, w:p.w, h:p.h };
    if (overlaps(pr, c)){
      if (c.special){
        state.power = clamp(state.power + 40, 0, CFG.powerMax);
        state.score += 120;
        if (sfxPower){ sfxPower.currentTime=0; sfxPower.play().catch(()=>{}); }
      } else {
        state.score += 25;
        if (sfxCoin){ sfxCoin.currentTime=0; sfxCoin.play().catch(()=>{}); }
      }
      state.coins.splice(i,1);
    }
  }

  // Zombies
  for (let i=state.zombies.length-1;i>=0;i--){
    const z = state.zombies[i];
    if (z.x < camL){ state.zombies.splice(i,1); continue; }

    // Beam hit
    for (let j=state.beams.length-1;j>=0;j--){
      const b = state.beams[j];
      if (overlaps(b, z)){
        state.score += 150;
        state.puffs.push({ x:z.x, y:z.y, frame:0, frames:10 });
        if (sfxZDie){ sfxZDie.currentTime=0; sfxZDie.play().catch(()=>{}); }
        state.zombies.splice(i,1);
        state.beams.splice(j,1);
        break;
      }
    }

    // Golpe al jugador (hitbox amable)
    const hb = { x: z.x+10, y:z.y+10, w:z.w-20, h:z.h-20 };
    const pr = { x: state.worldX + p.x, y:p.y, w:p.w, h:p.h };
    if (p.invul<=0 && overlaps(pr, hb)){
      state.lives--; p.invul = 1.0;
      state.puffs.push({ x:z.x, y:z.y, frame:0, frames:10 });
      state.zombies.splice(i,1);
      if (state.lives<=0) return gameOver();
    }
  }

  // Obstáculos
  for (let i=state.obstacles.length-1;i>=0;i--){
    const o = state.obstacles[i];
    if (o.x < camL){ state.obstacles.splice(i,1); continue; }
    const pr = { x: state.worldX + p.x, y:p.y, w:p.w, h:p.h };
    if (p.invul<=0 && overlaps(pr, o)){
      state.lives--; p.invul = 1.0;
      state.puffs.push({ x:o.x, y:o.y, frame:0, frames:10 });
      state.obstacles.splice(i,1);
      if (state.lives<=0) return gameOver();
    }
  }

  // Beams
  for (let i=state.beams.length-1;i>=0;i--){
    const b = state.beams[i];
    b.x += CFG.beamSpeed * dt;
    if (b.x > camR + 60) state.beams.splice(i,1);
  }

  // FX
  for (let i=state.puffs.length-1;i>=0;i--){
    const f = state.puffs[i];
    f.frame++;
    if (f.frame > f.frames) state.puffs.splice(i,1);
  }

  // Score por avanzar
  state.score += Math.abs(p.vx) * 0.4;
}

/* ----------- Dibujo ----------- */
function drawTiled(img, y, offset, alpha=1){
  if (!img.complete) return;
  const w = img.width;
  ctx.save(); ctx.globalAlpha = alpha;
  let x = (-offset) % w; if (x>0) x -= w;
  for (; x < canvas.width; x += w) ctx.drawImage(img, x, y);
  ctx.restore();
}

function render(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle="#0a0d12"; ctx.fillRect(0,0,canvas.width,canvas.height);

  const midY = groundY()-220;
  drawTiled(imgMid, midY, state.parallax.mid, 0.55);
  drawTiled(imgFog, groundY()-180, state.parallax.fog, 0.85);
  drawTiled(imgGnd, groundY()-imgGnd.height, state.parallax.gnd, 1);

  const X = (wx)=> wx - state.worldX;

  for (const c of state.coins){
    ctx.drawImage(c.special?imgCoinS:imgCoin, X(c.x), c.y, c.w, c.h);
  }

  for (const o of state.obstacles){
    const dx = X(o.x) - (o.drawW - o.w)/2;
    const dy = o.y - (o.drawH - o.h);
    ctx.drawImage(o.img, dx, dy, o.drawW, o.drawH);
  }

  for (const z of state.zombies){
    ctx.drawImage(imgZombie, X(z.x), z.y, z.w, z.h);
  }

  ctx.fillStyle="#7ec8ff";
  for (const b of state.beams){
    ctx.fillRect(X(b.x), b.y, b.w, b.h);
  }

  for (const f of state.puffs){
    ctx.globalAlpha = 1 - f.frame/f.frames;
    ctx.drawImage(imgPuff, X(f.x), f.y, 64, 64);
    ctx.globalAlpha = 1;
  }

  if (state.p.invul>0) ctx.globalAlpha = 0.6;
  ctx.drawImage(imgPlayer, state.p.x, state.p.y, state.p.w, state.p.h);
  ctx.globalAlpha = 1;

  // HUD
  ctx.fillStyle="rgba(0,0,0,.55)";
  ctx.fillRect(16,16,460,96);
  ctx.fillStyle="#fff";
  ctx.font="28px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
  ctx.fillText(`Score: ${Math.floor(state.score)}`, 28, 50);
  ctx.fillText(`Best:  ${Math.floor(state.best)}`,  28, 86);

  for (let i=0;i<3;i++){
    ctx.beginPath();
    ctx.arc(500 + i*26, 40, 9, 0, Math.PI*2);
    ctx.fillStyle = i<state.lives ? "#ff5566" : "#666";
    ctx.fill();
  }

  const barMax=240, bx=580, by=32;
  ctx.fillStyle="#333"; ctx.fillRect(bx,by,barMax,12);
  ctx.fillStyle="#58a6ff"; ctx.fillRect(bx,by,Math.round(barMax*(state.power/CFG.powerMax)),12);

  if (!state.started || state.over){
    ctx.fillStyle="rgba(0,0,0,.6)";
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle="#fff"; ctx.textAlign="center";
    ctx.font="bold 42px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
    ctx.fillText(state.over? "RIP — Game Over" : "Disabled Hunter", canvas.width/2, canvas.height/2 - 20);
    ctx.font="24px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
    ctx.fillText("Enter: Start/Restart  •  ←/→ o Z/C: mover  •  S o ↑: saltar  •  Espacio: disparar", canvas.width/2, canvas.height/2 + 20);
    ctx.textAlign="left";
  }
}

/* ----------- Loop ----------- */
let last = performance.now();
function loop(now){
  const dt = Math.min(0.032, (now-last)/1000); last=now;
  if (state.started && !state.over) update(dt);
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
