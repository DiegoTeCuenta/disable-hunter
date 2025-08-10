// =======================
// Disabled Hunter - Runner (parallax)
// main.js — Reemplazo TOTAL
// =======================

(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // Tamaño base (puedes cambiarlo, pero así calza con tus assets)
  const W = canvas.width  || 960;
  const H = canvas.height || 540;

  // ---------- Utilidades ----------
  const clamp = (v,min,max)=> Math.max(min,Math.min(max,v));
  const rnd = (a,b)=> Math.random()*(b-a)+a;

  // ---------- Assets ----------
  const images = {};
  const sounds = {};
  let assetsToLoad = 0;
  let assetsLoaded = 0;

  function loadImage(key, src){
    assetsToLoad++;
    const img = new Image();
    img.onload = () => { assetsLoaded++; images[key]=img; };
    img.onerror = () => { console.warn('No se pudo cargar imagen:', src); assetsLoaded++; images[key]=img; };
    img.src = src;
  }

  function loadSound(key, src, vol=1){
    try {
      const a = new Audio(src);
      a.volume = vol;
      sounds[key] = a;
    } catch(e){ console.warn('Audio no disponible:', src); }
  }

  // Tiles parallax
  loadImage('ground', 'assets/tiles/tile_ground_soft.png');
  loadImage('fog',    'assets/tiles/tile_fog.png');
  loadImage('middle', 'assets/tiles/tile_middleok.png');

  // Sprites
  loadImage('player', 'assets/player.png');
  loadImage('zombie', 'assets/zombie.png');
  loadImage('coin',   'assets/coin.png');
  loadImage('beam',   'assets/fx/fx_beam_128.png'); // opcional

  // Audio
  loadSound('coin','assets/sfx_coin.wav',0.8);
  loadSound('power','assets/sfx_power.wav',0.8);
  loadSound('beam','assets/sfx_beam.wav',0.6);
  loadSound('zdie','assets/sfx_zombie_die.wav',0.8);
  loadSound('over','assets/sfx_gameover.wav',0.9);

  // Música de fondo (loop)
  let music;
  try {
    music = new Audio('assets/music.mp3');
    music.loop = true;
    music.volume = 0.45;
  } catch(e){}

  // ---------- Estado ----------
  const state = {
    started: false,
    gameOver: false,
    last: 0,
    dt: 0,

    // Parallax positions
    px: { ground:0, fog:0, middle:0 },
    speed: { ground: 2.4, fog: 1.2, middle: 0.8 }, // puedes ajustar

    // Player
    p: { x: 120, y: 0, w: 72, h: 72, vy:0, onGround:false, invul:0 },

    // Sistemas
    coins: [],
    specials: [],
    zombies: [],
    beams: [],

    // Reglas
    gravity: 0.8,
    jumpForce: -15,
    runAccel: 0.15, // si habilitas avanzar con → (por defecto el runner no lo necesita)
    maxBeams: 3,

    // Puntuación / vidas / poder
    score: 0,
    best: Number(localStorage.getItem('dh_best')||0),
    lives: 3,
    power: 0, // 0..100

    // Timers de spawn
    coinTimer: 0,
    specialTimer: 0,
    zombieTimer: 0,
  };

  // Ground line (donde pisa el player)
  function groundY(){
    const g = images.ground;
    return H - (g && g.height ? g.height : 120) - 8; // colchón
  }

  // ---------- Input ----------
  const keys = {};
  const keyMap = {
    ArrowLeft: 'L',
    ArrowRight:'R',
    ArrowUp:   'U',
    ArrowDown: 'D',
    // Mapeo alternativo pedido: S(up), Z(left), X(down), C(right)
    z: 'L', Z: 'L',
    c: 'R', C: 'R',
    s: 'U', S: 'U',
    x: 'D', X: 'D',
    ' ': 'SPACE',
  };

  function onKey(e,down){
    const k = keyMap[e.key];
    if (k){ keys[k] = down; e.preventDefault(); }
    // Start / restart en cualquier tecla
    if (down){
      if (!state.started) startGame();
      else if (state.gameOver) restart();
    }
  }
  window.addEventListener('keydown', e=>onKey(e,true));
  window.addEventListener('keyup',   e=>onKey(e,false));

  // ---------- Start/Restart ----------
  function startGame(){
    if (!state.started){
      state.started = true;
      state.gameOver = false;
      if (music && music.paused){ music.currentTime=0; music.play().catch(()=>{}); }
    }
  }

  function restart(){
    state.started = true;
    state.gameOver = false;
    state.score = 0;
    state.lives = 3;
    state.power = 0;
    state.zombies = [];
    state.coins = [];
    state.specials = [];
    state.beams = [];
    state.p.x = 120; state.p.y = groundY() - state.p.h;
    state.p.vy = 0; state.p.onGround = true; state.p.invul = 0;
    state.coinTimer = 0; state.specialTimer = 0; state.zombieTimer = 0;
    if (music){ music.currentTime=0; music.play().catch(()=>{}); }
  }

  // ---------- Helper: drawRepeat ----------
  function drawRepeat(img, x, y){
    if (!img || !img.complete || img.width===0) return;
    const w = img.width, h = img.height;
    let sx = x % w;
    if (sx > 0) sx -= w;
    for (let xx = sx; xx < W; xx += w) {
      ctx.drawImage(img, xx, y, w, h);
    }
  }

  // ---------- Spawns ----------
  function spawnCoin(){
    const yBase = groundY() - 30;
    const y = yBase + rnd(-40, -10);
    state.coins.push({ x: W+20, y, w:32, h:32 });
  }
  function spawnSpecial(){
    const y = groundY() - 46;
    state.specials.push({ x: W+20, y, w:36, h:36 });
  }
  function spawnZombie(){
    const y = groundY() - 60;
    state.zombies.push({ x: W+20, y, w:64, h:64, vx: - (2.2 + rnd(0.0,0.8)), alive:true });
  }

  // ---------- Colisiones ----------
  function hit(a,b){
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // ---------- Lógica principal ----------
  function update(dt){
    const p = state.p;

    // Parallax
    state.px.ground -= state.speed.ground;
    state.px.fog    -= state.speed.fog;
    state.px.middle -= state.speed.middle;

    // Score por distancia recorrida
    if (state.started && !state.gameOver) state.score += state.speed.ground * 0.35;

    // Movimiento (si quisieras permitir → para acelerar un poco)
    // if (keys.R) state.px.ground -= 0.4, state.px.fog -= 0.25, state.px.middle -= 0.2;

    // Saltar
    if ((keys.U) && p.onGround){
      p.vy = state.jumpForce;
      p.onGround = false;
    }

    // Gravedad / suelo
    p.vy += state.gravity;
    p.y += p.vy;
    const gy = groundY();
    if (p.y + p.h >= gy){
      p.y = gy - p.h;
      p.vy = 0;
      p.onGround = true;
    }

    // Invulnerabilidad tras daño
    if (p.invul>0) p.invul -= dt;

    // Spawns
    state.coinTimer -= dt;
    if (state.coinTimer <= 0 && state.started && !state.gameOver){
      spawnCoin();
      state.coinTimer = rnd(0.4, 0.9);
    }

    state.specialTimer -= dt;
    if (state.specialTimer <= 0 && state.started && !state.gameOver){
      if (Math.random() < 0.25) spawnSpecial();
      state.specialTimer = rnd(3.0, 5.0);
    }

    state.zombieTimer -= dt;
    if (state.zombieTimer <= 0 && state.started && !state.gameOver){
      spawnZombie();
      state.zombieTimer = rnd(1.2, 2.2);
    }

    // Mover entidades hacia la izquierda
    const scroll = state.speed.ground;
    for (const c of state.coins) c.x -= scroll;
    for (const s of state.specials) s.x -= scroll;
    for (const z of state.zombies) if (z.alive) z.x += z.vx; // ya tiene su vx negativa

    // Recolectar monedas
    for (let i=state.coins.length-1; i>=0; i--){
      const c = state.coins[i];
      if (hit(p,c)){
        state.coins.splice(i,1);
        state.score += 10;
        sounds.coin && sounds.coin.play && sounds.coin.play().catch(()=>{});
      } else if (c.x < -60){ state.coins.splice(i,1); }
    }

    // Recolectar especiales (recarga power)
    for (let i=state.specials.length-1; i>=0; i--){
      const s = state.specials[i];
      if (hit(p,s)){
        state.specials.splice(i,1);
        state.power = clamp(state.power + 50, 0, 100);
        state.score += 25;
        sounds.power && sounds.power.play && sounds.power.play().catch(()=>{});
      } else if (s.x < -60){ state.specials.splice(i,1); }
    }

    // Disparo (SPACE) si hay power
    if (keys.SPACE && state.power > 0 && state.beams.length < state.maxBeams){
      keys.SPACE = false; // disparo simple por pulsación
      const bx = p.x + p.w - 4;
      const by = p.y + p.h*0.42;
      state.beams.push({ x: bx, y: by, w: 120, h: 14, vx: 8 });
      state.power = clamp(state.power - 25, 0, 100);
      sounds.beam && sounds.beam.play && sounds.beam.play().catch(()=>{});
    }

    // Mover beams y colisión con zombies
    for (let i=state.beams.length-1; i>=0; i--){
      const b = state.beams[i];
      b.x += b.vx;
      if (b.x > W + 40){ state.beams.splice(i,1); continue; }
      for (const z of state.zombies){
        if (z.alive && hit(b,z)){
          z.alive = false;
          state.score += 35;
          sounds.zdie && sounds.zdie.play && sounds.zdie.play().catch(()=>{});
        }
      }
    }

    // Golpe de zombie al player
    for (const z of state.zombies){
      if (z.alive && hit(p,z) && p.invul<=0){
        z.alive = false;
        state.lives -= 1;
        state.power = clamp(state.power - 15, 0, 100);
        p.invul = 1.2; // 1.2 s
        if (state.lives <= 0){
          gameOver();
          break;
        }
      }
    }

    // Limpiar zombies fuera de pantalla
    for (let i=state.zombies.length-1; i>=0; i--){
      const z = state.zombies[i];
      if (z.x < -80) state.zombies.splice(i,1);
    }
  }

  function gameOver(){
    state.gameOver = true;
    state.started  = false;
    state.best = Math.max(state.best, Math.floor(state.score));
    localStorage.setItem('dh_best', String(state.best));
    sounds.over && sounds.over.play && sounds.over.play().catch(()=>{});
    if (music){ music.pause(); }
  }

  // ---------- Render ----------
  function has(key){ const im = images[key]; return im && im.complete && im.width>0; }

  function render(){
    ctx.fillStyle = "#0d1118";
    ctx.fillRect(0,0,W,H);

    // Si no cargó lo esencial, muestra Loading
    if (!has('ground') || !has('middle') || !has('fog') || !has('player') || !has('zombie') || !has('coin')){
      ctx.fillStyle = "#fff";
      ctx.font = "20px sans-serif";
      ctx.fillText("Loading assets…", W/2-80, H/2);
      return;
    }

    // Middle detrás
    const yMiddle = H - images.ground.height - images.middle.height + 20;
    drawRepeat(images.middle, state.px.middle, yMiddle);

    // NIEBLA detrás (con opacidad y más baja)
    const yFog = H - images.ground.height - images.fog.height + 36;
    ctx.save();
    ctx.globalAlpha = 0.55;
    drawRepeat(images.fog, state.px.fog, yFog);
    ctx.restore();

    // Suelo
    drawRepeat(images.ground, state.px.ground, H - images.ground.height);

    // Zombies
    for (const z of state.zombies) if (z.alive) ctx.drawImage(images.zombie, z.x, z.y, z.w, z.h);

    // Player (parpadeo si invul)
    const p = state.p;
    if (!(p.invul>0 && Math.floor(p.invul*10)%2===0)){
      ctx.drawImage(images.player, p.x, p.y, p.w, p.h);
    }

    // Coins y especiales
    for (const c of state.coins) ctx.drawImage(images.coin, c.x, c.y, c.w, c.h);
    for (const s of state.specials){
      ctx.drawImage(images.coin, s.x, s.y, s.w, s.h);
      ctx.strokeStyle = "#39b6ff"; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(s.x+s.w/2, s.y+s.h/2, s.w*0.55, s.h*0.55, 0, 0, Math.PI*2);
      ctx.stroke();
    }

    // Beams
    for (const b of state.beams){
      if (has('beam')) ctx.drawImage(images.beam, b.x, b.y, b.w, b.h);
      else { ctx.fillStyle="#9ff"; ctx.fillRect(b.x,b.y,b.w,b.h); }
    }

    // HUD
    drawHUD();

    if (!state.started && !state.gameOver) {
      ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.fillRect(0,0,W,H);
      ctx.fillStyle = "#fff"; ctx.font="28px sans-serif";
      ctx.fillText("Disabled Hunter — Runner", W/2-190, H/2-16);
      ctx.font="16px sans-serif";
      ctx.fillText("Mover: ← →  • Saltar: ↑ o S  • Disparo: SPACE (con poder)", W/2-220, H/2+10);
      ctx.fillText("Presiona cualquier tecla para empezar", W/2-170, H/2+34);
    }

    if (state.gameOver){
      ctx.fillStyle="rgba(0,0,0,.55)"; ctx.fillRect(0,0,W,H);
      ctx.fillStyle="#fff"; ctx.font="28px sans-serif";
      ctx.fillText("RIP — Game Over", W/2-110, H/2-16);
      ctx.font="16px sans-serif";
      ctx.fillText("Presiona cualquier tecla para reiniciar", W/2-150, H/2+14);
    }
  }

  function drawHUD(){
    ctx.fillStyle="rgba(0,0,0,.48)";
    ctx.fillRect(10,10,260,66);
    ctx.fillStyle="#fff";
    ctx.font="18px sans-serif";
    ctx.fillText(`Score: ${Math.floor(state.score)}`, 18, 34);
    ctx.fillText(`Best:  ${state.best}`, 18, 58);

    // Vidas
    for (let i=0;i<3;i++){
      ctx.fillStyle = i<state.lives? "#ff4b5c" : "#444";
      ctx.beginPath(); ctx.arc(280 + i*18, 28, 6, 0, Math.PI*2); ctx.fill();
    }
    // Power bar
    ctx.fillStyle="#3a3a3a"; ctx.fillRect(340,18,140,10);
    ctx.fillStyle="#39b6ff"; ctx.fillRect(340,18,140*(state.power/100),10);
    ctx.strokeStyle="#000"; ctx.strokeRect(340,18,140,10);
  }

  // ---------- Bucle ----------
  function loop(ts){
    if (!state.last) state.last = ts;
    const dt = (ts - state.last)/1000; // s
    state.last = ts;

    if (state.started && !state.gameOver){
      update(dt);
    }

    render();
    requestAnimationFrame(loop);
  }

  // ---------- Espera carga mínima y posiciona player ----------
  const bootInterval = setInterval(() => {
    if (assetsLoaded >= assetsToLoad){
      clearInterval(bootInterval);
      // Posicionar player en el suelo:
      state.p.y = groundY() - state.p.h;
      state.p.onGround = true;
      // Música opcional: no auto-play hasta que empiece el juego
    }
  }, 50);

  requestAnimationFrame(loop);
})();
