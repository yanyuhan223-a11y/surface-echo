export type Direction = 'forward' | 'backward' | 'left' | 'right';
export type GameMode = 'intro' | 'play' | 'tour' | 'paused';
export interface Point2 { x: number; z: number }
export interface RecordData { title: string; subtitle: string; body: string[] }
export interface Investigation { id: string; title: string; position: [number, number, number]; record: RecordData }

export const investigations: Investigation[] = [
  { id: 'power', title: '配电终端', position: [-8, 0, 10], record: {
    title: '备用回路 / 接通', subtitle: '01 · 设施记录', body: [
      '终端覆盖着薄薄的灰。马克擦过屏幕，青色的字符在玻璃深处重新亮起。',
      '「主电源离线。备用回路可用。环形传送装置：待机。」',
      '马克：至少，这里还有东西醒着。',
      '你接通了备用回路。中央控制台已解锁，靠近后按住 E 为装置蓄能。',
    ] } },
  { id: 'manifest', title: '遗留记录', position: [12.5, 0, -8], record: {
    title: '最后一次下行', subtitle: '02 · 残存档案', body: [
      '一份未完成的转运记录停留在屏幕上。出发人数一栏被反复修改，返回一栏始终空白。',
      '「若收到地表回波，不要直接回应。先确认它是否来自人类。」',
      '马克：他们听到了什么……',
      '记录到这里中断。墙后的管道传来一声遥远的轻响，像有人敲了一下金属。',
    ] } },
  { id: 'echo', title: '异常回波', position: [-10, 0, -12], record: {
    title: '有谁在另一端', subtitle: '03 · 未知信号', body: [
      '接收器没有连接外部天线，指示灯却仍在微弱闪烁。',
      '白噪音中，传来一段极轻的呼吸。一瞬间，马克以为听到了自己的名字。',
      '陌生的声音：……别回头。',
      '信号消失了。只有悬环的低鸣还在头顶盘旋。地表正在等待。',
    ] } },
  { id: 'helmet', title: '遗落头盔', position: [-15, 0, 3], record: {
    title: '没有归队的人', subtitle: '04 · 环境证据', body: [
      '头盔内侧刻着编号 B-27，通讯缓存却显示它在撤离后仍发送过三次定位。',
      '最后一次定位来自传送核心内部。那里不该容得下一个人。',
      '马克把头盔翻过来，发现面罩上有从内部留下的五道指痕。',
    ] } },
  { id: 'footprint', title: '逆向足迹', position: [9, 0, 12], record: {
    title: '从门里走出来', subtitle: '05 · 痕迹扫描', body: [
      '尘埃中的脚印从封闭的传送门开始，走向大厅，却没有进入传送门的对应痕迹。',
      '步幅与马克完全一致。扫描时间比他抵达大厅早了七小时。',
      '系统建议：不要假设时间只朝一个方向流动。',
    ] } },
  { id: 'voice', title: '未发送留言', position: [14, 0, 5], record: {
    title: '如果你听见我', subtitle: '06 · 私人记录', body: [
      '声音属于失踪队员岚，但背景里同时出现了今天才恢复的备用电源蜂鸣。',
      '岚：别相信第一段呼救。它会用我们希望听见的声音。',
      '录音末尾，另一个与马克相同的声音说：把故事写完整，我才能回来。',
    ] } },
];
export const corePosition: [number, number, number] = [0, 0, 3.2];

/** Swept substeps prevent a long frame from crossing the central pillar or deck edge. */
export function constrainMovement(from: Point2, desired: Point2): Point2 {
  const dx = desired.x - from.x, dz = desired.z - from.z;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.18));
  let p = { ...from };
  for (let i = 1; i <= steps; i++) {
    let x = p.x + dx / steps, z = p.z + dz / steps;
    const r = Math.hypot(x, z);
    if (r < 1.95) { x = x / (r || 1) * 1.95; z = z / (r || 1) * 1.95; }
    if (r > 20.65) { x = x / r * 20.65; z = z / r * 20.65; }
    // The raised ring is reached by the four stairs, not by stepping through its face.
    const before = Math.hypot(p.x, p.z), after = Math.hypot(x, z);
    const onStairs = Math.min(Math.abs(x), Math.abs(z)) < 1.45;
    if (!onStairs && ((before < 18.4 && after >= 18.4) || (before >= 18.4 && after < 18.4))) {
      const limit = before < 18.4 ? 18.38 : 18.42;
      x = x / after * limit; z = z / after * limit;
    }
    // Raised central terminal and freestanding investigation consoles.
    for (const obstacle of [...investigations.map(v => v.position), corePosition]) {
      const ox = x - obstacle[0], oz = z - obstacle[2], d = Math.hypot(ox, oz);
      if (d < 0.78 && d > 0) { x = obstacle[0] + ox / d * .78; z = obstacle[2] + oz / d * .78; }
    }
    p = { x, z };
  }
  return p;
}

export function floorHeight(x: number, z: number) {
  const r = Math.hypot(x, z);
  if (r >= 18.5) return .65;
  if (Math.min(Math.abs(x), Math.abs(z)) < 1.5 && r > 16.5) return (r - 16.5) / 2 * .65;
  return .08;
}

export function activationStep(current: number, dt: number, holding: boolean, powered: boolean, nearCore: boolean) {
  if (current >= 1) return 1;
  return holding && powered && nearCore ? Math.min(1, current + Math.max(0, Math.min(dt, .1)) / 2.6) : Math.max(0, current - dt * .8);
}

export function nearestTarget(position: Point2, radius = 3.25) {
  const all = [...investigations, { id: 'core', title: '传送控制台', position: corePosition }];
  return all.map(target => ({ target, distance: Math.hypot(target.position[0] - position.x, target.position[2] - position.z) }))
    .filter(v => v.distance < radius).sort((a, b) => a.distance - b.distance)[0]?.target ?? null;
}
