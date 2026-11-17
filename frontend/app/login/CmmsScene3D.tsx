"use client";

import { useEffect, useRef } from "react";

type Ripple = { x: number; y: number; r: number; a: number };

/**
 * CmmsScene3D — "Digital Sensor Terrain"
 * ภูมิประเทศคลื่น 3D แบบ wireframe grid (มองมุมสูง) แทนพื้นผิว sensor data
 * - คลื่นหลายชั้นเคลื่อนที่ช้าๆ  สีไล่ตามความสูง (ฟ้า → มิ้นต์)
 * - Scan sweep พาดผ่าน: กริดช่วงนั้นสว่าง/ยกตัวขึ้นเหมือนถูกสแกน
 * - Sensor nodes: เสาเซ็นเซอร์บนเนิน + วงแหวน pulse (เครื่องจักรที่ถูกมอนิเตอร์)
 * - Parallax ตามเมาส์ + click ripple
 */

export default function CmmsScene3D() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // reduce-motion: ทุกอย่างยังเคลื่อนที่แต่ช้าลง (calm mode) — ไม่ freeze สนิท
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
      if (reduced) return;
      ripples.push({ x: e.clientX, y: e.clientY, r: 8, a: 0.18 });
      if (ripples.length > 5) ripples.shift();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });

    // ---- terrain grid (world space) ----
    // กล้องบินเหนือภูมิประเทศ: สูง CAM_H, ก้มลง PITCH (horizon อยู่ ~0.30h),
    // แกน y โลกชี้ขึ้น — ผิวดินอยู่ที่ wy ≈ -CAM_H, ยอดคลื่น wy สูงกว่านั้น
    const CAM_H = 360;
    const PITCH = 0.196;
    const FOV = 900;
    const CP = Math.cos(PITCH);
    const SP = Math.sin(PITCH);

    const NX = 46;
    const NZ = 26;
    const XS: number[] = [];
    for (let i = 0; i < NX; i++) XS.push(-950 + (i * 1900) / (NX - 1));
    const ZS: number[] = [];
    for (let j = 0; j < NZ; j++) ZS.push(30 + Math.pow(j / (NZ - 1), 1.3) * 1570);

    // คลื่นผิว (sensor data landscape) — หลายชั้นซ้อนกันให้เป็นเนินธรรมชาติ
    const heightAt = (wx: number, wz: number, tt: number) =>
      Math.sin(wx * 0.0032 + tt * 0.8) * 24 +
      Math.sin(wz * 0.0046 - tt * 0.55) * 18 +
      Math.sin((wx + wz) * 0.0021 + tt * 0.35) * 24 +
      Math.sin(wx * 0.009 - tt * 1.1) * 8 +
      Math.cos(wz * 0.008 + tt * 0.9) * 8;
    const H_MAX = 82;

    // ตำแหน่ง sensor node (world) — ตัวแทนเครื่องจักรที่ถูกมอนิเตอร์
    const SENSORS = [
      { x: -640, z: 540, ph: 0.0 },
      { x: -210, z: 900, ph: 0.6 },
      { x: 330, z: 660, ph: 1.2 },
      { x: 720, z: 1020, ph: 1.8 },
      { x: 40, z: 400, ph: 2.4 },
      { x: 540, z: 1280, ph: 3.0 },
      { x: -440, z: 1180, ph: 3.6 },
      { x: 860, z: 430, ph: 4.2 },
    ];

    // dust ลอยบนฟ้า + stars นิ่งกะพริบ
    const dust = Array.from({ length: 26 }, () => ({
      x: Math.random(),
      y: Math.random() * 0.55,
      v: 0.02 + Math.random() * 0.05,
      r: 0.8 + Math.random() * 1.1,
      a: 0.1 + Math.random() * 0.25,
    }));
    const stars = Array.from({ length: 42 }, () => ({
      x: Math.random(),
      y: Math.random() * 0.5,
      r: 0.6 + Math.random() * 1.1,
      ph: Math.random() * Math.PI * 2,
      sp: 0.6 + Math.random() * 1.6,
    }));

    const resize = () => {
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(W * dpr));
      canvas.height = Math.max(1, Math.floor(H * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const drawScene = () => {
      const w = W, h = H;
      if (!w || !h) return;
      const px = mouse.x, py = mouse.y;
      ctx.clearRect(0, 0, w, h);

      const yaw = -0.14 + px * 0.055;
      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      const yBase = h * 0.3 + py * 12;

      // project world -> screen: yaw รอบ Y แล้ว pitch ก้มลงรอบ X
      // แกน y โลกชี้ขึ้น → สูตรมาตรฐาน screen_y = yBase - y2*s
      // (เดิมบวก y2 ทำให้ภูมิประเทศกลับหัว — ผิวดินลอยเหนือ horizon)
      const project = (wx: number, wy: number, wz: number) => {
        const x1 = wx * cy - wz * sy;
        const z1 = wx * sy + wz * cy;
        const y2 = wy * CP + z1 * SP;
        const z2 = -wy * SP + z1 * CP;
        const zz = z2 + FOV;
        const s = FOV / (zz || 1);
        return { x: w / 2 + x1 * s, y: yBase - y2 * s, s };
      };

      // ---- aurora color fields (จางๆ ด้านบน) ----
      const blob = (bx: number, by: number, r: number, hue: number, alpha: number) => {
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, r);
        g.addColorStop(0, `hsla(${hue}, 90%, 60%, ${alpha})`);
        g.addColorStop(1, "hsla(0, 0%, 0%, 0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      };
      blob(w * 0.3 + Math.sin(t * 0.4) * 40 - px * 24, h * 0.24 + Math.cos(t * 0.32) * 24 - py * 14, w * 0.42, 194, 0.09);
      blob(w * 0.78 + Math.cos(t * 0.3) * 55 - px * 14, h * 0.16 + Math.sin(t * 0.38) * 30 - py * 8, w * 0.36, 163, 0.07);

      // ---- stars กะพริบเบา (ครึ่งบน) ----
      ctx.fillStyle = "#bfeaff";
      for (const st of stars) {
        const tw = 0.14 + 0.16 * (0.5 + 0.5 * Math.sin(t * st.sp * 2 + st.ph));
        ctx.globalAlpha = tw;
        ctx.beginPath();
        ctx.arc(st.x * w, st.y * h, st.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // ---- dust ลอยช้าๆ ----
      for (const d of dust) {
        if (!reduced) {
          d.y -= d.v * 0.0016;
          if (d.y < -0.02) d.y = 0.6;
        }
        ctx.globalAlpha = d.a;
        ctx.fillStyle = "rgba(140, 230, 255, 1)";
        ctx.beginPath();
        ctx.arc(d.x * w, d.y * h, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // ---- horizon glow line ----
      const hg = ctx.createLinearGradient(0, yBase - 60, 0, yBase + 2);
      hg.addColorStop(0, "rgba(0, 210, 255, 0)");
      hg.addColorStop(1, "rgba(0, 210, 255, 0.07)");
      ctx.fillStyle = hg;
      ctx.fillRect(0, yBase - 60, w, 62);

      // ---- terrain points ----
      // scan sweep: ตำแหน่ง z ที่กำลังถูกสแกน
      const scanZ = 30 + ((t * 180) % 1600);
      const scanLit = (wz: number) => Math.exp(-Math.pow((wz - scanZ) / 95, 2));

      const rows: { x: number; y: number; s: number; hue: number; a: number }[][] = [];
      for (let j = 0; j < NZ; j++) {
        const wz = ZS[j];
        const fog = Math.max(0.07, Math.min(0.8, 1.18 - (j / (NZ - 1)) * 1.12));
        const lit = scanLit(wz);
        const row: { x: number; y: number; s: number; hue: number; a: number }[] = [];
        for (let i = 0; i < NX; i++) {
          const wx = XS[i];
          const hn = (heightAt(wx, wz, t) + H_MAX) / (H_MAX * 2);
          const p = project(wx, heightAt(wx, wz, t) * motionScale + lit * 12 - CAM_H, wz);
          const hue = 205 - hn * 45 + lit * 12;
          const a = Math.min(1, fog * (0.35 + hn * 0.5) + lit * 0.35);
          row.push({ x: p.x, y: p.y, s: p.s, hue, a });
        }
        rows.push(row);
      }

      // เส้นตามแนวความลึก (z) — ทุก 3 คอลัมน์
      ctx.lineWidth = 1;
      for (let i = 0; i < NX; i += 3) {
        ctx.beginPath();
        for (let j = 0; j < NZ; j++) {
          const p = rows[j][i];
          if (j === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.strokeStyle = `rgba(70, 200, 255, ${0.09 + 0.06 * scanLit(ZS[NZ - 1])})`;
        ctx.stroke();
      }

      // เส้นตามแนวกว้าง (x) — ทุกแถว
      for (let j = 0; j < NZ; j++) {
        const fog = Math.max(0.07, Math.min(0.8, 1.18 - (j / (NZ - 1)) * 1.12));
        const lit = scanLit(ZS[j]);
        ctx.beginPath();
        for (let i = 0; i < NX; i++) {
          const p = rows[j][i];
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.strokeStyle = `rgba(80, 215, 255, ${Math.min(0.55, 0.08 + fog * 0.2 + lit * 0.3).toFixed(3)})`;
        ctx.stroke();
      }

      // จุด grid — hue/light ตามความสูง
      for (let j = 0; j < NZ; j++) {
        const wz = ZS[j];
        const lit = scanLit(wz);
        for (let i = 0; i < NX; i++) {
          const p = rows[j][i];
          const r = (0.5 + (p.hue - 160) / 45 * 0.9) * p.s * 1.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(0.5, r), 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${p.hue}, 92%, ${58 + lit * 22}%, ${p.a})`;
          if (lit > 0.55) {
            ctx.shadowColor = "rgba(64, 255, 210, 0.9)";
            ctx.shadowBlur = 8 * lit;
          }
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      // เส้น scan ไล่ตามภูมิประเทศ (hug terrain) ที่ z = scanZ
      {
        const N = 28;
        ctx.beginPath();
        for (let i = 0; i <= N; i++) {
          const wx = -950 + (i * 1900) / N;
          const p = project(wx, heightAt(wx, scanZ, t) - CAM_H + 10, scanZ);
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        const a = project(-950, 0, scanZ);
        const b = project(950, 0, scanZ);
        const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
        g.addColorStop(0, "rgba(64, 255, 210, 0)");
        g.addColorStop(0.5, "rgba(64, 255, 210, 0.55)");
        g.addColorStop(1, "rgba(64, 255, 210, 0)");
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.lineWidth = 1;
      }

      // ---- sensor nodes: เสา + หัวกะพริบ + pulse ring ----
      for (let k = 0; k < SENSORS.length; k++) {
        const sn = SENSORS[k];
        const base = project(sn.x, heightAt(sn.x, sn.z, t) - CAM_H, sn.z);
        const top = project(sn.x, heightAt(sn.x, sn.z, t) + 52 - CAM_H, sn.z);
        const depthFade = Math.max(0.25, Math.min(1, base.s / 0.9));
        // เสา
        ctx.strokeStyle = `rgba(120, 235, 255, ${(0.3 * depthFade).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(base.x, base.y);
        ctx.lineTo(top.x, top.y);
        ctx.stroke();
        // หัวเซ็นเซอร์
        ctx.beginPath();
        ctx.arc(top.x, top.y, 2.6, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(64, 255, 210, ${(0.95 * depthFade).toFixed(3)})`;
        ctx.shadowColor = "rgba(64, 255, 210, 0.9)";
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
        // วงแหวน pulse
        const ph = (t * 0.45 + sn.ph) % 1;
        const pr = 3 + ph * 22;
        ctx.beginPath();
        ctx.arc(top.x, top.y, pr, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(64, 255, 210, ${((1 - ph) * 0.45 * depthFade).toFixed(3)})`;
        ctx.stroke();
      }

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
