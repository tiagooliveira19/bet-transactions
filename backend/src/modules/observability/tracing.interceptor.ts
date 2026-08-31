import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { context as otelContext, Span, SpanStatusCode, trace } from "@opentelemetry/api";
import { Observable } from "rxjs";

const TRACER_NAME = "bet-transactions";

const ID_PARAMS = ["walletId", "transactionId", "providerId", "externalTransactionId"] as const;

type InstrumentedRequest = {
  method?: string;
  url?: string;
  route?: { path?: string };
  headers?: Record<string, string | string[] | undefined>;
  params?: Record<string, string>;
};

@Injectable()
export class TracingInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (process.env.OTEL_ENABLED !== "true" || ctx.getType() !== "http") {
      return next.handle();
    }

    const request = ctx.switchToHttp().getRequest<InstrumentedRequest>();
    const path = (request.url ?? "/").split("?")[0];
    if (path.startsWith("/health") || path === "/metrics" || path.startsWith("/docs")) {
      return next.handle();
    }

    const method = request.method ?? "HTTP";
    const route = request.route?.path ?? path;
    const spanName = `${method} ${route}`;
    const existing = trace.getActiveSpan();

    if (existing) {
      decorateSpan(existing, spanName, request, route);
      const bound = trace.setSpan(otelContext.active(), existing);
      return new Observable((subscriber) => {
        const subscription = otelContext.with(bound, () => next.handle().subscribe(subscriber));
        return () => subscription.unsubscribe();
      });
    }

    const span = trace.getTracer(TRACER_NAME).startSpan(spanName);
    decorateSpan(span, spanName, request, route);
    const bound = trace.setSpan(otelContext.active(), span);
    return new Observable((subscriber) => {
      const subscription = otelContext.with(bound, () =>
        next.handle().subscribe({
          next: (value) => subscriber.next(value),
          error: (err: unknown) => {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: err instanceof Error ? err.message : String(err),
            });
            span.end();
            subscriber.error(err);
          },
          complete: () => {
            const response = ctx.switchToHttp().getResponse<{ statusCode?: number }>();
            if (response.statusCode) {
              span.setAttribute("http.status_code", response.statusCode);
            }
            span.end();
            subscriber.complete();
          },
        }),
      );
      return () => subscription.unsubscribe();
    });
  }
}

function decorateSpan(
  span: Span,
  spanName: string,
  request: InstrumentedRequest,
  route: string,
): void {
  span.updateName(spanName);
  span.setAttribute("http.route", route);
  const correlationId = headerValue(request.headers, "x-correlation-id");
  if (correlationId) {
    span.setAttribute("correlationId", correlationId);
  }
  const params = request.params ?? {};
  for (const key of ID_PARAMS) {
    if (params[key]) {
      span.setAttribute(key, params[key]);
    }
  }
}

function headerValue(
  headers: Record<string, string | string[] | undefined> | undefined,
  name: string,
): string | undefined {
  const value = headers?.[name] ?? headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}
