/**
 * CLIProxy Local Reverse Proxy
 *
 * Proxies requests from the dashboard to the local CLIProxy service
 * running on 127.0.0.1 inside the same host/container.
 *
 * Mounted at: /api/cliproxy-local/*  ->  http://127.0.0.1:{port}/*
 */

import http from 'http';
import { Request, Response, Router } from 'express';
import { CLIPROXY_DEFAULT_PORT, validatePort } from '../../cliproxy/config/port-manager';
import { loadOrCreateUnifiedConfig } from '../../config/unified-config-loader';
import { requireLocalAccessWhenAuthDisabled } from '../middleware/auth-middleware';

export interface CliproxyLocalProxyDeps {
  enforceAccess?: (req: Request, res: Response) => boolean;
  request?: typeof http.request;
  resolveTargetPort?: () => number;
}

function resolveLocalCliproxyPort(): number {
  const config = loadOrCreateUnifiedConfig();
  return validatePort(config.cliproxy_server?.local?.port ?? CLIPROXY_DEFAULT_PORT);
}

function isJsonContentType(contentType: string | string[] | undefined): boolean {
  const values = Array.isArray(contentType) ? contentType : [contentType];
  return values.some((value) => value?.toLowerCase().includes('application/json') === true);
}

function buildProxyBody(req: Request): Buffer | undefined {
  if (!isJsonContentType(req.headers['content-type']) || req.body === undefined) {
    return undefined;
  }

  const contentLengthHeader = req.headers['content-length'];
  const contentLength = Array.isArray(contentLengthHeader)
    ? contentLengthHeader[0]
    : contentLengthHeader;
  const hasTransferEncoding = req.headers['transfer-encoding'] !== undefined;
  const parsedContentLength =
    typeof contentLength === 'string' ? Number.parseInt(contentLength, 10) : NaN;

  if (!hasTransferEncoding && (!Number.isFinite(parsedContentLength) || parsedContentLength <= 0)) {
    return undefined;
  }

  return Buffer.from(JSON.stringify(req.body));
}

function buildProxyHeaders(
  headers: http.IncomingHttpHeaders,
  port: number,
  bodyBuffer?: Buffer
): http.IncomingHttpHeaders {
  const proxyHeaders: http.IncomingHttpHeaders = {
    ...headers,
    host: `127.0.0.1:${port}`,
  };

  delete proxyHeaders.connection;

  if (bodyBuffer) {
    delete proxyHeaders['transfer-encoding'];
    proxyHeaders['content-length'] = String(bodyBuffer.length);
  }

  return proxyHeaders;
}

export function createCliproxyLocalProxyRouter(deps: CliproxyLocalProxyDeps = {}): Router {
  const router = Router();
  const enforceAccess =
    deps.enforceAccess ??
    ((req: Request, res: Response) =>
      requireLocalAccessWhenAuthDisabled(
        req,
        res,
        'CLIProxy local proxy requires localhost access when dashboard auth is disabled.'
      ));
  const createRequest = deps.request ?? http.request;
  const resolveTargetPort = deps.resolveTargetPort ?? resolveLocalCliproxyPort;

  router.use((req: Request, res: Response, next) => {
    if (enforceAccess(req, res)) {
      next();
    }
  });

  router.all('/*', (req: Request, res: Response) => {
    const targetPort = resolveTargetPort();
    const targetPath = req.url || '/';
    const bodyBuffer = buildProxyBody(req);

    const proxyReq = createRequest(
      {
        hostname: '127.0.0.1',
        port: targetPort,
        path: targetPath,
        method: req.method,
        headers: buildProxyHeaders(req.headers, targetPort, bodyBuffer),
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
      }
    );

    proxyReq.on('error', () => {
      if (!res.headersSent) {
        res.status(502).json({ error: 'CLIProxy is not reachable' });
      }
    });

    req.on('aborted', () => proxyReq.destroy());
    res.on('close', () => {
      if (!res.writableEnded) {
        proxyReq.destroy();
      }
    });

    if (bodyBuffer) {
      proxyReq.end(bodyBuffer);
      return;
    }

    req.pipe(proxyReq, { end: true });
  });

  return router;
}

export default createCliproxyLocalProxyRouter();
