"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { TrendingToken } from "@/types/token";

type Props = {
  size?: number;
  /** Market heat (0..1). Drives core sphere color and ambient feel. */
  heat?: number;
  /** Live trending tokens — rendered as orbiting satellites. */
  tokens?: TrendingToken[];
  /** Click handler for satellites. Receives the token's contract address. */
  onTokenClick?: (ca: string) => void;
};

/**
 * The Pulse — a living, interactive market visualizer.
 *
 *   Core sphere: shape + heat-driven color (this part unchanged from before).
 *   Orbiting token satellites: each trending token is a billboarded sprite
 *     with its logo, a colored ring (green up / red down), and a symbol label,
 *     drawn into a CanvasTexture and async-loaded on mount or when the token
 *     list changes.
 *
 *   Per-token heat (volatility 60% + volume rank 40%) determines:
 *     - orbitRadius (hotter = closer to the sphere)
 *     - orbitSpeed  (hotter = faster angular velocity)
 *     - spriteScale (hotter = bigger sprite)
 *     - emissive boost on the ring (hotter = more glow)
 *
 *   Each satellite has a randomly-tilted orbit plane so the system reads as
 *   a 3D constellation, not a flat ring. Raycaster handles hover (scale-up
 *   tween) and click (navigates to /token/[ca]).
 */
export function PulseSphere({
  size = 480,
  heat = 0.2,
  tokens = [],
  onTokenClick,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);

  // Refs so the animation loop can read the latest props without re-running.
  const heatRef = useRef(heat);
  heatRef.current = heat;
  const onClickRef = useRef(onTokenClick);
  onClickRef.current = onTokenClick;

  // The rebuild function lives in this ref — set during scene setup, called
  // by the tokens-changed effect below.
  const rebuildRef = useRef<((toks: TrendingToken[]) => void) | null>(null);

  // ───── Scene setup (runs once per size change) ─────
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
    // Pulled the camera back to fit the orbital satellites in frame alongside
    // the central sphere. Sphere appears smaller than before but in proportion.
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 0, 5.6);

    const geometry = new THREE.IcosahedronGeometry(1, 32);

    const uniforms = {
      uTime: { value: 0 },
      uHeat: { value: 0 },
      uHover: { value: 0 },
    };

    const material = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      vertexShader: VERT,
      fragmentShader: FRAG,
    });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // ───── Pulse shockwaves ─────
    // 3 thin torus rings expanding from the center sphere outward at the
    // BPM rate. Each ring has its own phase, evenly staggered, so the
    // visualization feels like a continuous heartbeat ripple. Opacity fades
    // as the ring expands, scale grows from 1.0 → ~4.5.
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
            float d = length(uv);
            float a = smoothstep(0.5, 0.0, d) * vAlpha * vAlpha;
            gl_FragColor = vec4(uColor, a * 0.85);
          }
        `,
      });
      const points = new THREE.Points(geometry, material);
      return { points, positions, geometry, material };
    }

    const ringSatellite = (token: TrendingToken, idx: number, total: number) => {
      // Per-token heat: volatility (|24h%| / 18) blended with volume rank.
      const change = token.price_change_24h ?? 0;
      const volHeat = Math.min(1, Math.abs(change) / 18);
      const rankHeat = total > 1 ? 1 - idx / (total - 1) : 0.5;
      const tHeat = volHeat * 0.6 + rankHeat * 0.4;

      const orbitRadius = 3.5 - tHeat * 1.5; // 2.0 (hot) → 3.5 (cool)
      const orbitSpeed = (0.04 + tHeat * 0.16) * (Math.random() < 0.5 ? 1 : -1);
      const baseScale = 0.30 + tHeat * 0.22;

      const ringColor = change >= 0 ? "#14F195" : "#FF4757";

      // Random orbit plane (small tilts so the system reads 3D, not flat).
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
            // Slight additive feel so satellites pop against the bg.
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

    const onPointerMove = (e: PointerEvent) => {
      updatePointer(e);
    };
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

      const targetHeat = Math.max(0, Math.min(1, heatRef.current));
      currentHeat += (targetHeat - currentHeat) * Math.min(1, dt * 0.55);
      uniforms.uHeat.value = reduced ? Math.min(0.4, currentHeat) : currentHeat;

      currentHover += (targetHover - currentHover) * Math.min(1, dt * 1.8);
      uniforms.uHover.value = currentHover;

      // Tiny spin on the core sphere
      mesh.rotation.y += dt * (0.05 + currentHeat * 0.02);
      mesh.rotation.x += dt * 0.012;
      mesh.position.y = Math.sin(now / 2400) * 0.045;

      // Advance pulse shockwaves at the live BPM rate.
      // BPM = 50 + heat * 50 (matches lib/utils/heat.ts heatToBpm)
      const bpm = 50 + currentHeat * 50;
      const shockPeriod = 60 / Math.max(20, bpm);
      const phaseInc = dt / (shockPeriod * SHOCKWAVE_COUNT);
      for (const sw of shockwaves) {
        sw.phase = (sw.phase + phaseInc) % 1;
        const scale = 1.0 + sw.phase * 3.6;
        sw.mesh.scale.setScalar(scale);
        const mat = sw.mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, (1 - sw.phase) * (1 - sw.phase) * 0.45);
        // Color tilts pink when hot, blue when cool — matches sphere palette.
        mat.color.setRGB(
          1.0 - 0.65 * (1 - currentHeat),
          0.18 + 0.18 * (1 - currentHeat),
          0.61 + 0.40 * (1 - currentHeat),
        );
      }

      // Animate satellites + write trail positions
      let nextHovered: Satellite | null = null;
      for (const sat of satellites) {
        const u = sat.userData;
        const t = uniforms.uTime.value * u.orbitSpeed + u.phase;
        tmpVec.set(Math.cos(t) * u.orbitRadius, 0, Math.sin(t) * u.orbitRadius);
        // Gentle vertical bob layered on top
        tmpVec.y = Math.sin(uniforms.uTime.value * 0.6 + u.phase) * 0.18;
        tmpVec.applyQuaternion(u.orbitTilt);
        sat.position.copy(tmpVec);

        // Comet trail — shift left, write current at the end
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

      // Per-satellite scale tween — hovered grows, others settle to base
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
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      rebuildRef.current = null;
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [size]);

  // ───── Rebuild satellites when tokens change ─────
  useEffect(() => {
    rebuildRef.current?.(tokens);
  }, [tokens]);

  // Drop shadow color shifts with heat (kept from previous version)
  const heatClamped = Math.max(0, Math.min(1, heat));
  const shadowColor =
    heatClamped >= 0.6
      ? `rgba(255, 45, 156, ${0.16 + heatClamped * 0.08})`
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
          filter: `drop-shadow(0 24px 48px ${shadowColor})`,
          transition: "filter 1200ms ease-out",
        }}
      />
    </div>
  );
}

// ───── Sphere shaders (unchanged from previous calm-sphere version) ─────

const VERT = /* glsl */ `
  uniform float uTime;
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
    float noise = snoise(position * 1.0 + uTime * 0.25);
    vNoise = noise;
    float disp = noise * 0.05;
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
  uniform float uHover;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying float vNoise;

  void main(){
    vec3 N = normalize(vNormal);
    vec3 V = normalize(vViewDir);

    vec3 coldColor = vec3(0.36, 0.36, 1.00);
    vec3 hotColor  = vec3(1.00, 0.18, 0.61);
    vec3 baseColor = mix(coldColor, hotColor, uHeat);

    float n = vNoise * 0.5 + 0.5;
    baseColor *= 0.85 + n * 0.30;

    vec3 lightDir = normalize(vec3(0.5, 0.8, 1.0));
    float NdotL = dot(N, lightDir);
    float halfLambert = NdotL * 0.5 + 0.5;
    halfLambert = halfLambert * halfLambert;

    vec3 R = reflect(-lightDir, N);
    float spec = pow(max(dot(V, R), 0.0), 90.0);

    float fres = pow(clamp(1.0 - dot(V, N), 0.0, 1.0), 1.6);

    float ambient = 0.35;
    vec3 col = baseColor * (ambient + halfLambert * 0.70);
    col += vec3(1.0) * spec * 0.55;
    col += baseColor * fres * 0.45;

    col *= 1.0 + uHover * 0.10;

    float greenPower = smoothstep(0.78, 1.0, uHeat)
                     * smoothstep(0.55, 1.0, 1.0 - n);
    col = mix(col, vec3(0.08, 0.94, 0.58), greenPower * 0.45);

    gl_FragColor = vec4(col, 0.96);
  }
`;

// ───── Satellite texture: logo + colored ring + symbol label ─────

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
  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }

  const drawFrame = () => {
    // Outer glow ring
    ctx.shadowBlur = 20;
    ctx.shadowColor = cfg.ringColor;
    ctx.strokeStyle = cfg.ringColor;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(128, 128, 88, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  };

  const drawWhitePlate = () => {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(128, 128, 84, 0, Math.PI * 2);
    ctx.fill();
  };

  const drawSymbolLabel = () => {
    // Label below the disc
    ctx.fillStyle = "rgba(10, 10, 20, 0.92)";
    ctx.font = "bold 22px ui-sans-serif, system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Background pill behind the label for contrast on light bg
    const text = cfg.symbol.slice(0, 8);
    const metrics = ctx.measureText(text);
    const tw = metrics.width + 16;
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    roundRect(ctx, 128 - tw / 2, 220, tw, 26, 8);
    ctx.fill();
    ctx.fillStyle = "rgba(10, 10, 20, 0.92)";
    ctx.fillText(text, 128, 234);
  };

  const drawFallbackLogo = () => {
    const grad = ctx.createLinearGradient(40, 40, 216, 216);
    grad.addColorStop(0, "#FF2D9C");
    grad.addColorStop(0.5, "#5E5CFF");
    grad.addColorStop(1, "#14F195");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(128, 128, 78, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 56px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(cfg.symbol.slice(0, 1) || "?", 128, 130);
  };

  drawFrame();
  drawWhitePlate();

  if (cfg.image) {
    try {
      const img = await loadImage(cfg.image);
      // Clipped circular logo
      ctx.save();
      ctx.beginPath();
      ctx.arc(128, 128, 78, 0, Math.PI * 2);
      ctx.clip();
      // Use cover-style draw — fit logo into the circle.
      const r = 156;
      ctx.drawImage(img, 128 - r / 2, 128 - r / 2, r, r);
      ctx.restore();
    } catch {
      drawFallbackLogo();
    }
  } else {
    drawFallbackLogo();
  }

  drawSymbolLabel();

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

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
