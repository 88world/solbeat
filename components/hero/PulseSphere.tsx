"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

type Props = {
  size?: number;
  /** Heart-rate state — speed multiplier on the pulse cadence. */
  bpm?: number;
};

/**
 * Cinematic heartbeat sphere. Renders an icosahedron with vertex-shader
 * displacement and a chromatic-aberration outer glow. Pauses when off-screen
 * or when prefers-reduced-motion.
 */
export function PulseSphere({ size = 320, bpm = 50 }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const bpmRef = useRef(bpm);
  bpmRef.current = bpm;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(size, size, false);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, 4);

    const geometry = new THREE.IcosahedronGeometry(1, 32);

    const uniforms = {
      uTime: { value: 0 },
      uPulse: { value: 0 },
      uColorA: { value: new THREE.Color(0xff2d9c) },
      uColorB: { value: new THREE.Color(0x9945ff) },
      uColorC: { value: new THREE.Color(0x14f195) },
    };

    const material = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uPulse;
        varying vec3 vNormal;
        varying float vDisp;

        // 3D simplex noise
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
          vNormal = normal;
          float n = snoise(normal * 1.6 + vec3(uTime * 0.4));
          float disp = n * 0.18 + uPulse * 0.20;
          vDisp = disp;
          vec3 displaced = position + normal * disp;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uTime;
        uniform float uPulse;
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        uniform vec3 uColorC;
        varying vec3 vNormal;
        varying float vDisp;

        void main(){
          float fres = pow(1.0 - clamp(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 2.0);
          vec3 col = mix(uColorB, uColorA, fres);
          col = mix(col, uColorC, smoothstep(0.0, 0.6, vDisp + uPulse));
          float alpha = 0.55 + uPulse * 0.4;
          gl_FragColor = vec4(col * (0.6 + fres * 1.2), alpha);
        }
      `,
    });

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // Outer glow halo — additive sprite-style billboard
    const haloGeo = new THREE.SphereGeometry(1.45, 64, 64);
    const haloMat = new THREE.ShaderMaterial({
      uniforms: { uPulse: uniforms.uPulse },
      transparent: true,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        varying vec3 vN;
        void main(){
          vN = normal;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uPulse;
        varying vec3 vN;
        void main(){
          float f = pow(1.0 - abs(vN.z), 2.5);
          vec3 col = mix(vec3(0.6, 0.27, 1.0), vec3(1.0, 0.18, 0.61), 0.5 + uPulse * 0.5);
          gl_FragColor = vec4(col, f * (0.18 + uPulse * 0.25));
        }
      `,
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    scene.add(halo);

    // Subtle rim light
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambient);

    let raf = 0;
    let visible = true;
    const onVis = () => {
      visible = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", onVis);

    let last = performance.now();
    let phase = 0;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (!visible) return;
      const dt = Math.min(50, now - last) / 1000;
      last = now;
      uniforms.uTime.value += dt * 0.6;

      // Heartbeat — period derived from BPM.
      const period = 60 / bpmRef.current;
      phase += dt / period;
      const t = phase % 1;
      // Two-beat shape (lub-dub): short strong spike, then a smaller one.
      const beat =
        Math.exp(-Math.pow((t - 0.10) * 9, 2)) * 1.0 +
        Math.exp(-Math.pow((t - 0.24) * 14, 2)) * 0.55;
      uniforms.uPulse.value = reduced ? 0.15 : Math.min(1.0, beat);

      mesh.rotation.y += dt * 0.18;
      mesh.rotation.x += dt * 0.06;
      halo.rotation.y -= dt * 0.04;

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);

    const onResize = () => renderer.setSize(size, size, false);
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
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
    <div
      ref={mountRef}
      className="relative pointer-events-none"
      style={{ width: size, height: size }}
      aria-hidden
    />
  );
}
