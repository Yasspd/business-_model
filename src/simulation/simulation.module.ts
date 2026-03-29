import { Module } from '@nestjs/common';
import { ActionEngine } from '../engines/action.engine';
import { CausalEngine } from '../engines/causal.engine';
import { MetricsEngine } from '../engines/metrics.engine';
import { PositionEngine } from '../engines/position.engine';
import { RobustEngine } from '../engines/robust.engine';
import { ScoringEngine } from '../engines/scoring.engine';
import { ThresholdEngine } from '../engines/threshold.engine';
import { UncertaintyEngine } from '../engines/uncertainty.engine';
import { ScenarioModule } from '../scenario/scenario.module';
import { SimulationController } from './simulation.controller';
import { SimulationRunStore } from './simulation-run.store';
import { SimulationService } from './simulation.service';

@Module({
  imports: [ScenarioModule],
  controllers: [SimulationController],
  providers: [
    ActionEngine,
    CausalEngine,
    MetricsEngine,
    PositionEngine,
    RobustEngine,
    ScoringEngine,
    SimulationRunStore,
    ThresholdEngine,
    SimulationService,
    UncertaintyEngine,
  ],
})
export class SimulationModule {}
