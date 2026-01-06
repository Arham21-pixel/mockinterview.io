
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

@WebSocketGateway({
    cors: {
        origin: '*',
    },
    namespace: 'monitor',
})
export class MonitorGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    handleConnection(client: Socket) {
        // In production: Verify Token in handshake
        const interviewId = client.handshake.query.interviewId;
        if (interviewId) {
            client.join(`room:${interviewId}`);
            console.log(`Client ${client.id} joined room:${interviewId}`);
        }
    }

    handleDisconnect(client: Socket) {
        console.log(`Client ${client.id} disconnected`);
    }

    // Received from Candidate
    @SubscribeMessage('violation')
    handleViolation(
        @MessageBody() data: any,
        @ConnectedSocket() client: Socket,
    ) {
        // 1. Log violation to Database (Async)
        console.log('Violation received:', data);

        const interviewId = client.handshake.query.interviewId;

        // 2. Relay to Host (who is also in room:{id})
        // In a real app, we'd distinguish roles so candidate doesn't get their own violation echoed
        this.server.to(`room:${interviewId}`).emit('live_alert', data);
    }

    @SubscribeMessage('telemetry')
    handleTelemetry(@MessageBody() data: any) {
        // Heartbeat for network quality / focus status
    }
}
