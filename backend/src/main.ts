import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { startOpenTelemetry } from "./modules/observability/otel";
import { DomainExceptionFilter } from "./shared/http/http-exception.filter";

await startOpenTelemetry();

const app = await NestFactory.create(AppModule, { bufferLogs: true });
app.useLogger(app.get(Logger));
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  }),
);
app.useGlobalFilters(new DomainExceptionFilter());

const swagger = new DocumentBuilder()
  .setTitle("Bet Transactions")
  .setDescription("Distributed wagering financial service")
  .setVersion("1.0.0")
  .addBearerAuth()
  .addApiKey({ type: "apiKey", name: "Idempotency-Key", in: "header" }, "Idempotency-Key")
  .build();
SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, swagger));

app.enableShutdownHooks();

const port = Number(process.env.APP_PORT ?? 3000);
await app.listen(port);
