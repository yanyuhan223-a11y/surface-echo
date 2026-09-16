import { useEffect, useRef, useState } from 'react';
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

/**
 * 地表 HUD · the surface recon overlay: hazard banner, environment + bio telemetry,
 * terrain radar, weapon status and the extraction prompt.
 */
function SurfaceHud({ s, onFire, onReload, onExtract }: {
  s: NonNullable<GameUIProps['surface']>;
  onFire: () => void; onReload: () => void; onExtract: () => void;
}) {
  const hpPct = Math.max(0, Math.min(100, s.hp / s.maxHp * 100));
  const apPct = Math.max(0, Math.min(100, s.armor / s.maxArmor * 100));
  const danger = s.beastsAlive > 0;
  const over = s.outcome !== 'alive';
  return <div className={`echo-surface ${danger ? 'is-danger' : 'is-clear'}${over ? ' is-over' : ''}`}>
    <div className="echo-sf-vignette" style={{ opacity: .28 + s.hurt * .5 }}/>
    {s.hurt > .02 && <div className="echo-sf-hit" style={{ opacity: Math.min(.62, s.hurt * .62) }}/>}

    <div className="echo-sf-banner">
      <span className="echo-sf-warn">{danger ? '⚠︎ WARNING' : '✓︎ AREA CLEAR'}</span>
      <span className="echo-sf-zone">灰烬地表 · ASH SURFACE</span>
      <span className="echo-sf-state">{danger ? `DANGER · 猎行怪 ×${s.beastsAlive}` : '撤离信标已激活'}</span>
    </div>

    <div className="echo-sf-left">
      <section className="echo-sf-panel">
        <h4>EXTERNAL CONDITIONS</h4>
        <ul>
          <li><span>TEMP</span><b>{s.temp.toFixed(1)}°C</b></li>
          <li><span>HUM</span><b>{s.humidity.toFixed(0)}%</b></li>
          <li><span>PRES</span><b>{s.pressure.toFixed(2)} atm</b></li>
          <li><span>WIND</span><b>{s.wind.toFixed(1)} m/s</b></li>
        </ul>
      </section>
      <section className="echo-sf-panel">
        <h4>BIO-SIGN MONITOR</h4>
        <ul>
          <li><span>HR</span><b className={s.heartRate > 150 ? 'hot' : ''}>{s.heartRate} bpm</b></li>
          <li><span>SpO₂</span><b>{s.spo2}%</b></li>
          <li><span>STRESS</span><b className={s.stress > 80 ? 'hot' : ''}>{s.stress}%</b></li>
          <li><span>ELEV</span><b>{s.elevation} M</b></li>
        </ul>
      </section>
    </div>

    <div className="echo-sf-right">
      <section className="echo-sf-radar">
        <h4><span>TERRAIN SCAN</span><small>FOG {s.fogDensity.toFixed(0)}%</small></h4>
        <div className="echo-sf-scope">
          <i className="echo-sf-sweep"/>
          <i className="echo-sf-self"/>
          {s.blips.map((b, i) => <i key={i} className={`echo-sf-blip is-${b.kind}`}
            style={{ left: `${50 + b.x * 46}%`, top: `${50 + b.y * 46}%` }}/>)}
        </div>
        <p>撤离信标 {s.beaconDistance}m</p>
      </section>
    </div>

    <div className="echo-sf-crosshair" aria-hidden="true"><i/><i/><i/><i/></div>

    <div className="echo-sf-bottom">
      <div className="echo-sf-vitals">
        <label>护甲值 ARMOR<b>{s.armor}</b></label>
        <span className="echo-sf-bar is-armor"><i style={{ width: `${apPct}%` }}/></span>
        <label>生命值 VITALS<b>{s.hp}</b></label>
        <span className="echo-sf-bar is-hp"><i style={{ width: `${hpPct}%` }}/></span>
      </div>
      <div className="echo-sf-weapon">
        <h4>WEAPON STATUS<small>电磁步枪 RAILGUN</small></h4>
        <p className="echo-sf-ammo"><b>{s.mag}</b><span>/ {s.reserve}</span></p>
        <p className="echo-sf-safety">{s.reloading ? 'RELOADING…' : s.mag > 0 ? 'PRIMED · SAFETY OFF' : 'MAG EMPTY · 按 R 换弹'}</p>
      </div>
    </div>

    <div className="echo-sf-keys">
      <span><kbd>W A S D</kbd> 移动</span><i/><span>拖动镜头瞄准</span><i/>
      <span><kbd>空格</kbd> 开火</span><i/><span><kbd>R</kbd> 换弹</span><i/><span><kbd>E</kbd> 撤离</span>
    </div>

    <div className="echo-sf-controls">
      <button type="button" className="echo-sf-fire" onClick={onFire} disabled={s.outcome !== 'alive'}>开火<small>SPACE / 点击</small></button>
      <button type="button" className="echo-sf-reload" onClick={onReload} disabled={s.outcome !== 'alive'}>换弹<small>R</small></button>
    </div>


    {s.outcome !== 'alive' && <div className="echo-sf-end">
      <div className={`echo-sf-endcard is-${s.outcome}`}>
        <span>{s.outcome === 'extracted' ? 'EXTRACTION COMPLETE' : 'LIFE SIGNS CRITICAL'}</span>
        <h3>{s.outcome === 'extracted' ? '撤离成功' : '重伤 · 强制撤回'}</h3>
        <p>{s.outcome === 'extracted'
          ? '你清除了地表的猎行怪，带着回声回到灯塔。'
          : '生命维持系统接管了控制权，你被拉回了传送大厅。'}</p>
        <button type="button" onClick={onExtract}>返回传送大厅</button>
      </div>
    </div>}
  </div>;
}

export function GameUI(props: GameUIProps) {
  const { mode, ready, progress, objective, investigated, target, activeRecord, toast, muted,
    cinematic, overlooking, activation, activated, storyOpen, dialogue, quests, progressStats, reward,
    zone, surface, canDeploy, onStart, onTour, onPause, onResume, onToggleMute,
    onToggleView, onCloseRecord, onInteract, onRestart, onMove, onInteractionHold, onCloseStory, onChooseStory, onDialogueAction, onCloseReward,
    onDeploy, onFire, onReload, onExtract } = props;
  const dialog = useRef<HTMLDivElement>(null);
  /**
   * 任务日志默认折叠：小屏 / 触屏上展开的列表会盖住角色，
   * 只留一枚 "任务 0/3" 的胶囊，点开才展开完整列表。
   */
  const [questsOpen, setQuestsOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    const coarse = window.matchMedia?.('(pointer:coarse)').matches;
    return !coarse && window.innerWidth >= 1180;
  });
  const isDialog = Boolean(activeRecord) || mode === 'paused';
  /** 折叠状态下仍要提示"有奖励能领"，否则玩家会漏掉结算 */
  const readyQuest = quests.find(q => q.status === 'ready') ?? null;
  /** the surface run has resolved: the settlement card should be the only thing left */
  const runOver = zone === 'surface' && !!surface && surface.outcome !== 'alive';
  const isExploring = mode === 'play' && !activeRecord && !storyOpen && !overlooking && !dialogue;
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

  // J 键快速折叠 / 展开任务日志
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'j' || event.key === 'J') setQuestsOpen(v => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const interactPress = () => { if (onInteractionHold) onInteractionHold(true); };
  const interactRelease = () => { if (onInteractionHold) onInteractionHold(false); };

  return <div className={`echo-ui echo-mode-${mode} echo-zone-${zone} ${runOver ? 'echo-run-over' : ''} ${cinematic ? 'echo-cinematic' : ''}`}>
    {zone === 'surface' && surface && mode === 'play' && !reward && !dialogue && !activeRecord &&
      <SurfaceHud s={surface} onFire={onFire} onReload={onReload} onExtract={onExtract}/>}
    <div className="echo-filmbar echo-filmbar-top"/><div className="echo-filmbar echo-filmbar-bottom"/>
    <header className="echo-header">
      <div className="echo-brand"><Mark/><span>地表回声<small>SURFACE ECHO</small></span></div>
      <div className="echo-location">{zone === 'surface'
      ? <><span>灰烬地表 <i/> 撤离区</span><small>SECTOR 07 <span className="echo-coordinate">／ ASH SURFACE</span></small></>
      : <><span>灯塔 <i/> 传送大厅</span><small>DECK 04 <span className="echo-coordinate">／ TRANSIT CHAMBER</span></small></>}</div>
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
            <div className="echo-hub-level"><span>勘探度 Lv.{progressStats.level}</span><em><i style={{ width: `${Math.round(progressStats.levelInto / progressStats.levelSpan * 100)}%` }}/></em></div>
          </div>
        </div>
        <div className="echo-hub-resources">
          <span className="echo-hub-chip"><Mark/>{progressStats.echo}</span>
          <span className="echo-hub-chip echo-hub-chip-energy"><Icon name="bolt"/>{progressStats.energy}</span>
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
        {zone === 'hall' && canDeploy && <button type="button" className="echo-deploy" onClick={onDeploy}>
          <b>降至灰烬地表</b><small>DEPLOY TO SURFACE · 传送环已蓄能</small>
        </button>}
      </aside>
      {mode === 'play' && !dialogue && quests.length > 0 && <aside className={`echo-quests ${questsOpen ? 'is-open' : 'is-closed'}`} aria-label="任务追踪">
        <button type="button" className="echo-quests-toggle" onClick={() => setQuestsOpen(v => !v)}
          aria-expanded={questsOpen} title={questsOpen ? '收起任务日志' : '展开任务日志'}>
          <div className="echo-section-label"><span>任务日志</span><i/><b className="echo-quest-count">{progressStats.questsDone} / {progressStats.questsTotal}</b></div>
          <span className="echo-quests-caret" aria-hidden="true"/>
        </button>
        {!questsOpen && readyQuest && <em className="echo-quests-tip">{readyQuest.npcName} 处可领奖励</em>}
        <ul>{quests.map(q => {
          const showBar = q.status === 'active' || q.status === 'ready';
          return <li key={q.id} className={`echo-quest is-${q.status}`}>
            <span className="echo-quest-dot" aria-hidden="true"/>
            <div className="echo-quest-copy">
              <strong>{q.title}{showBar && <span className="echo-quest-num">{q.current}/{q.goal}</span>}</strong>
              <small>{q.status === 'done' ? '已完成' : q.status === 'ready' ? '目标达成 · 返回 ' + q.npcName + ' 领取奖励' : q.status === 'active' ? q.objective : '待接取 · 找 ' + q.npcName}</small>
              {showBar && <span className="echo-quest-bar" aria-label={`进度 ${q.current}/${q.goal}`}><i style={{ width: `${Math.round(q.current / q.goal * 100)}%` }}/></span>}
            </div>
            <em className="echo-quest-flag">{q.status === 'done' ? '✓' : q.status === 'ready' ? '!' : q.status === 'active' ? '…' : '•'}</em>
          </li>;
        })}</ul>
      </aside>}
      {mode === 'tour' || overlooking ? <div className="echo-tour-control"><span>{overlooking ? '高位观察中' : '镜头漫游中'}</span><button className="echo-button echo-secondary" onClick={overlooking ? onToggleView : onStart}>{overlooking ? '返回地面' : '开始探索'}<Icon name="arrow"/></button></div> : <div className="echo-controls"><span><kbd>W A S D</kbd> 移动角色</span><i/><span><kbd>Shift</kbd> 奔跑</span><i/><span>拖动镜头</span><i/><span><kbd>E</kbd> 执行任务</span><i/><span><kbd>J</kbd> 任务日志</span></div>}
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

    {dialogue && <div className="echo-dialog-layer echo-npc-layer">
      <section className="echo-npc" role="dialog" aria-modal="true" aria-labelledby="echo-npc-title" style={{ ['--npc' as string]: dialogue.color }}>
        <button className="echo-close" onClick={() => onDialogueAction('close')} aria-label="结束对话"><Icon name="close"/></button>
        <div className="echo-npc-head">
          <span className="echo-npc-avatar" aria-hidden="true"/>
          <div><h2 id="echo-npc-title">{dialogue.npcName}</h2><small>{dialogue.npcRole}</small></div>
        </div>
        <div className="echo-npc-body">{dialogue.lines.map((l, i) => l.who
          ? <p key={i}><b>{l.who}</b>{l.text}</p>
          : <p key={i} className="echo-npc-narr">{l.text}</p>)}</div>
        <div className="echo-npc-quest"><span className="echo-npc-quest-tag">任务</span>{dialogue.questTitle}</div>
        <div className="echo-npc-actions">
          {dialogue.action === 'accept' && <button className="echo-button echo-primary" onClick={() => onDialogueAction('accept')}>接受委托<Icon name="check"/></button>}
          {dialogue.action === 'turnin' && <button className="echo-button echo-primary" onClick={() => onDialogueAction('turnin')}>交付任务<Icon name="check"/></button>}
          <button className="echo-button echo-secondary" onClick={() => onDialogueAction('close')}>{dialogue.action === 'accept' ? '再想想' : '结束对话'}</button>
        </div>
      </section>
    </div>}

    {reward && <div className="echo-dialog-layer echo-reward-layer">
      <section className={`echo-reward ${reward.allDone ? 'is-final' : ''}`} role="dialog" aria-modal="true" aria-labelledby="echo-reward-title" style={{ ['--npc' as string]: reward.color }}>
        <div className="echo-reward-glow" aria-hidden="true"/>
        <div className="echo-reward-ribbon">{reward.allDone ? '全部委托达成' : '任务完成'}</div>
        <h2 id="echo-reward-title">{reward.questTitle}</h2>
        <p className="echo-reward-from">来自 {reward.npcName} 的回报</p>
        {reward.leveledUp && <div className="echo-reward-levelup"><span>勘探度提升</span><b>Lv.{reward.newLevel}</b></div>}
        <ul className="echo-reward-grid">
          <li><span className="echo-reward-gain">+{reward.exp}</span><small>勘探经验</small></li>
          <li><span className="echo-reward-gain"><Mark/>+{reward.echo}</span><small>回声值</small></li>
          <li><span className="echo-reward-gain"><Icon name="bolt"/>+{reward.energy}</span><small>能量</small></li>
        </ul>
        <div className="echo-reward-unlock"><em>◆</em>{reward.unlock}</div>
        {reward.allDone && <p className="echo-reward-final-copy">三段委托全部完成——大厅重新有了光、有了名字，也有了一个属于你的结局。</p>}
        <button className="echo-button echo-primary" onClick={onCloseReward}>{reward.allDone ? '铭记这一刻' : '收下回报'}<Icon name="check"/></button>
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
