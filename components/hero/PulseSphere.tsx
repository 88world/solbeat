"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

type Props = {
  size?: number;
  /** Heart-rate state — period scales with this. */
  bpm?: number;
};

/**
 * Liquid heartbeat orb.
 *
 * Surface flow comes from FBM (fractal Brownian motion — 3 octaves of simplex
 * noise summed) sampled at a *domain-warped* position: a separate triple of
 * noise samples perturbs the input coordinates before the main FBM is taken.
 * That combination — the same trick Maxime Heckel and the threejs-journey
 * "flow field" lessons use — gives genuinely organic, never-repeating motion
 * that reads as ink moving in water rather than a sphere wobbling.
 *
 * On top of the flow: iridescent fresnel + two-light specular (warm key,
 * cool brand-pink fill) for wet-glass dimensionality, cursor-warp ripples,
 * heartbeat pulse, slow levitation float, smoothstep rim for a soft edge.
 *
 * Direct render — no postprocessing — so the visual is consistent across GPUs.
 */
export function PulseSphere({ size = 480, bpm = 50 }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const bpmRef = useRef(bpm);
  bpmRef.current = bpm;

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
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 0, 3.3);

    // 64-subdivision = ~84k tris. With FBM on each vertex we want enough
    // triangles to resolve the flow but not so many that we stall on noise
    // sampling. 64 is the sweet spot for buttery surface motion.
    const geometry = new THREE.IcosahedronGeometry(1, 64);

    const uniforms = {
      uTime: { value: 0 },
      uPulse: { value: 0 },
      uHover: { value: 0 },
      uMouse: { value: new THREE.Vector2(0, 0) },
      uColorA: { value: new THREE.Color("#FF2D9C") }, // BV pink
      uColorB: { value: new THREE.Color("#5E5CFF") }, // BV blue
      uColorC: { value: new THREE.Color("#14F195") }, // Solana green (sparkle only)
    };

    const material = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uPulse;
        uniform vec2 uMouse;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        varying float vNoise;
        varying float vDisp;

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

        // Fractal Brownian motion — 3 octaves at doubling frequencies
        float fbm(vec3 p){
          float v = 0.0;
          float a = 0.5;
          for(int i = 0; i < 3; i++){
            v += a * snoise(p);
            p = p * 2.02;
            a *= 0.5;
          }
          return v;
        }

        void main(){
          // Lower base frequency = longer wavelengths = smoother flow.
          vec3 base = position * 0.65;

          // Domain warping — three independent noise samples perturb the
          // input coordinates. This is the trick that turns "wobble" into
          // "flow."
          vec3 q = vec3(
            snoise(base + vec3(uTime * 0.18, 0.0, 0.0)),
            snoise(base + vec3(0.0, uTime * 0.22, 5.7)),
            snoise(base + vec3(8.3, 0.0, uTime * 0.15))
          );

          // Sample FBM at the warped position.
          float n = fbm(base + q * 0.55);
          vNoise = n;

          // Cursor warp — wave ripple along the surface based on cursor.
          float mouseRipple = sin(position.y * 3.6 + uTime * 0.7) * uMouse.x * 0.08
                            + cos(position.x * 3.6 + uTime * 0.6) * uMouse.y * 0.08;

          float pulseExpand = uPulse * 0.11;
          float disp = n * 0.13 + pulseExpand + mouseRipple;
          vDisp = disp;

          vec3 displaced = position + normal * disp;
          vec4 mv = modelViewMatrix * vec4(displaced, 1.0);
          vViewDir = -mv.xyz;
          vNormal = normalMatrix * normal;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uTime;
        uniform float uPulse;
        uniform float uHover;
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        uniform vec3 uColorC;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        varying float vNoise;
        varying float vDisp;

        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

        void main(){
          vec3 N = normalize(vNormal);
          vec3 V = normalize(vViewDir);

          // Fresnel
          float ndotv = clamp(dot(V, N), 0.0, 1.0);
          float fres = 1.0 - ndotv;
          float fresPow = pow(fres, 2.0);

          // Liquid base color — pink/blue mix flowing with the FBM
          vec3 base = mix(uColorB, uColorA, smoothstep(-0.4, 1.0, vNoise + uPulse * 0.4));

          // Iridescent rim — animated chromatic shimmer
          vec3 iri = vec3(
            sin(fres * 8.0  + uTime * 1.0)        * 0.5 + 0.5,
            sin(fres * 10.0 + uTime * 1.25 + 1.7) * 0.5 + 0.5,
            sin(fres * 12.0 + uTime * 1.5  + 3.4) * 0.5 + 0.5
          );
          vec3 col = mix(base, iri, fresPow * 0.55);

          // Two-light specular — key (warm, exponent 64) + fill (brand pink, exponent 24)
          vec3 keyDir  = normalize(vec3( 0.6,  0.9,  0.8));
          vec3 fillDir = normalize(vec3(-0.5, -0.4,  0.6));
          vec3 Rk = reflect(-keyDir,  N);
          vec3 Rf = reflect(-fillDir, N);
          float specKey  = pow(max(dot(V, Rk), 0.0), 64.0);
          float specFill = pow(max(dot(V, Rf), 0.0), 24.0);
          col += vec3(1.0) * specKey * 1.35;
          col += uColorA * specFill * 0.32;

          // Heartbeat green sparkle — only on the pulse peak, only on raised flow ridges
          float sparkle = smoothstep(0.55, 0.95, vDisp + 0.5) * uPulse;
          col = mix(col, uColorC, sparkle * 0.30);

          // Pulse-driven exposure lift
          col *= (0.92 + uPulse * 0.42 + uHover * 0.10);

          // Dither to kill banding
          float d = (hash(gl_FragCoord.xy) - 0.5) / 255.0;
          col += d;

          // Smoothstep rim — soft glassy edge instead of a hard circle
          float bodyAlpha = 0.93;
          float rimSoft = smoothstep(0.92, 1.0, fres);
          float alpha = bodyAlpha - rimSoft * 0.55 + uHover * 0.06;
          gl_FragColor = vec4(col, clamp(alpha, 0.35, 1.0));
        }
      `,
    });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // Outer halo — soft, gentle falloff so the orb melts into the bg
    const haloGeo = new THREE.SphereGeometry(1.62, 48, 48);
    const haloMat = new THREE.ShaderMaterial({
      uniforms: { uPulse: uniforms.uPulse },
      transparent: true,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        varying vec3 vN;
        void main(){
          vN = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        uniform float uPulse;
        varying vec3 vN;
        void main(){
          float f = pow(1.0 - abs(vN.z), 4.0);
          vec3 col = mix(vec3(0.37, 0.36, 1.0), vec3(1.0, 0.18, 0.61), 0.55);
          gl_FragColor = vec4(col, f * (0.13 + uPulse * 0.22));
        }
      `,
    });
    scene.add(new THREE.Mesh(haloGeo, haloMat));

    // ───── Animation loop ─────
    let raf = 0;
    let visible = true;
    const onVis = () => {
      visible = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", onVis);

    let last = performance.now();
    let phase = 0;
    let targetMouseX = 0;
    let targetMouseY = 0;
    let targetHover = 0;

    const onMove = (e: MouseEvent) => {
      const r = mount.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = (e.clientX - cx) / (r.width / 2);
      const dy = (e.clientY - cy) / (r.height / 2);
      targetMouseX = Math.max(-1, Math.min(1, dx));
      targetMouseY = Math.max(-1, Math.min(1, dy));
      const dist = Math.sqrt(dx * dx + dy * dy);
      targetHover = dist < 1.2 ? 1 - Math.min(1, dist / 1.2) : 0;
    };
    window.addEventListener("mousemove", onMove);

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (!visible) return;
      const dt = Math.min(50, now - last) / 1000;
      last = now;
      uniforms.uTime.value += dt * 0.45;

      // Damped lerping — smoother than per-frame snapping
      uniforms.uMouse.value.x += (targetMouseX - uniforms.uMouse.value.x) * 0.07;
      uniforms.uMouse.value.y += (targetMouseY - uniforms.uMouse.value.y) * 0.07;
      uniforms.uHover.value += (targetHover - uniforms.uHover.value) * 0.08;

      // Heartbeat (lub-dub)
      const period = 60 / bpmRef.current;
      phase += dt / period;
      const t = phase % 1;
      const beat =
        Math.exp(-Math.pow((t - 0.08) * 11, 2)) * 1.0 +
        Math.exp(-Math.pow((t - 0.22) * 16, 2)) * 0.5;
      uniforms.uPulse.value = reduced ? 0.12 : Math.min(1.0, beat);

      // Slow tilt + steady spin + levitation
      mesh.rotation.x += (targetMouseY * 0.28 - mesh.rotation.x) * 0.04;
      mesh.rotation.y += (targetMouseX * 0.36 - mesh.rotation.y) * 0.04 + dt * 0.05;
      mesh.rotation.z += dt * 0.008;
      mesh.position.y = Math.sin(now / 1900) * 0.06;

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("visibilitychange", onVis);
      renderer.dispose();
      geometry.dispose();
      haloGeo.dispose();
      material.dispose();
      haloMat.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [size]);

  return (
    <div className="relative flex items-center justify-center" aria-hidden>
      {/* Soft brand-tinted backdrop */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
        style={{
          width: size * 0.94,
          height: size * 0.94,
          background:
            "radial-gradient(circle at 50% 50%, rgba(255, 45, 156, 0.20), rgba(94, 92, 255, 0.14) 40%, transparent 72%)",
          filter: "blur(60px)",
        }}
      />
      <div
        ref={mountRef}
        className="pointer-events-auto cursor-crosshair transition-transform duration-700 ease-out hover:scale-[1.025]"
        style={{
          width: size,
          height: size,
          filter: "drop-shadow(0 30px 60px rgba(94, 92, 255, 0.16))",
        }}
      />
    </div>
  );
}
