import Phaser from 'phaser';
import { SCENE, COLORS, ASSET_BASE } from '../config';
import { InputSystem } from '../systems/InputSystem';
import { DialogueSystem } from '../systems/DialogueSystem';
import { InteractionSystem } from '../systems/InteractionSystem';
import { AnimationSystem } from '../systems/AnimationSystem';
import { PLAYER_ID } from '../data/roster';
import type { VenueData, Facing } from '../data/venueTypes';
import venueData from '../data/venues/hitmans_vip_inside.json';

// ── VenueScene ──────────────────────────────────────────────────────────────
// Pokémon-style top-down interior. Loaded from JSON (npcs + triggers +
// colliders), so new venues are pure data. Player walks 8-way using the
// character's td_ animations; talks to NPCs and uses doors via the interact
// button. A door trigger routes to the brawler (street) or back to menu.
const VENUE: VenueData = venueData as VenueData;
const SPEED = 150;

export class VenueScene extends Phaser.Scene {
  private controls!: InputSystem;
  private dialogue!: DialogueSystem;
  private interactions!: InteractionSystem;
  private player!: Phaser.GameObjects.Sprite;
  private shadow!: Phaser.GameObjects.Ellipse;
  private px = 0;
  private py = 0;
  private facing: Facing = 's';
  private lastAnim = '';

  constructor() {
    super(SCENE.Venue);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x120c1c);

    // Floor + walkable region (graybox; a real venue backdrop drops in here).
    const wk = VENUE.walkable;
    this.add
      .rectangle(wk.x, wk.y, wk.w, wk.h, COLORS.floor)
      .setOrigin(0, 0)
      .setStrokeStyle(2, COLORS.floorLine);
    this.add
      .text(VENUE.width / 2, 90, VENUE.name, {
        fontFamily: 'Arial Black, sans-serif',
        fontSize: '26px',
        color: '#ffd700',
      })
      .setOrigin(0.5);

    // Colliders (bar / booth / stage) drawn as labeled blocks.
    for (const c of VENUE.colliders) {
      this.add
        .rectangle(c.x, c.y, c.w, c.h, 0x241a36)
        .setOrigin(0, 0)
        .setStrokeStyle(1, 0x4a3a6a);
      if (c.label) {
        this.add
          .text(c.x + c.w / 2, c.y + c.h / 2, c.label.toUpperCase(), {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#9988bb',
          })
          .setOrigin(0.5);
      }
    }

    this.controls = new InputSystem(this);
    this.dialogue = new DialogueSystem(this);
    this.interactions = new InteractionSystem(this);

    // NPCs.
    for (const npc of VENUE.npcs) {
      const shadow = this.add
        .ellipse(npc.x, npc.y, 40, 14, 0x000000, 0.3)
        .setDepth(npc.y - 1000);
      const idleKey = AnimationSystem.animKey(npc.charId, `td_idle_${npc.facing}`);
      const sprite = this.add
        .sprite(npc.x, npc.y, '__DEFAULT')
        .setOrigin(0.5, 1)
        .setDepth(npc.y);
      sprite.setScale(78 / 181);
      if (this.anims.exists(idleKey)) sprite.play(idleKey);
      else this.fallbackBlock(npc.x, npc.y, COLORS.enemy);
      shadow.setData('npc', npc.id);

      this.add
        .text(npc.x, npc.y - 84, npc.name, {
          fontFamily: 'Arial, sans-serif',
          fontSize: '12px',
          color: '#ffd700',
        })
        .setOrigin(0.5)
        .setDepth(npc.y);

      this.interactions.register({
        x: npc.x,
        y: npc.y,
        radius: 70,
        label: npc.name,
        activate: () => this.dialogue.open(npc.name, npc.lines),
      });
    }

    // Triggers (doors / talk hotspots).
    for (const t of VENUE.triggers) {
      this.add
        .rectangle(t.x, t.y, t.w, t.h, 0x332211, 0.6)
        .setOrigin(0, 0)
        .setStrokeStyle(1, 0xffd700, 0.5);
      this.add
        .text(t.x + t.w / 2, t.y + t.h / 2, t.label, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#ffcc66',
        })
        .setOrigin(0.5);
      this.interactions.register({
        x: t.x + t.w / 2,
        y: t.y + t.h / 2,
        radius: 60,
        label: t.label,
        activate: () => {
          if (t.type === 'scene' && t.target) this.scene.start(t.target);
          else if (t.type === 'talk') this.dialogue.open(t.label, t.lines ?? []);
        },
      });
    }

    // Player.
    this.px = VENUE.spawn.x;
    this.py = VENUE.spawn.y;
    this.shadow = this.add.ellipse(this.px, this.py, 40, 14, 0x000000, 0.35);
    this.player = this.add
      .sprite(this.px, this.py, '__DEFAULT')
      .setOrigin(0.5, 1);
    this.player.setScale(82 / 181);
    this.playAnim('td_idle_s');

    this.add
      .text(VENUE.width - 12, 10, 'WASD move • E interact • ESC menu', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#8877aa',
      })
      .setOrigin(1, 0);
    this.input.keyboard!.on('keydown-ESC', () => this.scene.start(SCENE.MainMenu));

    // If a real backdrop image exists, layer it under everything.
    this.tryLoadBackdrop();
  }

  private fallbackBlock(x: number, y: number, color: number): void {
    this.add
      .rectangle(x, y - 30, 34, 60, color)
      .setOrigin(0.5, 1)
      .setDepth(y);
  }

  // Optional venue backdrop. Uses the explicit `backdrop` path from the venue
  // JSON — probed via native Image so a missing file never spams the loader.
  private tryLoadBackdrop(): void {
    if (!VENUE.backdrop) return;
    const key = `venue_bg_${VENUE.id}`;
    if (this.textures.exists(key)) {
      this.add.image(0, 0, key).setOrigin(0, 0).setDepth(-5000)
        .setDisplaySize(VENUE.width, VENUE.height);
      return;
    }
    const probe = new Image();
    probe.onload = () => {
      if (!this.scene.isActive()) return;
      if (!this.textures.exists(key)) this.textures.addImage(key, probe);
      this.add.image(0, 0, key).setOrigin(0, 0).setDepth(-5000)
        .setDisplaySize(VENUE.width, VENUE.height);
    };
    probe.onerror = () => {}; // silent: graybox stays
    probe.src = `${ASSET_BASE}${VENUE.backdrop}`;
  }

  private playAnim(name: string): void {
    const key = AnimationSystem.animKey(PLAYER_ID, name);
    if (!this.anims.exists(key)) return;
    if (this.lastAnim === key) return;
    this.lastAnim = key;
    this.player.play(key, true);
  }

  override update(_t: number, delta: number): void {
    const b = this.controls.read();

    // Dialogue mode locks movement; interact advances/closes it.
    if (this.dialogue.active) {
      if (b.interact) this.dialogue.advance();
      this.interactions.update(-9999, -9999); // hide prompt while talking
      return;
    }

    const dt = delta / 1000;
    let vx = 0;
    let vy = 0;
    if (b.left) vx -= 1;
    if (b.right) vx += 1;
    if (b.up) vy -= 1;
    if (b.down) vy += 1;

    // Facing priority: vertical sets n/s, horizontal sets e/w.
    if (vy < 0) this.facing = 'n';
    else if (vy > 0) this.facing = 's';
    if (vx < 0) this.facing = 'w';
    else if (vx > 0) this.facing = 'e';

    const moving = vx !== 0 || vy !== 0;
    if (moving) {
      const len = Math.hypot(vx, vy) || 1;
      this.px += (vx / len) * SPEED * dt;
      this.py += (vy / len) * SPEED * dt;
      this.clampToVenue();
    }

    this.playAnim(`td_${moving ? 'walk' : 'idle'}_${this.facing}`);
    this.player.setPosition(this.px, this.py).setDepth(this.py);
    this.shadow.setPosition(this.px, this.py).setDepth(this.py - 1);

    this.interactions.update(this.px, this.py);
    if (b.interact) this.interactions.tryActivate();
  }

  // Keep the player in the walkable box and out of solid colliders.
  private clampToVenue(): void {
    const wk = VENUE.walkable;
    this.px = Phaser.Math.Clamp(this.px, wk.x + 10, wk.x + wk.w - 10);
    this.py = Phaser.Math.Clamp(this.py, wk.y + 30, wk.y + wk.h - 6);
    for (const c of VENUE.colliders) {
      if (
        this.px > c.x - 6 &&
        this.px < c.x + c.w + 6 &&
        this.py > c.y + 20 &&
        this.py < c.y + c.h + 14
      ) {
        // Push the player below the collider (simple wall stop).
        this.py = c.y + c.h + 14;
      }
    }
  }
}
