import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore, collection, addDoc, doc, runTransaction,
  serverTimestamp, query, where, getDocs, orderBy, limit, onSnapshot,
  setDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* Firebase config */
const firebaseConfig = {
  apiKey: "AIzaSyBlwnPL3ssSVaY8firV9R-moXoJMT4UhVk",
  authDomain: "recordkeeping-35260.firebaseapp.com",
  projectId: "recordkeeping-35260.firebaseapp.com".includes("firebaseapp.com") ? "recordkeeping-35260" : "recordkeeping-35260",
  storageBucket: "recordkeeping-35260.firebasestorage.app",
  messagingSenderId: "872390061997",
  appId: "1:872390061997:web:4a8cce855e09f009a77b24",
  measurementId: "G-VL4TDJJ79L"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* DOM */
const pageToken = document.getElementById("pageToken");
const pageHistory = document.getElementById("pageHistory");
const pageDisplay = document.getElementById("pageDisplay");

const btnGoToken = document.getElementById("btnGoToken");
const btnGoHistory = document.getElementById("btnGoHistory");
const btnGoDisplay = document.getElementById("btnGoDisplay");

const form = document.getElementById("visitorForm");
const elName = document.getElementById("name");
const elPhone = document.getElementById("phone");
const elAddress = document.getElementById("address");
const elPurpose = document.getElementById("purpose");
const elOtherInfo = document.getElementById("otherInfo");
const elPriority = document.getElementById("priority");

const elManualMode = document.getElementById("manualMode");
const elManualBox = document.getElementById("manualBox");
const elManualToken = document.getElementById("manualToken");

const btnPrintLast = document.getElementById("btnPrintLast");
const elSoundAlert = document.getElementById("soundAlert");
const elVoiceEnabled = document.getElementById("voiceEnabled");

const elLastToken = document.getElementById("lastToken");
const elLastDateTime = document.getElementById("lastDateTime");

const queueList = document.getElementById("queueList");
const queueCountPill = document.getElementById("queueCountPill");

const toast = document.getElementById("toast");
const toastText = document.getElementById("toastText");
const toastClose = document.getElementById("toastClose");

const historyTbody = document.getElementById("historyTbody");
const historySearch = document.getElementById("historySearch");
const historyPriority = document.getElementById("historyPriority");
const historyTokenType = document.getElementById("historyTokenType");

const btnPrintHistoryA4 = document.getElementById("btnPrintHistoryA4");

/* Display */
const displayClock = document.getElementById("displayClock");
const nowServing = document.getElementById("nowServing");
const nowServingTime = document.getElementById("nowServingTime");
const btnUnlockVoice = document.getElementById("btnUnlockVoice");
const btnCallNext = document.getElementById("btnCallNext");
const btnRepeatCall = document.getElementById("btnRepeatCall");
const btnClearNow = document.getElementById("btnClearNow");
const btnFullscreen = document.getElementById("btnFullscreen");
const upNextList = document.getElementById("upNextList");

/* Helpers */
function padToken(n){ return String(n).padStart(3,"0"); }
function sanitizePhone(p){ return (p || "").replace(/[^\d+]/g, "").trim(); }
function toLowerSafe(v){ return (v ?? "").toString().toLowerCase(); }
function nowLocal(){
  const d = new Date();
  return {
    date: d.toLocaleDateString(undefined, { year:"numeric", month:"short", day:"2-digit" }),
    time: d.toLocaleTimeString(undefined, { hour:"2-digit", minute:"2-digit" }),
    iso: d.toISOString(),
    full: d.toLocaleString()
  };
}
function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

/* Clock */
setInterval(()=>{ if(displayClock) displayClock.textContent = new Date().toLocaleString(); }, 1000);

/* Toast */
let toastTimer = null;
function showToast(msg){
  toastText.textContent = msg;
  toast.classList.remove("hidden");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> toast.classList.add("hidden"), 4200);
}
toastClose.addEventListener("click", ()=> toast.classList.add("hidden"));

/* Beep */
function beep(){
  if (!elSoundAlert?.checked) return;
  try{
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = "sine";
    o.frequency.value = 650;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.20);
    o.start();
    o.stop(ctx.currentTime + 0.22);
  } catch {}
}

/* Voice (requires unlock) */
let voiceUnlocked = false;

function unlockVoice(){
  if (!("speechSynthesis" in window)) {
    showToast("⚠️ Voice not supported on this browser.");
    return;
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance("Voice unlocked.");
  u.rate = 1;
  window.speechSynthesis.speak(u);
  voiceUnlocked = true;
  showToast("✅ Voice unlocked. Now announcements will work.");
}

function speak(text){
  if (!elVoiceEnabled?.checked) return;
  if (!voiceUnlocked) return;
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1;
  u.pitch = 1;
  u.volume = 1;
  window.speechSynthesis.speak(u);
}

/* Navigation */
function setPage(which){
  pageToken.classList.toggle("hidden", which !== "token");
  pageHistory.classList.toggle("hidden", which !== "history");
  pageDisplay.classList.toggle("hidden", which !== "display");
  btnGoToken.classList.toggle("active", which === "token");
  btnGoHistory.classList.toggle("active", which === "history");
  btnGoDisplay.classList.toggle("active", which === "display");
}
btnGoToken.addEventListener("click", ()=> setPage("token"));
btnGoHistory.addEventListener("click", ()=> setPage("history"));
btnGoDisplay.addEventListener("click", ()=> setPage("display"));

/* Manual toggle */
elManualMode.addEventListener("change", ()=>{
  elManualBox.classList.toggle("enabled", elManualMode.checked);
  if (!elManualMode.checked) elManualToken.value = "";
});

/* Duplicate phone */
let phoneCheckDebounce = null;
async function checkPhoneExists(phone){
  const clean = sanitizePhone(phone);
  if (!clean || clean.length < 7) return;

  try{
    const q1 = query(collection(db,"visitors"), where("phone","==", clean), limit(1));
    const snap = await getDocs(q1);
    if (!snap.empty){
      const data = snap.docs[0].data();
      showToast(`⚠️ Already visited: ${data.name || "Visitor"} (${clean})`);
      beep();
      if (!elName.value && data.name) elName.value = data.name;
      if (!elAddress.value && data.address) elAddress.value = data.address;
    }
  } catch(err){
    console.error(err);
  }
}
elPhone.addEventListener("input", ()=>{
  clearTimeout(phoneCheckDebounce);
  phoneCheckDebounce = setTimeout(()=> checkPhoneExists(elPhone.value), 350);
});
elPhone.addEventListener("blur", ()=> checkPhoneExists(elPhone.value));

/* Token counter */
async function nextAutoToken(){
  const counterRef = doc(db, "meta", "tokenCounter");
  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const last = snap.exists() ? Number(snap.data().lastNumber || 0) : 0;
    const next = last + 1;
    tx.set(counterRef, { lastNumber: next, updatedAt: serverTimestamp() }, { merge:true });
    return padToken(next);
  });
}

/* ✅ Receipt Print */
let lastPrintedPayload = null;
const PRINTER_OFFSETS = { xIn: 0.80, yIn: 0.50 };

function printToken({ tokenNumber, dateText, timeText }){
  const w = window.open("", "_blank", "width=420,height=520");
  const logoUrl = "https://raw.githubusercontent.com/shifauldahar/Record-keeping/b3a3663fe8ce92d63a3275c7395433a387d9230e/logo1.png";
  const x = PRINTER_OFFSETS?.xIn ?? 0;
  const y = PRINTER_OFFSETS?.yIn ?? 0;

  const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Token ${escapeHtml(tokenNumber)}</title>
  <style>
    @page { size: 2in 3in; margin: 0; }
    html, body { width: 2in; height: 3in; margin: 0; padding: 0; overflow: hidden; background: #fff; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

    .printRoot{
      position: fixed;
      inset: 0;
      width: 2in;
      height: 3in;
      background: #fff;
    }

    .ticket{
      position:absolute;
      left:20%;
      top:5%
      bottom
      transform: translate(-50%, -50%) translate(${x}in, ${y}in);
      width:2in;
      height:3in;
      padding: 0.00in 0.08in 0.08in;
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:flex-start;
      text-align:center;
    }

    .logoWrap{ width:100%; display:flex; justify-content:center; margin-top:0.02in; margin-bottom:0.06in; }
    .logo{
      width: 1.10in;
      height: 0.75in;
      display:block;
      object-fit: contain;
      object-position: center top;
    }

    .token{
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size: 34pt;
      font-weight: 900;
      letter-spacing: 0.08em;
      line-height: 1;
      color: #0C332F;
      margin: 0.03in 0 0.07in;
    }

    .dt{
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size: 9pt;
      font-weight: 700;
      color: #111;
      margin-top: 0.02in;
    }

    .brand{
      margin-top: 0.05in;
      font-size: 8pt;
      font-weight: 800;
      letter-spacing: .14em;
      color: #333;
    }
  </style>
</head>
<body>
  <div class="printRoot">
    <div class="ticket">
      <div class="logoWrap">
        <img class="logo" id="logoImg" src="${logoUrl}" alt="Logo"/>
      </div>
      <div class="token">${escapeHtml(tokenNumber)}</div>
      <div class="dt">${escapeHtml(dateText)} &nbsp; ${escapeHtml(timeText)}</div>
      <div class="brand">SHIFA-UL-DAHAR</div>
    </div>
  </div>

  <script>
    (function(){
      const img = document.getElementById("logoImg");
      const safePrint = () => {
        setTimeout(() => {
          window.print();
          setTimeout(()=> window.close(), 250);
        }, 120);
      };
      if (!img) return safePrint();
      if (img.complete) return safePrint();
      img.onload = safePrint;
      img.onerror = safePrint;
      setTimeout(safePrint, 1200);
    })();
  </script>
</body>
</html>`;

  w.document.open();
  w.document.write(html);
  w.document.close();
}

btnPrintLast.addEventListener("click", ()=>{
  if (!lastPrintedPayload) return;
  printToken(lastPrintedPayload);
});

/* Save + Auto print */
form.addEventListener("submit", async (e)=>{
  e.preventDefault();

  const name = elName.value.trim();
  const phone = sanitizePhone(elPhone.value);
  const address = elAddress.value.trim();
  const purpose = elPurpose.value.trim();
  const otherInfo = elOtherInfo.value.trim();
  const priority = elPriority.value;

  if (!name || !phone){
    showToast("❌ Name and Mobile Number are required.");
    return;
  }

  try{
    const isManual = elManualMode.checked;
    let tokenNumber = "";

    if (isManual){
      tokenNumber = elManualToken.value.trim();
      if (!tokenNumber){
        showToast("❌ Manual token enabled — enter token #.");
        return;
      }
    } else {
      tokenNumber = await nextAutoToken();
    }

    const t = nowLocal();
    await addDoc(collection(db,"visitors"), {
      tokenNumber, isManual, name, phone, address, purpose, otherInfo, priority,
      status: "waiting",
      createdAt: serverTimestamp(),
      createdAtISO: t.iso,
      dateText: t.date,
      timeText: t.time
    });

    elLastToken.textContent = tokenNumber;
    elLastDateTime.textContent = `${t.date} • ${t.time}`;
    btnPrintLast.disabled = false;

    lastPrintedPayload = { tokenNumber, dateText: t.date, timeText: t.time };

    form.reset();
    elManualBox.classList.remove("enabled");
    elManualMode.checked = false;
    elManualToken.value = "";
    elPriority.value = "normal";

    showToast(`✅ Saved & Printing ${tokenNumber}`);
    printToken(lastPrintedPayload);

  } catch(err){
    console.error(err);
    showToast("❌ Error saving/printing. Check Firestore rules.");
  }
});

/* ✅ Queue + History listeners */
const visitorsRef = collection(db, "visitors");
let allRecentCache = [];
let waitingCache = [];

onSnapshot(
  query(visitorsRef, orderBy("createdAt", "desc"), limit(800)),
  (snap)=>{
    allRecentCache = snap.docs.map(d=> ({ id:d.id, ...d.data() }));
    waitingCache = allRecentCache.filter(r => (r.status || "waiting") === "waiting");
    renderQueuePreview();
    renderUpNext();
    renderHistory();
  },
  (err)=>{
    console.error(err);
    showToast("❌ Firestore listener error (check rules).");
  }
);

function priorityRank(p){
  if (p === "urgent") return 0;
  if (p === "vip") return 1;
  return 2;
}
function sortedWaiting(){
  return [...waitingCache].sort((a,b)=>{
    const ra = priorityRank(a.priority || "normal");
    const rb = priorityRank(b.priority || "normal");
    if (ra !== rb) return ra - rb;
    return (a.createdAtISO || "").localeCompare(b.createdAtISO || "");
  });
}

function renderQueuePreview(){
  const list = sortedWaiting().slice(0, 10);
  queueCountPill.textContent = `${waitingCache.length} waiting`;

  if (!list.length){
    queueList.innerHTML = `<div class="queue-empty">No visitors yet.</div>`;
    return;
  }

  queueList.innerHTML = list.map(r=>{
    const pri = r.priority || "normal";
    const tagClass = pri === "vip" ? "vip" : (pri === "urgent" ? "urgent" : "");
    const dt = `${r.dateText || ""} ${r.timeText || ""}`.trim();
    return `
      <div class="queue-item">
        <div class="q-left">
          <div class="q-token">${escapeHtml(r.tokenNumber || "-")}
            <span class="tag ${tagClass}">${escapeHtml(pri)}</span>
          </div>
          <div class="q-meta">${escapeHtml(r.name || "")} • ${escapeHtml(r.phone || "")}</div>
        </div>
        <div class="q-right"><div>${escapeHtml(dt)}</div></div>
      </div>
    `;
  }).join("");
}

/* History filtering */
historySearch.addEventListener("input", renderHistory);
historyPriority.addEventListener("change", renderHistory);
historyTokenType.addEventListener("change", renderHistory);

let lastHistoryFiltered = []; // <--- for printing

function getHistoryFiltered(){
  const s = toLowerSafe(historySearch.value).trim();
  const pf = historyPriority.value;
  const tf = historyTokenType.value;

  return allRecentCache.filter(r=>{
    if (pf !== "all" && (r.priority || "normal") !== pf) return false;
    if (tf !== "all"){
      const t = r.isManual ? "manual" : "auto";
      if (t !== tf) return false;
    }
    if (!s) return true;

    const hay = [
      r.tokenNumber,r.dateText,r.timeText,r.name,r.phone,r.address,r.purpose,r.otherInfo,r.priority,
      (r.isManual ? "manual":"auto"), (r.status || "")
    ].map(toLowerSafe).join(" ");
    return hay.includes(s);
  });
}

function renderHistory(){
  const filtered = getHistoryFiltered();
  lastHistoryFiltered = filtered;

  if (!allRecentCache.length){
    historyTbody.innerHTML = `<tr><td colspan="10" class="muted">No records yet.</td></tr>`;
    return;
  }

  if (!filtered.length){
    historyTbody.innerHTML = `<tr><td colspan="10" class="muted">No match found.</td></tr>`;
    return;
  }

  historyTbody.innerHTML = filtered.map(r=>{
    const dt = `${r.dateText||""} ${r.timeText||""}`.trim();
    return `
      <tr>
        <td class="mono">${escapeHtml(r.tokenNumber||"")}</td>
        <td class="mono">${escapeHtml(dt)}</td>
        <td>${escapeHtml(r.name||"")}</td>
        <td class="mono">${escapeHtml(r.phone||"")}</td>
        <td>${escapeHtml(r.address||"")}</td>
        <td>${escapeHtml(r.purpose||"")}</td>
        <td>${escapeHtml(r.otherInfo||"")}</td>
        <td>${escapeHtml(r.priority||"normal")}</td>
        <td>${escapeHtml(r.isManual ? "manual":"auto")}</td>
        <td>${escapeHtml(r.status||"waiting")}</td>
      </tr>
    `;
  }).join("");
}

/* Display: Up next */
function renderUpNext(){
  const list = sortedWaiting().slice(0, 8);

  if (!list.length){
    upNextList.innerHTML = `<div class="queue-empty">No waiting tokens.</div>`;
    return;
  }

  upNextList.innerHTML = list.map(r=>{
    const pri = r.priority || "normal";
    const tagClass = pri === "vip" ? "vip" : (pri === "urgent" ? "urgent" : "");
    return `
      <div class="queue-item">
        <div class="q-left">
          <div class="q-token">${escapeHtml(r.tokenNumber || "-")}
            <span class="tag ${tagClass}">${escapeHtml(pri)}</span>
          </div>
          <div class="q-meta">${escapeHtml(r.name || "")}</div>
        </div>
      </div>
    `;
  }).join("");
}

/* Now serving state */
const nowServingRef = doc(db, "meta", "nowServing");
onSnapshot(nowServingRef, (snap)=>{
  if (!snap.exists()){
    nowServing.textContent = "—";
    nowServingTime.textContent = "—";
    return;
  }
  const d = snap.data();
  nowServing.textContent = d.tokenNumber || "—";
  nowServingTime.textContent = `${d.dateText || ""} ${d.timeText || ""}`.trim() || "—";
});

/* Display buttons */
btnUnlockVoice.addEventListener("click", unlockVoice);

btnCallNext.addEventListener("click", async ()=>{
  try{
    const list = sortedWaiting();
    if (!list.length){
      showToast("⚠️ Queue is empty.");
      return;
    }

    const pick = list[0];

    await updateDoc(doc(db,"visitors", pick.id), {
      status: "serving",
      servingAt: serverTimestamp()
    });

    const t = nowLocal();
    await setDoc(nowServingRef, {
      tokenNumber: pick.tokenNumber,
      dateText: t.date,
      timeText: t.time,
      updatedAt: serverTimestamp()
    }, { merge:true });

    showToast(`✅ Calling Token ${pick.tokenNumber}`);
    beep();
    speak(`Token number ${pick.tokenNumber}. Please proceed to the counter.`);

  } catch(err){
    console.error(err);
    showToast("❌ Call Next failed. Check rules.");
  }
});

btnRepeatCall.addEventListener("click", ()=>{
  const token = nowServing.textContent || "—";
  if (token === "—"){
    showToast("⚠️ Nothing is being served right now.");
    return;
  }
  showToast(`🔁 Repeating call for ${token}`);
  beep();
  speak(`Token number ${token}. Please proceed to the counter.`);
});

btnClearNow.addEventListener("click", async ()=>{
  try{
    await setDoc(nowServingRef, { tokenNumber:"—", dateText:"", timeText:"", updatedAt: serverTimestamp() }, { merge:true });
    showToast("✅ Display cleared.");
  } catch(err){
    console.error(err);
    showToast("❌ Clear failed.");
  }
});

btnFullscreen.addEventListener("click", async ()=>{
  try{
    if (!document.fullscreenElement){
      await document.documentElement.requestFullscreen();
      showToast("✅ Fullscreen enabled.");
    } else {
      await document.exitFullscreen();
      showToast("✅ Fullscreen disabled.");
    }
  } catch(err){
    console.error(err);
    showToast("⚠️ Fullscreen not allowed.");
  }
});

/* ✅ A4 HISTORY PRINT (WOW DESIGN) */
btnPrintHistoryA4.addEventListener("click", ()=>{
  const rows = lastHistoryFiltered?.length ? lastHistoryFiltered : getHistoryFiltered();
  if (!rows.length){
    showToast("⚠️ No records to print (current filter is empty).");
    return;
  }
  printHistoryA4(rows);
});

/* ✅ FIXED: A4 PRINT SORT BY TOKEN ASCENDING */
function printHistoryA4(rows){
  const w = window.open("", "_blank", "width=1200,height=900");
  const t = nowLocal();
  const logoUrl = "logo1.png";

  // ✅ SORT ASC BY TOKEN (001, 002, 010 ...)
  const sortedRows = [...rows].sort((a,b)=>{
    const ta = parseInt(String(a.tokenNumber || "0").replace(/[^\d]/g,""), 10) || 0;
    const tb = parseInt(String(b.tokenNumber || "0").replace(/[^\d]/g,""), 10) || 0;
    return ta - tb;
  });

  const total = sortedRows.length;

  const tableRows = sortedRows.map((r, idx)=>{
    const dt = `${r.dateText||""} ${r.timeText||""}`.trim();
    return `
        <td class="mono">${escapeHtml(r.tokenNumber||"")}</td>
        <td class="mono">${escapeHtml(dt)}</td>
        <td>${escapeHtml(r.name||"")}</td>
        <td class="mono">${escapeHtml(r.phone||"")}</td>
        <td>${escapeHtml(r.address||"")}</td>
        <td>${escapeHtml(r.purpose||"")}</td>
      </tr>
    `;
  }).join("");

  const html = `
<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Visitor History Report</title>
<style>
  @page { size: A4; margin: 10mm; }
  html, body { margin:0; padding:0; background:#fff; color:#111; font-family: Arial, system-ui, sans-serif; }
  * { box-sizing:border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  .sheet{
    border: 2px solid #0C332F;
    border-radius: 14px;
    padding: 14px;
  }

  .header{
    display:flex;
    justify-content:space-between;
    align-items:center;
    gap:14px;
    padding-bottom: 12px;
    border-bottom: 2px solid rgba(12,51,47,.25);
  }

  .brand{
    display:flex; gap:12px; align-items:center;
  }
  .logo{
    width:64px; height:64px; object-fit:contain;
    border:1px solid rgba(12,51,47,.25);
    border-radius: 14px;
    padding: 8px;
  }
  .title{
    font-weight:900;
    letter-spacing:.18em;
    color:#0C332F;
    font-size: 14px;
  }
  .sub{
    margin-top:4px;
    color: rgba(0,0,0,.65);
    font-size: 12px;
    font-weight:700;
  }

  .meta{
    text-align:right;
    font-size: 12px;
    color: rgba(0,0,0,.7);
    font-weight:700;
  }

  .tableWrap{
    margin-top: 12px;
    border: 1px solid rgba(12,51,47,.22);
    border-radius: 12px;
    overflow:hidden;
  }
  table{
    width:100%;
    border-collapse: collapse;
    font-size: 10.5px;
  }
  thead th{
    background:#0C332F;
    color:#fff;
    padding: 8px 6px;
    text-align:left;
    letter-spacing:.06em;
    font-size: 10px;
    text-transform: uppercase;
  }
  tbody td{
    padding: 7px 6px;
    border-bottom: 1px solid rgba(0,0,0,.08);
    vertical-align: top;
  }
  tbody tr:nth-child(even){ background: #fbfbfb; }
  .mono{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
  .no{ width:26px; color: rgba(0,0,0,.65); font-weight:800; }

  .footer{
    margin-top: 12px;
    display:flex;
    justify-content:space-between;
    font-size: 11px;
    color: rgba(0,0,0,.65);
    border-top: 2px solid rgba(12,51,47,.20);
    padding-top: 10px;
  }
</style>
</head>
<body>
  <div class="sheet">
    <div class="header">
      <div class="brand">
        <img class="logo" src="${logoUrl}" alt="Logo"/>
        <div>
          <div class="title">SHIFA-UL-DAHAR • VISITOR HISTORY REPORT</div>
          <div class="sub">Printed report (Filtered) • Office Use</div>
        </div>
      </div>
      <div class="meta">
        <div><b>Date/Time:</b> ${escapeHtml(t.full)}</div>
        <div><b>Total Records:</b> ${total}</div>
      </div>
    </div>

    <div class="tableWrap">
      <table>
        <thead>
          <tr>
            <th>Token</th>
            <th>Date/Time</th>
            <th>Name</th>
            <th>Mobile</th>
            <th>Address</th>
            <th>Purpose</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    </div>

    <div class="footer">
      <div>Shifa-ul-Dahar • Visitor System</div>
      <div>Confidential • Office Use Only</div>
    </div>
  </div>

  <script>
    window.onload = () => { setTimeout(()=> window.print(), 150); };
  </script>
</body>
</html>`;

  w.document.open();
  w.document.write(html);
  w.document.close();
}

