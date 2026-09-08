export const CLUES = [
  { id: 'helmet', position: [-6, 1, -15], label: '遗落头盔', title: '07 队员记录', fragment: '“不是兽群……它在模仿我们的呼号。”', note: '头盔内侧附着逆生长孢膜。' },
  { id: 'terminal', position: [7, 1, -34], label: '故障终端', title: '维护日志 · 断片', fragment: '“凌晨 03:17。地下站台收到来自灯塔上方的回应。”', note: '回应时间早于呼叫发出时间。' },
  { id: 'cocoon', position: [-5, 1, -61], label: '空茧', title: '生物扫描', fragment: '内部有人类体温。没有生命体。', note: '空茧正在重复马克的心率。' }
]

export const STORY = {
  intro: '07 号信标恢复脉冲。进入旧城换乘站，确认是否存在幸存者。',
  firstSignal: ['…马…克…', '这不是灯塔频段。'],
  threat: ['别动。', '它靠震动辨认你。'],
  calm: ['脚步远去了。', '可第二道呼吸还在耳机里。'],
  meeting: ['你终于听见了。', '别相信灯塔发来的下一句话。'],
  confirm: ['扫描器捕获到实体轮廓。', '她存在。至少此刻存在。'],
  ending: {
    locked: { title: '回声之前', text: '同步失败。少女的轮廓被黑暗吞没。通讯器里，传来另一个“你”的呼吸。' },
    partial: { title: '半程回声', text: '波形勉强重合，但你的补给不足以支撑更深的下潜。樰留下一句“下次带够，再来找我”，身影散入尘雾。' },
    synced: { title: '回声之后', text: '关键补给足以点亮通道。波形重合的一瞬，灯塔在云层上的倒影熄灭了。樰留下一个坐标——指向更深的地底。' },
    deeper: { title: '同频者', text: '你带回了补给，也带回了三个还在呼吸的人。中继阵列一齐亮起，整座换乘站像一颗重新跳动的心脏。樰第一次看着你笑：“这次，回声属于你们。”通道尽头的黑暗向下延伸，而这一次，你不是一个人。' }
  }
}

export const OBJECTIVES = [
  '沿应急灯进入换乘站',
  '回收 3 份关键补给',
  '避开正在巡游的生物',
  '确认第三处生命回声',
  '用脉冲扫描确认她的存在',
  '同步未知信号'
]

// 猎荒者物资搜寻系统：散布在纵深空间中，靠近后长按搜寻
// key=true 计入灯塔关键补给目标；lore 触发无线电碎片/遗物叙事
export const SUPPLIES = [
  { id: 's1', position: [-6.5, 0.6, -12], kind: 'container', label: '锈蚀集装箱', item: '能源电池', qty: 2, key: true, time: 2.2, flavor: '能源电池 ×2 · 灯塔电力急需', lore: '箱体内侧刻着上一支猎荒队的编号：R-04。' },
  { id: 's2', position: [7.5, 0.5, -24], kind: 'locker', label: '医疗储物柜', item: '医疗包', qty: 1, key: false, time: 1.8, flavor: '医疗包 ×1 · 含猩红素抑制剂', lore: '' },
  { id: 's3', position: [-7.5, 0.4, -40], kind: 'corpse', label: '猎荒者遗骸', item: '旧世笔记', qty: 1, key: false, time: 2.6, time_crouch: true, flavor: '旧世笔记 ×1', lore: '“灯塔的坐标是骗局。真正的回声在更深处。” —— 队长手记' },
  { id: 's4', position: [6, 0.5, -58], kind: 'ammo', label: '弹药箱', item: '磁轨弹', qty: 1, key: false, time: 1.6, flavor: '磁轨弹 ×1 · 勉强够一轮', lore: '' },
  { id: 's5', position: [-5.5, 0.6, -72], kind: 'crate', label: '补给木箱', item: '关键补给', qty: 1, key: true, time: 2.4, flavor: '关键补给 ×1 · 灯塔配给章', lore: '' },
  { id: 's6', position: [7, 0.5, -88], kind: 'crate', label: '塌方下的箱体', item: '关键补给', qty: 1, key: true, time: 2.8, flavor: '关键补给 ×1 · 最后一箱', lore: '残骸里还攥着半张全家福——三大法则之前的旧世界。' },
  { id: 's7', position: [-7.2, 0.5, -50], kind: 'locker', label: '倾倒的医疗箱', item: '医疗包', qty: 1, key: false, time: 2.0, flavor: '医疗包 ×1 · 封口尚未破损', lore: '' }
]
export const KEY_SUPPLY_GOAL = 3

// ---------------------------------------------------------------------------
// NPC：全部为高精度立绘 billboard，靠近后可对话；对话推进任务状态机
// ---------------------------------------------------------------------------
export const NPCS = [
  {
    id: 'ranger', name: '陈默', role: 'R-04 残部 · 重伤',
    art: 'ranger', position: [-6.8, 0, -28], scale: 3.1, tint: 0xffdcc2,
    quest: 'q_medic'
  },
  {
    id: 'operator', name: '岑苓', role: '失联通讯兵',
    art: 'operator', position: [7.6, 0, -64], scale: 3.4, tint: 0xd9f2ee,
    quest: 'q_beacon'
  },
  {
    id: 'xue', name: '樰', role: '？？？',
    art: 'xue', position: [1.6, 0, -92], scale: 3.6, tint: 0xcfeeec,
    quest: 'q_relay', requires: 'meeting'
  }
]

// ---------------------------------------------------------------------------
// 任务系统：数据驱动。每个任务包含 接取对话 / 进行中对话 / 回报对话
// type: collect（交付物品） · locate（脉冲扫描定位） · operate（现场操作装置）
// ---------------------------------------------------------------------------
export const QUESTS = [
  {
    id: 'q_medic', giver: 'ranger', title: '止血', type: 'collect',
    brief: '为陈默找到 1 份医疗包并带回来。',
    need: { item: '医疗包', qty: 1 }, goal: 1,
    hintTargets: ['s2', 's7'],
    offer: [
      { who: '陈默', text: '别开枪……我是 R-04 的。左腹被脊蛊蹭了一下，血止不住。' },
      { who: '陈默', text: '这层站台有医疗柜，东侧和西侧各一个。带一份回来，我把巡游路线告诉你。' }
    ],
    choices: [
      { text: '我去找。撑住。', reply: '我等你。别走中间轨道，它就贴着轨道走。', accept: true },
      { text: '我的任务优先。', reply: '……那就当我没说。你要是改主意，我还在这。', accept: false }
    ],
    progress: [{ who: '陈默', text: '还没有？医疗柜的锁很松，长按就能撬开。' }],
    turnIn: [
      { who: '陈默', text: '猩红素抑制剂……可以，够撑到你回来。' },
      { who: '陈默', text: '记住：它靠震动定位。搜寻时蹲下，别站着翻箱子。' }
    ],
    reward: { item: '能源电池', qty: 1, key: true, note: '陈默把最后一块电池塞给你' },
    log: '把医疗包交给换乘站西侧的陈默'
  },
  {
    id: 'q_beacon', giver: 'operator', title: '三点定位', type: 'locate',
    brief: '用脉冲扫描找出 3 台仍在工作的信标。',
    goal: 3, targets: 'beacons',
    offer: [
      { who: '岑苓', text: '你也是被那道呼号引下来的？我的小队三天前就断联了。' },
      { who: '岑苓', text: '站台里还有三台备用信标在跳。用你的脉冲扫描对准它们，我就能三点定位出信号源。' }
    ],
    choices: [
      { text: '交给我。信标在哪？', reply: '扫描的时候看罗盘，我给你标方向。', accept: true },
      { text: '信号源可能是陷阱。', reply: '我知道。可我的人还在那头。', accept: true }
    ],
    progress: [{ who: '岑苓', text: '还差几台。对准信标按 Q，别隔太远。' }],
    turnIn: [
      { who: '岑苓', text: '三点全亮了……源头在站台最深处，深度还在往下走。' },
      { who: '岑苓', text: '拿着这个中继钥匙。如果你真要往下，你会需要它。' }
    ],
    reward: { item: '中继钥匙', qty: 1, key: false, note: '岑苓交出中继钥匙' },
    log: '用 Q 脉冲扫描点亮 3 台备用信标'
  },
  {
    id: 'q_relay', giver: 'xue', title: '重启回声', type: 'operate',
    brief: '在生物巡游的间隙，激活 2 台信号中继台。',
    goal: 2, targets: 'consoles',
    offer: [
      { who: '樰', text: '你听得见我，可这条频道撑不了多久。' },
      { who: '樰', text: '站台里还有两台中继台。把它们接上，我就能把完整的坐标推给你。' }
    ],
    choices: [
      { text: '你到底是什么？', reply: '一个比你更早知道答案的回声。先去接中继。', accept: true },
      { text: '带我去。', reply: '不必带。你走过它们两次了。', accept: true }
    ],
    progress: [{ who: '樰', text: '还有中继台没亮。对着它按 E。' }],
    progressChoices: [
      { text: '我这就去接中继。', reply: '我在这儿等。别走轨道中间。' },
      { text: '不等了，现在就同步相位。', reply: '……好。但你会少听见一些东西。', qte: true }
    ],
    turnIn: [
      { who: '樰', text: '两台都亮了。听——整座站台在回答你。' },
      { who: '樰', text: '现在，把相位对齐。这一次别再让它断线。' }
    ],
    reward: { item: '深层坐标', qty: 1, key: false, note: '樰写下一串坐标' },
    log: '激活站台内的 2 台信号中继台'
  }
]

// 任务交互物：由 Blender 生成的 prop_beacon / prop_console 摆放
export const QUEST_OBJECTS = {
  beacons: [
    { id: 'b1', position: [-8.4, 0, -20], label: '备用信标 A' },
    { id: 'b2', position: [8.2, 0, -46], label: '备用信标 B' },
    { id: 'b3', position: [-8.0, 0, -76], label: '备用信标 C' }
  ],
  consoles: [
    { id: 'c1', position: [6.6, 0, -36], label: '信号中继台 · 东' },
    { id: 'c2', position: [-6.6, 0, -82], label: '信号中继台 · 西' }
  ]
}

export const QUEST_GOAL = QUESTS.length
