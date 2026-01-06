
import { Controller, Get, Post, Delete, Body, Param } from '@nestjs/common';
import { InterviewService } from './interview.service';

@Controller('interviews')
export class InterviewController {
    constructor(private readonly interviewService: InterviewService) { }

    @Post()
    create(@Body() body: { title: string; candidateName: string; hostId: string; meetLink?: string }) {
        return this.interviewService.createInterview(body.title, body.candidateName, body.hostId, body.meetLink);
    }

    @Get()
    findAll() {
        return this.interviewService.getAllInterviews();
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.interviewService.getInterview(id);
    }

    @Delete(':id')
    delete(@Param('id') id: string) {
        return { success: this.interviewService.deleteInterview(id) };
    }

    @Post(':id/start')
    start(@Param('id') id: string) {
        return this.interviewService.startSession(id);
    }

    @Post(':id/end')
    end(@Param('id') id: string) {
        return this.interviewService.endSession(id);
    }

    @Post(':id/join')
    join(@Param('id') id: string, @Body() body: { candidateName: string; candidateEmail?: string }) {
        return this.interviewService.joinSession(id, body.candidateName, body.candidateEmail);
    }

    @Post(':id/violation')
    logViolation(@Param('id') id: string, @Body() violation: any) {
        return this.interviewService.logEvent(id, violation);
    }
}
