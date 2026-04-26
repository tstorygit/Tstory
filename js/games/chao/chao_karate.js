// js/games/chao/chao_karate.js

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { getChiTrueStat } from './chao_state.js';

export class ChaoKarate3D {
    constructor(container, stateManager, uiContainer) {
        this.container = container;
        this.state = stateManager;
        this.uiContainer = uiContainer;
        
        this.logEl = this.uiContainer.querySelector('#karate-log');
        this.resultEl = this.uiContainer.querySelector('#karate-result');

        this.clock = new THREE.Clock();
        this.animationId = null;
        this.isMatchOver = false;

        this.setupFighters();
        this.initScene();
        this.updateDOMHP();

        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(this.container);

        this.logMessage("The match begins! Bow!");
        
        setTimeout(() => this.combatTurn(), 2000);
        this.animate();
    }

    setupFighters() {
        const p1Chi = this.state.getActiveChi();
        
        const pStam = getChiTrueStat(p1Chi, 'stamina');
        const pStr = getChiTrueStat(p1Chi, 'strength');
        const pAgi = getChiTrueStat(p1Chi, 'agility');
        const pWis = getChiTrueStat(p1Chi, 'wisdom');
        
        const vary = (val) => Math.max(1, Math.min(9999, val + Math.floor((Math.random() * 1000) - 500)));
        
        const rStam = vary(pStam);
        const rStr = vary(pStr);
        const rAgi = vary(pAgi);
        const rWis = vary(pWis);

        const rivalChi = {
            name: "Rival",
            dna: { cheerfulness: Math.random()*100, calmness: Math.random()*100, kindness: Math.random()*100 },
        };

        const hp1 = Math.floor(pStam * 2 + 100);
        const hp2 = Math.floor(rStam * 2 + 100);

        this.fighters = [
            { id: 1, chi: p1Chi, maxHp: hp1, hp: hp1, str: pStr, agi: pAgi, wis: pWis, stam: pStam, mesh: null, startX: -3 },
            { id: 2, chi: rivalChi, maxHp: hp2, hp: hp2, str: rStr, agi: rAgi, wis: rWis, stam: rStam, mesh: null, startX: 3 }
        ];

        this.turnIndex = pAgi >= rAgi ? 0 : 1; 
        this.animState = { active: false, attackerIdx: 0, progress: 0 };
    }

    initScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x222233);

        this.camera = new THREE.PerspectiveCamera(45, this.container.clientWidth / this.container.clientHeight, 0.1, 100);
        this.camera.position.set(0, 5, 12);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.shadowMap.enabled = true;
        
        this.renderer.domElement.style.touchAction = 'none';
        this.container.appendChild(this.renderer.domElement);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        const spotLight = new THREE.SpotLight(0xffffff, 1.5);
        spotLight.position.set(0, 15, 5);
        spotLight.angle = Math.PI / 4;
        spotLight.penumbra = 0.5;
        spotLight.castShadow = true;
        this.scene.add(spotLight);

        const matGeo = new THREE.BoxGeometry(10, 0.5, 6);
        const matMat = new THREE.MeshLambertMaterial({ color: 0xD4C4A8 });
        const matMesh = new THREE.Mesh(matGeo, matMat);
        matMesh.position.y = -0.25;
        matMesh.receiveShadow = true;
        this.scene.add(matMesh);

        this.fighters.forEach(f => {
            const geo = new THREE.SphereGeometry(1, 32, 32);
            const r = f.chi.dna.cheerfulness / 100;
            const b = f.chi.dna.calmness / 100;
            const g = f.chi.dna.kindness / 100;
            const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(r, g, b) });
            
            f.mesh = new THREE.Mesh(geo, mat);
            f.mesh.position.set(f.startX, 1, 0);
            f.mesh.castShadow = true;
            this.scene.add(f.mesh);
        });
    }

    combatTurn() {
        if (this.isMatchOver) return;

        const attacker = this.fighters[this.turnIndex];
        const defender = this.fighters[this.turnIndex === 0 ? 1 : 0];

        let damage = Math.max(1, 10 + (attacker.str - defender.stam) * 0.05);
        let dodgeChance = Math.max(0.05, Math.min(0.95, 0.10 + (defender.agi - attacker.agi) / 10000));
        let critChance = Math.max(0.05, Math.min(0.95, 0.10 + (attacker.wis - defender.wis) / 10000));

        let hitResultText = "";
        let finalDamage = 0;

        if (Math.random() < dodgeChance) {
            hitResultText = "Dodged!";
        } else {
            if (Math.random() < critChance) {
                finalDamage = Math.floor(damage * 1.5);
                hitResultText = `CRITICAL HIT! (${finalDamage} dmg)`;
            } else {
                finalDamage = Math.floor(damage);
                hitResultText = `Hits for ${finalDamage} dmg.`;
            }
        }

        this.animState = { active: true, attackerIdx: this.turnIndex, progress: 0 };

        setTimeout(() => {
            if (finalDamage > 0) {
                defender.hp = Math.max(0, defender.hp - finalDamage);
                this.updateDOMHP();
                
                defender.mesh.scale.set(1.2, 0.8, 1.2);
                setTimeout(() => defender.mesh.scale.set(1,1,1), 150);
            }

            this.logMessage(`<b>${attacker.chi.name}</b> attacks... ${hitResultText}`);

            if (defender.hp <= 0) {
                this.isMatchOver = true;
                this.logMessage(`<b>${defender.chi.name}</b> fainted!`);
                this.resultEl.innerHTML = `<span style="color:#50fa7b;">${attacker.chi.name} Wins the match!</span>`;
                this.resultEl.style.display = 'block';
                return;
            }

            this.turnIndex = this.turnIndex === 0 ? 1 : 0;
            setTimeout(() => this.combatTurn(), 1500);

        }, 400); 
    }

    animate() {
        this.animationId = requestAnimationFrame(() => this.animate());
        const time = this.clock.getElapsedTime();

        this.fighters.forEach((f, i) => {
            if (f.hp > 0 && !(this.animState.active && this.animState.attackerIdx === i)) {
                f.mesh.position.y = 1 + Math.abs(Math.sin(time * 3 + i)) * 0.2;
            }
        });

        if (this.animState.active) {
            this.animState.progress += 0.05; 
            const p = this.animState.progress;
            const attacker = this.fighters[this.animState.attackerIdx];
            const directionX = attacker.startX < 0 ? 1 : -1;

            if (p < 0.5) {
                const curve = Math.sin(p * Math.PI); 
                attacker.mesh.position.x = attacker.startX + (directionX * 4.5 * curve);
                attacker.mesh.position.y = 1 + (curve * 0.5); 
            } else if (p < 1.0) {
                const curve = Math.sin(p * Math.PI); 
                attacker.mesh.position.x = attacker.startX + (directionX * 4.5 * curve);
                attacker.mesh.position.y = 1 + (curve * 0.5);
            } else {
                this.animState.active = false;
                attacker.mesh.position.x = attacker.startX;
            }
        }

        this.fighters.forEach(f => {
            if (f.hp <= 0) {
                f.mesh.position.y = 0.5;
                f.mesh.scale.set(1.2, 0.4, 1.2); 
            }
        });

        this.renderer.render(this.scene, this.camera);
    }

    logMessage(html) {
        const div = document.createElement('div');
        div.innerHTML = html;
        this.logEl.appendChild(div);
        this.logEl.scrollTop = this.logEl.scrollHeight;
    }

    updateDOMHP() {
        const hp1 = this.fighters[0].hp;
        const max1 = this.fighters[0].maxHp;
        const hp2 = this.fighters[1].hp;
        const max2 = this.fighters[1].maxHp;
        
        const txt1 = this.uiContainer.querySelector('#karate-hp-text-p1');
        const fill1 = this.uiContainer.querySelector('#karate-hp-fill-p1');
        if (txt1) txt1.textContent = `${hp1}/${max1}`;
        if (fill1) fill1.style.width = `${(hp1/max1)*100}%`;
        
        const txt2 = this.uiContainer.querySelector('#karate-hp-text-p2');
        const fill2 = this.uiContainer.querySelector('#karate-hp-fill-p2');
        if (txt2) txt2.textContent = `${hp2}/${max2}`;
        if (fill2) fill2.style.width = `${(hp2/max2)*100}%`;
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
        if (this.renderer.domElement.parentNode) {
            this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
        }
        this.renderer.dispose();
    }
}