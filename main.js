function render() {
  ctx.fillStyle="#0d1118"; 
  ctx.fillRect(0,0,W,H);

  // Middle (cementerio) detrás del suelo
  const yMiddle = H - images.ground.height - images.middle.height + 20;
  drawRepeat(images.middle, state.px.middle, yMiddle);

  // Niebla DETRÁS de personajes/objetos (con transparencia y un poco más baja)
  const yFog = H - images.ground.height - images.fog.height + 36; // +36 la baja hacia el piso
  ctx.save();
  ctx.globalAlpha = 0.55;                     // opacidad para ver fondo/árboles
  drawRepeat(images.fog, state.px.fog, yFog); // ahora se dibuja antes que todo lo demás
  ctx.restore();

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
    ctx.beginPath(); 
    ctx.ellipse(s.x+s.w/2, s.y+s.h/2, s.w*0.55, s.h*0.55, 0, 0, Math.PI*2); 
    ctx.stroke();
  }

  // Beams
  for (const b of state.beams) {
    if (images.beam) ctx.drawImage(images.beam, b.x, b.y, b.w, b.h);
    else { ctx.fillStyle="#9ff"; ctx.fillRect(b.x,b.y,b.w,b.h); }
  }

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
