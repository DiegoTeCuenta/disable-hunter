// =========================
// Disabled Hunter — main.js (spawn por cámara + anticipo seguro)
// =========================
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
function resize(){ canvas.width = innerWidth; canvas.height = innerHeight; }
addEventListener("resize", resize); resize();

/* ----------------- CONFIG ----------------- */
const CFG = {
  // Jugador
  playerSpeed: 6.0,
  jump:       -21.0,
  gravity:     1.12,
  coyote:      0.10,

  // Parallax
  px: { middle: 0.25, fog: 0.45, ground: 0.85 },

  // Distancias entre spawns (X del mundo)
  span: {
    coinMin: 280,  coinMax: 520,
    specMin: 1800, specMax: 2600,
    zomMin:  700,  zomMax:  1100,
    obsMin:  900,  obsMax:  1500,
    obsChance: 0.55
  },

  // Generar SIEMPRE fuera de pantalla (a la derecha)
  lead: {
    coin:  180,  // px fuera de pantalla
    spec:  220,
    zomb:  240,
    obst:  260
  },

  // Nunca spawnear más cerca que esto del jugador
  minGapFromPlayer: 320,

  // Obstáculos (hitbox vs. dibujo)
  obst: { hitW: 78, hitH: 66, drawW: 112, drawH: 112 },

  // Power/disparo
  powerMax: 100,
  beamCost: 20,
  beamSpeed: 900
};
/* ------------------------------------------ */

const rand = (a,b)=>Math.random()*(b-a)+a;
const chance = p => Math.random()<p;
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));

/* ------------ Assets ------------ */
function loadImg(src){ const i=new Image(); i.src=src; return i; }
function loadSnd(src,loop=false){ try{const a=new Audio(src); a.loop=loop; return a;}catch{return null;} }

const imgMid  = loadImg("assets/tiles/tile_middleok.png");
const imgFog  = loadImg("assets/tiles/tile_fog.png");
const imgGnd  = loadImg("assets/tiles/tile_ground_soft.png");

const imgPlayer = loadImg("assets/player.png");
const imgZombie = loadImg("assets/zombie.png");
const imgCoin   = loadImg("assets/coin.png");
const imgCoinS  = loadImg("assets/coin_special.png");
const imgPuff   = loadImg("assets/fx/fx_zombie_puff_64.png");

const imgTomb      = loadImg("assets/tiles/tile_tomb_1x1.png");
const imgMausoleum = loadImg("assets/tiles/tile_mausoleum_1x1.png");

const sndMusic = loadSnd("assets/music.mp3", true);
const sfxCoin  = loadSnd("assets/sfx_coin.wav");
const sfxPower = loadSnd("assets/sfx_power.wav");
const sfxBeam  = loadSnd("assets/sfx_beam.wav");
const sfxZDie  = loadSnd("assets/sfx_zombie_die.wav");
const sfxOver  = loadSnd("assets/sfx_gameover.wav");

/* --------------- Estado ---------------- */
const GROUND_H = 120;
const groundY = ()=> canvas.height - GROUND_H;

const S = {
  started:false, over:false,
  score:0, best:0, lives:3, power:0,

  // mundo/cámara
  worldX:0,
  parallax:{ mid:0, fog:0, gnd:0 },

  // jugador
  p:{ x:160, y:0, w:64, h:64, vx:0, vy:0, speed:CFG.playerSpeed,
      jump:CFG.jump, gravity:CFG.gravity, onGround:true,
      invul:0, coyote:0, shotCd:0 },

  // entidades
  zombies:[], coins:[], obstacles:[], beams:[], puffs:[],

  // "próximas X" absolutas (en mundo) para spawns
  nextCoinX:0, nextSpecX:0, nextZomX:0, nextObsX:0
};

/* ----------- Input ----------- */
const keys=new Set();
addEventListener("keydown",e=>{
  keys.add(e.code);
  if (e.code==="Enter"){ if(!S.started || S.over) startGame(); }
  if (e.code==="Space" && S.started && !S.over) shoot();
});
addEventListener("keyup",e=>keys.delete(e.code));

/* ----------- Helpers ----------- */
function resetPlayer(){
  const p=S.p;
  p.y=groundY()-p.h; p.vy=0; p.vx=0; p.onGround=true;
  p.invul=0.9; p.coyote=0; p.shotCd=0;
}
function cameraLeft(){ return S.worldX; }
function cameraRight(){ return S.worldX + canvas.width; }
function XtoScreen(wx){ return wx - S.worldX; }

/* ------ Programación absoluta de spawns ------ */
function scheduleNext(cameraR){
  const sp=CFG.span;
  // siguientes X (si no están programadas aún o ya quedaron atrás)
  if (S.nextCoinX <= cameraR) S.nextCoinX = cameraR + rand(sp.coinMin, sp.coinMax);
  if (S.nextSpecX <= cameraR) S.nextSpecX = cameraR + rand(sp.specMin, sp.specMax);
  if (S.nextZomX  <= cameraR) S.nextZomX  = cameraR + rand(sp.zomMin,  sp.zomMax);
  if (S.nextObsX  <= cameraR) S.nextObsX  = cameraR + rand(sp.obsMin,  sp.obsMax);
}
function spawnAheadIfDue(){
  const camR = cameraRight();
  scheduleNext(camR);

  const px = S.p.x + S.worldX; // X mundial del jugador
  const minGap = Math.max(px + CFG.minGapFromPlayer, camR); // nunca encima del player

  // MONEDA NORMAL
  while (camR >= S.nextCoinX){
    const wx = Math.max(S.nextCoinX + CFG.lead.coin, minGap + CFG.lead.coin);
    S.coins.push({ x:wx, y:groundY()-88-rand(0,24), w:56, h:56, special:false });
    S.nextCoinX += rand(CFG.span.coinMin, CFG.span.coinMax);
  }
  // MONEDA ESPECIAL
  while (camR >= S.nextSpecX){
    const wx = Math.max(S.nextSpecX + CFG.lead.spec, minGap + CFG.lead.spec);
    S.coins.push({ x:wx, y:groundY()-92-rand(0,24), w:56, h:56, special:true });
    S.nextSpecX += rand(CFG.span.specMin, CFG.span.specMax);
  }
  // ZOMBIE
  while (camR >= S.nextZomX){
    const wx = Math.max(S.nextZomX + CFG.lead.zomb, minGap + CFG.lead.zomb);
    S.zombies.push({ x:wx, y:groundY()-64, w:64, h:64 });
    S.nextZomX += rand(CFG.span.zomMin, CFG.span.zomMax);
  }
  // OBSTÁCULO
  while (camR >= S.nextObsX){
    if (chance(CFG.span.obsChance)){
      const useM = chance(0.5);
      const wx = Math.max(S.nextObsX + CFG.lead.obst, minGap + CFG.lead.obst);
      S.obstacles.push({
        x:wx, y:groundY()-CFG.obst.hitH, w:CFG.obst.hitW, h:CFG.obst.hitH,
        drawW:CFG.obst.drawW, drawH:CFG.obst.drawH, img: useM?imgMausoleum:imgTomb
      });
    }
    S.nextObsX += rand(CFG.span.obsMin, CFG.span.obsMax);
  }
}

/* ----------- Juego ----------- */
function startGame(){
  S.started=true; S.over=false;
  S.score=0; S.lives=3; S.power=0;

  S.worldX=0;
  S.parallax.mid = S.parallax.fog = S.parallax.gnd = 0;

  S.zombies.length=0; S.coins.length=0; S.obstacles.length=0;
  S.beams.length=0; S.puffs.length=0;

  resetPlayer();

  // programa primeros spawns suficientemente lejos
  const camR = cameraRight();
  S.nextCoinX = camR + rand(360, 600);
  S.nextSpecX = camR + rand(1400, 2200);
  S.nextZomX  = camR + rand(800, 1200);
  S.nextObsX  = camR + rand(900, 1400);

  if (sndMusic){ sndMusic.volume=0.38; sndMusic.currentTime=0; sndMusic.play().catch(()=>{}); }
}

function gameOver(){
  S.over=true;
  if (S.score>S.best) S.best=S.score;
  if (sfxOver){ sfxOver.currentTime=0; sfxOver.play().catch(()=>{}); }
  if (sndMusic){ sndMusic.pause(); }
}

/* ----------- Disparo ----------- */
function shoot(){
  const p=S.p;
  if (p.shotCd>0) return;
  if (S.power < CFG.beamCost) return;
  p.shotCd=0.18;
  S.power=Math.max(0, S.power-CFG.beamCost);
  S.beams.push({ x:S.worldX + p.x + p.w - 6, y:p.y + p.h*0.35, w:42, h:10, vx:CFG.beamSpeed });
  if (sfxBeam){ sfxBeam.currentTime=0; sfxBeam.play().catch(()=>{}); }
}

/* ----------- Colisión ----------- */
function overlaps(a,b){
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}

/* ----------- Update ----------- */
function update(dt){
  const p=S.p;

  // Input horizontal
  let mv=0;
  if (keys.has("ArrowLeft") || keys.has("KeyZ")) mv-=1;
  if (keys.has("ArrowRight")|| keys.has("KeyC")) mv+=1;
  p.vx = mv * p.speed;

  // Coyote
  if (p.onGround) p.coyote = CFG.coyote;
  else if (p.coyote>0) p.coyote -= dt;

  // Salto
  if ((keys.has("ArrowUp")||keys.has("KeyS")) && (p.onGround || p.coyote>0)){
    p.vy = CFG.jump; p.onGround=false; p.coyote=0;
  }

  // Física vertical
  p.vy += CFG.gravity;
  p.y  += p.vy;
  if (p.y >= groundY()-p.h){ p.y = groundY()-p.h; p.vy=0; p.onGround=true; }

  // Límites X (jugador)
  p.x += p.vx;
  p.x = clamp(p.x, 120, canvas.width - (120 + p.w));

  // Avanza mundo
  S.worldX += p.vx;

  // Parallax
  S.parallax.mid = S.worldX * CFG.px.middle;
  S.parallax.fog = S.worldX * CFG.px.fog;
  S.parallax.gnd = S.worldX * CFG.px.ground;

  if (p.invul>0)  p.invul -= dt;
  if (p.shotCd>0) p.shotCd -= dt;

  // Spawns por cámara (nacen siempre fuera de pantalla)
  spawnAheadIfDue();

  const camL = cameraLeft()-80;
  const camR = cameraRight()+80;

  // Monedas
  for (let i=S.coins.length-1;i>=0;i--){
    const c=S.coins[i];
    if (c.x < camL){ S.coins.splice(i,1); continue; }
    const pr = { x:S.worldX + p.x, y:p.y, w:p.w, h:p.h };
    if (overlaps(pr, c)){
      if (c.special){
        S.power = clamp(S.power + 40, 0, CFG.powerMax);
        S.score += 120;
        if (sfxPower){ sfxPower.currentTime=0; sfxPower.play().catch(()=>{}); }
      } else {
        S.score += 25;
        if (sfxCoin){ sfxCoin.currentTime=0; sfxCoin.play().catch(()=>{}); }
      }
      S.coins.splice(i,1);
    }
  }

  // Zombies
  for (let i=S.zombies.length-1;i>=0;i--){
    const z=S.zombies[i];
    if (z.x < camL){ S.zombies.splice(i,1); continue; }

    // hit por beam
    for (let j=S.beams.length-1;j>=0;j--){
      const b=S.beams[j];
      if (overlaps(b,z)){
        S.score += 150;
        S.puffs.push({ x:z.x, y:z.y, frame:0, frames:10 });
        if (sfxZDie){ sfxZDie.currentTime=0; sfxZDie.play().catch(()=>{}); }
        S.zombies.splice(i,1); S.beams.splice(j,1);
        break;
      }
    }
    // golpea al jugador
    const hb={ x:z.x+10, y:z.y+10, w:z.w-20, h:z.h-20 };
    const pr={ x:S.worldX+p.x, y:p.y, w:p.w, h:p.h };
    if (p.invul<=0 && overlaps(pr,hb)){
      S.lives--; p.invul=1.0;
      S.puffs.push({ x:z.x, y:z.y, frame:0, frames:10 });
      S.zombies.splice(i,1);
      if (S.lives<=0){ gameOver(); return; }
    }
  }

  // Obstáculos
  for (let i=S.obstacles.length-1;i>=0;i--){
    const o=S.obstacles[i];
    if (o.x < camL){ S.obstacles.splice(i,1); continue; }
    const pr={ x:S.worldX+p.x, y:p.y, w:p.w, h:p.h };
    if (p.invul<=0 && overlaps(pr,o)){
      S.lives--; p.invul=1.0;
      S.puffs.push({ x:o.x, y:o.y, frame:0, frames:10 });
      S.obstacles.splice(i,1);
      if (S.lives<=0){ gameOver(); return; }
    }
  }

  // Beams
  for (let i=S.beams.length-1;i>=0;i--){
    const b=S.beams[i];
    b.x += CFG.beamSpeed * dt;
    if (b.x > camR+60) S.beams.splice(i,1);
  }

  // FX
  for (let i=S.puffs.length-1;i>=0;i--){
    const f=S.puffs[i]; f.frame++; if (f.frame>f.frames) S.puffs.splice(i,1);
  }

  // Score por avance
  S.score += Math.abs(p.vx) * 0.4;
}

/* ----------- Render ----------- */
function drawTiled(img,y,offset,alpha=1){
  if (!img.complete) return;
  const w=img.width; let x=(-offset)%w; if (x>0) x-=w;
  ctx.save(); ctx.globalAlpha=alpha;
  for (; x<canvas.width; x+=w) ctx.drawImage(img,x,y);
  ctx.restore();
}
function render(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle="#0a0d12"; ctx.fillRect(0,0,canvas.width,canvas.height);

  const midY = groundY()-220;
  drawTiled(imgMid, midY, S.parallax.mid, .55);
  drawTiled(imgFog, groundY()-180, S.parallax.fog, .85);
  drawTiled(imgGnd, groundY()-imgGnd.height, S.parallax.gnd, 1);

  for (const c of S.coins) ctx.drawImage(c.special?imgCoinS:imgCoin, XtoScreen(c.x), c.y, c.w, c.h);
  for (const o of S.obstacles){
    const dx = XtoScreen(o.x) - (o.drawW-o.w)/2;
    const dy = o.y - (o.drawH-o.h);
    ctx.drawImage(o.img, dx, dy, o.drawW, o.drawH);
  }
  for (const z of S.zombies) ctx.drawImage(imgZombie, XtoScreen(z.x), z.y, z.w, z.h);

  ctx.fillStyle="#7ec8ff";
  for (const b of S.beams) ctx.fillRect(XtoScreen(b.x), b.y, b.w, b.h);

  for (const f of S.puffs){
    ctx.globalAlpha=1 - f.frame/f.frames;
    ctx.drawImage(imgPuff, XtoScreen(f.x), f.y, 64, 64);
    ctx.globalAlpha=1;
  }

  if (S.p.invul>0) ctx.globalAlpha=.6;
  ctx.drawImage(imgPlayer, S.p.x, S.p.y, S.p.w, S.p.h);
  ctx.globalAlpha=1;

  // HUD
  ctx.fillStyle="rgba(0,0,0,.55)"; ctx.fillRect(16,16,460,96);
  ctx.fillStyle="#fff";
  ctx.font="28px system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial";
  ctx.fillText(`Score: ${Math.floor(S.score)}`, 28,50);
  ctx.fillText(`Best:  ${Math.floor(S.best)}`,  28,86);

  for (let i=0;i<3;i++){
    ctx.beginPath(); ctx.arc(500+i*26,40,9,0,Math.PI*2);
    ctx.fillStyle = i<S.lives? "#ff5566" : "#666"; ctx.fill();
  }
  const barMax=240, bx=580, by=32;
  ctx.fillStyle="#333";   ctx.fillRect(bx,by,barMax,12);
  ctx.fillStyle="#58a6ff";ctx.fillRect(bx,by,Math.round(barMax*(S.power/CFG.powerMax)),12);

  if (!S.started || S.over){
    ctx.fillStyle="rgba(0,0,0,.6)"; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle="#fff"; ctx.textAlign="center";
    ctx.font="bold 42px system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial";
    ctx.fillText(S.over? "RIP — Game Over" : "Disabled Hunter", canvas.width/2, canvas.height/2-20);
    ctx.font="24px system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial";
    ctx.fillText("Enter: Start/Restart  •  ←/→ o Z/C: mover  •  S o ↑: saltar  •  Espacio: disparar", canvas.width/2, canvas.height/2+20);
    ctx.textAlign="left";
  }
}

/* ----------- Loop ----------- */
let last=performance.now();
function loop(now){
  const dt=Math.min(0.032,(now-last)/1000); last=now;
  if (S.started && !S.over) update(dt);
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
