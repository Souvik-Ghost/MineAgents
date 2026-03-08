/**
 * controls.js — First-person camera controls for the voxel world.
 * Handles pointer lock, WASD movement, and mouse look.
 */

import * as THREE from 'three';

export class Controls {
    constructor(camera, canvas, world) {
        this.camera = camera;
        this.canvas = canvas;
        this.world = world;
        this.enabled = false;
        this.locked = false;

        // Movement
        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();
        this.speed = 20;
        this.keys = {};

        // Mouse look
        this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
        this.sensitivity = 0.002;
        this.pitchLimit = Math.PI / 2 - 0.05;

        this._setupEvents();
    }

    _setupEvents() {
        // Keyboard
        document.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
        });
        document.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });

        // Pointer lock
        this.canvas.addEventListener('click', () => {
            if (this.enabled && !this.locked) {
                this.canvas.requestPointerLock();
            }
        });

        document.addEventListener('pointerlockchange', () => {
            this.locked = document.pointerLockElement === this.canvas;
        });

        // Mouse move
        document.addEventListener('mousemove', (e) => {
            if (!this.locked || !this.enabled) return;
            this.euler.setFromQuaternion(this.camera.quaternion);
            this.euler.y -= e.movementX * this.sensitivity;
            this.euler.x -= e.movementY * this.sensitivity;
            this.euler.x = Math.max(-this.pitchLimit, Math.min(this.pitchLimit, this.euler.x));
            this.camera.quaternion.setFromEuler(this.euler);
        });
    }

    enable() {
        this.enabled = true;
        document.getElementById('crosshair').style.display = 'block';
    }

    disable() {
        this.enabled = false;
        this.locked = false;
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }
        document.getElementById('crosshair').style.display = 'none';
    }

    update(delta) {
        if (!this.enabled) return;

        const moveSpeed = this.speed * delta;

        // Get camera direction vectors
        const forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();

        const right = new THREE.Vector3();
        right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

        // Apply movement
        const move = new THREE.Vector3();

        if (this.keys['KeyW']) move.add(forward);
        if (this.keys['KeyS']) move.sub(forward);
        if (this.keys['KeyD']) move.add(right);
        if (this.keys['KeyA']) move.sub(right);
        if (this.keys['KeyQ']) move.y += 1;
        if (this.keys['KeyE']) move.y -= 1;

        if (move.lengthSq() > 0) {
            move.normalize().multiplyScalar(moveSpeed);
            const newPos = this.camera.position.clone().add(move);

            // Simple collision: check if target position is not inside solid block
            if (!this.world.isSolid(newPos.x, newPos.y, newPos.z) &&
                !this.world.isSolid(newPos.x, newPos.y - 1, newPos.z)) {
                this.camera.position.copy(newPos);
            }
        }
    }
}
