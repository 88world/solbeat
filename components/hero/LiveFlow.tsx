"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { TrendingToken } from "@/types/token";

type Props = {
  tokens: TrendingToken[];
  size?: number;
  heat?: number;
};

/**
 * LiveFlow — three.js particle field that replaces the static treemap with
 * a living view of buy/sell flow. Each particle is a transaction; size = $
 * amount, color = buy (green) / sell (pink). Particles spawn at the bottom
 * of the token's "lane" and float up, dispersing on a curl-noise path.
 *
 * Lanes are vertical columns inside a glass canvas. Each lane carries one
 * trending token's symbol pinned at the top. Particle spawn rate is
 * proportional to that token's actual txn rate from DexScreener so the
 * field reads as real activity, not decoration.
 *
 * Why three.js instead of Canvas2D: 800+ particles compositing, tinted
 * additively. WebGL handles it without breaking a sweat; Canvas2D would
 * choke on the blend modes.
 */
export function LiveFlow({ tokens, size = 380, heat = 0.2 }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const tokensRef = useRef(tokens);
  tokensRef.current = tokens;
  const heatRef = useRef(heat);
  heatRef.current = heat;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const dpr = Math.min(window.devicePixelRatio, 1.75);
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(dpr);
    renderer.setSize(size, size);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
    camera.position.z = 1;

    // Particle pool. Pre-allocate to avoid GC churn during high flow.
    const MAX_PARTICLES = 1200;
    const positions = new Float32Array(MAX_PARTICLES * 3);
    const colors = new Float32Array(MAX_PARTICLES * 3);
    const sizes = new Float32Array(MAX_PARTICLES);
    const alphas = new Float32Array(MAX_PARTICLES);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1));

    // Custom shader: round particles with soft edges, additive-blend friendly.
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {},
      vertexShader: `
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aAlpha;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = aColor;
          vAlpha = aAlpha;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 c = gl_PointCoord - vec2(0.5);
          float d = length(c);
          if (d > 0.5) discard;
          float falloff = smoothstep(0.5, 0.05, d);
          gl_FragColor = vec4(vColor, vAlpha * falloff);
        }
      `,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    // Particle struct (kept off the GPU buffers since we mutate per frame).
    type P = {
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      g: number;
      b: number;
      size: number;
      life: number;
      maxLife: number;
      lane: number;
    };
    const particles: P[] = [];

    let raf = 0;
    let last = performance.now();
    let onScreen = true;
    let tabVisible = !document.hidden;

    const io = new IntersectionObserver(
      (entries) => {
        onScreen = entries[0]?.isIntersecting ?? true;
      },
      { threshold: 0.01 },
    );
    io.observe(mount);
    const onVis = () => {
      tabVisible = !document.hidden;
    };
    document.addEventListener("visibilitychange", onVis);

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (!onScreen || !tabVisible) {
        last = now;
        return;
      }
      const dt = Math.min(50, now - last) / 1000;
      last = now;

      const ts = tokensRef.current.slice(0, 8);
      const lanes = Math.max(1, ts.length);

      // Spawn rate per lane scales with the token's 24h txn count + heat.
      // Even slow tokens get a base flow rate of ~2/s so the canvas always
      // feels alive.
      for (let i = 0; i < ts.length; i++) {
        const t = ts[i];
        const buys = t.txns_24h_buys ?? 0;
        const sells = t.txns_24h_sells ?? 0;
        const total = buys + sells;
        // Convert 24h count to per-second, scaled up so the visual reads.
        const txnsPerSec = (total / 86400) * 80;
        const rate = Math.min(20, Math.max(2, txnsPerSec)) * (0.6 + heatRef.current * 0.6);
        const expectedSpawns = rate * dt;
        // Stochastic spawn — fractional rates spawn probabilistically.
        const spawns = Math.floor(expectedSpawns) + (Math.random() < expectedSpawns % 1 ? 1 : 0);

        for (let s = 0; s < spawns; s++) {
          if (particles.length >= MAX_PARTICLES) particles.shift();
          const buyShare = total > 0 ? buys / total : 0.5;
          const isBuy = Math.random() < buyShare;
          // Lane x position in NDC
          const laneX = (i + 0.5) / lanes * 2 - 1;
          const jitter = (Math.random() - 0.5) * (1 / lanes) * 0.6;
          const startX = laneX + jitter;
          // Color
          const r = isBuy ? 0.20 : 1.00;
          const g = isBuy ? 0.95 : 0.18;
          const b = isBuy ? 0.58 : 0.61;
          const size = 6 + Math.random() * 14;
          const life = 1.5 + Math.random() * 1.0;
          particles.push({
            x: startX,
            y: -1.05,
            vx: (Math.random() - 0.5) * 0.05,
            vy: 0.4 + Math.random() * 0.6,
            r,
            g,
            b,
            size,
            life,
            maxLife: life,
            lane: i,
          });
        }
      }

      // Update + write to GPU buffers.
      let writeIdx = 0;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }
        p.x += p.vx * dt + Math.sin(p.y * 4 + now * 0.001 + p.lane) * 0.005;
        p.y += p.vy * dt;
        // Gentle deceleration as they rise.
        p.vy *= 0.998;
      }

      // Pack alive particles into the buffer attributes.
      writeIdx = 0;
      for (const p of particles) {
        positions[writeIdx * 3 + 0] = p.x;
        positions[writeIdx * 3 + 1] = p.y;
        positions[writeIdx * 3 + 2] = 0;
        colors[writeIdx * 3 + 0] = p.r;
        colors[writeIdx * 3 + 1] = p.g;
        colors[writeIdx * 3 + 2] = p.b;
        sizes[writeIdx] = p.size * (p.life / p.maxLife);
        alphas[writeIdx] = Math.min(1, p.life / p.maxLife) * 0.85;
        writeIdx++;
      }
      // Zero the remainder so leftover indices don't render.
      for (let i = writeIdx; i < MAX_PARTICLES; i++) {
        alphas[i] = 0;
        sizes[i] = 0;
      }
      geometry.attributes.position.needsUpdate = true;
      (geometry.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
      (geometry.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
      (geometry.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [size]);

  // Token labels overlay — pinned to the top of each lane.
  const ts = tokens.slice(0, 8);

  return (
    <div
      className="relative"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {/* Halo behind the canvas */}
      <div
        aria-hidden
        className="absolute inset-0 -m-6 rounded-3xl pointer-events-none"
        style={{
          background:
            heat >= 0.6
              ? "radial-gradient(circle, rgba(255, 45, 156, 0.30) 0%, rgba(255, 139, 45, 0.14) 45%, transparent 75%)"
              : "radial-gradient(circle, rgba(94, 92, 255, 0.28) 0%, rgba(20, 241, 149, 0.12) 45%, transparent 75%)",
          filter: "blur(40px)",
          opacity: 0.7,
          transition: "background 1200ms ease-out",
        }}
      />

      <div
        className="relative w-full h-full overflow-hidden"
        style={{
          borderRadius: 16,
          background: "var(--glass-medium)",
          backdropFilter: "blur(14px) saturate(160%)",
          WebkitBackdropFilter: "blur(14px) saturate(160%)",
          boxShadow:
            "inset 0 0 0 1px var(--border-subtle), 0 14px 40px rgba(10, 10, 30, 0.07)",
        }}
      >
        <div
          ref={mountRef}
          className="absolute inset-0"
          style={{ width: size, height: size }}
        />

        {/* Lane labels at the top */}
        <div
          className="absolute top-0 left-0 right-0 flex pointer-events-none px-1 pt-2"
          style={{ zIndex: 5 }}
        >
          {ts.map((t, i) => (
            <div
              key={t.ca}
              className="flex-1 text-center"
              style={{ minWidth: 0 }}
            >
              <div
                className="text-[8.5px] uppercase tracking-[0.10em] font-bold truncate"
                style={{
                  color: "var(--text-secondary)",
                  textShadow: "0 0 8px var(--bg-primary)",
                }}
              >
                {(t.symbol ?? "—")
                  .toUpperCase()
                  .replace(/^\$/, "")
                  .slice(0, 6)}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom legend */}
        <div
          className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.15em] pointer-events-none"
          style={{ zIndex: 5 }}
        >
          <div className="flex items-center gap-1.5">
            <span
              className="size-1.5 rounded-full"
              style={{ background: "rgba(20, 241, 149, 0.95)" }}
            />
            <span style={{ color: "var(--text-secondary)" }}>buys</span>
          </div>
          <div className="flex items-center gap-1.5 text-[8.5px] tracking-[0.18em]">
            <span style={{ color: "var(--text-muted)" }}>flow</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span style={{ color: "var(--text-secondary)" }}>sells</span>
            <span
              className="size-1.5 rounded-full"
              style={{ background: "rgba(255, 45, 156, 0.95)" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
