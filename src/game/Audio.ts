export class HallAudio {
  private context?: AudioContext;
  private gain?: GainNode;
  private sources: AudioScheduledSourceNode[] = [];
  private muted = false;
  start() {
    if (this.context) { void this.context.resume(); return; }
    const ctx = new AudioContext(); this.context = ctx;
    const gain = ctx.createGain(); gain.gain.value = this.muted ? 0 : .28; gain.connect(ctx.destination); this.gain = gain;
    for (const [frequency, volume] of [[44, .065], [66.08, .025], [110.2, .012]]) {
      const osc = ctx.createOscillator(); osc.frequency.value = frequency; osc.type = 'sine';
      const g = ctx.createGain(); g.gain.value = volume; osc.connect(g); g.connect(gain); osc.start(); this.sources.push(osc);
    }
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate), channel = buffer.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < channel.length; i++) { brown = (brown + (Math.random() * 2 - 1) * .02) / 1.02; channel[i] = brown * .35; }
    const noise = ctx.createBufferSource(); noise.buffer = buffer; noise.loop = true;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 680;
    noise.connect(filter); filter.connect(gain); noise.start(); this.sources.push(noise);
  }
  mute(value: boolean) { this.muted = value; if (this.gain && this.context) this.gain.gain.setTargetAtTime(value ? 0 : .28, this.context.currentTime, .1); }
  tone(kind: 'step' | 'scan' | 'power') {
    const ctx = this.context; if (!ctx || !this.gain) return;
    const t = ctx.currentTime, osc = ctx.createOscillator(), g = ctx.createGain();
    const power = kind === 'power', duration = power ? 4.5 : kind === 'step' ? .13 : .6;
    osc.type = power ? 'sine' : 'triangle'; osc.frequency.setValueAtTime(power ? 42 : kind === 'step' ? 100 : 420, t);
    osc.frequency.exponentialRampToValueAtTime(power ? 180 : kind === 'step' ? 35 : 850, t + duration);
    g.gain.setValueAtTime(power ? .15 : kind === 'step' ? .06 : .045, t); g.gain.exponentialRampToValueAtTime(.0001, t + duration);
    osc.connect(g); g.connect(this.gain); osc.start(t); osc.stop(t + duration); osc.onended = () => { osc.disconnect(); g.disconnect(); };
  }
  dispose() { this.sources.forEach(s => s.stop()); if (this.context) void this.context.close(); }
}
