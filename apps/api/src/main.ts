
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Enable CORS so the React app (on 3000) can talk to us
  app.enableCors();
  await app.listen(3001); // Run on 3001 to avoid conflict with Next.js
}
bootstrap();
