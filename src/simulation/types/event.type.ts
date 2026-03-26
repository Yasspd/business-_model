export type EventType = 'trend' | 'crisis' | 'noise';

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
