"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

type Props = {
  size?: number;
  /**
   * Market heat (0..1+). Drives flow speed, color temperature, and spin.
   * 0 = cool blue, glassy, slow flow. 1 = hot pink with green sparkle, faster
   * churn. Values >1 are clamped to 1 inside the shader.
   *
   * Crucially this replaces the previous `bpm` prop — the orb no longer has a
   * literal heartbeat (the lub-dub expand/contract was the source of the
   * "harsh on the eye" feedback). Heat drives a continuous, ambient flow.
   */
  heat?: number;
};

export function PulseSphere({ size = 480, heat = 0.2 }: Props) {
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
      premultipliedAlpha: false,
    });
    renderer.setPixelRatio(dpr);
    renderer.setSize(size, size, false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0, 3.3);

    // 64-subdivision = ~84k tris. Smooth silhouette without GPU strain.
    const geometry = new THREE.IcosahedronGeometry(1, 64);

    const uniforms = {
      uTime: { value: 0 },
      uHeat: { value: 0 },
      uMouse: { value: new THREE.Vector2(0, 0) },
    };

    const material = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uHeat;
        uniform vec2 uMouse;
        varying vec3 vNormal;
        varying vec3 vViewPosition;
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
          // Time scales with heat. Cool = slow churn, hot = visibly faster flow.
          // This is the "hot market" signal — speed of motion, not pulse frequency.
          float time = uTime * (0.30 + uHeat * 0.55);

          // Single-octave low-frequency noise — silky, never jagged.
          float noise = snoise(position * 1.2 + time);
          vNoise = noise;

          // Tiny mouse warp — barely perceptible reactivity.
          float mouseRipple = sin(position.y * 3.0 + uTime) * uMouse.x * 0.04
                            + cos(position.x * 3.0 + uTime) * uMouse.y * 0.04;

          // Displacement is small and capped — silhouette stays mostly round.
          // Heat slightly amplifies amplitude so a hot market visibly churns harder.
          float disp = noise * 0.085 * (0.85 + uHeat * 0.4);

          vec3 displacedPos = position + normal * (disp + mouseRipple);
          vec4 mv = modelViewMatrix * vec4(displacedPos, 1.0);
          vViewPosition = -mv.xyz;
          vNormal = normalMatrix * normal;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uTime;
        uniform float uHeat;
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        varying float vNoise;

        void main(){
          vec3 N = normalize(vNormal);
          vec3 V = normalize(vViewPosition);

          // Soft, broad fresnel for a glassy bubble look.
          float fres = clamp(1.0 - dot(V, N), 0.0, 1.0);

          // Normalize noise to [0, 1] for color blending
          float n = vNoise * 0.5 + 0.5;

          // ── Color temperature: cold deep blue → hot pink ──
          vec3 coldCore    = vec3(0.10, 0.20, 1.00);  // #1A33FF — deep blue
          vec3 coldSurface = vec3(0.37, 0.36, 1.00);  // #5E5CFF — BV blue
          vec3 colorCold   = mix(coldCore, coldSurface, n);

          vec3 hotCore     = vec3(1.00, 0.18, 0.61);  // #FF2D9C — BV pink
          vec3 hotSurface  = vec3(1.00, 0.45, 0.55);  // coral tint
          vec3 colorHot    = mix(hotCore, hotSurface, n);

          vec3 baseColor = mix(colorCold, colorHot, uHeat);

          // ── Solana green sparkle: only at very high heat, only in valleys ──
          float greenPower = smoothstep(0.7, 1.0, uHeat) * smoothstep(0.6, 1.0, 1.0 - n);
          vec3 greenAccent = vec3(0.08, 0.94, 0.58);  // #14F195
          baseColor = mix(baseColor, greenAccent, greenPower * 0.8);

          // ── Soft specular: low exponent (16) gives a broad sheen, no jagged pixel highlights ──
          vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
          vec3 R = reflect(-lightDir, N);
          float spec = pow(max(dot(V, R), 0.0), 16.0);
          vec3 finalColor = baseColor + vec3(1.0) * spec * 0.32;

          // Translucent body, slightly more opaque at the rim — looks like a glass bubble.
          float alpha = 0.62 + fres * 0.30;

          gl_FragColor = vec4(finalColor, alpha);
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
    let targetMouseX = 0;
    let targetMouseY = 0;

    const onMove = (e: MouseEvent) => {
      const r = mount.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      targetMouseX = Math.max(-1, Math.min(1, (e.clientX - cx) / (r.width / 2)));
      targetMouseY = Math.max(-1, Math.min(1, (e.clientY - cy) / (r.height / 2)));
    };
    window.addEventListener("mousemove", onMove);

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (!visible) return;
      const dt = Math.min(50, now - last) / 1000;
      last = now;

      uniforms.uTime.value += dt;

      // Smoothly interpolate heat — transitions never snap.
      const targetHeat = Math.max(0, Math.min(1, heatRef.current));
      currentHeat += (targetHeat - currentHeat) * Math.min(1, dt * 1.8);
      uniforms.uHeat.value = reduced ? Math.min(0.4, currentHeat) : currentHeat;

      // Smoothly interpolate mouse
      uniforms.uMouse.value.x += (targetMouseX - uniforms.uMouse.value.x) * 0.06;
      uniforms.uMouse.value.y += (targetMouseY - uniforms.uMouse.value.y) * 0.06;

      // Steady idle motion — spin slightly faster when hot, levitation float
      mesh.rotation.y += dt * (0.06 + currentHeat * 0.10);
      mesh.rotation.x += dt * 0.02;
      mesh.rotation.z += dt * 0.005;
      mesh.position.y = Math.sin(now / 2200) * 0.06;

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

  // Drop shadow color shifts with heat — purple when cool, pink when hot.
  // Computed JS-side because the shadow lives on the wrapper, not the canvas.
  const heatClamped = Math.max(0, Math.min(1, heat));
  const shadowColor =
    heatClamped >= 0.6
      ? `rgba(255, 45, 156, ${0.12 + heatClamped * 0.10})`
      : `rgba(94, 92, 255, ${0.12 + (1 - heatClamped) * 0.06})`;

  return (
    <div className="relative flex items-center justify-center" aria-hidden>
      {/* Soft brand-tinted backdrop — also shifts with heat */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none transition-opacity duration-1000"
        style={{
          width: size * 0.92,
          height: size * 0.92,
          background:
            heatClamped >= 0.6
              ? "radial-gradient(circle at 50% 50%, rgba(255, 45, 156, 0.22), rgba(20, 241, 149, 0.10) 50%, transparent 72%)"
              : "radial-gradient(circle at 50% 50%, rgba(94, 92, 255, 0.20), rgba(255, 45, 156, 0.10) 50%, transparent 72%)",
          filter: "blur(60px)",
        }}
      />
      <div
        ref={mountRef}
        className="pointer-events-auto cursor-crosshair transition-[filter] duration-1000 hover:scale-[1.02]"
        style={{
          width: size,
          height: size,
          filter: `drop-shadow(0 30px 60px ${shadowColor})`,
        }}
      />
    </div>
  );
}
