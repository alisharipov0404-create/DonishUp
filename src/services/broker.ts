import { EventEmitter } from 'events';

/**
 * Message Broker Simulator (RabbitMQ / Kafka)
 * В реальном микросервисном приложении здесь будет подключение к RabbitMQ (amqplib) или Kafka (kafkajs).
 * Сейчас мы используем EventEmitter для имитации работы брокера сообщений внутри одного процесса.
 */
class MessageBroker {
    private bus = new EventEmitter();

    /**
     * Отправить сообщение в очередь (Publish)
     */
    publish(topic: string, message: any) {
        console.log(`[BROKER] 📤 Публикация в топик '${topic}':`, message);
        this.bus.emit(topic, message);
    }

    /**
     * Подписаться на очередь (Subscribe)
     */
    subscribe(topic: string, handler: (message: any) => void) {
        console.log(`[BROKER] 📥 Подписка на топик '${topic}'`);
        this.bus.on(topic, handler);
    }
}

export const broker = new MessageBroker();
