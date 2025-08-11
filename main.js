/* ===================== Disabled Hunter — main.js (SCALE + MUSIC) ============ */
/* ----------------------- AJUSTES PRINCIPALES -------------------------------- */

// Escala global de entidades (player, zombies, monedas, tumbas, rayo)
const SCALE_FACTOR = 2.00;   // 1.0 = igual | 1.2 = 20% más grandes | 0.9 = 10% más chicos

// Offset vertical global de TODO el juego (capas + entidades)
let Y_OFFSET = 40;           // + baja todo / – lo sube (en píxeles)

/* ----------------------- CONFIG DE JUEGO (tu setup) ------------------------- */
const CFG = {
  scrollSpeed: 150,
  scrollAccelEachSec: 0,

  playerSpeed: 300,
  jump: -950,               // (si subes mucho la escala y lo notas corto, prueba -1000 o -1050)
  gravity: 2200,            // (con escalas >1.2 puedes subirlo un poco: 2400)
  coyote: 0.18,

  gaps: {
    coin:  [280, 520],
    spec:  [1600, 2400],
    zom:   [900, 1300],
    obst:  [1100, 1700],
    obstChance: 0.55
  },

  powerMax: 100,
  beamCost: 20,
  beamSpeed: 900,

  hud: {
    scoreFont: 'bold 42px Inter, system-ui, sans-serif',
    bestFont:  'bold 32px Inter, system-ui, sans-serif',
    heartsY:  26,
    heartSize: 22,
    powerX:  560,
    powerY:  42,
    powerW:  520,
    powerH:  10
  },

  musicVol: 0.35,
};

/* ------------------------- CANVAS & DIMENSIONES ----------------------------- */
const CANVAS = document.getElementById('game');
const CTX = CANVAS.getContext('2d');
let W=0, H=0;
function fitCanvas(){
  CANVAS.width = window.innerWidth;
  CANVAS.height = window.innerHeight;
  W = CANVAS.width; H = CANVAS.height;
}
fitCanvas();
addEventListener('resize', fitCanvas);

/* ----------------------- PARALLAX + ANCLAS VERTICALES ---------------------- */
const GROUND_Y = () => H*0.66 + Y_OFFSET;
const MID_Y    = () => H*0.08 + Y_OFFSET;
const FOG_Y    = () => H*0.52 + Y_OFFSET;
const LAYER_SCROLL = { mid:0.35, fog:0.55, ground:1.0 };

/* --------------------------- MEDIDAS BASE (no tocar) ------------------------ */
const BASE = {
  player: { w:48, h:64, drawW:56, drawH:72, drawOffX:-16, drawOffY:-10 },
  zombie: { w:44, h:58, padDrawW:12, padDrawH:12 },
  coin:   { size:32 },
  obst:   { hitW:65, hitH:50, drawW:112, drawH:112, footPad:6 }, // footPad apoya sobre suelo
  beam:   { len:220, segW:32, h:10, thick:6 },
};

/* ---------- Dimensiones ESCALADAS (todo lo jugable usa estas) --------------- */
const S = v => Math.round(v * SCALE_FACTOR);

const DIM = {
  player: {
    w:S(BASE.player.w), h:S(BASE.player.h),
    drawW:S(BASE.player.drawW), drawH:S(BASE.player.drawH),
    drawOffX:S(BASE.player.drawOffX), drawOffY:S(BASE.player.drawOffY),
  },
  zombie: {
    w:S(BASE.zombie.w), h:S(BASE.zombie.h),
    padDrawW:S(BASE.zombie.padDrawW), padDrawH:S(BASE.zombie.padDrawH),
  },
  coin: { size:S(BASE.coin.size) },
  obst: {
    hitW:S(BASE.obst.hitW), hitH:S(BASE.obst.hitH),
    drawW:S(BASE.obst.drawW), drawH:S(BASE.obst.drawH),
    footPad:S(BASE.obst.footPad),
  },
  beam: { len:S(BASE.beam.len), segW:S(BASE.beam.segW), h:S(BASE.beam.h), thick:S(BASE.beam.thick) },
};

/* --------------------- Assets con tolerancia a fallos ----------------------- */
const IMG = {};
const SFX = {};
const MISSING = [];

function placeholderCanvas(label, w=64, h=64, color='#f36'){
  const c=document.createElement('canvas'); c.width=w; c.height=h;
  const x=c.getContext('2d');
  x.fillStyle=color; x.fillRect(0,0,w,h);
  x.fillStyle='#000'; x.font='10px monospace';
  x.fillText(label,4,12);
  return c;
}
function loadImage(key, src, size={w:64,h:64}) {
  return new Promise((resolve)=>{
    const im=new Image();
    const done=(ok)=>{
      if(ok){ IMG[key]=im; }
      else { IMG[key]=placeholderCanvas(key, size.w, size.h); MISSING.push(src); }
      resolve();
    };
    im.onload = ()=>done(true);
    im.onerror= ()=>done(false);
    im.src = src;
  });
}
function loadAudio(key, src, volume=1){
  try{
    const a=new Audio(src);
    a.preload = 'auto';
    a.volume = volume;
    SFX[key]=a;
  }catch{}
}
function sfxReset(name){ const a=SFX[name]; if(a){ a.currentTime=0; } }
function sfxPlay(name){ const a=SFX[name]; if(a && a.play){ a.play(); } }

/* Música */
function musicPlay(){
  const m=SFX.music; if(!m) return;
  m.loop = true; m.volume = CFG.musicVol ?? 0.35;
  m.play?.().catch(()=>{});
}
function musicPause(){ const m=SFX.music; if(m) m.pause?.(); }

async function loadAll(){
  await Promise.all([
    loadImage('bg',    'assets/tiles/bg_static_1920x1080.png', {w:1920,h:1080}),
    loadImage('mid',   'assets/tiles/tile_middleok.png',       {w:960,h:540}),
    loadImage('fog',   'assets/tiles/tile_fog.png',            {w:960,h:200}),
    loadImage('ground','assets/tiles/tile_ground_soft.png',    {w:960,h:120}),

    loadImage('player','assets/player.png',  {w:56,h:72}),
    loadImage('zombie','assets/zombie.png',  {w:50,h:62}),
    loadImage('coin',  'assets/coin.png',    {w:32,h:32}),
    loadImage('coinS', 'assets/coin_special.png', {w:32,h:32}),
    loadImage('tomb',  'assets/tiles/tile_tomb_1x1.png',      {w:112,h:112}),
    loadImage('maus',  'assets/tiles/tile_mausoleum_1x1.png', {w:112,h:112}),
    loadImage('fx_beam','assets/fx/fx_beam_128.png', {w:128,h:16}),
    loadImage('heart','assets/ui/ui_heart_32.png',{w:32,h:32}),
  ]);

  loadAudio('coin',  'assets/sfx_coin.wav',  0.35);
  loadAudio('power', 'assets/sfx_power.wav', 0.45);
  loadAudio('beam',  'assets/sfx_beam.wav',  0.45);
  loadAudio('zdie',  'assets/sfx_zombie_die.wav',0.45);
  loadAudio('over',  'assets/sfx_gameover.wav',0.55);
  loadAudio('music','assets/music.mp3', CFG.musicVol ?? 0.35);
}

/* ---------------------- Utilidades dibujo/scroll ---------------------------- */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rand=(a,b)=>Math.random()*(b-a)+a;

function drawBGStatic(){
  const im = IMG.bg; if(!im) return;
  const r = Math.max(W/im.width, H/im.height);
  const dw = im.width*r, dh = im.height*r;
  CTX.drawImage(im, (W-dw)/2, (H-dh)/2, dw, dh);
}
function drawTiled(img, y, speed, tileW=img.width||960){
  const segW = tileW;
  const off = (worldX*speed) % segW;
  for(let x=-off; x<W; x+=segW){
    CTX.drawImage(img, x, y, segW, img.height);
  }
}

/* ---------------------------- Estado de juego -------------------------------- */
let running=false, worldX=0, scrollSpeed=CFG.scrollSpeed;
let score=0, bestScore = Number(localStorage.getItem('dh_best')||0);

const player = { x:180, y:0, vy:0, onGround:true, coyote:0, w:DIM.player.w, h:DIM.player.h, lives:3, power:0 };
const coins=[], zombies=[], obst=[], beams=[];
let nextCoinAt=0, nextSpecAt=0, nextZAt=0, nextObAt=0;

const keys={};
addEventListener('keydown', e=>{ keys[e.key.toLowerCase()]=true; if(e.code==='Space') keys[' ']=true; });
addEventListener('keyup',   e=>{ keys[e.key.toLowerCase()]=false; if(e.code==='Space') keys[' ']=false; });

/* --------------------------------- Reset ------------------------------------ */
function reset(){
  worldX=0; scrollSpeed=CFG.scrollSpeed; score=0;
  coins.length=0; zombies.length=0; obst.length=0; beams.length=0;

  // posiciona al jugador con sus dimensiones ESCALADAS
  player.w = DIM.player.w; player.h = DIM.player.h;
  player.y = GROUND_Y()-player.h; player.vy=0; player.onGround=true; player.coyote=0;
  player.lives=3; player.power=0;

  nextCoinAt = rand(...CFG.gaps.coin);
  nextSpecAt = rand(...CFG.gaps.spec);
  nextZAt    = rand(...CFG.gaps.zom);
  nextObAt   = rand(...CFG.gaps.obst);
}

/* ------------------------------- Update ------------------------------------- */
function update(dt){
  worldX += scrollSpeed*dt;
  scrollSpeed += CFG.scrollAccelEachSec*dt;

  // movimiento lateral
  if (keys['arrowright']) player.x += CFG.playerSpeed*dt;
  if (keys['arrowleft'])  player.x -= CFG.playerSpeed*dt;
  player.x = clamp(player.x, 80, W*0.6);

  // física
  player.vy += CFG.gravity*dt;
  player.y  += player.vy*dt;
  const gy = GROUND_Y()-player.h;
  if (player.y >= gy){ player.y=gy; player.vy=0; player.onGround=true; player.coyote=CFG.coyote; }
  else { player.onGround=false; player.coyote-=dt; }

  // salto (↑ / W / Z / C)
  if ((keys['arrowup']||keys['w']||keys['z']||keys['c']) && (player.onGround || player.coyote>0)){
    player.vy=CFG.jump; player.onGround=false; player.coyote=0;
  }

  // disparo (Espacio o X) si hay power
  if ((keys[' ']||keys['x']) && player.power>=CFG.beamCost){
    player.power-=CFG.beamCost; shootBeam();
    keys[' ']=false; keys['x']=false;
  }

  spawnWhile();
  updateEntities(dt);

  if (player.lives<=0){
    sfxPlay('over');
    localStorage.setItem('dh_best', Math.max(bestScore, score));
    bestScore = Number(localStorage.getItem('dh_best')||0);
    running=false;
    musicPause();
    showOverlay('Disabled Hunter', `Score: ${score}\nBest: ${bestScore}${MISSING.length?`\n\nMissing:\n${MISSING.join('\n')}`:''}`);
  }
}
function spawnWhile(){
  // monedas normales
  while(worldX>=nextCoinAt){
    const y = GROUND_Y() - DIM.coin.size*0.9 - rand(0,110); // altura relativa escalada
    coins.push({x:worldX+W+rand(80,220), y, sp:false});
    nextCoinAt += rand(...CFG.gaps.coin);
  }
  // monedas especiales
  while(worldX>=nextSpecAt){
    const y = GROUND_Y() - DIM.coin.size*0.9 - rand(40,140);
    coins.push({x:worldX+W+rand(140,260), y, sp:true});
    nextSpecAt += rand(...CFG.gaps.spec);
  }
  // zombies
  while(worldX>=nextZAt){
    zombies.push({x:worldX+W+rand(240,380), y:GROUND_Y()-DIM.zombie.h, w:DIM.zombie.w, h:DIM.zombie.h, alive:true});
    nextZAt += rand(...CFG.gaps.zom);
  }
  // obstáculos
  while(worldX>=nextObAt){
    if (Math.random()<CFG.gaps.obstChance){
      const kind=Math.random()<0.5?'tomb':'maus';
      obst.push({
        x:worldX+W+rand(260,420),
        y:GROUND_Y()-DIM.obst.drawH + DIM.obst.footPad, // apoya “pies” en el suelo
        w:DIM.obst.hitW, h:DIM.obst.hitH, kind
      });
    }
    nextObAt += rand(...CFG.gaps.obst);
  }
}
function updateEntities(dt){
  const left = worldX-120;

  // coins
  for(let i=coins.length-1;i>=0;i--){
    const c=coins[i];
    const cx=c.x-worldX;
    if (AABB(player.x,player.y,player.w,player.h, cx-DIM.coin.size/2, c.y-DIM.coin.size/2, DIM.coin.size, DIM.coin.size)){
      if (c.sp){
        player.power = clamp(player.power+35,0,CFG.powerMax);
        sfxReset('power'); sfxPlay('power');
      } else {
        score+=10; sfxReset('coin'); sfxPlay('coin');
      }
      coins.splice(i,1);
      continue;
    }
    if (c.x<left) coins.splice(i,1);
  }

  // zombies
  for(let i=zombies.length-1;i>=0;i--){
    const z=zombies[i]; if(!z.alive){ zombies.splice(i,1); continue; }
    const zx=z.x-worldX;
    if (AABB(player.x,player.y,player.w,player.h, zx, z.y, z.w, z.h)){
      z.alive=false; player.lives--; zombies.splice(i,1);
      continue;
    }
    if (z.x<left) zombies.splice(i,1);
  }

  // obstáculos
  for(let i=obst.length-1;i>=0;i--){
    const o=obst[i];
    const ox=o.x-worldX;
    if (AABB(player.x,player.y,player.w,player.h, ox+16, o.y+DIM.obst.drawH-DIM.obst.hitH, o.w, o.h)){
      player.lives--; obst.splice(i,1); continue;
    }
    if (o.x<left) obst.splice(i,1);
  }
}
function AABB(ax,ay,aw,ah, bx,by,bw,bh){
  return ax<bx+bw && ax+aw>bx && ay<by+bh && ay+ah>by;
}

/* --------------------------- Beam (bloqueado por tumbas) -------------------- */
function shootBeam(){
  const x=player.x + Math.round(0.7*DIM.player.w);
  const y=player.y + Math.round(0.45*DIM.player.h);
  beams.push({x,y,dx:1,dy:0,len:DIM.beam.len});
  sfxReset('beam'); sfxPlay('beam');
}
function updateBeams(dt){
  for(let i=beams.length-1;i>=0;i--){
    const b=beams[i];
    b.x += CFG.beamSpeed*dt*b.dx;
    b.y += CFG.beamSpeed*dt*b.dy;

    // bloquea obstáculo (usa hitbox escalada)
    let blocked=false;
    for(const o of obst){
      const ox=o.x-worldX+18, oy=o.y+DIM.obst.drawH-DIM.obst.hitH;
      if (AABB(b.x,b.y-DIM.beam.thick/2,b.len,DIM.beam.thick, ox,oy, DIM.obst.hitW,DIM.obst.hitH)){ blocked=true; break; }
    }
    if (blocked){ beams.splice(i,1); continue; }

    // daña zombies
    for(let j=zombies.length-1;j>=0;j--){
      const z=zombies[j]; if(!z.alive) continue;
      const zx=z.x-worldX;
      if (AABB(b.x,b.y-DIM.beam.thick/2,b.len,DIM.beam.thick, zx,z.y,z.w,z.h)){
        z.alive=false; zombies.splice(j,1); score+=25;
        sfxReset('zdie'); sfxPlay('zdie');
      }
    }
    if (b.x>W+80) beams.splice(i,1);
  }
}

/* -------------------------------- Draw -------------------------------------- */
function drawBeams(){
  CTX.save(); CTX.globalAlpha=0.95;
  for(const b of beams){
    const seg=IMG.fx_beam;
    if (seg && seg.width){
      let drawn=0;
      while(drawn<b.len){
        const w=Math.min(DIM.beam.segW, b.len-drawn);
        CTX.drawImage(seg, 0,0, DIM.beam.segW, seg.height, b.x+drawn, b.y-DIM.beam.h/2, w, DIM.beam.h);
        drawn+=w;
      }
    } else {
      CTX.fillStyle='rgba(120,190,255,.9)';
      CTX.fillRect(b.x, b.y-DIM.beam.thick/2, b.len, DIM.beam.thick);
    }
  }
  CTX.restore();
}
function drawHearts(){
  const s=CFG.hud.heartSize, y=CFG.hud.heartsY;
  const hasHeart = IMG.heart && IMG.heart.width;
  for(let i=0;i<3;i++){
    CTX.globalAlpha=i<player.lives?1:0.25;
    if (hasHeart) CTX.drawImage(IMG.heart, 480+i*(s+8)-(s/2), y-(s/2), s, s);
    else { CTX.fillStyle=i<player.lives?'#e14':'#555'; CTX.beginPath(); CTX.arc(480+i*(s+8), y+12, s/2, 0, Math.PI*2); CTX.fill(); }
  }
  CTX.globalAlpha=1;
}
function drawHUD(){
  CTX.save();
  CTX.fillStyle='rgba(0,0,0,.65)'; CTX.fillRect(16,16,420,92);
  CTX.fillStyle='#fff'; CTX.font=CFG.hud.scoreFont; CTX.fillText(`Score: ${score}`,28,62);
  CTX.font=CFG.hud.bestFont; CTX.fillText(`Best: ${bestScore}`,28,98);
  CTX.restore();

  drawHearts();

  const bx=CFG.hud.powerX, by=CFG.hud.powerY, bw=CFG.hud.powerW, bh=CFG.hud.powerH;
  CTX.fillStyle='rgba(0,0,0,.45)'; CTX.fillRect(bx,by,bw,bh);
  CTX.fillStyle='#6fb9ff'; const p=player.power/CFG.powerMax; CTX.fillRect(bx,by,bw*p,bh);
}
function drawGame(){
  drawBGStatic();
  drawTiled(IMG.mid,    MID_Y(),    LAYER_SCROLL.mid,    IMG.mid.width||960);
  drawTiled(IMG.fog,    FOG_Y(),    LAYER_SCROLL.fog,    IMG.fog.width||960);
  drawTiled(IMG.ground, GROUND_Y(), LAYER_SCROLL.ground, IMG.ground.width||960);

  // coins
  for(const c of coins){ const x=c.x-worldX; CTX.drawImage((c.sp?IMG.coinS:IMG.coin), x-DIM.coin.size/2, c.y-DIM.coin.size/2, DIM.coin.size, DIM.coin.size); }
  // obst
  for(const o of obst){ const x=o.x-worldX; const im=o.kind==='tomb'?IMG.tomb:IMG.maus; CTX.drawImage(im, x, o.y, DIM.obst.drawW, DIM.obst.drawH); }
  // zombies
  for(const z of zombies){ if(!z.alive) continue; const x=z.x-worldX; CTX.drawImage(IMG.zombie, x-DIM.zombie.padDrawW/2, z.y-DIM.zombie.padDrawH/2, z.w+DIM.zombie.padDrawW, z.h+DIM.zombie.padDrawH); }
  // player
  CTX.drawImage(IMG.player, player.x + DIM.player.drawOffX, player.y + DIM.player.drawOffY, DIM.player.drawW, DIM.player.drawH);

  drawBeams();
  drawHUD();
}

/* ------------------------------ Overlay UI ---------------------------------- */
const overlay=document.getElementById('overlay');
function showOverlay(title, subtitle){
  overlay.style.display='flex';
  overlay.innerHTML = `
    <h1>${title}</h1>
    <p style="white-space:pre-line">${subtitle||''}</p>
    <button id="startBtn">Start</button>`;
  overlay.querySelector('#startBtn').onclick=()=>{
    overlay.style.display='none';
    startGame();  // gesto usuario → permite música
  };
}

/* ------------------------------ Bucle --------------------------------------- */
let last=performance.now();
function tick(t){
  const dt=clamp((t-last)/1000,0,0.033); last=t;
  if(running){
    update(dt); updateBeams(dt);
    CTX.clearRect(0,0,W,H); drawGame();
  }
  requestAnimationFrame(tick);
}
function startGame(){
  bestScore = Number(localStorage.getItem('dh_best')||0);
  reset(); running=true; musicPlay();
}

/* Pausar música al cambiar de pestaña */
document.addEventListener('visibilitychange', ()=>{
  if (document.hidden) musicPause();
  else if (running) musicPlay();
});

/* ----------------------------- Arranque seguro ------------------------------ */
window.addEventListener('error', (e)=>{
  console.error(e.error || e.message);
  showOverlay('Error', String(e.error||e.message));
});

loadAll().then(()=>{
  showOverlay(
    'Disabled Hunter',
    (MISSING.length ? `Faltan archivos:\n${MISSING.join('\n')}\n\n` : '') +
    'Controles: ← → moverse  |  ↑ / W / Z / C para saltar  |  Espacio / X disparar'
  );
  requestAnimationFrame(tick);
});
/* ============================================================================ */
