"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

type Props = {
  size?: number;
  /** Market heat (0..1). Drives core color + breath frequency. */
  heat?: number;
  /** BPM for the breath cadence. Falls back to heat → BPM if not given. */
  bpm?: number;
};

/**
 * The Pulse, a single, deliberate orb that visibly beats with the market.
 *
 *   - The core sphere physically scales 1.00 → 1.13 in time with the BPM
 *     (no faking it: the sin wave that runs the breath is `(now/1000) · π · bps`,
 *     so a 120-BPM market makes the orb expand twice per second). Three AIs
 *     reviewing screenshots said the orb "looked static", boosting amplitude
 *     so the beat reads in the time it takes to glance at a screenshot.
 *   - A CSS halo behind the canvas pulses with the same breath cycle (drop
 *     shadow grows ±30%, scale ±5%), this is what reads from across the
 *     room, the WebGL scale is the close-up tell.
 *   - The fragment shader brightens on the breath peak so the pulse reads
 *     even when the scale is mid-cycle.
 *   - Two abstract data rings spin around it at heat-scaled speed.
 *
 * No satellites. The trending pool now lives in the live chart at the bottom
 * of the hero, where you can actually read it.
 */
export function PulseSphere({ size = 280, heat = 0.2, bpm }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const haloRef = useRef<HTMLDivElement>(null);
  const heatRef = useRef(heat);
  heatRef.current = heat;
  const bpmRef = useRef(bpm ?? 40 + heat * 160);
  bpmRef.current = bpm ?? 40 + heat * 160;

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
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 0, 3.4);

    const geometry = new THREE.IcosahedronGeometry(1, 64);

    const uniforms = {
      uTime: { value: 0 },
      uHeat: { value: 0 },
      uBreath: { value: 0 },
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

    // Two thin data rings spinning at heat-scaled speeds. Decorative tech accent.
    const ring1Geo = new THREE.TorusGeometry(1.45, 0.0028, 8, 96);
    const ring1Mat = new THREE.MeshBasicMaterial({
      color: 0x5e5cff,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    });
    const ring1 = new THREE.Mesh(ring1Geo, ring1Mat);
    ring1.rotation.x = Math.PI / 2;
    scene.add(ring1);

    const ring2Geo = new THREE.TorusGeometry(1.18, 0.0024, 8, 96);
    const ring2Mat = new THREE.MeshBasicMaterial({
      color: 0xff2d9c,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
    });
    const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
    ring2.rotation.x = Math.PI / 3;
    ring2.rotation.y = Math.PI / 4;
    scene.add(ring2);

    // ───── Pointer parallax ─────
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
      targetHover = dist < 1.1 ? 1 - Math.min(1, dist / 1.1) : 0;
    };
    window.addEventListener("mousemove", onMove);

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
    let currentMouseX = 0;
    let breathFiltered = 0; // EMA on the breath envelope, smooths heat-induced amplitude changes
    let currentMouseY = 0;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (!visible) return;
      const dt = Math.min(50, now - last) / 1000;
      last = now;

      uniforms.uTime.value += dt;

      // Heat lerps toward target, visible response when market shifts.
      const targetHeat = Math.max(0, Math.min(1, heatRef.current));
      currentHeat += (targetHeat - currentHeat) * Math.min(1, dt * 1.2);
      uniforms.uHeat.value = reduced ? Math.min(0.4, currentHeat) : currentHeat;

      currentHover += (targetHover - currentHover) * Math.min(1, dt * 1.5);
      uniforms.uHover.value = currentHover;

      // ── The visible heartbeat. ──
      // sine wave at exactly bps frequency → the orb expands and contracts in
      // Reduced-motion pins it at a calm 0.2.
      const bps = bpmRef.current / 60;
      const breathPhase = (now / 1000) * Math.PI * bps * 2; // full cycle = 60/bpm

      // Smoothstep envelope. Pure sine reads mechanical at fixed BPM (saw-
      // tooth-feeling "in-out-in-out"), so we shape it: raw sine into
      // [0..1], then smoothstep softens the peaks and troughs into a
      // breathing curve, slow rise, slow fall, no flat plateau, no sharp
      // turnaround. User feedback: "more fluid, more smooth."
      const rawBreath = (Math.sin(breathPhase) + 1.0) * 0.5;
      const shapedBreath = rawBreath * rawBreath * (3 - 2 * rawBreath); // smoothstep

      // EMA on top so heat changes don't snap the amplitude. Persists across
      // frames via a closure, dt-aware so it stays smooth at any framerate.
      breathFiltered += (shapedBreath - breathFiltered) * Math.min(1, dt * 8);
      const breathSmooth = reduced ? 0.2 : breathFiltered;
      uniforms.uBreath.value = breathSmooth;

      // Mesh scale is the centerpiece pulse. 1.00 base + 5..8% expansion at
      // the breath peak. Tuned down from 8-13% after the user said the
      // amplitude looked off, the halo behind the orb is what reads from
      // far away anyway. Smoothstep envelope keeps the ramp fluid.
      const scaleAmp = 0.05 + currentHeat * 0.03; // 5..8% growth
      const meshScale = 1.0 + breathSmooth * scaleAmp;
      mesh.scale.setScalar(meshScale);

      // Halo. Carries most of the visible pulse so the orb itself can stay
      // gentle. We mutate ref.style directly to avoid React re-renders at
      // 60fps. Halo amplitude scales with heat, calmer markets pulse softer.
      if (haloRef.current) {
        const haloAmp = 0.06 + currentHeat * 0.06; // 6..12% scale
        const haloScale = 1.0 + breathSmooth * haloAmp;
        // Narrower blur range, the prior 36-106px range was too jumpy.
        const blur = 38 + breathSmooth * (24 + currentHeat * 18); // 38..80px
        const opacity = 0.40 + breathSmooth * (0.18 + currentHeat * 0.14);
        haloRef.current.style.transform = `scale(${haloScale.toFixed(3)})`;
        haloRef.current.style.filter = `blur(${blur.toFixed(1)}px)`;
        haloRef.current.style.opacity = opacity.toFixed(2);
      }

      // Subtle camera parallax
      currentMouseX += (targetMouseX - currentMouseX) * 0.04;
      currentMouseY += (targetMouseY - currentMouseY) * 0.04;
      camera.position.x = currentMouseX * 0.18;
      camera.position.y = -currentMouseY * 0.18;
      camera.lookAt(0, 0, 0);

      // Slow tilt + heat-scaled spin
      mesh.rotation.y += dt * (0.05 + currentHeat * 0.04);
      mesh.rotation.x += dt * 0.012;
      mesh.position.y = Math.sin(now / 2400) * 0.04;

      // Data rings spin opposite directions, faster when hot
      const ringSpin = 0.04 + currentHeat * 0.18;
      ring1.rotation.z += dt * ringSpin;
      ring2.rotation.z -= dt * ringSpin * 1.3;
      ring1.position.y = mesh.position.y;
      ring2.position.y = mesh.position.y;

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
      ring1Geo.dispose();
      ring1Mat.dispose();
      ring2Geo.dispose();
      ring2Mat.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [size]);

  const heatClamped = Math.max(0, Math.min(1, heat));
  const shadowColor =
    heatClamped >= 0.6
      ? `rgba(255, 45, 156, ${0.16 + heatClamped * 0.10})`
      : `rgba(94, 92, 255, ${0.14 + (1 - heatClamped) * 0.04})`;
  // Halo gradient: hot markets glow pink/orange, calm markets glow purple/blue.
  const haloGradient =
    heatClamped >= 0.6
      ? "radial-gradient(circle, rgba(255, 45, 156, 0.55) 0%, rgba(255, 139, 45, 0.30) 45%, rgba(255, 45, 156, 0) 75%)"
      : "radial-gradient(circle, rgba(94, 92, 255, 0.45) 0%, rgba(20, 241, 149, 0.18) 45%, rgba(94, 92, 255, 0) 75%)";

  return (
    <div
      className="relative flex items-center justify-center"
      aria-hidden
      style={{ width: size * 1.5, height: size * 1.5 }}
    >
      {/* Halo layer pulses with the breath via direct ref mutation in the rAF loop. */}
      <div
        ref={haloRef}
        className="absolute inset-0 m-auto pointer-events-none"
        style={{
          width: size * 1.15,
          height: size * 1.15,
          background: haloGradient,
          borderRadius: "50%",
          filter: "blur(36px)",
          opacity: 0.4,
          willChange: "transform, filter, opacity",
          transition: "background 800ms ease-out",
        }}
      />
      <div
        ref={mountRef}
        className="relative"
        style={{
          width: size,
          height: size,
          filter: `drop-shadow(0 24px 40px ${shadowColor})`,
          transition: "filter 1200ms ease-out",
        }}
      />
    </div>
  );
}

const VERT = /* glsl */ `
  uniform float uTime;
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
    // Tiny noise displacement so the surface has subtle life.
    float n = snoise(position * 0.9 + uTime * 0.18);
    vNoise = n;
    float disp = n * 0.018 + uBreath * 0.014;
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

    // ── Lighting setup: KEY light from upper-right + RIM light from lower-left ──
    // Two-light setup gives the sphere genuine three-dimensionality. The rim
    // light on the dark side adds a counter-color that breaks the
    // "uniform bowling ball" look, the side facing away from the key isn't
    // black, it has a cool glow from the back.
    vec3 keyDir  = normalize(vec3( 0.55,  0.85,  1.00));
    vec3 backDir = normalize(vec3(-0.65, -0.40, -0.30));

    float NdotKey  = dot(N, keyDir);
    float NdotBack = dot(N, backDir);

    // Half-Lambert on key, soft wraparound diffuse
    float halfLamb = NdotKey * 0.5 + 0.5;
    halfLamb = halfLamb * halfLamb;

    // Back-light rim (only contributes on the dark side)
    float backRim = max(0.0, NdotBack);
    backRim = pow(backRim, 2.0);

    // Fresnel, strong rim, defines silhouette
    float ndotv = clamp(dot(V, N), 0.0, 1.0);
    float fres = 1.0 - ndotv;
    float fresRim = pow(fres, 2.0);

    // ── Color palette ──
    // Deep, restrained cores, never max saturation.
    vec3 coldCore = vec3(0.08, 0.12, 0.55);
    vec3 hotCore  = vec3(0.42, 0.10, 0.36);
    vec3 baseCore = mix(coldCore, hotCore, uHeat);

    // Bright rim accents, fresnel multiplies these (hot-side glow on the curve).
    vec3 coldRim = vec3(0.60, 0.62, 1.00);
    vec3 hotRim  = vec3(1.00, 0.44, 0.70);
    vec3 keyRim = mix(coldRim, hotRim, uHeat);

    // Counter-color back rim, opposite of the heat color so the dark side
    // doesn't go black. At heat 1.0 (hot/pink), the back glows COOL (cyan-blue).
    // At heat 0.0 (cold/blue), the back glows WARM (peach-pink). This is the
    // single biggest fix to "uniform color blob", surfaces always have a
    // counter-light from the back.
    vec3 hotBack  = vec3(0.20, 0.55, 0.95);   // cool cyan-blue when sphere is hot
    vec3 coldBack = vec3(0.95, 0.55, 0.65);   // warm peach when sphere is cold
    vec3 backTint = mix(coldBack, hotBack, uHeat);

    // Slight surface tint from noise
    float n = vNoise * 0.5 + 0.5;
    baseCore *= 0.82 + n * 0.34;

    // ── Specular: soft, broad sheen ──
    vec3 R = reflect(-keyDir, N);
    float spec = pow(max(dot(V, R), 0.0), 14.0);

    // ── Compose ──
    // Body: deep core, lit by key
    vec3 col = baseCore * (0.30 + halfLamb * 0.65);
    // Counter-light fills the dark side with the contrast color
    col += backTint * backRim * 0.32;
    // Specular sheen
    col += vec3(1.0) * spec * 0.22;
    // Fresnel rim, strong, defines silhouette
    col += keyRim * fresRim * 0.85;
    // Breath glow on the rim, color lift on each beat
    col += keyRim * uBreath * 0.22 * (0.4 + uHeat * 0.6);

    // Hover lift
    col *= 1.0 + uHover * 0.08;

    // Glass: more translucent so the light bg shows through, especially at the
    // rim. The front face is mostly opaque so the lighting reads, but the
    // edge fades, gives the orb genuine depth instead of looking solid.
    float alpha = 0.78 + fres * 0.20;
    gl_FragColor = vec4(col, alpha);
  }
`;
