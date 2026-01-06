
import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

export interface Interview {
    id: string;
    title: string;
    hostId: string;
    candidateName: string;
    candidateEmail?: string;
    status: 'SCHEDULED' | 'LIVE' | 'COMPLETED';
    startTime?: Date;
    endTime?: Date;
    events: any[];
    meetLink?: string;
}

@Injectable()
export class InterviewService {
    private interviews: Map<string, Interview> = new Map();

    createInterview(title: string, candidateName: string, hostId: string, meetLink?: string) {
        const id = uuidv4();
        const interview: Interview = {
            id,
            title,
            candidateName,
            hostId,
            status: 'SCHEDULED',
            events: [],
            meetLink,
        };
        this.interviews.set(id, interview);
        return interview;
    }

    getInterview(id: string) {
        return this.interviews.get(id);
    }

    getAllInterviews() {
        return Array.from(this.interviews.values());
    }

    joinSession(id: string, candidateName: string, candidateEmail?: string) {
        const interview = this.interviews.get(id);
        if (interview) {
            interview.candidateName = candidateName;
            interview.candidateEmail = candidateEmail;
            interview.status = 'LIVE';
            interview.startTime = new Date();
        }
        return interview;
    }

    startSession(id: string) {
        const interview = this.interviews.get(id);
        if (interview) {
            interview.status = 'LIVE';
            interview.startTime = new Date();
        }
        return interview;
    }

    endSession(id: string) {
        const interview = this.interviews.get(id);
        if (interview) {
            interview.status = 'COMPLETED';
            interview.endTime = new Date();
        }
        return interview;
    }

    logEvent(id: string, event: any) {
        const interview = this.interviews.get(id);
        if (interview) {
            const newEvent = {
                timestamp: new Date().toISOString(),
                ...event
            };
            interview.events.push(newEvent);
            return newEvent;
        }
        return null;
    }

    getViolations(id: string) {
        const interview = this.interviews.get(id);
        return interview?.events || [];
    }

    deleteInterview(id: string) {
        return this.interviews.delete(id);
    }
}
