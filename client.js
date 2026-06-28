import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getDatabase, ref, onValue, set } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
const roomId = new URLSearchParams(window.location.search).get("room") || "class-3-2";
const firebaseConfig = {
  apiKey: "AIzaSyBzKPMuRx87I-TvUZugsNSkPPVSu0Yks6g",
  authDomain: "kinggame-fe387.firebaseapp.com",
  databaseURL: "https://kinggame-fe387-default-rtdb.firebaseio.com",
  projectId: "kinggame-fe387",
  storageBucket: "kinggame-fe387.firebasestorage.app",
  messagingSenderId: "265837249346",
  appId: "1:265837249346:web:93ba4bf88792cf6f9f3edb",
  measurementId: "G-10SCNVD4DQ"
};
const storageKey = "king-challenge-host:" + roomId;

let databaseApi = null;
let databaseRef = null;
let unsubscribe = null;
let state = null; 

let currentStep = "game-select"; 
let matchType = "normal"; 
let selectedGame = null;
let selectedPlayers = []; 

const els = {
  roomLabel: document.querySelector("#roomLabel"),
  stepTitle: document.querySelector("#stepTitle"),
  gameSelectView: document.querySelector("#gameSelectView"),
  playerSelectView: document.querySelector("#playerSelectView"),
  resultInputView: document.querySelector("#resultInputView"),
  loadingOverlay: document.querySelector("#loadingOverlay"),
  gameGrid: document.querySelector("#gameGrid"),
  normalMatchBtn: document.querySelector("#normalMatchBtn"),
  challengeMatchBtn: document.querySelector("#challengeMatchBtn"),
  playerSelectGuide: document.querySelector("#playerSelectGuide"),
  playerGrid: document.querySelector("#playerGrid"),
  backToGameBtn: document.querySelector("#backToGameBtn"),
  nextToResultBtn: document.querySelector("#nextToResultBtn"),
  resultGameName: document.querySelector("#resultGameName"),
  playerABtn: document.querySelector("#playerABtn"),
  playerBBtn: document.querySelector("#playerBBtn"),
  playerAName: document.querySelector("#playerAName"),
  playerBName: document.querySelector("#playerBName"),
  playerAStatus: document.querySelector("#playerAStatus"),
  playerBStatus: document.querySelector("#playerBStatus"),
  backToPlayerBtn: document.querySelector("#backToPlayerBtn"),
};

els.roomLabel.textContent = roomId;

function playSound(kind){ 
  const AudioContext = window.AudioContext || window.webkitAudioContext; 
  if(!AudioContext) return; 
  const sounds = { click:[360,.06], win:[880,.15] }; 
  const pair = sounds[kind] || sounds.click; 
  const context = new AudioContext(); 
  const oscillator = context.createOscillator(); 
  const gain = context.createGain(); 
  oscillator.type = kind === "win" ? "triangle" : "sine"; 
  oscillator.frequency.value = pair[0]; 
  gain.gain.setValueAtTime(.001, context.currentTime); 
  gain.gain.exponentialRampToValueAtTime(.18, context.currentTime + .01); 
  gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + pair[1]); 
  oscillator.connect(gain); 
  gain.connect(context.destination); 
  oscillator.start(); 
  oscillator.stop(context.currentTime + pair[1]); 
}

function statusText(status) { 
  if(status === "king") return "왕"; 
  if(status === "challenger") return "도전자"; 
  return "일반"; 
}

function recalculateRanks(nextState){
  const perfectScore = nextState.settings.perfectScore;
  const kingLimit = Math.max(1, Number(nextState.settings.kingLimit) || 1);
  Object.values(nextState.students).forEach(function(student){
    student.status = "normal";
    student.crownOrder = null;
    student.challengerOrder = null;
    if(student.score < perfectScore || student.absent) student.reachedPerfectAt = null;
  });
  
  const perfectStudents = Object.values(nextState.students).filter(function(student){
    return !student.absent && student.score >= perfectScore && perfectScore > 0;
  }).sort(function(a,b){
    const aTime = a.reachedPerfectAt || a.updatedAt || 0;
    const bTime = b.reachedPerfectAt || b.updatedAt || 0;
    return aTime - bTime || a.name.localeCompare(b.name, "ko");
  });
  
  perfectStudents.forEach(function(student,index){
    const target = nextState.students[student.id];
    if(!target.reachedPerfectAt) target.reachedPerfectAt = Date.now();
    if(index < kingLimit){
      target.status = "king";
      target.crownOrder = index + 1;
    } else {
      target.status = "challenger";
      target.challengerOrder = index - kingLimit + 1;
    }
  });
}

async function saveState() {
  state.settings.updatedAt = Date.now();
  recalculateRanks(state);
  if(databaseApi && databaseRef){
    await databaseApi.set(databaseRef, state);
  } else {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }
}

function render() {
  if(!state) return;
  els.loadingOverlay.classList.remove("active");

  els.gameSelectView.classList.toggle("active", currentStep === "game-select");
  els.playerSelectView.classList.toggle("active", currentStep === "player-select");
  els.resultInputView.classList.toggle("active", currentStep === "result-input");

  if(currentStep === "game-select") {
    els.stepTitle.textContent = "종목 선택";
    els.gameGrid.replaceChildren();
    state.settings.games.forEach(game => {
      const btn = document.createElement("button");
      btn.className = "game-btn";
      btn.textContent = game.name;
      btn.onclick = () => {
        playSound("click");
        selectedGame = game;
        selectedPlayers = [];
        matchType = "normal";
        currentStep = "player-select";
        render();
      };
      els.gameGrid.append(btn);
    });
  }
  
  if(currentStep === "player-select") {
    els.stepTitle.textContent = "선수 선택";
    els.normalMatchBtn.classList.toggle("active", matchType === "normal");
    els.challengeMatchBtn.classList.toggle("active", matchType === "challenge");
    
    let availableStudents = Object.values(state.students).filter(s => !s.absent);
    if(matchType === "normal"){
      availableStudents = availableStudents.filter(s => s.status === "normal");
    } else if(matchType === "challenge"){
      availableStudents = availableStudents.filter(s => s.status === "king" || s.status === "challenger");
    }
    availableStudents.sort((a,b) => a.name.localeCompare(b.name, "ko"));

    els.playerGrid.replaceChildren();
    availableStudents.forEach(student => {
      const btn = document.createElement("button");
      btn.className = "player-btn";
      if(student.status === "king") btn.classList.add("king-bg");
      if(student.status === "challenger") btn.classList.add("challenger-bg");
      
      const isSelected = selectedPlayers.find(p => p.id === student.id);
      if(isSelected) btn.classList.add("selected");

      btn.innerHTML = `
        <span class="player-badge ${student.status}">${statusText(student.status)}</span>
        ${student.name}
      `;
      
      btn.onclick = () => {
        playSound("click");
        if(isSelected) {
          selectedPlayers = selectedPlayers.filter(p => p.id !== student.id);
        } else {
          if(selectedPlayers.length < 2) {
            selectedPlayers.push(student);
          } else {
            selectedPlayers[1] = student;
          }
        }
        render();
      };
      els.playerGrid.append(btn);
    });

    els.nextToResultBtn.disabled = selectedPlayers.length !== 2;
    if(matchType === "challenge") {
      els.playerSelectGuide.textContent = "도전자 1명과 왕 1명을 선택하세요.";
      const hasKing = selectedPlayers.some(p => p.status === "king");
      const hasChallenger = selectedPlayers.some(p => p.status === "challenger");
      els.nextToResultBtn.disabled = !(selectedPlayers.length === 2 && hasKing && hasChallenger);
    } else {
      els.playerSelectGuide.textContent = "대결할 일반 학생 2명을 선택하세요.";
    }
  }

  if(currentStep === "result-input") {
    els.stepTitle.textContent = "결과 입력";
    els.resultGameName.textContent = selectedGame.name;
    
    const [pA, pB] = selectedPlayers;
    els.playerAName.textContent = pA.name;
    els.playerAStatus.textContent = statusText(pA.status);
    els.playerAStatus.className = `status-badge ${pA.status}`;
    
    els.playerBName.textContent = pB.name;
    els.playerBStatus.textContent = statusText(pB.status);
    els.playerBStatus.className = `status-badge ${pB.status}`;
  }
}

async function handleMatchResult(winnerId) {
  const winner = state.students[winnerId];
  const loserId = selectedPlayers.find(p => p.id !== winnerId).id;
  const loser = state.students[loserId];
  const totalGamesCount = state.settings.games.length;

  if (matchType === "challenge") {
    if (winner.status === "king") {
      loser.score = totalGamesCount;
    } else {
      loser.score = Math.round(totalGamesCount / 2);
      loser.status = "normal"; 
      winner.reachedPerfectAt = (loser.reachedPerfectAt || Date.now()) - 1; 
    }
  } else {
    const allowDup = state.settings.allowDuplicateGames ?? true;
    if (!allowDup) {
      if (winner.playedGames && winner.playedGames.includes(selectedGame.id)) {
        alert(winner.name + " 학생은 이미 '" + selectedGame.name + "' 종목에서 승리한 적이 있습니다.\n중복 승리가 금지되어 있어 점수를 얻을 수 없습니다.");
        return;
      }
      winner.playedGames = winner.playedGames || [];
      winner.playedGames.push(selectedGame.id);
    }
    winner.score += 2;
    loser.score = Math.max(0, loser.score - 1);
    if (winner.score >= state.settings.perfectScore && !winner.reachedPerfectAt) {
      winner.reachedPerfectAt = Date.now();
    }
  }

  winner.updatedAt = Date.now();
  loser.updatedAt = Date.now();

  await saveState();
  playSound("win");
  
  alert(`${winner.name} 학생의 승리가 기록되었습니다!`);
  currentStep = "game-select";
  selectedPlayers = [];
  render();
}

els.normalMatchBtn.onclick = () => { matchType = "normal"; selectedPlayers=[]; playSound("click"); render(); };
els.challengeMatchBtn.onclick = () => { matchType = "challenge"; selectedPlayers=[]; playSound("click"); render(); };
els.backToGameBtn.onclick = () => { currentStep = "game-select"; playSound("click"); render(); };
els.nextToResultBtn.onclick = () => { currentStep = "result-input"; playSound("click"); render(); };
els.backToPlayerBtn.onclick = () => { currentStep = "player-select"; playSound("click"); render(); };

els.playerABtn.onclick = () => handleMatchResult(selectedPlayers[0].id);
els.playerBBtn.onclick = () => handleMatchResult(selectedPlayers[1].id);

function normalizeState(value){
  const source = value || {};
  return {
    settings: Object.assign(
      { roomName: "왕좌 도전", games: [], kingLimit: 3, perfectScore: 0, sheetUrl: "", status: "playing", allowDuplicateGames: true, updatedAt: 0 },
      source.settings || {}
    ),
    students: source.students || {}
  };
}

function isRoomReady(value){
  return !!(value && value.settings && Array.isArray(value.settings.games) && value.settings.games.length > 0);
}

function showWaitingOverlay(){
  const message = els.loadingOverlay.querySelector("p");
  if(message) message.textContent = "선생님이 방을 준비하는 중입니다...";
  els.loadingOverlay.classList.add("active");
}

async function setupFirebase(){
  if(!firebaseConfig.apiKey || !firebaseConfig.databaseURL) return false;
  const app = initializeApp(firebaseConfig);
  const database = getDatabase(app);
  databaseApi = { set };
  databaseRef = ref(database, "rooms/" + roomId);
  unsubscribe = onValue(databaseRef, snapshot => {
    const value = snapshot.val();
    state = normalizeState(value);
    if(!isRoomReady(value)){ showWaitingOverlay(); return; }
    render();
  });
  return true;
}

function loadLocalState(){
  const sync = () => {
    const saved = localStorage.getItem(storageKey);
    if(saved) {
      const parsed = JSON.parse(saved);
      if(!state || state.settings.updatedAt !== parsed.settings.updatedAt) {
        state = normalizeState(parsed);
        if(!isRoomReady(parsed)){ showWaitingOverlay(); return; }
        render();
      }
    }
  };
  sync();
  setInterval(sync, 1000); 
}

setupFirebase().then(connected => {
  if(!connected) loadLocalState();
});
