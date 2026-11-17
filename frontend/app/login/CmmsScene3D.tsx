"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

/**
 * CmmsScene3D — "Aurora Data Terrain" (three.js / WebGL)
 * ภูมิประเทศคลื่น low-poly บน GPU (ShaderMaterial) + bloom post-processing
 * - terrain แข็งแรงด้วย vertex displacement บน shader (สมูท 60fps)
 * - scan sweep ไฮไลต์ผิว, data sun แบบ synthwave, starfield
 * - sensor nodes + pulse rings + anomaly ripples (predictive maintenance)
 * - data packets วิ่งเข้าหากล้อง, bloom ทำ glow ทั้งฉาก
 * - parallax กล้องตามเมาส์ + click ripple บนผิว terrain
 * - เคารพ prefers-reduced-motion (uTime ช้าลง 35%)
 */

const TERRAIN_W = 3800;
const TERRAIN_D = 2600;
const H_MAX = 138;

// สูตรคลื่นเดียวกับใน shader — ใช้บน CPU หา y ของ packet/ring/pole
function heightAtJS(x: number, z: number, t: number): number {
  return (
    Math.sin(x * 0.0032 + t * 0.8) * 24 +
    Math.sin(z * 0.0046 - t * 0.55) * 18 +
    Math.sin((x + z) * 0.0021 + t * 0.35) * 24 +
    Math.sin(x * 0.009 - t * 1.1) * 8 +
    Math.cos(z * 0.008 + t * 0.9) * 8 +
    Math.sin(x * 0.0011 + t * 0.2) * 30 +
    Math.cos(z * 0.0009 - t * 0.15) * 26
  );
}

const TERRAIN_VERT = /* glsl */ `
uniform float uTime;
uniform float uAmp;
varying float vHn;
varying float vFog;
varying vec3 vWorld;

float heightAt(vec2 p, float t) {
  float h = 0.0;
  h += sin(p.x * 0.0032 + t * 0.8) * 24.0;
  h += sin(p.y * 0.0046 - t * 0.55) * 18.0;
  h += sin((p.x + p.y) * 0.0021 + t * 0.35) * 24.0;
  h += sin(p.x * 0.009 - t * 1.1) * 8.0;
  h += cos(p.y * 0.008 + t * 0.9) * 8.0;
  h += sin(p.x * 0.0011 + t * 0.2) * 30.0;
  h += cos(p.y * 0.0009 - t * 0.15) * 26.0;
  return h;
}

void main() {
  vec3 pos = position;
  float h = heightAt(pos.xz, uTime) * uAmp;
  pos.y += h;
  vHn = clamp(h / ${H_MAX.toFixed(1)} * 0.5 + 0.5, 0.0, 1.0);
  vec4 wp = modelMatrix * vec4(pos, 1.0);
  vWorld = wp.xyz;
  vec4 mv = viewMatrix * wp;
  float d = max(0.0, -mv.z);
  vFog = 1.0 - exp(-pow(d * 0.00082, 2.0));
  gl_Position = projectionMatrix * mv;
}
`;

const TERRAIN_FRAG = /* glsl */ `
uniform float uScanZ;
uniform float uWire;
uniform vec3 uFogColor;
varying float vHn;
varying float vFog;
varying vec3 vWorld;

void main() {
  float lit = exp(-pow((vWorld.z - uScanZ) / 95.0, 2.0));
  vec3 deep = vec3(0.014, 0.06, 0.115);
  vec3 peak = vec3(0.09, 0.78, 0.68);
  vec3 col = mix(deep, peak, pow(vHn, 1.6));
  col += vec3(0.18, 1.0, 0.83) * lit * (uWire > 0.5 ? 0.6 : 0.3);
  col = mix(col, uFogColor, clamp(vFog, 0.0, 1.0));
  float alpha = uWire > 0.5 ? 0.3 : 1.0;
  gl_FragColor = vec4(col, alpha);
}
`;

const POINTS_VERT = /* glsl */ `
uniform float uTime;
uniform float uAmp;
varying float vHn;
varying float vFog;

float heightAt(vec2 p, float t) {
  float h = 0.0;
  h += sin(p.x * 0.0032 + t * 0.8) * 24.0;
  h += sin(p.y * 0.0046 - t * 0.55) * 18.0;
  h += sin((p.x + p.y) * 0.0021 + t * 0.35) * 24.0;
  h += sin(p.x * 0.009 - t * 1.1) * 8.0;
  h += cos(p.y * 0.008 + t * 0.9) * 8.0;
  h += sin(p.x * 0.0011 + t * 0.2) * 30.0;
  h += cos(p.y * 0.0009 - t * 0.15) * 26.0;
  return h;
}

void main() {
  vec3 pos = position;
  float h = heightAt(pos.xz, uTime) * uAmp;
  pos.y += h;
  vHn = clamp(h / ${H_MAX.toFixed(1)} * 0.5 + 0.5, 0.0, 1.0);
  vec4 mv = viewMatrix * modelMatrix * vec4(pos, 1.0);
  float d = max(0.0, -mv.z);
  vFog = 1.0 - exp(-pow(d * 0.00082, 2.0));
  gl_PointSize = (2.0 + vHn * 4.0) * (320.0 / d);
  gl_Position = projectionMatrix * mv;
}
`;

const POINTS_FRAG = /* glsl */ `
uniform float uScanZ;
varying float vHn;
varying float vFog;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.08, d);
  vec3 col = mix(vec3(0.15, 0.62, 1.0), vec3(0.3, 1.0, 0.85), vHn);
  gl_FragColor = vec4(col, a * (0.25 + vHn * 0.6) * (1.0 - vFog));
}
`;

/**
 * ตรวจว่าเบราว์เซอร์สร้าง WebGL context ได้จริงไหม
 * เครื่องที่ไม่มี GPU/ไดรเวอร์ปิด WebGL (RDP, VM, kiosk ที่ล็อกไว้) จะได้ false
 * แล้วเราไม่ต้องโหลด three.js + post-processing ให้หนักเปล่า ๆ
 */
function canUseWebGL(): boolean {
  try {
    if (typeof window === "undefined" || !window.WebGLRenderingContext) return false;
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2") || probe.getContext("webgl");
    if (!gl) return false;
    // คืน resource ทันที — เบราว์เซอร์จำกัดจำนวน context ต่อหน้า
    const lose = gl.getExtension("WEBGL_lose_context");
    lose?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export default function CmmsScene3D() {
  const ref = useRef<HTMLCanvasElement>(null);
  // WebGL ใช้ไม่ได้ → แสดงพื้นหลัง gradient/glow จาก CSS แทน (ไม่ปล่อยให้เป็นจอเปล่า)
  const [webglFailed, setWebglFailed] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    if (!canUseWebGL()) {
      setWebglFailed(true);
      return;
    }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const motionScale = reduced ? 0.35 : 1;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
    } catch {
      setWebglFailed(true); // สร้าง renderer ไม่สำเร็จ (ไดรเวอร์/หน่วยความจำ) — ใช้ CSS แทน
      return;
    }
    // เครื่องไม่มี GPU (SwiftShader/llvmpipe เช่น VM, remote desktop) — ลดงานลงเพื่อไม่ให้กระตุก
    const gl = renderer.getContext();
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const gpuName = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || "") : "";
    const softwareGPU = /swiftshader|llvmpipe|software|basic render/i.test(gpuName);

    // มือถือ/จอแคบ: ลด polygon + pixel ratio ลงเพื่อกันความร้อนและอาการกระตุก
    const lightMode = softwareGPU || window.innerWidth < 820;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, softwareGPU ? 1 : lightMode ? 1.4 : 1.75));
    renderer.setClearColor(0x030c18, 1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    const FOG_COLOR = new THREE.Color(0x03101d);
    scene.background = new THREE.Color(0x04101f);

    const camera = new THREE.PerspectiveCamera(55, 1, 1, 6000);
    camera.position.set(0, 235, -320);

    const disposables: { dispose: () => void }[] = [];
    const track = <T extends { dispose: () => void }>(x: T): T => {
      disposables.push(x);
      return x;
    };

    // ---- shared uniforms ----
    const uniforms = {
      uTime: { value: 0 },
      uAmp: { value: 1 },
      uScanZ: { value: -700 },
      uWire: { value: 0 },
      uFogColor: { value: FOG_COLOR },
    };

    // ---- terrain solid + wireframe ----
    const terrainGeo = track(
      new THREE.PlaneGeometry(TERRAIN_W, TERRAIN_D, lightMode ? 90 : 150, lightMode ? 60 : 100),
    );
    terrainGeo.rotateX(-Math.PI / 2);
    terrainGeo.translate(0, 0, 500);

    const solidMat = track(
      new THREE.ShaderMaterial({
        vertexShader: TERRAIN_VERT,
        fragmentShader: TERRAIN_FRAG,
        uniforms: { ...uniforms, uWire: { value: 0 } },
      }),
    );
    const wireMat = track(
      new THREE.ShaderMaterial({
        vertexShader: TERRAIN_VERT,
        fragmentShader: TERRAIN_FRAG,
        uniforms: { ...uniforms, uWire: { value: 1 } },
        wireframe: true,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    );
    const terrainSolid = new THREE.Mesh(terrainGeo, solidMat);
    const terrainWire = new THREE.Mesh(terrainGeo, wireMat);
    scene.add(terrainSolid, terrainWire);

    // ---- glow points บนยอด ----
    const PG = 96;
    const ptsPos = new Float32Array(PG * PG * 3);
    let pi = 0;
    for (let iz = 0; iz < PG; iz++) {
      for (let ix = 0; ix < PG; ix++) {
        ptsPos[pi++] = -TERRAIN_W / 2 + (ix * TERRAIN_W) / (PG - 1);
        ptsPos[pi++] = 0;
        ptsPos[pi++] = -TERRAIN_D / 2 + 500 + (iz * TERRAIN_D) / (PG - 1);
      }
    }
    const pointsGeo = track(new THREE.BufferGeometry());
    pointsGeo.setAttribute("position", new THREE.BufferAttribute(ptsPos, 3));
    const pointsMat = track(
      new THREE.ShaderMaterial({
        vertexShader: POINTS_VERT,
        fragmentShader: POINTS_FRAG,
        uniforms: { ...uniforms },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    scene.add(new THREE.Points(pointsGeo, pointsMat));

    // ---- textures (canvas-baked) ----
    const bakeTexture = (draw: (c: CanvasRenderingContext2D, s: number) => void, s = 256) => {
      const cv = document.createElement("canvas");
      cv.width = cv.height = s;
      const c = cv.getContext("2d")!;
      draw(c, s);
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      track(tex);
      return tex;
    };

    // data sun — radial glow + cut bands (synthwave)
    const sunTex = bakeTexture((c, s) => {
      const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, "rgba(190, 250, 255, 0.95)");
      g.addColorStop(0.18, "rgba(120, 230, 255, 0.5)");
      g.addColorStop(0.5, "rgba(60, 180, 255, 0.16)");
      g.addColorStop(1, "rgba(0, 0, 0, 0)");
      c.fillStyle = g;
      c.fillRect(0, 0, s, s);
      c.globalCompositeOperation = "destination-out";
      [[0.6, 0.03], [0.68, 0.045], [0.77, 0.06], [0.87, 0.08]].forEach(([dy, hh]) => {
        c.fillStyle = "rgba(0,0,0,0.85)";
        c.fillRect(0, s * dy, s, s * hh);
      });
    });
    const sun = new THREE.Sprite(
      track(
        new THREE.SpriteMaterial({
          map: sunTex,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      ),
    );
    sun.position.set(-140, 90, 1500);
    sun.scale.setScalar(760);
    scene.add(sun);

    // glow dot texture (packets / sensor heads)
    const dotTex = bakeTexture((c, s) => {
      const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, "rgba(255, 255, 255, 1)");
      g.addColorStop(0.25, "rgba(140, 255, 230, 0.8)");
      g.addColorStop(1, "rgba(0, 0, 0, 0)");
      c.fillStyle = g;
      c.fillRect(0, 0, s, s);
    }, 128);

    const mkSprite = (scale: number, opacity = 1) => {
      const sp = new THREE.Sprite(
        track(
          new THREE.SpriteMaterial({
            map: dotTex,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            opacity,
          }),
        ),
      );
      sp.scale.setScalar(scale);
      return sp;
    };

    // ---- starfield ----
    const starCount = 320;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      starPos[i * 3] = (Math.random() - 0.5) * 4200;
      starPos[i * 3 + 1] = 220 + Math.random() * 900;
      starPos[i * 3 + 2] = 900 + Math.random() * 2200;
    }
    const starGeo = track(new THREE.BufferGeometry());
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    const starMat = track(
      new THREE.PointsMaterial({
        color: 0xbfeaff,
        size: 2.6,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
      }),
    );
    scene.add(new THREE.Points(starGeo, starMat));

    // ---- sensor nodes ----
    const SENSOR_XZ = [
      [-640, 540], [-210, 900], [330, 660], [720, 1020],
      [40, 400], [540, 1280], [-440, 1180], [860, 430],
    ] as const;
    const poleGeo = track(new THREE.CylinderGeometry(2.2, 3.2, 52, 6));
    const poleMat = track(
      new THREE.MeshBasicMaterial({ color: 0x64e8ff, transparent: true, opacity: 0.5 }),
    );
    const ringGeo = track(new THREE.RingGeometry(0.86, 1, 48));
    const sensorHeads: THREE.Sprite[] = [];
    const sensorPulseRings: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; ph: number; x: number; z: number }[] = [];
    for (const [sx, sz] of SENSOR_XZ) {
      const head = mkSprite(26, 0.95);
      sensorHeads.push(head);
      scene.add(head);
      const pulse = new THREE.Mesh(
        track(ringGeo.clone()),
        track(
          new THREE.MeshBasicMaterial({
            color: 0x40ffd2,
            transparent: true,
            opacity: 0.4,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
        ),
      );
      pulse.rotation.x = -Math.PI / 2;
      scene.add(pulse);
      sensorPulseRings.push({ mesh: pulse, mat: pulse.material as THREE.MeshBasicMaterial, ph: Math.random(), x: sx, z: sz });
    }

    // ---- data packets ----
    const LANES = [-1080, -660, -240, 180, 600, 1020, 1230, -1290];
    const packets: { sp: THREE.Sprite; lane: number; off: number; v: number }[] = [];
    for (let i = 0; i < 10; i++) {
      const sp = mkSprite(17, 0.95);
      scene.add(sp);
      packets.push({
        sp,
        lane: LANES[i % LANES.length],
        off: Math.random() * 1700,
        v: 150 + Math.random() * 170,
      });
    }

    // ---- anomaly + click ripples (วงแหวนบนผิว) ----
    type Ripple3D = { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; t0: number; x: number; z: number; dur: number; maxR: number };
    const ripples3D: Ripple3D[] = [];
    const spawnRipple = (x: number, z: number, t: number, maxR: number, dur: number, color: number, op: number) => {
      const mesh = new THREE.Mesh(
        track(ringGeo.clone()),
        track(
          new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: op,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
        ),
      );
      mesh.rotation.x = -Math.PI / 2;
      scene.add(mesh);
      ripples3D.push({ mesh, mat: mesh.material as THREE.MeshBasicMaterial, t0: t, x, z, dur, maxR });
    };
    const nextAnomaly = SENSOR_XZ.map((_, i) => 2.5 + i * 1.4);

    // ---- post-processing (bloom) ----
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    // bloom กิน GPU หนัก — ปิดอัตโนมัติเมื่อเป็น software renderer (ฉากยังสวยจาก additive glow ที่มีอยู่)
    const useBloom = !softwareGPU;
    const bloom = useBloom ? new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.7, 0.58) : null;
    if (bloom) composer.addPass(bloom);
    composer.addPass(new OutputPass());
    disposables.push({ dispose: () => composer.dispose() });

    // ---- resize ----
    const resize = () => {
      const w = canvas.clientWidth || 1;
      const h = canvas.clientHeight || 1;
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      bloom?.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // ---- pointer parallax + click ripple (raycast ลง terrain plane) ----
    const mouse = { tx: 0, ty: 0, x: 0, y: 0 };
    const raycaster = new THREE.Raycaster();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    const onClick = (e: PointerEvent) => {
      if (reduced) return;
      const rect = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      if (raycaster.ray.intersectPlane(groundPlane, hit)) {
        spawnRipple(hit.x, hit.z, tNow, 260, 1.5, 0x3fe1ff, 0.5);
      }
    };
    const onMove = (e: PointerEvent) => {
      mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.ty = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onClick, { passive: true });

    // ---- loop ----
    let raf = 0;
    let tNow = 0;
    const clock = new THREE.Clock();
    const lookTarget = new THREE.Vector3();

    const animate = () => {
      const dt = Math.min(clock.getDelta(), 0.1);
      tNow += dt * motionScale;
      const t = tNow;

      uniforms.uTime.value = t;
      uniforms.uScanZ.value = -700 + ((t * 260) % 2400);

      // parallax กล้อง
      mouse.x += (mouse.tx - mouse.x) * 0.04;
      mouse.y += (mouse.ty - mouse.y) * 0.04;
      camera.position.x = mouse.x * 70;
      camera.position.y = 235 - mouse.y * 26;
      lookTarget.set(mouse.x * 40, 10 - mouse.y * 16, 560);
      camera.lookAt(lookTarget);

      // sensor heads + pulse rings
      for (let i = 0; i < SENSOR_XZ.length; i++) {
        const [sx, sz] = SENSOR_XZ[i];
        const y = heightAtJS(sx, sz, t) * motionScale;
        sensorHeads[i].position.set(sx, y + 58, sz);
        const r = sensorPulseRings[i];
        const ph = (t * 0.45 + r.ph) % 1;
        r.mesh.position.set(r.x, y + 8, r.z);
        r.mesh.scale.setScalar(6 + ph * 46);
        r.mat.opacity = (1 - ph) * 0.4;
      }

      // anomaly spawn + ripple update
      for (let i = 0; i < SENSOR_XZ.length; i++) {
        if (t >= nextAnomaly[i]) {
          spawnRipple(SENSOR_XZ[i][0], SENSOR_XZ[i][1], t, 430, 2.2, 0x5affdc, 0.45);
          nextAnomaly[i] = t + 9 + Math.random() * 10;
        }
      }
      for (let i = ripples3D.length - 1; i >= 0; i--) {
        const rp = ripples3D[i];
        const age = (t - rp.t0) / rp.dur;
        if (age >= 1) {
          scene.remove(rp.mesh);
          rp.mesh.geometry.dispose();
          rp.mat.dispose();
          ripples3D.splice(i, 1);
          continue;
        }
        rp.mesh.position.set(rp.x, heightAtJS(rp.x, rp.z, t) * motionScale + 10, rp.z);
        rp.mesh.scale.setScalar(8 + age * rp.maxR);
        rp.mat.opacity = (1 - age) * 0.45;
      }

      // data packets — วิ่งจากขอบฟ้าเข้าหากล้อง
      for (const pk of packets) {
        const wz = 1650 - ((t * pk.v + pk.off) % 1750);
        const y = heightAtJS(pk.lane, wz, t) * motionScale + 10;
        pk.sp.position.set(pk.lane, y, wz);
        const fade = Math.max(0.1, Math.min(1, (wz + 500) / 1400));
        (pk.sp.material as THREE.SpriteMaterial).opacity = fade;
      }

      if (useBloom) composer.render();
      else renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onClick);
      for (const d of disposables) d.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points || obj instanceof THREE.Sprite) {
          obj.geometry?.dispose?.();
        }
      });
      renderer.dispose();
    };
  }, []);

  if (webglFailed) {
    return <div className="cmms-login-3d-fallback" aria-hidden="true" />;
  }

  return <canvas ref={ref} className="cmms-login-3d-canvas" aria-hidden="true" />;
}
