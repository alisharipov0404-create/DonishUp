import { Server } from 'socket.io';
import { broker } from './broker.js';

/**
 * Сервер Чата (Chat Microservice)
 * Отвечает за доставку сообщений.
 */
export class ChatService {
    private io: Server;
    constructor(io: Server) {
        this.io = io;
        this.initSubscribers();
    }

    private initSubscribers() {
        // Подписываемся на топик "Новое сообщение"
        broker.subscribe('chat.message.created', (data) => {
            console.log(`[Chat Service] 💬 Рассылка сообщения в комнату ${data.room}`);
            this.io.to(data.room).emit("new-message", data.message);
        });
    }
}
