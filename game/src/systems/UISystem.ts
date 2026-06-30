import Phaser from 'phaser';
import { ASSET_BASE } from '../config';

// ── UISystem ────────────────────────────────────────────────────────────────
// Loads every named UI element from assets/ui/elements/.

export const UI = {
  // ── Core ──────────────────────────────────────────────────────────────────
  logo:              'ui_logo',

  // ── Main Menu ─────────────────────────────────────────────────────────────
  mmLogo:            'mm_logo',
  mmProfileBar:      'mm_profile_bar',
  mmTaglines:        'mm_taglines',
  mmModeBadges:      'mm_mode_badges',
  mmRankChips:       'mm_rank_chips',
  mmPromptChips:     'mm_prompt_chips',
  mmNewsPanel:       'mm_news_panel',
  mmQuestsPanel:     'mm_quests_panel',
  mmRewardStrip:     'mm_reward_strip',
  mmFooterOrnament:  'mm_footer_ornament',
  mmDecorative:      'mm_decorative',
  mmBottomIcons:     'mm_bottom_icons',
  // buttons (7 × default + 7 × selected)
  mmBtnContinue:     'mm_btn_continue',
  mmBtnContinueSel:  'mm_btn_continue_sel',
  mmBtnNewGame:      'mm_btn_newgame',
  mmBtnNewGameSel:   'mm_btn_newgame_sel',
  mmBtnVsMode:       'mm_btn_vsmode',
  mmBtnVsModeSel:    'mm_btn_vsmode_sel',
  mmBtnCharSelect:   'mm_btn_charselect',
  mmBtnCharSelectSel:'mm_btn_charselect_sel',
  mmBtnVenueMap:     'mm_btn_venuemap',
  mmBtnVenueMapSel:  'mm_btn_venuemap_sel',
  mmBtnOptions:      'mm_btn_options',
  mmBtnOptionsSel:   'mm_btn_options_sel',
  mmBtnExit:         'mm_btn_exit',
  mmBtnExitSel:      'mm_btn_exit_sel',

  // ── HUD ───────────────────────────────────────────────────────────────────
  hudPortraitFrame:  'hud_portrait_frame',
  hudHealthBar:      'hud_health_bar',
  hudSuperBar:       'hud_super_bar',
  hudGuardBar:       'hud_guard_bar',
  hudBossBar:        'hud_boss_bar',
  hudTimer:          'hud_timer',
  hudComboCounter:   'hud_combo_counter',
  hudComboLabel:     'hud_combo_label',
  hudScoreChip:      'hud_score_chip',
  hudDanger:         'hud_danger',
  hudHitFlash:       'hud_hit_flash',
  hudObjective:      'hud_objective',
  hudShieldLogo:     'hud_shield_logo',
  hudIconCrown:      'hud_icon_crown',
  hudIconLightning:  'hud_icon_lightning',
  hudIconShield:     'hud_icon_shield',
  hudIconSkull:      'hud_icon_skull',
  hudIconStar:       'hud_icon_star',
  hudPipStar:        'hud_pip_star',
  hudControls:       'hud_controls',
  hudBtnLight:       'hud_btn_light',
  hudBtnHeavy:       'hud_btn_heavy',
  hudBtnBlock:       'hud_btn_block',
  hudBtnSpecial:     'hud_btn_special',
  digit:             (d: number | string) => `ui_digit_${d}`,

  // ── Pause Menu ────────────────────────────────────────────────────────────
  pmTitleBanner:     'pm_title_banner',
  pmPanelLeft:       'pm_panel_left',
  pmPanelRight:      'pm_panel_right',
  pmPanelWide:       'pm_panel_wide',
  pmOverlayMd:       'pm_overlay_md',
  pmOverlaySm:       'pm_overlay_sm',
  pmBtnContinue:     'pm_btn_continue_default',
  pmBtnContinueHov:  'pm_btn_continue_hover',
  pmBtnRestart:      'pm_btn_restart_default',
  pmBtnRestartHov:   'pm_btn_restart_hover',
  pmBtnRetry:        'pm_btn_retry_default',
  pmBtnRetryHov:     'pm_btn_retry_hover',
  pmBtnSettings:     'pm_btn_settings_default',
  pmBtnSettingsHov:  'pm_btn_settings_hover',
  pmBtnQuit:         'pm_btn_quit_default',
  pmBtnQuitHov:      'pm_btn_quit_hover',
  pmTabMission:      'pm_tab_mission',
  pmTabSettings:     'pm_tab_settings',
  pmTabStats:        'pm_tab_stats',
  pmRowDefault:      'pm_row_default',
  pmRowHighlight1:   'pm_row_highlight_01',
  pmRowHighlight2:   'pm_row_highlight_02',
  pmSaveBadge:       'pm_save_badge',
  pmDialogConfirm:   'pm_dialog_confirm',
  pmPromptA:         'pm_prompt_a',
  pmPromptB:         'pm_prompt_b',
  pmPromptX:         'pm_prompt_x',
  pmPromptY:         'pm_prompt_y',
  pmPromptMenu:      'pm_prompt_menu',

  // ── Stage Select ──────────────────────────────────────────────────────────
  ssMapFrame:        'ss_map_frame',
  ssStageInfoPanel:  'ss_stage_info_panel',
  ssRouteNodes:      'ss_route_nodes',
  ssRouteArrows:     'ss_route_arrows',
  ssStageBadgesUnlocked: 'ss_stage_badges_unlocked',
  ssStageBadgesLocked:   'ss_stage_badges_locked',
  ssVenueCard1:      'ss_venue_card_1',
  ssVenueCard2:      'ss_venue_card_2',
  ssVenueCard3:      'ss_venue_card_3',
  ssVenueCard4:      'ss_venue_card_4',
  ssVenueCards:      'ss_venue_cards',
  ssObjectiveChip:   'ss_objective_chip',
  ssCheckpointIcons: 'ss_checkpoint_icons',
  ssLegendPanel:     'ss_legend_panel',
  ssFastTravelBtn:   'ss_fast_travel_btn',
  ssPreviewFrames:   'ss_preview_frames',

  // ── VS Screen ─────────────────────────────────────────────────────────────
  vsTitleLogo:       'vs_title_logo',
  vsEmblem:          'vs_emblem',
  vsNameplateP1:     'vs_nameplate_p1',
  vsNameplateP2:     'vs_nameplate_p2',
  vsPortraitLargeL:  'vs_portrait_large_l',
  vsPortraitLargeR:  'vs_portrait_large_r',
  vsPortraitMed:     'vs_portrait_med',
  vsPortraitSmall:   'vs_portrait_small',
  vsRoundIndicators: 'vs_round_indicators',
  vsWinDots:         'vs_win_dots',
  vsRankBadges:      'vs_rank_badges',
  vsLevelChips:      'vs_level_chips',
  vsMatchRules:      'vs_match_rules',
  vsProgressBar:     'vs_progress_bar',
  vsBtnChips:        'vs_btn_chips',
  vsReadyMarkers:    'vs_ready_markers',
  vsWinnerMarkers:   'vs_winner_markers',
  vsStageBanners:    'vs_stage_banners',

  // ── Character Select ──────────────────────────────────────────────────────
  csTitleBanner:     'cs_title_banner',
  csPortraitFrameLarge: 'cs_portrait_frame_large',
  csSlotGrid:        'cs_slot_grid',
  csSlotIdle:        'cs_slot_idle',
  csSlotSelected:    'cs_slot_selected',
  csStatPanel:       'cs_stat_panel',
  csCategoryTabs:    'cs_category_tabs',
  csColorTabs:       'cs_color_tabs',
  csDivider:         'cs_divider',
  csStyleTags:       'cs_style_tags',
  csActionBtns:      'cs_action_btns',
  csPromptChips:     'cs_prompt_chips',
  csReadyCpu:        'cs_ready_cpu',
  csInstructionStrip:'cs_instruction_strip',
  csBottomIcons:     'cs_bottom_icons',

  // ── Dialogue ──────────────────────────────────────────────────────────────
  dlgFrameLarge:     'dlg_frame_large',
  dlgFrameMedium:    'dlg_frame_medium',
  dlgFrameSmall:     'dlg_frame_small',
  dlgSpeakerPlate:   'dlg_speaker_plate',
  dlgMissionStart:   'dlg_mission_start',
  dlgMissionUpdate:  'dlg_mission_update',
  dlgObjectiveComplete: 'dlg_objective_complete',
  dlgRewardPopup:    'dlg_reward_popup',
  dlgItemChip:       'dlg_item_chip',
  dlgSuccessAlert:   'dlg_success_alert',
  dlgWarningAlert:   'dlg_warning_alert',
  dlgXpPopup:        'dlg_xp_popup',
  dlgToastMission:   'dlg_toast_mission',
  dlgToastObjective: 'dlg_toast_objective',
  dlgToastComplete:  'dlg_toast_complete',
  dlgToastReward:    'dlg_toast_reward',

  // ── Dialogue mission portraits (indexed 000-015) ──────────────────────
  dlgMission000:     'dialogue_mission_000',
  dlgMission001:     'dialogue_mission_001',
  dlgMission002:     'dialogue_mission_002',
  dlgMission003:     'dialogue_mission_003',
  dlgMission004:     'dialogue_mission_004',
  dlgMission005:     'dialogue_mission_005',
  dlgMission006:     'dialogue_mission_006',
  dlgMission007:     'dialogue_mission_007',
  dlgMission008:     'dialogue_mission_008',
  dlgMission009:     'dialogue_mission_009',
  dlgMission010:     'dialogue_mission_010',
  dlgMission011:     'dialogue_mission_011',
  dlgMission012:     'dialogue_mission_012',
  dlgMission013:     'dialogue_mission_013',
  dlgMission014:     'dialogue_mission_014',
  dlgMission015:     'dialogue_mission_015',

  // ── Frames & Emblems sheet crops ─────────────────────────────────────────
  feGameLogo:        'frames_emblems_005',   // full HITMANS VIP AFTER SPOT logo
  feMainMenuBanner:  'frames_emblems_000',   // MAIN MENU marquee banner
  feCrown:           'frames_emblems_001',   // gold crown icon
  fePortraitFrame:   'frames_emblems_002',   // tall portrait frame (crown top)
  feCardFrame:       'frames_emblems_003',   // wide card frame (crown top)
  feShieldEmblem:    'frames_emblems_004',   // shield with diamond
  feCornerBR:        'frames_emblems_006',   // corner bracket (bottom-right style)
  feCornerTL:        'frames_emblems_010',   // corner bracket (top-left style)
  feLabelOptions:    'frames_emblems_020',   // OPTIONS label chip

  // ── Title Menu panel crops ────────────────────────────────────────────────
  tmTitleBar:        'title_menu_000',       // wide gold/purple title bar
  tmShieldFrame:     'title_menu_001',       // shield/portrait frame
  tmPanelTall:       'title_menu_002',       // tall side panel (left)
  tmPanelFull:       'title_menu_003',       // full panel frame
  tmCorner:          'title_menu_010',       // corner ornament (gold/purple)

  // ── Venue Map sheet crops ─────────────────────────────────────────────────
  vmMapFrame:        'venue_map_000',        // district map full background
  vmVenueCardPair:   'venue_map_001',        // pair of venue cards (template reference)
  vmVenueCardOpen:   'venue_map_002',        // unlocked venue card template
  vmVenueCardLocked: 'venue_map_003',        // locked venue card template
  vmStageBadge4:     'venue_map_004',        // STAGE 04 badge
  vmStageBadge1:     'venue_map_005',        // STAGE 01 badge
  vmStageBadge2:     'venue_map_006',        // STAGE 02 badge
  vmStageBadge3:     'venue_map_007',        // STAGE 03 badge
  vmStageBadge7:     'venue_map_008',        // STAGE 07 badge (locked)
  vmStageBadge5:     'venue_map_009',        // STAGE 05 badge
  vmStageBadge6:     'venue_map_010',        // STAGE 06 badge (locked)
  vmStageBadge8:     'venue_map_011',        // STAGE 08 badge (locked)
  vmThumb0:          'venue_map_012',        // venue interior thumbnail (purple club)
  vmThumb1:          'venue_map_013',        // venue interior thumbnail (red club)
  vmThumb2:          'venue_map_014',        // venue exterior thumbnail (city skyline)
  vmThumb3:          'venue_map_015',        // venue interior thumbnail (VIP lounge)
  vmInfoPanel:       'venue_map_016',        // info panel bar (horizontal)
  vmMapPin:          'venue_map_020',        // map location pin
  vmCrownPin:        'venue_map_021',        // crown map pin
  vmStarBadge:       'venue_map_030',        // star rating badge

  // ── Legacy aliases (kept so old code doesn't break) ───────────────────────
  healthBar:         'hud_health_bar',
  comboLabel:        'hud_combo_label',
  pipStar:           'hud_pip_star',
  hudPortrait:       'hud_portrait_frame',
  hudSuperBarOld:    'hud_super_bar',
  hudGuardBarOld:    'hud_guard_bar',
  hudBossBarOld:     'hud_boss_bar',
  hudCombo:          'hud_combo_counter',
  hudDangerOld:      'hud_danger',
  dialoguePanel:     'dlg_frame_large',
  pauseTitle:        'pm_title_banner',
  pausePanel:        'pm_panel_wide',
  // char-select aliases for ArcadeVsScene
  csGrid:            'cs_slot_grid',
  csFrameL:          'cs_portrait_frame_large',
  csFrameR:          'cs_portrait_frame_large',
  csLabelP1:         'cs_title_banner',
  csLabelP2:         'cs_title_banner',
  csVs:              'vs_emblem',
  // LSB kit sheet aliases
  lsbMaster:         'ui_lsb_master',
  lsbLobby:          'ui_lsb_lobby',
  lsbBingoCard:      'ui_lsb_bingo_card',
  lsbHostDj:         'ui_lsb_host_dj',
  lsbVerification:   'ui_lsb_verification',
  lsbSongQueue:      'ui_lsb_song_queue',
  lsbWinner:         'ui_lsb_winner',
  lsbMembership:     'ui_lsb_membership',
  lsbPartyMode:      'ui_lsb_party_mode',
  lsbTvDisplay:      'ui_lsb_tv_display',
} as const;

// ─── Load manifest ───────────────────────────────────────────────────────────
const FILES: Array<[string, string]> = [
  // Core logo
  [UI.logo,              'ui/hvas_logo.png'],

  // ── Main Menu ────────────────────────────────────────────────────────────
  [UI.mmLogo,            'ui/elements/main_menu/mm_logo.png'],
  [UI.mmProfileBar,      'ui/elements/main_menu/mm_profile_bar.png'],
  [UI.mmTaglines,        'ui/elements/main_menu/mm_taglines.png'],
  [UI.mmModeBadges,      'ui/elements/main_menu/mm_mode_badges.png'],
  [UI.mmRankChips,       'ui/elements/main_menu/mm_rank_chips.png'],
  [UI.mmPromptChips,     'ui/elements/main_menu/mm_prompt_chips.png'],
  [UI.mmNewsPanel,       'ui/elements/main_menu/mm_news_panel.png'],
  [UI.mmQuestsPanel,     'ui/elements/main_menu/mm_quests_panel.png'],
  [UI.mmRewardStrip,     'ui/elements/main_menu/mm_reward_strip.png'],
  [UI.mmFooterOrnament,  'ui/elements/main_menu/mm_footer_ornament.png'],
  [UI.mmDecorative,      'ui/elements/main_menu/mm_decorative.png'],
  [UI.mmBottomIcons,     'ui/elements/main_menu/mm_bottom_icons.png'],
  [UI.mmBtnContinue,     'ui/elements/main_menu/mm_btn_continue.png'],
  [UI.mmBtnContinueSel,  'ui/elements/main_menu/mm_btn_continue_sel.png'],
  [UI.mmBtnNewGame,      'ui/elements/main_menu/mm_btn_newgame.png'],
  [UI.mmBtnNewGameSel,   'ui/elements/main_menu/mm_btn_newgame_sel.png'],
  [UI.mmBtnVsMode,       'ui/elements/main_menu/mm_btn_vsmode.png'],
  [UI.mmBtnVsModeSel,    'ui/elements/main_menu/mm_btn_vsmode_sel.png'],
  [UI.mmBtnCharSelect,   'ui/elements/main_menu/mm_btn_charselect.png'],
  [UI.mmBtnCharSelectSel,'ui/elements/main_menu/mm_btn_charselect_sel.png'],
  [UI.mmBtnVenueMap,     'ui/elements/main_menu/mm_btn_venuemap.png'],
  [UI.mmBtnVenueMapSel,  'ui/elements/main_menu/mm_btn_venuemap_sel.png'],
  [UI.mmBtnOptions,      'ui/elements/main_menu/mm_btn_options.png'],
  [UI.mmBtnOptionsSel,   'ui/elements/main_menu/mm_btn_options_sel.png'],
  [UI.mmBtnExit,         'ui/elements/main_menu/mm_btn_exit.png'],
  [UI.mmBtnExitSel,      'ui/elements/main_menu/mm_btn_exit_sel.png'],

  // ── HUD ──────────────────────────────────────────────────────────────────
  [UI.hudPortraitFrame,  'ui/elements/hud/hud_portrait_frame.png'],
  [UI.hudHealthBar,      'ui/elements/hud/hud_health_bar.png'],
  [UI.hudSuperBar,       'ui/elements/hud/hud_super_bar.png'],
  [UI.hudGuardBar,       'ui/elements/hud/hud_guard_bar.png'],
  [UI.hudBossBar,        'ui/elements/hud/hud_boss_bar.png'],
  [UI.hudTimer,          'ui/elements/hud/hud_timer.png'],
  [UI.hudComboCounter,   'ui/elements/hud/hud_combo_counter.png'],
  [UI.hudComboLabel,     'ui/elements/hud/hud_combo_label.png'],
  [UI.hudScoreChip,      'ui/elements/hud/hud_score_chip.png'],
  [UI.hudDanger,         'ui/elements/hud/hud_danger.png'],
  [UI.hudHitFlash,       'ui/elements/hud/hud_hit_flash.png'],
  [UI.hudObjective,      'ui/elements/hud/hud_objective.png'],
  [UI.hudShieldLogo,     'ui/elements/hud/hud_shield_logo.png'],
  [UI.hudIconCrown,      'ui/elements/hud/hud_icon_crown.png'],
  [UI.hudIconLightning,  'ui/elements/hud/hud_icon_lightning.png'],
  [UI.hudIconShield,     'ui/elements/hud/hud_icon_shield.png'],
  [UI.hudIconSkull,      'ui/elements/hud/hud_icon_skull.png'],
  [UI.hudIconStar,       'ui/elements/hud/hud_icon_star.png'],
  [UI.hudPipStar,        'ui/elements/hud/hud_pip_star.png'],
  [UI.hudControls,       'ui/elements/hud/hud_controls.png'],
  [UI.hudBtnLight,       'ui/elements/hud/hud_btn_light.png'],
  [UI.hudBtnHeavy,       'ui/elements/hud/hud_btn_heavy.png'],
  [UI.hudBtnBlock,       'ui/elements/hud/hud_btn_block.png'],
  [UI.hudBtnSpecial,     'ui/elements/hud/hud_btn_special.png'],

  // ── Pause Menu ───────────────────────────────────────────────────────────
  [UI.pmTitleBanner,     'ui/elements/pause/pm_title_banner.png'],
  [UI.pmPanelLeft,       'ui/elements/pause/pm_panel_left.png'],
  [UI.pmPanelRight,      'ui/elements/pause/pm_panel_right.png'],
  [UI.pmPanelWide,       'ui/elements/pause/pm_panel_wide.png'],
  [UI.pmOverlayMd,       'ui/elements/pause/pm_overlay_md.png'],
  [UI.pmOverlaySm,       'ui/elements/pause/pm_overlay_sm.png'],
  [UI.pmBtnContinue,     'ui/elements/pause/pm_btn_continue_default.png'],
  [UI.pmBtnContinueHov,  'ui/elements/pause/pm_btn_continue_hover.png'],
  [UI.pmBtnRestart,      'ui/elements/pause/pm_btn_restart_default.png'],
  [UI.pmBtnRestartHov,   'ui/elements/pause/pm_btn_restart_hover.png'],
  [UI.pmBtnRetry,        'ui/elements/pause/pm_btn_retry_default.png'],
  [UI.pmBtnRetryHov,     'ui/elements/pause/pm_btn_retry_hover.png'],
  [UI.pmBtnSettings,     'ui/elements/pause/pm_btn_settings_default.png'],
  [UI.pmBtnSettingsHov,  'ui/elements/pause/pm_btn_settings_hover.png'],
  [UI.pmBtnQuit,         'ui/elements/pause/pm_btn_quit_default.png'],
  [UI.pmBtnQuitHov,      'ui/elements/pause/pm_btn_quit_hover.png'],
  [UI.pmTabMission,      'ui/elements/pause/pm_tab_mission.png'],
  [UI.pmTabSettings,     'ui/elements/pause/pm_tab_settings.png'],
  [UI.pmTabStats,        'ui/elements/pause/pm_tab_stats.png'],
  [UI.pmRowDefault,      'ui/elements/pause/pm_row_default.png'],
  [UI.pmRowHighlight1,   'ui/elements/pause/pm_row_highlight_01.png'],
  [UI.pmRowHighlight2,   'ui/elements/pause/pm_row_highlight_02.png'],
  [UI.pmSaveBadge,       'ui/elements/pause/pm_save_badge.png'],
  [UI.pmDialogConfirm,   'ui/elements/pause/pm_dialog_confirm.png'],
  [UI.pmPromptA,         'ui/elements/pause/pm_prompt_a.png'],
  [UI.pmPromptB,         'ui/elements/pause/pm_prompt_b.png'],
  [UI.pmPromptX,         'ui/elements/pause/pm_prompt_x.png'],
  [UI.pmPromptY,         'ui/elements/pause/pm_prompt_y.png'],
  [UI.pmPromptMenu,      'ui/elements/pause/pm_prompt_menu.png'],

  // ── Stage Select ─────────────────────────────────────────────────────────
  [UI.ssMapFrame,        'ui/elements/stage_select/ss_map_frame.png'],
  [UI.ssStageInfoPanel,  'ui/elements/stage_select/ss_stage_info_panel.png'],
  [UI.ssRouteNodes,      'ui/elements/stage_select/ss_route_nodes.png'],
  [UI.ssRouteArrows,     'ui/elements/stage_select/ss_route_arrows.png'],
  [UI.ssStageBadgesUnlocked, 'ui/elements/stage_select/ss_stage_badges_unlocked.png'],
  [UI.ssStageBadgesLocked,   'ui/elements/stage_select/ss_stage_badges_locked.png'],
  [UI.ssVenueCard1,      'ui/elements/stage_select/ss_venue_card_1.png'],
  [UI.ssVenueCard2,      'ui/elements/stage_select/ss_venue_card_2.png'],
  [UI.ssVenueCard3,      'ui/elements/stage_select/ss_venue_card_3.png'],
  [UI.ssVenueCard4,      'ui/elements/stage_select/ss_venue_card_4.png'],
  [UI.ssVenueCards,      'ui/elements/stage_select/ss_venue_cards.png'],
  [UI.ssObjectiveChip,   'ui/elements/stage_select/ss_objective_chip.png'],
  [UI.ssCheckpointIcons, 'ui/elements/stage_select/ss_checkpoint_icons.png'],
  [UI.ssLegendPanel,     'ui/elements/stage_select/ss_legend_panel.png'],
  [UI.ssFastTravelBtn,   'ui/elements/stage_select/ss_fast_travel_btn.png'],
  [UI.ssPreviewFrames,   'ui/elements/stage_select/ss_preview_frames.png'],

  // ── VS Screen ────────────────────────────────────────────────────────────
  [UI.vsTitleLogo,       'ui/elements/vs_screen/vs_title_logo.png'],
  [UI.vsEmblem,          'ui/elements/vs_screen/vs_emblem.png'],
  [UI.vsNameplateP1,     'ui/elements/vs_screen/vs_nameplate_p1.png'],
  [UI.vsNameplateP2,     'ui/elements/vs_screen/vs_nameplate_p2.png'],
  [UI.vsPortraitLargeL,  'ui/elements/vs_screen/vs_portrait_large_l.png'],
  [UI.vsPortraitLargeR,  'ui/elements/vs_screen/vs_portrait_large_r.png'],
  [UI.vsPortraitMed,     'ui/elements/vs_screen/vs_portrait_med.png'],
  [UI.vsPortraitSmall,   'ui/elements/vs_screen/vs_portrait_small.png'],
  [UI.vsRoundIndicators, 'ui/elements/vs_screen/vs_round_indicators.png'],
  [UI.vsWinDots,         'ui/elements/vs_screen/vs_win_dots.png'],
  [UI.vsRankBadges,      'ui/elements/vs_screen/vs_rank_badges.png'],
  [UI.vsLevelChips,      'ui/elements/vs_screen/vs_level_chips.png'],
  [UI.vsMatchRules,      'ui/elements/vs_screen/vs_match_rules.png'],
  [UI.vsProgressBar,     'ui/elements/vs_screen/vs_progress_bar.png'],
  [UI.vsBtnChips,        'ui/elements/vs_screen/vs_btn_chips.png'],
  [UI.vsReadyMarkers,    'ui/elements/vs_screen/vs_ready_markers.png'],
  [UI.vsWinnerMarkers,   'ui/elements/vs_screen/vs_winner_markers.png'],
  [UI.vsStageBanners,    'ui/elements/vs_screen/vs_stage_banners.png'],

  // ── Character Select ─────────────────────────────────────────────────────
  [UI.csTitleBanner,     'ui/elements/char_select/cs_title_banner.png'],
  [UI.csPortraitFrameLarge, 'ui/elements/char_select/cs_portrait_frame_large.png'],
  [UI.csSlotGrid,        'ui/elements/char_select/cs_slot_grid.png'],
  [UI.csSlotIdle,        'ui/elements/char_select/cs_slot_idle.png'],
  [UI.csSlotSelected,    'ui/elements/char_select/cs_slot_selected.png'],
  [UI.csStatPanel,       'ui/elements/char_select/cs_stat_panel.png'],
  [UI.csCategoryTabs,    'ui/elements/char_select/cs_category_tabs.png'],
  [UI.csColorTabs,       'ui/elements/char_select/cs_color_tabs.png'],
  [UI.csDivider,         'ui/elements/char_select/cs_divider.png'],
  [UI.csStyleTags,       'ui/elements/char_select/cs_style_tags.png'],
  [UI.csActionBtns,      'ui/elements/char_select/cs_action_btns.png'],
  [UI.csPromptChips,     'ui/elements/char_select/cs_prompt_chips.png'],
  [UI.csReadyCpu,        'ui/elements/char_select/cs_ready_cpu.png'],
  [UI.csInstructionStrip,'ui/elements/char_select/cs_instruction_strip.png'],
  [UI.csBottomIcons,     'ui/elements/char_select/cs_bottom_icons.png'],

  // ── LSB kit full sheets (used as scene backdrops) ─────────────────────────
  ['ui_lsb_master',       'ui/lsb_sheet_01_master_style.png'],
  ['ui_lsb_lobby',        'ui/lsb_sheet_02_lobby.png'],
  ['ui_lsb_bingo_card',   'ui/lsb_sheet_03_bingo_card.png'],
  ['ui_lsb_host_dj',      'ui/lsb_sheet_04_host_dj.png'],
  ['ui_lsb_verification', 'ui/lsb_sheet_05_card_verification.png'],
  ['ui_lsb_song_queue',   'ui/lsb_sheet_06_song_queue.png'],
  ['ui_lsb_winner',       'ui/lsb_sheet_07_winner_payout.png'],
  ['ui_lsb_membership',   'ui/lsb_sheet_08_membership.png'],
  ['ui_lsb_party_mode',   'ui/lsb_sheet_09_party_battlerz.png'],
  ['ui_lsb_tv_display',   'ui/lsb_sheet_10_tv_display.png'],

  // ── Dialogue ─────────────────────────────────────────────────────────────
  [UI.dlgFrameLarge,     'ui/elements/dialogue/dlg_frame_large.png'],
  [UI.dlgFrameMedium,    'ui/elements/dialogue/dlg_frame_medium.png'],
  [UI.dlgFrameSmall,     'ui/elements/dialogue/dlg_frame_small.png'],
  [UI.dlgSpeakerPlate,   'ui/elements/dialogue/dlg_speaker_plate.png'],
  [UI.dlgMissionStart,   'ui/elements/dialogue/dlg_mission_start.png'],
  [UI.dlgMissionUpdate,  'ui/elements/dialogue/dlg_mission_update.png'],
  [UI.dlgObjectiveComplete, 'ui/elements/dialogue/dlg_objective_complete.png'],
  [UI.dlgRewardPopup,    'ui/elements/dialogue/dlg_reward_popup.png'],
  [UI.dlgItemChip,       'ui/elements/dialogue/dlg_item_chip.png'],
  [UI.dlgSuccessAlert,   'ui/elements/dialogue/dlg_success_alert.png'],
  [UI.dlgWarningAlert,   'ui/elements/dialogue/dlg_warning_alert.png'],
  [UI.dlgXpPopup,        'ui/elements/dialogue/dlg_xp_popup.png'],
  [UI.dlgToastMission,   'ui/elements/dialogue/dlg_toast_mission.png'],
  [UI.dlgToastObjective, 'ui/elements/dialogue/dlg_toast_objective.png'],
  [UI.dlgToastComplete,  'ui/elements/dialogue/dlg_toast_complete.png'],
  [UI.dlgToastReward,    'ui/elements/dialogue/dlg_toast_reward.png'],

  // ── Dialogue mission portraits ────────────────────────────────────────
  [UI.dlgMission000, 'ui/elements/dialogue_mission/dialogue_mission_000.png'],
  [UI.dlgMission001, 'ui/elements/dialogue_mission/dialogue_mission_001.png'],
  [UI.dlgMission002, 'ui/elements/dialogue_mission/dialogue_mission_002.png'],
  [UI.dlgMission003, 'ui/elements/dialogue_mission/dialogue_mission_003.png'],
  [UI.dlgMission004, 'ui/elements/dialogue_mission/dialogue_mission_004.png'],
  [UI.dlgMission005, 'ui/elements/dialogue_mission/dialogue_mission_005.png'],
  [UI.dlgMission006, 'ui/elements/dialogue_mission/dialogue_mission_006.png'],
  [UI.dlgMission007, 'ui/elements/dialogue_mission/dialogue_mission_007.png'],
  [UI.dlgMission008, 'ui/elements/dialogue_mission/dialogue_mission_008.png'],
  [UI.dlgMission009, 'ui/elements/dialogue_mission/dialogue_mission_009.png'],
  [UI.dlgMission010, 'ui/elements/dialogue_mission/dialogue_mission_010.png'],
  [UI.dlgMission011, 'ui/elements/dialogue_mission/dialogue_mission_011.png'],
  [UI.dlgMission012, 'ui/elements/dialogue_mission/dialogue_mission_012.png'],
  [UI.dlgMission013, 'ui/elements/dialogue_mission/dialogue_mission_013.png'],
  [UI.dlgMission014, 'ui/elements/dialogue_mission/dialogue_mission_014.png'],
  [UI.dlgMission015, 'ui/elements/dialogue_mission/dialogue_mission_015.png'],

  // ── Frames & Emblems ──────────────────────────────────────────────────────
  [UI.feGameLogo,       'ui/elements/frames_emblems/frames_emblems_005.png'],
  [UI.feMainMenuBanner, 'ui/elements/frames_emblems/frames_emblems_000.png'],
  [UI.feCrown,          'ui/elements/frames_emblems/frames_emblems_001.png'],
  [UI.fePortraitFrame,  'ui/elements/frames_emblems/frames_emblems_002.png'],
  [UI.feCardFrame,      'ui/elements/frames_emblems/frames_emblems_003.png'],
  [UI.feShieldEmblem,   'ui/elements/frames_emblems/frames_emblems_004.png'],
  [UI.feCornerBR,       'ui/elements/frames_emblems/frames_emblems_006.png'],
  [UI.feCornerTL,       'ui/elements/frames_emblems/frames_emblems_010.png'],
  [UI.feLabelOptions,   'ui/elements/frames_emblems/frames_emblems_020.png'],

  // ── Title Menu panels ─────────────────────────────────────────────────────
  [UI.tmTitleBar,    'ui/elements/title_menu/title_menu_000.png'],
  [UI.tmShieldFrame, 'ui/elements/title_menu/title_menu_001.png'],
  [UI.tmPanelTall,   'ui/elements/title_menu/title_menu_002.png'],
  [UI.tmPanelFull,   'ui/elements/title_menu/title_menu_003.png'],
  [UI.tmCorner,      'ui/elements/title_menu/title_menu_010.png'],

  // ── Venue Map elements ────────────────────────────────────────────────────
  [UI.vmMapFrame,        'ui/elements/venue_map/venue_map_000.png'],
  [UI.vmVenueCardPair,   'ui/elements/venue_map/venue_map_001.png'],
  [UI.vmVenueCardOpen,   'ui/elements/venue_map/venue_map_002.png'],
  [UI.vmVenueCardLocked, 'ui/elements/venue_map/venue_map_003.png'],
  [UI.vmStageBadge4,     'ui/elements/venue_map/venue_map_004.png'],
  [UI.vmStageBadge1,     'ui/elements/venue_map/venue_map_005.png'],
  [UI.vmStageBadge2,     'ui/elements/venue_map/venue_map_006.png'],
  [UI.vmStageBadge3,     'ui/elements/venue_map/venue_map_007.png'],
  [UI.vmStageBadge7,     'ui/elements/venue_map/venue_map_008.png'],
  [UI.vmStageBadge5,     'ui/elements/venue_map/venue_map_009.png'],
  [UI.vmStageBadge6,     'ui/elements/venue_map/venue_map_010.png'],
  [UI.vmStageBadge8,     'ui/elements/venue_map/venue_map_011.png'],
  [UI.vmThumb0,          'ui/elements/venue_map/venue_map_012.png'],
  [UI.vmThumb1,          'ui/elements/venue_map/venue_map_013.png'],
  [UI.vmThumb2,          'ui/elements/venue_map/venue_map_014.png'],
  [UI.vmThumb3,          'ui/elements/venue_map/venue_map_015.png'],
  [UI.vmInfoPanel,       'ui/elements/venue_map/venue_map_016.png'],
  [UI.vmMapPin,          'ui/elements/venue_map/venue_map_020.png'],
  [UI.vmCrownPin,        'ui/elements/venue_map/venue_map_021.png'],
  [UI.vmStarBadge,       'ui/elements/venue_map/venue_map_030.png'],
];

export const UISystem = {
  queue(scene: Phaser.Scene): void {
    for (const [key, path] of FILES) {
      if (!scene.textures.exists(key)) {
        scene.load.image(key, `${ASSET_BASE}${path}`);
      }
    }
    for (let d = 0; d <= 9; d++) {
      const key = UI.digit(d);
      if (!scene.textures.exists(key)) {
        scene.load.image(key, `${ASSET_BASE}ui/elements/hud/digit_${d}.png`);
      }
    }
  },

  ready(scene: Phaser.Scene): boolean {
    return scene.textures.exists(UI.mmLogo);
  },

  backdrop(scene: Phaser.Scene, key: string, alpha = 1, depth = -5000): Phaser.GameObjects.Image | null {
    if (!scene.textures.exists(key)) return null;
    const { width, height } = scene.scale;
    return scene.add.image(0, 0, key)
      .setOrigin(0, 0)
      .setDisplaySize(width, height)
      .setAlpha(alpha)
      .setDepth(depth)
      .setScrollFactor(0);
  },

  // Place an element image; returns null if texture not loaded.
  place(
    scene: Phaser.Scene,
    key: string,
    x: number,
    y: number,
    opts: { originX?: number; originY?: number; scale?: number; depth?: number; alpha?: number } = {},
  ): Phaser.GameObjects.Image | null {
    if (!scene.textures.exists(key)) return null;
    return scene.add.image(x, y, key)
      .setOrigin(opts.originX ?? 0.5, opts.originY ?? 0.5)
      .setScale(opts.scale ?? 1)
      .setDepth(opts.depth ?? 0)
      .setAlpha(opts.alpha ?? 1)
      .setScrollFactor(0);
  },
};

// ── NumberDisplay ─────────────────────────────────────────────────────────────
export class NumberDisplay {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private digits: Phaser.GameObjects.Image[] = [];
  private height: number;
  private align: 'left' | 'right';
  private baseX: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    height = 22,
    align: 'left' | 'right' = 'left',
  ) {
    this.scene = scene;
    this.height = height;
    this.align = align;
    this.baseX = x;
    this.container = scene.add.container(x, y).setScrollFactor(0).setDepth(60000);
  }

  setValue(value: number): void {
    const str = String(Math.max(0, Math.round(value)));
    while (this.digits.length < str.length) {
      const img = this.scene.add.image(0, 0, UI.digit(0)).setOrigin(0, 0.5);
      this.container.add(img);
      this.digits.push(img);
    }
    let cursor = 0;
    const gap = this.height * 0.06;
    for (let i = 0; i < str.length; i++) {
      const img = this.digits[i];
      img.setTexture(UI.digit(str[i])).setVisible(true);
      const tex = this.scene.textures.get(UI.digit(str[i])).getSourceImage();
      const w = (tex.width / tex.height) * this.height;
      img.setDisplaySize(w, this.height).setPosition(cursor, 0);
      cursor += w + gap;
    }
    for (let i = str.length; i < this.digits.length; i++) {
      this.digits[i].setVisible(false);
    }
    this.container.x = this.align === 'right' ? this.baseX - cursor : this.baseX;
  }

  setDepth(d: number): this { this.container.setDepth(d); return this; }
  setVisible(v: boolean): this { this.container.setVisible(v); return this; }
}
