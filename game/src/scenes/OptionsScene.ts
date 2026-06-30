import Phaser from 'phaser';
import { SCENE, GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config';
import { UISystem, UI } from '../systems/UISystem';
import { AudioSystem } from '../systems/AudioSystem';

type OptionEntry = {
  label: string;
  key: string;           // AudioSystem key
  min: number;
  max: number;
  step: number;
  getValue: () => number;
  setValue: (v: number) => void;
};

const PANEL_W = 520;
const PANEL_H = 380;
const SLIDER_W = 260;
const SLIDER_H = 36;
const ROW_GAP = 50;
const ROW_Y0 = GAME_HEIGHT / 2 - 100;

// Simple volume store (persisted via localStorage so it survives scene restarts).
function getVol(key: string, def: number): number {
  const v = localStorage.getItem(`hvas_opt_${key}`);
  return v !== null ? Number(v) : def;
}
function setVol(key: string, v: number): void {
  localStorage.setItem(`hvas_opt_${key}`, String(v));
}

export class OptionsScene extends Phaser.Scene {
  private fills: Phaser.GameObjects.Rectangle[] = [];
  private labels: Phaser.GameObjects.Text[] = [];
  private entries: OptionEntry[] = [];
  private prevScene: string = SCENE.MainMenu;

  constructor() { super(SCENE.Options); }

  init(data?: { from?: string }): void {
    this.prevScene = data?.from ?? SCENE.MainMenu;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.bg);
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    // ── Dim backdrop ────────────────────────────────────────────────────
    this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.72);

    // ── Settings panel art ───────────────────────────────────────────────
    if (UISystem.ready(this) && this.textures.exists(UI.osxPanel)) {
      this.add.image(cx, cy, UI.osxPanel)
        .setOrigin(0.5).setDisplaySize(PANEL_W, PANEL_H).setDepth(1);
    } else {
      this.add.rectangle(cx, cy, PANEL_W, PANEL_H, 0x0a0614, 0.97)
        .setStrokeStyle(2, 0xffd700, 0.9);
    }

    // ── Title ────────────────────────────────────────────────────────────
    this.add.text(cx, cy - PANEL_H / 2 + 30, 'SETTINGS', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '22px', color: '#ffd700',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(10);

    // ── Option rows ───────────────────────────────────────────────────────
    this.entries = [
      {
        label: 'MASTER VOLUME',
        key: 'master',
        min: 0, max: 100, step: 5,
        getValue: () => getVol('master', 80),
        setValue: (v) => { setVol('master', v); AudioSystem.setMasterVolume(this, v / 100); },
      },
      {
        label: 'MUSIC VOLUME',
        key: 'music',
        min: 0, max: 100, step: 5,
        getValue: () => getVol('music', 70),
        setValue: (v) => { setVol('music', v); AudioSystem.setMusicVolume(this, v / 100); },
      },
      {
        label: 'SFX VOLUME',
        key: 'sfx',
        min: 0, max: 100, step: 5,
        getValue: () => getVol('sfx', 85),
        setValue: (v) => { setVol('sfx', v); AudioSystem.setSfxVolume(this, v / 100); },
      },
    ];

    this.fills = [];
    this.labels = [];

    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i];
      const y = ROW_Y0 + i * ROW_GAP;
      const leftX = cx - PANEL_W / 2 + 40;
      const sliderX = cx + 20;

      // Row background — use slider art if available
      if (UISystem.ready(this) && this.textures.exists(UI.osxSliderRow)) {
        this.add.image(sliderX + SLIDER_W / 2 - 30, y, UI.osxSliderRow)
          .setOrigin(0.5).setDisplaySize(SLIDER_W + 100, SLIDER_H + 4).setAlpha(0.8).setDepth(2);
      }

      // Row label
      this.add.text(leftX, y, e.label, {
        fontFamily: 'monospace', fontSize: '13px', color: '#ccbbee',
      }).setOrigin(0, 0.5).setDepth(10);

      // Slider trough
      this.add.rectangle(sliderX, y, SLIDER_W, 10, 0x1a0f2e).setOrigin(0, 0.5).setDepth(5);

      // Fill bar
      const frac = (e.getValue() - e.min) / (e.max - e.min);
      const fill = this.add.rectangle(sliderX, y, SLIDER_W * frac, 10, 0x9933ff)
        .setOrigin(0, 0.5).setDepth(6);
      this.fills.push(fill);

      // Diamond handle
      const diamond = this.add.image(sliderX + SLIDER_W * frac, y, '__DEFAULT')
        .setDisplaySize(14, 14).setDepth(7);
      // use crown pin as handle if available
      if (UISystem.ready(this) && this.textures.exists(UI.vmCrownPin)) {
        diamond.setTexture(UI.vmCrownPin).setDisplaySize(18, 18);
      }

      // Value label
      const valText = this.add.text(sliderX + SLIDER_W + 14, y, String(e.getValue()), {
        fontFamily: 'monospace', fontSize: '13px', color: '#ffffff',
      }).setOrigin(0, 0.5).setDepth(10);
      this.labels.push(valText);

      // Click/drag on trough to set value
      const trough = this.add.rectangle(sliderX + SLIDER_W / 2, y, SLIDER_W, 28, 0x000000, 0)
        .setOrigin(0.5).setDepth(8).setInteractive({ useHandCursor: true });

      const setFromPointer = (ptr: Phaser.Input.Pointer) => {
        const rawFrac = Phaser.Math.Clamp((ptr.x - sliderX) / SLIDER_W, 0, 1);
        const range = e.max - e.min;
        const stepped = Math.round(rawFrac * range / e.step) * e.step;
        const val = e.min + stepped;
        e.setValue(val);
        const f = (val - e.min) / range;
        fill.width = SLIDER_W * f;
        diamond.x = sliderX + SLIDER_W * f;
        valText.setText(String(val));
      };

      trough.on('pointerdown', setFromPointer);
      trough.on('pointermove', (ptr: Phaser.Input.Pointer) => {
        if (ptr.isDown) setFromPointer(ptr);
      });

      // ± arrow buttons
      const mkArrow = (label: string, _ox: number, delta: number) => {
        const ax = sliderX + (label === '◀' ? -16 : SLIDER_W + 60);
        const btn = this.add.text(ax, y, label, {
          fontFamily: 'monospace', fontSize: '16px', color: '#9933ff',
        }).setOrigin(0.5).setDepth(10).setInteractive({ useHandCursor: true });
        btn.on('pointerover', () => btn.setColor('#ffd700'));
        btn.on('pointerout',  () => btn.setColor('#9933ff'));
        btn.on('pointerdown', () => {
          const cur = e.getValue();
          const next = Phaser.Math.Clamp(cur + delta, e.min, e.max);
          e.setValue(next);
          const f = (next - e.min) / (e.max - e.min);
          fill.width = SLIDER_W * f;
          diamond.x = sliderX + SLIDER_W * f;
          valText.setText(String(next));
        });
        return btn;
      };
      mkArrow('◀', sliderX, -e.step);
      mkArrow('▶', sliderX + SLIDER_W, e.step);
    }

    // ── Save + Back buttons ───────────────────────────────────────────────
    const btnY = cy + PANEL_H / 2 - 40;

    const saveBtn = this.add.text(cx - 80, btnY, 'SAVE', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '18px', color: '#ffd700',
      stroke: '#000000', strokeThickness: 4,
      backgroundColor: '#1a0a30', padding: { x: 18, y: 8 },
    }).setOrigin(0.5).setDepth(10).setInteractive({ useHandCursor: true });
    saveBtn.on('pointerover', () => saveBtn.setColor('#ffffff'));
    saveBtn.on('pointerout',  () => saveBtn.setColor('#ffd700'));
    saveBtn.on('pointerdown', () => this.scene.start(this.prevScene));

    const backBtn = this.add.text(cx + 80, btnY, 'BACK', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '18px', color: '#887799',
      stroke: '#000000', strokeThickness: 4,
      backgroundColor: '#0a0614', padding: { x: 18, y: 8 },
    }).setOrigin(0.5).setDepth(10).setInteractive({ useHandCursor: true });
    backBtn.on('pointerover', () => backBtn.setColor('#ffffff'));
    backBtn.on('pointerout',  () => backBtn.setColor('#887799'));
    backBtn.on('pointerdown', () => this.scene.start(this.prevScene));

    // ── Keyboard ─────────────────────────────────────────────────────────
    this.input.keyboard!.on('keydown-ESC', () => this.scene.start(this.prevScene));
  }
}
