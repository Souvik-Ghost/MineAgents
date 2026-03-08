/**
 * bot.js — Rule-based autonomous AI bot.
 * Explores the voxel world with obstacle avoidance, curiosity-driven
 * movement, and random block interactions.
 */

import * as THREE from 'three';
import { CHUNK_SIZE, WORLD_W, WORLD_D, WORLD_H } from './world.js';

// World boundaries
const WORLD_MIN_X = 2;
const WORLD_MAX_X = WORLD_W * CHUNK_SIZE - 2;
const WORLD_MIN_Z = 2;
const WORLD_MAX_Z = WORLD_D * CHUNK_SIZE - 2;
const WORLD_MIN_Y = 1;
const WORLD_MAX_Y = WORLD_H * CHUNK_SIZE + 10;

export class Bot {
    constructor(camera, world) {
        this.camera = camera;
        this.world = world;
        this.enabled = false;

        // State
        this.currentAction = 'idle';
        this.currentReason = 'initializing';
        this.actionTimer = 0;
        this.actionDuration = 0;

        // Movement config
        this.moveSpeed = 8;
        this.rotSpeed = 1.5;

        // Exploration state
        this.targetYaw = 0;
        this.lastPos = new THREE.Vector3();
        this.stuckCounter = 0;
        this.explorationBias = 0;

        // Action queue
        this._queue = [];

        // Euler for camera rotation
        this.euler = new THREE.Euler(0, 0, 0, 'YXZ');

        // Respawn point
        this.spawnPos = new THREE.Vector3();
    }

    enable() {
        this.enabled = true;
        this.lastPos.copy(this.camera.position);
        this.spawnPos.copy(this.camera.position);
        this.euler.setFromQuaternion(this.camera.quaternion);
        this._decide();
    }

    disable() {
        this.enabled = false;
        this.currentAction = 'idle';
        this.currentReason = 'disabled';
    }

    /**
     * Check if a position is within world bounds.
     */
    _isInBounds(x, z) {
        return x > WORLD_MIN_X && x < WORLD_MAX_X && z > WORLD_MIN_Z && z < WORLD_MAX_Z;
    }

    /**
     * Sense the environment.
     */
    _sense() {
        const pos = this.camera.position;
        const forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();

        const checkDist = 2.5;
        const checks = {};

        // Forward
        const fwdPoint = pos.clone().add(forward.clone().multiplyScalar(checkDist));
        checks.forwardBlocked = this.world.isSolid(fwdPoint.x, fwdPoint.y, fwdPoint.z) ||
            this.world.isSolid(fwdPoint.x, fwdPoint.y - 1, fwdPoint.z);

        // Close forward
        const closeFwd = pos.clone().add(forward.clone().multiplyScalar(1.2));
        checks.closeBlocked = this.world.isSolid(closeFwd.x, closeFwd.y, closeFwd.z);

        // Down (ground check at current position)
        checks.groundBelow = this.world.isSolid(pos.x, pos.y - 2.5, pos.z);

        // Forward ground check — is there ground where we're about to walk?
        const fwdGround = pos.clone().add(forward.clone().multiplyScalar(2.0));
        checks.forwardGroundExists = this.world.isSolid(fwdGround.x, pos.y - 2.5, fwdGround.z) ||
            this.world.isSolid(fwdGround.x, pos.y - 3.5, fwdGround.z);

        // Left
        const left = new THREE.Vector3();
        left.crossVectors(new THREE.Vector3(0, 1, 0), forward).normalize();
        const leftPoint = pos.clone().add(left.clone().multiplyScalar(checkDist));
        checks.leftBlocked = this.world.isSolid(leftPoint.x, leftPoint.y, leftPoint.z);

        // Right
        const rightPoint = pos.clone().sub(left.clone().multiplyScalar(checkDist));
        checks.rightBlocked = this.world.isSolid(rightPoint.x, rightPoint.y, rightPoint.z);

        // Stuck detection
        const moved = pos.distanceTo(this.lastPos);
        if (moved < 0.05) {
            this.stuckCounter++;
        } else {
            this.stuckCounter = Math.max(0, this.stuckCounter - 1);
        }
        checks.isStuck = this.stuckCounter > 8;
        this.lastPos.copy(pos);

        // Boundary check
        checks.nearEdge = !this._isInBounds(pos.x, pos.z);
        checks.forwardOutOfBounds = !this._isInBounds(fwdPoint.x, fwdPoint.z);

        // Height check
        checks.tooHigh = pos.y > WORLD_MAX_Y;
        checks.tooLow = pos.y < WORLD_MIN_Y;

        return checks;
    }

    /**
     * Decide the next action based on sensed environment.
     */
    _decide() {
        const env = this._sense();
        let action, reason, duration;

        // Priority 0: Out of bounds — teleport back to spawn
        if (this.camera.position.y < -5) {
            this.camera.position.copy(this.spawnPos);
            this.euler.setFromQuaternion(this.camera.quaternion);
            action = 'turn_right';
            reason = 'respawned — fell out of world';
            duration = 1.0;
        }
        // Priority 1: Near world edge — turn inward
        else if (env.nearEdge || env.forwardOutOfBounds) {
            action = 'turn_right';
            reason = 'near world edge — turning back';
            duration = 0.8 + Math.random() * 0.8;
            this._queue.push({ action: 'move_forward', duration: 1.0, reason: 'moving away from edge' });
        }
        // Priority 2: Stuck — aggressively escape
        else if (env.isStuck) {
            this.stuckCounter = 0;
            this.explorationBias = -this.explorationBias || 1;
            const escapeActions = [
                { action: 'turn_left', reason: 'stuck — turning to escape', duration: 0.8 + Math.random() * 0.6 },
                { action: 'turn_right', reason: 'stuck — turning to escape', duration: 0.8 + Math.random() * 0.6 },
                { action: 'move_up', reason: 'stuck — jumping up', duration: 0.5 },
                { action: 'move_back', reason: 'stuck — backing up', duration: 0.6 },
            ];
            const choice = escapeActions[Math.floor(Math.random() * escapeActions.length)];
            action = choice.action;
            reason = choice.reason;
            duration = choice.duration;
        }
        // Priority 3: No ground ahead — turn away from cliff
        else if (!env.forwardGroundExists && !env.forwardBlocked) {
            action = Math.random() > 0.5 ? 'turn_left' : 'turn_right';
            reason = 'cliff ahead — avoiding fall';
            duration = 0.6 + Math.random() * 0.4;
        }
        // Priority 4: Close obstacle
        else if (env.closeBlocked) {
            const turnDir = env.leftBlocked ? 'turn_right' : env.rightBlocked ? 'turn_left' : (Math.random() > 0.5 ? 'turn_left' : 'turn_right');
            action = turnDir;
            reason = 'obstacle ahead — turning';
            duration = 0.5 + Math.random() * 0.5;
        }
        // Priority 5: Forward blocked
        else if (env.forwardBlocked) {
            if (!env.leftBlocked && Math.random() > 0.3) {
                action = 'turn_left';
                reason = 'path blocked — going left';
            } else if (!env.rightBlocked) {
                action = 'turn_right';
                reason = 'path blocked — going right';
            } else {
                action = 'move_up';
                reason = 'surrounded — going up';
            }
            duration = 0.6 + Math.random() * 0.4;
        }
        // Priority 6: No ground — DON'T descend, turn around
        else if (!env.groundBelow) {
            action = 'turn_right';
            reason = 'no ground below — turning back';
            duration = 0.6;
            this._queue.push({ action: 'move_forward', duration: 0.8, reason: 'seeking ground' });
        }
        // Priority 7: Height correction
        else if (env.tooHigh) {
            action = 'move_down';
            reason = 'too high — descending';
            duration = 0.5;
        }
        else if (env.tooLow) {
            action = 'move_up';
            reason = 'too low — ascending';
            duration = 0.3;
        }
        // Exploration mode
        else {
            const roll = Math.random();
            if (roll < 0.50) {
                action = 'move_forward';
                reason = 'exploring forward';
                duration = 1.0 + Math.random() * 2.0;
            } else if (roll < 0.65) {
                action = 'turn_left';
                reason = 'looking around — left';
                duration = 0.3 + Math.random() * 0.5;
            } else if (roll < 0.80) {
                action = 'turn_right';
                reason = 'looking around — right';
                duration = 0.3 + Math.random() * 0.5;
            } else if (roll < 0.88) {
                action = 'move_forward';
                reason = 'moving diagonally';
                duration = 0.5 + Math.random() * 1.0;
                this._queue.push({ action: 'turn_left', duration: 0.2, reason: 'slight turn' });
            } else if (roll < 0.93) {
                action = 'look_up';
                reason = 'admiring the sky';
                duration = 0.3 + Math.random() * 0.3;
            } else if (roll < 0.97) {
                action = 'look_down';
                reason = 'inspecting the ground';
                duration = 0.2 + Math.random() * 0.2;
            } else {
                action = 'move_up';
                reason = 'jumping for fun';
                duration = 0.3;
            }
        }

        this.currentAction = action;
        this.currentReason = reason;
        this.actionDuration = duration;
        this.actionTimer = 0;
    }

    /**
     * Update the bot each frame.
     */
    update(delta) {
        if (!this.enabled) return;

        // Hard clamp position to world boundaries
        const pos = this.camera.position;
        pos.x = Math.max(WORLD_MIN_X, Math.min(WORLD_MAX_X, pos.x));
        pos.z = Math.max(WORLD_MIN_Z, Math.min(WORLD_MAX_Z, pos.z));
        pos.y = Math.max(WORLD_MIN_Y, Math.min(WORLD_MAX_Y, pos.y));

        this.actionTimer += delta;

        // When current action expires, pick next
        if (this.actionTimer >= this.actionDuration) {
            if (this._queue.length > 0) {
                const next = this._queue.shift();
                this.currentAction = next.action;
                this.currentReason = next.reason;
                this.actionDuration = next.duration;
                this.actionTimer = 0;
            } else {
                this._decide();
            }
        }

        // Execute action
        this._executeAction(delta);
    }

    _executeAction(delta) {
        this.euler.setFromQuaternion(this.camera.quaternion);

        const forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();

        const right = new THREE.Vector3();
        right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

        const moveStep = this.moveSpeed * delta;
        const rotStep = this.rotSpeed * delta;
        const move = new THREE.Vector3();

        switch (this.currentAction) {
            case 'move_forward':
                move.add(forward.clone().multiplyScalar(moveStep));
                break;
            case 'move_back':
                move.sub(forward.clone().multiplyScalar(moveStep));
                break;
            case 'move_left':
                move.sub(right.clone().multiplyScalar(moveStep));
                break;
            case 'move_right':
                move.add(right.clone().multiplyScalar(moveStep));
                break;
            case 'move_up':
                move.y += moveStep;
                break;
            case 'move_down':
                move.y -= moveStep;
                break;
            case 'turn_left':
                this.euler.y += rotStep;
                this.camera.quaternion.setFromEuler(this.euler);
                return;
            case 'turn_right':
                this.euler.y -= rotStep;
                this.camera.quaternion.setFromEuler(this.euler);
                return;
            case 'look_up':
                this.euler.x = Math.min(this.euler.x + rotStep * 0.5, Math.PI / 3);
                this.camera.quaternion.setFromEuler(this.euler);
                return;
            case 'look_down':
                this.euler.x = Math.max(this.euler.x - rotStep * 0.5, -Math.PI / 3);
                this.camera.quaternion.setFromEuler(this.euler);
                return;
            case 'idle':
            default:
                return;
        }

        // Apply movement with collision + boundary check
        if (move.lengthSq() > 0) {
            const newPos = this.camera.position.clone().add(move);

            // Stay in bounds
            if (newPos.x < WORLD_MIN_X || newPos.x > WORLD_MAX_X ||
                newPos.z < WORLD_MIN_Z || newPos.z > WORLD_MAX_Z) {
                // Don't move, force a turn next frame
                this.actionTimer = this.actionDuration;
                return;
            }

            if (!this.world.isSolid(newPos.x, newPos.y, newPos.z) &&
                !this.world.isSolid(newPos.x, newPos.y - 1, newPos.z)) {
                this.camera.position.copy(newPos);
            }
        }
    }
}
