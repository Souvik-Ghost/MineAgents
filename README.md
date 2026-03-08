# 🤖 MineAgents

A lightweight browser-based voxel engine with an autonomous AI bot — built with **Three.js** and deployable to **Vercel**.

![MineAgents Start Screen](/screenshot/start_screen.png)

## ✨ Features

- **🌍 Procedural Voxel World** — Chunk-based terrain with simplex noise, caves, biomes (grass, dirt, stone, snow, sand)
- **🤖 Autonomous AI Bot** — Rule-based agent with cliff detection, obstacle avoidance, and exploration
- **🎮 Dual Mode** — Watch the bot play or take control yourself
- **📊 Live HUD** — Real-time FPS, position, bot action & reasoning
- **⚡ Ultra Lightweight** — Only **123KB gzipped**, runs at 60fps in the browser
- **🚀 Vercel Ready** — One-click deploy

![Bot Playing](/screenshot/bot_playing.png)

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build
```

## 🎮 Controls

| Key | Action |
|-----|--------|
| `W A S D` | Move forward / left / back / right |
| `Q / E` | Move up / down |
| `Mouse` | Look around (click to capture) |
| `ESC` | Release mouse |

## 🤖 Bot Behaviors

The autonomous bot uses a **sense → decide → act** loop:

| Behavior | Trigger |
|----------|---------|
| **Cliff avoidance** | No ground ahead → turns away |
| **Obstacle dodge** | Block in path → turns left/right |
| **Boundary clamping** | Near world edge → turns inward |
| **Stuck escape** | No movement detected → jumps/turns |
| **Exploration** | Clear path → moves forward, looks around |

## 🏗️ Architecture

```
src/
├── main.js        # Entry point, scene, game loop
├── world.js       # Chunk-based voxel world + meshing
├── terrain.js     # Procedural generation (simplex noise)
├── bot.js         # Autonomous AI agent
├── controls.js    # First-person pointer-lock controls
├── hud.js         # HUD overlay controller
└── style.css      # Glassmorphism UI styles
```

## 🚀 Deploy to Vercel

```bash
npx vercel
```

Or connect this repo to [Vercel](https://vercel.com) for automatic deploys on push.

## 📦 Tech Stack

- **[Three.js](https://threejs.org/)** — 3D rendering
- **[Vite](https://vitejs.dev/)** — Build tool
- **[simplex-noise](https://github.com/jwagner/simplex-noise.js)** — Terrain generation

## 📄 License

MIT