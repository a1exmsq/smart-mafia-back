import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('GameService');

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors({ origin: '*' });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Smart Mafia - Game Service')
    .setDescription('Room management, player sessions and game state API')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'JWT')
    .addTag('rooms')
    .addTag('players')
    .addTag('game')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  const port = process.env.PORT || 3002;
  await app.listen(port, '0.0.0.0');
  logger.log(`Game Service  -> http://localhost:${port}`);
  logger.log(`Swagger docs  -> http://localhost:${port}/api/docs`);
  logger.log(`Socket.io     -> ws://localhost:${port}/game`);
}

bootstrap();
