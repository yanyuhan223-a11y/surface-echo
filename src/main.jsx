import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Backpack, ClipboardList, Compass, Flashlight, MessageSquare, Package, Pause, Play, Radar, RotateCcw, Volume2, VolumeX } from 'lucide-react'
import World3D from './World3D'
import { AtmosAudio } from './audio'
import { CLUES, OBJECTIVES, STORY, SUPPLIES, KEY_SUPPLY_GOAL, NPCS, QUESTS, QUEST_OBJECTS, QUEST_GOAL } from './gameData'
import wasteland from './assets/wasteland.png'
import npcRanger from './assets/npc_ranger.png'
import npcOperator from './assets/npc_operator.png'
import xueArt from './assets/xue2.png'
import './style.css'

const NPC_ART = { ranger: npcRanger, operator: npcOperator, xue: xueArt }
const questById = id => QUESTS.find(q => q.id === id)
const npcById = id => NPCS.find(n => n.id === id)

function App () {
  const [screen, setScreen] = useState(() => new URLSearchParams(location.search).has('play') ? 'game' : 'title'), [paused, setPaused] = useState(false), [muted, setMuted] = useState(false)
  const [found, setFound] = useState([]), [objective, setObjective] = useState(0), [flashlight, setFlashlight] = useState(true)
  const [scannerPulse, setScannerPulse] = useState(0), [status, setStatus] = useState({ threat:false, hidden:0, prompt:'', position:{z:0} })
  const [caption, setCaption] = useState(null), [threatDone, setThreatDone] = useState(false), [meeting, setMeeting] = useState(false)
  const [confirmed, setConfirmed] = useState(false), [qte, setQte] = useState(null), [ending, setEnding] = useState(null), [showHelp, setShowHelp] = useState(false)
  const [collected, setCollected] = useState([]), [inventory, setInventory] = useState([]), [pickup, setPickup] = useState(null)
  const [quests, setQuests] = useState({}), [dialog, setDialog] = useState(null), [showLog, setShowLog] = useState(false), [toast, setToast] = useState(null)
  const audio = useMemo(() => new AtmosAudio(), []), captionTimer = useRef(null), qteRef = useRef(null), pickupTimer = useRef(null), collectedRef = useRef([])
  const questsRef = useRef({}), invRef = useRef([]), dialogRef = useRef(null), toastTimer = useRef(null)
  qteRef.current = qte; collectedRef.current = collected; questsRef.current = quests; invRef.current = inventory; dialogRef.current = dialog
  const keySupplies = collected.filter(id => SUPPLIES.find(s=>s.id===id)?.key).length
  const questsDone = QUESTS.filter(q => quests[q.id]?.state === 'done').length

  const say = (source, text, ms = 3300) => { clearTimeout(captionTimer.current); setCaption({source,text}); captionTimer.current=setTimeout(()=>setCaption(null),ms) }
  const flash = text => { clearTimeout(toastTimer.current); setToast(text); toastTimer.current = setTimeout(()=>setToast(null), 2600) }
  const start = () => { audio.start(); audio.setMuted(muted); setScreen('game'); setShowHelp(true); say('任务', STORY.intro, 4200); setTimeout(()=>setShowHelp(false),7200) }
  const reset = () => { document.exitPointerLock?.(); setFound([]); setObjective(0); setThreatDone(false); setMeeting(false); setConfirmed(false); setQte(null); setEnding(null); setCaption(null); setPaused(false); setCollected([]); setInventory([]); setPickup(null); setQuests({}); setDialog(null); setShowLog(false); setScreen('title') }

  const discover = id => {
    if (found.includes(id)) return
    const clue = CLUES.find(c=>c.id===id), next = [...found,id]; setFound(next); say(clue.title, clue.fragment, 4300)
    if (next.length === 1) setTimeout(()=>say('无线电 · 未知', STORY.firstSignal[0]), 4700)
    if (next.length === 3) setTimeout(()=>say('马克', '信号就在前面。'), 3900)
  }
  const addItem = (item, qty, key) => setInventory(inv => { const hit = inv.find(i=>i.item===item); return hit ? inv.map(i=>i.item===item?{...i,qty:i.qty+qty}:i) : [...inv,{ item, qty, key }] })
  const collect = sup => {
    if (collectedRef.current.includes(sup.id)) return
    const next = [...collectedRef.current, sup.id]; setCollected(next)
    addItem(sup.item, sup.qty, sup.key)
    clearTimeout(pickupTimer.current); setPickup({ flavor: sup.flavor }); pickupTimer.current = setTimeout(()=>setPickup(null), 3200)
    audio.tone(560,.28,.16)
    if (sup.lore) setTimeout(()=>say(sup.label, sup.lore, 5200), 900)
    const keyNow = next.filter(id => SUPPLIES.find(s=>s.id===id)?.key).length
    if (keyNow >= KEY_SUPPLY_GOAL && objective < 1) setObjective(1)
    if (keyNow === KEY_SUPPLY_GOAL) setTimeout(()=>say('灯塔 · 导航', '关键补给已达标。前往异常信号源。', 4200), 1600)
  }
  const threat = () => { setObjective(o=>Math.max(o,2)); say('无线电 · 未知', STORY.threat[0], 1600); setTimeout(()=>say('无线电 · 未知', STORY.threat[1], 3300),1700) }
  const safe = () => { if(threatDone)return; setThreatDone(true); setObjective(3); say('马克', STORY.calm[0]); setTimeout(()=>say('马克', STORY.calm[1]),3500) }
  const meet = () => { if(meeting)return; setMeeting(true); setObjective(4); say('？？？', STORY.meeting[0]); setTimeout(()=>say('樰', STORY.meeting[1],4300),3500) }
  const confirm = () => { if(confirmed)return; setConfirmed(true); audio.tone(760,.7,.18); say('扫描器', STORY.confirm[0]); setTimeout(()=>{ say('马克', STORY.confirm[1]); setObjective(5) },3000) }

  // ------------------------------------------------------------------
  // 任务系统
  // ------------------------------------------------------------------
  const hasItem = (item, qty) => (invRef.current.find(i=>i.item===item)?.qty || 0) >= qty
  const canTurnIn = q => {
    const st = questsRef.current[q.id]
    if (!st || st.state !== 'active') return false
    if (q.type === 'collect') return hasItem(q.need.item, q.need.qty)
    return (st.done?.length || 0) >= q.goal
  }
  const questProgress = q => {
    const st = questsRef.current[q.id] || quests[q.id]
    if (q.type === 'collect') return Math.min(q.goal, (inventory.find(i=>i.item===q.need.item)?.qty)||0)
    return st?.done?.length || 0
  }

  const talk = npcId => {
    if (dialogRef.current) return
    const npc = npcById(npcId), q = questById(npc.quest), st = questsRef.current[npc.quest]
    let mode = 'offer', lines = q.offer, choices = q.choices
    if (st?.state === 'done') { mode = 'idle'; lines = [{ who: npc.name, text: q.type === 'collect' ? '伤口在结痂了。谢了，猎荒者。' : '我这边稳住了。往下走的时候，别回头听。' }]; choices = null }
    else if (st?.state === 'active') {
      if (canTurnIn(q)) { mode = 'turnIn'; lines = q.turnIn; choices = null }
      else { mode = 'progress'; lines = q.progress; choices = q.progressChoices || null }
    }
    audio.tone(300,.18,.1)
    setDialog({ npcId, questId: q.id, name: npc.name, role: npc.role, art: npc.art, lines, i: 0, mode, choices, showChoices: false, pendingReply: null })
  }

  const finishDialog = d => {
    const q = questById(d.questId)
    if (d.mode === 'offer' && d.accepted) {
      setQuests(s => ({ ...s, [d.questId]: { state: 'active', done: [] } }))
      flash(`接受任务 · ${q.title}`); audio.tone(660,.4,.14); setShowLog(true); setTimeout(()=>setShowLog(false), 2600)
    }
    if (d.mode === 'turnIn') {
      setQuests(s => ({ ...s, [d.questId]: { ...(s[d.questId]||{}), state: 'done' } }))
      if (q.type === 'collect') setInventory(inv => inv.map(i => i.item===q.need.item ? { ...i, qty: i.qty - q.need.qty } : i).filter(i => i.qty > 0))
      if (q.reward) { addItem(q.reward.item, q.reward.qty, q.reward.key); flash(`${q.reward.note} · ${q.reward.item} ×${q.reward.qty}`) }
      audio.tone(820,.6,.16)
      if (d.questId === 'q_relay') setTimeout(()=>setQte({hits:0,time:100,marker:0,dir:1}), 900)
    }
    if (d.startQte) setTimeout(()=>setQte({hits:0,time:100,marker:0,dir:1}), 600)
    setDialog(null)
  }

  const advanceDialog = () => {
    const d = dialogRef.current; if (!d) return
    audio.tone(240,.06,.06)
    if (d.pendingReply) { finishDialog(d); return }
    if (d.i < d.lines.length - 1) { setDialog({ ...d, i: d.i + 1 }); return }
    if (d.choices && !d.showChoices) { setDialog({ ...d, showChoices: true }); return }
    if (d.showChoices) return
    finishDialog(d)
  }
  const pickChoice = c => {
    const d = dialogRef.current; if (!d) return
    audio.tone(520,.2,.12)
    setDialog({ ...d, lines: [{ who: d.name, text: c.reply }], i: 0, showChoices: false, choices: null, pendingReply: true, accepted: !!c.accept, startQte: !!c.qte })
  }

  const scanTarget = (group, id) => {
    const q = QUESTS.find(x => x.targets === group), st = questsRef.current[q?.id]
    if (!q || st?.state !== 'active' || st.done?.includes(id)) return
    const done = [...(st.done||[]), id]
    setQuests(s => ({ ...s, [q.id]: { ...s[q.id], done } }))
    const label = QUEST_OBJECTS[group].find(o => o.id === id)?.label
    audio.tone(740,.35,.14); flash(`${label} 已锁定 · ${done.length}/${q.goal}`)
    if (done.length >= q.goal) setTimeout(()=>say('岑苓 · 通讯', '三点都亮了。回来找我。', 4000), 800)
  }
  const activate = (group, id) => {
    const q = QUESTS.find(x => x.targets === group), st = questsRef.current[q?.id]
    if (!q || st?.state !== 'active' || st.done?.includes(id)) return
    const done = [...(st.done||[]), id]
    setQuests(s => ({ ...s, [q.id]: { ...s[q.id], done } }))
    const label = QUEST_OBJECTS[group].find(o => o.id === id)?.label
    flash(`${label} 已接入 · ${done.length}/${q.goal}`)
    if (done.length >= q.goal) setTimeout(()=>say('樰', '中继全部上线。回到我这里。', 4000), 800)
  }

  // 当前追踪目标：给罗盘用，优先指向最近未完成的任务节点，其次指向任务发布者
  const trackTarget = useMemo(() => {
    for (const q of QUESTS) {
      const st = quests[q.id]
      if (!st || st.state === 'done') continue
      if (st.state === 'active') {
        if (q.type === 'collect') {
          if (hasItem(q.need.item, q.need.qty)) { const n = npcById(q.giver); return { position: n.position, label: `回报 ${n.name}` } }
          const t = q.hintTargets.map(id => SUPPLIES.find(s=>s.id===id)).find(s => s && !collected.includes(s.id))
          if (t) return { position: t.position, label: t.label }
          const n = npcById(q.giver); return { position: n.position, label: `回报 ${n.name}` }
        }
        const remain = QUEST_OBJECTS[q.targets].find(o => !st.done?.includes(o.id))
        if (remain) return { position: remain.position, label: remain.label }
        const n = npcById(q.giver); return { position: n.position, label: `回报 ${n.name}` }
      }
    }
    // 没有进行中的任务：指向下一位可对话的 NPC
    const next = NPCS.find(n => (!quests[n.quest] || quests[n.quest].state !== 'done') && (n.requires !== 'meeting' || meeting))
    return next ? { position: next.position, label: next.name } : null
  }, [quests, collected, inventory, meeting])

  const qteHit = () => {
    const q=qteRef.current; if(!q)return
    const good=Math.abs(q.marker-50)<11
    audio.tone(good?620:90,good?.22:.45,.2)
    const hits=Math.max(0,q.hits+(good?1:-1))
    if(hits>=3){
      setQte(null)
      const best = keySupplies>=KEY_SUPPLY_GOAL && questsDone>=QUEST_GOAL
      setEnding(best?'deeper':keySupplies>=KEY_SUPPLY_GOAL?'synced':'partial')
      audio.tone(840,.9,.18)
    } else setQte({...q,hits,marker:good?3:q.marker})
  }
  useEffect(()=>{ if(!qte)return; let raf,last=performance.now(); const tick=now=>{const dt=Math.min((now-last)/16.67,2);last=now;setQte(q=>{if(!q)return q;let marker=q.marker+q.dir*1.7*dt,dir=q.dir;if(marker>100){marker=100;dir=-1}if(marker<0){marker=0;dir=1}const time=q.time-.12*dt;if(time<=0){setEnding('locked');return null}return {...q,marker,dir,time}});raf=requestAnimationFrame(tick)};raf=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf)},[!!qte])
  useEffect(()=>{
    const down=e=>{
      if(screen!=='game')return
      if(dialogRef.current){ if(e.code==='KeyE'||e.code==='Space'||e.code==='Enter'){e.preventDefault();advanceDialog()} if(e.code==='Escape')setDialog(null); return }
      if(e.code==='KeyF'){setFlashlight(v=>!v);audio.tone(210,.09,.07)}
      if(e.code==='KeyQ')setScannerPulse(v=>v+1)
      if(e.code==='KeyJ'||e.code==='Tab'){e.preventDefault();setShowLog(v=>!v)}
      if(e.code==='Space'&&qteRef.current){e.preventDefault();qteHit()}
      if(e.code==='KeyP'||(e.code==='Escape'&&document.pointerLockElement==null))setPaused(v=>!v)
    }
    addEventListener('keydown',down);return()=>removeEventListener('keydown',down)
  },[screen,audio])
  const toggleMute=()=>{const next=!muted;setMuted(next);audio.setMuted(next)}

  if(screen==='title')return <main className="title">
    <div className="titleArt" style={{backgroundImage:`url(${wasteland})`}}/><div className="titleShade"/>
    <section><p className="eyebrow">LING CAGE // IMMERSIVE CONCEPT 03</p><h1>地表回声</h1><h2>SURFACE ECHO</h2><p className="lede">一段来自地下的呼号，比你早三秒说出你的名字。带够补给，也带回还在呼吸的人。</p><button className="primary" onClick={start}>进入地表 <span>↗</span></button><div className="quick"><b>第一人称探索 · 物资搜寻 · NPC 委托</b><span>WASD 移动 · 鼠标观察 · Shift 冲刺 · C 蹲伏</span><span>F 手电 · Q 脉冲扫描 · E/左键 交互与对话 · 长按 R/左键 搜寻 · J 任务日志 · P 暂停</span></div><small>灵笼世界观粉丝向概念 Demo · 场景资产由 Blender 程序化生成</small></section>
  </main>

  const guide = status.guide
  return <main className={`game ${status.threat?'danger':''} ${qte?'syncing':''}`}>
    <World3D running={screen==='game'&&!ending} paused={paused||!!qte} dialog={!!dialog} found={found} threatDone={threatDone} meeting={meeting} confirmed={confirmed} flashlight={flashlight} scannerPulse={scannerPulse} audio={audio} collected={collected} quests={quests} trackTarget={trackTarget} onStatus={setStatus} onDiscover={discover} onThreat={threat} onSafe={safe} onMeet={meet} onConfirm={confirm} onCollect={collect} onTalk={talk} onScanTarget={scanTarget} onActivate={activate}/>
    <div className="grain"/><div className="lens"/><div className="cinema top"/><div className="cinema bottom"/>
    <header className="minimalHud"><div><b>地表回声</b><span>SECTOR 07 · {Math.max(0,Math.floor(-status.position.z))} m</span></div><nav><button onClick={()=>setShowLog(v=>!v)}><ClipboardList/></button><button onClick={toggleMute}>{muted?<VolumeX/>:<Volume2/>}</button><button onClick={()=>setPaused(true)}><Pause/></button></nav></header>
    <aside className="mission"><span>0{objective+1} // 当前目标</span><b>{OBJECTIVES[objective]}</b><div className="keygoal"><Package size={12}/> 关键补给 {keySupplies}/{KEY_SUPPLY_GOAL}</div><div className="keygoal"><ClipboardList size={12}/> 委托完成 {questsDone}/{QUEST_GOAL}</div></aside>
    {guide&&!qte&&<div className="compass"><Compass size={13}/><span>{guide.label}</span><b>{guide.dist}m</b><i style={{transform:`rotate(${guide.angle}rad)`}}/></div>}
    <div className={`flashState ${flashlight?'on':''}`}><Flashlight size={15}/></div>
    <div className="reticle"><i/><i/><i/><i/></div>
    {status.searching&&<section className="searching"><span>搜寻中 · {status.searching.label}</span><div><i style={{width:`${Math.min(100,status.searching.p*100)}%`}}/></div><small>{status.threat?'危险：搜寻正在暴露你':'保持不动'}</small></section>}
    {status.prompt&&!qte&&!dialog&&!status.searching&&<div className="worldPrompt">{status.prompt}</div>}
    {status.threat&&!status.searching&&<section className="stealth"><span>保持静止 · C 蹲伏</span><div><i style={{width:`${status.hidden*100}%`}}/></div><small>{status.crouch?'轮廓降低':'它听见了脚步'}</small></section>}
    {toast&&<div className="questToast"><ClipboardList size={14}/>{toast}</div>}
    {pickup&&<section className="pickup"><Backpack size={16}/><p>{pickup.flavor}</p></section>}
    {caption&&!dialog&&<section className="caption"><small>{caption.source}</small><p>{caption.text}</p></section>}
    <aside className="inventory"><div className="invHead"><Backpack size={13}/> 携带物资</div>{inventory.length?inventory.map(i=><div key={i.item} className={i.key?'key':''}><span>{i.item}</span><b>×{i.qty}</b></div>):<div className="empty">背包空置 · 长按 R 搜寻</div>}</aside>

    {dialog&&<section className="dialog" onClick={advanceDialog}>
      <div className="dlgArt" style={{backgroundImage:`url(${NPC_ART[dialog.art]})`}}/>
      <div className="dlgBody">
        <div className="dlgWho"><MessageSquare size={13}/><b>{dialog.lines[dialog.i].who}</b><small>{dialog.role}</small></div>
        <p>{dialog.lines[dialog.i].text}</p>
        {dialog.showChoices
          ? <div className="dlgChoices">{dialog.choices.map((c,i)=><button key={i} onClick={e=>{e.stopPropagation();pickChoice(c)}}>{c.text}</button>)}</div>
          : <small className="dlgNext">[ E / 左键 ] 继续</small>}
      </div>
    </section>}

    {showLog&&<aside className="questLog"><h4><ClipboardList size={14}/> 任务日志 <em>J 关闭</em></h4>
      {QUESTS.map(q=>{const st=quests[q.id];const s=st?.state||'unknown';return <div key={q.id} className={`qItem ${s}`}>
        <b>{q.title}</b><span>{s==='done'?'已完成':s==='active'?'进行中':'未接取'}</span>
        <p>{s==='unknown'?`委托人：${npcById(q.giver).name}（尚未接触）`:q.brief}</p>
        {s==='active'&&<div className="qBar"><i style={{width:`${Math.min(100,questProgress(q)/q.goal*100)}%`}}/><em>{questProgress(q)}/{q.goal}</em></div>}
        {s==='active'&&<small>{q.log}</small>}
      </div>})}
      <div className="qFoot">完成度影响结局 · {questsDone}/{QUEST_GOAL}</div>
    </aside>}

    {showHelp&&<section className="help"><h3>猎荒者行动协议</h3><div><span><b>W A S D</b>移动</span><span><b>鼠标</b>观察</span><span><b>SHIFT</b>冲刺</span><span><b>C</b>蹲伏</span><span><b>F</b>手电</span><span><b>Q</b>扫描/点亮信标</span><span><b>E / 左键</b>对话 · 检查 · 接入</span><span><b>长按 R / 左键</b>搜寻物资</span><span><b>J</b>任务日志</span></div><p>回收 {KEY_SUPPLY_GOAL} 份关键补给，并完成 {QUEST_GOAL} 位幸存者的委托 · 点击画面锁定视角 · ESC 释放鼠标</p></section>}
    {qte&&<section className="qte"><div className="qteCore"><Radar/><p>SIGNAL PHASE ALIGNMENT</p><h2>让三个脉冲与回声重合</h2><div className="wave"><i className="window"/><i className="needle" style={{left:`${qte.marker}%`}}/></div><div className="hits">{[0,1,2].map(i=><i key={i} className={i<qte.hits?'active':''}/>)}</div><button onClick={qteHit}>SPACE · 锁定相位</button><small>剩余 {Math.ceil(qte.time/10)} 秒</small></div></section>}
    {paused&&!qte&&<section className="pause"><div><small>TRANSMISSION SUSPENDED</small><h2>信号中断</h2><button onClick={()=>setPaused(false)}><Play/>继续探索</button><button onClick={reset}><RotateCcw/>重新开始</button></div></section>}
    {ending&&<section className="ending"><div><small>TRANSMISSION // END</small><h2>{STORY.ending[ending].title}</h2><p>{STORY.ending[ending].text}</p><div className="endStat">关键补给 {keySupplies}/{KEY_SUPPLY_GOAL} · 委托完成 {questsDone}/{QUEST_GOAL} · 环境线索 {found.length}/{CLUES.length}</div><button onClick={reset}>重新接入地表</button></div></section>}
    <div className="mobileActions"><button onClick={()=>setFlashlight(v=>!v)}><Flashlight/></button><button onClick={()=>setScannerPulse(v=>v+1)}><Radar/></button><button onClick={()=>setShowLog(v=>!v)}><ClipboardList/></button><button onClick={()=>dialog?advanceDialog():document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyE'}))}>E</button><button onPointerDown={()=>document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyC'}))} onPointerUp={()=>document.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyC'}))}>蹲</button></div>
  </main>
}
createRoot(document.getElementById('root')).render(<App />)
