import * as THREE from 'three';
import { RADIUS, TAU, Y_AXIS, isCompact, random, randomDirection, heightAt, groundRadius } from './core.js';

function makeGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 1, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(220,255,245,0.95)');
  gradient.addColorStop(0.17, 'rgba(83,245,216,0.45)');
  gradient.addColorStop(1, 'rgba(48,216,206,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

export function buildRuins(scene, site) {
  const { primaryRuinDirection, nearbyDirection } = site;
  const ruinGlowMaterial = new THREE.SpriteMaterial({ map: makeGlowTexture(), color: 0x74f4dd, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const ruinStone = new THREE.MeshStandardMaterial({ color: 0xa4b5b2, roughness: 0.9, metalness: 0.08, flatShading: true });
  const ruinDark = new THREE.MeshStandardMaterial({ color: 0x536a72, roughness: 0.94, flatShading: true });
  const runeMaterial = new THREE.MeshStandardMaterial({ color: 0x8ff5e0, emissive: 0x36e3ce, emissiveIntensity: 2.1, metalness: 0.22, roughness: 0.3 });
  const beaconMaterial = new THREE.MeshBasicMaterial({ color: 0x7ff7dd, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });

  const ruins = [];
  function createRuin(direction, size, phase) {
    const group = new THREE.Group();
    group.quaternion.setFromUnitVectors(Y_AXIS, direction);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.24, 0), ruinDark);
    rock.position.y = -0.075;
    rock.scale.set(1, 0.52, 1);
    group.add(rock);
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.055, 8), ruinStone);
    floor.position.y = 0.045;
    group.add(floor);
    const step = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.29, 0.025, 8), ruinDark);
    step.position.y = 0.0;
    group.add(step);
    const floorRune = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.008, 4, 28), runeMaterial);
    floorRune.rotation.x = Math.PI / 2;
    floorRune.position.y = 0.078;
    group.add(floorRune);
    const floorRuneInner = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.0045, 3, 24), runeMaterial);
    floorRuneInner.rotation.x = Math.PI / 2;
    floorRuneInner.position.y = 0.079;
    group.add(floorRuneInner);
    for (let i = 0; i < 5; i++) {
      const a = i * TAU / 5 + 0.18;
      const pillarHeight = i === 2 ? 0.11 : 0.16 + random() * 0.11;
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.034, pillarHeight, 5), ruinStone);
      pillar.position.set(Math.cos(a) * 0.17, 0.07 + pillarHeight / 2, Math.sin(a) * 0.17);
      pillar.rotation.z = (random() - 0.5) * 0.22;
      group.add(pillar);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.067, 0.018, 0.053), ruinStone);
      cap.position.set(pillar.position.x, pillar.position.y + pillarHeight / 2, pillar.position.z);
      cap.rotation.y = -a;
      group.add(cap);
      const chip = new THREE.Mesh(new THREE.TetrahedronGeometry(0.032 + random() * 0.018), ruinDark);
      chip.position.set(Math.cos(a + 0.6) * 0.29, -0.05 + random() * 0.18, Math.sin(a + 0.6) * 0.29);
      group.add(chip);
    }
    for (let i = 0; i < 3; i++) {
      const angle = i * TAU / 3 + 0.5;
      const monolith = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.25, 0.064), i === 1 ? ruinDark : ruinStone);
      monolith.position.set(Math.cos(angle) * 0.29, 0.15 + random() * 0.06, Math.sin(angle) * 0.29);
      monolith.rotation.set((random() - 0.5) * 0.18, -angle, (random() - 0.5) * 0.16);
      group.add(monolith);
    }
    const archLeft = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.25, 0.05), ruinStone);
    archLeft.position.set(-0.12, 0.195, -0.025);
    const archRight = archLeft.clone();
    archRight.position.x = 0.12;
    const archTop = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.035, 0.052), ruinStone);
    archTop.position.set(0, 0.337, -0.025);
    archTop.rotation.z = 0.035;
    group.add(archLeft, archRight, archTop);
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.07), runeMaterial);
    crystal.position.y = 0.235;
    group.add(crystal);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.009, 5, 32), runeMaterial);
    halo.position.y = 0.28;
    halo.rotation.x = Math.PI / 2.8;
    group.add(halo);
    const haloSecond = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.0045, 4, 40), runeMaterial);
    haloSecond.position.y = 0.33;
    haloSecond.rotation.set(1.15, 0.4, 0.3);
    group.add(haloSecond);
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.04, 0.5, 8, 1, true), beaconMaterial);
    beacon.position.y = 0.47;
    group.add(beacon);
    const sprite = new THREE.Sprite(ruinGlowMaterial);
    sprite.position.y = 0.23;
    sprite.scale.set(0.56, 0.56, 0.56);
    group.add(sprite);
    const debris = [];
    for (let i = 0; i < 7; i++) {
      const shard = new THREE.Mesh(new THREE.TetrahedronGeometry(0.018 + random() * 0.032), i % 3 === 0 ? runeMaterial : ruinStone);
      group.add(shard);
      debris.push({ mesh: shard, angle: random() * TAU, radius: 0.26 + random() * 0.17, height: 0.1 + random() * 0.23, speed: 0.2 + random() * 0.48, size: 0.7 + random() * 0.8 });
    }
    group.scale.setScalar(size);
    const base = Math.max(groundRadius(direction), RADIUS + 0.07) + 0.47 + size * 0.12;
    group.position.copy(direction).multiplyScalar(base);
    scene.add(group);
    ruins.push({ group, direction: direction.clone(), base, phase, halo, haloSecond, crystal, debris });
  }
  createRuin(primaryRuinDirection, 1.55, 0);
  for (let i = 1; i < (isCompact ? 6 : 11); i++) {
    let direction, tries = 0;
    do { direction = randomDirection(); tries++; }
    while (heightAt(direction) < 0.065 && tries < 150);
    createRuin(direction, 0.72 + random() * 0.68, random() * TAU);
  }

  // Suspended islands break up the planet silhouette and give the sky a sense of scale.
  const floatingIsles = [];
  const isleGrassMaterial = new THREE.MeshStandardMaterial({ color: 0x65a585, emissive: 0x0b433c, emissiveIntensity: 0.9, roughness: 0.96, flatShading: true });
  const isleStoneMaterial = new THREE.MeshStandardMaterial({ color: 0x5c7278, roughness: 0.98, flatShading: true });
  const isleStemMaterial = new THREE.MeshStandardMaterial({ color: 0x3e5554, roughness: 1 });
  const isleCanopyMaterial = new THREE.MeshStandardMaterial({ color: 0x9ee2b8, emissive: 0x0d514f, emissiveIntensity: 1, roughness: 0.85, flatShading: true });
  function createFloatingIsle(direction, size, altitude, phase) {
    const group = new THREE.Group();
    group.quaternion.setFromUnitVectors(Y_AXIS, direction);
    const underside = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.8, 7, 2), isleStoneMaterial);
    underside.rotation.x = Math.PI;
    underside.position.y = -0.42;
    group.add(underside);
    const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(0.19, 0), isleStoneMaterial);
    crown.position.set(0.19, -0.45, 0.1);
    crown.scale.set(0.8, 1.7, 0.7);
    group.add(crown);
    const crownTwo = crown.clone();
    crownTwo.position.set(-0.16, -0.3, -0.13);
    crownTwo.scale.set(0.7, 1.2, 0.9);
    group.add(crownTwo);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.37, 0.11, 7), isleGrassMaterial);
    top.position.y = 0.035;
    group.add(top);
    const shorelineRing = new THREE.Mesh(new THREE.TorusGeometry(0.395, 0.013, 4, 32), runeMaterial);
    shorelineRing.rotation.x = Math.PI / 2;
    shorelineRing.position.y = 0.095;
    group.add(shorelineRing);
    const tinyTrees = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const angle = i * TAU / 5 + 0.35;
      const tree = new THREE.Group();
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.011, 0.1, 4), isleStemMaterial);
      stem.position.y = 0.04;
      const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.17, 5), isleCanopyMaterial);
      canopy.position.y = 0.14;
      tree.add(stem, canopy);
      tree.position.set(Math.cos(angle) * 0.25, 0.09, Math.sin(angle) * 0.25);
      tree.scale.setScalar(0.7 + random() * 0.45);
      tinyTrees.add(tree);
    }
    group.add(tinyTrees);
    const monolith = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.36, 0.075), ruinStone);
    monolith.position.set(-0.12, 0.29, 0.02);
    monolith.rotation.z = 0.12;
    group.add(monolith);
    const monolithRune = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.2, 0.012), runeMaterial);
    monolithRune.position.set(0.04, 0.31, 0.05);
    group.add(monolithRune);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.007, 4, 32), runeMaterial);
    ring.position.y = 0.36;
    ring.rotation.x = 0.35;
    group.add(ring);
    const fragmentData = [];
    for (let i = 0; i < 7; i++) {
      const fragment = new THREE.Mesh(new THREE.IcosahedronGeometry(0.025 + random() * 0.035, 0), i % 3 === 0 ? ruinStone : isleStoneMaterial);
      group.add(fragment);
      fragmentData.push({ mesh: fragment, angle: random() * TAU, radius: 0.5 + random() * 0.22, drop: -0.1 - random() * 0.45, speed: 0.12 + random() * 0.25 });
    }
    const aura = new THREE.Sprite(ruinGlowMaterial);
    aura.position.y = -0.54;
    aura.scale.set(0.75, 0.75, 0.75);
    group.add(aura);
    const fall = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.028, 0.8, 7, 1, true), beaconMaterial);
    fall.position.y = -0.91;
    group.add(fall);
    group.scale.setScalar(size);
    const baseRadius = groundRadius(direction) + 0.88 + altitude;
    group.position.copy(direction).multiplyScalar(baseRadius);
    scene.add(group);
    floatingIsles.push({ group, direction: direction.clone(), base: baseRadius, phase, ring, fragments: fragmentData });
  }
  createFloatingIsle(nearbyDirection(0.12, 0.18), 0.82, 1.25, 0.2);
  createFloatingIsle(nearbyDirection(0.34, 0.46), 0.62, 1.2, 2.4);
  createFloatingIsle(randomDirection(), 1.18, 0.9, 4.1);
  createFloatingIsle(randomDirection(), 0.72, 1.5, 1.4);

  function update(elapsed) {
    for (const ruin of ruins) {
      ruin.group.position.copy(ruin.direction).multiplyScalar(ruin.base + Math.sin(elapsed * 1.1 + ruin.phase) * 0.033);
      ruin.halo.rotation.z = elapsed * 0.35 + ruin.phase;
      ruin.haloSecond.rotation.y = elapsed * 0.18 + ruin.phase;
      ruin.crystal.rotation.y = elapsed * 0.65;
      for (const piece of ruin.debris) {
        const angle = piece.angle + elapsed * piece.speed;
        piece.mesh.position.set(Math.cos(angle) * piece.radius, piece.height + Math.sin(elapsed * 0.8 + piece.angle) * 0.025, Math.sin(angle) * piece.radius);
        piece.mesh.rotation.x = elapsed * piece.speed * 2.1;
        piece.mesh.rotation.y = elapsed * piece.speed * 1.4 + piece.angle;
        piece.mesh.scale.setScalar(piece.size);
      }
    }
    for (const isle of floatingIsles) {
      isle.group.position.copy(isle.direction).multiplyScalar(isle.base + Math.sin(elapsed * 0.62 + isle.phase) * 0.055);
      isle.ring.rotation.z = elapsed * 0.22 + isle.phase;
      for (const fragment of isle.fragments) {
        const angle = fragment.angle + elapsed * fragment.speed;
        fragment.mesh.position.set(Math.cos(angle) * fragment.radius, fragment.drop + Math.sin(elapsed * 0.7 + fragment.angle) * 0.045, Math.sin(angle) * fragment.radius);
        fragment.mesh.rotation.x = elapsed * 0.3;
        fragment.mesh.rotation.y = elapsed * 0.4 + fragment.angle;
      }
    }
  }

  return { items: ruins, isles: floatingIsles, update };
}
