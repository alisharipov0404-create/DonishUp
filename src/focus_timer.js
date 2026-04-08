import { i18n } from './i18n.js';

export class FocusTimer {
    constructor() {
        this.timeLeft = 25 * 60; // 25 minutes in seconds
        this.timerId = null;
        this.isRunning = false;
        this.mode = 'focus'; // 'focus', 'shortBreak', 'longBreak'
        this.audio = null;
        this.currentSound = null;
        
        this.sounds = {
            rain: 'https://actions.google.com/sounds/v1/weather/rain_heavy_loud.ogg',
            forest: 'https://actions.google.com/sounds/v1/nature/forest_morning.ogg',
            cafe: 'https://actions.google.com/sounds/v1/ambiences/coffee_shop.ogg'
        };

        this.initUI();
    }

    initUI() {
        const lang = document.getElementById('settings-language')?.value || 'ru';
        const dict = i18n[lang];

        // Create the floating widget
        const widget = document.createElement('div');
        widget.id = 'focus-timer-widget';
        widget.className = 'fixed bottom-24 right-6 z-40 hidden flex-col items-center rounded-2xl shadow-2xl p-6 border w-80 transition-all duration-300 transform scale-95 opacity-0';
        widget.style.background = 'var(--surface-color)';
        widget.style.borderColor = 'var(--surface-border)';
        widget.innerHTML = `
            <div class="flex justify-between items-center w-full mb-4">
                <h3 class="font-bold text-lg text-gray-800 flex items-center gap-2" data-i18n="focus_zone">
                    <i data-lucide="timer" class="text-donishup-blue"></i> ${dict.focus_zone || 'Focus Zone'}
                </h3>
                <button id="close-focus-btn" class="text-gray-400 hover:text-gray-600"><i data-lucide="x"></i></button>
            </div>
            
            <div class="flex gap-2 mb-6 p-1 rounded-lg w-full" style="background: var(--bg-main);">
                <button class="flex-1 py-1 text-xs font-medium rounded-md shadow-sm transition-all" style="background: var(--surface-color); color: var(--accent-teal);" data-mode="focus" data-i18n="focus">${dict.focus || 'Focus'}</button>
                <button class="flex-1 py-1 text-xs font-medium rounded-md transition-all" style="color: var(--text-secondary);" data-mode="shortBreak" data-i18n="short_break">${dict.short_break || 'Short'}</button>
                <button class="flex-1 py-1 text-xs font-medium rounded-md transition-all" style="color: var(--text-secondary);" data-mode="longBreak" data-i18n="long_break">${dict.long_break || 'Long'}</button>
            </div>

            <div class="relative w-48 h-48 flex items-center justify-center mb-6">
                <svg class="w-full h-full transform -rotate-90">
                    <circle cx="96" cy="96" r="88" stroke="#e2e8f0" stroke-width="8" fill="none"></circle>
                    <circle id="timer-progress" cx="96" cy="96" r="88" stroke="#6366f1" stroke-width="8" fill="none" stroke-dasharray="553" stroke-dashoffset="0" stroke-linecap="round" class="transition-all duration-1000 ease-linear"></circle>
                </svg>
                <div class="absolute text-4xl font-bold text-gray-800 font-mono" id="timer-display">25:00</div>
            </div>

            <div class="flex gap-4 mb-6">
                <button id="toggle-timer-btn" class="w-14 h-14 rounded-full bg-donishup-blue text-white flex items-center justify-center hover:bg-donishup-blue shadow-lg transition-transform active:scale-95">
                    <i data-lucide="play" class="w-6 h-6 fill-current"></i>
                </button>
                <button id="reset-timer-btn" class="w-14 h-14 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center hover:bg-gray-200 transition-transform active:scale-95">
                    <i data-lucide="rotate-ccw" class="w-6 h-6"></i>
                </button>
            </div>

            <div class="w-full">
                <p class="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider" data-i18n="ambience">${dict.ambience || 'Ambience'}</p>
                <div class="flex justify-between gap-2">
                    <button class="sound-btn flex-1 py-2 rounded-xl border border-gray-200 hover:border-donishup-blue hover:bg-donishup-blue/5 flex flex-col items-center gap-1 transition-all" data-sound="rain">
                        <i data-lucide="cloud-rain" class="w-4 h-4 text-donishup-blue"></i>
                        <span class="text-[10px] font-medium text-gray-600" data-i18n="rain">${dict.rain || 'Rain'}</span>
                    </button>
                    <button class="sound-btn flex-1 py-2 rounded-xl border border-gray-200 hover:border-donishup-blue hover:bg-donishup-blue/5 flex flex-col items-center gap-1 transition-all" data-sound="forest">
                        <i data-lucide="trees" class="w-4 h-4 text-green-500"></i>
                        <span class="text-[10px] font-medium text-gray-600" data-i18n="forest">${dict.forest || 'Forest'}</span>
                    </button>
                    <button class="sound-btn flex-1 py-2 rounded-xl border border-gray-200 hover:border-donishup-blue hover:bg-donishup-blue/5 flex flex-col items-center gap-1 transition-all" data-sound="cafe">
                        <i data-lucide="coffee" class="w-4 h-4 text-amber-600"></i>
                        <span class="text-[10px] font-medium text-gray-600" data-i18n="cafe">${dict.cafe || 'Cafe'}</span>
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(widget);

        // Add Toggle Button to UI (Sidebar or Floating)
        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'focus-toggle-btn';
        toggleBtn.className = 'fixed bottom-24 right-6 z-30 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 border';
        toggleBtn.style.background = 'var(--surface-color)';
        toggleBtn.style.color = 'var(--text-secondary)';
        toggleBtn.style.borderColor = 'var(--surface-border)';
        toggleBtn.innerHTML = '<i data-lucide="timer" class="w-6 h-6"></i>';
        toggleBtn.onclick = () => this.toggleWidget();
        document.body.appendChild(toggleBtn);

        this.bindEvents();
        safeLucide();
    }

    bindEvents() {
        const widget = document.getElementById('focus-timer-widget');
        
        document.getElementById('close-focus-btn').onclick = () => this.toggleWidget();
        
        document.getElementById('toggle-timer-btn').onclick = () => this.toggleTimer();
        document.getElementById('reset-timer-btn').onclick = () => this.resetTimer();

        widget.querySelectorAll('[data-mode]').forEach(btn => {
            btn.onclick = (e) => this.setMode(e.currentTarget.dataset.mode);
        });

        widget.querySelectorAll('[data-sound]').forEach(btn => {
            btn.onclick = (e) => this.toggleSound(e.currentTarget.dataset.sound);
        });
    }

    toggleWidget() {
        const widget = document.getElementById('focus-timer-widget');
        const btn = document.getElementById('focus-toggle-btn');
        
        if (widget.classList.contains('hidden')) {
            widget.classList.remove('hidden');
            // Small delay to allow display:block to apply before opacity transition
            setTimeout(() => {
                widget.classList.remove('scale-95', 'opacity-0');
                widget.classList.add('scale-100', 'opacity-100');
            }, 10);
            btn.classList.add('hidden');
        } else {
            widget.classList.remove('scale-100', 'opacity-100');
            widget.classList.add('scale-95', 'opacity-0');
            setTimeout(() => {
                widget.classList.add('hidden');
            }, 300);
            btn.classList.remove('hidden');
        }
    }

    setMode(mode) {
        this.mode = mode;
        this.stopTimer();
        
        // Update UI tabs
        const widget = document.getElementById('focus-timer-widget');
        widget.querySelectorAll('[data-mode]').forEach(btn => {
            if (btn.dataset.mode === mode) {
                btn.className = 'flex-1 py-1 text-xs font-medium rounded-md shadow-sm transition-all';
                btn.style.background = 'var(--surface-color)';
                btn.style.color = 'var(--accent-teal)';
            } else {
                btn.className = 'flex-1 py-1 text-xs font-medium rounded-md transition-all';
                btn.style.background = 'transparent';
                btn.style.color = 'var(--text-secondary)';
            }
        });

        // Set time
        if (mode === 'focus') this.timeLeft = 25 * 60;
        else if (mode === 'shortBreak') this.timeLeft = 5 * 60;
        else if (mode === 'longBreak') this.timeLeft = 15 * 60;

        this.updateDisplay();
    }

    toggleTimer() {
        if (this.isRunning) {
            this.stopTimer();
        } else {
            this.startTimer();
        }
    }

    startTimer() {
        if (this.isRunning) return;
        this.isRunning = true;
        
        const btn = document.getElementById('toggle-timer-btn');
        btn.innerHTML = '<i data-lucide="pause" class="w-6 h-6 fill-current"></i>';
        safeLucide();

        this.timerId = setInterval(() => {
            this.timeLeft--;
            this.updateDisplay();
            if (this.timeLeft <= 0) {
                this.completeTimer();
            }
        }, 1000);
    }

    stopTimer() {
        this.isRunning = false;
        clearInterval(this.timerId);
        const btn = document.getElementById('toggle-timer-btn');
        btn.innerHTML = '<i data-lucide="play" class="w-6 h-6 fill-current"></i>';
        safeLucide();
    }

    resetTimer() {
        this.stopTimer();
        this.setMode(this.mode); // Resets time based on current mode
    }

    completeTimer() {
        this.stopTimer();
        const lang = document.getElementById('settings-language')?.value || 'ru';
        const dict = i18n[lang];
        // Play a notification sound or show alert
        alert(dict.time_up || "Time's up!");
        if (this.mode === 'focus') this.setMode('shortBreak');
        else this.setMode('focus');
    }

    updateDisplay() {
        const minutes = Math.floor(this.timeLeft / 60);
        const seconds = this.timeLeft % 60;
        const display = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        document.getElementById('timer-display').textContent = display;

        // Update circle progress
        const totalTime = this.mode === 'focus' ? 25 * 60 : (this.mode === 'shortBreak' ? 5 * 60 : 15 * 60);
        const progress = ((totalTime - this.timeLeft) / totalTime) * 553;
        document.getElementById('timer-progress').style.strokeDashoffset = progress;
    }

    toggleSound(soundName) {
        const btn = document.querySelector(`[data-sound="${soundName}"]`);
        const lang = document.getElementById('settings-language')?.value || 'ru';
        const dict = i18n[lang];
        
        if (this.currentSound === soundName) {
            // Stop playing
            if (this.audio) {
                this.audio.pause();
                this.audio = null;
            }
            this.currentSound = null;
            
            // Reset UI
            document.querySelectorAll('.sound-btn').forEach(b => {
                b.classList.remove('bg-donishup-blue/10', 'border-donishup-blue');
                b.classList.add('border-gray-200');
            });
        } else {
            // Stop previous if any
            if (this.audio) {
                this.audio.pause();
                this.audio = null;
            }

            // Start new
            this.currentSound = soundName;
            this.audio = new Audio(this.sounds[soundName]);
            this.audio.loop = true;
            this.audio.play().catch(e => {
                console.error("Audio play failed", e);
                alert(dict.audio_play_error || "Could not play sound. Please check your internet connection or try a different browser.");
                // Revert UI state
                this.currentSound = null;
                btn.classList.remove('bg-donishup-blue/10', 'border-donishup-blue');
                btn.classList.add('border-gray-200');
            });

            // Update UI
            document.querySelectorAll('.sound-btn').forEach(b => {
                b.classList.remove('bg-donishup-blue/10', 'border-donishup-blue');
                b.classList.add('border-gray-200');
            });
            btn.classList.remove('border-gray-200');
            btn.classList.add('bg-donishup-blue/10', 'border-donishup-blue');
        }
    }
}
