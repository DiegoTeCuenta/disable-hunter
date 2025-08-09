const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const ASSETS = {
  bg: 'assets/background.jpg',
  player: 'assets/player.png',
  zombie: 'assets/zombie.png',
  coin: 'assets/coin.png',
  music: 'assets/music.mp3',
};

const bgImg = new Image(); bgImg.src = ASSETS.bg;
const playerImg = new Image(); playerImg.src = ASSETS.player;
const zombieImg = new Image(); zombieImg.src = ASSETS.zombie;
const coinImg = new Image(); coinImg.src = ASSETS.coin;

let music;
function startMusic(){
  if (!music){
    music = new Audio(ASSETS.music);
    music.loop = true;
    music.volume = 0.5;
  }
  music.currentTime = 0;
  music.play().catch(()=>{ /* autoplay policies */ });
}

const keys = {};
document.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
document.addEventListener('keyup',   e => keys[e.key.toLowerCase()] = false);

// Entities
const player = { x: 120, y: 380, w: 72, h: 72, speed: 4.2, power: 0, facing: 1 };
let coins = [];
let zombies = [];
let beam = null;     // {x,y,w,h,ttl,dir}
let message = null;  // {text,x,y,ttl}

// Spawns
function spawnCoins(){
  coins = [];
  for (let i=0;i<6;i++){
    coins.push({ x: 220 + i*110 + Math.random()*40, y: 390 + (Math.random()*40-20), r: 14, alive: true });
  }
}
function spawnZombie(){
  zombies.push({ x: canvas.width + 40, y: 390, w: 72, h: 72, speed: 0.8 + Math.random()*0.8, alive: true });
}
spawnCoins(); spawnZombie();

// Start overlay
const overlay = document.getElementById('overlay');
document.getElementById('startBtn').addEventListener('click', () => {
  overlay.style.display = 'none';
  startMusic();
});

// Loop
let last = 0;
function loop(ts){
  const dt = Math.min(32, ts - last); last = ts;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

function update(dt){
  // movement
  if (keys['arrowleft'] || keys['z']) { player.x -= player.speed; player.facing = -1; }
  if (keys['arrowright']|| keys['c']) { player.x += player.speed; player.facing =  1; }
  if (keys['arrowup']   || keys['s']) { player.y -= player.speed; }
  if (keys['arrowdown'] || keys['x']) { player.y += player.speed; }

  // clamp (mantener al jugador en zona baja)
  player.x = Math.max(16, Math.min(canvas.width - player.w - 16, player.x));
  player.y = Math.max(300, Math.min(420, player.y));

  // coin collect
  coins.forEach(c => {
    if (!c.alive) return;
    const dx = (player.x+player.w/2) - c.x;
    const dy = (player.y+player.h/2) - c.y;
    if (Math.hypot(dx,dy) < c.r + 28){
      c.alive = false;
      player.power = Math.min(5, player.power+1);
    }
  });
  if (coins.every(c=>!c.alive)) spawnCoins();

  // zombies approach
  zombies.forEach(z => {
    if (!z.alive) return;
    if (z.x > player.x) z.x -= z.speed;
    if (z.x < player.x) z.x += z.speed*0.25;
  });
  if (zombies.every(z=>!z.alive)) spawnZombie();

  // attack
  if ((keys[' '] || keys['space']) && !beam && player.power > 0){
    const length = 260;
    const bx = player.facing === 1 ? player.x + player.w : player.x - length;
    beam = { x: Math.min(bx, player.x+player.w), y: player.y+player.h*0.35, w: length, h: 12, ttl: 14, dir: player.facing };
    player.power = 0;
  }
  if (beam){
    beam.ttl--;
    zombies.forEach(z => {
      if (!z.alive) return;
      const hit = !(z.x > beam.x + Math.abs(beam.w) || z.x + z.w < beam.x || z.y > beam.y + beam.h || z.y + z.h < beam.y);
      if (hit){
        z.alive = false;
        message = { text: randomRip(), x: z.x+z.w/2, y: z.y-10, ttl: 60 };
      }
    });
    if (beam.ttl<=0) beam = null;
  }

  // message fade
  if (message){
    message.ttl--;
    message.y -= 0.25;
    if (message.ttl<=0) message = null;
  }
}

function randomRip(){
  const arr = ["R.I.P.", "Ashes to ashes...", "Back to the crypt!", "Light wins.", "Gone... again."];
  return arr[Math.floor(Math.random()*arr.length)];
}

function draw(){
  // background
  if (bgImg.complete) ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);
  else { ctx.fillStyle = '#0b0e13'; ctx.fillRect(0,0,canvas.width,canvas.height); }

  // coins
  coins.forEach(c => {
    if (!c.alive) return;
    if (coinImg.complete) ctx.drawImage(coinImg, c.x-16, c.y-16, 32, 32);
    else { ctx.fillStyle='gold'; ctx.beginPath(); ctx.arc(c.x,c.y,c.r,0,Math.PI*2); ctx.fill(); }
  });

  // zombies
  zombies.forEach(z => {
    if (!z.alive) return;
    if (zombieImg.complete) ctx.drawImage(zombieImg, z.x, z.y, z.w, z.h);
    else { ctx.fillStyle = '#f33'; ctx.fillRect(z.x, z.y, z.w, z.h); }
  });

  // player
  if (playerImg.complete) ctx.drawImage(playerImg, player.x, player.y, player.w, player.h);
  else { ctx.fillStyle = '#22c55e'; ctx.fillRect(player.x, player.y, player.w, player.h); }

  // beam
  if (beam){
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#e6f7ff';
    ctx.fillRect(beam.x, beam.y, Math.abs(beam.w), beam.h);
    ctx.globalAlpha = 0.35;
    ctx.fillRect(beam.x, beam.y-6, Math.abs(beam.w), 3);
    ctx.fillRect(beam.x, beam.y+beam.h+3, Math.abs(beam.w), 3);
    ctx.restore();
  }

  // HUD + message
  ctx.fillStyle='#fff'; ctx.font='16px system-ui, sans-serif';
  ctx.fillText('Power: ' + player.power, 16, 24);

  if (message){
    ctx.save();
    ctx.globalAlpha = Math.max(0, message.ttl/60);
    ctx.fillStyle = '#fff'; ctx.font = '20px system-ui, sans-serif';
    ctx.textAlign='center'; ctx.fillText(message.text, message.x, message.y);
    ctx.restore();
  }
}
