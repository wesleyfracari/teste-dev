import { NestFactory } from '@nestjs/core';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  // bufferLogs segura logs do bootstrap até o Winston estar instalado
  // como logger global, garantindo formato consistente desde a 1ª linha.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));
  app.enableShutdownHooks();

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);

  app.get(WINSTON_MODULE_NEST_PROVIDER).log(
    `CEP API ouvindo em http://localhost:${port}`,
  );
}

bootstrap();
