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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;

  scene.add(new THREE.HemisphereLight(0xb7d8eb, 0x101b26, 1.5));

  const keyLight = new THREE.DirectionalLight(0xd8f0ff, 5.2);
  keyLight.position.set(-4, 7, 9);
  scene.add(keyLight);

  const blueLight = new THREE.DirectionalLight(0x438bc0, 1.8);
  blueLight.position.set(4, -4, 7);
  scene.add(blueLight);

  const cyanLight = new THREE.PointLight(0x28e9ff, 18, 28, 2);
  cyanLight.position.set(-6, 1.8, 5);
  scene.add(cyanLight);
  const polishLight = new THREE.PointLight(0xe4f6ff, 75, 35, 1.5);
  polishLight.position.set(-1, 5, 8);
  scene.add(polishLight);

  const shaft = new THREE.Group();
  shaft.rotation.set(-0.07, -0.13, -0.018);
  shaft.scale.set(1.2, 1.38, 1.38);
  shaft.position.set(-1.38, -0.18, 0);
  scene.add(shaft);

  // 轴向位置和半径共同定义转轴轮廓。
  const profileData = [
    [-10, 0.72], [-9.9, 0.78], [-9.5, 0.78], [-9.5, 1.18],
    [-9.4, 1.18], [-8.7, 1.18], [-8.7, 0.94], [-8.6, 0.94],
    [-7.8, 0.94], [-7.8, 0.82], [-7.7, 0.82], [-5.3, 0.82],
    [-5.2, 0.96], [-5, 1.34], [-4.5, 1.34], [-4.4, 1.58],
    [-3.85, 1.58], [-3.46, 2.12], [6.52, 2.12], [6.78, 2.04],
    [7.1, 1.62], [8, 1.62], [8.12, 1.4], [8.8, 1.4],
    [8.92, 1.12], [10, 1.12], [10.12, 0.88], [12.78, 0.88],
    [12.95, 0.72],
  ];

  const radialSegments = 64;
  const vertices = [];
  const indices = [];
  profileData.forEach(([axis, radius]) => {
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const angle = (segment / radialSegments) * Math.PI * 2;
      vertices.push(axis, Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
  });
  for (let ring = 0; ring < profileData.length - 1; ring += 1) {
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const next = (segment + 1) % radialSegments;
      const currentIndex = ring * radialSegments + segment;
      const currentNextIndex = ring * radialSegments + next;
      const nextIndex = (ring + 1) * radialSegments + segment;
      const nextNextIndex = (ring + 1) * radialSegments + next;
      indices.push(currentIndex, currentNextIndex, nextIndex);
      indices.push(currentNextIndex, nextNextIndex, nextIndex);
    }
  }
  const firstCapIndex = vertices.length / 3;
  vertices.push(profileData[0][0], 0, 0);
  const lastCapIndex = firstCapIndex + 1;
  vertices.push(profileData.at(-1)[0], 0, 0);
  const lastRingIndex = (profileData.length - 1) * radialSegments;
  for (let segment = 0; segment < radialSegments; segment += 1) {
    const next = (segment + 1) % radialSegments;
    indices.push(firstCapIndex, next, segment);
    indices.push(lastCapIndex, lastRingIndex + segment, lastRingIndex + next);
  }
  const bodyGeometry = new THREE.BufferGeometry();
  bodyGeometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  bodyGeometry.setIndex(indices);
  bodyGeometry.computeVertexNormals();

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x1478bd,
    emissive: 0x07549a,
    emissiveIntensity: 1.08,
    metalness: 0.78,
    roughness: 0.24,
    transparent: true,
    opacity: 0.78,
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
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
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

  const ringSamples = [];
  profileData.forEach((point, index) => {
    ringSamples.push(point);
    const next = profileData[index + 1];
    if (!next || next[0] === point[0]) return;
    const distance = next[0] - point[0];
    const steps = Math.max(2, Math.floor(Math.abs(distance) / 0.36));
    for (let step = 1; step < steps; step += 1) {
      const t = step / steps;
      ringSamples.push([
        point[0] + distance * t,
        point[1] + (next[1] - point[1]) * t,
      ]);
    }
  });

  const ringPositions = [[], []];
  ringSamples.forEach(([x, radius], index) => {
    const positions = ringPositions[index % 2 === 0 ? 0 : 1];
    for (let segment = 0; segment < 42; segment += 1) {
      const startAngle = (segment / 42) * Math.PI * 2;
      const endAngle = ((segment + 1) / 42) * Math.PI * 2;
      positions.push(
        x, Math.cos(startAngle) * radius * 1.006, Math.sin(startAngle) * radius * 1.006,
        x, Math.cos(endAngle) * radius * 1.006, Math.sin(endAngle) * radius * 1.006,
      );
    }
  });

  const longitudePositions = [[], []];
  for (let lineIndex = 0; lineIndex < 14; lineIndex += 1) {
    const angle = (lineIndex / 14) * Math.PI * 2;
    const positions = longitudePositions[lineIndex % 4 === 0 ? 0 : 1];
    for (let pointIndex = 0; pointIndex < profileData.length - 1; pointIndex += 1) {
      const [startX, startRadius] = profileData[pointIndex];
      const [endX, endRadius] = profileData[pointIndex + 1];
      positions.push(
        startX, Math.cos(angle) * startRadius * 1.008, Math.sin(angle) * startRadius * 1.008,
        endX, Math.cos(angle) * endRadius * 1.008, Math.sin(angle) * endRadius * 1.008,
      );
    }
  }

  const addLineSegments = (positions, material) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const lines = new THREE.LineSegments(geometry, material);
    lines.renderOrder = 3;
    shaft.add(lines);
  };
  addLineSegments(ringPositions[0], cyanLine);
  addLineSegments(ringPositions[1], blueLine);
  addLineSegments(longitudePositions[0], cyanLine);
  addLineSegments(longitudePositions[1], blueLine);

  const edgeMaterial = new THREE.MeshBasicMaterial({
    color: 0x63e1ff,
    transparent: true,
    opacity: 0.72,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const edgeRings = [
    [-9.9, 0.78], [-9.4, 1.18], [-8.7, 1.18], [-8.6, 0.94],
    [-7.8, 0.94], [-7.7, 0.82], [-5.3, 0.82], [-5.2, 0.96],
    [-5, 1.34], [-4.4, 1.58], [-3.85, 1.58], [-3.46, 2.12],
    [6.52, 2.12], [6.78, 2.04], [7.1, 1.62], [8.12, 1.4],
    [8.92, 1.12], [10.12, 0.88], [12.78, 0.88],
  ];
  const edgeRingGeometry = new THREE.TorusGeometry(1, 0.025, 5, 48);
  const edgeRingMesh = new THREE.InstancedMesh(edgeRingGeometry, edgeMaterial, edgeRings.length);
  const instanceTransform = new THREE.Object3D();
  edgeRings.forEach(([x, radius], index) => {
    instanceTransform.position.set(x, 0, 0);
    instanceTransform.rotation.set(0, Math.PI / 2, 0);
    instanceTransform.scale.setScalar(radius * 1.01);
    instanceTransform.updateMatrix();
    edgeRingMesh.setMatrixAt(index, instanceTransform.matrix);
  });
  edgeRingMesh.instanceMatrix.needsUpdate = true;
  edgeRingMesh.renderOrder = 4;
  shaft.add(edgeRingMesh);

  const glow = new THREE.Mesh(
    bodyGeometry.clone(),
    new THREE.MeshBasicMaterial({
      color: 0x087cff,
      transparent: true,
      opacity: 0.12,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  glow.scale.setScalar(1.04);
  shaft.add(glow);

  const grid = new THREE.GridHelper(32, 24, 0x0877b8, 0x073554);
  grid.position.y = -3.08;
  grid.material.transparent = true;
  grid.material.opacity = 0.28;
  scene.add(grid);

  const particleGeometry = new THREE.BufferGeometry();
  const particlePositions = new Float32Array(100 * 3);
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
    camera.position.z = Math.max(18, 68 / camera.aspect);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    stage.dataset.sceneState = "ready";
  };

  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  resize();
}
