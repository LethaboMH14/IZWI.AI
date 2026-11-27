"use client";
// Mockup of the landing Story Room: a light "paper studio" with the episode's voice as a crown of bars
// at the centre and the five pillars as stations on a ring. Drag, scroll or tap turns the room.
// Plain three.js (already a dependency) so the mockup adds no packages. The canvas is aria-hidden;
// the station labels are real buttons positioned over it.
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { PILLARS, samplePeaks } from "../sample";

const RING = 4.3;
const IVORY = 0xfaf8f4;
const PAPER = 0xffffff;
const INK = 0x2b2620;

type Props = { selected: number; onSelect: (i: number) => void; onFail: () => void; shift?: number };

function roundedRect(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r);
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r);
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return s;
}
const slab = (w: number, h: number, d: number, r: number) =>
  new THREE.ExtrudeGeometry(roundedRect(w, h, r), { depth: d, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 3, curveSegments: 8 }).translate(0, 0, -d / 2);

const mat = (color: THREE.ColorRepresentation, rough = 0.62, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });

/** The object that sits on each pillar's pedestal. */
function emblem(id: string, color: string): THREE.Group {
  const g = new THREE.Group();
  const c = new THREE.Color(color);
  if (id === "create") {
    // three clip cards fanned out of one
    [-0.32, 0, 0.32].forEach((a, i) => {
      const card = new THREE.Mesh(slab(0.42, 0.74, 0.03, 0.06), mat(i === 1 ? c : i === 0 ? 0xf4c55a : PAPER, 0.5));
      card.position.set(a * 0.9, 0.42, -Math.abs(a) * 0.3);
      card.rotation.z = -a * 0.7;
      g.add(card);
    });
  } else if (id === "localise") {
    const bubble = (col: THREE.ColorRepresentation, x: number, y: number, s: number, flip: number) => {
      const b = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 40, 24), mat(col, 0.45));
      body.scale.set(1.15, 0.78, 0.42);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 18), mat(col, 0.45));
      tail.position.set(0.2 * flip, -0.26, 0);
      tail.rotation.z = Math.PI + 0.5 * flip;
      b.add(body, tail);
      b.position.set(x, y, 0);
      b.scale.setScalar(s);
      return b;
    };
    g.add(bubble(c, -0.14, 0.62, 1, 1), bubble(PAPER, 0.22, 0.3, 0.78, -1));
  } else if (id === "protect") {
    const s = new THREE.Shape();
    s.moveTo(0, 0.5);
    s.quadraticCurveTo(0.22, 0.42, 0.4, 0.42);
    s.quadraticCurveTo(0.42, -0.1, 0, -0.42);
    s.quadraticCurveTo(-0.42, -0.1, -0.4, 0.42);
    s.quadraticCurveTo(-0.22, 0.42, 0, 0.5);
    const shield = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 4 }).translate(0, 0, -0.06), mat(c, 0.5));
    shield.position.y = 0.58;
    // a check mark: short stroke and long stroke
    const short = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.04), mat(PAPER, 0.4));
    short.position.set(-0.07, 0.56, 0.11);
    short.rotation.z = 0.75;
    const long = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.04), mat(PAPER, 0.4));
    long.position.set(0.06, 0.6, 0.11);
    long.rotation.z = -0.62;
    g.add(shield, short, long);
  } else if (id === "publish") {
    const phone = new THREE.Mesh(slab(0.44, 0.84, 0.05, 0.08), mat(INK, 0.4));
    phone.position.y = 0.6;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.76), mat(c, 0.35, { emissive: c, emissiveIntensity: 0.18 }));
    screen.position.set(0, 0.6, 0.042);
    const cap = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.06), mat(PAPER, 0.4));
    cap.position.set(0, 0.36, 0.044);
    g.add(phone, screen, cap);
    g.rotation.z = -0.08;
  } else {
    // stacked coins, the planned pillar
    for (let i = 0; i < 4; i++) {
      const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.07, 48), mat(i % 2 ? 0xe9a21b : c, 0.38));
      coin.position.set(Math.sin(i * 1.7) * 0.03, 0.08 + i * 0.085, Math.cos(i * 2.1) * 0.03);
      g.add(coin);
    }
    const tilted = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.07, 48), mat(0xf4c55a, 0.38));
    tilted.position.set(0.34, 0.3, 0.05);
    tilted.rotation.set(Math.PI / 2.4, 0, 0.3);
    g.add(tilted);
  }
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
  return g;
}

export function StoryRoomScene({ selected, onSelect, onFail, shift = 0 }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<(HTMLButtonElement | null)[]>([]);
  const sel = useRef(selected);
  const selectRef = useRef(onSelect);
  useEffect(() => { sel.current = selected; selectRef.current = onSelect; });

  useEffect(() => {
    const el = host.current!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      onFail();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    el.appendChild(renderer.domElement);
    renderer.domElement.addEventListener("webglcontextlost", (e) => { e.preventDefault(); onFail(); });

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(IVORY, 13, 24);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
    const look = new THREE.Vector3(0, 0.75, 0);

    // light: warm sky, soft key from the upper left, amber bounce from the floor
    scene.add(new THREE.HemisphereLight(0xfff6e6, 0xe8d9bd, 1.35));
    const key = new THREE.DirectionalLight(0xfff1dc, 2.1);
    key.position.set(-5, 9, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -8; key.shadow.camera.right = 8; key.shadow.camera.top = 8; key.shadow.camera.bottom = -8;
    key.shadow.radius = 6;
    key.shadow.bias = -0.0004;
    scene.add(key);
    const warm = new THREE.PointLight(0xe9a21b, 6, 7, 1.6);
    warm.position.set(0, 1.4, 0);
    scene.add(warm);

    const world = new THREE.Group();
    world.position.x = shift;
    scene.add(world);
    const room = new THREE.Group(); // the part that turns
    world.add(room);

    // floor: a paper disc that catches soft shadows, with an amber path ring
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 96), mat(0xf6f1e8, 0.95));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    world.add(floor);
    const stage = new THREE.Mesh(new THREE.CylinderGeometry(RING + 1.1, RING + 1.25, 0.08, 128), mat(0xfdfbf7, 0.9));
    stage.position.y = 0.04;
    stage.receiveShadow = true;
    world.add(stage);
    const path = new THREE.Mesh(new THREE.TorusGeometry(RING, 0.018, 8, 200), mat(0xb77913, 0.5));
    path.rotation.x = Math.PI / 2;
    path.position.y = 0.09;
    room.add(path);
    // tick marks on the path, like a timeline
    const ticks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.012, 0.01, 0.16), mat(0xb77913, 0.6), 60);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      m4.makeRotationY(a).setPosition(Math.sin(a) * RING, 0.09, Math.cos(a) * RING);
      ticks.setMatrixAt(i, m4);
    }
    room.add(ticks);

    // the voice crown: the episode's waveform as bars standing in a circle
    const N = 144;
    const peaks = samplePeaks(N);
    const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(0.055, 1, 0.055).translate(0, 0.5, 0), mat(PAPER, 0.45), N);
    bars.castShadow = true;
    const cA = new THREE.Color(0x8a5a0b), cB = new THREE.Color(0xf4c55a), tmp = new THREE.Color();
    for (let i = 0; i < N; i++) bars.setColorAt(i, tmp.copy(cA).lerp(cB, peaks[i]));
    room.add(bars);
    const inner = new THREE.InstancedMesh(new THREE.BoxGeometry(0.04, 1, 0.04).translate(0, 0.5, 0), mat(0xe9a21b, 0.45), 72);
    room.add(inner);
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, 0.14, 96), mat(PAPER, 0.7));
    plinth.position.y = 0.11;
    plinth.receiveShadow = true;
    plinth.castShadow = true;
    room.add(plinth);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.26, 48, 32), mat(0xe9a21b, 0.3, { emissive: 0xe9a21b, emissiveIntensity: 0.55 }));
    core.position.y = 0.95;
    core.castShadow = true;
    room.add(core);

    // the five stations
    const stations: { g: THREE.Group; em: THREE.Group; halo: THREE.Mesh; a: number }[] = [];
    const pickables: THREE.Object3D[] = [];
    PILLARS.forEach((p, i) => {
      const a = (i / PILLARS.length) * Math.PI * 2;
      const g = new THREE.Group();
      g.position.set(Math.sin(a) * RING, 0, Math.cos(a) * RING);
      g.rotation.y = a;
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.7, 0.42, 64), mat(PAPER, 0.55));
      ped.position.y = 0.29;
      ped.castShadow = true;
      ped.receiveShadow = true;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.705, 0.705, 0.05, 64), mat(p.color, 0.5));
      band.position.y = 0.16;
      const halo = new THREE.Mesh(new THREE.RingGeometry(0.8, 0.9, 64), new THREE.MeshBasicMaterial({ color: 0xe9a21b, transparent: true, opacity: 0 }));
      halo.rotation.x = -Math.PI / 2;
      halo.position.y = 0.1;
      const em = emblem(p.id, p.color);
      em.position.y = 0.5;
      if (p.planned) em.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (m) { m.transparent = true; m.opacity = 0.55; } });
      g.add(ped, band, halo, em);
      g.userData.index = i;
      room.add(g);
      stations.push({ g, em, halo, a });
      pickables.push(g);
    });

    // floating dust, very light
    const dustGeo = new THREE.BufferGeometry();
    const dust = new Float32Array(160 * 3);
    for (let i = 0; i < 160; i++) {
      const r = 2 + ((i * 37) % 100) / 100 * 7, a = i * 2.39;
      dust.set([Math.sin(a) * r, 0.4 + ((i * 53) % 100) / 100 * 3.2, Math.cos(a) * r], i * 3);
    }
    dustGeo.setAttribute("position", new THREE.BufferAttribute(dust, 3));
    const motes = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xd9a441, size: 0.035, transparent: true, opacity: 0.55, depthWrite: false }));
    room.add(motes);

    const size = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h);
      cam.aspect = w / h;
      // pull back on narrow frames so the whole ring fits
      const dist = 16.5 * Math.max(1, 1.45 / cam.aspect);
      cam.position.set(0, dist * 0.42, dist);
      cam.lookAt(look);
      cam.updateProjectionMatrix();
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(el);

    // interaction: drag or scroll turns the room; a tap on a station selects it
    let rot = 0, target = 0, dragging = false, moved = 0, lastX = 0;
    const toFront = (i: number) => {
      const want = -(i / PILLARS.length) * Math.PI * 2;
      // nearest equivalent angle
      target = want + Math.round((target - want) / (Math.PI * 2)) * Math.PI * 2;
    };
    toFront(sel.current);
    rot = target;
    let shown = sel.current;
    const down = (e: PointerEvent) => { dragging = true; moved = 0; lastX = e.clientX; el.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      moved += Math.abs(dx);
      target += dx * 0.006;
    };
    const ray = new THREE.Raycaster();
    const up = (e: PointerEvent) => {
      dragging = false;
      if (moved < 6) {
        const r = el.getBoundingClientRect();
        ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), cam);
        const hit = ray.intersectObjects(pickables, true)[0];
        let o: THREE.Object3D | null = hit?.object ?? null;
        while (o && o.userData.index === undefined) o = o.parent;
        if (o) selectRef.current(o.userData.index);
      } else {
        // settle on the station nearest the front
        const step = (Math.PI * 2) / PILLARS.length;
        const i = ((Math.round(-target / step) % PILLARS.length) + PILLARS.length) % PILLARS.length;
        selectRef.current(i);
      }
    };
    let wheelT = 0;
    const wheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < 4 || performance.now() - wheelT < 450) return;
      e.preventDefault();
      wheelT = performance.now();
      selectRef.current((sel.current + (e.deltaY > 0 ? 1 : PILLARS.length - 1)) % PILLARS.length);
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("wheel", wheel, { passive: false });

    const v = new THREE.Vector3();
    const t0 = performance.now();
    let raf = 0, last = t0;
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = (now - t0) / 1000;
      if (sel.current !== shown) { shown = sel.current; toFront(shown); }
      rot += (target - rot) * (reduce ? 1 : 1 - Math.pow(0.0015, dt));
      room.rotation.y = rot;

      const live = reduce ? 0 : t;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        const h = 0.18 + peaks[i] * 1.35 * (0.82 + 0.18 * Math.sin(live * 2.2 + i * 0.37));
        m4.makeRotationY(a).scale(new THREE.Vector3(1, h, 1)).setPosition(Math.sin(a) * 1.12, 0.18, Math.cos(a) * 1.12);
        bars.setMatrixAt(i, m4);
      }
      bars.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * Math.PI * 2 + 0.02;
        const h = 0.12 + peaks[(i * 2 + 40) % N] * 0.55 * (0.8 + 0.2 * Math.sin(live * 3.1 + i));
        m4.makeRotationY(a).scale(new THREE.Vector3(1, h, 1)).setPosition(Math.sin(a) * 0.68, 0.18, Math.cos(a) * 0.68);
        inner.setMatrixAt(i, m4);
      }
      inner.instanceMatrix.needsUpdate = true;
      core.position.y = 0.95 + Math.sin(live * 1.6) * 0.05;
      motes.rotation.y = live * 0.02;

      stations.forEach((s, i) => {
        const on = i === sel.current;
        s.em.position.y = 0.5 + (on ? 0.14 : 0) + Math.sin(live * 1.4 + i) * 0.04;
        s.em.rotation.y = (on ? Math.sin(live * 0.8) * 0.35 : 0);
        const hm = s.halo.material as THREE.MeshBasicMaterial;
        hm.opacity += ((on ? 0.85 : 0) - hm.opacity) * 0.12;
        // label follows the station on screen
        const btn = labels.current[i];
        if (btn) {
          s.g.getWorldPosition(v);
          const depth = v.z; // toward the camera is +z
          v.y += 1.85;
          v.project(cam);
          const r = el.getBoundingClientRect();
          const x = (v.x * 0.5 + 0.5) * r.width, y = (-v.y * 0.5 + 0.5) * r.height;
          btn.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
          btn.style.opacity = String(Math.max(0.28, Math.min(1, (depth + RING) / (RING * 1.3))));
          btn.style.zIndex = String(Math.round(depth * 10 + 100));
        }
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
      el.removeEventListener("wheel", wheel);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mm = m.material as THREE.Material | THREE.Material[] | undefined;
        (Array.isArray(mm) ? mm : mm ? [mm] : []).forEach((x) => x.dispose());
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
    // the scene is built once; selection flows through refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="sr-stage">
      <div ref={host} className="sr-canvas" aria-hidden="true" />
      <div className="sr-labels">
        {PILLARS.map((p, i) => (
          <button
            key={p.id}
            ref={(b) => { labels.current[i] = b; }}
            type="button"
            className={"sr-label" + (i === selected ? " on" : "") + (p.planned ? " planned" : "")}
            style={{ ["--pc" as string]: p.color }}
            aria-pressed={i === selected}
            onClick={() => onSelect(i)}
          >
            <i />
            {p.name}
            {p.planned && <small>planned</small>}
          </button>
        ))}
      </div>
    </div>
  );
}
