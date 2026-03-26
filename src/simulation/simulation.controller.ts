import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ScenarioService } from '../scenario/scenario.service';
import { ListSimulationRunsDto } from './dto/list-simulation-runs.dto';
import { RunSimulationDto } from './dto/run-simulation.dto';
import type {
  SimulationResponse,
  SimulationRunListItem,
} from './types/simulation-response.type';
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

  @Get('latest')
  getLatestRun(): SimulationResponse {
    return this.simulationService.getLatestRun();
  }

  @Get('runs')
  listRuns(@Query() query: ListSimulationRunsDto): SimulationRunListItem[] {
    return this.simulationService.listRuns(query);
  }

  @Get('runs/:runId')
  getRunById(@Param('runId') runId: string): SimulationResponse {
    return this.simulationService.getRunById(runId);
  }

  @Post('run')
  runSimulation(@Body() dto: RunSimulationDto): SimulationResponse {
    return this.simulationService.runSimulation(dto);
  }
}
