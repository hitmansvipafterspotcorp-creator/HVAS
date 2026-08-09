import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from './config';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { LipsyncBingoScene } from './scenes/LipsyncBingoScene';
import { HostDjScene } from './scenes/HostDjScene';
import { MemberCheckInScene } from './scenes/MemberCheckInScene';
import { MembershipScene } from './scenes/MembershipScene';
import { AppHubScene } from './scenes/AppHubScene';
import { SecurityDoorScene } from './scenes/SecurityDoorScene';
import { OwnerCommandScene } from './scenes/OwnerCommandScene';

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
  input: { gamepad: false },
  scene: [BootScene, PreloadScene, AppHubScene, LipsyncBingoScene, HostDjScene, MemberCheckInScene, MembershipScene, SecurityDoorScene, OwnerCommandScene],
};

const game = new Phaser.Game(config);

// Expose for headless smoke tests / in-browser debugging.
(window as unknown as { __HVAS: Phaser.Game }).__HVAS = game;
