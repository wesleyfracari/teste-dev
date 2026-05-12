import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContext {
  requestId: string;
}

/**
 * Storage por-request via AsyncLocalStorage do Node.
 * Permite que qualquer código async no escopo de uma request acesse
 * o requestId sem precisar propagá-lo manualmente como parâmetro.
 */
export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function getCurrentRequestId(): string | undefined {
  return requestContextStorage.getStore()?.requestId;
}
