const CHARACTERS = [
  {
    id: 1, name: 'HITMAN PRIME', emoji: '👑', unlock: 0,
    desc: 'The OG. Gold crown. Fast and balanced — born for the after spot.',
    special: 'Crown Strike',
    specialDesc: 'A devastating overhead slam that stuns all enemies on screen.',
    spd: 80, str: 75, def: 70,
    color: '#ffd700',
    sfx: 'crown',
    baseHp: 120, baseDmg: 18, baseSpeed: 4.5
  },
  {
    id: 2, name: 'NEON BLADE', emoji: '🗡️', unlock: 0,
    desc: 'Pink neon swords. Pure speed — hits three times before you blink.',
    special: 'Neon Rush',
    specialDesc: 'Dashes through all enemies in a straight line dealing rapid hits.',
    spd: 95, str: 65, def: 55,
    color: '#ff00aa',
    sfx: 'slash',
    baseHp: 95, baseDmg: 14, baseSpeed: 6.0
  },
  {
    id: 3, name: 'VAULT KING', emoji: '💰', unlock: 200,
    desc: 'Gold chains and heavy hands. Every hit sends enemies flying.',
    special: 'Gold Avalanche',
    specialDesc: 'Rains gold coins that deal damage and stun on impact.',
    spd: 45, str: 98, def: 85,
    color: '#ffd700',
    sfx: 'crash',
    baseHp: 160, baseDmg: 28, baseSpeed: 2.8
  },
  {
    id: 4, name: 'SHADOW SPOT', emoji: '🥷', unlock: 500,
    desc: 'Dark assassin. Appears from nowhere. Vanishes before they know it.',
    special: 'Shadow Step',
    specialDesc: 'Teleports behind the strongest enemy and deals triple damage.',
    spd: 88, str: 78, def: 50,
    color: '#8b00ff',
    sfx: 'whoosh',
    baseHp: 100, baseDmg: 24, baseSpeed: 5.5
  },
  {
    id: 5, name: 'CHROME QUEEN', emoji: '🤖', unlock: 800,
    desc: 'Silver armor that reflects damage back at attackers. Unbreakable.',
    special: 'Chrome Reflect',
    specialDesc: 'Activates a shield that reflects all damage for 3 seconds.',
    spd: 50, str: 72, def: 99,
    color: '#c0c0c0',
    sfx: 'clank',
    baseHp: 180, baseDmg: 16, baseSpeed: 3.0
  },
  {
    id: 6, name: 'ROOFTOP REX', emoji: '🦅', unlock: 1200,
    desc: 'Parkour master. Aerial combos from above. The rooftop is his stage.',
    special: 'Sky Slam',
    specialDesc: 'Leaps to max height and crashes down with a shockwave.',
    spd: 82, str: 80, def: 65,
    color: '#ff8800',
    sfx: 'slam',
    baseHp: 115, baseDmg: 22, baseSpeed: 5.0
  },
  {
    id: 7, name: 'VELVET VOX', emoji: '🎤', unlock: 1800,
    desc: 'Purple suit and pure charisma. His VIP aura weakens every enemy.',
    special: 'VIP Aura',
    specialDesc: 'Emits a status aura that halves all enemy stats for 5 seconds.',
    spd: 65, str: 60, def: 68,
    color: '#cc44ff',
    sfx: 'echo',
    baseHp: 110, baseDmg: 15, baseSpeed: 4.0
  },
  {
    id: 8, name: 'NITE HAWK', emoji: '🦉', unlock: 2500,
    desc: 'Night vision goggles and long-range precision. Sees everything.',
    special: 'Hawk Shot',
    specialDesc: 'Fires a charged beam across the entire stage hitting all enemies.',
    spd: 70, str: 85, def: 60,
    color: '#00ff88',
    sfx: 'beam',
    baseHp: 105, baseDmg: 26, baseSpeed: 4.2
  },
  {
    id: 9, name: 'GOLD RUSH', emoji: '🏆', unlock: 3500,
    desc: 'Money is the weapon. Coin attacks drain VIP points from rivals.',
    special: 'Money Rain',
    specialDesc: 'A storm of gold coins rains down dealing continuous damage.',
    spd: 72, str: 70, def: 72,
    color: '#ffd700',
    sfx: 'coins',
    baseHp: 120, baseDmg: 20, baseSpeed: 4.5
  },
  {
    id: 10, name: 'LOUNGE LIZARD', emoji: '🍹', unlock: 5000,
    desc: 'Cocktail weapons laced with poison. Slow but lethal over time.',
    special: 'Last Call',
    specialDesc: 'Poisons all enemies — they lose HP every second for 8 seconds.',
    spd: 55, str: 65, def: 75,
    color: '#ff6644',
    sfx: 'splash',
    baseHp: 130, baseDmg: 12, baseSpeed: 3.5
  },
  {
    id: 11, name: 'BOUNCE MASTER', emoji: '🎧', unlock: 7500,
    desc: 'DJ with sound wave attacks. Bass drop shakes the whole venue.',
    special: 'Bass Drop',
    specialDesc: 'Drops a bass bomb that stuns and damages enemies in a wide radius.',
    spd: 75, str: 82, def: 62,
    color: '#ff00aa',
    sfx: 'bass',
    baseHp: 115, baseDmg: 21, baseSpeed: 4.8
  },
  {
    id: 12, name: 'DOOR MAN', emoji: '🚪', unlock: 10000,
    desc: 'Massive bouncer. Throws enemies like velvet ropes. Controls the crowd.',
    special: 'VIP Block',
    specialDesc: 'Throws a wall of bouncers that blocks and crushes incoming enemies.',
    spd: 35, str: 99, def: 95,
    color: '#444444',
    sfx: 'thud',
    baseHp: 200, baseDmg: 30, baseSpeed: 2.2
  },
  {
    id: 13, name: 'AFTER KING', emoji: '🌙', unlock: 20000,
    desc: 'The final unlock. Max stats. Ruler of the After Hours. Unstoppable.',
    special: 'After Hours',
    specialDesc: 'Calls in the entire crew — massive AoE, invincibility for 4 seconds.',
    spd: 99, str: 99, def: 99,
    color: '#ff00aa',
    sfx: 'royale',
    baseHp: 220, baseDmg: 35, baseSpeed: 5.8
  }
];
