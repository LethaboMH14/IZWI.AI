"use client";
import dynamic from 'next/dynamic';
import { Component, useEffect, useState, type ReactNode } from 'react';
import { browserSceneConditions, shouldUseStaticScene } from '@/lib/gpu-tier';
import '@/app/scene3d.css';
const NightBackdrop = dynamic(() => import('./NightBackdrop'), { ssr:false });
class SceneBoundary extends Component<{children:ReactNode; onFailure:()=>void},{failed:boolean}> {
 state = {failed:false}; static getDerivedStateFromError() { return {failed:true}; }
 componentDidCatch() { this.props.onFailure(); }
 render() { return this.state.failed ? null : this.props.children; }
}
export function Backdrop() {
 const [ready,setReady] = useState(false), [failed,setFailed] = useState(false);
 useEffect(() => {
  let idle = 0; const update = () => { if (shouldUseStaticScene(browserSceneConditions(failed))) { setReady(false); return; } if ('requestIdleCallback' in window) idle = window.requestIdleCallback(() => setReady(true)); else idle = globalThis.setTimeout(() => setReady(true), 1) as unknown as number; };
  const motion = matchMedia('(prefers-reduced-motion: reduce)'); update(); window.addEventListener('resize',update); window.addEventListener('storage',update); window.addEventListener('izwi:staticscene',update); motion.addEventListener('change',update);
  return () => { window.removeEventListener('resize',update); window.removeEventListener('storage',update); window.removeEventListener('izwi:staticscene',update); motion.removeEventListener('change',update); if ('cancelIdleCallback' in window) window.cancelIdleCallback(idle); else clearTimeout(idle); };
 },[failed]);
 return <div className="izwi-backdrop" aria-hidden="true"><div className="izwi-static-backdrop"/>{ready && !failed && <SceneBoundary onFailure={() => setFailed(true)}><div className="izwi-backdrop-canvas"><NightBackdrop onFailure={() => setFailed(true)}/></div></SceneBoundary>}</div>;
}
