type HttpRequestLike = {
  method?: string;
  url?: string;
  path?: string;
  host?: string;
  hostname?: string;
  headers?: Record<string, string | string[] | undefined>;
  httpVersion?: string;
};

export async function startOpenTelemetry(): Promise<void> {
  if (process.env.OTEL_ENABLED !== "true") {
    return;
  }

  const { NodeSDK } = await import("@opentelemetry/sdk-node");
  const { getNodeAutoInstrumentations } = await import("@opentelemetry/auto-instrumentations-node");
  const { OTLPTraceExporter } = await import("@opentelemetry/exporter-trace-otlp-http");
  const { Resource } = await import("@opentelemetry/resources");
  const { ATTR_SERVICE_NAME } = await import("@opentelemetry/semantic-conventions");

  const sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? "bet-transactions",
    }),
    traceExporter: new OTLPTraceExporter({
      url: `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318"}/v1/traces`,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-fs": { enabled: false },
        "@opentelemetry/instrumentation-dns": { enabled: false },
        "@opentelemetry/instrumentation-net": { enabled: false },
        "@opentelemetry/instrumentation-http": {
          ignoreIncomingRequestHook: (request) => isIgnoredIncoming(request as HttpRequestLike),
          ignoreOutgoingRequestHook: (request) => isInternalOutbound(request as HttpRequestLike),
          requestHook: (span, request) => {
            const req = request as HttpRequestLike;
            if (!isIncoming(req)) {
              return;
            }
            const method = req.method ?? "HTTP";
            const path = incomingPath(req);
            span.updateName(`${method} ${path}`);
            span.setAttribute("http.route", path);
            const correlationId = headerValue(req.headers, "x-correlation-id");
            if (correlationId) {
              span.setAttribute("correlationId", correlationId);
            }
            const walletId = path.match(/\/wallets\/([^/]+)/)?.[1];
            if (walletId) {
              span.setAttribute("walletId", walletId);
            }
          },
        },
      }),
    ],
  });

  await sdk.start();
}

function isIncoming(req: HttpRequestLike): boolean {
  return typeof req.httpVersion === "string";
}

function incomingPath(req: HttpRequestLike): string {
  const raw = req.url ?? "/";
  try {
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      return new URL(raw).pathname;
    }
  } catch {
    // fall through to query-strip
  }
  return raw.split("?")[0] || "/";
}

function isIgnoredIncoming(req: HttpRequestLike): boolean {
  const path = incomingPath(req);
  return path.startsWith("/health") || path === "/metrics" || path.startsWith("/docs");
}

function isInternalOutbound(req: HttpRequestLike): boolean {
  const host = `${req.host ?? ""} ${req.hostname ?? ""} ${headerValue(req.headers, "host") ?? ""}`;
  const path = req.path ?? req.url ?? "";
  if (
    host.includes("4566") ||
    host.includes("ministack") ||
    host.includes("4318") ||
    host.includes("jaeger")
  ) {
    return true;
  }
  if (path.includes("/v1/traces") || path.includes("/_ministack")) {
    return true;
  }
  const otlp = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318";
  const aws = process.env.AWS_ENDPOINT_URL ?? "http://localhost:4566";
  return hostIncludesEndpoint(host, otlp) || hostIncludesEndpoint(host, aws);
}

function hostIncludesEndpoint(host: string, endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return host.includes(url.hostname) && (url.port === "" || host.includes(url.port));
  } catch {
    return false;
  }
}

function headerValue(
  headers: Record<string, string | string[] | undefined> | undefined,
  name: string,
): string | undefined {
  const value = headers?.[name] ?? headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}
