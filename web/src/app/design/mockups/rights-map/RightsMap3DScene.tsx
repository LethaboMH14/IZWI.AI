"use client";
// 3D sketch of the Rights map (the optional upgrade; 2D is the default and the fallback).
// The episode is a waveform disc. Clips sit on a timeline arc around it, people float above and are
// tied to the clips they appear in, and outputs are small satellites beside each clip.
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { CLIPS, EPISODE, STATUS_COLOR, clipStatus, samplePeaks, type Output, type Person } from "../sample";

type Props = { people: Person[]; outputs: Record<string, Output>; onFail: () => void };

const ARC0 = -Math.PI * 0.62, ARC1 = Math.PI * 0.62; // timeline arc, front-facing
const R = 3.1;
const angleAt = (ms: number) => ARC0 + (ms / EPISODE.durationMs) * (ARC1 - ARC0);

export function RightsMap3DScene({ people, outputs, onFail }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<Record<string, HTMLDivElement | null>>({});
  const state = useRef({ people, outputs });
  useEffect(() => { state.current = { people, outputs }; });

  useEffect(() => {
    const el = host.current!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      onFail();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    scene.add(new THREE.HemisphereLight(0xfff6e6, 0xe8d9bd, 1.1));
    const key = new THREE.DirectionalLight(0xfff1dc, 1.5);
    key.position.set(-4, 8, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.radius = 5;
    scene.add(key);

    const world = new THREE.Group();
    scene.add(world);
    const std = (c: THREE.ColorRepresentation, r = 0.55) => new THREE.MeshStandardMaterial({ color: c, roughness: r });

    const floor = new THREE.Mesh(new THREE.CircleGeometry(12, 80), new THREE.ShadowMaterial({ opacity: 0.1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    world.add(floor);

    // the episode: a paper disc with its waveform drawn radially, like a record
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.75, 0.12, 96), std(0xffffff, 0.7));
    disc.position.y = 0.06;
    disc.castShadow = disc.receiveShadow = true;
    world.add(disc);
    const N = 160, peaks = samplePeaks(N);
    const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.03, 0.03).translate(0.5, 0, 0), std(0xb77913, 0.5), N);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      m4.makeRotationY(a - Math.PI / 2).scale(new THREE.Vector3(0.25 + peaks[i] * 0.95, 1, 1)).setPosition(Math.sin(a) * 0.45, 0.135, Math.cos(a) * 0.45);
      bars.setMatrixAt(i, m4);
    }
    world.add(bars);

    // the timeline arc
    const arcPts: THREE.Vector3[] = [];
    for (let k = 0; k <= 80; k++) { const a = ARC0 + (k / 80) * (ARC1 - ARC0); arcPts.push(new THREE.Vector3(Math.sin(a) * R, 0.05, Math.cos(a) * R)); }
    world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(arcPts), new THREE.LineBasicMaterial({ color: 0xb77913, transparent: true, opacity: 0.6 })));

    // clips, outputs and people
    const clipMeshes: Record<string, THREE.Mesh> = {};
    const outMeshes: Record<string, THREE.Mesh> = {};
    const anchors: Record<string, THREE.Object3D> = {};
    const slab = new THREE.BoxGeometry(0.9, 0.5, 0.08);
    CLIPS.forEach((c) => {
      const a = angleAt((c.startMs + c.endMs) / 2);
      const m = new THREE.Mesh(slab, std(0xffffff, 0.5));
      m.position.set(Math.sin(a) * R, 0.75, Math.cos(a) * R);
      m.rotation.y = a * 0.3; // mostly facing the viewer so titles read
      m.castShadow = true;
      world.add(m);
      clipMeshes[c.id] = m;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5), std(0xb77913));
      post.position.set(m.position.x, 0.25, m.position.z);
      world.add(post);
      anchors[c.id] = m;
      c.outputs.forEach((o, k) => {
        const b = a + (k - (c.outputs.length - 1) / 2) * 0.16;
        const om = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.38, 0.03), std(0xffffff, 0.45));
        om.position.set(Math.sin(b) * (R + 1.25), 0.55 + k * 0.08, Math.cos(b) * (R + 1.25));
        om.rotation.y = b * 0.3;
        om.castShadow = true;
        world.add(om);
        outMeshes[o.id] = om;
        const g = new THREE.BufferGeometry().setFromPoints([m.position.clone(), om.position.clone()]);
        world.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xcfc6b4 })));
      });
    });

    const personMeshes: Record<string, THREE.Mesh> = {};
    const links: { line: THREE.Line; pid: string }[] = [];
    state.current.people.forEach((p, i) => {
      const a = (i - 1) * 0.9;
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.24, 40, 24), std(0xffffff, 0.4));
      s.position.set(Math.sin(a) * 1.6, 2.5 + (i % 2) * 0.25, Math.cos(a) * 1.6 + 0.4);
      s.castShadow = true;
      world.add(s);
      personMeshes[p.id] = s;
      anchors[p.id] = s;
      CLIPS.filter((c) => c.people.includes(p.id)).forEach((c) => {
        const from = s.position.clone(), to = clipMeshes[c.id].position.clone().add(new THREE.Vector3(0, 0.25, 0));
        const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, 0.4, 0));
        const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(30)), new THREE.LineDashedMaterial({ color: 0x4f6b3a, dashSize: 0.12, gapSize: 0.08 }));
        line.computeLineDistances();
        world.add(line);
        links.push({ line, pid: p.id });
      });
    });

    const size = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h);
      cam.aspect = w / h;
      const d = 11 * Math.max(1, 1.5 / cam.aspect);
      cam.position.set(0, d * 0.42, d);
      cam.lookAt(0, 1, 0);
      cam.updateProjectionMatrix();
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(el);

    let first = true;
    let target = 0, rot = 0, drag = false, lx = 0;
    const down = (e: PointerEvent) => { drag = true; lx = e.clientX; el.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => { if (drag) { target += (e.clientX - lx) * 0.005; lx = e.clientX; } };
    const up = () => { drag = false; };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);

    const col = new THREE.Color(), v = new THREE.Vector3();
    const t0 = performance.now();
    let raf = 0;
    const tick = () => {
      const t = reduce ? 0 : (performance.now() - t0) / 1000;
      const { people: ppl, outputs: outs } = state.current;
      const k = first ? 1 : 0.08;
      first = false;
      if (!drag) target += reduce ? 0 : 0.0006;
      rot += (target - rot) * 0.08;
      world.rotation.y = Math.sin(rot) * 0.5;

      CLIPS.forEach((c) => {
        const s = clipStatus({ ...c, outputs: c.outputs.map((o) => outs[o.id] ?? o) }, ppl);
        const m = clipMeshes[c.id].material as THREE.MeshStandardMaterial;
        m.color.lerp(col.set(STATUS_COLOR[s]), k);
        clipMeshes[c.id].position.y = 0.75 + (s === "held" ? Math.sin(t * 3) * 0.04 : 0);
        c.outputs.forEach((o) => (outMeshes[o.id].material as THREE.MeshStandardMaterial).color.lerp(col.set(STATUS_COLOR[(outs[o.id] ?? o).status]), k));
      });
      ppl.forEach((p, i) => {
        const pm = personMeshes[p.id];
        (pm.material as THREE.MeshStandardMaterial).color.lerp(col.set(p.consent === "waiting" ? "#C4552D" : "#4F6B3A"), k);
        pm.position.y = 2.5 + (i % 2) * 0.25 + Math.sin(t * 1.3 + i) * 0.06;
      });
      links.forEach(({ line, pid }) => {
        const w = ppl.find((p) => p.id === pid)?.consent === "waiting";
        (line.material as THREE.LineDashedMaterial).color.lerp(col.set(w ? "#C4552D" : "#4F6B3A"), k);
      });

      const r = el.getBoundingClientRect();
      Object.entries(anchors).forEach(([id, o]) => {
        const lab = labels.current[id];
        if (!lab) return;
        o.getWorldPosition(v);
        v.y += id.startsWith("c") ? 0.48 : 0.42;
        v.project(cam);
        lab.style.transform = `translate(${(v.x * 0.5 + 0.5) * r.width}px, ${(-v.y * 0.5 + 0.5) * r.height}px) translate(-50%, -100%)`;
      });
      renderer.render(scene, cam);
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mm = m.material as THREE.Material | THREE.Material[] | undefined;
        (Array.isArray(mm) ? mm : mm ? [mm] : []).forEach((x) => x.dispose());
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rm3">
      <div ref={host} className="rm3-canvas" aria-hidden="true" />
      <div className="rm3-labels" aria-hidden="true">
        {CLIPS.map((c, i) => (
          <div key={c.id} ref={(d) => { labels.current[c.id] = d; }} className="rm3-label">{i + 1} · {c.title}</div>
        ))}
        {people.map((p) => (
          <div key={p.id} ref={(d) => { labels.current[p.id] = d; }} className={"rm3-label person" + (p.consent === "waiting" ? " wait" : "")}>
            {p.name}{p.consent === "waiting" ? " · waiting" : ""}
          </div>
        ))}
      </div>
    </div>
  );
}
