
import { Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway';
import { InterviewService } from './modules/interview/interview.service';
import { InterviewController } from './modules/interview/interview.controller';

@Module({
  imports: [],
  controllers: [InterviewController],
  providers: [EventsGateway, InterviewService], // Provide service & gateway
})
export class AppModule { }
