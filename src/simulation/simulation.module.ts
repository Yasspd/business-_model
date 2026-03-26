import { Module } from '@nestjs/common';
import { ActionEngine } from '../engines/action.engine';
import { MetricsEngine } from '../engines/metrics.engine';
import { PositionEngine } from '../engines/position.engine';
import { ScoringEngine } from '../engines/scoring.engine';
import { ThresholdEngine } from '../engines/threshold.engine';
import { ScenarioModule } from '../scenario/scenario.module';
import { SimulationController } from './simulation.controller';
import { SimulationService } from './simulation.service';

@Module({
  imports: [ScenarioModule],
  controllers: [SimulationController],
  providers: [
    ActionEngine,
    MetricsEngine,
    PositionEngine,
    ScoringEngine,
    ThresholdEngine,
    SimulationService,
  ],
})
export class SimulationModule {}
