import Phaser from 'phaser';
import { SCENE, COLORS, ASSET_BASE } from '../config';
import { InputSystem } from '../systems/InputSystem';
import { DialogueSystem } from '../systems/DialogueSystem';
import { InteractionSystem } from '../systems/InteractionSystem';
import { AnimationSystem } from '../systems/AnimationSystem';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { PLAYER_ID } from '../data/roster';
import type { VenueData, Facing } from '../data/venueTypes';

// ── Venue JSON registry ──────────────────────────────────────────────────────
import hitmansVip   from '../data/venues/hitmans_vip_inside.json';
import dukesInside  from '../data/venues/dukes_inside.json';
import kcsInside    from '../data/venues/kcs_inside.json';
import outtaInside  from '../data/venues/outta_inside.json';
import qhfInside    from '../data/venues/qhf_inside.json';
import socialGaines from '../data/venues/social_gaines_inside.json';
import successInside from '../data/venues/success_inside.json';
import tallyPubHall from '../data/venues/tally_public_hall_inside.json';
import tallySammys  from '../data/venues/tally_sammys_inside.json';
import tally13rave  from '../data/venues/tally_13rave_inside.json';
import tallyDen     from '../data/venues/tally_den_inside.json';
import tallyItus    from '../data/venues/tally_itus_inside.json';

const VENUE_REGISTRY: Record<string, VenueData> = {
  hitmans_vip_inside:       hitmansVip    as VenueData,
  dukes_inside:             dukesInside   as VenueData,
  kcs_inside:               kcsInside     as VenueData,
  outta_inside:             outtaInside   as VenueData,
  qhf_inside:               qhfInside     as VenueData,
  social_gaines_inside:     socialGaines  as VenueData,
  success_inside:           successInside as VenueData,
  tally_public_hall_inside: tallyPubHall  as VenueData,
  tally_sammys_inside:      tallySammys   as VenueData,
  tally_13rave_inside:      tally13rave   as VenueData,
  tally_den_inside:         tallyDen      as VenueData,
  tally_itus_inside:        tallyItus     as VenueData,
};

const DEFAULT_VENUE_ID = 'hitmans_vip_inside';
const SPEED = 150;

// ── VenueScene ──────────────────────────────────────────────────────────────
// Generic top-down interior. Accepts { venueId } in scene init data;
// falls back to hitmans_vip_inside if not provided or not found.
export class VenueScene extends Phaser.Scene {
  private venue!: VenueData;
  private controls!: InputSystem;
  private dialogue!: DialogueSystem;
  private interactions!: InteractionSystem;
  private player!: Phaser.GameObjects.Sprite;
  private shadow!: Phaser.GameObjects.Ellipse;
  private px = 0;
  private py = 0;
  private facing: Facing = 's';
  private lastAnim = '';
  private npcPositions: { x: number; y: number }[] = [];

  constructor() {
    super(SCENE.Venue);
  }

  create(data?: { venueId?: string }): void {
    const venueId = data?.venueId ?? DEFAULT_VENUE_ID;
    this.venue = VENUE_REGISTRY[venueId] ?? VENUE_REGISTRY[DEFAULT_VENUE_ID];
    const VENUE = this.venue;

    this.cameras.main.setBackgroundColor(0x120c1c);

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
      this.add
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

      this.add
        .text(npc.x, npc.y - 84, npc.name, {
          fontFamily: 'Arial, sans-serif',
          fontSize: '12px',
          color: '#ffd700',
        })
        .setOrigin(0.5)
        .setDepth(npc.y);

      this.npcPositions.push({ x: npc.x, y: npc.y });
      this.interactions.register({
        x: npc.x,
        y: npc.y,
        radius: 70,
        label: npc.name,
        activate: () => this.dialogue.open(npc.name, npc.lines),
      });
    }

    // Triggers (doors / hotspots).
    for (const t of VENUE.triggers) {
      const locked = t.requiresUnlock
        ? !ProgressionSystem.isVenueUnlocked(t.requiresUnlock as Parameters<typeof ProgressionSystem.isVenueUnlocked>[0])
        : false;

      const tintColor = locked ? 0x221111 : 0x332211;
      const strokeColor = locked ? 0x882222 : 0xffd700;
      this.add
        .rectangle(t.x, t.y, t.w, t.h, tintColor, 0.6)
        .setOrigin(0, 0)
        .setStrokeStyle(1, strokeColor, 0.5);
      this.add
        .text(t.x + t.w / 2, t.y + t.h / 2, locked ? `🔒 ${t.label}` : t.label, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: locked ? '#aa4444' : '#ffcc66',
        })
        .setOrigin(0.5);

      this.interactions.register({
        x: t.x + t.w / 2,
        y: t.y + t.h / 2,
        radius: 60,
        label: locked ? `${t.label} (Locked)` : t.label,
        activate: () => {
          if (locked) {
            this.dialogue.open('Locked', ['Clear the area outside to unlock this.']);
            return;
          }
          if (t.type === 'talk') {
            this.dialogue.open(t.label, t.lines ?? []);
            return;
          }
          if (t.target === 'Brawler' && t.targetStage) {
            this.loadStageAndGo(t.targetStage);
          } else if (t.target === 'Venue' && t.targetVenue) {
            this.scene.start(SCENE.Venue, { venueId: t.targetVenue });
          } else if (t.target === 'MainMenu') {
            this.scene.start(SCENE.VenueSelect);
          } else if (t.target) {
            this.scene.start(t.target as string);
          }
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
    this.input.keyboard!.on('keydown-ESC', () => this.scene.start(SCENE.VenueSelect));

    this.tryLoadBackdrop();
  }

  // Dynamically import the stage JSON so we never bundle unused stages.
  private async loadStageAndGo(stageId: string): Promise<void> {
    try {
      const mod = await import(`../data/stages/${stageId}.json`);
      this.scene.start(SCENE.Brawler, { stage: mod.default ?? mod });
    } catch {
      this.scene.start(SCENE.Brawler);
    }
  }

  private fallbackBlock(x: number, y: number, color: number): void {
    this.add
      .rectangle(x, y - 30, 34, 60, color)
      .setOrigin(0.5, 1)
      .setDepth(y);
  }

  private tryLoadBackdrop(): void {
    const VENUE = this.venue;
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
    probe.onerror = () => {};
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

    if (this.dialogue.active) {
      if (b.interact) this.dialogue.advance();
      this.interactions.update(-9999, -9999);
      return;
    }

    const dt = delta / 1000;
    let vx = 0;
    let vy = 0;
    if (b.left) vx -= 1;
    if (b.right) vx += 1;
    if (b.up) vy -= 1;
    if (b.down) vy += 1;

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

  private clampToVenue(): void {
    const wk = this.venue.walkable;
    this.px = Phaser.Math.Clamp(this.px, wk.x + 10, wk.x + wk.w - 10);
    this.py = Phaser.Math.Clamp(this.py, wk.y + 30, wk.y + wk.h - 6);
    for (const c of this.venue.colliders) {
      if (
        this.px > c.x - 6 &&
        this.px < c.x + c.w + 6 &&
        this.py > c.y + 20 &&
        this.py < c.y + c.h + 14
      ) {
        this.py = c.y + c.h + 14;
      }
    }

    const NPC_RADIUS = 28;
    for (const npc of this.npcPositions) {
      const dx = this.px - npc.x;
      const dy = this.py - npc.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < NPC_RADIUS && dist > 0) {
        const push = NPC_RADIUS - dist;
        this.px += (dx / dist) * push;
        this.py += (dy / dist) * push;
      }
    }
  }
}
