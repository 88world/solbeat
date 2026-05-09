"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { TrendingToken } from "@/types/token";

type Props = {
  size?: number;
  /** Market heat (0..1). Drives core sphere color, breath rate, ring spin. */
  heat?: number;
  /** Live trending tokens — rendered as orbiting satellites. */
  tokens?: TrendingToken[];
  /** Click handler for satellites. Receives the token's contract address. */
  onTokenClick?: (ca: string) => void;
};

/**
 * The Pulse — living, interactive market visualizer.
 *
 *   Core sphere: high-poly icosphere with a thermal liquid shader. Breath is
 *   driven by a continuous sine wave at the BPM rate (no exponential snap),
 *   color blends cold-blue → hot-pink across the heat range, fresnel pow(2.5)
 *   gives a strong rim glow that breaks the "matte plastic" look, soft
 *   specular at exp 8 keeps the highlight broad without aliasing, and the
 *   body alpha is 0.7 + fres × 0.3 so the center is glassy and the rim is
 *   opaque — reads as real glass on a light bg.
 *
 *   Data rings: two abstract Torus rings at different inclinations, spinning
 *   with heat. Premium tech-orbit feel.
 *
 *   Token satellites: each trending token is a billboarded sprite — circular
 *   logo with a thin colored ring (no white plate; the plate was clashing
 *   with the light bg). Symbol rendered with a soft white halo for legibility.
 *
 *   Per-token heat (volatility 60% + volume rank 40%) drives orbit radius,
 *   speed, sprite scale.
 *
 *   Pulse shockwaves expand at the BPM cadence. Comet trails follow each
 *   satellite. Raycaster handles hover (scale-up) + click (navigate).
 */
export function PulseSphere({
  size = 480,
  heat = 0.2,
  tokens = [],
  onTokenClick,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const heatRef = useRef(heat);
  heatRef.current = heat;
  const onClickRef = useRef(onTokenClick);
  onClickRef.current = onTokenClick;
  const rebuildRef = useRef<((toks: TrendingToken[]) => void) | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const dpr = Math.min(window.devicePixelRatio, 1.5);
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(dpr);
    renderer.setSize(size, size, false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 0, 5.4);

    // ───── Core sphere ─────
    const geometry = new THREE.IcosahedronGeometry(1, 96);

    const uniforms = {
      uTime:   { value: 0 },
      uHeat:   { value: 0 },
      uBreath: { value: 0 },
      uHover:  { value: 0 },
    };

    const material = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      vertexShader: VERT,
      fragmentShader: FRAG,
    });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // ───── Abstract data rings (premium tech-orbit decoration) ─────
    const ringGroup = new THREE.Group();
    scene.add(ringGroup);

    const ringGeoOuter = new THREE.TorusGeometry(1.55, 0.0035, 8, 128);
    const ringMatOuter = new THREE.MeshBasicMaterial({
      color: 0x5e5cff,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ringOuter = new THREE.Mesh(ringGeoOuter, ringMatOuter);
    ringOuter.rotation.x = Math.PI / 2;
    ringGroup.add(ringOuter);

    const ringGeoInner = new THREE.TorusGeometry(1.22, 0.005, 8, 128);
    const ringMatInner = new THREE.MeshBasicMaterial({
      color: 0xff2d9c,
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ringInner = new THREE.Mesh(ringGeoInner, ringMatInner);
    ringInner.rotation.x = Math.PI / 3;
    ringInner.rotation.y = Math.PI / 4;
    ringGroup.add(ringInner);

    // ───── Pulse shockwaves (3 phase-staggered rings) ─────
    const SHOCKWAVE_COUNT = 3;
    const shockwaveGeo = new THREE.TorusGeometry(1, 0.012, 8, 96);
    const shockwaves: { mesh: THREE.Mesh; phase: number }[] = [];
    for (let i = 0; i < SHOCKWAVE_COUNT; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xff2d9c,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(shockwaveGeo, mat);
      ring.rotation.x = Math.PI / 2;
      scene.add(ring);
      shockwaves.push({ mesh: ring, phase: i / SHOCKWAVE_COUNT });
    }

    // ───── Satellite system ─────
    type Trail = {
      points: THREE.Points;
      positions: Float32Array;
      geometry: THREE.BufferGeometry;
      material: THREE.ShaderMaterial;
    };
    type Satellite = THREE.Sprite & {
      userData: {
        ca: string;
        symbol: string;
        orbitRadius: number;
        orbitSpeed: number;
        orbitTilt: THREE.Quaternion;
        phase: number;
        baseScale: number;
        ringColor: string;
        trail?: Trail;
      };
    };
    const TRAIL_LEN = 24;
    let satellites: Satellite[] = [];
    let hoveredSat: Satellite | null = null;

    function createTrail(ringColor: string): Trail {
      const positions = new Float32Array(TRAIL_LEN * 3);
      const indices = new Float32Array(TRAIL_LEN);
      for (let i = 0; i < TRAIL_LEN; i++) indices[i] = i / (TRAIL_LEN - 1);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("aIndex", new THREE.BufferAttribute(indices, 1));
      const material = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(ringColor) },
          uPixelRatio: { value: dpr },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: `
          attribute float aIndex;
          uniform float uPixelRatio;
          varying float vAlpha;
          void main(){
            vAlpha = aIndex;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = (aIndex * aIndex * 7.0 + 0.6) * uPixelRatio * (240.0 / -mv.z);
          }
        `,
        fragmentShader: `
          precision highp float;
          uniform vec3 uColor;
          varying float vAlpha;
          void main(){
            vec2 uv = gl_PointCoord - 0.5;
            float a = smoothstep(0.5, 0.0, length(uv)) * vAlpha * vAlpha;
            gl_FragColor = vec4(uColor, a * 0.85);
          }
        `,
      });
      const points = new THREE.Points(geometry, material);
      return { points, positions, geometry, material };
    }

    const ringSatellite = (token: TrendingToken, idx: number, total: number) => {
      const change = token.price_change_24h ?? 0;
      const volHeat = Math.min(1, Math.abs(change) / 18);
      const rankHeat = total > 1 ? 1 - idx / (total - 1) : 0.5;
      const tHeat = volHeat * 0.6 + rankHeat * 0.4;
      const orbitRadius = 3.5 - tHeat * 1.5;
      const orbitSpeed = (0.04 + tHeat * 0.16) * (Math.random() < 0.5 ? 1 : -1);
      const baseScale = 0.30 + tHeat * 0.22;
      const ringColor = change >= 0 ? "#14F195" : "#FF4757";
      const tilt = new THREE.Quaternion();
      const axis = new THREE.Vector3(
        (Math.random() - 0.5) * 0.6,
        1,
        (Math.random() - 0.5) * 0.6,
      ).normalize();
      tilt.setFromAxisAngle(axis, (Math.random() - 0.5) * 0.8);
      return {
        ca: token.ca,
        symbol: (token.symbol ?? "").replace(/^\$/, "").toUpperCase(),
        image: token.image,
        orbitRadius,
        orbitSpeed,
        orbitTilt: tilt,
        phase: Math.random() * Math.PI * 2,
        baseScale,
        ringColor,
      };
    };

    function disposeSatellites() {
      for (const s of satellites) {
        scene.remove(s);
        const mat = s.material as THREE.SpriteMaterial;
        mat.map?.dispose();
        mat.dispose();
        const trail = s.userData.trail;
        if (trail) {
          scene.remove(trail.points);
          trail.geometry.dispose();
          trail.material.dispose();
        }
      }
      satellites = [];
    }

    function rebuildSatellites(toks: TrendingToken[]) {
      disposeSatellites();
      const total = toks.length;
      toks.forEach((token, idx) => {
        const cfg = ringSatellite(token, idx, total);
        createSatelliteTexture(cfg).then((texture) => {
          const mat = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthWrite: false,
            blending: THREE.NormalBlending,
          });
          const sprite = new THREE.Sprite(mat) as Satellite;
          sprite.scale.set(cfg.baseScale, cfg.baseScale, 1);
          const trail = createTrail(cfg.ringColor);
          sprite.userData = {
            ca: cfg.ca,
            symbol: cfg.symbol,
            orbitRadius: cfg.orbitRadius,
            orbitSpeed: cfg.orbitSpeed,
            orbitTilt: cfg.orbitTilt,
            phase: cfg.phase,
            baseScale: cfg.baseScale,
            ringColor: cfg.ringColor,
            trail,
          };
          scene.add(sprite);
          scene.add(trail.points);
          satellites.push(sprite);
        });
      });
    }
    rebuildRef.current = rebuildSatellites;

    // ───── Pointer / raycaster ─────
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerInside = false;
    let targetHover = 0;

    const updatePointer = (e: PointerEvent) => {
      const r = mount.getBoundingClientRect();
      pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      pointerInside =
        e.clientX >= r.left &&
        e.clientX <= r.right &&
        e.clientY >= r.top &&
        e.clientY <= r.bottom;
      targetHover = pointerInside ? 1 - Math.min(1, Math.hypot(pointer.x, pointer.y)) : 0;
    };

    const onPointerMove = (e: PointerEvent) => updatePointer(e);
    const onPointerLeave = () => {
      pointerInside = false;
      targetHover = 0;
      if (hoveredSat) {
        hoveredSat = null;
        mount.style.cursor = "";
      }
    };
    const onClick = (e: MouseEvent) => {
      const r = mount.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 2 - 1;
      const y = -((e.clientY - r.top) / r.height) * 2 + 1;
      raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
      const hits = raycaster.intersectObjects(satellites, false);
      if (hits.length > 0) {
        const ca = (hits[0].object.userData as { ca?: string }).ca;
        if (ca) onClickRef.current?.(ca);
      }
    };
    mount.addEventListener("pointermove", onPointerMove);
    mount.addEventListener("pointerleave", onPointerLeave);
    mount.addEventListener("click", onClick);

    // ───── Animation loop ─────
    let raf = 0;
    let visible = true;
    const onVis = () => {
      visible = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", onVis);

    let last = performance.now();
    let currentHeat = 0;
    let currentHover = 0;
    const tmpVec = new THREE.Vector3();

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (!visible) return;
      const dt = Math.min(50, now - last) / 1000;
      last = now;

      uniforms.uTime.value += dt;

      // Heat lerp — ambient drift toward target
      const targetHeat = Math.max(0, Math.min(1, heatRef.current));
      currentHeat += (targetHeat - currentHeat) * Math.min(1, dt * 0.55);
      uniforms.uHeat.value = reduced ? Math.min(0.4, currentHeat) : currentHeat;

      // ───── Smooth sine-wave breath ─────
      // Period derived from BPM. No exponential snap — pure sine, never jarring.
      // BPM = 50 + heat * 50 (matches lib/utils/heat.ts heatToBpm).
      const bpm = 50 + currentHeat * 50;
      const bps = bpm / 60;
      const breathRaw = (Math.sin((now / 1000) * Math.PI * bps * 2) + 1) * 0.5;
      uniforms.uBreath.value = reduced ? 0.15 : breathRaw;

      // Hover lerp (visual lift only)
      currentHover += (targetHover - currentHover) * Math.min(1, dt * 1.8);
      uniforms.uHover.value = currentHover;

      // Core sphere idle motion
      mesh.rotation.y += dt * (0.05 + currentHeat * 0.02);
      mesh.rotation.x += dt * 0.012;
      mesh.position.y = Math.sin(now / 2400) * 0.045;

      // Data rings — spin faster when hot
      const ringSpin = 0.06 + currentHeat * 0.30;
      ringOuter.rotation.z -= dt * ringSpin;
      ringInner.rotation.z += dt * ringSpin * 1.5;
      ringInner.rotation.x += dt * 0.05;
      ringGroup.position.y = mesh.position.y;

      // Shockwaves at BPM cadence
      const shockPeriod = 60 / Math.max(20, bpm);
      const phaseInc = dt / (shockPeriod * SHOCKWAVE_COUNT);
      for (const sw of shockwaves) {
        sw.phase = (sw.phase + phaseInc) % 1;
        sw.mesh.scale.setScalar(1.0 + sw.phase * 3.6);
        const mat = sw.mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, (1 - sw.phase) * (1 - sw.phase) * 0.4);
        mat.color.setRGB(
          1.0 - 0.65 * (1 - currentHeat),
          0.18 + 0.18 * (1 - currentHeat),
          0.61 + 0.40 * (1 - currentHeat),
        );
      }

      // Satellites + trails
      let nextHovered: Satellite | null = null;
      for (const sat of satellites) {
        const u = sat.userData;
        const t = uniforms.uTime.value * u.orbitSpeed + u.phase;
        tmpVec.set(Math.cos(t) * u.orbitRadius, 0, Math.sin(t) * u.orbitRadius);
        tmpVec.y = Math.sin(uniforms.uTime.value * 0.6 + u.phase) * 0.18;
        tmpVec.applyQuaternion(u.orbitTilt);
        sat.position.copy(tmpVec);

        const trail = u.trail;
        if (trail) {
          const p = trail.positions;
          for (let i = 0; i < TRAIL_LEN - 1; i++) {
            const di = i * 3;
            const si = (i + 1) * 3;
            p[di] = p[si];
            p[di + 1] = p[si + 1];
            p[di + 2] = p[si + 2];
          }
          const last = (TRAIL_LEN - 1) * 3;
          p[last] = tmpVec.x;
          p[last + 1] = tmpVec.y;
          p[last + 2] = tmpVec.z;
          trail.geometry.attributes.position.needsUpdate = true;
        }
      }

      // Hover detection
      if (pointerInside && satellites.length > 0) {
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects(satellites, false);
        if (hits.length > 0) nextHovered = hits[0].object as Satellite;
      }
      if (nextHovered !== hoveredSat) {
        hoveredSat = nextHovered;
        mount.style.cursor = hoveredSat ? "pointer" : "";
      }

      // Per-satellite scale tween
      for (const sat of satellites) {
        const target =
          sat === hoveredSat
            ? sat.userData.baseScale * 1.45
            : sat.userData.baseScale;
        const cur = sat.scale.x;
        const next = cur + (target - cur) * Math.min(1, dt * 8);
        sat.scale.set(next, next, 1);
      }

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);

    // ───── Cleanup ─────
    return () => {
      cancelAnimationFrame(raf);
      mount.removeEventListener("pointermove", onPointerMove);
      mount.removeEventListener("pointerleave", onPointerLeave);
      mount.removeEventListener("click", onClick);
      document.removeEventListener("visibilitychange", onVis);
      disposeSatellites();
      for (const sw of shockwaves) {
        scene.remove(sw.mesh);
        (sw.mesh.material as THREE.MeshBasicMaterial).dispose();
      }
      shockwaveGeo.dispose();
      ringGeoOuter.dispose();
      ringMatOuter.dispose();
      ringGeoInner.dispose();
      ringMatInner.dispose();
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      rebuildRef.current = null;
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [size]);

  // Rebuild satellites when tokens change
  useEffect(() => {
    rebuildRef.current?.(tokens);
  }, [tokens]);

  // Drop shadow color shifts with heat
  const heatClamped = Math.max(0, Math.min(1, heat));
  const shadowColor =
    heatClamped >= 0.6
      ? `rgba(255, 45, 156, ${0.18 + heatClamped * 0.10})`
      : `rgba(94, 92, 255, ${0.14 + (1 - heatClamped) * 0.04})`;

  return (
    <div className="relative flex items-center justify-center" aria-hidden>
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none transition-opacity duration-1000"
        style={{
          width: size * 0.65,
          height: size * 0.65,
          background:
            heatClamped >= 0.6
              ? "radial-gradient(circle at 50% 50%, rgba(255, 45, 156, 0.20), rgba(20, 241, 149, 0.10) 50%, transparent 72%)"
              : "radial-gradient(circle at 50% 50%, rgba(94, 92, 255, 0.18), rgba(255, 45, 156, 0.10) 50%, transparent 72%)",
          filter: "blur(50px)",
        }}
      />
      <div
        ref={mountRef}
        style={{
          width: size,
          height: size,
          filter: `drop-shadow(0 28px 56px ${shadowColor})`,
          transition: "filter 1200ms ease-out",
        }}
      />
    </div>
  );
}

// ───── Sphere shaders ─────
// Smooth sine-wave breath drives a tiny vertex displacement and a subtle
// fragment glow boost — no exponential snap. Strong fresnel pow(2.5) +
// translucent body alpha + soft specular exp 8 = glassy depth, not matte
// plastic.

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uHeat;
  uniform float uBreath;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying float vNoise;

  vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
  float snoise(vec3 v){
    const vec2 C=vec2(1.0/6.0,1.0/3.0);
    const vec4 D=vec4(0.0,0.5,1.0,2.0);
    vec3 i=floor(v+dot(v,C.yyy));
    vec3 x0=v-i+dot(i,C.xxx);
    vec3 g=step(x0.yzx,x0.xyz);
    vec3 l=1.0-g;
    vec3 i1=min(g.xyz,l.zxy);
    vec3 i2=max(g.xyz,l.zxy);
    vec3 x1=x0-i1+C.xxx;
    vec3 x2=x0-i2+C.yyy;
    vec3 x3=x0-D.yyy;
    i=mod289(i);
    vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
    float n_=0.142857142857;
    vec3 ns=n_*D.wyz-D.xzx;
    vec4 j=p-49.0*floor(p*ns.z*ns.z);
    vec4 x_=floor(j*ns.z);
    vec4 y_=floor(j-7.0*x_);
    vec4 x=x_*ns.x+ns.yyyy;
    vec4 y=y_*ns.x+ns.yyyy;
    vec4 h=1.0-abs(x)-abs(y);
    vec4 b0=vec4(x.xy,y.xy);
    vec4 b1=vec4(x.zw,y.zw);
    vec4 s0=floor(b0)*2.0+1.0;
    vec4 s1=floor(b1)*2.0+1.0;
    vec4 sh=-step(h,vec4(0.0));
    vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
    vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
    vec3 p0=vec3(a0.xy,h.x);
    vec3 p1=vec3(a0.zw,h.y);
    vec3 p2=vec3(a1.xy,h.z);
    vec3 p3=vec3(a1.zw,h.w);
    vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
    vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
    m=m*m;
    return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }

  void main(){
    // Flow speed scales gently with heat
    float t = uTime * (0.16 + uHeat * 0.40);
    float noise = snoise(position * 1.5 + t);
    vNoise = noise;

    // Breath drives a tiny smooth expansion (sine, never sharp)
    float breathExpand = uBreath * 0.06;
    float disp = noise * 0.06 + breathExpand;

    vec3 displaced = position + normal * disp;
    vec4 mv = modelViewMatrix * vec4(displaced, 1.0);
    vViewDir = -mv.xyz;
    vNormal = normalMatrix * normal;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform float uHeat;
  uniform float uBreath;
  uniform float uHover;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying float vNoise;

  void main(){
    vec3 N = normalize(vNormal);
    vec3 V = normalize(vViewDir);

    // Fresnel — strong rim, soft center. The fix for "matte plastic."
    float fres = clamp(1.0 - dot(V, N), 0.0, 1.0);
    float fresnelRim = pow(fres, 2.5);

    // Liquid color — pink/blue mix with deeper cores for richness
    float n = vNoise * 0.5 + 0.5;
    vec3 coldCore    = vec3(0.05, 0.10, 0.80);
    vec3 coldSurface = vec3(0.37, 0.36, 1.00);
    vec3 colorCold   = mix(coldCore, coldSurface, n);

    vec3 hotCore     = vec3(0.80, 0.10, 0.40);
    vec3 hotSurface  = vec3(1.00, 0.17, 0.61);
    vec3 colorHot    = mix(hotCore, hotSurface, n);

    vec3 baseColor = mix(colorCold, colorHot, uHeat);

    // Solana green sparkle — only at very high heat, in noise valleys
    float greenPower = smoothstep(0.80, 1.00, uHeat) * smoothstep(0.70, 1.00, 1.0 - n);
    vec3 greenAccent = vec3(0.08, 0.94, 0.58);
    baseColor = mix(baseColor, greenAccent, greenPower);

    // Breath-driven hot glow — gentle pulse, only when hot
    baseColor += colorHot * uBreath * uHeat * 0.30;

    // Soft specular at low exponent — broad sheen, no aliasing
    vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
    vec3 R = reflect(-lightDir, N);
    float spec = pow(max(dot(V, R), 0.0), 8.0);

    // Compose: base + soft spec + strong fresnel rim
    vec3 col = baseColor + vec3(1.0) * spec * 0.25 + vec3(1.0) * fresnelRim * 0.40;

    // Hover lift
    col *= 1.0 + uHover * 0.10;

    // Translucent center, opaque rim — reads as glass on a light bg
    float alpha = 0.70 + fres * 0.30;
    gl_FragColor = vec4(col, alpha);
  }
`;

// ───── Satellite texture ─────
// New design: NO white plate (was clashing on the light bg). Just a circular
// logo with a thin colored ring + soft drop shadow. Symbol below as small
// label with a subtle white halo for legibility on whatever bg.

type SatelliteCfg = {
  ca: string;
  symbol: string;
  image: string | null;
  ringColor: string;
};

async function createSatelliteTexture(cfg: SatelliteCfg): Promise<THREE.CanvasTexture> {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(canvas);

  // Soft drop shadow under the disc
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 6;
  ctx.shadowBlur = 16;
  ctx.shadowColor = "rgba(10, 10, 30, 0.20)";
  ctx.fillStyle = "rgba(0, 0, 0, 0)";
  ctx.beginPath();
  ctx.arc(128, 120, 78, 0, Math.PI * 2);
  ctx.fill();
  // Reset shadow
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  const drawFallback = () => {
    const grad = ctx.createLinearGradient(50, 42, 206, 198);
    grad.addColorStop(0, "#FF2D9C");
    grad.addColorStop(0.5, "#5E5CFF");
    grad.addColorStop(1, "#14F195");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(128, 120, 78, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 56px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(cfg.symbol.slice(0, 1) || "?", 128, 122);
  };

  if (cfg.image) {
    try {
      const img = await loadImage(cfg.image);
      ctx.save();
      ctx.beginPath();
      ctx.arc(128, 120, 78, 0, Math.PI * 2);
      ctx.clip();
      const r = 156;
      ctx.drawImage(img, 128 - r / 2, 120 - r / 2, r, r);
      ctx.restore();
    } catch {
      drawFallback();
    }
  } else {
    drawFallback();
  }

  // Thin colored ring (no plate underneath now — logo sits on the bg directly)
  ctx.strokeStyle = cfg.ringColor;
  ctx.lineWidth = 4;
  ctx.shadowBlur = 14;
  ctx.shadowColor = cfg.ringColor;
  ctx.beginPath();
  ctx.arc(128, 120, 80, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Symbol label below — small, with a soft white halo for legibility
  const text = cfg.symbol.slice(0, 8);
  ctx.font = "bold 22px ui-sans-serif, system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // White halo
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.shadowBlur = 6;
  ctx.shadowColor = "rgba(255, 255, 255, 0.95)";
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.fillText(text, 128, 226);
  ctx.fillText(text, 128, 226);
  // Solid dark text on top
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(10, 10, 22, 0.95)";
  ctx.fillText(text, 128, 226);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.referrerPolicy = "no-referrer";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image_load_failed"));
    img.src = url;
  });
}
