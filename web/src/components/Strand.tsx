"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Microphone, MicrophoneSlash } from "@phosphor-icons/react";

// One strand of voice enters from the left, passes the frame, and fans into many.
// Pointer movement and (if allowed) the visitor's own microphone drive the amplitude.
// Audio is analysed in this tab only. Nothing is recorded or sent anywhere.

const PALETTE = ["#B77913", "#E9A21B", "#F4C55A", "#C4552D", "#E08A5B", "#8A5A0B", "#F1B437", "#D9731F", "#3B352C"];
const COUNT = 30;

const vert = /* glsl */ `
uniform float uTime; uniform float uAmp; uniform float uSplit; uniform float uAspect;
uniform float uLift; uniform float uSpread; uniform float uDepth; uniform float uPhase; uniform float uWidth;
varying float vT; varying float vV; varying float vFan;
void main(){
  float t = uv.x; vT = t; vV = uv.y;
  float x = mix(-1.0, 1.0, t) * uAspect * 1.08;
  float fan = smoothstep(uSplit, 1.0, t); fan = fan * fan * (3.0 - 2.0 * fan); vFan = fan;
  float voice = sin(t * 26.0 - uTime * 2.6) * 0.5 + sin(t * 61.0 - uTime * 4.1 + 1.3) * 0.28 + sin(t * 9.0 - uTime * 1.2) * 0.4;
  float env = (1.0 - smoothstep(uSplit - 0.12, uSplit + 0.02, t)) * smoothstep(0.0, 0.1, t);
  float bundle = uSpread * 0.035 * (1.0 - fan);
  float lift = 1.0 - smoothstep(0.0, uSplit, t); lift = lift * lift * (3.0 - 2.0 * lift);
  float y = bundle + voice * env * (0.035 + uAmp * 0.2) - lift * uLift;
  y += fan * (uSpread * 0.86 + sin(t * 7.0 + uPhase + uTime * 0.5) * 0.03 * (1.0 + uAmp * 2.0));
  float z = fan * uDepth * 0.9;
  float twist = sin(t * 5.0 + uPhase + uTime * 0.35);
  float wdt = uWidth * (0.55 + 0.45 * abs(twist)) * (1.0 + (1.0 - fan) * 0.4);
  y += (uv.y - 0.5) * wdt;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(x, y - 0.02, z, 1.0);
}`;

const frag = /* glsl */ `
uniform vec3 uColor; uniform float uAlpha;
varying float vT; varying float vV; varying float vFan;
void main(){
  float edge = smoothstep(0.0, 0.25, vV) * smoothstep(1.0, 0.75, vV);
  float sheen = 0.82 + 0.3 * sin(vT * 40.0 + vV * 3.0);
  float ends = smoothstep(0.0, 0.04, vT) * smoothstep(1.0, 0.93, vT);
  vec3 c = mix(uColor, vec3(1.0, 0.93, 0.74), (1.0 - edge) * 0.35) * sheen;
  gl_FragColor = vec4(c, edge * ends * uAlpha * mix(0.95, 0.8, vFan));
}`;

export function Strand({ split = 0.44 }: { split?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const amp = useRef(0);
  const mic = useRef<{ stream: MediaStream; ctx: AudioContext; an: AnalyserNode } | null>(null);
  const [micState, setMicState] = useState<"off" | "on" | "denied">("off");

  useEffect(() => {
    const el = host.current!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      el.classList.add("strand-fallback");
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(34, 1, 0.1, 20);
    cam.position.set(0, 0, 3.3);
    const geo = new THREE.PlaneGeometry(1, 1, 220, 1);
    const mats: THREE.ShaderMaterial[] = [];
    for (let i = 0; i < COUNT; i++) {
      const k = i / (COUNT - 1) - 0.5;
      const m = new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: {
          uTime: { value: 0 }, uAmp: { value: 0 }, uSplit: { value: split }, uAspect: { value: 1 }, uLift: { value: 0.78 },
          uSpread: { value: k * 2 + Math.sin(i * 12.9898) * 0.05 },
          uDepth: { value: Math.sin(i * 4.7) * 0.9 },
          uPhase: { value: i * 1.7 },
          uWidth: { value: 0.012 + (((i * 7) % 5) / 5) * 0.03 },
          uColor: { value: new THREE.Color(PALETTE[i % PALETTE.length]) },
          uAlpha: { value: i % 9 === 8 ? 0.55 : 0.92 },
        },
      });
      mats.push(m);
      const mesh = new THREE.Mesh(geo, m);
      mesh.frustumCulled = false;
      scene.add(mesh);
    }
    const size = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
      const visH = 2 * Math.tan((cam.fov * Math.PI) / 360) * cam.position.z;
      mats.forEach((m) => (m.uniforms.uAspect.value = (visH * cam.aspect) / 2));
      scene.scale.setScalar(Math.min(1, visH / 2.1));
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(el);

    let px = 0, py = 0, energy = 0, lastX = 0, lastY = 0;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      px = ((e.clientX - r.left) / r.width - 0.5) * 2;
      py = ((e.clientY - r.top) / r.height - 0.5) * 2;
      energy = Math.min(1, energy + Math.hypot(e.clientX - lastX, e.clientY - lastY) / 500);
      lastX = e.clientX; lastY = e.clientY;
    };
    window.addEventListener("pointermove", move, { passive: true });

    const buf = new Uint8Array(512);
    const t0 = performance.now();
    let raf = 0, smooth = 0;
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      let level = energy * 0.5;
      energy *= 0.94;
      if (mic.current) {
        mic.current.an.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
        level = Math.max(level, Math.min(1, Math.sqrt(sum / buf.length) * 5));
      }
      smooth += (level - smooth) * 0.14;
      amp.current = smooth;
      mats.forEach((m) => { m.uniforms.uTime.value = t; m.uniforms.uAmp.value = smooth; });
      scene.rotation.y += (px * 0.16 - scene.rotation.y) * 0.05;
      scene.rotation.x += (-py * 0.08 - scene.rotation.x) * 0.05;
      renderer.render(scene, cam);
      if (!reduce) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", move);
      geo.dispose();
      mats.forEach((m) => m.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [split]);

  const stopMic = () => {
    mic.current?.stream.getTracks().forEach((t) => t.stop());
    mic.current?.ctx.close();
    mic.current = null;
    setMicState("off");
  };
  useEffect(() => stopMic, []);

  const toggleMic = async () => {
    if (mic.current) return stopMic();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(an);
      mic.current = { stream, ctx, an };
      setMicState("on");
    } catch {
      setMicState("denied");
    }
  };

  return (
    <>
      <div ref={host} className="strand" aria-hidden="true" />
      <button type="button" className={"micbtn" + (micState === "on" ? " on" : "")} onClick={toggleMic} aria-pressed={micState === "on"}>
        {micState === "on" ? <Microphone weight="fill" /> : <MicrophoneSlash />}
        <span>
          {micState === "on" ? "Listening. Say something." : micState === "denied" ? "Mic blocked. Move your cursor instead." : "Use your voice to move it"}
          <small>{micState === "on" ? "Tap to stop. Nothing is recorded." : "Sound stays in this tab. Nothing is recorded."}</small>
        </span>
      </button>
    </>
  );
}
