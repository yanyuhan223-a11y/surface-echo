export class AtmosAudio {
  constructor () { this.ctx = null; this.master = null; this.muted = false; this.stepAt = 0 }
  start () {
    if (this.ctx) { this.ctx.resume(); return }
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    this.ctx = new Ctx(); this.master = this.ctx.createGain(); this.master.gain.value = .22; this.master.connect(this.ctx.destination)
    const seconds = 3, buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * seconds, this.ctx.sampleRate), data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (.5 + .5 * Math.sin(i / 12000))
    const wind = this.ctx.createBufferSource(), filter = this.ctx.createBiquadFilter(), gain = this.ctx.createGain()
    wind.buffer = buffer; wind.loop = true; filter.type = 'lowpass'; filter.frequency.value = 430; gain.gain.value = .16
    wind.connect(filter).connect(gain).connect(this.master); wind.start()
    const drone = this.ctx.createOscillator(), dg = this.ctx.createGain(); drone.type = 'sine'; drone.frequency.value = 43; dg.gain.value = .09; drone.connect(dg).connect(this.master); drone.start()
  }
  setMuted (v) { this.muted = v; if (this.master) this.master.gain.setTargetAtTime(v ? 0 : .22, this.ctx.currentTime, .08) }
  tone (freq = 180, duration = .18, volume = .14) {
    if (!this.ctx || this.muted) return
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(freq, this.ctx.currentTime); o.frequency.exponentialRampToValueAtTime(freq * .55, this.ctx.currentTime + duration); g.gain.setValueAtTime(volume, this.ctx.currentTime); g.gain.exponentialRampToValueAtTime(.001, this.ctx.currentTime + duration); o.connect(g).connect(this.master); o.start(); o.stop(this.ctx.currentTime + duration)
  }
  step () { const now = performance.now(); if (now - this.stepAt > 420) { this.stepAt = now; this.tone(70 + Math.random() * 15, .09, .055) } }
  alert () { this.tone(125, .65, .2) }
  scan () { this.tone(520, .45, .12) }
  // guttural low growl + wet mucus hiss when the beast detects the player
  growl () {
    if (!this.ctx || this.muted) return
    const t = this.ctx.currentTime
    const o = this.ctx.createOscillator(), sub = this.ctx.createOscillator(), g = this.ctx.createGain(), lp = this.ctx.createBiquadFilter()
    o.type = 'sawtooth'; o.frequency.setValueAtTime(58, t); o.frequency.exponentialRampToValueAtTime(32, t + .9)
    sub.type = 'sine'; sub.frequency.setValueAtTime(30, t)
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(320, t); lp.frequency.exponentialRampToValueAtTime(90, t + .9)
    g.gain.setValueAtTime(.001, t); g.gain.exponentialRampToValueAtTime(.32, t + .12); g.gain.exponentialRampToValueAtTime(.001, t + 1.1)
    o.connect(lp); sub.connect(lp); lp.connect(g).connect(this.master); o.start(t); sub.start(t); o.stop(t + 1.1); sub.stop(t + 1.1)
    // wet slime hiss
    const nb = this.ctx.createBuffer(1, this.ctx.sampleRate * .5, this.ctx.sampleRate), nd = nb.getChannelData(0)
    for (let i = 0; i < nd.length; i++) nd[i] = (Math.random()*2-1) * (1 - i/nd.length)
    const ns = this.ctx.createBufferSource(), nf = this.ctx.createBiquadFilter(), ng = this.ctx.createGain()
    ns.buffer = nb; nf.type = 'bandpass'; nf.frequency.value = 1800; ng.gain.value = .07
    ns.connect(nf).connect(ng).connect(this.master); ns.start(t + .05)
  }
}
