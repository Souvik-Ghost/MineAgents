/**
 * terrain.js — Procedural terrain generation using simplex noise.
 * Generates height maps, biomes, caves, and trees.
 */

import { createNoise2D, createNoise3D } from 'simplex-noise';
import { CHUNK_SIZE, SAND, GRASS, DIRT, STONE, SNOW, LEAVES, WOOD } from './world.js';

// Seed-based pseudo-random
function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const SEED = 42;
const rng = mulberry32(SEED);
const noise2 = createNoise2D(rng);
const noise3 = createNoise3D(rng);

// Terrain levels
const SNOW_LVL = 28;
const STONE_LVL = 24;
const DIRT_LVL = 18;
const GRASS_LVL = 6;
const SAND_LVL = 5;

/**
 * Get terrain height at world coordinates (x, z).
 */
export function getHeight(x, z) {
    const centerXZ = 4 * CHUNK_SIZE * 0.5;  // match WORLD_W

    // Island mask
    const dist = Math.hypot(x - centerXZ, z - centerXZ);
    let island = 1 / (Math.pow(0.005 * dist, 20) + 0.0001);
    island = Math.min(island, 1);

    // Octave noise
    const a1 = CHUNK_SIZE * 0.6;
    const f1 = 0.008;

    let height = 0;
    height += noise2(x * f1, z * f1) * a1 + a1;
    height += noise2(x * f1 * 2, z * f1 * 2) * a1 * 0.5 - a1 * 0.25;
    height += noise2(x * f1 * 4, z * f1 * 4) * a1 * 0.25 + a1 * 0.125;

    height = Math.max(height, noise2(x * f1 * 8, z * f1 * 8) + 2);
    height *= island;

    return Math.floor(height);
}

/**
 * Determine voxel type at a given world position.
 */
export function getVoxelType(wx, wy, wz) {
    const worldHeight = getHeight(wx, wz);

    if (wy > worldHeight) return 0; // air

    // Subsurface
    if (wy < worldHeight - 1) {
        // Caves
        const cave = noise3(wx * 0.09, wy * 0.09, wz * 0.09);
        const caveMask = noise2(wx * 0.1, wz * 0.1) * 3 + 3;
        if (cave > 0 && caveMask < wy && wy < worldHeight - 6) {
            return 0; // cave air
        }
        return STONE;
    }

    // Surface
    const ry = wy - Math.floor(rng() * 4);
    if (ry >= SNOW_LVL) return SNOW;
    if (ry >= STONE_LVL) return STONE;
    if (ry >= DIRT_LVL) return DIRT;
    if (ry >= GRASS_LVL) return GRASS;
    if (ry >= SAND_LVL) return SAND;
    return SAND;
}

/**
 * Check if a tree should be placed at (wx, wy, wz).
 * Returns tree data array if yes, null otherwise.
 */
export function getTreeAt(wx, wy, wz) {
    const worldHeight = getHeight(wx, wz);
    if (wy !== worldHeight) return null;

    const surfaceType = getVoxelType(wx, wy, wz);
    if (surfaceType !== GRASS) return null;

    // Probability based on noise
    const treeProbability = (noise2(wx * 0.3, wz * 0.3) + 1) * 0.5;
    if (treeProbability < 0.85) return null;

    const treeHeight = 5 + Math.floor(rng() * 3);
    const blocks = [];

    // Trunk
    for (let y = 1; y <= treeHeight; y++) {
        blocks.push({ x: 0, y: y, z: 0, type: WOOD });
    }

    // Leaves
    const leafStart = Math.floor(treeHeight * 0.5);
    for (let y = leafStart; y <= treeHeight + 1; y++) {
        const radius = y <= treeHeight - 1 ? 2 : 1;
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dz = -radius; dz <= radius; dz++) {
                if (dx === 0 && dz === 0 && y <= treeHeight) continue;
                if (Math.abs(dx) + Math.abs(dz) > radius + 1) continue;
                blocks.push({ x: dx, y: y, z: dz, type: LEAVES });
            }
        }
    }

    return blocks;
}
