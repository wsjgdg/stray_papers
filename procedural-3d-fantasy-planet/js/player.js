import * as THREE from 'three';
import { RADIUS, SEA_LEVEL, SEA_RADIUS, EYE_HEIGHT, Y_AXIS, isCompact, clamp, nearestLand, groundRadius, heightAt, orbitDirection, INITIAL_YAW, INITIAL_POLAR } from './core.js';

function fitDistance() {
  return window.innerWidth / window.innerHeight < 0.76 ? 21 : isCompact ? 14.3 : 12.6;
}

export function createPlayer({ camera, canvas, site, ruins, onModeChange, onShiftLight }) {
  const state = {
    mode: 'orbit', transition: null, orbitYaw: INITIAL_YAW, orbitPolar: INITIAL_POLAR,
    orbitDistance: fitDistance(),
    composition: isCompact ? 0 : 1, compositionTarget: isCompact ? 0 : 1,
    playerDirection: site.firstLanding.clone(), playerRadius: 0, playerVelocity: 0,
    heading: site.tangentEast.clone(), pitch: 0.1, grounded: true, inWater: false, walkPhase: 0
  };
  const keys = new Set();
  const pointerPositions = new Map();
  const joystick = { x: 0, y: 0, pointerId: null };
  const lookMatrix = new THREE.Matrix4();
  const targetPosition = new THREE.Vector3();
  const targetQuaternion = new THREE.Quaternion();
  const aim = new THREE.Vector3();
  const right = new THREE.Vector3();
  const movement = new THREE.Vector3();

  function updateOrbitPose() {
    const direction = orbitDirection(state.orbitYaw, state.orbitPolar);
    targetPosition.copy(direction).multiplyScalar(state.orbitDistance);
    aim.set(Math.cos(state.orbitYaw), 0, -Math.sin(state.orbitYaw)).multiplyScalar(-2.05 * state.composition);
    aim.y += 0.17 * state.composition;
    targetQuaternion.setFromRotationMatrix(lookMatrix.lookAt(targetPosition, aim, Y_AXIS));
  }
  function updateGroundPose() {
    const up = state.playerDirection;
    targetPosition.copy(up).multiplyScalar(state.playerRadius);
    aim.copy(state.heading).multiplyScalar(Math.cos(state.pitch)).addScaledVector(up, Math.sin(state.pitch)).add(targetPosition);
    targetQuaternion.setFromRotationMatrix(lookMatrix.lookAt(targetPosition, aim, up));
  }
  function setHeadingToward(direction) {
    state.heading.copy(direction).addScaledVector(state.playerDirection, -direction.dot(state.playerDirection));
    if (state.heading.lengthSq() < 0.0001) state.heading.crossVectors(Y_AXIS, state.playerDirection);
    state.heading.normalize();
  }
  function markInteraction() { state.compositionTarget = 0; }
  function zoom(factor) {
    state.orbitDistance = clamp(state.orbitDistance * factor, 6.2, 32);
    markInteraction();
  }
  function switchMode() {
    if (state.transition) return;
    if (document.pointerLockElement) document.exitPointerLock();
    const startPosition = camera.position.clone(), startQuaternion = camera.quaternion.clone();
    if (state.mode === 'orbit') {
      state.playerDirection.copy(nearestLand(orbitDirection(state.orbitYaw, state.orbitPolar)));
      state.playerRadius = groundRadius(state.playerDirection) + EYE_HEIGHT;
      state.playerVelocity = 0;
      state.grounded = true;
      let nearestRuin = null, bestDot = -1;
      for (const ruin of ruins) {
        const dot = ruin.direction.dot(state.playerDirection);
        if (dot > bestDot && dot < 0.9995) { bestDot = dot; nearestRuin = ruin.direction; }
      }
      setHeadingToward(nearestRuin || site.tangentEast);
      state.pitch = 0.08;
      state.mode = 'ground';
      updateGroundPose();
    } else {
      state.orbitYaw = Math.atan2(state.playerDirection.x, state.playerDirection.z);
      state.orbitPolar = Math.acos(clamp(state.playerDirection.y, -1, 1));
      state.orbitDistance = fitDistance();
      state.composition = state.compositionTarget = 0;
      state.mode = 'orbit';
      updateOrbitPose();
    }
    state.transition = {
      startPosition, startQuaternion,
      endPosition: targetPosition.clone(), endQuaternion: targetQuaternion.clone(),
      elapsed: 0, duration: state.mode === 'ground' ? 1.65 : 1.45
    };
    document.body.classList.add('transitioning');
    if (onModeChange) onModeChange(state.mode);
  }
  function jump() {
    if (state.mode === 'ground' && !state.transition && state.grounded && !state.inWater) {
      state.playerVelocity = 1.78;
      state.grounded = false;
    }
  }
  function rotateGround(dx, dy) {
    state.heading.applyAxisAngle(state.playerDirection, -dx * 0.0026).normalize();
    state.pitch = clamp(state.pitch - dy * 0.0023, -1.3, 1.3);
  }
  function snap() {
    if (state.mode === 'orbit') updateOrbitPose(); else updateGroundPose();
    camera.position.copy(targetPosition);
    camera.quaternion.copy(targetQuaternion);
  }
  function viewDirection(out) {
    return out.copy(state.mode === 'ground' ? state.playerDirection : orbitDirection(state.orbitYaw, state.orbitPolar));
  }

  function updatePlayer(dt, elapsed) {
    const forwardAmount = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown')) - joystick.y;
    const sideAmount = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')) + joystick.x;
    right.crossVectors(state.heading, state.playerDirection).normalize();
    movement.copy(state.heading).multiplyScalar(forwardAmount).addScaledVector(right, sideAmount);
    const terrainHeight = heightAt(state.playerDirection);
    state.inWater = terrainHeight < SEA_LEVEL - 0.002;
    let isMoving = false;
    if (movement.lengthSq() > 0.001) {
      movement.normalize();
      isMoving = true;
      const sprinting = keys.has('ShiftLeft') || keys.has('ShiftRight');
      const speed = state.inWater ? 0.54 : sprinting ? 1.45 : 0.82;
      state.playerDirection.multiplyScalar(RADIUS).addScaledVector(movement, speed * dt).normalize();
      state.heading.addScaledVector(state.playerDirection, -state.heading.dot(state.playerDirection)).normalize();
      if (state.grounded && !state.inWater) state.walkPhase += dt * (sprinting ? 13.5 : 9.2);
    }
    state.playerVelocity -= 5.8 * dt;
    state.playerRadius += state.playerVelocity * dt;
    const floor = state.inWater ? SEA_RADIUS + 0.045 : groundRadius(state.playerDirection) + EYE_HEIGHT;
    if (state.playerRadius <= floor) {
      state.playerRadius = floor;
      state.playerVelocity = 0;
      state.grounded = true;
    } else {
      state.grounded = false;
    }
    updateGroundPose();
    const walkBob = isMoving && state.grounded && !state.inWater ? Math.abs(Math.sin(state.walkPhase)) * 0.0026 : Math.sin(elapsed * 1.6) * 0.0009;
    camera.position.copy(targetPosition).addScaledVector(state.playerDirection, walkBob);
    camera.quaternion.slerp(targetQuaternion, 1 - Math.exp(-dt * 18));
  }

  function update(dt, elapsed) {
    if (state.transition) {
      const transition = state.transition;
      transition.elapsed += dt;
      const t = clamp(transition.elapsed / transition.duration, 0, 1);
      const eased = t * t * (3 - 2 * t);
      camera.position.lerpVectors(transition.startPosition, transition.endPosition, eased);
      camera.quaternion.slerpQuaternions(transition.startQuaternion, transition.endQuaternion, eased);
      if (transition.elapsed >= transition.duration) {
        state.transition = null;
        document.body.classList.remove('transitioning');
      }
    } else if (state.mode === 'orbit') {
      const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 1.4 : 0.66) * dt;
      state.orbitPolar = clamp(state.orbitPolar + (Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp'))) * speed, 0.16, Math.PI - 0.16);
      state.orbitYaw += (Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'))) * speed;
      state.composition += (state.compositionTarget - state.composition) * (1 - Math.exp(-dt * 2.5));
      updateOrbitPose();
      camera.position.lerp(targetPosition, 1 - Math.exp(-dt * 8));
      camera.quaternion.slerp(targetQuaternion, 1 - Math.exp(-dt * 8));
    } else {
      updatePlayer(dt, elapsed);
    }
  }

  window.addEventListener('keydown', (event) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
    if (event.code === 'KeyF' && !event.repeat) { switchMode(); return; }
    if (event.code === 'KeyT' && !event.repeat) { if (onShiftLight) onShiftLight(); return; }
    if (event.code === 'Space' && !event.repeat) jump();
    keys.add(event.code);
    if (state.mode === 'orbit' && ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) markInteraction();
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => { keys.clear(); joystick.x = joystick.y = 0; });

  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  function pointerSpacing() {
    const points = [...pointerPositions.values()];
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  }
  canvas.addEventListener('pointerdown', (event) => {
    if (state.transition) return;
    if (state.mode === 'ground' && event.pointerType === 'mouse' && document.pointerLockElement !== canvas) {
      try {
        const result = canvas.requestPointerLock();
        if (result && result.catch) result.catch(() => {});
      } catch (_) { /* A drag still works when pointer lock is unavailable. */ }
    }
    pointerPositions.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try { canvas.setPointerCapture(event.pointerId); } catch (_) { /* Pointer lock may take capture instead. */ }
    document.body.classList.add('dragging');
    if (state.mode === 'orbit') markInteraction();
  });
  canvas.addEventListener('pointermove', (event) => {
    if (state.transition || document.pointerLockElement === canvas) return;
    const previous = pointerPositions.get(event.pointerId);
    if (!previous) return;
    const oldPinch = pointerPositions.size === 2 ? pointerSpacing() : 0;
    const dx = event.clientX - previous.x, dy = event.clientY - previous.y;
    previous.x = event.clientX; previous.y = event.clientY;
    if (state.mode === 'orbit') {
      if (pointerPositions.size === 2 && oldPinch > 0) {
        const newPinch = pointerSpacing();
        state.orbitDistance = clamp(state.orbitDistance * oldPinch / Math.max(1, newPinch), 6.2, 32);
      } else {
        state.orbitYaw -= dx * 0.0047;
        state.orbitPolar = clamp(state.orbitPolar - dy * 0.0047, 0.16, Math.PI - 0.16);
      }
    } else {
      rotateGround(dx, dy);
    }
  });
  function releasePointer(event) {
    pointerPositions.delete(event.pointerId);
    if (!pointerPositions.size) document.body.classList.remove('dragging');
  }
  canvas.addEventListener('pointerup', releasePointer);
  canvas.addEventListener('pointercancel', releasePointer);
  canvas.addEventListener('wheel', (event) => {
    if (state.mode !== 'orbit' || state.transition) return;
    event.preventDefault();
    state.orbitDistance = clamp(state.orbitDistance * Math.exp(event.deltaY * 0.0011), 6.2, 32);
    markInteraction();
  }, { passive: false });
  document.addEventListener('mousemove', (event) => {
    if (document.pointerLockElement === canvas && state.mode === 'ground' && !state.transition) rotateGround(event.movementX, event.movementY);
  });
  document.addEventListener('pointerlockchange', () => {
    pointerPositions.clear();
    document.body.classList.remove('dragging');
    document.body.classList.toggle('locked', document.pointerLockElement === canvas);
  });

  const pad = document.getElementById('joystick');
  const stick = document.getElementById('stick');
  function moveJoystick(event) {
    const rect = pad.getBoundingClientRect();
    const x = (event.clientX - rect.left - rect.width / 2) / (rect.width * 0.34);
    const y = (event.clientY - rect.top - rect.height / 2) / (rect.height * 0.34);
    const length = Math.max(1, Math.hypot(x, y));
    joystick.x = x / length;
    joystick.y = y / length;
    stick.style.transform = `translate(${joystick.x * 35}px, ${joystick.y * 35}px)`;
  }
  pad.addEventListener('pointerdown', (event) => { event.preventDefault(); joystick.pointerId = event.pointerId; pad.setPointerCapture(event.pointerId); moveJoystick(event); });
  pad.addEventListener('pointermove', (event) => { if (event.pointerId === joystick.pointerId) moveJoystick(event); });
  function releaseJoystick(event) {
    if (event.pointerId !== joystick.pointerId) return;
    joystick.pointerId = null;
    joystick.x = joystick.y = 0;
    stick.style.transform = '';
  }
  pad.addEventListener('pointerup', releaseJoystick);
  pad.addEventListener('pointercancel', releaseJoystick);

  let wasPortrait = window.innerWidth / window.innerHeight < 0.76;
  function onResize(width, height) {
    const portrait = width / height < 0.76;
    if (state.mode === 'orbit' && !state.transition) {
      const landscapeFit = isCompact ? 14.3 : 12.6;
      if (state.compositionTarget > 0) state.orbitDistance = portrait ? 21 : landscapeFit;
      else if (portrait !== wasPortrait) state.orbitDistance = clamp(state.orbitDistance * (portrait ? 21 / landscapeFit : landscapeFit / 21), 6.2, 32);
    }
    wasPortrait = portrait;
  }

  return { state, switchMode, jump, zoom, snap, viewDirection, onResize, update };
}
