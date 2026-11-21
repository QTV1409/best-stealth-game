// Moonpearl Heist — sound: tiny WebAudio blips, no audio files. The
// context is created lazily on the first user gesture (browsers block
// audio before one) and every call is guarded so sound can never break
// the game. Screenshot mode runs silent.
(function (root) {
  'use strict';

  function SoundFX() {
    this.ctx = null;
    this.muted = false;
  }

  SoundFX.prototype.ensure = function () {
    if (this.muted) return null;
    try {
      if (!this.ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        this.ctx = new AC();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    } catch (e) {
      return null;
    }
  };

  SoundFX.prototype.tone = function (freq, dur, type, vol, when) {
    var ctx = this.ensure();
    if (!ctx) return;
    try {
      var t = ctx.currentTime + (when || 0);
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(vol || 0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(t); osc.stop(t + dur + 0.02);
    } catch (e) { /* sound is never fatal */ }
  };

  SoundFX.prototype.step = function () { this.tone(180, 0.05, 'triangle', 0.02); };
  SoundFX.prototype.coin = function () { this.tone(1320, 0.07, 'sine', 0.07); this.tone(1760, 0.1, 'sine', 0.06, 0.06); };
  SoundFX.prototype.pearl = function () {
    var self = this;
    [523, 659, 784, 1047].forEach(function (f, i) { self.tone(f, 0.16, 'sine', 0.07, i * 0.07); });
  };
  SoundFX.prototype.suspicious = function () { this.tone(440, 0.12, 'square', 0.04); };
  SoundFX.prototype.alert = function () {
    var self = this;
    [330, 415, 494, 659].forEach(function (f, i) { self.tone(f, 0.12, 'sawtooth', 0.05, i * 0.09); });
  };
  SoundFX.prototype.takedown = function () { this.tone(110, 0.16, 'triangle', 0.1); };
  SoundFX.prototype.caught = function () { this.tone(98, 0.4, 'sawtooth', 0.09); };
  SoundFX.prototype.win = function () {
    var self = this;
    [523, 659, 784, 1047, 1319].forEach(function (f, i) { self.tone(f, 0.2, 'sine', 0.07, i * 0.09); });
  };

  var api = { SoundFX: SoundFX };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MoonpearlAudio = api;
})(typeof window !== 'undefined' ? window : globalThis);
