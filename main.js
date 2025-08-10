/* ==========================
   Disabled Hunter — Side-Scroller (Build S1)
   Reemplaza por completo tu main.js con este archivo
   ========================== */

(() => {
  // ---------- Canvas ----------
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  let W = 960, H = 540;                // tamaño lógico
  const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

  function resize() {
    const s = Math.min(window.innerWidth / W, window.innerHeight / H);
    canvas.style.width = `${W * s}px`;
    canvas.style.height = `${H * s}px`;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener("resize", resize);

  // ---------- Rutas de assets ----------
  const ASSETS = {
    // Parallax (tuyos)
    ground: "assets/tiles/tile_ground_soft.png",
    fog:    "assets/tiles/tile_fog.png",
    middle: "assets/tiles/tile_middleok.png",

    // Sprites base (ya los tenías)
    player: "assets/player.png",
    zombie: "assets/zombie.png",
    coin:   "assets/coin.png",

    // FX (opcional)
    beam: "assets/fx/fx_beam_128.png",

    // Sonido (opcional)
    bgm:            "assets/music.mp3",
    sfxCoin:        "assets/sfx_coin.wav",
    sfxPower:       "assets/sfx_power.wav",
    sfxBeam:        "assets/sfx_beam.wav",
    sfxZombieDie:   "assets/sfx_zombie_die.wav",
    sfxGameOver:    "assets/sfx_gameover.wav",
  };

  // ---------- Loaders ----------
  const images = {};
  const sounds = {};

  function loadImage(name, src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => { images[name] = img; resolve(); };
      img.onerror = reject;
      img.src = src + `?v=${Date.now()}`; // bust inicial
    });
  }

  function loadAudio(name, src, loop = false, volume = 1) {
    return new Promise((resolve, reject) => {
      const a = new Audio(src);
      a.loop = loop;
      a.volume = volume;
      a.addEventListener("canplaythrough", () => { sounds[name] = a; resolve(); }, { once:true });
      a.onerror = () => resolve(); // si falla no rompemos
    });
  }

  // ---------- Input ----------
  const keys = new Set();
  const press = k => keys.has(k.toLowerCase());
  const anyPressed = () => keys.size > 0;

  window.addEventListener("keydown", (e) => {
    keys.add(e.key.toLowerCase());
    // iniciar música por gesto del usuario
    if (!state.bgmStarted && sounds.bgm) {
      try { sounds.bgm.currentTime = 0; sounds.bgm.play(); } catch {}
      state.bgmStarted = true;
    }
  });
  window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

  // ---------- Estado del juego ----------
  const state = {
    started: false,
    bgmStarted: false,

    // Parallax
    px: { ground: 0, fog: 0, middle: 0 },

    // Player
    p: { x: 120, y: 370, w: 54, h: 64, vx: 0, vy: 0, onGround: true, canDouble: true, invul: 0 },

    // Objetos
    coins: [],
    specials: [],
    zombies: [],
    beams: [],
    fx: [],

    // Meta
    lives: 3,
    score: 0,
    best: Number(localStorage.getItem("dh_best") || 0),
    power: 0,          // 0..100

    // Timers
    tCoin: 0,
    tZombie: 0,

    gameOver: false,
  };

  // ---------- Helpers ----------
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const rnd = (a,b)=>a + Math.random()*(b-a);
  const AABB = (a,b)=>(a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y);
  const groundY = ()=> 460;

  function snd(a){ if(!a) return; try{ a.currentTime=0; a.play(); }catch{} }

  // ---------- Spawns ----------
  function spawnCoin(x, y, special=false) {
    (special? state.specials : state.coins).push({ x, y, w: 28, h: 28, special });
  }
  function spawnZombie(x) {
    const h=56, w=48, g=groundY();
    state.zombies.push({ x, y:g-h, w, h, vx: -rnd(1.2,1.8), alive:true });
  }
  function shootBeam() {
    if (state.power <= 0) return;
    const p = state.p;
    state.beams.push({ x:p.x+p.w-8, y:p.y+p.h*0.42-12, w:96, h:24, vx:10, t:0 });
    state.power = Math.max(0, state.power - 12);
    snd(sounds.sfxBeam);
  }

  // ---------- Reset run ----------
  function resetRun() {
    state.coins.length = 0;
    state.specials.length = 0;
    state.zombies.length = 0;
    state.beams.length = 0;
    state.fx.length = 0;

    state.lives = 3;
    state.score = 0;
    state.power = 0;
    state.gameOver = false;

    const p = state.p;
    p.x = 120; p.y = groundY() - p.h; p.vx = 0; p.vy = 0; p.onGround = true; p.canDouble = true; p.invul = 0;

    state.tCoin = 0;
    state.tZombie = 0;
    state.px.ground = 0; state.px.fog = 0; state.px.middle = 0;
  }

  // ---------- Update ----------
  function update(dt) {
    if (!state.started) {
      if (anyPressed()) { state.started = true; resetRun(); }
      return;
    }
    if (state.gameOver) {
      if (anyPressed()) resetRun();
      return;
    }

    const p = state.p;
    const g = groundY();
    const left  = press("arrowleft") || press("z");
    const right = press("arrowright") || press("c");
    const jump  = press("arrowup") || press("s") || press(" ");
    const shoot = press("x") || (press(" ") && state.power>0); // X o barra si hay power

    // Movimiento jugador
    p.vx = (right? 2.2 : 0) + (left? -2.2 : 0);
    if (jump && p.onGround) { p.vy = -8.0; p.onGround=false; p.canDouble=true; }
    else if (jump && !p.onGround && p.canDouble) { p.vy = -6.6; p.canDouble=false; }

    p.vy += 0.40; p.y += p.vy; p.x += p.vx;
    if (p.y >= g - p.h) { p.y = g - p.h; p.vy = 0; p.onGround = true; }
    p.x = clamp(p.x, 20, W-20-p.w);
    if (shoot) shootBeam();
    if (p.invul>0) p.invul -= dt;

    // Parallax (mundo corre a la izq.)
    const world = 2.1;
    state.px.ground  = (state.px.ground  - world) % images.ground.width;
    state.px.middle  = (state.px.middle  - world*0.55) % images.middle.width;
    state.px.fog     = (state.px.fog     - world*0.85) % images.fog.width;

    // Score por distancia
    state.score += 0.05;

    // Spawns
    state.tCoin += dt; state.tZombie += dt;
    if (state.tCoin > 0.35) {
      state.tCoin = 0;
      spawnCoin(W+40, g - 60 - Math.random()*60, false);
      if (Math.random() < 0.18) spawnCoin(W+40 + rnd(120,220), g - 90 - Math.random()*90, true);
    }
    if (state.tZombie > 0.9) {
      state.tZombie = 0;
      spawnZombie(W + 60 + Math.random()*120);
    }

    // Mover items con el mundo
    for (const c of state.coins)    c.x += -world;
    for (const c of state.specials) c.x += -world;

    // Colisiones monedas
    for (let i=state.coins.length-1; i>=0; --i) {
      const c = state.coins[i];
      if (AABB(p,c)) {
        state.coins.splice(i,1);
        state.score += 5;
        snd(sounds.sfxCoin);
      } else if (c.x < -80) state.coins.splice(i,1);
    }
    for (let i=state.specials.length-1; i>=0; --i) {
      const c = state.specials[i];
      if (AABB(p,c)) {
        state.specials.splice(i,1);
        state.power = clamp(state.power + 40, 0, 100);
        snd(sounds.sfxPower);
      } else if (c.x < -80) state.specials.splice(i,1);
    }

    // Beams
    for (let i=state.beams.length-1; i>=0; --i) {
      const b = state.beams[i];
      b.x += b.vx; b.t += dt;
      for (const z of state.zombies) {
        if (z.alive && AABB(b,z)) {
          z.alive=false; state.score += 20; snd(sounds.sfxZombieDie);
        }
      }
      if (b.x > W+140 || b.t>1) state.beams.splice(i,1);
    }

    // Zombies
    for (let i=state.zombies.length-1; i>=0; --i) {
      const z = state.zombies[i];
      if (!z.alive) { state.zombies.splice(i,1); continue; }
      z.x += z.vx + -world*0.25;
      if (AABB(p,z) && p.invul<=0) {
        state.lives -= 1; p.invul = 1.2; snd(sounds.sfxGameOver);
        if (state.lives <= 0) {
          state.gameOver = true;
          state.best = Math.max(state.best, Math.floor(state.score));
          localStorage.setItem("dh_best", state.best);
          return;
        }
      }
      if (z.x < -120) state.zombies.splice(i,1);
    }
  }

  // ---------- Render ----------
  function drawRepeat(img, ox, y) {
    const w = img.width;
    let x = Math.floor(ox % w);
    if (x > 0) x -= w;
    while (x < W) { ctx.drawImage(img, x, y); x += w; }
  }

  function render() {
    ctx.fillStyle="#0d1118"; ctx.fillRect(0,0,W,H);

    // Middle (cementerio) detrás del suelo
    const yMiddle = H - images.ground.height - images.middle.height + 20;
    drawRepeat(images.middle, state.px.middle, yMiddle);

    // Suelo
    drawRepeat(images.ground, state.px.ground, H - images.ground.height);

    // Zombies
    for (const z of state.zombies) if (z.alive) ctx.drawImage(images.zombie, z.x, z.y, z.w, z.h);

    // Player
    const p=state.p;
    if (!(p.invul>0 && Math.floor(p.invul*10)%2===0)) {
      ctx.drawImage(images.player, p.x, p.y, p.w, p.h);
    }

    // Coins & specials
    for (const c of state.coins) ctx.drawImage(images.coin, c.x, c.y, c.w, c.h);
    for (const s of state.specials) {
      ctx.drawImage(images.coin, s.x, s.y, s.w, s.h);
      ctx.strokeStyle = "#39b6ff"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(s.x+s.w/2, s.y+s.h/2, s.w*0.55, s.h*0.55, 0, 0, Math.PI*2); ctx.stroke();
    }

    // Beams
    for (const b of state.beams) {
      if (images.beam) ctx.drawImage(images.beam, b.x, b.y, b.w, b.h);
      else { ctx.fillStyle="#9ff"; ctx.fillRect(b.x,b.y,b.w,b.h); }
    }

    // Fog al frente
    const yFog = H - images.ground.height - images.fog.height + 12;
    drawRepeat(images.fog, state.px.fog, yFog);

    // HUD
    ctx.fillStyle="rgba(0,0,0,.48)"; ctx.fillRect(10,10,260,66);
    ctx.fillStyle="#fff"; ctx.font="18px sans-serif";
    ctx.fillText(`Score: ${Math.floor(state.score)}`, 18, 34);
    ctx.fillText(`Best:  ${state.best}`, 18, 58);

    // Vidas
    for (let i=0;i<3;i++){
      ctx.fillStyle = i<state.lives? "#ff4b5c" : "#444";
      ctx.beginPath(); ctx.arc(280 + i*18, 28, 6, 0, Math.PI*2); ctx.fill();
    }
    // Power
    ctx.fillStyle="#3a3a3a"; ctx.fillRect(340,18,140,10);
    ctx.fillStyle="#39b6ff"; ctx.fillRect(340,18,140*(state.power/100),10);
    ctx.strokeStyle="#000"; ctx.strokeRect(340,18,140,10);

    if (!state.started) {
      ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.fillRect(0,0,W,H);
      ctx.fillStyle = "#fff"; ctx.font="28px sans-serif";
      ctx.fillText("Disabled Hunter — Demo", W/2-170, H/2-16);
      ctx.font="16px sans-serif";
      ctx.fillText("Presiona cualquier tecla para comenzar", W/2-170, H/2+14);
    }

    if (state.gameOver) {
      ctx.fillStyle="rgba(0,0,0,.55)"; ctx.fillRect(0,0,W,H);
      ctx.fillStyle="#fff"; ctx.font="28px sans-serif";
      ctx.fillText("RIP — Game Over", W/2-110, H/2-16);
      ctx.font="16px sans-serif";
      ctx.fillText("Presiona cualquier tecla para reiniciar", W/2-150, H/2+14);
    }
  }

  // ---------- Loop ----------
  let last = 0;
  function loop(ts) {
    const t = ts/1000, dt = Math.min(0.033, t - last || 0.016); last = t;
    update(dt); render(); requestAnimationFrame(loop);
  }

  // ---------- Boot ----------
  async function boot() {
    resize();
    await Promise.all([
      loadImage("ground", ASSETS.ground),
      loadImage("fog",    ASSETS.fog),
      loadImage("middle", ASSETS.middle),
      loadImage("player", ASSETS.player),
      loadImage("zombie", ASSETS.zombie),
      loadImage("coin",   ASSETS.coin),
      loadImage("beam",   ASSETS.beam).catch(()=>{}),
    ]);
    await Promise.allSettled([
      loadAudio("bgm",          ASSETS.bgm, true, 0.4),
      loadAudio("sfxCoin",      ASSETS.sfxCoin, false, 0.9),
      loadAudio("sfxPower",     ASSETS.sfxPower, false, 0.9),
      loadAudio("sfxBeam",      ASSETS.sfxBeam, false, 0.8),
      loadAudio("sfxZombieDie", ASSETS.sfxZombieDie, false, 0.8),
      loadAudio("sfxGameOver",  ASSETS.sfxGameOver, false, 0.8),
    ]);
    requestAnimationFrame(loop);
  }
  boot();
})();
