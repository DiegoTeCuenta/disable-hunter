// =========================
// Disabled Hunter — main.js
// =========================

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
function resize(){ canvas.width = innerWidth; canvas.height = innerHeight; }
addEventListener("resize", resize); resize();

// --------- helpers ----------
const rand = (a,b)=>Math.random()*(b-a)+a;
const chance = p => Math.random()<p;
function clamp(v,a,b){ return Math.max(a, Math.min(b,v)); }
function loadImg(src){ const i=new Image(); i.src=src; return i; }
function loadSnd(src, loop=false){ try{ const a=new Audio(src); a.loop=loop; return a; }catch{ return null; } }

// --------- assets -----------
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

// sonidos
const sndMusic  = loadSnd("assets/music.mp3", true);
const sfxCoin   = loadSnd("assets/sfx_coin.wav");
const sfxPower  = loadSnd("assets/sfx_power.wav");
const sfxBeam   = loadSnd("assets/sfx_beam.wav");
const sfxZDie   = loadSnd("assets/sfx_zombie_die.wav");
const sfxOver   = loadSnd("assets/sfx_gameover.wav");

// --------- estado ----------
const state = {
  started:false, over:false,
  score:0, best:0, lives:3,
  power:0, powerMax:100,       // energía para disparar
  worldSpeed:5.5,              // velocidad base del mundo (zombies/monedas se mueven)
  parallax: {mid:0,fog:0,gnd:0},

  player:{
    x:160, y:0, w:64, h:64,
    vx:0, vy:0, speed:6.5,
    gravity:1.25, jump:-19,
    onGround:true, invul:0, shotCd:0
  },

  zombies:[], coins:[], puffs:[], obstacles:[], beams:[],
  tZombie:0, tCoin:0, tSpec:0, tObs:0
};

const GROUND_H = 120;
const groundY = ()=> canvas.height - GROUND_H;

// --------- control ----------
const keys = new Set();
addEventListener("keydown", (e)=>{
  keys.add(e.code);

  // Start / restart
  if (e.code==="Enter"){
    if (!state.started || state.over) startGame();
  }

  // Disparo con espacio
  if (e.code==="Space" && state.started && !state.over){
    shoot();
  }
});
addEventListener("keyup", e=>keys.delete(e.code));

// --------- inicio ----------
function resetPlayer(){
  const p = state.player;
  p.y = groundY()-p.h;
  p.vy = 0; p.vx = 0; p.onGround = true; p.invul = 0.9; p.shotCd = 0;
}
function startGame(){
  state.started=true; state.over=false;
  state.score=0; state.lives=3; state.power=0;
  state.zombies.length=0; state.coins.length=0; state.puffs.length=0;
  state.obstacles.length=0; state.beams.length=0;
  state.tZombie=state.tCoin=state.tSpec=state.tObs=0;
  resetPlayer();
  if (sndMusic){ sndMusic.volume=0.35; sndMusic.play().catch(()=>{}); }
}
function gameOver(){
  state.over=true;
  if (state.score>state.best) state.best=state.score;
  if (sfxOver) { sfxOver.currentTime=0; sfxOver.play().catch(()=>{}); }
}

// --------- spawn ----------
function spawnZombie(){
  state.zombies.push({
    x: canvas.width + rand(0,300),
    y: groundY()-64, w:64, h:64,
    speed: state.worldSpeed + rand(0,1.5)
  });
}
function spawnCoin(special=false){
  state.coins.push({
    x: canvas.width + rand(0,280),
    y: groundY()-64 - rand(0,30),
    w:44, h:44, special
  });
}
function spawnPuff(x,y){ state.puffs.push({x,y,frame:0,frames:10}); }
function spawnObstacle(){
  const useM = chance(0.5);
  const img = useM? imgMausoleum : imgTomb;
  const W = 96, H = 96;   // hitbox amable
  state.obstacles.push({
    x: canvas.width + rand(0,260),
    y: groundY()-H, w:W, h:H,
    drawW:128, drawH:128, img
  });
}

// --------- disparo ----------
function shoot(){
  const p = state.player;
  if (p.shotCd>0) return;
  if (state.power<=0) return;

  p.shotCd = 0.18;        // ligero cooldown
  state.power = Math.max(0, state.power-20);

  state.beams.push({
    x: p.x + p.w - 6, y: p.y + p.h*0.35,
    w: 42, h: 10, vx: 900   // súper rápido (px/s)
  });

  if (sfxBeam){ sfxBeam.currentTime=0; sfxBeam.play().catch(()=>{}); }
}

// --------- colisiones ----------
function overlaps(a,b){
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}

// --------- update ----------
function update(dt){
  const p = state.player;

  // controles (izq/der)
  let mv = 0;
  if (keys.has("ArrowLeft") || keys.has("KeyZ")) mv -= 1;
  if (keys.has("ArrowRight")|| keys.has("KeyC")) mv += 1;
  p.vx = mv * p.speed;

  // salto con S o ↑ (no con espacio)
  if ((keys.has("ArrowUp") || keys.has("KeyS")) && p.onGround){
    p.vy = p.jump; p.onGround=false;
  }

  // física vertical
  p.vy += p.gravity;
  p.y  += p.vy;
  if (p.y >= groundY()-p.h){ p.y=groundY()-p.h; p.vy=0; p.onGround=true; }

  // mover horizontal (clamp a pantalla)
  p.x += p.vx;
  p.x = clamp(p.x, 40, canvas.width- (40+p.w));

  // invulnerabilidad / cooldown
  if (p.invul>0) p.invul -= dt;
  if (p.shotCd>0) p.shotCd -= dt;

  // spawns
  state.tZombie += dt; state.tCoin += dt; state.tSpec += dt; state.tObs += dt;
  if (state.tZombie > 0.9) { state.tZombie = 0; spawnZombie(); }
  if (state.tCoin   > 0.5) { state.tCoin   = 0; spawnCoin(false); }
  if (state.tSpec   > 2.4) { state.tSpec   = 0; spawnCoin(true); }
  if (state.tObs    > 1.6) { state.tObs    = 0; if (chance(0.55)) spawnObstacle(); }

  // parallax: responde a movimiento del jugador (no auto-run)
  state.parallax.mid -= p.vx * 0.12;
  state.parallax.fog -= p.vx * 0.22;
  state.parallax.gnd -= p.vx * 0.38;

  // mundo avanza algo para que vengan enemigos
  const worldShift = state.worldSpeed;

  // zombies
  for (let i=state.zombies.length-1;i>=0;i--){
    const z = state.zombies[i];
    z.x -= z.speed; // se mueven hacia el jugador
    if (z.x + z.w < -50){ state.zombies.splice(i,1); continue; }

    // beam hit
    for (let j=state.beams.length-1;j>=0;j--){
      const b = state.beams[j];
      if (overlaps(b,z)){
        spawnPuff(z.x, z.y);
        if (sfxZDie){ sfxZDie.currentTime=0; sfxZDie.play().catch(()=>{}); }
        state.score += 150;
        state.zombies.splice(i,1);
        state.beams.splice(j,1);
        break;
      }
    }

    // golpe al jugador
    const hb = {x:z.x+10,y:z.y+10,w:z.w-20,h:z.h-20};
    if (!state.over && p.invul<=0 && overlaps({x:p.x,y:p.y,w:p.w,h:p.h}, hb)){
      state.lives--; p.invul=1;
      spawnPuff(z.x,z.y);
      state.zombies.splice(i,1);
      if (state.lives<=0){ gameOver(); return; }
    }
  }

  // monedas
  for (let i=state.coins.length-1;i>=0;i--){
    const c = state.coins[i];
    c.x -= worldShift; // llegan desde la derecha
    if (c.x + c.w < -50){ state.coins.splice(i,1); continue; }
    if (overlaps({x:p.x,y:p.y,w:p.w,h:p.h}, c)){
      if (c.special){
        state.power = clamp(state.power+40, 0, state.powerMax);
        if (sfxPower){ sfxPower.currentTime=0; sfxPower.play().catch(()=>{}); }
        state.score += 120;
      } else {
        state.score += 25;
        if (sfxCoin){ sfxCoin.currentTime=0; sfxCoin.play().catch(()=>{}); }
      }
      state.coins.splice(i,1);
    }
  }

  // obstáculos (choque quita vida)
  for (let i=state.obstacles.length-1;i>=0;i--){
    const o = state.obstacles[i];
    o.x -= worldShift;
    if (o.x + o.w < -50){ state.obstacles.splice(i,1); continue; }
    if (!state.over && p.invul<=0 && overlaps({x:p.x,y:p.y,w:p.w,h:p.h}, o)){
      state.lives--; p.invul=1;
      spawnPuff(o.x,o.y);
      state.obstacles.splice(i,1);
      if (state.lives<=0){ gameOver(); return; }
    }
  }

  // beams (proyectiles)
  for (let i=state.beams.length-1;i>=0;i--){
    const b = state.beams[i];
    b.x += b.vx * dt;
    if (b.x > canvas.width+60){ state.beams.splice(i,1); }
  }

  // puffs
  for (let i=state.puffs.length-1;i>=0;i--){
    const pf = state.puffs[i]; pf.frame += 1;
    if (pf.frame>pf.frames) state.puffs.splice(i,1);
  }
}

// --------- draw helpers ----------
function drawTiled(img, y, off, alpha=1){
  if (!img.complete) return;
  const w = img.width, h = img.height;
  ctx.save(); ctx.globalAlpha = alpha;
  let x = (off % w); if (x>0) x -= w;
  for(; x<canvas.width; x+=w){ ctx.drawImage(img, x, y, w, h); }
  ctx.restore();
}

// --------- render ----------
function render(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle="#0a0d12"; ctx.fillRect(0,0,canvas.width,canvas.height);

  // fondo
  const midY = groundY()-220;
  drawTiled(imgMid, midY, state.parallax.mid, 0.55);

  // niebla (DETRÁS de personajes)
  drawTiled(imgFog, groundY()-180, state.parallax.fog, 0.85);

  // suelo
  drawTiled(imgGnd, groundY()-imgGnd.height, state.parallax.gnd, 1);

  // monedas
  for (const c of state.coins){
    ctx.drawImage(c.special?imgCoinS:imgCoin, c.x, c.y, c.w, c.h);
  }
  // obstáculos
  for (const o of state.obstacles){
    const dx = o.x - (o.drawW - o.w)/2;
    const dy = o.y - (o.drawH - o.h);
    ctx.drawImage(o.img, dx, dy, o.drawW, o.drawH);
  }
  // zombies
  for (const z of state.zombies){
    ctx.drawImage(imgZombie, z.x, z.y, z.w, z.h);
  }
  // beams
  ctx.fillStyle="#7ec8ff";
  for (const b of state.beams){
    ctx.fillRect(b.x, b.y, b.w, b.h);
  }
  // puffs
  for (const p of state.puffs){
    ctx.globalAlpha = 1 - p.frame/p.frames;
    ctx.drawImage(imgPuff, p.x, p.y, 64, 64);
    ctx.globalAlpha = 1;
  }

  // player (parpadeo suave si invul)
  if (state.player.invul>0) ctx.globalAlpha = 0.6;
  ctx.drawImage(imgPlayer, state.player.x, state.player.y, state.player.w, state.player.h);
  ctx.globalAlpha = 1;

  // HUD
  ctx.fillStyle="rgba(0,0,0,.55)";
  ctx.fillRect(16,16,420,96);
  ctx.fillStyle="#fff";
  ctx.font="28px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
  ctx.fillText(`Score: ${state.score}`, 28, 50);
  ctx.fillText(`Best:  ${state.best}`, 28, 86);

  // vidas
  for(let i=0;i<3;i++){
    ctx.beginPath();
    ctx.arc(460 + i*26, 40, 9, 0, Math.PI*2);
    ctx.fillStyle = i<state.lives ? "#ff5566" : "#666";
    ctx.fill();
  }

  // barra de poder (energía)
  const barMax = 240, barX = 540, barY = 32;
  ctx.fillStyle="#333"; ctx.fillRect(barX, barY, barMax, 12);
  const pw = Math.round(barMax * (state.power/state.powerMax));
  ctx.fillStyle="#58a6ff"; ctx.fillRect(barX, barY, pw, 12);

  if (!state.started || state.over){
    ctx.fillStyle="rgba(0,0,0,.6)";
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle="#fff"; ctx.textAlign="center";
    ctx.font="bold 42px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
    ctx.fillText(state.over? "Game Over" : "Disabled Hunter", canvas.width/2, canvas.height/2 - 20);
    ctx.font="24px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
    ctx.fillText("Enter: Start/Restart  •  ←/→ o Z/C: mover  •  S/↑: saltar  •  Espacio: disparar", canvas.width/2, canvas.height/2 + 20);
    ctx.textAlign="left";
  }
}

// --------- loop ----------
let last = performance.now();
function loop(now){
  const dt = Math.min(0.032, (now-last)/1000); last=now;
  if (state.started && !state.over) update(dt);
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
