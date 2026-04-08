import { i18n } from './i18n.js';
import { GoogleGenAI } from "@google/genai";
import { translateArray } from './translator.js';

export class QuestManager {
    constructor(auth) {
        this.auth = auth;
        this.ai = null;
        this.initAI();
    }

    initAI() {
        const apiKey = window.__GEMINI_API_KEY__;
        if (apiKey) {
            this.ai = new GoogleGenAI({ apiKey });
        }
    }

    async getDailyQuests() {
        const user = this.auth.currentUser;
        if (!user) return [];

        const getLocalDStr = (d) => {
            const date = new Date(d);
            date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
            return date.toISOString().split('T')[0];
        };
        const today = getLocalDStr(new Date());
        const lang = document.getElementById('settings-language')?.value || 'ru';
        
        try {
            // 1. Try to fetch from backend
            const res = await fetch(`/api/quests?user_id=${user.id}&date=${today}`);
            let quests = await res.json();
            
            if (Array.isArray(quests) && quests.length > 0) {
                return await translateArray(quests, ['title', 'description'], lang);
            }

            // 2. If no quests, generate with AI
            quests = await this.generateQuests(user, today);
            if (Array.isArray(quests) && quests.length > 0) {
                return await translateArray(quests, ['title', 'description'], lang);
            }
            return [];
        } catch (e) {
            console.error("Failed to get daily quests", e);
            return [];
        }
    }

    async generateQuests(user, date) {
        if (!this.ai) return [];

        const lang = document.getElementById('settings-language')?.value || 'ru';
        const dict = i18n[lang];
        const prompt = user.role === 'Teacher' ? dict.daily_quests_teacher_prompt : dict.daily_quests_student_prompt;

        try {
            const result = await this.ai.models.generateContent({
                model: "gemini-3-flash-preview",
                contents: [{ parts: [{ text: prompt }] }],
                config: { responseMimeType: "application/json" }
            });

            const quests = JSON.parse(result.text);
            
            // Save to backend
            const postRes = await fetch('/api/quests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: user.id, date, quests })
            });
            
            if (!postRes.ok) {
                console.error("Failed to save generated quests");
                return [];
            }

            // Fetch again to get IDs
            const res = await fetch(`/api/quests?user_id=${user.id}&date=${date}`);
            const data = await res.json();
            return Array.isArray(data) ? data : [];
        } catch (e) {
            console.error("Failed to generate quests", e);
            return [];
        }
    }

    async completeQuest(questId) {
        const user = this.auth.currentUser;
        if (!user) return null;

        try {
            const res = await fetch('/api/quests/complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ quest_id: questId, user_id: user.id })
            });
            const data = await res.json();
            
            if (data.success) {
                // Update local user XP
                user.xp = (user.xp || 0) + data.xp_earned;
                sessionStorage.setItem('donishup_session_v2', JSON.stringify(user));
                
                // Dispatch event to update UI elsewhere
                window.dispatchEvent(new CustomEvent('xp-updated', { detail: { xp: user.xp } }));
                return data.xp_earned;
            }
            return null;
        } catch (e) {
            console.error("Failed to complete quest", e);
            return null;
        }
    }
}

export class GamificationManager {
    constructor(auth) {
        this.auth = auth;
        this.currentSubject = 'math';
        this.questManager = new QuestManager(auth);
    }

    async loadDailyQuests() {
        const dashContainer = document.getElementById('daily-quests-container');
        const viewContainer = document.getElementById('quests-view-container');
        
        if (!dashContainer && !viewContainer) return;
        
        const lang = document.getElementById('settings-language')?.value || 'ru';
        const dict = i18n[lang];
        
        const loadingHtml = `<div class="flex items-center justify-center p-8 text-gray-400 gap-3">
            <div class="w-4 h-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
            ${dict.daily_quests_generating || 'Generating...'}
        </div>`;
        
        if (dashContainer) dashContainer.innerHTML = loadingHtml;
        if (viewContainer) viewContainer.innerHTML = loadingHtml;
        
        const quests = await this.questManager.getDailyQuests();

        const renderQuests = (container) => {
            if (quests.length === 0) {
                container.innerHTML = `<div class="text-center p-8 text-gray-400">${dict.daily_quests_no_quests}</div>`;
                return;
            }

            container.innerHTML = `
                <div class="grid gap-4">
                    ${quests.map(q => `
                        <div class="panel flex items-center justify-between gap-4 group transition-all hover:border-teal-500 ${q.completed ? 'opacity-60' : ''}">
                            <div class="flex-1">
                                <h4 class="font-bold text-sm flex items-center gap-2">
                                    ${q.completed ? '<i data-lucide="check-circle" class="w-4 h-4 text-green-500"></i>' : '<i data-lucide="circle" class="w-4 h-4 text-gray-300"></i>'}
                                    ${q.title}
                                </h4>
                                <p class="text-xs text-secondary mt-1">${q.description}</p>
                                <div class="flex items-center gap-2 mt-2">
                                    <span class="text-[10px] bg-teal-50 text-teal-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                                        ${dict.daily_quests_reward}: ${q.xp} XP
                                    </span>
                                </div>
                            </div>
                            <button 
                                onclick="window.gamification.completeQuest('${q.id}')"
                                ${q.completed ? 'disabled' : ''}
                                class="btn-primary text-xs py-2 px-4 rounded-xl ${q.completed ? 'bg-gray-100 text-gray-400 cursor-not-allowed border-none' : ''}"
                            >
                                ${q.completed ? dict.daily_quests_completed : dict.daily_quests_complete}
                            </button>
                        </div>
                    `).join('')}
                </div>
            `;
        };

        if (dashContainer) renderQuests(dashContainer);
        if (viewContainer) renderQuests(viewContainer);

        if (typeof safeLucide !== 'undefined') safeLucide();
    }

    async completeQuest(questId) {
        const xpEarned = await this.questManager.completeQuest(questId);
        if (xpEarned !== null) {
            const lang = document.getElementById('settings-language')?.value || 'ru';
            const dict = i18n[lang];
            
            // Show success notification
            const toast = document.createElement('div');
            toast.className = 'fixed bottom-8 right-8 bg-teal-600 text-white px-6 py-3 rounded-2xl shadow-2xl z-[100] animate-bounce flex items-center gap-3';
            toast.innerHTML = `<i data-lucide="zap" class="w-5 h-5"></i> <div><div class="font-bold">${dict.daily_quests_xp_earned}</div><div class="text-xs opacity-80">+${xpEarned} XP</div></div>`;
            document.body.appendChild(toast);
            
            if (typeof safeLucide !== 'undefined') safeLucide();
            
            setTimeout(() => {
                toast.classList.add('opacity-0', 'translate-y-4');
                setTimeout(() => toast.remove(), 500);
            }, 3000);

            // Reload quests and leaderboard
            this.loadDailyQuests();
            this.loadLeaderboard();
        }
    }

    async loadKnowledgeGraph() {
        const user = this.auth.currentUser;
        console.log('GamificationManager: loadKnowledgeGraph, user:', user, 'currentSubject:', this.currentSubject);
        if (!user) return;

        const classId = user.class_id || user.id;

        const lang = document.getElementById('settings-language')?.value || 'ru';
        const dict = i18n[lang];
        const container = document.getElementById('knowledge-graph-container');
        console.log('GamificationManager: container:', container);
        if (!container) return;

        try {
            const res = await fetch(`/api/knowledge_graph?class_id=${classId}`);
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            const data = await res.json();
            
            let graphData = data.data;
            if (!graphData) {
                // Initialize default graph data
                graphData = {
                    nodes: [
                        { id: 'math_root', label: 'Mathematics', subject: 'math', x: 400, y: 50, status: 'completed', level: 1 },
                        { id: 'alg_1', label: 'Algebra I', subject: 'math', x: 200, y: 150, status: 'completed', level: 2, parent: 'math_root' },
                        { id: 'geom_1', label: 'Geometry I', subject: 'math', x: 600, y: 150, status: 'unlocked', level: 2, parent: 'math_root' },
                        { id: 'eq_quad', label: 'Quadratic Equations', subject: 'math', x: 100, y: 250, status: 'unlocked', level: 3, parent: 'alg_1' },
                        { id: 'func_lin', label: 'Linear Functions', subject: 'math', x: 300, y: 250, status: 'locked', level: 3, parent: 'alg_1' },
                        { id: 'triangles', label: 'Triangles', subject: 'math', x: 500, y: 250, status: 'locked', level: 3, parent: 'geom_1' },
                        { id: 'circles', label: 'Circles', subject: 'math', x: 700, y: 250, status: 'locked', level: 3, parent: 'geom_1' }
                    ]
                };
                await this.saveKnowledgeGraph(classId, graphData);
            }

            // Migration: If nodes don't have subject, assign 'math'
            let hasUpdates = false;
            if (graphData.nodes && graphData.nodes.length > 0 && !graphData.nodes[0].subject) {
                graphData.nodes.forEach(n => n.subject = 'math');
                hasUpdates = true;
            }
            if (hasUpdates) await this.saveKnowledgeGraph(classId, graphData);

            container.innerHTML = '';
            
            // --- Controls Header ---
            const controls = document.createElement('div');
            controls.className = 'flex justify-between items-center mb-4 px-4';
            
            // Subject Selector
            const selector = document.createElement('div');
            selector.className = 'flex gap-2 overflow-x-auto pb-2';
            const subjectsList = window.allSubjects ? window.allSubjects.map(s => s.type) : ['math'];
            subjectsList.forEach(sub => {
                const btn = document.createElement('button');
                const subName = dict[`subj_${sub}`] || sub;
                btn.className = `px-4 py-2 rounded-full text-sm font-bold transition-colors ${this.currentSubject === sub ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`;
                btn.textContent = subName;
                btn.onclick = () => {
                    this.currentSubject = sub;
                    this.loadKnowledgeGraph();
                };
                selector.appendChild(btn);
            });
            controls.appendChild(selector);

            // Edit Button (Available to all for demo purposes)
            const addBtn = document.createElement('button');
            addBtn.className = 'btn-primary text-sm';
            addBtn.innerHTML = `<i data-lucide="plus"></i> ${dict.add_topic || 'Add Topic'}`;
            addBtn.onclick = () => this.addNodePrompt(classId, graphData);
            controls.appendChild(addBtn);

            container.appendChild(controls);

            // --- Canvas ---
            const canvasWrapper = document.createElement('div');
            canvasWrapper.className = 'relative w-full h-[500px] rounded-xl shadow-inner overflow-hidden border';
        canvasWrapper.style.background = 'var(--surface-color)';
        canvasWrapper.style.borderColor = 'var(--surface-border)';
            container.appendChild(canvasWrapper);

            // Filter nodes
            const nodes = graphData.nodes.filter(n => n.subject === this.currentSubject);

            if (nodes.length === 0) {
                canvasWrapper.innerHTML = `<div class="flex items-center justify-center h-full text-gray-400">${dict.no_topics || 'No topics yet'}</div>`;
                return;
            }

            // Calculate scaling
            const baseWidth = 800;
            const baseHeight = 600;
            const containerWidth = container.clientWidth || window.innerWidth;
            const containerHeight = 500;
            
            const scaleX = containerWidth / baseWidth;
            const scaleY = containerHeight / baseHeight;
            
            // Draw connections (SVG)
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('width', '100%');
            svg.setAttribute('height', '100%');
            svg.style.position = 'absolute';
            svg.style.top = '0';
            svg.style.left = '0';
            
            nodes.forEach(node => {
                if (node.parent) {
                    const parent = nodes.find(n => n.id === node.parent);
                    if (parent) {
                        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                        line.setAttribute('x1', parent.x * scaleX);
                        line.setAttribute('y1', parent.y * scaleY);
                        line.setAttribute('x2', node.x * scaleX);
                        line.setAttribute('y2', node.y * scaleY);
                        line.setAttribute('stroke', '#cbd5e1');
                        line.setAttribute('stroke-width', '2');
                        svg.appendChild(line);
                    }
                }
            });
            canvasWrapper.appendChild(svg);

            // Draw nodes
            nodes.forEach(node => {
                const el = document.createElement('div');
                el.className = `absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center cursor-pointer transition-all duration-300 hover:scale-110`;
                el.style.left = `${node.x * scaleX}px`;
                el.style.top = `${node.y * scaleY}px`;
                
                let statusColor = 'bg-gray-200 border-gray-400 text-gray-500';
                let icon = 'lock';
                
                if (node.status === 'completed') {
                    statusColor = 'bg-green-100 border-green-500 text-green-700 shadow-lg shadow-green-100';
                    icon = 'check';
                } else if (node.status === 'unlocked') {
                    statusColor = 'bg-donishup-blue/10 border-donishup-blue text-donishup-blue shadow-lg shadow-donishup-blue/20 animate-pulse';
                    icon = 'unlock';
                }

                const label = dict[`kg_${node.id}`] || node.label;
                
                el.innerHTML = `
                    <div class="w-12 h-12 rounded-full border-2 ${statusColor} flex items-center justify-center z-10" style="background: var(--surface-color);">
                        <i data-lucide="${icon}" class="w-6 h-6"></i>
                    </div>
                    <div class="mt-2 text-xs font-bold px-2 py-1 rounded backdrop-blur-sm shadow-sm whitespace-nowrap border" style="background: var(--surface-color); color: var(--text-primary); border-color: var(--surface-border);">
                        ${label}
                    </div>
                `;
                
                el.onclick = () => this.showNodeDetails(node, user.class_id, graphData);
                canvasWrapper.appendChild(el);
            });

            safeLucide();
        } catch (e) {
            console.error("Failed to load knowledge graph", e);
        }
    }

    async saveKnowledgeGraph(classId, data) {
        console.log('GamificationManager: saveKnowledgeGraph, classId:', classId, 'data:', data);
        try {
            await fetch('/api/knowledge_graph', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ class_id: classId, data })
            });
        } catch (e) {
            console.error("Failed to save knowledge graph", e);
        }
    }

    async addNodePrompt(classId, graphData) {
        console.log('GamificationManager: addNodePrompt, classId:', classId, 'graphData:', graphData);
        
        const modal = document.getElementById('modal-add-topic');
        const form = document.getElementById('add-topic-form');
        const parentSelect = document.getElementById('topic-parent');
        const subjectSelect = document.getElementById('topic-subject');
        const nameInput = document.getElementById('topic-name');

        if (!modal || !form || !parentSelect) return;

        // Reset form
        nameInput.value = '';
        subjectSelect.value = this.currentSubject;
        
        // Populate parent select based on current subject
        const lang = document.getElementById('settings-language')?.value || 'ru';
        const dict = i18n[lang];
        
        const updateParentOptions = (subject) => {
            parentSelect.innerHTML = `<option value="">${dict.none || 'None'}</option>`;
            graphData.nodes.filter(n => n.subject === subject).forEach(node => {
                const option = document.createElement('option');
                option.value = node.id;
                option.textContent = dict[node.label] || node.label;
                parentSelect.appendChild(option);
            });
        };

        updateParentOptions(this.currentSubject);

        subjectSelect.onchange = (e) => {
            updateParentOptions(e.target.value);
        };

        modal.classList.remove('hidden');

        form.onsubmit = async (e) => {
            e.preventDefault();
            const label = nameInput.value.trim();
            const subject = subjectSelect.value;
            const parentId = parentSelect.value;

            if (!label) return;

            const newNodeId = subject + '_' + Date.now();
            const parentNode = graphData.nodes.find(n => n.id === parentId);
            
            // Basic layout logic: place near parent or at random
            let x = Math.random() * 600 + 100;
            let y = Math.random() * 400 + 100;
            let level = 1;

            if (parentNode) {
                x = parentNode.x + (Math.random() - 0.5) * 100;
                y = parentNode.y + 150;
                level = (parentNode.level || 1) + 1;
            }

            const newNode = {
                id: newNodeId,
                label: label,
                subject: subject,
                x: x,
                y: y,
                status: 'locked',
                level: level,
                parent: parentId || null
            };

            graphData.nodes.push(newNode);
            await this.saveKnowledgeGraph(classId, graphData);
            modal.classList.add('hidden');
            this.loadKnowledgeGraph();
        };
    }

    async showNodeDetails(node, classId, graphData) {
        const lang = document.getElementById('settings-language').value || 'ru';
        const dict = i18n[lang];
        const label = dict[`kg_${node.id}`] || node.label;
        const status = node.status === 'completed' ? dict.status_completed : node.status === 'unlocked' ? dict.status_unlocked : dict.status_locked;
        
        // Teacher Edit: Delete option
        const user = this.auth.currentUser;
        if (user && user.role === 'Teacher') {
            const confirmed = await window.showConfirm(`${dict.node_label}${label}\n${dict.node_status}${status}\n\nDelete this node?`);
            if (confirmed) {
                 graphData.nodes = graphData.nodes.filter(n => n.id !== node.id);
                 await this.saveKnowledgeGraph(classId, graphData);
                 this.loadKnowledgeGraph();
            }
        } else {
            window.showToast(`${dict.node_label}${label}\n${dict.node_status}${status}\n${dict.node_level}${node.level}`, 'info');
        }
    }

    async loadLeaderboard() {
        const container = document.getElementById('leaderboard-container');
        if (!container) return;

        const lang = document.getElementById('settings-language')?.value || 'ru';
        const dict = i18n[lang];

        try {
            const res = await fetch('/api/users');
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            const users = await res.json();
            
            // Filter out non-student roles
            const students = users.filter(u => ['Student', 'Personal'].includes(u.role));
            
            // Sort by XP
            const sortedUsers = students.sort((a, b) => (b.xp || 0) - (a.xp || 0));
            
            container.innerHTML = `
                <table class="w-full text-left border-collapse">
                    <thead class="bg-gray-50 border-b">
                        <tr>
                            <th class="p-4 font-bold text-gray-600">#</th>
                            <th class="p-4 font-bold text-gray-600" data-i18n="student">${dict.student || 'Student'}</th>
                            <th class="p-4 font-bold text-gray-600" data-i18n="class">${dict.class || 'Class'}</th>
                            <th class="p-4 font-bold text-gray-600">XP</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sortedUsers.map((u, i) => `
                            <tr class="border-b hover:bg-gray-50 transition-colors ${this.auth.currentUser?.id === u.id ? 'bg-teal-50' : ''}">
                                <td class="p-4">
                                    ${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                                </td>
                                <td class="p-4 flex items-center gap-3">
                                    <div class="w-8 h-8 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center font-bold text-xs">
                                        ${u.name.charAt(0)}
                                    </div>
                                    <span class="font-medium">${u.name} ${this.auth.currentUser?.id === u.id ? `<span class="text-xs bg-teal-600 text-white px-1 rounded">${dict.you || 'YOU'}</span>` : ''}</span>
                                </td>
                                <td class="p-4 text-gray-500">${u.class_id || '-'}</td>
                                <td class="p-4 font-bold text-teal-600">${u.xp || 0}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        } catch (e) {
            console.error("Failed to load leaderboard", e);
        }
    }

    async loadAchievements() {
        const container = document.getElementById('achievements-container');
        if (!container) return;

        const lang = document.getElementById('settings-language')?.value || 'ru';
        const dict = i18n[lang];

        const achievements = [
            { id: 'first_step', title: 'Первый шаг', desc: 'Завершите первое задание', icon: 'flag', xp: 100, unlocked: true },
            { id: 'streak_3', title: 'Тройной удар', desc: 'Заходите 3 дня подряд', icon: 'zap', xp: 300, unlocked: true },
            { id: 'math_pro', title: 'Мастер чисел', desc: 'Завершите 10 тем по математике', icon: 'plus-circle', xp: 500, unlocked: false },
            { id: 'social_star', title: 'Звезда общения', desc: 'Отправьте 50 сообщений в чате', icon: 'message-square', xp: 200, unlocked: true },
            { id: 'early_bird', title: 'Ранняя пташка', desc: 'Выполните задание до 8:00', icon: 'sun', xp: 400, unlocked: false },
            { id: 'notebook_king', title: 'Король заметок', desc: 'Создайте 5 тетрадей', icon: 'book-open', xp: 300, unlocked: true },
            { id: 'perfect_grades', title: 'Отличник', desc: 'Получите 5 пятерок подряд', icon: 'star', xp: 1000, unlocked: false },
            { id: 'helper', title: 'Помощник', desc: 'Помогите однокласснику в чате', icon: 'heart', xp: 250, unlocked: false }
        ];

        const translatedAchievements = await translateArray(achievements, ['title', 'desc'], lang);

        container.innerHTML = translatedAchievements.map(a => `
            <div class="panel flex flex-col items-center text-center gap-3 transition-transform hover:scale-105 ${a.unlocked ? 'border-teal-500' : 'opacity-50 grayscale'}">
                <div class="w-16 h-16 rounded-full ${a.unlocked ? 'bg-teal-100 text-teal-600' : 'bg-gray-100 text-gray-400'} flex items-center justify-center shadow-inner">
                    <i data-lucide="${a.icon}" class="w-8 h-8"></i>
                </div>
                <h4 class="font-bold text-sm">${a.title}</h4>
                <p class="text-xs text-secondary">${a.desc}</p>
                <div class="text-xs font-bold ${a.unlocked ? 'text-teal-600' : 'text-gray-400'}">+${a.xp} XP</div>
                ${a.unlocked ? `<div class="text-[10px] bg-teal-600 text-white px-2 py-0.5 rounded-full uppercase font-bold">${dict.status_unlocked || 'Unlocked'}</div>` : ''}
            </div>
        `).join('');
        
        if (typeof safeLucide !== 'undefined') safeLucide();
    }
}
