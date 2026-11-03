import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const DEFAULT_BODY = { height: 170, chest: 92, waist: 76, hips: 98, shoulder: 42, inseam: 78 };

// circumference (cm) -> ellipse half-width (m), assuming depth ≈ 0.7 × width
const halfWidth = (c, ratio = 0.7) => c / 100 / (2 * Math.PI * Math.sqrt((1 + ratio * ratio) / 2));

function smoothProfile(ctrl, n = 80) {
  const curve = new THREE.SplineCurve(ctrl.map((p) => new THREE.Vector2(Math.max(p[0], 0.0005), p[1])));
  return curve.getPoints(n);
}

function lathe(ctrl, segs = 64, n = 80) {
  const geo = new THREE.LatheGeometry(smoothProfile(ctrl, n), segs);
  geo.computeVertexNormals();
  return geo;
}

function bodyModel(b) {
  const H = b.height / 100;
  const crotch = THREE.MathUtils.clamp(b.inseam / 100, 0.4 * H, 0.52 * H);
  const headR = H / 15.2;
  const shoulderY = H * 0.818;
  const neckTop = H - headR * 2.05;
  const hipR = halfWidth(b.hips, 0.78);
  const waistR = halfWidth(b.waist, 0.72);
  const chestR = halfWidth(b.chest, 0.7);
  const shHalf = b.shoulder / 200 + 0.02;
  const torsoSpan = shoulderY - crotch;
  const y = (t) => crotch + torsoSpan * t;

  // [radius, y, zone]
  const torso = [
    [0.0005, crotch - 0.03, "h"],
    [hipR * 0.82, crotch, "h"],
    [hipR, y(0.16), "h"],
    [(hipR + waistR) / 2, y(0.32), "w"],
    [waistR, y(0.45), "w"],
    [(waistR + chestR) / 2 * 0.98, y(0.6), "c"],
    [chestR, y(0.75), "c"],
    [Math.max(chestR, shHalf * 0.86), y(0.9), "c"],
    [shHalf * 0.74, y(0.985), "s"],
    [shHalf * 0.42, shoulderY + 0.025, "s"],
    [0.058, shoulderY + 0.05, "n"],
    [0.054, neckTop, "n"],
    [0.0005, neckTop + 0.01, "n"],
  ];

  const thighR = hipR * 0.52;
  const legLen = crotch;
  const leg = [
    [0.0005, 0.0, "l"],
    [0.042, 0.02, "l"],
    [0.038, legLen * 0.1, "l"],
    [0.056, legLen * 0.3, "l"],
    [0.046, legLen * 0.5, "l"],
    [thighR * 0.82, legLen * 0.72, "l"],
    [thighR, legLen * 0.96, "l"],
    [thighR * 0.9, legLen + 0.03, "l"],
    [0.0005, legLen + 0.05, "l"],
  ];

  const armLen = H * 0.37;
  const armK = THREE.MathUtils.clamp(b.chest / 92, 0.85, 1.35);
  const arm = [
    [0.0005, 0, "a"],
    [0.032, 0.03, "a"],
    [0.026, 0.09, "a"],
    [0.036 * armK, 0.24, "a"],
    [0.032 * armK, armLen * 0.55, "a"],
    [0.042 * armK, armLen * 0.78, "a"],
    [0.046 * armK, armLen * 0.96, "a"],
    [0.0005, armLen + 0.03, "a"],
  ];

  return { H, crotch, headR, shoulderY, neckTop, hipR, waistR, chestR, shHalf, torso, leg, arm, armLen, legX: hipR * 0.5 };
}

function canvasTexture(draw, size = 512) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createAvatar(container, opts = {}) {
  const o = { interactive: true, zoom: false, autoRotate: true, rotateSpeed: 1.6, scan: true, ...opts };
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 50);

  // lights
  scene.add(new THREE.HemisphereLight(0xffffff, 0x220306, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(2, 3, 3.5);
  scene.add(key);
  const rimL = new THREE.PointLight(0xff1a33, 18, 8, 1.6);
  rimL.position.set(-1.6, 1.6, -1.4);
  scene.add(rimL);
  const rimR = new THREE.PointLight(0xff2a40, 14, 8, 1.6);
  rimR.position.set(1.7, 0.8, -1.2);
  scene.add(rimR);
  const fill = new THREE.PointLight(0xffd7d7, 3, 6, 2);
  fill.position.set(-1.5, 1.2, 2);
  scene.add(fill);

  // platform
  const platform = new THREE.Group();
  const floorTex = canvasTexture((ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(227,21,43,0.55)");
    g.addColorStop(0.35, "rgba(227,21,43,0.16)");
    g.addColorStop(1, "rgba(227,21,43,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(1.3, 64),
    new THREE.MeshBasicMaterial({ map: floorTex, transparent: true, depthWrite: false })
  );
  floor.rotation.x = -Math.PI / 2;
  platform.add(floor);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xe3152b, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  const ring1 = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.635, 96), ringMat);
  ring1.rotation.x = -Math.PI / 2;
  ring1.position.y = 0.002;
  platform.add(ring1);
  const tickTex = canvasTexture((ctx, s) => {
    ctx.translate(s / 2, s / 2);
    for (let i = 0; i < 72; i++) {
      ctx.rotate((Math.PI * 2) / 72);
      ctx.fillStyle = i % 6 === 0 ? "rgba(255,60,80,0.95)" : "rgba(255,255,255,0.35)";
      ctx.fillRect(s * 0.44, -1.5, i % 6 === 0 ? s * 0.05 : s * 0.025, 3);
    }
  }, 1024);
  const ticks = new THREE.Mesh(
    new THREE.PlaneGeometry(1.9, 1.9),
    new THREE.MeshBasicMaterial({ map: tickTex, transparent: true, depthWrite: false })
  );
  ticks.rotation.x = -Math.PI / 2;
  ticks.position.y = 0.003;
  platform.add(ticks);
  const arcMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
  const arc = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.728, 64, 1, 0, Math.PI * 0.6), arcMat);
  arc.rotation.x = -Math.PI / 2;
  arc.position.y = 0.004;
  platform.add(arc);
  scene.add(platform);

  const applyTheme = () => {
    const light = document.documentElement.dataset.theme === "light";
    arcMat.color.set(light ? 0x151010 : 0xffffff);
    arcMat.opacity = light ? 0.35 : 0.55;
    ticks.material.opacity = light ? 0.75 : 1;
  };
  applyTheme();
  window.addEventListener("fm-theme", applyTheme);

  // scan ring
  const scanRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.33, 0.0035, 8, 96),
    new THREE.MeshBasicMaterial({ color: 0xff2a40, transparent: true, opacity: 0.9 })
  );
  scanRing.rotation.x = Math.PI / 2;
  scene.add(scanRing);
  const scanGlow = new THREE.Mesh(
    new THREE.CircleGeometry(0.33, 64),
    new THREE.MeshBasicMaterial({ color: 0xff2a40, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false })
  );
  scanGlow.rotation.x = -Math.PI / 2;
  scene.add(scanGlow);

  // materials
  const skinMat = new THREE.MeshStandardMaterial({ color: 0x1d1a1a, roughness: 0.42, metalness: 0.45 });
  const wireMat = new THREE.MeshBasicMaterial({ color: 0xff2a40, wireframe: true, transparent: true, opacity: 0.1 });
  const garmentMat = new THREE.MeshStandardMaterial({ color: 0xe3152b, roughness: 0.78, metalness: 0.05, side: THREE.DoubleSide });

  let avatar = new THREE.Group();
  scene.add(avatar);
  let body = { ...DEFAULT_BODY };
  let garment = null;
  let scanOn = o.scan;
  let model = null;

  function addPart(group, geo, mat, wire = true) {
    const m = new THREE.Mesh(geo, mat);
    group.add(m);
    if (wire && scanOn && mat === skinMat) {
      const w = new THREE.Mesh(geo, wireMat);
      w.scale.setScalar(1.002);
      m.add(w);
    }
    return m;
  }

  function zoneFactor(zone, f) {
    if (!f) return 1;
    return { h: f.hips, w: f.waist, c: f.chest, s: Math.min(f.chest, 1.08), n: 1, l: f.hips, a: Math.min(f.chest, 1.15) }[zone] ?? 1;
  }

  function scaleProfile(ctrl, f, pad, minY = -Infinity, maxY = Infinity) {
    return ctrl
      .filter((p) => p[1] >= minY - 1e-6 && p[1] <= maxY + 1e-6)
      .map(([r, y, z]) => [r * Math.max(zoneFactor(z, f), 1.012) + pad, y, z]);
  }

  function build() {
    avatar.traverse((c) => { if (c.geometry && !c.userData.shared) c.geometry.dispose(); });
    scene.remove(avatar);
    avatar = new THREE.Group();
    scene.add(avatar);
    const m = (model = bodyModel(body));
    const DEPTH = 0.72;

    // torso
    const torsoGeo = lathe(m.torso);
    const torso = addPart(avatar, torsoGeo, skinMat);
    torso.scale.z = DEPTH;

    // head
    const head = addPart(avatar, new THREE.SphereGeometry(m.headR, 48, 32), skinMat);
    head.scale.set(0.9, 1.12, 1);
    head.position.y = m.H - m.headR * 1.12;

    // legs
    const legGeo = lathe(m.leg, 40);
    const legs = [];
    for (const s of [-1, 1]) {
      const leg = addPart(avatar, legGeo, skinMat);
      leg.position.x = s * m.legX;
      leg.scale.z = 0.92;
      legs.push(leg);
      const foot = addPart(avatar, new THREE.CapsuleGeometry(0.036, 0.11, 6, 16), skinMat);
      foot.rotation.x = Math.PI / 2;
      foot.position.set(s * m.legX, 0.03, 0.05);
    }

    // arms (pivot at shoulder)
    const armGeo = lathe(m.arm, 32);
    const arms = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * (m.shHalf - 0.035), m.shoulderY - 0.035, 0);
      pivot.rotation.z = s * 0.11;
      const armMesh = addPart(pivot, armGeo, skinMat);
      armMesh.position.y = -m.armLen - 0.02;
      armMesh.scale.z = 0.9;
      avatar.add(pivot);
      arms.push(pivot);
    }

    // garment
    if (garment) {
      const f = garment.factors || { chest: 1.05, waist: 1.06, hips: 1.05 };
      const pad = 0.006;
      const t = garment.type || "top";
      garmentMat.color.set(garment.color || "#e3152b");
      const top = m.torso[m.torso.length - 3][1]; // neck base
      if (t === "top" || t === "outer" || t === "dress") {
        let ctrl = scaleProfile(m.torso, f, t === "outer" ? pad * 3 : pad, m.crotch - 0.02, top);
        ctrl = ctrl.map((p) => [...p]);
        // collar opening
        ctrl[ctrl.length - 1][0] = 0.07 + (t === "outer" ? 0.012 : 0);
        ctrl[ctrl.length - 1][1] = m.shoulderY + 0.045;
        if (t === "top" || t === "outer") {
          const hemY = t === "outer" ? m.crotch - 0.1 : m.crotch + 0.04;
          ctrl[0] = [ctrl[1][0] * 1.02 + (t === "outer" ? 0.01 : 0), hemY];
          ctrl.splice(1, 0);
        } else {
          // dress: flare below hips down to the knee
          const hip = ctrl[1];
          const flare = Math.max(f.hips, 1.08);
          ctrl.splice(0, 1,
            [m.hipR * flare * 1.45 + 0.04, m.crotch * 0.42],
            [m.hipR * flare * 1.22 + 0.02, m.crotch * 0.68],
            [m.hipR * flare * 1.06 + 0.01, m.crotch - 0.02]
          );
          void hip;
        }
        const g = new THREE.LatheGeometry(smoothProfile(ctrl, 90), 72, 0, Math.PI * 2);
        g.computeVertexNormals();
        const gm = new THREE.Mesh(g, garmentMat);
        gm.scale.z = 0.74 + (t === "dress" ? 0.06 : 0);
        avatar.add(gm);

        if (t !== "dress") {
          const sleeveLen = t === "outer" ? m.armLen * 0.86 : m.armLen * 0.36;
          const sleeveCtrl = scaleProfile(m.arm, f, t === "outer" ? 0.012 : 0.008, m.armLen - sleeveLen, m.armLen + 0.03);
          sleeveCtrl[0] = [sleeveCtrl[0][0] * 1.08, m.armLen - sleeveLen];
          sleeveCtrl[sleeveCtrl.length - 1] = [sleeveCtrl[sleeveCtrl.length - 2][0] * 0.9, m.armLen + 0.045];
          const sg = new THREE.LatheGeometry(smoothProfile(sleeveCtrl, 40), 40);
          sg.computeVertexNormals();
          for (const pivot of arms) {
            const sm = new THREE.Mesh(sg, garmentMat);
            sm.position.y = -m.armLen - 0.02;
            sm.scale.z = 0.92;
            pivot.add(sm);
          }
        }
      } else if (t === "bottoms") {
        const waistIdx = m.torso.findIndex((p) => p[2] === "w" && p[0] === m.waistR);
        const waistY = m.torso[waistIdx][1];
        const ctrl = scaleProfile(m.torso, f, pad, m.crotch - 0.03, waistY).map((p) => [...p]);
        ctrl.push([ctrl[ctrl.length - 1][0] * 0.98, waistY + 0.012]);
        ctrl.push([0.0005, waistY + 0.012]);
        const g = lathe(ctrl, 64, 50);
        const gm = new THREE.Mesh(g, garmentMat);
        gm.scale.z = 0.74;
        avatar.add(gm);
        const legCtrl = scaleProfile(m.leg, { hips: Math.max(f.hips, 1.04) }, 0.01, 0.06, m.crotch + 0.05).map((p) => [...p]);
        legCtrl[0] = [legCtrl[0][0] * 1.25, 0.05];
        const lg = lathe(legCtrl, 40, 60);
        for (const s of [-1, 1]) {
          const lm = new THREE.Mesh(lg, garmentMat);
          lm.position.x = s * m.legX;
          lm.scale.z = 0.95;
          avatar.add(lm);
        }
      }
    }

    const target = Math.max(m.H, 1.8);
    controls.target.set(0, target * 0.5, 0);
    scanRing.scale.setScalar((m.hipR + 0.17) / 0.33);
    scanGlow.scale.copy(scanRing.scale);
    frame();
  }

  // camera + controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.enableZoom = o.zoom && !window.matchMedia("(pointer: coarse)").matches;
  controls.minDistance = 2.2;
  controls.maxDistance = 7;
  controls.minPolarAngle = Math.PI * 0.3;
  controls.maxPolarAngle = Math.PI * 0.56;
  controls.autoRotate = o.autoRotate && !reduced;
  controls.autoRotateSpeed = o.rotateSpeed;
  controls.enabled = o.interactive;
  if (o.interactive && window.matchMedia("(pointer: coarse)").matches) {
    renderer.domElement.style.touchAction = "pan-y";
  }

  let dist = 5;
  function frame() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    camera.aspect = w / h;
    const H = Math.max(model ? model.H : 1.75, 1.8);
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    let need = (H * 1.18) / 2 / Math.tan(vFov / 2);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    need = Math.max(need, 1.7 / 2 / Math.tan(hFov / 2));
    dist = need;
    const dir = camera.position.clone().sub(controls.target);
    if (dir.lengthSq() < 0.001) dir.set(0.6, 0.22, 3);
    dir.setLength(dist);
    camera.position.copy(controls.target).add(dir);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  let viewTween = null;
  function view(name) {
    const az = { front: 0, side: Math.PI / 2, back: Math.PI, left: -Math.PI / 2 }[name] ?? 0;
    const from = controls.getAzimuthalAngle();
    let delta = az - from;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    viewTween = { from, delta, t: 0 };
    controls.autoRotate = false;
  }

  let sweep = 1;
  function pulse() { sweep = 0; }

  const clock = new THREE.Clock();
  let visible = true;
  let rafId = 0;
  function loop() {
    rafId = requestAnimationFrame(loop);
    if (!visible) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    if (viewTween) {
      viewTween.t = Math.min(viewTween.t + dt / 0.7, 1);
      const e = 1 - Math.pow(1 - viewTween.t, 3);
      const a = viewTween.from + viewTween.delta * e;
      const off = camera.position.clone().sub(controls.target);
      const r = Math.hypot(off.x, off.z);
      camera.position.x = controls.target.x + Math.sin(a) * r;
      camera.position.z = controls.target.z + Math.cos(a) * r;
      if (viewTween.t >= 1) viewTween = null;
    }
    controls.update();
    ticks.rotation.z = reduced ? 0 : t * 0.08;
    arc.rotation.z = reduced ? 0 : -t * 0.6;
    const H = model ? model.H : 1.7;
    if (sweep < 1) {
      sweep = Math.min(sweep + dt / 1.6, 1);
      scanRing.position.y = H * (1 - sweep);
      scanRing.material.opacity = 0.95;
    } else {
      const s = reduced ? 0.5 : (Math.sin(t * 0.9) + 1) / 2;
      scanRing.position.y = 0.05 + s * (H - 0.1);
      scanRing.material.opacity = scanOn ? 0.75 : 0;
    }
    scanGlow.position.y = scanRing.position.y;
    scanGlow.material.opacity = scanRing.material.opacity * 0.1;
    renderer.render(scene, camera);
  }

  const ro = new ResizeObserver(() => frame());
  ro.observe(container);
  const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) clock.getDelta(); });
  io.observe(container);

  camera.position.set(0.6, 1.2, 4.5);
  build();
  loop();

  return {
    setBody(b) { body = { ...body, ...b }; build(); },
    setGarment(g) { garment = g; build(); },
    setScan(v) { scanOn = v; build(); },
    setAutoRotate(v) { controls.autoRotate = v && !reduced; },
    get autoRotate() { return controls.autoRotate; },
    view,
    pulse,
    destroy() { cancelAnimationFrame(rafId); ro.disconnect(); io.disconnect(); renderer.dispose(); },
  };
}
