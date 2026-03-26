export const ACTION_MODES = [
  'baseline',
  'fixed',
  'adaptive',
  'hybrid',
] as const;

export type Mode = (typeof ACTION_MODES)[number];
export type ActionMode = Mode;

export const LOCAL_ACTIONS = [
  'dampen',
  'notify',
  'watch',
  'no_action',
] as const;
export type LocalAction = (typeof LOCAL_ACTIONS)[number];

export const SYSTEM_ACTIONS = [
  'stabilize_system',
  'rebalance_attention',
  'system_normal',
] as const;
export type SystemAction = (typeof SYSTEM_ACTIONS)[number];
