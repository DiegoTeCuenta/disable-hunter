// =========================
// Disabled Hunter — Runner autosroll estable
// =========================
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
function fit(){ canvas.width = innerWidth; canvas.height = innerHeight; }
addEventListener("resize", fit); fit();

/* ---------- CONFIG ÚNICA QUE TE INTERESA ---------- */
const CFG = {
  // Velocidad base del scroll (px por segundo)
scrollSpeed: 150,      // antes 220 (≈ -15%)
scrollAccelEachSec: 0,

  // Movimiento del jugador
  playerSpeed: 300,          // velocidad lateral (px/s)
  jump: -950,                // fuerza salto (px/s)
  gravity: 2200,             // gravedad (px/s^2)
  coyote: 0.18,               // “coyote time” para saltar justo al borde

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
/* -------------------------------------------------- */

const rand=(a,b)=>Math.random()*(b-a)+a;
const ri   =(a,b)=>Math.floor(rand(a,b+1));
const chance=p=>Math.random()<p;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

/* ---------- Assets ---------- */
function img(src){ const i=new Image(); i.src=src; return i; }
function sfx(src,loop=false){ try{const a=new Audio(src); a.loop=loop; return a;}catch{return null;} }

const imgMid  = img("assets/tiles/tile_middleok.png");
const imgFog  = img("assets/tiles/tile_fog.png");
const imgGnd  = img("assets/tiles/tile_ground_soft.png");

const imgPlayer = img("assets/player.png");
const imgZombie = img("assets/zombie.png");
const imgCoin   = img("assets/coin.png");
const imgCoinS  = img("assets/coin_special.png");
const imgPuff   = img("assets/fx/fx_zombie_puff_64.png");
const imgTomb   = img("assets/tiles/tile_tomb_1x1.png");
const imgMaus   = img("assets/tiles/tile_mausoleum_1x1.png");

const music = sfx("assets/music.mp3", true);
const sndCoin = sfx("assets/sfx_coin.wav");
const sndSpec = sfx("assets/sfx_power.wav");
const sndBeam = sfx("assets/sfx_beam.wav");
const sndDie  = sfx("assets/sfx_zombie_die.wav");
const sndOver = sfx("assets/sfx_gameover.wav");

/* ---------- Estado ---------- */
const GROUND = 120;
const gy = ()=> canvas.height - GROUND;

const S = {
  started:false, over:false,
  score:0, best:0, lives:3, power:0,

  // distancia del mundo (cuánto se ha desplazado el suelo hacia la izq.)
  world: 0,
  scroll: CFG.scrollSpeed,

  // jugador (en coordenadas de pantalla)
  p:{ x: 180, y: 0, w:64, h:64, vx:0, vy:0, on:false, coyote:0, invul:0, shotCd:0 },

  coins:[], zombies:[], obstacles:[], beams:[], puffs:[],

  // siguientes distancias absolutas donde aparecerá cada cosa
  nextCoin:0, nextSpec:0, nextZom:0, nextObst:0
};

/* ---------- Input ---------- */
const keys=new Set();
addEventListener("keydown",e=>{
  keys.add(e.code);
  if (e.code==="Enter"){ if(!S.started||S.over) start(); }
  if (e.code==="Space" && S.started && !S.over) shoot();
});
addEventListener("keyup",e=>keys.delete(e.code));

/* ---------- Helpers ---------- */
function resetPlayer(){
  const p=S.p;
  p.y = gy()-p.h; p.vx=0; p.vy=0; p.on=true; p.coyote=0; p.invul=0.8; p.shotCd=0;
}
function screenRect(ent){
  // ent.x es distancia de mundo; su X en pantalla = pantallaWidth - (world - ent.x)
  // más fácil: screenX = ent.x - S.world
  return { x: ent.x - S.world, y: ent.y, w: ent.w, h: ent.h };
}
function overlap(a,b){ return a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y; }

function scheduleInitial(){
  const w = S.world;
  const g=CFG.gaps;
  S.nextCoin = w + rand(...g.coin);
  S.nextSpec = w + rand(...g.spec);
  S.nextZom  = w + rand(...g.zom);
  S.nextObst = w + rand(...g.obst);
}
function spawnIfReached(){
  const rightEdgeWorld = S.world + canvas.width + 600; // pre-cargar fuera de pantalla
  const g=CFG.gaps;

  // Coin
  while (S.nextCoin < rightEdgeWorld){
    S.coins.push({ x:S.nextCoin, y: gy()-88-rand(0,24), w:56, h:56, special:false });
    S.nextCoin += rand(...g.coin);
  }
  // Special coin
  while (S.nextSpec < rightEdgeWorld){
    S.coins.push({ x:S.nextSpec, y: gy()-92-rand(0,24), w:56, h:56, special:true });
    S.nextSpec += rand(...g.spec);
  }
// Zombie
while (S.nextZom < rightEdgeWorld){
  S.zombies.push({ x:S.nextZom, y: gy()-60, w:56, h:60 }); // antes 64x64
  S.nextZom += rand(...g.zom);
}
  // Obstacles
  while (S.nextObst < rightEdgeWorld){
    if (chance(g.obstChance)){
      const useM = chance(0.5);
      S.obstacles.push({
        x:S.nextObst,
        y:gy()-CFG.obst.hitH, w:CFG.obst.hitW, h:CFG.obst.hitH,
        drawW:CFG.obst.drawW, drawH:CFG.obst.drawH,
        img: useM?imgMaus:imgTomb
      });
    }
    S.nextObst += rand(...g.obst);
  }
}

function start(){
  S.started=true; S.over=false;
  S.score=0; S.lives=3; S.power=0;
  S.world=0; S.scroll=CFG.scrollSpeed;

  S.coins.length=0; S.zombies.length=0; S.obstacles.length=0;
  S.beams.length=0; S.puffs.length=0;

  resetPlayer();
  scheduleInitial(); spawnIfReached();

  if (music){ music.currentTime=0; music.volume=.38; music.play().catch(()=>{}); }
}
function gameOver(){
  S.over=true; if (S.score>S.best) S.best=S.score;
  if (music) music.pause();
  if (sndOver){ sndOver.currentTime=0; sndOver.play().catch(()=>{}); }
}

/* ---------- Gameplay ---------- */
function shoot(){
  const p=S.p;
  if (p.shotCd>0 || S.power<CFG.beamCost) return;
  p.shotCd=0.18;
  S.power=Math.max(0,S.power-CFG.beamCost);
  S.beams.push({ x:p.x+p.w-6, y:p.y+p.h*0.35, w:42, h:10, vx:CFG.beamSpeed });
  if (sndBeam){ sndBeam.currentTime=0; sndBeam.play().catch(()=>{}); }
}

function update(dt){
  // Scroll del mundo
  S.world += S.scroll*dt;
  if (CFG.scrollAccelEachSec>0) S.scroll += CFG.scrollAccelEachSec*dt;

  // Input jugador
  const p=S.p;
  p.vx = 0;
  if (keys.has("ArrowLeft") || keys.has("KeyZ")) p.vx -= CFG.playerSpeed;
  if (keys.has("ArrowRight")|| keys.has("KeyC")) p.vx += CFG.playerSpeed;

  // mover en pantalla
  p.x += p.vx*dt;
  p.x = clamp(p.x, 120, canvas.width*0.65);

  // salto + coyote
  if (p.on) p.coyote = CFG.coyote; else p.coyote = Math.max(0, p.coyote-dt);
  if ((keys.has("ArrowUp")||keys.has("KeyS")) && (p.on || p.coyote>0)){ p.vy = CFG.jump; p.on=false; p.coyote=0; }
  p.vy += CFG.gravity*dt; p.y += p.vy*dt;
  if (p.y >= gy()-p.h){ p.y=gy()-p.h; p.vy=0; p.on=true; }

  if (p.invul>0)  p.invul -= dt;
  if (p.shotCd>0) p.shotCd -= dt;

  // Spawns por distancia
  spawnIfReached();

  const cullLeftWorld = S.world - 120;

  // Monedas
  for (let i=S.coins.length-1;i>=0;i--){
    const c=S.coins[i];
    if (c.x < cullLeftWorld){ S.coins.splice(i,1); continue; }
    const sr = screenRect(c);
    const pr = { x:p.x, y:p.y, w:p.w, h:p.h };
    if (overlap(sr,pr)){
      if (c.special){ S.power = clamp(S.power+40, 0, CFG.powerMax); S.score += 120; if (sndSpec){ sndSpec.currentTime=0; sndSpec.play().catch(()=>{});} }
      else          { S.score += 25; if (sndCoin){ sndCoin.currentTime=0; sndCoin.play().catch(()=>{});} }
      S.coins.splice(i,1);
    }
  }

  // Beams
  for (let i=S.beams.length-1;i>=0;i--){
    const b=S.beams[i]; b.x += b.vx*dt; if (b.x>canvas.width+80) S.beams.splice(i,1);
  }

  // Zombies (puedes darles un ligero avance propio si quieres)
  for (let i=S.zombies.length-1;i>=0;i--){
    const z=S.zombies[i];
    if (z.x < cullLeftWorld){ S.zombies.splice(i,1); continue; }

    // golpe de beam
    const zr = screenRect(z);
    for (let j=S.beams.length-1;j>=0;j--){
      const b=S.beams[j];
      if (overlap({x:b.x,y:b.y,w:b.w,h:b.h}, zr)){
        S.puffs.push({x:z.x,y:z.y,frame:0,frames:10});
        if (sndDie){ sndDie.currentTime=0; sndDie.play().catch(()=>{}); }
        S.zombies.splice(i,1); S.beams.splice(j,1); S.score += 150;
        break;
      }
    }
    // colisión con jugador
    if (i<S.zombies.length){
      const pr = { x:p.x, y:p.y, w:p.w, h:p.h };
      if (p.invul<=0 && overlap(zr,pr)){
        S.lives--; p.invul=1.0;
        S.puffs.push({x:z.x,y:z.y,frame:0,frames:10});
        S.zombies.splice(i,1);
        if (S.lives<=0){ gameOver(); return; }
      }
    }
  }

  // Obstáculos
  for (let i=S.obstacles.length-1;i>=0;i--){
    const o=S.obstacles[i];
    if (o.x < cullLeftWorld){ S.obstacles.splice(i,1); continue; }
    const or = screenRect(o);
    const pr = { x:p.x, y:p.y, w:p.w, h:p.h };
    if (p.invul<=0 && overlap(or,pr)){
      S.lives--; p.invul=1.0;
      S.puffs.push({x:o.x,y:o.y,frame:0,frames:10});
      S.obstacles.splice(i,1);
      if (S.lives<=0){ gameOver(); return; }
    }
  }

  // FX
  for (let i=S.puffs.length-1;i>=0;i--){
    const f=S.puffs[i]; f.frame++; if (f.frame>f.frames) S.puffs.splice(i,1);
  }

  // Score por distancia
  S.score += CFG.scrollSpeed * dt * 0.3;
}

/* ---------- Render ---------- */
function tileX(img, offset){
  if (!img.complete) return;
  const w=img.width;
  let x = -((S.world + offset) % w); if (x>0) x -= w;
  for (; x<canvas.width; x+=w) ctx.drawImage(img, x, 0 + (img===imgGnd ? gy()-img.height : img===imgFog ? gy()-180 : gy()-220));
}
function render(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle="#0a0d12"; ctx.fillRect(0,0,canvas.width,canvas.height);

  // Parallax simple: usar offsets distintos
  tileX(imgMid, 0.25*S.world);
  tileX(imgFog, 0.45*S.world);
  tileX(imgGnd, 0.85*S.world);

  // Entidades
  for (const c of S.coins){
    const sr = screenRect(c);
    ctx.drawImage(c.special?imgCoinS:imgCoin, sr.x, sr.y, c.w, c.h);
  }
  for (const o of S.obstacles){
    const or = screenRect(o);
    ctx.drawImage(o.img, or.x-(o.drawW-o.w)/2, or.y-(o.drawH-o.h), o.drawW, o.drawH);
  }
  for (const z of S.zombies){
    const zr = screenRect(z);
    ctx.drawImage(imgZombie, zr.x, zr.y, z.w, z.h);
  }
  ctx.fillStyle="#7ec8ff";
  for (const b of S.beams) ctx.fillRect(b.x, b.y, b.w, b.h);

  for (const f of S.puffs){
    const sr = screenRect({x:f.x,y:f.y,w:64,h:64});
    ctx.globalAlpha = 1 - f.frame/f.frames;
    ctx.drawImage(imgPuff, sr.x, sr.y, 64, 64);
    ctx.globalAlpha = 1;
  }

  // Jugador
  if (S.p.invul>0) ctx.globalAlpha = .6;
  ctx.drawImage(imgPlayer, S.p.x, S.p.y, S.p.w, S.p.h);
  ctx.globalAlpha = 1;

  // HUD
  ctx.fillStyle="rgba(0,0,0,.55)"; ctx.fillRect(16,16,460,96);
  ctx.fillStyle="#fff";
  ctx.font="28px system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial";
  ctx.fillText(`Score: ${Math.floor(S.score)}`, 28,50);
  ctx.fillText(`Best:  ${Math.floor(S.best)}`,  28,86);

  for (let i=0;i<3;i++){
    ctx.beginPath(); ctx.arc(500+i*26,40,9,0,Math.PI*2);
    ctx.fillStyle=i<S.lives? "#ff5566" : "#666"; ctx.fill();
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

/* ---------- Loop ---------- */
let last=performance.now();
function loop(now){
  const dt=Math.min(0.032,(now-last)/1000); last=now;
  if (S.started && !S.over) update(dt);
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
