// Curated internet radio: SomaFM's space channels, as an alternative to the
// generative engine. SomaFM is listener-supported; the UI credits and links it.

export const SOMA_CHANNELS = {
  missioncontrol: 'Mission Control',
  spacestation: 'Space Station Soma',
  deepspaceone: 'Deep Space One',
  dronezone: 'Drone Zone',
};

function streamUrls(id) {
  return [
    `https://ice.somafm.com/${id}`,
    `https://ice1.somafm.com/${id}-128-mp3`,
    `https://ice2.somafm.com/${id}-128-mp3`,
    `https://ice4.somafm.com/${id}-128-mp3`,
  ];
}

export class StreamPlayer {
  constructor(el) {
    this.el = el;
    this.el.preload = 'none';
    this.volume = 0.8;
    this.ducked = false;
    this.channel = null;
    this.token = 0;
  }

  // Resolves with the channel name once audio is flowing; rejects if no mirror answers.
  async play(id) {
    const token = ++this.token;
    this.channel = id;
    this.applyVolume();
    for (const url of streamUrls(id)) {
      if (token !== this.token) return null;
      if (await this.tryUrl(url, token)) return SOMA_CHANNELS[id];
    }
    throw new Error(`SomaFM ${SOMA_CHANNELS[id]} is unreachable`);
  }

  tryUrl(url, token) {
    return new Promise((resolve) => {
      const el = this.el;
      const done = (ok) => {
        clearTimeout(timer);
        el.removeEventListener('playing', onPlaying);
        el.removeEventListener('error', onError);
        resolve(ok && token === this.token);
      };
      const onPlaying = () => done(true);
      const onError = () => done(false);
      const timer = setTimeout(() => done(false), 9000);
      el.addEventListener('playing', onPlaying);
      el.addEventListener('error', onError);
      el.src = url;
      el.play().catch(() => done(false));
    });
  }

  stop() {
    this.token++;
    this.channel = null;
    this.el.pause();
    this.el.removeAttribute('src');
    this.el.load();
  }

  setVolume(v) {
    this.volume = v;
    this.applyVolume();
  }

  duck(on) {
    this.ducked = on;
    this.applyVolume();
  }

  applyVolume() {
    this.el.volume = Math.min(1, this.volume * (this.ducked ? 0.3 : 1));
  }
}
