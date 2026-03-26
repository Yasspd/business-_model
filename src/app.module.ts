import { Module } from '@nestjs/common';
import { ScenarioModule } from './scenario/scenario.module';
import { SimulationModule } from './simulation/simulation.module';

@Module({
  imports: [ScenarioModule, SimulationModule],
})
export class AppModule {}
