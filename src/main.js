/**
 * main.js — MineAgents entry point.
 * Initializes the Three.js scene, voxel world, camera, bot, and game loop.
 */

import * as THREE from 'three';
import { inject } from '@vercel/analytics';

// Initialize Vercel Analytics
inject();
import { VoxelWorld, CHUNK_SIZE, WORLD_W, WORLD_H, WORLD_D } from './world.js';
import { Controls } from './controls.js';
import { Bot } from './bot.js';
import { HUD } from './hud.js';

// ===== Scene Setup =====
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x93D4FF);

const scene = new THREE.Scene();

// Fog for depth
const fogColor = new THREE.Color(0x93D4FF);
scene.fog = new THREE.Fog(fogColor, 30, WORLD_W * CHUNK_SIZE * 0.7);

// Camera
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);

// ===== Lighting =====
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xfff4e0, 1.0);
sunLight.position.set(50, 100, 30);
scene.add(sunLight);

const hemisphereLight = new THREE.HemisphereLight(0x93D4FF, 0x556b2f, 0.3);
scene.add(hemisphereLight);

// ===== World Generation =====
console.time('World generation');
const world = new VoxelWorld(scene);
world.generate();
console.timeEnd('World generation');

// ===== Spawn Point =====
const centerX = (WORLD_W * CHUNK_SIZE) / 2;
const centerZ = (WORLD_D * CHUNK_SIZE) / 2;
const spawnY = world.getSpawnY(centerX, centerZ);
camera.position.set(centerX, spawnY, centerZ);

// ===== Controls & Bot =====
const controls = new Controls(camera, canvas, world);
const bot = new Bot(camera, world);
const hud = new HUD();

// ===== State Management =====
let isBotMode = true;

function startBotMode() {
    isBotMode = true;
    controls.disable();
    bot.enable();
    document.getElementById('btn-bot-toggle').classList.add('active');
    document.getElementById('btn-play').classList.remove('active');
    document.getElementById('btn-bot-toggle').textContent = '🤖 BOT ON';
    document.getElementById('btn-play').textContent = '🎮 PLAY';
    document.getElementById('crosshair').style.display = 'none';
}

function startPlayMode() {
    isBotMode = false;
    bot.disable();
    controls.enable();
    document.getElementById('btn-play').classList.add('active');
    document.getElementById('btn-bot-toggle').classList.remove('active');
    document.getElementById('btn-bot-toggle').textContent = '🤖 BOT OFF';
    document.getElementById('btn-play').textContent = '🎮 PLAYING';
}

// ===== Start Screen =====
const startScreen = document.getElementById('start-screen');
const hudEl = document.getElementById('hud');
hudEl.style.display = 'none';

document.getElementById('btn-start-bot').addEventListener('click', () => {
    startScreen.style.display = 'none';
    hudEl.style.display = 'block';
    startBotMode();
});

document.getElementById('btn-start-play').addEventListener('click', () => {
    startScreen.style.display = 'none';
    hudEl.style.display = 'block';
    startPlayMode();
});

// HUD toggle buttons
document.getElementById('btn-bot-toggle').addEventListener('click', () => {
    if (!isBotMode) startBotMode();
});
document.getElementById('btn-play').addEventListener('click', () => {
    if (isBotMode) startPlayMode();
});

// ===== Resize Handler =====
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// ===== Game Loop =====
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    if (isBotMode) {
        bot.update(delta);
    } else {
        controls.update(delta);
    }

    hud.update(camera, bot, delta);
    renderer.render(scene, camera);
}

animate();
