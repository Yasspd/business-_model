import { Injectable } from '@nestjs/common';
import { ActionEngine } from '../engines/action.engine';
import { clamp } from '../engines/math.util';
import { MetricsEngine } from '../engines/metrics.engine';
import { PositionEngine } from '../engines/position.engine';
import { RandomEngine } from '../engines/random.engine';
import { ScoringEngine } from '../engines/scoring.engine';
import { ThresholdEngine } from '../engines/threshold.engine';
import { TransitionEngine } from '../engines/transition.engine';
import { ScenarioService } from '../scenario/scenario.service';
import { RunSimulationDto } from './dto/run-simulation.dto';
import { Entity } from './types/entity.type';
import {
  SimulationResponse,
  SimulationStepItem,
} from './types/simulation-response.type';
import { EntitySegment, Scenario } from './types/scenario-config.type';

@Injectable()
export class SimulationService {
  private static readonly DEFAULT_SEED = 1337;

  constructor(
    private readonly actionEngine: ActionEngine,
    private readonly metricsEngine: MetricsEngine,
    private readonly positionEngine: PositionEngine,
    private readonly scenarioService: ScenarioService,
    private readonly scoringEngine: ScoringEngine,
    private readonly thresholdEngine: ThresholdEngine,
    private readonly transitionEngine: TransitionEngine,
  ) {}

  runSimulation(dto: RunSimulationDto): SimulationResponse {
    const scenario = this.scenarioService.getScenario(dto.scenarioKey);
    const transitionMatrixValidated =
      this.transitionEngine.validateTransitionMatrix(
        scenario.transitionMatrix,
        scenario.states,
      );
    const seed = dto.seed ?? SimulationService.DEFAULT_SEED;
    const randomEngine = new RandomEngine(seed);

    this.applyActiveEventOverride(scenario, dto);

    const entities = this.generateInitialEntities(
      dto.entitiesCount,
      scenario,
      randomEngine,
    );
    const chaosHistory: number[] = [];
    const stepItems: SimulationStepItem[] = [];

    for (let step = 1; step <= dto.steps; step += 1) {
      const activeEvent = this.positionEngine.findPrimaryActiveEvent(
        step,
        scenario.events,
      );
      const activeEventIntensity = activeEvent?.intensity ?? 0;
      const activeEntities = entities.filter((entity) => !entity.isFinished);

      for (const entity of activeEntities) {
        entity.currentState = this.transitionEngine.pickNextState(
          entity.currentState,
          scenario.transitionMatrix,
          randomEngine,
        );
        entity.isFinished = scenario.terminalStates.includes(
          entity.currentState,
        );

        const influence = this.positionEngine.computeInfluence(
          entity,
          activeEvent,
        );
        const nextPosition = this.positionEngine.updatePosition(
          entity,
          activeEvent,
          influence,
        );
        const velocity = this.positionEngine.computeVelocity(
          entity.x,
          entity.y,
          nextPosition.x,
          nextPosition.y,
        );

        entity.prevX = entity.x;
        entity.prevY = entity.y;
        entity.x = nextPosition.x;
        entity.y = nextPosition.y;
        entity.influence = influence;
        entity.velocity = velocity;
        entity.temperature = this.positionEngine.updateTemperature(
          entity.temperature,
          influence,
        );
        entity.stateRisk = this.scoringEngine.computeStateRisk(
          entity.currentState,
          scenario.riskMap,
        );
        entity.failureProbability =
          this.scoringEngine.computeFailureProbability(
            entity.currentState,
            scenario,
          );
        entity.riskScore = this.scoringEngine.computeRiskScore(
          entity.stateRisk,
          entity.temperature,
          entity.influence,
          entity.velocity,
          entity.failureProbability,
          scenario.riskScoreWeights,
        );
      }

      const localThresholds = this.thresholdEngine.computeLocalThresholds(
        activeEntities,
        dto.mode,
        scenario.fixedThresholds,
        scenario.adaptiveThresholds,
      );

      for (const entity of activeEntities) {
        entity.localThreshold =
          localThresholds.get(entity.id) ?? scenario.fixedThresholds.local;
        entity.action = this.actionEngine.decideEntityAction(entity);
        this.actionEngine.applyLocalActionEffects(entity, dto.mode);
      }

      this.refreshEntityRiskScores(activeEntities, scenario);

      const observedStepMetrics = this.metricsEngine.computeStepMetrics(
        entities,
        activeEvent,
        scenario.clusterRadius,
        scenario.hotTemperatureThreshold,
        scenario.chaosIndexWeights,
        dto.mode,
      );
      const globalThreshold = this.thresholdEngine.computeGlobalThreshold(
        [...chaosHistory, observedStepMetrics.chaosIndex],
        dto.mode,
        scenario.fixedThresholds,
        scenario.adaptiveThresholds,
      );
      const systemAction = this.actionEngine.decideSystemAction(
        observedStepMetrics.chaosIndex,
        globalThreshold,
      );

      this.actionEngine.applySystemActionEffects(
        systemAction,
        dto.mode,
        activeEntities,
        activeEvent,
      );
      this.refreshEntityRiskScores(activeEntities, scenario);

      const reportedStepMetrics = this.metricsEngine.computeStepMetrics(
        entities,
        activeEvent,
        scenario.clusterRadius,
        scenario.hotTemperatureThreshold,
        scenario.chaosIndexWeights,
        dto.mode,
      );
      const stepItem = this.metricsEngine.buildStepItem(
        step,
        reportedStepMetrics,
        globalThreshold,
        systemAction,
        activeEventIntensity,
        entities,
      );

      chaosHistory.push(reportedStepMetrics.chaosIndex);
      stepItems.push(stepItem);

      for (const entity of activeEntities) {
        entity.isFinished = scenario.terminalStates.includes(
          entity.currentState,
        );
        entity.history.push({
          step,
          state: entity.currentState,
          x: entity.x,
          y: entity.y,
          temperature: entity.temperature,
          influence: entity.influence,
          velocity: entity.velocity,
          riskScore: entity.riskScore,
          localThreshold: entity.localThreshold,
          action: entity.action,
        });
      }
    }

    const entitiesLimit = Math.min(
      dto.returnEntitiesLimit ?? entities.length,
      entities.length,
    );

    return {
      scenarioKey: scenario.key,
      mode: dto.mode,
      seed,
      summary: this.metricsEngine.buildFinalSummary(
        entities,
        stepItems,
        scenario.hotTemperatureThreshold,
      ),
      steps: stepItems,
      entities: entities.slice(0, entitiesLimit),
      debug: {
        clusterRadius: scenario.clusterRadius,
        hotTemperatureThreshold: scenario.hotTemperatureThreshold,
        transitionMatrixValidated,
      },
    };
  }

  private applyActiveEventOverride(
    scenario: Scenario,
    dto: RunSimulationDto,
  ): void {
    if (!dto.activeEventOverride) {
      return;
    }

    const activeEvent =
      scenario.events.find((event) => event.isActive) ?? scenario.events[0];

    if (!activeEvent) {
      return;
    }

    if (dto.activeEventOverride.intensity !== undefined) {
      activeEvent.intensity = clamp(dto.activeEventOverride.intensity, 0, 1);
    }

    if (dto.activeEventOverride.severity !== undefined) {
      activeEvent.severity = clamp(dto.activeEventOverride.severity, 0, 1);
    }

    if (dto.activeEventOverride.relevance !== undefined) {
      activeEvent.relevance = clamp(dto.activeEventOverride.relevance, 0, 1);
    }

    if (dto.activeEventOverride.scope !== undefined) {
      activeEvent.scope = clamp(dto.activeEventOverride.scope, 0, 1);
    }

    if (dto.activeEventOverride.x !== undefined) {
      activeEvent.x = clamp(dto.activeEventOverride.x, 0, 1);
    }

    if (dto.activeEventOverride.y !== undefined) {
      activeEvent.y = clamp(dto.activeEventOverride.y, 0, 1);
    }

    if (dto.activeEventOverride.duration !== undefined) {
      activeEvent.duration = dto.activeEventOverride.duration;
    }

    if (dto.activeEventOverride.startStep !== undefined) {
      activeEvent.startStep = dto.activeEventOverride.startStep;
    }
  }

  private generateInitialEntities(
    entitiesCount: number,
    scenario: Scenario,
    randomEngine: RandomEngine,
  ): Entity[] {
    const segments = this.buildSegmentSequence(
      entitiesCount,
      scenario,
      randomEngine,
    );

    return segments.map((segment, index) =>
      this.createEntity(index + 1, segment, scenario, randomEngine),
    );
  }

  private buildSegmentSequence(
    entitiesCount: number,
    scenario: Scenario,
    randomEngine: RandomEngine,
  ): EntitySegment[] {
    const stableCount = Math.floor(
      entitiesCount * scenario.segmentDistribution.stable,
    );
    const regularCount = Math.floor(
      entitiesCount * scenario.segmentDistribution.regular,
    );
    const reactiveCount = entitiesCount - stableCount - regularCount;
    const segments: EntitySegment[] = [
      ...Array.from({ length: stableCount }, () => 'stable' as const),
      ...Array.from({ length: regularCount }, () => 'regular' as const),
      ...Array.from({ length: reactiveCount }, () => 'reactive' as const),
    ];

    return randomEngine.shuffle(segments);
  }

  private createEntity(
    entityIndex: number,
    segment: EntitySegment,
    scenario: Scenario,
    randomEngine: RandomEngine,
  ): Entity {
    const preset = scenario.segmentPresets[segment];
    const x = randomEngine.nextInRange(
      preset.position.min,
      preset.position.max,
    );
    const y = randomEngine.nextInRange(
      preset.position.min,
      preset.position.max,
    );
    const temperature = randomEngine.nextInRange(
      preset.temperature.min,
      preset.temperature.max,
    );
    const weight = randomEngine.nextInRange(
      preset.weight.min,
      preset.weight.max,
    );
    const sensitivity = randomEngine.nextInRange(
      preset.sensitivity.min,
      preset.sensitivity.max,
    );
    const relevance = randomEngine.nextInRange(
      preset.relevance.min,
      preset.relevance.max,
    );
    const stateRisk = this.scoringEngine.computeStateRisk(
      preset.initialState,
      scenario.riskMap,
    );
    const failureProbability = this.scoringEngine.computeFailureProbability(
      preset.initialState,
      scenario,
    );
    const riskScore = this.scoringEngine.computeRiskScore(
      stateRisk,
      temperature,
      0,
      0,
      failureProbability,
      scenario.riskScoreWeights,
    );

    return {
      id: `entity-${entityIndex}`,
      segment,
      currentState: preset.initialState,
      history: [],
      x,
      y,
      prevX: x,
      prevY: y,
      temperature,
      weight,
      sensitivity,
      relevance,
      influence: 0,
      velocity: 0,
      stateRisk,
      failureProbability,
      riskScore,
      localThreshold: scenario.fixedThresholds.local,
      action: 'no_action',
      isFinished: scenario.terminalStates.includes(preset.initialState),
    };
  }

  private refreshEntityRiskScores(
    entities: Entity[],
    scenario: Scenario,
  ): void {
    for (const entity of entities) {
      entity.riskScore = this.scoringEngine.computeRiskScore(
        entity.stateRisk,
        entity.temperature,
        entity.influence,
        entity.velocity,
        entity.failureProbability,
        scenario.riskScoreWeights,
      );
    }
  }
}
