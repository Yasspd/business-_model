import { Body, Controller, Get, Post } from '@nestjs/common';
import { ScenarioService } from '../scenario/scenario.service';
import { RunSimulationDto } from './dto/run-simulation.dto';
import type { SimulationResponse } from './types/simulation-response.type';
import { SimulationService } from './simulation.service';

@Controller('simulation')
export class SimulationController {
  constructor(
    private readonly scenarioService: ScenarioService,
    private readonly simulationService: SimulationService,
  ) {}

  @Get('scenarios')
  getScenarios() {
    return this.scenarioService.listScenarios();
  }

  @Post('run')
  runSimulation(@Body() dto: RunSimulationDto): SimulationResponse {
    return this.simulationService.runSimulation(dto);
  }
}
