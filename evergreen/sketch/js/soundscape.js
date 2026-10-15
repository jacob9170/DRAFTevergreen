// soundscape.js — the garden hums. The most alive plants each get a soft sine voice tuned to a minor-pentatonic
// note (set by the artist's seed). Louder = listened to more recently.
// Interactions add plucked notes; Spotify playback ducks the whole soundscape.

const voiceCount = 6;
const voiceMaxAmp = 0.045;

class Soundscape {
  constructor() {
    this.started = false;
    this.muted = false;
    this.ducked = false;
  }

  // Must be called from a user gesture (browser autoplay rules).
  start() {
    if (this.started) return;
    userStartAudio();
    this.reverb = new p5.Reverb();
    this.reverb.set(5, 2.5);
    this.reverb.drywet(0.65);

    this.voices = [];
    for (let i = 0; i < voiceCount; i++) {
      const osc = new p5.Oscillator("sine");
      osc.amp(0);
      osc.start();
      this.reverb.process(osc);
      this.voices.push({ osc, plant: null });
    }

    // Pluck instrument for hovers, discoveries and obsession chimes.
    this.pluckOsc = new p5.Oscillator("triangle");
    this.pluckOsc.amp(0);
    this.pluckOsc.start();
    this.reverb.process(this.pluckOsc);
    this.pluckEnv = new p5.Envelope();
    this.pluckEnv.setADSR(0.005, 0.25, 0.08, 0.9);
    this.pluckEnv.setRange(0.18, 0);

    this.started = true;
    this.applyVolume();
  }

  // Reassign voices to the currently most-alive plants (called a few times a second).
  update(plants) {
    if (!this.started) return;
    const loudest = plants
      .filter((p) => p.visible)
      .sort((a, b) => b.bloom * (0.3 + b.growth) - a.bloom * (0.3 + a.growth))
      .slice(0, voiceCount);

    this.voices.forEach((v, i) => {
      const p = loudest[i];
      if (!p) { v.osc.amp(0, 1); v.plant = null; return; }
      v.plant = p;
      v.osc.freq(p.frequency(), 1.2);
      v.osc.amp(voiceMaxAmp * p.bloom * (0.5 + 0.5 * p.growth), 1.2);
    });
  }

  pluck(freq, gain = 1) {
    if (!this.started) return;
    this.pluckEnv.setRange(0.18 * gain, 0);
    this.pluckOsc.freq(freq);
    this.pluckEnv.play(this.pluckOsc);
  }

  // Rising three-note arpeggio for obsession days.
  chime(plant) {
    [0, 1, 2].forEach((k) => setTimeout(() => this.pluck(plant.frequency(1) * [1, 1.5, 2][k]), k * 160));
  }

  setDucked(ducked) {
    this.ducked = ducked;
    this.applyVolume();
  }

  toggleMute() {
    this.muted = !this.muted;
    this.applyVolume();
    return this.muted;
  }

  applyVolume() {
    if (!this.started) return;
    outputVolume(this.muted ? 0 : this.ducked ? 0.12 : 0.9, 0.8);
  }
}
