// Realistic 3D Track Rendering Component
import * as THREE from 'three';

export interface CircuitData {
  x: number[];
  y: number[];
  sector_boundaries?: {
    sector_1_end: number;
    sector_2_end: number;
  };
  corners?: Array<{ index: number; number: number }>;
}

export function renderRealisticTrack(
  scene: THREE.Scene,
  circuitData: CircuitData
): () => void {
  const trackObjects: THREE.Object3D[] = [];

  // Create points
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < circuitData.x.length; i++) {
    points.push(new THREE.Vector3(circuitData.x[i], 0, -circuitData.y[i]));
  }

  // Calculate bounds
  const box = new THREE.Box3().setFromPoints(points);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.z);

  // ========== SKY ==========
  const skyGeometry = new THREE.SphereGeometry(maxDim * 3, 32, 32);
  const skyMaterial = new THREE.ShaderMaterial({
    uniforms: {
      topColor: { value: new THREE.Color(0x0077ff) },
      bottomColor: { value: new THREE.Color(0xaaccff) },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition).y;
        gl_FragColor = vec4(mix(bottomColor, topColor, max(h, 0.0)), 1.0);
      }
    `,
    side: THREE.BackSide,
  });
  const sky = new THREE.Mesh(skyGeometry, skyMaterial);
  scene.add(sky);
  trackObjects.push(sky);

  // ========== GROUND ==========
  const groundSize = maxDim * 2;
  const groundGeometry = new THREE.PlaneGeometry(groundSize, groundSize);
  groundGeometry.rotateX(-Math.PI / 2);
  const groundMaterial = new THREE.MeshStandardMaterial({
    color: 0x3a5f0b,
    roughness: 0.9,
    metalness: 0.1,
  });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.position.set(center.x, -10, center.z);
  ground.receiveShadow = true;
  scene.add(ground);
  trackObjects.push(ground);

  // ========== TRACK SURFACE ==========
  const sectorBoundaries = circuitData.sector_boundaries || {
    sector_1_end: Math.floor(points.length / 3),
    sector_2_end: Math.floor((2 * points.length) / 3),
  };

  const sectors = [
    { start: 0, end: sectorBoundaries.sector_1_end, color: 0xff0000 },
    { start: sectorBoundaries.sector_1_end, end: sectorBoundaries.sector_2_end, color: 0x0066ff },
    { start: sectorBoundaries.sector_2_end, end: points.length, color: 0xffdd00 },
  ];

  sectors.forEach((sector) => {
    const sectorPoints = points.slice(sector.start, sector.end);
    if (sectorPoints.length < 2) return;

    const sectorCurve = new THREE.CatmullRomCurve3(sectorPoints);
    const trackWidth = 80;

    // Asphalt surface
    const trackGeometry = new THREE.TubeGeometry(
      sectorCurve,
      sectorPoints.length * 2,
      trackWidth,
      8,
      false
    );
    const trackMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a2a2a,
      roughness: 0.9,
      metalness: 0.1,
    });
    const trackSurface = new THREE.Mesh(trackGeometry, trackMaterial);
    trackSurface.castShadow = true;
    trackSurface.receiveShadow = true;
    scene.add(trackSurface);
    trackObjects.push(trackSurface);

    // Racing line
    const racingLineGeometry = new THREE.TubeGeometry(
      sectorCurve,
      sectorPoints.length * 2,
      25,
      8,
      false
    );
    const racingLineMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 0.8,
      metalness: 0.2,
    });
    const racingLine = new THREE.Mesh(racingLineGeometry, racingLineMaterial);
    racingLine.position.y = 1;
    scene.add(racingLine);
    trackObjects.push(racingLine);

    // Sector stripe
    const stripeGeometry = new THREE.TubeGeometry(
      sectorCurve,
      sectorPoints.length * 2,
      15,
      8,
      false
    );
    const stripeMaterial = new THREE.MeshStandardMaterial({
      color: sector.color,
      emissive: sector.color,
      emissiveIntensity: 0.3,
      roughness: 0.5,
      metalness: 0.6,
    });
    const stripe = new THREE.Mesh(stripeGeometry, stripeMaterial);
    stripe.position.y = 2;
    scene.add(stripe);
    trackObjects.push(stripe);

    // Safety barriers
    for (const side of [-1, 1]) {
      const barrierPoints = sectorPoints.map((p) => {
        const offset = new THREE.Vector3(0, 0, side * (trackWidth + 30));
        return p.clone().add(offset);
      });
      const barrierCurve = new THREE.CatmullRomCurve3(barrierPoints);
      const barrierGeometry = new THREE.TubeGeometry(
        barrierCurve,
        sectorPoints.length * 2,
        10,
        6,
        false
      );
      const barrierMaterial = new THREE.MeshStandardMaterial({
        color: 0xff3333,
        emissive: 0x880000,
        emissiveIntensity: 0.2,
        roughness: 0.6,
        metalness: 0.4,
      });
      const barrier = new THREE.Mesh(barrierGeometry, barrierMaterial);
      barrier.position.y = 40;
      barrier.castShadow = true;
      scene.add(barrier);
      trackObjects.push(barrier);
    }
  });

  // ========== START/FINISH ==========
  const startPoint = points[0];
  const nextPoint = points[Math.min(1, points.length - 1)];
  const direction = new THREE.Vector3().subVectors(nextPoint, startPoint).normalize();
  const perpendicular = new THREE.Vector3(-direction.z, 0, direction.x);

  // Checkered pattern
  const squareSize = 20;
  const numSquares = 8;
  for (let i = 0; i < numSquares; i++) {
    for (let j = 0; j < 2; j++) {
      const isBlack = (i + j) % 2 === 0;
      const squareGeometry = new THREE.PlaneGeometry(squareSize, squareSize);
      squareGeometry.rotateX(-Math.PI / 2);
      const squareMaterial = new THREE.MeshStandardMaterial({
        color: isBlack ? 0x000000 : 0xffffff,
        roughness: 0.8,
      });
      const square = new THREE.Mesh(squareGeometry, squareMaterial);
      square.position.copy(startPoint);
      square.position.add(perpendicular.clone().multiplyScalar((i - numSquares / 2) * squareSize));
      square.position.add(direction.clone().multiplyScalar((j - 0.5) * squareSize));
      square.position.y = 3;
      scene.add(square);
      trackObjects.push(square);
    }
  }

  // ========== CORNER MARKERS ==========
  const corners = circuitData.corners || [];
  corners.forEach((corner) => {
    const cornerIndex = Math.min(corner.index, points.length - 1);
    const cornerPoint = points[cornerIndex];
    if (!cornerPoint) return;

    // Cone marker
    const coneGeometry = new THREE.ConeGeometry(30, 80, 8);
    const coneMaterial = new THREE.MeshStandardMaterial({
      color: 0xffaa00,
      emissive: 0xff6600,
      emissiveIntensity: 0.4,
    });
    const cone = new THREE.Mesh(coneGeometry, coneMaterial);
    cone.position.copy(cornerPoint);
    cone.position.y = 40;
    scene.add(cone);
    trackObjects.push(cone);

    // Number label
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(64, 64, 50, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(corner.number.toString(), 64, 64);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(150, 150, 1);
    sprite.position.set(cornerPoint.x, 250, cornerPoint.z);
    scene.add(sprite);
    trackObjects.push(sprite);
  });

  // Cleanup function
  return () => {
    trackObjects.forEach((obj) => {
      scene.remove(obj);
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((mat) => mat.dispose());
        } else {
          obj.material?.dispose();
        }
      }
    });
  };
}
