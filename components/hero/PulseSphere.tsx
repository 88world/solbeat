"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { TrendingToken } from "@/types/token";
import { humanizeNumber, humanizePrice, pctChange } from "@/lib/utils";

type Props = {
  size?: number;
  /** Market heat (0..1). Drives sphere color, breath rate. */
  heat?: number;
  /** Live trending tokens — rendered as orbiting satellites. */
  tokens?: TrendingToken[];
  /** Click handler for satellites. */
  onTokenClick?: (ca: string) => void;
};

/**
 * The Pulse — premium minimal sphere with a live trending-token constellation.
 *
 * Sphere: deep muted core (cold navy → warm magenta), tiny displacement,
 * strong fresnel rim, soft specular, mostly opaque body. Reads as a
 * crystalline orb, not Play-Doh.
 *
 * Satellites: each trending token is a billboarded sprite — clean circular
 * logo with a thin colored ring (green up / red down), symbol + 24h % change
 * baked into the texture. Bigger than before (0.45–0.70) so they're legible.
 *
 * Hover: HTML tooltip overlay shows full data (symbol, name, price, 1h%,
 * 24h%, volume). Click: navigates to /token/[ca].
 *
 * No comet trails, no shockwaves, no rainbow backdrop. The sphere + tokens
 * carry the visual; restraint is the aesthetic.
 */

type HoverTip = {
  ca: string;
  symbol: string;
  name: string | null;
  price: number | null;
  change1h: number | null;
  change24h: number | null;
  volume: number | null;
  x: number;
  y: number;
} | null;

export function PulseSphere({
  size = 480,
  heat = 0.2,
  tokens = [],
  onTokenClick,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const heatRef = useRef(heat);
  heatRef.current = heat;
  const onClickRef = useRef(onTokenClick);
  onClickRef.current = onTokenClick;
  const tokensRef = useRef(tokens);
  tokensRef.current = tokens;
  const rebuildRef = useRef<((toks: TrendingToken[]) => void) | null>(null);
  const setHoverRef = useRef<((tip: HoverTip) => void) | null>(null);

  const [hover, setHover] = useState<HoverTip>(null);
  setHoverRef.current = setHover;

  // ───── Scene setup ─────
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

    // ───── Sphere — deep, muted, premium ─────
    const geometry = new THREE.IcosahedronGeometry(1, 64);

    const uniforms = {
      uTime:   { value: 0 },
      uHeat:   { value: 0 },
      uBreath: { value: 0 },
    };

    const material = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      vertexShader: VERT,
      fragmentShader: FRAG,
    });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // ───── Subtle data rings (premium tech accent) ─────
    const ringGroup = new THREE.Group();
    scene.add(ringGroup);

    const ringGeoOuter = new THREE.TorusGeometry(1.55, 0.0025, 8, 128);
    const ringMatOuter = new THREE.MeshBasicMaterial({
      color: 0x6b7fff,
      transparent: true,
      opacity: 0.14,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ringOuter = new THREE.Mesh(ringGeoOuter, ringMatOuter);
    ringOuter.rotation.x = Math.PI / 2;
    ringGroup.add(ringOuter);

    const ringGeoInner = new THREE.TorusGeometry(1.22, 0.003, 8, 128);
    const ringMatInner = new THREE.MeshBasicMaterial({
      color: 0xff2d9c,
      transparent: true,
      opacity: 0.10,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ringInner = new THREE.Mesh(ringGeoInner, ringMatInner);
    ringInner.rotation.x = Math.PI / 2.6;
    ringInner.rotation.y = Math.PI / 4;
    ringGroup.add(ringInner);

    // ───── Satellite system ─────
    type Satellite = THREE.Sprite & {
      userData: {
        ca: string;
        symbol: string;
        name: string | null;
        price: number | null;
        change1h: number | null;
        change24h: number | null;
        volume: number | null;
        orbitRadius: number;
        orbitSpeed: number;
        orbitTilt: THREE.Quaternion;
        phase: number;
        baseScale: number;
        ringColor: string;
      };
    };
    let satellites: Satellite[] = [];
    let hoveredSat: Satellite | null = null;

    const buildSatelliteCfg = (token: TrendingToken, idx: number, total: number) => {
      const change = token.price_change_24h ?? 0;
      const volHeat = Math.min(1, Math.abs(change) / 25);
      const rankHeat = total > 1 ? 1 - idx / (total - 1) : 0.5;
      const tHeat = volHeat * 0.6 + rankHeat * 0.4;
      // Bigger, more readable satellites: 0.46 (cool) → 0.72 (hot)
      const baseScale = 0.46 + tHeat * 0.26;
      // Orbits: keep clear separation, push hot ones in
      const orbitRadius = 3.6 - tHeat * 1.4;
      // Slower than before for elegance — 0.03 → 0.12 rad/s
      const orbitSpeed = (0.03 + tHeat * 0.09) * (Math.random() < 0.5 ? 1 : -1);
      const ringColor = change >= 0 ? "#14F195" : "#FF4757";
      const tilt = new THREE.Quaternion();
      const axis = new THREE.Vector3(
        (Math.random() - 0.5) * 0.5,
        1,
        (Math.random() - 0.5) * 0.5,
      ).normalize();
      tilt.setFromAxisAngle(axis, (Math.random() - 0.5) * 0.7);
      return {
        token,
        symbol: (token.symbol ?? "").replace(/^\$/, "").toUpperCase(),
        change,
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
      }
      satellites = [];
    }

    function rebuildSatellites(toks: TrendingToken[]) {
      disposeSatellites();
      const total = toks.length;
      toks.forEach((token, idx) => {
        const cfg = buildSatelliteCfg(token, idx, total);
        createSatelliteTexture({
          symbol: cfg.symbol,
          image: token.image,
          ringColor: cfg.ringColor,
          change: cfg.change,
        }).then((texture) => {
          const mat = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthWrite: false,
          });
          const sprite = new THREE.Sprite(mat) as Satellite;
          sprite.scale.set(cfg.baseScale, cfg.baseScale, 1);
          sprite.userData = {
            ca: token.ca,
            symbol: cfg.symbol,
            name: token.name,
            price: token.price_usd,
            change1h: token.price_change_1h ?? null,
            change24h: token.price_change_24h ?? null,
            volume: token.volume_24h ?? null,
            orbitRadius: cfg.orbitRadius,
            orbitSpeed: cfg.orbitSpeed,
            orbitTilt: cfg.orbitTilt,
            phase: cfg.phase,
            baseScale: cfg.baseScale,
            ringColor: cfg.ringColor,
          };
          scene.add(sprite);
          satellites.push(sprite);
        });
      });
    }
    rebuildRef.current = rebuildSatellites;
    // Build immediately if tokens already loaded by the time this runs
    if (tokensRef.current.length > 0) rebuildSatellites(tokensRef.current);

    // ───── Pointer / raycaster ─────
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerInside = false;
    const projVec = new THREE.Vector3();

    const updatePointer = (e: PointerEvent) => {
      const r = mount.getBoundingClientRect();
      pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      pointerInside =
        e.clientX >= r.left &&
        e.clientX <= r.right &&
        e.clientY >= r.top &&
        e.clientY <= r.bottom;
    };

    const onPointerMove = (e: PointerEvent) => updatePointer(e);
    const onPointerLeave = () => {
      pointerInside = false;
      if (hoveredSat) {
        hoveredSat = null;
        mount.style.cursor = "";
        setHoverRef.current?.(null);
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
    let lastTooltipUpdateMs = 0;
    const tmpVec = new THREE.Vector3();

    const emitHoverTip = (sat: Satellite) => {
      projVec.copy(sat.position).project(camera);
      const r = mount.getBoundingClientRect();
      const sx = ((projVec.x + 1) / 2) * r.width;
      const sy = ((1 - projVec.y) / 2) * r.height;
      const u = sat.userData;
      setHoverRef.current?.({
        ca: u.ca,
        symbol: u.symbol,
        name: u.name,
        price: u.price,
        change1h: u.change1h,
        change24h: u.change24h,
        volume: u.volume,
        x: sx,
        y: sy,
      });
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (!visible) return;
      const dt = Math.min(50, now - last) / 1000;
      last = now;

      uniforms.uTime.value += dt;

      // Heat lerp — faster than before so changes are visible (~0.7s to target).
      const targetHeat = Math.max(0, Math.min(1, heatRef.current));
      currentHeat += (targetHeat - currentHeat) * Math.min(1, dt * 1.5);
      uniforms.uHeat.value = reduced ? Math.min(0.4, currentHeat) : currentHeat;

      // Smooth sine breath at BPM rate. No exponential snap.
      const bpm = 50 + currentHeat * 50;
      const bps = bpm / 60;
      const breath = (Math.sin((now / 1000) * Math.PI * bps * 2) + 1) * 0.5;
      uniforms.uBreath.value = reduced ? 0.15 : breath;

      // Sphere idle motion
      mesh.rotation.y += dt * (0.05 + currentHeat * 0.02);
      mesh.rotation.x += dt * 0.012;
      mesh.position.y = Math.sin(now / 2400) * 0.04;

      // Data rings spin gently with heat
      const ringSpin = 0.05 + currentHeat * 0.20;
      ringOuter.rotation.z -= dt * ringSpin;
      ringInner.rotation.z += dt * ringSpin * 1.2;
      ringGroup.position.y = mesh.position.y;

      // Satellites
      let nextHovered: Satellite | null = null;
      for (const sat of satellites) {
        const u = sat.userData;
        const t = uniforms.uTime.value * u.orbitSpeed + u.phase;
        tmpVec.set(Math.cos(t) * u.orbitRadius, 0, Math.sin(t) * u.orbitRadius);
        tmpVec.y = Math.sin(uniforms.uTime.value * 0.5 + u.phase) * 0.16;
        tmpVec.applyQuaternion(u.orbitTilt);
        sat.position.copy(tmpVec);
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
        if (hoveredSat) {
          emitHoverTip(hoveredSat);
          lastTooltipUpdateMs = now;
        } else {
          setHoverRef.current?.(null);
        }
      } else if (hoveredSat && now - lastTooltipUpdateMs > 100) {
        // Throttle tooltip position updates to ~10Hz so the tooltip follows
        // the orbiting satellite without 60 React re-renders per second.
        emitHoverTip(hoveredSat);
        lastTooltipUpdateMs = now;
      }

      // Per-satellite scale tween (hover lifts it)
      for (const sat of satellites) {
        const target =
          sat === hoveredSat
            ? sat.userData.baseScale * 1.35
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

  // Rebuild satellites when tokens prop changes
  useEffect(() => {
    rebuildRef.current?.(tokens);
  }, [tokens]);

  return (
    <div
      ref={containerRef}
      className="relative flex items-center justify-center"
    >
      <div
        ref={mountRef}
        style={{ width: size, height: size }}
        aria-hidden
      />
      {hover && <Tooltip tip={hover} />}
    </div>
  );
}

function Tooltip({ tip }: { tip: NonNullable<HoverTip> }) {
  const positive24 = (tip.change24h ?? 0) >= 0;
  const positive1 = (tip.change1h ?? 0) >= 0;
  return (
    <div
      className="absolute pointer-events-none z-20"
      style={{
        left: tip.x,
        top: tip.y,
        transform: "translate(-50%, calc(-100% - 16px))",
      }}
    >
      <div
        className="rounded-xl px-3 py-2.5 text-[11px]"
        style={{
          background: "rgba(255, 255, 255, 0.96)",
          backdropFilter: "blur(20px) saturate(160%)",
          border: "1px solid rgba(10, 10, 30, 0.08)",
          boxShadow:
            "0 1px 0 rgba(255,255,255,0.7) inset, 0 12px 32px rgba(10, 10, 30, 0.10)",
          minWidth: 160,
        }}
      >
        <div className="flex items-baseline justify-between gap-3 mb-1.5">
          <span className="font-extrabold text-text-primary tracking-tight">
            ${tip.symbol}
          </span>
          {tip.price != null && (
            <span className="text-mono font-semibold text-text-secondary">
              {humanizePrice(tip.price)}
            </span>
          )}
        </div>
        {tip.name && (
          <div className="text-text-muted text-[10px] truncate mb-1.5">
            {tip.name}
          </div>
        )}
        <div className="flex items-center justify-between gap-3 text-[10.5px]">
          <span className="text-text-muted uppercase tracking-[0.12em]">1h</span>
          {tip.change1h != null ? (
            <span
              className="text-mono font-bold"
              style={{ color: positive1 ? "#0a8f57" : "#c1374a" }}
            >
              {pctChange(tip.change1h)}
            </span>
          ) : (
            <span className="text-text-muted text-mono">—</span>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 text-[10.5px]">
          <span className="text-text-muted uppercase tracking-[0.12em]">24h</span>
          <span
            className="text-mono font-bold"
            style={{ color: positive24 ? "#0a8f57" : "#c1374a" }}
          >
            {pctChange(tip.change24h ?? 0)}
          </span>
        </div>
        {tip.volume != null && (
          <div className="flex items-center justify-between gap-3 text-[10.5px]">
            <span className="text-text-muted uppercase tracking-[0.12em]">Vol</span>
            <span className="text-mono font-semibold text-text-secondary">
              ${humanizeNumber(tip.volume, 1)}
            </span>
          </div>
        )}
        <div className="text-[9px] text-text-muted mt-1.5 pt-1.5 border-t border-text-muted/15">
          click to open
        </div>
      </div>
    </div>
  );
}

// ───── Sphere shaders — premium minimal ─────

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
    // Slow constant flow — heat barely affects flow speed
    float t = uTime * (0.10 + uHeat * 0.20);
    float n = snoise(position * 0.95 + t);
    vNoise = n;

    // Tiny displacement — silhouette stays genuinely round
    float disp = n * 0.022 + uBreath * 0.020;

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
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying float vNoise;

  void main(){
    vec3 N = normalize(vNormal);
    vec3 V = normalize(vViewDir);

    // Strong fresnel for depth — center stays translucent, rim glows
    float fres = clamp(1.0 - dot(V, N), 0.0, 1.0);
    float fresnelRim = pow(fres, 2.4);

    // Deep, restrained palette. Cores aren't max saturation — keeps the
    // sphere from looking like Play-Doh on the light bg.
    vec3 coldCore = vec3(0.10, 0.13, 0.55);   // deep navy
    vec3 coldRim  = vec3(0.55, 0.55, 1.00);   // soft blue

    vec3 hotCore  = vec3(0.50, 0.10, 0.36);   // deep magenta
    vec3 hotRim   = vec3(1.00, 0.42, 0.70);   // soft pink

    vec3 baseCore = mix(coldCore, hotCore, uHeat);
    vec3 rim      = mix(coldRim,  hotRim,  uHeat);

    // Subtle noise tint on the core — adds surface variation without lumps
    float n = vNoise * 0.5 + 0.5;
    baseCore *= 0.85 + n * 0.25;

    // Half-Lambert + soft Phong
    vec3 lightDir = normalize(vec3(0.45, 0.85, 0.95));
    float NdotL = dot(N, lightDir);
    float halfLambert = NdotL * 0.5 + 0.5;
    halfLambert = halfLambert * halfLambert;

    vec3 R = reflect(-lightDir, N);
    float spec = pow(max(dot(V, R), 0.0), 12.0);

    // Compose: deep core diffuse + soft white spec + glowing rim
    float ambient = 0.28;
    vec3 col = baseCore * (ambient + halfLambert * 0.65);
    col += vec3(1.0) * spec * 0.18;
    col += rim * fresnelRim * 0.55;

    // Gentle breath highlight — barely there, just enough to feel alive
    col += rim * uBreath * uHeat * 0.12;

    // Mostly opaque body — silhouette is clear, only the very rim is glassy
    float alpha = 0.92 + fres * 0.08;

    gl_FragColor = vec4(col, alpha);
  }
`;

// ───── Satellite texture ─────
// Clean circular logo + thin colored ring + symbol + 24h % change. No white
// plate (clashed with light bg). All text gets a subtle white halo for
// legibility against any background.

type SatelliteCfg = {
  symbol: string;
  image: string | null;
  ringColor: string;
  change: number;
};

async function createSatelliteTexture(cfg: SatelliteCfg): Promise<THREE.CanvasTexture> {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(canvas);

  // Drop shadow under the disc
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 8;
  ctx.shadowBlur = 18;
  ctx.shadowColor = "rgba(10, 10, 30, 0.22)";
  ctx.fillStyle = "rgba(0, 0, 0, 0)";
  ctx.beginPath();
  ctx.arc(128, 110, 70, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  const drawFallback = () => {
    const grad = ctx.createLinearGradient(58, 40, 198, 180);
    grad.addColorStop(0, "#FF2D9C");
    grad.addColorStop(0.5, "#5E5CFF");
    grad.addColorStop(1, "#14F195");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(128, 110, 70, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 50px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(cfg.symbol.slice(0, 1) || "?", 128, 112);
  };

  if (cfg.image) {
    try {
      const img = await loadImage(cfg.image);
      ctx.save();
      ctx.beginPath();
      ctx.arc(128, 110, 70, 0, Math.PI * 2);
      ctx.clip();
      const r = 140;
      ctx.drawImage(img, 128 - r / 2, 110 - r / 2, r, r);
      ctx.restore();
    } catch {
      drawFallback();
    }
  } else {
    drawFallback();
  }

  // Thin colored ring
  ctx.strokeStyle = cfg.ringColor;
  ctx.lineWidth = 3.5;
  ctx.shadowBlur = 10;
  ctx.shadowColor = cfg.ringColor;
  ctx.beginPath();
  ctx.arc(128, 110, 72, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Symbol — bold, with white halo
  const text = cfg.symbol.slice(0, 8);
  ctx.font = "bold 22px ui-sans-serif, system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  haloText(ctx, text, 128, 200);

  // 24h % change — colored, smaller, below symbol
  const positive = cfg.change >= 0;
  const changeText = `${positive ? "+" : ""}${cfg.change.toFixed(1)}%`;
  ctx.font = "bold 17px ui-monospace, monospace";
  haloText(ctx, changeText, 128, 226, positive ? "#0a8f57" : "#c1374a");

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function haloText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string = "rgba(10, 10, 22, 0.95)",
) {
  ctx.shadowColor = "rgba(255, 255, 255, 0.95)";
  ctx.shadowBlur = 6;
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.fillText(text, x, y);
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
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
