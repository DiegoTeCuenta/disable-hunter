/* ==========================
   Disabled Hunter — Side-Scroller (Build S1)
   Reemplaza por completo tu main.js con este archivo
   ========================== */

(() => {
  // ---------- Canvas ----------
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  let W = 960, H = 540;  // base lógica
  function resize() {
    const maxW = window.innerWidth, maxH = window.innerHeight;
    const scale = Math.min(maxW / W, maxH / H);
    canvas.style.width = `${W * scale}px`;
    canvas.style.height = `${H * scale}px`;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener("resize", resize);

  // ---------- Paths ----------
  const ASSETS = {
    player: "assets/player.png",
    zombie: "assets/zombie.png",
    coin:   "assets/coin.png",
    // FX
    beam:   "assets/fx/fx_beam_128.png",
    hit:    "assets/fx/fx_hit_48.png",
    puff:   "assets/fx/fx_zombie_puff_64.png",
    // Parallax
    ground: "assets/tiles/tile_ground_soft.png",
    middle: "assets/tiles/tile_middleok.png",
    fog:    "assets/tiles/tile_fog.png",
    // SFX / BGM
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
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => { images[name] = img; res(); };
      img.onerror = rej;
      img.src = src + (src.includes("?") ? "" : `?v=${Date.now()}`); // bust cache al principio
    });
  }
  function loadAudio(name, src, loop = false, volume = 1) {
    return new Promise((res, rej) => {
      const a = new Audio(src);
      a.loop = loop;
      a.volume = volume;
      a.addEventListener("canplaythrough", () => { sounds[name] = a; res(); }, { once:true });
      a.onerror = rej;
    });
  }

  // ---------- Input ----------
  const keys = new Set();
  window.addEventListener("keydown", e => {
    keys.add(e.key.toLowerCase());
    // Arranque de música por user gesture
    if (!state.bgmStarted && sounds.bgm) {
      sounds.bgm.currentTime = 0;
      sounds.bgm.play().catch(()=>{});
      state.bgmStarted = true;
    }
  });
  window.addEventListener("keyup", e => keys.delete(e.key.toLowerCase()));
  const press = k => keys.has(k.toLowerCase());
  const anyPressed = () => keys.size > 0;

  // ---------- Side-Scroller state ----------
  const state = {
    started: false,
    bgmStarted: false,

    // Parallax offsets
    parallax: {
      groundX: 0,
      middleX: 0,
      fogX: 0,
    },

    // Player
    player: {
      x: 120, y: 370,
      w: 54, h: 64,
      vx: 0, vy: 0,
      onGround: false,
      speed: 2.2,
      jump: -8.0,
      doubleJump: true,
      canDouble: true,
      facing: 1,
      invul: 0
    },

    // Game
    coins: [],
    specials: [],
    zombies: [],
    beams: [],
    fx: [],

    // Scores / lives / power
    lives: 3,
    score: 0,
    best: Number(localStorage.getItem("dh_best") || 0),
    power: 0,          // 0…100
    canShoot: false,   // true si power > 0

    // Spawners
    tCoin: 0,
    tZombie: 0,
    tEnv: 0,

    gameOver: false,
  };

  // ---------- Helpers ----------
  function AABB(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  // ---------- Spawns ----------
  function spawnCoin(x, y, special = false) {
    (special ? state.specials : state.coins).push({ x, y, w: 28, h: 28, special });
  }
  function spawnZombie(x, groundY) {
    const zH = 56, zW = 48;
    state.zombies.push({
      x, y: groundY - zH, w: zW, h: zH, vx: -rnd(1.2, 1.8),
      alive: true, t: 0
    });
  }

  // ---------- World/track ----------
  const groundLine = () => 460; // Y del suelo donde camina el player

  function resetRun() {
    // limpiar
    state.coins.length = 0;
    state.specials.length = 0;
    state.zombies.length = 0;
    state.beams.length = 0;
    state.fx.length = 0;

    // HUD/score
    state.score = 0;
    state.lives = 3;
    state.power = 0;
    state.canShoot = false;
    state.gameOver = false;

    // Player
    const g = groundLine();
    state.player.x = 120;
    state.player.y = g - state.player.h;
    state.player.vx = 0;
    state.player.vy = 0;
    state.player.onGround = true;
    state.player.canDouble = true;
    state.player.invul = 0;

    // Timers
    state.tCoin = 0;
    state.tZombie = 0;
    state.tEnv = 0;

    // Parallax
    state.parallax.groundX = 0;
    state.parallax.middleX = 0;
    state.parallax.fogX = 0;
  }

  // ---------- Update ----------
  function update(dt) {
    if (!state.started) {
      if (anyPressed()) {
        state.started = true;
        resetRun();
      }
      return;
    }
    if (state.gameOver) {
      if (anyPressed()) resetRun();
      return;
    }

    const p = state.player;
    const gY = groundLine();

    // Movimiento lateral simple (microajustes)
    const left  = press("arrowleft") || press("z");
    const right = press("arrowright") || press("c");
    const up    = press("arrowup") || press("s") || press(" ");

    if (left)  { p.vx = -p.speed; p.facing = -1; }
    if (right) { p.vx =  p.speed; p.facing =  1; }
    if (!left && !right) p.vx = 0;

    // Salto / doble salto
    if (up && p.onGround) {
      p.vy = p.jump; p.onGround = false; p.canDouble = true;
    } else if (up && !p.onGround && p.canDouble) {
      p.vy = p.jump * 0.82; p.canDouble = false;  // doble
    }

    // Gravedad
    p.vy += 0.40;
    p.y += p.vy;
    p.x += p.vx;
    p.y = Math.min(p.y, gY - p.h);

    if (p.y >= gY - p.h) { p.onGround = true; p.vy = 0; }

    // Mantenerlo en pantalla
    p.x = clamp(p.x, 20, W - 20 - p.w);

    // Parallax scrolling (se mueve el mundo hacia la izquierda)
    const speedWorld = 2.2; // “velocidad de carrera”
    state.parallax.groundX = (state.parallax.groundX - speedWorld) % images.ground.width;
    state.parallax.middleX = (state.parallax.middleX - speedWorld * 0.55) % images.middle.width;
    state.parallax.fogX    = (state.parallax.fogX    - speedWorld * 0.85) % images.fog.width;

    // Score por distancia
    state.score += 0.05;

    // Invulnerabilidad breve al ser golpeado
    if (p.invul > 0) p.invul -= dt;

    // Disparo (cuando hay power)
    state.canShoot = state.power > 0.1;
    const shootKey = press(" ") || press("x"); // espacio o X
    if (shootKey && state.canShoot) {
      shootBeam();
      state.power = Math.max(0, state.power - 12);
      snd(sounds.sfxBeam);
    }

    // Spawns
    state.tCoin += dt;
    state.tZombie += dt;

    if (state.tCoin > 0.35) {
      state.tCoin = 0;
      // 1 normal + chance de especial
      const baseY = gY - 60 - Math.random() * 60;
      spawnCoin(W + 40, baseY, false);
      if (Math.random() < 0.18) spawnCoin(W + 40 + rnd(120, 220), gY - 80 - Math.random()*90, true);
    }
    if (state.tZombie > 0.9) {
      state.tZombie = 0;
      spawnZombie(W + 40 + Math.random() * 140, gY);
    }

    // Mover/limpiar monedas
    const worldVX = -speedWorld;
    for (const c of state.coins) { c.x += worldVX; }
    for (const c of state.specials) { c.x += worldVX; }

    // Colisiones coins
    for (let i = state.coins.length - 1; i >= 0; --i) {
      const c = state.coins[i];
      if (AABB({x:p.x,y:p.y,w:p.w,h:p.h}, c)) {
        state.coins.splice(i,1);
        state.score += 5;
        puffFX(c.x, c.y, 22);
        snd(sounds.sfxCoin);
      } else if (c.x < -80) {
        state.coins.splice(i,1);
      }
    }
    // Specials
    for (let i = state.specials.length - 1; i >= 0; --i) {
      const c = state.specials[i];
      if (AABB({x:p.x,y:p.y,w:p.w,h:p.h}, c)) {
        state.specials.splice(i,1);
        state.power = clamp(state.power + 40, 0, 100);
        puffFX(c.x, c.y, 26, "#4ad1ff");
        snd(sounds.sfxPower);
      } else if (c.x < -80) {
        state.specials.splice(i,1);
      }
    }

    // Zombies
    for (let i = state.zombies.length - 1; i >= 0; --i) {
      const z = state.zombies[i];
      if (!z.alive) { state.zombies.splice(i,1); continue; }
      z.x += z.vx + worldVX * 0.25; // también arrastra mundo
      z.t += dt;

      // choque con player
      if (AABB({x:p.x,y:p.y,w:p.w,h:p.h}, z)) {
        if (p.invul <= 0) {
          state.lives -= 1;
          p.invul = 1.2;
          snd(sounds.sfxGameOver);
          if (state.lives <= 0) {
            gameOver();
            return;
          }
        }
      }

      // fuera de pantalla
      if (z.x < -120) state.zombies.splice(i,1);
    }

    // Beams
    for (let i = state.beams.length - 1; i >= 0; --i) {
      const b = state.beams[i];
      b.x += b.vx;
      b.t += dt;
      // hit zombies
      for (const z of state.zombies) {
        if (z.alive && AABB(b, z)) {
          z.alive = false;
          state.score += 20;
          puffFX(z.x + z.w*0.5, z.y + z.h*0.5, 30, "#7CFF7C");
          snd(sounds.sfxZombieDie);
        }
      }
      if (b.x > W + 140 || b.t > 1) state.beams.splice(i,1);
    }

    // Clean FX
    for (let i = state.fx.length - 1; i >= 0; --i) {
      const f = state.fx[i];
      f.t += dt;
      if (f.t > f.life) state.fx.splice(i,1);
    }
  }

  function shootBeam() {
    const p = state.player;
    const w = 96, h = 24;
    state.beams.push({
      x: p.x + p.w - 8, y: p.y + p.h*0.42 - h/2, w, h, vx: 10, t: 0
    });
  }
  function puffFX(x, y, r = 24, color = "#ffffff") {
    state.fx.push({ x, y, r, color, t: 0, life: 0.35 });
  }
  function gameOver() {
    state.gameOver = true;
    state.best = Math.max(state.best, Math.floor(state.score));
    localStorage.setItem("dh_best", state.best);
    snd(sounds.sfxGameOver);
  }

  // ---------- Render ----------
  function drawParallax(img, offsetX, y) {
    const w = img.width, h = img.height;
    let x = Math.floor(offsetX % w);
    if (x > 0) x -= w;
    while (x < W) {
      ctx.drawImage(img, x, y);
      x += w;
    }
  }

  function render() {
    // Clear
    ctx.fillStyle = "#0f141c";
    ctx.fillRect(0,0,W,H);

    // Middle (árboles + lápidas)
    drawParallax(images.middle, state.parallax.middleX, H - images.middle.height - images.ground.height + 20);

    // Ground
    drawParallax(images.ground, state.parallax.groundX, H - images.ground.height);

    // Player
    const p = state.player;
    if (!state.started) {
      ctx.fillStyle = "rgba(0,0,0,.35)";
      ctx.fillRect(0,0,320,80);
      ctx.fillStyle = "#fff";
      ctx.font = "20px sans-serif";
      ctx.fillText("Disabled Hunter — Demo (Side-Scroller)", 14, 30);
      ctx.fillText("Presiona cualquier tecla para comenzar", 14, 56);
    }

    // Beam antes o después según gusto (aquí después)
    // Zombies
    for (const z of state.zombies) {
      if (!z.alive) continue;
      ctx.drawImage(images.zombie, Math.floor(z.x), Math.floor(z.y), z.w, z.h);
    }

    // Player (con parpadeo si invul)
    if (p.invul > 0 && Math.floor(p.invul*10) % 2 === 0) {
      // parpadeo
    } else {
      ctx.drawImage(images.player, Math.floor(p.x), Math.floor(p.y), p.w, p.h);
    }

    // Coins
    for (const c of state.coins) ctx.drawImage(images.coin, Math.floor(c.x), Math.floor(c.y), c.w, c.h);
    // Specials (pintamos anillo azul encima para distinguir)
    for (const s of state.specials) {
      ctx.drawImage(images.coin, Math.floor(s.x), Math.floor(s.y), s.w, s.h);
      ctx.strokeStyle = "#39b6ff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(s.x + s.w/2, s.y + s.h/2, s.w*0.55, s.h*0.55, 0, 0, Math.PI*2);
      ctx.stroke();
    }

    // Beams
    for (const b of state.beams) {
      if (images.beam) {
        ctx.drawImage(images.beam, Math.floor(b.x), Math.floor(b.y), b.w, b.h);
      } else {
        ctx.fillStyle = "#8ff";
        ctx.fillRect(Math.floor(b.x), Math.floor(b.y), b.w, b.h);
      }
    }

    // FX (puffs/hits)
    for (const f of state.fx) {
      ctx.globalAlpha = 1 - (f.t / f.life);
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r*(0.6 + f.t/f.life*0.6), 0, Math.PI*2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Fog al frente
    drawParallax(images.fog, state.parallax.fogX, H - images.ground.height - images.fog.height + 12);

    // HUD
    ctx.fillStyle = "rgba(0,0,0,.48)";
    ctx.fillRect(10, 10, 240, 64);
    ctx.fillStyle = "#fff";
    ctx.font = "18px sans-serif";
    ctx.fillText(`Score: ${Math.floor(state.score)}`, 18, 34);
    ctx.fillText(`Best:  ${state.best}`, 18, 58);

    // Vidas
    const hearts = state.lives;
    for (let i=0;i<3;i++){
      ctx.fillStyle = i<hearts ? "#ff4b5c" : "#444";
      ctx.beginPath();
      ctx.arc(260 + i*18, 28, 6, 0, Math.PI*2);
      ctx.fill();
    }

    // Power bar
    ctx.fillStyle = "#3a3a3a";
    ctx.fillRect(330, 18, 140, 10);
    ctx.fillStyle = "#39b6ff";
    ctx.fillRect(330, 18, 140 * (state.power/100), 10);
    ctx.strokeStyle = "#000";
    ctx.strokeRect(330, 18, 140, 10);

    if (state.gameOver) {
      ctx.fillStyle = "rgba(0,0,0,.55)";
      ctx.fillRect(0,0,W,H);
      ctx.fillStyle = "#fff";
      ctx.font = "28px sans-serif";
      ctx.fillText("RIP — Game Over", W/2 - 110, H/2 - 16);
      ctx.font = "18px sans-serif";
      ctx.fillText("Presiona cualquier tecla para reiniciar", W/2 - 170, H/2 + 14);
    }
  }

  // ---------- Loop ----------
  let last = 0;
  function loop(ts) {
    const t = ts/1000;
    const dt = Math.min(0.033, t - last || 0.016);
    last = t;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  // ---------- Audio helper ----------
  function snd(aud){
    if (!aud) return;
    try { aud.currentTime = 0; aud.play(); } catch {}
  }

  // ---------- Boot ----------
  async function boot() {
    resize();

    // Cargar imágenes
    await Promise.all([
      loadImage("player", ASSETS.player),
      loadImage("zombie", ASSETS.zombie),
      loadImage("coin",   ASSETS.coin),
      loadImage("beam",   ASSETS.beam).catch(()=>{}),
      loadImage("hit",    ASSETS.hit).catch(()=>{}),
      loadImage("puff",   ASSETS.puff).catch(()=>{}),
      loadImage("ground", ASSETS.ground),
      loadImage("middle", ASSETS.middle),
      loadImage("fog",    ASSETS.fog),
    ]);

    // Cargar sonido (si falla alguno, seguimos igual)
    await Promise.allSettled([
      loadAudio("bgm",          ASSETS.bgm,       true, 0.4),
      loadAudio("sfxCoin",      ASSETS.sfxCoin,   false, 0.9),
      loadAudio("sfxPower",     ASSETS.sfxPower,  false, 0.9),
      loadAudio("sfxBeam",      ASSETS.sfxBeam,   false, 0.8),
      loadAudio("sfxZombieDie", ASSETS.sfxZombieDie, false, 0.8),
      loadAudio("sfxGameOver",  ASSETS.sfxGameOver,  false, 0.8),
    ]);

    requestAnimationFrame(loop);
  }
  boot();
})();
