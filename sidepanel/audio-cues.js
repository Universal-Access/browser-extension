// Audio cue utilities for speech recognition feedback
// Uses the Web Audio API to synthesize short tones — no external files needed.

const AudioCues = (function () {
  'use strict';

  let audioCtx = null;

  function getContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
  }

  /**
   * Play a short frequency-sweep tone.
   * @param {number} startHz  – starting frequency
   * @param {number} endHz    – ending frequency
   * @param {number} duration – length in seconds
   * @param {number} volume   – gain (0–1)
   */
  function playTone(startHz, endHz, duration = 0.15, volume = 0.3) {
    try {
      const ctx = getContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(startHz, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(endHz, ctx.currentTime + duration);

      gain.gain.setValueAtTime(volume, ctx.currentTime);
      // Fade out to avoid click
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      // AudioContext unavailable — silently ignore
      console.warn('[audio-cues] playTone failed:', e.message);
    }
  }

  /** Rising tone — signals voice recognition has started. */
  function playStartCue() {
    playTone(440, 880, 0.15, 0.25);
  }

  /** Falling tone — signals voice recognition has stopped. */
  function playStopCue() {
    playTone(880, 440, 0.15, 0.25);
  }

  return { playStartCue, playStopCue };
})();
