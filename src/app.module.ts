import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { WinstonModule, utilities as nestWinstonUtilities } from 'nest-winston';
import * as winston from 'winston';
import { CepModule } from './cep/cep.module';
import { getCurrentRequestId } from './common/request-context';
import { RequestContextMiddleware } from './common/request-context.middleware';
import { GlobalExceptionFilter } from './filters/global-exception.filter';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Format custom do Winston: injeta automaticamente o `requestId` do
 * AsyncLocalStorage em cada log emitido durante o ciclo de uma request.
 */
const requestIdFormat = winston.format((info) => {
  const requestId = getCurrentRequestId();
  if (requestId) info.requestId = requestId;
  return info;
})();

const winstonOptions: winston.LoggerOptions = {
  level: process.env.LOG_LEVEL ?? 'info',
  format: isProduction
    ? winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        requestIdFormat,
        winston.format.json(),
      )
    : winston.format.combine(
        winston.format.timestamp({ format: 'HH:mm:ss' }),
        winston.format.ms(),
        requestIdFormat,
        nestWinstonUtilities.format.nestLike('CepApi', {
          colors: true,
          prettyPrint: true,
        }),
      ),
  transports: [new winston.transports.Console()],
};

@Module({
  imports: [WinstonModule.forRoot(winstonOptions), CepModule],
  providers: [{ provide: APP_FILTER, useClass: GlobalExceptionFilter }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
