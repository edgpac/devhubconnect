/**
 * Generates public/og-image.png — 1200×630, DevHubConnect brand
 * Run: node scripts/generate-og-image.mjs
 */
import { createCanvas } from 'canvas';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'public', 'og-image.png');

const W = 1200;
const H = 630;

const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');

// ── Background: dark gradient ──────────────────────────────────────────────
const bg = ctx.createLinearGradient(0, 0, W, H);
bg.addColorStop(0,   '#030712'); // gray-950
bg.addColorStop(0.5, '#042f2e'); // teal-950
bg.addColorStop(1,   '#030712');
ctx.fillStyle = bg;
ctx.fillRect(0, 0, W, H);

// ── Subtle grid lines ──────────────────────────────────────────────────────
ctx.strokeStyle = 'rgba(255,255,255,0.04)';
ctx.lineWidth = 1;
const GRID = 60;
for (let x = 0; x <= W; x += GRID) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
for (let y = 0; y <= H; y += GRID) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

// ── Teal glow blob (top-right) ─────────────────────────────────────────────
const glow = ctx.createRadialGradient(950, 120, 0, 950, 120, 380);
glow.addColorStop(0,   'rgba(20,184,166,0.18)');
glow.addColorStop(0.5, 'rgba(13,148,136,0.08)');
glow.addColorStop(1,   'rgba(0,0,0,0)');
ctx.fillStyle = glow;
ctx.fillRect(0, 0, W, H);

// ── Badge pill: "Powered by Claude AI" ────────────────────────────────────
const PILL_X = 88, PILL_Y = 110, PILL_W = 230, PILL_H = 32, PILL_R = 16;
ctx.strokeStyle = 'rgba(20,184,166,0.45)';
ctx.fillStyle   = 'rgba(20,184,166,0.12)';
ctx.lineWidth = 1;
ctx.beginPath();
ctx.roundRect(PILL_X, PILL_Y, PILL_W, PILL_H, PILL_R);
ctx.fill();
ctx.stroke();
ctx.fillStyle = '#5eead4'; // teal-300
ctx.font = 'bold 14px sans-serif';
ctx.fillText('⚡  Powered by Claude AI', PILL_X + 16, PILL_Y + 21);

// ── Logo / brand name ──────────────────────────────────────────────────────
ctx.fillStyle = '#ffffff';
ctx.font = 'bold 52px sans-serif';
ctx.fillText('DevHub', 88, 215);
ctx.fillStyle = '#2dd4bf'; // teal-400
ctx.fillText('Connect', 88 + ctx.measureText('DevHub').width + 4, 215);

// ── Tagline ────────────────────────────────────────────────────────────────
ctx.fillStyle = '#94a3b8'; // slate-400
ctx.font = '24px sans-serif';
ctx.fillText('Build n8n Workflows with Claude AI', 88, 264);

// ── Divider ────────────────────────────────────────────────────────────────
ctx.strokeStyle = 'rgba(255,255,255,0.08)';
ctx.lineWidth = 1;
ctx.beginPath(); ctx.moveTo(88, 295); ctx.lineTo(W - 88, 295); ctx.stroke();

// ── Feature pills (3 columns) ─────────────────────────────────────────────
const features = [
  { icon: '📦', label: '500+ n8n Templates' },
  { icon: '🤖', label: 'AI Workflow Studio' },
  { icon: '⚡', label: 'Prompt Combos' },
];
const FEAT_Y = 330;
const COL_W  = (W - 176) / features.length;

features.forEach((f, i) => {
  const x = 88 + i * COL_W;
  const bW = COL_W - 24, bH = 72, bR = 14;
  // card bg
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(x, FEAT_Y, bW, bH, bR); ctx.fill(); ctx.stroke();
  // icon
  ctx.font = '26px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(f.icon, x + 20, FEAT_Y + 44);
  // label
  ctx.font = 'bold 17px sans-serif';
  ctx.fillStyle = '#e2e8f0'; // slate-200
  ctx.fillText(f.label, x + 60, FEAT_Y + 44);
});

// ── URL strip ─────────────────────────────────────────────────────────────
ctx.fillStyle = '#475569'; // slate-600
ctx.font = '16px sans-serif';
ctx.fillText('www.devhubconnect.com', 88, H - 40);

// ── Write PNG ─────────────────────────────────────────────────────────────
const buf = canvas.toBuffer('image/png');
writeFileSync(OUT, buf);
console.log(`✅  og-image.png written → ${OUT}`);
