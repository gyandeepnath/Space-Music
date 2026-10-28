// The Space DJ: reads live facts between the music using the browser's own
// speech synthesis, ducks the music while talking, and subtitles each sentence
// as it's spoken. Without a voice it still shows the subtitles, paced for reading.

const WORDS_PER_SECOND = 2.7;

export class SpaceDJ {
  constructor({ onCaption, onDuck }) {
    this.onCaption = onCaption;
    this.onDuck = onDuck;
    this.enabled = true;
    this.voiceName = null;
    this.synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
    this.gen = 0;
    this.timers = [];
  }

  voices() {
    return this.synth ? this.synth.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en')) : [];
  }

  pickVoice() {
    const voices = this.voices();
    return (
      voices.find((v) => v.name === this.voiceName) ||
      voices.find((v) => /natural|neural|premium|enhanced/i.test(v.name) && v.lang === 'en-GB') ||
      voices.find((v) => /google uk english male|daniel|serena|arthur/i.test(v.name)) ||
      voices.find((v) => v.lang === 'en-GB') ||
      voices.find((v) => v.default) ||
      voices[0] ||
      null
    );
  }

  clearTimers() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  later(fn, ms) {
    this.timers.push(setTimeout(fn, ms));
  }

  stop() {
    this.gen++;
    this.clearTimers();
    this.synth?.cancel();
    this.onDuck(false);
    this.onCaption('');
  }

  // Show a one-off message in the subtitle area.
  caption(text, seconds) {
    this.clearTimers();
    this.onCaption(text);
    if (text && seconds) this.later(() => this.onCaption(''), seconds * 1000);
  }

  say(text) {
    if (!this.enabled || !text) return;
    this.stop();
    const gen = this.gen;
    const sentences = text.match(/[^.!?]+[.!?]*/g)?.map((s) => s.trim()).filter(Boolean) || [text];
    const voice = this.pickVoice();
    if (!this.synth || !voice) {
      this.subtitles(sentences, gen);
      return;
    }
    // Chrome cuts off long utterances, so speak sentence by sentence.
    let left = sentences.length;
    this.onDuck(true);
    const words = text.split(/\s+/).length;
    // If the browser never reports the end of speech, don't leave the music ducked.
    this.later(() => gen === this.gen && this.finish(), (words / WORDS_PER_SECOND + 10) * 1000);
    for (const s of sentences) {
      const u = new SpeechSynthesisUtterance(s);
      u.voice = voice;
      u.rate = 0.96;
      u.pitch = 0.92;
      u.onstart = () => gen === this.gen && this.onCaption(s);
      u.onend = u.onerror = () => {
        // Cancelled utterances from an earlier line still fire events; ignore them.
        if (gen !== this.gen) return;
        if (--left <= 0) this.finish();
      };
      this.synth.speak(u);
    }
  }

  // No voice available: step through the sentences at reading pace.
  subtitles(sentences, gen) {
    let i = 0;
    const next = () => {
      if (gen !== this.gen) return;
      if (i >= sentences.length) return this.finish();
      const s = sentences[i++];
      this.onCaption(s);
      this.later(next, Math.max(2400, (s.split(/\s+/).length / WORDS_PER_SECOND) * 1000 + 600));
    };
    next();
  }

  finish() {
    this.clearTimers();
    this.onDuck(false);
    this.later(() => this.onCaption(''), 1200);
  }
}
