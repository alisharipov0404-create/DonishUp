import { i18n } from './i18n.js';

export class AuthManager {
    constructor() {
        this.currentUser = null;
        this.setupListeners();
    }

    setupListeners() {
        document.getElementById('login-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.login();
        });

        document.getElementById('google-signin-btn').addEventListener('click', () => {
            this.mockGoogleSignIn();
        });

        document.getElementById('logout-btn').addEventListener('click', () => {
            this.logout();
        });

        // Make admin functions globally available for inline onclick
        window.adminCreateAccount = () => {
            if (window.adminManager) {
                window.adminManager.createAccount();
            } else {
                console.error("AdminManager not initialized");
            }
        };

        // Initialize 3D Background
        this.init3DBackground();
        
        // Initialize About Us Cursor Effect
        this.initCursorEffect();
    }

    init3DBackground() {
        if (!window.THREE) return;
        
        // Defensive check for WebGL support
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (!gl) {
                console.warn("WebGL not supported, skipping 3D background");
                return;
            }
        } catch (e) {
            console.warn("WebGL check failed, skipping 3D background", e);
            return;
        }

        const container = document.createElement('div');
        container.id = 'login-3d-canvas';
        const loginScreen = document.getElementById('login-screen');
        if (!loginScreen) return;
        loginScreen.prepend(container);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        
        let renderer;
        try {
            renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
            renderer.setSize(window.innerWidth, window.innerHeight);
            container.appendChild(renderer.domElement);
        } catch (e) {
            console.error("Failed to create WebGLRenderer:", e);
            return;
        }

        // Create abstract geometry
        const geometry = new THREE.IcosahedronGeometry(1, 1);
        const material = new THREE.MeshBasicMaterial({ 
            color: 0x14b8a6, 
            wireframe: true,
            transparent: true,
            opacity: 0.3
        });
        const sphere = new THREE.Mesh(geometry, material);
        scene.add(sphere);

        // Particles
        const particlesGeometry = new THREE.BufferGeometry();
        const particlesCount = 500;
        const posArray = new Float32Array(particlesCount * 3);
        
        for(let i = 0; i < particlesCount * 3; i++) {
            posArray[i] = (Math.random() - 0.5) * 10;
        }
        
        particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
        const particlesMaterial = new THREE.PointsMaterial({
            size: 0.02,
            color: 0x3b82f6
        });
        const particlesMesh = new THREE.Points(particlesGeometry, particlesMaterial);
        scene.add(particlesMesh);

        camera.position.z = 3;

        const animate = () => {
            if (document.getElementById('login-screen').classList.contains('hidden')) return;
            
            requestAnimationFrame(animate);
            sphere.rotation.x += 0.002;
            sphere.rotation.y += 0.002;
            particlesMesh.rotation.y -= 0.0005;
            
            renderer.render(scene, camera);
        };

        animate();

        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    initCursorEffect() {
        const loginScreen = document.getElementById('login-screen');
        const img = document.createElement('img');
        img.src = 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=200&q=80'; // Team photo
        img.className = 'cursor-trail-img';
        document.body.appendChild(img);

        const label = document.createElement('div');
        label.className = 'about-us-cursor-area';
        label.innerHTML = '<h2 data-i18n="about_us_title">About Us</h2><p data-i18n="about_us_hover">Hover to see the team</p>';
        loginScreen.appendChild(label);

        label.addEventListener('mouseenter', () => {
            img.classList.add('visible');
        });

        label.addEventListener('mouseleave', () => {
            img.classList.remove('visible');
        });

        document.addEventListener('mousemove', (e) => {
            if (img.classList.contains('visible')) {
                img.style.left = e.clientX + 'px';
                img.style.top = e.clientY + 'px';
            }
        });
    }

    async checkSession() {
        const savedUser = sessionStorage.getItem('donishup_session_v2');
        if (savedUser) {
            this.currentUser = JSON.parse(savedUser);
            return true;
        }
        return false;
    }

    async login() {
        const classId = document.getElementById('login-class').value;
        const user = document.getElementById('username').value.trim().toLowerCase();
        const pass = document.getElementById('password').value.trim();
        const errorEl = document.getElementById('login-error');
        
        const lang = document.getElementById('settings-language').value || 'ru';
        const dict = i18n[lang];

        if (!classId && !user) {
            errorEl.textContent = dict.login_error_select_class;
            errorEl.classList.remove('hidden');
            return;
        }

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: user, password: pass, classId })
            });

            if (response.ok) {
                const data = await response.json();
                this.currentUser = data.user;
                sessionStorage.setItem('donishup_session_v2', JSON.stringify(data.user));

                if (window.showMainApp) window.showMainApp();
            } else {
                errorEl.textContent = dict.login_error_invalid;
                errorEl.classList.remove('hidden');
            }
        } catch (error) {
            console.error('Login error:', error);
            errorEl.textContent = 'Server error. Please try again later.';
            errorEl.classList.remove('hidden');
        }
    }

    async mockGoogleSignIn() {
        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: 'personal1', password: '123' })
            });

            if (response.ok) {
                const data = await response.json();
                this.currentUser = data.user;
                sessionStorage.setItem('donishup_session_v2', JSON.stringify(data.user));

                if (window.showMainApp) window.showMainApp();
            }
        } catch (error) {
            console.error('Google Sign-In error:', error);
        }
    }

    logout() {
        sessionStorage.removeItem('donishup_session_v2');
        this.currentUser = null;
        document.body.classList.remove('is-admin');
        document.getElementById('main-screen').classList.add('hidden');
        document.getElementById('login-screen').classList.remove('hidden');
        document.getElementById('username').value = '';
        document.getElementById('password').value = '';
        window.dispatchEvent(new Event('user-logout'));
    }
}
