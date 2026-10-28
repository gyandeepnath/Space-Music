// The Space DJ: reads live facts between the music using the browser's own
// speech synthesis, ducks the music while talking, and captions everything.

export class SpaceDJ {
  constructor({ onCaption, onDuck }) {
    this.onCaption = onCaption;
    this.onDuck = onDuck;
    this.enabled = true;
    this.voiceName = null;
    this.synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
    this.queue = 0;
    this.gen = 0;
    this.captionTimer = null;
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

  stop() {
    this.gen++;
    clearTimeout(this.fallback);
    this.synth?.cancel();
    this.queue = 0;
    this.onDuck(false);
    this.caption('');
  }

  caption(text, seconds) {
    clearTimeout(this.captionTimer);
    this.onCaption(text);
    if (text && seconds) this.captionTimer = setTimeout(() => this.onCaption(''), seconds * 1000);
  }

  // Speak a line. Chrome cuts off long utterances, so speak sentence by sentence.
  say(text) {
    if (!this.enabled || !text) return;
    const readingSeconds = Math.max(4, text.split(/\s+/).length / 2.6);
    if (!this.synth) {
      this.caption(text, readingSeconds + 2);
      return;
    }
    this.synth.cancel();
    clearTimeout(this.fallback);
    const gen = ++this.gen;
    const sentences = text.match(/[^.!?]+[.!?]*/g)?.map((s) => s.trim()).filter(Boolean) || [text];
    const voice = this.pickVoice();
    this.queue = sentences.length;
    this.current = text;
    this.caption(text);
    this.onDuck(true);
    // If the browser has no voices or never fires events, don't leave the music ducked.
    this.fallback = setTimeout(() => this.finish(), (readingSeconds + 8) * 1000);
    for (const s of sentences) {
      const u = new SpeechSynthesisUtterance(s);
      if (voice) u.voice = voice;
      u.rate = 0.96;
      u.pitch = 0.92;
      u.onend = u.onerror = () => {
        // Cancelled utterances from an earlier line still fire events; ignore them.
        if (gen !== this.gen) return;
        if (--this.queue <= 0) {
          clearTimeout(this.fallback);
          this.finish();
        }
      };
      this.synth.speak(u);
    }
  }

  finish() {
    this.queue = 0;
    this.onDuck(false);
    this.caption(this.current, 3); // linger briefly, then clear
  }
}
