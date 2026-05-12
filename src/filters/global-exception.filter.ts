import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
  LoggerService,
} from '@nestjs/common';
import { Response } from 'express';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import {
  AllProvidersUnavailableException,
  CepInvalidException,
  CepNotFoundException,
} from '../cep/errors/cep.errors';

/**
 * Tradução centralizada de exceções para HTTP.
 *
 * 503 (≠ 500) quando todos os provedores falham: distingue "bug nosso"
 * (500) de "dependência externa fora" (503) — crítico para alertas.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: LoggerService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof CepInvalidException) {
      response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        message: exception.message,
      });
      return;
    }

    if (exception instanceof CepNotFoundException) {
      response.status(HttpStatus.NOT_FOUND).json({
        statusCode: HttpStatus.NOT_FOUND,
        error: 'Not Found',
        message: exception.message,
      });
      return;
    }

    if (exception instanceof AllProvidersUnavailableException) {
      this.logger.error({
        message: 'Service Unavailable — todos os provedores falharam',
        cep: exception.cep,
        providerErrors: exception.providerErrors,
      });

      response.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        error: 'Service Unavailable',
        message:
          'Todos os provedores de CEP estão indisponíveis no momento. Tente novamente em instantes.',
        ...(process.env.NODE_ENV !== 'production' && {
          detail: exception.providerErrors,
        }),
      });
      return;
    }

    // HttpException já tipada (ex.: 404 de rota): mantém comportamento padrão.
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      response.status(status).json(
        typeof res === 'string'
          ? { statusCode: status, message: res }
          : (res as object),
      );
      return;
    }

    const stack = exception instanceof Error ? exception.stack : undefined;
    const message =
      exception instanceof Error ? exception.message : String(exception);

    this.logger.error({ message: 'Erro inesperado', error: message, stack });

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'Ocorreu um erro inesperado',
    });
  }
}
