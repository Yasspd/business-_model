import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

function parseCorsOrigins(
  value: string | undefined,
): string[] | boolean | undefined {
  if (!value) {
    return undefined;
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return undefined;
  }

  if (normalizedValue === '*') {
    return true;
  }

  const origins = normalizedValue
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  return origins.length > 0 ? origins : undefined;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const corsOrigins = parseCorsOrigins(process.env.CORS_ORIGIN);

  if (corsOrigins) {
    const requestedCredentials = process.env.CORS_CREDENTIALS === 'true';

    app.enableCors({
      origin: corsOrigins,
      credentials: corsOrigins === true ? false : requestedCredentials,
    });
  }

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
