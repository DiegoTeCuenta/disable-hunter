/* ---------- CONFIG ÚNICA QUE TE INTERESA ---------- */
const CFG = {
  // Velocidad base del scroll (px por segundo)
  scrollSpeed: 150,      // antes 220 (≈ -15%)
  scrollAccelEachSec: 0,

  // Movimiento del jugador
  playerSpeed: 300,          // velocidad lateral (px/s)
  jump: -950,                // fuerza salto (px/s)
  gravity: 2200,             // gravedad (px/s^2)
  coyote: 0.18,              // “coyote time” para saltar justo al borde

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

/* ============================== CORE ============================== */
const CANVAS = document.getElementById('game');
const CTX     = CANVAS.getContext('2d');
const W = CANVAS.width;  // 1920
const H = CANVAS.height; // 1080

/* ============================== ASSETS ============================ */
const IMG = {
  bg:   'assets/tiles/bg_static_1920x1080.png',
  mid:  'assets/tiles/tile_middleok.png',
  fog:  'assets/tiles/tile_fog.png',
  grd:  'assets/tiles/tile_ground_soft.png',

  player: 'assets/player.png',
  zombie: 'assets/zombie.png',
  coin:   'assets/coin.png',
  coinS:  'assets/coin_special.png', // si no existe, se usará coin normal

  tomb:  'assets/tiles/tile_tomb_1x1.png',
  maus:  'assets/tiles/tile_mausoleum_1x1.png',

  beam:  'assets/fx/fx_beam_128.png',
  hit:   'assets/fx/fx_hit_48.png',
  puff:  'assets/fx/fx_zombie_puff_64.png',

  heart: 'assets/ui/ui_heart_32.png'
};

const SFX = {
  coin:  'assets/sfx_coin.wav',
  power: 'assets/sfx_power.wav',
  beam:  'assets/sfx_beam.wav',
  die:   'assets/sfx_zombie_die.wav',
  over:  'assets/sfx_gameover.wav',
  music: 'assets/music.mp3'
};

function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('img ' + src));
    im.src = src;
  });
}
function loadAudio(src, loop=false, vol=1) {
  return new Promise((res, rej) => {
    const a = new Audio();
    a.loop = loop;
    a.volume = vol;
    a.oncanplaythrough = () => res(a);
    a.onerror = () => rej(new Error('audio ' + src));
    a.src = src;
  });
}

let G = {
  img:{}, sfx:{},
  running:false, gameOver:false,
  score:0, best: +localStorage.getItem('dh_best')||0,
  power:0, hearts:3,
  // mundo
  worldX:0, // distancia recorrida
  // player
  px: 300, py:0, vy:0, onGround:false, coyote:0, inv:0,
  // arrays
  coins:[], specs:[], zombies:[], obst:[], beams:[], fx:[],
  // spawn control
  nextCoin:0, nextSpec:0, nextZom:0, nextObst:0
};

const GROUND_Y = H*0.66;          // línea de piso donde pisan todo
const MID_Y    = H*0.24;          // capa “middle” (cementerio borroso móvil)
const FOG_Y    = H*0.75;          // niebla
const LAYER_SCROLL = { mid: 0.35, fog: 0.55, ground: 1.0 };

// UI
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');

/* ============================== INPUT ============================= */
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.key.toLowerCase()] = true;
  if (e.code === 'Space') keys['space'] = true;
});
window.addEventListener('keyup', e => {
  keys[e.key.toLowerCase()] = false;
  if (e.code === 'Space') keys['space'] = false;
});

/* ============================== UTILS ============================= */
function rand(a,b){return a+Math.random()*(b-a)|0;}
function aabb(a,b){
  return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
}

/* ============================== SETUP ============================= */
async function boot(){
  try{
    // cargar imágenes
    const names = Object.keys(IMG);
    const imgs  = await Promise.all(names.map(n=>loadImage(IMG[n]).catch(()=>null)));
    names.forEach((n,i)=> G.img[n]=imgs[i]||null);

    // si no hay coinS, usa coin
    if(!G.img.coinS) G.img.coinS = G.img.coin;

    // cargar sonidos
    G.sfx.coin  = await loadAudio(SFX.coin,false,0.7).catch(()=>null);
    G.sfx.power = await loadAudio(SFX.power,false,0.7).catch(()=>null);
    G.sfx.beam  = await loadAudio(SFX.beam,false,0.6).catch(()=>null);
    G.sfx.die   = await loadAudio(SFX.die,false,0.7).catch(()=>null);
    G.sfx.over  = await loadAudio(SFX.over,false,0.7).catch(()=>null);
    G.sfx.music = await loadAudio(SFX.music,true,0.25).catch(()=>null);

    reset(true);
    overlay.style.display = 'flex';
    startBtn.onclick = startGame;
  }catch(err){
    console.error(err);
    CTX.fillStyle='#222'; CTX.fillRect(0,0,W,H);
    CTX.fillStyle='#fff'; CTX.font='28px system-ui';
    CTX.fillText('Error cargando assets. Revisa rutas.', 80, 120);
  }
}

function startGame(){
  overlay.style.display = 'none';
  reset(false);
  if(G.sfx.music){ G.sfx.music.currentTime=0; G.sfx.music.play().catch(()=>{}); }
  G.running = true; G.gameOver = false;
  last = performance.now();
  requestAnimationFrame(loop);
}

function reset(keepBest){
  G.score=0;
  if(!keepBest) G.best = +localStorage.getItem('dh_best')||0;
  G.power=0; G.hearts=3; G.inv=0;
  G.worldX=0; G.px=300; G.py=GROUND_Y-96; G.vy=0; G.onGround=true; G.coyote=0;
  G.coins=[]; G.specs=[]; G.zombies=[]; G.obst=[]; G.beams=[]; G.fx=[];
  // programar primeros spawns
  G.nextCoin = 300;
  G.nextSpec = 1400;
  G.nextZom  = 800;
  G.nextObst = 1000;
}

/* ============================== ENTIDADES ========================= */
function pushCoin(x,y,special=false){
  (special?G.specs:G.coins).push({x,y,w:48,h:48, sp:special, vx:0});
}
function pushZombie(x){
  const y = GROUND_Y-96;
  G.zombies.push({x, y, w:64,h:96, vx:0, hp:1, hit:0});
}
function pushObst(x){
  const y = GROUND_Y-CFG.obst.drawH;
  const isM = Math.random()<0.5;
  G.obst.push({
    x, y,
    w: CFG.obst.hitW, h: CFG.obst.hitH,
    dx: (CFG.obst.drawW - CFG.obst.hitW)/2, // centro hitbox
    dy: CFG.obst.drawH - CFG.obst.hitH,
    isM
  });
}
function shoot(){
  if(G.power < CFG.beamCost) return;
  G.power -= CFG.beamCost;
  if(G.sfx.beam) { G.sfx.beam.currentTime=0; G.sfx.beam.play().catch(()=>{}); }
  G.beams.push({x:G.px+40, y:G.py+44, w:32,h:8, vx:CFG.beamSpeed, alive:1});
}

/* beam vs obst “shield” y luego vs zombies */
function updateBeams(dt,scroll){
  for(let i=G.beams.length-1;i>=0;--i){
    const b=G.beams[i];
    b.x += (b.vx - scroll)*dt;
    // detenerse si golpea obstáculo
    let blocked=false;
    for(const o of G.obst){
      const hr = {x:o.x+o.dx, y:o.y+o.dy, w:o.w, h:o.h};
      if(aabb(b, hr)){ blocked=true; break; }
    }
    if(blocked){ b.alive=0; continue; }
    // impacto con zombi
    for(const z of G.zombies){
      if(aabb(b, z) && z.hp>0){
        z.hp=0; z.hit=0.25;
        if(G.sfx.die){ G.sfx.die.currentTime=0; G.sfx.die.play().catch(()=>{}); }
        G.fx.push({x:z.x,y:z.y, t:0.25, type:'puff'});
        G.score += 100;
        b.alive=0; break;
      }
    }
    if(b.x>W+50 || !b.alive) G.beams.splice(i,1);
  }
}

/* ============================== GAME LOOP ======================== */
let last=0;
function loop(t){
  if(!G.running) return;
  const dt = Math.min(0.033, (t-last)/1000); last=t;

  step(dt);
  draw();

  if(G.running) requestAnimationFrame(loop);
}

function step(dt){
  // velocidad de scroll y avance de mundo
  const scroll = CFG.scrollSpeed; // si quieres progresión: + CFG.scrollAccelEachSec*time
  G.worldX += scroll*dt;

  // INPUT (mover y saltar)
  let dir=0;
  if(keys['arrowleft'] || keys['a'])  dir -= 1;
  if(keys['arrowright']|| keys['d'])  dir += 1;

  // pos horizontal limitada dentro de pantalla
  G.px = Math.max(80, Math.min(W-200, G.px + dir*CFG.playerSpeed*dt));

  // salto (↑ o W o Z). space = disparo
  if(keys[' ']||keys['space']) { /* space es shoot */ if(keys['space']){shoot(); keys['space']=false;} }
  const wantsJump = (keys['arrowup']||keys['w']||keys['z']);
  if(wantsJump && (G.onGround || G.coyote>0)){
    G.vy = CFG.jump;
    G.onGround=false;
    G.coyote=0;
  }

  // física vertical
  G.vy += CFG.gravity*dt;
  G.py += G.vy*dt;

  // colisión con piso
  if(G.py >= GROUND_Y-96){
    G.py = GROUND_Y-96;
    if(!G.onGround){ G.onGround=true; }
    G.vy = 0;
  }else{
    if(G.onGround){ G.onGround=false; G.coyote=CFG.coyote; }
  }
  if(!G.onGround && G.coyote>0) G.coyote -= dt;

  // desplazar entidades hacia la izquierda por scroll
  const moveLeft = scroll*dt;
  for(const c of G.coins){  c.x -= moveLeft; }
  for(const s of G.specs){  s.x -= moveLeft; }
  for(const z of G.zombies){ z.x -= moveLeft; if(z.hit>0) z.hit-=dt; }
  for(const o of G.obst){  o.x -= moveLeft; }

  // beams (con escudo de tumba)
  updateBeams(dt, scroll);

  // recoger monedas
  for(let i=G.coins.length-1;i>=0;--i){
    const c=G.coins[i];
    if(Math.abs((c.x+24)-(G.px+32))<38 && Math.abs((c.y+24)-(G.py+48))<42){
      G.coins.splice(i,1);
      G.score += 25;
      if(G.sfx.coin){ G.sfx.coin.currentTime=0; G.sfx.coin.play().catch(()=>{}); }
    }else if(c.x<-80){ G.coins.splice(i,1); }
  }
  for(let i=G.specs.length-1;i>=0;--i){
    const s=G.specs[i];
    if(Math.abs((s.x+24)-(G.px+32))<40 && Math.abs((s.y+24)-(G.py+48))<46){
      G.specs.splice(i,1);
      G.power = Math.min(CFG.powerMax, G.power+50);
      if(G.sfx.power){ G.sfx.power.currentTime=0; G.sfx.power.play().catch(()=>{}); }
    }else if(s.x<-80){ G.specs.splice(i,1); }
  }

  // colisión con obstáculos (no desaparecen)
  if(G.inv>0) G.inv-=dt;
  for(const o of G.obst){
    const hr = {x:o.x+o.dx, y:o.y+o.dy, w:o.w, h:o.h};
    const pr = {x:G.px+8, y:G.py+16, w:48, h:72};
    if(aabb(pr,hr) && G.inv<=0){
      hurt();
      break;
    }
  }
  // colisión con zombis (si siguen vivos)
  for(const z of G.zombies){
    if(z.hp>0){
      const pr = {x:G.px+8, y:G.py+16, w:48, h:72};
      if(aabb(pr,z) && G.inv<=0){
        hurt();
        break;
      }
    }
  }

  // limpiar zombis muertos (fuera de pantalla o hp 0 y fx hecha)
  for(let i=G.zombies.length-1;i>=0;--i){
    const z=G.zombies[i];
    if(z.x<-120 || (z.hp<=0 && z.hit<=0)) G.zombies.splice(i,1);
  }
  // efectos breves
  for(let i=G.fx.length-1;i>=0;--i){ const f=G.fx[i]; f.t-=dt; if(f.t<=0) G.fx.splice(i,1); }

  // recargar power lentamente
  G.power = Math.min(CFG.powerMax, G.power + 8*dt);

  // SPAWNS por distancia
  spawnByDistance();

  // game over?
  if(G.hearts<=0 && !G.gameOver){
    gameOver();
  }
}

function hurt(){
  G.hearts -= 1; G.inv = 0.9;
  if(G.hearts<0) G.hearts=0;
}

function spawnByDistance(){
  const xFar = W + 60;
  // monedas normales
  if(G.worldX >= G.nextCoin){
    const y = GROUND_Y - rand(120, 220);
    pushCoin(xFar, y, false);
    G.nextCoin += rand(...CFG.gaps.coin);
  }
  // especiales
  if(G.worldX >= G.nextSpec){
    const y = GROUND_Y - rand(160, 260);
    pushCoin(xFar, y, true);
    G.nextSpec += rand(...CFG.gaps.spec);
  }
  // zombis
  if(G.worldX >= G.nextZom){
    pushZombie(xFar);
    G.nextZom += rand(...CFG.gaps.zom);
  }
  // obstáculos
  if(G.worldX >= G.nextObst){
    if(Math.random() < CFG.gaps.obstChance) pushObst(xFar);
    G.nextObst += rand(...CFG.gaps.obst);
  }
}

/* ============================== DRAW ============================== */
function draw(){
  // BG estático (cubre todo)
  if(G.img.bg) CTX.drawImage(G.img.bg, 0, 0, W, H);
  else { CTX.fillStyle='#0b0e13'; CTX.fillRect(0,0,W,H); }

  // capa middle (parallax)
  if(G.img.mid){
    const speed = LAYER_SCROLL.mid * (G.worldX%960);
    tileX(CTX, G.img.mid, -speed, MID_Y);
  }
  // FOG
  if(G.img.fog){
    const speed = LAYER_SCROLL.fog * (G.worldX%960);
    tileX(CTX, G.img.fog, -speed, FOG_Y);
  }
  // GROUND
  if(G.img.grd){
    const speed = LAYER_SCROLL.ground * (G.worldX%960);
    tileX(CTX, G.img.grd, -speed, GROUND_Y-64);
  }

  // Coins
  for(const c of G.coins){
    const im = G.img.coin || null;
    if(im) CTX.drawImage(im, c.x-24, c.y-24, 48,48);
    else { CTX.fillStyle='gold'; CTX.fillRect(c.x-10,c.y-10,20,20); }
  }
  // Specials
  for(const s of G.specs){
    const im = G.img.coinS || G.img.coin;
    if(im) CTX.drawImage(im, s.x-24, s.y-24, 48,48);
    else { CTX.fillStyle='#4bc0ff'; CTX.fillRect(s.x-10,s.y-10,20,20); }
  }
  // Obstáculos (dibujar sprite completo)
  for(const o of G.obst){
    const im = o.isM ? G.img.maus : G.img.tomb;
    if(im) CTX.drawImage(im, o.x+(o.dx - (CFG.obst.drawW-CFG.obst.hitW)/2), o.y, CFG.obst.drawW, CFG.obst.drawH);
    else { CTX.fillStyle='#666'; CTX.fillRect(o.x+o.dx,o.y+o.dy,o.w,o.h); }
  }
  // Zombis
  for(const z of G.zombies){
    const im = G.img.zombie;
    if(im){
      if(z.hit>0) CTX.globalAlpha = 0.5 + 0.5*Math.sin(z.hit*30);
      CTX.drawImage(im, z.x, z.y, 64,96);
      CTX.globalAlpha = 1;
    } else { CTX.fillStyle='#7f3'; CTX.fillRect(z.x,z.y,64,96); }
  }
  // Player
  if(G.img.player){
    if(G.inv>0) CTX.globalAlpha = 0.5 + 0.5*Math.sin(G.inv*25);
    CTX.drawImage(G.img.player, G.px, G.py, 64,96);
    CTX.globalAlpha = 1;
  } else { CTX.fillStyle='#fff'; CTX.fillRect(G.px,G.py,64,96); }

  // Beams
  CTX.fillStyle = '#7dc8ff';
  for(const b of G.beams){
    if(G.img.beam) CTX.drawImage(G.img.beam, b.x, b.y, b.w, b.h);
    else CTX.fillRect(b.x,b.y,b.w,b.h);
  }
  // FX
  for(const f of G.fx){
    if(f.type==='puff' && G.img.puff){
      const alpha = Math.max(0, f.t/0.25);
      CTX.globalAlpha = alpha;
      CTX.drawImage(G.img.puff, f.x-16, f.y-16, 96,96);
      CTX.globalAlpha = 1;
    }
  }

  // HUD
  drawHUD();
}

function tileX(ctx, img, x, y){
  const w = img.width, h = img.height;
  // dibujar repetido horizontalmente
  let xx = x;
  while(xx < W) {
    ctx.drawImage(img, xx, y, w, h);
    xx += w;
  }
  // cubrir hueco izquierdo
  let xxL = x - w;
  while(xxL > -w) {
    ctx.drawImage(img, xxL, y, w, h);
    xxL -= w;
  }
}

function drawHUD(){
  // cuadro score
  CTX.fillStyle='rgba(0,0,0,.7)';
  CTX.fillRect(16,16, 520, 110);
  CTX.fillStyle='#fff';
  CTX.font='bold 64px system-ui, -apple-system, Segoe UI';
  CTX.fillText(`Score: ${G.score|0}`, 26, 78);
  CTX.font='bold 44px system-ui, -apple-system, Segoe UI';
  CTX.fillText(`Best: ${G.best|0}`, 26, 126);

  // Hearts
  const heart = G.img.heart;
  for(let i=0;i<3;i++){
    const ax = 620 + i*54, ay = 28;
    if(heart){ CTX.globalAlpha = (i<G.hearts)?1:0.25; CTX.drawImage(heart, ax, ay, 32,32); CTX.globalAlpha=1; }
    else { CTX.fillStyle = i<G.hearts?'#f55':'#555'; CTX.beginPath(); CTX.arc(ax+16,ay+16,12,0,Math.PI*2); CTX.fill(); }
  }

  // Power bar
  const bw=600, bh=18, bx=690, by=44;
  CTX.fillStyle='#2e2e2e'; CTX.fillRect(bx,by,bw,bh);
  CTX.fillStyle='#67a9ff'; CTX.fillRect(bx,by, Math.round(bw*(G.power/CFG.powerMax)), bh);
}

/* ============================== GAME OVER ========================= */
function gameOver(){
  G.running=false;
  G.gameOver=true;
  if(G.sfx.over){ G.sfx.over.currentTime=0; G.sfx.over.play().catch(()=>{}); }
  if(G.sfx.music){ try{G.sfx.music.pause();}catch{} }
  if(G.score>G.best){ G.best=G.score; localStorage.setItem('dh_best', G.best); }

  // mostrar overlay en modo restart
  overlay.querySelector('h1').textContent = 'Disabled Hunter';
  overlay.querySelector('p').innerHTML = `Score: ${G.score}<br>Best: ${G.best}`;
  startBtn.textContent = 'Restart';
  overlay.style.display = 'flex';
  startBtn.onclick = startGame;
}

/* ============================== START ============================ */
boot();
