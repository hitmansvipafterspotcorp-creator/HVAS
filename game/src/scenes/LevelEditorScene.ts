import Phaser from 'phaser';
import { SCENE, GAME_WIDTH, GAME_HEIGHT, ASSET_BASE } from '../config';
import { AudioSystem } from '../systems/AudioSystem';

// ── LevelEditorScene ────────────────────────────────────────────────────────
// In-engine level editor. Left-click places the selected item type; right-click
// or Delete removes the last placed item. Tab cycles the tool. E exports the
// current layout as a JSON blob (copy from the browser console / overlay). The
// exported JSON is drop-compatible with both VenueData and StageData schemas.
//
// Controls:
//   Tab         cycle tool (spawn / npc / collider / trigger / prop)
//   Click       place item at cursor
//   Right-click delete item under cursor
//   E           export JSON to screen overlay + console
//   G           toggle grid snap (16 px)
//   ESC         back to main menu

type Tool = 'spawn' | 'npc' | 'collider' | 'trigger' | 'prop';
const TOOLS: Tool[] = ['spawn', 'npc', 'collider', 'trigger', 'prop'];

type PlacedItem = {
  tool: Tool;
  x: number;
  y: number;
  w?: number;
  h?: number;
  label?: string;
  gfx: Phaser.GameObjects.GameObject;
};

const TOOL_COLORS: Record<Tool, number> = {
  spawn: 0x00ff88,
  npc: 0xffd700,
  collider: 0xff4444,
  trigger: 0x44aaff,
  prop: 0xff8c00,
};

const GRID = 16;

export class LevelEditorScene extends Phaser.Scene {
  private tool: Tool = 'spawn';
  private toolIndex = 0;
  private items: PlacedItem[] = [];
  private gridSnap = true;
  private dragStart: { x: number; y: number } | null = null;
  private previewRect?: Phaser.GameObjects.Rectangle;

  // UI text refs.
  private toolLabel!: Phaser.GameObjects.Text;
  private coordLabel!: Phaser.GameObjects.Text;
  private overlay?: Phaser.GameObjects.Text;

  constructor() {
    super(SCENE.LevelEditor);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x12101a);
    AudioSystem.playForScene(this, 'StageSelect');

    // Grid.
    const grid = this.add.graphics().setDepth(-100);
    grid.lineStyle(1, 0x2a2040, 0.4);
    for (let x = 0; x < GAME_WIDTH; x += GRID) grid.lineBetween(x, 0, x, GAME_HEIGHT);
    for (let y = 0; y < GAME_HEIGHT; y += GRID) grid.lineBetween(0, y, GAME_WIDTH, y);

    // Backdrop probe — reuse same key pattern as StageLoader/VenueScene.
    this.tryLoadBackdrop('venues/cafe8fifty_exterior.png', 'editor_bg');

    // Info bar.
    this.add
      .rectangle(0, GAME_HEIGHT - 28, GAME_WIDTH, 28, 0x0a0814, 0.9)
      .setOrigin(0, 0)
      .setDepth(90000);

    this.toolLabel = this.add
      .text(12, GAME_HEIGHT - 14, '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffd700',
      })
      .setOrigin(0, 0.5)
      .setDepth(90001);

    this.coordLabel = this.add
      .text(GAME_WIDTH - 12, GAME_HEIGHT - 14, '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#8877aa',
      })
      .setOrigin(1, 0.5)
      .setDepth(90001);

    this.add
      .text(GAME_WIDTH / 2, 10, 'Tab: tool • Click: place • RClick/Del: undo • E: export • G: grid • ESC: menu', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#554466',
      })
      .setOrigin(0.5, 0)
      .setDepth(90001);

    this.updateToolLabel();

    // Input.
    const kb = this.input.keyboard!;
    kb.on('keydown-TAB', (e: KeyboardEvent) => { e.preventDefault(); this.cycleTool(); });
    kb.on('keydown-E', () => this.exportJSON());
    kb.on('keydown-G', () => { this.gridSnap = !this.gridSnap; this.updateToolLabel(); });
    kb.on('keydown-ESC', () => this.scene.start(SCENE.MainMenu));
    kb.on('keydown-DELETE', () => this.undoLast());
    kb.on('keydown-BACKSPACE', () => this.undoLast());

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const [sx, sy] = this.snap(p.x, p.y);
      this.coordLabel.setText(`${sx}, ${sy}`);
    });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) { this.undoLast(); return; }
      const [sx, sy] = this.snap(p.x, p.y);
      if (this.tool === 'collider' || this.tool === 'trigger') {
        this.dragStart = { x: sx, y: sy };
        this.previewRect = this.add
          .rectangle(sx, sy, 2, 2, TOOL_COLORS[this.tool], 0.35)
          .setOrigin(0, 0)
          .setDepth(70000);
      } else {
        this.placeItem(sx, sy);
      }
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.dragStart || !this.previewRect) return;
      const [sx, sy] = this.snap(p.x, p.y);
      const w = Math.max(GRID, sx - this.dragStart.x);
      const h = Math.max(GRID, sy - this.dragStart.y);
      this.previewRect.setSize(w, h);
    });

    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (!this.dragStart || p.rightButtonDown()) { this.dragStart = null; return; }
      const [sx, sy] = this.snap(p.x, p.y);
      const w = Math.max(GRID, sx - this.dragStart.x);
      const h = Math.max(GRID, sy - this.dragStart.y);
      this.previewRect?.destroy();
      this.previewRect = undefined;
      this.placeRect(this.dragStart.x, this.dragStart.y, w, h);
      this.dragStart = null;
    });
  }

  private snap(x: number, y: number): [number, number] {
    if (!this.gridSnap) return [Math.round(x), Math.round(y)];
    return [Math.round(x / GRID) * GRID, Math.round(y / GRID) * GRID];
  }

  private cycleTool(): void {
    this.toolIndex = (this.toolIndex + 1) % TOOLS.length;
    this.tool = TOOLS[this.toolIndex];
    this.updateToolLabel();
    this.overlay?.destroy();
    this.overlay = undefined;
  }

  private updateToolLabel(): void {
    const snap = this.gridSnap ? 'GRID' : 'FREE';
    this.toolLabel.setText(
      `TOOL: ${this.tool.toUpperCase()}   ${snap}   items: ${this.items.length}`,
    );
    this.toolLabel.setColor(`#${TOOL_COLORS[this.tool].toString(16).padStart(6, '0')}`);
  }

  private placeItem(x: number, y: number): void {
    const color = TOOL_COLORS[this.tool];
    let gfx: Phaser.GameObjects.GameObject;
    if (this.tool === 'spawn') {
      gfx = this.add
        .triangle(x, y, 0, 16, 8, 0, 16, 16, color, 0.9)
        .setDepth(1000);
    } else {
      gfx = this.add
        .circle(x, y, 10, color, 0.8)
        .setDepth(1000);
    }
    this.add
      .text(x + 14, y, this.tool, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#ffffff',
      })
      .setDepth(1001);
    this.items.push({ tool: this.tool, x, y, gfx });
    this.updateToolLabel();
  }

  private placeRect(x: number, y: number, w: number, h: number): void {
    const color = TOOL_COLORS[this.tool];
    const label = this.tool === 'collider' ? 'wall' : 'door';
    const gfx = this.add
      .rectangle(x, y, w, h, color, 0.3)
      .setOrigin(0, 0)
      .setStrokeStyle(1, color)
      .setDepth(1000);
    this.add
      .text(x + 4, y + 4, `${label} ${w}×${h}`, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#ffffff',
      })
      .setDepth(1001);
    this.items.push({ tool: this.tool, x, y, w, h, label, gfx });
    this.updateToolLabel();
  }

  private undoLast(): void {
    const last = this.items.pop();
    if (!last) return;
    last.gfx.destroy();
    this.updateToolLabel();
  }

  private exportJSON(): void {
    const spawn = this.items.find((i) => i.tool === 'spawn');
    const npcs = this.items
      .filter((i) => i.tool === 'npc')
      .map((i, idx) => ({
        id: `npc_${idx}`,
        charId: 2,
        x: i.x,
        y: i.y,
        facing: 's',
        name: `NPC ${idx + 1}`,
        lines: ['...'],
      }));
    const colliders = this.items
      .filter((i) => i.tool === 'collider')
      .map((i) => ({ x: i.x, y: i.y, w: i.w ?? GRID, h: i.h ?? GRID, label: i.label }));
    const triggers = this.items
      .filter((i) => i.tool === 'trigger')
      .map((i, idx) => ({
        id: `trigger_${idx}`,
        x: i.x,
        y: i.y,
        w: i.w ?? GRID,
        h: i.h ?? GRID,
        type: 'scene',
        target: 'MainMenu',
        label: `Door ${idx + 1}`,
      }));
    const props = this.items
      .filter((i) => i.tool === 'prop')
      .map((i) => ({ type: 'trashcan', x: i.x, feetY: i.y, drop: 'none' }));

    const out = {
      id: 'new_venue',
      name: 'New Venue',
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      backdrop: 'venues/your_backdrop.png',
      spawn: spawn ? { x: spawn.x, y: spawn.y } : { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 },
      walkable: { x: 60, y: 120, w: GAME_WIDTH - 120, h: GAME_HEIGHT - 200 },
      colliders,
      npcs,
      triggers,
      props,
    };

    const json = JSON.stringify(out, null, 2);
    console.log('[HVAS LevelEditor] Exported JSON:\n', json);

    this.overlay?.destroy();
    this.overlay = this.add
      .text(GAME_WIDTH / 2, 40, '✓ JSON exported to console (F12)', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#00ff88',
        backgroundColor: '#0a0814',
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(90002);

    this.time.delayedCall(3000, () => {
      this.overlay?.destroy();
      this.overlay = undefined;
    });
  }

  private tryLoadBackdrop(path: string, key: string): void {
    if (this.textures.exists(key)) {
      this.add.image(0, 0, key).setOrigin(0, 0).setDepth(-200)
        .setDisplaySize(GAME_WIDTH, GAME_HEIGHT).setAlpha(0.35);
      return;
    }
    const probe = new Image();
    probe.onload = () => {
      if (!this.scene.isActive()) return;
      if (!this.textures.exists(key)) this.textures.addImage(key, probe);
      this.add.image(0, 0, key).setOrigin(0, 0).setDepth(-200)
        .setDisplaySize(GAME_WIDTH, GAME_HEIGHT).setAlpha(0.35);
    };
    probe.onerror = () => {};
    probe.src = `${ASSET_BASE}${path}`;
  }
}
