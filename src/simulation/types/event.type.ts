export type EventType = 'trend' | 'crisis' | 'noise';
export type EventPhase =
  | 'inactive'
  | 'ramp_up'
  | 'peak'
  | 'decay'
  | 'aftershock';

export interface Event {
  id: string;
  name: string;
  type: EventType;
  x: number;
  y: number;
  intensity: number;
  severity: number;
  relevance: number;
  scope: number;
  duration: number;
  startStep: number;
  isActive: boolean;
}

export interface EventSnapshot extends Event {
  phase: EventPhase;
  baseIntensity: number;
  baseScope: number;
  baseRelevance: number;
}
