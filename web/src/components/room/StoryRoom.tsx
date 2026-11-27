"use client";
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Component, useEffect, useState, type ReactNode } from 'react';
import { useProject } from '@/components/workspace/ProjectProvider';
import { stageCounts } from '@/lib/stage-counts';
import { browserSceneConditions, shouldUseStaticScene } from '@/lib/gpu-tier';
import '@/app/scene3d.css';
const RoomScene = dynamic(() => import('./RoomScene'), {ssr:false});
class Boundary extends Component<{children:ReactNode; onFailure:()=>void},{failed:boolean}> { state={failed:false}; static getDerivedStateFromError(){return {failed:true}} componentDidCatch(){this.props.onFailure()} render(){return this.state.failed?null:this.props.children} }
export function StoryRoom() {
 const state = useProject(s=>s.state); const [selected,setSelected]=useState<number|null>(null), [ready,setReady]=useState(false), [failed,setFailed]=useState(false);
 useEffect(()=>{let idle=0; const update=()=>{if(shouldUseStaticScene(browserSceneConditions(failed))){setReady(false);return} if('requestIdleCallback' in window) idle=window.requestIdleCallback(()=>setReady(true)); else idle=globalThis.setTimeout(()=>setReady(true),1) as unknown as number}; const m=matchMedia('(prefers-reduced-motion: reduce)'); update(); window.addEventListener('resize',update);window.addEventListener('storage',update);window.addEventListener('izwi:staticscene',update);m.addEventListener('change',update);return ()=>{window.removeEventListener('resize',update);window.removeEventListener('storage',update);window.removeEventListener('izwi:staticscene',update);m.removeEventListener('change',update);if('cancelIdleCallback' in window) window.cancelIdleCallback(idle);else clearTimeout(idle)}},[failed]);
 useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')setSelected(null)};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[]);
  const stages = stageCounts(state);
  const samples = state.peaks.length <= 120 ? state.peaks : Array.from({ length: 120 }, (_, i) => state.peaks[Math.floor((i * state.peaks.length) / 120)]);
  // Rounded so the server and the browser print identical numbers (trig differs in the last digits → hydration error).
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const ring = samples.map((v, i) => {
    const a = (i * Math.PI * 2) / samples.length;
    const n = Math.min(1, Math.abs(Number.isFinite(v) ? v : 0)) * 30;
    return { x1: r2(Math.sin(a) * 65), y1: r2(Math.cos(a) * 65), x2: r2(Math.sin(a) * (67 + n)), y2: r2(Math.cos(a) * (67 + n)) };
  });
  const base = `/app/p/${encodeURIComponent(state.project.id)}`;
  return (
    <section className="izwi-room" aria-label={`${state.project.title} story room`}>
      <div className="izwi-room-art" aria-hidden="true">
        <svg className="izwi-ring" viewBox="-110 -110 220 220">
          <circle r="65" fill="none" stroke="#684523" strokeWidth="1" />
          {ring.map((l, i) => <line key={i} {...l} stroke="#e6aa53" strokeWidth="2" />)}
        </svg>
        {ready && !failed && (
          <Boundary onFailure={() => setFailed(true)}>
            <div className="izwi-room-canvas">
              <RoomScene peaks={state.peaks} selected={selected} onSelect={setSelected} onFailure={() => setFailed(true)} />
            </div>
          </Boundary>
        )}
      </div>
      <div className="izwi-room-content">
        <header>
          <p>Story Room</p>
          <h1>{state.project.title}</h1>
          {!state.peaks.length && <span>Add a recording to see its voice ring.</span>}
        </header>
        <ol className="izwi-stations">
          {stages.map((stage, i) => (
            <li key={stage.id} data-tone={stage.tone}>
              <button type="button" onClick={() => setSelected(i)} aria-expanded={selected === i}>
                <strong>{stage.label}</strong>
                <span>{stage.count ?? "—"}</span>
                <small>{stage.detail}</small>
              </button>
              {selected === i && <Link href={`${base}${i === 0 ? "" : `/${stage.id}`}`}>Open {stage.label} <span aria-hidden="true">→</span></Link>}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
export default StoryRoom;
