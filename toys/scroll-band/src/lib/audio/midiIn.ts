// 滚动乐团 · MIDI 键盘输入（Web MIDI API）
// 只做一件事：拿到系统外接 MIDI 设备的 note-on 事件（音号 + 力度）转给上层；
// 判定/发声逻辑不在这里——上层把 MIDI 音符翻成既有琴键入口，判定规则零改动。

interface MidiInHandlers {
  /** MIDI 音号 0..127，力度 0..1（note-off 与 velocity=0 忽略） */
  onNoteOn: (midi: number, vel: number) => void;
}

let access: MIDIInputAccess | null = null;
let bound: MIDIInputLike[] = [];
let handlers: MidiInHandlers | null = null;

// 最小结构声明：不依赖 lib.dom 的完整 Web MIDI 类型，探测式使用
interface MIDIInputLike {
  name?: string;
  onmidimessage: ((e: { data?: Uint8Array }) => void) | null;
}
interface MIDIInputAccess {
  inputs: { forEach: (cb: (i: MIDIInputLike) => void) => void };
}

export function midiInputSupported(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.requestMIDIAccess === "function";
}

/** 请求权限并绑定全部输入设备；返回设备名列表（空数组 = 没插键盘） */
export async function startMidiInput(h: MidiInHandlers): Promise<{
  ok: boolean;
  devices: string[];
  reason?: string;
}> {
  if (!midiInputSupported()) return { ok: false, devices: [], reason: "这台设备的浏览器不支持 MIDI 输入" };
  try {
    if (!access) {
      access = (await navigator.requestMIDIAccess({ sysex: false })) as unknown as MIDIInputAccess;
    }
    handlers = h;
    const names: string[] = [];
    bound = [];
    access.inputs.forEach((inp) => {
      inp.onmidimessage = (e) => {
        const d = e.data;
        if (!d || d.length < 3 || !handlers) return;
        // 0x9n = note on（vel>0）；0x8n / vel=0 都是松开，本应用不需要续音一律忽略
        if ((d[0] & 0xf0) === 0x90 && d[2] > 0) handlers.onNoteOn(d[1], d[2] / 127);
      };
      bound.push(inp);
      if (inp.name) names.push(inp.name);
    });
    return { ok: true, devices: names };
  } catch {
    return { ok: false, devices: [], reason: "没拿到 MIDI 权限，再点一次允许试试" };
  }
}

export function stopMidiInput(): void {
  for (const inp of bound) inp.onmidimessage = null;
  bound = [];
  handlers = null;
}
