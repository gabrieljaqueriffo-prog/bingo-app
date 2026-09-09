// Dibujado bonito de personajes, tiles, enemigos y decoración de fondo.
// Se usa en el playground (#brosdev) y se puede reutilizar en el juego online.
import type { BrosPlayer, BrosTile, Enemy } from "./engine";

type Ctx = CanvasRenderingContext2D;

// Fondo con cielo, sol, nubes y colinas (con parallax).
export function drawBackground(ctx: Ctx, camX: number, opts?: { dusk?: boolean }) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const dusk = opts?.dusk;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  if (dusk) { grad.addColorStop(0, "#1b2a5e"); grad.addColorStop(0.6, "#5a4a8a"); grad.addColorStop(1, "#8a5f9e"); }
  else { grad.addColorStop(0, "#2f7fd1"); grad.addColorStop(0.55, "#6ab4ef"); grad.addColorStop(1, "#aee0ff"); }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const sunX = w - 110;
  ctx.fillStyle = "rgba(255,235,150,.9)";
  ctx.beginPath(); ctx.arc(sunX, 70, 34, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(255,255,220,.4)";
  ctx.beginPath(); ctx.arc(sunX, 70, 52, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(255,240,170,.5)"; ctx.lineWidth = 3;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(sunX + Math.cos(a) * 40, 70 + Math.sin(a) * 40);
    ctx.lineTo(sunX + Math.cos(a) * 58, 70 + Math.sin(a) * 58);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(255,255,255,.9)";
  const clouds = [
    { x: 120, y: 74, s: 1.1 }, { x: 420, y: 110, s: 0.8 }, { x: 700, y: 60, s: 1.3 },
    { x: 1000, y: 130, s: 0.7 }, { x: 1350, y: 80, s: 1 }, { x: 1700, y: 120, s: 0.9 },
  ] as const;
  for (const c of clouds) {
    const cx = (c.x - camX * 0.12) % (w + 400);
    const px = cx < -100 ? cx + w + 400 : cx;
    const sy = c.s;
    ctx.beginPath();
    ctx.ellipse(px, c.y, 34 * sy, 18 * sy, 0, 0, Math.PI * 2);
    ctx.ellipse(px + 26 * sy, c.y - 8, 24 * sy, 16 * sy, 0, 0, Math.PI * 2);
    ctx.ellipse(px + 54 * sy, c.y, 28 * sy, 14 * sy, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "rgba(78,158,83,.6)";
  ctx.beginPath(); ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += 80) ctx.lineTo(x, h - 150 + Math.sin((x + camX * 0.25) * 0.006) * 34);
  ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "rgba(58,128,66,.7)";
  ctx.beginPath(); ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += 80) ctx.lineTo(x, h - 118 + Math.sin((x + camX * 0.4) * 0.008) * 24);
  ctx.lineTo(w, h); ctx.closePath(); ctx.fill();

  // Arbustos decorativos con parallax cerca del nivel del suelo.
  ctx.fillStyle = "rgba(46,120,52,.85)";
  const bushes = [180, 520, 860, 1240, 1580, 1960, 2340] as const;
  for (const bx0 of bushes) {
    const bx = ((bx0 - camX * 0.5) % (w + 300) + w + 300) % (w + 300) - 150;
    const by = h - 96;
    ctx.beginPath();
    ctx.arc(bx, by, 22, Math.PI, 0);
    ctx.arc(bx + 26, by - 6, 28, Math.PI, 0);
    ctx.arc(bx + 52, by, 20, Math.PI, 0);
    ctx.closePath(); ctx.fill();
  }
}
export function drawTile(ctx: Ctx, t: BrosTile, gTick: number, open: boolean) {
  if (t.type === "ground") {
    // Cuerpo de tierra con textura de ladrillos + capa de pasto estilo Mario.
    ctx.fillStyle = "#9c6b36"; ctx.fillRect(t.x, t.y, t.w, t.h);
    ctx.strokeStyle = "rgba(0,0,0,.18)"; ctx.lineWidth = 1;
    for (let y = t.y + 14; y < t.y + t.h; y += 14) {
      ctx.beginPath(); ctx.moveTo(t.x, y + .5); ctx.lineTo(t.x + t.w, y + .5); ctx.stroke();
    }
    for (let y = t.y + 14, r = 0; y < t.y + t.h; y += 14, r++) {
      for (let x = t.x + (r % 2 ? 0 : 16); x < t.x + t.w; x += 32) {
        ctx.beginPath(); ctx.moveTo(x + .5, y - 14); ctx.lineTo(x + .5, y); ctx.stroke();
      }
    }
    // Sombra bajo el pasto y brillo arriba.
    ctx.fillStyle = "#58b84a"; ctx.fillRect(t.x, t.y, t.w, 12);
    ctx.fillStyle = "#78e062"; ctx.fillRect(t.x, t.y, t.w, 5);
    ctx.fillStyle = "rgba(0,0,0,.15)"; ctx.fillRect(t.x, t.y + 12, t.w, 3);
    // Mechones de pasto en el borde superior.
    ctx.fillStyle = "#8fe878";
    for (let x = t.x + 6; x < t.x + t.w - 4; x += 22) ctx.fillRect(x, t.y - 3, 3, 4);
    return;
  }
  if (t.type === "platform") {
    // Plataforma flotante de madera con soportes y borde de pasto.
    ctx.fillStyle = "#a86b32"; ctx.fillRect(t.x, t.y, t.w, t.h);
    ctx.fillStyle = "#8a5426";
    for (let x = t.x + 8; x < t.x + t.w - 6; x += 24) ctx.fillRect(x, t.y + t.h - 4, 3, 4);
    ctx.fillStyle = "#c88a45";
    for (let x = t.x + 4; x < t.x + t.w - 6; x += 18) ctx.fillRect(x, t.y + 6, 10, 3);
    ctx.fillStyle = "#58b84a"; ctx.fillRect(t.x, t.y, t.w, 6);
    ctx.fillStyle = "#78e062"; ctx.fillRect(t.x, t.y, t.w, 2);
    ctx.strokeStyle = "rgba(0,0,0,.3)"; ctx.strokeRect(t.x + .5, t.y + .5, t.w - 1, t.h - 1);
    return;
  }
  if (t.type === "coin") {
    const bob = Math.sin((gTick + t.x) * 0.1) * 2;
    const cy = t.y + t.h / 2 + bob;
    const cx = t.x + t.w / 2;
    ctx.fillStyle = "#c99700"; ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffd700"; ctx.beginPath(); ctx.arc(cx, cy - 1, 7.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff3b0"; ctx.beginPath(); ctx.arc(cx - 2, cy - 3, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#a97800"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, 8.5, 0, Math.PI * 2); ctx.stroke();
    return;
  }
  if (t.type === "crate") {
    // Caja de madera empujable: tablones y cruz de refuerzo.
    ctx.fillStyle = "#b5793a"; ctx.fillRect(t.x, t.y, t.w, t.h);
    ctx.fillStyle = "#8f5a26";
    ctx.fillRect(t.x, t.y, t.w, 4); ctx.fillRect(t.x, t.y + t.h - 4, t.w, 4);
    ctx.fillRect(t.x, t.y, 4, t.h); ctx.fillRect(t.x + t.w - 4, t.y, 4, t.h);
    ctx.strokeStyle = "#8f5a26"; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(t.x + 4, t.y + 4); ctx.lineTo(t.x + t.w - 4, t.y + t.h - 4);
    ctx.moveTo(t.x + t.w - 4, t.y + 4); ctx.lineTo(t.x + 4, t.y + t.h - 4);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.18)"; ctx.fillRect(t.x + 4, t.y + 4, t.w - 8, 3);
    return;
  }
  if (t.type === "plate") {
    ctx.fillStyle = t.both ? "#9b5fe0" : "#e8a13c"; ctx.fillRect(t.x, t.y, t.w, 8);
    ctx.fillStyle = t.both ? "#c084fc" : "#ffc46a"; ctx.fillRect(t.x, t.y, t.w, 5);
    ctx.fillStyle = "#fff"; ctx.font = "9px monospace"; ctx.textAlign = "center";
    ctx.fillText(t.both ? "2P" : "⊼", t.x + t.w / 2, t.y + 7);
    ctx.strokeStyle = "rgba(0,0,0,.3)"; ctx.strokeRect(t.x + .5, t.y + .5, t.w - 1, 8);
    return;
  }
  if (t.type === "gate") {
    if (open) return;
    ctx.fillStyle = "#6b7f96"; ctx.fillRect(t.x, t.y, t.w, t.h);
    ctx.fillStyle = "#8fa5bd"; ctx.fillRect(t.x + 2, t.y, t.w - 4, t.h);
    ctx.fillStyle = "#566a80";
    for (let y = t.y; y < t.y + t.h; y += 14) ctx.fillRect(t.x, y, t.w, 4);
    ctx.fillStyle = "#c00";
    for (let y = t.y + 4; y < t.y + t.h; y += 14) { ctx.fillRect(t.x + 3, y - 2, 4, 14); ctx.fillRect(t.x + t.w - 7, y - 2, 4, 14); }
    return;
  }
  if (t.type === "lever") {
    const on = open;
    ctx.fillStyle = "#7d8c9c"; ctx.fillRect(t.x, t.y, t.w, 9);
    const angle = on ? -Math.PI / 4 : Math.PI / 4;
    const bx = t.x + t.w / 2, by = t.y + 5;
    ctx.strokeStyle = on ? "#5bd44a" : "#f2c14e"; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + Math.sin(angle) * 16, by - Math.cos(angle) * 16); ctx.stroke();
    ctx.fillStyle = on ? "#a3e635" : "#fff";
    ctx.beginPath(); ctx.arc(bx + Math.sin(angle) * 19, by - Math.cos(angle) * 19, 4, 0, Math.PI * 2); ctx.fill();
    return;
  }
  if (t.type === "hook") {
    ctx.strokeStyle = "#e6e6e6"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(t.x + t.w / 2, t.y + t.h / 2, 8, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#9fb0c4"; ctx.beginPath(); ctx.arc(t.x + t.w / 2, t.y + t.h / 2, 3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${0.3 + Math.sin(gTick * 0.1) * 0.2})`;
    ctx.beginPath(); ctx.arc(t.x + t.w / 2, t.y + t.h / 2, 13, 0, Math.PI * 2); ctx.stroke();
    return;
  }
  if (t.type === "flag") {
    ctx.fillStyle = "#777"; ctx.fillRect(t.x + t.w / 2 - 2, t.y, 4, t.h);
    ctx.fillStyle = "#eeeee6"; ctx.beginPath(); ctx.arc(t.x + t.w / 2, t.y, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#e63946";
    ctx.beginPath(); ctx.moveTo(t.x + t.w / 2 + 2, t.y + 4); ctx.lineTo(t.x + t.w / 2 + 22, t.y + 12); ctx.lineTo(t.x + t.w / 2 + 2, t.y + 20); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.fillRect(t.x + t.w / 2 + 7, t.y + 9, 4, 5);
    return;
  }
  if (t.type === "power") {
    const pulse = 0.6 + Math.sin(gTick * 0.2 + t.x) * 0.4;
    ctx.fillStyle = `rgba(255,210,80,${pulse})`;
    ctx.beginPath(); ctx.arc(t.x + t.w / 2, t.y + t.h / 2, 11, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#ff9f2e"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(t.x + t.w / 2, t.y + t.h / 2, 11, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#ff9f2e"; ctx.font = "12px monospace"; ctx.textAlign = "center";
    ctx.fillText("★", t.x + t.w / 2, t.y + t.h / 2 + 4);
    return;
  }
  if (t.type === "block") {
    // Bloque "?" estilo Mario: dorado con "?" pulante; gastado = gris.
    const used = t.collected;
    ctx.fillStyle = used ? "#8a8f98" : "#f2a900";
    ctx.fillRect(t.x, t.y, t.w, t.h);
    ctx.fillStyle = used ? "#b4bac4" : "#ffd24f";
    ctx.fillRect(t.x + 3, t.y + 2, t.w - 6, t.h - 5);
    ctx.strokeStyle = used ? "#5c6169" : "#a06a00";
    ctx.lineWidth = 2;
    ctx.strokeRect(t.x + 1.5, t.y + 1.5, t.w - 3, t.h - 3);
    // 4 remaches en las esquinas
    ctx.fillStyle = used ? "#5c6169" : "#a06a00";
    ctx.fillRect(t.x + 2, t.y + 2, 3, 3); ctx.fillRect(t.x + t.w - 5, t.y + 2, 3, 3);
    ctx.fillRect(t.x + 2, t.y + t.h - 5, 3, 3); ctx.fillRect(t.x + t.w - 5, t.y + t.h - 5, 3, 3);
    if (!used) {
      const bob = Math.sin(gTick * 0.12) * 1.5;
      ctx.fillStyle = "#7a4a00";
      ctx.font = "bold 16px monospace"; ctx.textAlign = "center";
      ctx.fillText("?", t.x + t.w / 2, t.y + t.h / 2 + 6 + bob);
    }
    return;
  }
  if (t.type === "feather") {
    // Pluma (poder de vuelo): blanca con tallo, flota y destella.
    const bob = Math.sin(gTick * 0.1 + t.x) * 2;
    const cx = t.x + t.w / 2, cy = t.y + t.h / 2 + bob;
    ctx.fillStyle = "rgba(255,255,255,.15)"; ctx.beginPath();
    ctx.arc(cx, cy, 14 + Math.sin(gTick * 0.1) * 2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = "#ffd24f"; ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + 5, cy - 9); ctx.stroke();
    return;
  }
  if (t.type === "heart") {
    const cx = t.x + t.w / 2, cy = t.y + t.h / 2 + Math.sin(gTick * 0.1) * 2;
    ctx.fillStyle = "#e63946";
    ctx.beginPath(); ctx.moveTo(cx, cy + 5);
    ctx.bezierCurveTo(cx - 9, cy - 3, cx - 5, cy - 11, cx, cy - 6);
    ctx.bezierCurveTo(cx + 5, cy - 11, cx + 9, cy - 3, cx, cy + 5);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.6)";
    ctx.beginPath(); ctx.arc(cx - 3, cy - 4, 2, 0, Math.PI * 2); ctx.fill();
    return;
  }
}
export function drawPlayer(ctx: Ctx, p: BrosPlayer, gTick: number) {
  const isRed = p.id === "red";
  const base = isRed ? "#e63946" : "#3a86ff";
  const dark = isRed ? "#8f1620" : "#1f56a8";
  const skin = "#ffd9b0";
  const hair = isRed ? "#d35400" : "#f2c14e";
  const walk = p.onGround && Math.abs(p.vx) > 0;
  const legSwing = walk ? Math.sin(p.anim * Math.PI * 2 * 2) : 0;
  const jumpPose = !p.onGround ? 1 : 0;

  // Sombra sobre el piso (da sensación de que toca el suelo)
  if (p.onGround) {
    ctx.fillStyle = "rgba(0,0,0,.25)";
    ctx.beginPath();
    ctx.ellipse(p.x + p.width / 2, p.y + p.height + 2, p.width * 0.55, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const cx = p.x + p.width / 2;
  const bottom = p.y + p.height;
  const bodyW = p.width * 0.66;
  const bodyH = p.height * 0.42;
  const bodyTop = bottom - bodyH - p.height * 0.16;
  const legY = bodyTop + bodyH;

  // Piernas
  ctx.strokeStyle = dark; ctx.lineWidth = 6; ctx.lineCap = "round";
  const lift = (1 - legSwing) * 4 * (1 - jumpPose);
  ctx.beginPath();
  ctx.moveTo(cx - 6, legY);
  ctx.lineTo(cx - 8 + legSwing * 3, legY + (p.height * 0.16) + (jumpPose ? 3 : 0) - lift);
  ctx.moveTo(cx + 6, legY);
  ctx.lineTo(cx + 8 - legSwing * 3, legY + (p.height * 0.16) + (jumpPose ? 3 : 0) + lift);
  ctx.stroke();

  // Botas
  ctx.fillStyle = "#1d1d1d";
  ctx.fillRect(cx - 9 + legSwing * 3, legY + p.height * 0.14 - lift, 8, 5);
  ctx.fillRect(cx + 1 - legSwing * 3, legY + p.height * 0.14 + lift, 8, 5);

  // Cuerpo
  ctx.fillStyle = dark;
  ctx.fillRect(cx - bodyW / 2, bodyTop + 3, bodyW, bodyH - 3);
  ctx.fillStyle = base;
  ctx.fillRect(cx - bodyW / 2, bodyTop, bodyW, bodyH - 3);
  // Pechera
  ctx.fillStyle = "#31508f";
  ctx.fillRect(cx - bodyW / 2 + 2, bodyTop + bodyH * 0.4, bodyW - 4, 4);

  // Brazos
  ctx.strokeStyle = base; ctx.lineWidth = 5; ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - bodyW / 2, bodyTop + 6);
  ctx.lineTo(cx - bodyW / 2 - 4 + ((p.facing === "right") ? 0 : -2), bodyTop + 12);
  ctx.moveTo(cx + bodyW / 2, bodyTop + 6);
  ctx.lineTo(cx + bodyW / 2 + 4 - ((p.facing === "right") ? -2 : 0), bodyTop + 12);
  ctx.stroke();

  // Cabeza
  const headR = p.width * 0.5;
  const headCY = bodyTop - headR;
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(cx, headCY, headR, 0, Math.PI * 2); ctx.fill();
  // Cabello/gorra (el ladrón de gorros puede haberte dejado pelado)
  if (p.hatLost) {
    ctx.fillStyle = hair;
    ctx.beginPath(); ctx.arc(cx, headCY - headR * 0.35, headR * 0.85, Math.PI, 0); ctx.fill();
    ctx.fillRect(cx - headR, headCY - headR * 0.5, headR * 2, headR * 0.4);
    // Pelo despeinado por el susto
    ctx.fillRect(cx - headR * 0.7, headCY - headR * 1.05, 3, 6);
    ctx.fillRect(cx + headR * 0.3, headCY - headR * 1.05, 3, 6);
  } else {
    ctx.fillStyle = hair;
    ctx.beginPath(); ctx.arc(cx, headCY - headR * 0.35, headR * 0.85, Math.PI, 0); ctx.fill();
    ctx.fillRect(cx - headR, headCY - headR * 0.5, headR * 2, headR * 0.4);
    ctx.fillStyle = isRed ? "#e63946" : "#3a86ff";
    ctx.beginPath(); ctx.arc(cx, headCY - headR * 0.4, headR * 0.95, Math.PI, 0); ctx.fill();
    ctx.fillRect(cx - headR, headCY - headR * 0.42, headR * 2, headR * 0.42);
  }

  // Ojos
  const eyeY = headCY - headR * 0.1;
  const eyeDX = p.facing === "right" ? headR * 0.35 : -headR * 0.35;
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.arc(cx + eyeDX - headR * 0.2, eyeY, headR * 0.22, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + eyeDX + headR * 0.2, eyeY, headR * 0.22, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#111";
  const pupDX = p.facing === "right" ? 1.5 : -1.5;
  ctx.beginPath(); ctx.arc(cx + eyeDX - headR * 0.2 + pupDX, eyeY, headR * 0.11, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + eyeDX + headR * 0.2 + pupDX, eyeY, headR * 0.11, 0, Math.PI * 2); ctx.fill();

  // Antena
  ctx.strokeStyle = dark; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx, headCY - headR); ctx.lineTo(cx + 3, headCY - headR - 8); ctx.stroke();
  ctx.fillStyle = "#ffd700";
  ctx.beginPath(); ctx.arc(cx + 3, headCY - headR - 9, 2.5, 0, Math.PI * 2); ctx.fill();
}

export function drawEnemy(ctx: Ctx, e: Enemy, gTick: number) {
  const bobY = e.flyer ? e.baseY! + Math.sin(gTick * 0.1 + e.x * 0.01) * 14 : e.y;
  const pulse = Math.sin(gTick * 0.15 + e.x) * 4;
  const w = e.w + (e.boss ? pulse * 0.2 : 0);
  // Ladrón de gorros: bandido morado con antifaz (y el gorro robado si lo tiene).
  if (e.thief) {
    ctx.fillStyle = "#6a3fb5";
    ctx.fillRect(e.x, bobY, e.w, e.h);
    // Antifaz negro
    ctx.fillStyle = "#111";
    ctx.fillRect(e.x + 2, bobY + e.h * 0.22, e.w - 4, 7);
    ctx.fillStyle = "#fff";
    const ex = e.dir > 0 ? 2 : 0;
    ctx.fillRect(e.x + e.w * 0.2 + ex, bobY + e.h * 0.24, 5, 5);
    ctx.fillRect(e.x + e.w * 0.62 + ex, bobY + e.h * 0.24, 5, 5);
    ctx.fillStyle = "#000";
    ctx.fillRect(e.x + e.w * 0.2 + ex + 2, bobY + e.h * 0.26, 2, 3);
    ctx.fillRect(e.x + e.w * 0.62 + ex + 2, bobY + e.h * 0.26, 2, 3);
    ctx.fillStyle = "#1b0a24";
    ctx.fillRect(e.x + 2, bobY + e.h - 6, 5, 6);
    ctx.fillRect(e.x + e.w - 7, bobY + e.h - 6, 5, 6);
    // Muestra el gorro robado con el color de su dueño
    if (e.hasHat) {
      ctx.fillStyle = e.hasHat === "red" ? "#e63946" : "#3a86ff";
      ctx.beginPath(); ctx.arc(e.x + e.w / 2, bobY - 2, e.w * 0.42, Math.PI, 0); ctx.fill();
      ctx.fillRect(e.x + 2, bobY - 3, e.w - 4, 4);
    }
    return;
  }
  ctx.fillStyle = e.boss ? "#7b2fbe" : e.flyer ? "#31c46a" : "#c33c8a";
  ctx.fillRect(e.x - (w - e.w) / 2, bobY, w, e.h);
  ctx.fillStyle = "#fff";
  const eyeY = bobY + e.h * 0.3;
  const ex = e.dir > 0 ? 2 : 0;
  ctx.fillRect(e.x + e.w * 0.2 + ex, eyeY, 5, 6);
  ctx.fillRect(e.x + e.w * 0.62 + ex, eyeY, 5, 6);
  ctx.fillStyle = "#000";
  ctx.fillRect(e.x + e.w * 0.2 + ex + 2, eyeY + 1, 2, 3);
  ctx.fillRect(e.x + e.w * 0.62 + ex + 2, eyeY + 1, 2, 3);
  ctx.fillStyle = "#1b0a24";
  ctx.fillRect(e.x + 2, bobY + e.h - 6, 5, 6);
  ctx.fillRect(e.x + e.w - 7, bobY + e.h - 6, 5, 6);
  if (e.boss) {
    ctx.fillStyle = "#f2c14e";
    ctx.fillRect(e.x + 2, bobY - 6, 5, 8);
    ctx.fillRect(e.x + e.w - 7, bobY - 6, 5, 8);
  }
}