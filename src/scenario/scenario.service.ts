import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { TransitionEngine } from '../engines/transition.engine';
import {
  Scenario,
  ScenarioListItem,
} from '../simulation/types/scenario-config.type';
import { DEFAULT_SCENARIO, SCENARIOS } from './scenario.config';

@Injectable()
export class ScenarioService implements OnModuleInit {
  private readonly scenarios = new Map<string, Scenario>(
    SCENARIOS.map((scenario) => [scenario.key, scenario]),
  );

  constructor(private readonly transitionEngine: TransitionEngine) {}

  onModuleInit(): void {
    for (const scenario of this.scenarios.values()) {
      this.transitionEngine.validateTransitionMatrix(
        scenario.transitionMatrix,
        scenario.states,
      );
    }
  }

  getDefaultScenario(): Scenario {
    return this.getScenario(DEFAULT_SCENARIO.key);
  }

  getScenario(scenarioKey: string): Scenario {
    const scenario = this.scenarios.get(scenarioKey);

    if (!scenario) {
      throw new NotFoundException(`Scenario "${scenarioKey}" was not found`);
    }

    return structuredClone(scenario);
  }

  listScenarios(): ScenarioListItem[] {
    return Array.from(this.scenarios.values()).map(({ key, name }) => ({
      key,
      name,
    }));
  }
}
