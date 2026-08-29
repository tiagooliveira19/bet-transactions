import { Global, Module } from "@nestjs/common";
import { UnitOfWork } from "./unit-of-work";

@Global()
@Module({
  providers: [UnitOfWork],
  exports: [UnitOfWork],
})
export class PersistenceModule {}
