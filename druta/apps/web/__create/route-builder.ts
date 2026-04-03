import { Hono } from 'hono';
import type { Handler } from 'hono/types';
import updatedFetch from '../src/__create/fetch';

const API_BASENAME = '/api';
const api = new Hono();
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const;

if (globalThis.fetch) {
  globalThis.fetch = updatedFetch;
}

type RouteContext = {
  params: Record<string, string>;
};

type RouteMethod = (request: Request, context: RouteContext) => Response | Promise<Response>;

type RouteModule = Partial<Record<(typeof HTTP_METHODS)[number], RouteMethod>>;

const transformSegmentToHonoPattern = (segment: string) => {
  const match = segment.match(/^\[(\.{3})?([^\]]+)\]$/);
  if (match) {
    const [, dots, param] = match;
    return dots === '...'
      ? { name: param, pattern: `:${param}{.+}` }
      : { name: param, pattern: `:${param}` };
  }
  return { name: segment, pattern: segment };
};

const getHonoPath = (routeFile: string) => {
  const relativePath = routeFile
    .replace(/^\.\.\/src\/app\/api\//, '')
    .replace(/\/route\.js$/, '');

  if (!relativePath || relativePath === 'route.js') {
    return '/';
  }

  const parts = relativePath
    .split('/')
    .filter(Boolean)
    .map(transformSegmentToHonoPattern);

  return `/${parts.map(({ pattern }) => pattern).join('/')}`;
};

const getRouteModules = () => {
  return import.meta.glob('../src/app/api/**/route.js', {
    eager: true,
  }) as Record<string, RouteModule>;
};

const registerMethod = (method: (typeof HTTP_METHODS)[number], path: string, handler: Handler) => {
  switch (method) {
    case 'GET':
      api.get(path, handler);
      break;
    case 'POST':
      api.post(path, handler);
      break;
    case 'PUT':
      api.put(path, handler);
      break;
    case 'DELETE':
      api.delete(path, handler);
      break;
    case 'PATCH':
      api.patch(path, handler);
      break;
    default:
      break;
  }
};

const registerRoutes = (routeModules: Record<string, RouteModule>) => {
  api.routes = [];

  const routeEntries = Object.entries(routeModules).sort(([a], [b]) => b.length - a.length);

  for (const [routeFile, route] of routeEntries) {
    const honoPath = getHonoPath(routeFile);

    for (const method of HTTP_METHODS) {
      const methodHandler = route?.[method];
      if (typeof methodHandler !== 'function') continue;

      const handler: Handler = async (c) => {
        const params = c.req.param();
        return await methodHandler(c.req.raw, { params });
      };

      registerMethod(method, honoPath, handler);
    }
  }
};

registerRoutes(getRouteModules());

if (import.meta.hot) {
  import.meta.hot.accept((newSelf) => {
    try {
      const freshModules =
        typeof newSelf?.getRouteModules === 'function' ? newSelf.getRouteModules() : getRouteModules();
      registerRoutes(freshModules);
    } catch (error) {
      console.error('Error reloading API routes:', error);
    }
  });
}

export { api, API_BASENAME, getRouteModules };
