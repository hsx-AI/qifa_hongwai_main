const stage = document.querySelector("#shaftStage");
const canvas = document.querySelector("#shaftScene");

if (stage && canvas && window.THREE) {
  stage.dataset.sceneState = "starting";

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x010713, 0.035);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 3.15, 15.3);
  camera.lookAt(0, -0.15, 0);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  stage.dataset.sceneState = "ready";

  scene.add(new THREE.HemisphereLight(0x8ce6ff, 0x001124, 2.55));

  const keyLight = new THREE.DirectionalLight(0xa7e7ff, 4.5);
  keyLight.position.set(-4, 7, 10);
  scene.add(keyLight);

  const blueLight = new THREE.PointLight(0x008cff, 85, 35, 1.8);
  blueLight.position.set(3, -0.4, 8);
  scene.add(blueLight);

  const cyanLight = new THREE.PointLight(0x28e9ff, 48, 24, 2);
  cyanLight.position.set(-6, 1.8, 5);
  scene.add(cyanLight);

  const shaft = new THREE.Group();
  shaft.rotation.set(-0.07, -0.13, -0.018);
  shaft.position.y = -0.2;
  scene.add(shaft);

  // 轴向位置和半径共同定义转轴轮廓。
  const profileData = [
    [-11.7, 0.48], [-11.05, 0.48], [-10.98, 0.62], [-10.2, 0.62],
    [-10.12, 0.82], [-9.42, 0.82], [-9.32, 1.02], [-8.88, 1.02],
    [-8.78, 0.84], [-8.42, 0.84], [-8.32, 1.12], [-7.72, 1.12],
    [-7.58, 1.38], [-6.58, 1.38], [-6.45, 1.18], [-6.08, 1.18],
    [-5.98, 1.52], [-4.82, 1.52], [-4.68, 1.18], [-4.28, 1.18],
    [-4.14, 1.7], [-2.68, 1.7], [-2.52, 1.42], [-2.18, 1.42],
    [-2.02, 2.15], [-1.48, 2.15], [-1.34, 2.72], [-0.4, 2.72],
    [-0.28, 2.98], [0.78, 2.98], [0.9, 2.62], [1.5, 2.62],
    [1.65, 1.92], [2.72, 1.92], [2.86, 1.48], [3.3, 1.48],
    [3.42, 1.72], [4.62, 1.72], [4.74, 1.5], [5.48, 1.5],
    [5.6, 1.7], [6.5, 1.7], [6.62, 1.42], [7.54, 1.42],
    [7.66, 1.12], [8.08, 1.12], [8.2, 1.38], [9.18, 1.38],
    [9.3, 1.08], [9.76, 1.08], [9.88, 0.78], [10.76, 0.78],
    [10.86, 0.56], [11.58, 0.56],
  ];

  const latheProfile = profileData.map(([axis, radius]) => new THREE.Vector2(radius, axis));
  const bodyGeometry = new THREE.LatheGeometry(latheProfile, 96);
  bodyGeometry.rotateZ(Math.PI / 2);
  bodyGeometry.computeVertexNormals();

  const bodyMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x0a63b5,
    emissive: 0x062e68,
    emissiveIntensity: 0.92,
    metalness: 0.78,
    roughness: 0.2,
    transparent: true,
    opacity: 0.67,
    clearcoat: 0.88,
    clearcoatRoughness: 0.12,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.renderOrder = 1;
  shaft.add(body);

  const innerBody = new THREE.Mesh(
    bodyGeometry,
    new THREE.MeshBasicMaterial({
      color: 0x071f47,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  innerBody.scale.setScalar(0.985);
  shaft.add(innerBody);

  const cyanLine = new THREE.LineBasicMaterial({
    color: 0x7bdfff,
    transparent: true,
    opacity: 0.58,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const blueLine = new THREE.LineBasicMaterial({
    color: 0x269cff,
    transparent: true,
    opacity: 0.3,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  // 规整的环向线和轴向线，替代三角形 wireframe。
  const ringSamples = [];
  profileData.forEach((point, index) => {
    ringSamples.push(point);
    const next = profileData[index + 1];
    if (!next || next[0] === point[0]) return;
    const distance = next[0] - point[0];
    const steps = Math.floor(Math.abs(distance) / 0.28);
    for (let step = 1; step < steps; step += 1) {
      const t = step / steps;
      ringSamples.push([
        point[0] + distance * t,
        point[1] + (next[1] - point[1]) * t,
      ]);
    }
  });

  ringSamples.forEach(([x, radius], index) => {
    const points = [];
    for (let segment = 0; segment <= 72; segment += 1) {
      const angle = (segment / 72) * Math.PI * 2;
      points.push(new THREE.Vector3(
        x,
        Math.cos(angle) * radius * 1.006,
        Math.sin(angle) * radius * 1.006,
      ));
    }
    const ring = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      index % 4 === 0 ? cyanLine : blueLine,
    );
    ring.renderOrder = 3;
    shaft.add(ring);
  });

  for (let lineIndex = 0; lineIndex < 32; lineIndex += 1) {
    const angle = (lineIndex / 32) * Math.PI * 2;
    const points = profileData.map(([x, radius]) => new THREE.Vector3(
      x,
      Math.cos(angle) * radius * 1.008,
      Math.sin(angle) * radius * 1.008,
    ));
    const longitude = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      lineIndex % 4 === 0 ? cyanLine : blueLine,
    );
    longitude.renderOrder = 3;
    shaft.add(longitude);
  }

  const edgeMaterial = new THREE.MeshBasicMaterial({
    color: 0x63e1ff,
    transparent: true,
    opacity: 0.72,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const edgeRings = [
    [-10.12, 0.82], [-9.32, 1.02], [-8.32, 1.12], [-7.58, 1.38],
    [-5.98, 1.52], [-4.14, 1.7], [-2.02, 2.15], [-1.34, 2.72],
    [-0.28, 2.98], [0.78, 2.98], [0.9, 2.62], [1.65, 1.92],
    [3.42, 1.72], [5.6, 1.7], [8.2, 1.38], [9.88, 0.78],
  ];
  edgeRings.forEach(([x, radius]) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 1.01, 0.025, 7, 96),
      edgeMaterial,
    );
    ring.rotation.y = Math.PI / 2;
    ring.position.x = x;
    ring.renderOrder = 4;
    shaft.add(ring);
  });

  // 中央法兰端面的螺栓孔。
  const boltMaterial = new THREE.MeshBasicMaterial({
    color: 0x77e6ff,
    transparent: true,
    opacity: 0.78,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  for (let index = 0; index < 18; index += 1) {
    const angle = (index / 18) * Math.PI * 2;
    const bolt = new THREE.Mesh(
      new THREE.TorusGeometry(0.105, 0.018, 6, 28),
      boltMaterial,
    );
    bolt.rotation.y = Math.PI / 2;
    bolt.position.set(
      -1.36,
      Math.cos(angle) * 2.28,
      Math.sin(angle) * 2.28,
    );
    bolt.renderOrder = 5;
    shaft.add(bolt);
  }

  const glow = new THREE.Mesh(
    bodyGeometry.clone(),
    new THREE.MeshBasicMaterial({
      color: 0x087cff,
      transparent: true,
      opacity: 0.1,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  glow.scale.setScalar(1.035);
  shaft.add(glow);

  const grid = new THREE.GridHelper(38, 38, 0x0877b8, 0x073554);
  grid.position.y = -3.08;
  grid.material.transparent = true;
  grid.material.opacity = 0.28;
  scene.add(grid);

  const particleGeometry = new THREE.BufferGeometry();
  const particlePositions = new Float32Array(330 * 3);
  for (let index = 0; index < particlePositions.length; index += 3) {
    particlePositions[index] = (Math.random() - 0.5) * 34;
    particlePositions[index + 1] = (Math.random() - 0.5) * 12;
    particlePositions[index + 2] = (Math.random() - 0.5) * 14 - 2;
  }
  particleGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(particlePositions, 3),
  );
  const particles = new THREE.Points(
    particleGeometry,
    new THREE.PointsMaterial({
      color: 0x168fd4,
      size: 0.035,
      transparent: true,
      opacity: 0.55,
    }),
  );
  scene.add(particles);

  let stageWidth = 0;
  let stageHeight = 0;
  const resize = () => {
    const rect = stage.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    if (width === stageWidth && height === stageHeight) return;
    stageWidth = width;
    stageHeight = height;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.position.z = width / height < 1.5 ? 27 : 15.3;
    camera.updateProjectionMatrix();
  };

  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  resize();

  let running = true;
  document.addEventListener("visibilitychange", () => {
    running = !document.hidden;
  });

  const clock = new THREE.Clock();
  const animate = () => {
    requestAnimationFrame(animate);
    if (!running) return;
    const elapsed = clock.getElapsedTime();
    shaft.rotation.x = -0.07 + Math.sin(elapsed * 0.34) * 0.02;
    shaft.position.y = -0.2 + Math.sin(elapsed * 0.55) * 0.035;
    particles.rotation.y = elapsed * 0.008;
    renderer.render(scene, camera);
  };
  animate();
}
