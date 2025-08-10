// ====== CONFIG BÁSICA ======
const CANVAS_ID = "game";
const canvas = document.getElementById(CANVAS_ID);
const ctx = canvas.getContext("2d");

function resize() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

// ====== UTIL ======
const rand = (a,b)=>Math.random()*(b-a)+a;
const chance = p => Math.random() < p;

// ====== CAPAS / ASSETS ======
function loadImg(src){
  const i = new Image();
  i.src = src;
  return i;
}

// Parallax (tiras que se repiten en X)
const imgMid  = loadImg("assets/tiles/tile_middleok.png");
const imgFog  = loadImg("assets/tiles/tile_fog.png");
const imgGnd  = loadImg("assets/tiles/tile_ground_soft.png");

// Personajes / objetos
const imgPlayer = loadImg("assets/player.png");
const imgZombie = loadImg("assets/zombie.png");
const imgCoin   = loadImg("assets/coin.png");
const imgCoinS  = loadImg("assets/coin_special.png");
const imgPuff   = loadImg("assets/fx/fx_zombie_puff_64.png");

// Obstáculos (nuevo)
const imgTomb       = loadImg("assets/tiles/tile_tomb_1x1.png");
const imgMausoleum  = loadImg("assets/tiles/tile_mausoleum_1x1.png");

// ====== SONIDO (opcional) ======
let music;
try {
  music = new Audio("assets/music.mp3");
  music.loop = true;
} catch { /* opcional */ }

// ====== ESTADO ======
const state = {
  started   : false,
  gameOver  : false,
  score     : 0,
  best      : 0,
  lives     : 3,

  // jugador
  p: {
    x: 140, y: 0, w: 64, h: 64,
    vy: 0, gravity: 1.25,
    jumpPower: -19,          // salto suficiente
    onGround: true,
    invul: 0
  },

  // scroll
  speed: 6.5,

  // grupos
  zombies: [],
  coins: [],
  puffs: [],
  obstacles: [],

  // timers
  tZombie: 0,
  tCoin: 0,
  tSpec: 0,
  tObs: 0
};

const GROUND_H = 120;
const groundY = () => canvas.height - GROUND_H;

// ====== INICIO / REINICIO ======
function resetPlayer() {
  state.p.y = groundY() - state.p.h;
  state.p.vy = 0;
  state.p.onGround = true;
  state.p.invul = 0.9; // “grace period”
}

function startGame() {
  state.lives = 3;
  state.score = 0;
  state.started = true;
  state.gameOver = false;
  state.zombies.length = 0;
  state.coins.length = 0;
  state.puffs.length = 0;
  state.obstacles.length = 0;
  state.tZombie = state.tCoin = state.tSpec = state.tObs = 0;
  resetPlayer();
  if (music) music.play().catch(()=>{});
}

function restartGame() {
  startGame();
}

// ====== INPUT ======
const keys = new Set();
window.addEventListener("keydown", e=>{
  keys.add(e.code);
  if (e.code === "Enter") {
    if (!state.started || state.gameOver) startGame();
  }
});
window.addEventListener("keyup", e=>keys.delete(e.code));

// ====== SPAWN ======
function spawnZombie(){
  state.zombies.push({
    x: canvas.width + rand(0, 300),
    y: groundY() - 64,
    w: 64, h: 64,
    speed: state.speed + rand(0, 1.5)
  });
}
function spawnCoin(special=false){
  state.coins.push({
    x: canvas.width + rand(0, 300),
    y: groundY() - 64 - rand(0, 30),
    w: 44, h: 44,
    special
  });
}
function spawnPuff(x,y){
  state.puffs.push({ x, y, frame: 0, frames: 10 });
}
function spawnObstacle(){
  // Alternar aleatorio entre tumba y mausoleo
  const useMausoleum = chance(0.5);
  const img = useMausoleum ? imgMausoleum : imgTomb;

  // Tamaño base 96x96 para hitbox amable; imagen se dibuja a 128
  const W = 96, H = 96;
  state.obstacles.push({
    x: canvas.width + rand(0, 250),
    y: groundY() - H,
    w: W, h: H,
    drawW: 128, drawH: 128,
    img
  });
}

// ====== COLISION ======
function overlaps(a,b){
  return a.x < b.x + b.w &&
         a.x + a.w > b.x &&
         a.y < b.y + b.h &&
         a.y + a.h > b.y;
}

// ====== UPDATE ======
function update(dt){
  if (!state.started || state.gameOver) return;

  // Input salto
  if ((keys.has("Space") || keys.has("ArrowUp") || keys.has("KeyW") || keys.has("KeyS") || keys.has("KeyZ")) && state.p.onGround){
    state.p.vy = state.p.jumpPower;
    state.p.onGround = false;
  }

  // Física
  state.p.vy += state.p.gravity;
  state.p.y  += state.p.vy;
  if (state.p.y >= groundY() - state.p.h){
    state.p.y = groundY() - state.p.h;
    state.p.vy = 0;
    state.p.onGround = true;
  }
  if (state.p.invul > 0) state.p.invul -= dt;

  // Timers spawn
  state.tZombie += dt;
  state.tCoin   += dt;
  state.tSpec   += dt;
  state.tObs    += dt;

  if (state.tZombie > 0.85) { state.tZombie = 0; spawnZombie(); }
  if (state.tCoin   > 0.45) { state.tCoin   = 0; spawnCoin(false); }
  if (state.tSpec   > 2.50) { state.tSpec   = 0; spawnCoin(true); }
  if (state.tObs    > 1.40) {
    state.tObs = 0;
    if (chance(0.5)) spawnObstacle(); // ~50% de veces
  }

  // Zombies
  for (let i=state.zombies.length-1;i>=0;i--){
    const z = state.zombies[i];
    z.x -= z.speed;
    if (z.x + z.w < 0) { state.zombies.splice(i,1); continue; }

    // hitbox amable del zombie
    const hb = { x:z.x+10, y:z.y+10, w:z.w-20, h:z.h-20 };
    if (!state.p.invul && overlaps({x:state.p.x,y:state.p.y,w:state.p.w,h:state.p.h}, hb)){
      state.lives--;
      state.p.invul = 1;
      spawnPuff(z.x, z.y);
      state.zombies.splice(i,1);
      if (state.lives <= 0){
        state.gameOver = true;
        if (state.score > state.best) state.best = state.score;
      }
    }
  }

  // Obstáculos (tumba/mausoleo)
  for (let i=state.obstacles.length-1;i>=0;i--){
    const o = state.obstacles[i];
    o.x -= state.speed;
    if (o.x + o.w < 0) { state.obstacles.splice(i,1); continue; }
    if (!state.p.invul && overlaps({x:state.p.x,y:state.p.y,w:state.p.w,h:state.p.h}, o)){
      state.lives--;
      state.p.invul = 1;
      spawnPuff(o.x, o.y);
      state.obstacles.splice(i,1);
      if (state.lives <= 0){
        state.gameOver = true;
        if (state.score > state.best) state.best = state.score;
      }
    }
  }

  // Monedas
  for (let i=state.coins.length-1;i>=0;i--){
    const c = state.coins[i];
    c.x -= state.speed;
    if (c.x + c.w < 0) { state.coins.splice(i,1); continue; }
    if (overlaps({x:state.p.x,y:state.p.y,w:state.p.w,h:state.p.h}, c)){
      state.score += c.special ? 150 : 25;
      state.coins.splice(i,1);
    }
  }

  // Puffs
  for (let i=state.puffs.length-1;i>=0;i--){
    const p = state.puffs[i];
    p.frame += 1;
    if (p.frame > p.frames) state.puffs.splice(i,1);
  }
}

// ====== DRAW HELPERS ======
function drawTiledImage(img, y, speedMul, alpha=1){
  if (!img.complete) return;
  const imgW = img.width;
  const scale = 1; // usamos tal cual fue exportado
  const h = img.height * scale;
  const w = imgW * scale;

  // offset scroll
  drawTiledImage._offs = drawTiledImage._offs || {};
  drawTiledImage._offs[img.src] = (drawTiledImage._offs[img.src] || 0) - state.speed*speedMul;
  const off = drawTiledImage._offs[img.src] % w;

  ctx.save();
  ctx.globalAlpha = alpha;
  for (let x = off; x < canvas.width + w; x += w){
    ctx.drawImage(img, x, y, w, h);
  }
  ctx.restore();
}

// ====== RENDER ======
function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  // fondo
  ctx.fillStyle = "#0a0d12";
  ctx.fillRect(0,0,canvas.width,canvas.height);

  // capas parallax
  const midY = groundY() - 220;
  drawTiledImage(imgMid, midY, 0.25, 0.5);
  drawTiledImage(imgFog, groundY()-180, 0.45, 0.9);
  drawTiledImage(imgGnd, groundY()-imgGnd.height, 1.00, 1.0);

  // monedas
  for (const c of state.coins){
    ctx.drawImage(c.special?imgCoinS:imgCoin, c.x, c.y, c.w, c.h);
  }

  // obstáculos (dibujamos la imagen completa 128x128 para ver bonita, hitbox es 96)
  for (const o of state.obstacles){
    const drawX = o.x - (o.drawW - o.w)/2;
    const drawY = o.y - (o.drawH - o.h);
    ctx.drawImage(o.img, drawX, drawY, o.drawW, o.drawH);
  }

  // zombies
  for (const z of state.zombies){
    ctx.drawImage(imgZombie, z.x, z.y, z.w, z.h);
  }

  // puffs
  for (const p of state.puffs){
    ctx.globalAlpha = 1 - (p.frame / p.frames);
    ctx.drawImage(imgPuff, p.x, p.y, 64, 64);
    ctx.globalAlpha = 1;
  }

  // player (parpadeo si invulnerable)
  if (state.p.invul > 0) {
    ctx.globalAlpha = 0.6;
  }
  ctx.drawImage(imgPlayer, state.p.x, state.p.y, state.p.w, state.p.h);
  ctx.globalAlpha = 1;

  // HUD
  ctx.fillStyle = "rgba(0,0,0,.55)";
  ctx.fillRect(16,16, 370, 90);
  ctx.fillStyle = "#fff";
  ctx.font = "28px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
  ctx.fillText(`Score: ${state.score}`, 28, 50);
  ctx.fillText(`Best:  ${state.best}`, 28, 86);

  // vidas
  for (let i=0;i<3;i++){
    ctx.beginPath();
    ctx.arc(410 + i*26, 36, 9, 0, Math.PI*2);
    ctx.fillStyle = i < state.lives ? "#ff5566" : "#666";
    ctx.fill();
  }

  // barra “poder” (decorativa por ahora)
  const barMax = 240, barX = 450, barY = 28;
  ctx.fillStyle = "#333";
  ctx.fillRect(barX, barY, barMax, 10);
  ctx.fillStyle = "#58a6ff";
  ctx.fillRect(barX, barY, Math.min(barMax, state.score*0.01), 10);

  if (!state.started || state.gameOver){
    ctx.fillStyle = "rgba(0,0,0,.6)";
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.font = "bold 42px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
    ctx.fillText(state.gameOver? "Game Over" : "Disabled Hunter", canvas.width/2, canvas.height/2 - 20);
    ctx.font = "24px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
    ctx.fillText("Enter: Start/Restart   •   Space/↑: Jump", canvas.width/2, canvas.height/2 + 20);
    ctx.textAlign = "left";
  }
}

// ====== LOOP ======
let last = performance.now();
function loop(now){
  const dt = Math.min(0.033, (now - last)/1000); // máx ~30ms
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
