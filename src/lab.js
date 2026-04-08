import { i18n } from './i18n.js';

export class LabManager {
    constructor() {
        this.anatomyViewer = null;
        this.lifeViewer = null;
    }

    init() {
        this.anatomyViewer = document.getElementById('anatomy-viewer');
        this.lifeViewer = document.getElementById('life-viewer');
    }

    uploadModel(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const blob = new Blob([e.target.result], { type: 'model/gltf-binary' });
            const url = URL.createObjectURL(blob);
            if (this.anatomyViewer) {
                this.anatomyViewer.src = url;
            }
        };
        reader.readAsArrayBuffer(file);
    }

    loadLifeModel(type) {
        if (!this.lifeViewer) this.init();
        
        // Using placeholder URLs for demonstration as requested
        const models = {
            'space': 'https://modelviewer.dev/shared-assets/models/Astronaut.glb', // Replace with Space model
            'heart': 'https://modelviewer.dev/shared-assets/models/Astronaut.glb', // Replace with Heart model
            'body': 'https://modelviewer.dev/shared-assets/models/Astronaut.glb',  // Replace with Body model
            'cell': 'https://modelviewer.dev/shared-assets/models/Astronaut.glb'   // Replace with Cell model
        };

        if (this.lifeViewer) {
            this.lifeViewer.src = models[type] || models['space'];
        }
    }

    // New features for 3D Life
    explodeModel() {
        if (!this.lifeViewer) return;
        const lang = document.getElementById('settings-language')?.value || 'ru';
        const dict = i18n[lang];
        alert(dict.lab_explode_alert || "Exploding model to explore parts (requires model with separate parts)");
    }

    showInternalView() {
        if (!this.lifeViewer) return;
        const lang = document.getElementById('settings-language')?.value || 'ru';
        const dict = i18n[lang];
        alert(dict.lab_internal_alert || "Showing internal view of the model");
    }
}
