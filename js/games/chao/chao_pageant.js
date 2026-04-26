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

        this.judgeAppeal = 0; 

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
        this.initUI();
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
        this.renderer.domElement.style.touchAction = 'none';
        
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
        
        // Climb Tower
        const blockGeo = new THREE.BoxGeometry(2, 12, 2);
        const blockMat = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
        this.climbTower = new THREE.Mesh(blockGeo, blockMat);
        this.climbTower.position.set(-4, 6, -4.5);
        this.climbTower.castShadow = true;
        this.scene.add(this.climbTower);

        // Fly Trampoline
        const trampGeo = new THREE.CylinderGeometry(2, 2, 0.5, 16);
        const trampMat = new THREE.MeshLambertMaterial({ color: 0x4682B4 });
        this.trampoline = new THREE.Mesh(trampGeo, trampMat);
        this.trampoline.position.set(4, 0.5, -4);
        this.scene.add(this.trampoline);

        // Vocab Puzzle Blocks
        const pzGeo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
        const pzMat = new THREE.MeshLambertMaterial({ color: 0xFFA500 });
        this.puzzleBlock1 = new THREE.Mesh(pzGeo, pzMat);
        this.puzzleBlock1.castShadow = true;
        this.puzzleBlock1.position.set(0, 0.75, -2.5); 
        this.scene.add(this.puzzleBlock1);

        this.puzzleBlock2 = new THREE.Mesh(pzGeo, pzMat);
        this.puzzleBlock2.castShadow = true;
        this.puzzleBlock2.position.set(4, 0.75, 0.5); 
        this.scene.add(this.puzzleBlock2);

        // Sprint Track
        const trackGeo = new THREE.BoxGeometry(10, 0.05, 1.5);
        const trackMat = new THREE.MeshLambertMaterial({ color: 0xCD5C5C });
        this.sprintTrack = new THREE.Mesh(trackGeo, trackMat);
        this.sprintTrack.position.set(0, 0.26, 2); 
        this.scene.add(this.sprintTrack);
        
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(10, 20, 10);
        dirLight.castShadow = true;
        this.scene.add(dirLight);
    }

    initUI() {
        this.uiOverlay.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                <span style="font-weight:bold; color:#ff79c6; min-width: 90px; font-size:14px;">Judge Appeal:</span>
                <div style="flex:1; height:15px; background:#444; border-radius:8px; border:2px solid #222; overflow:hidden;">
                    <div id="judge-meter-fill" style="width: 0%; height:100%; background:linear-gradient(90deg, #ff5555, #f1fa8c, #50fa7b); transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);"></div>
                </div>
                <span id="judge-meter-text" style="font-weight:bold; color:#fff; min-width: 40px; text-align:right; font-size:14px;">0%</span>
            </div>
            <div id="pageant-msg-area" style="min-height: 100px;"></div>
        `;
        this.msgArea = this.uiOverlay.querySelector('#pageant-msg-area');
    }

    addAppeal(amount) {
        this.judgeAppeal = Math.max(0, Math.min(100, this.judgeAppeal + amount));
        const fill = this.uiOverlay.querySelector('#judge-meter-fill');
        const txt = this.uiOverlay.querySelector('#judge-meter-text');
        if (fill) fill.style.width = `${this.judgeAppeal}%`;
        if (txt) txt.textContent = `${this.judgeAppeal}%`;
    }

    startPageant() {
        this.currentStationIdx = 0;
        this.judgeAppeal = 0;
        this.addAppeal(0); 
        this.nextStation();
        this.animate();
    }

    nextStation() {
        this.chiMesh.scale.set(1, 1, 1);
        if (this.currentStationIdx >= this.stations.length) {
            this.phase = 'DONE';
            let finalMsg = "";
            if (this.judgeAppeal >= 80) finalMsg = "🏆 A Flawless Performance! The crowd goes wild!";
            else if (this.judgeAppeal >= 50) finalMsg = "🏅 A solid effort! The judges nod in approval.";
            else finalMsg = "😅 Well, they tried their best! Room for improvement!";

            this.msgArea.innerHTML = `
                <h3 style="color:#50fa7b; text-align:center; margin:0 0 5px 0;">Course Complete!</h3>
                <p style="text-align:center; color:#eee; margin:0 0 5px 0;">Final Appeal: <b>${this.judgeAppeal}%</b></p>
                <p style="text-align:center; color:#f1fa8c; margin:0;">${finalMsg}</p>
            `;
            return;
        }

        const st = this.stations[this.currentStationIdx];
        this.targetPos.set(st.pos.x, 1, st.pos.z);
        this.phase = 'WALKING';
        this.msgArea.innerHTML = `<p style="color:#aaa; text-align:center; margin:0;">${this.chiData.name} is heading to the ${st.type} attraction...</p>`;
    }

    executePhysicalTask() {
        const st = this.stations[this.currentStationIdx];
        this.taskTime = 0;
        
        if (st.type === 'CLIMB') {
            this.phase = 'TASK_CLIMB';
            this.msgArea.innerHTML = `<p style="color:#f1fa8c; text-align:center; margin:0;">💪 ${this.chiData.name} is scaling the tower using Strength!</p>`;
        } else if (st.type === 'FLY') {
            this.phase = 'TASK_FLY';
            this.msgArea.innerHTML = `<p style="color:#8be9fd; text-align:center; margin:0;">🦅 ${this.chiData.name} hits the trampoline using Fly!</p>`;
        } else if (st.type === 'RUN') {
            this.phase = 'TASK_RUN';
            this.targetPos.set(-4, 1, 2); 
            this.msgArea.innerHTML = `<p style="color:#ffb86c; text-align:center; margin:0;">🏃 ${this.chiData.name} sprints the track using Agility!</p>`;
        }
    }

    finishPhysicalTask(statValue) {
        const points = Math.floor((statValue / 9999) * 15) + 5;
        this.addAppeal(points);
        this.currentStationIdx++;
        this.nextStation();
    }

    presentQuestion() {
        const challenge = this.vocabMgr.getNextWord();
        if (!challenge) {
            this.msgArea.innerHTML = `<h4 style="margin:0;">No words available! Moving to next event...</h4>`;
            setTimeout(() => {
                this.currentStationIdx++;
                this.nextStation();
            }, 1500);
            return;
        }

        this.msgArea.innerHTML = `
            <div style="background: rgba(0,0,0,0.3); padding: 15px; border-radius: 8px;">
                <p style="margin:0 0 10px 0; color: #ff79c6;">Judge: "What does <strong>${challenge.wordObj.kanji}</strong> mean?"</p>
                <div style="color: #f1fa8c;">
                    <span style="font-size: 20px;">🐾</span> ${this.chiData.name} is thinking... <span id="cp-timer" style="font-weight:bold;">3</span>
                </div>
            </div>
        `;

        let thinkTime = 3;
        const timerEl = this.msgArea.querySelector('#cp-timer');
        
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
            this.addAppeal(20);
            this.msgArea.innerHTML = `<div style="color: #50fa7b; font-weight:bold; text-align:center;">✨ ${this.chiData.name} answered confidently! "It's ${challenge.options[challenge.correctIdx]}!"</div>`;
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
        this.msgArea.innerHTML += `
            <div id="cp-user-rescue" style="margin-top:10px;">
                <p style="color:#ff5555; font-weight:bold; margin-bottom: 5px; text-align:center;">💦 ${this.chiData.name} is panicking! Help!</p>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                    ${challenge.options.map((opt, i) => `<button class="chao-action-btn cp-btn" data-idx="${i}" style="margin:0; padding:8px;">${opt}</button>`).join('')}
                </div>
                <div style="width: 100%; height: 6px; background: #333; margin-top: 8px; border-radius: 3px; overflow: hidden;">
                    <div id="cp-time-fill" style="width: 100%; height: 100%; background: #ff5555; transition: width 0.05s linear;"></div>
                </div>
            </div>
        `;

        let timeLeft = 5.0;
        const timeFill = this.msgArea.querySelector('#cp-time-fill');
        
        this.uiInterval = setInterval(() => {
            timeLeft -= 0.05;
            if (timeFill) timeFill.style.width = `${(timeLeft / 5.0) * 100}%`;
            
            if (timeLeft <= 0) {
                clearInterval(this.uiInterval);
                this.handleRescueResult(challenge, false); 
            }
        }, 50);

        const btns = this.msgArea.querySelectorAll('.cp-btn');
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
            this.addAppeal(15); 
            this.msgArea.innerHTML = `<div style="color: #50fa7b; font-weight:bold; text-align:center;">💖 You whispered the answer to ${this.chiData.name}! The judges loved it! (+Connection)</div>`;
            this.chiData.connection += 5; 
            this.stateManager.save();
            setTimeout(() => {
                this.currentStationIdx++;
                this.nextStation();
            }, 2000);
        } else {
            this.phase = 'SAD';
            this.addAppeal(-5); 
            this.msgArea.innerHTML = `<div style="color: #ff5555; font-weight:bold; text-align:center;">❌ Oh no... ${this.chiData.name} got it wrong. The judges are unimpressed.</div>`;
            setTimeout(() => {
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
                this.finishPhysicalTask(this.pStr);
            }
        } else if (this.phase === 'TASK_FLY') {
            this.taskTime += delta;
            const jumpHeight = 2 + (this.pFly / 9999) * 13;
            const progress = this.taskTime / 3.0;
            if (progress <= 1) {
                this.chiMesh.position.y = 1 + Math.sin(progress * Math.PI) * jumpHeight;
            } else {
                this.chiMesh.position.y = 1;
                this.finishPhysicalTask(this.pFly);
            }
        } else if (this.phase === 'TASK_RUN') {
            this.taskTime += delta;
            const runSpeed = 5 + (this.pAgi / 9999) * 20;
            const dir = this.targetPos.clone().sub(this.chiMesh.position).normalize();
            this.chiMesh.position.add(dir.multiplyScalar(delta * runSpeed));
            this.chiMesh.position.y = 1 + Math.abs(Math.sin(time * 15)) * 0.5;
            
            if (this.taskTime > 3.0) {
                this.finishPhysicalTask(this.pAgi);
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