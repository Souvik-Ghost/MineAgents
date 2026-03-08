/**
 * world.js — Chunk-based voxel world.
 * Manages chunk creation, voxel storage, and mesh generation.
 */

import * as THREE from 'three';
import { getVoxelType, getTreeAt } from './terrain.js';

// Block types
export const AIR = 0;
export const SAND = 1;
export const GRASS = 2;
export const DIRT = 3;
export const STONE = 4;
export const SNOW = 5;
export const LEAVES = 6;
export const WOOD = 7;

// World config
export const CHUNK_SIZE = 16;
export const WORLD_W = 6;   // chunks in X
export const WORLD_H = 2;   // chunks in Y
export const WORLD_D = 6;   // chunks in Z

// Block colors
const BLOCK_COLORS = {
    [SAND]: new THREE.Color(0xd4b896),
    [GRASS]: new THREE.Color(0x5a9e3e),
    [DIRT]: new THREE.Color(0x8b6a3e),
    [STONE]: new THREE.Color(0x7a7a7a),
    [SNOW]: new THREE.Color(0xe8e8f0),
    [LEAVES]: new THREE.Color(0x3d8b2f),
    [WOOD]: new THREE.Color(0x6b4226),
};

// Face definitions: [normal, u-axis, v-axis, offsets]
const FACES = [
    { dir: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },  // +X
    { dir: [-1, 0, 0], corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },  // -X
    { dir: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },  // +Y (top)
    { dir: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },  // -Y
    { dir: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },  // +Z
    { dir: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },  // -Z
];

/**
 * A single chunk of voxels.
 */
class Chunk {
    constructor(cx, cy, cz) {
        this.cx = cx;
        this.cy = cy;
        this.cz = cz;
        this.voxels = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE);
        this.mesh = null;
    }

    getIndex(x, y, z) {
        return x + CHUNK_SIZE * z + CHUNK_SIZE * CHUNK_SIZE * y;
    }

    getVoxel(x, y, z) {
        if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) {
            return 0;
        }
        return this.voxels[this.getIndex(x, y, z)];
    }

    setVoxel(x, y, z, type) {
        if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) return;
        this.voxels[this.getIndex(x, y, z)] = type;
    }

    /**
     * Generate voxels for this chunk using terrain generator.
     */
    generate() {
        const ox = this.cx * CHUNK_SIZE;
        const oy = this.cy * CHUNK_SIZE;
        const oz = this.cz * CHUNK_SIZE;

        for (let x = 0; x < CHUNK_SIZE; x++) {
            for (let z = 0; z < CHUNK_SIZE; z++) {
                for (let y = 0; y < CHUNK_SIZE; y++) {
                    const wx = ox + x;
                    const wy = oy + y;
                    const wz = oz + z;
                    this.voxels[this.getIndex(x, y, z)] = getVoxelType(wx, wy, wz);
                }
            }
        }
    }

    /**
     * Build a Three.js mesh from the voxel data using greedy-ish face culling.
     */
    buildMesh(worldGetVoxel) {
        const positions = [];
        const normals = [];
        const colors = [];
        const indices = [];

        const ox = this.cx * CHUNK_SIZE;
        const oy = this.cy * CHUNK_SIZE;
        const oz = this.cz * CHUNK_SIZE;

        let vertexCount = 0;

        for (let x = 0; x < CHUNK_SIZE; x++) {
            for (let y = 0; y < CHUNK_SIZE; y++) {
                for (let z = 0; z < CHUNK_SIZE; z++) {
                    const voxel = this.voxels[this.getIndex(x, y, z)];
                    if (voxel === AIR) continue;

                    const color = BLOCK_COLORS[voxel] || new THREE.Color(0xff00ff);

                    for (const face of FACES) {
                        const nx = x + face.dir[0];
                        const ny = y + face.dir[1];
                        const nz = z + face.dir[2];

                        // Check if neighbor is air (should render face)
                        let neighbor;
                        if (nx >= 0 && nx < CHUNK_SIZE && ny >= 0 && ny < CHUNK_SIZE && nz >= 0 && nz < CHUNK_SIZE) {
                            neighbor = this.voxels[this.getIndex(nx, ny, nz)];
                        } else {
                            neighbor = worldGetVoxel(ox + nx, oy + ny, oz + nz);
                        }

                        if (neighbor !== AIR) continue;

                        // Add brightness variation based on face direction
                        let brightness = 1.0;
                        if (face.dir[1] === 1) brightness = 1.0;       // top: full bright
                        else if (face.dir[1] === -1) brightness = 0.5;  // bottom: dark
                        else if (face.dir[0] !== 0) brightness = 0.7;   // sides X
                        else brightness = 0.8;                            // sides Z

                        // Slight color variation for grass tops
                        const faceColor = color.clone();
                        if (voxel === GRASS && face.dir[1] === 1) {
                            faceColor.setHex(0x6ab844);
                        }
                        faceColor.multiplyScalar(brightness);

                        // Add 4 vertices for this face
                        for (const corner of face.corners) {
                            positions.push(
                                ox + x + corner[0],
                                oy + y + corner[1],
                                oz + z + corner[2]
                            );
                            normals.push(face.dir[0], face.dir[1], face.dir[2]);
                            colors.push(faceColor.r, faceColor.g, faceColor.b);
                        }

                        // Two triangles per face
                        indices.push(
                            vertexCount, vertexCount + 1, vertexCount + 2,
                            vertexCount, vertexCount + 2, vertexCount + 3
                        );
                        vertexCount += 4;
                    }
                }
            }
        }

        if (positions.length === 0) return null;

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.setIndex(indices);

        const material = new THREE.MeshLambertMaterial({
            vertexColors: true,
            side: THREE.FrontSide,
        });

        this.mesh = new THREE.Mesh(geometry, material);
        return this.mesh;
    }
}

/**
 * VoxelWorld — Manages all chunks.
 */
export class VoxelWorld {
    constructor(scene) {
        this.scene = scene;
        this.chunks = new Map();
        this.group = new THREE.Group();
        scene.add(this.group);
    }

    getChunkKey(cx, cy, cz) {
        return `${cx},${cy},${cz}`;
    }

    /**
     * Generate all chunks.
     */
    generate() {
        // First pass: generate voxel data
        for (let cx = 0; cx < WORLD_W; cx++) {
            for (let cy = 0; cy < WORLD_H; cy++) {
                for (let cz = 0; cz < WORLD_D; cz++) {
                    const chunk = new Chunk(cx, cy, cz);
                    chunk.generate();
                    this.chunks.set(this.getChunkKey(cx, cy, cz), chunk);
                }
            }
        }

        // Second pass: build meshes (needs neighbor data)
        for (const chunk of this.chunks.values()) {
            const mesh = chunk.buildMesh((wx, wy, wz) => this.getVoxel(wx, wy, wz));
            if (mesh) {
                this.group.add(mesh);
            }
        }
    }

    /**
     * Get voxel type at world coordinates.
     */
    getVoxel(wx, wy, wz) {
        const cx = Math.floor(wx / CHUNK_SIZE);
        const cy = Math.floor(wy / CHUNK_SIZE);
        const cz = Math.floor(wz / CHUNK_SIZE);
        const chunk = this.chunks.get(this.getChunkKey(cx, cy, cz));
        if (!chunk) return AIR;

        const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const ly = ((wy % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        return chunk.getVoxel(lx, ly, lz);
    }

    /**
     * Check if a world position is solid (non-air).
     */
    isSolid(wx, wy, wz) {
        return this.getVoxel(Math.floor(wx), Math.floor(wy), Math.floor(wz)) !== AIR;
    }

    /**
     * Get the spawn Y coordinate at (x, z).
     */
    getSpawnY(x, z) {
        const ix = Math.floor(x);
        const iz = Math.floor(z);
        for (let y = WORLD_H * CHUNK_SIZE; y >= 0; y--) {
            if (this.getVoxel(ix, y, iz) !== AIR) {
                return y + 2;
            }
        }
        return WORLD_H * CHUNK_SIZE;
    }
}
