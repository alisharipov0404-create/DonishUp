import { i18n } from './i18n.js';
import { translateArray } from './translator.js';

/**
 * Habit Tracker Manager
 * Inspired by Notion's Habit Tracker
 */
export class HabitManager {
    constructor() {
        this.currentDate = new Date();
        this.translatedHabits = [];
        this.habits = [];
        
        window.addEventListener('user-logout', () => {
            this.habits = [];
            this.translatedHabits = [];
        });
    }

    getStorageKey() {
        const user = JSON.parse(sessionStorage.getItem('donishup_session_v2'));
        const userId = user ? user.id : 'guest';
        return `habits_${userId}`;
    }

    load() {
        const key = this.getStorageKey();
        const stored = localStorage.getItem(key);
        if (stored) {
            this.habits = JSON.parse(stored);
        } else {
            this.habits = [
                { name: "Зарядка", completions: {} },
                { name: "Чтение", completions: {} },
                { name: "Учеба", completions: {} }
            ];
        }
    }

    save() {
        const key = this.getStorageKey();
        localStorage.setItem(key, JSON.stringify(this.habits));
    }

    async init() {
        this.load();
        await this.translateHabits();
        this.renderHeader();
        this.renderHabits();
        this.updateStats();
        this.setupEventListeners();
    }

    async translateHabits() {
        const lang = document.getElementById('settings-language')?.value || 'ru';
        this.translatedHabits = await translateArray(this.habits, ['name'], lang);
    }

    setupEventListeners() {
        // Modal events are handled via global window.habitManager
    }

    renderHeader() {
        const headerRow = document.getElementById('habit-table-header');
        if (!headerRow) return;

        const lang = document.getElementById('settings-language')?.value || 'ru';
        const dict = i18n[lang];

        let headerHTML = `
            <th class="text-left p-4 font-semibold text-secondary uppercase text-[10px] tracking-wider border-b border-surface-border" data-i18n="date">${dict.date || 'Date'}</th>
            <th class="text-left p-4 font-semibold text-secondary uppercase text-[10px] tracking-wider border-b border-surface-border" data-i18n="progress">${dict.progress || 'Progress'}</th>
        `;
        
        const displayHabits = this.translatedHabits.length > 0 ? this.translatedHabits : this.habits;

        displayHabits.forEach((habit, index) => {
            headerHTML += `
                <th class="p-4 font-semibold text-secondary uppercase text-[10px] tracking-wider border-b border-surface-border group relative">
                    <div class="flex items-center justify-center gap-2">
                        <span>${habit.name}</span>
                        <button class="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-600" onclick="window.habitManager.deleteHabit(${index})">
                            <i data-lucide="x" class="w-3 h-3"></i>
                        </button>
                    </div>
                </th>`;
        });
        
        headerHTML += `
            <th class="text-left p-4 font-semibold text-secondary uppercase text-[10px] tracking-wider border-b border-surface-border" data-i18n="daily_status">${dict.daily_status || 'Daily Status'}</th>
            <th class="text-left p-4 font-semibold text-secondary uppercase text-[10px] tracking-wider border-b border-surface-border" data-i18n="status">${dict.status || 'Status'}</th>
            <th class="text-left p-4 font-semibold text-secondary uppercase text-[10px] tracking-wider border-b border-surface-border" data-i18n="month">${dict.month || 'Month'}</th>
        `;
        
        headerRow.innerHTML = headerHTML;
        if (window.safeLucide) window.safeLucide();
    }

    renderHabits() {
        const tableBody = document.getElementById('habit-table-body');
        if (!tableBody) return;

        tableBody.innerHTML = '';

        const lang = document.getElementById('settings-language')?.value || 'ru';
        const dict = i18n[lang];
        const daysInMonth = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 0).getDate();
        
        for (let i = 1; i <= daysInMonth; i++) {
            const date = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), i);
            const dateKey = `${this.currentDate.getFullYear()}-${this.currentDate.getMonth() + 1}-${i}`;
            
            const tr = document.createElement('tr');
            tr.className = 'habit-row hover:bg-gray-50/50 transition-colors';

            // Date Column
            const dateTd = document.createElement('td');
            dateTd.className = 'p-4 text-sm border-b border-surface-border';
            dateTd.innerText = date.toLocaleDateString(lang, { month: 'short', day: 'numeric' });
            tr.appendChild(dateTd);

            // Calculate daily progress
            let completedCount = 0;
            this.habits.forEach(h => {
                if (h.completions && h.completions[dateKey]) completedCount++;
            });
            const progressPercent = this.habits.length > 0 ? Math.round((completedCount / this.habits.length) * 100) : 0;

            // Progress Bar Column
            const progressTd = document.createElement('td');
            progressTd.className = 'p-4 border-b border-surface-border';
            progressTd.innerHTML = `
                <div class="flex items-center gap-2">
                    <div class="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div class="h-full bg-teal-500 transition-all duration-500" style="width: ${progressPercent}%"></div>
                    </div>
                    <span class="text-[10px] font-mono text-secondary">${progressPercent}%</span>
                </div>
            `;
            tr.appendChild(progressTd);

            // Habit Columns
            this.habits.forEach((habit, index) => {
                const isChecked = habit.completions && habit.completions[dateKey];
                const td = document.createElement('td');
                td.className = 'p-4 text-center border-b border-surface-border cursor-pointer';
                td.onclick = () => this.toggleHabit(index, dateKey);
                
                td.innerHTML = `
                    <div class="flex justify-center">
                        <div class="habit-checkbox ${isChecked ? 'checked' : ''} w-5 h-5">
                            <i data-lucide="check" class="w-3 h-3"></i>
                        </div>
                    </div>
                `;
                tr.appendChild(td);
            });

            // Daily Status
            const dailyStatusTd = document.createElement('td');
            dailyStatusTd.className = 'p-4 text-xs border-b border-surface-border text-secondary';
            dailyStatusTd.innerText = `${completedCount}/${this.habits.length}`;
            tr.appendChild(dailyStatusTd);

            // Status
            const statusTd = document.createElement('td');
            statusTd.className = 'p-4 border-b border-surface-border';
            let statusLabel = '';
            let statusColor = '';
            if (progressPercent === 100) {
                statusLabel = dict.status_completed || 'Perfect';
                statusColor = 'bg-teal-100 text-teal-700';
            } else if (progressPercent > 0) {
                statusLabel = dict.in_progress || 'Doing';
                statusColor = 'bg-blue-100 text-blue-700';
            } else {
                statusLabel = dict.todo || 'Pending';
                statusColor = 'bg-gray-100 text-gray-500';
            }
            statusTd.innerHTML = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusColor}">${statusLabel}</span>`;
            tr.appendChild(statusTd);

            // Month
            const monthTd = document.createElement('td');
            monthTd.className = 'p-4 text-xs border-b border-surface-border text-secondary italic';
            monthTd.innerText = date.toLocaleDateString(lang, { month: 'long' });
            tr.appendChild(monthTd);

            tableBody.appendChild(tr);
        }
        
        if (window.safeLucide) window.safeLucide();
    }

    async toggleHabit(habitIndex, dateKey) {
        const habit = this.habits[habitIndex];
        if (!habit.completions) habit.completions = {};
        
        habit.completions[dateKey] = !habit.completions[dateKey];
        this.save();
        this.renderHabits();
        this.updateStats();
        await this.renderDashboardWidget();
    }

    async addHabit(name) {
        if (!name) return;
        this.habits.push({
            name: name,
            completions: {},
            createdAt: new Date().toISOString()
        });
        this.save();
        await this.translateHabits();
        this.renderHeader();
        this.renderHabits();
        this.updateStats();
        await this.renderDashboardWidget();
        this.closeAddModal();
    }

    async deleteHabit(index) {
        const lang = document.getElementById('settings-language')?.value || 'ru';
        const dict = i18n[lang];
        const confirmed = await window.showConfirm(dict.delete_habit_confirm || 'Are you sure you want to delete this habit?');
        if (confirmed) {
            this.habits.splice(index, 1);
            this.save();
            await this.translateHabits();
            this.renderHeader();
            this.renderHabits();
            this.updateStats();
            await this.renderDashboardWidget();
        }
    }

    async clearAll() {
        const lang = document.getElementById('settings-language')?.value || 'ru';
        const dict = i18n[lang];
        const confirmed = await window.showConfirm(dict.clear_all_confirm || 'Are you sure you want to clear all habits?');
        if (confirmed) {
            this.habits = [];
            this.save();
            await this.translateHabits();
            this.renderHeader();
            this.renderHabits();
            this.updateStats();
            await this.renderDashboardWidget();
        }
    }

    // Removed old save method

    updateStats() {
        const today = new Date();
        const dateKey = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
        
        let completedToday = 0;
        this.habits.forEach(habit => {
            if (habit.completions && habit.completions[dateKey]) {
                completedToday++;
            }
        });

        // Update Today's Stats
        const statsText = document.getElementById('habit-total-stats');
        if (statsText) {
            statsText.innerText = `${completedToday}/${this.habits.length} Habits Today`;
        }
        
        const dashCounter = document.getElementById('dash-habit-counter');
        if (dashCounter) {
            dashCounter.innerText = `${completedToday}/${this.habits.length}`;
        }

        // Update Progress Bar (Top and Bottom)
        const progressBarTop = document.getElementById('habit-total-progress-bar');
        const progressTextTop = document.getElementById('habit-total-progress-text');
        const progressBarBottom = document.getElementById('habit-total-progress-bar-bottom');
        const progressTextBottom = document.getElementById('habit-total-progress-text-bottom');
        
        if (this.habits.length > 0) {
            const percent = Math.round((completedToday / this.habits.length) * 100);
            if (progressBarTop) progressBarTop.style.width = `${percent}%`;
            if (progressTextTop) progressTextTop.innerHTML = `${percent}&#37; Completed`;
            if (progressBarBottom) progressBarBottom.style.width = `${percent}%`;
            if (progressTextBottom) progressTextBottom.innerHTML = `${percent}&#37; Completed`;
        } else {
            if (progressBarTop) progressBarTop.style.width = `0%`;
            if (progressTextTop) progressTextTop.innerHTML = `0&#37; Completed`;
            if (progressBarBottom) progressBarBottom.style.width = `0%`;
            if (progressTextBottom) progressTextBottom.innerHTML = `0&#37; Completed`;
        }

        // Calculate Streaks
        this.calculateStreaks();
    }

    calculateStreaks() {
        let currentStreak = 0;
        let bestStreak = 0;

        // Simplified streak calculation: count consecutive days where AT LEAST ONE habit was completed
        // A more advanced one would be per-habit, but for the dashboard we show overall consistency
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Check current streak (backwards from today)
        let checkDate = new Date(today);
        while (true) {
            const key = `${checkDate.getFullYear()}-${checkDate.getMonth() + 1}-${checkDate.getDate()}`;
            const anyCompleted = this.habits.some(h => h.completions && h.completions[key]);
            
            if (anyCompleted) {
                currentStreak++;
                checkDate.setDate(checkDate.getDate() - 1);
            } else {
                // If it's today and nothing done yet, don't break the streak from yesterday
                if (checkDate.getTime() === today.getTime()) {
                    checkDate.setDate(checkDate.getDate() - 1);
                    continue;
                }
                break;
            }
        }

        // Best streak calculation (very simplified for now)
        const streakKey = `habit_best_streak_${this.getStorageKey()}`;
        bestStreak = Math.max(currentStreak, parseInt(localStorage.getItem(streakKey) || 0));
        localStorage.setItem(streakKey, bestStreak);

        const streakEl = document.getElementById('habit-streak-count');
        const bestStreakEl = document.getElementById('habit-best-streak');
        
        if (streakEl) window.animateCounter('habit-streak-count', currentStreak);
        if (bestStreakEl) window.animateCounter('habit-best-streak', bestStreak);
    }

    async renderDashboardWidget() {
        this.load();
        await this.translateHabits();
        const container = document.getElementById('dash-habits-content');
        if (!container) return;

        if (this.habits.length === 0) {
            container.innerHTML = `<p class="text-sm text-secondary opacity-50 p-2" data-i18n="no_habits">No habits added yet.</p>`;
            return;
        }

        const today = new Date();
        const dateKey = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;

        const displayHabits = this.translatedHabits && this.translatedHabits.length > 0 ? this.translatedHabits : this.habits;

        container.innerHTML = displayHabits.map((habit, index) => {
            const isChecked = habit.completions && habit.completions[dateKey];
            return `
                <div class="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer" onclick="window.habitManager.toggleHabit(${index}, '${dateKey}')">
                    <div class="flex items-center gap-3">
                        <div class="habit-checkbox ${isChecked ? 'checked' : ''} scale-90">
                            <i data-lucide="check"></i>
                        </div>
                        <span class="text-sm ${isChecked ? 'line-through opacity-50' : ''}">${habit.name}</span>
                    </div>
                </div>
            `;
        }).join('');

        if (window.safeLucide) window.safeLucide();
    }

    openAddModal() {
        const modal = document.createElement('div');
        modal.id = 'habit-modal';
        modal.className = 'modal-overlay active';
        modal.innerHTML = `
            <div class="modal-content">
                <h2 class="text-xl font-bold mb-4" data-i18n="add_habit">Add New Habit</h2>
                <input type="text" id="new-habit-name" class="input-field w-full mb-4" placeholder="Habit name (e.g. Exercise)" data-i18n-placeholder="habit_name_placeholder">
                <div class="flex justify-end gap-2">
                    <button class="btn-secondary" onclick="window.habitManager.closeAddModal()" data-i18n="cancel">Cancel</button>
                    <button class="btn-primary" onclick="window.habitManager.confirmAdd()" data-i18n="add">Add</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        if (window.i18n) window.i18n.updatePage();
        document.getElementById('new-habit-name').focus();
    }

    closeAddModal() {
        const modal = document.getElementById('habit-modal');
        if (modal) modal.remove();
    }

    confirmAdd() {
        const input = document.getElementById('new-habit-name');
        if (input && input.value.trim()) {
            this.addHabit(input.value.trim());
        }
    }
}
