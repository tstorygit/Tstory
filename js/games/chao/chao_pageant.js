import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { GameVocabManager } from '../../game_vocab_mgr.js';
import { getChiTrueStat } from './chao_state.js';

export class MatsuriPageant {
    constructor(vocabMgr, stateManager, renderArea, uiOverlay) {
        this.vocabMgr = vocabMgr;
        this.stateManager = stateManager;
        this.renderArea = renderArea;
        this.uiOverlay = uiOverlay;
        this.chiData = stateManager.getActiveChi();
        
        this.pStr = getChiTrueStat(this.chiData, 'strength');
        this.pAgi = getChiTrueStat(this.chiData, 'agility');
        this.pFly = getChiTrueStat(this.chiData, 'fly');
        this.pWis = getChiTrueStat(this.chiData, 'wisdom');

        if (GameVocabManager.loadSrsPool().length > 0) {
            this.vocabMgr.setPool(GameVocabManager.loadSrsPool(), 'chao_banned', { globalSrs: true });
        }
        
        this.clock = new THREE.Clock();
        this.animationId = null;
        this.uiInterval = null;
        this.thinkInterval = null;

        this.phase = 'INIT'; 
        this.targetPos = new THREE.Vector3(0, 1, 0);
        this.taskTime = 0;
        
        this.stations = [
            { type: 'CLIMB', pos: {x: -4, z: -4} },
            { type: 'VOCAB', pos: {x: 0, z: -1} },
            { type: 'FLY',   pos: {x: 4, z: -4} },
            { type: 'VOCAB', pos: {x: 4, z: 2} },
            { type: 'RUN',   pos: {x: -4, z: 2} }
        ];
        this.currentStationIdx = 0;

        if (this.renderArea.clientWidth === 0) {
            console.warn("Pageant container is 0x0. Waiting for resize...");
        }

        this.initScene();
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(this.renderArea);
    }

    initScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xFFE4E1);

        this.camera = new THREE.PerspectiveCamera(45, this.renderArea.clientWidth / this.renderArea.clientHeight, 0.1, 100);
        this.camera.position.set(0, 12, 18);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(this.renderArea.clientWidth, this.renderArea.clientHeight);
        this.renderer.shadowMap.enabled = true;
        
        this.renderArea.appendChild(this.renderer.domElement);
        
        const floorGeo = new THREE.CylinderGeometry(12, 12, 0.5, 32);
        const floorMat = new THREE.MeshLambertMaterial({ color: 0xFFB6C1 });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.receiveShadow = true;
        this.scene.add(floor);

        const geo = new THREE.SphereGeometry(1, 32, 32);
        const r = this.chiData.dna.cheerfulness / 100;
        const b = this.chiData.dna.calmness / 100;
        const g = this.chiData.dna.kindness / 100;
        const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(r, g, b) });
        this.chiMesh = new THREE.Mesh(geo, mat);
        this.chiMesh.position.set(0, 1, 8);
        this.chiMesh.castShadow = true;
        this.scene.add(this.chiMesh);
        
        // Climb Tower (Station 0)
        const blockGeo = new THREE.BoxGeometry(2, 12, 2);
        const blockMat = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
        this.climbTower = new THREE.Mesh(blockGeo, blockMat);
        this.climbTower.position.set(-4, 6, -4.5);
        this.climbTower.castShadow = true;
        this.scene.add(this.climbTower);

        // Fly Trampoline (Station 2)
        const trampGeo = new THREE.CylinderGeometry(2, 2, 0.5, 16);
        const trampMat = new THREE.MeshLambertMaterial({ color: 0x4682B4 });
        this.trampoline = new THREE.Mesh(trampGeo, trampMat);
        this.trampoline.position.set(4, 0.5, -4);
        this.scene.add(this.trampoline);

        // Vocab Puzzle Block (hidden by default)
        const pzGeo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
        const pzMat = new THREE.MeshLambertMaterial({ color: 0xFFA500 });
        this.puzzleBlock = new THREE.Mesh(pzGeo, pzMat);
        this.puzzleBlock.castShadow = true;
        this.puzzleBlock.visible = false;
        this.scene.add(this.puzzleBlock);
        
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(10, 20, 10);
        dirLight.castShadow = true;
        this.scene.add(dirLight);
    }

    startPageant() {
        this.currentStationIdx = 0;
        this.nextStation();
        this.animate();
    }

    nextStation() {
        this.chiMesh.scale.set(1, 1, 1);
        if (this.currentStationIdx >= this.stations.length) {
            this.phase = 'DONE';
            this.uiOverlay.innerHTML = `<h4 style="color:#50fa7b; text-align:center;">Course Complete! The judges loved it!</h4>`;
            return;
        }

        const st = this.stations[this.currentStationIdx];
        this.targetPos.set(st.pos.x, 1, st.pos.z);
        this.phase = 'WALKING';
        this.uiOverlay.innerHTML = `<p style="color:#aaa; text-align:center;">${this.chiData.name} is heading to the ${st.type} attraction...</p>`;

        if (st.type === 'VOCAB') {
            this.puzzleBlock.position.set(st.pos.x, 0.75, st.pos.z - 1.5);
            this.puzzleBlock.visible = true;
        } else {
            this.puzzleBlock.visible = false;
        }
    }

    executePhysicalTask() {
        const st = this.stations[this.currentStationIdx];
        this.taskTime = 0;
        
        if (st.type === 'CLIMB') {
            this.phase = 'TASK_CLIMB';
            this.uiOverlay.innerHTML = `<p style="color:#f1fa8c; text-align:center;">💪 ${this.chiData.name} is scaling the tower using Strength!</p>`;
        } else if (st.type === 'FLY') {
            this.phase = 'TASK_FLY';
            this.uiOverlay.innerHTML = `<p style="color:#8be9fd; text-align:center;">🦅 ${this.chiData.name} hits the trampoline using Fly!</p>`;
        } else if (st.type === 'RUN') {
            this.phase = 'TASK_RUN';
            this.targetPos.set(4, 1, 6); // Run far away fast
            this.uiOverlay.innerHTML = `<p style="color:#ffb86c; text-align:center;">🏃 ${this.chiData.name} sprints the track using Agility!</p>`;
        }
    }

    presentQuestion() {
        const challenge = this.vocabMgr.getNextWord();
        if (!challenge) {
            this.uiOverlay.innerHTML = `<h4>No words available! Moving to next event...</h4>`;
            setTimeout(() => {
                this.currentStationIdx++;
                this.nextStation();
            }, 1500);
            return;
        }

        this.uiOverlay.innerHTML = `
            <div style="background: rgba(0,0,0,0.3); padding: 15px; border-radius: 8px;">
                <p style="margin:0 0 10px 0; color: #ff79c6;">Judge: "What does <strong>${challenge.wordObj.kanji}</strong> mean?"</p>
                <div style="color: #f1fa8c;">
                    <span style="font-size: 20px;">🐾</span> ${this.chiData.name} is thinking... <span id="cp-timer" style="font-weight:bold;">3</span>
                </div>
            </div>
        `;

        let thinkTime = 3;
        const timerEl = this.uiOverlay.querySelector('#cp-timer');
        
        this.thinkInterval = setInterval(() => {
            thinkTime--;
            if (timerEl) timerEl.textContent = thinkTime;
            
            if (thinkTime <= 0) {
                clearInterval(this.thinkInterval);
                this.evaluateChiWisdom(challenge);
            }
        }, 1000);
    }

    evaluateChiWisdom(challenge) {
        const baseChance = Math.log10(this.pWis + 1) / 2; 
        const isSuccessful = Math.random() < baseChance;

        if (isSuccessful) {
            this.phase = 'CELEBRATE';
            this.puzzleBlock.visible = false;
            this.uiOverlay.innerHTML = `<div style="color: #50fa7b; font-weight:bold; text-align:center;">✨ ${this.chiData.name} answered confidently! "It's ${challenge.options[challenge.correctIdx]}!"</div>`;
            this.vocabMgr.gradeWord(challenge.refId, 3);
            setTimeout(() => {
                this.currentStationIdx++;
                this.nextStation();
            }, 2000);
        } else {
            this.triggerUserRescue(challenge);
        }
    }

    triggerUserRescue(challenge) {
        this.phase = 'RESCUE';
        this.uiOverlay.innerHTML += `
            <div id="cp-user-rescue" style="margin-top:15px;">
                <p style="color:#ff5555; font-weight:bold; margin-bottom: 10px;">💦 ${this.chiData.name} is panicking! Help!</p>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    ${challenge.options.map((opt, i) => `<button class="chao-action-btn cp-btn" data-idx="${i}" style="margin:0;">${opt}</button>`).join('')}
                </div>
                <div style="width: 100%; height: 6px; background: #333; margin-top: 10px; border-radius: 3px; overflow: hidden;">
                    <div id="cp-time-fill" style="width: 100%; height: 100%; background: #ff5555; transition: width 0.05s linear;"></div>
                </div>
            </div>
        `;

        let timeLeft = 5.0;
        const timeFill = this.uiOverlay.querySelector('#cp-time-fill');
        
        this.uiInterval = setInterval(() => {
            timeLeft -= 0.05;
            if (timeFill) timeFill.style.width = `${(timeLeft / 5.0) * 100}%`;
            
            if (timeLeft <= 0) {
                clearInterval(this.uiInterval);
                this.handleRescueResult(challenge, false); 
            }
        }, 50);

        const btns = this.uiOverlay.querySelectorAll('.cp-btn');
        btns.forEach(btn => {
            btn.addEventListener('click', () => {
                clearInterval(this.uiInterval);
                const isCorrect = parseInt(btn.dataset.idx) === challenge.correctIdx;
                this.handleRescueResult(challenge, isCorrect);
            });
        });
    }

    handleRescueResult(challenge, isCorrect) {
        this.vocabMgr.gradeWord(challenge.refId, isCorrect ? 2 : 0);

        if (isCorrect) {
            this.phase = 'CELEBRATE';
            this.puzzleBlock.visible = false;
            this.uiOverlay.innerHTML = `<div style="color: #50fa7b; font-weight:bold; text-align:center;">💖 You whispered the answer to ${this.chiData.name}! The judges loved it! (+Connection)</div>`;
            this.chiData.connection += 5; 
            this.stateManager.save();
            setTimeout(() => {
                this.currentStationIdx++;
                this.nextStation();
            }, 2000);
        } else {
            this.phase = 'SAD';
            this.uiOverlay.innerHTML = `<div style="color: #ff5555; font-weight:bold; text-align:center;">❌ Oh no... ${this.chiData.name} got it wrong. The judges are unimpressed.</div>`;
            setTimeout(() => {
                this.puzzleBlock.visible = false;
                this.currentStationIdx++;
                this.nextStation();
            }, 2500);
        }
    }

    animate() {
        this.animationId = requestAnimationFrame(() => this.animate());
        const delta = this.clock.getDelta();
        const time = this.clock.getElapsedTime();

        if (this.phase === 'WALKING') {
            const dist = this.chiMesh.position.distanceTo(this.targetPos);
            if (dist < 0.5) {
                const st = this.stations[this.currentStationIdx];
                if (st.type === 'VOCAB') {
                    this.phase = 'THINKING';
                    this.chiMesh.position.copy(this.targetPos);
                    this.presentQuestion();
                } else {
                    this.executePhysicalTask();
                }
            } else {
                const dir = this.targetPos.clone().sub(this.chiMesh.position).normalize();
                this.chiMesh.position.add(dir.multiplyScalar(delta * 4));
                this.chiMesh.position.y = 1 + Math.abs(Math.sin(time * 10)) * 0.5;
            }
        } else if (this.phase === 'TASK_CLIMB') {
            this.taskTime += delta;
            const climbSpeed = 1 + (this.pStr / 9999) * 5; 
            const maxHeight = 1 + (this.pStr / 9999) * 11;
            
            if (this.chiMesh.position.y < maxHeight) {
                this.chiMesh.position.y += climbSpeed * delta;
                this.chiMesh.position.x = -4 + Math.sin(time * 20) * 0.1; 
            }
            if (this.taskTime > 3.0) { 
                this.chiMesh.position.y = 1;
                this.currentStationIdx++;
                this.nextStation();
            }
        } else if (this.phase === 'TASK_FLY') {
            this.taskTime += delta;
            const jumpHeight = 2 + (this.pFly / 9999) * 13;
            const progress = this.taskTime / 3.0;
            if (progress <= 1) {
                this.chiMesh.position.y = 1 + Math.sin(progress * Math.PI) * jumpHeight;
            } else {
                this.chiMesh.position.y = 1;
                this.currentStationIdx++;
                this.nextStation();
            }
        } else if (this.phase === 'TASK_RUN') {
            this.taskTime += delta;
            const runSpeed = 5 + (this.pAgi / 9999) * 20;
            const dir = this.targetPos.clone().sub(this.chiMesh.position).normalize();
            this.chiMesh.position.add(dir.multiplyScalar(delta * runSpeed));
            // Fixed visual bounce frequency decoupled from distance traveled speed
            this.chiMesh.position.y = 1 + Math.abs(Math.sin(time * 15)) * 0.5;
            
            if (this.taskTime > 3.0) {
                this.currentStationIdx++;
                this.nextStation();
            }
        } else if (this.phase === 'THINKING' || this.phase === 'RESCUE') {
            this.chiMesh.rotation.y = Math.sin(time * 5) * 0.3;
        } else if (this.phase === 'CELEBRATE') {
            this.chiMesh.rotation.y = 0;
            this.chiMesh.position.y = 1 + Math.abs(Math.sin(time * 15)) * 1.5; 
        } else if (this.phase === 'SAD') {
            this.chiMesh.rotation.y = 0;
            this.chiMesh.scale.set(1.2, 0.5, 1.2);
            this.chiMesh.position.y = 0.5;
        }

        this.renderer.render(this.scene, this.camera);
    }

    resize() {
        if (!this.camera || !this.renderer || this.renderArea.clientWidth === 0) return;
        this.camera.aspect = this.renderArea.clientWidth / this.renderArea.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.renderArea.clientWidth, this.renderArea.clientHeight);
    }

    destroy() {
        if (this.animationId) cancelAnimationFrame(this.animationId);
        if (this.uiInterval) clearInterval(this.uiInterval);
        if (this.thinkInterval) clearInterval(this.thinkInterval);
        this.resizeObserver.disconnect();
        if (this.renderer.domElement.parentNode) {
            this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
        }
        this.renderer.dispose();
    }
}