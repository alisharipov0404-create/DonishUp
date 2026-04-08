import { i18n } from './i18n.js';
import { VideoChatManager } from './video_chat.js';
import { auth } from './app.js';

export class LiveManager {
    constructor() {
        this.activeLesson = null;
        this.videoChat = new VideoChatManager(null); // userId will be set later
        this.setupListeners();
    }

    setupListeners() {
        window.startLiveLesson = () => this.startLiveLesson();
        window.joinLiveLesson = () => this.joinLiveLesson();
        window.leaveLiveLesson = () => this.leaveLesson();
        window.toggleVideoMic = () => this.toggleMic();
        window.toggleVideoCam = () => this.toggleCam();
    }

    async startLiveLesson() {
        const name = document.getElementById('lesson-name').value || 'Demo Lesson';
        const pass = document.getElementById('lesson-pass').value || '123';
        const lang = document.getElementById('settings-language').value || 'ru';
        const dict = i18n[lang];

        this.activeLesson = { name, pass, host: true, id: `lesson_${Date.now()}` };
        
        this.enterLessonUI(name);
        await this.initVideoChat(name);
    }

    async joinLiveLesson() {
        const name = document.getElementById('lesson-name').value || 'Demo Lesson';
        const pass = document.getElementById('lesson-pass').value || '123';
        const lang = document.getElementById('settings-language').value || 'ru';
        const dict = i18n[lang];

        this.activeLesson = { name, pass, host: false };
        
        this.enterLessonUI(name);
        await this.initVideoChat(name);
    }

    async initVideoChat(roomName) {
        const userId = auth.currentUser ? auth.currentUser.id : `guest_${Math.floor(Math.random() * 10000)}`;
        this.videoChat.currentUserId = userId; // Update userId
        
        const streamStarted = await this.videoChat.startLocalStream('local-video');
        if (streamStarted) {
            await this.videoChat.joinRoom(roomName);
        } else {
            this.leaveLesson();
        }
    }

    enterLessonUI(name) {
        const controls = document.querySelector('.live-controls');
        if (controls) controls.classList.add('hidden');
        document.getElementById('active-lesson-area').classList.remove('hidden');
        
        const titleEl = document.getElementById('active-lesson-title');
        if (titleEl) titleEl.textContent = name;
        
        // Hide welcome text
        const welcomeContainer = document.querySelector('.live-welcome-container');
        if (welcomeContainer) welcomeContainer.classList.add('hidden');
    }

    leaveLesson() {
        if (this.videoChat) {
            this.videoChat.leaveRoom();
        }
        this.activeLesson = null;
        
        document.getElementById('active-lesson-area').classList.add('hidden');
        
        const welcomeContainer = document.querySelector('.live-welcome-container');
        if (welcomeContainer) welcomeContainer.classList.remove('hidden');
        
        const controls = document.querySelector('.live-controls');
        if (controls) controls.classList.remove('hidden');
    }

    toggleMic() {
        if (this.videoChat) {
            const isEnabled = this.videoChat.toggleAudio();
            const btn = document.getElementById('vc-toggle-mic');
            if (btn) {
                if (isEnabled) {
                    btn.classList.remove('bg-red-600', 'hover:bg-red-700');
                    btn.classList.add('bg-gray-700', 'hover:bg-gray-600');
                    btn.innerHTML = '<i data-lucide="mic"></i>';
                } else {
                    btn.classList.remove('bg-gray-700', 'hover:bg-gray-600');
                    btn.classList.add('bg-red-600', 'hover:bg-red-700');
                    btn.innerHTML = '<i data-lucide="mic-off"></i>';
                }
                if (window.lucide) window.lucide.createIcons();
            }
        }
    }

    toggleCam() {
        if (this.videoChat) {
            const isEnabled = this.videoChat.toggleVideo();
            const btn = document.getElementById('vc-toggle-cam');
            if (btn) {
                if (isEnabled) {
                    btn.classList.remove('bg-red-600', 'hover:bg-red-700');
                    btn.classList.add('bg-gray-700', 'hover:bg-gray-600');
                    btn.innerHTML = '<i data-lucide="video"></i>';
                } else {
                    btn.classList.remove('bg-gray-700', 'hover:bg-gray-600');
                    btn.classList.add('bg-red-600', 'hover:bg-red-700');
                    btn.innerHTML = '<i data-lucide="video-off"></i>';
                }
                if (window.lucide) window.lucide.createIcons();
            }
        }
    }
}

