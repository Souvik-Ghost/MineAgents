/**
 * hud.js — HUD overlay controller.
 * Updates the DOM-based HUD with bot status, FPS, and position.
 */

export class HUD {
    constructor() {
        this.fpsEl = document.getElementById('hud-fps');
        this.posEl = document.getElementById('hud-pos');
        this.actionEl = document.getElementById('hud-action');
        this.reasonEl = document.getElementById('hud-reason');
        this.dotEl = document.getElementById('status-dot');

        this.fpsValues = [];
        this.updateCounter = 0;
    }

    update(camera, bot, deltaTime) {
        this.updateCounter++;
        if (this.updateCounter % 6 !== 0) return; // update ~10 times/sec

        // FPS (smoothed)
        const fps = deltaTime > 0 ? 1 / deltaTime : 0;
        this.fpsValues.push(fps);
        if (this.fpsValues.length > 30) this.fpsValues.shift();
        const avgFps = this.fpsValues.reduce((a, b) => a + b, 0) / this.fpsValues.length;
        this.fpsEl.textContent = Math.round(avgFps);

        // Position
        const p = camera.position;
        this.posEl.textContent = `${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`;

        // Bot status
        if (bot && bot.enabled) {
            this.actionEl.textContent = bot.currentAction;
            this.reasonEl.textContent = bot.currentReason;
            this.dotEl.className = '';
        } else {
            this.actionEl.textContent = 'player control';
            this.reasonEl.textContent = 'manual mode';
            this.dotEl.className = 'fallback';
        }
    }
}
