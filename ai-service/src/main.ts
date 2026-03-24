import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('AiService');

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors({ origin: '*' });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Smart Mafia — AI Service')
    .setDescription('OpenAI-powered narrator, role hints and voice companion API')
    .setVersion('1.0')
    .addTag('ai')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  const port = process.env.PORT || 3003;
  await app.listen(port);
  logger.log(`🤖 AI Service     → http://localhost:${port}`);
  logger.log(`📚 Swagger docs   → http://localhost:${port}/api/docs`);
}

bootstrap();
