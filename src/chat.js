import { i18n } from './i18n.js';
import { ImageUtils } from './image_utils.js';
import { socket } from './app.js';

export class ChatManager {
    constructor() {
        this.typingTimeout = null;
        this.currentRoom = null;
        this.setupListeners();
    }

    setupListeners() {
        window.sendInstantMessage = () => this.sendInstantMessage();
        window.sendChatImage = (e) => this.sendImage(e);
        const input = document.getElementById('instant-chat-input');
        if (input) {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.sendInstantMessage();
                } else {
                    this.setTypingStatus(true);
                }
            });
        }
        window.addEventListener('user-logout', () => {
            const history = document.getElementById('instant-chat-history');
            if (history) history.innerHTML = '';
            if (this.currentRoom) {
                socket.emit('leave-room', this.currentRoom);
                this.currentRoom = null;
            }
            this.setTypingStatus(false);
        });

        // Socket listeners
        socket.on('connect', () => {
            if (this.currentRoom) {
                socket.emit('join-room', this.currentRoom);
            }
        });

        socket.on('new-message', (msg) => {
            const user = JSON.parse(sessionStorage.getItem('donishup_session_v2'));
            const lang = document.getElementById('settings-language')?.value || 'ru';
            const dict = i18n[lang] || i18n['ru'];
            if (user && (msg.class_id === user.class_id || (!msg.class_id && !user.class_id))) {
                this.appendMessage(msg, user, dict);
            }
        });

        socket.on('user-typing', (data) => {
            const user = JSON.parse(sessionStorage.getItem('donishup_session_v2'));
            if (!user || data.userId === user.id) return;
            
            // Simple typing indicator logic
            if (data.isTyping) {
                this.updateTypingIndicator([data.userName]);
            } else {
                this.updateTypingIndicator([]);
            }
        });
    }

    setTypingStatus(isTyping) {
        const user = JSON.parse(sessionStorage.getItem('donishup_session_v2'));
        if (!user) return;
        
        socket.emit('typing', {
            userId: user.id,
            userName: user.name,
            isTyping: isTyping,
            class_id: user.class_id || null
        });

        if (isTyping) {
            if (this.typingTimeout) clearTimeout(this.typingTimeout);
            this.typingTimeout = setTimeout(() => {
                this.setTypingStatus(false);
            }, 3000);
        }
    }

    updateTypingIndicator(users) {
        const history = document.getElementById('instant-chat-history');
        if (!history) return;

        let indicator = document.getElementById('typing-indicator');
        if (users.length > 0) {
            if (!indicator) {
                indicator = document.createElement('div');
                indicator.id = 'typing-indicator';
                indicator.className = 'text-xs text-gray-500 italic mt-2 mb-2 ml-2 transition-opacity duration-300';
                history.appendChild(indicator);
            }
            const names = users.join(', ');
            indicator.textContent = `${names} ${users.length > 1 ? 'печатают' : 'печатает'}...`;
            indicator.style.opacity = '1';
            history.scrollTop = history.scrollHeight;
        } else if (indicator) {
            indicator.style.opacity = '0';
            setTimeout(() => {
                if (indicator && indicator.style.opacity === '0') {
                    indicator.remove();
                }
            }, 300);
        }
    }

    async loadChat() {
        const user = JSON.parse(sessionStorage.getItem('donishup_session_v2'));
        if (!user) return;

        const classId = user.class_id || 'general';
        if (this.currentRoom !== classId) {
            if (this.currentRoom) socket.emit('leave-room', this.currentRoom);
            socket.emit('join-room', classId);
            this.currentRoom = classId;
        }

        const history = document.getElementById('instant-chat-history');
        const lang = document.getElementById('settings-language')?.value || 'ru';
        const dict = i18n[lang] || i18n['ru'];
        
        history.innerHTML = '';

        try {
            const url = user.class_id ? `/api/chat/messages?class_id=${user.class_id}` : `/api/chat/messages`;
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.success && data.messages) {
                data.messages.forEach(msg => {
                    this.appendMessage(msg, user, dict);
                });
                history.scrollTop = history.scrollHeight;
            }
        } catch (e) {
            console.error("Failed to load chat messages", e);
        }
    }

    appendMessage(data, currentUser, dict) {
        const isMe = data.sender_id === currentUser.id;
        const name = isMe ? dict.you : (data.senderName || dict.unknown_user);
        const isTeacher = data.role === 'Teacher';

        const history = document.getElementById('instant-chat-history');
        if (!history) return;
        
        const msgDiv = document.createElement('div');
        
        const styleClass = isTeacher ? 'bg-gray-100 dark:bg-gray-800 rounded-lg p-3' : 'p-3';
        msgDiv.className = `flex flex-col mb-2 ${styleClass}`;
        msgDiv.style.animation = 'fadeIn 0.3s forwards';
        
        let contentHtml = `<div class="text-base">${data.text || ''}</div>`;
        if (data.image) {
            contentHtml += `<img src="${data.image}" class="mt-2 rounded-lg max-w-full h-auto max-h-64 object-contain" alt="Chat image">`;
        }
        
        msgDiv.innerHTML = `
            <div class="text-sm opacity-70 mb-1 font-semibold">${name}</div>
            ${contentHtml}
        `;
        
        history.appendChild(msgDiv);
        history.scrollTop = history.scrollHeight;
    }

    async sendInstantMessage() {
        const user = JSON.parse(sessionStorage.getItem('donishup_session_v2'));
        const input = document.getElementById('instant-chat-input');
        const text = input.value.trim();
        if (!text) return;
        
        const messageData = {
            sender_id: user.id,
            senderName: user.name,
            role: user.role,
            text: text,
            timestamp: Date.now(),
            class_id: user.class_id || null
        };
        
        input.value = '';
        this.setTypingStatus(false);
        
        socket.emit('send-message', messageData);
    }

    async sendImage(event) {
        const file = event.target.files[0];
        if (!file) return;

        const user = JSON.parse(sessionStorage.getItem('donishup_session_v2'));
        
        try {
            const compressedBlob = await ImageUtils.compress(file, {
                maxWidth: 1000,
                maxHeight: 1000,
                quality: 0.7
            });

            const reader = new FileReader();
            reader.onload = async (e) => {
                const base64Image = e.target.result;
                const messageData = {
                    sender_id: user.id,
                    senderName: user.name,
                    role: user.role,
                    text: '',
                    image: base64Image,
                    timestamp: Date.now(),
                    class_id: user.class_id || null
                };
                
                socket.emit('send-message', messageData);
            };
            reader.readAsDataURL(compressedBlob);
        } catch (e) {
            console.error("Failed to compress chat image", e);
        }
        
        event.target.value = ''; // Reset input
    }
}
