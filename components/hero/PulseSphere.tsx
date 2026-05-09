"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

type Props = {
  size?: number;
  /** Heart-rate state — period scales with this. */
  bpm?: number;
};

/**
 * Heartbeat orb: pink→purple body with a green shimmer at the heartbeat peak,
 * inner rim highlight, soft additive halo, and a 900-particle orbital shell.
 * Direct renderer — no postprocessing — so it stays consistent across GPUs.
 */
export function PulseSphere({ size = 240, bpm = 50 }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const bpmRef = useRef(bpm);
  bpmRef.current = bpm;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const dpr = Math.min(window.devicePixelRatio, 2);
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      premultipliedAlpha: false,
    });
    renderer.setPixelRatio(dpr);
    renderer.setSize(size, size, false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.set(0, 0, 4.5);

    // ───── Body ─────
    const geometry = new THREE.IcosahedronGeometry(1, 96);
    const uniforms = {
      uTime: { value: 0 },
      uPulse: { value: 0 },
      uColorCore: { value: new THREE.Color(0xff2d9c) },
      uColorMid: { value: new THREE.Color(0x9945ff) },
      uColorAccent: { value: new THREE.Color(0x14f195) },
      uColorDeep: { value: new THREE.Color(0x140020) },
    };
    const material = new THREE.ShaderMaterial({
      uniforms,
      transparent: false,
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uPulse;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        varying float vDisp;

        // simplex noise (Ashima)
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
          vec3 nrm = normalize(normalMatrix * normal);
          vNormal = nrm;
          float n1 = snoise(normal * 1.2 + vec3(uTime * 0.18));
          float n2 = snoise(normal * 3.6 + vec3(uTime * 0.55 + 5.0));
          float disp = n1 * 0.04 + n2 * 0.014 + uPulse * 0.07;
          vDisp = disp + uPulse * 0.4;
          vec3 displaced = position + normal * disp;
          vec4 mv = modelViewMatrix * vec4(displaced, 1.0);
          vViewDir = -mv.xyz;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uPulse;
        uniform vec3 uColorCore;
        uniform vec3 uColorMid;
        uniform vec3 uColorAccent;
        uniform vec3 uColorDeep;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        varying float vDisp;

        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

        void main(){
          vec3 view = normalize(vViewDir);
          float ndotl = clamp(dot(vNormal, view), 0.0, 1.0);
          float fres  = pow(1.0 - ndotl, 2.0);

          vec3 col = mix(uColorMid, uColorCore, fres);
          col = mix(uColorDeep, col, smoothstep(-0.2, 0.7, ndotl + fres * 0.5));

          float shimmer = smoothstep(0.35, 0.95, vDisp) * uPulse;
          col = mix(col, uColorAccent, shimmer * 0.5);

          float topLight = pow(clamp(vNormal.y * 0.5 + 0.5, 0.0, 1.0), 5.0);
          col += topLight * uColorCore * 0.4;

          col *= (0.95 + uPulse * 0.55);

          // 8-bit dither to kill banding
          float d = (hash(gl_FragCoord.xy) - 0.5) / 255.0;
          col += d;

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // ───── Inner rim highlight (additive front-side limb) ─────
    const limbGeo = new THREE.SphereGeometry(1.05, 64, 64);
    const limbMat = new THREE.ShaderMaterial({
      uniforms: { uPulse: uniforms.uPulse },
      transparent: true,
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
          float ndotl = clamp(dot(vN, vec3(0.0, 0.0, 1.0)), 0.0, 1.0);
          float rim = pow(1.0 - ndotl, 4.5);
          gl_FragColor = vec4(vec3(1.0, 0.45, 0.78), rim * (0.5 + uPulse * 0.45));
        }
      `,
    });
    scene.add(new THREE.Mesh(limbGeo, limbMat));

    // ───── Outer halo ─────
    const haloGeo = new THREE.SphereGeometry(1.7, 64, 64);
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
          float f = pow(1.0 - abs(vN.z), 3.0);
          vec3 col = mix(vec3(0.6, 0.27, 1.0), vec3(1.0, 0.18, 0.61), 0.55);
          gl_FragColor = vec4(col, f * (0.20 + uPulse * 0.30));
        }
      `,
    });
    scene.add(new THREE.Mesh(haloGeo, haloMat));

    // ───── Particle field (orbital shell) ─────
    const PARTICLE_COUNT = 700;
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const sizes = new Float32Array(PARTICLE_COUNT);
    const seeds = new Float32Array(PARTICLE_COUNT);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const r = 1.7 + Math.pow(Math.random(), 1.6) * 1.6;
      const phi = Math.acos(2 * Math.random() - 1);
      const theta = Math.random() * Math.PI * 2;
      positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
      sizes[i] = 0.6 + Math.random() * 1.8;
      seeds[i] = Math.random() * 6.28;
    }
    const partGeo = new THREE.BufferGeometry();
    partGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    partGeo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    partGeo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));

    const partMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: uniforms.uTime,
        uPulse: uniforms.uPulse,
        uPixelRatio: { value: dpr },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float aSize;
        attribute float aSeed;
        uniform float uTime;
        uniform float uPulse;
        uniform float uPixelRatio;
        varying float vAlpha;
        varying vec3 vCol;
        void main(){
          vec3 pos = position;
          float tw = 0.5 + 0.5 * sin(uTime * 2.0 + aSeed * 3.0);
          vAlpha = mix(0.2, 0.85, tw);

          float dist = length(pos);
          float t = smoothstep(1.7, 3.3, dist);
          vec3 c1 = vec3(1.0, 0.18, 0.61);
          vec3 c2 = vec3(0.6, 0.27, 1.0);
          vec3 cAccent = vec3(0.08, 0.95, 0.58);
          vec3 col = mix(c1, c2, t);
          col = mix(col, cAccent, uPulse * 0.4 * step(2.6, dist));
          vCol = col;

          vec4 mv = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mv;
          float pulseSize = 1.0 + uPulse * 0.55;
          gl_PointSize = aSize * uPixelRatio * pulseSize * (300.0 / -mv.z);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying float vAlpha;
        varying vec3 vCol;
        void main(){
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vCol, a * vAlpha);
        }
      `,
    });
    const particles = new THREE.Points(partGeo, partMat);
    scene.add(particles);

    // ───── Animation loop ─────
    let raf = 0;
    let visible = true;
    const onVis = () => {
      visible = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", onVis);

    let last = performance.now();
    let phase = 0;
    let mouseX = 0;
    let mouseY = 0;
    const onMove = (e: MouseEvent) => {
      const r = mount.getBoundingClientRect();
      mouseX = ((e.clientX - r.left) / r.width - 0.5) * 2;
      mouseY = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    window.addEventListener("mousemove", onMove);

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (!visible) return;
      const dt = Math.min(50, now - last) / 1000;
      last = now;
      uniforms.uTime.value += dt * 0.5;

      const period = 60 / bpmRef.current;
      phase += dt / period;
      const t = phase % 1;
      const beat =
        Math.exp(-Math.pow((t - 0.08) * 11, 2)) * 1.0 +
        Math.exp(-Math.pow((t - 0.22) * 16, 2)) * 0.5;
      uniforms.uPulse.value = reduced ? 0.12 : Math.min(1.0, beat);

      mesh.rotation.y += dt * 0.10;
      mesh.rotation.x += dt * 0.04;
      particles.rotation.y -= dt * 0.04;
      particles.rotation.x += dt * 0.015;

      camera.position.x += (mouseX * 0.18 - camera.position.x) * 0.05;
      camera.position.y += (-mouseY * 0.18 - camera.position.y) * 0.05;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("visibilitychange", onVis);
      renderer.dispose();
      geometry.dispose();
      limbGeo.dispose();
      haloGeo.dispose();
      partGeo.dispose();
      material.dispose();
      limbMat.dispose();
      haloMat.dispose();
      partMat.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [size]);

  return (
    <div
      ref={mountRef}
      className="relative pointer-events-none"
      style={{ width: size, height: size }}
      aria-hidden
    />
  );
}
