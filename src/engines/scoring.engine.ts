import { Injectable } from '@nestjs/common';
import {
  FeatureWeights,
  RiskMap,
  Scenario,
  State,
} from '../simulation/types/scenario-config.type';
import { clamp } from './math.util';
import { TransitionEngine } from './transition.engine';

@Injectable()
export class ScoringEngine {
  constructor(private readonly transitionEngine: TransitionEngine) {}

  computeStateRisk(currentState: State, riskMap: RiskMap): number {
    return clamp(riskMap[currentState] ?? 0, 0, 1);
  }

  computeFailureProbability(
    currentState: State,
    scenario: Pick<
      Scenario,
      | 'transitionMatrix'
      | 'failureStates'
      | 'successStates'
      | 'riskMap'
      | 'maxFailureDepth'
    >,
  ): number {
    return this.transitionEngine.estimateFailureProbability(
      currentState,
      scenario.transitionMatrix,
      scenario.failureStates,
      scenario.successStates,
      scenario.riskMap,
      scenario.maxFailureDepth,
    );
  }

  computeRiskScore(
    stateRisk: number,
    temperature: number,
    influence: number,
    velocity: number,
    failureProbability: number,
    weights: FeatureWeights,
  ): number {
    return clamp(
      weights.stateRisk * stateRisk +
        weights.temperature * temperature +
        weights.influence * influence +
        weights.velocity * velocity +
        weights.failureProbability * failureProbability,
      0,
      1,
    );
  }
}
