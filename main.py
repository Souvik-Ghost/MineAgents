from settings import *
import moderngl as mgl
import pygame as pg
import sys
from shader_program import ShaderProgram
from scene import Scene
from player import Player
from textures import Textures


class VoxelEngine:
    def __init__(self):
        pg.init()
        pg.display.gl_set_attribute(pg.GL_CONTEXT_MAJOR_VERSION, MAJOR_VER)
        pg.display.gl_set_attribute(pg.GL_CONTEXT_MINOR_VERSION, MINOR_VER)
        pg.display.gl_set_attribute(pg.GL_CONTEXT_PROFILE_MASK, pg.GL_CONTEXT_PROFILE_CORE)
        pg.display.gl_set_attribute(pg.GL_DEPTH_SIZE, DEPTH_SIZE)
        pg.display.gl_set_attribute(pg.GL_MULTISAMPLESAMPLES, NUM_SAMPLES)

        pg.display.set_mode(WIN_RES, flags=pg.OPENGL | pg.DOUBLEBUF)
        self.ctx = mgl.create_context()

        self.ctx.enable(flags=mgl.DEPTH_TEST | mgl.CULL_FACE | mgl.BLEND)
        self.ctx.gc_mode = 'auto'

        self.clock = pg.time.Clock()
        self.delta_time = 0
        self.time = 0

        # Check for --bot flag
        self.bot_mode = '--bot' in sys.argv
        if self.bot_mode:
            import settings as s
            s.BOT_MODE = True
            pg.display.set_caption('MineAgents - BOT MODE')
            pg.event.set_grab(False)
            pg.mouse.set_visible(True)
        else:
            pg.event.set_grab(True)
            pg.mouse.set_visible(False)

        self.is_running = True
        self.on_init()

    def on_init(self):
        self.textures = Textures(self)
        self.player = Player(self)
        if self.bot_mode:
            self.player.bot_mode = True
        self.shader_program = ShaderProgram(self)
        self.scene = Scene(self)

        # Initialize AI agent if in bot mode
        self.ai_agent = None
        if self.bot_mode:
            from ai_agent import AIAgent
            self.ai_agent = AIAgent(self)
            self.ai_agent.start()
            # Initialize pygame font for HUD
            pg.font.init()

    def update(self):
        self.player.update()
        self.shader_program.update()
        self.scene.update()

        # Update AI agent
        if self.ai_agent:
            self.ai_agent.update()

        self.delta_time = self.clock.tick()
        self.time = pg.time.get_ticks() * 0.001

        if self.bot_mode:
            status = self.ai_agent.llm_status if self.ai_agent else 'N/A'
            action = self.ai_agent.current_action if self.ai_agent else 'N/A'
            pg.display.set_caption(
                f'MineAgents BOT | FPS: {self.clock.get_fps():.0f} | {action} | LLM: {status}'
            )
        else:
            pg.display.set_caption(f'{self.clock.get_fps() :.0f}')

    def render(self):
        self.ctx.clear(color=BG_COLOR)
        self.scene.render()
        pg.display.flip()

        # Render HUD overlay on top (uses pygame 2D blit after GL flip)
        if self.ai_agent:
            hud_surface = pg.display.get_surface()
            self.ai_agent.render_hud(hud_surface)
            pg.display.flip()

    def handle_events(self):
        for event in pg.event.get():
            if event.type == pg.QUIT or (event.type == pg.KEYDOWN and event.key == pg.K_ESCAPE):
                self.is_running = False
            self.player.handle_event(event=event)

    def run(self):
        while self.is_running:
            self.handle_events()
            self.update()
            self.render()

        # Clean up AI agent
        if self.ai_agent:
            self.ai_agent.stop()

        pg.quit()
        sys.exit()


if __name__ == '__main__':
    app = VoxelEngine()
    app.run()
