import 'server-only';
import { createApiClient } from '@nestora/api-client';
import { routeHandlerTokenStore } from './session';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:4000';

/** Route Handlers only — routeHandlerTokenStore needs cookies() in its mutable (settable) form. */
export const api = createApiClient({ baseUrl: API_BASE_URL, tokenStore: routeHandlerTokenStore });
