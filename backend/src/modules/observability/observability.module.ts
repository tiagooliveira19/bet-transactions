import { Global, Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { MetricsController } from "./metrics.controller";
import { MetricsService } from "./metrics.service";
import { TracingInterceptor } from "./tracing.interceptor";

@Global()
@Module({
  controllers: [MetricsController],
  providers: [
    MetricsService,
    TracingInterceptor,
    { provide: APP_INTERCEPTOR, useClass: TracingInterceptor },
  ],
  exports: [MetricsService],
})
export class ObservabilityModule {}
