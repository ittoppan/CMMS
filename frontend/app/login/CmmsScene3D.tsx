"use client";

import { useEffect, useRef } from "react";

type Vec3 = { x: number; y: number; z: number };
type Pt = { x: number; y: number; z: number; s: number };

function rotX(p: Vec3, a: number): Vec3 {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c };
}
function rotY(p: Vec3, a: number): Vec3 {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c };
}
function rotZ(p: Vec3, a: number): Vec3 {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c, z: p.z };
}

function project(p: Vec3, w: number, h: number, fov: number): Pt {
  const z = p.z + fov;
  const s = fov / (z || 1);
  return { x: w / 2 + p.x * s, y: h / 2 + p.y * s, z, s };
}

function gearPoints(teeth: number, inner: number, outer: number, toothH: number, depth: number) {
  const pts: Vec3[] = [];
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a0 = i * step;
    const a1 = a0 + step * 0.22;
    const a2 = a0 + step * 0.28;
    const a3 = a0 + step * 0.5;
    const a4 = a0 + step * 0.72;
    const a5 = a0 + step * 0.78;
    pts.push(
      { x: Math.cos(a0) * outer, y: Math.sin(a0) * outer, z: depth },
      { x: Math.cos(a1) * outer, y: Math.sin(a1) * outer, z: depth },
      { x: Math.cos(a2) * (outer + toothH), y: Math.sin(a2) * (outer + toothH), z: depth },
      { x: Math.cos(a3) * (outer + toothH), y: Math.sin(a3) * (outer + toothH), z: depth },
      { x: Math.cos(a4) * outer, y: Math.sin(a4) * outer, z: depth },
      { x: Math.cos(a5) * outer, y: Math.sin(a5) * outer, z: depth },
    );
  }
  return pts;
}

export default function CmmsScene3D() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let t = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const { clientWidth, clientHeight } = canvas;
      canvas.width = Math.max(1, Math.floor(clientWidth * dpr));
      canvas.height = Math.max(1, Math.floor(clientHeight * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const particles = Array.from({ length: 70 }, () => ({
      x: (Math.random() - 0.5) * 900,
      y: (Math.random() - 0.5) * 700,
      z: Math.random() * 600 - 100,
      r: Math.random() * 1.8 + 0.4,
      v: Math.random() * 0.4 + 0.15,
      hue: Math.random() > 0.5 ? 195 : 165,
    }));

    const drawGear = (
      cx: number, cy: number, cz: number,
      teeth: number, outer: number, toothH: number, thick: number,
      rx: number, ry: number, rz: number,
      color: string, glow: string, speed: number
    ) => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      const ang = t * speed;
      const base = gearPoints(teeth, outer * 0.55, outer, toothH, 0);
      const transform = (p: Vec3, zOff: number) => {
        let v = { x: p.x, y: p.y, z: zOff };
        v = rotZ(v, ang);
        v = rotX(v, rx);
        v = rotY(v, ry);
        v = rotZ(v, rz);
        v = { x: v.x + cx, y: v.y + cy, z: v.z + cz };
        return project(v, w, h, 720);
      };

      // side faces
      for (let side = 0; side < 2; side++) {
        const zOff = side === 0 ? -thick / 2 : thick / 2;
        ctx.beginPath();
        base.forEach((p, i) => {
          const q = transform(p, zOff);
          if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
        });
        ctx.closePath();
        ctx.fillStyle = side === 0 ? "rgba(10,30,45,0.35)" : color;
        ctx.fill();
        ctx.strokeStyle = glow;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      // spokes/rim connectors
      ctx.strokeStyle = glow;
      ctx.globalAlpha = 0.35;
      for (let i = 0; i < base.length; i += 6) {
        const a = transform(base[i], -thick / 2);
        const b = transform(base[i], thick / 2);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // hub
      const hubA = project(rotY(rotX(rotZ({ x: 0, y: 0, z: -thick / 2 }, ang), rx), ry), w, h, 720) as any;
      const hub = transform({ x: 0, y: 0, z: 0 }, 0);
      ctx.beginPath();
      ctx.arc(hub.x, hub.y, Math.max(3, outer * 0.18 * hub.s), 0, Math.PI * 2);
      ctx.fillStyle = glow;
      ctx.globalAlpha = 0.25;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = glow;
      ctx.stroke();
    };

    const draw = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      t += 0.008;
      ctx.clearRect(0, 0, w, h);

      // background glow
      const g1 = ctx.createRadialGradient(w * 0.35, h * 0.45, 20, w * 0.35, h * 0.45, w * 0.7);
      g1.addColorStop(0, "rgba(0, 190, 255, 0.18)");
      g1.addColorStop(0.45, "rgba(0, 120, 180, 0.08)");
      g1.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, w, h);
      const g2 = ctx.createRadialGradient(w * 0.75, h * 0.3, 10, w * 0.75, h * 0.3, w * 0.5);
      g2.addColorStop(0, "rgba(16, 220, 170, 0.12)");
      g2.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, w, h);

      // perspective grid
      ctx.save();
      ctx.strokeStyle = "rgba(80, 200, 255, 0.12)";
      ctx.lineWidth = 1;
      const gy = h * 0.68;
      for (let i = -12; i <= 12; i++) {
        const x0 = w / 2 + i * 28;
        ctx.beginPath(); ctx.moveTo(x0, gy); ctx.lineTo(w / 2 + i * 120, h + 40); ctx.stroke();
      }
      for (let j = 0; j < 10; j++) {
        const p = j / 10;
        const y = gy + p * p * (h - gy + 40);
        const span = 40 + p * w * 0.8;
        ctx.globalAlpha = 1 - p * 0.7;
        ctx.beginPath(); ctx.moveTo(w / 2 - span, y); ctx.lineTo(w / 2 + span, y); ctx.stroke();
      }
      ctx.restore();

      // particles
      for (const p of particles) {
        p.y -= p.v;
        p.x += Math.sin(t + p.z * 0.01) * 0.15;
        if (p.y < -380) { p.y = 380; p.x = (Math.random() - 0.5) * 900; }
        let v = { x: p.x, y: p.y, z: p.z };
        v = rotY(v, Math.sin(t * 0.3) * 0.25);
        v = rotX(v, 0.35);
        const q = project(v, w, h, 720);
        const a = Math.max(0, Math.min(1, (1 - q.z / 900) * 0.8));
        ctx.beginPath();
        ctx.arc(q.x, q.y, p.r * q.s, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 90%, 65%, ${a})`;
        ctx.fill();
      }

      // gears (CMMS maintenance feel)
      drawGear(-120, -40, 80, 12, 70, 12, 18, 0.55, t * 0.15, 0.1, "rgba(0,180,255,0.18)", "rgba(0,220,255,0.85)", 0.6);
      drawGear(95, -10, 140, 16, 92, 12, 20, 0.6, -t * 0.1, -0.05, "rgba(0,210,170,0.16)", "rgba(40,240,200,0.8)", -0.42);
      drawGear(-10, 90, 220, 10, 54, 10, 16, 0.7, t * 0.2, 0.2, "rgba(80,160,255,0.14)", "rgba(120,210,255,0.75)", 0.75);
      drawGear(170, 120, 60, 8, 42, 9, 14, 0.45, -t * 0.12, 0.15, "rgba(0,200,220,0.14)", "rgba(0,230,255,0.7)", -0.9);

      // floating rings (asset/monitoring orbits)
      for (let i = 0; i < 3; i++) {
        const R = 180 + i * 55;
        const tilt = 0.9 + i * 0.25;
        ctx.beginPath();
        for (let a = 0; a <= Math.PI * 2.01; a += 0.05) {
          let v = { x: Math.cos(a + t * (0.2 + i * 0.07)) * R, y: Math.sin(a + t * (0.2 + i * 0.07)) * R * 0.35, z: Math.sin(a) * R * 0.15 };
          v = rotX(v, tilt);
          v = rotY(v, t * 0.12 + i);
          v = { x: v.x + 20, y: v.y - 20, z: v.z + 160 };
          const q = project(v, w, h, 720);
          if (a === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
        }
        ctx.strokeStyle = i === 1 ? "rgba(40,240,200,0.22)" : "rgba(0,210,255,0.18)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      // scan line
      const sy = (h * 0.15) + ((t * 60) % (h * 0.7));
      const sg = ctx.createLinearGradient(0, sy - 30, 0, sy + 30);
      sg.addColorStop(0, "rgba(0,220,255,0)");
      sg.addColorStop(0.5, "rgba(0,220,255,0.08)");
      sg.addColorStop(1, "rgba(0,220,255,0)");
      ctx.fillStyle = sg;
      ctx.fillRect(0, sy - 30, w, 60);

      raf = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={ref} className="cmms-login-3d-canvas" aria-hidden="true" />;
}
