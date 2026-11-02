import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";
import {GET as catalog} from "../app/api/catalog/route";
import {GET as readerImage} from "../app/api/reader-image/route";
import {GET as contentImage} from "../app/api/content-image/route";

const worker = {
  fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    return runWithConnectorBinding(binding, () => {
      // Initialize read APIs with the Worker, rather than letting an abandoned
      // first browser request own the framework's lazy route-module promise.
      if (request.method === "GET") {
        const pathname = new URL(request.url).pathname;
        if (pathname === "/api/catalog") return catalog(request);
        if (pathname === "/api/reader-image") return readerImage(request);
        if (pathname === "/api/content-image") return contentImage(request);
      }
      return handler.fetch(request, env, ctx);
    });
  },
};

export default worker;
