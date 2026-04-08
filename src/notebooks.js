import { i18n } from './i18n.js';

export class NotebookManager {
    constructor() {
        this.activeNotebookId = null;
        this.autoSaveInterval = null;
        this.isSaving = false;
        this.currentPage = 0;
        this.setupListeners();
        
        // Ensure save on close
        window.addEventListener('beforeunload', (e) => {
            if (this.activeNotebookId) {
                this.saveNotebook();
            }
        });

        window.addEventListener('user-logout', () => {
            this.activeNotebookId = null;
            this.currentPage = 0;
            if (this.autoSaveInterval) {
                clearInterval(this.autoSaveInterval);
                this.autoSaveInterval = null;
            }
            const list = document.getElementById('notebooks-list');
            if (list) list.innerHTML = '';
            const view = document.getElementById('notebook-editor-view');
            if (view) view.classList.add('hidden');
            const placeholder = document.getElementById('notebooks-placeholder');
            if (placeholder) placeholder.classList.remove('hidden');
        });
    }

    setupListeners() {
        const createBtn = document.getElementById('create-notebook-btn');
        if (createBtn) {
            createBtn.addEventListener('click', () => {
                this.createNotebook();
            });
        }

        window.closeNotebook = () => this.closeNotebook();
        
        const templateSelect = document.getElementById('nb-template-select');
        if (templateSelect) {
            templateSelect.addEventListener('change', (e) => {
                this.applyTemplate(e.target.value);
            });
        }

        // Make functions globally available
        window.notebooks = this;
    }

    async loadNotebooks() {
        const user = JSON.parse(sessionStorage.getItem('donishup_session_v2'));
        if (!user) return;
        
        const lang = document.getElementById('settings-language').value || 'ru';
        const dict = i18n[lang];
        const list = document.getElementById('smart-notebooks-list');
        
        try {
            const res = await fetch(`/api/notebooks?user_id=${user.id}`);
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            const data = await res.json();
            if (data.success) {
                const myNotebooks = data.notebooks;
                list.innerHTML = myNotebooks.map(nb => `
                    <div class="textbook-card" onclick="notebooks.openNotebook('${nb.id}')">
                        <div class="tb-cover bg-yellow-100 text-yellow-600"><i data-lucide="edit-3"></i></div>
                        <h4>${nb.title}</h4>
                        <div class="text-xs text-secondary mt-2">${dict.template}${nb.template || 'blank'}</div>
                    </div>
                `).join('');
                safeLucide();
            }
        } catch (e) {
            console.error("Failed to load notebooks", e);
        }
    }

    async createNotebook() {
        const user = JSON.parse(sessionStorage.getItem('donishup_session_v2'));
        if (!user) return;
        
        const lang = document.getElementById('settings-language').value || 'ru';
        const dict = i18n[lang];
        
        try {
            const res = await fetch('/api/notebooks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: user.id,
                    title: dict.new_notebook_title,
                    template: 'blank',
                    content: ''
                })
            });
            const data = await res.json();
            if (data.success) {
                this.loadNotebooks();
                this.openNotebook(data.id);
            }
        } catch (e) {
            console.error("Failed to create notebook", e);
        }
    }

    async openNotebook(id) {
        this.activeNotebookId = id;
        const user = JSON.parse(sessionStorage.getItem('donishup_session_v2'));
        
        try {
            const res = await fetch(`/api/notebooks?user_id=${user.id}`);
            const data = await res.json();
            if (data.success) {
                const nb = data.notebooks.find(n => n.id === id);
                if (nb) {
                    document.getElementById('nb-title').value = nb.title;
                    document.getElementById('nb-template-select').value = nb.template || 'blank';
                    document.getElementById('notebook-editor').classList.remove('hidden');
                    
                    this.applyTemplate(nb.template || 'blank', nb.content);
                    
                    if(this.autoSaveInterval) clearInterval(this.autoSaveInterval);
                    this.autoSaveInterval = setInterval(() => this.saveNotebook(), 5000);
                }
            }
        } catch (e) {
            console.error("Failed to open notebook", e);
        }
    }

    async closeNotebook() {
        await this.saveNotebook();
        if(this.autoSaveInterval) clearInterval(this.autoSaveInterval);
        this.activeNotebookId = null;
        document.getElementById('notebook-editor').classList.add('hidden');
        this.loadNotebooks();
    }

    prevPage() {
        if (this.currentPage > 0) {
            this.currentPage--;
            this.updatePageTransform();
        }
    }

    nextPage() {
        const editableArea = document.querySelector('.editable-area');
        if (editableArea) {
            // Gap is 6rem = 96px
            const gap = 96;
            const maxPages = Math.round((editableArea.scrollWidth + gap) / (editableArea.clientWidth + gap));
            if (this.currentPage < maxPages - 1) {
                this.currentPage++;
                this.updatePageTransform();
            }
        }
    }

    updatePageTransform() {
        const editableArea = document.querySelector('.editable-area');
        if (editableArea) {
            editableArea.style.setProperty('--current-page', this.currentPage);
            
            const gap = 96;
            const maxPages = Math.max(1, Math.round((editableArea.scrollWidth + gap) / (editableArea.clientWidth + gap)));
            const counter = document.getElementById('page-counter');
            if (counter) {
                counter.textContent = `${this.currentPage + 1} / ${maxPages}`;
            }
        }
    }

    applyTemplate(templateType, savedContent = null) {
        const container = document.getElementById('nb-paper-container');
        const lang = document.getElementById('settings-language').value || 'ru';
        const dict = i18n[lang];
        let html = '';
        let paperClass = 'paper';

        if (templateType === 'blank') {
            paperClass += ' paper-lined';
            html = `<div class="editable-area" contenteditable="true">${savedContent || dict.start_writing}</div>`;
        } else if (templateType === 'squared') {
            paperClass += ' paper-squared';
            html = `<div class="editable-area" contenteditable="true">${savedContent || dict.start_writing}</div>`;
        } else if (templateType === 'math') {
            paperClass += ' paper-squared';
            html = `
                <div class="template-math editable-area" contenteditable="true">
                    <h1 class="edu-bold">Математика</h1>
                    <div class="edu-definition">
                        <h3 class="edu-term">${dict.math_concept || 'Concept'}</h3>
                        <p>${dict.math_explain_concept || 'Explain...'}</p>
                    </div>
                    <div class="math-grid">
                        <div class="math-box">
                            <h3 class="edu-bold">${dict.math_formula || 'Formula'}</h3>
                            <p class="edu-highlight">$$ c = \\sqrt{a^2 + b^2} $$</p>
                        </div>
                        <div class="math-box">
                            <h3 class="edu-bold">${dict.math_explanation || 'Explanation'}</h3>
                            <p class="edu-italic">${dict.math_vars || 'Variables...'}</p>
                        </div>
                    </div>
                    <div class="math-box" style="min-height: 300px;">
                        <h3 class="edu-underline">${dict.math_example || 'Example'}</h3>
                        <p>${dict.math_solve_x || 'Solve for x...'}</p>
                    </div>
                </div>
            `;
            if(savedContent) html = `<div class="template-math editable-area" contenteditable="true">${savedContent}</div>`;
            setTimeout(() => { if(window.MathJax) window.MathJax.typesetPromise(); }, 100);
        } else if (templateType === 'chemistry') {
            paperClass += ' paper-lined';
            html = `
                <div class="template-chem editable-area" contenteditable="true">
                    <h1 class="edu-bold">Химия</h1>
                    <div style="display:flex; gap:2rem;">
                        <div style="border:1px solid var(--surface-border); padding:1rem; width:200px; border-radius:8px;">
                            <h3 class="edu-term">${dict.chem_topic || 'Topic'}</h3>
                            <p class="edu-italic">${dict.chem_org_chem || 'Organic Chemistry'}</p>
                        </div>
                        <div style="flex:1;">
                            <h3 class="edu-bold">${dict.chem_main_notes || 'Main Notes'}</h3>
                            <p>${dict.chem_hydrocarbons || 'Hydrocarbons...'}</p>
                        </div>
                    </div>
                    <table class="w-full mt-4">
                        <tr style="background: var(--bg-main);"><th class="edu-bold">${dict.chem_table_name || 'Name'}</th><th class="edu-bold">${dict.chem_table_formula || 'Formula'}</th><th class="edu-bold">${dict.chem_table_structure || 'Structure'}</th></tr>
                        <tr><td><span class="edu-term">Метан</span></td><td>CH4</td><td>...</td></tr>
                        <tr><td><span class="edu-term">Этан</span></td><td>C2H6</td><td>...</td></tr>
                        <tr><td><span class="edu-term">Пропан</span></td><td>C3H8</td><td>...</td></tr>
                    </table>
                </div>
            `;
            if(savedContent) html = `<div class="template-chem editable-area" contenteditable="true">${savedContent}</div>`;
        } else if (templateType === 'history') {
            paperClass += ' paper-lined';
            html = `
                <div class="template-history editable-area" contenteditable="true">
                    <div class="hist-col">
                        <div class="edu-definition"><h3>${dict.hist_events || 'Events'}</h3><p>...</p></div>
                        <div class="math-box"><h3 class="edu-term">${dict.hist_personalities || 'Personalities'}</h3><p class="edu-italic">...</p></div>
                    </div>
                    <div class="hist-col">
                        <div class="math-box"><h3 class="edu-underline">${dict.hist_timeline || 'Timeline'}</h3><p>...</p></div>
                        <div class="math-box"><h3 class="edu-important">${dict.hist_results || 'Results'}</h3><p>...</p></div>
                        <div class="edu-definition"><h3>${dict.hist_summary || 'Summary'}</h3><p>...</p></div>
                    </div>
                </div>
            `;
            if(savedContent) html = `<div class="template-history editable-area" contenteditable="true">${savedContent}</div>`;
        } else if (templateType === 'biology') {
            paperClass += ' paper-lined';
            html = `
                <div class="template-biology editable-area" contenteditable="true">
                    <h1 class="edu-bold">Биология</h1>
                    <div class="bio-flow">
                        <div class="bio-text">
                            <h3 class="edu-underline">${dict.bio_notes || 'Notes'}</h3>
                            <p><span class="edu-term">${dict.bio_cell || 'Cell...'}</span> - это основная единица жизни.</p>
                            <div class="edu-definition">${dict.bio_mito || 'Mitochondria...'}</div>
                        </div>
                        <div style="display:flex; flex-direction:column; gap:2rem; flex:1;">
                            <div class="bio-diagram edu-highlight">${dict.bio_diagram || 'Diagram'}</div>
                            <div class="bio-diagram edu-highlight">${dict.bio_diagram || 'Diagram'}</div>
                        </div>
                    </div>
                </div>
            `;
            if(savedContent) html = `<div class="template-biology editable-area" contenteditable="true">${savedContent}</div>`;
        } else if (templateType === 'economics') {
            paperClass += ' paper-economics';
            html = `
                <div class="template-economics editable-area" contenteditable="true">
                    <div style="display:flex; flex-direction:column;">
                        <div class="eco-graph edu-highlight">${dict.eco_graph || 'Graph'}</div>
                        <div>
                            <h3 class="edu-bold">${dict.eco_explain || 'Explanation'}</h3>
                            <p>${dict.eco_curve || 'Curve...'}</p>
                        </div>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:2rem;">
                        <div style="border:1px solid var(--surface-border); padding:1rem; background:white; border-radius:8px;">
                            <h3 class="edu-term">${dict.eco_equations || 'Equations'}</h3>
                            <p class="edu-italic">Qd = a - bP</p>
                        </div>
                        <div style="border:1px solid var(--surface-border); padding:1rem; background:white; flex:1; border-radius:8px;">
                            <h3 class="edu-underline">${dict.eco_examples || 'Examples'}</h3>
                            <p>${dict.eco_bubble || 'Bubble...'}</p>
                        </div>
                    </div>
                </div>
            `;
            if(savedContent) html = `<div class="template-economics editable-area" contenteditable="true">${savedContent}</div>`;
        }

        this.currentPage = 0;
        container.innerHTML = `
            <div class="${paperClass}" onscroll="this.scrollLeft = 0; this.scrollTop = 0;">
                <div class="absolute top-4 right-4 flex items-center gap-3 z-10 bg-white/80 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-sm border border-gray-100">
                    <button class="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 transition-colors shadow-sm" onclick="notebooks.prevPage()">
                        <i data-lucide="chevron-left" class="w-5 h-5"></i>
                    </button>
                    <span id="page-counter" class="text-sm font-medium text-gray-600 min-w-[3rem] text-center">1 / 1</span>
                    <button class="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 transition-colors shadow-sm" onclick="notebooks.nextPage()">
                        <i data-lucide="chevron-right" class="w-5 h-5"></i>
                    </button>
                </div>
                ${html}
            </div>
        `;
        setTimeout(() => {
            safeLucide();
            this.updatePageTransform();
            
            const editableArea = document.querySelector('.editable-area');
            if (editableArea) {
                editableArea.addEventListener('input', () => this.updatePageTransform());
            }
        }, 0);
    }

    async saveNotebook() {
        if (!this.activeNotebookId || this.isSaving) return;
        
        const titleEl = document.getElementById('nb-title');
        const templateEl = document.getElementById('nb-template-select');
        const contentArea = document.querySelector('.editable-area');
        
        if (!titleEl || !templateEl || !contentArea) return;

        const title = titleEl.value;
        const template = templateEl.value;
        const content = contentArea.innerHTML;
        
        this.isSaving = true;
        const statusEl = document.getElementById('nb-save-status');
        const lang = document.getElementById('settings-language').value || 'ru';
        const dict = i18n[lang];
        
        if (statusEl) statusEl.textContent = dict.saving || 'Saving...';

        try {
            const res = await fetch(`/api/notebooks/${this.activeNotebookId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, template, content })
            });
            
            if (res.ok) {
                if (statusEl) {
                    statusEl.textContent = dict.saved || 'Saved';
                    statusEl.classList.add('text-green-500');
                    setTimeout(() => {
                        statusEl.classList.remove('text-green-500');
                    }, 2000);
                }
            }
        } catch (e) {
            console.error("Failed to save notebook", e);
            if (statusEl) statusEl.textContent = 'Error';
        } finally {
            this.isSaving = false;
        }
    }

    addNotionBlock(type) {
        const contentArea = document.querySelector('.editable-area');
        if (!contentArea) return;
        const lang = document.getElementById('settings-language').value || 'ru';
        const dict = i18n[lang];

        const block = document.createElement('div');
        block.className = 'notion-block';
        block.draggable = true;
        
        block.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', block.innerHTML);
            block.classList.add('opacity-50');
            window.draggedBlock = block;
        });
        
        block.addEventListener('dragend', () => {
            block.classList.remove('opacity-50');
            window.draggedBlock = null;
        });

        contentArea.addEventListener('dragover', (e) => e.preventDefault());
        contentArea.addEventListener('drop', (e) => {
            e.preventDefault();
            if (window.draggedBlock && e.target.closest('.notion-block')) {
                const target = e.target.closest('.notion-block');
                contentArea.insertBefore(window.draggedBlock, target.nextSibling);
            }
        });

        const handle = document.createElement('div');
        handle.className = 'drag-handle';
        handle.innerHTML = '<i data-lucide="grip-vertical" class="w-4 h-4"></i>';
        
        const content = document.createElement('div');
        content.className = 'block-content';
        content.contentEditable = true;

        if (type === 'text') {
            content.innerHTML = `<p>${dict.write_something}</p>`;
        } else if (type === 'kanban') {
            content.contentEditable = false;
            content.innerHTML = `
                <div class="kanban-board">
                    <div class="kanban-col todo" ondragover="event.preventDefault()" ondrop="notebooks.dropKanban(event)">
                        <div class="kanban-header mb-4">
                            <div class="flex items-center gap-2">
                                <span>${dict.todo}</span>
                                <span class="kanban-count">1</span>
                            </div>
                            <button class="btn-icon p-1" onclick="notebooks.addKanbanTask(this)" title="${dict.add_task}">
                                <i data-lucide="plus" class="w-4 h-4"></i>
                            </button>
                        </div>
                        <div class="kanban-items">
                            <div class="kanban-card" draggable="true" ondragstart="notebooks.dragKanban(event)" ondragend="notebooks.dragEndKanban(event)">
                                <div class="flex justify-between items-start mb-2">
                                    <div class="kanban-tag tag-math">Math</div>
                                    <button class="btn-icon p-1 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100" onclick="notebooks.deleteKanbanTask(this)">
                                        <i data-lucide="trash-2" class="w-3 h-3"></i>
                                    </button>
                                </div>
                                <div class="kanban-title" contenteditable="true" onblur="notebooks.saveNotebook()">Algebra HW</div>
                                <div class="kanban-meta">
                                    <span><i data-lucide="clock" class="w-3 h-3 inline"></i> 2h</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="kanban-col inprogress" ondragover="event.preventDefault()" ondrop="notebooks.dropKanban(event)">
                        <div class="kanban-header mb-4">
                            <div class="flex items-center gap-2">
                                <span>${dict.in_progress}</span>
                                <span class="kanban-count">0</span>
                            </div>
                            <button class="btn-icon p-1" onclick="notebooks.addKanbanTask(this)" title="${dict.add_task}">
                                <i data-lucide="plus" class="w-4 h-4"></i>
                            </button>
                        </div>
                        <div class="kanban-items"></div>
                    </div>
                    <div class="kanban-col done" ondragover="event.preventDefault()" ondrop="notebooks.dropKanban(event)">
                        <div class="kanban-header mb-4">
                            <div class="flex items-center gap-2">
                                <span>${dict.done}</span>
                                <span class="kanban-count">0</span>
                            </div>
                            <button class="btn-icon p-1" onclick="notebooks.addKanbanTask(this)" title="${dict.add_task}">
                                <i data-lucide="plus" class="w-4 h-4"></i>
                            </button>
                        </div>
                        <div class="kanban-items"></div>
                    </div>
                </div>
            `;
        } else if (type === 'ai') {
            content.contentEditable = false;
            const aiId = 'ai-input-' + Date.now();
            content.innerHTML = `
                <div class="p-4 bg-purple-50 border border-purple-100 rounded-lg flex gap-2 items-center">
                    <i data-lucide="sparkles" class="text-purple-500"></i>
                    <input type="text" id="${aiId}" class="input-field flex-1" style="background: var(--surface-color); color: var(--text-primary);" placeholder="${dict.ask_ai_placeholder}">
                    <button class="btn-primary" onclick="notebooks.generateAIContent('${aiId}', this)">${dict.generate}</button>
                </div>
            `;
        }

        block.appendChild(handle);
        block.appendChild(content);
        contentArea.appendChild(block);
        safeLucide();
    }

    dragKanban(e) {
        e.stopPropagation();
        e.dataTransfer.setData('text/plain', e.target.innerHTML);
        window.draggedKanbanItem = e.target;
        e.target.classList.add('dragging');
    }

    dragEndKanban(e) {
        e.target.classList.remove('dragging');
        window.draggedKanbanItem = null;
    }

    dropKanban(e) {
        e.preventDefault();
        e.stopPropagation();
        const col = e.target.closest('.kanban-col');
        const itemsContainer = col ? col.querySelector('.kanban-items') : null;
        
        if (itemsContainer && window.draggedKanbanItem) {
            itemsContainer.appendChild(window.draggedKanbanItem);
            this.updateKanbanCounts(col.closest('.kanban-board'));
        }
        window.draggedKanbanItem = null;
    }

    updateKanbanCounts(board) {
        if (!board) return;
        board.querySelectorAll('.kanban-col').forEach(col => {
            const count = col.querySelectorAll('.kanban-card').length;
            const countEl = col.querySelector('.kanban-count');
            if (countEl) countEl.textContent = count;
        });
    }

    addKanbanTask(btn) {
        const col = btn.closest('.kanban-col');
        const itemsContainer = col.querySelector('.kanban-items');
        const lang = document.getElementById('settings-language').value || 'ru';
        const dict = i18n[lang];

        const card = document.createElement('div');
        card.className = 'kanban-card group';
        card.draggable = true;
        card.ondragstart = (e) => this.dragKanban(e);
        card.ondragend = (e) => this.dragEndKanban(e);
        
        card.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <div class="kanban-tag bg-gray-200 text-gray-600">${dict.add_task}</div>
                <button class="btn-icon p-1 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100" onclick="notebooks.deleteKanbanTask(this)">
                    <i data-lucide="trash-2" class="w-3 h-3"></i>
                </button>
            </div>
            <div class="kanban-title" contenteditable="true" onblur="notebooks.saveNotebook()">${dict.write_something}</div>
            <div class="kanban-meta">
                <span><i data-lucide="clock" class="w-3 h-3 inline"></i> ${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
            </div>
        `;

        itemsContainer.appendChild(card);
        this.updateKanbanCounts(col.closest('.kanban-board'));
        safeLucide();
        this.saveNotebook();
        
        // Focus the title
        const title = card.querySelector('.kanban-title');
        title.focus();
        // Select all text
        document.execCommand('selectAll', false, null);
    }

    deleteKanbanTask(btn) {
        const card = btn.closest('.kanban-card');
        const board = card.closest('.kanban-board');
        card.remove();
        this.updateKanbanCounts(board);
        this.saveNotebook();
    }

    async generateAIContent(inputId, btnElement) {
        const input = document.getElementById(inputId);
        const prompt = input.value.trim();
        if (!prompt) return;
        const lang = document.getElementById('settings-language').value || 'ru';
        const dict = i18n[lang];

        const container = btnElement.closest('.block-content');
        container.innerHTML = `<div class="p-4 text-purple-600 flex items-center gap-2"><i data-lucide="loader" class="animate-spin"></i> ${dict.generating}</div>`;
        safeLucide();

        try {
            // Using the global tutor instance for generation
            if (window.tutor && window.tutor.session) {
                const response = await window.tutor.session.sendMessage({ message: `Сгенерируй контент для моей тетради на основе этого запроса: ${prompt}. Отформатируй красиво с помощью HTML (используй <p>, <ul>, <strong> и т.д., но БЕЗ markdown кавычек). Отвечай на языке: ${lang === 'tj' ? 'Таджикский' : lang === 'ru' ? 'Русский' : 'Английский'}.` });
                let htmlContent = response.text.replace(/```html/g, '').replace(/```/g, '').trim();
                container.contentEditable = true;
                container.innerHTML = `<div class="p-4 rounded border" style="background: var(--surface-color); border-color: var(--surface-border);">${htmlContent}</div>`;
            } else {
                container.contentEditable = true;
                container.innerHTML = `<p class="text-red-500">${dict.ai_not_init}</p>`;
            }
        } catch (error) {
            console.error(error);
            container.contentEditable = true;
            container.innerHTML = `<p class="text-red-500">${dict.gen_error}</p>`;
        }
    }

    add3DModel() {
        const contentArea = document.querySelector('.editable-area');
        if (!contentArea) return;
        const lang = document.getElementById('settings-language').value || 'ru';
        const dict = i18n[lang];

        const block = document.createElement('div');
        block.className = 'notion-block';
        block.contentEditable = false;
        block.innerHTML = `
            <div class="block-content" contenteditable="false">
                <div class="p-2 bg-gray-50 rounded border border-gray-200">
                    <p class="text-xs text-secondary mb-2">${dict.model_3d_label}</p>
                    <model-viewer 
                        src="https://modelviewer.dev/shared-assets/models/Astronaut.glb" 
                        alt="A 3D model" 
                        auto-rotate 
                        camera-controls 
                        style="width: 100%; height: 300px; background-color: #f0f0f0; border-radius: 8px;">
                    </model-viewer>
                </div>
            </div>
        `;
        contentArea.appendChild(block);
    }

    async generateFlashcards() {
        const contentArea = document.querySelector('.editable-area');
        const text = contentArea ? contentArea.innerText : '';
        const lang = document.getElementById('settings-language').value || 'ru';
        const dict = i18n[lang];
        
        if (text.length < 50) {
            alert(dict.write_more);
            return;
        }

        // Show modal
        const modal = document.createElement('div');
        modal.className = 'fullscreen-modal';
        modal.style.zIndex = '200';
        modal.innerHTML = `
            <div class="pdf-toolbar">
                <button class="btn-icon" onclick="this.closest('.fullscreen-modal').remove()"><i data-lucide="x"></i></button>
                <h3>${dict.ai_flashcards}</h3>
            </div>
            <div class="pdf-content flex-col items-center" id="flashcard-view-area">
                <div class="flex items-center gap-2 text-purple-600"><i data-lucide="loader" class="animate-spin"></i> ${dict.gen_flashcards}</div>
            </div>
        `;
        document.body.appendChild(modal);
        safeLucide();

        try {
            if (window.tutor && window.tutor.session) {
                const prompt = `Проанализируй следующие учебные заметки и создай 5 флеш-карточек (Вопрос и Ответ) в формате JSON. 
                Выведи ТОЛЬКО валидный JSON массив, например: [{"q": "Вопрос?", "a": "Ответ"}]. 
                Язык: ${lang === 'tj' ? 'Таджикский' : lang === 'ru' ? 'Русский' : 'Английский'}.
                Заметки: ${text.substring(0, 2000)}`;
                
                const response = await window.tutor.session.sendMessage({ message: prompt });
                let jsonStr = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
                const cards = JSON.parse(jsonStr);
                
                this.renderFlashcards(cards);
            } else {
                document.getElementById('flashcard-view-area').innerHTML = `<p class="text-red-500">${dict.ai_not_init}</p>`;
            }
        } catch (e) {
            console.error(e);
            document.getElementById('flashcard-view-area').innerHTML = `<p class="text-red-500">${dict.flashcards_error}</p>`;
        }
    }

    renderFlashcards(cards) {
        const container = document.getElementById('flashcard-view-area');
        let currentIndex = 0;
        const lang = document.getElementById('settings-language').value || 'ru';
        const dict = i18n[lang];

        const renderCard = () => {
            const card = cards[currentIndex];
            container.innerHTML = `
                <div class="flashcard-container" onclick="this.classList.toggle('flipped')">
                    <div class="flashcard-inner">
                        <div class="flashcard-front">
                            <div>
                                <div class="text-sm text-secondary mb-4">${dict.question} ${currentIndex + 1}/${cards.length}</div>
                                ${card.q}
                            </div>
                        </div>
                        <div class="flashcard-back">
                            <div>
                                <div class="text-sm text-white/80 mb-4">${dict.answer}</div>
                                ${card.a}
                            </div>
                        </div>
                    </div>
                </div>
                <div class="flex gap-4 mt-8">
                    <button class="btn-outline" onclick="window.prevCard()">${dict.back}</button>
                    <button class="btn-primary" onclick="window.nextCard()">${dict.next}</button>
                </div>
            `;
        };

        window.nextCard = () => {
            if (currentIndex < cards.length - 1) {
                currentIndex++;
                renderCard();
            }
        };

        window.prevCard = () => {
            if (currentIndex > 0) {
                currentIndex--;
                renderCard();
            }
        };

        renderCard();
    }
}
