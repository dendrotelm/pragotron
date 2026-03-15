import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// --- BAZA POŁĄCZEŃ I ZAGROŻEŃ ---
const DESTINATIONS = [
  "WROCŁAW GŁÓWNY", "KRAKÓW GŁÓWNY", "WARSZAWA CENTR.", "GDAŃSK OLIWA", 
  "POZNAŃ GŁÓWNY", "SZCZECIN GŁÓWNY", "KATOWICE", "LUBLIN", 
  "BYDGOSZCZ", "BIAŁYSTOK", "ŁÓDŹ FABRYCZNA", "OPOLE GŁÓWNE"
];

const THREATS = ["U C I E K A J", "O D W R O C  S I E", "P A T R Z Y M Y", "Z A K O N C Z"];

// --- USTAWIENIA FIZYKI I KAMERY ---
const PLAYER_HEIGHT = 2.8; 
const BOARD_Y = 5.5;

// --- 1. OPTYMALIZACJA CANVASÓW I TEKSTUR ---
const pragoCanvas = document.createElement("canvas");
pragoCanvas.width = 1024; pragoCanvas.height = 512;
const pragoCtx = pragoCanvas.getContext("2d");
const pragoTex = new THREE.CanvasTexture(pragoCanvas);

function updatePragotronTex(schedule, anomalyOpts = {}) {
  const { isRolling = false, anomalyIndex = -1, isDead = false, isGlitch = false, powerOut = false } = anomalyOpts;
  
  if (powerOut) {
      pragoCtx.fillStyle = "#050505"; pragoCtx.fillRect(0,0,1024,512);
      pragoTex.needsUpdate = true;
      return;
  }

  pragoCtx.fillStyle = "#111"; pragoCtx.fillRect(0,0,1024,512);
  
  if (isDead) {
      pragoCtx.fillStyle = "#cc0000"; pragoCtx.font = "bold 72px monospace";
      pragoCtx.fillText("S Y S T E M   K R Y T Y C Z N Y", 50, 250);
      pragoTex.needsUpdate = true;
      return;
  }

  pragoCtx.strokeStyle = "#333"; pragoCtx.lineWidth = 4; pragoCtx.strokeRect(2, 2, 1020, 508);
  pragoCtx.fillStyle = "#222"; pragoCtx.fillRect(10, 10, 1004, 60);
  pragoCtx.fillStyle = "#a88a40"; pragoCtx.font = "bold 24px monospace";
  pragoCtx.fillText("GODZINA", 30, 45); pragoCtx.fillText("KIERUNEK", 250, 45); pragoCtx.fillText("PERON", 750, 45); pragoCtx.fillText("OPÓŹNIENIE", 850, 45);

  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-: ";
  const rndStr = (len) => Array.from({length: len}).map(() => chars[Math.floor(Math.random() * chars.length)]).join('');

  schedule.forEach((train, i) => {
      const y = 90 + i * 80;
      pragoCtx.fillStyle = "#050505"; pragoCtx.fillRect(20, y, 984, 70);
      
      const isThisAnomaly = anomalyIndex === i;
      pragoCtx.fillStyle = isThisAnomaly ? "#cc0000" : "#eee";
      pragoCtx.font = "bold 48px monospace";

      const needsChaos = isRolling || (isThisAnomaly && isGlitch);

      const displayTime = needsChaos ? rndStr(5) : train.time;
      const displayDest = needsChaos ? rndStr(15) : train.destination;
      const displayPlat = needsChaos ? rndStr(1) : train.platform;
      const displayDel  = needsChaos ? rndStr(2) : train.delay;

      pragoCtx.fillText(displayTime, 30, y + 50);
      pragoCtx.fillText(displayDest, 250, y + 50);
      pragoCtx.fillText(displayPlat, 780, y + 50);
      pragoCtx.fillText(displayDel, 900, y + 50);
      
      pragoCtx.fillStyle = "rgba(0,0,0,0.6)"; pragoCtx.fillRect(20, y + 33, 984, 4);
  });
  
  pragoTex.needsUpdate = true;
}

function mkConcrete(darkness = 0.2) {
  const c = document.createElement("canvas"); c.width = 512; c.height = 512; const g = c.getContext("2d");
  g.fillStyle = `rgba(0,0,0,${darkness})`; g.fillRect(0,0,512,512);
  for(let i=0; i<3000; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random()*0.04})`;
      g.fillRect(Math.random()*512, Math.random()*512, Math.random()*4, Math.random()*4);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  return tex;
}
const texFloor = mkConcrete(0.3);
const texWall = mkConcrete(0.1);

// --- 2. GŁÓWNY KOMPONENT GRY ---
export default function PrzeplotniaGame() {
  const mountRef = useRef(null);
  
  const R = useRef({}); 
  const S = useRef({
      keys: {}, yaw: 0, pitch: 0, dx: 0, dy: 0, drag: false,
      vel: 0, lastDirX: 0, lastDirY: 0,
      
      gameState: 'PLAYING', 
      day: 1,
      score: 0,
      shiftTime: 22 * 60,
      endTime: 30 * 60, 
      
      trueSchedule: [],
      displaySchedule: [],
      dailyCode: "0000",
      
      hasAnomaly: false,
      anomalyIndex: -1,
      anomalyType: '', 
      anomalyTimer: 0,
      isRolling: false,
      terminalOpen: false,
      fuseBoxOpen: false,
      stressActive: false,
      
      powerActive: true
  });

  const [ui, setUi] = useState({ 
      timeStr: "22:00", 
      message: "ZMIANA ROZPOCZĘTA. ZAPOZNAJ SIĘ Z PROCEDURAMI.", 
      promptText: "",
      gameState: 'PLAYING',
      warningLevel: 0,
      day: 1,
      score: 0,
      paperSchedule: [],
      dailyCode: "0000",
      powerActive: true
  });

  const [terminal, setTerminal] = useState({ open: false, inputTime: "", inputDest: "", inputCode: "", error: "" });
  const [fuseBox, setFuseBox] = useState(false);
  const [fuses, setFuses] = useState([false, false, false]); 

  const generateDailyData = () => {
      const newSchedule = [];
      const usedDest = new Set();
      for(let i=0; i<4; i++) {
          let dest;
          do { dest = DESTINATIONS[Math.floor(Math.random() * DESTINATIONS.length)]; } while (usedDest.has(dest));
          usedDest.add(dest);
          const hr = 22 + Math.floor(Math.random() * 6);
          const mn = Math.floor(Math.random() * 60).toString().padStart(2, '0');
          const hrStr = hr >= 24 ? `0${hr-24}` : hr.toString();
          
          newSchedule.push({
              id: i,
              time: `${hrStr}:${mn}`,
              destination: dest,
              platform: (Math.floor(Math.random() * 4) + 1).toString(),
              delay: Math.random() > 0.7 ? (Math.floor(Math.random() * 3) * 5 + 5).toString().padStart(2, '0') : "00"
          });
      }
      const newCode = Math.floor(1000 + Math.random() * 9000).toString();
      return { schedule: newSchedule, code: newCode };
  };

  useEffect(() => {
      const mount = mountRef.current; if(!mount) return;
      const sr = S.current;

      const dailyData = generateDailyData();
      sr.trueSchedule = dailyData.schedule;
      sr.dailyCode = dailyData.code;
      sr.displaySchedule = JSON.parse(JSON.stringify(sr.trueSchedule));
      
      setUi(p => ({...p, paperSchedule: sr.trueSchedule, dailyCode: sr.dailyCode}));
      updatePragotronTex(sr.displaySchedule);

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      renderer.shadowMap.enabled = true;
      mount.innerHTML = ''; 
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x010101);
      scene.fog = new THREE.FogExp2(0x010101, 0.08);

      const cam = new THREE.PerspectiveCamera(70, mount.clientWidth / mount.clientHeight, 0.6, 50);
      cam.position.set(0, PLAYER_HEIGHT, 2); cam.rotation.order = "YXZ";
      scene.add(cam);

      // AUDIO SETUP
      const listener = new THREE.AudioListener();
      cam.add(listener);
      const audioCtx = listener.context;
      
      const playFlapSound = () => {
          if (audioCtx.state === 'suspended') audioCtx.resume();
          const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
          osc.type = 'square'; osc.frequency.setValueAtTime(120, audioCtx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.05);
          gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);
          osc.connect(gain); gain.connect(audioCtx.destination);
          osc.start(); osc.stop(audioCtx.currentTime + 0.05);
      };

      const playSiren = () => {
          if (audioCtx.state === 'suspended') audioCtx.resume();
          const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(400, audioCtx.currentTime);
          osc.frequency.linearRampToValueAtTime(800, audioCtx.currentTime + 1.5);
          osc.frequency.linearRampToValueAtTime(400, audioCtx.currentTime + 3.0);
          gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
          osc.connect(gain); gain.connect(audioCtx.destination);
          osc.start();
          setInterval(() => {
              if(S.current.gameState === 'GAMEOVER') {
                  osc.frequency.setValueAtTime(400, audioCtx.currentTime);
                  osc.frequency.linearRampToValueAtTime(800, audioCtx.currentTime + 1.5);
                  osc.frequency.linearRampToValueAtTime(400, audioCtx.currentTime + 3.0);
              } else {
                  osc.stop(); gain.disconnect();
              }
          }, 3000);
      };

      const playHeartbeat = () => {
          if (audioCtx.state === 'suspended') audioCtx.resume();
          const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(50, audioCtx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(20, audioCtx.currentTime + 0.2);
          gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
          osc.connect(gain); gain.connect(audioCtx.destination);
          osc.start(); osc.stop(audioCtx.currentTime + 0.4);
      };

      const playPowerDown = () => {
          if (audioCtx.state === 'suspended') audioCtx.resume();
          const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(100, audioCtx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(10, audioCtx.currentTime + 1.0);
          gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1.0);
          osc.connect(gain); gain.connect(audioCtx.destination);
          osc.start(); osc.stop(audioCtx.currentTime + 1.0);
      };

      const playPowerUp = () => {
          if (audioCtx.state === 'suspended') audioCtx.resume();
          const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
          osc.type = 'square';
          osc.frequency.setValueAtTime(30, audioCtx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(150, audioCtx.currentTime + 0.5);
          gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
          gain.gain.linearRampToValueAtTime(0.0, audioCtx.currentTime + 0.6);
          osc.connect(gain); gain.connect(audioCtx.destination);
          osc.start(); osc.stop(audioCtx.currentTime + 0.6);
      };

      const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
      scene.add(ambientLight);
      
      const flashlight = new THREE.SpotLight(0xffeedd, 1.2, 15, Math.PI/6, 0.5, 1);
      flashlight.position.set(0, 0, 0); flashlight.target.position.set(0, 0, -1);
      cam.add(flashlight); cam.add(flashlight.target);

      const SM = o => new THREE.MeshStandardMaterial(o);

      // --- ŚCIANY I PODŁOGA (ZAMKNIĘTY BUNKIER) ---
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), SM({ map: texFloor, roughness: 0.9 }));
      floor.rotation.x = -Math.PI / 2; scene.add(floor);
      
      // Przesunięto ścianę frontową w głąb (Z = -8.5), żeby biurko miało miejsce
      const wallFront = new THREE.Mesh(new THREE.PlaneGeometry(30, 12), SM({ map: texWall, roughness: 1.0 }));
      wallFront.position.set(0, 6, -8.5); 
      scene.add(wallFront);
      
      const wallBack = new THREE.Mesh(new THREE.PlaneGeometry(30, 12), SM({ map: texWall, roughness: 1.0 }));
      wallBack.position.set(0, 6, 8.0); 
      wallBack.rotation.y = Math.PI;
      scene.add(wallBack);

      // Dodane ściany boczne, zamykające pokój
      const wallLeft = new THREE.Mesh(new THREE.PlaneGeometry(30, 12), SM({ map: texWall, roughness: 1.0 }));
      wallLeft.position.set(-7.0, 6, 0); 
      wallLeft.rotation.y = Math.PI / 2;
      scene.add(wallLeft);

      const wallRight = new THREE.Mesh(new THREE.PlaneGeometry(30, 12), SM({ map: texWall, roughness: 1.0 }));
      wallRight.position.set(7.0, 6, 0); 
      wallRight.rotation.y = -Math.PI / 2;
      scene.add(wallRight);

      // --- ŁADOWANIE MODELI GLB ---
      const loader = new GLTFLoader();
      
      // GŁÓWNA KONSOLA
      loader.load('/computer.glb', (gltf) => {
          const model = gltf.scene;
          const box = new THREE.Box3().setFromObject(model);
          const size = box.getSize(new THREE.Vector3());
          // Zmniejszyłem lekko skalę, żeby konsola nie wgniatała się w boczne ściany
          const scale = 11.0 / Math.max(size.x, size.y, size.z); 
          model.scale.set(scale, scale, scale);
          const center = box.getCenter(new THREE.Vector3());
          // Konsola przesunięta do Z = -5.0 (ściana frontowa to -8.5, jest luz)
          model.position.set(-center.x * scale, 0, -center.z * scale - 5.0); 
          model.traverse((child) => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; if (child.material) child.material.roughness = 0.9; }});
          scene.add(model);
      }, undefined, (err) => console.error("Błąd modelu computer.glb", err));

      // ZASILANIE
      loader.load('/power.glb', (gltf) => {
          const model = gltf.scene;
          const box = new THREE.Box3().setFromObject(model);
          const size = box.getSize(new THREE.Vector3());
          const scale = 3.0 / Math.max(size.x, size.y, size.z); 
          model.scale.set(scale, scale, scale);
          const center = box.getCenter(new THREE.Vector3());
          model.position.set(-center.x * scale + 3, 0, -center.z * scale + 7.2); 
          model.rotation.y = Math.PI;
          model.traverse((child) => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; }});
          scene.add(model);
      }, undefined, (err) => console.error("Błąd modelu power.glb", err));

      // SKRZYNKA BEZPIECZNIKÓW
      loader.load('/fuse.glb', (gltf) => {
          const model = gltf.scene;
          const box = new THREE.Box3().setFromObject(model);
          const size = box.getSize(new THREE.Vector3());
          const scale = 1.0 / Math.max(size.x, size.y, size.z); 
          model.scale.set(scale, scale, scale);
          const center = box.getCenter(new THREE.Vector3());
          model.position.set(-center.x * scale, 2.0, -center.z * scale + 7.8); 
          model.rotation.y = Math.PI;
          model.traverse((child) => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; }});
          scene.add(model);
      }, undefined, (err) => {
          const breakerBox = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.2), SM({ color: 0x333333, metalness: 0.5 }));
          breakerBox.position.set(0, 2.0, 7.9);
          scene.add(breakerBox);
      });

      // PRAGOTRON (Dosunięty do nowej ściany)
      const pragotronMat = new THREE.MeshBasicMaterial({ map: pragoTex });
      const pragotronBoard = new THREE.Mesh(new THREE.BoxGeometry(4.5, 2.25, 0.1), pragotronMat);
      pragotronBoard.position.set(0, BOARD_Y, -8.4); 
      scene.add(pragotronBoard);
      
      const boardGlow = new THREE.PointLight(0xffb300, 0.8, 10);
      boardGlow.position.set(0, BOARD_Y, -8.0); scene.add(boardGlow);
      
      const breakerLightMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
      const breakerLightMesh = new THREE.Mesh(new THREE.SphereGeometry(0.1), breakerLightMat);
      breakerLightMesh.position.set(0, 2.8, 7.7); 
      scene.add(breakerLightMesh);
      
      const breakerGlow = new THREE.PointLight(0x00ff00, 0.5, 3);
      breakerGlow.position.set(0, 2.8, 7.4);
      scene.add(breakerGlow);

      R.current = { renderer, cam, scene, pragotronMat, boardGlow, ambientLight, flashlight, playFlapSound, playSiren, playHeartbeat, playPowerDown, playPowerUp, breakerLightMat, breakerGlow };

      // --- INPUT ---
      const onMD = (e) => { if(e.button===0 && !sr.terminalOpen && !sr.fuseBoxOpen && sr.gameState==='PLAYING') { sr.drag=true; sr.dx=e.clientX; sr.dy=e.clientY; }};
      const onMU = () => { sr.drag = false; };
      const onMM = (e) => {
          if(!sr.drag || sr.terminalOpen || sr.fuseBoxOpen || sr.gameState!=='PLAYING') return;
          sr.yaw -= (e.clientX - sr.dx) * 0.005;
          sr.pitch = Math.max(-0.8, Math.min(0.8, sr.pitch - (e.clientY - sr.dy) * 0.005));
          sr.dx = e.clientX; sr.dy = e.clientY;
      };
      const onKD = (e) => { 
          if(sr.gameState !== 'PLAYING') return;
          
          if(sr.terminalOpen && e.code === 'Escape') {
              sr.terminalOpen = false; setTerminal(p => ({...p, open: false})); return;
          }
          if(sr.fuseBoxOpen && e.code === 'Escape') {
              sr.fuseBoxOpen = false; setFuseBox(false); return;
          }

          sr.keys[e.code] = true; 
          
          if(e.code === 'KeyE' && !sr.terminalOpen && !sr.fuseBoxOpen) {
              const distToDesk = cam.position.distanceTo(new THREE.Vector3(0, PLAYER_HEIGHT, -2.5));
              const distToBreaker = cam.position.distanceTo(new THREE.Vector3(0, PLAYER_HEIGHT, 7.5)); 
              
              if (distToDesk < 4.0 && sr.powerActive) {
                  sr.terminalOpen = true; sr.keys = {}; sr.vel = 0;
                  setTerminal({ open: true, inputTime: "", inputDest: "", inputCode: "", error: "" });
              } else if (distToBreaker < 4.0 && !sr.powerActive) {
                  sr.fuseBoxOpen = true; sr.keys = {}; sr.vel = 0;
                  setFuseBox(true);
              }
          }
      };
      const onKU = (e) => { sr.keys[e.code] = false; };

      mount.addEventListener("mousedown", onMD); window.addEventListener("mouseup", onMU); window.addEventListener("mousemove", onMM);
      window.addEventListener("keydown", onKD); window.addEventListener("keyup", onKU);

      // --- LOGIC LOOP (1 Hz) ---
      const logicTick = setInterval(() => {
          if (sr.gameState !== 'PLAYING') return;

          sr.shiftTime += 1; 
          
          const hrs = Math.floor(sr.shiftTime / 60) % 24;
          const mins = sr.shiftTime % 60;
          const timeStr = `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;

          if (sr.shiftTime >= sr.endTime) {
              sr.gameState = 'DAY_TRANSITION';
              sr.day += 1;
              sr.score += 150;
              
              setUi(p => ({...p, gameState: 'DAY_TRANSITION', timeStr: "06:00", message: `ZMIANA ZAKOŃCZONA. PREMIA +150 PKT.`, day: sr.day, score: sr.score}));
              
              setTimeout(() => {
                  sr.shiftTime = 22 * 60;
                  const newD = generateDailyData();
                  sr.trueSchedule = newD.schedule;
                  sr.dailyCode = newD.code;
                  sr.displaySchedule = JSON.parse(JSON.stringify(sr.trueSchedule));
                  
                  sr.hasAnomaly = false; sr.anomalyIndex = -1; sr.anomalyType = '';
                  sr.terminalOpen = false; sr.fuseBoxOpen = false; sr.stressActive = false;
                  sr.powerActive = true;
                  
                  R.current.breakerLightMat.color.setHex(0x00ff00);
                  R.current.breakerGlow.color.setHex(0x00ff00);
                  R.current.boardGlow.intensity = 0.8;
                  R.current.ambientLight.intensity = 0.2;
                  R.current.flashlight.intensity = 1.2;
                  
                  setTerminal(p => ({...p, open: false}));
                  setFuseBox(false);
                  updatePragotronTex(sr.displaySchedule);
                  setUi(p => ({...p, gameState: 'PLAYING', powerActive: true, paperSchedule: sr.trueSchedule, dailyCode: sr.dailyCode, message: `DZIEŃ ${sr.day} ROZPOCZĘTY.`}));
                  sr.gameState = 'PLAYING';
              }, 4000);
              return;
          }

          if (sr.powerActive && Math.random() < (0.002 + (sr.day * 0.001))) {
              sr.powerActive = false;
              setFuses([false, false, false]); 
              if(sr.terminalOpen) { sr.terminalOpen = false; setTerminal(p => ({...p, open: false})); }
              
              R.current.playPowerDown();
              R.current.breakerLightMat.color.setHex(0xff0000);
              R.current.breakerGlow.color.setHex(0xff0000);
              R.current.boardGlow.intensity = 0;
              R.current.ambientLight.intensity = 0.03; 
              R.current.flashlight.intensity = 0.0;    
              updatePragotronTex([], { powerOut: true });
              
              setUi(p => ({...p, powerActive: false, message: "AWARIA ZASILANIA. WYMAGANY RĘCZNY RESTART W SKRZYNCE BEZPIECZNIKÓW NA TYLNEJ ŚCIANIE."}));
          }

          if (sr.hasAnomaly) {
              sr.anomalyTimer--;
              
              if (sr.anomalyTimer <= 15 && sr.anomalyTimer > 0) {
                  sr.stressActive = true;
                  if (sr.anomalyTimer % 2 === 0) R.current.playHeartbeat();
              } else {
                  sr.stressActive = false;
              }

              if (sr.anomalyTimer <= 0) {
                  sr.gameState = 'GAMEOVER';
                  sr.terminalOpen = false; setTerminal(p => ({...p, open: false}));
                  sr.fuseBoxOpen = false; setFuseBox(false);
                  
                  R.current.ambientLight.intensity = 0;
                  R.current.flashlight.intensity = 0;
                  scene.fog.color.setHex(0x330000);
                  scene.fog.density = 0.15;
                  R.current.boardGlow.intensity = 3;
                  R.current.boardGlow.color.setHex(0xff0000);
                  updatePragotronTex([], { isDead: true });
                  R.current.playSiren();
                  
                  setUi(p => ({...p, gameState: 'GAMEOVER', message: "NARUSZENIE PROCEDUR."}));
                  return;
              }
          } else if (!sr.isRolling && Math.random() < 0.12 + (sr.day * 0.02)) { 
              sr.hasAnomaly = true;
              sr.anomalyIndex = Math.floor(Math.random() * 4);
              sr.anomalyTimer = Math.max(25, 45 - (sr.day * 2));
              
              const bad = JSON.parse(JSON.stringify(sr.trueSchedule));
              const randType = Math.random();
              
              if (randType < 0.3) {
                  sr.anomalyType = 'TIME';
                  bad[sr.anomalyIndex].time = "66:66";
              } else if (randType < 0.6) {
                  sr.anomalyType = 'DEST';
                  bad[sr.anomalyIndex].destination = "B Ł Ą D  S Y S T E M U";
              } else if (randType < 0.85) {
                  sr.anomalyType = 'THREAT';
                  bad[sr.anomalyIndex].destination = THREATS[Math.floor(Math.random() * THREATS.length)];
              } else {
                  sr.anomalyType = 'GLITCH';
              }
              
              sr.displaySchedule = bad;
              if(sr.anomalyType !== 'GLITCH' && sr.powerActive) updatePragotronTex(bad, { anomalyIndex: sr.anomalyIndex });
          }

          setUi(p => ({
              ...p, 
              timeStr, 
              warningLevel: sr.hasAnomaly ? (1 - (sr.anomalyTimer / Math.max(25, 45 - (sr.day * 2)))) : 0
          }));

      }, 1000);

      // --- RENDER LOOP + BEZBŁĘDNE HITBOXY ---
      let animId;
      let rollTimer = 0;

      function animate() {
          animId = requestAnimationFrame(animate);
          
          if(sr.gameState === 'PLAYING') {
              if (!sr.terminalOpen && !sr.fuseBoxOpen) {
                  cam.rotation.y = sr.yaw; cam.rotation.x = sr.pitch;
                  
                  let inputX = 0, inputY = 0;
                  if(sr.keys['KeyW']) inputY += 1; if(sr.keys['KeyS']) inputY -= 1;
                  if(sr.keys['KeyA']) inputX -= 1; if(sr.keys['KeyD']) inputX += 1;
                  
                  let isMoving = (Math.abs(inputX) > 0.1 || Math.abs(inputY) > 0.1);
                  if(isMoving) { 
                      let len = Math.sqrt(inputX*inputX + inputY*inputY); 
                      sr.lastDirX = inputX/len; sr.lastDirY = inputY/len; 
                  }
                  
                  sr.vel += ((isMoving ? 0.08 : 0) - sr.vel) * 0.15;
                  const fvX = -Math.sin(sr.yaw), fvZ = -Math.cos(sr.yaw);
                  const rvX = Math.cos(sr.yaw), rvZ = -Math.sin(sr.yaw);
                  
                  let newX = cam.position.x + (fvX * sr.lastDirY + rvX * sr.lastDirX) * sr.vel;
                  let newZ = cam.position.z + (fvZ * sr.lastDirY + rvZ * sr.lastDirX) * sr.vel;

                  // 1. ZEWNĘTRZNE GRANICE POKOJU 
                  if (newX < -6.5) newX = -6.5; // Do ścian bocznych (-7.0)
                  if (newX > 6.5) newX = 6.5;
                  if (newZ < -7.5) newZ = -7.5; // Do ściany frontowej (-8.5)
                  if (newZ > 7.0) newZ = 7.0;   // Do ściany tylnej (8.0)

                  // 2. TWARDY HITBOX KONSOLI (Traktowana jak ciągły mur z przodu)
                  // Konsola rozciąga się na całą szerokość, zapobiegając wchodzeniu na boki
                  const dMaxZ = -1.5; // Front biurka

                  // Odbijanie, jeśli wchodzimy na strefę konsoli od przodu
                  if (newZ < dMaxZ) {
                      newZ = dMaxZ; 
                  }

                  cam.position.x = newX;
                  cam.position.z = newZ;

                  const distToDesk = cam.position.distanceTo(new THREE.Vector3(0, PLAYER_HEIGHT, -2.5));
                  const distToBreaker = cam.position.distanceTo(new THREE.Vector3(0, PLAYER_HEIGHT, 7.5));
                  
                  let prompt = "";
                  if (distToDesk < 4.0 && sr.powerActive) prompt = "[E] UŻYJ TERMINALA";
                  else if (distToBreaker < 4.0 && !sr.powerActive) prompt = "[E] SKRZYNKA BEZPIECZNIKÓW";
                  
                  if(prompt !== ui.promptText) setUi(p => ({...p, promptText: prompt}));
              }

              if (sr.stressActive) {
                  const shakeAmount = (15 - sr.anomalyTimer) * 0.002;
                  cam.position.x += (Math.random() - 0.5) * shakeAmount;
                  cam.position.y = PLAYER_HEIGHT + (Math.random() - 0.5) * shakeAmount;
                  cam.rotation.z = (Math.random() - 0.5) * shakeAmount * 2;
              } else {
                  cam.position.y = PLAYER_HEIGHT; 
                  cam.rotation.z = 0;
              }
          }

          if (sr.powerActive) {
              if (sr.isRolling) {
                  rollTimer++;
                  if (rollTimer % 3 === 0) { 
                      R.current.playFlapSound();
                      updatePragotronTex(sr.trueSchedule, { isRolling: true });
                  }
                  if (rollTimer > 30) {
                      sr.isRolling = false; rollTimer = 0;
                      sr.displaySchedule = JSON.parse(JSON.stringify(sr.trueSchedule));
                      updatePragotronTex(sr.displaySchedule);
                  }
              } else if (sr.hasAnomaly && sr.anomalyType === 'GLITCH') {
                  rollTimer++;
                  if (rollTimer % 2 === 0) { 
                      if(Math.random() < 0.25) R.current.playFlapSound();
                      updatePragotronTex(sr.displaySchedule, { anomalyIndex: sr.anomalyIndex, isGlitch: true });
                  }
              }
          }

          if (sr.gameState === 'GAMEOVER') {
              R.current.boardGlow.intensity = 3 + Math.sin(Date.now() * 0.02) * 2;
          } else if (!sr.powerActive) {
              R.current.breakerGlow.intensity = 0.5 + Math.sin(Date.now() * 0.01) * 0.5;
          }

          renderer.render(scene, cam);
      }
      animate();

      const onResize = () => { cam.aspect = mount.clientWidth/mount.clientHeight; cam.updateProjectionMatrix(); renderer.setSize(mount.clientWidth, mount.clientHeight); };
      window.addEventListener("resize", onResize);

      return () => {
          clearInterval(logicTick); cancelAnimationFrame(animId); window.removeEventListener("resize", onResize);
          mount.removeEventListener("mousedown", onMD); window.removeEventListener("mouseup", onMU); window.removeEventListener("mousemove", onMM);
          window.removeEventListener("keydown", onKD); window.removeEventListener("keyup", onKU);
          if(mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
          renderer.dispose();
      };
  }, []);

  const handleFixSubmit = (e) => {
      e.preventDefault();
      const s = S.current;
      if (!s.hasAnomaly) {
          setTerminal(p => ({...p, error: "BŁĄD: BRAK ANOMALII. SYSTEM ZABLOKOWANY."}));
          return;
      }

      if (terminal.inputCode !== s.dailyCode) {
          setTerminal(p => ({...p, error: "BŁĄD: NIEPRAWIDŁOWY KOD DOSTĘPU."}));
          return;
      }

      const trueTrain = s.trueSchedule[s.anomalyIndex];
      let isDestCorrect = false;

      if (s.anomalyType === 'THREAT') {
          if (terminal.inputDest.toUpperCase() === 'PURGE') isDestCorrect = true;
      } else {
          if (terminal.inputDest.toUpperCase() === trueTrain.destination) isDestCorrect = true;
      }

      if (terminal.inputTime === trueTrain.time && isDestCorrect) {
          s.terminalOpen = false;
          setTerminal(p => ({...p, open: false}));
          
          s.hasAnomaly = false;
          s.anomalyIndex = -1;
          s.anomalyType = '';
          s.stressActive = false;
          s.anomalyTimer = 0;
          s.score += 25; 
          s.isRolling = true; 
          
          setUi(p => ({...p, score: s.score, message: "KOREKTA ZATWIERDZONA."}));
          setTimeout(() => setUi(p => ({...p, message: "OBSERWUJ TABLICĘ."})), 2000);
      } else {
          s.score = Math.max(0, s.score - 5); 
          setTerminal(p => ({...p, error: s.anomalyType === 'THREAT' ? "BŁĄD: PROCEDURA BEZPIECZEŃSTWA NARUSZONA!" : "BŁĄD: DANE NIEZGODNE Z MATRYCĄ!"}));
          setUi(p => ({...p, score: s.score}));
      }
  };

  const handleFuseReset = () => {
      const sr = S.current;
      sr.fuseBoxOpen = false;
      setFuseBox(false);
      
      sr.powerActive = true;
      if(mountRef.current && R.current.playPowerUp) R.current.playPowerUp(); 
      
      R.current.ambientLight.intensity = 0.2;
      R.current.flashlight.intensity = 1.2;
      R.current.breakerLightMat.color.setHex(0x00ff00);
      R.current.breakerGlow.color.setHex(0x00ff00);
      R.current.boardGlow.intensity = 0.8;
      
      updatePragotronTex(sr.displaySchedule, { anomalyIndex: sr.anomalyIndex, isGlitch: sr.anomalyType === 'GLITCH', powerOut: false });
      
      setUi(p => ({...p, powerActive: true, message: "ZASILANIE PRZYWRÓCONE."}));
      setTimeout(() => setUi(p => ({...p, message: "OBSERWUJ TABLICĘ."})), 2000);
  };

  return (
      <div style={{width:"100vw", height:"100vh", background:"#000", overflow:"hidden", position:"relative", fontFamily:"monospace", userSelect:"none"}}>
          <div ref={mountRef} style={{width:"100%", height:"100%", cursor:"crosshair", position:"absolute", zIndex: 1}}/>
          
          <div style={{position: "absolute", top: 20, left: 20, zIndex: 10, color: ui.powerActive ? "#ffb300" : "#555", fontSize: "20px", fontWeight: "bold", textShadow: ui.powerActive ? "0 0 10px #ffb300" : "none", pointerEvents:"none"}}>
              <div>DZIEŃ: {ui.day} | PUNKTY: {ui.score}</div>
              <div style={{fontSize: "28px", marginTop: "5px"}}>ZEGAR: {ui.timeStr}</div>
          </div>

          {ui.warningLevel > 0 && ui.gameState === 'PLAYING' && ui.powerActive && (
              <div style={{position: "absolute", top: 20, right: 20, zIndex: 10, color: "#ff0000", fontSize: "18px", background: `rgba(255,0,0,${ui.warningLevel * 0.4})`, border: "1px solid #ff0000", padding: "10px", animation: "pulse 1s infinite", pointerEvents:"none"}}>
                  ⚠ BŁĄD SYSTEMU - WYMAGANA KOREKTA ⚠
              </div>
          )}

          {!terminal.open && !fuseBox && ui.gameState === 'PLAYING' && (
              <div style={{position:"absolute", bottom: 30, left: "50%", transform: "translateX(-50%)", zIndex: 10, color: ui.powerActive ? "#ffb300" : "#ff0000", background: "rgba(0,0,0,0.8)", padding: "10px 20px", border: `1px solid ${ui.powerActive ? "#ffb300" : "#ff0000"}`, pointerEvents:"none", fontWeight: ui.powerActive ? "normal" : "bold"}}>
                  {ui.message}
              </div>
          )}

          {!terminal.open && !fuseBox && ui.gameState === 'PLAYING' && (
              <>
                  <div style={{position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", width:"4px", height:"4px", background:"rgba(255,255,255,0.5)", borderRadius:"50%", zIndex: 10, pointerEvents:"none"}}/>
                  {ui.promptText && (
                      <div style={{position:"absolute", top: "55%", left: "50%", transform: "translateX(-50%)", zIndex: 10, color: "#fff", background: "rgba(0,0,0,0.8)", padding: "5px 10px", border: "1px solid #555", pointerEvents:"none"}}>
                          {ui.promptText}
                      </div>
                  )}
              </>
          )}

          {ui.gameState === 'GAMEOVER' && (
              <div style={{position: "absolute", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.9)", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center"}}>
                  <h1 style={{color: "#ff0000", fontSize: "64px", textShadow: "0 0 20px #ff0000", marginBottom: "10px"}}>SYSTEM KRYTYCZNY</h1>
                  <p style={{color: "#aaa", fontSize: "20px"}}>Procedury naruszone. Zmiana zakończona tragicznie.</p>
                  <p style={{color: "#ffb300", fontSize: "24px", marginTop: "20px"}}>PRZETRWANO DNI: {ui.day} | WYNIK KOŃCOWY: {ui.score}</p>
                  <button onClick={() => window.location.reload()} style={{marginTop: "40px", padding: "15px 30px", background: "transparent", border: "2px solid #555", color: "#fff", fontSize: "18px", cursor: "pointer", fontFamily: "monospace"}}>
                      RESTART SYSTEMU
                  </button>
              </div>
          )}

          {ui.gameState === 'DAY_TRANSITION' && (
              <div style={{position: "absolute", inset: 0, zIndex: 50, background: "#000", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", animation: "fadeIn 1s forwards"}}>
                  <h1 style={{color: "#4CAF50", fontSize: "48px", letterSpacing: "5px"}}>{ui.message}</h1>
                  <p style={{color: "#aaa", fontSize: "18px", marginTop: "20px"}}>Przygotuj się na kolejną noc. Zwróć uwagę na nowy KOD DOSTĘPU.</p>
              </div>
          )}

          {fuseBox && ui.gameState === 'PLAYING' && (() => {
              const allFusesOn = fuses.every(f => f);
              return (
              <div style={{position:"absolute", inset: 0, zIndex: 30, background: "rgba(10,0,0,0.9)", display: "flex", justifyContent: "center", alignItems: "center"}}>
                  <div style={{background: "#222", border: "10px solid #111", borderRadius: "5px", padding: "40px", textAlign: "center", boxShadow: "0 0 50px rgba(255,0,0,0.2)"}}>
                      <h2 style={{color: "#fff", margin: "0 0 30px 0", letterSpacing: "2px"}}>SKRZYNKA BEZPIECZNIKÓW</h2>
                      <div style={{color: "#ff4444", fontSize: "14px", marginBottom: "30px", animation: "pulse 1s infinite"}}>BRAK ZASILANIA GŁÓWNEGO</div>
                      
                      <div style={{ display: 'flex', gap: '30px', justifyContent: 'center', marginBottom: '40px' }}>
                          {fuses.map((f, i) => (
                              <div key={i} 
                                   onClick={() => {
                                       const newFuses = [...fuses];
                                       newFuses[i] = !newFuses[i];
                                       setFuses(newFuses);
                                   }}
                                   style={{
                                       width: '50px', height: '100px', 
                                       background: f ? '#4CAF50' : '#ff4444', 
                                       border: '6px solid #111',
                                       cursor: 'pointer',
                                       position: 'relative',
                                       boxShadow: "inset 0 0 10px rgba(0,0,0,0.8)"
                                   }}>
                                   <div style={{
                                       position: 'absolute', 
                                       width: '100%', height: '50px', 
                                       background: '#333', 
                                       top: f ? 0 : '50px',
                                       transition: 'top 0.1s ease-in-out',
                                       borderBottom: f ? "4px solid #111" : "none",
                                       borderTop: !f ? "4px solid #111" : "none"
                                   }}></div>
                              </div>
                          ))}
                      </div>

                      <button onClick={allFusesOn ? handleFuseReset : null} style={{background: allFusesOn ? "#ff0000" : "#550000", color: "#fff", border: `4px solid ${allFusesOn ? "#880000" : "#220000"}`, padding: "20px 40px", fontSize: "24px", fontWeight: "bold", cursor: allFusesOn ? "pointer" : "not-allowed", borderRadius: "4px", textShadow: "1px 1px 0 #000", boxShadow: "inset 0 0 10px rgba(0,0,0,0.5)"}}>
                          ZAŁĄCZ ZASILANIE
                      </button>
                      <div style={{marginTop: "30px"}}>
                          <button onClick={() => { S.current.fuseBoxOpen = false; setFuseBox(false); }} style={{background: "transparent", color: "#888", border: "none", cursor: "pointer", fontSize: "16px"}}>
                              [ESC] Odejmij rękę
                          </button>
                      </div>
                  </div>
              </div>
          )})()}

          {terminal.open && ui.gameState === 'PLAYING' && (
              <div style={{position:"absolute", inset: 0, zIndex: 20, background: "rgba(0,0,0,0.85)", display: "flex", justifyContent: "center", alignItems: "center"}}>
                  
                  <div style={{position:"absolute", left: "5%", top: "15%", background: "#e8e0c0", padding: "20px", color: "#111", width: "340px", transform: "rotate(-2deg)", boxShadow: "2px 2px 10px rgba(0,0,0,0.5)", fontFamily: "sans-serif"}}>
                      <div style={{color: "#880000", fontWeight: "bold", fontSize: "16px", marginBottom: "15px", borderBottom: "2px solid #880000", paddingBottom: "5px"}}>
                          KOD DOSTĘPU: [{ui.dailyCode}]
                      </div>
                      <h3 style={{borderBottom: "2px solid #333", margin: "0 0 10px 0"}}>OFICJALNY ROZKŁAD</h3>
                      {ui.paperSchedule.map(t => (
                          <div key={t.id} style={{marginBottom: "5px", fontSize: "14px", fontWeight: "bold"}}>
                              {t.time} - {t.destination}
                          </div>
                      ))}
                      <div style={{marginTop: "20px", fontSize: "11px", color: "#333", borderTop: "1px dashed #333", paddingTop: "10px", fontWeight: "bold"}}>
                          ! UWAGA: W przypadku manifestacji bezpośredniego zagrożenia na tablicy kierunków, WPROWADŹ KOMENDĘ: PURGE
                      </div>
                  </div>

                  <div style={{background: "#051105", border: "20px solid #222", borderRadius: "10px", padding: "30px", width: "500px", boxShadow: "0 0 30px #003300", color: "#4af626"}}>
                      <h2 style={{margin: "0 0 20px 0", fontSize: "22px"}}>SYSTEM KOREKTY v{1.1 + (ui.day * 0.1)}</h2>
                      {terminal.error && <div style={{background: "#ff0000", color: "#fff", padding: "5px", marginBottom: "15px", fontWeight: "bold", textAlign: "center"}}>{terminal.error}</div>}
                      
                      <form onSubmit={handleFixSubmit} style={{display: "flex", flexDirection: "column", gap: "12px"}}>
                          <div>
                              <label style={{display: "block", marginBottom: "5px", fontSize: "14px"}}>KOD DOSTĘPU:</label>
                              <input 
                                  autoFocus type="text" maxLength="4" value={terminal.inputCode} 
                                  onChange={e => setTerminal(p => ({...p, inputCode: e.target.value}))}
                                  onKeyDown={e => e.stopPropagation()}
                                  style={{width: "100%", background: "#020a02", border: "1px solid #4af626", color: "#4af626", padding: "10px", fontSize: "18px", fontFamily: "monospace", outline: "none", boxSizing: "border-box", letterSpacing: "5px", textAlign: "center"}} 
                              />
                          </div>
                          <div>
                              <label style={{display: "block", marginBottom: "5px", fontSize: "14px"}}>CZAS (HH:MM):</label>
                              <input 
                                  type="text" value={terminal.inputTime} 
                                  onChange={e => setTerminal(p => ({...p, inputTime: e.target.value}))}
                                  onKeyDown={e => e.stopPropagation()}
                                  style={{width: "100%", background: "#020a02", border: "1px solid #4af626", color: "#4af626", padding: "10px", fontSize: "18px", fontFamily: "monospace", outline: "none", boxSizing: "border-box"}} 
                              />
                          </div>
                          <div>
                              <label style={{display: "block", marginBottom: "5px", fontSize: "14px"}}>KIERUNEK NADPISANIA:</label>
                              <input 
                                  type="text" value={terminal.inputDest} 
                                  onChange={e => setTerminal(p => ({...p, inputDest: e.target.value}))}
                                  onKeyDown={e => e.stopPropagation()}
                                  style={{width: "100%", background: "#020a02", border: "1px solid #4af626", color: "#4af626", padding: "10px", fontSize: "18px", fontFamily: "monospace", outline: "none", textTransform: "uppercase", boxSizing: "border-box"}} 
                              />
                          </div>
                          <div style={{display: "flex", justifyContent: "space-between", marginTop: "15px"}}>
                              <button type="button" onClick={() => { S.current.terminalOpen = false; setTerminal(p => ({...p, open: false})); }} style={{background: "transparent", border: "1px solid #4af626", color: "#4af626", padding: "10px", cursor: "pointer", fontFamily: "monospace"}}> [ESC] ANULUJ </button>
                              <button type="submit" style={{background: "#4af626", border: "none", color: "#000", padding: "10px 20px", cursor: "pointer", fontWeight: "bold", fontFamily: "monospace"}}> WPROWADŹ DANE </button>
                          </div>
                      </form>
                  </div>
              </div>
          )}
      </div>
  );
} 
