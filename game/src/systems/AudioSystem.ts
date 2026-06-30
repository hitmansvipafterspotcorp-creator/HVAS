import Phaser from 'phaser';
import { ASSET_BASE } from '../config';

// 5 real MP3 tracks exist at assets/audio/track01.mp3 … track05.mp3
export const TRACK_COUNT = 5;

// Stage → preferred track index (1-based). Cycles if not found.
const STAGE_TRACKS: Record<string, number> = {
  cafe8fifty:             1,
  dukes_exterior:         2,
  kcs_exterior:           3,
  outta_exterior:         4,
  qhf_exterior:           5,
  social_gaines_exterior: 1,
  success_rooftop:        2,
  tally_exterior:         3,
};

// Scene name → preferred track index.
const SCENE_TRACKS: Record<string, number> = {
  MainMenu:    4,
  VenueSelect: 5,
  StageSelect: 4,
  ArcadeVs:    1,
  Venue:       5,
};

export class AudioSystem {
  // Queue all 5 tracks for preload. Call inside PreloadScene.preload().
  static queue(scene: Phaser.Scene): void {
    for (let i = 1; i <= TRACK_COUNT; i++) {
      const key = `track${String(i).padStart(2, '0')}`;
      if (!scene.cache.audio.exists(key)) {
        scene.load.audio(key, `${ASSET_BASE}audio/${key}.mp3`);
      }
    }
  }

  // Play background music for a stage. Fades out previous, fades in new.
  static playForStage(scene: Phaser.Scene, stageId: string): void {
    const idx = STAGE_TRACKS[stageId] ?? 1;
    AudioSystem.play(scene, idx);
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

  static setSfxVolume(_scene: Phaser.Scene, _v: number): void {
    // SFX is WebAudio procedural; persisted to localStorage by OptionsScene.
  }

  // Procedural SFX using WebAudio oscillator (no SFX files needed).
  static sfx(scene: Phaser.Scene, type: 'hit' | 'superhit' | 'pickup_health' | 'pickup_meter' | 'pickup_weapon' | 'ko' | 'door'): void {
    const ctx = (scene.sound as unknown as { context?: AudioContext }).context;
    if (!ctx) return;
    switch (type) {
      case 'hit':           AudioSystem._tone(ctx, 180, 0.06, 'square', 0.18); break;
      case 'superhit':      AudioSystem._tone(ctx, 120, 0.18, 'sawtooth', 0.28); break;
      case 'pickup_health': AudioSystem._tone(ctx, 660, 0.08, 'sine', 0.14); break;
      case 'pickup_meter':  AudioSystem._tone(ctx, 440, 0.08, 'sine', 0.14); break;
      case 'pickup_weapon': AudioSystem._tone(ctx, 330, 0.1, 'triangle', 0.18); break;
      case 'ko':            AudioSystem._tone(ctx, 80,  0.4,  'sawtooth', 0.35); break;
      case 'door':          AudioSystem._tone(ctx, 520, 0.12, 'sine', 0.2); break;
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
