"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

type Props = {
  size?: number;
  /**
   * Market heat (0..1). Drives ONLY color, drop-shadow tint, and a tiny spin
   * rate variation. Crucially does NOT drive flow speed — the surface evolves
   * at a constant rate so a hot market never reads as "chaotic." A hot market
   * reads as a different *color*, not a different *speed*.
   */
  heat?: number;
};

/**
 * Three.js sphere — proper 3D lighting (Half-Lambert + Phong + Fresnel) on a
 * mostly-opaque body. The previous translucent + iridescent approach looked
 * washed out; this one looks like an actual lit sphere with a clear silhouette.
 *
 * Performance: 32 subdivisions (~20k tris), single-octave low-amplitude noise,
 * no postprocessing, DPR capped at 1.5. Targets 60fps on integrated GPUs.
 */
export function PulseSphere({ size = 380, heat = 0.2 }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const heatRef = useRef(heat);
  heatRef.current = heat;

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
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0, 3.4);

    // 32 subdivisions = ~20k triangles. Plenty for 0.05 displacement amplitude.
    const geometry = new THREE.IcosahedronGeometry(1, 32);

    const uniforms = {
      uTime: { value: 0 },
      uHeat: { value: 0 },
      uHover: { value: 0 },
    };

    const material = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      vertexShader: /* glsl */ `
        uniform float uTime;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        varying float vNoise;

        // Ashima simplex noise
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
          // Constant time evolution — flow speed never changes with state.
          // 0.25 is slow enough to read as ambient breathing.
          float noise = snoise(position * 1.0 + uTime * 0.25);
          vNoise = noise;

          // Small displacement keeps the silhouette clean and readable.
          float disp = noise * 0.05;

          vec3 displaced = position + normal * disp;
          vec4 mv = modelViewMatrix * vec4(displaced, 1.0);
          vViewDir = -mv.xyz;
          vNormal = normalMatrix * normal;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uHeat;
        uniform float uHover;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        varying float vNoise;

        void main(){
          vec3 N = normalize(vNormal);
          vec3 V = normalize(vViewDir);

          // ── Color: cold blue → hot pink, driven by market heat ──
          vec3 coldColor = vec3(0.36, 0.36, 1.00);  // #5C5CFF (BV blue)
          vec3 hotColor  = vec3(1.00, 0.18, 0.61);  // #FF2D9C (BV pink)
          vec3 baseColor = mix(coldColor, hotColor, uHeat);

          // Subtle surface tint variation
          float n = vNoise * 0.5 + 0.5;
          baseColor *= 0.85 + n * 0.30;

          // ── Lighting: Half-Lambert + Phong + Fresnel ──
          // Half-Lambert wraps light around the sphere more softly than full Lambert,
          // so the dark side never goes pure black. Squared for stronger contrast.
          vec3 lightDir = normalize(vec3(0.5, 0.8, 1.0));
          float NdotL = dot(N, lightDir);
          float halfLambert = NdotL * 0.5 + 0.5;
          halfLambert = halfLambert * halfLambert;

          // Phong specular — exponent 90 gives a tight, contained highlight
          vec3 R = reflect(-lightDir, N);
          float spec = pow(max(dot(V, R), 0.0), 90.0);

          // Fresnel — brightens the rim, defines the silhouette
          float fres = pow(clamp(1.0 - dot(V, N), 0.0, 1.0), 1.6);

          // Compose
          float ambient = 0.35;
          vec3 col = baseColor * (ambient + halfLambert * 0.70);
          col += vec3(1.0) * spec * 0.55;
          col += baseColor * fres * 0.45;

          // Hover: subtle brightness lift only — no flow change, no spin change
          col *= 1.0 + uHover * 0.10;

          // ── Solana green sparkle: only at very high heat, in noise valleys ──
          float greenPower = smoothstep(0.78, 1.0, uHeat)
                           * smoothstep(0.55, 1.0, 1.0 - n);
          col = mix(col, vec3(0.08, 0.94, 0.58), greenPower * 0.45);

          // Mostly opaque — clear silhouette, light glassy edge from fresnel
          gl_FragColor = vec4(col, 0.96);
        }
      `,
    });

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

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
    let targetHover = 0;

    // Detect when cursor approaches the sphere area — separate from heat
    const onMove = (e: MouseEvent) => {
      const r = mount.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = (e.clientX - cx) / (r.width / 2);
      const dy = (e.clientY - cy) / (r.height / 2);
      const dist = Math.sqrt(dx * dx + dy * dy);
      targetHover = dist < 1.1 ? 1 - Math.min(1, dist / 1.1) : 0;
    };
    window.addEventListener("mousemove", onMove);

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (!visible) return;
      const dt = Math.min(50, now - last) / 1000;
      last = now;

      // Constant time progression — flow rate never changes
      uniforms.uTime.value += dt;

      // Heat: slow ambient lerp (~1.8s to fully reach a new target)
      const targetHeat = Math.max(0, Math.min(1, heatRef.current));
      currentHeat += (targetHeat - currentHeat) * Math.min(1, dt * 0.55);
      uniforms.uHeat.value = reduced ? Math.min(0.4, currentHeat) : currentHeat;

      // Hover: independent, slightly faster lerp for responsive feel (~0.5s)
      currentHover += (targetHover - currentHover) * Math.min(1, dt * 1.8);
      uniforms.uHover.value = currentHover;

      // Spin: tiny range that barely changes with heat (0.05 → 0.07 rad/s).
      // Hover does NOT affect spin. Heat barely affects spin.
      // This is what fixes the "spins so fast on hover" issue.
      mesh.rotation.y += dt * (0.05 + currentHeat * 0.02);
      mesh.rotation.x += dt * 0.012;
      mesh.position.y = Math.sin(now / 2400) * 0.045;

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("visibilitychange", onVis);
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [size]);

  // Drop shadow color shifts with heat — the only "external" heat signal
  const heatClamped = Math.max(0, Math.min(1, heat));
  const shadowColor =
    heatClamped >= 0.6
      ? `rgba(255, 45, 156, ${0.16 + heatClamped * 0.08})`
      : `rgba(94, 92, 255, ${0.14 + (1 - heatClamped) * 0.04})`;

  return (
    <div className="relative flex items-center justify-center" aria-hidden>
      {/* Soft brand-tinted backdrop — heat-shifted */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none transition-opacity duration-1000"
        style={{
          width: size * 0.92,
          height: size * 0.92,
          background:
            heatClamped >= 0.6
              ? "radial-gradient(circle at 50% 50%, rgba(255, 45, 156, 0.20), rgba(20, 241, 149, 0.10) 50%, transparent 72%)"
              : "radial-gradient(circle at 50% 50%, rgba(94, 92, 255, 0.18), rgba(255, 45, 156, 0.10) 50%, transparent 72%)",
          filter: "blur(60px)",
        }}
      />
      <div
        ref={mountRef}
        className="pointer-events-auto cursor-crosshair"
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
