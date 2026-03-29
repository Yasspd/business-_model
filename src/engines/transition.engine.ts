import { Injectable } from '@nestjs/common';
import { clamp, weightedRandomPick, WeightedOption } from './math.util';
import { RandomEngine } from './random.engine';
import {
  RiskMap,
  State,
  Transition,
  TransitionMatrix,
} from '../simulation/types/scenario-config.type';

@Injectable()
export class TransitionEngine {
  validateTransitionMatrix(
    transitionMatrix: TransitionMatrix,
    states: State[],
  ): boolean {
    for (const state of states) {
      const transition = transitionMatrix[state];

      if (!transition) {
        throw new Error(`Missing transition row for state "${state}"`);
      }

      const entries = Object.entries(transition);

      if (entries.length === 0) {
        throw new Error(`Transition row for state "${state}" is empty`);
      }

      for (const [nextState, probability] of entries) {
        if (!states.includes(nextState)) {
          throw new Error(
            `Transition row "${state}" contains unknown state "${nextState}"`,
          );
        }

        if (probability < 0 || probability > 1) {
          throw new Error(
            `Transition probability "${state}" -> "${nextState}" is out of range`,
          );
        }
      }

      const probabilitySum = entries.reduce(
        (sum, [, probability]) => sum + probability,
        0,
      );

      if (Math.abs(probabilitySum - 1) > 1e-9) {
        throw new Error(
          `Transition row "${state}" must sum to 1, received ${probabilitySum}`,
        );
      }
    }

    return true;
  }

  normalizeTransition(transition: Transition): Transition {
    const normalizedEntries = Object.entries(transition).map(
      ([state, probability]) => [state, Math.max(0, probability)] as const,
    );
    const totalProbability = normalizedEntries.reduce(
      (sum, [, probability]) => sum + probability,
      0,
    );

    if (totalProbability <= 0) {
      throw new Error('Normalized transition requires positive total weight');
    }

    return Object.fromEntries(
      normalizedEntries.map(([state, probability]) => [
        state,
        probability / totalProbability,
      ]),
    );
  }

  pickNextState(
    currentState: State,
    transitionMatrix: TransitionMatrix,
    randomEngine: RandomEngine,
  ): State {
    const transition = transitionMatrix[currentState];

    if (!transition) {
      throw new Error(`Missing transition row for state "${currentState}"`);
    }

    return this.pickNextStateFromTransition(transition, randomEngine);
  }

  pickNextStateFromTransition(
    transition: Transition,
    randomEngine: RandomEngine,
  ): State {
    const normalizedTransition = this.normalizeTransition(transition);
    const options: Array<WeightedOption<State>> = Object.entries(
      normalizedTransition,
    ).map(([value, weight]) => ({
      value,
      weight,
    }));

    return weightedRandomPick(options, randomEngine.next());
  }

  estimateFailureProbability(
    currentState: State,
    transitions: TransitionMatrix,
    failureStates: State[],
    successStates: State[],
    riskMap: RiskMap,
    depth = 4,
  ): number {
    const memo = new Map<string, number>();

    const walk = (state: State, remainingDepth: number): number => {
      const memoKey = `${state}:${remainingDepth}`;
      const cached = memo.get(memoKey);

      if (cached !== undefined) {
        return cached;
      }

      if (failureStates.includes(state)) {
        memo.set(memoKey, 1);
        return 1;
      }

      if (successStates.includes(state)) {
        memo.set(memoKey, 0);
        return 0;
      }

      if (remainingDepth === 0) {
        const boundedRisk = clamp(riskMap[state] ?? 0, 0, 1);
        memo.set(memoKey, boundedRisk);
        return boundedRisk;
      }

      const transition = transitions[state];

      if (!transition) {
        const boundedRisk = clamp(riskMap[state] ?? 0, 0, 1);
        memo.set(memoKey, boundedRisk);
        return boundedRisk;
      }

      const failureProbability = Object.entries(transition).reduce(
        (sum, [nextState, transitionProbability]) =>
          sum + transitionProbability * walk(nextState, remainingDepth - 1),
        0,
      );

      const boundedProbability = clamp(failureProbability, 0, 1);
      memo.set(memoKey, boundedProbability);

      return boundedProbability;
    };

    return walk(currentState, depth);
  }
}
