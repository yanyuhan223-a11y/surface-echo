import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { GameUIProps, MoveDirection } from './contracts';
import './game-ui.css';

type IconName = 'sound' | 'muted' | 'view' | 'pause' | 'arrow' | 'close' | 'check' | 'signal' | 'bolt' | 'file' | 'book' | 'film' | 'replay';
function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  const paths: Record<IconName, ReactNode> = {
    sound: <><path d="M10 5 5 9H2v6h3l5 4z"/><path d="M14 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14"/></>,
    muted: <><path d="M10 5 5 9H2v6h3l5 4z"/><path d="m15 9 6 6m0-6-6 6"/></>,
    view: <><path d="M3 8V4h4m10 0h4v4m0 8v4h-4M7 20H3v-4"/><circle cx="12" cy="12" r="4"/></>,
    pause: <><path d="M8 5v14M16 5v14"/></>,
    arrow: <><path d="M4 12h15m-6-6 6 6-6 6"/></>,
    close: <><path d="m6 6 12 12M6 18 18 6"/></>,
    check: <><path d="m5 12 4 4L19 6"/></>,
    signal: <><path d="M4 18v-3m5 3v-6m5 6V9m5 9V5M3 4l18 17"/></>,
    bolt: <><path d="M13 3 4 14h7l-1 7 9-11h-7z" fill="currentColor" stroke="none"/></>,
    file: <><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/></>,
    book: <><path d="M4 5c3-1 6-1 8 1 2-2 5-2 8-1v13c-3-1-6-1-8 1-2-2-5-2-8-1z"/><path d="M12 7v12"/></>,
    film: <><rect x="4" y="5" width="16" height="14"/><path d="M4 9h4M4 15h4M16 9h4M16 15h4M9 5v14M15 5v14"/></>,
    replay: <><path d="M4 12a8 8 0 1 1 2.3 5.6M4 12V6m0 6h6"/><path d="m10 9 5 3-5 3z" fill="currentColor" stroke="none"/></>,
  };
  return <svg className={`echo-icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">{paths[name]}</svg>;
}

function Mark() {
  return <svg className="echo-mark" viewBox="0 0 44 44" fill="none" aria-hidden="true"><path d="M22 2 40 12v20L22 42 4 32V12Z" stroke="currentColor" strokeWidth="1"/><path d="M14 29V15h16M14 22h13M14 29h16" stroke="currentColor" strokeWidth="2"/><path d="M22 2v7m0 26v7" stroke="currentColor"/></svg>;
}

function MoveKey({ direction, label, onMove }: { direction: MoveDirection; label: string; onMove: GameUIProps['onMove'] }) {
  return <button className={`echo-move-key echo-move-${direction}`} aria-label={label}
    onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); onMove(direction, true); }}
    onPointerUp={() => onMove(direction, false)} onPointerCancel={() => onMove(direction, false)}
    onLostPointerCapture={() => onMove(direction, false)} onBlur={() => onMove(direction, false)}
    onKeyDown={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); onMove(direction, true); } }}
    onKeyUp={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); onMove(direction, false); } }}>
    <Icon name="arrow"/>
  </button>;
}

export function GameUI(props: GameUIProps) {
  const { mode, ready, progress, objective, investigated, target, activeRecord, toast, muted,
    cinematic, overlooking, activation, activated, storyOpen, onStart, onTour, onPause, onResume, onToggleMute,
    onToggleView, onCloseRecord, onInteract, onRestart, onMove, onInteractionHold, onCloseStory, onChooseStory } = props;
  const dialog = useRef<HTMLDivElement>(null);
  const isDialog = Boolean(activeRecord) || mode === 'paused';
  const isExploring = mode === 'play' && !activeRecord && !storyOpen && !overlooking;
  const amount = Math.max(0, Math.min(1, activation));
  const loaded = Math.round(Math.max(0, Math.min(100, progress)));

  useEffect(() => {
    if (!isDialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const el = dialog.current;
    el?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !el) return;
      const buttons = Array.from(el.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex="0"]'));
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, [isDialog]);

  const interactPress = () => { if (onInteractionHold) onInteractionHold(true); };
  const interactRelease = () => { if (onInteractionHold) onInteractionHold(false); };

  return <div className={`echo-ui echo-mode-${mode} ${cinematic ? 'echo-cinematic' : ''}`}>
    <div className="echo-filmbar echo-filmbar-top"/><div className="echo-filmbar echo-filmbar-bottom"/>
    <header className="echo-header">
      <div className="echo-brand"><Mark/><span>地表回声<small>SURFACE ECHO</small></span></div>
      <div className="echo-location"><span>灯塔 <i/> 传送大厅</span><small>DECK 04 <span className="echo-coordinate">／ TRANSIT CHAMBER</span></small></div>
      <nav className="echo-actions" aria-label="游戏设置">
        <button onClick={onToggleMute} aria-label={muted ? '开启音效' : '关闭音效'} aria-pressed={!muted} title={muted ? '开启音效' : '关闭音效'}><Icon name={muted ? 'muted' : 'sound'}/><span>{muted ? '静音' : '音效'}</span></button>
        <button onClick={onToggleView} aria-label={mode === 'play' ? overlooking ? '返回地面探索' : '高位俯瞰大厅' : cinematic ? '隐藏电影黑边' : '显示电影黑边'} aria-pressed={mode === 'play' ? overlooking : cinematic} title={mode === 'play' ? '地面探索 / 高位俯瞰 · V' : '切换电影黑边'}><Icon name="view"/><span>{overlooking ? '返回地面' : '视角'}</span></button>
        {mode !== 'intro' && <button onClick={mode === 'paused' ? onResume : onPause} aria-label={mode === 'paused' ? '继续探索' : '暂停游戏'} title="暂停 · Esc"><Icon name="pause"/><span>{mode === 'paused' ? '继续' : '暂停'}</span></button>}
      </nav>
    </header>

    {mode === 'intro' && <section className="echo-hub" aria-labelledby="echo-title">
      <div className="echo-hub-scrim"/>
      <img className="echo-hub-portrait" src={`${import.meta.env.BASE_URL}assets/mark-portrait.png`} alt="马克 · 灯塔地表勘探队" draggable={false}/>

      <div className="echo-hub-top">
        <div className="echo-hub-profile">
          <div className="echo-hub-avatar" style={{ ['--mark-portrait' as string]: `url(${import.meta.env.BASE_URL}assets/mark-portrait.png)` }}><i/></div>
          <div className="echo-hub-id">
            <div className="echo-hub-name"><b>马克</b><small>MARK</small></div>
            <div className="echo-hub-level"><span>勘探度 Lv.4</span><em><i style={{ width: '64%' }}/></em></div>
          </div>
        </div>
        <div className="echo-hub-resources">
          <span className="echo-hub-chip"><Mark/>240</span>
          <span className="echo-hub-chip echo-hub-chip-energy"><Icon name="bolt"/>42</span>
        </div>
      </div>

      <div className="echo-hub-meta">
        <b>灯塔历 · 第 417 日</b>
        <small>深夜 03:12</small>
        <span className="echo-hub-place">◇ 灯塔 · 传送大厅 DECK 04</span>
      </div>

      <nav className="echo-hub-rail" aria-label="档案功能">
        <button type="button"><Icon name="file"/><small>回声档案</small></button>
        <button type="button"><Icon name="book"/><small>角色故事</small></button>
        <button type="button"><Icon name="film"/><small>影像残片</small></button>
        <button type="button" onClick={onTour} disabled={!ready}><Icon name="replay"/><small>镜头漫游</small></button>
        <button type="button" onClick={onToggleMute} aria-pressed={!muted}><Icon name={muted ? 'muted' : 'sound'}/><small>{muted ? '静音' : '音效'}</small></button>
      </nav>

      <div className="echo-hub-stage">
        <p className="echo-hub-quote">「至少，这里还有东西醒着。」</p>
        <h1 id="echo-title" className="echo-hub-headline">今天，要去哪一层寻找回声？</h1>
        <button className="echo-button echo-primary echo-hub-cta" disabled={!ready} onClick={onStart}>
          <span>{ready ? '进入大厅 · 开始勘探' : '正在进入场景'}</span>
          {ready ? <Icon name="arrow"/> : <span className="echo-mono">{loaded}%</span>}
        </button>
        {!ready && <div className="echo-loading echo-hub-loading" role="progressbar" aria-label="场景载入" aria-valuenow={loaded} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${loaded}%` }}/></div>}
      </div>

      <nav className="echo-hub-tabs" aria-label="主菜单">
        <span>日志</span>
        <span>装备</span>
        <span className="is-active">勘探</span>
        <span>档案</span>
        <span>信号</span>
      </nav>
    </section>}

    {(mode === 'play' || mode === 'tour') && <>
      <aside className="echo-objective" aria-label="当前探索目标"><div className="echo-section-label"><span>{mode === 'tour' ? '观察模式' : '当前目标'}</span><i/></div><p>{mode === 'tour' ? '沿着光，重新发现这座大厅' : objective}</p>
        <div className="echo-intel"><span>回声碎片</span><span className="echo-intel-dots" aria-label={`已调查 ${Math.min(6, investigated)} / 6 处`}>{[0, 1, 2, 3, 4, 5].map(index => <i key={index} className={index < investigated ? 'is-found' : ''}/>)}</span><span className="echo-mono">{Math.min(6, investigated).toString().padStart(2, '0')} / 06</span></div>
      </aside>
      {mode === 'tour' || overlooking ? <div className="echo-tour-control"><span>{overlooking ? '高位观察中' : '镜头漫游中'}</span><button className="echo-button echo-secondary" onClick={overlooking ? onToggleView : onStart}>{overlooking ? '返回地面' : '开始探索'}<Icon name="arrow"/></button></div> : <div className="echo-controls"><span><kbd>W A S D</kbd> 移动角色</span><i/><span><kbd>Shift</kbd> 奔跑</span><i/><span>拖动镜头</span><i/><span><kbd>E</kbd> 执行任务</span></div>}
      <div className="echo-signal"><Icon name="signal"/><span>{activated ? '本地链路已接通' : '外部通讯中断'}</span></div>
    </>}

    {isExploring && <>
      <div className={`echo-reticle ${target ? 'has-target' : ''}`} aria-hidden="true"><i/><i/><i/><i/></div>
      {target && <div className="echo-interact"><div className="echo-interact-copy"><strong>{target.title}</strong><small>{target.hint}</small></div><button className="echo-interact-key" onClick={onInteract} aria-label={`${target.title}：${target.hint}`}
        onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); interactPress(); }}
        onPointerUp={interactRelease} onPointerCancel={interactRelease} onLostPointerCapture={interactRelease}
        onKeyDown={event => { if (!event.repeat && (event.key === ' ' || event.key === 'Enter')) interactPress(); }}
        onKeyUp={event => { if (event.key === ' ' || event.key === 'Enter') interactRelease(); }} onBlur={interactRelease}>
        <svg viewBox="0 0 60 60" aria-hidden="true"><circle className="echo-activation-track" cx="30" cy="30" r="27"/><circle className="echo-activation-progress" cx="30" cy="30" r="27" style={{ strokeDashoffset: 169.65 * (1 - amount) }}/></svg><span className="echo-desktop-key">E</span><span className="echo-touch-key">触碰</span></button></div>}
      <div className="echo-touch-controls" aria-label="触屏移动"><MoveKey direction="forward" label="向前移动" onMove={onMove}/><MoveKey direction="left" label="向左移动" onMove={onMove}/><MoveKey direction="backward" label="向后移动" onMove={onMove}/><MoveKey direction="right" label="向右移动" onMove={onMove}/></div>
      <div className="echo-touch-look">右侧滑动 · 转动镜头</div>
    </>}

    {toast && mode !== 'intro' && <div className="echo-toast" role="status"><span className="echo-live-dot"/>{toast}</div>}
    {activated && mode === 'play' && !target && !activeRecord && <div className="echo-activated" role="status"><Icon name="check"/><div>传送核心已唤醒<small>一道微光，重新连接了这里。</small></div></div>}

    {storyOpen && <div className="echo-dialog-layer echo-story-layer">
      <section className="echo-story" role="dialog" aria-modal="true" aria-labelledby="echo-story-title">
        <button className="echo-close" onClick={onCloseStory} aria-label="关闭叙事重构台"><Icon name="close"/></button>
        <div className="echo-section-label"><span>叙事重构台</span><i/></div>
        <p className="echo-record-subtitle">已接入 {investigated} 条回声碎片</p>
        <h2 id="echo-story-title">你相信哪一种真相？</h2>
        <p className="echo-story-lead">你的选择不是答案，而是这座大厅接下来必须遵循的现实。</p>
        <div className="echo-story-grid">
          <button onClick={() => onChooseStory('human')}><small>版本 01 · 希望</small><strong>地表仍有人等待</strong><span>呼救来自幸存者。打开通道，回应他们。</span><b>可信度 68%</b></button>
          <button onClick={() => onChooseStory('mimic')}><small>版本 02 · 警戒</small><strong>信号正在模仿人类</strong><span>呼吸和声音都是诱饵。封锁大厅，保存证据。</span><b>可信度 74%</b></button>
          <button onClick={() => onChooseStory('future')}><small>版本 03 · 悖论</small><strong>发送者是未来的自己</strong><span>逆向足迹与同源声音形成闭环。允许回声发生。</span><b>可信度 61%</b></button>
        </div>
        <p className="echo-story-warning">选择后，灯光、目标与大厅结局会被改写。</p>
      </section>
    </div>}

    {isDialog && <div className={`echo-dialog-layer ${activeRecord ? 'echo-record-layer' : ''}`}>
      <div className="echo-dialog" role="dialog" aria-modal="true" aria-labelledby="echo-dialog-title" ref={dialog}>
        <button className="echo-close" onClick={activeRecord ? onCloseRecord : onResume} aria-label={activeRecord ? '关闭调查记录' : '继续探索'}><Icon name="close"/></button>
        {activeRecord ? <><div className="echo-section-label"><span>调查记录</span><i/></div><p className="echo-record-subtitle">{activeRecord.subtitle}</p><h2 id="echo-dialog-title">{activeRecord.title}</h2><div className="echo-record-body">{activeRecord.body.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div><div className="echo-record-rule"/><button className="echo-button echo-primary" onClick={onCloseRecord}>继续探索<Icon name="arrow"/></button></> : <><div className="echo-section-label"><span>地表回声</span><i/></div><h2 id="echo-dialog-title">片刻静默</h2><p className="echo-pause-copy">大厅的回声，会在这里等你。</p><button className="echo-button echo-primary" onClick={onResume}>继续探索<Icon name="arrow"/></button><button className="echo-button echo-secondary" onClick={onRestart}>重新开始</button><div className="echo-pause-keys"><span><kbd>W A S D</kbd> / 方向键<span>移动</span></span><span>拖动画面<span>环视</span></span><span><kbd>E</kbd><span>调查 / 按住启动</span></span><span><kbd>Esc</kbd><span>暂停 / 返回</span></span></div></>}
      </div>
    </div>}
    <footer className="echo-footer"><span>灵笼世界观粉丝向概念 Demo</span><span>CHAMBER 04 <i/> SURFACE ECHO</span></footer>
  </div>;
}

export default GameUI;
