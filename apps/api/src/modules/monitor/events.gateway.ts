
import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    OnGatewayConnection,
    OnGatewayDisconnect,
    MessageBody,
    ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { InterviewService } from '../interview/interview.service';

@WebSocketGateway({
    cors: {
        origin: '*',
    },
    namespace: 'events',
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    constructor(private interviewService: InterviewService) { }

    handleConnection(client: Socket) {
        const { interviewId, userId } = client.handshake.query;
        if (interviewId) {
            client.join(interviewId);
            console.log(`User ${userId} joined room ${interviewId}`);

            // Notify others that a peer joined
            client.to(interviewId as string).emit('peer-joined', { userId });
        }
    }

    handleDisconnect(client: Socket) {
        console.log(`Client disconnected: ${client.id}`);
    }

    // --- WebRTC Signaling ---

    @SubscribeMessage('offer')
    handleOffer(@MessageBody() data: any, @ConnectedSocket() client: Socket) {
        // Relay offer to specific peer or broadcast to room (excluding sender)
        client.to(data.roomId).emit('offer', { sdp: data.sdp, senderId: client.id });
    }

    @SubscribeMessage('answer')
    handleAnswer(@MessageBody() data: any, @ConnectedSocket() client: Socket) {
        client.to(data.roomId).emit('answer', { sdp: data.sdp, senderId: client.id });
    }

    @SubscribeMessage('ice-candidate')
    handleIce(@MessageBody() data: any, @ConnectedSocket() client: Socket) {
        client.to(data.roomId).emit('ice-candidate', { candidate: data.candidate, senderId: client.id });
    }

    // --- Proctoring & Chat ---

    @SubscribeMessage('violation')
    handleViolation(@MessageBody() data: any, @ConnectedSocket() client: Socket) {
        const { interviewId, violation } = data;
        this.interviewService.logEvent(interviewId, violation);
        // Alert the host
        client.to(interviewId).emit('live-alert', violation);
    }
}
