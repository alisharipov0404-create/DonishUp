import { i18n } from './i18n.js';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { ImageUtils } from './image_utils.js';
import { socket } from './app.js';

export class TutorManager {
    constructor() {
        this.sessions = [];
        this.currentSessionId = null;
        this.chatSession = null;
        this.ai = null;
        this.currentMode = 'standard';
        this.setupListeners();
        this.loadSessions();
        this.initAI();
        this.setupSocketListeners();
    }

    setupSocketListeners() {
        socket.on('grades-updated', () => {
            const view = document.getElementById('view-tutor');
            if (view && !view.classList.contains('hidden')) {
                // Tutor view doesn't have a specific dashboard to reload, 
                // but we might want to notify the user or refresh context if needed.
                console.log('Grades updated, tutor might need to refresh context.');
            }
        });
        socket.on('homework-updated', () => {
            const view = document.getElementById('view-tutor');
            if (view && !view.classList.contains('hidden')) {
                console.log('Homework updated, tutor might need to refresh context.');
            }
        });
        socket.on('schedule-updated', () => {
            const view = document.getElementById('view-tutor');
            if (view && !view.classList.contains('hidden')) {
                console.log('Schedule updated, tutor might need to refresh context.');
            }
        });
    }

    initAI() {
        const apiKey = window.__GEMINI_API_KEY__;
        if (apiKey) {
            this.ai = new GoogleGenAI({ apiKey });
            // Create a default session for other managers to use
            this.session = this.ai.chats.create({
                model: "gemini-3-flash-preview",
                config: {
                    systemInstruction: "You are a helpful educational assistant. Help the user with their studies, notebooks, and homework."
                }
            });
        } else {
            console.error("GEMINI_API_KEY not found in environment");
        }
    }

    setupListeners() {
        window.sendTutorMessage = () => this.sendTutorMessage();
        window.toggleVoiceMode = () => this.toggleVoiceMode();
        window.tutorManager = this; // Expose for UI buttons

        const input = document.getElementById('tutor-input');
        if (input) {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.sendTutorMessage();
            });
        }

        window.addEventListener('user-logout', () => {
            this.sessions = [];
            this.currentSessionId = null;
            this.chatSession = null;
            const historyDiv = document.getElementById('tutor-chat-history');
            if (historyDiv) historyDiv.innerHTML = '';
            this.renderHistoryList();
        });
    }

    loadSessions() {
        const user = JSON.parse(sessionStorage.getItem('donishup_session_v2'));
        if (!user) {
            this.sessions = [];
            this.renderHistoryList();
            return;
        }

        try {
            const saved = localStorage.getItem(`tutor_sessions_${user.id}`);
            if (saved) {
                this.sessions = JSON.parse(saved);
            } else {
                this.sessions = [];
            }
        } catch (e) {
            console.error("Failed to load sessions", e);
            this.sessions = [];
        }
        this.renderHistoryList();
    }

    saveSessions() {
        const user = JSON.parse(sessionStorage.getItem('donishup_session_v2'));
        if (!user) return;
        localStorage.setItem(`tutor_sessions_${user.id}`, JSON.stringify(this.sessions));
        this.renderHistoryList();
    }

    renderHistoryList() {
        const list = document.getElementById('tutor-history-list');
        const mobileList = document.getElementById('tutor-history-list-mobile');
        if (!list) return;
        
        const lang = document.getElementById('settings-language')?.value || 'ru';
        const dict = i18n[lang];

        const renderTo = (el) => {
            if (!el) return;
            el.innerHTML = '';
            
            // Sort by date desc
            const sorted = [...this.sessions].sort((a, b) => b.timestamp - a.timestamp);

            if (sorted.length === 0) {
                el.innerHTML = `<div class="text-[10px] text-gray-400 text-center p-4 uppercase font-bold tracking-widest">${dict.tutor_no_history}</div>`;
                return;
            }

            sorted.forEach(session => {
                const div = document.createElement('div');
                div.className = `p-3 rounded-xl cursor-pointer text-xs truncate transition-all flex items-center gap-3 group ${session.id === this.currentSessionId ? 'bg-white text-primary font-bold shadow-sm border border-gray-100' : 'hover:bg-white/50 text-gray-500 hover:text-gray-800'}`;
                
                const displayTitle = session.title === 'New Chat' ? dict.tutor_new_chat : session.title;

                div.innerHTML = `
                    <i data-lucide="message-square" class="w-3 h-3 opacity-50"></i> 
                    <span class="truncate flex-1">${displayTitle}</span>
                    <button onclick="event.stopPropagation(); tutorManager.deleteSession('${session.id}')" class="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 transition-opacity" title="${dict.tutor_delete_chat}">
                        <i data-lucide="trash-2" class="w-3 h-3"></i>
                    </button>
                `;
                div.onclick = () => {
                    this.loadSession(session.id);
                    const mobileSidebar = document.getElementById('tutor-sidebar-mobile');
                    if (mobileSidebar) mobileSidebar.classList.add('hidden');
                };
                el.appendChild(div);
            });
        };

        renderTo(list);
        renderTo(mobileList);
        if (window.safeLucide) window.safeLucide();
    }

    async deleteSession(id) {
        const lang = document.getElementById('settings-language')?.value || 'ru';
        const dict = i18n[lang];

        const confirmed = await window.showConfirm(dict.tutor_confirm_delete);
        if (confirmed) {
            this.sessions = this.sessions.filter(s => s.id !== id);
            if (this.currentSessionId === id) {
                this.currentSessionId = null;
                const historyDiv = document.getElementById('tutor-chat-history');
                if (historyDiv) historyDiv.innerHTML = '';
            }
            this.saveSessions();
            if (!this.currentSessionId && this.sessions.length > 0) {
                this.loadSession(this.sessions[0].id);
            } else if (this.sessions.length === 0) {
                this.newChat();
            }
        }
    }

    newChat() {
        this.currentSessionId = Date.now().toString();
        const newSession = {
            id: this.currentSessionId,
            title: 'New Chat',
            timestamp: Date.now(),
            messages: []
        };
        this.sessions.unshift(newSession);
        this.saveSessions();
        this.loadSession(this.currentSessionId);
    }

    loadSession(id) {
        this.currentSessionId = id;
        const session = this.sessions.find(s => s.id === id);
        if (!session) return;

        // Clear UI
        const historyDiv = document.getElementById('tutor-chat-history');
        if (historyDiv) historyDiv.innerHTML = '';

        // Render messages
        session.messages.forEach(msg => {
            this.appendMessageToUI(msg.text, msg.sender);
        });

        this.renderHistoryList();
    }

    initGenAIChat(history = []) {
        // No longer needed on client side
    }

    async gradeHomework(imageFile) {
        if (!this.ai) {
            const lang = document.getElementById('settings-language')?.value || 'ru';
            const dict = i18n[lang];
            alert(dict.ai_tutor_not_initialized || "AI Tutor not initialized. Check API key.");
            return null;
        }

        try {
            // Compress image for faster upload and processing
            const compressedBlob = await ImageUtils.compress(imageFile, {
                maxWidth: 1600, // Slightly larger for better handwriting recognition
                maxHeight: 1600,
                quality: 0.8
            });

            // Convert blob to base64
            const base64Data = await ImageUtils.blobToBase64(compressedBlob);

            const prompt = `You are a strict but fair teacher. Grade this homework assignment. 
            1. Identify the subject. 
            2. Check the answers carefully. 
            3. Even if the handwriting is bad, try to read it. 
            4. Give a grade (2-5) and specific feedback in the language of the assignment. 
            
            IMPORTANT: Return ONLY a JSON object with this structure: 
            { 
              "subject": "...", 
              "grade": number, 
              "feedback": "..." 
            }`;

            const result = await this.ai.models.generateContent({
                model: "gemini-3-flash-preview",
                contents: {
                    parts: [
                        { text: prompt },
                        {
                            inlineData: {
                                data: base64Data,
                                mimeType: imageFile.type
                            }
                        }
                    ]
                },
                config: {
                    responseMimeType: "application/json"
                }
            });

            const text = result.text;
            if (!text) throw new Error("Empty response from AI");
            
            try {
                return JSON.parse(text);
            } catch (parseError) {
                // Fallback: try to extract JSON from markdown blocks
                const jsonMatch = text.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    return JSON.parse(jsonMatch[0]);
                }
                throw parseError;
            }
        } catch (error) {
            console.error("Grading error:", error);
            const lang = document.getElementById('settings-language')?.value || 'ru';
            const dict = i18n[lang];
            alert((dict.error_grading_homework || "Error grading homework: ") + error.message);
            return null;
        }
    }

    init() {
        // Reload sessions for the current user in case they changed
        this.loadSessions();
        
        // Called when view is opened
        if (!this.currentSessionId) {
            if (this.sessions.length > 0) {
                this.loadSession(this.sessions[0].id);
            } else {
                this.newChat();
            }
        }
    }

    async sendTutorMessage(speak = false) {
        const input = document.getElementById('tutor-input');
        const btn = document.getElementById('tutor-send-btn');
        const text = input.value.trim();
        if (!text) return;
        
        if (!this.ai) {
            this.appendMessageToUI("Error: AI Tutor not initialized. Check API key.", 'bot');
            return;
        }

        const user = JSON.parse(sessionStorage.getItem('donishup_session_v2'));
        if (!user) {
            this.appendMessageToUI("Error: Please log in first.", 'bot');
            return;
        }

        let finalText = text;
        if (this.currentMode === 'exam_prep') {
            try {
                const data = await window.fetchWithCache(`/api/notebooks?user_id=${user.id}`);
                if (data.success && data.notebooks.length > 0) {
                    const allNotes = data.notebooks.map(nb => `Notebook: ${nb.title}\nContent: ${nb.content}`).join('\n\n---\n\n');
                    finalText = `
SYSTEM DIRECTIVE: DEEP ANALYSIS & STUDY PLAN GENERATION
CONTEXT (ALL USER NOTEBOOKS):
${allNotes}

USER REQUEST: ${text}

TASK:
1. Conduct a thorough cross-analysis of all provided notebooks.
2. Identify core themes, recurring concepts, and critical formulas/dates.
3. Create a DETAILED, step-by-step study plan.
4. Categorize information into "Mastered", "Review Needed", and "Critical Focus" areas based on the depth of notes.
5. Provide a suggested timeline for exam preparation.
6. Highlight any missing links or topics that seem incomplete in the notes.

Output should be highly structured, professional, and actionable.`;
                }
            } catch (e) {
                console.error("Failed to fetch notebooks for exam prep", e);
            }
        } else if (this.currentMode === 'weakness_analyzer') {
            try {
                const [nbData, hwData, grData] = await Promise.all([
                    window.fetchWithCache(`/api/notebooks?user_id=${user.id}`),
                    window.fetchWithCache(`/api/homework`),
                    window.fetchWithCache(`/api/grades`)
                ]);

                const myNotebooks = nbData.success ? nbData.notebooks : [];
                const myHomework = hwData.filter(hw => hw.class_id === user.class_id || hw.user_id === user.id);
                const myGrades = grData.filter(g => g.student_id === user.id);

                const notebookContext = myNotebooks.map(nb => `Notebook: ${nb.title}\nContent: ${nb.content}`).join('\n---\n');
                const homeworkContext = myHomework.map(hw => `Subject: ${hw.subject}\nTask: ${hw.description}\nStatus: ${hw.status}`).join('\n---\n');
                const gradesContext = myGrades.map(g => `Subject: ${g.subject}\nGrade: ${g.value}\nDate: ${g.date}`).join('\n---\n');

                finalText = `
SYSTEM DIRECTIVE: STUDENT WEAKNESS ANALYSIS
You are an expert educational analyst. Your task is to analyze the student's performance data and identify their "Weak Spots" (subjects and specific topics they struggle with).

CONTEXT:
1. NOTEBOOKS (What the student is writing):
${notebookContext || 'No notebooks found.'}

2. HOMEWORK (Tasks and their completion status):
${homeworkContext || 'No homework found.'}

3. GRADES (Actual performance):
${gradesContext || 'No grades found.'}

USER REQUEST: ${text}

TASK:
1. Analyze the grades to find subjects with low marks (2 or 3).
2. Analyze homework status to see which subjects have many "todo" or "inprogress" tasks past their due date.
3. Analyze notebook content to see which topics are mentioned but might need more depth.
4. Provide a clear list of "Weak Spots".
   Example format:
   ### Ваши слабые места:
   1. **Предмет: Алгебра**
      - **Слабые темы:** "Площадь треугольника", "Квадратные уравнения"
      - **Причина:** Низкие оценки в последнее время и незаконченное ДЗ.
   2. **Предмет: Биология**
      - ...

5. Suggest specific actions to improve these areas.

Output must be in the language the user is using (Russian by default for this app).
`;
            } catch (e) {
                console.error("Failed to fetch data for weakness analyzer", e);
            }
        } else if (this.currentMode === 'grade_counter') {
            try {
                const grData = await window.fetchWithCache(`/api/grades`);
                const myGrades = grData.filter(g => g.student_id === user.id);
                const gradesContext = myGrades.map(g => `Subject: ${g.subject}\nGrade: ${g.value}\nDate: ${g.date}`).join('\n---\n');

                finalText = `
SYSTEM DIRECTIVE: GRADE STATISTICS & ANALYSIS
You are an expert educational analyst. Your task is to count the student's grades (5, 4, 3, 2) and provide a summary.

CONTEXT (GRADES):
${gradesContext || 'No grades found.'}

USER REQUEST: ${text}

TASK:
1. Count the number of 5s, 4s, 3s, and 2s.
2. Provide a clear summary of these counts.
3. Briefly analyze the overall performance (e.g., "You have mostly 5s, great job!" or "You need to work on subjects where you have 2s").
4. List the subjects where the student has the most 5s and where they have 2s/3s.

Output must be in the language the user is using (Russian by default for this app).
`;
            } catch (e) {
                console.error("Failed to fetch data for grade counter", e);
            }
        }

        if (text.length > 500) {
            this.appendMessageToUI("Error: Message is too long (max 500 characters).", 'bot');
            return;
        }

        // Add to UI
        this.appendMessageToUI(text, 'user');
        input.value = '';
        if (btn) btn.disabled = true;
        
        // Add to Session Data
        const session = this.sessions.find(s => s.id === this.currentSessionId);
        if (session) {
            session.messages.push({ text, sender: 'user', timestamp: Date.now() });
            if (session.title === 'New Chat') {
                session.title = text.substring(0, 30) + (text.length > 30 ? '...' : '');
            }
            this.saveSessions();
        }

        // Loading Indicator
        const historyDiv = document.getElementById('tutor-chat-history');
        const loadingId = 'loading-' + Date.now();
        if (historyDiv) {
            historyDiv.innerHTML += `
                <div id="${loadingId}" class="flex gap-2 p-4 bg-gray-50 rounded-xl w-fit items-center text-sm text-gray-500">
                    <div class="flex gap-1">
                        <div class="w-1.5 h-1.5 bg-primary rounded-full animate-bounce"></div>
                        <div class="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style="animation-delay: 0.1s"></div>
                        <div class="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
                    </div>
                    DonishUp AI is thinking...
                </div>
            `;
            historyDiv.scrollTop = historyDiv.scrollHeight;
        }

        try {
            const formattedHistory = (session ? session.messages.slice(0, -1) : []).map((h) => ({
                role: h.sender === 'user' ? 'user' : 'model',
                parts: [{ text: h.text }]
            }));

            const lang = document.getElementById('settings-language')?.value || 'ru';
            const langName = lang === 'en' ? 'English' : (lang === 'tj' ? 'Tajik' : 'Russian');
            
            const chat = this.ai.chats.create({
                model: "gemini-3-flash-preview",
                history: formattedHistory,
                config: {
                    systemInstruction: this.currentMode === 'exam_prep' ? `You are an Exam Preparation Expert. Your goal is to help the user create structured study guides and preparation plans based on their semester notes. Be organized, encouraging, and focus on key concepts and potential exam questions. You MUST reply in ${langName}.` : `Ты — S.I.R.I.U.S. (Расшифровка: Smart Interactive Resource for Independent User Study - Умный интерактивный ресурс для самостоятельного обучения). Твоя цель — не давать готовый ответ, а задавать наводящие вопросы и объяснять логику. You MUST reply in ${langName} language. Будь вежливым и используй образовательные примеры.`,
                    thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
                }
            });

            const responseStream = await chat.sendMessageStream({ message: finalText });

            // Remove loading indicator
            const loaders = document.querySelectorAll('[id^="loading-"]');
            loaders.forEach(l => l.remove());

            // Create a new message div for the bot
            const botMsgId = 'bot-msg-' + Date.now();
            const alignClass = 'self-start bg-gray-100 text-gray-800 rounded-bl-none';
            const div = document.createElement('div');
            div.id = botMsgId;
            div.className = `chat-message max-w-[80%] p-3 rounded-2xl shadow-sm ${alignClass} markdown-body`;
            div.innerHTML = '';
            historyDiv.appendChild(div);

            let responseText = "";
            for await (const chunk of responseStream) {
                if (chunk.text) {
                    responseText += chunk.text;
                    div.innerHTML = DOMPurify.sanitize(marked.parse(responseText));
                    historyDiv.scrollTop = historyDiv.scrollHeight;
                }
            }
            
            // Save Bot Response
            if (session) {
                session.messages.push({ text: responseText, sender: 'bot', timestamp: Date.now() });
                this.saveSessions();
            }
            
            if (speak) {
                const lang = document.getElementById('settings-language')?.value || 'ru';
                const utterance = new SpeechSynthesisUtterance(responseText.replace(/[*#`]/g, ''));
                utterance.lang = lang === 'en' ? 'en-US' : lang === 'tj' ? 'tg-TJ' : 'ru-RU';
                window.speechSynthesis.speak(utterance);
            }
        } catch (error) {
            console.error(error);
            const loaders = document.querySelectorAll('[id^="loading-"]');
            loaders.forEach(l => l.remove());
            this.appendMessageToUI("Error: " + error.message, 'bot');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    appendMessageToUI(text, sender) {
        const history = document.getElementById('tutor-chat-history');
        if (!history) return;
        
        let formattedText = DOMPurify.sanitize(marked.parse(text));

        const alignClass = sender === 'user' ? 'self-end bg-primary text-black rounded-br-none' : 'self-start bg-gray-100 text-gray-800 rounded-bl-none';
        
        const div = document.createElement('div');
        div.className = `chat-message max-w-[80%] p-3 rounded-2xl shadow-sm ${alignClass} ${sender === 'user' ? '' : 'markdown-body'}`;
        div.innerHTML = formattedText;
        
        history.appendChild(div);
        history.scrollTop = history.scrollHeight;
    }

    toggleVoiceMode() {
        // ... (Keep existing voice logic, just ensure it calls this.sendTutorMessage(true))
        // For brevity, reusing the logic from previous file but adapting to class structure
        const lang = document.getElementById('settings-language')?.value || 'ru';
        const dict = i18n[lang];
        
        if (!('webkitSpeechRecognition' in window)) {
            alert(dict.voice_not_supported);
            return;
        }

        if (this.isListening) {
            this.recognition.stop();
            this.isListening = false;
            const btn = document.getElementById('tutor-voice-btn');
            if(btn) {
                btn.classList.remove('text-red-500', 'animate-pulse');
                btn.classList.add('text-gray-500');
            }
        } else {
            try {
                this.recognition = new webkitSpeechRecognition();
                this.recognition.lang = lang === 'en' ? 'en-US' : lang === 'tj' ? 'tg-TJ' : 'ru-RU';
                this.recognition.continuous = false;
                this.recognition.interimResults = false;

                this.recognition.onstart = () => {
                    this.isListening = true;
                    const btn = document.getElementById('tutor-voice-btn');
                    if(btn) {
                        btn.classList.remove('text-gray-500');
                        btn.classList.add('text-red-500', 'animate-pulse');
                    }
                };

                this.recognition.onresult = (event) => {
                    const text = event.results[0][0].transcript;
                    const input = document.getElementById('tutor-input');
                    if(input) input.value = text;
                    this.sendTutorMessage(true);
                };

                this.recognition.onend = () => {
                    this.isListening = false;
                    const btn = document.getElementById('tutor-voice-btn');
                    if(btn) {
                        btn.classList.remove('text-red-500', 'animate-pulse');
                        btn.classList.add('text-gray-500');
                    }
                };

                this.recognition.start();
            } catch (e) {
                console.error(e);
            }
        }
    }

    toggleSidebar() {
        const sidebar = document.getElementById('tutor-sidebar-desktop');
        if (sidebar) {
            sidebar.classList.toggle('md:flex');
            sidebar.classList.toggle('hidden');
        }
    }

    changeMode(mode) {
        this.currentMode = mode;
        console.log("Tutor mode changed to:", mode);
        
        const lang = document.getElementById('settings-language')?.value || 'ru';
        const t = i18n[lang] || i18n.en;
        
        let msg = "";
        if (mode === 'exam_prep') {
            msg = t.tutor_exam_welcome;
        } else if (mode === 'weakness_analyzer') {
            msg = t.tutor_weakness_welcome;
        } else if (mode === 'grade_counter') {
            msg = t.tutor_grade_counter_welcome;
        } else {
            msg = t.tutor_standard_welcome;
        }
        
        // Add a system message to the UI to notify the user
        const historyDiv = document.getElementById('tutor-chat-history');
        if (historyDiv) {
            const div = document.createElement('div');
            div.className = 'flex flex-col items-center gap-3 mb-6';
            
            const badge = document.createElement('div');
            badge.className = 'bg-purple-50 text-purple-600 text-[10px] px-3 py-1 rounded-full font-bold uppercase tracking-widest';
            badge.textContent = msg;
            div.appendChild(badge);

            if (mode === 'exam_prep' || mode === 'weakness_analyzer' || mode === 'grade_counter') {
                const actionBtn = document.createElement('button');
                actionBtn.className = 'btn-primary text-xs py-2 px-4 rounded-xl shadow-lg hover:scale-105 transition-transform flex items-center gap-2';
                
                if (mode === 'exam_prep') {
                    actionBtn.innerHTML = `<i data-lucide="microscope" class="w-4 h-4"></i> ${t.tutor_exam_btn}`;
                    actionBtn.onclick = () => {
                        const input = document.getElementById('tutor-input');
                        if (input) {
                            input.value = t.tutor_exam_prompt;
                            this.sendTutorMessage();
                        }
                    };
                } else if (mode === 'weakness_analyzer') {
                    actionBtn.innerHTML = `<i data-lucide="activity" class="w-4 h-4"></i> ${t.tutor_analyze_btn}`;
                    actionBtn.onclick = () => {
                        const input = document.getElementById('tutor-input');
                        if (input) {
                            input.value = t.tutor_weakness_prompt;
                            this.sendTutorMessage();
                        }
                    };
                } else if (mode === 'grade_counter') {
                    actionBtn.innerHTML = `<i data-lucide="bar-chart-2" class="w-4 h-4"></i> ${t.tutor_grade_counter_btn}`;
                    actionBtn.onclick = () => {
                        const input = document.getElementById('tutor-input');
                        if (input) {
                            input.value = t.tutor_grade_counter_prompt;
                            this.sendTutorMessage();
                        }
                    };
                }
                div.appendChild(actionBtn);
                setTimeout(() => { if(window.lucide) window.lucide.createIcons(); }, 10);
            }

            historyDiv.appendChild(div);
            historyDiv.scrollTop = historyDiv.scrollHeight;
        }
    }
}
