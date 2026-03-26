export interface EntityHistoryItem {
  step: number;
  state: string;
  x: number;
  y: number;
  temperature: number;
  influence: number;
  velocity: number;
  riskScore: number;
  localThreshold: number;
  action: string;
}
