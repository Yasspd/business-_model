import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { LocalAction, Mode, SystemAction } from './types/action-mode.type';
import { ListSimulationRunsDto } from './dto/list-simulation-runs.dto';
import { ActionEngine } from '../engines/action.engine';
import {
  AnalysisBehaviorOverrides,
  AnalysisExecutionRequest,
  AnalysisRunExecutor,
  RobustEvaluationResult,
} from '../engines/analysis-engine.type';
import { CausalEngine } from '../engines/causal.engine';
import { clamp } from '../engines/math.util';
import { MetricsEngine } from '../engines/metrics.engine';
import { PositionEngine } from '../engines/position.engine';
import { RandomEngine } from '../engines/random.engine';
import { RobustEngine } from '../engines/robust.engine';
import { ScoringEngine } from '../engines/scoring.engine';
import { ThresholdEngine } from '../engines/threshold.engine';
import { TransitionEngine } from '../engines/transition.engine';
import { UncertaintyEngine } from '../engines/uncertainty.engine';
import { ScenarioService } from '../scenario/scenario.service';
import { SimulationRunStore } from './simulation-run.store';
import { RunSimulationDto } from './dto/run-simulation.dto';
import { Entity } from './types/entity.type';
import { Event, EventSnapshot } from './types/event.type';
import {
  SimulationAnalysis,
  SimulationAnalysisOptions,
} from './types/analysis.type';
import {
  EntitySegment,
  Scenario,
  SimulationProfile,
  SimulationProfileKey,
  Transition,
} from './types/scenario-config.type';
import {
  ActionsBreakdown,
  RunStatus,
  SimulationConfigSnapshot,
  SimulationResponse,
  SimulationRunListItem,
  SimulationStepItem,
} from './types/simulation-response.type';

interface EntityRuntimeState {
  pendingTemperatureDeltas: [number, number];
  pendingInfluenceDeltas: [number, number];
  stressMemory: number;
  cooldownRemaining: number;
}

interface SystemRuntimeState {
  pendingEventIntensityDeltas: [number, number];
}

interface FrozenEntitySnapshot {
  x: number;
  y: number;
  temperature: number;
  historyLength: number;
}

interface SimulationExecutionState {
  entities: Entity[];
  stepItems: SimulationStepItem[];
  actionTotals: ActionsBreakdown;
  hotEntityIds: Set<string>;
  maxHotEntities: number;
  maxTemperature: number;
}

interface BuildResponseOptions {
  runId: string;
  startedAt: string;
  finishedAt: string;
  status: RunStatus;
  dto: RunSimulationDto;
  mode: Mode;
  scenario: Scenario;
  profile: SimulationProfile;
  seed: number;
  transitionMatrixValidated: boolean;
  executionState: SimulationExecutionState;
  activeEventSnapshot: EventSnapshot | null;
  configSnapshot: SimulationConfigSnapshot;
  enforceInvariants: boolean;
}

interface SimulationBehaviorConfig {
  useFixedThresholds: boolean;
  localDecisionsEnabled: boolean;
  localEffectsEnabled: boolean;
  systemDecisionsEnabled: boolean;
  systemEffectsEnabled: boolean;
  localThresholdShift: number;
  globalThresholdShift: number;
}

interface InternalSimulationExecutionOptions {
  persistResult: boolean;
  includeAnalysis: boolean;
  modeOverride?: Mode;
  profileOverride?: SimulationProfileKey;
  behaviorOverrides?: AnalysisBehaviorOverrides;
  scenarioMutator?: (scenario: Scenario, profile: SimulationProfile) => void;
}

@Injectable()
export class SimulationService {
  private static readonly DEFAULT_SEED = 1337;

  constructor(
    private readonly actionEngine: ActionEngine,
    private readonly causalEngine: CausalEngine,
    private readonly metricsEngine: MetricsEngine,
    private readonly positionEngine: PositionEngine,
    private readonly robustEngine: RobustEngine,
    private readonly scenarioService: ScenarioService,
    private readonly scoringEngine: ScoringEngine,
    private readonly thresholdEngine: ThresholdEngine,
    private readonly transitionEngine: TransitionEngine,
    private readonly uncertaintyEngine: UncertaintyEngine,
    private readonly runStore: SimulationRunStore,
  ) {}

  runSimulation(dto: RunSimulationDto): SimulationResponse {
    return this.executeSimulation(dto, {
      persistResult: true,
      includeAnalysis: true,
    });
  }

  getLatestRun(): SimulationResponse {
    return this.runStore.getLatest();
  }

  getRunById(runId: string): SimulationResponse {
    return this.runStore.getById(runId);
  }

  listRuns(query: ListSimulationRunsDto): SimulationRunListItem[] {
    return this.runStore.list(query.limit ?? 10);
  }

  private executeSimulation(
    dto: RunSimulationDto,
    options: InternalSimulationExecutionOptions,
  ): SimulationResponse {
    const scenario = this.scenarioService.getScenario(dto.scenarioKey);
    const effectiveMode = options.modeOverride ?? dto.mode;
    const profileKey =
      options.profileOverride ?? dto.profile ?? scenario.defaultProfile;
    const profile = scenario.profiles[profileKey];

    options.scenarioMutator?.(scenario, profile);

    const transitionMatrixValidated =
      this.transitionEngine.validateTransitionMatrix(
        scenario.transitionMatrix,
        scenario.states,
      );
    const seed = dto.seed ?? SimulationService.DEFAULT_SEED;
    const behavior = this.resolveBehaviorConfig(
      effectiveMode,
      options.behaviorOverrides,
    );
    const randomEngine = new RandomEngine(seed);
    const runId = randomUUID();
    const startedAt = new Date().toISOString();

    this.applyActiveEventOverride(scenario, dto);

    const entities = this.generateInitialEntities(
      dto.entitiesCount,
      scenario,
      randomEngine,
    );
    const runtimeStates = this.createRuntimeStateMap(entities);
    const systemRuntimeState: SystemRuntimeState = {
      pendingEventIntensityDeltas: [0, 0],
    };
    const primaryEvent = this.getPrimaryEvent(scenario.events);
    const activeEventSnapshot = this.buildRunEventSnapshot(primaryEvent);
    const configSnapshot = this.buildConfigSnapshot(scenario, profile);
    const executionState: SimulationExecutionState = {
      entities,
      stepItems: [],
      actionTotals: this.createActionsBreakdown(),
      hotEntityIds: new Set<string>(),
      maxHotEntities: 0,
      maxTemperature: 0,
    };
    const chaosHistory: number[] = [];
    const frozenEntitySnapshots = new Map<string, FrozenEntitySnapshot>();

    this.captureHotEntities(
      executionState,
      entities,
      profile.hotThresholds.system,
    );

    let cumulativeFinished = 0;
    let cumulativeStabilized = 0;
    let cumulativeFailed = 0;

    try {
      for (let step = 1; step <= dto.steps; step += 1) {
        this.assertFrozenEntities(
          executionState.entities.filter((entity) => entity.isFinished),
          frozenEntitySnapshots,
        );

        const activeEntities = executionState.entities.filter(
          (entity) => !entity.isFinished,
        );

        this.applyPendingSystemEffects(primaryEvent, systemRuntimeState);
        this.applyPendingEntityEffects(activeEntities, runtimeStates, profile);

        const eventSnapshot = this.buildStepEventSnapshot(
          primaryEvent,
          step,
          profile,
        );
        const activeEvent =
          eventSnapshot !== null && eventSnapshot.isActive
            ? eventSnapshot
            : null;

        for (const entity of activeEntities) {
          const runtimeState = runtimeStates.get(entity.id);

          if (!runtimeState) {
            throw new Error(
              `Runtime state for entity "${entity.id}" not found`,
            );
          }

          entity.currentState =
            this.transitionEngine.pickNextStateFromTransition(
              this.buildTransitionForEntity(
                entity,
                scenario,
                profile,
                runtimeState,
                randomEngine,
              ),
              randomEngine,
            );

          const influence = this.computeEntityInfluence(
            entity,
            activeEvent,
            profile,
            runtimeState,
            randomEngine,
          );
          const nextPosition = this.positionEngine.updatePosition(
            entity,
            activeEvent,
            influence,
            profile.segmentDynamics[entity.segment].sensitivityMultiplier,
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
          entity.temperature = this.computeEntityTemperature(
            entity,
            influence,
            profile,
            runtimeState,
            randomEngine,
          );
          entity.stateRisk = this.scoringEngine.computeStateRisk(
            entity.currentState,
            scenario.riskMap,
          );
          entity.failureProbability = this.computeFailureProbability(
            entity,
            scenario,
            profile,
            runtimeState,
          );
          entity.riskScore = this.scoringEngine.computeRiskScore(
            entity.stateRisk,
            entity.temperature,
            entity.influence,
            entity.velocity,
            entity.failureProbability,
            scenario.riskScoreWeights,
          );
          this.updateRuntimeState(entity, runtimeState, profile);
        }

        const terminalEntities = activeEntities.filter((entity) =>
          this.isTerminalState(entity.currentState, scenario, profile),
        );
        const terminalEntityIds = new Set(
          terminalEntities.map((entity) => entity.id),
        );
        const actionEligibleEntities = activeEntities.filter(
          (entity) => !terminalEntityIds.has(entity.id),
        );
        const localThresholds = this.thresholdEngine.computeLocalThresholds(
          actionEligibleEntities,
          behavior.useFixedThresholds ? 'fixed' : effectiveMode,
          scenario.fixedThresholds,
          scenario.adaptiveThresholds,
        );

        for (const entity of activeEntities) {
          if (terminalEntityIds.has(entity.id)) {
            entity.localThreshold = clamp(
              scenario.fixedThresholds.local + behavior.localThresholdShift,
              0.35,
              0.95,
            );
            entity.action = 'no_action';
            continue;
          }

          const runtimeState = runtimeStates.get(entity.id);

          if (!runtimeState) {
            throw new Error(
              `Runtime state for entity "${entity.id}" not found`,
            );
          }

          entity.localThreshold = behavior.useFixedThresholds
            ? clamp(
                scenario.fixedThresholds.local + behavior.localThresholdShift,
                0.35,
                0.95,
              )
            : this.adjustLocalThreshold(
                localThresholds.get(entity.id) ??
                  scenario.fixedThresholds.local,
                entity,
                profile,
              ) + behavior.localThresholdShift;
          entity.localThreshold = clamp(entity.localThreshold, 0.35, 0.95);

          if (!behavior.localDecisionsEnabled) {
            entity.action = 'no_action';
            continue;
          }

          entity.action = this.resolveEntityAction(
            entity,
            runtimeState,
            effectiveMode,
            profile,
          );

          if (behavior.localEffectsEnabled) {
            this.actionEngine.applyLocalActionEffects(
              entity,
              'adaptive',
              profile.delayedEffects.localImmediateShare,
            );
            this.scheduleLocalDelayedEffects(
              entity,
              runtimeState,
              'adaptive',
              profile,
            );
            this.applyLocalActionControlSignal(
              entity.action,
              runtimeState,
              'adaptive',
              profile,
            );
          }

          if (entity.action !== 'no_action') {
            runtimeState.cooldownRemaining = Math.max(
              runtimeState.cooldownRemaining,
              profile.inertia.cooldownSteps + 1,
            );
          }

          this.accumulateActions(executionState.actionTotals, entity.action);
        }

        this.refreshEntityRiskScores(activeEntities, scenario);

        const observedMetrics = this.metricsEngine.computeStepMetrics(
          executionState.entities,
          actionEligibleEntities,
          activeEvent,
          scenario.clusterRadius,
          profile.hotThresholds.system,
          scenario.chaosIndexWeights,
          effectiveMode === 'hybrid',
        );
        const computedGlobalThreshold =
          this.thresholdEngine.computeGlobalThreshold(
            [...chaosHistory, observedMetrics.chaosIndex],
            behavior.useFixedThresholds ? 'fixed' : effectiveMode,
            scenario.fixedThresholds,
            scenario.adaptiveThresholds,
          );
        const globalThreshold = behavior.useFixedThresholds
          ? clamp(
              computedGlobalThreshold + behavior.globalThresholdShift,
              0.15,
              0.95,
            )
          : clamp(
              this.adjustGlobalThreshold(computedGlobalThreshold, profile) +
                behavior.globalThresholdShift,
              0.15,
              0.95,
            );
        const systemAction = !behavior.systemDecisionsEnabled
          ? 'system_normal'
          : this.actionEngine.decideSystemAction(
              observedMetrics.chaosIndex,
              globalThreshold,
              profile.systemLayer.stabilizeThreshold,
            );

        if (behavior.systemEffectsEnabled) {
          this.actionEngine.applySystemActionEffects(
            systemAction,
            'adaptive',
            actionEligibleEntities,
            activeEvent,
            profile.delayedEffects.systemImmediateShare,
          );
          this.scheduleSystemDelayedEffects(
            systemAction,
            'adaptive',
            actionEligibleEntities,
            runtimeStates,
            systemRuntimeState,
            profile,
          );
          this.applySystemActionControlSignal(
            systemAction,
            actionEligibleEntities,
            runtimeStates,
            'adaptive',
            profile,
          );
        }

        this.refreshEntityRiskScores(activeEntities, scenario);

        const reportedMetrics = this.metricsEngine.computeStepMetrics(
          executionState.entities,
          actionEligibleEntities,
          activeEvent,
          scenario.clusterRadius,
          profile.hotThresholds.system,
          scenario.chaosIndexWeights,
          effectiveMode === 'hybrid',
        );

        for (const entity of terminalEntities) {
          entity.isFinished = true;
          entity.action = 'no_action';
          this.clearRuntimeState(entity.id, runtimeStates);
        }

        const finishedThisStep = terminalEntities.length;
        const stabilizedThisStep = terminalEntities.filter(
          (entity) => entity.currentState === 'stabilized',
        ).length;
        const failedThisStep = terminalEntities.filter(
          (entity) => entity.currentState === 'failed',
        ).length;

        cumulativeFinished += finishedThisStep;
        cumulativeStabilized += stabilizedThisStep;
        cumulativeFailed += failedThisStep;

        const stepItem = this.metricsEngine.buildStepItem({
          step,
          metrics: reportedMetrics,
          globalThreshold,
          systemAction,
          activeEventIntensity: activeEvent?.intensity ?? 0,
          eventSnapshot: eventSnapshot ? structuredClone(eventSnapshot) : null,
          entities: executionState.entities,
          activeEntities: actionEligibleEntities,
          finishedThisStep,
          stabilizedThisStep,
          failedThisStep,
          cumulativeFinished,
          cumulativeStabilized,
          cumulativeFailed,
        });

        chaosHistory.push(reportedMetrics.chaosIndex);
        executionState.stepItems.push(stepItem);

        for (const entity of activeEntities) {
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

        this.captureHotEntities(
          executionState,
          executionState.entities,
          profile.hotThresholds.system,
        );
        this.captureFrozenEntitySnapshots(
          terminalEntities,
          frozenEntitySnapshots,
        );
      }

      const response = this.buildResponse({
        runId,
        startedAt,
        finishedAt: new Date().toISOString(),
        status: 'completed',
        dto,
        mode: effectiveMode,
        scenario,
        profile,
        seed,
        transitionMatrixValidated,
        executionState,
        activeEventSnapshot,
        configSnapshot,
        enforceInvariants: true,
      });

      const responseWithAnalysis =
        options.includeAnalysis && options.persistResult
          ? this.attachAnalysis(response, dto)
          : response;

      if (options.persistResult) {
        return this.runStore.save(responseWithAnalysis);
      }

      return responseWithAnalysis;
    } catch (error) {
      const response = this.buildResponse({
        runId,
        startedAt,
        finishedAt: new Date().toISOString(),
        status: executionState.stepItems.length > 0 ? 'partial' : 'failed',
        dto,
        mode: effectiveMode,
        scenario,
        profile,
        seed,
        transitionMatrixValidated,
        executionState,
        activeEventSnapshot,
        configSnapshot,
        enforceInvariants: false,
      });

      if (options.persistResult) {
        this.runStore.save(response);
      }

      throw error;
    }
  }

  private attachAnalysis(
    response: SimulationResponse,
    dto: RunSimulationDto,
  ): SimulationResponse {
    const analysisOptions = this.normalizeAnalysisOptions(dto);

    if (!analysisOptions) {
      return response;
    }

    const execute = this.createAnalysisExecutor();
    const analysis: SimulationAnalysis = {};
    let robustEvaluation: RobustEvaluationResult | undefined;

    if (analysisOptions.causal?.enabled) {
      analysis.causal = this.causalEngine.analyze(
        response,
        dto,
        analysisOptions.causal,
        execute,
      );
    }

    if (analysisOptions.robust?.enabled) {
      robustEvaluation = this.robustEngine.evaluate(
        dto,
        analysisOptions.robust,
        execute,
      );
      analysis.robust = robustEvaluation.analysis;
    }

    if (analysisOptions.uncertainty?.enabled) {
      analysis.uncertainty = this.uncertaintyEngine.quantify(
        response,
        dto,
        analysisOptions.uncertainty,
        execute,
        robustEvaluation,
      );
    }

    if (
      analysis.causal === undefined &&
      analysis.robust === undefined &&
      analysis.uncertainty === undefined
    ) {
      return response;
    }

    return {
      ...response,
      analysis,
    };
  }

  private normalizeAnalysisOptions(
    dto: RunSimulationDto,
  ): SimulationAnalysisOptions | null {
    const causalOption = dto.analysisOptions?.causal;
    const robustOption = dto.analysisOptions?.robust;
    const uncertaintyOption = dto.analysisOptions?.uncertainty;
    const normalized: SimulationAnalysisOptions = {};

    if (causalOption && causalOption.enabled !== false) {
      normalized.causal = {
        enabled: true,
        targetMetric: causalOption.targetMetric ?? 'failureRate',
        maxInterventions: causalOption.maxInterventions ?? 6,
      };
    }

    if (robustOption && robustOption.enabled !== false) {
      normalized.robust = {
        enabled: true,
        objective: robustOption.objective ?? 'balanced_resilience',
        scenarioCount: robustOption.scenarioCount ?? 6,
      };
    }

    if (uncertaintyOption && uncertaintyOption.enabled !== false) {
      normalized.uncertainty = {
        enabled: true,
        level: uncertaintyOption.level ?? 0.95,
        method: uncertaintyOption.method ?? 'calibrated_empirical_interval',
        resamples: uncertaintyOption.resamples ?? 8,
      };
    }

    return normalized.causal || normalized.robust || normalized.uncertainty
      ? normalized
      : null;
  }

  private createAnalysisExecutor(): AnalysisRunExecutor {
    return (request: AnalysisExecutionRequest) =>
      this.executeSimulation(request.dto, {
        persistResult: false,
        includeAnalysis: false,
        modeOverride: request.modeOverride,
        profileOverride: request.profileOverride,
        behaviorOverrides: request.behaviorOverrides,
        scenarioMutator: request.scenarioMutator,
      });
  }

  private resolveBehaviorConfig(
    mode: Mode,
    overrides?: AnalysisBehaviorOverrides,
  ): SimulationBehaviorConfig {
    const baseConfig: SimulationBehaviorConfig =
      mode === 'fixed'
        ? {
            useFixedThresholds: true,
            localDecisionsEnabled: false,
            localEffectsEnabled: false,
            systemDecisionsEnabled: false,
            systemEffectsEnabled: false,
            localThresholdShift: 0,
            globalThresholdShift: 0,
          }
        : mode === 'baseline'
          ? {
              useFixedThresholds: false,
              localDecisionsEnabled: true,
              localEffectsEnabled: false,
              systemDecisionsEnabled: true,
              systemEffectsEnabled: false,
              localThresholdShift: 0,
              globalThresholdShift: 0,
            }
          : {
              useFixedThresholds: false,
              localDecisionsEnabled: true,
              localEffectsEnabled: true,
              systemDecisionsEnabled: true,
              systemEffectsEnabled: true,
              localThresholdShift: 0,
              globalThresholdShift: 0,
            };

    const resolved: SimulationBehaviorConfig = {
      ...baseConfig,
      ...overrides,
      localThresholdShift: overrides?.localThresholdShift ?? 0,
      globalThresholdShift: overrides?.globalThresholdShift ?? 0,
    };

    if (!resolved.localDecisionsEnabled) {
      resolved.localEffectsEnabled = false;
    }

    if (!resolved.systemDecisionsEnabled) {
      resolved.systemEffectsEnabled = false;
    }

    return resolved;
  }

  private buildResponse(options: BuildResponseOptions): SimulationResponse {
    const lastStep =
      options.executionState.stepItems[
        options.executionState.stepItems.length - 1
      ] ?? null;
    const summary = this.metricsEngine.buildFinalSummary({
      entities: options.executionState.entities,
      steps: options.executionState.stepItems,
      systemHotThreshold: options.profile.hotThresholds.system,
      hotEntitiesTotal: options.executionState.hotEntityIds.size,
      maxHotEntities: options.executionState.maxHotEntities,
      maxTemperature: options.executionState.maxTemperature,
      actionTotals: options.executionState.actionTotals,
    });

    if (options.enforceInvariants) {
      this.assertRunInvariants(
        options.executionState.entities,
        options.scenario,
        options.profile,
        summary.finishedEntities,
        summary.stabilizedCount,
        summary.failedCount,
      );
    }

    const entitiesLimit = Math.min(
      options.dto.returnEntitiesLimit ?? options.executionState.entities.length,
      options.executionState.entities.length,
    );

    return {
      runId: options.runId,
      startedAt: options.startedAt,
      finishedAt: options.finishedAt,
      status: options.status,
      scenarioKey: options.scenario.key,
      mode: options.mode,
      profile: options.profile.key,
      seed: options.seed,
      entitiesCount: options.dto.entitiesCount,
      requestedSteps: options.dto.steps,
      activeEventSnapshot: options.activeEventSnapshot
        ? structuredClone(options.activeEventSnapshot)
        : null,
      configSnapshot: options.configSnapshot,
      summary,
      lastStep,
      steps: options.executionState.stepItems,
      entities: options.executionState.entities.slice(0, entitiesLimit),
      debug: {
        clusterRadius: options.scenario.clusterRadius,
        hotTemperatureThreshold: options.scenario.hotTemperatureThreshold,
        systemHotThreshold: options.profile.hotThresholds.system,
        visualHotThreshold: options.profile.hotThresholds.visual,
        transitionMatrixValidated: options.transitionMatrixValidated,
      },
    };
  }

  private createRuntimeStateMap(
    entities: Entity[],
  ): Map<string, EntityRuntimeState> {
    return new Map(
      entities.map((entity) => [
        entity.id,
        {
          pendingTemperatureDeltas: [0, 0] as [number, number],
          pendingInfluenceDeltas: [0, 0] as [number, number],
          stressMemory: 0,
          cooldownRemaining: 0,
        },
      ]),
    );
  }

  private createActionsBreakdown(): ActionsBreakdown {
    return {
      watch: 0,
      notify: 0,
      dampen: 0,
      total: 0,
    };
  }

  private captureHotEntities(
    executionState: SimulationExecutionState,
    entities: Entity[],
    hotThreshold: number,
  ): void {
    let currentHotEntities = 0;

    for (const entity of entities) {
      if (entity.temperature >= hotThreshold) {
        executionState.hotEntityIds.add(entity.id);
        currentHotEntities += 1;
      }
    }

    executionState.maxHotEntities = Math.max(
      executionState.maxHotEntities,
      currentHotEntities,
    );
    executionState.maxTemperature = Math.max(
      executionState.maxTemperature,
      this.metricsEngine.computeMaxTemperature(entities),
    );
  }

  private captureFrozenEntitySnapshots(
    terminalEntities: Entity[],
    frozenEntitySnapshots: Map<string, FrozenEntitySnapshot>,
  ): void {
    for (const entity of terminalEntities) {
      frozenEntitySnapshots.set(entity.id, {
        x: entity.x,
        y: entity.y,
        temperature: entity.temperature,
        historyLength: entity.history.length,
      });
    }
  }

  private assertFrozenEntities(
    entities: Entity[],
    frozenEntitySnapshots: Map<string, FrozenEntitySnapshot>,
  ): void {
    for (const entity of entities) {
      const snapshot = frozenEntitySnapshots.get(entity.id);

      if (!snapshot) {
        continue;
      }

      if (
        snapshot.x !== entity.x ||
        snapshot.y !== entity.y ||
        snapshot.temperature !== entity.temperature ||
        snapshot.historyLength !== entity.history.length
      ) {
        throw new Error(`Terminal entity "${entity.id}" was mutated`);
      }
    }
  }

  private accumulateActions(
    actionsBreakdown: ActionsBreakdown,
    action: LocalAction,
  ): void {
    if (action === 'watch') {
      actionsBreakdown.watch += 1;
      actionsBreakdown.total += 1;
      return;
    }

    if (action === 'notify') {
      actionsBreakdown.notify += 1;
      actionsBreakdown.total += 1;
      return;
    }

    if (action === 'dampen') {
      actionsBreakdown.dampen += 1;
      actionsBreakdown.total += 1;
    }
  }

  private applyPendingEntityEffects(
    activeEntities: Entity[],
    runtimeStates: Map<string, EntityRuntimeState>,
    profile: SimulationProfile,
  ): void {
    for (const entity of activeEntities) {
      const runtimeState = runtimeStates.get(entity.id);

      if (!runtimeState) {
        throw new Error(`Runtime state for entity "${entity.id}" not found`);
      }

      entity.temperature = clamp(
        entity.temperature + runtimeState.pendingTemperatureDeltas[0],
        0,
        1,
      );
      runtimeState.pendingTemperatureDeltas = [
        runtimeState.pendingTemperatureDeltas[1],
        0,
      ];
      runtimeState.cooldownRemaining = Math.max(
        0,
        runtimeState.cooldownRemaining - 1,
      );
      runtimeState.stressMemory = clamp(
        runtimeState.stressMemory * profile.inertia.stressMemoryDecay,
        0,
        1,
      );
    }
  }

  private applyPendingSystemEffects(
    activeEvent: Event | null,
    systemRuntimeState: SystemRuntimeState,
  ): void {
    if (activeEvent) {
      activeEvent.intensity = clamp(
        activeEvent.intensity +
          systemRuntimeState.pendingEventIntensityDeltas[0],
        0.1,
        1,
      );
    }

    systemRuntimeState.pendingEventIntensityDeltas = [
      systemRuntimeState.pendingEventIntensityDeltas[1],
      0,
    ];
  }

  private scheduleLocalDelayedEffects(
    entity: Entity,
    runtimeState: EntityRuntimeState,
    mode: Mode,
    profile: SimulationProfile,
  ): void {
    if (mode === 'baseline' || entity.action === 'no_action') {
      return;
    }

    const effect = this.actionEngine.getLocalActionEffect(entity.action);

    this.scheduleDelayedDelta(
      runtimeState.pendingTemperatureDeltas,
      effect.temperatureDelta,
      profile.delayedEffects.localNextStepShare,
      profile.delayedEffects.decayFactor,
    );
    this.scheduleDelayedDelta(
      runtimeState.pendingInfluenceDeltas,
      effect.influenceDelta,
      profile.delayedEffects.localNextStepShare,
      profile.delayedEffects.decayFactor,
    );
  }

  private scheduleSystemDelayedEffects(
    systemAction: SystemAction,
    mode: Mode,
    activeEntities: Entity[],
    runtimeStates: Map<string, EntityRuntimeState>,
    systemRuntimeState: SystemRuntimeState,
    profile: SimulationProfile,
  ): void {
    if (mode === 'baseline' || systemAction === 'system_normal') {
      return;
    }

    const effect = this.actionEngine.getSystemActionEffect(systemAction);

    this.scheduleDelayedDelta(
      systemRuntimeState.pendingEventIntensityDeltas,
      effect.eventIntensityDelta,
      profile.delayedEffects.systemNextStepShare,
      profile.delayedEffects.decayFactor,
    );

    if (effect.entityTemperatureDelta === 0) {
      return;
    }

    for (const entity of activeEntities) {
      const runtimeState = runtimeStates.get(entity.id);

      if (!runtimeState) {
        throw new Error(`Runtime state for entity "${entity.id}" not found`);
      }

      this.scheduleDelayedDelta(
        runtimeState.pendingTemperatureDeltas,
        effect.entityTemperatureDelta,
        profile.delayedEffects.systemNextStepShare,
        profile.delayedEffects.decayFactor,
      );
    }
  }

  private applyLocalActionControlSignal(
    action: LocalAction,
    runtimeState: EntityRuntimeState,
    mode: Mode,
    profile: SimulationProfile,
  ): void {
    if (mode === 'baseline' || action === 'no_action') {
      return;
    }

    const profileMultiplier =
      profile.key === 'stress' ? 1.3 : profile.key === 'realistic' ? 1.15 : 1;

    if (action === 'dampen') {
      runtimeState.stressMemory = clamp(
        runtimeState.stressMemory - 0.16 * profileMultiplier,
        0,
        1,
      );
      return;
    }

    if (action === 'notify') {
      runtimeState.stressMemory = clamp(
        runtimeState.stressMemory - 0.08 * profileMultiplier,
        0,
        1,
      );
      return;
    }

    if (action === 'watch') {
      runtimeState.stressMemory = clamp(
        runtimeState.stressMemory - 0.04 * profileMultiplier,
        0,
        1,
      );
    }
  }

  private applySystemActionControlSignal(
    systemAction: SystemAction,
    activeEntities: Entity[],
    runtimeStates: Map<string, EntityRuntimeState>,
    mode: Mode,
    profile: SimulationProfile,
  ): void {
    if (mode === 'baseline' || systemAction === 'system_normal') {
      return;
    }

    const stressDelta =
      systemAction === 'stabilize_system'
        ? -0.1
        : systemAction === 'rebalance_attention'
          ? -0.05
          : 0;
    const profileMultiplier =
      profile.key === 'stress' ? 1.2 : profile.key === 'realistic' ? 1.1 : 1;

    for (const entity of activeEntities) {
      const runtimeState = runtimeStates.get(entity.id);

      if (!runtimeState) {
        throw new Error(`Runtime state for entity "${entity.id}" not found`);
      }

      runtimeState.stressMemory = clamp(
        runtimeState.stressMemory + stressDelta * profileMultiplier,
        0,
        1,
      );
    }
  }

  private scheduleDelayedDelta(
    queue: [number, number],
    delta: number,
    delayedShare: number,
    decayFactor: number,
  ): void {
    if (delta === 0 || delayedShare <= 0) {
      return;
    }

    queue[0] += delta * delayedShare;
    queue[1] += delta * delayedShare * decayFactor;
  }

  private buildTransitionForEntity(
    entity: Entity,
    scenario: Scenario,
    profile: SimulationProfile,
    runtimeState: EntityRuntimeState,
    randomEngine: RandomEngine,
  ): Transition {
    const transition = scenario.transitionMatrix[entity.currentState];

    if (!transition) {
      throw new Error(
        `Transition row for state "${entity.currentState}" was not found`,
      );
    }

    const segmentDynamics = profile.segmentDynamics[entity.segment];
    const pressure = clamp(
      entity.temperature * 0.35 +
        entity.influence * profile.transitionImpact.transitionCoupling +
        runtimeState.stressMemory * 0.35 +
        segmentDynamics.escalationBias +
        this.getSignedNoise(randomEngine, profile.noise.transition),
      -0.35,
      0.85,
    );

    const adjustedTransition = Object.fromEntries(
      Object.entries(transition).map(([nextState, probability]) => {
        let multiplier = 1;

        if (
          nextState === 'reactive' ||
          nextState === 'critical' ||
          nextState === 'failed'
        ) {
          multiplier = clamp(
            segmentDynamics.transitionBias + Math.max(pressure, 0),
            0.15,
            3,
          );
        } else if (
          nextState === 'calm' ||
          nextState === 'interested' ||
          nextState === 'stabilized'
        ) {
          multiplier = clamp(
            2 - segmentDynamics.transitionBias - Math.max(pressure, 0) * 0.55,
            0.15,
            3,
          );
        }

        return [nextState, probability * multiplier];
      }),
    ) as Transition;

    return this.transitionEngine.normalizeTransition(adjustedTransition);
  }

  private computeEntityInfluence(
    entity: Entity,
    activeEvent: EventSnapshot | null,
    profile: SimulationProfile,
    runtimeState: EntityRuntimeState,
    randomEngine: RandomEngine,
  ): number {
    const delayedInfluenceDelta = runtimeState.pendingInfluenceDeltas[0];

    runtimeState.pendingInfluenceDeltas = [
      runtimeState.pendingInfluenceDeltas[1],
      0,
    ];

    const influence = this.positionEngine.computeInfluence(
      entity,
      activeEvent,
      this.getSignedNoise(randomEngine, profile.noise.influence),
    );

    if (profile.key === 'demo') {
      return clamp(influence + delayedInfluenceDelta, 0, 1);
    }

    return clamp(
      influence +
        delayedInfluenceDelta +
        runtimeState.stressMemory * 0.04 +
        Math.max(profile.segmentDynamics[entity.segment].escalationBias, 0) *
          0.05,
      0,
      1,
    );
  }

  private computeEntityTemperature(
    entity: Entity,
    influence: number,
    profile: SimulationProfile,
    runtimeState: EntityRuntimeState,
    randomEngine: RandomEngine,
  ): number {
    const baseTemperature = this.positionEngine.updateTemperature(
      entity.temperature,
      influence,
    );
    const temperatureNoise = this.getSignedNoise(
      randomEngine,
      profile.noise.temperature,
    );

    if (profile.key === 'demo') {
      return clamp(baseTemperature + temperatureNoise, 0, 1);
    }

    const segmentDynamics = profile.segmentDynamics[entity.segment];
    const recovery =
      profile.inertia.temperatureRecovery *
      segmentDynamics.recoveryFactor *
      (1 - influence);
    const stressBoost =
      runtimeState.stressMemory * 0.08 +
      Math.max(segmentDynamics.escalationBias, 0) * influence * 0.12;

    return clamp(
      baseTemperature - recovery + stressBoost + temperatureNoise,
      0,
      1,
    );
  }

  private updateRuntimeState(
    entity: Entity,
    runtimeState: EntityRuntimeState,
    profile: SimulationProfile,
  ): void {
    if (profile.key === 'demo') {
      runtimeState.stressMemory = 0;
      return;
    }

    runtimeState.stressMemory = clamp(
      runtimeState.stressMemory * profile.inertia.stressMemoryDecay +
        entity.influence * 0.35 +
        entity.riskScore * 0.15 -
        profile.inertia.influenceRecovery * 0.1,
      0,
      1,
    );
  }

  private buildStepEventSnapshot(
    event: Event | null,
    step: number,
    profile: SimulationProfile,
  ): EventSnapshot | null {
    if (!event) {
      return null;
    }

    const baseSnapshot = {
      ...event,
      baseIntensity: event.intensity,
      baseScope: event.scope,
      baseRelevance: event.relevance,
    };

    if (!event.isActive || step < event.startStep) {
      return {
        ...baseSnapshot,
        intensity: 0,
        scope: 0,
        relevance: 0,
        isActive: false,
        phase: 'inactive',
      };
    }

    const mainEndStep = event.startStep + event.duration;
    const aftershockEndStep =
      mainEndStep + profile.eventLifecycle.aftershockSteps;

    if (step >= aftershockEndStep) {
      return {
        ...baseSnapshot,
        intensity: 0,
        scope: 0,
        relevance: 0,
        isActive: false,
        phase: 'inactive',
      };
    }

    if (!profile.eventLifecycle.enabled) {
      return {
        ...baseSnapshot,
        phase: step < mainEndStep ? 'peak' : 'inactive',
        intensity: step < mainEndStep ? event.intensity : 0,
        scope: step < mainEndStep ? event.scope : 0,
        relevance: step < mainEndStep ? event.relevance : 0,
        isActive: step < mainEndStep,
      };
    }

    if (step >= mainEndStep) {
      return {
        ...baseSnapshot,
        phase: 'aftershock',
        intensity: clamp(
          event.intensity *
            profile.eventLifecycle.aftershockIntensityMultiplier,
          0,
          1,
        ),
        scope: clamp(
          event.scope * profile.eventLifecycle.aftershockScopeMultiplier,
          0,
          1,
        ),
        relevance: clamp(
          event.relevance *
            profile.eventLifecycle.aftershockRelevanceMultiplier,
          0,
          1,
        ),
        isActive: true,
      };
    }

    if (event.duration <= 1) {
      return {
        ...baseSnapshot,
        phase: 'peak',
        isActive: true,
      };
    }

    const progress = clamp(
      (step - event.startStep) / Math.max(event.duration - 1, 1),
      0,
      1,
    );
    const rampBoundary = clamp(profile.eventLifecycle.rampUpShare, 0.01, 0.95);
    const peakBoundary = clamp(
      profile.eventLifecycle.rampUpShare + profile.eventLifecycle.peakShare,
      rampBoundary,
      0.99,
    );

    if (progress < rampBoundary) {
      const intensityMultiplier = clamp(
        0.25 + (progress / rampBoundary) * 0.75,
        0,
        1,
      );

      return {
        ...baseSnapshot,
        phase: 'ramp_up',
        intensity: clamp(event.intensity * intensityMultiplier, 0, 1),
        scope: clamp(event.scope * (0.45 + intensityMultiplier * 0.55), 0, 1),
        relevance: clamp(
          event.relevance * (0.55 + intensityMultiplier * 0.45),
          0,
          1,
        ),
        isActive: true,
      };
    }

    if (progress < peakBoundary) {
      return {
        ...baseSnapshot,
        phase: 'peak',
        isActive: true,
      };
    }

    const decayProgress = clamp(
      (progress - peakBoundary) / Math.max(1 - peakBoundary, 0.01),
      0,
      1,
    );
    const intensityMultiplier = clamp(1 - decayProgress * 0.8, 0.2, 1);

    return {
      ...baseSnapshot,
      phase: 'decay',
      intensity: clamp(event.intensity * intensityMultiplier, 0, 1),
      scope: clamp(event.scope * (0.4 + intensityMultiplier * 0.6), 0, 1),
      relevance: clamp(
        event.relevance * (0.5 + intensityMultiplier * 0.5),
        0,
        1,
      ),
      isActive: true,
    };
  }

  private buildRunEventSnapshot(event: Event | null): EventSnapshot | null {
    if (!event) {
      return null;
    }

    return {
      ...event,
      phase: event.isActive ? 'peak' : 'inactive',
      baseIntensity: event.intensity,
      baseScope: event.scope,
      baseRelevance: event.relevance,
    };
  }

  private buildConfigSnapshot(
    scenario: Scenario,
    profile: SimulationProfile,
  ): SimulationConfigSnapshot {
    return {
      profile: profile.key,
      clusterRadius: scenario.clusterRadius,
      hotTemperatureThreshold: scenario.hotTemperatureThreshold,
      systemHotThreshold: profile.hotThresholds.system,
      visualHotThreshold: profile.hotThresholds.visual,
      maxFailureDepth: scenario.maxFailureDepth,
      storeTimeline: true,
    };
  }

  private getPrimaryEvent(events: Event[]): Event | null {
    return events.find((event) => event.isActive) ?? events[0] ?? null;
  }

  private isTerminalState(
    state: string,
    scenario: Scenario,
    profile: SimulationProfile,
  ): boolean {
    if (scenario.failureStates.includes(state)) {
      return true;
    }

    if (profile.stabilizedTerminal && scenario.successStates.includes(state)) {
      return true;
    }

    return (
      scenario.terminalStates.includes(state) &&
      !scenario.successStates.includes(state)
    );
  }

  private getSignedNoise(
    randomEngine: RandomEngine,
    amplitude: number,
  ): number {
    if (amplitude <= 0) {
      return 0;
    }

    return (randomEngine.next() * 2 - 1) * amplitude;
  }

  private computeFailureProbability(
    entity: Entity,
    scenario: Scenario,
    profile: SimulationProfile,
    runtimeState: EntityRuntimeState,
  ): number {
    const baseFailureProbability = this.scoringEngine.computeFailureProbability(
      entity.currentState,
      scenario,
    );

    return clamp(
      baseFailureProbability +
        entity.influence * profile.transitionImpact.failureCoupling +
        entity.temperature * profile.transitionImpact.failureCoupling * 0.5 +
        runtimeState.stressMemory * 0.08,
      0,
      1,
    );
  }

  private adjustLocalThreshold(
    localThreshold: number,
    entity: Entity,
    profile: SimulationProfile,
  ): number {
    if (
      entity.currentState === 'calm' ||
      entity.currentState === 'interested'
    ) {
      return clamp(
        localThreshold - profile.transitionImpact.notifyThresholdOffset,
        0.35,
        0.95,
      );
    }

    return localThreshold;
  }

  private adjustGlobalThreshold(
    globalThreshold: number,
    profile: SimulationProfile,
  ): number {
    return clamp(
      globalThreshold + profile.systemLayer.globalThresholdShift,
      0.15,
      0.95,
    );
  }

  private resolveEntityAction(
    entity: Entity,
    runtimeState: EntityRuntimeState,
    mode: Mode,
    profile: SimulationProfile,
  ): LocalAction {
    const decidedAction = this.actionEngine.decideEntityAction(entity);

    if (
      decidedAction === 'watch' &&
      (entity.currentState === 'calm' ||
        entity.currentState === 'interested') &&
      entity.riskScore >
        entity.localThreshold -
          Math.max(profile.transitionImpact.notifyThresholdOffset, 0.05)
    ) {
      return 'notify';
    }

    if (
      mode !== 'baseline' &&
      runtimeState.cooldownRemaining > 0 &&
      decidedAction !== 'no_action'
    ) {
      return 'watch';
    }

    return decidedAction;
  }

  private clearRuntimeState(
    entityId: string,
    runtimeStates: Map<string, EntityRuntimeState>,
  ): void {
    const runtimeState = runtimeStates.get(entityId);

    if (!runtimeState) {
      return;
    }

    runtimeState.pendingTemperatureDeltas = [0, 0];
    runtimeState.pendingInfluenceDeltas = [0, 0];
    runtimeState.cooldownRemaining = 0;
    runtimeState.stressMemory = 0;
  }

  private assertRunInvariants(
    entities: Entity[],
    scenario: Scenario,
    profile: SimulationProfile,
    finishedEntities: number,
    stabilizedCount: number,
    failedCount: number,
  ): void {
    const derivedFinished = entities.filter((entity) =>
      this.isTerminalState(entity.currentState, scenario, profile),
    ).length;

    if (finishedEntities !== derivedFinished) {
      throw new Error('Finished entity count does not match terminal states');
    }

    if (
      profile.stabilizedTerminal &&
      stabilizedCount + failedCount !== finishedEntities
    ) {
      throw new Error('Finished entity summary is inconsistent');
    }

    for (const entity of entities) {
      if (
        this.isTerminalState(entity.currentState, scenario, profile) &&
        !entity.isFinished
      ) {
        throw new Error(
          `Terminal entity "${entity.id}" is not marked finished`,
        );
      }
    }
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
