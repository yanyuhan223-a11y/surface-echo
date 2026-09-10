import { useEffect, useRef, useState } from 'react';
import GameUI from './GameUI';
import { HallWorld, initialState } from './game/HallWorld';
import type { WorldState } from './game/HallWorld';
import './style.css';

export default function App() {
  const container = useRef<HTMLDivElement>(null), world = useRef<HallWorld | null>(null);
  const [state, setState] = useState<WorldState>(initialState);
  useEffect(() => {
    if (!container.current) return;
    try {
      const instance = new HallWorld(container.current, setState); world.current = instance;
      if (import.meta.env.DEV) Object.assign(window, { hallDiagnostics: () => instance.diagnostics() });
      return () => { instance.dispose(); world.current = null; };
    } catch (error) {
      console.error(error); setState(s => ({ ...s, error: '此浏览器未能启动 WebGL。请开启硬件加速，或使用支持 WebGL 的浏览器重新打开。' }));
    }
  }, []);
  return <main className="surface-echo">
    <div className="world-viewport" ref={container}/>
    <GameUI {...state} onStart={() => world.current?.start()} onTour={() => world.current?.tour()}
      onPause={() => world.current?.pause()} onResume={() => world.current?.resume()} onToggleMute={() => world.current?.toggleMute()}
      onToggleView={() => world.current?.toggleView()} onCloseRecord={() => world.current?.closeRecord()} onInteract={() => world.current?.interact()}
      onRestart={() => world.current?.restart()} onMove={(direction, pressed) => world.current?.move(direction, pressed)}
      onInteractionHold={pressed => world.current?.hold(pressed)} onCloseStory={() => world.current?.closeStory()}
      onChooseStory={ending => world.current?.chooseStory(ending)}/>
    {state.error && <div className="scene-error" role="alert"><h2>信号暂时中断</h2><p>{state.error}</p><button onClick={() => location.reload()}>重新载入</button></div>}
  </main>;
}
