// =======================
// Disabled Hunter — Side Scroller con Parallax (control manual)
// Reemplazo TOTAL de main.js
// =======================

(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  // ---------- Canvas responsive (mantiene 16:9 y nitidez) ----------
  let W = 960, H = 540;
  function resizeCanvas() {
    const ASPECT = 16 / 9;
    let ww = window.innerWidth, hh = window.innerHeight;
    let w = ww, h = Math.round(ww / ASPECT);
    if (h > hh) { h = hh; w = Math.round(h * ASPECT); }
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    W = canvas.width;
    H = canvas.height;
    ctx.setTransform(1,0,0,1,0,0);
  }
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  // ---------- Utils ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => Math.random() * (b - a) + a;

  function aabb(a,b){
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // ---------- Assets ----------
  const images = {};
  const sounds = {};
  let pending = 0, ready = 0;

  function loadImage(key, src){
    pending++;
    const img = new Image();
    img.onload = () => { ready++; images[key]=img; };
    img.onerror = () => { ready++; images[key]=img; };
    img.src = src;
  }
  function loadSound(key, src, vol=1){
    try { const a=new Audio(src); a.volume=vol; sounds[key]=a; } catch(e){}
  }

  // Parallax tiles
  loadImage("ground","assets/tiles/tile_ground_soft.png");
  loadImage("fog","assets/tiles/tile_fog.png");
  loadImage("middle","assets/tiles/tile_middleok.png");

  // Sprites
  loadImage("player","assets/player.png");
  loadImage("zombie","assets/zombie.png");
  loadImage("coin","assets/coin.png");
  loadImage("coinS","assets/coin_special.png"); // moneda azul
  loadImage("beam","assets/fx/fx_beam_128.png");
  loadImage("puff","assets/fx/fx_zombie_puff_64.png");

  // Sonidos
  loadSound("coin","assets/sfx_coin.wav",0.8);
  loadSound("power","assets/sfx_power.wav",0.8);
  loadSound("beam","assets/sfx_beam.wav",0.6);
  loadSound("zdie","assets/sfx_zombie_die.wav",0.8);
  loadSound("over","assets/sfx_gameover.wav",0.9);

  // Música
  let music;
  try { music = new Audio("assets/music.mp3"); music.loop = true; music.volume = 0.45; } catch(e){}

  // ---------- Estado ----------
  const state = {
    started:false, gameOver:false, last:0,

    // Mundo y cámara
    worldX:0, // posición de cámara
    parallax:{ middle:0.25, fog:0.5, ground:1 },

    // Player
    p:{
      x: 200, y:0, w:78, h:78,
      vx:0, vy:0,
      accel: 0.6, maxVx: 5.2,
      onGround:false, invul:0
    },

    gravity:1.05, jumpForce:-18, // salto más alto
    coyote:0, coyoteMax:0.08,    // “coyote time” facilita el salto

    // Entidades en coords de mundo (x,y)
    zombies:[], coins:[], specials:[], beams:[], fx:[],

    // Spawners usando worldX
    nextCoinX: 500, nextSpecX: 1400, nextZomX: 900,

    // Puntuación y recursos
    score:0, best:Number(localStorage.getItem("dh_best")||0),
    lives:3, power:0,

    // Input
    keys:{}
  };

  function groundY(){
    const g = images.ground;
    const gh = g && g.height ? g.height : 120;
    return H - gh - 8;
  }

  // ---------- Input ----------
  const map = {
    ArrowLeft:"L", ArrowRight:"R", ArrowUp:"U", ArrowDown:"D",
    z:"L", Z:"L", c:"R", C:"R", s:"U", S:"U", x:"D", X:"D", " ":"SPACE"
  };
  function onKey(e,down){
    const k = map[e.key]; if (k){ state.keys[k]=down; e.preventDefault(); }
    if (down){
      if (!state.started){ startGame(); }
      else if (state.gameOver){ restart(); }
    }
  }
  window.addEventListener("keydown", e=>onKey(e,true));
  window.addEventListener("keyup",   e=>onKey(e,false));

  function startGame(){
    state.started = true; state.gameOver=false;
    if (music && music.paused){ music.currentTime=0; music.play().catch(()=>{}); }
  }
  function restart(){
    Object.assign(state, {
      started:true, gameOver:false,
      worldX:0,
      p:{ x:200, y:0, w:78, h:78, vx:0, vy:0, accel:0.6, maxVx:5.2, onGround:false, invul:0 },
      gravity:1.05, jumpForce:-18, coyote:0, coyoteMax:0.08,
      zombies:[], coins:[], specials:[], beams:[], fx:[],
      nextCoinX:500, nextSpecX:1400, nextZomX:900,
      score:0, lives:3, power:0
    });
    state.p.y = groundY() - state.p.h; state.p.onGround=true;
    if (music){ music.currentTime=0; music.play().catch(()=>{}); }
  }

  // ---------- Spawns ----------
  function spawnCoin(x){
    state.coins.push({x, y: groundY() - rnd(30,70), w:32, h:32});
  }
  function spawnSpecial(x){
    state.specials.push({x, y: groundY() - 54, w:38, h:38});
  }
  function spawnZombie(x){
    state.zombies.push({x, y: groundY() - 60, w:64, h:64, alive:true});
  }

  // ---------- Update ----------
  function update(dt){
    const p = state.p;

    // —— Movimiento horizontal manual
    if (state.keys.L)      p.vx = clamp(p.vx - p.accel, -p.maxVx, p.maxVx);
    else if (state.keys.R) p.vx = clamp(p.vx + p.accel, -p.maxVx, p.maxVx);
    else                   p.vx *= 0.88;

    // —— Salto con coyote
    if (p.onGround) state.coyote = state.coyoteMax;
    else            state.coyote = Math.max(0, state.coyote - dt);
    if (state.keys.U && state.coyote>0){
      p.vy = state.jumpForce; p.onGround=false; state.coyote = 0;
    }

    // —— Física vertical
    p.vy += state.gravity;
    p.y  += p.vy;

    const gy = groundY();
    if (p.y + p.h >= gy){ p.y = gy - p.h; p.vy=0; p.onGround=true; }

    if (p.invul>0) p.invul -= dt;

    // —— Avance del mundo/cámara
    state.worldX += p.vx;

    // —— Spawns por distancia recorrida
    while (state.worldX + W*0.7 > state.nextCoinX){
      spawnCoin(state.nextCoinX + rnd(-60,60));
      state.nextCoinX += rnd(220, 420);
    }
    while (state.worldX + W*0.8 > state.nextZomX){
      spawnZombie(state.nextZomX + rnd(-40,40));
      state.nextZomX += rnd(520, 820);
    }
    while (state.worldX + W > state.nextSpecX){
      spawnSpecial(state.nextSpecX);
      state.nextSpecX += rnd(2200, 3200);
    }

    // —— Recoger monedas y especiales
    const camL = state.worldX - 80;
    const camR = state.worldX + W + 80;

    for (let i=state.coins.length-1;i>=0;i--){
      const c = state.coins[i];
      if (c.x < camL) { state.coins.splice(i,1); continue; }
      const rect = {x:c.x - state.worldX, y:c.y, w:c.w, h:c.h};
      const pr = {x:p.x, y:p.y, w:p.w, h:p.h};
      if (aabb(pr, rect)){
        state.coins.splice(i,1);
        state.score += 10;
        sounds.coin && sounds.coin.play && sounds.coin.play().catch(()=>{});
      }
    }
    for (let i=state.specials.length-1;i>=0;i--){
      const s = state.specials[i];
      if (s.x < camL) { state.specials.splice(i,1); continue; }
      const rect = {x:s.x - state.worldX, y:s.y, w:s.w, h:s.h};
      const pr = {x:p.x, y:p.y, w:p.w, h:p.h};
      if (aabb(pr, rect)){
        state.specials.splice(i,1);
        state.power = clamp(state.power + 50, 0, 100);
        state.score += 25;
        sounds.power && sounds.power.play && sounds.power.play().catch(()=>{});
      }
    }

    // —— Disparo
    if (state.keys.SPACE && state.power>0 && state.beams.length < 3){
      state.keys.SPACE = false;
      const bx = p.x + p.w - 4;
      const by = p.y + p.h*0.42;
      state.beams.push({x:bx + state.worldX, y:by, w:120, h:14, vx:8});
      state.power = clamp(state.power - 25, 0, 100);
      sounds.beam && sounds.beam.play && sounds.beam.play().catch(()=>{});
    }

    // —— Beams y daño a zombies
    for (let i=state.beams.length-1;i>=0;i--){
      const b = state.beams[i];
      b.x += b.vx;
      if (b.x - state.worldX > W + 60) { state.beams.splice(i,1); continue; }
      for (const z of state.zombies){
        if (!z.alive) continue;
        const zr = {x: z.x - state.worldX, y:z.y, w:z.w, h:z.h};
        const br = {x: b.x - state.worldX, y:b.y, w:b.w, h:b.h};
        if (aabb(zr, br)){
          z.alive = false;
          state.score += 35;
          state.fx.push({x:z.x, y:z.y, w:64, h:64, t:0, life:0.35}); // puff
          sounds.zdie && sounds.zdie.play && sounds.zdie.play().catch(()=>{});
        }
      }
    }

    // —— Colisión con zombies (con perdón para saltarlos)
    for (const z of state.zombies){
      if (!z.alive) continue;
      // Hurtbox reducida (no duele si vas alto)
      const hurt = {
        x: z.x + z.w*0.2,
        y: z.y + z.h*0.35,           // ignoramos la parte alta para permitir el salto
        w: z.w*0.6,
        h: z.h*0.65
      };
      const pr = {x: p.x + state.worldX, y:p.y, w:p.w, h:p.h};
      if (aabb(pr, hurt) && state.p.invul<=0){
        // Si tus pies están por encima de la parte alta del hurtbox, NO te da
        const feet = p.y + p.h;
        if (feet <= hurt.y + 6) continue; // lo pasaste por arriba
        // daño
        z.alive = false;
        state.lives -= 1;
        state.power = clamp(state.power - 15, 0, 100);
        state.p.invul = 1.0;
        state.fx.push({x:z.x, y:z.y, w:64, h:64, t:0, life:0.35});
        if (state.lives <= 0) return gameOver();
      }
    }

    // —— Efectos
    for (let i=state.fx.length-1;i>=0;i--){
      const f = state.fx[i];
      f.t += dt; if (f.t >= f.life) state.fx.splice(i,1);
    }

    // —— Score por avance
    state.score += Math.abs(p.vx)*0.25;
  }

  function gameOver(){
    state.gameOver = true; state.started = false;
    state.best = Math.max(state.best, Math.floor(state.score));
    localStorage.setItem("dh_best", String(state.best));
    sounds.over && sounds.over.play && sounds.over.play().catch(()=>{});
    if (music) music.pause();
  }

  // ---------- Render ----------
  function drawRepeat(img, offsetX, y){
    if (!img || !img.complete || !img.width) return;
    const w = img.width;
    let sx = (-offsetX) % w; if (sx > 0) sx -= w;
    for (let x = sx; x < W; x += w) ctx.drawImage(img, x, y);
  }

  function have(key){ const im=images[key]; return im && im.complete && im.width>0; }

  function render(){
    ctx.fillStyle="#0b0e13"; ctx.fillRect(0,0,W,H);

    if (!(have("ground") && have("middle") && have("fog") && have("player") && have("zombie") && have("coin"))){
      ctx.fillStyle="#fff"; ctx.font=Math.round(22*(W/960))+"px sans-serif";
      ctx.fillText("Cargando…", Math.round(W/2-60*(W/960)), Math.round(H/2));
      return;
    }

    // Parallax offsets desde worldX
    const midY = H - images.ground.height - images.middle.height + 20;
    const fogY = H - images.ground.height - images.fog.height + 36;
    drawRepeat(images.middle, state.worldX*state.parallax.middle, midY);

    ctx.save(); ctx.globalAlpha=0.55;
    drawRepeat(images.fog, state.worldX*state.parallax.fog, fogY);
    ctx.restore();

    drawRepeat(images.ground, state.worldX*state.parallax.ground, H - images.ground.height);

    // Zombies
    for (const z of state.zombies) if (z.alive){
      ctx.drawImage(images.zombie, z.x - state.worldX, z.y, z.w, z.h);
    }

    // Player (blink si invulnerable)
    if (!(state.p.invul>0 && Math.floor(state.p.invul*10)%2===0)){
      ctx.drawImage(images.player, state.p.x, state.p.y, state.p.w, state.p.h);
    }

    // Coins
    for (const c of state.coins){
      ctx.drawImage(images.coin, c.x - state.worldX, c.y, c.w, c.h);
    }
    // Specials (azules)
    for (const s of state.specials){
      if (have("coinS")) ctx.drawImage(images.coinS, s.x - state.worldX, s.y, s.w, s.h);
      else {
        ctx.drawImage(images.coin, s.x - state.worldX, s.y, s.w, s.h);
        ctx.strokeStyle="#39b6ff"; ctx.lineWidth=3;
        ctx.beginPath(); ctx.ellipse((s.x - state.worldX)+s.w/2, s.y+s.h/2, s.w*0.55, s.h*0.55, 0, 0, Math.PI*2); ctx.stroke();
      }
    }

    // Beams
    for (const b of state.beams){
      if (have("beam")) ctx.drawImage(images.beam, b.x - state.worldX, b.y, b.w, b.h);
      else { ctx.fillStyle="#9ff"; ctx.fillRect(b.x - state.worldX, b.y, b.w, b.h); }
    }

    // FX Puff
    for (const f of state.fx){
      if (have("puff")){
        const t = clamp(f.t / f.life, 0, 1);
        const alpha = 1 - t;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.drawImage(images.puff, f.x - state.worldX, f.y, f.w, f.h);
        ctx.restore();
      }
    }

    drawHUD();

    if (!state.started && !state.gameOver){
      ctx.fillStyle="rgba(0,0,0,.45)"; ctx.fillRect(0,0,W,H);
      ctx.fillStyle="#fff"; ctx.font=Math.round(28*(W/960))+"px sans-serif";
      ctx.fillText("Disabled Hunter — Side Scroller", Math.round(W/2-210*(W/960)), Math.round(H/2-16*(H/540)));
      ctx.font=Math.round(16*(W/960))+"px sans-serif";
      ctx.fillText("Mover: ← →   •   Saltar: ↑ o S   •   Disparo: SPACE (cuando tengas poder)", Math.round(W/2-270*(W/960)), Math.round(H/2+10*(H/540)));
      ctx.fillText("Toma monedas azules para recargar el rayo.", Math.round(W/2-160*(W/960)), Math.round(H/2+34*(H/540)));
      ctx.fillText("Presiona cualquier tecla para empezar", Math.round(W/2-150*(W/960)), Math.round(H/2+58*(H/540)));
    }

    if (state.gameOver){
      ctx.fillStyle="rgba(0,0,0,.55)"; ctx.fillRect(0,0,W,H);
      ctx.fillStyle="#fff"; ctx.font=Math.round(28*(W/960))+"px sans-serif";
      ctx.fillText("RIP — Game Over", Math.round(W/2-110*(W/960)), Math.round(H/2-16*(H/540)));
      ctx.font=Math.round(16*(W/960))+"px sans-serif";
      ctx.fillText("Presiona cualquier tecla para reiniciar", Math.round(W/2-150*(W/960)), Math.round(H/2+14*(H/540)));
    }
  }

  function drawHUD(){
    const s = W/960;
    const panelW = Math.round(260*s), panelH = Math.round(66*s);
    ctx.fillStyle="rgba(0,0,0,.48)";
    ctx.fillRect(10*s, 10*s, panelW, panelH);
    ctx.fillStyle="#fff";
    ctx.font=Math.round(18*s)+"px sans-serif";
    ctx.fillText(`Score: ${Math.floor(state.score)}`, 18*s, 34*s);
    ctx.fillText(`Best:  ${state.best}`,            18*s, 58*s);

    for (let i=0;i<3;i++){
      ctx.fillStyle = i<state.lives ? "#ff4b5c" : "#444";
      ctx.beginPath(); ctx.arc((280 + i*18)*s, 28*s, 6*s, 0, Math.PI*2); ctx.fill();
    }
    // Power bar
    const bx=340*s, by=18*s, bw=140*s, bh=10*s;
    ctx.fillStyle="#3a3a3a"; ctx.fillRect(bx,by,bw,bh);
    ctx.fillStyle="#39b6ff"; ctx.fillRect(bx,by,bw*(state.power/100),bh);
    ctx.strokeStyle="#000"; ctx.strokeRect(bx,by,bw,bh);
  }

  function loop(ts){
    if (!state.last) state.last = ts;
    const dt = (ts - state.last) / 1000;
    state.last = ts;
    if (state.started && !state.gameOver) update(dt);
    render();
    requestAnimationFrame(loop);
  }

  // Colocar al jugador en el suelo cuando cargue
  const boot = setInterval(()=>{
    if (ready >= pending){
      clearInterval(boot);
      state.p.y = groundY() - state.p.h;
      state.p.onGround = true;
    }
  },50);

  requestAnimationFrame(loop);
})();
