"""
AI Agent Module - Autonomous LLM-powered bot for the Minecraft Voxel Engine.

Uses Ollama (tinyllama) running in a Docker container to make decisions.
Operates on a sense -> think -> act loop in a background thread.
"""

import threading
import time
import json
import random as rng
import math

try:
    import requests
except ImportError:
    requests = None

import glm

from settings import *


class AIAgent:
    """Autonomous bot controlled by a local LLM via Ollama."""

    # Available actions the LLM can choose from
    VALID_ACTIONS = [
        'move_forward', 'move_back', 'move_left', 'move_right',
        'move_up', 'move_down', 'turn_left', 'turn_right',
        'look_up', 'look_down', 'place_block', 'remove_block', 'idle'
    ]

    def __init__(self, app):
        self.app = app
        self.llm_url = LLM_URL
        self.llm_model = LLM_MODEL
        self.decision_interval = LLM_DECISION_INTERVAL

        # Current state
        self.current_action = 'idle'
        self.last_llm_response = 'Initializing...'
        self.llm_status = 'connecting'
        self.action_duration = 0.0
        self.action_start_time = 0.0

        # Thread management
        self._thread = None
        self._running = False
        self._lock = threading.Lock()

        # Action history for the LLM context
        self._action_history = []
        self._max_history = 5

        # Exploration state
        self._explore_timer = 0
        self._explore_action = 'move_forward'
        self._stuck_counter = 0
        self._last_position = None

        # HUD font
        self._font = None

    def start(self):
        """Start the AI agent background thread."""
        self._running = True
        self._thread = threading.Thread(target=self._think_loop, daemon=True)
        self._thread.start()

    def stop(self):
        """Stop the AI agent."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=2.0)

    def _get_game_state(self):
        """Gather current game state for the LLM prompt."""
        player = self.app.player
        pos = player.position
        fwd = player.forward
        yaw_deg = math.degrees(player.yaw)
        pitch_deg = math.degrees(player.pitch)

        # Check what block is in front via raycasting
        voxel_handler = self.app.scene.world.voxel_handler
        has_block_ahead = voxel_handler.ray_cast()
        block_ahead = 'none'
        block_distance = 'far'
        if has_block_ahead and voxel_handler.voxel_id:
            block_names = {
                1: 'sand', 2: 'grass', 3: 'dirt', 4: 'stone',
                5: 'snow', 6: 'leaves', 7: 'wood'
            }
            block_ahead = block_names.get(voxel_handler.voxel_id, 'unknown')
            if voxel_handler.voxel_world_pos is not None:
                dist = glm.length(glm.vec3(voxel_handler.voxel_world_pos) - pos)
                if dist < 2:
                    block_distance = 'very_close'
                elif dist < 4:
                    block_distance = 'close'
                else:
                    block_distance = 'medium'

        # Check if player is stuck by comparing positions
        stuck = False
        if self._last_position is not None:
            delta = glm.length(pos - self._last_position)
            if delta < 0.01:
                self._stuck_counter += 1
                if self._stuck_counter > 3:
                    stuck = True
            else:
                self._stuck_counter = 0
        self._last_position = glm.vec3(pos)

        state = {
            'position': {'x': round(pos.x, 1), 'y': round(pos.y, 1), 'z': round(pos.z, 1)},
            'facing': {'yaw': round(yaw_deg, 1), 'pitch': round(pitch_deg, 1)},
            'forward_direction': {'x': round(fwd.x, 2), 'y': round(fwd.y, 2), 'z': round(fwd.z, 2)},
            'block_ahead': block_ahead,
            'block_distance': block_distance,
            'is_stuck': stuck,
            'recent_actions': self._action_history[-self._max_history:]
        }
        return state

    def _build_prompt(self, state):
        """Build a prompt for the LLM based on game state."""
        prompt = f"""You are an AI bot playing a Minecraft-like voxel game. You must explore the world.

Current state:
- Position: x={state['position']['x']}, y={state['position']['y']}, z={state['position']['z']}
- Facing: yaw={state['facing']['yaw']}°, pitch={state['facing']['pitch']}°
- Block ahead: {state['block_ahead']} ({state['block_distance']})
- Stuck: {state['is_stuck']}
- Recent actions: {', '.join(state['recent_actions']) if state['recent_actions'] else 'none'}

Available actions: {', '.join(self.VALID_ACTIONS)}

Rules:
- If a block is very_close ahead, turn_left or turn_right or remove_block to avoid it
- If stuck, try turn_left or turn_right then move_forward
- Explore by moving forward and occasionally turning
- Look around by using look_up and look_down sometimes
- You can place_block or remove_block to interact with the world

Respond with ONLY a JSON object: {{"action": "ACTION_NAME", "reason": "brief reason"}}"""
        return prompt

    def _query_llm(self, prompt):
        """Send a prompt to the Ollama API and get a response."""
        if requests is None:
            return None

        try:
            response = requests.post(
                f'{self.llm_url}/api/generate',
                json={
                    'model': self.llm_model,
                    'prompt': prompt,
                    'stream': False,
                    'options': {
                        'temperature': 0.7,
                        'num_predict': 80,
                    }
                },
                timeout=15
            )
            if response.status_code == 200:
                data = response.json()
                return data.get('response', '')
        except requests.exceptions.ConnectionError:
            self.llm_status = 'disconnected'
        except requests.exceptions.Timeout:
            self.llm_status = 'timeout'
        except Exception:
            self.llm_status = 'error'
        return None

    def _parse_action(self, llm_response):
        """Parse the LLM response to extract an action."""
        if not llm_response:
            return None, 'no response'

        # Try to extract JSON from the response
        text = llm_response.strip()

        # Find JSON object in response
        start = text.find('{')
        end = text.rfind('}')
        if start != -1 and end != -1:
            try:
                data = json.loads(text[start:end + 1])
                action = data.get('action', '').lower().strip()
                reason = data.get('reason', 'no reason given')
                if action in self.VALID_ACTIONS:
                    return action, reason
            except json.JSONDecodeError:
                pass

        # Fallback: try to find any valid action name in the text
        text_lower = text.lower()
        for action in self.VALID_ACTIONS:
            if action in text_lower:
                return action, 'parsed from text'

        return None, 'could not parse'

    def _fallback_exploration(self, state):
        """Simple rule-based exploration when LLM is unavailable."""
        # If stuck, turn
        if state['is_stuck']:
            action = rng.choice(['turn_left', 'turn_right'])
            return action, 'unsticking (fallback)'

        # If block very close ahead, avoid it
        if state['block_distance'] == 'very_close':
            action = rng.choice(['turn_left', 'turn_right', 'remove_block'])
            return action, 'avoiding obstacle (fallback)'

        # Random exploration
        roll = rng.random()
        if roll < 0.55:
            return 'move_forward', 'exploring forward (fallback)'
        elif roll < 0.70:
            return 'turn_left', 'turning left (fallback)'
        elif roll < 0.85:
            return 'turn_right', 'turning right (fallback)'
        elif roll < 0.90:
            return 'move_up', 'going up (fallback)'
        elif roll < 0.95:
            return 'look_up', 'looking around (fallback)'
        else:
            return 'place_block', 'building (fallback)'

    def _think_loop(self):
        """Background thread: repeatedly sense -> think -> act."""
        # Wait a moment for the game to initialize
        time.sleep(3.0)

        while self._running:
            try:
                state = self._get_game_state()
                prompt = self._build_prompt(state)
                llm_response = self._query_llm(prompt)

                if llm_response:
                    action, reason = self._parse_action(llm_response)
                    if action:
                        self.llm_status = 'active'
                    else:
                        action, reason = self._fallback_exploration(state)
                        self.llm_status = 'fallback (parse error)'
                else:
                    action, reason = self._fallback_exploration(state)
                    if self.llm_status not in ('disconnected', 'timeout', 'error'):
                        self.llm_status = 'fallback'

                with self._lock:
                    self.current_action = action
                    self.last_llm_response = reason
                    self.action_start_time = time.time()
                    self.action_duration = self.decision_interval
                    self._action_history.append(action)
                    if len(self._action_history) > self._max_history:
                        self._action_history.pop(0)

            except Exception as e:
                with self._lock:
                    self.current_action = 'move_forward'
                    self.last_llm_response = f'error: {str(e)[:40]}'
                    self.llm_status = 'error'

            time.sleep(self.decision_interval)

    def update(self):
        """Called every frame from the main game loop. Applies the current action."""
        import pygame as pg

        with self._lock:
            action = self.current_action
            reason = self.last_llm_response

        player = self.app.player
        vel = PLAYER_SPEED * self.app.delta_time
        rot_speed = PLAYER_ROT_SPEED * self.app.delta_time * 40

        if action == 'move_forward':
            player.move_forward(vel)
        elif action == 'move_back':
            player.move_back(vel)
        elif action == 'move_left':
            player.move_left(vel)
        elif action == 'move_right':
            player.move_right(vel)
        elif action == 'move_up':
            player.move_up(vel)
        elif action == 'move_down':
            player.move_down(vel)
        elif action == 'turn_left':
            player.rotate_yaw(-rot_speed)
        elif action == 'turn_right':
            player.rotate_yaw(rot_speed)
        elif action == 'look_up':
            player.rotate_pitch(-rot_speed * 0.5)
        elif action == 'look_down':
            player.rotate_pitch(rot_speed * 0.5)
        elif action == 'place_block':
            voxel_handler = self.app.scene.world.voxel_handler
            voxel_handler.interaction_mode = 1
            voxel_handler.set_voxel()
        elif action == 'remove_block':
            voxel_handler = self.app.scene.world.voxel_handler
            voxel_handler.interaction_mode = 0
            voxel_handler.set_voxel()

    def render_hud(self, surface):
        """Render bot status HUD overlay on the pygame surface."""
        import pygame as pg

        if self._font is None:
            try:
                self._font = pg.font.SysFont('Consolas', 18)
            except Exception:
                self._font = pg.font.Font(None, 20)

        with self._lock:
            action = self.current_action
            reason = self.last_llm_response
            status = self.llm_status

        player = self.app.player
        pos = player.position

        # Status color
        status_colors = {
            'active': (0, 255, 100),
            'fallback': (255, 200, 0),
            'fallback (parse error)': (255, 150, 0),
            'connecting': (100, 150, 255),
            'disconnected': (255, 80, 80),
            'timeout': (255, 120, 60),
            'error': (255, 50, 50),
        }
        color = status_colors.get(status, (200, 200, 200))

        lines = [
            f'BOT STATUS: {status.upper()}',
            f'Action: {action}',
            f'Reason: {reason[:50]}',
            f'Pos: ({pos.x:.1f}, {pos.y:.1f}, {pos.z:.1f})',
        ]

        # Background panel
        panel_w = 420
        panel_h = len(lines) * 24 + 16
        panel_surface = pg.Surface((panel_w, panel_h), pg.SRCALPHA)
        panel_surface.fill((0, 0, 0, 160))
        surface.blit(panel_surface, (10, 10))

        # Render text
        for i, line in enumerate(lines):
            text_color = color if i == 0 else (220, 220, 220)
            text = self._font.render(line, True, text_color)
            surface.blit(text, (18, 18 + i * 24))

        # Colored indicator dot
        pg.draw.circle(surface, color, (panel_w - 10, 26), 6)
