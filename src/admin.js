import { i18n } from './i18n.js';

export class AdminManager {
    constructor() {
        this.setupListeners();
        this.targetUserId = null;
        this.sortField = 'name';
        this.sortOrder = 'asc';
        this.timetableData = [];
    }

    getLang() {
        return document.getElementById('settings-language')?.value || 'ru';
    }

    setupListeners() {
        window.adminManager = this;
        const roleSelect = document.getElementById('admin-create-role');
        if (roleSelect) {
            roleSelect.addEventListener('change', () => this.handleRoleChange());
        }
        this.populateSubjects();
        this.populateStudents('admin-create-student');
    }

    async populateStudents(selectId) {
        const select = document.getElementById(selectId);
        if (!select) return;

        try {
            const users = await window.fetchWithCache('/api/users');
            const students = users.filter(u => u.role === 'Student');

            const lang = this.getLang();
            const dict = i18n[lang];

            select.innerHTML = `<option value="">${dict.select_student_placeholder || 'Select Student'}</option>` + 
                students.map(s => `<option value="${s.id}">${s.name} (${s.class_id || '-'})</option>`).join('');
        } catch (e) {
            console.error('Failed to populate students:', e);
        }
    }

    populateSubjects(containerId = 'admin-subjects-list', nameAttr = 'teacher-subject') {
        const list = document.getElementById(containerId);
        if (!list) return;
        
        const subjects = window.allSubjects || [];

        const lang = this.getLang();
        const dict = i18n[lang];

        list.innerHTML = subjects.map(s => {
            const label = dict[`subj_${s.type}`] || s.name;
            return `
                <label class="flex items-center space-x-2 p-1 hover:bg-white rounded cursor-pointer">
                    <input type="checkbox" name="${nameAttr}" value="${s.type}" class="rounded text-blue-600">
                    <span class="text-xs">${label}</span>
                </label>
            `;
        }).join('');
    }

    handleRoleChange() {
        const roleEl = document.getElementById('admin-create-role');
        if (!roleEl) return;
        const role = roleEl.value;
        const subjectsContainer = document.getElementById('admin-teacher-subjects');
        const studentContainer = document.getElementById('admin-parent-student');

        if (subjectsContainer) {
            subjectsContainer.classList.toggle('hidden', role !== 'Teacher');
        }
        if (studentContainer) {
            studentContainer.classList.toggle('hidden', role !== 'Parent');
            if (role === 'Parent') {
                this.populateStudents('admin-create-student');
            }
        }
    }

    handleEditRoleChange() {
        const roleEl = document.getElementById('admin-edit-role');
        const subjectsContainer = document.getElementById('admin-edit-subjects-container');
        const studentContainer = document.getElementById('admin-edit-student-container');
        
        if (!roleEl) return;
        const role = roleEl.value;

        if (subjectsContainer) {
            if (role === 'Teacher') {
                subjectsContainer.classList.remove('hidden');
                this.populateSubjects('admin-edit-subjects-list', 'edit-teacher-subject');
            } else {
                subjectsContainer.classList.add('hidden');
            }
        }

        if (studentContainer) {
            if (role === 'Parent') {
                studentContainer.classList.remove('hidden');
                this.populateStudents('admin-edit-student');
            } else {
                studentContainer.classList.add('hidden');
            }
        }
    }

    setSort(field) {
        if (this.sortField === field) {
            this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortField = field;
            this.sortOrder = 'asc';
        }
        this.loadAdminRoster();
    }

    resetFilters() {
        const nameFilter = document.getElementById('admin-filter-name');
        const roleFilter = document.getElementById('admin-filter-role');
        const classFilter = document.getElementById('admin-filter-class');
        
        if (nameFilter) nameFilter.value = '';
        if (roleFilter) roleFilter.value = '';
        if (classFilter) classFilter.value = '';
        
        this.loadAdminRoster();
    }

    switchTab(tabName) {
        const tabs = ['users', 'timetable', 'subjects'];
        
        tabs.forEach(tab => {
            const el = document.getElementById(`admin-tab-${tab}`);
            const btn = document.getElementById(`admin-tab-btn-${tab}`);
            
            if (!el || !btn) return;
            
            if (tab === tabName) {
                el.classList.remove('hidden');
                btn.classList.add('active');
            } else {
                el.classList.add('hidden');
                btn.classList.remove('active');
            }
        });

        if (tabName === 'timetable') {
            this.loadTimetable();
        } else if (tabName === 'subjects') {
            this.loadSubjects();
        }
    }

    async loadAdminRoster() {
        try {
            let users = await window.fetchWithCache('/api/users');
            this.allUsers = users; // Cache for other uses like timetable filtering
            
            const filterName = document.getElementById('admin-filter-name')?.value.toLowerCase() || '';
            const filterRole = document.getElementById('admin-filter-role')?.value || '';
            const filterClass = document.getElementById('admin-filter-class')?.value.toLowerCase() || '';

            // Apply Filters
            users = users.filter(u => {
                if (u.role === 'Personal') return false; // Hide Personal users from Admin panel
                const nameMatch = u.name.toLowerCase().includes(filterName);
                const roleMatch = !filterRole || u.role === filterRole;
                const classMatch = !filterClass || (u.class_id && u.class_id.toLowerCase().includes(filterClass));
                return nameMatch && roleMatch && classMatch;
            });

            // Apply Sorting
            users.sort((a, b) => {
                let valA = a[this.sortField] || '';
                let valB = b[this.sortField] || '';
                
                if (typeof valA === 'string') valA = valA.toLowerCase();
                if (typeof valB === 'string') valB = valB.toLowerCase();

                if (valA < valB) return this.sortOrder === 'asc' ? -1 : 1;
                if (valA > valB) return this.sortOrder === 'asc' ? 1 : -1;
                return 0;
            });

            const tbody = document.getElementById('admin-roster-body');
            const lang = this.getLang();
            const dict = i18n[lang];
            
            tbody.innerHTML = users.map(u => {
                const roleName = u.role ? (dict[`role_${u.role.toLowerCase()}`] || u.role) : u.role;
                let subjectsDisplay = u.subjects && u.subjects.length > 0 
                    ? u.subjects.map(s => dict[`subj_${s}`] || s).join(', ')
                    : '<span class="text-gray-400">-</span>';
                
                if (u.role === 'Parent' && u.student_id) {
                    const student = users.find(s => s.id === u.student_id);
                    if (student) {
                        subjectsDisplay = `<span class="text-gray-500">Ученик:</span> ${student.name} <span class="text-gray-400">(${student.class_id || '-'})</span>`;
                    }
                }

                let roleColorClass = 'bg-gray-100 text-gray-700 border-gray-200';
                let roleIcon = 'user';
                let avatarColor = 'from-gray-100 to-gray-200 text-gray-600 border-gray-300';
                if (u.role === 'Admin') { 
                    roleColorClass = 'bg-rose-100 text-rose-800 border-rose-200 shadow-sm'; 
                    roleIcon = 'shield'; 
                    avatarColor = 'from-rose-100 to-rose-200 text-rose-700 border-rose-300';
                }
                else if (u.role === 'Teacher') { 
                    roleColorClass = 'bg-emerald-100 text-emerald-800 border-emerald-200 shadow-sm'; 
                    roleIcon = 'graduation-cap'; 
                    avatarColor = 'from-emerald-100 to-emerald-200 text-emerald-700 border-emerald-300';
                }
                else if (u.role === 'Student') { 
                    roleColorClass = 'bg-blue-100 text-blue-800 border-blue-200 shadow-sm'; 
                    roleIcon = 'book-open'; 
                    avatarColor = 'from-blue-100 to-blue-200 text-blue-700 border-blue-300';
                }
                else if (u.role === 'Parent') { 
                    roleColorClass = 'bg-purple-100 text-purple-800 border-purple-200 shadow-sm'; 
                    roleIcon = 'users'; 
                    avatarColor = 'from-purple-100 to-purple-200 text-purple-700 border-purple-300';
                }

                return `
                <tr class="hover:bg-blue-50/40 transition-all duration-200 group border-b-2 border-gray-50 last:border-0">
                    <td class="py-7 px-6">
                        <div class="flex items-center gap-4">
                            <div class="w-12 h-12 rounded-2xl bg-gradient-to-br ${avatarColor} flex items-center justify-center shadow-sm font-bold text-xl border">
                                ${u.name.charAt(0).toUpperCase()}
                            </div>
                            <span class="font-bold text-gray-800 text-lg">${u.name}</span>
                        </div>
                    </td>
                    <td class="py-7 px-6">
                        <span class="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border ${roleColorClass}">
                            <i data-lucide="${roleIcon}" class="w-4 h-4"></i>
                            ${roleName}
                        </span>
                    </td>
                    <td class="py-7 px-6 font-bold text-gray-700 text-lg">${u.class_id ? `<span class="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-lg border border-indigo-100 shadow-sm">${u.class_id}</span>` : '<span class="text-gray-400">-</span>'}</td>
                    <td class="py-7 px-6"><span class="text-base font-medium text-gray-600 bg-gray-50 px-3 py-1 rounded-lg border border-gray-100">${subjectsDisplay}</span></td>
                    <td class="py-7 px-6 font-mono font-semibold text-base text-gray-600 bg-gray-50/50 rounded-lg">${u.username}</td>
                    <td class="py-7 px-6 cursor-pointer text-gray-400 hover:text-gray-800 transition-colors" onclick="window.adminManager.promptPasswordReveal('${u.id}')">
                        <div class="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200 hover:border-gray-400 shadow-sm">
                            <span id="pwd-${u.id}" class="font-mono font-bold text-base tracking-widest">••••••••</span>
                            <i data-lucide="eye" class="w-4 h-4 opacity-50 group-hover:opacity-100 transition-opacity"></i>
                        </div>
                    </td>
                    <td class="py-7 px-6 text-right">
                        <div class="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button class="text-blue-500 hover:text-white bg-blue-50 hover:bg-blue-500 p-3 rounded-xl transition-all shadow-sm hover:shadow-md" onclick="window.adminManager.promptEditUser('${u.id}')" title="Редактировать">
                                <i data-lucide="edit-2" class="w-5 h-5"></i>
                            </button>
                            <button class="text-red-500 hover:text-white bg-red-50 hover:bg-red-500 p-3 rounded-xl transition-all shadow-sm hover:shadow-md" onclick="window.adminManager.promptDelete('${u.id}')" title="Удалить">
                                <i data-lucide="trash-2" class="w-5 h-5"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `}).join('');
            safeLucide();
        } catch (e) {
            console.error('Failed to load roster:', e);
        }
    }

    async promptEditUser(userId) {
        this.targetUserId = userId;
        try {
            const response = await fetch('/api/users');
            const users = await response.json();
            const user = users.find(u => u.id === userId);
            if (!user) return;

            const elements = [
                'admin-edit-name',
                'admin-edit-role',
                'admin-edit-class',
                'admin-edit-username',
                'admin-edit-password',
                'admin-edit-modal',
                'admin-edit-subjects-container',
                'admin-edit-student-container',
                'admin-edit-student'
            ];
            for (const id of elements) {
                const el = document.getElementById(id);
                if (!el) {
                    throw new Error(`Element with ID "${id}" not found in DOM`);
                }
            }

            const nameInput = document.getElementById('admin-edit-name');
            const roleInput = document.getElementById('admin-edit-role');
            const classInput = document.getElementById('admin-edit-class');
            const usernameInput = document.getElementById('admin-edit-username');
            const passwordInput = document.getElementById('admin-edit-password');
            const studentInput = document.getElementById('admin-edit-student');
            const modal = document.getElementById('admin-edit-modal');

            if (nameInput) nameInput.value = user.name;
            if (roleInput) roleInput.value = user.role;
            if (classInput) classInput.value = user.class_id || '';
            if (usernameInput) usernameInput.value = user.username;
            if (passwordInput) passwordInput.value = user.password;

            this.handleEditRoleChange();

            if (user.role === 'Parent' && user.student_id && studentInput) {
                // Wait a bit for populateStudents to finish if it was just triggered
                setTimeout(() => {
                    studentInput.value = user.student_id;
                }, 100);
            }

            if (user.role === 'Teacher' && user.subjects) {
                const checkboxes = document.querySelectorAll('input[name="edit-teacher-subject"]');
                checkboxes.forEach(cb => {
                    if (user.subjects.includes(cb.value)) {
                        cb.checked = true;
                    }
                });
            }

            if (modal) modal.classList.remove('hidden');
        } catch (e) {
            console.error('Failed to load user for edit:', e);
        }
    }

    async saveUserEdit() {
        if (!this.targetUserId) return;

        const name = document.getElementById('admin-edit-name').value.trim();
        const role = document.getElementById('admin-edit-role').value;
        const classId = document.getElementById('admin-edit-class').value;
        const username = document.getElementById('admin-edit-username').value.trim();
        const password = document.getElementById('admin-edit-password').value.trim();

        if (!name || !username || !password) {
            const lang = document.getElementById('settings-language')?.value || 'ru';
            const dict = i18n[lang];
            alert(dict.fill_all_fields || 'Please fill in all required fields');
            return;
        }

        let selectedSubjects = [];
        let studentId = null;

        if (role === 'Teacher') {
            const checkboxes = document.querySelectorAll('input[name="edit-teacher-subject"]:checked');
            selectedSubjects = Array.from(checkboxes).map(cb => cb.value);
        } else if (role === 'Parent') {
            studentId = document.getElementById('admin-edit-student').value;
        }

        const updatedUser = {
            name,
            role,
            class_id: (role === 'Admin' || role === 'Parent') ? null : classId,
            username,
            password,
            subjects: selectedSubjects,
            student_id: studentId
        };

        try {
            const response = await fetch(`/api/users/${this.targetUserId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedUser)
            });

            if (response.ok) {
                const modal = document.getElementById('admin-edit-modal');
                if (modal) modal.classList.add('hidden');
                this.allUsers = null; // Clear cache
                this.loadAdminRoster();
            } else {
                const lang = document.getElementById('settings-language')?.value || 'ru';
                const dict = i18n[lang];
                alert(dict.update_user_failed || 'Failed to update user');
            }
        } catch (e) {
            const lang = document.getElementById('settings-language')?.value || 'ru';
            const dict = i18n[lang];
            alert((dict.error_updating_user || 'Error updating user: ') + e.message);
        }
    }

    generatePassword() {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let pass = '';
        for (let i = 0; i < 6; i++) {
            pass += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return pass;
    }

    async createAccount() {
        const role = document.getElementById('admin-create-role').value;
        const name = document.getElementById('admin-create-name').value.trim();
        const classId = document.getElementById('admin-create-class').value;
        const resultEl = document.getElementById('admin-create-result');
        const lang = this.getLang();
        const dict = i18n[lang];

        if (!name) {
            alert(dict.name_required);
            return;
        }

        // Username Integrity: Exact Name entered, but lowercase for login
        const username = name.trim().toLowerCase();
        const password = this.generatePassword();

        // Collect selected subjects if teacher
        let selectedSubjects = [];
        let studentId = null;

        if (role === 'Teacher') {
            const checkboxes = document.querySelectorAll('input[name="teacher-subject"]:checked');
            selectedSubjects = Array.from(checkboxes).map(cb => cb.value);
        } else if (role === 'Parent') {
            studentId = document.getElementById('admin-create-student').value;
        }

        const newUser = {
            username,
            password,
            role,
            name,
            class_id: (role === 'Admin' || role === 'Parent') ? null : classId,
            subjects: selectedSubjects,
            student_id: studentId
        };

        try {
            const response = await fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newUser)
            });
            
            if (response.ok) {
                const roleName = role ? (dict[`role_${role.toLowerCase()}`] || role) : role;
                this.allUsers = null; // Clear cache
                this.loadAdminRoster();
                
                resultEl.innerHTML = `
                    <div class="space-y-3 p-2">
                        <div class="text-xl font-black text-emerald-700 mb-3 flex items-center gap-2">
                            <i data-lucide="check-circle" class="w-6 h-6"></i>
                            ${dict.account_created_success}
                        </div>
                        <div class="grid grid-cols-[140px_1fr] gap-y-3 gap-x-4 text-base items-center">
                            <span class="text-gray-500 font-bold uppercase tracking-wider text-xs">${dict.name_label.replace(':', '')}</span>
                            <span class="font-bold text-gray-900 text-lg">${name}</span>
                            
                            <span class="text-gray-500 font-bold uppercase tracking-wider text-xs">${dict.role_label.replace(':', '')}</span>
                            <span class="font-bold text-gray-800 underline decoration-emerald-200 decoration-4 underline-offset-4">${roleName}</span>
                            
                            <span class="text-gray-500 font-bold uppercase tracking-wider text-xs">${dict.class_label.replace(':', '')}</span>
                            <span class="font-bold text-gray-800">${classId || dict.none}</span>
                            
                            <span class="text-gray-500 font-bold uppercase tracking-wider text-xs">${dict.login_label.replace(':', '')}</span>
                            <span class="font-mono font-black text-indigo-700 bg-indigo-100/50 px-3 py-1 rounded-xl border border-indigo-200 w-fit shadow-sm text-xl">${username}</span>
                            
                            <span class="text-gray-500 font-bold uppercase tracking-wider text-xs">${dict.password_label.replace(':', '')}</span>
                            <span class="font-mono font-black text-rose-700 bg-rose-100/50 px-3 py-1 rounded-xl border border-rose-200 w-fit shadow-sm text-xl tracking-widest">${password}</span>
                        </div>
                        <div class="mt-4 pt-4 border-t border-emerald-100 text-xs text-emerald-600 font-medium italic">
                            * ${dict.save_credentials_hint || 'Пожалуйста, сохраните эти данные для пользователя'}
                        </div>
                    </div>
                `;
                if (window.lucide) window.lucide.createIcons();
                if (resultEl) resultEl.classList.remove('hidden');
            } else {
                const lang = document.getElementById('settings-language')?.value || 'ru';
                const dict = i18n[lang];
                alert(dict.create_user_failed || 'Failed to create user');
            }
        } catch (e) {
            const lang = document.getElementById('settings-language')?.value || 'ru';
            const dict = i18n[lang];
            alert((dict.error_creating_user || 'Error creating user: ') + e.message);
        }
    }

    promptPasswordReveal(userId) {
        this.targetUserId = userId;
        const verifyInput = document.getElementById('admin-verify-pass');
        const modal = document.getElementById('admin-password-modal');
        if (verifyInput) verifyInput.value = '';
        if (modal) modal.classList.remove('hidden');
    }

    async verifyAndReveal() {
        const verifyInput = document.getElementById('admin-verify-pass');
        if (!verifyInput) return;
        const inputPass = verifyInput.value;
        const currentUser = JSON.parse(sessionStorage.getItem('donishup_session_v2'));
        const lang = this.getLang();
        const dict = i18n[lang];
        
        if (inputPass === currentUser.password) {
            try {
                const response = await fetch('/api/users');
                const users = await response.json();
                const targetUser = users.find(u => u.id === this.targetUserId);
                if (targetUser) {
                    const pwdEl = document.getElementById(`pwd-${this.targetUserId}`);
                    if (pwdEl) pwdEl.textContent = targetUser.password;
                }
                const modal = document.getElementById('admin-password-modal');
                if (modal) modal.classList.add('hidden');
            } catch (e) {
                console.error('Failed to reveal password:', e);
            }
        } else {
            alert(dict.admin_password_error);
        }
    }

    promptDelete(userId) {
        this.targetUserId = userId;
        const modal = document.getElementById('confirm-delete-modal');
        if (modal) modal.classList.remove('hidden');
    }

    async confirmDelete() {
        if (!this.targetUserId) return;
        
        try {
            const response = await fetch(`/api/users/${this.targetUserId}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                const modal = document.getElementById('confirm-delete-modal');
                if (modal) modal.classList.add('hidden');
                this.allUsers = null; // Clear cache
                this.loadAdminRoster();
            } else {
                const lang = document.getElementById('settings-language')?.value || 'ru';
                const dict = i18n[lang];
                alert(dict.delete_user_failed || 'Failed to delete user');
            }
        } catch (e) {
            const lang = document.getElementById('settings-language')?.value || 'ru';
            const dict = i18n[lang];
            alert((dict.error_deleting_user || 'Error deleting user: ') + e.message);
        }
    }

    async loadTimetable() {
        const classId = document.getElementById('admin-timetable-class')?.value;
        const gridContainer = document.getElementById('admin-timetable-grid');
        if (!gridContainer) return;

        if (!classId) {
            gridContainer.innerHTML = '<p class="text-gray-500 text-center py-4">Выберите класс для отображения расписания</p>';
            return;
        }

        try {
            const [usersData, scheduleData] = await Promise.all([
                window.fetchWithCache('/api/users'),
                window.fetchWithCache('/api/schedule')
            ]);
            
            this.allUsers = usersData || [];
            
            if (scheduleData) {
                const schedule = scheduleData;
                const daysMap = {
                    'mon': 'Понедельник',
                    'tue': 'Вторник',
                    'wed': 'Среда',
                    'thu': 'Четверг',
                    'fri': 'Пятница'
                };
                const timesMap = {
                    '08:00': 1,
                    '08:50': 2,
                    '09:40': 3,
                    '10:40': 4,
                    '11:30': 5,
                    '12:20': 6,
                    '13:30': 7,
                    '14:20': 8
                };
                
                this.timetableData = schedule.map(s => ({
                    classId: s.class_id,
                    day: daysMap[s.dayOfWeek],
                    lesson: timesMap[s.time],
                    subject: s.type, // We use type as the subject identifier in admin
                    teacherId: s.teacher_id,
                    room: s.room
                })).filter(e => e.day && e.lesson); // Filter out any unmapped
            }
        } catch (e) {
            console.error('Failed to load timetable data:', e);
            if (!this.allUsers) this.allUsers = [];
        }

        const days = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница'];
        const lessons = 8;
        
        // Subject to color mapping for consistent colors
        const subjectColors = {
            'math': 'bg-blue-50 border-blue-200 text-blue-800',
            'physics': 'bg-indigo-50 border-indigo-200 text-indigo-800',
            'chemistry': 'bg-emerald-50 border-emerald-200 text-emerald-800',
            'biology': 'bg-green-50 border-green-200 text-green-800',
            'history': 'bg-amber-50 border-amber-200 text-amber-800',
            'literature': 'bg-rose-50 border-rose-200 text-rose-800',
            'english': 'bg-violet-50 border-violet-200 text-violet-800',
            'geography': 'bg-cyan-50 border-cyan-200 text-cyan-800',
            'informatics': 'bg-slate-50 border-slate-300 text-slate-800',
            'pe': 'bg-orange-50 border-orange-200 text-orange-800',
            'art_music': 'bg-fuchsia-50 border-fuchsia-200 text-fuchsia-800',
            'labor': 'bg-stone-50 border-stone-200 text-stone-800'
        };
        
        let html = '<div class="overflow-x-auto pb-4"><table class="w-full text-left border-collapse min-w-[1200px] table-fixed">';
        html += '<thead><tr class="bg-gradient-to-r from-blue-50/50 to-indigo-50/50"><th class="w-24 py-6 px-4 border-b-2 border-blue-100 text-blue-800 font-bold text-center uppercase tracking-wider text-sm">Урок</th>';
        days.forEach(day => {
            html += `<th class="py-6 px-4 border-b-2 border-blue-100 text-blue-800 font-bold text-center uppercase tracking-wider text-sm">${day}</th>`;
        });
        html += '</tr></thead><tbody class="divide-y-2 divide-gray-50">';

        for (let i = 1; i <= lessons; i++) {
            html += `<tr class="hover:bg-blue-50/30 transition-colors"><td class="py-6 px-4 border-r border-gray-50 text-center align-middle">
                <div class="w-12 h-12 mx-auto rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 text-blue-700 flex items-center justify-center font-bold text-xl shadow-sm border border-blue-200">${i}</div>
            </td>`;
            days.forEach(day => {
                const entry = this.timetableData.find(e => e.classId === classId && e.day === day && e.lesson === i);
                
                if (entry) {
                    // Find teacher name
                    let teacherName = 'Неизвестно';
                    if (this.allUsers) {
                        const t = this.allUsers.find(u => u.id == entry.teacherId);
                        if (t) teacherName = t.name;
                    }
                    
                    const lang = this.getLang();
                    const dict = i18n[lang];
                    const subjectLabel = dict[`subj_${entry.subject}`] || entry.subject;
                    const colorClass = subjectColors[entry.subject] || 'bg-gray-50 border-gray-200 text-gray-800';
                    
                    html += `<td class="p-4 cursor-pointer align-top" onclick="window.adminManager.openTimetableModal('${day}', ${i}, '${entry.subject}', '${entry.teacherId}')">
                        <div class="rounded-3xl border-2 p-5 ${colorClass} hover:shadow-xl hover:-translate-y-1 transition-all duration-300 h-full min-h-[120px] flex flex-col justify-between group relative overflow-hidden">
                            <div class="absolute -right-4 -top-4 opacity-10 group-hover:opacity-20 transition-opacity duration-300 transform group-hover:scale-110 group-hover:rotate-6">
                                <i data-lucide="book" class="w-20 h-20"></i>
                            </div>
                            <div class="font-bold text-lg leading-tight mb-4 relative z-10">${subjectLabel}</div>
                            <div class="text-sm opacity-90 flex items-center gap-2 font-semibold relative z-10 bg-white/50 px-3 py-1.5 rounded-xl w-fit shadow-sm backdrop-blur-sm">
                                <i data-lucide="user" class="w-4 h-4"></i>
                                <span class="truncate max-w-[120px]">${teacherName}</span>
                            </div>
                        </div>
                    </td>`;
                } else {
                    html += `<td class="p-4 text-center cursor-pointer align-top group" onclick="window.adminManager.openTimetableModal('${day}', ${i})">
                        <div class="rounded-3xl border-2 border-dashed border-gray-200 bg-gray-50/50 h-full min-h-[120px] flex justify-center items-center group-hover:bg-indigo-50 group-hover:border-indigo-300 transition-all duration-300">
                            <button class="w-12 h-12 rounded-2xl bg-white shadow-sm text-gray-400 group-hover:text-indigo-600 group-hover:shadow-md group-hover:scale-110 flex items-center justify-center transition-all duration-300">
                                <i data-lucide="plus" class="w-6 h-6"></i>
                            </button>
                        </div>
                    </td>`;
                }
            });
            html += '</tr>';
        }
        html += '</tbody></table></div>';
        gridContainer.innerHTML = html;
        
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    async openTimetableModal(day, lesson, subject = '', teacherId = '') {
        const classId = document.getElementById('admin-timetable-class')?.value;
        if (!classId) return;

        document.getElementById('admin-timetable-day').value = day;
        document.getElementById('admin-timetable-lesson').value = lesson;
        document.getElementById('admin-timetable-modal-title').textContent = `${day}, Урок ${lesson} (${classId})`;
        
        // Populate subjects
        const subjectSelect = document.getElementById('admin-timetable-subject');
        const subjects = window.allSubjects || [];
        const lang = this.getLang();
        const dict = i18n[lang];
        
        subjectSelect.innerHTML = `<option value="">Выберите предмет</option>` + 
            subjects.map(s => {
                const label = dict[`subj_${s.type}`] || s.name;
                return `<option value="${s.type}">${label}</option>`;
            }).join('');
            
        subjectSelect.value = subject;
        
        // Populate teachers
        await this.filterTeachersForTimetable(teacherId);

        const deleteBtn = document.getElementById('admin-timetable-delete-btn');
        if (subject && teacherId) {
            deleteBtn.classList.remove('hidden');
        } else {
            deleteBtn.classList.add('hidden');
        }

        document.getElementById('admin-timetable-conflict-msg').classList.add('hidden');
        document.getElementById('admin-timetable-modal').classList.remove('hidden');
    }

    async filterTeachersForTimetable(selectedTeacherId = '') {
        const subject = document.getElementById('admin-timetable-subject').value;
        const teacherSelect = document.getElementById('admin-timetable-teacher');
        const day = document.getElementById('admin-timetable-day').value;
        const lesson = parseInt(document.getElementById('admin-timetable-lesson').value, 10);
        const currentClassId = document.getElementById('admin-timetable-class').value;
        const conflictMsg = document.getElementById('admin-timetable-conflict-msg');
        
        conflictMsg.classList.add('hidden');
        
        try {
            if (!this.allUsers) {
                const response = await fetch('/api/users');
                if (response.ok) {
                    this.allUsers = await response.json();
                } else {
                    this.allUsers = [];
                }
            }
            
            // Get all teachers
            const allTeachers = this.allUsers.filter(u => u.role === 'Teacher');
            
            let html = '<option value="">Выберите учителя</option>';
            let hasConflictForSelected = false;

            // Sort teachers: those who teach the subject first (if subject is selected)
            const sortedTeachers = [...allTeachers].sort((a, b) => {
                if (!subject) return a.name.localeCompare(b.name);
                const aTeaches = a.subjects && a.subjects.includes(subject);
                const bTeaches = b.subjects && b.subjects.includes(subject);
                if (aTeaches && !bTeaches) return -1;
                if (!aTeaches && bTeaches) return 1;
                return a.name.localeCompare(b.name);
            });

            sortedTeachers.forEach(t => {
                const teachesSubject = subject && t.subjects && t.subjects.includes(subject);
                const subjectNote = (subject && !teachesSubject) ? ' (Не ведет этот предмет)' : '';
                
                // Check if teacher is busy at this day and lesson in ANOTHER class
                const busyEntry = this.timetableData.find(e => e.teacherId == t.id && e.day === day && e.lesson === lesson && e.classId !== currentClassId);
                
                if (busyEntry) {
                    html += `<option value="${t.id}" disabled>${t.name}${subjectNote} (Занят в ${busyEntry.classId})</option>`;
                    if (t.id == selectedTeacherId) {
                        hasConflictForSelected = true;
                    }
                } else {
                    html += `<option value="${t.id}">${t.name}${subjectNote}</option>`;
                }
            });
            
            teacherSelect.innerHTML = html;
            if (selectedTeacherId && !hasConflictForSelected) {
                teacherSelect.value = selectedTeacherId;
            } else if (hasConflictForSelected) {
                conflictMsg.classList.remove('hidden');
            }
        } catch (e) {
            console.error('Failed to filter teachers:', e);
        }
    }

    async saveTimetableEntry(event) {
        event.preventDefault();
        const classId = document.getElementById('admin-timetable-class').value;
        const day = document.getElementById('admin-timetable-day').value;
        const lesson = parseInt(document.getElementById('admin-timetable-lesson').value, 10);
        const subject = document.getElementById('admin-timetable-subject').value;
        const teacherId = document.getElementById('admin-timetable-teacher').value;
        
        if (!classId || !day || !lesson || !subject || !teacherId) return;

        const reverseDaysMap = {
            'Понедельник': 'mon',
            'Вторник': 'tue',
            'Среда': 'wed',
            'Четверг': 'thu',
            'Пятница': 'fri'
        };
        const reverseTimesMap = {
            1: '08:00',
            2: '08:50',
            3: '09:40',
            4: '10:40',
            5: '11:30',
            6: '12:20',
            7: '13:30',
            8: '14:20'
        };

        const dayOfWeek = reverseDaysMap[day];
        const time = reverseTimesMap[lesson];
        
        // Find subject name and icon
        const subjects = window.allSubjects || [];
        const subjObj = subjects.find(s => s.type === subject) || { name: subject, icon: 'book' };

        try {
            const response = await fetch('/api/schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    class_id: classId,
                    dayOfWeek,
                    time,
                    subject: subjObj.name,
                    type: subject,
                    icon: subjObj.icon,
                    teacher_id: teacherId,
                    room: '101' // Default room for now
                })
            });
            
            if (response.ok) {
                if (window.apiCache) window.apiCache.clear();
                document.getElementById('admin-timetable-modal').classList.add('hidden');
                this.loadTimetable();
            } else {
                alert('Failed to save timetable entry');
            }
        } catch (e) {
            console.error('Error saving timetable:', e);
            alert('Error saving timetable');
        }
    }

    async deleteTimetableEntry() {
        const classId = document.getElementById('admin-timetable-class').value;
        const day = document.getElementById('admin-timetable-day').value;
        const lesson = parseInt(document.getElementById('admin-timetable-lesson').value, 10);
        
        const reverseDaysMap = {
            'Понедельник': 'mon',
            'Вторник': 'tue',
            'Среда': 'wed',
            'Четверг': 'thu',
            'Пятница': 'fri'
        };
        const reverseTimesMap = {
            1: '08:00',
            2: '08:50',
            3: '09:40',
            4: '10:40',
            5: '11:30',
            6: '12:20',
            7: '13:30',
            8: '14:20'
        };

        const dayOfWeek = reverseDaysMap[day];
        const time = reverseTimesMap[lesson];

        try {
            const response = await fetch('/api/schedule', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    class_id: classId,
                    dayOfWeek,
                    time
                })
            });
            
            if (response.ok) {
                if (window.apiCache) window.apiCache.clear();
                document.getElementById('admin-timetable-modal').classList.add('hidden');
                this.loadTimetable();
            } else {
                alert('Failed to delete timetable entry');
            }
        } catch (e) {
            console.error('Error deleting timetable:', e);
            alert('Error deleting timetable');
        }
    }

    async loadSubjects() {
        try {
            const subjects = await window.fetchWithCache('/api/subjects');
            const tbody = document.getElementById('admin-subjects-body');
            if (!tbody) return;

            tbody.innerHTML = subjects.map(s => `
                <tr class="hover:bg-blue-50/30 transition-all duration-200 group border-b-2 border-gray-50 last:border-0">
                    <td class="py-8 px-8">
                        <span class="inline-flex items-center px-4 py-2 rounded-xl text-sm font-bold bg-gradient-to-r from-gray-100 to-gray-200 text-gray-700 font-mono shadow-sm border border-gray-300 group-hover:border-blue-300 group-hover:text-blue-700 transition-colors">${s.type}</span>
                    </td>
                    <td class="py-8 px-8 font-bold text-gray-800 text-lg flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shadow-inner">
                            <i data-lucide="book" class="w-5 h-5"></i>
                        </div>
                        ${s.name}
                    </td>
                    <td class="py-8 px-8 text-right">
                        <button class="p-3 text-red-400 hover:text-white hover:bg-red-500 rounded-xl transition-all shadow-sm hover:shadow-md opacity-0 group-hover:opacity-100 focus:opacity-100" onclick="window.adminManager.deleteSubject('${s.id}')" title="Удалить">
                            <i data-lucide="trash-2" class="w-5 h-5"></i>
                        </button>
                    </td>
                </tr>
            `).join('');
            
            if (window.lucide) {
                window.lucide.createIcons();
            }
        } catch (e) {
            console.error('Failed to load subjects:', e);
        }
    }

    async saveSubject() {
        const typeInput = document.getElementById('admin-subject-type');
        const nameInput = document.getElementById('admin-subject-name');
        
        const type = typeInput.value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
        const name = nameInput.value.trim();
        
        if (!type || !name) {
            alert('Пожалуйста, заполните все поля');
            return;
        }

        try {
            const response = await fetch('/api/subjects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, name })
            });

            if (response.ok) {
                if (window.apiCache) window.apiCache.clear();
                typeInput.value = '';
                nameInput.value = '';
                
                // Update global subjects list
                window.allSubjects = await window.fetchWithCache('/api/subjects');
                
                this.loadSubjects();
                this.populateSubjects();
                this.populateSubjects('admin-edit-subjects-list', 'edit-teacher-subject');
            } else {
                const data = await response.json();
                alert(data.message || 'Ошибка сохранения предмета');
            }
        } catch (e) {
            console.error('Error saving subject:', e);
            alert('Ошибка сохранения предмета');
        }
    }

    async deleteSubject(id) {
        const confirmed = await window.showConfirm('Вы уверены, что хотите удалить этот предмет?');
        if (!confirmed) return;

        try {
            const response = await fetch(`/api/subjects/${id}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                if (window.apiCache) window.apiCache.clear();
                
                // Update global subjects list
                window.allSubjects = await window.fetchWithCache('/api/subjects');
                
                this.loadSubjects();
                this.populateSubjects();
                this.populateSubjects('admin-edit-subjects-list', 'edit-teacher-subject');
            } else {
                const data = await response.json();
                alert(data.message || 'Ошибка удаления предмета');
            }
        } catch (e) {
            console.error('Error deleting subject:', e);
            alert('Ошибка удаления предмета');
        }
    }
}
