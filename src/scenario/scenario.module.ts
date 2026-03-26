import { Module } from '@nestjs/common';
import { TransitionEngine } from '../engines/transition.engine';
import { ScenarioService } from './scenario.service';

@Module({
  providers: [TransitionEngine, ScenarioService],
  exports: [TransitionEngine, ScenarioService],
})
export class ScenarioModule {}
