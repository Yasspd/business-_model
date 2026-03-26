import { LocalAction } from './action-mode.type';
import { EntityHistoryItem } from './history.type';
import { EntitySegment, State } from './scenario-config.type';

export interface Entity {
  id: string;
  segment: EntitySegment;
  currentState: State;
  history: EntityHistoryItem[];
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  temperature: number;
  weight: number;
  sensitivity: number;
  relevance: number;
  influence: number;
  velocity: number;
  stateRisk: number;
  failureProbability: number;
  riskScore: number;
  localThreshold: number;
  action: LocalAction;
  isFinished: boolean;
}
