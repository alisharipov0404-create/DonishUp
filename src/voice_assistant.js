import { i18n } from './i18n.js';

export class VoiceAssistant {
    constructor() {
        this.recognition = null;
        this.isListening = false;
        this.activationWord = 'гик'; // Default activation word
        this.elevenLabsApiKey = undefined; // Should be in .env, but we don't use it in client directly for security
        this.voiceId = 'pNInz6obpgDQGcFmaJgB'; // Default voice ID (Adam)
        this.lang = 'ru-RU';
        this.setupRecognition();
    }

    setupRecognition() {
        if (!('webkitSpeechRecognition' in window)) {
            console.warn('Speech recognition not supported');
            return;
        }

        this.recognition = new webkitSpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = false;
        this.recognition.lang = this.lang;

        this.recognition.onresult = (event) => this.handleResult(event);
        this.recognition.onerror = (event) => {
            console.error('Voice Assistant Error:', event.error);
            if (event.error === 'network') {
                this.networkError = true;
                this.updateMicIcon(false); // Visually indicate issue
            } else if (event.error === 'aborted') {
                this.isListening = false;
                this.updateMicIcon(false);
            }
        };
        this.recognition.onend = () => {
            if (this.isListening) {
                if (this.networkError) {
                    console.log('Network error detected. Retrying in 5 seconds...');
                    setTimeout(() => {
                        this.networkError = false;
                        this.start();
                    }, 5000);
                } else {
                    this.start(); // Restart immediately if no error
                }
            }
        };
    }

    start() {
        if (this.recognition && !this.isListening) {
            try {
                this.recognition.start();
                this.isListening = true;
                this.networkError = false; // Reset error flag
                this.updateMicIcon(true);
                console.log('Voice Assistant Started');
            } catch (e) {
                if (e.message && e.message.includes('already started')) {
                    console.warn('Voice Assistant is already active.');
                    this.isListening = true;
                    this.updateMicIcon(true);
                } else {
                    console.error('Failed to start Voice Assistant', e);
                }
            }
        }
    }

    stop() {
        if (this.recognition && this.isListening) {
            this.recognition.stop();
            this.isListening = false;
            this.updateMicIcon(false);
            console.log('Voice Assistant Stopped');
        }
    }

    toggle() {
        if (this.isListening) this.stop();
        else this.start();
    }

    updateMicIcon(active) {
        const btn = document.getElementById('geek-mic');
        if (btn) {
            if (active) {
                btn.classList.add('voice-active', 'animate-pulse', 'bg-red-500', 'text-white');
                btn.style.background = '';
                btn.style.color = '';
            } else {
                btn.classList.remove('voice-active', 'animate-pulse', 'bg-red-500', 'text-white');
                btn.style.background = 'var(--surface-color)';
                btn.style.color = 'var(--text-secondary)';
            }
        }
    }

    async handleResult(event) {
        const lastResult = event.results[event.results.length - 1];
        if (!lastResult.isFinal) return;

        const transcript = lastResult[0].transcript.toLowerCase().trim();
        console.log('Heard:', transcript);

        if (transcript.includes(this.activationWord)) {
            const command = transcript.replace(this.activationWord, '').trim();
            await this.processCommand(command);
        }
    }

    async processCommand(command) {
        console.log('Processing command:', command);
        const dict = i18n[document.getElementById('settings-language')?.value || 'ru'];

        // Schedule
        if (command.includes('расписание') || command.includes('schedule') || command.includes('ҷадвал')) {
            await this.speak(dict.voice_cmd_schedule || "Opening schedule.");
            window.appRouter.navigate('schedule');
            return;
        }

        // Grades
        if (command.includes('оценки') || command.includes('grades') || command.includes('баҳо')) {
            await this.speak(dict.voice_cmd_grades || "Loading grades.");
            window.appRouter.navigate('grades');
            return;
        }

        // Dashboard
        if (command.includes('главная') || command.includes('dashboard') || command.includes('асосӣ')) {
            await this.speak(dict.voice_cmd_dashboard || "Going to dashboard.");
            window.appRouter.navigate('dashboard');
            return;
        }

        // Tutor
        if (command.includes('репетитор') || command.includes('tutor')) {
            await this.speak(dict.voice_cmd_tutor || "Opening AI Tutor.");
            window.appRouter.navigate('tutor');
            return;
        }

        // Unknown command
        // await this.speak(dict.voice_cmd_unknown || "I didn't understand that command.");
    }

    async speak(text) {
        if (this.elevenLabsApiKey) {
            try {
                const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "xi-api-key": this.elevenLabsApiKey
                    },
                    body: JSON.stringify({
                        text: text,
                        model_id: "eleven_multilingual_v2",
                        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
                    })
                });

                if (!response.ok) throw new Error('ElevenLabs API Error');

                const audioBlob = await response.blob();
                const audioUrl = URL.createObjectURL(audioBlob);
                const audio = new Audio(audioUrl);
                audio.play();
            } catch (e) {
                console.error('ElevenLabs TTS failed, falling back to browser TTS', e);
                this.browserSpeak(text);
            }
        } else {
            this.browserSpeak(text);
        }
    }

    browserSpeak(text) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = this.lang;
        window.speechSynthesis.speak(utterance);
    }

    updateSettings(settings) {
        if (settings.voiceId) this.voiceId = settings.voiceId;
        if (settings.lang) {
            this.lang = settings.lang;
            if (this.recognition) {
                this.recognition.lang = this.lang;
                if (this.isListening) {
                    this.recognition.stop();
                    // Will restart automatically due to onend
                }
            }
        }
    }
}
