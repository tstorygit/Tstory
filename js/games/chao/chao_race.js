// js/games/chao/chao_race.js

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { getChiTrueStat } from './chao_state.js';

export class ChaoRace3D {
    constructor(container, stateManager, onWinner) {
        this.container = container;
        this.state = stateManager;
        this.onWinner = onWinner;
        this.racers = [];
        this.ranking = [];
        this.clock = new THREE.Clock();
        this.animationId = null;

        this.currentLookAt = new THREE.Vector3(0, 0, 0);
        this.targetCamPos = new THREE.Vector3();
        this.targetLookAt = new THREE.Vector3();

        if (this.container.clientWidth === 0) {
            console.warn("Race container is 0x0. Waiting for resize...");
        }

        this.initScene();
        this.buildTrack();
        this.spawnRacers();
        this.animate();
        
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(this.container);
    }

    initScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB); 
        this.scene.fog = new THREE.Fog(0x87CEEB, 20, 120);

        this.camera = new THREE.PerspectiveCamera(50, this.container.clientWidth / this.container.clientHeight, 0.1, 200);
        this.camera.position.set(0, 15, 20);
        this.currentLookAt.set(0, 0, -20);
        this.camera.lookAt(this.currentLookAt);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        
        this.container.appendChild(this.renderer.domElement);

        this.nameTagContainer = document.createElement('div');
        this.nameTagContainer.style.position = 'absolute';
        this.nameTagContainer.style.top = '0';
        this.nameTagContainer.style.left = '0';
        this.nameTagContainer.style.width = '100%';
        this.nameTagContainer.style.height = '100%';
        this.nameTagContainer.style.pointerEvents = 'none';
        this.nameTagContainer.style.overflow = 'hidden';
        this.container.appendChild(this.nameTagContainer);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
        dirLight.position.set(30, 60, 20);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far = 150;
        dirLight.shadow.camera.left = -50;
        dirLight.shadow.camera.right = 50;
        dirLight.shadow.camera.top = 50;
        dirLight.shadow.camera.bottom = -150;
        this.scene.add(dirLight);
    }

    buildTrack() {
        const trackWidth = 40;
        
        const runGeo1 = new THREE.BoxGeometry(trackWidth, 1, 50);
        const runMat = new THREE.MeshLambertMaterial({ color: 0x4CAF50 });
        const runMesh1 = new THREE.Mesh(runGeo1, runMat);
        runMesh1.position.set(0, -0.5, -25);
        runMesh1.receiveShadow = true;
        this.scene.add(runMesh1);

        const swimGeo = new THREE.BoxGeometry(trackWidth, 2, 100);
        const swimMat = new THREE.MeshLambertMaterial({ color: 0x2196F3, transparent: true, opacity: 0.7 });
        const swimMesh = new THREE.Mesh(swimGeo, swimMat);
        swimMesh.position.set(0, -7, -100);
        this.scene.add(swimMesh);
        
        const poolFloorGeo = new THREE.BoxGeometry(trackWidth, 1, 100);
        const poolFloorMat = new THREE.MeshLambertMaterial({ color: 0x1976D2 });
        const poolFloor = new THREE.Mesh(poolFloorGeo, poolFloorMat);
        poolFloor.position.set(0, -8.5, -100);
        this.scene.add(poolFloor);

        // Wall: Z spans -150 to -152. Front face is -150.
        const wallGeo = new THREE.BoxGeometry(trackWidth, 16, 2);
        const wallMat = new THREE.MeshLambertMaterial({ color: 0x795548 });
        const wallMesh = new THREE.Mesh(wallGeo, wallMat);
        wallMesh.position.set(0, 0, -151); 
        wallMesh.receiveShadow = true;
        this.scene.add(wallMesh);

        const runGeo2 = new THREE.BoxGeometry(trackWidth, 1, 70);
        const runMesh2 = new THREE.Mesh(runGeo2, runMat);
        runMesh2.position.set(0, 7.5, -185);
        runMesh2.receiveShadow = true;
        this.scene.add(runMesh2);

        const finishGeo = new THREE.BoxGeometry(trackWidth, 3, 1);
        const finishMat = new THREE.MeshLambertMaterial({ color: 0xFF5722 }); 
        const finishMesh = new THREE.Mesh(finishGeo, finishMat);
        finishMesh.position.set(0, 9, -215);
        this.scene.add(finishMesh);
    }

    spawnRacers() {
        const playerChi = this.state.getActiveChi();
        
        const pStam = getChiTrueStat(playerChi, 'stamina');
        const pStr = getChiTrueStat(playerChi, 'strength');
        const pAgi = getChiTrueStat(playerChi, 'agility');
        const pWis = getChiTrueStat(playerChi, 'wisdom');
        const pSwim = getChiTrueStat(playerChi, 'swim');
        const pFly = getChiTrueStat(playerChi, 'fly');

        const maxStat = 9999;
        const vary = (val) => Math.max(1, Math.min(maxStat, val + Math.floor((Math.random() * 1500) - 750)));

        const participants = [ { chi: playerChi, isPlayer: true, 
            runSpeed: 2 + (pAgi/maxStat) * 50, swimSpeed: 1 + (pSwim/maxStat) * 30, flySpeed: 3 + (pFly/maxStat) * 45, flyDist: 2 + (pFly/maxStat)*98, climbSpeed: 1 + (pStr/maxStat) * 20 } ];
        
        for(let i=1; i<=4; i++) {
            const rAgi = vary(pAgi); const rSwim = vary(pSwim); const rFly = vary(pFly); const rStr = vary(pStr);
            participants.push({
                isPlayer: false,
                chi: {
                    name: `Rival ${i}`,
                    dna: { cheerfulness: Math.random()*100, calmness: Math.random()*100, kindness: Math.random()*100 },
                },
                runSpeed: 2 + (rAgi/maxStat) * 50,
                swimSpeed: 1 + (rSwim/maxStat) * 30,
                flySpeed: 3 + (rFly/maxStat) * 45,
                flyDist: 2 + (rFly/maxStat) * 98,
                climbSpeed: 1 + (rStr/maxStat) * 20
            });
        }

        const spacing = 30 / participants.length;
        const startX = -((participants.length - 1) * spacing) / 2;

        participants.forEach((data, index) => {
            const geo = new THREE.SphereGeometry(1, 32, 32);
            let mat;
            
            if (data.isPlayer) {
                const r = data.chi.dna.cheerfulness / 100;
                const b = data.chi.dna.calmness / 100;
                const g = data.chi.dna.kindness / 100;
                mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(r, g, b), emissive: 0x444400 });
            } else {
                mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(Math.random(), Math.random(), Math.random()) });
            }

            const mesh = new THREE.Mesh(geo, mat);
            mesh.castShadow = true;
            mesh.position.set(startX + (index * spacing), 1, 0);

            this.scene.add(mesh);

            const tag = document.createElement('div');
            tag.className = 'race-name-tag';
            tag.textContent = data.chi.name;
            if(data.isPlayer) tag.style.color = '#f1fa8c';
            this.nameTagContainer.appendChild(tag);

            this.racers.push({
                chi: data.chi,
                isPlayer: data.isPlayer,
                mesh: mesh,
                state: 'START',
                xOffset: mesh.position.x,
                flyTargetZ: -50 - data.flyDist,
                speeds: data,
                nameTag: tag
            });
        });
    }

    animate() {
        this.animationId = requestAnimationFrame(() => this.animate());
        const delta = this.clock.getDelta();
        const time = this.clock.getElapsedTime();

        let leadZ = 0;
        let leadY = 0;
        let packCenterX = 0;
        let playerRacer = null;

        this.racers.forEach(racer => {
            if (racer.isPlayer) playerRacer = racer;
            if (racer.state !== 'FINISHED') {
                this.updateRacer(racer, delta, time);
            }
            packCenterX += racer.mesh.position.x;
            if (racer.mesh.position.z < leadZ) {
                leadZ = racer.mesh.position.z;
                leadY = racer.mesh.position.y;
            }

            const vector = racer.mesh.position.clone();
            vector.y += 1.5;
            vector.project(this.camera);
            if (vector.z < 1) {
                racer.nameTag.style.display = 'block';
                const x = (vector.x * 0.5 + 0.5) * this.container.clientWidth;
                const y = (vector.y * -0.5 + 0.5) * this.container.clientHeight;
                racer.nameTag.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
            } else {
                racer.nameTag.style.display = 'none';
            }
        });
        
        packCenterX /= this.racers.length;

        if (playerRacer && playerRacer.state === 'CLIMB') {
            this.targetCamPos.set(0, 10, -110);
            this.targetLookAt.set(0, 8, -151);
        } else {
            const sweepX = packCenterX + Math.sin(time * 0.4) * 25;
            this.targetCamPos.set(sweepX, Math.max(12, leadY + 18), leadZ + 35);
            this.targetLookAt.set(packCenterX, leadY, leadZ - 10);
        }

        this.camera.position.lerp(this.targetCamPos, 0.04);
        this.currentLookAt.lerp(this.targetLookAt, 0.05);
        this.camera.lookAt(this.currentLookAt);

        this.renderer.render(this.scene, this.camera);
    }

    updateRacer(racer, delta, time) {
        const z = racer.mesh.position.z;
        let speed = 0;

        if (z > -50) {
            racer.state = 'RUN1';
            speed = racer.speeds.runSpeed;
            racer.mesh.position.z -= speed * delta;
            // Visual bounce rate is fixed, distance covered is scaled
            racer.mesh.position.y = 1 + Math.abs(Math.sin(time * 15)) * 0.6;
        } 
        else if (z > racer.flyTargetZ) {
            racer.state = 'FLY';
            speed = racer.speeds.flySpeed;
            racer.mesh.position.z -= speed * delta;
            
            const totalDist = Math.abs(racer.flyTargetZ - (-50));
            const traveled = Math.abs(z - (-50));
            const progress = Math.min(1, traveled / totalDist);
            
            racer.mesh.position.y = 1 - (progress * 7) + (Math.sin(time * 5) * 0.2);
        } 
        else if (z > -150) {
            racer.state = 'SWIM';
            speed = racer.speeds.swimSpeed;
            racer.mesh.position.z -= speed * delta;
            racer.mesh.position.y = -6 + Math.sin(time * 8 + racer.xOffset) * 0.4;
        } 
        else if (racer.mesh.position.y < 8) {
            racer.state = 'CLIMB';
            racer.mesh.position.z = -149.2; // Snaps to the front face of the wall so it peaks out cleanly
            
            speed = racer.speeds.climbSpeed;
            racer.mesh.position.y += speed * delta;
            racer.mesh.position.x = racer.xOffset + Math.sin(time * 15) * 0.3;
        } 
        else if (z > -215) {
            racer.state = 'RUN2';
            speed = racer.speeds.runSpeed;
            racer.mesh.position.z -= speed * delta;
            
            racer.mesh.position.x = racer.xOffset;
            racer.mesh.position.y = 9 + Math.abs(Math.sin(time * 15)) * 0.6;
        } 
        else {
            racer.state = 'FINISHED';
            racer.mesh.position.y = 9;
            this.ranking.push(racer.chi);
            
            if (this.ranking.length === 1 && this.onWinner) {
                this.onWinner(racer.chi);
            }
        }
    }

    resize() {
        if (!this.camera || !this.renderer || this.container.clientWidth === 0) return;
        this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    }

    destroy() {
        if (this.animationId) cancelAnimationFrame(this.animationId);
        this.resizeObserver.disconnect();
        if (this.nameTagContainer && this.nameTagContainer.parentNode) {
            this.nameTagContainer.parentNode.removeChild(this.nameTagContainer);
        }
        if (this.renderer.domElement.parentNode) {
            this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
        }
        this.renderer.dispose();
    }
}