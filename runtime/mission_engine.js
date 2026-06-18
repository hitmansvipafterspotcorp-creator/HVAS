'use strict';
const MissionEngine = (() => {
  let currentMission = null;
  let currentStep = 0;
  let missionCallbacks = [];

  function loadMission(venue) {
    currentStep = 0;
    currentMission = {
      venueId: venue.id,
      venueName: venue.name,
      steps: venue.missionSteps || [],
      reward: venue.reward || {},
      complete: false
    };
    return currentMission;
  }

  function getObjectiveText() {
    if (!currentMission) return 'Find your next objective.';
    if (currentMission.complete) return `✓ ${currentMission.venueName} complete!`;
    const steps = currentMission.steps;
    if (!steps || steps.length === 0) return 'Explore the venue.';
    const step = steps[currentStep] || steps[steps.length - 1];
    return `${currentStep + 1}/${steps.length}: ${step}`;
  }

  function advanceStep() {
    if (!currentMission) return false;
    currentStep++;
    if (currentStep >= currentMission.steps.length) {
      currentMission.complete = true;
      missionCallbacks.forEach(cb => cb('complete', currentMission));
      return 'complete';
    }
    missionCallbacks.forEach(cb => cb('step', currentStep));
    return currentStep;
  }

  function isMissionComplete() {
    return currentMission && currentMission.complete;
  }

  function getCurrentStep() { return currentStep; }

  function onMissionEvent(cb) { missionCallbacks.push(cb); }

  function resetMission() {
    currentMission = null;
    currentStep = 0;
  }

  // Trigger step advancement for specific game events
  function onTalkToNPC() {
    if (!currentMission || currentMission.complete) return;
    if (currentStep === 1) advanceStep(); // typically step 2 = talk to someone
  }

  function onWaveCleared(waveIdx) {
    if (!currentMission || currentMission.complete) return;
    if (currentStep === 2 || currentStep === 3) advanceStep();
  }

  function onBossDefeated() {
    if (!currentMission || currentMission.complete) return;
    while (currentStep < currentMission.steps.length - 1) advanceStep();
    if (!currentMission.complete) advanceStep();
  }

  function onPropInteracted() {
    if (!currentMission || currentMission.complete) return;
    if (currentStep === 3) advanceStep();
  }

  function onVenueEntered() {
    if (!currentMission || currentMission.complete) return;
    if (currentStep === 0) advanceStep();
  }

  return {
    loadMission, getObjectiveText, advanceStep, isMissionComplete,
    getCurrentStep, onMissionEvent, resetMission,
    onTalkToNPC, onWaveCleared, onBossDefeated, onPropInteracted, onVenueEntered
  };
})();
