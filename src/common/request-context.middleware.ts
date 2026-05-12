import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { requestContextStorage } from './request-context';

/**
 * Abre um escopo de AsyncLocalStorage por request com um requestId único.
 * Respeita `x-request-id` enviado pelo cliente; senão gera um UUID novo.
 * Sempre devolve o id na resposta como `x-request-id`.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.headers['x-request-id'];
    const requestId =
      typeof incoming === 'string' && incoming.length > 0
        ? incoming
        : randomUUID();

    res.setHeader('x-request-id', requestId);
    requestContextStorage.run({ requestId }, () => next());
  }
}
