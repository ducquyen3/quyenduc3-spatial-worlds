// Nexform hero: the cat behind the title, built from spheres that each glow like a bead of light, with a
// wave running through its ring; scrolling breaks it apart and gathers it into a ringed world. A classic
// script that imports three.js on the fly, so the page also works opened straight from disk.
(() => {
  const host = document.getElementById('world');
  const shadow = document.querySelector('.hero__shadow');
  const frameOut = document.getElementById('frame');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const phone = matchMedia('(max-width: 700px)');

  const FPS = 24;
  const LOOP = 72;
  const FOV = 32;
  const ELEVATION = 0.17; // radians the camera looks down
  const INTRO = 2.4; // seconds for the spheres to gather on load
  const SPHERE = 0.034; // base sphere diameter, in world units
  const WORLD = 0.6; // radius of the world the cat becomes
  const CAT_HEIGHT = 1.68; // the cat's height, in world units
  const CAT_DEPTH = 0.3; // how far its middle puffs out towards the camera
  const CAT_LIFT = 0.05; // raises the cat so the ring runs through its lower face
  const HALO_SIZE = 3; // each sphere's halo, as a multiple of the sphere
  const HALO_GAIN = 0.2; // how much light a halo adds at its brightest

  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const mix = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, v) => {
    const t = clamp01((v - a) / (b - a));
    return t * t * (3 - 2 * t);
  };

  function seeded(seed) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- The particles: where each sphere starts, rests, and ends up, and how bright it glows ----------
  function buildCloud(THREE, dense) {
    const rnd = seeded(11);
    const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) / 0.577;
    const onSphere = () => {
      const z = rnd() * 2 - 1;
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(1 - z * z);
      return [r * Math.cos(a), z, r * Math.sin(a)];
    };

    const out = { a: [], b: [], na: [], nb: [], from: [], delay: [], size: [], light: [], kind: [], seed: [] };
    const add = (a, b, na, nb, size, light, kind, delay) => {
      out.a.push(...a);
      out.b.push(...b);
      out.na.push(...na);
      out.nb.push(...nb);
      const d = onSphere();
      const r = 2.4 + rnd() * 3;
      out.from.push(d[0] * r, d[1] * r * 0.6, d[2] * r * 0.4);
      out.size.push(size);
      out.light.push(light);
      out.kind.push(kind);
      out.delay.push(clamp01(delay));
      out.seed.push(rnd());
    };

    // Body: the cat, baked from a picture into rows of spheres (cat-data.js, made with
    // tools/bake-cat.html). Each sphere glows as bright as the picture is where it sits, and the
    // silhouette is puffed out in depth so it sways like a relief. On the world, each row of the picture
    // becomes a band of latitude, so the spheres cover it evenly from pole to pole.
    const cat = window.NEXFORM_CAT;
    if (cat) {
      const bytes = Uint8Array.from(atob(cat.data), (ch) => ch.charCodeAt(0));
      const count = bytes.length / 5;
      const step = CAT_HEIGHT / cat.rows;
      const depthAt = new Float32Array(cat.cols * cat.rows).fill(-1);
      const perRow = new Uint16Array(cat.rows);
      for (let i = 0; i < bytes.length; i += 5) {
        depthAt[bytes[i + 1] * cat.cols + bytes[i]] = (bytes[i + 2] / 255) * CAT_DEPTH;
        perRow[bytes[i + 1]]++;
      }
      const before = new Uint32Array(cat.rows);
      for (let r = 1; r < cat.rows; r++) before[r] = before[r - 1] + perRow[r - 1];
      const placed = new Uint16Array(cat.rows);
      const depth = (c, r, fallback) => {
        const v = c >= 0 && r >= 0 && c < cat.cols && r < cat.rows ? depthAt[r * cat.cols + c] : -1;
        return v < 0 ? fallback : v;
      };

      for (let i = 0; i < bytes.length; i += 5) {
        const col = bytes[i];
        const row = bytes[i + 1];
        const shade = bytes[i + 3] / 255;
        const edge = bytes[i + 4];
        const d = depthAt[row * cat.cols + col];

        // Nudged off the grid so the rows never read as a lattice; the dusty rim scatters in depth too.
        const x = (col - cat.cols / 2 + 0.5 + (rnd() - 0.5) * 0.4) * step;
        const y = (cat.rows / 2 - row - 0.5 + (rnd() - 0.5) * 0.4) * step + CAT_LIFT;
        const z = d + (rnd() - 0.5) * step * (edge < 3 ? 6 : 0.8);

        // Surface normal from the puffed depth, tipped up towards the light.
        const n = new THREE.Vector3(
          -(depth(col + 1, row, d) - depth(col - 1, row, d)) / (2 * step),
          -(depth(col, row - 1, d) - depth(col, row + 1, d)) / (2 * step),
          1
        )
          .normalize()
          .add(new THREE.Vector3(0, 0.55, 0.1))
          .normalize();

        const lat = Math.asin(1 - (2 * (before[row] + rnd() * perRow[row])) / count);
        const lon = -Math.PI + (2 * Math.PI * (placed[row]++ + 0.5)) / perRow[row];
        const dir = new THREE.Vector3(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon));

        add(
          [x, y, z],
          dir.clone().multiplyScalar(WORLD).toArray(),
          n.toArray(),
          dir.toArray(),
          ((1.35 * step) / SPHERE) * (0.88 + rnd() * 0.24),
          Math.pow(shade, 1.15),
          0,
          rnd() * 0.55 + (row / cat.rows) * 0.3
        );
      }
    }

    // Ring: a wavy disc that thins out past the edges of the screen. Close in it becomes the world's
    // ring; far out it becomes a field of distant spheres.
    const RING = dense ? 6000 : 3600;
    for (let i = 0; i < RING; i++) {
      const th = rnd() * Math.PI * 2;
      // Most of the ring hugs the form as a dense skirt; the rest trails off to the edges.
      const spread = rnd() < 0.6 ? 0.45 : 1.25;
      const rho = Math.min(6.5, 0.86 - Math.log(1 - rnd() * 0.998) * spread);
      const reach = rho - 0.86;
      let y = -Math.cos(th) * 0.045 * reach + gauss() * 0.016 * (1 + 0.6 * reach);
      if (rnd() < 0.08) y += gauss() * 0.12;
      // The disc runs wide across the screen but stays shallow in depth, so nothing flies at the camera,
      // and it passes behind the cat rather than across its face.
      const a = [rho * Math.cos(th), y, Math.sin(th) * Math.min(rho, 2.2) * 0.55];
      if (Math.abs(a[0]) < 0.8) a[2] = -Math.abs(a[2]) - 0.05;

      if (reach < 1.25) {
        const rb = 0.9 + reach * 0.42;
        add(
          a,
          [rb * Math.cos(th), gauss() * 0.012, rb * Math.sin(th)],
          [0, 1, 0],
          [0, 1, 0],
          0.5 + 0.32 * Math.max(0, 1 - reach / 1.6) + rnd() * 0.14,
          0.22 + rnd() * 0.4,
          1,
          0.25 + rnd() * 0.55 + Math.min(0.2, reach * 0.05)
        );
      } else {
        add(
          a,
          [(rnd() * 2 - 1) * 7, (rnd() * 2 - 1) * 3.6, -2 - rnd() * 6],
          [0, 1, 0],
          [0, 1, 0],
          0.45 + rnd() * 0.15,
          0.5 + rnd() * 0.5,
          2,
          0.3 + rnd() * 0.6
        );
      }
    }

    const geometry = new THREE.BufferGeometry();
    const attr = (name, arr, n) => geometry.setAttribute(name, new THREE.Float32BufferAttribute(arr, n));
    attr('position', out.a, 3);
    attr('aPosB', out.b, 3);
    attr('aNormA', out.na, 3);
    attr('aNormB', out.nb, 3);
    attr('aFrom', out.from, 3);
    attr('aDelay', out.delay, 1);
    attr('aSize', out.size, 1);
    attr('aLight', out.light, 1);
    attr('aKind', out.kind, 1);
    attr('aSeed', out.seed, 1);
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 12);
    return geometry;
  }

  // ---------- Shaders ----------
  // Shared by the spheres and their halos: where a sphere is now, which way it faces, how far it has
  // gathered (ti) and changed into the world (tm), its size on screen, and how brightly it glows.
  const placeSphere = /* glsl */ `
    uniform float uTime;
    uniform float uIntro;
    uniform float uMorph;
    uniform float uYawA;
    uniform float uYawRing;
    uniform float uYawB;
    uniform float uSize;
    uniform float uScale;
    uniform float uPulse;
    uniform float uSparkle;
    attribute vec3 aPosB;
    attribute vec3 aNormA;
    attribute vec3 aNormB;
    attribute vec3 aFrom;
    attribute float aDelay;
    attribute float aSize;
    attribute float aLight;
    attribute float aKind;
    attribute float aSeed;

    mat3 rotY(float a) {
      float c = cos(a), s = sin(a);
      return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c);
    }

    float easeInOut(float t) {
      return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0;
    }

    void place(out vec4 mv, out vec3 n, out float ti, out float size, out float light) {
      bool body = aKind < 0.5;

      // Resting form, with the wave running round the ring.
      vec3 pA = position;
      if (!body) {
        float rho = length(pA.xz);
        float th = atan(pA.z, pA.x);
        pA.y += 0.085 * sin(2.0 * th + rho * 1.5 - uTime) * clamp(rho - 0.85, 0.0, 1.0);
      }
      mat3 rA = rotY(body ? uYawA : uYawRing);
      pA = rA * pA;
      vec3 nA = rA * aNormA;

      // The world it becomes; the distant spheres hold still.
      mat3 rB = rotY(aKind > 1.5 ? 0.0 : uYawB);
      vec3 pB = rB * aPosB;
      vec3 nB = rB * aNormB;

      ti = easeInOut(clamp((uIntro - aDelay * 0.45) / 0.55, 0.0, 1.0));
      pA = mix(aFrom, pA, ti);

      float tm = easeInOut(clamp((uMorph - aDelay * 0.4) / 0.6, 0.0, 1.0));
      vec3 p = mix(pA, pB, tm);
      p += normalize(pB + vec3(0.0, 0.001, 0.0)) * sin(3.14159 * tm) * (0.18 + 0.3 * aDelay);
      n = normalize(mix(nA, nB, tm) + vec3(0.0, 0.0001, 0.0));

      mv = modelViewMatrix * vec4(p, 1.0);
      // The cat's fine spheres swell to close up the world's surface; the ring settles finer.
      size = uSize * aSize * mix(1.0, body ? 1.5 : 0.78, tm) * uScale / -mv.z;
      // Each sphere shimmers on its own rhythm, and the whole cloud breathes slowly.
      light = aLight * (0.88 + 0.12 * sin(uSparkle * 2.1 + aSeed * 47.0)) * uPulse;
    }
  `;

  const vertexShader = /* glsl */ `
    ${placeSphere}
    varying float vMacro;
    varying float vLight;
    varying float vAlpha;

    void main() {
      vec4 mv;
      vec3 n;
      float ti;
      float size;
      float light;
      place(mv, n, ti, size, light);

      gl_Position = projectionMatrix * mv;
      gl_PointSize = min(size, 64.0);

      vec3 nv = normalize(normalMatrix * n);
      vMacro = clamp(dot(nv, normalize(vec3(-0.35, 0.85, 0.45))) * 0.6 + 0.4, 0.0, 1.0);
      vLight = light;
      vAlpha = ti * smoothstep(0.4, 1.4, -mv.z);
    }
  `;

  // Each sphere is a bead of light: hottest and whitest through its middle, warmer amber towards its
  // rim, with the room's blue on its unlit edge and a small highlight, so it still reads as round.
  const fragmentShader = /* glsl */ `
    varying float vMacro;
    varying float vLight;
    varying float vAlpha;

    void main() {
      vec2 c = gl_PointCoord * 2.0 - 1.0;
      c.y = -c.y;
      float r2 = dot(c, c);
      if (r2 > 1.0) discard;

      vec3 n = vec3(c, sqrt(1.0 - r2));
      vec3 L = normalize(vec3(-0.45, 0.6, 0.65));
      float diff = max(dot(n, L), 0.0);
      float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 30.0);

      vec3 heart = vec3(1.0, 0.95, 0.84);
      vec3 rim = vec3(1.0, 0.56, 0.22);
      float core = n.z;
      vec3 col = mix(rim, heart, core * core) * (0.08 + 1.45 * vLight) * (0.6 + 0.4 * core);
      col *= mix(0.88, 1.0, diff) * mix(0.85, 1.0, vMacro);
      col += vec3(0.05, 0.1, 0.35) * (1.0 - core) * (1.0 - vLight) * 0.4;
      col += spec * (0.2 + 0.35 * vLight);

      gl_FragColor = vec4(col, (1.0 - smoothstep(0.82, 1.0, r2)) * vAlpha);
    }
  `;

  // The halo: a soft warm glow round every sphere, as bright as the sphere, added as light on top of
  // the page so neighbouring halos merge into a bloom.
  const haloVertexShader = /* glsl */ `
    ${placeSphere}
    uniform float uHaloSize;
    uniform float uHaloGain;
    varying float vGlow;

    void main() {
      vec4 mv;
      vec3 n;
      float ti;
      float size;
      float light;
      place(mv, n, ti, size, light);

      // The ring glows softer than the cat, so it never outshines it; spheres too dim to show a halo
      // (the dark stripes, the faintest of the ring) skip it, which saves drawing it.
      float share = aKind < 0.5 ? 1.0 : (aKind < 1.5 ? 0.5 : 0.9);
      float glow = light * share;
      bool lit = glow > 0.12;
      // Drawn a touch nearer the camera than its sphere, so neighbours never cover it, while anything
      // passing behind the cat (the ring) stays hidden behind it.
      gl_Position = lit ? projectionMatrix * (mv + vec4(0.0, 0.0, 0.12, 0.0)) : vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = lit ? min(size * uHaloSize, 128.0) : 1.0;
      vGlow = lit ? glow * ti * uHaloGain * smoothstep(0.4, 1.4, -mv.z) : 0.0;
    }
  `;

  const haloFragmentShader = /* glsl */ `
    varying float vGlow;

    void main() {
      vec2 c = gl_PointCoord * 2.0 - 1.0;
      float a = exp(-dot(c, c) * 4.5) * vGlow;
      gl_FragColor = vec4(vec3(1.0, 0.72, 0.4) * a, 0.0);
    }
  `;

  function start(THREE) {
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return; // No WebGL: the title stands on the blue alone.
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = false;
    host.append(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
    const tilt = new THREE.Group();
    scene.add(tilt);

    const uniforms = {
      uTime: { value: 0 },
      uIntro: { value: 0 },
      uMorph: { value: 0 },
      uYawA: { value: 0 },
      uYawRing: { value: 0 },
      uYawB: { value: 0 },
      uSize: { value: SPHERE },
      uScale: { value: 1 },
      uPulse: { value: 1 },
      uSparkle: { value: 0 },
      uHaloSize: { value: HALO_SIZE },
      uHaloGain: { value: HALO_GAIN },
    };

    // Light is added without covering anything: colour is added and the canvas's alpha is left alone,
    // so it brightens the blue, the words and the spheres round it like a real glow.
    const addLight = {
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
    };

    const geometry = buildCloud(THREE, !phone.matches);
    const spheres = new THREE.Points(
      geometry,
      new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, alphaToCoverage: true })
    );

    // The halos are soft, so they are drawn at half size into a layer of their own and added onto the
    // screen afterwards: a quarter of the work for the same look. That layer first takes the spheres'
    // depth, so the cat still hides the glow of the ring passing behind it.
    const halfUniforms = { ...uniforms, uScale: { value: 1 } };
    const sphereDepth = new THREE.Points(
      geometry,
      new THREE.ShaderMaterial({ uniforms: halfUniforms, vertexShader, fragmentShader, colorWrite: false })
    );
    const halos = new THREE.Points(
      geometry,
      new THREE.ShaderMaterial({
        uniforms: halfUniforms,
        vertexShader: haloVertexShader,
        fragmentShader: haloFragmentShader,
        depthTest: true,
        ...addLight,
      })
    );
    for (const layer of [spheres, sphereDepth, halos]) {
      layer.frustumCulled = false;
      tilt.add(layer);
    }

    const floats =
      renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
    const haloLayer = new THREE.WebGLRenderTarget(1, 1, { type: floats ? THREE.HalfFloatType : THREE.UnsignedByteType });
    const overlayScene = new THREE.Scene();
    const overlayCamera = new THREE.Camera();
    const overlay = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: { tHalo: { value: haloLayer.texture } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader:
          'uniform sampler2D tHalo; varying vec2 vUv; void main() { gl_FragColor = vec4(texture2D(tHalo, vUv).rgb, 0.0); }',
        depthTest: false,
        ...addLight,
      })
    );
    overlay.frustumCulled = false;
    overlayScene.add(overlay);

    // ----- Fit the form to the screen -----
    let W = 1;
    let H = 1;
    let dist = 4;
    let from = [0.56, 0.45];
    let to = [0.5, 0.43];

    function layout() {
      W = host.clientWidth;
      H = host.clientHeight;
      if (!W || !H) return;
      renderer.setSize(W, H, false);

      const tan = Math.tan((FOV * Math.PI) / 360);
      const small = phone.matches;
      const halfWidth = small ? 0.44 : 0.235; // share of the screen width the form's half-width takes
      const headroom = small ? 0.17 : 0.31; // share of the screen height above its centre
      dist = Math.max(1 / (2 * tan * halfWidth * (W / H)), 0.72 / (2 * tan * headroom));
      // The cat floats a little right of centre, over the lighter middle of the blue.
      from = small ? [0.5, 0.45] : [0.5, 0.47];
      to = small ? [0.5, 0.42] : [0.57, 0.4]; // the finished world drifts up and right, clear of the title

      camera.aspect = W / H;
      const ratio = renderer.getPixelRatio();
      uniforms.uScale.value = (H * ratio) / (2 * tan);
      halfUniforms.uScale.value = uniforms.uScale.value / 2;
      haloLayer.setSize(Math.max(1, Math.round((W * ratio) / 2)), Math.max(1, Math.round((H * ratio) / 2)));

      const unit = H / (2 * dist * tan);
      Object.assign(shadow.style, {
        left: `${from[0] * 100}%`,
        top: `${from[1] * H + 0.88 * unit}px`,
        width: `${1.5 * unit}px`,
        height: `${0.2 * unit}px`,
      });
    }
    new ResizeObserver(layout).observe(host);
    layout();

    // ----- The pointer leans the form a little -----
    let leanX = 0;
    let leanY = 0;
    let wantX = 0;
    let wantY = 0;
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      wantX = (e.clientX / innerWidth) * 2 - 1;
      wantY = (e.clientY / innerHeight) * 2 - 1;
    });

    // ----- Play -----
    const born = performance.now();
    let last = born;
    let clock = 0;
    let time = 0;
    let shownFrame = '';
    let struggling = 0;
    let raf = 0;

    function frame(now) {
      const gap = (now - last) / 1000;
      const dt = Math.min(gap, 0.064);
      last = now;
      const still = reduce.matches;
      if (!still) {
        clock = (clock + dt * FPS) % LOOP;
        time += dt;
      }

      const p = still ? 0 : (window.nexformScroll ? window.nexformScroll.p : 0);
      const m = smoothstep(0.06, 0.78, p);
      const intro = still ? 1 : clamp01((now - born) / 1000 / INTRO);

      uniforms.uIntro.value = intro;
      uniforms.uMorph.value = m;
      uniforms.uTime.value = (clock / LOOP) * Math.PI * 2;
      uniforms.uYawA.value = 0.16 * Math.sin(time * 0.33) + p * 1.4;
      uniforms.uYawRing.value = 0.08 * Math.sin(time * 0.27);
      uniforms.uYawB.value = time * 0.18 + p * 1.6;
      uniforms.uPulse.value = 0.94 + 0.06 * Math.sin(time * 1.3);
      uniforms.uSparkle.value = time;

      leanX += (wantX - leanX) * Math.min(1, dt * 3);
      leanY += (wantY - leanY) * Math.min(1, dt * 3);
      tilt.rotation.set(m * 0.24 + leanY * 0.06, leanX * 0.12, m * -0.3);

      const cx = mix(from[0], to[0], m);
      const cy = mix(from[1], to[1], m);
      camera.setViewOffset(W, H, -(cx - 0.5) * W, -(cy - 0.5) * H, W, H);
      const d = dist * (1 - 0.12 * p);
      camera.position.set(0, d * Math.sin(ELEVATION), d * Math.cos(ELEVATION));
      camera.lookAt(0, 0, 0);

      shadow.style.opacity = ((1 - m) * intro).toFixed(3);

      // The spheres onto the screen, then their halos at half size, then the halos added on top.
      renderer.setRenderTarget(null);
      renderer.clear();
      spheres.visible = true;
      sphereDepth.visible = false;
      halos.visible = false;
      renderer.render(scene, camera);

      renderer.setRenderTarget(haloLayer);
      renderer.clear();
      spheres.visible = false;
      sphereDepth.visible = true;
      halos.visible = true;
      renderer.render(scene, camera);

      renderer.setRenderTarget(null);
      renderer.render(overlayScene, overlayCamera);

      // A device that cannot keep up draws at a lower resolution rather than stutter. A long gap is the
      // browser pausing the page (another window, a background tab), not the device struggling.
      if (gap < 0.1) struggling = gap > 0.024 ? struggling + gap : Math.max(0, struggling - gap);
      if (struggling > 1.2 && renderer.getPixelRatio() > 1) {
        renderer.setPixelRatio(Math.max(1, renderer.getPixelRatio() - 0.25));
        layout();
        struggling = 0;
      }

      // The counter plays the 72-frame loop at rest, and is scrubbed by the scroll.
      const f = String(p > 0.004 ? 1 + Math.round(p * (LOOP - 1)) : Math.floor(clock) + 1).padStart(2, '0');
      if (f !== shownFrame) frameOut.textContent = shownFrame = f;

      raf = requestAnimationFrame(frame);
    }

    const sync = () => {
      if (document.hidden && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else if (!document.hidden && !raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener('visibilitychange', sync);
    sync();
  }

  import('three')
    .then(start)
    .catch(() => {}); // Offline or blocked: the title stands on the blue alone.
})();
