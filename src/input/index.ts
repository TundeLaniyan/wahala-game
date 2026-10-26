export { InputManager } from './InputManager';
export type { InputManagerEvents, IntentContext } from './InputManager';
export type { ActionName, InputSourceName, NavCommand } from './types';
/** Binding tables (read by the How to Play legend so it always shows the real controls). */
export { ACTION_KEYS, MOVE_KEYS, NAV_KEYS } from './keyboard';
export { ACTION_BUTTONS } from './gamepad';
export { SPECIAL_HOLD_MS, SPECIAL_HOLD_TICKS } from './specialHold';
export { buildMoveBoard, resolveAssistLevel, MOVE_ASSIST_SETTINGS } from './moveAssist';
export type { AssistLevel, MoveAssistSetting, MoveBoard } from './moveAssist';
