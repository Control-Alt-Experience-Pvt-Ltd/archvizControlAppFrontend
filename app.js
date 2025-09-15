// === CONFIG ================================================================
const API_BASE = ""; // production: Vercel rewrites /api/* → archvizcontrol.ctrlaltxp.com

const $ = (s) => document.querySelector(s);

// === View switching ========================================================
function showPage(which){
  const login = $("#page-login"), dash = $("#page-dashboard"), out = $("#signout-btn");
  if(which === "login"){ login?.classList.remove("d-none"); dash?.classList.add("d-none"); out?.classList.add("d-none"); }
  else { login?.classList.add("d-none"); dash?.classList.remove("d-none"); out?.classList.remove("d-none"); }
}

// === Helpers ===============================================================
function setStatusPill(state){
  const pill = $("#status-pill"); if(!pill) return;
  pill.className = "status-pill";
  if(state==="running") pill.classList.add("status-running");
  else if(state==="stopped") pill.classList.add("status-stopped");
  else pill.classList.add("status-warn");
  pill.textContent = state || "unknown";
}
function showSnack(type, text){
  const bar=$("#snackbar"),icon=$("#snack-icon"),lab=$("#snack-text");
  if(!bar||!icon||!lab) return;
  lab.textContent=text; icon.style.background = type==="ok"?"#22c55e":type==="error"?"#ef4444":"#94a3b8";
  bar.classList.add("show"); setTimeout(()=>bar.classList.remove("show"),2200);
}
function showErrorModal(code,msg){
  $("#err-code").textContent = code||"Unknown";
  $("#err-msg").textContent  = msg||"—";
  const help=$("#err-help"); help.innerHTML="";
  ["Retry after a few seconds.","Check CloudTrail for exact error context."].forEach(t=>{const li=document.createElement("li"); li.textContent=t; help.appendChild(li);});
  new bootstrap.Modal($("#errorModal")).show();
}

// === API wrapper ===========================================================
async function api(path, opts={}){
  const res = await fetch(API_BASE + path, {
    method: opts.method || "GET",
    headers: opts.headers || { "Content-Type":"application/json" },
    body: opts.body ? JSON.stringify(opts.body) : null,
    credentials: "include"
  });
  let data={}; try{ data = await res.json(); }catch{}
  if(!res.ok || data.ok === false) throw { code:data.code||"Unknown", message:data.message||`HTTP ${res.status}` };
  return data;
}

// === Data flows ============================================================
async function loadStatus(){
  const d = await api("/api/status");
  setStatusPill(d.state||"unknown");
  [["#instance-name",d.instanceName||"G5 EC2 Instance – ArchViz Streamer"],
   ["#public-ip",d.publicIp||"—"],
   ["#elastic-ip",d.elasticIp||"—"],
   ["#instance-id",d.instanceId||"—"],
   ["#region",d.region||"—"]].forEach(([sel,val])=>{const el=$(sel); if(el) el.textContent=val;});
  $("#start-btn").disabled = !(d.state==="stopped");
  $("#stop-btn").disabled  = !(d.state==="running");
  return d;
}
async function pollUntil(target, timeoutMs=180000, intervalMs=5000){
  const t0=Date.now();
  while(Date.now()-t0 < timeoutMs){
    const s=await loadStatus(); if(s.state===target) return;
    await new Promise(r=>setTimeout(r,intervalMs));
  }
  throw { code:"Timeout", message:`Instance did not reach '${target}' in time` };
}

// === Bindings ==============================================================
function bindAuth(){
  const pw=$("#login-password"), btn=$("#toggle-pw");
  btn?.addEventListener("click", ()=>{
    if(!pw) return;
    const show = pw.type==="password";
    pw.type = show ? "text" : "password";
    btn.textContent = show ? "Hide" : "Show";
  });

  $("#login-form")?.addEventListener("submit", async (e)=>{
    e.preventDefault(); $("#login-error")?.classList.add("d-none");
    try{
      const username = ($("#login-username")?.value||"").trim();
      const password = $("#login-password")?.value||"";
      const res = await fetch(API_BASE + "/login", {
        method: "POST",
        headers: { "Content-Type":"application/x-www-form-urlencoded" },
        credentials: "include",
        body: new URLSearchParams({ username, password })
      });
      if(!res.ok){ $("#login-error")?.classList.remove("d-none"); return; }
      showPage("dashboard"); await loadStatus();
    }catch{ $("#login-error")?.classList.remove("d-none"); }
  });

  $("#signout-btn")?.addEventListener("click", async ()=>{
    try{ await fetch(API_BASE + "/logout", { method:"POST", credentials:"include" }); }catch{}
    $("#login-form")?.reset();
    const pwField = $("#login-password");
    const toggle  = $("#toggle-pw");
    if (pwField) pwField.type = "password";
    if (toggle)  toggle.textContent = "Show";
    showPage("login");
  });
}

function bindControls(){
  const start=$("#start-btn"), stop=$("#stop-btn"), refresh=$("#refresh-btn");

  start?.addEventListener("click", async ()=>{
    start.disabled=stop.disabled=refresh.disabled=true; setStatusPill("pending"); showSnack("progress","Starting…");
    try{ await api("/api/start",{method:"POST"}); await pollUntil("running"); showSnack("ok","Instance is running"); }
    catch(e){ setStatusPill("stopped"); showSnack("error","Start failed"); showErrorModal(e.code,e.message); }
    finally{ await loadStatus(); refresh.disabled=false; }
  });

  stop?.addEventListener("click", async ()=>{
    start.disabled=stop.disabled=refresh.disabled=true; setStatusPill("stopping"); showSnack("progress","Stopping…");
    try{ await api("/api/stop",{method:"POST"}); await pollUntil("stopped"); showSnack("ok","Instance stopped"); }
    catch(e){ setStatusPill("running"); showSnack("error","Stop failed"); showErrorModal(e.code,e.message); }
    finally{ await loadStatus(); refresh.disabled=false; }
  });

  refresh?.addEventListener("click", async ()=>{
    refresh.disabled=true; showSnack("progress","Refreshing…");
    try{ await loadStatus(); showSnack("ok","Up to date"); }
    catch(e){ showSnack("error","Refresh failed"); showErrorModal(e.code,e.message); }
    finally{ refresh.disabled=false; }
  });
}

// === Init ==================================================================
document.addEventListener("DOMContentLoaded", ()=>{
  showPage("login");
  bindAuth();
  bindControls();
});