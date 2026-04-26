// js/games/chao/chao_garden_ui.js

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

export class ChaoGarden3D {
    constructor(container, stateManager, onChiClick) {
        this.container = container;
        this.state = stateManager;
        this.onChiClick = onChiClick;
        this.chiMeshes = [];
        this.clock = new THREE.Clock();
        this.animationId = null;

        this.dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1);
        this.dragTarget = null;
        this.holdTimer = null;

        if (this.container.clientWidth === 0) {
            console.warn("Container is 0x0. Waiting for resize...");
        }

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        
        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerMove = this.onPointerMove.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);
        
        this.container.addEventListener('pointerdown', this.onPointerDown);
        this.container.addEventListener('pointermove', this.onPointerMove);
        window.addEventListener('pointerup', this.onPointerUp);

        this.initScene();
        this.buildGarden();
        this.spawnChis();
        this.animate();
        
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(this.container);
    }

    initScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB); 
        this.scene.fog = new THREE.Fog(0x87CEEB, 15, 45);

        this.camera = new THREE.PerspectiveCamera(50, this.container.clientWidth / this.container.clientHeight, 0.1, 100);
        this.camera.position.set(15, 12, 15);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        
        // Ensure absolutely no mobile browser scrolling on canvas touch
        this.renderer.domElement.style.touchAction = 'none';

        this.container.appendChild(this.renderer.domElement);
        this.renderer.domElement.style.position = 'absolute';
        this.renderer.domElement.style.top = '0';
        this.renderer.domElement.style.left = '0';
        this.renderer.domElement.style.zIndex = '0';

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(20, 30, 10);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 1024;
        dirLight.shadow.mapSize.height = 1024;
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far = 50;
        dirLight.shadow.camera.left = -20;
        dirLight.shadow.camera.right = 20;
        dirLight.shadow.camera.top = 20;
        dirLight.shadow.camera.bottom = -20;
        this.scene.add(dirLight);
    }

    buildGarden() {
        const groundGeo = new THREE.CylinderGeometry(18, 19, 2, 32);
        const groundMat = new THREE.MeshLambertMaterial({ color: 0x4CAF50 }); 
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.position.y = -1;
        ground.receiveShadow = true;
        this.scene.add(ground);

        for (let i = 0; i < 12; i++) {
            const angle = Math.PI + (i / 11) * Math.PI; 
            const radius = 14 + Math.random() * 2;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            this.scene.add(this.createTree(x, z));
        }
    }

    createTree(x, z) {
        const treeGroup = new THREE.Group();

        const trunkGeo = new THREE.CylinderGeometry(0.4, 0.6, 2.5);
        const trunkMat = new THREE.MeshLambertMaterial({ color: 0x795548 });
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = 1.25;
        trunk.castShadow = true;
        treeGroup.add(trunk);

        const leavesGeo = new THREE.DodecahedronGeometry(2, 1);
        const leavesMat = new THREE.MeshLambertMaterial({ color: 0x2E7D32 });
        const leaves = new THREE.Mesh(leavesGeo, leavesMat);
        leaves.position.y = 3.5;
        leaves.castShadow = true;
        
        const leaves2 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.5, 1), leavesMat);
        leaves2.position.set(1, 2.5, 1);
        leaves2.castShadow = true;

        treeGroup.add(leaves);
        treeGroup.add(leaves2);
        treeGroup.position.set(x, 0, z);
        
        return treeGroup;
    }

    spawnChis() {
        const chisData = this.state.data.chis;
        chisData.forEach((chi, index) => {
            const geo = new THREE.SphereGeometry(1, 32, 32);
            
            const r = chi.dna.cheerfulness / 100;
            const b = chi.dna.calmness / 100;
            const g = chi.dna.kindness / 100;
            
            const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(r, g, b) });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.castShadow = true;
            
            mesh.position.set((index - chisData.length/2) * 2.5, 1, 0);
            
            mesh.userData = {
                chiId: chi.id,
                baseY: 1,
                bounceSpeed: 2 + Math.log10(chi.stats.agility + 1) * 0.8,
                moveSpeed: 0.3 + (chi.stats.agility / 99) * 1.5,
                offset: Math.random() * Math.PI * 2
            };

            this.scene.add(mesh);
            this.chiMeshes.push(mesh);
        });
    }

    onPointerDown(event) {
        if (!this.camera || event.target !== this.renderer.domElement) return;

        const rect = this.container.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.chiMeshes);
        
        if (intersects.length > 0) {
            const mesh = intersects[0].object;
            this.holdTimer = setTimeout(() => {
                this.dragTarget = mesh;
                mesh.scale.set(1.1, 1.3, 1.1);
            }, 250);

            mesh.scale.set(1.3, 0.7, 1.3);
            setTimeout(() => { if(mesh && this.dragTarget !== mesh) mesh.scale.set(1, 1, 1); }, 200);

            if (this.onChiClick) this.onChiClick(mesh.userData.chiId);
        } else {
            if (this.onChiClick) this.onChiClick(null);
        }
    }

    onPointerMove(event) {
        if (!this.camera || event.target !== this.renderer.domElement) return;

        const rect = this.container.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        if (this.dragTarget) {
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersectPoint = new THREE.Vector3();
            if (this.raycaster.ray.intersectPlane(this.dragPlane, intersectPoint)) {
                this.dragTarget.position.x = intersectPoint.x;
                this.dragTarget.position.z = intersectPoint.z;
                this.dragTarget.position.y = 3; 
            }
        }
    }

    onPointerUp(event) {
        if (this.holdTimer) {
            clearTimeout(this.holdTimer);
            this.holdTimer = null;
        }

        if (this.dragTarget) {
            this.dragTarget.scale.set(1, 1, 1);
            this.dragTarget.position.y = 1; 
            this.dragTarget = null;
        }
    }

    animate() {
        this.animationId = requestAnimationFrame(() => this.animate());
        const time = this.clock.getElapsedTime();

        this.chiMeshes.forEach(mesh => {
            if (this.dragTarget === mesh) {
                mesh.rotation.z = Math.sin(time * 15) * 0.2;
            } else {
                mesh.rotation.z = 0;
                const data = mesh.userData;
                mesh.position.y = data.baseY + Math.abs(Math.sin(time * data.bounceSpeed + data.offset)) * 0.5;
                mesh.position.x += Math.sin(time * data.moveSpeed * 0.5 + data.offset) * 0.01;
                mesh.position.z += Math.cos(time * data.moveSpeed * 0.3 + data.offset) * 0.01;
            }
        });

        this.renderer.render(this.scene, this.camera);
    }

    resize() {
        if (!this.camera || !this.renderer || this.container.clientWidth === 0) return;
        this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    }

    destroy() {
        if (this.animationId) cancelAnimationFrame(this.animationId);
        this.container.removeEventListener('pointerdown', this.onPointerDown);
        this.container.removeEventListener('pointermove', this.onPointerMove);
        window.removeEventListener('pointerup', this.onPointerUp);
        this.resizeObserver.disconnect();
        if (this.renderer.domElement.parentNode) {
            this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
        }
        this.renderer.dispose();
    }
}