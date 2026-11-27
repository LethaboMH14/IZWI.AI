"use client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

function World() {
  const { camera, invalidate } = useThree();
  const orbit = useRef(false), pointer = useRef(0), start = useRef(0);
  const perf = useRef<{ begin: number; last: number; frames: number[]; heap?: number; losses: number; done: boolean } | null>(null);
  // The skyline is the static image behind this transparent canvas; the scene adds the floor, light and parallax.
  useEffect(() => {
    const p = (e: PointerEvent) => { const bounds = (document.querySelector('.izwi-backdrop')?.parentElement)?.getBoundingClientRect(); if (!bounds || !bounds.width) return; pointer.current = Math.max(-1, Math.min(1, (e.clientX - bounds.left) / bounds.width * 2 - 1)); invalidate(); };
    const o = (e: Event) => { orbit.current = Boolean((e as CustomEvent<boolean>).detail); start.current = performance.now(); invalidate(); };
    const loss = () => { if (perf.current) perf.current.losses++; };
    window.addEventListener('pointermove', p); window.addEventListener('izwi:orbit', o); window.addEventListener('izwi:contextlost', loss);
    if (process.env.NODE_ENV === 'development' && new URLSearchParams(location.search).get('perf') === '1') {
      const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
      perf.current = { begin: performance.now(), last: 0, frames: [], heap: memory?.usedJSHeapSize, losses: 0, done: false }; orbit.current = true; start.current = performance.now(); invalidate();
    }
    return () => { window.removeEventListener('pointermove', p); window.removeEventListener('izwi:orbit', o); window.removeEventListener('izwi:contextlost', loss); };
  }, [invalidate]);
  useFrame(() => {
    const now = performance.now(), measure = perf.current;
    if (measure && !measure.done) {
      if (measure.last) measure.frames.push(now - measure.last); measure.last = now;
      if (now - measure.begin >= 20000) { measure.done = true; orbit.current = false; const f = measure.frames.slice().sort((a,b) => a-b); const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize; console.info('[izwi:perf]', { medianMs: f[Math.floor(f.length * .5)], p95Ms: f[Math.floor(f.length * .95)], heapDeltaMB: heap !== undefined && measure.heap !== undefined ? (heap - measure.heap) / 1048576 : 'unavailable', contextLosses: measure.losses, frames: f.length }); }
    }
    const angle = pointer.current * Math.PI / 120 + (orbit.current ? Math.sin((now-start.current)/6000) * Math.PI / 30 : 0);
    camera.position.set(Math.sin(angle)*6, 2.8, Math.cos(angle)*6); camera.lookAt(0,1,-4);
    if (orbit.current) invalidate();
  });
  const dust = useMemo(() => new Float32Array(Array.from({length: 72}, (_, i) => i % 3 === 0 ? Math.sin(i*13)*8 : i % 3 === 1 ? 1 + (i%11)*.23 : -2 - (i%7))), []);
  return <><fog attach="fog" args={['#26180e', 8, 35]} /><ambientLight intensity={0.45}/><pointLight color="#ffb552" intensity={35} position={[-5,5,1]}/><pointLight color="#e58c39" intensity={24} position={[6,3,-3]}/>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.03,-5]}><planeGeometry args={[80,80]}/><meshStandardMaterial color="#17120e" metalness={0.65} roughness={0.48}/></mesh>
    <gridHelper args={[50,50,'#7c4f25','#49331d']} position={[0,0,-8]} material-transparent material-opacity={0.15}/>
    <points><bufferGeometry><bufferAttribute attach="attributes-position" args={[dust,3]}/></bufferGeometry><pointsMaterial color="#e3a14b" size={0.035} transparent opacity={0.35}/></points></>;
}
export default function NightBackdrop({ onFailure }: { onFailure: () => void }) {
 return <Canvas frameloop="demand" dpr={[1,1.5]} camera={{ position:[0,2.8,6], fov:45 }} onCreated={({gl}) => { gl.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); window.dispatchEvent(new Event('izwi:contextlost')); if (process.env.NODE_ENV === 'development' && new URLSearchParams(location.search).get('perf') === '1') console.warn('[izwi:perf] context lost; measurement aborted'); onFailure(); }, { once:true }); }} fallback={null}><World/></Canvas>;
}
