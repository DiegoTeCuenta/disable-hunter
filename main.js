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

/* ============================================ */
/* ================== CORE =================== */
/* ============================================ */

const CANVAS = document.getElementById('game');
const CTX = CANVAS.getContext('2d');

// Tamaño fijo del mundo del juego
const GAME_WIDTH = 960;
const GAME_HEIGHT = 540;

CANVAS.width = GAME_WIDTH;
CANVAS.height = GAME_HEIGHT;

const W = CANVAS.width;
const H = CANVAS.height;

const IMG = {};
const SFX = {};

// Cargar fondo estático
IMG.bg = new Image();
IMG.bg.src = 'bg_static_1920x1080.png';

// Ajuste de escala visual
window.addEventListener('resize', resizeCanvas);
function resizeCanvas() {
    const scale = Math.min(window.innerWidth / GAME_WIDTH, window.innerHeight / GAME_HEIGHT);
    CANVAS.style.width = (GAME_WIDTH * scale) + 'px';
    CANVAS.style.height = (GAME_HEIGHT * scale) + 'px';
}
resizeCanvas();

// Función para dibujar fondo
function drawBackground() {
    // Centrar el fondo (1920x1080 → 960x540)
    CTX.drawImage(
        IMG.bg,
        0, 0, 1920, 1080, // tamaño original
        0, 0, GAME_WIDTH, GAME_HEIGHT // tamaño destino
    );
}

// Ejemplo de bucle de render
function gameLoop() {
    drawBackground();

    // Aquí irían tus otros dibujos del juego
    requestAnimationFrame(gameLoop);
}

IMG.bg.onload = () => {
    gameLoop();
};


const SPRITES = {
  bg:           'assets/tiles/bg_static_1920x1080.png',
  middle:       'assets/tiles/tile_middleok.png',
  fog:          'assets/tiles/tile_fog.png',
  ground:       'assets/tiles/tile_ground_soft.png',
  player:       'assets/player.png',
  zombie:       'assets/zombie.png',
  coin:         'assets/coin.png',
  coinSpecial:  'assets/coin_special.png',
  tomb:         'assets/tiles/tile_tomb_1x1.png',
  mausoleum:    'assets/tiles/tile_mausoleum_1x1.png',
  heart:        'assets/ui/ui_heart_32.png',
  beamFX:       'assets/fx/fx_beam_128.png'
};
const SOUNDS = {
  coin:    'assets/sfx_coin.wav',
  power:   'assets/sfx_power.wav',
  beam:    'assets/sfx_beam.wav',
  die:     'assets/sfx_zombie_die.wav',
  over:    'assets/sfx_gameover.wav',
  music:   'assets/music.mp3'
};

function loadImage(key, src) {
  return new Promise(res => {
    const i = new Image();
    i.src = src;
    i.onload = () => { IMG[key] = i; res(); };
    i.onerror = () => res();
  });
}
function loadAudio(key, src, loop=false, volume=1) {
  const a = new Audio(src);
  a.loop = loop; a.volume = volume;
  SFX[key] = a;
}

const R_MIDDLE = 0.25, R_FOG = 0.45, R_GROUND = 1.0;
const GROUND_Y = Math.round(H * 0.70);

// Mundo por distancia (px) y scroll (para parallax/tileo)
let worldX = 0;     // distancia total recorrida (px)
let scrollX = 0;    // desplazamiento visual acumulado (px)

// Siguiente distancia objetivo para cada spawn
let nextCoinAt = 0, nextSpecAt = 0, nextZomAt = 0, nextObstAt = 0;

// Estado de juego
let score = 0;
let best = Number(localStorage.getItem('dh_best') || 0);
let power = 0;
let lives = 3;

// Entidades
const zombies = [];
const coins = [];
const pCoins = [];
const tombs = [];
const beams = [];

const player = { x: Math.round(W*0.12), y: GROUND_Y-64, w:52, h:64, vy:0, onGround:true, canShoot:true, coyote:0 };

// Controles
const keys = { ArrowLeft:false, ArrowRight:false, ArrowUp:false, Space:false, a:false, d:false, w:false };
window.addEventListener('keydown', e=>{
  if(e.code==='ArrowLeft')  keys.ArrowLeft=true;
  if(e.code==='ArrowRight') keys.ArrowRight=true;
  if(e.code==='ArrowUp')    keys.ArrowUp=true;
  if(e.code==='Space')      keys.Space=true;
  if(e.key==='a') keys.a=true;
  if(e.key==='d') keys.d=true;
  if(e.key==='w') keys.w=true;
});
window.addEventListener('keyup', e=>{
  if(e.code==='ArrowLeft')  keys.ArrowLeft=false;
  if(e.code==='ArrowRight') keys.ArrowRight=false;
  if(e.code==='ArrowUp')    keys.ArrowUp=false;
  if(e.code==='Space')      keys.Space=false;
  if(e.key==='a') keys.a=false;
  if(e.key==='d') keys.d=false;
  if(e.key==='w') keys.w=false;
});

// Utilidades
function rand(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function aabb(a,b){
  return (a.x < b.x + b.w) && (a.x + a.w > b.x) && (a.y < b.y + b.h) && (a.y + a.h > b.y);
}
function range([a,b]){ return rand(a,b); }

// Spawns iniciales
function resetSpawnTargets() {
  nextCoinAt = worldX + range(CFG.gaps.coin);
  nextSpecAt = worldX + range(CFG.gaps.spec);
  nextZomAt  = worldX + range(CFG.gaps.zom);
  nextObstAt = worldX + range(CFG.gaps.obst);
}
function spawnAheadX() {
  // Aparecen con margen por delante para no “spawnear encima”
  return W + rand(Math.round(W*0.20), Math.round(W*0.55));
}
function spawnByDistance(){
  if(worldX >= nextCoinAt){
    const n = rand(2,4);
    const base = spawnAheadX();
    for(let i=0;i<n;i++){
      const cx = base + i*rand(46,64);
      const cy = GROUND_Y - rand(24, 64);
      coins.push({x:cx,y:cy,w:28,h:28});
    }
    nextCoinAt = worldX + range(CFG.gaps.coin);
  }
  if(worldX >= nextSpecAt){
    const cx = spawnAheadX();
    const cy = GROUND_Y - rand(30,70);
    pCoins.push({x:cx,y:cy,w:30,h:30});
    nextSpecAt = worldX + range(CFG.gaps.spec);
  }
  if(worldX >= nextZomAt){
    const zx = spawnAheadX();
    zombies.push({x:zx,y:GROUND_Y-62,w:48,h:62,alive:true});
    nextZomAt = worldX + range(CFG.gaps.zom);
  }
  if(worldX >= nextObstAt){
    if(Math.random() < CFG.gaps.obstChance){
      const isM = Math.random()<0.4;
      const sprite = isM?'mausoleum':'tomb';
      const ox = spawnAheadX();
      tombs.push({
        x:ox,
        y:GROUND_Y-CFG.obst.hitH,
        w:CFG.obst.hitW, h:CFG.obst.hitH,
        sprite, drawW:CFG.obst.drawW, drawH:CFG.obst.drawH
      });
    }
    nextObstAt = worldX + range(CFG.gaps.obst);
  }
}

// Físicas/delta
let lastTime = performance.now();

// Loop
function tick(){
  const now = performance.now();
  let dt = (now - lastTime) / 1000; // segundos
  lastTime = now;

  // Aceleración del scroll si corresponde
  if(CFG.scrollAccelEachSec !== 0) {
    CFG.scrollSpeed += CFG.scrollAccelEachSec * dt;
  }

  // Avance del mundo y del scroll visual
  const dxWorld = CFG.scrollSpeed * dt;
  worldX  += dxWorld;
  scrollX += dxWorld;

  // Spawns por distancia
  spawnByDistance();

  // Movimiento lateral del jugador (independiente del scroll)
  let dir = 0;
  if(keys.ArrowLeft || keys.a)  dir -= 1;
  if(keys.ArrowRight|| keys.d)  dir += 1;
  player.x = clamp(player.x + dir * CFG.playerSpeed * dt, 16, W*0.55);

  // “Coyote time” & salto
  if(player.onGround) player.coyote = CFG.coyote;
  else player.coyote = Math.max(0, player.coyote - dt);

  const wantJump = (keys.ArrowUp || keys.w);
  if(wantJump && player.coyote > 0){
    player.vy = CFG.jump;
    player.onGround = false;
    player.coyote = 0;
  }

  // Gravedad
  player.vy += CFG.gravity * dt;
  player.y  += player.vy * dt;
  if(player.y + player.h >= GROUND_Y){
    player.y = GROUND_Y - player.h;
    player.vy = 0;
    player.onGround = true;
  }

  // Disparo
  if(keys.Space && player.canShoot && power >= CFG.beamCost){
    player.canShoot = false;
    power -= CFG.beamCost;
    beams.push({ x: player.x + player.w - 6, y: player.y + 12, w: 34, h: 8 });
    if(SFX.beam){ SFX.beam.currentTime=0; SFX.beam.play(); }
    setTimeout(()=>player.canShoot=true, 180);
  }

  // Mover entidades hacia la izquierda por el scroll
  function moveLeft(list){
    for(let i=list.length-1;i>=0;i--){
      list[i].x -= dxWorld;
      if(list[i].x + (list[i].w||0) < -60) list.splice(i,1);
    }
  }
  moveLeft(zombies); moveLeft(coins); moveLeft(pCoins); moveLeft(tombs);

  // Beams (se mueven a la derecha)
  for(let i=beams.length-1;i>=0;i--){
    beams[i].x += CFG.beamSpeed * dt;
    if(beams[i].x > W + 60) beams.splice(i,1);
  }

  // Colisiones beam con tumba (bloquea disparo)
  for(let i=beams.length-1;i>=0;i--){
    const b = beams[i];
    let blocked=false;
    for(const t of tombs){
      if(aabb(b,t)){ blocked=true; break; }
    }
    if(blocked){ beams.splice(i,1); continue; }

    // Con zombies
    for(let j=zombies.length-1;j>=0;j--){
      const z=zombies[j];
      if(z.alive && aabb(b,z)){
        zombies.splice(j,1);
        beams.splice(i,1);
        score += 100;
        if(SFX.die){ SFX.die.currentTime=0; SFX.die.play(); }
        break;
      }
    }
  }

  // Colisiones jugador con zombies
  for(let i=zombies.length-1;i>=0;i--){
    const z=zombies[i];
    if(aabb(player,z)){
      zombies.splice(i,1);
      lives--;
      if(lives<=0) return gameOver();
    }
  }

  // Colisiones jugador con tumbas
  for(let i=tombs.length-1;i>=0;i--){
    const t=tombs[i];
    if(aabb(player,t)){
      // empujar un poco y dañar
      player.x = t.x - player.w - 2;
      lives--;
      if(lives<=0) return gameOver();
    }
  }

  // Monedas
  for(let i=coins.length-1;i>=0;i--){
    if(aabb(player, coins[i])){
      coins.splice(i,1);
      score += 50;
      if(SFX.coin){ SFX.coin.currentTime=0; SFX.coin.play(); }
    }
  }
  for(let i=pCoins.length-1;i>=0;i--){
    if(aabb(player, pCoins[i])){
      pCoins.splice(i,1);
      score += 150;
      power = Math.min(CFG.powerMax, power + 35);
      if(SFX.power){ SFX.power.currentTime=0; SFX.power.play(); }
    }
  }

  // Puntos por distancia
  score += Math.floor(dxWorld * 0.25);

  draw();
  requestAnimationFrame(tick);
}

/* ================== RENDER ================== */
function drawTiled(img, y, ratio){
  if(!img) return;
  const sw = img.width, sh = img.height;
  const speedOffset = (scrollX * ratio) % sw;
  let x = -speedOffset;
  while(x < W){
    CTX.drawImage(img, x, y, sw, sh);
    x += sw;
  }
}
function draw(){
  // Fondo estático
  if(IMG.bg) CTX.drawImage(IMG.bg, 0, 0, W, H);

  // Parallax back→front
  if(IMG.middle){
    const y = Math.round(GROUND_Y - IMG.middle.height - 60);
    drawTiled(IMG.middle, y, R_MIDDLE);
  }
  if(IMG.fog){
    const y = Math.round(GROUND_Y - IMG.fog.height + 24);
    CTX.globalAlpha = 0.92;
    drawTiled(IMG.fog, y, R_FOG);
    CTX.globalAlpha = 1;
  }
  if(IMG.ground){
    const y = Math.round(GROUND_Y - IMG.ground.height + 8);
    drawTiled(IMG.ground, y, R_GROUND);
  }

  // Obstáculos (usar drawW/drawH centrados sobre su hitbox)
  for(const t of tombs){
    const im = IMG[t.sprite==='mausoleum'?'mausoleum':'tomb'];
    if(im){
      const dx = t.x + (t.w - t.drawW)/2;
      const dy = GROUND_Y - t.drawH;
      CTX.drawImage(im, dx, dy, t.drawW, t.drawH);
    }else{
      CTX.fillStyle='#445'; CTX.fillRect(t.x,t.y,t.w,t.h);
    }
  }

  // Monedas
  for(const c of coins)      IMG.coin        && CTX.drawImage(IMG.coin, c.x, c.y, c.w, c.h);
  for(const c of pCoins)     IMG.coinSpecial && CTX.drawImage(IMG.coinSpecial, c.x, c.y, c.w, c.h);

  // Zombies
  for(const z of zombies)    IMG.zombie && CTX.drawImage(IMG.zombie, z.x, z.y, z.w, z.h);

  // Beams
  CTX.fillStyle = '#6cf';
  for(const b of beams){
    // if(IMG.beamFX) CTX.drawImage(IMG.beamFX,b.x,b.y,b.w,b.h); else
    CTX.fillRect(b.x, b.y, b.w, b.h);
  }

  // Player
  if(IMG.player) CTX.drawImage(IMG.player, player.x, player.y, player.w, player.h);

  // HUD
  drawHUD();
}

function drawHUD(){
  // caja score
  CTX.fillStyle='rgba(0,0,0,.75)';
  CTX.fillRect(12,12, 380, 72);
  CTX.fillStyle='#fff';
  CTX.font='28px system-ui, sans-serif';
  CTX.textAlign='left';
  CTX.fillText(`Score: ${score}`, 24, 45);
  CTX.fillText(`Best:  ${best}`, 24, 75);

  // corazones
  const HEART=IMG.heart, hx=420, hy=22, gap=36, size=28;
  for(let i=0;i<3;i++){
    CTX.globalAlpha = i<lives ? 1 : 0.25;
    if(HEART) CTX.drawImage(HEART, hx+i*gap, hy, size, size);
    else { CTX.beginPath(); CTX.fillStyle=i<lives?'#f55':'#555';
      CTX.arc(hx+i*gap+size/2, hy+size/2, 8, 0, Math.PI*2); CTX.fill(); }
    CTX.globalAlpha=1;
  }

  // barra de poder
  const bx=420, by=60, bw=300, bh=10;
  CTX.fillStyle='#333'; CTX.fillRect(bx,by,bw,bh);
  CTX.fillStyle='#5ab0ff'; CTX.fillRect(bx,by,(power/CFG.powerMax)*bw,bh);
}

/* ================= GAME FLOW ================= */
function gameOver(){
  if(SFX.over) SFX.over.play();
  best = Math.max(best, score);
  localStorage.setItem('dh_best', String(best));

  zombies.length=0; coins.length=0; pCoins.length=0; tombs.length=0; beams.length=0;
  worldX=0; scrollX=0; score=0; power=0; lives=3;
  player.x = Math.round(W*0.12); player.y=GROUND_Y-player.h; player.vy=0; player.onGround=true; player.coyote=0;
  resetSpawnTargets();
}

/* =================== BOOT ==================== */
(async function boot(){
  await Promise.all(Object.entries(SPRITES).map(([k,src])=>loadImage(k,src)));
  loadAudio('coin',  SOUNDS.coin);
  loadAudio('power', SOUNDS.power);
  loadAudio('beam',  SOUNDS.beam, false, 0.8);
  loadAudio('die',   SOUNDS.die);
  loadAudio('over',  SOUNDS.over);
  loadAudio('music', SOUNDS.music, true, 0.35);
  SFX.music?.play?.();

  resetSpawnTargets();
  lastTime = performance.now();
  requestAnimationFrame(tick);
})();
