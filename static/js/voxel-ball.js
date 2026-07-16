/* voxel-ball.js — a sphere of individual voxel cubes with particle
 * streams flowing between them. three.js (vendored ESM, see importmap).
 *
 * Reliability pattern shared with voxel.esq: the avatar <img> stays
 * visible until WebGL init fully succeeds, then the canvas takes over.
 * Motion is on by default; the caption is a persistent pause toggle
 * (localStorage "voxel-motion", shared preference with voxel.esq).
 * Debug handle: `__voxelBall` → {status, frames, running}.
 */
import * as THREE from "three";

(function () {
  "use strict";

  var frames = 0;
  var running = false;
  var status = "boot";

  window.__voxelBall = {
    get status() {
      return status;
    },
    get frames() {
      return frames;
    },
    get running() {
      return running;
    },
    get flash() {
      return flash.active;
    },
    play: function () {
      setMotionPref("on");
    },
    pause: function () {
      setMotionPref("off");
    },
  };

  var canvas = document.getElementById("voxel-ball");
  var hint = document.getElementById("voxel-ball-hint");
  if (!canvas) {
    status = "no-canvas";
    return;
  }
  var container = canvas.parentElement;
  var fallback = container ? container.querySelector("a") : null;
  if (!container || !fallback) {
    status = "no-container";
    return;
  }

  /* ---- config ---------------------------------------------------- */
  var CUBES = 360;
  var RADIUS = 1;
  var CUBE_SIZE = 0.068;
  var PARTICLES = 160;
  var HILITES = 14; // twinkling glints sitting on cube facets
  var SMOKE = 26; // slow fog wisps orbiting the sphere
  var ROT_SPEED = 0.12; // rad/s auto-rotation
  var SPARKLE_SPEED = 0.9; // traveling glint band
  var PARTICLE_ARC = 1.35; // how far streams bulge above the surface

  /* Dramaturgy tuned like a darkpsy set:
     - cubes: a dark vertical gradient that MORPHS over time, drifting
       between bluish and purple-blue schemes (~25s per transition,
       blue-weighted; stable against the rotation).
     - a faint constant shimmer = the hi-tech texture.
     - FLASH_PALETTE: rare bright moments (every 8–20s) — an expanding
       shockwave in goa gold/orange, acid green, cyan or twilight violet.
     - particles: dim fireflies that surge only when a flash hits. */
  /* Gradient schemes [bottom, mid, top] the ball drifts through.
     Blue-dominant — voxel.blue, not voxel.purple. The indigo pass is
     the only warm drift and its crown stays blue-violet. */
  var GRADIENT_SCHEMES = [
    [0x1a2f5e, 0x1f4c8c, 0x1d5fa8], /* deep blue */
    [0x18295a, 0x1d4078, 0x1a4b8f], /* midnight blue */
    [0x16405c, 0x1c5e84, 0x1f6f96], /* teal night */
    [0x222767, 0x2e3488, 0x31379a], /* brief indigo drift */
  ];
  var MORPH_SECONDS = 25; /* per scheme transition */
  var SPARK_PALETTE = [0x223a66, 0x1c4a5c, 0x3a2a66, 0x38d6f5, 0x52f2a8];
  var FLASH_PALETTE = [0xffb347, 0xff7a45, 0x52f2a8, 0x38d6f5, 0xa78bfa];

  /* ---- motion preference ------------------------------------------ */
  var motionPref = null;
  try {
    var stored = localStorage.getItem("voxel-motion");
    if (stored === "on" || stored === "off") motionPref = stored;
  } catch (e) {}
  function motionAllowed() {
    return motionPref !== "off";
  }

  /* ---- state ------------------------------------------------------ */
  var renderer, scene, camera, group, cubes, points;
  var hilitePoints, hiliteColors, hilitePos, hilites = [];
  var smokePoints, smokeMat, smoke = [];
  var smokeBaseColor = null;
  var basePos = []; // Vector3 per cube
  var baseQuat = []; // Quaternion per cube
  var latLng = []; // [lat, lng] per cube, for the glint band
  var gradT = []; // latitude position 0..1 per cube (gradient lookup)
  var jit = []; // per-cube brightness jitter
  var schemeStops = []; // THREE.Color[scheme][3]
  var curStops = null; // the 3 currently-morphed gradient colors
  var tmpC = null;
  var accentC = null; // scratch color for the page-accent bridge
  var accentHSL = { h: 0, s: 0, l: 0 };
  var lastEnv = 0; // previous frame's flash envelope (edge detection)
  var particles = []; // {a, b, t, speed}
  var positions; // Float32Array for the points geometry
  var revealed = false;
  var inView = true;
  var rafId = 0;
  var pointer = { x: 0, y: 0, tx: 0, ty: 0, active: false };
  var tmpM = null;
  var tmpS = null;

  function initScene() {
    renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      alpha: true,
      antialias: true,
      powerPreference: "low-power",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    /* deterministic init: transparent-black, never undefined memory */
    renderer.setClearColor(0x000000, 0);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(42, 1, 0.1, 20);
    camera.position.z = 3.4;

    group = new THREE.Group();
    scene.add(group);

    /* Sphere of cubes: fibonacci-distributed, each facet facing outward */
    var geo = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
    var mat = new THREE.MeshBasicMaterial();
    cubes = new THREE.InstancedMesh(geo, mat, CUBES);
    var color = new THREE.Color();
    var up = new THREE.Vector3(0, 1, 0);
    var m = new THREE.Matrix4();
    var golden = Math.PI * (3 - Math.sqrt(5));
    for (var i = 0; i < CUBES; i++) {
      var y = 1 - (i / (CUBES - 1)) * 2;
      var r = Math.sqrt(1 - y * y);
      var th = golden * i;
      var p = new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r).multiplyScalar(RADIUS);
      basePos.push(p);
      var q = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().lookAt(p, new THREE.Vector3(0, 0, 0), up)
      );
      baseQuat.push(q);
      latLng.push([Math.asin(y), th % (Math.PI * 2)]);
      m.compose(p, q, new THREE.Vector3(1, 1, 1));
      cubes.setMatrixAt(i, m);
      /* dark latitude gradient with slight per-cube jitter; the actual
         colors are recomputed each frame as the schemes morph */
      gradT.push((y + 1) / 2); /* 0 bottom → 1 top */
      jit.push(0.95 + 0.18 * Math.abs(Math.sin(i * 0.7)));
      color.setHex(GRADIENT_SCHEMES[0][1]);
      cubes.setColorAt(i, color);
    }
    cubes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (cubes.instanceColor) cubes.instanceColor.setUsage(THREE.DynamicDrawUsage);
    group.add(cubes);

    /* Particle streams between cube pairs */
    positions = new Float32Array(PARTICLES * 3);
    var colors = new Float32Array(PARTICLES * 3);
    for (var k = 0; k < PARTICLES; k++) {
      particles.push(newParticle());
      /* mostly dim fireflies; every 7th spark is bright */
      color.setHex(SPARK_PALETTE[k % SPARK_PALETTE.length]);
      if (k % 7 !== 0) color.multiplyScalar(0.55);
      colors[k * 3] = color.r;
      colors[k * 3 + 1] = color.g;
      colors[k * 3 + 2] = color.b;
    }
    var pgeo = new THREE.BufferGeometry();
    pgeo.setAttribute("position", new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    pgeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    var pmat = new THREE.PointsMaterial({
      size: 0.075,
      map: glowTexture(),
      transparent: true,
      opacity: 0.5,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    points = new THREE.Points(pgeo, pmat);
    group.add(points);

    /* Highlights: a handful of glints that twinkle on random facets.
       Additive blending means black = invisible, so per-glint intensity
       lives in the color attribute — no per-point alpha needed. */
    hilitePos = new Float32Array(HILITES * 3);
    hiliteColors = new Float32Array(HILITES * 3);
    for (var h = 0; h < HILITES; h++) {
      hilites.push(newHilite(true));
    }
    var hgeo = new THREE.BufferGeometry();
    hgeo.setAttribute("position", new THREE.BufferAttribute(hilitePos, 3).setUsage(THREE.DynamicDrawUsage));
    hgeo.setAttribute("color", new THREE.BufferAttribute(hiliteColors, 3).setUsage(THREE.DynamicDrawUsage));
    hilitePoints = new THREE.Points(
      hgeo,
      new THREE.PointsMaterial({
        size: 0.16,
        map: glowTexture(),
        transparent: true,
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    group.add(hilitePoints);

    /* Smoke: big, dim, slow wisps drifting around the sphere. Normal
       blending (it veils rather than glows); catches the flash light. */
    var spos = new Float32Array(SMOKE * 3);
    for (var w = 0; w < SMOKE; w++) {
      smoke.push({
        ang: Math.random() * Math.PI * 2,
        r: RADIUS * (1.02 + Math.random() * 0.38),
        y: -1.1 + Math.random() * 2.2,
        va: (0.03 + Math.random() * 0.05) * (Math.random() < 0.5 ? -1 : 1),
        vy: 0.015 + Math.random() * 0.03,
      });
    }
    var sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute("position", new THREE.BufferAttribute(spos, 3).setUsage(THREE.DynamicDrawUsage));
    smokeBaseColor = new THREE.Color(0x303a5e);
    smokeMat = new THREE.PointsMaterial({
      size: 0.62,
      map: smokeTexture(),
      transparent: true,
      opacity: 0.12,
      color: smokeBaseColor.clone(),
      blending: THREE.NormalBlending,
      depthWrite: false,
    });
    smokePoints = new THREE.Points(sgeo, smokeMat);
    group.add(smokePoints);

    tmpM = new THREE.Matrix4();
    tmpS = new THREE.Vector3();
    tmpC = new THREE.Color();
    for (var g = 0; g < GRADIENT_SCHEMES.length; g++) {
      schemeStops.push(GRADIENT_SCHEMES[g].map(function (hex) {
        return new THREE.Color(hex);
      }));
    }
    curStops = [new THREE.Color(), new THREE.Color(), new THREE.Color()];
    accentC = new THREE.Color();
  }

  /* Page-accent bridge: --c-accent follows the bright end of the ball's
     current gradient (plus the flash tint while one travels). Lightness
     is pinned so links stay readable on the dark background. */
  function setPageAccent(env) {
    accentC.copy(curStops[1]).lerp(curStops[2], 0.7);
    /* cubed: the accent tint clears early in the flash decay instead of
       lingering through the whole tail */
    var fe = env * env * env;
    if (fe > 0.001 && flashColor) accentC.lerp(flashColor, 0.5 * fe);
    accentC.getHSL(accentHSL);
    var s = Math.min(1, Math.max(0.55, accentHSL.s));
    var root = document.documentElement.style;
    accentC.setHSL(accentHSL.h, s, 0.6);
    root.setProperty("--c-accent", "#" + accentC.getHexString());
    accentC.setHSL(accentHSL.h, s, 0.72);
    root.setProperty("--c-accent-soft", "#" + accentC.getHexString());

    /* Title gradient stops: the ball's mid/top colors, brightened for
       text. All titles render from these, so they morph with the ball. */
    accentC.copy(curStops[1]);
    if (fe > 0.001 && flashColor) accentC.lerp(flashColor, 0.5 * fe);
    accentC.getHSL(accentHSL);
    accentC.setHSL(accentHSL.h, Math.min(1, Math.max(0.5, accentHSL.s)), 0.5);
    root.setProperty("--ball-g1", "#" + accentC.getHexString());
    accentC.copy(curStops[2]);
    if (fe > 0.001 && flashColor) accentC.lerp(flashColor, 0.5 * fe);
    accentC.getHSL(accentHSL);
    accentC.setHSL(accentHSL.h, Math.min(1, Math.max(0.5, accentHSL.s)), 0.74);
    root.setProperty("--ball-g2", "#" + accentC.getHexString());
  }

  function newHilite(initial) {
    return {
      idx: (Math.random() * CUBES) | 0,
      /* negative t = waiting; twinkles come faster while a flash runs */
      t: -(initial ? Math.random() * 4 : 0.4 + Math.random() * (flash.active ? 1.2 : 4.5)),
      dur: 0.25 + Math.random() * 0.2,
      color: new THREE.Color(SPARK_PALETTE[3 + ((Math.random() * 2) | 0)]),
    };
  }

  function newParticle() {
    return {
      a: (Math.random() * CUBES) | 0,
      b: (Math.random() * CUBES) | 0,
      t: Math.random(),
      speed: 0.25 + Math.random() * 0.55,
    };
  }

  /* Soft round sprite, generated on a 2D canvas (write-only, no reads). */
  function glowTexture() {
    var c = document.createElement("canvas");
    c.width = c.height = 32;
    var g = c.getContext("2d");
    var grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.4, "rgba(255,255,255,0.5)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
    var tex = new THREE.CanvasTexture(c);
    return tex;
  }

  /* Wider, softer falloff than the spark glow — reads as fog. */
  function smokeTexture() {
    var c = document.createElement("canvas");
    c.width = c.height = 64;
    var g = c.getContext("2d");
    var grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,0.7)");
    grad.addColorStop(0.45, "rgba(255,255,255,0.28)");
    grad.addColorStop(0.8, "rgba(255,255,255,0.07)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  /* Bridge to the page: while a flash travels, the wordmark carries
     .ball-flash + --flash-color. Scoped to that one element so the
     toggle doesn't trigger a page-wide style recalculation. */
  var wordmark = document.querySelector(".sidebar-heading a");
  function syncFlash(on, hex) {
    if (!wordmark) return;
    wordmark.classList.toggle("ball-flash", on);
    if (on && hex) wordmark.style.setProperty("--flash-color", hex);
  }

  function layout() {
    var rect = container.getBoundingClientRect();
    if (rect.width < 10) return false;
    var size = Math.round(rect.width);
    renderer.setSize(size, size, false);
    camera.aspect = 1;
    camera.updateProjectionMatrix();
    return true;
  }

  /* ---- flash events: the rare bright moments ----------------------- */
  var flash = {
    active: false,
    t0: 0,
    dur: 1.6,
    next: 4 + Math.random() * 6,
    color: null,
    origin: 0,
  };
  var flashColor = null;

  function flashEnvelope(tSec) {
    if (!flash.active) {
      if (tSec >= flash.next) {
        flash.active = true;
        flash.t0 = tSec;
        flash.dur = 1.2 + Math.random() * 0.9;
        flash.origin = (Math.random() * CUBES) | 0;
        var hex = FLASH_PALETTE[(Math.random() * FLASH_PALETTE.length) | 0];
        if (!flashColor) flashColor = new THREE.Color();
        flashColor.setHex(hex).multiplyScalar(1.7);
        syncFlash(true, "#" + hex.toString(16).padStart(6, "0"));
      }
      return 0;
    }
    var u = (tSec - flash.t0) / flash.dur;
    if (u >= 1) {
      flash.active = false;
      flash.next = tSec + 8 + Math.random() * 12;
      syncFlash(false);
      return 0;
    }
    /* fast attack, long decay */
    return u < 0.12 ? u / 0.12 : 1 - (u - 0.12) / 0.88;
  }

  /* ---- per-frame update ------------------------------------------- */
  var vA = null;
  function update(tSec, dt) {
    /* auto-rotation + damped pointer influence */
    pointer.x += (pointer.tx - pointer.x) * 0.06;
    pointer.y += (pointer.ty - pointer.y) * 0.06;
    group.rotation.y = tSec * ROT_SPEED + pointer.x * 0.6;
    group.rotation.x = Math.sin(tSec * 0.23) * 0.12 + pointer.y * 0.4;

    /* base groove: a faint shimmer band (hi-tech texture) + rare flash
       shockwaves expanding over the dark sphere */
    var env = flashEnvelope(tSec);
    var originPos = flash.active ? basePos[flash.origin] : null;
    var waveFront = flash.active ? ((tSec - flash.t0) / flash.dur) * Math.PI * 1.1 : 0;

    /* morph the gradient between schemes (smoothstepped) */
    var seg = (tSec / MORPH_SECONDS) % schemeStops.length;
    var si = seg | 0;
    var f = seg - si;
    f = f * f * (3 - 2 * f);
    var A = schemeStops[si];
    var B = schemeStops[(si + 1) % schemeStops.length];
    for (var g = 0; g < 3; g++) {
      curStops[g].copy(A[g]).lerp(B[g], f);
    }
    /* refresh the page accent a few times per second — faster while a
       flash travels, immediately when it ends, and on the static render */
    if (
      frames % (flash.active ? 4 : 12) === 0 ||
      tSec === 0 ||
      (lastEnv > 0 && env === 0)
    ) {
      setPageAccent(env);
    }
    lastEnv = env;

    for (var i = 0; i < CUBES; i++) {
      var band = Math.max(0, Math.cos(latLng[i][0] * 3 + latLng[i][1] - tSec * SPARKLE_SPEED));
      var glow = 0.45 * band * band; /* subtle, dark-on-dark */

      var wave = 0;
      if (originPos) {
        /* angular distance to the flash origin; light the expanding ring */
        var dot = basePos[i].dot(originPos) / (RADIUS * RADIUS);
        var ang = Math.acos(Math.min(1, Math.max(-1, dot)));
        var dw = (ang - waveFront) / 0.55;
        wave = Math.exp(-dw * dw) * env;
      }

      var s = 1 + 0.18 * glow + 0.45 * wave;
      tmpS.set(s, s, s);
      tmpM.compose(basePos[i], baseQuat[i], tmpS);
      cubes.setMatrixAt(i, tmpM);

      var tg = gradT[i];
      if (tg < 0.5) {
        tmpC.copy(curStops[0]).lerp(curStops[1], tg * 2);
      } else {
        tmpC.copy(curStops[1]).lerp(curStops[2], (tg - 0.5) * 2);
      }
      tmpC.multiplyScalar(jit[i] * (1 + 0.7 * glow));
      if (wave > 0.02) tmpC.lerp(flashColor, Math.min(0.9, wave));
      cubes.setColorAt(i, tmpC);
    }
    cubes.instanceMatrix.needsUpdate = true;
    if (cubes.instanceColor) cubes.instanceColor.needsUpdate = true;

    /* the fireflies surge while a flash travels */
    points.material.opacity = 0.5 + 0.5 * env;

    /* highlights: sparse twinkles on facets, busier during a flash */
    for (var h = 0; h < HILITES; h++) {
      var hl = hilites[h];
      hl.t += hl.t < 0 ? dt : dt / hl.dur;
      if (hl.t >= 1) {
        hilites[h] = newHilite(false);
        hl = hilites[h];
      }
      var inten = hl.t < 0 ? 0 : Math.sin(Math.PI * Math.min(1, hl.t));
      var bp = basePos[hl.idx];
      hilitePos[h * 3] = bp.x * 1.05;
      hilitePos[h * 3 + 1] = bp.y * 1.05;
      hilitePos[h * 3 + 2] = bp.z * 1.05;
      hiliteColors[h * 3] = hl.color.r * inten;
      hiliteColors[h * 3 + 1] = hl.color.g * inten;
      hiliteColors[h * 3 + 2] = hl.color.b * inten;
    }
    hilitePoints.geometry.attributes.position.needsUpdate = true;
    hilitePoints.geometry.attributes.color.needsUpdate = true;

    /* smoke: slow orbiting wisps; they catch the flash light */
    var sattr = smokePoints.geometry.attributes.position;
    for (var w = 0; w < SMOKE; w++) {
      var sm = smoke[w];
      sm.ang += sm.va * dt;
      sm.y += sm.vy * dt;
      if (sm.y > 1.15) {
        sm.y = -1.15;
        sm.ang = Math.random() * Math.PI * 2;
      }
      sattr.array[w * 3] = Math.cos(sm.ang) * sm.r;
      sattr.array[w * 3 + 1] = sm.y;
      sattr.array[w * 3 + 2] = Math.sin(sm.ang) * sm.r;
    }
    sattr.needsUpdate = true;
    smokeMat.opacity = 0.12 + 0.12 * env;
    smokeMat.color.copy(smokeBaseColor);
    if (env > 0) smokeMat.color.lerp(flashColor, 0.3 * env);

    /* particles: arcs between random cube pairs */
    if (!vA) vA = new THREE.Vector3();
    for (var k = 0; k < PARTICLES; k++) {
      var p = particles[k];
      p.t += p.speed * dt;
      if (p.t >= 1) {
        particles[k] = newParticle();
        p = particles[k];
      }
      vA.copy(basePos[p.a]).lerp(basePos[p.b], p.t);
      var lift = 1 + (PARTICLE_ARC - 1) * Math.sin(Math.PI * p.t);
      vA.setLength(RADIUS * lift);
      positions[k * 3] = vA.x;
      positions[k * 3 + 1] = vA.y;
      positions[k * 3 + 2] = vA.z;
    }
    points.geometry.attributes.position.needsUpdate = true;
  }

  /* ---- loop & run-state -------------------------------------------- */
  var lastT = 0;
  function frame(now) {
    rafId = 0;
    if (!running) return;
    frames++;
    var t = now / 1000;
    var dt = Math.min(0.05, t - (lastT || t));
    lastT = t;
    update(t, dt);
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(frame);
  }

  function updateRunState() {
    var shouldRun = revealed && inView && !document.hidden && motionAllowed();
    if (shouldRun && !running) {
      running = true;
      lastT = 0;
      if (!rafId) rafId = requestAnimationFrame(frame);
    } else if (!shouldRun && running) {
      running = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    }
    if (revealed) status = running ? "live" : "static";
    if (revealed && !motionAllowed()) {
      update(0, 0.016);
      renderer.render(scene, camera);
    }
    updateHint();
  }

  function setMotionPref(pref) {
    motionPref = pref;
    try {
      localStorage.setItem("voxel-motion", pref || "");
    } catch (e) {}
    updateRunState();
  }

  function updateHint() {
    if (!hint || !revealed) return;
    hint.removeAttribute("hidden");
    hint.textContent = motionAllowed()
      ? "voxel sphere · click to pause"
      : "motion paused · click to play";
  }

  /* ---- events ------------------------------------------------------ */
  function wireEvents() {
    if (window.ResizeObserver) {
      new ResizeObserver(function () {
        if (layout() && revealed && !running) {
          renderer.render(scene, camera);
        }
      }).observe(container);
    }
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (entries) {
        inView = entries[entries.length - 1].isIntersecting;
        updateRunState();
      }).observe(container);
    }
    document.addEventListener("visibilitychange", updateRunState);

    canvas.addEventListener("pointermove", function (ev) {
      var rect = canvas.getBoundingClientRect();
      pointer.tx = ((ev.clientX - rect.left) / rect.width - 0.5) * 2;
      pointer.ty = ((ev.clientY - rect.top) / rect.height - 0.5) * 2;
      pointer.active = true;
    });
    canvas.addEventListener("pointerleave", function () {
      pointer.active = false;
      pointer.tx = 0;
      pointer.ty = 0;
    });

    if (hint) {
      hint.addEventListener("click", function () {
        setMotionPref(motionAllowed() ? "off" : "on");
      });
    }
  }

  function reveal() {
    /* paint the first frame while the canvas is still at opacity 0 —
       the GPU layer already exists (born invisible in init), so any
       white first-commit some drivers produce happens off-stage */
    update(0, 0.016);
    renderer.render(scene, camera);
    revealed = true;
    updateRunState();
    /* two RAFs guarantee at least one composited frame with real
       content, then crossfade over the placeholder */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        canvas.style.opacity = "1";
        setTimeout(function () {
          fallback.setAttribute("hidden", "");
        }, 450);
      });
    });
  }

  /* ---- init -------------------------------------------------------- */
  try {
    /* the canvas must be RENDERED (not display:none) when its WebGL
       layer is created, or some compositors flash white at unhide —
       so it's born visible but fully transparent */
    canvas.style.opacity = "0";
    canvas.removeAttribute("hidden");
    initScene();
    if (!layout()) {
      status = "waiting-layout";
      requestAnimationFrame(function () {
        if (layout()) {
          wireEvents();
          reveal();
        } else {
          status = "no-layout";
        }
      });
    } else {
      wireEvents();
      reveal();
    }
  } catch (err) {
    status = "error: " + (err && err.message);
    /* WebGL unavailable → re-hide the canvas, the avatar image stays */
    canvas.setAttribute("hidden", "");
    canvas.style.opacity = "";
  }
})();
