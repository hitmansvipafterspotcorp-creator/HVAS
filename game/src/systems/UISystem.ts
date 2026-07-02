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
  vsAssembledPreview: 'vs_assembled_preview',
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

  // ── Character Select numbered crops ──────────────────────────────────────
  csxPortraitGold:   'character_select_000',  // gold/neon unlocked portrait frame
  csxPortraitPurple: 'character_select_001',  // purple unlocked portrait frame
  csxPortraitLocked: 'character_select_002',  // red/locked portrait frame
  csxStatPanel:      'character_select_003',  // stat panel (unlocked)
  csxStatPanelLock:  'character_select_004',  // stat panel (locked)
  csxNameBar:        'character_select_005',  // wide name/alias bar
  csxRankShield:     'character_select_010',  // shield rank badge
  csxRankStar:       'character_select_020',  // hex star rank badge
  csxDecor006:       'character_select_006',
  csxDecor007:       'character_select_007',
  csxDecor008:       'character_select_008',
  csxDecor009:       'character_select_009',
  csxDecor011:       'character_select_011',
  csxDecor012:       'character_select_012',
  csxDecor013:       'character_select_013',
  csxDecor014:       'character_select_014',
  csxDecor015:       'character_select_015',
  csxDecor016:       'character_select_016',
  csxDecor017:       'character_select_017',
  csxDecor018:       'character_select_018',
  csxDecor019:       'character_select_019',
  csxDecor021:       'character_select_021',
  csxDecor022:       'character_select_022',
  csxDecor023:       'character_select_023',
  csxDecor024:       'character_select_024',
  csxDecor025:       'character_select_025',
  csxDecor026:       'character_select_026',
  csxDecor027:       'character_select_027',
  csxDecor028:       'character_select_028',
  csxDecor029:       'character_select_029',
  csxDecor030:       'character_select_030',
  csxDecor031:       'character_select_031',
  csxDecor032:       'character_select_032',
  csxDecor033:       'character_select_033',
  csxDecor034:       'character_select_034',
  csxDecor035:       'character_select_035',
  csxDecor036:       'character_select_036',
  csxDecor037:       'character_select_037',
  csxDecor038:       'character_select_038',
  csxDecor039:       'character_select_039',
  csxDecor040:       'character_select_040',
  csxDecor041:       'character_select_041',
  csxDecor042:       'character_select_042',
  csxDecor043:       'character_select_043',

  // ── Pause Menu numbered crops ─────────────────────────────────────────────
  pmxTitle:          'pause_menu_000',        // PAUSE MENU title banner
  pmxFullMockup:     'pause_menu_001',        // complete pause menu mockup
  pmxPanelSmall:     'pause_menu_002',        // small transparent panel
  pmxPanelWide:      'pause_menu_003',        // wide dark panel
  pmxBtnPanel:       'pause_menu_004',        // 4-slot button panel
  pmxPanelLarge:     'pause_menu_005',        // large panel frame
  pmxMissionSummary: 'pause_menu_006',        // Mission Summary side panel
  pmxConfirmDialog:  'pause_menu_007',        // Confirmation dialog
  pmxDecor008:       'pause_menu_008',
  pmxDecor009:       'pause_menu_009',
  pmxDecor010:       'pause_menu_010',
  pmxDecor011:       'pause_menu_011',
  pmxDecor012:       'pause_menu_012',
  pmxDecor013:       'pause_menu_013',
  pmxDecor014:       'pause_menu_014',
  pmxDecor015:       'pause_menu_015',
  pmxDecor016:       'pause_menu_016',
  pmxDecor017:       'pause_menu_017',
  pmxDecor018:       'pause_menu_018',
  pmxDecor019:       'pause_menu_019',
  pmxDecor020:       'pause_menu_020',
  pmxDecor021:       'pause_menu_021',
  pmxDecor022:       'pause_menu_022',
  pmxDecor023:       'pause_menu_023',
  pmxDecor024:       'pause_menu_024',
  pmxDecor025:       'pause_menu_025',
  pmxDecor026:       'pause_menu_026',
  pmxDecor027:       'pause_menu_027',
  pmxDecor028:       'pause_menu_028',
  pmxDecor029:       'pause_menu_029',
  pmxDecor030:       'pause_menu_030',
  pmxDecor031:       'pause_menu_031',
  pmxDecor032:       'pause_menu_032',
  pmxDecor033:       'pause_menu_033',
  pmxDecor034:       'pause_menu_034',

  // ── Options/Settings numbered crops ──────────────────────────────────────
  osxPanel:          'options_settings_000',  // full settings panel
  osxSidebar:        'options_settings_001',  // category sidebar
  osxSliderRow:      'options_settings_002',  // volume slider row
  osxToggleRow:      'options_settings_003',  // toggle (Music ON/OFF)
  osxDecor004:       'options_settings_004',
  osxDecor005:       'options_settings_005',
  osxDecor006:       'options_settings_006',
  osxDecor007:       'options_settings_007',
  osxDecor008:       'options_settings_008',
  osxDecor009:       'options_settings_009',
  osxDecor010:       'options_settings_010',
  osxDecor011:       'options_settings_011',
  osxDecor012:       'options_settings_012',
  osxDecor013:       'options_settings_013',
  osxDecor014:       'options_settings_014',
  osxDecor015:       'options_settings_015',
  osxDecor016:       'options_settings_016',
  osxDecor017:       'options_settings_017',
  osxDecor018:       'options_settings_018',
  osxDecor019:       'options_settings_019',
  osxDecor020:       'options_settings_020',
  osxDecor021:       'options_settings_021',
  osxDecor022:       'options_settings_022',
  osxDecor023:       'options_settings_023',
  osxDecor024:       'options_settings_024',
  osxDecor025:       'options_settings_025',
  osxDecor026:       'options_settings_026',
  osxDecor027:       'options_settings_027',
  osxDecor028:       'options_settings_028',
  osxDecor029:       'options_settings_029',
  osxDecor030:       'options_settings_030',
  osxDecor031:       'options_settings_031',
  osxDecor032:       'options_settings_032',

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
  feDecorA:          'frames_emblems_007',
  feDecorB:          'frames_emblems_008',
  feDecorC:          'frames_emblems_009',
  feBannerA:         'frames_emblems_011',
  feBannerB:         'frames_emblems_012',
  feBannerC:         'frames_emblems_013',
  feBannerD:         'frames_emblems_014',
  feBannerE:         'frames_emblems_015',
  feBannerF:         'frames_emblems_016',
  feBannerG:         'frames_emblems_017',
  feBannerH:         'frames_emblems_018',
  feBannerI:         'frames_emblems_019',
  feDecorD:          'frames_emblems_021',
  feDecorE:          'frames_emblems_022',
  feDecorF:          'frames_emblems_023',
  feDecorG:          'frames_emblems_024',
  feDecorH:          'frames_emblems_025',
  feDecorI:          'frames_emblems_026',
  feDecorJ:          'frames_emblems_027',

  // ── Title Menu panel crops ────────────────────────────────────────────────
  tmTitleBar:        'title_menu_000',       // wide gold/purple title bar
  tmShieldFrame:     'title_menu_001',       // shield/portrait frame
  tmPanelTall:       'title_menu_002',       // tall side panel (left)
  tmPanelFull:       'title_menu_003',       // full panel frame
  tmCorner:          'title_menu_010',       // corner ornament (gold/purple)
  tmDecor004:        'title_menu_004',
  tmDecor005:        'title_menu_005',
  tmDecor006:        'title_menu_006',
  tmDecor007:        'title_menu_007',
  tmDecor008:        'title_menu_008',
  tmDecor009:        'title_menu_009',
  tmDecor011:        'title_menu_011',
  tmDecor012:        'title_menu_012',
  tmDecor013:        'title_menu_013',
  tmDecor014:        'title_menu_014',
  tmDecor015:        'title_menu_015',
  tmDecor016:        'title_menu_016',
  tmDecor017:        'title_menu_017',
  tmDecor018:        'title_menu_018',
  tmDecor019:        'title_menu_019',
  tmDecor020:        'title_menu_020',
  tmDecor021:        'title_menu_021',
  tmDecor022:        'title_menu_022',
  tmDecor023:        'title_menu_023',
  tmDecor024:        'title_menu_024',
  tmDecor025:        'title_menu_025',
  tmDecor026:        'title_menu_026',
  tmDecor027:        'title_menu_027',
  tmDecor028:        'title_menu_028',
  tmDecor029:        'title_menu_029',
  tmDecor030:        'title_menu_030',
  tmDecor031:        'title_menu_031',
  tmDecor032:        'title_menu_032',
  tmDecor033:        'title_menu_033',
  tmDecor034:        'title_menu_034',
  tmDecor035:        'title_menu_035',
  tmDecor036:        'title_menu_036',
  tmDecor037:        'title_menu_037',
  tmDecor038:        'title_menu_038',
  tmDecor039:        'title_menu_039',
  tmDecor040:        'title_menu_040',
  tmDecor041:        'title_menu_041',
  tmDecor042:        'title_menu_042',
  tmDecor043:        'title_menu_043',
  tmDecor044:        'title_menu_044',
  tmDecor045:        'title_menu_045',
  tmDecor046:        'title_menu_046',
  tmDecor047:        'title_menu_047',
  tmDecor048:        'title_menu_048',
  tmDecor049:        'title_menu_049',
  tmDecor050:        'title_menu_050',
  tmDecor052:        'title_menu_052',
  tmDecor053:        'title_menu_053',
  tmDecor054:        'title_menu_054',
  tmDecor055:        'title_menu_055',
  tmDecor056:        'title_menu_056',
  tmDecor057:        'title_menu_057',

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
  vmDecor017:        'venue_map_017',
  vmDecor018:        'venue_map_018',
  vmDecor019:        'venue_map_019',
  vmDecor022:        'venue_map_022',
  vmDecor023:        'venue_map_023',
  vmDecor024:        'venue_map_024',
  vmDecor026:        'venue_map_026',
  vmDecor027:        'venue_map_027',
  vmDecor028:        'venue_map_028',
  vmStarBadge:       'venue_map_030',        // star rating badge
  vmDecor031:        'venue_map_031',
  vmDecor032:        'venue_map_032',
  vmDecor033:        'venue_map_033',
  vmDecor034:        'venue_map_034',
  vmDecor035:        'venue_map_035',
  vmDecor036:        'venue_map_036',
  vmDecor037:        'venue_map_037',

  // ── UI Kit 01 — named components ─────────────────────────────────────────
  u1BtnPrimary:      'u1_btn_primary',
  u1BtnPrimaryHov:   'u1_btn_primary_hover',
  u1BtnPrimaryPress: 'u1_btn_primary_pressed',
  u1BtnSecondary:    'u1_btn_secondary',
  u1BtnBack:         'u1_btn_back',
  u1BtnConfirm:      'u1_btn_confirm',
  u1BtnDanger:       'u1_btn_danger',
  u1BtnGhost:        'u1_btn_ghost',
  u1TabActive:       'u1_tab_active',
  u1TabHover:        'u1_tab_hover',
  u1TabIdle:         'u1_tab_idle',
  u1TabLocked:       'u1_tab_locked',
  u1TitleBar1:       'u1_title_bar_1',
  u1TitleBar2:       'u1_title_bar_2',
  u1TitleBar3:       'u1_title_bar_3',
  u1TitleBar4:       'u1_title_bar_4',
  u1CornerBrackets:  'u1_corner_brackets',
  u1SeparatorThin:   'u1_separator_thin',
  u1NotifyChips:     'u1_notify_chips',    // star/skull/VIP hex badges strip
  u1MotifCrown:      'u1_motif_crown',
  u1MotifShield:     'u1_motif_shield',

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
  // Individually-sliced membership components (assets/ui/lsb/membership/)
  memDuesCardA:      'lsb_mem_dues_card_a',
  memDuesCardB:      'lsb_mem_dues_card_b',
  memBadgeBronze:    'lsb_mem_badge_bronze',
  memBadgeSilver:    'lsb_mem_badge_silver',
  memBadgeGold:      'lsb_mem_badge_gold',
  memBadgePlatinum:  'lsb_mem_badge_platinum',
  memStatusChip:     'lsb_mem_status_chip',
  memCardPacksChip:  'lsb_mem_cardpacks_chip',
  memPaymentChip:    'lsb_mem_payment_chip',
  memFooterChip1:    'lsb_mem_footer_1',
  memFooterChip2:    'lsb_mem_footer_2',
  memFooterChip3:    'lsb_mem_footer_3',
  memFooterChip4:    'lsb_mem_footer_4',
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
  [UI.vsAssembledPreview, 'ui/elements/vs_screen/vs_assembled_preview.png'],
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

  // ── LSB — individually-sliced membership components ────────────────────────
  ['lsb_mem_dues_card_a',   'ui/lsb/membership/membership_10.png'],
  ['lsb_mem_dues_card_b',   'ui/lsb/membership/membership_11.png'],
  ['lsb_mem_badge_bronze',  'ui/lsb/membership/membership_20.png'],
  ['lsb_mem_badge_silver',  'ui/lsb/membership/membership_21.png'],
  ['lsb_mem_badge_gold',    'ui/lsb/membership/membership_22.png'],
  ['lsb_mem_badge_platinum','ui/lsb/membership/membership_23.png'],
  ['lsb_mem_status_chip',   'ui/lsb/membership/membership_24.png'],
  ['lsb_mem_cardpacks_chip','ui/lsb/membership/membership_08.png'],
  ['lsb_mem_payment_chip',  'ui/lsb/membership/membership_09.png'],
  ['lsb_mem_footer_1',      'ui/lsb/membership/membership_30.png'],
  ['lsb_mem_footer_2',      'ui/lsb/membership/membership_31.png'],
  ['lsb_mem_footer_3',      'ui/lsb/membership/membership_32.png'],
  ['lsb_mem_footer_4',      'ui/lsb/membership/membership_33.png'],

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

  // ── Character Select numbered ─────────────────────────────────────────────
  [UI.csxPortraitGold,   'ui/elements/character_select/character_select_000.png'],
  [UI.csxPortraitPurple, 'ui/elements/character_select/character_select_001.png'],
  [UI.csxPortraitLocked, 'ui/elements/character_select/character_select_002.png'],
  [UI.csxStatPanel,      'ui/elements/character_select/character_select_003.png'],
  [UI.csxStatPanelLock,  'ui/elements/character_select/character_select_004.png'],
  [UI.csxNameBar,        'ui/elements/character_select/character_select_005.png'],
  [UI.csxRankShield,     'ui/elements/character_select/character_select_010.png'],
  [UI.csxRankStar,       'ui/elements/character_select/character_select_020.png'],
  [UI.csxDecor006,       'ui/elements/character_select/character_select_006.png'],
  [UI.csxDecor007,       'ui/elements/character_select/character_select_007.png'],
  [UI.csxDecor008,       'ui/elements/character_select/character_select_008.png'],
  [UI.csxDecor009,       'ui/elements/character_select/character_select_009.png'],
  [UI.csxDecor011,       'ui/elements/character_select/character_select_011.png'],
  [UI.csxDecor012,       'ui/elements/character_select/character_select_012.png'],
  [UI.csxDecor013,       'ui/elements/character_select/character_select_013.png'],
  [UI.csxDecor014,       'ui/elements/character_select/character_select_014.png'],
  [UI.csxDecor015,       'ui/elements/character_select/character_select_015.png'],
  [UI.csxDecor016,       'ui/elements/character_select/character_select_016.png'],
  [UI.csxDecor017,       'ui/elements/character_select/character_select_017.png'],
  [UI.csxDecor018,       'ui/elements/character_select/character_select_018.png'],
  [UI.csxDecor019,       'ui/elements/character_select/character_select_019.png'],
  [UI.csxDecor021,       'ui/elements/character_select/character_select_021.png'],
  [UI.csxDecor022,       'ui/elements/character_select/character_select_022.png'],
  [UI.csxDecor023,       'ui/elements/character_select/character_select_023.png'],
  [UI.csxDecor024,       'ui/elements/character_select/character_select_024.png'],
  [UI.csxDecor025,       'ui/elements/character_select/character_select_025.png'],
  [UI.csxDecor026,       'ui/elements/character_select/character_select_026.png'],
  [UI.csxDecor027,       'ui/elements/character_select/character_select_027.png'],
  [UI.csxDecor028,       'ui/elements/character_select/character_select_028.png'],
  [UI.csxDecor029,       'ui/elements/character_select/character_select_029.png'],
  [UI.csxDecor030,       'ui/elements/character_select/character_select_030.png'],
  [UI.csxDecor031,       'ui/elements/character_select/character_select_031.png'],
  [UI.csxDecor032,       'ui/elements/character_select/character_select_032.png'],
  [UI.csxDecor033,       'ui/elements/character_select/character_select_033.png'],
  [UI.csxDecor034,       'ui/elements/character_select/character_select_034.png'],
  [UI.csxDecor035,       'ui/elements/character_select/character_select_035.png'],
  [UI.csxDecor036,       'ui/elements/character_select/character_select_036.png'],
  [UI.csxDecor037,       'ui/elements/character_select/character_select_037.png'],
  [UI.csxDecor038,       'ui/elements/character_select/character_select_038.png'],
  [UI.csxDecor039,       'ui/elements/character_select/character_select_039.png'],
  [UI.csxDecor040,       'ui/elements/character_select/character_select_040.png'],
  [UI.csxDecor041,       'ui/elements/character_select/character_select_041.png'],
  [UI.csxDecor042,       'ui/elements/character_select/character_select_042.png'],
  [UI.csxDecor043,       'ui/elements/character_select/character_select_043.png'],

  // ── Pause Menu numbered ───────────────────────────────────────────────────
  [UI.pmxTitle,          'ui/elements/pause_menu/pause_menu_000.png'],
  [UI.pmxFullMockup,     'ui/elements/pause_menu/pause_menu_001.png'],
  [UI.pmxPanelSmall,     'ui/elements/pause_menu/pause_menu_002.png'],
  [UI.pmxPanelWide,      'ui/elements/pause_menu/pause_menu_003.png'],
  [UI.pmxBtnPanel,       'ui/elements/pause_menu/pause_menu_004.png'],
  [UI.pmxPanelLarge,     'ui/elements/pause_menu/pause_menu_005.png'],
  [UI.pmxMissionSummary, 'ui/elements/pause_menu/pause_menu_006.png'],
  [UI.pmxConfirmDialog,  'ui/elements/pause_menu/pause_menu_007.png'],
  [UI.pmxDecor008,       'ui/elements/pause_menu/pause_menu_008.png'],
  [UI.pmxDecor009,       'ui/elements/pause_menu/pause_menu_009.png'],
  [UI.pmxDecor010,       'ui/elements/pause_menu/pause_menu_010.png'],
  [UI.pmxDecor011,       'ui/elements/pause_menu/pause_menu_011.png'],
  [UI.pmxDecor012,       'ui/elements/pause_menu/pause_menu_012.png'],
  [UI.pmxDecor013,       'ui/elements/pause_menu/pause_menu_013.png'],
  [UI.pmxDecor014,       'ui/elements/pause_menu/pause_menu_014.png'],
  [UI.pmxDecor015,       'ui/elements/pause_menu/pause_menu_015.png'],
  [UI.pmxDecor016,       'ui/elements/pause_menu/pause_menu_016.png'],
  [UI.pmxDecor017,       'ui/elements/pause_menu/pause_menu_017.png'],
  [UI.pmxDecor018,       'ui/elements/pause_menu/pause_menu_018.png'],
  [UI.pmxDecor019,       'ui/elements/pause_menu/pause_menu_019.png'],
  [UI.pmxDecor020,       'ui/elements/pause_menu/pause_menu_020.png'],
  [UI.pmxDecor021,       'ui/elements/pause_menu/pause_menu_021.png'],
  [UI.pmxDecor022,       'ui/elements/pause_menu/pause_menu_022.png'],
  [UI.pmxDecor023,       'ui/elements/pause_menu/pause_menu_023.png'],
  [UI.pmxDecor024,       'ui/elements/pause_menu/pause_menu_024.png'],
  [UI.pmxDecor025,       'ui/elements/pause_menu/pause_menu_025.png'],
  [UI.pmxDecor026,       'ui/elements/pause_menu/pause_menu_026.png'],
  [UI.pmxDecor027,       'ui/elements/pause_menu/pause_menu_027.png'],
  [UI.pmxDecor028,       'ui/elements/pause_menu/pause_menu_028.png'],
  [UI.pmxDecor029,       'ui/elements/pause_menu/pause_menu_029.png'],
  [UI.pmxDecor030,       'ui/elements/pause_menu/pause_menu_030.png'],
  [UI.pmxDecor031,       'ui/elements/pause_menu/pause_menu_031.png'],
  [UI.pmxDecor032,       'ui/elements/pause_menu/pause_menu_032.png'],
  [UI.pmxDecor033,       'ui/elements/pause_menu/pause_menu_033.png'],
  [UI.pmxDecor034,       'ui/elements/pause_menu/pause_menu_034.png'],

  // ── Options/Settings numbered ─────────────────────────────────────────────
  [UI.osxPanel,          'ui/elements/options_settings/options_settings_000.png'],
  [UI.osxSidebar,        'ui/elements/options_settings/options_settings_001.png'],
  [UI.osxSliderRow,      'ui/elements/options_settings/options_settings_002.png'],
  [UI.osxToggleRow,      'ui/elements/options_settings/options_settings_003.png'],
  [UI.osxDecor004,       'ui/elements/options_settings/options_settings_004.png'],
  [UI.osxDecor005,       'ui/elements/options_settings/options_settings_005.png'],
  [UI.osxDecor006,       'ui/elements/options_settings/options_settings_006.png'],
  [UI.osxDecor007,       'ui/elements/options_settings/options_settings_007.png'],
  [UI.osxDecor008,       'ui/elements/options_settings/options_settings_008.png'],
  [UI.osxDecor009,       'ui/elements/options_settings/options_settings_009.png'],
  [UI.osxDecor010,       'ui/elements/options_settings/options_settings_010.png'],
  [UI.osxDecor011,       'ui/elements/options_settings/options_settings_011.png'],
  [UI.osxDecor012,       'ui/elements/options_settings/options_settings_012.png'],
  [UI.osxDecor013,       'ui/elements/options_settings/options_settings_013.png'],
  [UI.osxDecor014,       'ui/elements/options_settings/options_settings_014.png'],
  [UI.osxDecor015,       'ui/elements/options_settings/options_settings_015.png'],
  [UI.osxDecor016,       'ui/elements/options_settings/options_settings_016.png'],
  [UI.osxDecor017,       'ui/elements/options_settings/options_settings_017.png'],
  [UI.osxDecor018,       'ui/elements/options_settings/options_settings_018.png'],
  [UI.osxDecor019,       'ui/elements/options_settings/options_settings_019.png'],
  [UI.osxDecor020,       'ui/elements/options_settings/options_settings_020.png'],
  [UI.osxDecor021,       'ui/elements/options_settings/options_settings_021.png'],
  [UI.osxDecor022,       'ui/elements/options_settings/options_settings_022.png'],
  [UI.osxDecor023,       'ui/elements/options_settings/options_settings_023.png'],
  [UI.osxDecor024,       'ui/elements/options_settings/options_settings_024.png'],
  [UI.osxDecor025,       'ui/elements/options_settings/options_settings_025.png'],
  [UI.osxDecor026,       'ui/elements/options_settings/options_settings_026.png'],
  [UI.osxDecor027,       'ui/elements/options_settings/options_settings_027.png'],
  [UI.osxDecor028,       'ui/elements/options_settings/options_settings_028.png'],
  [UI.osxDecor029,       'ui/elements/options_settings/options_settings_029.png'],
  [UI.osxDecor030,       'ui/elements/options_settings/options_settings_030.png'],
  [UI.osxDecor031,       'ui/elements/options_settings/options_settings_031.png'],
  [UI.osxDecor032,       'ui/elements/options_settings/options_settings_032.png'],

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
  [UI.feDecorA,         'ui/elements/frames_emblems/frames_emblems_007.png'],
  [UI.feDecorB,         'ui/elements/frames_emblems/frames_emblems_008.png'],
  [UI.feDecorC,         'ui/elements/frames_emblems/frames_emblems_009.png'],
  [UI.feBannerA,        'ui/elements/frames_emblems/frames_emblems_011.png'],
  [UI.feBannerB,        'ui/elements/frames_emblems/frames_emblems_012.png'],
  [UI.feBannerC,        'ui/elements/frames_emblems/frames_emblems_013.png'],
  [UI.feBannerD,        'ui/elements/frames_emblems/frames_emblems_014.png'],
  [UI.feBannerE,        'ui/elements/frames_emblems/frames_emblems_015.png'],
  [UI.feBannerF,        'ui/elements/frames_emblems/frames_emblems_016.png'],
  [UI.feBannerG,        'ui/elements/frames_emblems/frames_emblems_017.png'],
  [UI.feBannerH,        'ui/elements/frames_emblems/frames_emblems_018.png'],
  [UI.feBannerI,        'ui/elements/frames_emblems/frames_emblems_019.png'],
  [UI.feDecorD,         'ui/elements/frames_emblems/frames_emblems_021.png'],
  [UI.feDecorE,         'ui/elements/frames_emblems/frames_emblems_022.png'],
  [UI.feDecorF,         'ui/elements/frames_emblems/frames_emblems_023.png'],
  [UI.feDecorG,         'ui/elements/frames_emblems/frames_emblems_024.png'],
  [UI.feDecorH,         'ui/elements/frames_emblems/frames_emblems_025.png'],
  [UI.feDecorI,         'ui/elements/frames_emblems/frames_emblems_026.png'],
  [UI.feDecorJ,         'ui/elements/frames_emblems/frames_emblems_027.png'],

  // ── Title Menu panels ─────────────────────────────────────────────────────
  [UI.tmTitleBar,    'ui/elements/title_menu/title_menu_000.png'],
  [UI.tmShieldFrame, 'ui/elements/title_menu/title_menu_001.png'],
  [UI.tmPanelTall,   'ui/elements/title_menu/title_menu_002.png'],
  [UI.tmPanelFull,   'ui/elements/title_menu/title_menu_003.png'],
  [UI.tmCorner,      'ui/elements/title_menu/title_menu_010.png'],
  [UI.tmDecor004,    'ui/elements/title_menu/title_menu_004.png'],
  [UI.tmDecor005,    'ui/elements/title_menu/title_menu_005.png'],
  [UI.tmDecor006,    'ui/elements/title_menu/title_menu_006.png'],
  [UI.tmDecor007,    'ui/elements/title_menu/title_menu_007.png'],
  [UI.tmDecor008,    'ui/elements/title_menu/title_menu_008.png'],
  [UI.tmDecor009,    'ui/elements/title_menu/title_menu_009.png'],
  [UI.tmDecor011,    'ui/elements/title_menu/title_menu_011.png'],
  [UI.tmDecor012,    'ui/elements/title_menu/title_menu_012.png'],
  [UI.tmDecor013,    'ui/elements/title_menu/title_menu_013.png'],
  [UI.tmDecor014,    'ui/elements/title_menu/title_menu_014.png'],
  [UI.tmDecor015,    'ui/elements/title_menu/title_menu_015.png'],
  [UI.tmDecor016,    'ui/elements/title_menu/title_menu_016.png'],
  [UI.tmDecor017,    'ui/elements/title_menu/title_menu_017.png'],
  [UI.tmDecor018,    'ui/elements/title_menu/title_menu_018.png'],
  [UI.tmDecor019,    'ui/elements/title_menu/title_menu_019.png'],
  [UI.tmDecor020,    'ui/elements/title_menu/title_menu_020.png'],
  [UI.tmDecor021,    'ui/elements/title_menu/title_menu_021.png'],
  [UI.tmDecor022,    'ui/elements/title_menu/title_menu_022.png'],
  [UI.tmDecor023,    'ui/elements/title_menu/title_menu_023.png'],
  [UI.tmDecor024,    'ui/elements/title_menu/title_menu_024.png'],
  [UI.tmDecor025,    'ui/elements/title_menu/title_menu_025.png'],
  [UI.tmDecor026,    'ui/elements/title_menu/title_menu_026.png'],
  [UI.tmDecor027,    'ui/elements/title_menu/title_menu_027.png'],
  [UI.tmDecor028,    'ui/elements/title_menu/title_menu_028.png'],
  [UI.tmDecor029,    'ui/elements/title_menu/title_menu_029.png'],
  [UI.tmDecor030,    'ui/elements/title_menu/title_menu_030.png'],
  [UI.tmDecor031,    'ui/elements/title_menu/title_menu_031.png'],
  [UI.tmDecor032,    'ui/elements/title_menu/title_menu_032.png'],
  [UI.tmDecor033,    'ui/elements/title_menu/title_menu_033.png'],
  [UI.tmDecor034,    'ui/elements/title_menu/title_menu_034.png'],
  [UI.tmDecor035,    'ui/elements/title_menu/title_menu_035.png'],
  [UI.tmDecor036,    'ui/elements/title_menu/title_menu_036.png'],
  [UI.tmDecor037,    'ui/elements/title_menu/title_menu_037.png'],
  [UI.tmDecor038,    'ui/elements/title_menu/title_menu_038.png'],
  [UI.tmDecor039,    'ui/elements/title_menu/title_menu_039.png'],
  [UI.tmDecor040,    'ui/elements/title_menu/title_menu_040.png'],
  [UI.tmDecor041,    'ui/elements/title_menu/title_menu_041.png'],
  [UI.tmDecor042,    'ui/elements/title_menu/title_menu_042.png'],
  [UI.tmDecor043,    'ui/elements/title_menu/title_menu_043.png'],
  [UI.tmDecor044,    'ui/elements/title_menu/title_menu_044.png'],
  [UI.tmDecor045,    'ui/elements/title_menu/title_menu_045.png'],
  [UI.tmDecor046,    'ui/elements/title_menu/title_menu_046.png'],
  [UI.tmDecor047,    'ui/elements/title_menu/title_menu_047.png'],
  [UI.tmDecor048,    'ui/elements/title_menu/title_menu_048.png'],
  [UI.tmDecor049,    'ui/elements/title_menu/title_menu_049.png'],
  [UI.tmDecor050,    'ui/elements/title_menu/title_menu_050.png'],
  [UI.tmDecor052,    'ui/elements/title_menu/title_menu_052.png'],
  [UI.tmDecor053,    'ui/elements/title_menu/title_menu_053.png'],
  [UI.tmDecor054,    'ui/elements/title_menu/title_menu_054.png'],
  [UI.tmDecor055,    'ui/elements/title_menu/title_menu_055.png'],
  [UI.tmDecor056,    'ui/elements/title_menu/title_menu_056.png'],
  [UI.tmDecor057,    'ui/elements/title_menu/title_menu_057.png'],

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
  [UI.vmDecor017,        'ui/elements/venue_map/venue_map_017.png'],
  [UI.vmDecor018,        'ui/elements/venue_map/venue_map_018.png'],
  [UI.vmDecor019,        'ui/elements/venue_map/venue_map_019.png'],
  [UI.vmDecor022,        'ui/elements/venue_map/venue_map_022.png'],
  [UI.vmDecor023,        'ui/elements/venue_map/venue_map_023.png'],
  [UI.vmDecor024,        'ui/elements/venue_map/venue_map_024.png'],
  [UI.vmDecor026,        'ui/elements/venue_map/venue_map_026.png'],
  [UI.vmDecor027,        'ui/elements/venue_map/venue_map_027.png'],
  [UI.vmDecor028,        'ui/elements/venue_map/venue_map_028.png'],
  [UI.vmStarBadge,       'ui/elements/venue_map/venue_map_030.png'],
  [UI.vmDecor031,        'ui/elements/venue_map/venue_map_031.png'],
  [UI.vmDecor032,        'ui/elements/venue_map/venue_map_032.png'],
  [UI.vmDecor033,        'ui/elements/venue_map/venue_map_033.png'],
  [UI.vmDecor034,        'ui/elements/venue_map/venue_map_034.png'],
  [UI.vmDecor035,        'ui/elements/venue_map/venue_map_035.png'],
  [UI.vmDecor036,        'ui/elements/venue_map/venue_map_036.png'],
  [UI.vmDecor037,        'ui/elements/venue_map/venue_map_037.png'],

  // ── UI Kit 01 ─────────────────────────────────────────────────────────────
  [UI.u1BtnPrimary,      'ui/elements/ui01/btn_primary.png'],
  [UI.u1BtnPrimaryHov,   'ui/elements/ui01/btn_primary_hover.png'],
  [UI.u1BtnPrimaryPress, 'ui/elements/ui01/btn_primary_pressed.png'],
  [UI.u1BtnSecondary,    'ui/elements/ui01/btn_secondary.png'],
  [UI.u1BtnBack,         'ui/elements/ui01/btn_back.png'],
  [UI.u1BtnConfirm,      'ui/elements/ui01/btn_confirm.png'],
  [UI.u1BtnDanger,       'ui/elements/ui01/btn_danger.png'],
  [UI.u1BtnGhost,        'ui/elements/ui01/btn_ghost.png'],
  [UI.u1TabActive,       'ui/elements/ui01/tab_header_active.png'],
  [UI.u1TabHover,        'ui/elements/ui01/tab_header_hover.png'],
  [UI.u1TabIdle,         'ui/elements/ui01/tab_header_idle.png'],
  [UI.u1TabLocked,       'ui/elements/ui01/tab_header_locked.png'],
  [UI.u1TitleBar1,       'ui/elements/ui01/title_bar_01.png'],
  [UI.u1TitleBar2,       'ui/elements/ui01/title_bar_02.png'],
  [UI.u1TitleBar3,       'ui/elements/ui01/title_bar_03.png'],
  [UI.u1TitleBar4,       'ui/elements/ui01/title_bar_04.png'],
  [UI.u1CornerBrackets,  'ui/elements/ui01/corner_brackets.png'],
  [UI.u1SeparatorThin,   'ui/elements/ui01/separator_thin.png'],
  [UI.u1NotifyChips,     'ui/elements/ui01/notify_chips.png'],
  [UI.u1MotifCrown,      'ui/elements/ui01/motif_crown.png'],
  [UI.u1MotifShield,     'ui/elements/ui01/motif_shield.png'],
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
