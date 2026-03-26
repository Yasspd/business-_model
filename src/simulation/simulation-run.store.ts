import { Injectable, NotFoundException } from '@nestjs/common';
import {
  SimulationResponse,
  SimulationRunListItem,
} from './types/simulation-response.type';

@Injectable()
export class SimulationRunStore {
  private readonly runs = new Map<string, SimulationResponse>();
  private readonly orderedRunIds: string[] = [];
  private latestCompletedRunId: string | null = null;

  save(run: SimulationResponse): SimulationResponse {
    const snapshot = structuredClone(run);
    this.runs.set(snapshot.runId, snapshot);
    this.orderedRunIds.unshift(snapshot.runId);

    if (snapshot.status === 'completed') {
      this.latestCompletedRunId = snapshot.runId;
    }

    return structuredClone(snapshot);
  }

  getLatest(): SimulationResponse {
    if (!this.latestCompletedRunId) {
      throw new NotFoundException('Последняя завершённая симуляция не найдена');
    }

    return this.getById(this.latestCompletedRunId);
  }

  getById(runId: string): SimulationResponse {
    const run = this.runs.get(runId);

    if (!run) {
      throw new NotFoundException(`Run "${runId}" не найден`);
    }

    return structuredClone(run);
  }

  list(limit = 10): SimulationRunListItem[] {
    return this.orderedRunIds.slice(0, limit).map((runId) => {
      const run = this.runs.get(runId);

      if (!run) {
        throw new NotFoundException(`Run "${runId}" не найден`);
      }

      return {
        runId: run.runId,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        status: run.status,
        scenarioKey: run.scenarioKey,
        mode: run.mode,
        profile: run.profile,
        seed: run.seed,
        entitiesCount: run.entitiesCount,
        requestedSteps: run.requestedSteps,
        summary: structuredClone(run.summary),
        lastStep: structuredClone(run.lastStep),
      };
    });
  }
}
