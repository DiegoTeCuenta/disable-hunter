// =======================
// Disabled Hunter - Runner (parallax) — main.js
// Versión responsive (reemplazo TOTAL)
// =======================

(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // ---------------- Responsive ----------------
  // Mantener 16:9 y usar devicePixelRatio para nitidez
  let W = 960, H = 540;
  function resizeCanvas(){
    const ASPECT = 16/9;
    let ww = window.innerWidth, hh = window.innerHeight;
    // Letterbox manteniendo 16:9
    let w = ww, h = Math.round(ww/ASPECT);
    if (h > hh){ h = hh; w = Math.round(h*ASPECT); }
    // Escala CSS
    canvas.style.width  = w + 'px';
    canvas.style.height = h + 'px';
    // Resolución real (para nitidez)
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width  = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    W = canvas.width;
    H = canvas.height;
    ctx.setTransform(1,0,0,1,0,0);
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
  // --------------------------------------------

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
    try { const a = new Audio(src); a.volume = vol; sounds[key] = a; }
    catch(e){ console.warn('Audio no disponible:', src); }
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

  // Música de fondo
  let music;
  try { music = new Audio('assets/music.mp3'); music.loop = true; music.volume = 0.45; } catch(e){}

  // ---------- Estado ----------
  const state = {
    started:false, gameOver:false, last:0,
    px:{ ground:0, fog:0, middle:0 },
    speed:{ ground:2.4, fog:1.2, middle:0.8 },

    p:{ x:120, y:0, w:72, h:72, vy:0, onGround:false, invul:0 },

    coins:[], specials:[], zombies:[], beams:[],

    gravity:0.8, jumpForce:-15, maxBeams:3,

    score:0, best:Number(localStorage.getItem('dh_best')||0),
    lives:3, power:0,

    coinTimer:0, specialTimer:0, zombieTimer:0,
  };

  function groundY(){
    const g = images.ground;
    const gh = g && g.height ? g.height : 120;
    return H - gh - 8;
  }

  // ---------- Input ----------
  const keys = {};
  const keyMap = {
    ArrowLeft:'L', ArrowRight:'R', ArrowUp:'U', ArrowDown:'D',
    z:'L', Z:'L', c:'R', C:'R', s:'U', S:'U', x:'D', X:'D', ' ':'SPACE'
  };
  function onKey(e,down){
    const k = keyMap[e.key];
    if (k){ keys[k]=down; e.preventDefault(); }
    if (down){
      if (!state.started) startGame();
      else if (state.gameOver) restart();
    }
  }
  window.addEventListener('keydown', e=>onKey(e,true));
  window.addEventListener('keyup',   e=>onKey(e,false));

  function startGame(){
    if (!state.started){
      state.started = true; state.gameOver = false;
      if (music && music.paused){ music.currentTime=0; music.play().catch(()=>{}); }
    }
  }
  function restart(){
    state.started=true; state.gameOver=false;
    state.score=0; state.lives=3; state.power=0;
    state.zombies.length=0; state.coins.length=0; state.specials.length=0; state.beams.length=0;
    state.p.x=120; state.p.y=groundY()-state.p.h; state.p.vy=0; state.p.onGround=true; state.p.invul=0;
    state.coinTimer=0; state.specialTimer=0; state.zombieTimer=0;
    if (music){ music.currentTime=0; music.play().catch(()=>{}); }
  }

  function drawRepeat(img, x, y){
    if (!img || !img.complete || img.width===0) return;
    const w = img.width;
    let sx = x % w; if (sx>0) sx -= w;
    for (let xx=sx; xx<W; xx+=w) ctx.drawImage(img, xx, y);
  }

  function spawnCoin(){ const y = groundY() + rnd(-40,-10); state.coins.push({x:W+20,y,w:32,h:32}); }
  function spawnSpecial(){ const y = groundY() - 46; state.specials.push({x:W+20,y,w:36,h:36}); }
  function spawnZombie(){ const y = groundY() - 60; state.zombies.push({x:W+20,y,w:64,h:64,vx:-(2.2+rnd(0,0.8)),alive:true}); }

  function hit(a,b){ return a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y; }

  function update(dt){
    const p = state.p;

    state.px.ground -= state.speed.ground;
    state.px.fog    -= state.speed.fog;
    state.px.middle -= state.speed.middle;

    if (state.started && !state.gameOver) state.score += state.speed.ground * 0.35;

    if (keys.U && p.onGround){ p.vy = state.jumpForce; p.onGround=false; }

    p.vy += state.gravity; p.y += p.vy;
    const gy = groundY();
    if (p.y + p.h >= gy){ p.y = gy - p.h; p.vy = 0; p.onGround = true; }

    if (p.invul>0) p.invul -= dt;

    state.coinTimer -= dt;
    if (state.coinTimer<=0 && state.started && !state.gameOver){ spawnCoin(); state.coinTimer = rnd(0.4,0.9); }

    state.specialTimer -= dt;
    if (state.specialTimer<=0 && state.started && !state.gameOver){
      if (Math.random()<0.25) spawnSpecial();
      state.specialTimer = rnd(3,5);
    }

    state.zombieTimer -= dt;
    if (state.zombieTimer<=0 && state.started && !state.gameOver){ spawnZombie(); state.zombieTimer = rnd(1.2,2.2); }

    const scroll = state.speed.ground;
    for (const c of state.coins) c.x -= scroll;
    for (const s of state.specials) s.x -= scroll;
    for (const z of state.zombies) if (z.alive) z.x += z.vx;

    for (let i=state.coins.length-1;i>=0;i--){
      const c=state.coins[i];
      if (hit(p,c)){ state.coins.splice(i,1); state.score+=10; sounds.coin&&sounds.coin.play&&sounds.coin.play().catch(()=>{}); }
      else if (c.x<-60) state.coins.splice(i,1);
    }
    for (let i=state.specials.length-1;i>=0;i--){
      const s=state.specials[i];
      if (hit(p,s)){ state.specials.splice(i,1); state.power=clamp(state.power+50,0,100); state.score+=25; sounds.power&&sounds.power.play&&sounds.power.play().catch(()=>{}); }
      else if (s.x<-60) state.specials.splice(i,1);
    }

    if (keys.SPACE && state.power>0 && state.beams.length<state.maxBeams){
      keys.SPACE=false;
      const bx=p.x+p.w-4, by=p.y+p.h*0.42;
      state.beams.push({x:bx,y:by,w:120,h:14,vx:8});
      state.power=clamp(state.power-25,0,100);
      sounds.beam&&sounds.beam.play&&sounds.beam.play().catch(()=>{});
    }

    for (let i=state.beams.length-1;i>=0;i--){
      const b=state.beams[i]; b.x+=b.vx;
      if (b.x>W+40){ state.beams.splice(i,1); continue; }
      for (const z of state.zombies){
        if (z.alive && hit(b,z)){ z.alive=false; state.score+=35; sounds.zdie&&sounds.zdie.play&&sounds.zdie.play().catch(()=>{}); }
      }
    }

    for (const z of state.zombies){
      if (z.alive && hit(p,z) && p.invul<=0){
        z.alive=false; state.lives-=1; state.power=clamp(state.power-15,0,100); p.invul=1.2;
        if (state.lives<=0){ gameOver(); break; }
      }
    }
    for (let i=state.zombies.length-1;i>=0;i--) if (state.zombies[i].x<-80) state.zombies.splice(i,1);
  }

  function gameOver(){
    state.gameOver=true; state.started=false;
    state.best = Math.max(state.best, Math.floor(state.score));
    localStorage.setItem('dh_best', String(state.best));
    sounds.over&&sounds.over.play&&sounds.over.play().catch(()=>{});
    if (music){ music.pause(); }
  }

  function has(key){ const im=images[key]; return im && im.complete && im.width>0; }

  function render(){
    ctx.fillStyle="#0d1118"; ctx.fillRect(0,0,W,H);

    if (!has('ground')||!has('middle')||!has('fog')||!has('player')||!has('zombie')||!has('coin')){
      ctx.fillStyle="#fff"; ctx.font=Math.round(20*(W/960))+"px sans-serif";
      ctx.fillText("Loading assets…", Math.round(W/2-80*(W/960)), Math.round(H/2));
      return;
    }

    const yMiddle = H - images.ground.height - images.middle.height + 20;
    drawRepeat(images.middle, state.px.middle, yMiddle);

    const yFog = H - images.ground.height - images.fog.height + 36;
    ctx.save(); ctx.globalAlpha=0.55; drawRepeat(images.fog, state.px.fog, yFog); ctx.restore();

    drawRepeat(images.ground, state.px.ground, H - images.ground.height);

    for (const z of state.zombies) if (z.alive) ctx.drawImage(images.zombie, z.x, z.y, z.w, z.h);

    const p = state.p;
    if (!(p.invul>0 && Math.floor(p.invul*10)%2===0)) ctx.drawImage(images.player, p.x, p.y, p.w, p.h);

    for (const c of state.coins) ctx.drawImage(images.coin, c.x, c.y, c.w, c.h);
    for (const s of state.specials){
      ctx.drawImage(images.coin, s.x, s.y, s.w, s.h);
      ctx.strokeStyle="#39b6ff"; ctx.lineWidth=3;
      ctx.beginPath(); ctx.ellipse(s.x+s.w/2, s.y+s.h/2, s.w*0.55, s.h*0.55, 0, 0, Math.PI*2); ctx.stroke();
    }

    for (const b of state.beams){
      if (has('beam')) ctx.drawImage(images.beam, b.x, b.y, b.w, b.h);
      else { ctx.fillStyle="#9ff"; ctx.fillRect(b.x,b.y,b.w,b.h); }
    }

    drawHUD();

    if (!state.started && !state.gameOver){
      ctx.fillStyle="rgba(0,0,0,.45)"; ctx.fillRect(0,0,W,H);
      ctx.fillStyle="#fff"; ctx.font=Math.round(28*(W/960))+"px sans-serif";
      ctx.fillText("Disabled Hunter — Runner", Math.round(W/2-190*(W/960)), Math.round(H/2-16*(H/540)));
      ctx.font=Math.round(16*(W/960))+"px sans-serif";
      ctx.fillText("Mover: ← →  • Saltar: ↑ o S  • Disparo: SPACE (con poder)", Math.round(W/2-220*(W/960)), Math.round(H/2+10*(H/540)));
      ctx.fillText("Presiona cualquier tecla para empezar", Math.round(W/2-170*(W/960)), Math.round(H/2+34*(H/540)));
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
    // Escalar HUD suavemente con el tamaño del canvas
    const scale = W/960;
    const panelW = Math.round(260*scale);
    const panelH = Math.round(66*scale);
    ctx.fillStyle="rgba(0,0,0,.48)";
    ctx.fillRect(10*scale,10*scale, panelW, panelH);

    ctx.fillStyle="#fff";
    ctx.font=Math.round(18*scale)+"px sans-serif";
    ctx.fillText(`Score: ${Math.floor(state.score)}`, 18*scale, 34*scale);
    ctx.fillText(`Best:  ${state.best}`,            18*scale, 58*scale);

    for (let i=0;i<3;i++){
      ctx.fillStyle = i<state.lives? "#ff4b5c" : "#444";
      ctx.beginPath(); ctx.arc((280 + i*18)*scale, 28*scale, 6*scale, 0, Math.PI*2); ctx.fill();
    }

    // Power bar
    const bx = 340*scale, by=18*scale, bw=140*scale, bh=10*scale;
    ctx.fillStyle="#3a3a3a"; ctx.fillRect(bx,by,bw,bh);
    ctx.fillStyle="#39b6ff"; ctx.fillRect(bx,by,bw*(state.power/100),bh);
    ctx.strokeStyle="#000"; ctx.strokeRect(bx,by,bw,bh);
  }

  function loop(ts){
    if (!state.last) state.last = ts;
    const dt = (ts - state.last)/1000;
    state.last = ts;
    if (state.started && !state.gameOver) update(dt);
    render();
    requestAnimationFrame(loop);
  }

  const boot = setInterval(()=>{
    if (assetsLoaded >= assetsToLoad){
      clearInterval(boot);
      state.p.y = groundY() - state.p.h;
      state.p.onGround = true;
    }
  },50);

  requestAnimationFrame(loop);
})();
