
import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    MessageBody,
    ConnectedSocket,
    OnGatewayConnection,
    OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { InterviewService } from './modules/interview/interview.service';

@WebSocketGateway({
    cors: {
        origin: '*',
    },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    constructor(private readonly interviewService: InterviewService) { }

    handleConnection(client: Socket) {
        console.log(`Client connected: ${client.id}`);
        const { interviewId, role } = client.handshake.query;
        if (interviewId) {
            client.join(interviewId as string);
            console.log(`[${role}] joined room ${interviewId}`);

            // Notify others in the room
            client.to(interviewId as string).emit('user-joined', {
                role,
                socketId: client.id
            });
        }
    }

    handleDisconnect(client: Socket) {
        console.log(`Client disconnected: ${client.id}`);
        const { interviewId, role } = client.handshake.query;
        if (interviewId) {
            client.to(interviewId as string).emit('user-left', {
                role,
                socketId: client.id
            });
        }
    }

    @SubscribeMessage('join-room')
    handleJoinRoom(@MessageBody() data: { interviewId: string; role: string }, @ConnectedSocket() client: Socket) {
        client.join(data.interviewId);
        console.log(`[${data.role}] explicitly joined room ${data.interviewId}`);

        // Notify others
        client.to(data.interviewId).emit('user-joined', {
            role: data.role,
            socketId: client.id
        });
    }

    @SubscribeMessage('violation')
    handleViolation(@MessageBody() data: any, @ConnectedSocket() client: Socket) {
        const { interviewId, type, severity, timestamp, meta } = data;

        console.log(`⚠️ VIOLATION: ${type} in room ${interviewId}`);

        // Save to interview events
        this.interviewService.logEvent(interviewId, {
            type,
            severity,
            timestamp,
            meta
        });

        // Broadcast to host (everyone in room except sender)
        client.to(interviewId).emit('live-alert', {
            type,
            severity,
            timestamp,
            meta,
            message: `Candidate triggered: ${type.replace(/_/g, ' ')}`
        });

        // Also emit to all in room for confirmation
        this.server.to(interviewId).emit('violation-logged', { type, timestamp });
    }

    @SubscribeMessage('candidate-action')
    handleCandidateAction(@MessageBody() data: any, @ConnectedSocket() client: Socket) {
        // Generic candidate actions (fullscreen exit, etc.)
        const { interviewId, action } = data;
        console.log(`Candidate action: ${action} in room ${interviewId}`);

        client.to(interviewId).emit('candidate-update', { action, timestamp: new Date() });
    }

    // WebRTC Signaling (kept for future use)
    @SubscribeMessage('offer')
    handleOffer(@MessageBody() data: any, @ConnectedSocket() client: Socket) {
        client.to(data.roomId).emit('offer', data);
    }

    @SubscribeMessage('answer')
    handleAnswer(@MessageBody() data: any, @ConnectedSocket() client: Socket) {
        client.to(data.roomId).emit('answer', data);
    }

    @SubscribeMessage('ice-candidate')
    handleIceCandidate(@MessageBody() data: any, @ConnectedSocket() client: Socket) {
        client.to(data.roomId).emit('ice-candidate', data);
    }
}
