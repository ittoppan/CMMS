"use client";

import { useEffect, useRef } from "react";

type Vec3 = { x: number; y: number; z: number };
type Pt = { x: number; y: number; z: number; s: number };
type Ripple = { x: number; y: number; r: number; a: number };

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

function gearPoints(teeth: number, outer: number, toothH: number): Vec3[] {
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
      { x: Math.cos(a0) * outer, y: Math.sin(a0) * outer, z: 0 },
      { x: Math.cos(a1) * outer, y: Math.sin(a1) * outer, z: 0 },
      { x: Math.cos(a2) * (outer + toothH), y: Math.sin(a2) * (outer + toothH), z: 0 },
      { x: Math.cos(a3) * (outer + toothH), y: Math.sin(a3) * (outer + toothH), z: 0 },
      { x: Math.cos(a4) * outer, y: Math.sin(a4) * outer, z: 0 },
      { x: Math.cos(a5) * outer, y: Math.sin(a5) * outer, z: 0 },
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

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // reduce-motion: ทุกอย่างยังเคลื่อนที่แต่ช้าลง 35% (calm) — ไม่ freeze สนิท
    const motionScale = reduced ? 0.35 : 1;
    let raf = 0;
    let t = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0;
    let H = 0;

    // ---- pointer parallax (-1..1, smoothed) + click ripples ----
    const mouse = { tx: 0, ty: 0, x: 0, y: 0 };
    const ripples: Ripple[] = [];
    const onMove = (e: PointerEvent) => {
      mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.ty = (e.clientY / window.innerHeight) * 2 - 1;
    };
    const onDown = (e: PointerEvent) => {
      if (reduced) return; // reduce-motion: ไม่ต้องมี ripple
      ripples.push({ x: e.clientX, y: e.clientY, r: 8, a: 0.2 });
      if (ripples.length > 5) ripples.shift();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });

    // ---- telemetry circuits: axis-aligned traces with traveling pulses ----
    type Pulse = { d: number; v: number; hue: number };
    type Circuit = { xs: number[]; ys: number[]; lens: number[]; total: number; pulses: Pulse[] };

    const buildCircuits = (): Circuit[] => {
      const list: Circuit[] = [];
      const count = W < 768 ? 0 : 7;
      for (let i = 0; i < count; i++) {
        const xs: number[] = [];
        const ys: number[] = [];
        let x = Math.random() * W;
        let y = Math.random() * H;
        xs.push(x);
        ys.push(y);
        let horiz = Math.random() > 0.5;
        let dir = Math.random() > 0.5 ? 1 : -1;
        const n = 3 + Math.floor(Math.random() * 3);
        for (let s = 0; s < n; s++) {
          const len = 50 + Math.random() * 150;
          if (horiz) x += dir * len;
          else y += dir * len;
          xs.push(x);
          ys.push(y);
          horiz = !horiz;
          if (Math.random() > 0.6) dir = -dir;
        }
        const lens: number[] = [];
        let total = 0;
        for (let s = 1; s < xs.length; s++) {
          const l = Math.abs(xs[s] - xs[s - 1]) + Math.abs(ys[s] - ys[s - 1]);
          lens.push(l);
          total += l;
        }
        const pulses: Pulse[] = [];
        const pc = 1 + Math.floor(Math.random() * 2);
        for (let p = 0; p < pc; p++) {
          pulses.push({ d: Math.random() * total, v: 45 + Math.random() * 80, hue: Math.random() > 0.5 ? 190 : 162 });
        }
        list.push({ xs, ys, lens, total, pulses });
      }
      return list;
    };

    let circuits: Circuit[] = [];

    const posAt = (c: Circuit, d0: number) => {
      let d = ((d0 % c.total) + c.total) % c.total;
      for (let s = 0; s < c.lens.length; s++) {
        if (d <= c.lens[s]) {
          const k = c.lens[s] ? d / c.lens[s] : 0;
          return { x: c.xs[s] + (c.xs[s + 1] - c.xs[s]) * k, y: c.ys[s] + (c.ys[s + 1] - c.ys[s]) * k };
        }
        d -= c.lens[s];
      }
      return { x: c.xs[c.xs.length - 1], y: c.ys[c.ys.length - 1] };
    };

    const particles = Array.from({ length: 84 }, () => ({
      x: (Math.random() - 0.5) * 900,
      y: (Math.random() - 0.5) * 700,
      z: Math.random() * 600 - 100,
      r: Math.random() * 1.8 + 0.4,
      v: Math.random() * 0.4 + 0.15,
      hue: Math.random() > 0.5 ? 195 : 165,
    }));

    const resize = () => {
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(W * dpr));
      canvas.height = Math.max(1, Math.floor(H * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      circuits = buildCircuits();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const drawGear = (
      cx: number, cy: number, cz: number,
      teeth: number, outer: number, toothH: number, thick: number,
      rx: number, ry: number, rz: number,
      color: string, glow: string, speed: number,
    ) => {
      const w = W, h = H;
      const ang = t * speed;
      const base = gearPoints(teeth, outer, toothH);
      const transform = (p: Vec3, zOff: number) => {
        let v = { x: p.x, y: p.y, z: zOff };
        v = rotZ(v, ang);
        v = rotX(v, rx);
        v = rotY(v, ry);
        v = rotZ(v, rz);
        v = { x: v.x + cx, y: v.y + cy, z: v.z + cz };
        return project(v, w, h, 720);
      };

      // breathing glow — machine "alive"
      ctx.globalAlpha = 0.8 + 0.2 * Math.sin(t * 1.8 + cx * 0.07);

      // side faces
      for (let side = 0; side < 2; side++) {
        const zOff = side === 0 ? -thick / 2 : thick / 2;
        ctx.beginPath();
        base.forEach((p, i) => {
          const q = transform(p, zOff);
          if (i === 0) ctx.moveTo(q.x, q.y);
          else ctx.lineTo(q.x, q.y);
        });
        ctx.closePath();
        ctx.fillStyle = side === 0 ? "rgba(10,30,45,0.35)" : color;
        ctx.shadowColor = glow;
        ctx.shadowBlur = side === 1 ? 12 : 0;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = glow;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      // rim connectors
      ctx.strokeStyle = glow;
      ctx.globalAlpha *= 0.35;
      for (let i = 0; i < base.length; i += 6) {
        const a = transform(base[i], -thick / 2);
        const b = transform(base[i], thick / 2);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      // hub
      const hub = transform({ x: 0, y: 0, z: 0 }, 0);
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(hub.x, hub.y, Math.max(3, outer * 0.18 * hub.s), 0, Math.PI * 2);
      ctx.fillStyle = glow;
      ctx.globalAlpha = 0.18 + 0.1 * Math.sin(t * 2 + cx * 0.1);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = glow;
      ctx.stroke();
    };

    const drawScene = () => {
      const w = W, h = H;
      if (!w || !h) return;
      const px = mouse.x, py = mouse.y;
      ctx.clearRect(0, 0, w, h);

      // ---- aurora color fields (drifting) ----
      const blob = (bx: number, by: number, r: number, hue: number, alpha: number) => {
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, r);
        g.addColorStop(0, `hsla(${hue}, 90%, 60%, ${alpha})`);
        g.addColorStop(1, "hsla(0, 0%, 0%, 0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      };
      blob(w * 0.32 + Math.sin(t * 0.5) * 40 - px * 30, h * 0.42 + Math.cos(t * 0.4) * 30 - py * 20, w * 0.45, 192, 0.1);
      blob(w * 0.76 + Math.cos(t * 0.35) * 60 - px * 18, h * 0.3 + Math.sin(t * 0.45) * 40 - py * 12, w * 0.38, 165, 0.08);
      blob(w * 0.55 + Math.sin(t * 0.25 + 2) * 80, h * 0.8 + Math.cos(t * 0.3) * 30, w * 0.5, 224, 0.06);

      // ---- perspective grid (slow conveyor drift) ----
      ctx.save();
      ctx.strokeStyle = "rgba(80, 200, 255, 0.1)";
      ctx.lineWidth = 1;
      const gy = h * 0.68;
      const drift = (t * 14) % 120;
      for (let i = -12; i <= 12; i++) {
        const x0 = w / 2 + i * 28 + drift;
        ctx.beginPath();
        ctx.moveTo(x0, gy);
        ctx.lineTo(w / 2 + i * 120 + drift, h + 40);
        ctx.stroke();
      }
      for (let j = 0; j < 10; j++) {
        const p = j / 10;
        const y = gy + p * p * (h - gy + 40);
        const span = 40 + p * w * 0.8;
        ctx.globalAlpha = 1 - p * 0.7;
        ctx.beginPath();
        ctx.moveTo(w / 2 - span, y);
        ctx.lineTo(w / 2 + span, y);
        ctx.stroke();
      }
      ctx.restore();

      // ---- telemetry circuits with traveling pulses ----
      if (circuits.length) {
        ctx.save();
        ctx.translate(px * 12, py * 9);
        for (const c of circuits) {
          ctx.beginPath();
          ctx.moveTo(c.xs[0], c.ys[0]);
          for (let s = 1; s < c.xs.length; s++) ctx.lineTo(c.xs[s], c.ys[s]);
          ctx.strokeStyle = "rgba(0, 205, 255, 0.1)";
          ctx.lineWidth = 1;
          ctx.stroke();
          // nodes
          ctx.fillStyle = "rgba(0, 230, 255, 0.35)";
          for (let s = 0; s < c.xs.length; s++) ctx.fillRect(c.xs[s] - 1.5, c.ys[s] - 1.5, 3, 3);
          // pulses
          for (const p of c.pulses) {
            p.d += (p.v / 60) * motionScale;
            const head = posAt(c, p.d);
            const tail = posAt(c, p.d - 20);
            const grd = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
            grd.addColorStop(0, `hsla(${p.hue}, 95%, 65%, 0)`);
            grd.addColorStop(1, `hsla(${p.hue}, 95%, 65%, 0.8)`);
            ctx.strokeStyle = grd;
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(tail.x, tail.y);
            ctx.lineTo(head.x, head.y);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(head.x, head.y, 2.2, 0, Math.PI * 2);
            ctx.fillStyle = `hsla(${p.hue}, 95%, 70%, 0.95)`;
            ctx.shadowColor = `hsla(${p.hue}, 95%, 60%, 0.9)`;
            ctx.shadowBlur = 9;
            ctx.fill();
            ctx.shadowBlur = 0;
          }
        }
        ctx.restore();
      }

      // ---- floating orbit rings ----
      ctx.save();
      ctx.translate(px * 22, py * 14);
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
          if (a === 0) ctx.moveTo(q.x, q.y);
          else ctx.lineTo(q.x, q.y);
        }
        ctx.strokeStyle = i === 1 ? "rgba(40, 240, 200, 0.22)" : "rgba(0, 210, 255, 0.18)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      ctx.restore();

      // ---- constellation particles + dynamic links ----
      const dots: { x: number; y: number; hue: number; r: number; a: number }[] = [];
      for (const p of particles) {
        p.y -= p.v * motionScale;
        p.x += Math.sin(t + p.z * 0.01) * 0.15 * motionScale;
        if (p.y < -380) {
          p.y = 380;
          p.x = (Math.random() - 0.5) * 900;
        }
        let v = { x: p.x, y: p.y, z: p.z };
        v = rotY(v, Math.sin(t * 0.3) * 0.25 + px * 0.14);
        v = rotX(v, 0.35 - py * 0.1);
        const q = project(v, w, h, 720);
        const a = Math.max(0, Math.min(1, (1 - q.z / 900) * 0.8));
        dots.push({ x: q.x, y: q.y, hue: p.hue, r: p.r * q.s, a });
      }
      if (w >= 768) {
        ctx.lineWidth = 1;
        for (let i = 0; i < dots.length; i++) {
          for (let j = i + 1; j < dots.length; j++) {
            const dx = dots[i].x - dots[j].x;
            const dy = dots[i].y - dots[j].y;
            const d2 = dx * dx + dy * dy;
            if (d2 < 7225) {
              const al = (1 - Math.sqrt(d2) / 85) * 0.15;
              ctx.strokeStyle = `rgba(0, 215, 255, ${al.toFixed(3)})`;
              ctx.beginPath();
              ctx.moveTo(dots[i].x, dots[i].y);
              ctx.lineTo(dots[j].x, dots[j].y);
              ctx.stroke();
            }
          }
        }
      }
      for (const d of dots) {
        ctx.beginPath();
        ctx.arc(d.x, d.y, Math.max(0.4, d.r), 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${d.hue}, 90%, 65%, ${d.a})`;
        ctx.fill();
      }

      // ---- gears (CMMS maintenance feel, parallax) ----
      const gx = px * 20, gyy = py * 13;
      drawGear(-120 + gx, -40 + gyy, 80, 12, 70, 12, 18, 0.55, t * 0.15, 0.1, "rgba(0,180,255,0.18)", "rgba(0,220,255,0.85)", 0.6);
      drawGear(95 + gx, -10 + gyy, 140, 16, 92, 12, 20, 0.6, -t * 0.1, -0.05, "rgba(0,210,170,0.16)", "rgba(40,240,200,0.8)", -0.42);
      drawGear(-10 + gx, 90 + gyy, 220, 10, 54, 10, 16, 0.7, t * 0.2, 0.2, "rgba(80,160,255,0.14)", "rgba(120,210,255,0.75)", 0.75);
      drawGear(170 + gx, 120 + gyy, 60, 8, 42, 9, 14, 0.45, -t * 0.12, 0.15, "rgba(0,200,220,0.14)", "rgba(0,230,255,0.7)", -0.9);

      // ---- radar sweep (condition monitoring) ----
      const rcx = w * 0.82, rcy = h * 0.72, R = Math.min(w, h) * 0.24;
      const ang = t * 1.4;
      if (typeof ctx.createConicGradient === "function") {
        const cg = ctx.createConicGradient(ang, rcx, rcy);
        cg.addColorStop(0, "rgba(0, 225, 255, 0)");
        cg.addColorStop(0.1, "rgba(0, 225, 255, 0.09)");
        cg.addColorStop(0.13, "rgba(0, 225, 255, 0)");
        cg.addColorStop(1, "rgba(0, 225, 255, 0)");
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.arc(rcx, rcy, R, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = "rgba(0, 225, 255, 0.14)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(rcx, rcy, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(rcx, rcy, R * 0.55, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        const ba = ang + i * 2.1;
        ctx.beginPath();
        ctx.arc(rcx + Math.cos(ba) * R * (0.4 + 0.25 * i), rcy + Math.sin(ba) * R * (0.4 + 0.25 * i), 2, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(64, 255, 210, 0.7)";
        ctx.fill();
      }

      // ---- scan line ----
      const sy = h * 0.15 + ((t * 60) % (h * 0.7));
      const sg = ctx.createLinearGradient(0, sy - 30, 0, sy + 30);
      sg.addColorStop(0, "rgba(0, 220, 255, 0)");
      sg.addColorStop(0.5, "rgba(0, 220, 255, 0.08)");
      sg.addColorStop(1, "rgba(0, 220, 255, 0)");
      ctx.fillStyle = sg;
      ctx.fillRect(0, sy - 30, w, 60);

      // ---- click ripples ----
      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i];
        rp.r += 3.4;
        rp.a *= 0.95;
        if (rp.a < 0.01) {
          ripples.splice(i, 1);
          continue;
        }
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0, 225, 255, ${rp.a.toFixed(3)})`;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, rp.r * 0.6, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(64, 255, 210, ${(rp.a * 0.7).toFixed(3)})`;
        ctx.stroke();
      }
    };

    const loop = () => {
      t += 0.008 * motionScale;
      mouse.x += (mouse.tx - mouse.x) * 0.045;
      mouse.y += (mouse.ty - mouse.y) * 0.045;
      drawScene();
      raf = requestAnimationFrame(loop);
    };

    // canvas เคลื่อนไหวตลอด — reduce-motion ใช้ความเร็ว 35% (calm mode)
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
    };
  }, []);

  return <canvas ref={ref} className="cmms-login-3d-canvas" aria-hidden="true" />;
}
