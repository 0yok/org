import { auth, db, functions } from "./firebase-init.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc, setDoc, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";

const FREE_LIMIT = 10;
// Firebase Auth needs an email format; usernames are mapped to a hidden
// pseudo-email so the user only ever sees "username" in the UI.
const usernameToEmail = (u) => `${u.toLowerCase().trim()}@cyberyonko.local`;

let currentUserDoc = null;   // live Firestore data: {messagesUsed, unlocked}
let unsubscribeUserDoc = null;
let chatHistory = [];        // [{role:'user'|'model', text}]

/* ---------------- UI helpers ---------------- */
function show(id){ document.getElementById(id).classList.remove('hidden'); }
function hide(id){ document.getElementById(id).classList.add('hidden'); }
function authError(msg){
  const el = document.getElementById('auth-err');
  el.textContent = msg; el.classList.add('show');
}
function clearAuthError(){ document.getElementById('auth-err').classList.remove('show'); }

window.showRegister = function(){
  hide('form-login'); show('form-register'); clearAuthError();
};
window.showLogin = function(){
  hide('form-register'); show('form-login'); clearAuthError();
};

/* ---------------- jumpscare (visual + audio) ---------------- */
function playScream(){
  try{
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const dur = 0.9;
    const bufSize = ctx.sampleRate * dur;
    const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for(let i=0;i<bufSize;i++){
      const t = i/bufSize;
      const env = Math.sin(Math.PI*t) * (1-t*0.3);
      data[i] = (Math.random()*2-1) * env;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.setValueAtTime(1800, ctx.currentTime);
    band.frequency.exponentialRampToValueAtTime(220, ctx.currentTime+dur*0.8);
    band.Q.value = 6;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.9, ctx.currentTime+0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+dur);
    noise.connect(band); band.connect(gain); gain.connect(ctx.destination);
    noise.start(); noise.stop(ctx.currentTime+dur);
  }catch(e){ /* ignore if audio unavailable */ }
}
function triggerJumpscare(){
  const el = document.getElementById('jumpscare');
  if(!el) return;
  el.classList.add('fire');
  playScream();
  if(navigator.vibrate) navigator.vibrate([80,40,80]);
  setTimeout(()=> el.classList.remove('fire'), 950);
}

/* ---------------- auth actions ---------------- */
window.handleRegister = async function(){
  const user = document.getElementById('reg-user').value.trim();
  const pass = document.getElementById('reg-pass').value;
  clearAuthError();

  if(!/^[a-zA-Z0-9_]{3,20}$/.test(user)){
    authError('Username: 3-20 characters, letters/numbers/underscore only.'); return;
  }
  if(!pass || pass.length < 6){
    authError('Password must be at least 6 characters.'); return;
  }

  try{
    const cred = await createUserWithEmailAndPassword(auth, usernameToEmail(user), pass);
    await setDoc(doc(db, 'users', cred.user.uid), {
      username: user,
      messagesUsed: 0,
      unlocked: false,
      createdAt: Date.now()
    });
    // onAuthStateChanged will take it from here
  }catch(e){
    if(e.code === 'auth/email-already-in-use'){
      authError('That username is already taken.');
    } else {
      authError('Could not create account: ' + e.message);
    }
  }
};

window.handleLogin = async function(){
  const user = document.getElementById('login-user').value.trim();
  const pass = document.getElementById('login-pass').value;
  clearAuthError();
  if(!user || !pass){ authError('Enter your username and password.'); return; }

  try{
    await signInWithEmailAndPassword(auth, usernameToEmail(user), pass);
  }catch(e){
    authError('Invalid username or password.');
  }
};

window.handleLogout = async function(){
  await signOut(auth);
};

/* ---------------- auth state -> screen switching ---------------- */
onAuthStateChanged(auth, async (fbUser) => {
  if (unsubscribeUserDoc) { unsubscribeUserDoc(); unsubscribeUserDoc = null; }

  if(!fbUser){
    hide('screen-chat'); hide('paywall'); show('screen-auth');
    return;
  }

  hide('screen-auth'); show('screen-chat');
  document.getElementById('chat-body').innerHTML =
    '<div class="msg sys">CyberYoNko stirs awake. Ask anything.</div>';
  chatHistory = [];
  triggerJumpscare();

  const userRef = doc(db, 'users', fbUser.uid);
  unsubscribeUserDoc = onSnapshot(userRef, (snap) => {
    currentUserDoc = snap.data() || null;
    updateQuotaUI();
    if(currentUserDoc && !currentUserDoc.unlocked && currentUserDoc.messagesUsed >= FREE_LIMIT){
      show('paywall');
    } else {
      hide('paywall');
    }
  });
});

/* ---------------- quota UI ---------------- */
function updateQuotaUI(){
  const pill = document.getElementById('quota-pill');
  const status = document.getElementById('who-status');
  if(!currentUserDoc) return;
  if(currentUserDoc.unlocked){
    pill.textContent = 'Unlimited ∞';
    pill.className = 'quota-pill unlocked';
    status.textContent = 'Full power online';
  } else {
    const remaining = Math.max(0, FREE_LIMIT - (currentUserDoc.messagesUsed || 0));
    pill.textContent = remaining + ' / ' + FREE_LIMIT + ' messages';
    pill.className = 'quota-pill' + (remaining <= 3 ? ' low' : '');
    status.textContent = 'Connected';
  }
}

/* ---------------- key redemption ---------------- */
const redeemKeyFn = httpsCallable(functions, 'redeemKey');
window.redeemKey = async function(){
  const input = document.getElementById('key-input');
  const msgEl = document.getElementById('key-msg');
  const code = input.value.trim();
  if(!code) return;

  msgEl.textContent = 'Checking...'; msgEl.className = 'key-msg';
  try{
    await redeemKeyFn({ code });
    msgEl.textContent = 'Activated — full power unlocked.';
    msgEl.className = 'key-msg ok';
    setTimeout(()=> hide('paywall'), 900);
  }catch(e){
    const reason = e?.message || '';
    if(reason.includes('KEY_ALREADY_USED')){
      msgEl.textContent = 'This key has already been used.';
    } else if(reason.includes('INVALID_KEY') || reason.includes('not-found')){
      msgEl.textContent = 'Invalid key.';
    } else {
      msgEl.textContent = 'Something went wrong. Try again.';
    }
    msgEl.className = 'key-msg bad';
  }
};

/* ---------------- chat ---------------- */
function appendMsg(role, text){
  const body = document.getElementById('chat-body');
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  div.textContent = text;
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
  return div;
}

const chatFn = httpsCallable(functions, 'chat');

window.sendMessage = async function(){
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if(!text || !currentUserDoc) return;

  if(!currentUserDoc.unlocked && currentUserDoc.messagesUsed >= FREE_LIMIT){
    show('paywall');
    return;
  }

  input.value = '';
  appendMsg('user', text);

  const body = document.getElementById('chat-body');
  const typingEl = document.createElement('div');
  typingEl.className = 'typing';
  typingEl.textContent = 'CyberYoNko is thinking from the dark...';
  body.appendChild(typingEl);
  body.scrollTop = body.scrollHeight;

  try{
    const res = await chatFn({ text, history: chatHistory });
    typingEl.remove();
    const reply = res.data.reply || '...';
    appendMsg('ai', reply);
    chatHistory.push({ role:'user', text });
    chatHistory.push({ role:'model', text: reply });
    if(chatHistory.length > 40) chatHistory = chatHistory.slice(-40);
  }catch(e){
    typingEl.remove();
    if((e?.message || '').includes('FREE_LIMIT_REACHED')){
      show('paywall');
    } else {
      appendMsg('sys', 'Connection to the dark failed. Try again.');
    }
  }
};

document.getElementById('chat-input')?.addEventListener('keydown', (ev) => {
  if(ev.key === 'Enter' && !ev.shiftKey){
    ev.preventDefault();
    window.sendMessage();
  }
});
