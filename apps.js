import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore, collection, addDoc, doc, runTransaction,
  serverTimestamp, query, where, getDocs, orderBy, limit, onSnapshot,
  setDoc, updateDoc, deleteDoc, writeBatch
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

const btnGoToken = document.getElementById("btnGoToken");
const btnGoHistory = document.getElementById("btnGoHistory");

const form = document.getElementById("visitorForm");
const elName = document.getElementById("name");
const elPhone = document.getElementById("phone");
const elAddress = document.getElementById("address");
const elPurpose = document.getElementById("purpose");

const elManualMode = document.getElementById("manualMode");
const elManualBox = document.getElementById("manualBox");
const elManualToken = document.getElementById("manualToken");

const btnPrintLast = document.getElementById("btnPrintLast");
const elSoundAlert = document.getElementById("soundAlert");

const elLastToken = document.getElementById("lastToken");
const elLastDateTime = document.getElementById("lastDateTime");

const recentList = document.getElementById("recentList");
const recentCountPill = document.getElementById("recentCountPill");

const toast = document.getElementById("toast");
const toastText = document.getElementById("toastText");
const toastClose = document.getElementById("toastClose");

const historyTbody = document.getElementById("historyTbody");
const historySearch = document.getElementById("historySearch");
const historyTokenType = document.getElementById("historyTokenType");

const btnPrintHistoryA4 = document.getElementById("btnPrintHistoryA4");
const printRange = document.getElementById("printRange");
const btnClearDatabase = document.getElementById("btnClearDatabase");

/* Helpers */
function padToken(n){ return String(n).padStart(3,"0"); }
function sanitizePhone(p){ return (p || "").replace(/[^\d+]/g, "").trim(); }
function toLowerSafe(v){ return (v ?? "").toString().toLowerCase(); }

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

/* Pakistan time helpers (for daily reset at 12:00AM PKT) */
const PK_TZ = "Asia/Karachi";

function pkParts(date = new Date()){
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: PK_TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
  });
  const parts = fmt.formatToParts(date);
  const get = (t) => parts.find(p => p.type === t)?.value || "";
  return {
    y: get("year"),
    m: get("month"),
    d: get("day"),
    hh: get("hour"),
    mm: get("minute"),
    ss: get("second"),
    ymd: `${get("year")}-${get("month")}-${get("day")}`,
    hm: `${get("hour")}:${get("minute")}`,
  };
}

function nowLocal(){
  const d = new Date();
  const pk = pkParts(d);
  // friendly strings still ok; but ISO is UTC for exact ordering
  return {
    date: `${pk.d}-${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][Number(pk.m)-1]}-${pk.y}`,
    time: pk.hm,
    iso: d.toISOString(),
    full: d.toLocaleString()
  };
}

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

/* Navigation */
function setPage(which){
  pageToken.classList.toggle("hidden", which !== "token");
  pageHistory.classList.toggle("hidden", which !== "history");
  btnGoToken.classList.toggle("active", which === "token");
  btnGoHistory.classList.toggle("active", which === "history");
}
btnGoToken.addEventListener("click", ()=> setPage("token"));
btnGoHistory.addEventListener("click", ()=> setPage("history"));

/* Manual toggle */
elManualMode.addEventListener("change", ()=>{
  elManualBox.classList.toggle("enabled", elManualMode.checked);
  if (!elManualMode.checked) elManualToken.value = "";
});

/* Duplicate phone warning */
let phoneCheckDebounce = null;
async function checkPhoneExists(phone){
  const clean = sanitizePhone(phone);
  if (!clean || clean.length < 7) return;

  try{
    const q1 = query(collection(db,"visitors"), where("phone","==", clean), limit(1));
    const snap = await getDocs(q1);
    if (!snap.empty){
      const data = snap.docs[0].data();
      showToast(`⚠️ Already exists: ${data.name || "Visitor"} (${clean})`);
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

/* Token counter (resets daily at 12:00AM PKT) */
async function nextAutoToken(){
  const counterRef = doc(db, "meta", "tokenCounter");
  const todayPK = pkParts().ymd;

  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const data = snap.exists() ? snap.data() : {};
    const lastDate = data.lastDate || "";
    let lastNumber = Number(data.lastNumber || 0);

    // if new day in PKT, reset
    if (lastDate !== todayPK){
      lastNumber = 0;
    }

    const next = lastNumber + 1;
    tx.set(counterRef, { lastNumber: next, lastDate: todayPK, updatedAt: serverTimestamp() }, { merge:true });
    return padToken(next);
  });
}

/* Receipt Print */
let lastPrintedPayload = null;
const PRINTER_OFFSETS = { xIn: 0.90, yIn: 0 };

function printToken({ tokenNumber, dateText, timeText }){
  const w = window.open("", "_blank", "width=420,height=420");
  const logoUrl = "https://raw.githubusercontent.com/shifauldahar/tokengenrator/647e3f4364da72d7c8e26f02bb58a912d5ae5431/logo.png";
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

    .printRoot{ position: fixed; inset: 0; width: 2in; height: 3in; background: #fff; }

    .ticket{
      position:absolute;
      left:50%;
      top:50%;
      transform: translate(-50%, -50%) translate(${x}in, ${y}in);
      width:2in;
      height:3in;
      padding: 0.00in 0.00in 0.00in;
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
      tokenNumber,
      isManual,
      name,
      phone,
      address,
      purpose,
      createdAt: serverTimestamp(),
      createdAtISO: t.iso,
      dateText: t.date,
      timeText: t.time,
      pkDate: pkParts().ymd // helps for filtering/printing
    });

    elLastToken.textContent = tokenNumber;
    elLastDateTime.textContent = `${t.date} • ${t.time}`;
    btnPrintLast.disabled = false;

    lastPrintedPayload = { tokenNumber, dateText: t.date, timeText: t.time };

    form.reset();
    elManualBox.classList.remove("enabled");
    elManualMode.checked = false;
    elManualToken.value = "";

    showToast(`✅ Saved & Printing ${tokenNumber}`);
    printToken(lastPrintedPayload);

  } catch(err){
    console.error(err);
    showToast("❌ Error saving/printing. Check Firestore rules.");
  }
});

/* Live listeners */
const visitorsRef = collection(db, "visitors");
let allRecentCache = [];

onSnapshot(
  query(visitorsRef, orderBy("createdAt", "desc"), limit(1200)),
  (snap)=>{
    allRecentCache = snap.docs.map(d=> ({ id:d.id, ...d.data() }));
    renderRecentPreview();
    renderHistory();
  },
  (err)=>{
    console.error(err);
    showToast("❌ Firestore listener error (check rules).");
  }
);

/* Recent preview */
function renderRecentPreview(){
  recentCountPill.textContent = `${allRecentCache.length} records`;
  const list = allRecentCache.slice(0, 10);

  if (!list.length){
    recentList.innerHTML = `<div class="queue-empty">No visitors yet.</div>`;
    return;
  }

  recentList.innerHTML = list.map(r=>{
    const dt = `${r.dateText || ""} ${r.timeText || ""}`.trim();
    return `
      <div class="queue-item">
        <div class="q-left">
          <div class="q-token">${escapeHtml(r.tokenNumber || "-")}</div>
          <div class="q-meta">${escapeHtml(r.name || "")} • ${escapeHtml(r.phone || "")}</div>
        </div>
        <div class="q-right"><div>${escapeHtml(dt)}</div></div>
      </div>
    `;
  }).join("");
}

/* History filtering */
historySearch.addEventListener("input", renderHistory);
historyTokenType.addEventListener("change", renderHistory);

let lastHistoryFiltered = []; // for printing

function getHistoryFiltered(){
  const s = toLowerSafe(historySearch.value).trim();
  const tf = historyTokenType.value;

  return allRecentCache.filter(r=>{
    if (tf !== "all"){
      const t = r.isManual ? "manual" : "auto";
      if (t !== tf) return false;
    }
    if (!s) return true;

    const hay = [
      r.tokenNumber, r.dateText, r.timeText,
      r.name, r.phone, r.address, r.purpose,
      (r.isManual ? "manual":"auto")
    ].map(toLowerSafe).join(" ");
    return hay.includes(s);
  });
}

/* 24h edit/delete rule */
const H24 = 24 * 60 * 60 * 1000;
function canEditDelete(r){
  const iso = r.createdAtISO;
  if (!iso) return false;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return false;
  return (Date.now() - ms) <= H24;
}

function renderHistory(){
  const filtered = getHistoryFiltered();
  lastHistoryFiltered = filtered;

  if (!allRecentCache.length){
    historyTbody.innerHTML = `<tr><td colspan="8" class="muted">No records yet.</td></tr>`;
    return;
  }

  if (!filtered.length){
    historyTbody.innerHTML = `<tr><td colspan="8" class="muted">No match found.</td></tr>`;
    return;
  }

  historyTbody.innerHTML = filtered.map(r=>{
    const dt = `${r.dateText||""} ${r.timeText||""}`.trim();
    const typeText = r.isManual ? "manual" : "auto";
    const allowed = canEditDelete(r);

    return `
      <tr>
        <td class="mono">${escapeHtml(r.tokenNumber||"")}</td>
        <td class="mono">${escapeHtml(dt)}</td>
        <td>${escapeHtml(r.name||"")}</td>
        <td class="mono">${escapeHtml(r.phone||"")}</td>
        <td>${escapeHtml(r.address||"")}</td>
        <td>${escapeHtml(r.purpose||"")}</td>
        <td>${escapeHtml(typeText)}</td>
        <td>
          <button class="btn btn-secondary btn-mini" data-act="edit" data-id="${escapeHtml(r.id)}" ${allowed ? "" : "disabled"}>Edit</button>
          <button class="btn btn-danger btn-mini" data-act="del" data-id="${escapeHtml(r.id)}" ${allowed ? "" : "disabled"}>Delete</button>
        </td>
      </tr>
    `;
  }).join("");
}

/* Handle Edit/Delete clicks (event delegation) */
historyTbody.addEventListener("click", async (e)=>{
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;

  const act = btn.dataset.act;
  const id = btn.dataset.id;
  const row = allRecentCache.find(x => x.id === id);
  if (!row){
    showToast("⚠️ Record not found (cache).");
    return;
  }
  if (!canEditDelete(row)){
    showToast("⛔ This record is locked (24 hours passed).");
    return;
  }

  if (act === "del"){
    const ok = confirm(`Delete token ${row.tokenNumber}? This cannot be undone.`);
    if (!ok) return;

    try{
      await deleteDoc(doc(db, "visitors", id));
      showToast(`✅ Deleted ${row.tokenNumber}`);
    } catch(err){
      console.error(err);
      showToast("❌ Delete failed. Check Firestore rules.");
    }
    return;
  }

  if (act === "edit"){
    const newName = prompt("Update Name:", row.name || "");
    if (newName === null) return;

    const newPhoneRaw = prompt("Update Mobile:", row.phone || "");
    if (newPhoneRaw === null) return;
    const newPhone = sanitizePhone(newPhoneRaw);

    const newAddress = prompt("Update Address:", row.address || "");
    if (newAddress === null) return;

    const newPurpose = prompt("Update Purpose:", row.purpose || "");
    if (newPurpose === null) return;

    if (!newName.trim() || !newPhone){
      showToast("❌ Name and Mobile are required.");
      return;
    }

    try{
      await updateDoc(doc(db,"visitors", id), {
        name: newName.trim(),
        phone: newPhone,
        address: newAddress.trim(),
        purpose: newPurpose.trim(),
        updatedAt: serverTimestamp()
      });
      showToast(`✅ Updated ${row.tokenNumber}`);
    } catch(err){
      console.error(err);
      showToast("❌ Update failed. Check Firestore rules.");
    }
  }
});

/* PRINT button */
btnPrintHistoryA4.addEventListener("click", ()=>{
  // use currently filtered table
  const rows = lastHistoryFiltered?.length ? lastHistoryFiltered : getHistoryFiltered();

  const ranged = applyPrintRange(rows);
  if (!ranged.length){
    showToast("⚠️ No records to print (current filter/range is empty).");
    return;
  }
  printHistoryA4(ranged);
});

/* Print range filter (All / Today / This Month / This Year) in PKT */
function applyPrintRange(rows){
  const mode = printRange?.value || "all";
  if (mode === "all") return rows;

  const now = pkParts();
  const today = now.ymd;
  const thisMonth = `${now.y}-${now.m}`;
  const thisYear = `${now.y}`;

  return rows.filter(r=>{
    const d = (r.pkDate || "").trim(); // YYYY-MM-DD
    if (!d) return false;

    if (mode === "today") return d === today;
    if (mode === "month") return d.startsWith(thisMonth);
    if (mode === "year") return d.startsWith(thisYear);
    return true;
  });
}

/* A4 Print */
function printHistoryA4(rows){
  const w = window.open("", "_blank", "width=1200,height=900");
  const t = nowLocal();
  const logoUrl = "logo1.png";

  // Sort ascending by numeric part of token
  const sortedRows = [...rows].sort((a,b)=>{
    const ta = parseInt(String(a.tokenNumber || "0").replace(/[^\d]/g,""), 10) || 0;
    const tb = parseInt(String(b.tokenNumber || "0").replace(/[^\d]/g,""), 10) || 0;
    return ta - tb;
  });

  const total = sortedRows.length;

  const tableRows = sortedRows.map((r)=>{
    const dt = `${r.dateText||""} ${r.timeText||""}`.trim();
    return `
      <tr>
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
  .brand{ display:flex; gap:12px; align-items:center; }
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
  table{ width:100%; border-collapse: collapse; font-size: 10.5px; }
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
          <div class="sub">Printed report (Filtered + Range) • Office Use</div>
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

/* DELETE ALL DATA (Clear Database) */
btnClearDatabase.addEventListener("click", async ()=>{
  const ok = confirm("⚠️ This will DELETE ALL visitor records and RESET token counter. Continue?");
  if (!ok) return;

  try{
    showToast("⏳ Clearing database...");
    await deleteAllVisitorsAndReset();
    showToast("✅ Database cleared + token counter reset.");
  } catch(err){
    console.error(err);
    showToast("❌ Clear failed. Check Firestore rules.");
  }
});

async function deleteAllVisitorsAndReset(){
  // 1) delete visitors in batches
  const snap = await getDocs(query(visitorsRef, limit(2000)));
  const docs = snap.docs;

  // Firestore batch limit ~500 writes
  let i = 0;
  while (i < docs.length){
    const batch = writeBatch(db);
    const chunk = docs.slice(i, i + 450);
    chunk.forEach(d => batch.delete(doc(db, "visitors", d.id)));
    await batch.commit();
    i += 450;
  }

  // 2) reset counter doc
  const counterRef = doc(db, "meta", "tokenCounter");
  const todayPK = pkParts().ymd;
  await setDoc(counterRef, { lastNumber: 0, lastDate: todayPK, updatedAt: serverTimestamp() }, { merge:true });
}
