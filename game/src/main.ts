import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from './config';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { MainMenuScene } from './scenes/MainMenuScene';
import { BrawlerScene } from './scenes/BrawlerScene';
import { VenueScene } from './scenes/VenueScene';
import { LevelEditorScene } from './scenes/LevelEditorScene';
import { ArcadeVsScene } from './scenes/ArcadeVsScene';
import { StageSelectScene } from './scenes/StageSelectScene';
import { VenueSelectScene } from './scenes/VenueSelectScene';
import { LipsyncBingoScene } from './scenes/LipsyncBingoScene';
import { TvModeScene } from './scenes/TvModeScene';
import { HostDjScene } from './scenes/HostDjScene';
import { MemberCheckInScene } from './scenes/MemberCheckInScene';
import { MembershipScene } from './scenes/MembershipScene';

// Android landscape-first, desktop playable. Phaser.Scale.FIT keeps the 16:9
// stage centered and unstretched on any device — no stretched assets/QR codes.
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-root',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: COLORS.bg,
  pixelArt: false,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 0 }, debug: false },
  },
  input: { gamepad: true },
  scene: [BootScene, PreloadScene, MainMenuScene, BrawlerScene, VenueScene, LevelEditorScene, ArcadeVsScene, StageSelectScene, VenueSelectScene, LipsyncBingoScene, TvModeScene, HostDjScene, MemberCheckInScene, MembershipScene],
};

const game = new Phaser.Game(config);

// Expose for headless smoke tests / in-browser debugging.
(window as unknown as { __HVAS: Phaser.Game }).__HVAS = game;
