'use strict';
const NPCEngine = (() => {
  // charId maps enemy types to sprite sheet characters for rendering
  const ENEMY_CHAR_IDS = {
    'Hater':            7,   // Promoter build
    'Opp':              30,  // Predator Pete
    'Bad-energy NPC':   9,   // Vendor build
    'Gate Crasher':     12,  // FSU Student A (aggressive rushdown)
    'Scammer':          5,   // Influencer build
    'Disruptor':        22,  // Entry Line Disruptor boss sprite
    'Stalker':          31,  // Agent Snow
    'Corrupt Security': 10,  // Security
    'Street Heat Boss': 21,  // Big Soulja
    'Entry Line Disruptor': 22,
  };

  const ENEMY_DEFS = {
    'Hater':            { emoji:'😤', color:'#cc2200', w:28, h:44, hp:80,  maxHp:80,  dmg:12, speed:3.2, behavior:'chase',           blockChance:0.10, retreatHp:0.10, reward:{pts:50,  coins:10} },
    'Opp':              { emoji:'🕵️', color:'#882200', w:30, h:46, hp:100, maxHp:100, dmg:15, speed:3.8, behavior:'patrol',          blockChance:0.25, retreatHp:0.20, reward:{pts:75,  coins:15} },
    'Bad-energy NPC':   { emoji:'🧟', color:'#444400', w:26, h:42, hp:60,  maxHp:60,  dmg:8,  speed:2.5, behavior:'wander',          blockChance:0.05, retreatHp:0.05, reward:{pts:30,  coins:5}  },
    'Gate Crasher':     { emoji:'🚨', color:'#ff4400', w:32, h:48, hp:120, maxHp:120, dmg:18, speed:4.5, behavior:'rush',            blockChance:0.15, retreatHp:0.10, reward:{pts:100, coins:20} },
    'Scammer':          { emoji:'🤥', color:'#886600', w:28, h:44, hp:70,  maxHp:70,  dmg:10, speed:3.5, behavior:'flee_then_attack',blockChance:0.20, retreatHp:0.30, reward:{pts:60,  coins:12} },
    'Disruptor':        { emoji:'💥', color:'#cc0055', w:30, h:46, hp:90,  maxHp:90,  dmg:14, speed:3.0, behavior:'aggressive',      blockChance:0.10, retreatHp:0.15, reward:{pts:80,  coins:16} },
    'Stalker':          { emoji:'👀', color:'#334400', w:26, h:44, hp:75,  maxHp:75,  dmg:11, speed:2.8, behavior:'follow',          blockChance:0.15, retreatHp:0.10, reward:{pts:65,  coins:13} },
    'Corrupt Security': { emoji:'🚫', color:'#334466', w:36, h:52, hp:160, maxHp:160, dmg:20, speed:2.5, behavior:'block_and_attack', blockChance:0.50, retreatHp:0.05, reward:{pts:150, coins:30} }
  };

  const NPC_TEMPLATES = {
    'Door Security':    { emoji:'🛡️', color:'#334466' },
    'VIP Host':         { emoji:'🎙️', color:'#aa44ff' },
    'Member in line':   { emoji:'🧑', color:'#4444aa' },
    'Street Vendor':    { emoji:'🛒', color:'#448800' },
    'Hibachi Vendor':   { emoji:'🍜', color:'#ff6600' },
    'Street Performer': { emoji:'🎤', color:'#ff44aa' },
    'Night Owl Regular':{ emoji:'🦉', color:'#555588' },
    'DJ':               { emoji:'🎧', color:'#8800ff' },
    'Member':           { emoji:'👑', color:'#aa0055' },
    'Promoter':         { emoji:'🎉', color:'#ff8800' },
    'Dancer':           { emoji:'💃', color:'#ff00ff' },
    'Bartender':        { emoji:'🍺', color:'#885500' },
    'Pool Shark':       { emoji:'🎱', color:'#004422' },
    'Regular':          { emoji:'🧑', color:'#444488' },
    'Security':         { emoji:'🛡️', color:'#334466' },
    'Bar Host':         { emoji:'🎙️', color:'#aa44ff' },
    'Sports Fan':       { emoji:'🏆', color:'#885500' },
    'Waitstaff':        { emoji:'🍹', color:'#446688' },
    'Pool Host':        { emoji:'🌊', color:'#0055aa' },
    'VIP Member':       { emoji:'👑', color:'#ffd700' },
    'Cabana Attendant': { emoji:'☀️', color:'#ffcc44' },
    'Street Regular':   { emoji:'🧑', color:'#444466' },
    'Night Shift Worker':{ emoji:'🌙', color:'#334455' },
    'Crew Member':      { emoji:'🤝', color:'#445566' },
    'Den Host':         { emoji:'🕶️', color:'#440066' },
    'Underground DJ':   { emoji:'🎧', color:'#6600cc' },
    'Lookout':          { emoji:'👁️', color:'#334433' },
    'Counter Staff':    { emoji:'🍕', color:'#884400' },
    'Late Night Regular':{ emoji:'🌙', color:'#334455' },
    'Delivery Runner':  { emoji:'🛵', color:'#446644' },
    'Stage Manager':    { emoji:'🎸', color:'#884488' },
    'Performer':        { emoji:'🎤', color:'#ff44aa' },
    'Sound Tech':       { emoji:'🎚️', color:'#334466' },
    'Creator':          { emoji:'✨', color:'#ff00aa' },
    'Event Coordinator':{ emoji:'📋', color:'#4488aa' },
    'Community Member': { emoji:'🤝', color:'#448855' },
    'Staff':            { emoji:'👷', color:'#335566' },
    'Rave DJ':          { emoji:'🎆', color:'#00ccff' },
    'Ravers':           { emoji:'🕺', color:'#cc00ff' },
    'Rave Host':        { emoji:'🎤', color:'#00ffcc' },
    'House Dealer':     { emoji:'🎲', color:'#006644' },
    'High Roller':      { emoji:'💰', color:'#ffd700' },
    'Hustler':          { emoji:'🃏', color:'#884400' },
    'Night Clerk':      { emoji:'🏪', color:'#446644' },
    'Late Night Regular2':{ emoji:'☕', color:'#664433' },
    'Delivery Driver':  { emoji:'🚗', color:'#446688' },
    'Parking Attendant':{ emoji:'🅿️', color:'#334466' },
    'After-Hours Crew': { emoji:'🌙', color:'#440066' },
    'Festival Host':    { emoji:'🎪', color:'#ffd700' },
    'Creator Stage':    { emoji:'🎤', color:'#ff00aa' },
    'Festival Security':{ emoji:'🛡️', color:'#334466' },
    'Headliner':        { emoji:'⭐', color:'#ffd700' }
  };

  function createEnemy(typeName, x, y, isBoss = false) {
    const def = ENEMY_DEFS[typeName] || ENEMY_DEFS['Hater'];
    const scale = isBoss ? 1.5 : 1;
    const hpScale = isBoss ? 4 : 1;
    return {
      id: `enemy_${Date.now()}_${Math.random().toString(36).substr(2,5)}`,
      type: typeName,
      emoji: def.emoji,
      color: def.color,
      x, y,
      w: Math.round(def.w * scale), h: Math.round(def.h * scale),
      hp: def.hp * hpScale, maxHp: def.hp * hpScale,
      dmg: def.dmg * (isBoss ? 1.5 : 1),
      speed: def.speed * (isBoss ? 0.8 : 1),
      behavior: isBoss ? 'boss_phase' : def.behavior,
      blockChance: def.blockChance,
      retreatHp: def.retreatHp,
      reward: { pts: def.reward.pts * (isBoss ? 6 : 1), coins: def.reward.coins * (isBoss ? 5 : 1) },
      frameData: { startup: 6, active: 4, recovery: 12 },
      isBoss,
      hitstunFrames: 0, blockstunFrames: 0,
      attackCooldown: 0, attacking: false, blocking: false,
      facing: -1, vel: { x: 0, y: 0 },
      charId: ENEMY_CHAR_IDS[typeName] || 10,
      phase2Hp: 0.5, patrolDir: 1
    };
  }

  function createNPC(typeName, x, y, dialog = []) {
    const tmpl = NPC_TEMPLATES[typeName] || { emoji: '🧑', color: '#444488' };
    return {
      id: `npc_${Date.now()}_${Math.random().toString(36).substr(2,5)}`,
      type: typeName,
      name: typeName,
      emoji: tmpl.emoji,
      color: tmpl.color,
      x, y, w: 28, h: 44,
      dialog: dialog.length ? dialog : [`Hey! Welcome to the spot.`, `Stay sharp out there.`],
      dialogIdx: 0,
      interacted: false,
      showPrompt: false,
      missionTrigger: null
    };
  }

  function generateVenueNPCs(venue, canvasW, canvasH) {
    const npcs = [];
    const positions = [
      { x: canvasW * 0.15, y: canvasH * 0.5 },
      { x: canvasW * 0.5,  y: canvasH * 0.3 },
      { x: canvasW * 0.75, y: canvasH * 0.6 },
      { x: canvasW * 0.85, y: canvasH * 0.4 }
    ];

    (venue.npcs || []).slice(0, 4).forEach((name, i) => {
      const pos = positions[i] || { x: canvasW * 0.5 + i * 80, y: canvasH * 0.5 };
      const dialogs = getNPCDialog(name, venue);
      npcs.push(createNPC(name, pos.x, pos.y, dialogs));
    });
    return npcs;
  }

  function getNPCDialog(npcName, venue) {
    const dialogs = {
      'Door Security': [`You need membership to enter.`, `Show me your VIP status.`, `All clear — welcome in.`],
      'VIP Host':      [`Welcome to ${venue.shortName || venue.name}!`, `Complete the mission to earn status.`, `VIP members get full access.`],
      'DJ':            [`You feel the beat?`, `Music is the key to every door here.`, `Earn status — unlock the set.`],
      'Member in line':[`You're new here?`, `This spot is legendary.`, `Don't mess up the vibe.`],
      'Promoter':      [`I run this section.`, `Complete the challenge and I'll put you on.`, `Hype up and let's go!`],
      'Dancer':        [`Match my energy and we'll get through this.`, `Move fast — this stage doesn't forgive slow.`],
      'Security':      [`Keep it clean in here.`, `I'm watching everyone.`, `VIP only past this point.`],
      'Stage Manager': [`You want stage time? Earn it.`, `The crowd needs a performer — is that you?`],
      'Headliner':     [`Only legends reach this stage.`, `Evo Fest is yours if you can take it.`]
    };
    return dialogs[npcName] || [`What's good? Stay sharp.`, `The night isn't over yet.`];
  }

  function generateVenueEnemies(venue, waveData, canvasW, canvasH, isTopdown = false) {
    const enemies = [];
    const spawnX = isTopdown ? canvasW * 0.7 : (waveData.spawnX || canvasW - 60);
    const groundY = isTopdown ? canvasH * 0.5 : canvasH * (venue.groundY || 0.75);

    waveData.enemies.forEach((name, i) => {
      const isBoss = waveData.wave === 'boss';
      const offset = i * 60;
      const y = isTopdown
        ? groundY + (Math.random() - 0.5) * 80
        : groundY - (isBoss ? 70 : 44);

      const en = createEnemy(name, spawnX + offset, y, isBoss);
      if (isBoss) {
        en.emoji = venue.bossEmoji || en.emoji;
        en.hp = venue.bossHp || en.hp;
        en.maxHp = venue.bossHp || en.maxHp;
        en.name = venue.bossName || en.type;
      }
      enemies.push(en);
    });
    return enemies;
  }

  function generateVenueProps(venue, canvasW, canvasH, isTopdown) {
    const props = [];
    const propList = venue.props || [];
    const groundY = canvasH * (venue.groundY || 0.75);

    const propEmojis = {
      velvet_rope:'🪢', neon_sign:'💡', entry_door:'🚪', security_post:'🛡️',
      street_light:'🔦', food_truck:'🚛', hibachi_grill:'🔥', dj_booth:'🎧',
      vip_rope:'🪢', stage_light:'💡', bar_counter:'🍺', pool_table:'🎱',
      speaker_stack:'🔊', cue_stick:'🎱', pool:'🏊', cabana:'⛱️',
      main_stage:'🎸', spotlight:'💡', stage_pole:'🎙️', dice_table:'🎲',
      gas_pump:'⛽', cooler:'🧊', car:'🚗', parking_gate:'🅿️',
      pizza_oven:'🍕', speaker_wall:'🔊', laser_rig:'🎆', festival_stage:'🎪'
    };

    // Preload prop images for this venue
    if (typeof PropRenderer !== 'undefined') {
      PropRenderer.preloadForVenue(venue.shortName, 12);
    }

    propList.slice(0, 6).forEach((ptype, i) => {
      const x = isTopdown
        ? 80 + i * Math.floor(canvasW / 7)
        : 200 + i * 400;
      const y = isTopdown
        ? 120 + (i % 3) * 80
        : groundY - 60;
      const w = isTopdown ? 64 : 72;
      const h = isTopdown ? 64 : 72;

      props.push({
        id: `prop_${ptype}_${i}`,
        type: ptype,
        emoji: propEmojis[ptype] || '📦',
        x, y, w, h,
        solid: true,
        interactable: true,
        glow: ptype.includes('light') || ptype.includes('neon') || ptype.includes('laser'),
        showPrompt: false,
        finisherZone: i === 0,
        missionHook: i === 1 ? `interact_${ptype}` : null,
        _venue: venue.shortName,
        _slot: i
      });
    });
    return props;
  }

  function generateVenueWalls(venue, canvasW, canvasH) {
    const walls = [];
    const padding = 50;
    // Perimeter walls
    walls.push({ x: 0,            y: 0,             w: padding,      h: canvasH });
    walls.push({ x: canvasW - padding, y: 0,         w: padding,      h: canvasH });
    walls.push({ x: 0,            y: 0,             w: canvasW,      h: padding });
    walls.push({ x: 0,            y: canvasH - padding, w: canvasW,  h: padding });
    // Interior obstacles
    walls.push({ x: canvasW * 0.3, y: canvasH * 0.2, w: 60, h: 120 });
    walls.push({ x: canvasW * 0.65, y: canvasH * 0.5, w: 60, h: 80 });
    return walls;
  }

  function generateVenueDoors(venue, canvasW, canvasH, save) {
    const doors = [];
    // Entry door
    doors.push({
      id: 'door_entry', x: canvasW / 2 - 24, y: canvasH - 80, w: 48, h: 32,
      locked: false, destVenueId: null, destX: canvasW / 2, destY: 100,
      prompt: 'Exit venue', showPrompt: false
    });
    // Exit/next door(s) — unlocked after mission. unlocks may be a single id
    // or an array (Tally Row connects to several interiors via multiple
    // entrances), so we lay out one entrance door per destination.
    if (venue.reward && venue.reward.unlocks) {
      const dests = Array.isArray(venue.reward.unlocks)
        ? venue.reward.unlocks : [venue.reward.unlocks];
      const locked = !SaveSystem.isMissionComplete(venue.id);
      const gap = canvasH / (dests.length + 1);
      dests.forEach((destId, i) => {
        doors.push({
          id: 'door_next_' + destId, x: canvasW - 80, y: gap * (i + 1) - 20, w: 48, h: 40,
          locked, destVenueId: destId, destX: 100, destY: canvasH / 2,
          prompt: 'Enter venue', lockedText: 'Clear mission to unlock', showPrompt: false
        });
      });
    }
    return doors;
  }

  function updateNPCProximity(npcs, player, threshold = 60) {
    npcs.forEach(npc => {
      const dx = Math.abs(npc.x - player.x);
      const dy = Math.abs(npc.y - player.y);
      npc.showPrompt = (dx < threshold && dy < threshold && !npc.interacted);
    });
  }

  function updatePropProximity(props, player, threshold = 60) {
    props.forEach(prop => {
      const dx = Math.abs(prop.x + prop.w / 2 - player.x - player.w / 2);
      const dy = Math.abs(prop.y + prop.h / 2 - player.y - player.h / 2);
      prop.showPrompt = (dx < threshold && dy < threshold && prop.interactable);
    });
  }

  function updateDoorProximity(doors, player, threshold = 50) {
    doors.forEach(door => {
      const dx = Math.abs(door.x + door.w / 2 - player.x - player.w / 2);
      const dy = Math.abs(door.y + door.h / 2 - player.y - player.h / 2);
      door.showPrompt = (dx < threshold && dy < threshold);
    });
  }

  return {
    ENEMY_DEFS, NPC_TEMPLATES,
    createEnemy, createNPC,
    generateVenueNPCs, generateVenueEnemies, generateVenueProps,
    generateVenueWalls, generateVenueDoors,
    updateNPCProximity, updatePropProximity, updateDoorProximity
  };
})();
