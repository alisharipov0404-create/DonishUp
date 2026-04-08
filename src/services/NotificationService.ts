import { Server } from 'socket.io';
import { broker } from './broker.js';
import webpush from 'web-push';

/**
 * Сервер Уведомлений (Notification Microservice)
 * В реальной архитектуре это отдельное приложение (Node.js/Go/Python),
 * которое ничего не знает про базу данных оценок. Оно только слушает Kafka/RabbitMQ
 * и рассылает пуши/сокеты.
 */
export class NotificationService {
    private io: Server;
    private db: any;
    constructor(io: Server, db: any) {
        this.io = io;
        this.db = db;
        this.initSubscribers();
    }

    private async sendPush(userId: string, payload: any) {
        try {
            const subs = this.db.prepare('SELECT subscription FROM push_subscriptions WHERE user_id = ?').all(userId);
            for (const row of subs) {
                try {
                    const sub = JSON.parse(row.subscription);
                    await webpush.sendNotification(sub, JSON.stringify(payload));
                } catch (e) {
                    console.error('Push error (maybe unsubscribed):', e);
                    // В реальном проекте здесь нужно удалять невалидную подписку из БД
                }
            }
        } catch (e) {
            console.error('DB Error in sendPush:', e);
        }
    }

    private initSubscribers() {
        // Подписываемся на топик "Новая оценка" из брокера сообщений
        broker.subscribe('grade.created', (newGrade) => {
            console.log(`[Notification Service] 🔔 Обработка новой оценки для ученика ${newGrade.student_id}`);
            
            // Отправляем уведомление по WebSocket всем (клиенты сами отфильтруют)
            this.io.emit('grades-updated', newGrade);
            
            // Отправляем Web Push уведомление
            this.sendPush(newGrade.student_id, {
                title: 'Новая оценка!',
                body: `Вы получили ${newGrade.value} по предмету ${newGrade.subject}`,
                url: '/'
            });
        });

        // Подписываемся на топик "Новое домашнее задание"
        broker.subscribe('homework.created', (newHomework) => {
            console.log(`[Notification Service] 🔔 Обработка нового ДЗ для класса ${newHomework.class_id || 'индивидуально'}`);
            
            // Отправляем всем (клиенты сами отфильтруют)
            this.io.emit('homework-updated', newHomework);
            
            if (newHomework.class_id) {
                // Отправляем Web Push всем ученикам класса
                const students = this.db.prepare('SELECT id FROM users WHERE class_id = ?').all(newHomework.class_id);
                for (const student of students) {
                    this.sendPush(student.id, {
                        title: 'Новое домашнее задание',
                        body: `По предмету ${newHomework.subject}`,
                        url: '/'
                    });
                }
            } else if (newHomework.user_id) {
                this.sendPush(newHomework.user_id, {
                    title: 'Новое домашнее задание',
                    body: `По предмету ${newHomework.subject}`,
                    url: '/'
                });
            }
        });

        // Подписываемся на изменение статуса ДЗ
        broker.subscribe('homework.updated', (data) => {
            console.log(`[Notification Service] 🔔 Обновление статуса ДЗ ${data.id}`);
            this.io.emit('homework-updated', data);
        });

        // Подписываемся на удаление ДЗ
        broker.subscribe('homework.deleted', (data) => {
            console.log(`[Notification Service] 🔔 Удаление ДЗ ${data.id}`);
            this.io.emit('homework-updated', data);
        });

        // Подписываемся на обновление расписания
        broker.subscribe('schedule.updated', (data) => {
            console.log(`[Notification Service] 🔔 Обновление расписания для класса ${data.class_id}`);
            this.io.emit('schedule-updated', data);
        });
    }
}
