import './styles.css';
import { i18n } from './i18n.js';
import { translateArray } from './translator.js';
import { AuthManager } from './auth.js';
import { NotebookManager } from './notebooks.js';
import { LiveManager } from './live.js';
import { ChatManager } from './chat.js';
import { TutorManager } from './tutor.js';
import { AdminManager } from './admin.js';
import { GamificationManager } from './gamification.js';
import { VoiceAssistant } from './voice_assistant.js';
import { ImageUtils } from './image_utils.js';
import { FocusTimer } from './focus_timer.js';
import { LabManager } from './lab.js';
import { HabitManager } from './habits.js';
import { io } from 'socket.io-client';

const apiCache = new Map();
window.apiCache = apiCache; // Expose for debugging and other modules

window.showToast = function(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `fixed bottom-4 right-4 px-6 py-3 rounded-lg text-white shadow-lg z-50 transform transition-all duration-300 translate-y-10 opacity-0 flex items-center gap-3`;
    
    if (type === 'error') {
        toast.classList.add('bg-red-500');
        toast.innerHTML = `<i data-lucide="alert-circle" class="w-5 h-5"></i><span>${message}</span>`;
    } else if (type === 'success') {
        toast.classList.add('bg-green-500');
        toast.innerHTML = `<i data-lucide="check-circle" class="w-5 h-5"></i><span>${message}</span>`;
    } else {
        toast.classList.add('bg-blue-500');
        toast.innerHTML = `<i data-lucide="info" class="w-5 h-5"></i><span>${message}</span>`;
    }
    
    document.body.appendChild(toast);
    if (window.lucide) window.lucide.createIcons({ root: toast });
    
    // Animate in
    setTimeout(() => {
        toast.classList.remove('translate-y-10', 'opacity-0');
    }, 10);
    
    // Animate out
    setTimeout(() => {
        toast.classList.add('translate-y-10', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

window.animateCounter = (elementId, targetValue, duration = 1000) => {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const startValue = parseInt(element.textContent) || 0;
    const endValue = parseInt(targetValue) || 0;
    if (startValue === endValue) {
        element.textContent = targetValue;
        return;
    }
    
    const startTime = performance.now();
    
    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Easing function (easeOutQuad)
        const easeProgress = progress * (2 - progress);
        
        const currentValue = Math.round(startValue + (endValue - startValue) * easeProgress);
        element.textContent = currentValue;
        
        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            element.textContent = targetValue;
        }
    }
    
    requestAnimationFrame(update);
};

// Override default alert to use our custom toast
window.alert = function(message) {
    window.showToast(message, 'info');
};

window.showConfirm = function(message) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm';
        
        const modal = document.createElement('div');
        modal.className = 'bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 max-w-sm w-full mx-4 transform transition-all scale-95 opacity-0';
        
        modal.innerHTML = `
            <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-4">${message}</h3>
            <div class="flex justify-end gap-3">
                <button id="confirm-cancel" class="px-4 py-2 rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors">Cancel</button>
                <button id="confirm-ok" class="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors">OK</button>
            </div>
        `;
        
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        // Animate in
        setTimeout(() => {
            modal.classList.remove('scale-95', 'opacity-0');
            modal.classList.add('scale-100', 'opacity-100');
        }, 10);
        
        const cleanup = () => {
            modal.classList.remove('scale-100', 'opacity-100');
            modal.classList.add('scale-95', 'opacity-0');
            setTimeout(() => overlay.remove(), 200);
        };
        
        overlay.querySelector('#confirm-cancel').addEventListener('click', () => {
            cleanup();
            resolve(false);
        });
        
        overlay.querySelector('#confirm-ok').addEventListener('click', () => {
            cleanup();
            resolve(true);
        });
    });
};

async function fetchWithCache(url, options = {}, retries = 2) {
    const cacheKey = url + JSON.stringify(options);
    
    // Invalidate cache for mutations
    if (options.method && options.method !== 'GET') {
        apiCache.clear();
    }

    // Return cached data immediately if available and it's a GET request
    if (apiCache.has(cacheKey) && (!options.method || options.method === 'GET')) {
        const cached = apiCache.get(cacheKey);
        // Invalidate cache after 5 minutes
        if (Date.now() - cached.timestamp < 5 * 60 * 1000) {
            return cached.data;
        }
    }

    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status}, body: ${errorText.substring(0, 100)}`);
        }
        const data = await response.json();
        
        // Cache the result for GET requests
        if (!options.method || options.method === 'GET') {
            apiCache.set(cacheKey, {
                data: data,
                timestamp: Date.now()
            });
        }
        
        return data;
    } catch (e) {
        if (retries > 0) {
            console.warn(`Fetch failed for ${url}, retrying... (${retries} retries left)`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            return fetchWithCache(url, options, retries - 1);
        }
        console.error(`Fetch failed for ${url}:`, e);
        throw e;
    }
}
window.fetchWithCache = fetchWithCache;

function invalidateCache(urlPrefix) {
    for (const key of apiCache.keys()) {
        if (key.startsWith(urlPrefix)) {
            apiCache.delete(key);
        }
    }
}
window.invalidateCache = invalidateCache;

// Global Instances
export const socket = io();

socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
});
socket.on('connect_error', (err) => {
    console.error('Socket connection error:', err);
});
socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
});
export const auth = new AuthManager();
export const notebooks = new NotebookManager();
export const live = new LiveManager();
export const chat = new ChatManager();
export const tutor = new TutorManager();
export const admin = new AdminManager();
export const gamification = new GamificationManager(auth);
export const voiceAssistant = new VoiceAssistant();
export const focusTimer = new FocusTimer();
export const habitManager = new HabitManager();
export const labManager = new LabManager();

// Listen for XP updates to refresh leaderboard
window.addEventListener('xp-updated', (e) => {
    if (currentViewId === 'leaderboard') {
        gamification.loadLeaderboard();
    }
});

// Listen to Socket.io events for real-time updates
socket.on('grades-updated', (newGrade) => {
    const user = JSON.parse(sessionStorage.getItem('donishup_session_v2'));
    if (!user) return;
    
    // Always invalidate cache and refetch so data is fresh for everyone (teachers, admins, parents)
    invalidateCache('/api/grades');
    fetchWithCache('/api/grades').catch(e => console.error(e));
    
    // Show notification ONLY if it's the student or their parent
    let shouldNotify = false;
    if (user.role === 'Student' && newGrade.student_id === user.id) shouldNotify = true;
    if (user.role === 'Parent' && user.child_id === newGrade.student_id) shouldNotify = true;
    
    if (shouldNotify) {
        const lang = document.getElementById('settings-language')?.value || 'ru';
        const dict = i18n[lang] || i18n['ru'];
        const subjectName = window.allSubjects?.find(s => s.type === newGrade.subject)?.name || newGrade.subject;
        const msg = lang === 'ru' ? `Новая оценка по ${subjectName}: ${newGrade.value}` : `New grade for ${subjectName}: ${newGrade.value}`;
        window.showToast(msg, 'info');
    }
    
    // Refresh UI if on dashboard or grades view
    if (currentViewId === 'dashboard') {
        loadDashboard();
    } else if (currentViewId === 'grades') {
        loadGrades();
    }
});

socket.on('homework-updated', (newHomework) => {
    const user = JSON.parse(sessionStorage.getItem('donishup_session_v2'));
    if (!user) return;
    
    invalidateCache('/api/homework');
    fetchWithCache('/api/homework').catch(e => console.error(e));
    
    // Show notification
    let shouldNotify = false;
    if (user.role === 'Student' && (user.class_id === newHomework.class_id || user.id === newHomework.user_id)) shouldNotify = true;
    if (user.role === 'Parent' && user.child_id) {
        // We don't have child's class_id easily here, but we can check if it's specifically for the child
        if (user.child_id === newHomework.user_id) shouldNotify = true;
        // If it's for a class, we assume the parent might want to know if they are looking at it, 
        // but to avoid spamming, we might skip class-wide notifications for parents unless we fetch the child's class.
    }
    
    if (shouldNotify) {
        const lang = document.getElementById('settings-language')?.value || 'ru';
        const subjectName = window.allSubjects?.find(s => s.type === newHomework.subject)?.name || newHomework.subject;
        const msg = lang === 'ru' ? `Новое домашнее задание по ${subjectName}` : `New homework for ${subjectName}`;
        window.showToast(msg, 'info');
    }
    
    if (currentViewId === 'dashboard') {
        loadDashboard();
    } else if (currentViewId === 'homework') {
        loadHomework();
    }
});

socket.on('schedule-updated', () => {
    const user = JSON.parse(sessionStorage.getItem('donishup_session_v2'));
    if (!user) return;
    
    invalidateCache('/api/schedule');
    fetchWithCache('/api/schedule').catch(e => console.error(e));
    
    // Show notification (optional, maybe too noisy, but keeping it for now)
    const lang = document.getElementById('settings-language')?.value || 'ru';
    const msg = lang === 'ru' ? `Расписание было обновлено` : `Schedule has been updated`;
    // window.showToast(msg, 'info'); // Commented out to reduce noise
    
    if (currentViewId === 'dashboard') {
        loadDashboard();
    } else if (currentViewId === 'schedule') {
        loadSchedule();
    }
});

// Expose i18n and updateTranslations globally
window.i18n = i18n;
window.i18n.updatePage = updateTranslations;
window.updateTranslations = updateTranslations;

async function initPushNotifications(userId) {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            console.log('Service Worker registered');

            // Ask permission
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                console.log('Push notification permission denied');
                return;
            }

            const response = await fetch('/api/push/public-key');
            const { publicKey } = await response.json();

            const convertedVapidKey = urlBase64ToUint8Array(publicKey);

            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: convertedVapidKey
            });

            await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId, subscription })
            });
            console.log('Push notification subscribed successfully');
        } catch (error) {
            console.error('Error setting up push notifications:', error);
        }
    }
}

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

// Router Mock
window.appRouter = {
    navigate: (viewId) => {
        switchView(viewId);
    }
};

// Make gamification and voiceAssistant globally available for onclick handlers
window.gamification = gamification;
window.voiceAssistant = voiceAssistant;
window.focusTimer = focusTimer;
window.habitManager = habitManager;
window.labManager = labManager;
window.tutor = tutor;
window.switchView = switchView;
window.loadGrades = loadGrades;

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const mainScreen = document.getElementById('main-screen');
const navItems = document.querySelectorAll('.nav-item');
const views = document.querySelectorAll('.view');
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const sidebar = document.getElementById('sidebar');

// Global subject colors for timetable and other tabs
const subjectColors = {
    'tajik': 'bg-blue-100 text-blue-900',
    'russian': 'bg-red-100 text-red-900',
    'english': 'bg-green-100 text-green-900',
    'math': 'bg-blue-300 text-blue-900',
    'physics': 'bg-amber-200 text-amber-900',
    'chemistry': 'bg-emerald-200 text-emerald-900',
    'biology': 'bg-yellow-200 text-yellow-900',
    'geography': 'bg-cyan-300 text-cyan-900',
    'history': 'bg-red-300 text-red-900',
    'history_tj': 'bg-red-300 text-red-900',
    'history_world': 'bg-red-200 text-red-900',
    'social_studies': 'bg-purple-100 text-purple-900',
    'informatics': 'bg-orange-200 text-orange-900',
    'labor': 'bg-stone-200 text-stone-900',
    'pe': 'bg-orange-300 text-orange-900',
    'art': 'bg-purple-200 text-purple-900',
    'music': 'bg-purple-200 text-purple-900',
    'art_music': 'bg-purple-200 text-purple-900',
    'default': 'bg-gray-100 text-gray-800'
};

window.allSubjects = [];

// State
let currentLanguage = 'en';
let currentViewId = 'dashboard';

window.showMainApp = showMainApp;

window.quickLogin = async (username, password) => {
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (response.ok) {
            const data = await response.json();
            auth.currentUser = data.user;
            sessionStorage.setItem('donishup_session_v2', JSON.stringify(data.user));
            
            // Инициализируем Web Push Notifications
            initPushNotifications(data.user.id);
            
            showMainApp();
        } else {
            const lang = document.getElementById('settings-language')?.value || 'ru';
            const dict = i18n[lang];
            window.showToast(dict.user_not_found || 'User not found or invalid credentials', 'error');
        }
    } catch (e) {
        const lang = document.getElementById('settings-language')?.value || 'ru';
        const dict = i18n[lang];
        window.showToast((dict.error || 'Error: ') + e.message, 'error');
    }
};

async function init() {
    console.log("Initializing DonishUp App...");

    try {
        if (typeof lucide !== 'undefined') {
            safeLucide();
        } else {
            console.warn("Lucide not loaded");
        }
    } catch (e) {
        console.error("Lucide error:", e);
    }
    
    try {
        // Check Session
        const session = await auth.checkSession();
        if (session) {
            initPushNotifications(auth.currentUser.id);
            showMainApp();
        } else {
            if (loginScreen) loginScreen.classList.remove('hidden');
        }
    } catch (e) {
        console.error("Auth check error:", e);
    }

    try {
        // Set initial language in select
        const langSelect = document.getElementById('settings-language');
        if (langSelect) langSelect.value = currentLanguage;

        setupEventListeners();
        updateTranslations();
        labManager.init();

        // Global Search Listener
        const searchInput = document.getElementById('global-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase();
                if (query.length > 2) {
                    console.log("Searching for:", query);
                    // Simple mock search: highlight cards or show toast
                }
            });
        }

        // Real-time schedule sync
        socket.on('schedule-updated', () => {
            if (window.apiCache) window.apiCache.clear();
            if (currentViewId === 'schedule') {
                loadSchedule();
            }
            if (currentViewId === 'admin') {
                admin.loadTimetable();
            }
            if (currentViewId === 'dashboard') {
                loadDashboard();
            }
        });
    } catch (e) {
        console.error("Setup error:", e);
    }
}

function setupEventListeners() {
    // Mobile Menu
    mobileMenuBtn.addEventListener('click', () => {
        sidebar.classList.toggle('open');
    });

    // Navigation
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const viewId = item.getAttribute('data-view');
            switchView(viewId);
            if (window.innerWidth <= 768) sidebar.classList.remove('open');
        });
    });

    // Settings
    document.getElementById('settings-language').addEventListener('change', (e) => {
        currentLanguage = e.target.value;
        updateTranslations();
    });

    document.getElementById('settings-theme').addEventListener('change', (e) => {
        document.documentElement.setAttribute('data-theme', e.target.value);
    });

    // Textbooks
    window.openPdfViewer = (title, url) => {
        if (url) {
            // Trigger download for real files
            const a = document.createElement('a');
            a.href = url;
            a.download = title;
            a.target = '_blank';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            return;
        }
        
        document.getElementById('pdf-title').textContent = title;
        const viewer = document.getElementById('pdf-viewer');
        const contentContainer = viewer.querySelector('.pdf-content');
        
        contentContainer.style.padding = '2rem';
        contentContainer.style.overflowY = 'auto';
        contentContainer.style.display = 'flex';
        contentContainer.innerHTML = `
            <div class="pdf-page edu-content">
                <h2 class="edu-bold">${title}</h2>
                <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>
                <p class="edu-italic">Выделите текст, чтобы использовать маркеры.</p>
            </div>
        `;
        viewer.classList.remove('hidden');
    };
    window.closePdfViewer = () => {
        document.getElementById('pdf-viewer').classList.add('hidden');
    };
    window.toggleFullscreen = (id) => {
        const el = document.getElementById(id);
        if (!document.fullscreenElement) {
            el.requestFullscreen().catch(err => console.log(err));
        } else {
            document.exitFullscreen();
        }
    };

    // PDF Upload
    const pdfUpload = document.getElementById('pdf-upload-input');
    if (pdfUpload) {
        pdfUpload.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            const dict = i18n[currentLanguage];
            if (file && file.type === 'application/pdf') {
                const user = auth.currentUser;
                if (!user || (user.role !== 'Admin' && user.role !== 'Teacher')) {
                    window.showToast(dict.upload_forbidden || "Only Admins and Teachers can upload textbooks.", 'error');
                    return;
                }
                
                const formData = new FormData();
                formData.append('textbook', file);
                formData.append('user_id', user.id);
                
                try {
                    showLoading('textbooks-list');
                    const res = await fetch('/api/admin/upload', {
                        method: 'POST',
                        body: formData
                    });
                    const data = await res.json();
                    if (data.success) {
                        window.showToast(`${dict.pdf_uploaded_success || 'Uploaded successfully:'} "${file.name}"`, 'success');
                        loadTextbooks();
                    } else {
                        window.showToast(data.message || dict.upload_failed || "Upload failed", 'error');
                    }
                } catch (err) {
                    console.error("Upload error:", err);
                    window.showToast(dict.upload_failed || "Upload failed", 'error');
                } finally {
                    hideLoading('textbooks-list');
                    pdfUpload.value = ''; // Reset input
                }
            } else {
                window.showToast(dict.pdf_select_error || "Please select a valid PDF file.", 'error');
            }
        });
    }

    // Highlighter
    let currentHighlightColor = null;
    window.setActiveMarker = (color) => {
        const btn = document.querySelector(`.marker-btn[style*="${color}"]`);
        if (btn) {
            btn.click();
        }
    };
    document.querySelectorAll('.marker-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.marker-btn').forEach(b => b.classList.remove('active'));
            const color = e.target.dataset.color;
            if (currentHighlightColor === color) {
                currentHighlightColor = null;
            } else {
                currentHighlightColor = color;
                e.target.classList.add('active');
            }
        });
    });

    document.addEventListener('mouseup', () => {
        if (!currentHighlightColor) return;
        const selection = window.getSelection();
        if (!selection.rangeCount || selection.isCollapsed) return;

        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;
        
        if (container.nodeType === 3 ? container.parentNode.closest('.pdf-page, .nb-content') : container.closest('.pdf-page, .nb-content')) {
            const span = document.createElement('span');
            span.className = 'highlighted-text';
            span.style.backgroundColor = currentHighlightColor;
            try {
                range.surroundContents(span);
            } catch (e) {
                console.warn("Complex selection highlighting not fully supported in MVP.");
            }
            selection.removeAllRanges();
        }
    });
}

window.openProfileModal = () => {
    const user = auth.currentUser;
    if (!user) return;
    
    // Load existing data
    const profile = JSON.parse(localStorage.getItem(`profile_${user.id}`) || '{}');
    document.getElementById('profile-about-input').value = profile.about || '';
    
    document.getElementById('profile-modal').classList.remove('hidden');
};

window.saveProfile = async () => {
    const user = auth.currentUser;
    if (!user) return;
    
    const about = document.getElementById('profile-about-input').value;
    const avatarInput = document.getElementById('profile-avatar-input');
    
    const profile = { about };
    
    if (avatarInput.files && avatarInput.files[0]) {
        try {
            const compressedBlob = await ImageUtils.compress(avatarInput.files[0], {
                maxWidth: 400,
                maxHeight: 400,
                quality: 0.7
            });
            
            const reader = new FileReader();
            reader.onload = (e) => {
                profile.avatar = e.target.result;
                localStorage.setItem(`profile_${user.id}`, JSON.stringify(profile));
                updateProfileUI(profile);
                document.getElementById('profile-modal').classList.add('hidden');
            };
            reader.readAsDataURL(compressedBlob);
        } catch (e) {
            console.error("Failed to compress avatar", e);
        }
    } else {
        const existingProfile = JSON.parse(localStorage.getItem(`profile_${user.id}`) || '{}');
        profile.avatar = existingProfile.avatar;
        localStorage.setItem(`profile_${user.id}`, JSON.stringify(profile));
        updateProfileUI(profile);
        document.getElementById('profile-modal').classList.add('hidden');
    }
};

function updateProfileUI(profile) {
    const avatarEl = document.getElementById('user-avatar');
    if (profile.avatar) {
        avatarEl.style.backgroundImage = `url(${profile.avatar})`;
        avatarEl.style.backgroundSize = 'cover';
        avatarEl.textContent = '';
    } else {
        avatarEl.style.backgroundImage = 'none';
        const user = JSON.parse(sessionStorage.getItem('donishup_session_v2'));
        if (user) {
            avatarEl.textContent = user.name.charAt(0);
        }
    }
}

export async function showMainApp() {
    if (loginScreen) loginScreen.classList.add('hidden');
    if (mainScreen) mainScreen.classList.remove('hidden');
    
    const user = auth.currentUser;
    if (!user) return;

    // Join user-specific socket rooms for targeted notifications
    socket.emit('join-user', user);

    try {
        window.allSubjects = await window.fetchWithCache('/api/subjects');
    } catch (e) {
        console.error("Failed to fetch subjects:", e);
    }
    
    // Update Profile UI
    document.getElementById('user-name-display').textContent = user.name;
    document.getElementById('user-class-display').textContent = user.class_id || user.role;
    document.getElementById('user-avatar').textContent = user.name.charAt(0);
    
    // Load profile
    const profile = JSON.parse(localStorage.getItem(`profile_${user.id}`) || '{}');
    updateProfileUI(profile);
    
    // RBAC UI
    document.querySelectorAll('.school-only, .admin-only, .personal-only, .teacher-only, .student-only, .admin-teacher-only, .non-admin').forEach(el => el.classList.add('hidden'));
    
    document.body.classList.toggle('is-admin', user.role === 'Admin');

    if (user.role === 'Admin') {
        document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
        document.querySelectorAll('.admin-teacher-only').forEach(el => el.classList.remove('hidden'));
    } else if (user.role === 'Personal') {
        document.querySelectorAll('.personal-only').forEach(el => el.classList.remove('hidden'));
        document.querySelectorAll('.non-admin').forEach(el => el.classList.remove('hidden'));
    } else {
        document.querySelectorAll('.school-only').forEach(el => el.classList.remove('hidden'));
        document.querySelectorAll('.non-admin').forEach(el => el.classList.remove('hidden'));
        if (user.role === 'Teacher') {
            document.querySelectorAll('.teacher-only').forEach(el => el.classList.remove('hidden'));
            document.querySelectorAll('.admin-teacher-only').forEach(el => el.classList.remove('hidden'));
        }
        if (user.role === 'Student') document.querySelectorAll('.student-only').forEach(el => el.classList.remove('hidden'));
    }

    // Load initial view
    switchView('dashboard');
}

function switchView(viewId) {
    currentViewId = viewId;
    navItems.forEach(item => {
        if (item.getAttribute('data-view') === viewId) item.classList.add('active');
        else item.classList.remove('active');
    });

    views.forEach(view => {
        if (view.id === `view-${viewId}`) view.classList.remove('hidden');
        else view.classList.add('hidden');
    });

    // Load specific view data
    if (viewId === 'dashboard') loadDashboard();
    if (viewId === 'schedule') loadSchedule();
    if (viewId === 'grades') loadGrades();
    if (viewId === 'notebooks') notebooks.loadNotebooks();
    if (viewId === 'chat') chat.loadChat();
    if (viewId === 'tutor') tutor.init();
    if (viewId === 'knowledge') gamification.loadKnowledgeGraph();
    if (viewId === 'leaderboard') gamification.loadLeaderboard();
    if (viewId === 'achievements') gamification.loadAchievements();
    if (viewId === 'homework') loadHomework();
    if (viewId === 'habits') habitManager.init();
    if (viewId === 'quests') gamification.loadDailyQuests();
    if (viewId === 'textbooks') loadTextbooks();
    if (viewId === 'admin' && auth.currentUser && auth.currentUser.role === 'Admin') admin.loadAdminRoster();
}

function showLoading(containerId) {
    if (containerId) {
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = `
                <div class="skeleton skeleton-card"></div>
                <div class="skeleton skeleton-card"></div>
                <div class="skeleton skeleton-card"></div>
            `;
            return;
        }
    }
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.remove('hidden');
}

function hideLoading(containerId) {
    if (containerId) {
        const container = document.getElementById(containerId);
        if (container) {
            // The actual render function will overwrite the innerHTML, 
            // so we don't necessarily need to clear it here, but we can.
            return;
        }
    }
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.add('hidden');
}

let currentHomeworkDate = new Date();
if (currentHomeworkDate.getHours() >= 15) {
    currentHomeworkDate.setDate(currentHomeworkDate.getDate() + 1);
}
// Skip weekends
if (currentHomeworkDate.getDay() === 6) currentHomeworkDate.setDate(currentHomeworkDate.getDate() + 2);
if (currentHomeworkDate.getDay() === 0) currentHomeworkDate.setDate(currentHomeworkDate.getDate() + 1);

window.prevHomeworkDay = () => {
    currentHomeworkDate.setDate(currentHomeworkDate.getDate() - 1);
    if (currentHomeworkDate.getDay() === 0) currentHomeworkDate.setDate(currentHomeworkDate.getDate() - 2); // Skip Sunday to Friday
    loadHomework();
};

window.nextHomeworkDay = () => {
    currentHomeworkDate.setDate(currentHomeworkDate.getDate() + 1);
    if (currentHomeworkDate.getDay() === 6) currentHomeworkDate.setDate(currentHomeworkDate.getDate() + 2); // Skip Saturday to Monday
    loadHomework();
};

function formatHomeworkDate(date) {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (date.toDateString() === today.toDateString()) return i18n[currentLanguage].today || "Сегодня";
    if (date.toDateString() === tomorrow.toDateString()) return i18n[currentLanguage].tomorrow || "Завтра";
    
    return date.toLocaleDateString(currentLanguage === 'ru' ? 'ru-RU' : 'en-US', { weekday: 'short', day: 'numeric', month: 'short' });
}

async function loadTextbooks() {
    showLoading('textbooks-list');
    try {
        const res = await fetch('/api/textbooks');
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const data = await res.json();
        const list = document.getElementById('textbooks-list');
        
        if (data.success) {
            list.innerHTML = '';
            
            // Add mocked PDFs first (from original HTML)
            const mockCard = document.createElement('div');
            mockCard.className = 'textbook-card cursor-pointer';
            mockCard.onclick = () => window.openPdfViewer('Math Grade 9');
            mockCard.innerHTML = `
                <div class="tb-cover bg-donishup-blue/10 text-donishup-blue"><i data-lucide="book"></i></div>
                <h4>Математика 9 Класс</h4>
            `;
            list.appendChild(mockCard);
            
            data.textbooks.forEach(tb => {
                const card = document.createElement('div');
                card.className = 'textbook-card cursor-pointer';
                card.onclick = () => window.openPdfViewer(tb.originalname, tb.path);
                card.innerHTML = `
                    <div class="tb-cover bg-donishup-blue/10 text-donishup-blue"><i data-lucide="file-text"></i></div>
                    <h4>${tb.originalname}</h4>
                `;
                list.appendChild(card);
            });
            safeLucide();
        }
    } catch (e) {
        console.error('Failed to load textbooks', e);
    } finally {
        hideLoading('textbooks-list');
    }
}

async function loadHomework() {
    showLoading();
    try {
        const user = auth.currentUser;
        let [homework, users] = await Promise.all([
            fetchWithCache('/api/homework'),
            user.role === 'Parent' || user.role === 'Admin' ? fetchWithCache('/api/users') : Promise.resolve(null)
        ]);
        
        if (users && !users._error) {
            window.allUsersCache = users;
        }

        if (Array.isArray(homework)) {
            homework = await translateArray(homework, ['description'], currentLanguage);
        }
        renderHomeworkKanban(homework);
    } catch (e) {
        console.error('Failed to load homework', e);
    } finally {
        hideLoading();
    }
}

function renderHomeworkKanban(homework) {
    const user = auth.currentUser;
    const container = document.getElementById('homework-kanban-container');
    const dict = i18n[currentLanguage];

    if (homework._error) {
        container.innerHTML = `<div class="p-8 text-center text-red-500 bg-red-50 rounded-xl border border-red-100">
            <i data-lucide="alert-circle" class="w-12 h-12 mx-auto mb-4"></i>
            <p class="font-bold">${dict.error_loading_homework || 'Failed to load homework'}</p>
            <p class="text-sm opacity-70">${homework.message}</p>
        </div>`;
        if (typeof safeLucide !== 'undefined') safeLucide();
        return;
    }

    const dateLabel = document.getElementById('hw-current-day');
    if (dateLabel) dateLabel.textContent = formatHomeworkDate(currentHomeworkDate);
    
    // Use getLocalDateString if available, otherwise fallback
    const getLocalDStr = (d) => {
        const date = new Date(d);
        date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
        return date.toISOString().split('T')[0];
    };
    const targetDateStr = getLocalDStr(currentHomeworkDate);
    
    let myHomework = [];
    if (user.role === 'Student') {
        myHomework = homework.filter(h => h.class_id === user.class_id || h.user_id === user.id);
    } else if (user.role === 'Teacher') {
        myHomework = homework.filter(h => h.teacher_id === user.id);
        const addBtn = document.querySelector('#view-homework .teacher-only');
        if (addBtn) addBtn.classList.remove('hidden');
    } else if (user.role === 'Parent') {
        // Parent sees their child's homework. We need the child's class_id.
        let childClassId = null;
        // Fetch users to find the child's class if not already available
        if (window.allUsersCache) {
            const child = window.allUsersCache.find(u => u.id === user.child_id);
            if (child) childClassId = child.class_id;
        } else {
            // We can't await here easily since renderHomeworkKanban is synchronous, 
            // but we can trigger a fetch and re-render if needed.
            // For now, let's just use the child_id if we have it, or rely on a global cache.
            // Actually, loadHomework is async, we can fetch users there!
        }
        myHomework = homework.filter(h => h.user_id === user.child_id || (childClassId && h.class_id === childClassId));
        const addBtn = document.querySelector('#view-homework .teacher-only');
        if (addBtn) addBtn.classList.add('hidden');
    } else if (user.role === 'Admin') {
        myHomework = homework; // Admin sees all
        const addBtn = document.querySelector('#view-homework .teacher-only');
        if (addBtn) addBtn.classList.remove('hidden'); // Admin can add homework too
    } else {
        const addBtn = document.querySelector('#view-homework .teacher-only');
        if (addBtn) addBtn.classList.add('hidden');
    }

    // Filter by selected date
    myHomework = myHomework.filter(h => h.dueDate === targetDateStr);

    const todo = myHomework.filter(h => !h.status || h.status === 'todo');
    const inProgress = myHomework.filter(h => h.status === 'inprogress');
    const done = myHomework.filter(h => h.status === 'done');

    const renderCard = (h) => {
        const subjectName = dict[`subj_${h.subject}`] || h.subject;
        const colorClass = subjectColors[h.subject] || subjectColors['default'];
        return `
            <div class="kanban-card border-l-4 ${colorClass.split(' ')[0].replace('bg-', 'border-')}" draggable="true" ondragstart="window.dragHomework(event, '${h.id}')" ondragend="this.classList.remove('dragging')">
                <div class="kanban-tag ${colorClass} bg-opacity-30">${subjectName}</div>
                <div class="kanban-title">${h.description}</div>
                <div class="kanban-meta">
                    <span><i data-lucide="calendar" class="w-3 h-3 inline"></i> ${h.dueDate}</span>
                    ${user.role === 'Teacher' ? `<button class="text-red-500 hover:text-red-700" onclick="deleteHomework('${h.id}')"><i data-lucide="trash-2" class="w-3 h-3"></i></button>` : ''}
                </div>
            </div>
        `;
    };

    container.innerHTML = `
        <div class="kanban-board h-full">
            <div class="kanban-col todo" ondragenter="event.preventDefault()" ondragover="event.preventDefault()" ondrop="window.dropHomework(event, 'todo')">
                <div class="kanban-header mb-4">
                    <span>${dict.todo || 'To Do'}</span>
                    <span class="kanban-count">${todo.length}</span>
                </div>
                <div class="kanban-items">
                    ${todo.map(renderCard).join('')}
                </div>
            </div>
            <div class="kanban-col inprogress" ondragenter="event.preventDefault()" ondragover="event.preventDefault()" ondrop="window.dropHomework(event, 'inprogress')">
                <div class="kanban-header mb-4">
                    <span>${dict.in_progress || 'In Progress'}</span>
                    <span class="kanban-count">${inProgress.length}</span>
                </div>
                <div class="kanban-items">
                    ${inProgress.map(renderCard).join('')}
                </div>
            </div>
            <div class="kanban-col done" ondragenter="event.preventDefault()" ondragover="event.preventDefault()" ondrop="window.dropHomework(event, 'done')">
                <div class="kanban-header mb-4">
                    <span>${dict.done || 'Done'}</span>
                    <span class="kanban-count">${done.length}</span>
                </div>
                <div class="kanban-items">
                    ${done.map(renderCard).join('')}
                </div>
            </div>
        </div>
    `;
    safeLucide();
}

window.dragHomework = (e, id) => {
    e.dataTransfer.setData('text/plain', id);
    e.target.classList.add('dragging');
};

window.dropHomework = async (e, status) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    console.log('dropped homework', id, 'to status', status);
    
    if (!id) return;

    try {
        await fetch(`/api/homework/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        invalidateCache('/api/homework');
        loadHomework();
    } catch (err) {
        console.error('Failed to update homework status', err);
    }
    
    const dragging = document.querySelector('.dragging');
    if (dragging) dragging.classList.remove('dragging');
};

function getSubjectColor(subject) {
    const map = { 
        'tajik': 'blue-500', 'russian': 'red-500', 'english': 'green-500', 
        'math': 'teal-500', 'physics': 'amber-500', 'chemistry': 'emerald-500', 
        'biology': 'yellow-500', 'geography': 'cyan-500', 'history_tj': 'red-500', 'history_world': 'red-400', 
        'social_studies': 'purple-500', 'informatics': 'orange-500', 'labor': 'stone-500', 
        'pe': 'donishup-blue', 'art_music': 'purple-500' 
    };
    return map[subject] || 'gray-500';
}

function getLocalDateString(d) {
    const date = new Date(d);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().split('T')[0];
}

window.openAddHomeworkModal = () => {
    document.getElementById('hw-date').value = getLocalDateString(currentHomeworkDate);
    
    const user = auth.currentUser;
    const classContainer = document.getElementById('hw-class-container');
    const classSelect = document.getElementById('hw-class');
    
    if (user.role === 'Admin') {
        classContainer.classList.remove('hidden');
    } else if (user.role === 'Teacher') {
        classContainer.classList.remove('hidden');
        if (user.class_id) {
            classSelect.value = user.class_id;
        }
    } else {
        classContainer.classList.add('hidden');
    }
    
    document.getElementById('add-homework-modal').classList.remove('hidden');
};

window.submitHomework = async () => {
    const user = auth.currentUser;
    const subject = document.getElementById('hw-subject').value;
    const desc = document.getElementById('hw-desc').value;
    const date = document.getElementById('hw-date').value;
    const classId = document.getElementById('hw-class').value;
    
    if (!desc || !date) {
        const lang = document.getElementById('settings-language')?.value || 'ru';
        const dict = i18n[lang] || i18n['ru'];
        window.showToast(dict.fill_all_fields || 'Please fill all fields', 'error');
        return;
    }

    try {
        await fetch('/api/homework', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                teacher_id: user.id,
                class_id: classId || user.class_id,
                subject: subject,
                description: desc,
                dueDate: date
            })
        });
        document.getElementById('add-homework-modal').classList.add('hidden');
        invalidateCache('/api/homework');
        loadHomework();
    } catch (e) {
        console.error('Failed to submit homework', e);
    }
};

window.deleteHomework = async (id) => {
    const lang = document.getElementById('settings-language')?.value || 'ru';
    const dict = i18n[lang];
    const confirmed = await window.showConfirm(dict.delete_homework_confirm || 'Delete this homework?');
    if(confirmed) {
        try {
            await fetch(`/api/homework/${id}`, {
                method: 'DELETE'
            });
            invalidateCache('/api/homework');
            loadHomework();
        } catch (e) {
            console.error('Failed to delete homework', e);
        }
    }
};

// --- Materials Logic ---
window.openMaterialsModal = (classId, subject, subjectName) => {
    const user = auth.currentUser;
    document.getElementById('materials-modal-title').textContent = `${subjectName} Materials`;
    document.getElementById('mat-class-id').value = classId;
    document.getElementById('mat-subject').value = subject;
    
    const uploadSection = document.getElementById('materials-upload-section');
    if (user.role === 'Teacher' || user.role === 'Admin') {
        uploadSection.classList.remove('hidden');
    } else {
        uploadSection.classList.add('hidden');
    }
    
    document.getElementById('materials-modal').classList.remove('hidden');
    window.loadMaterials(classId, subject);
};

window.loadMaterials = async (classId, subject) => {
    const list = document.getElementById('materials-list');
    list.innerHTML = '<div class="flex justify-center py-8"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>';
    
    try {
        const res = await fetch(`/api/materials?class_id=${classId}&subject=${subject}`);
        const materials = await res.json();
        const user = auth.currentUser;
        
        if (materials.length === 0) {
            list.innerHTML = '<p class="text-center text-gray-500 py-8">No materials found for this subject.</p>';
            return;
        }
        
        list.innerHTML = materials.map(m => `
            <div class="bg-gray-50 rounded-xl p-4 border border-gray-200 relative">
                ${(user.role === 'Teacher' || user.role === 'Admin') ? `
                    <button onclick="window.deleteMaterial('${m.id}', '${classId}', '${subject}')" class="absolute top-4 right-4 text-red-500 hover:text-red-700">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                ` : ''}
                <h4 class="font-bold text-lg text-gray-800 mb-1">${m.title}</h4>
                <div class="text-xs text-gray-500 mb-3">${m.date}</div>
                
                ${m.content ? `<div class="text-gray-700 text-sm mb-4 whitespace-pre-wrap dict-enabled">${m.content}</div>` : ''}
                
                ${m.file_url ? `
                    <a href="${m.file_url}" target="_blank" download class="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors text-sm font-medium">
                        <i data-lucide="${m.file_type?.includes('image') ? 'image' : 'file-text'}" class="w-4 h-4"></i>
                        Download File
                    </a>
                ` : ''}
            </div>
        `).join('');
        
        lucide.createIcons();
        window.setupDictionary();
    } catch (e) {
        console.error("Failed to load materials", e);
        list.innerHTML = '<p class="text-center text-red-500 py-8">Failed to load materials.</p>';
    }
};

window.uploadMaterial = async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    const classId = document.getElementById('mat-class-id').value;
    const subject = document.getElementById('mat-subject').value;
    const title = document.getElementById('mat-title').value;
    const content = document.getElementById('mat-content').value;
    const fileInput = document.getElementById('mat-file');
    
    const formData = new FormData();
    formData.append('class_id', classId);
    formData.append('subject', subject);
    formData.append('teacher_id', user.id);
    formData.append('title', title);
    formData.append('content', content);
    formData.append('date', getLocalDateString(new Date()));
    
    if (fileInput.files[0]) {
        formData.append('material_file', fileInput.files[0]);
    }
    
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> Uploading...';
    btn.disabled = true;
    
    try {
        const res = await fetch('/api/materials', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        
        if (data.success) {
            e.target.reset();
            window.loadMaterials(classId, subject);
            window.showToast('Material uploaded successfully', 'success');
        } else {
            window.showToast(data.message || 'Upload failed', 'error');
        }
    } catch (err) {
        console.error("Upload error", err);
        window.showToast('Upload failed', 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

window.deleteMaterial = async (id, classId, subject) => {
    if (!await window.showConfirm('Delete this material?')) return;
    
    try {
        await fetch(`/api/materials/${id}`, { method: 'DELETE' });
        window.loadMaterials(classId, subject);
        window.showToast('Material deleted', 'success');
    } catch (e) {
        console.error("Delete error", e);
        window.showToast('Failed to delete', 'error');
    }
};

// --- Dictionary Logic ---
window.setupDictionary = () => {
    const dictElements = document.querySelectorAll('.dict-enabled');
    const popup = document.getElementById('dictionary-popup');
    const wordEl = document.getElementById('dict-word');
    const defEl = document.getElementById('dict-def');
    
    dictElements.forEach(el => {
        el.addEventListener('dblclick', async (e) => {
            const selection = window.getSelection();
            const word = selection.toString().trim();
            
            if (!word || word.length < 2 || word.includes(' ')) return;
            
            // Position popup
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            
            popup.style.left = `${rect.left + (rect.width / 2)}px`;
            popup.style.top = `${rect.top + window.scrollY - 10}px`;
            popup.classList.remove('hidden');
            
            wordEl.textContent = word;
            defEl.textContent = 'Loading definition...';
            
            try {
                const lang = document.getElementById('settings-language')?.value || 'ru';
                const context = el.textContent.substring(Math.max(0, range.startOffset - 50), Math.min(el.textContent.length, range.endOffset + 50));
                
                const res = await fetch('/api/dictionary', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ word, context, lang })
                });
                const data = await res.json();
                
                if (data.success) {
                    defEl.textContent = data.definition;
                } else {
                    defEl.textContent = 'Definition not found.';
                }
            } catch (err) {
                defEl.textContent = 'Error loading definition.';
            }
        });
    });
    
    // Hide popup on click elsewhere
    document.addEventListener('click', (e) => {
        if (!popup.contains(e.target) && e.target.className !== 'dict-enabled') {
            popup.classList.add('hidden');
        }
    });
};

window.openAddGradeModal = async () => {
    const user = auth.currentUser;
    const dict = i18n[currentLanguage];
    try {
        const response = await fetch('/api/users');
        const users = await response.json();
        
        // Update current user's subjects in case admin changed them
        const freshUser = users.find(u => u.id === user.id);
        if (freshUser && freshUser.subjects) {
            user.subjects = freshUser.subjects;
        }

        let students = [];
        if (user.role === 'Admin') {
            students = users.filter(u => u.role === 'Student');
        } else if (user.role === 'Teacher') {
            if (user.class_id) {
                students = users.filter(u => u.role === 'Student' && u.class_id === user.class_id);
            } else {
                students = users.filter(u => u.role === 'Student'); // Fallback if no class assigned
            }
        }

        const studentSelect = document.getElementById('grade-student');
        if (students.length === 0) {
            studentSelect.innerHTML = `<option disabled selected value="">No students found</option>`;
        } else {
            // Sort students by class and name for easier selection
            students.sort((a, b) => {
                const classCompare = (a.class_id || '').localeCompare(b.class_id || '');
                if (classCompare !== 0) return classCompare;
                return (a.name || '').localeCompare(b.name || '');
            });
            studentSelect.innerHTML = students.map(s => `<option value="${s.id}">${s.name} (${s.class_id || 'No Class'})</option>`).join('');
        }

        // Filter subjects for teachers
        const subjectSelect = document.getElementById('grade-subject');
        const allSubjects = window.allSubjects || [];
        
        if (user.role === 'Teacher') {
            if (user.subjects && user.subjects.length > 0) {
                const teacherSubjects = allSubjects.filter(s => user.subjects.includes(s.type));
                subjectSelect.innerHTML = teacherSubjects.map(s => 
                    `<option value="${s.type}">${dict[`subj_${s.type}`] || s.name}</option>`
                ).join('');
            } else {
                subjectSelect.innerHTML = `<option disabled selected value="">${dict.no_subjects || 'No subjects assigned'}</option>`;
            }
        } else if (user.role === 'Admin') {
            // Admins can see all subjects
            subjectSelect.innerHTML = allSubjects.map(s => 
                `<option value="${s.type}">${dict[`subj_${s.type}`] || s.name}</option>`
            ).join('');
        }

        document.getElementById('add-grade-modal').classList.remove('hidden');
    } catch (e) {
        console.error('Failed to load students', e);
    }
};

window.submitGrade = async () => {
    const studentId = document.getElementById('grade-student').value;
    const subject = document.getElementById('grade-subject').value;
    const value = parseInt(document.getElementById('grade-value').value);
    
    if (!studentId) {
        const lang = document.getElementById('settings-language')?.value || 'ru';
        const dict = i18n[lang];
        window.showToast(dict.select_student || "Please select a student", 'error');
        return;
    }

    try {
        await fetch('/api/grades', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                student_id: studentId,
                type: subject,
                subject: subject.charAt(0).toUpperCase() + subject.slice(1),
                value: value,
                date: getLocalDateString(new Date())
            })
        });
        document.getElementById('add-grade-modal').classList.add('hidden');
        invalidateCache('/api/grades');
        loadGrades();
        loadDashboard(); // Refresh dashboard if needed
    } catch (e) {
        console.error('Failed to submit grade', e);
    }
};

window.handleGraderUpload = async (input) => {
    const file = input.files[0];
    if (!file) return;

    const resultDiv = document.getElementById('grader-result');
    resultDiv.classList.remove('hidden');
    resultDiv.innerHTML = `
        <div class="flex items-center gap-3 animate-pulse">
            <div class="w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
            <span class="text-teal-700 font-medium">Analyzing handwriting...</span>
        </div>
    `;

    try {
        const result = await tutor.gradeHomework(file);
        
        if (result) {
            resultDiv.innerHTML = `
                <div class="flex justify-between items-start mb-3 border-b pb-2">
                    <div>
                        <h4 class="font-bold text-lg text-donishup-navy">${result.subject || 'Unknown Subject'}</h4>
                        <p class="text-xs text-gray-500">AI Confidence: High</p>
                    </div>
                    <div class="grade-badge grade-${result.grade} text-xl w-10 h-10">${result.grade}</div>
                </div>
                <div class="bg-gray-50 p-3 rounded-lg mb-3">
                    <p class="text-sm text-gray-700 leading-relaxed">${result.feedback}</p>
                </div>
                <button class="btn-primary w-full text-sm py-2" onclick="saveAiGrade('${result.subject}', ${result.grade})">
                    <i data-lucide="check-circle" class="w-4 h-4 mr-2"></i> ${dict.save_grade || 'Save Grade'}
                </button>
            `;
            safeLucide();
        } else {
            const lang = document.getElementById('settings-language')?.value || 'ru';
            const dict = i18n[lang];
            resultDiv.innerHTML = `<div class="text-red-500 font-medium">${dict.analysis_failed || 'Analysis failed. Please try a clearer photo.'}</div>`;
        }
    } catch (e) {
        console.error(e);
        const lang = document.getElementById('settings-language')?.value || 'ru';
        const dict = i18n[lang];
        resultDiv.innerHTML = `<div class="text-red-500 font-medium">${dict.system_error || 'System error. Check console.'}</div>`;
    }
};

window.saveAiGrade = (subject, grade) => {
    window.openAddGradeModal();
    // Pre-fill modal after it opens
    setTimeout(() => {
        const subSelect = document.getElementById('grade-subject');
        const valSelect = document.getElementById('grade-value');
        if(subSelect && subject) {
            const normalizedSub = subject ? subject.toLowerCase() : '';
            // Try to match subject
            for(let i=0; i<subSelect.options.length; i++) {
                if(subSelect.options[i].value === normalizedSub) {
                    subSelect.selectedIndex = i;
                    break;
                }
            }
        }
        if(valSelect) valSelect.value = grade;
    }, 100);
};

async function loadDashboard() {
    showLoading();
    try {
        const user = auth.currentUser;
        const dict = i18n[currentLanguage];
        document.getElementById('welcome-text').textContent = `${dict.welcome_msg}${user.name.split(' ')[0]}!`;
        
        if (user.role === 'Personal') return; 

        // Predictive Analytics Alert (Mock)
        const existingAlert = document.querySelector('.analytics-alert');
        if (existingAlert) existingAlert.remove();

        if (user.role === 'Teacher' || user.role === 'Parent') {
            const alertDiv = document.createElement('div');
            alertDiv.className = 'analytics-alert';
            alertDiv.innerHTML = `
                <i data-lucide="alert-triangle"></i>
                <div>
                    <strong>${dict.predictive_analytics_title}</strong>
                    <p>${dict.predictive_analytics_msg}</p>
                </div>
            `;
            const grid = document.querySelector('#view-dashboard .dashboard-grid');
            if(grid) grid.before(alertDiv);
        }

        // Teacher AI Grader
        const existingGrader = document.querySelector('.grader-panel');
        if (existingGrader) existingGrader.remove();

        if (user.role === 'Teacher') {
            const graderPanel = document.createElement('div');
            graderPanel.className = 'panel mt-4 grader-panel';
            graderPanel.innerHTML = `
                <div class="panel-header">
                    <h3>${dict.ai_grader_title || 'AI Homework Grader'}</h3>
                </div>
                <div class="grader-upload-area cursor-pointer hover:bg-gray-50 transition-colors border-2 border-dashed border-teal-200 rounded-xl p-6 text-center" onclick="document.getElementById('grader-input').click()">
                    <i data-lucide="camera" class="w-8 h-8 text-teal-600 mb-2 mx-auto"></i>
                    <p class="font-medium text-teal-800">${dict.ai_grader_msg || 'Upload Homework Photo'}</p>
                    <p class="text-xs text-secondary mt-1">${dict.ai_grader_sub || 'AI will analyze handwriting and grade it'}</p>
                    <input type="file" id="grader-input" accept="image/*" class="hidden" onchange="handleGraderUpload(this)">
                </div>
                <div id="grader-result" class="hidden mt-4 p-4 rounded-lg border shadow-sm" style="background: var(--surface-color); border-color: var(--surface-border);"></div>
            `;
            const colLeft = document.querySelector('.col-left');
            if(colLeft) colLeft.appendChild(graderPanel);
        }

        // Fetch data concurrently with individual error handling
        const [schedule, allGrades] = await Promise.all([
            fetchWithCache('/api/schedule').catch(e => {
                console.error('Dashboard: Failed to fetch schedule', e);
                return { _error: true, message: e.message };
            }),
            user.role === 'Student' ? fetchWithCache('/api/grades').catch(e => {
                console.error('Dashboard: Failed to fetch grades', e);
                return { _error: true, message: e.message };
            }) : Promise.resolve(null)
        ]);
        
        const myClass = user.class_id;
        const daysMap = {'Monday': 'mon', 'Tuesday': 'tue', 'Wednesday': 'wed', 'Thursday': 'thu', 'Friday': 'fri'};
        const today = daysMap[['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'][new Date().getDay() - 1]] || 'mon';
        
        let mySchedule = [];
        const dashSch = document.getElementById('dash-schedule-content');
        if (schedule && schedule._error) {
            dashSch.innerHTML = `<p class="text-red-500 p-4 text-xs">${dict.failed_to_load_schedule || 'Failed to load schedule:'} ${schedule.message}</p>`;
        } else {
            if (user.role === 'Student') {
                mySchedule = schedule.filter(s => s.class_id === myClass && s.dayOfWeek === today);
            } else if (user.role === 'Teacher') {
                mySchedule = schedule.filter(s => s.teacher_id === user.id && s.dayOfWeek === today);
            }

            if (mySchedule.length === 0) {
                dashSch.innerHTML = `<p class="text-secondary p-4">${dict.no_lessons}</p>`;
            } else {
                dashSch.innerHTML = mySchedule.map(s => {
                    const subjectName = dict[`subj_${s.type}`] || s.subject;
                    return `
                    <div class="schedule-card sch-${s.type || 'default'}">
                        <div class="flex justify-between items-start mb-2">
                            <div class="bg-white/20 p-2 rounded-lg">
                                <i data-lucide="${s.icon || 'book'}" class="text-white w-6 h-6"></i>
                            </div>
                            <div class="text-right">
                                <div class="text-xs opacity-90">${s.time}</div>
                                <div class="text-xs font-bold bg-white/20 px-2 py-1 rounded mt-1">${s.room}</div>
                            </div>
                        </div>
                        <div class="sch-subject">${subjectName}</div>
                        <div class="text-xs opacity-80">${s.class_id || ''}</div>
                        <button onclick="window.openMaterialsModal('${s.class_id || user.class_id}', '${s.type}', '${subjectName}')" class="mt-3 w-full bg-white/20 hover:bg-white/30 text-white text-xs font-bold py-2 rounded transition-colors">
                            ${dict.open_materials}
                        </button>
                    </div>
                `}).join('');
            }
        }

        // Load Grades (All roles for dashboard)
        if (allGrades) {
            const dashGrades = document.getElementById('dash-grades-content');
            if (dashGrades) {
                if (allGrades._error) {
                    dashGrades.innerHTML = `<p class="text-red-500 p-4 text-xs">${dict.failed_to_load_grades || 'Failed to load grades:'} ${allGrades.message}</p>`;
                } else {
                    let myGrades = [];
                    if (user.role === 'Student') {
                        myGrades = allGrades.filter(g => g.student_id === user.id);
                    } else if (user.role === 'Parent') {
                        myGrades = allGrades.filter(g => g.student_id === user.child_id);
                    } else if (user.role === 'Teacher') {
                        // Assuming we fetch users to filter by class, but for simplicity, show all grades for their subjects or just all grades they can see
                        // For now, let's just show all grades if they are a teacher/admin to populate the stats
                        myGrades = allGrades; 
                    } else if (user.role === 'Admin') {
                        myGrades = allGrades;
                    }

                    const recentGrades = myGrades.slice(-3);
                    
                    dashGrades.innerHTML = recentGrades.map(g => {
                        const subjectName = dict[`subj_${g.type}`] || g.subject;
                        return `
                        <div class="grade-item">
                            <div><strong>${subjectName}</strong> <span class="text-xs text-secondary ml-2">${g.date}</span></div>
                            <div class="grade-badge grade-${g.value}">${g.value}</div>
                        </div>
                    `}).join('');
                    
                    // Average
                    const avg = myGrades.length > 0 ? (myGrades.reduce((sum, g) => sum + g.value, 0) / myGrades.length).toFixed(1) : '-';
                    const dashAvg = document.getElementById('dash-average-content');
                    if (dashAvg) dashAvg.innerHTML = `<div class="text-3xl font-bold text-center text-teal-600">${avg}</div>`;

                    // Grade Distribution Stats
                    const stats = { 5: 0, 4: 0, 3: 0, 2: 0 };
                    myGrades.forEach(g => {
                        if (stats[g.value] !== undefined) stats[g.value]++;
                    });
                    
                    window.animateCounter('dash-stat-5', stats[5]);
                    window.animateCounter('dash-stat-4', stats[4]);
                    window.animateCounter('dash-stat-3', stats[3]);
                    window.animateCounter('dash-stat-2', stats[2]);
                }
            }
        }

        // Habit Tracker Widget
        await habitManager.renderDashboardWidget();

        // Daily Quest Widget
        gamification.loadDailyQuests();

        safeLucide();
    } catch (e) {
        console.error('Failed to load dashboard data', e);
    } finally {
        hideLoading();
    }
}

async function loadSchedule() {
    showLoading();
    try {
        const user = auth.currentUser;
        const dict = i18n[currentLanguage];
        const grid = document.getElementById('full-schedule-grid');
        
        const schedule = await fetchWithCache('/api/schedule');
        
        // Simplified full schedule view for demo
        let mySchedule = schedule.filter(s => s.class_id === user.class_id);
        if(user.role === 'Teacher') mySchedule = schedule.filter(s => s.teacher_id === user.id);
        if(user.role === 'Admin') mySchedule = schedule;

        const days = ['mon', 'tue', 'wed', 'thu', 'fri'];
        const times = ['08:00', '08:50', '09:40', '10:40', '11:30', '12:20', '13:30', '14:20'];
        
        let html = '<div class="overflow-x-auto pb-4"><table class="w-full border-collapse min-w-[800px] table-fixed">';
        
        // Header row
        html += '<thead><tr><th class="w-16 border border-gray-300 p-2 bg-white"></th>';
        times.forEach((time, index) => {
            // Calculate end time roughly (adding 40 mins)
            let [h, m] = time.split(':').map(Number);
            m += 40;
            if (m >= 60) { h += 1; m -= 60; }
            const endTime = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
            
            html += `<th class="border border-gray-300 p-2 bg-white text-center font-normal">
                <div class="font-bold text-lg text-gray-800">${index + 1}</div>
                <div class="text-xs text-gray-500">${time} - ${endTime}</div>
            </th>`;
        });
        html += '</tr></thead><tbody>';
        
        days.forEach(day => {
            const dayName = dict[`day_${day}`] || day;
            const shortDay = dayName.substring(0, 2); // Mo, Tu, We, Th
            
            html += `<tr>
                <td class="border border-gray-300 p-2 bg-white text-center">
                    <div class="font-bold text-gray-700">${shortDay}</div>
                </td>`;
            
            const dayClasses = mySchedule.filter(s => s.dayOfWeek === day);
            
            times.forEach(time => {
                const c = dayClasses.find(s => s.time === time);
                if (c) {
                    const subjectName = dict[`subj_${c.type}`] || c.subject;
                    const schClass = `sch-${c.type || 'default'}`;
                    
                    html += `
                        <td class="border border-gray-300 p-2 ${schClass} text-white relative h-24 align-middle transition-transform hover:scale-[1.02] hover:shadow-md cursor-pointer">
                            <div class="text-center font-semibold text-base md:text-lg drop-shadow-sm">${subjectName}</div>
                            <div class="absolute bottom-1 left-1 text-[10px] opacity-90 font-medium bg-black/20 px-1 rounded">${c.room}</div>
                            ${user.role === 'Student' ? `<div class="absolute bottom-1 right-1 text-[10px] opacity-90 font-medium bg-black/20 px-1 rounded">${c.teacher_id.substring(0,2).toUpperCase()}</div>` : ''}
                        </td>
                    `;
                } else {
                    html += `
                        <td class="border border-gray-300 p-2 bg-gray-50 bg-opacity-50 h-24"></td>
                    `;
                }
            });
            html += '</tr>';
        });
        html += '</tbody></table></div>';
        grid.innerHTML = html;
    } catch (e) {
        console.error('Failed to load schedule', e);
    } finally {
        hideLoading();
    }
}

function getQuarter(dateStr) {
    if (!dateStr) return 1;
    const month = parseInt(dateStr.split('-')[1], 10);
    if (month >= 9 && month <= 10) return 1;
    if (month >= 11 && month <= 12) return 2;
    if (month >= 1 && month <= 3) return 3;
    if (month >= 4 && month <= 6) return 4;
    return 1;
}

async function loadGrades() {
    showLoading();
    try {
        const user = auth.currentUser;
        const subjects = window.allSubjects || [];
        const dict = i18n[currentLanguage];
        
        const header = document.getElementById('grades-header-row');
        const body = document.getElementById('grades-body');
        
        // Add Grade Button for Teachers
        const gradesActions = document.getElementById('grades-actions-container');
        if (gradesActions && (user.role === 'Teacher' || user.role === 'Admin') && !document.getElementById('add-grade-btn')) {
            const btn = document.createElement('button');
            btn.id = 'add-grade-btn';
            btn.className = 'btn-primary';
            btn.innerHTML = `<i data-lucide="plus"></i> ${dict.add_grade || 'Add Grade'}`;
            btn.onclick = window.openAddGradeModal;
            gradesActions.appendChild(btn);
        }

        // Stats counters
        const stats = { 5: 0, 4: 0, 3: 0, 2: 0 };
        const totalStats = { 5: 0, 4: 0, 3: 0, 2: 0 };

        const [users, grades] = await Promise.all([
            fetchWithCache('/api/users').catch(e => {
                console.error('Grades: Failed to fetch users', e);
                return [];
            }),
            fetchWithCache('/api/grades').catch(e => {
                console.error('Grades: Failed to fetch grades', e);
                return [];
            })
        ]);

        // Update current user's subjects in case admin changed them
        const freshUser = users.find(u => u.id === user.id);
        if (freshUser && freshUser.subjects) {
            user.subjects = freshUser.subjects;
        }

        let targetStudents = [];
        if (user.role === 'Student') targetStudents = [user];
        else if (user.role === 'Teacher') targetStudents = users.filter(u => u.role === 'Student' && u.class_id === user.class_id);
        else if (user.role === 'Parent') targetStudents = users.filter(u => u.id === user.child_id);
        else if (user.role === 'Admin') targetStudents = users.filter(u => u.role === 'Student');

        let bodyHtml = '';
        
        if (user.role === 'Student' || user.role === 'Parent') {
            const filterContainer = document.getElementById('grades-filter-container');
            if (filterContainer) filterContainer.classList.add('hidden');
            
            if (header) header.innerHTML = `
                <th>${dict.subject_header || 'Subject'}</th>
                <th>I ${dict.quarter || 'Quarter'}</th>
                <th>II ${dict.quarter || 'Quarter'}</th>
                <th>III ${dict.quarter || 'Quarter'}</th>
                <th>IV ${dict.quarter || 'Quarter'}</th>
                <th>${dict.final_grade || 'Final'}</th>
            `;
            
            const studentId = targetStudents.length > 0 ? targetStudents[0].id : null;
            const myGrades = grades.filter(g => g.student_id === studentId);
            
            // Calculate total stats for student across all subjects
            myGrades.forEach(g => {
                if (totalStats[g.value] !== undefined) totalStats[g.value]++;
            });

            subjects.forEach(sub => {
                const subjectGrades = myGrades.filter(g => g.type === sub.type);
                const subName = dict[`subj_${sub.type}`] || sub.name;
                
                let rowHtml = `<td><div class="font-medium">${subName}</div></td>`;
                
                let qGrades = { 1: [], 2: [], 3: [], 4: [] };
                let totalSum = 0;
                
                subjectGrades.forEach(g => {
                    const q = getQuarter(g.date);
                    qGrades[q].push(g);
                    totalSum += g.value;
                    if (stats[g.value] !== undefined) stats[g.value]++;
                });
                
                for (let i = 1; i <= 4; i++) {
                    let cellHtml = '<div class="flex gap-1 overflow-x-auto pb-1">';
                    qGrades[i].forEach(g => {
                        cellHtml += `<div class="grade-box grade-${g.value} shrink-0" title="${g.date}">${g.value}</div>`;
                    });
                    cellHtml += '</div>';
                    rowHtml += `<td>${cellHtml}</td>`;
                }
                
                const avg = subjectGrades.length ? (totalSum / subjectGrades.length).toFixed(1) : '-';
                let avgClass = 'avg-med';
                if (avg >= 4.5) avgClass = 'avg-high';
                else if (avg < 3.5 && avg !== '-') avgClass = 'avg-low';
                
                let finalGradeHtml = avg !== '-' ? `<div class="average-badge ${avgClass} mx-auto">${avg}</div>` : '-';
                
                rowHtml += `<td class="text-center font-bold">${finalGradeHtml}</td>`;
                bodyHtml += `<tr class="grades-row">${rowHtml}</tr>`;
            });
        } else {
            // Teacher View
            const filterContainer = document.getElementById('grades-filter-container');
            const subjectFilter = document.getElementById('grades-subject-filter');
            if (filterContainer) filterContainer.classList.remove('hidden');
            
            if (subjectFilter) {
                // Always rebuild options in case admin changed subjects
                const currentVal = subjectFilter.value;
                subjectFilter.innerHTML = '';
                
                let allowedSubjects = subjects;
                if (user.role === 'Teacher' && user.subjects && user.subjects.length > 0) {
                    allowedSubjects = subjects.filter(s => user.subjects.includes(s.type));
                }

                if (allowedSubjects.length === 0) {
                    const option = document.createElement('option');
                    option.value = '';
                    option.textContent = dict.no_subjects || 'No subjects assigned';
                    subjectFilter.appendChild(option);
                } else {
                    allowedSubjects.forEach((sub, index) => {
                        const subName = dict[`subj_${sub.type}`] || sub.name;
                        const option = document.createElement('option');
                        option.value = sub.type;
                        option.textContent = subName;
                        if (sub.type === currentVal || (!currentVal && index === 0)) {
                            option.selected = true;
                        }
                        subjectFilter.appendChild(option);
                    });
                }
            }
            
            const selectedSubject = subjectFilter ? subjectFilter.value : '';
            
            if (header) header.innerHTML = `
                <th>${dict.student_header || 'Student'}</th>
                <th>I ${dict.quarter || 'Quarter'}</th>
                <th>II ${dict.quarter || 'Quarter'}</th>
                <th>III ${dict.quarter || 'Quarter'}</th>
                <th>IV ${dict.quarter || 'Quarter'}</th>
                <th>${dict.final_grade || 'Final'}</th>
            `;
            
            targetStudents.forEach(student => {
                let rowHtml = `<td><div class="font-medium">${student.name}</div></td>`;
                
                const studentGrades = grades.filter(g => g.student_id === student.id && g.type === selectedSubject);
                let qGrades = { 1: [], 2: [], 3: [], 4: [] };
                let totalSum = 0;
                
                studentGrades.forEach(g => {
                    const q = getQuarter(g.date);
                    qGrades[q].push(g);
                    totalSum += g.value;
                    if (stats[g.value] !== undefined) stats[g.value]++;
                });
                
                for (let i = 1; i <= 4; i++) {
                    let cellHtml = '<div class="flex gap-1 overflow-x-auto pb-1">';
                    qGrades[i].forEach(g => {
                        cellHtml += `<div class="grade-box grade-${g.value} shrink-0" title="${g.date}">${g.value}</div>`;
                    });
                    cellHtml += '</div>';
                    rowHtml += `<td>${cellHtml}</td>`;
                }
                
                const avg = studentGrades.length ? (totalSum / studentGrades.length).toFixed(1) : '-';
                let avgClass = 'avg-med';
                if (avg >= 4.5) avgClass = 'avg-high';
                else if (avg < 3.5 && avg !== '-') avgClass = 'avg-low';
                
                let finalGradeHtml = avg !== '-' ? `<div class="average-badge ${avgClass} mx-auto">${avg}</div>` : '-';
                
                rowHtml += `<td class="text-center font-bold">${finalGradeHtml}</td>`;
                bodyHtml += `<tr class="grades-row">${rowHtml}</tr>`;
            });
        }
        
        if (body) body.innerHTML = bodyHtml;

        // Update stats UI - use totalStats for students/parents to show overall distribution
        const displayStats = (user.role === 'Student' || user.role === 'Parent') ? totalStats : stats;
        
        window.animateCounter('stat-grade-5', displayStats[5]);
        window.animateCounter('stat-grade-4', displayStats[4]);
        window.animateCounter('stat-grade-3', displayStats[3]);
        window.animateCounter('stat-grade-2', displayStats[2]);

        safeLucide();
    } catch (e) {
        console.error('Failed to load grades', e);
    } finally {
        hideLoading();
    }
}

function updateTranslations() {
    // Basic i18n implementation
    const dict = i18n[currentLanguage];
    if(!dict) return;
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (dict[key]) el.textContent = dict[key];
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (dict[key]) el.placeholder = dict[key];
    });
    document.querySelectorAll('[data-i18n-label]').forEach(el => {
        const key = el.getAttribute('data-i18n-label');
        if (dict[key]) el.label = dict[key];
    });
    
    // Reload current view to apply dynamic translations
    if (auth.currentUser && currentViewId) {
        switchView(currentViewId);
    }
}

// Boot
init();

// PWA Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('SW registered', reg))
            .catch(err => console.log('SW failed', err));
    });
}
