import { EntityManager } from "@mikro-orm/core";
import { Injectable } from "@nestjs/common";
import { MetricsService } from "../observability/metrics.service";
import { isLockConflict, PersistenceContext } from "./persistence.context";

@Injectable()
export class UnitOfWork {
  constructor(
    private readonly em: EntityManager,
    private readonly metrics: MetricsService,
  ) {}

  async run<T>(work: (ctx: PersistenceContext) => Promise<T>): Promise<T> {
    try {
      return await this.em.transactional(async (tem) => work(new PersistenceContext(tem)));
    } catch (error) {
      if (isLockConflict(error)) {
        this.metrics.recordLockConflict();
      }
      throw error;
    }
  }
}
