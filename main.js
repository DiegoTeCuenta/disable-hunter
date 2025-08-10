/* =========================================================
   Disabled Hunter — Runner (parallax + shoot)
   main.js — FULL REPLACEMENT
   ========================================================= */

/* ---------- CONFIG (mantengo tus valores) ---------- */
const CFG = {
  // Velocidad base del scroll (px por segundo)
  scrollSpeed: 150,          // <- tu valor
  scrollAccelEachSec: 0,

  // Movimiento del jugador
  playerSpeed: 300,          // lateral (px/s)
  jump: -950,                // fuerza salto
  gravity: 2200,             // gravedad
  coyote: 0.18,              // “coyote time”

  // Spawns (distancia en px de mundo)
  gaps: {
    coin:  [280, 520],
    spec:  [1600, 2400],
    zom:   [900, 1300],
    obst:  [1100, 1700],
    obstChance: 0.55
  },

  // HUD / poder
  powerMax: 100,
  beamCost: 20,
  beamSpeed: 900,

  // Obstáculos (hitbox vs dibujo)
  obst: { hitW: 65, hitH: 50, drawW: 112, drawH: 112 },

  // Vidas
  maxLives: 3
};

/* ---------- Canvas y contexto ---------- */
const CANVAS = document.getElementById('game');
const CTX     = CANVAS.getContext('2d');
const W = CANVAS.width;
const H = CANVAS.height;

/* ---------- Carga de assets ---------- */
const IMG = {};
const SFX = {};

function loadImage(name, src) {
  return new Promise(res=>{
    const im = new Image();
    im.src = src;
    im.onload = ()=>{ IMG[name] = im; res(); };
  });
}
function loadAudio(name, src, vol=1) {
  const a = new Audio(src);
  a.volume = vol;
  SFX[name] = a;
}

async function loadAll() {
  // Fondo fijo + capas parallax
  await loadImage('bg', 'assets/tiles/bg_static_1920x1080.png');
  await loadImage('mid', 'assets/tiles/tile_middleok.png');     // 960x540
  await loadImage('fog', 'assets/tiles/tile_fog.png');
  await loadImage('gnd', 'assets/tiles/tile_ground_soft.png');

  // Entidades
  await loadImage('player', 'player.png');
  await loadImage('zombie', 'zombie.png');
  await loadImage('coin', 'coin.png');
  await loadImage('coinS', 'coin_special.png');
  await loadImage('tomb', 'assets/tiles/tile_tomb_1x1.png');
  await loadImage('maus', 'assets/tiles/tile_mausoleum_1x1.png');

  // UI
  await loadImage('heart', 'assets/ui/ui_heart_32.png');

  // Sonidos
  loadAudio('coin','sfx_coin.wav',0.6);
  loadAudio('power','sfx_power.wav',0.6);
  loadAudio('beam','sfx_beam.wav',0.6);
  loadAudio('die','sfx_zombie_die.wav',0.6);
  loadAudio('over','sfx_gameover.wav',0.7);
}

/* ---------- Estado de juego ---------- */
let scrollX = 0;
let distSince = { coin:0, spec:0, zom:0, obst:0 };
let score = 0, best = +(localStorage.getItem('dh_best')||0);

const player = {
  x: W*0.18, y: 0, w: 48, h: 72,
  vx: 0, vy: 0,
  onGround: false,
  coyoteT: 0,
  lives: CFG.maxLives,
  invul: 0,
  power: CFG.powerMax*0.5
};

const coins = [];     // {x,y,isSpec}
const zombies = [];   // {x,y,w,h,alive}
const obsts = [];     // {x,y,w,h,kind:'tomb'|'maus'}
const beams = [];     // {x,y,w,h,vx}

let running = true;
let gameOver = false;

/* ---------- Helpers ---------- */
function rint(min,max){ return Math.floor(min + Math.random()*(max-min)); }
function chance(p){ return Math.random() < p; }

function rects(a,b){
  return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
}

/* ---------- Inputs ---------- */
const keys = {};
window.addEventListener('keydown', e=>{
  if (gameOver && e.key === 'Enter'){ restart(); return; }

  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();

  keys[e.key] = true;
});
window.addEventListener('keyup', e=>{ keys[e.key] = false; });

/* ---------- Spawns ---------- */
function spawnCoin(spec=false){
  const baseY = groundTop() - 40; // línea de moneda
  const varY  = spec ? -30 : rint(-20, 25);
  coins.push({ x: W + rint(0, 120), y: baseY + varY, w: 28, h:28, isSpec: spec });
}
function spawnZombie(){
  const zy = groundTop() - 60;
  zombies.push({ x: W+rint(0,40), y: zy, w: 52, h: 68, alive:true });
}
function spawnObst(){
  const useMaus = chance(0.4);
  const w = CFG.obst.drawW, h = CFG.obst.drawH;
  const y = groundTop() - h + 8;
  obsts.push({ x: W+rint(0,40), y, w, h, kind: useMaus?'maus':'tomb' });
}

/* ---------- Parallax placement (ajusta aquí si quieres) ---------- */
const Y_MIDDLE = H*0.46; // centro visual de la capa media
const Y_FOG    = H*0.62; // niebla un poco más abajo
const Y_GROUND = H*0.70; // línea de baldosas “suelo”

function groundTop(){
  // borde superior del “suelo” donde pisan cosas
  return Y_GROUND - 48; // 48 = espesor visual del tile_ground
}

/* ---------- Update ---------- */
function update(dt){
  if (!running) return;

  // velocidad horizontal de mundo
  const vScroll = CFG.scrollSpeed; // sin aceleración (la dejaste en 0)
  scrollX += vScroll * dt;

  // distancias acumuladas para spawns
  for (const k in distSince) distSince[k] += vScroll * dt;

  if (distSince.coin > rint(CFG.gaps.coin[0], CFG.gaps.coin[1])){
    distSince.coin = 0;
    spawnCoin(false);
  }
  if (distSince.spec > rint(CFG.gaps.spec[0], CFG.gaps.spec[1])){
    distSince.spec = 0;
    spawnCoin(true);
  }
  if (distSince.zom > rint(CFG.gaps.zom[0], CFG.gaps.zom[1])){
    distSince.zom = 0;
    spawnZombie();
  }
  if (distSince.obst > rint(CFG.gaps.obst[0], CFG.gaps.obst[1])){
    distSince.obst = 0;
    if (chance(CFG.gaps.obstChance)) spawnObst();
  }

  // INPUT mover / saltar / disparar
  player.vx = 0;
  if (keys['ArrowLeft'] || keys['a'])  player.vx = -CFG.playerSpeed;
  if (keys['ArrowRight']|| keys['d'])  player.vx =  CFG.playerSpeed;

  // salto con coyote
  player.coyoteT = player.onGround ? CFG.coyote : Math.max(0, player.coyoteT - dt);
  const wantJump = (keys['ArrowUp']||keys['w']);
  if (wantJump && (player.onGround || player.coyoteT>0)){
    player.vy = CFG.jump;
    player.onGround = false;
    player.coyoteT = 0;
  }

  // disparo
  if (keys[' '] && player.power >= CFG.beamCost){
    keys[' '] = false; // para evitar ráfaga al mantener
    player.power -= CFG.beamCost;
    SFX.beam.currentTime=0; SFX.beam.play();
    beams.push({
      x: player.x + player.w - 8,
      y: player.y + 10,
      w: 42, h: 10,
      vx: CFG.beamSpeed
    });
  }

  // físicas jugador
  player.vy += CFG.gravity * dt;
  player.x += player.vx * dt;
  player.y += player.vy * dt;

  // suelo “virtual”
  const gy = groundTop() - player.h;
  if (player.y >= gy){
    player.y = gy;
    player.vy = 0;
    player.onGround = true;
  } else {
    player.onGround = false;
  }

  // límites laterales
  player.x = Math.max(16, Math.min(player.x, W - 80));

  // invulnerabilidad
  player.invul = Math.max(0, player.invul - dt);

  // mover entidades a la izquierda y manejar colisiones
  const leftKill = -160;

  // BEAMS
  for (let i=beams.length-1; i>=0; i--){
    const b = beams[i];
    b.x += b.vx * dt;

    // bloquear por obstáculos
    for (const o of obsts){
      if (rects(b, o)){ beams.splice(i,1); break; }
    }
    if (!beams[i]) continue;

    // golpear zombies
    for (const z of zombies){
      if (z.alive && rects(b,z)){
        z.alive = false;
        score += 150;
        SFX.die.currentTime=0; SFX.die.play();
        beams.splice(i,1);
        break;
      }
    }
    if (beams[i] && b.x > W+120) beams.splice(i,1);
  }

  // ZOMBIES
  for (let i=zombies.length-1; i>=0; i--){
    const z = zombies[i];
    z.x -= vScroll * dt * 0.98; // se mueven casi al ritmo del mundo

    // colisión con jugador
    if (z.alive && rects(z, player) && player.invul<=0){
      player.lives--;
      player.invul = 1.0;
      if (player.lives<=0) triggerGameOver();
    }

    if (z.x < leftKill) zombies.splice(i,1);
  }

  // OBSTÁCULOS (no desaparecen por chocar; se retiran solo al salir de pantalla)
  for (let i=obsts.length-1; i>=0; i--){
    const o = obsts[i];
    o.x -= vScroll * dt;

    // hitbox vs jugador
    const box = { x:o.x + (o.w-CFG.obst.hitW)/2, y:o.y + (o.h-CFG.obst.hitH), w:CFG.obst.hitW, h:CFG.obst.hitH };
    const pj  = { x:player.x, y:player.y, w:player.w, h:player.h };
    if (rects(box,pj) && player.invul<=0){
      player.lives--;
      player.invul = 1.0;
      if (player.lives<=0) triggerGameOver();
    }

    if (o.x < leftKill) obsts.splice(i,1);
  }

  // COINS
  for (let i=coins.length-1; i>=0; i--){
    const c = coins[i];
    c.x -= vScroll * dt;

    const pj = { x:player.x, y:player.y, w:player.w, h:player.h };
    if (rects(c,pj)){
      if (c.isSpec){
        player.power = Math.min(CFG.powerMax, player.power + 40);
        SFX.power.currentTime=0; SFX.power.play();
        score += 100;
      } else {
        SFX.coin.currentTime=0; SFX.coin.play();
        score += 25;
      }
      coins.splice(i,1);
      continue;
    }
    if (c.x < leftKill) coins.splice(i,1);
  }

  // puntaje “por distancia”
  score += Math.floor(40*dt);
  if (score>best) best=score, localStorage.setItem('dh_best', best);
}

/* ---------- Render ---------- */
function drawTiled(img, y, offsetX){
  // dibuja img repetida en X, con desplazamiento offsetX
  const iw = img.width, ih = img.height;
  const scale = (iw === 960 && ih === 540) ? 2 : 1; // tile_middleok es 960x540 → 2x para 1920x1080

  const drawW = iw*scale;
  const start = -((offsetX % drawW) + drawW) % drawW;

  for (let x=start; x<W+drawW; x+=drawW){
    CTX.drawImage(img, x, y - ih*scale, drawW, ih*scale);
  }
}

function render(){
  // Fondo fijo (cubre canvas completo)
  CTX.drawImage(IMG.bg, 0,0, 1920,1080, 0,0, W,H);

  // Parallax (scrollX * factor)
  drawTiled(IMG.mid,  Y_MIDDLE, scrollX*0.35);
  drawTiled(IMG.fog,  Y_FOG,    scrollX*0.6);
  drawTiled(IMG.gnd,  Y_GROUND, scrollX*1.0);

  // Obstáculos
  for (const o of obsts){
    const im = o.kind==='maus'? IMG.maus : IMG.tomb;
    CTX.drawImage(im, o.x, o.y, o.w, o.h);
  }

  // Zombies
  for (const z of zombies){
    if (!z.alive) continue;
    CTX.drawImage(IMG.zombie, z.x, z.y, z.w, z.h);
  }

  // Coins
  for (const c of coins){
    CTX.drawImage(c.isSpec?IMG.coinS:IMG.coin, c.x, c.y, c.w, c.h);
  }

  // Player (blink si invulnerable)
  if (player.invul<=0 || (Math.floor(performance.now()/100)%2===0)){
    CTX.drawImage(IMG.player, player.x, player.y, player.w, player.h);
  }

  // Beams
  CTX.fillStyle = '#8fd1ff';
  for (const b of beams){ CTX.fillRect(b.x, b.y+12, b.w, 6); }

  // HUD
  drawHUD();

  if (gameOver) drawGameOver();
}

function drawHUD(){
  // panel score
  CTX.fillStyle='rgba(0,0,0,.75)';
  CTX.fillRect(16,16, 520,116);
  CTX.fillStyle='#fff';
  CTX.font='48px system-ui, -apple-system, Segoe UI, Roboto';
  CTX.fillText(`Score: ${score|0}`, 32, 64);
  CTX.fillText(`Best: ${best|0}`, 32, 112);

  // power bar
  const bx=560, by=46, bw= W*0.35, bh=16;
  CTX.fillStyle='rgba(40,40,40,.85)';
  CTX.fillRect(bx,by,bw,bh);
  const pc = Math.max(0, Math.min(1, player.power/CFG.powerMax));
  CTX.fillStyle='#6fb7ff';
  CTX.fillRect(bx,by,bw*pc,bh);

  // hearts
  const hx = 560, hy = 22;
  for (let i=0;i<CFG.maxLives;i++){
    const tint = i < player.lives ? 1 : 0.25;
    CTX.globalAlpha = tint;
    CTX.drawImage(IMG.heart, hx + i*36, hy, 28, 28);
    CTX.globalAlpha = 1;
  }
}

function drawGameOver(){
  CTX.fillStyle='rgba(0,0,0,.65)';
  CTX.fillRect(0,0,W,H);
  CTX.fillStyle='#fff';
  CTX.font='64px system-ui, -apple-system, Segoe UI, Roboto';
  CTX.textAlign='center';
  CTX.fillText('Disabled Hunter', W/2, H/2 - 40);
  CTX.font='28px system-ui, -apple-system, Segoe UI, Roboto';
  CTX.fillText(`Score: ${score|0}   Best: ${best|0}`, W/2, H/2 + 10);
  CTX.fillText('Press ENTER to restart', W/2, H/2 + 50);
  CTX.textAlign='left';
}

/* ---------- Game Over / Restart ---------- */
function triggerGameOver(){
  if (gameOver) return;
  gameOver = true;
  running  = false;
  SFX.over.currentTime=0; SFX.over.play();
}
function restart(){
  // limpiar arrays
  coins.length=0; zombies.length=0; obsts.length=0; beams.length=0;
  scrollX=0; for (const k in distSince) distSince[k]=0;
  score=0; player.x=W*0.18; player.vx=player.vy=0;
  player.y=groundTop()-player.h; player.onGround=true;
  player.power = CFG.powerMax*0.5;
  player.lives = CFG.maxLives; player.invul=0;
  gameOver=false; running=true;
}

/* ---------- Loop ---------- */
let last=0;
function loop(ts){
  const dt = Math.min(0.033, (ts-last)/1000 || 0.016);
  last = ts;

  update(dt);
  render();
  requestAnimationFrame(loop);
}

/* ---------- Arranque ---------- */
(async function init(){
  await loadAll();
  // Colocar player sobre “suelo”
  player.y = groundTop() - player.h;
  player.onGround = true;

  requestAnimationFrame(loop);
})();
