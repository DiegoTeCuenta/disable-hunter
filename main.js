/* ====================== CONFIG QUE PEDISTE ====================== */
const CFG = {
  // Scroll
  scrollSpeed: 150,     // antes 220 (~ -15%)
  scrollAccelEachSec: 0,

  // Player
  playerSpeed: 300,
  jump: -950,
  gravity: 2200,
  coyote: 0.18,

  // Spawns (distancia en px de mundo entre apariciones)
  gaps: {
    coin:  [280, 520],
    spec:  [1600, 2400],
    zom:   [900, 1300],
    obst:  [1100, 1700],
    obstChance: 0.55
  },

  // HUD / combate
  powerMax: 100,
  beamCost: 20,
  beamSpeed: 900,

  // Obstáculos (hitbox vs dibujo)
  obst: { hitW: 65, hitH: 50, drawW: 112, drawH: 112 }
};

/* ====================== CONSTANTES BÁSICAS ====================== */
const CANVAS = document.getElementById('game');
const CTX = CANVAS.getContext('2d', { alpha: false });

function resizeCanvas(){
  CANVAS.width  = Math.floor(window.innerWidth);
  CANVAS.height = Math.floor(window.innerHeight);
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

const W = () => CANVAS.width;
const H = () => CANVAS.height;

/* ====================== ASSETS ====================== */
const IMG = {};
const SFX = {};

const IMAGES_TO_LOAD = {
  bg:   'assets/tiles/bg_static_1920x1080.png',
  gnd:  'assets/tiles/tile_ground_soft.png',
  mid:  'assets/tiles/tile_middleok.png',
  fog:  'assets/tiles/tile_fog.png',

  player: 'assets/player.png',
  zombie: 'assets/zombie.png',
  coin:   'assets/coin.png',
  coinS:  'assets/coin_special.png', // opcional
  heart:  'assets/ui/ui_heart_32.png',

  tomb: 'assets/tiles/tile_tomb_1x1.png',
  maus: 'assets/tiles/tile_mausoleum_1x1.png'
};

const SOUNDS_TO_LOAD = {
  music:  'assets/music.mp3',
  coin:   'assets/sfx_coin.wav',
  power:  'assets/sfx_power.wav',
  beam:   'assets/sfx_beam.wav',
  zdie:   'assets/sfx_zombie_die.wav',
  over:   'assets/sfx_gameover.wav'
};

function loadImages(dict){
  const entries = Object.entries(dict);
  return Promise.all(entries.map(([k,src]) =>
    new Promise(res=>{
      const im = new Image();
      im.onload = ()=>{ IMG[k]=im; res(); };
      im.onerror = ()=>{ console.warn('No carga img:', src); IMG[k]=null; res(); };
      im.src = src + '?v=R18'; // cache-busting
    })
  ));
}
function loadAudio(dict){
  const entries = Object.entries(dict);
  return Promise.all(entries.map(([k,src]) =>
    new Promise(res=>{
      const a = new Audio();
      a.oncanplaythrough = ()=>{ SFX[k]=a; res(); };
      a.onerror = ()=>{ console.warn('No carga sfx:', src); SFX[k]=null; res(); };
      a.src = src + '?v=R18';
      a.load();
    })
  ));
}
function play(name, vol=1){
  const a = SFX[name];
  if(!a) return;
  try{
    const c = a.cloneNode();
    c.volume = vol;
    c.play().catch(()=>{});
  }catch{}
}

/* ====================== UTILS ====================== */
const rnd = (min,max)=> min + Math.random()*(max-min);
const clamp=(v,a,b)=> Math.max(a,Math.min(b,v));

/* ====================== ESTADO DEL JUEGO ====================== */
let running=false, started=false;
let last=0, dt=0;
let worldX=0, scroll=0, score=0, best= +(localStorage.getItem('best')||0);
let lives=3, power=CFG.powerMax;

const player = {
  x: 160, y: 0, vx:0, vy:0,
  w:64, h:64,
  onGround:false,
  coyote:0
};
const coins=[], zombs=[], shots=[], obsts=[];

function resetRun(){
  running=false;
  worldX=0; scroll=0; score=0; power=CFG.powerMax; lives=3;
  coins.length=0; zombs.length=0; obsts.length=0; shots.length=0;

  // posiciones de spawn (siguiente “hito” de distancia)
  nextSpawn.coin = rnd(...CFG.gaps.coin);
  nextSpawn.spec = rnd(...CFG.gaps.spec);
  nextSpawn.zom  = rnd(...CFG.gaps.zom);
  nextSpawn.obst = rnd(...CFG.gaps.obst);

  // piso base
  player.vx=0; player.vy=0; player.y = groundY()-player.h; player.onGround=true; player.coyote=0;
}

const nextSpawn = { coin:0,spec:0,zom:0,obst:0 };

/* ====================== CONTROLES ====================== */
const keys={left:0,right:0,up:0,shoot:0};
window.addEventListener('keydown',e=>{
  if(e.repeat) return;
  if(e.code==='ArrowLeft')  keys.left=1;
  if(e.code==='ArrowRight') keys.right=1;
  if(e.code==='ArrowUp' || e.code==='Space') keys.up=1;
  if(e.code==='KeyX') keys.shoot=1;
});
window.addEventListener('keyup',e=>{
  if(e.code==='ArrowLeft')  keys.left=0;
  if(e.code==='ArrowRight') keys.right=0;
  if(e.code==='ArrowUp' || e.code==='Space') keys.up=0;
  if(e.code==='KeyX') keys.shoot=0;
});

/* ====================== GEOMETRÍA ====================== */
function groundY(){ return Math.round(H()*0.70); }     // línea del suelo para pies
function layerY(){  return Math.round(H()*0.62); }     // línea media (donde dibujamos objetos)

/* ====================== SPAWNS ====================== */
function trySpawns(){
  if(worldX>=nextSpawn.coin){
    spawnCoin(false);
    nextSpawn.coin = worldX + rnd(...CFG.gaps.coin);
  }
  if(worldX>=nextSpawn.spec){
    spawnCoin(true);
    nextSpawn.spec = worldX + rnd(...CFG.gaps.spec);
  }
  if(worldX>=nextSpawn.zom){
    spawnZombie();
    nextSpawn.zom = worldX + rnd(...CFG.gaps.zom);
  }
  if(worldX>=nextSpawn.obst){
    if(Math.random()<CFG.gaps.obstChance) spawnObst();
    nextSpawn.obst = worldX + rnd(...CFG.gaps.obst);
  }
}

function spawnCoin(special){
  coins.push({
    x: W()+120, y: layerY()-32 - rnd(0,40), r:18,
    special
  });
}
function spawnZombie(){
  zombs.push({
    x: W()+140, y: groundY()-64, w:56, h:64, vx:-80
  });
}
function spawnObst(){
  obsts.push({
    x: W()+150, y: groundY()-CFG.obst.drawH,
    w: CFG.obst.hitW, h: CFG.obst.hitH,
    type: (Math.random()<0.5?'tomb':'maus')
  });
}

/* ====================== UPDATE ====================== */
function update(dt){
  // scroll del mundo
  const spd = CFG.scrollSpeed;
  worldX += spd*dt;
  scroll  += spd*dt;

  trySpawns();

  // movimiento lateral del jugador
  player.vx = (keys.right-keys.left)*CFG.playerSpeed;

  // saltar (coyote time)
  if(keys.up && (player.onGround || player.coyote>0)){
    player.vy = CFG.jump;
    player.onGround=false;
    player.coyote=0;
  }
  keys.up=0; // salto por pulsación

  // gravedad
  player.vy += CFG.gravity*dt;

  // aplicar movimiento
  player.x += player.vx*dt;
  player.y += player.vy*dt;

  // suelo
  const gy = groundY()-player.h;
  if(player.y>=gy){
    player.y=gy;
    if(!player.onGround){
      player.onGround=true;
    }
    player.vy=0;
  }else{
    // aire
    if(player.onGround===true){
      player.onGround=false;
      player.coyote = CFG.coyote; // activar ventana
    }else{
      player.coyote = Math.max(0, player.coyote-dt);
    }
  }
  // límites horizontales
  player.x = clamp(player.x, 40, W()*0.7);

  // disparo
  if(keys.shoot && power>=CFG.beamCost){
    keys.shoot=0;
    power = Math.max(0, power-CFG.beamCost);
    shots.push({ x: player.x+56, y: player.y+28, vx: CFG.beamSpeed, life:1.2 });
    play('beam', .7);
  }

  // monedas
  for(let i=coins.length-1;i>=0;i--){
    const c = coins[i];
    c.x -= spd*dt; // se mueven con el mundo
    // recoger
    const dx = (player.x+32) - c.x, dy = (player.y+32) - c.y;
    if(dx*dx+dy*dy < (24*24)){
      score += c.special ? 200 : 50;
      if(c.special){ power = Math.min(CFG.powerMax, power+40); play('power', .9); }
      else play('coin', .6);
      coins.splice(i,1);
      continue;
    }
    if(c.x<-60) coins.splice(i,1);
  }

  // obstáculos
  for(let i=obsts.length-1;i>=0;i--){
    const o = obsts[i];
    o.x -= spd*dt;

    // colisión “caja baja” para que se sienta piso
    const left = o.x + (CFG.obst.drawW-CFG.obst.hitW)/2;
    const top  = o.y + (CFG.obst.drawH-CFG.obst.hitH);
    if (rectsOverlap(player.x,player.y,player.w,player.h, left,top,CFG.obst.hitW,CFG.obst.hitH)){
      hurt();
      obsts.splice(i,1);
      continue;
    }
    if(o.x<-150) obsts.splice(i,1);
  }

  // zombies
  for(let i=zombs.length-1;i>=0;i--){
    const z = zombs[i];
    // los zombis también “vienen con el mundo”
    z.x -= (spd*dt);

    // si hay lápida delante y el tiro pasa por ella, el zombi queda protegido (pared)
    // → manejado al dibujar/disparar

    // colisión con jugador
    if(rectsOverlap(player.x,player.y,player.w,player.h, z.x,z.y,z.w,z.h)){
      hurt();
      zombs.splice(i,1);
      continue;
    }
    if(z.x<-140) zombs.splice(i,1);
  }

  // disparos
  for(let i=shots.length-1;i>=0;i--){
    const s = shots[i];
    s.x += s.vx*dt;
    s.life -= dt;

    // si golpea un obstáculo, se destruye
    let blocked = false;
    for(const o of obsts){
      const left = o.x + (CFG.obst.drawW-CFG.obst.hitW)/2;
      const top  = o.y + (CFG.obst.drawH-CFG.obst.hitH);
      if(rectsOverlap(s.x-8, s.y-4, 16,8, left,top,CFG.obst.hitW,CFG.obst.hitH)){
        blocked = true; break;
      }
    }
    if(blocked || s.life<=0 || s.x>W()+40){
      shots.splice(i,1); continue;
    }

    // colisión con zombi
    for(let j=zombs.length-1;j>=0;j--){
      const z = zombs[j];
      if(rectsOverlap(s.x-8,s.y-4,16,8, z.x,z.y,z.w,z.h)){
        zombs.splice(j,1);
        shots.splice(i,1);
        score += 150;
        play('zdie', .7);
        break;
      }
    }
  }

  // subir score por avanzar
  score += Math.floor(spd*dt*0.3);

  // recarga pasiva de power
  power = clamp(power + 12*dt, 0, CFG.powerMax);
}

function rectsOverlap(ax,ay,aw,ah, bx,by,bw,bh){
  return ax<bx+bw && ax+aw>bx && ay<by+bh && ay+ah>by;
}

function hurt(){
  lives--;
  if(lives<=0){
    play('over', .8);
    best = Math.max(best, score);
    localStorage.setItem('best', best);
    showOverlay(`Score: ${score}<br/>Best: ${best}`, 'Restart');
  }
}

/* ====================== DRAW ====================== */
function draw(){
  // fondo estático (cover)
  if(IMG.bg){
    // escalado “cover”
    const ratio = IMG.bg.width/IMG.bg.height;
    const target = W()/H();
    let dw,dh,dx,dy;
    if(target>ratio){ dw = W(); dh = W()/ratio; dx = 0; dy = (H()-dh)/2; }
    else{ dh = H(); dw = H()*ratio; dx = (W()-dw)/2; dy = 0; }
    CTX.drawImage(IMG.bg, dx,dy,dw,dh);
  }else{
    CTX.fillStyle='#0b0e13';
    CTX.fillRect(0,0,W(),H());
  }

  // parallax medio
  drawTiledLayer(IMG.mid, 0.15, H()*0.47, 1.1);

  // Ground (suelo) – parallax rápido
  drawTiledLayer(IMG.gnd, 0.55, H()*0.62, 1.0);

  // Niebla
  drawTiledLayer(IMG.fog, 0.30, H()*0.50, 0.9);

  // Obstáculos
  for(const o of obsts){
    const img = (o.type==='tomb' ? IMG.tomb : IMG.maus) || null;
    if(img) CTX.drawImage(img, Math.round(o.x), Math.round(o.y), CFG.obst.drawW, CFG.obst.drawH);
    else { CTX.fillStyle='#333'; CTX.fillRect(o.x,o.y, CFG.obst.drawW, CFG.obst.drawH); }
  }

  // Monedas
  for(const c of coins){
    const im = c.special && IMG.coinS ? IMG.coinS : IMG.coin;
    if(im) CTX.drawImage(im, Math.round(c.x-24), Math.round(c.y-24), 48,48);
    else { CTX.fillStyle = c.special?'#4cf':'#fc3'; CTX.beginPath(); CTX.arc(c.x,c.y,18,0,Math.PI*2); CTX.fill(); }
  }

  // Zombis
  for(const z of zombs){
    if(IMG.zombie) CTX.drawImage(IMG.zombie, Math.round(z.x), Math.round(z.y), z.w, z.h);
    else { CTX.fillStyle='#6a3'; CTX.fillRect(z.x,z.y,z.w,z.h); }
  }

  // Disparos
  CTX.fillStyle='#9cf';
  for(const s of shots){
    CTX.fillRect(Math.round(s.x-8), Math.round(s.y-4), 16,8);
  }

  // Player
  if(IMG.player) CTX.drawImage(IMG.player, Math.round(player.x), Math.round(player.y), player.w, player.h);
  else { CTX.fillStyle='#ddd'; CTX.fillRect(player.x,player.y,player.w,player.h); }

  drawHUD();
}

function drawTiledLayer(img, parallax, y, alpha=1){
  if(!img) return;
  const speed = (CFG.scrollSpeed*parallax);
  const tileW = img.width;
  const scale = (H()/1080)*1.0; // coherencia de tamaño
  const drawW = tileW*scale;
  const offset = -((scroll*parallax) % drawW);

  CTX.save();
  CTX.globalAlpha = alpha;
  for(let x=offset-drawW; x<W()+drawW; x+=drawW){
    CTX.drawImage(img, Math.round(x), Math.round(y), Math.round(drawW), Math.round(img.height*scale));
  }
  CTX.restore();
}

function drawHUD(){
  // marcador
  CTX.fillStyle='rgba(0,0,0,.65)';
  CTX.fillRect(16,16, Math.min(560, W()-32), 100);
  CTX.font='bold 40px system-ui, sans-serif';
  CTX.fillStyle='#fff';
  CTX.fillText(`Score: ${score}`, 26, 64);
  CTX.fillText(`Best:  ${best}`, 26, 106);

  // corazones
  const hx = 620, hy=36;
  for(let i=0;i<3;i++){
    const x=hx+i*40;
    if(i<lives && IMG.heart){
      CTX.drawImage(IMG.heart, x, hy, 28,24);
    }else{
      CTX.globalAlpha = .25;
      if(IMG.heart) CTX.drawImage(IMG.heart, x, hy, 28,24);
      else { CTX.fillStyle='#f66'; CTX.fillRect(x,hy,24,20); }
      CTX.globalAlpha = 1;
    }
  }

  // barra de poder
  const bw= Math.min(420, W()-360);
  CTX.fillStyle='#3a3a3a';
  CTX.fillRect( hx, 80, bw, 14 );
  CTX.fillStyle='#5aa9ff';
  CTX.fillRect( hx, 80, (power/CFG.powerMax)*bw, 14 );
}

/* ====================== LOOP ====================== */
function loop(ts){
  if(!running){ last=ts; requestAnimationFrame(loop); return; }
  dt = Math.min(0.033, (ts-last)/1000); last=ts;

  update(dt);
  draw();

  requestAnimationFrame(loop);
}

/* ====================== OVERLAY / START ====================== */
function showOverlay(html, btnText='Start'){
  const ov = document.getElementById('overlay');
  ov.innerHTML = `
    <h1>Disabled Hunter</h1>
    <p>${html || 'Move: ← →  |  Jump: ↑ / Space  |  Shoot: X'}</p>
    <button id="startBtn">${btnText}</button>
  `;
  ov.style.display='flex';
  const b = document.getElementById('startBtn');
  b.onclick = ()=>{
    ov.style.display='none';
    resetRun();
    running=true;
    if(SFX.music){ SFX.music.loop=true; SFX.music.volume=.35; SFX.music.play().catch(()=>{}); }
  };
}

/* ====================== BOOT SEGURO ====================== */
(function boot(){
  // “ping” visual por si algo se rompe: nunca pantalla negra total
  CTX.fillStyle='#0b0e13';
  CTX.fillRect(0,0,W(),H());
  CTX.fillStyle='#55c';
  CTX.fillRect(24,24,160,52);
  CTX.fillStyle='#fff';
  CTX.font='20px system-ui,sans-serif';
  CTX.fillText('BOOT…', 38, 58);

  loadImages(IMAGES_TO_LOAD).then(()=>{
    // audio “best-effort”: si falla seguimos igual
    loadAudio(SOUNDS_TO_LOAD).catch(()=>{});
    showOverlay(); // mostramos pantalla de inicio
    requestAnimationFrame(loop);
  }).catch(err=>{
    console.error('Falló carga de imágenes', err);
    showOverlay('<b>Error de carga</b><br/>Pulsa para intentar');
  });
})();
