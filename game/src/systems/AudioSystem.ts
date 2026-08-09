import Phaser from 'phaser';
import { ASSET_BASE } from '../config';

// 8 real MP3 tracks exist at assets/audio/track01.mp3 … track08.mp3
// track06 = "TO INFINITY Part 2", track07 = "Spartacus (Kill 'em ALL)", track08 = "GODLY"
export const TRACK_COUNT = 8;

// Scene name → preferred track index (1-based).
const SCENE_TRACKS: Record<string, number> = {
  AppHub:        4,
  Membership:    5,
  MemberCheckIn: 5,
  SecurityDoor:  2,
  HostDj:        3,
  LipsyncBingo:  6,
  OwnerCommand:  4,
};

export class AudioSystem {
  // Queue all tracks for preload. Call inside PreloadScene.preload().
  static queue(scene: Phaser.Scene): void {
    for (let i = 1; i <= TRACK_COUNT; i++) {
      const key = `track${String(i).padStart(2, '0')}`;
      if (!scene.cache.audio.exists(key)) {
        scene.load.audio(key, `${ASSET_BASE}audio/${key}.mp3`);
      }
    }
  }

  static playForScene(scene: Phaser.Scene, sceneName: string): void {
    const idx = SCENE_TRACKS[sceneName] ?? 5;
    AudioSystem.play(scene, idx);
  }

  static play(scene: Phaser.Scene, trackIndex: number): void {
    const key = `track${String(trackIndex).padStart(2, '0')}`;
    if (!scene.cache.audio.exists(key)) return;
    // Stop any currently playing music on this scene.
    scene.sound.stopAll();
    scene.sound.play(key, { loop: true, volume: 0.45 });
  }

  static stop(scene: Phaser.Scene): void {
    scene.sound.stopAll();
  }

  static setMasterVolume(scene: Phaser.Scene, v: number): void {
    scene.sound.volume = Phaser.Math.Clamp(v, 0, 1);
  }

  static setMusicVolume(scene: Phaser.Scene, v: number): void {
    scene.sound.getAllPlaying().forEach(s => { (s as Phaser.Sound.WebAudioSound).setVolume(v); });
  }

  static setSfxVolume(_scene: Phaser.Scene, v: number): void {
    // SFX is WebAudio procedural — persist volume to localStorage so sfx() can read it.
    try { localStorage.setItem('hvas_opt_sfx', String(Phaser.Math.Clamp(v, 0, 1))); } catch { /* */ }
  }

  static getSfxVolume(): number {
    try { return parseFloat(localStorage.getItem('hvas_opt_sfx') ?? '0.8'); } catch { return 0.8; }
  }

  // Procedural SFX using WebAudio oscillator (no SFX files needed).
  static sfx(scene: Phaser.Scene, type: 'confirm' | 'deny' | 'select' | 'win'): void {
    const ctx = (scene.sound as unknown as { context?: AudioContext }).context;
    if (!ctx) return;
    switch (type) {
      case 'confirm': AudioSystem._tone(ctx, 660, 0.08, 'sine', 0.14); break;
      case 'deny':    AudioSystem._tone(ctx, 160, 0.14, 'sawtooth', 0.2); break;
      case 'select':  AudioSystem._tone(ctx, 440, 0.05, 'triangle', 0.12); break;
      case 'win':     AudioSystem._tone(ctx, 520, 0.2,  'sine', 0.22); break;
    }
  }

  private static _tone(ctx: AudioContext, freq: number, decay: number, wave: OscillatorType, vol: number): void {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = wave;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + decay);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + decay);
    } catch { /* AudioContext may be suspended */ }
  }
}
