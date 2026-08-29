import { EntityManager } from "@mikro-orm/core";
import { Injectable } from "@nestjs/common";
import { PersistenceContext } from "./persistence.context";

@Injectable()
export class UnitOfWork {
  constructor(private readonly em: EntityManager) {}

  run<T>(work: (ctx: PersistenceContext) => Promise<T>): Promise<T> {
    return this.em.transactional(async (tem) => work(new PersistenceContext(tem)));
  }
}
