'use strict';

const CATEGORIES = ['Geladeira','Freezer','Armário','Despensa','Bebidas','Limpeza','Higiene','Outros'];
const DEFAULT_DB = () => ({
  config: { version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  products: [],
  history: [],
  shoppingList: [],
  statistics: { backups: [] }
});

const state = {
  db: DEFAULT_DB(),
  settings: JSON.parse(localStorage.getItem('githubSettings') || 'null'),
  sha: null,
  dirty: false,
  editingId: null,
  scanStream: null,
  scanTimer: null
};

const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];
const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const todayISO = () => new Date().toISOString().slice(0,10);
const parseDate = d => d ? new Date(`${d}T00:00:00`) : null;
const daysUntil = d => Math.ceil((parseDate(d) - parseDate(todayISO())) / 86400000);
const fmtDate = d => d ? new Date(`${d}T00:00:00`).toLocaleDateString('pt-BR') : 'Sem validade';
const fmtDateTime = d => new Date(d).toLocaleString('pt-BR');
const toast = msg => { const el = document.createElement('div'); el.className='toast'; el.textContent=msg; document.body.appendChild(el); setTimeout(()=>el.remove(),2600); };

function saveSettings(settings){ state.settings = settings; localStorage.setItem('githubSettings', JSON.stringify(settings)); }
function githubHeaders(){ return { Authorization:`Bearer ${state.settings.token}`, Accept:'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28' }; }
function dbUrl(){ const {owner,repo,branch}=state.settings; return `https://api.github.com/repos/${owner}/${repo}/contents/database.json?ref=${branch}`; }
function encodeUtf8(str){ return btoa(unescape(encodeURIComponent(str))); }
function decodeUtf8(str){ return decodeURIComponent(escape(atob(str))); }

async function githubReadDatabase(){
  const res = await fetch(dbUrl(), { headers: githubHeaders() });
  if(res.status === 404){ await githubSaveDatabase('Criar database.json inicial'); return; }
  if(!res.ok) throw new Error('Não foi possível ler database.json. Confira token, usuário, repositório e branch.');
  const file = await res.json();
  state.sha = file.sha;
  state.db = normalizeDb(JSON.parse(decodeUtf8(file.content.replace(/\n/g,''))));
  localStorage.setItem('lastDatabase', JSON.stringify(state.db));
}

async function githubSaveDatabase(message='Atualizar database.json'){
  state.db.config.updatedAt = new Date().toISOString();
  const body = { message, content: encodeUtf8(JSON.stringify(state.db,null,2)), branch: state.settings.branch };
  if(state.sha) body.sha = state.sha;
  const res = await fetch(dbUrl().replace(`?ref=${state.settings.branch}`,''), { method:'PUT', headers:{...githubHeaders(),'Content-Type':'application/json'}, body:JSON.stringify(body) });
  if(!res.ok){ state.dirty = true; localStorage.setItem('pendingDatabase', JSON.stringify(state.db)); throw new Error('Alteração salva localmente, mas ainda não sincronizou com o GitHub.'); }
  const out = await res.json(); state.sha = out.content.sha; state.dirty = false;
  localStorage.setItem('lastDatabase', JSON.stringify(state.db)); localStorage.removeItem('pendingDatabase');
}

function normalizeDb(db){
  const base = DEFAULT_DB();
  db = {...base, ...db};
  db.products = Array.isArray(db.products) ? db.products : [];
  db.history = Array.isArray(db.history) ? db.history : [];
  db.shoppingList = Array.isArray(db.shoppingList) ? db.shoppingList : [];
  db.products.forEach(p => { p.expirations = Array.isArray(p.expirations) ? p.expirations : []; p.favorite = !!p.favorite; });
  return db;
}

async function persist(message){
  renderAll();
  try{ if(navigator.onLine && state.settings) await githubSaveDatabase(message); }
  catch(e){ toast(e.message); }
}

async function boot(){
  document.body.classList.toggle('dark', localStorage.getItem('theme') === 'dark');
  registerServiceWorker(); fillSelects(); bindEvents();
  if(!state.settings){ $('#setupScreen').classList.remove('hidden'); return; }
  $('#mainApp').classList.remove('hidden');
  const pending = localStorage.getItem('pendingDatabase');
  const last = localStorage.getItem('lastDatabase');
  if(last) state.db = normalizeDb(JSON.parse(last));
  renderAll();
  try{ await githubReadDatabase(); if(pending){ state.db = normalizeDb(JSON.parse(pending)); await githubSaveDatabase('Sincronizar alterações offline'); } renderAll(); checkNotifications(); }
  catch(e){ toast(e.message); }
}

function registerServiceWorker(){ if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js'); }
function fillSelects(){
  const cats = ['<option value="all">Todas categorias</option>',...CATEGORIES.map(c=>`<option>${c}</option>`)].join('');
  $('#categoryFilter').innerHTML = cats; $('#category').innerHTML = CATEGORIES.map(c=>`<option>${c}</option>`).join('');
}

function bindEvents(){
  $('#setupForm').addEventListener('submit', async e => { e.preventDefault(); saveSettings({ token:$('#githubToken').value.trim(), owner:$('#githubOwner').value.trim(), repo:$('#githubRepo').value.trim(), branch:$('#githubBranch').value.trim() || 'main' }); $('#setupScreen').classList.add('hidden'); $('#mainApp').classList.remove('hidden'); try{ await githubReadDatabase(); renderAll(); toast('Sincronizado com sucesso.'); }catch(err){ toast(err.message); } });
  $$('.tabs button').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
  $('#themeBtn').onclick=()=>{ document.body.classList.toggle('dark'); localStorage.setItem('theme', document.body.classList.contains('dark')?'dark':'light'); };
  $('#syncBtn').onclick=async()=>{ try{ await githubReadDatabase(); renderAll(); toast('Sincronizado.'); }catch(e){ toast(e.message); } };
  $('#notifyBtn').onclick=enableNotifications;
  $('#settingsBtn').onclick=openSettings; $('#settingsForm').onsubmit=saveSettingsForm;
  $('#addProductBtn').onclick=()=>openProduct(); $('#openAddBtn').onclick=()=>openProduct();
  $('#productForm').onsubmit=saveProductForm; $('#deleteProductBtn').onclick=deleteCurrentProduct;
  $$('[data-close]').forEach(b=>b.onclick=()=>$('#'+b.dataset.close).close());
  ['searchInput','categoryFilter','validityFilter'].forEach(id=>$('#'+id).addEventListener('input',renderProducts));
  $('#exportBtn').onclick=exportJson; $('#openImportBtn').onclick=()=>$('#importFile').click(); $('#importFile').onchange=importJson;
  $('#backupBtn').onclick=createBackup; $('#restoreBtn').onclick=restoreBackup;
  $('#scanBtn').onclick=startBarcodeScanner; $('#stopScanBtn').onclick=stopBarcodeScanner;
  window.addEventListener('online', async()=>{ const pending=localStorage.getItem('pendingDatabase'); if(pending){ state.db=normalizeDb(JSON.parse(pending)); await persist('Sincronizar alterações offline'); } });
}

function showView(id){ $$('.tabs button').forEach(b=>b.classList.toggle('active',b.dataset.view===id)); $$('.view').forEach(v=>v.classList.toggle('active-view',v.id===id)); }

function productQty(p){ const exps=Array.isArray(p.expirations)?p.expirations:[]; return exps.length ? exps.filter(e=>!e.consumed).length : Number(p.quantity || 0); }
function sortedExpirations(p){ return [...(p.expirations||[])].filter(e=>!e.consumed).sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999')); }
function productStatus(p){ const exp=sortedExpirations(p)[0]; if(!exp) return {label:'Sem validade', cls:'ok'}; const d=daysUntil(exp.date); if(d<0) return {label:'Vencido', cls:'danger'}; if(d===0) return {label:'Vence hoje', cls:'warning'}; if(d<=7) return {label:`Vence em ${d} dias`, cls:'warning'}; if(d<=15) return {label:`Vence em ${d} dias`, cls:'warning'}; return {label:`Validade ${fmtDate(exp.date)}`, cls:'ok'}; }

function renderAll(){ renderDashboard(); renderProducts(); renderShopping(); renderHistory(); }
function renderDashboard(){
  const products=state.db.products, total=products.reduce((s,p)=>s+productQty(p),0);
  const alerts=getAlerts(); const expired=alerts.filter(a=>a.days<0).length; const missing=products.filter(p=>productQty(p)===0).length;
  const month=new Date().toISOString().slice(0,7); const consumed=state.db.history.filter(h=>h.type==='Saída' && h.date.startsWith(month)).reduce((s,h)=>s+Number(h.quantity),0);
  $('#statsGrid').innerHTML = [ ['Produtos',total], ['Próx. vencimento',alerts.filter(a=>a.days>=0&&a.days<=15).length], ['Vencidos',expired], ['Em falta',missing], ['Consumidos mês',consumed] ].map(([l,v])=>`<div class="stat-card"><b>${v}</b><span>${l}</span></div>`).join('');
  $('#alertsList').innerHTML = alerts.length ? alerts.slice(0,12).map(a=>`<div class="list-item"><div><strong>${a.name}</strong><span class="muted small">${a.label} · ${fmtDate(a.date)}</span></div><span class="badge ${a.days<0?'danger':'warning'}">${a.days<0?'Vencido':'Alerta'}</span></div>`).join('') : '<div class="empty">Nenhum alerta no momento.</div>';
  const top = topConsumed(); $('#topConsumed').innerHTML = top.length ? top.map(t=>`<div class="list-item"><strong>${t.name}</strong><span class="badge">${t.qty} saídas</span></div>`).join('') : '<div class="empty">Ainda sem consumo registrado.</div>';
}
function getAlerts(){ return state.db.products.flatMap(p=>sortedExpirations(p).map(e=>({name:p.name,date:e.date,days:daysUntil(e.date)}))).filter(a=>a.days<=15).sort((a,b)=>a.days-b.days).map(a=>({...a,label:a.days<0?'Produto vencido':a.days===0?'Vence hoje':a.days===1?'Vence amanhã':`Vence em ${a.days} dias`})); }
function topConsumed(){ const map={}; state.db.history.filter(h=>h.type==='Saída').forEach(h=>map[h.productName]=(map[h.productName]||0)+Number(h.quantity)); return Object.entries(map).map(([name,qty])=>({name,qty})).sort((a,b)=>b.qty-a.qty).slice(0,6); }

function renderProducts(){
  const q=$('#searchInput').value?.toLowerCase()||'', cat=$('#categoryFilter').value, vf=$('#validityFilter').value;
  let products=state.db.products.filter(p=>productQty(p)>0).filter(p=>[p.name,p.brand,p.location,p.category].join(' ').toLowerCase().includes(q));
  if(cat && cat!=='all') products=products.filter(p=>p.category===cat);
  if(vf!=='all') products=products.filter(p=>{ const exp=sortedExpirations(p)[0]; if(!exp) return false; const d=daysUntil(exp.date); return vf==='expired'?d<0:vf==='today'?d===0:d>=0&&d<=Number(vf); });
  $('#productsGrid').innerHTML = products.length ? products.map(productCard).join('') : '<div class="empty glass-card">Nenhum produto encontrado.</div>';
  $$('.edit-product').forEach(b=>b.onclick=()=>openProduct(b.dataset.id));
  $$('.consume-product').forEach(b=>b.onclick=()=>consumeProduct(b.dataset.id));
  $$('.duplicate-product').forEach(b=>b.onclick=()=>duplicateProduct(b.dataset.id));
  $$('.favorite-product').forEach(b=>b.onclick=()=>toggleFavorite(b.dataset.id));
}
function productCard(p){ const st=productStatus(p), qty=productQty(p), exp=sortedExpirations(p).slice(0,4).map(e=>fmtDate(e.date)).join(', '); return `<article class="product-card compact"><div class="product-head"><div><h3>${escapeHtml(p.name)}</h3><p class="muted small">${escapeHtml(p.brand||'Sem marca')} · ${escapeHtml(p.category||'Outros')}</p></div><button class="icon-btn favorite-product" data-id="${p.id}">${p.favorite?'★':'☆'}</button></div><div><span class="badge ${st.cls}">${st.label}</span></div><p><strong>${qty}</strong> ${escapeHtml(p.unit||'un')} · <span class="muted">${escapeHtml(p.location||'Sem local')}</span></p><p class="muted small">Validades: ${exp || 'Não informadas'}</p><div class="product-actions"><button class="soft-btn consume-product" data-id="${p.id}">Consumir</button><button class="soft-btn edit-product" data-id="${p.id}">Editar</button><button class="soft-btn duplicate-product" data-id="${p.id}">Duplicar</button></div></article>`; }
function escapeHtml(str=''){ return String(str).replace(/[&<>'"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

function openProduct(id=null){
  state.editingId=id; const p=id?state.db.products.find(x=>x.id===id):null;
  $('#productDialogTitle').textContent=p?'Editar produto':'Novo produto'; $('#deleteProductBtn').classList.toggle('hidden',!p);
  $('#productId').value=p?.id||''; $('#name').value=p?.name||''; $('#category').value=p?.category||'Outros'; $('#brand').value=p?.brand||''; $('#quantity').value=p?productQty(p):1; $('#unit').value=p?.unit||'un'; $('#location').value=p?.location||''; $('#barcode').value=p?.barcode||''; $('#notes').value=p?.notes||''; const activeDates=(p?.expirations||[]).filter(e=>!e.consumed).map(e=>e.date).filter(Boolean); const uniqueDates=[...new Set(activeDates)]; $('#quickExpiration').value=uniqueDates.length===1 ? uniqueDates[0] : ''; $('#expirations').value=uniqueDates.length>1 ? activeDates.join('\n') : '';
  $('#productDialog').showModal();
}
async function fileToBase64(file){ if(!file) return null; return new Promise(res=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.readAsDataURL(file); }); }
async function saveProductForm(e){
  e.preventDefault();
  const id=$('#productId').value||uid();
  const existing=state.db.products.find(p=>p.id===id);
  const quantity=Math.max(0, Number($('#quantity').value||0));
  const manualDates=$('#expirations').value.split(/\n|,/).map(v=>v.trim()).filter(Boolean);
  const quickDate=$('#quickExpiration').value;
  let dates=[];

  if(manualDates.length){
    dates=manualDates;
  } else if(quickDate && quantity>0){
    dates=Array.from({length:quantity},()=>quickDate);
  }

  const expirations=dates.map(date=>({ id:uid(), date, consumed:false }));
  const product={
    id,
    name:$('#name').value.trim(),
    category:$('#category').value,
    brand:$('#brand').value.trim(),
    quantity:expirations.length ? expirations.length : quantity,
    unit:$('#unit').value,
    location:$('#location').value.trim(),
    barcode:$('#barcode').value.trim(),
    notes:$('#notes').value.trim(),
    photo:'',
    expirations,
    favorite:existing?.favorite||false,
    updatedAt:new Date().toISOString()
  };
  if(existing) Object.assign(existing, product); else state.db.products.push({...product, createdAt:new Date().toISOString()});
  addHistory(product.name, productQty(product), existing?'Correção':'Entrada');
  ensureShoppingList(product);
  $('#productDialog').close();
  await persist(`${existing?'Editar':'Adicionar'} produto: ${product.name}`);
}
function addHistory(productName, quantity, type){ state.db.history.unshift({ id:uid(), date:new Date().toISOString(), productName, quantity:Number(quantity), type }); }
async function consumeProduct(id){ const p=state.db.products.find(x=>x.id===id); if(!p) return; const first=sortedExpirations(p)[0]; if(first){ const original=p.expirations.find(e=>e.id===first.id); original.consumed=true; original.consumedAt=new Date().toISOString(); } else if(Number(p.quantity)>0){ p.quantity--; } p.quantity=productQty(p); addHistory(p.name,1,'Saída'); ensureShoppingList(p); await persist(`Consumir produto: ${p.name}`); }
function ensureShoppingList(p){ if(productQty(p)===0 && !state.db.shoppingList.some(i=>i.productName===p.name && !i.removed)){ state.db.shoppingList.unshift({id:uid(), productName:p.name, quantity:1, purchased:false, createdAt:new Date().toISOString()}); } }
async function duplicateProduct(id){ const p=state.db.products.find(x=>x.id===id); if(!p) return; const copy=JSON.parse(JSON.stringify(p)); copy.id=uid(); copy.name=copy.name; copy.expirations=(copy.expirations||[]).filter(e=>!e.consumed).map(e=>({id:uid(),date:e.date,consumed:false})); copy.quantity=productQty(copy); copy.photo=''; copy.createdAt=new Date().toISOString(); copy.updatedAt=new Date().toISOString(); state.db.products.unshift(copy); addHistory(copy.name, productQty(copy),'Entrada'); await persist(`Duplicar produto: ${p.name}`); openProduct(copy.id); }
async function toggleFavorite(id){ const p=state.db.products.find(x=>x.id===id); if(p){ p.favorite=!p.favorite; await persist(`Favoritar produto: ${p.name}`); } }
async function deleteCurrentProduct(){ const id=$('#productId').value; const p=state.db.products.find(x=>x.id===id); state.db.products=state.db.products.filter(x=>x.id!==id); $('#productDialog').close(); await persist(`Excluir produto: ${p?.name||id}`); }

function renderShopping(){ $('#shoppingList').innerHTML = state.db.shoppingList.filter(i=>!i.removed).length ? state.db.shoppingList.filter(i=>!i.removed).map(i=>`<div class="list-item"><div><strong>${escapeHtml(i.productName)}</strong><span class="muted small">${i.purchased?'Comprado':'Pendente'}</span></div><div class="top-actions"><button class="soft-btn shop-buy" data-id="${i.id}">Comprado</button><button class="danger-btn shop-remove" data-id="${i.id}">Remover</button></div></div>`).join('') : '<div class="empty">Lista vazia.</div>'; $$('.shop-buy').forEach(b=>b.onclick=async()=>{ const i=state.db.shoppingList.find(x=>x.id===b.dataset.id); i.purchased=true; await persist('Marcar item comprado'); }); $$('.shop-remove').forEach(b=>b.onclick=async()=>{ const i=state.db.shoppingList.find(x=>x.id===b.dataset.id); i.removed=true; await persist('Remover item da lista de compras'); }); }
function renderHistory(){ $('#historyList').innerHTML = state.db.history.length ? state.db.history.slice(0,80).map(h=>`<div class="list-item"><div><strong>${escapeHtml(h.productName)}</strong><span class="muted small">${fmtDateTime(h.date)}</span></div><span class="badge">${h.type} · ${h.quantity}</span></div>`).join('') : '<div class="empty">Nenhum histórico.</div>'; }

async function enableNotifications(){ if(!('Notification' in window)) return toast('Este navegador não suporta notificações.'); const perm=await Notification.requestPermission(); toast(perm==='granted'?'Notificações ativadas.':'Notificações não permitidas.'); if(perm==='granted') checkNotifications(true); }
function checkNotifications(force=false){ if(!('Notification' in window) || Notification.permission!=='granted') return; const key=`notified-${todayISO()}`; if(!force && localStorage.getItem(key)) return; const alert=getAlerts()[0]; if(alert){ new Notification('Estoque Casa', { body:`${alert.name}: ${alert.label}`, icon:'icons/icon-192.png' }); localStorage.setItem(key,'1'); } }
async function startBarcodeScanner(){ $('#scannerDialog').showModal(); const video=$('#scannerVideo'); try{ state.scanStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}}); video.srcObject=state.scanStream; if(!('BarcodeDetector' in window)) throw new Error('BarcodeDetector indisponível.'); const detector=new BarcodeDetector({formats:['ean_13','ean_8','upc_a','upc_e','code_128']}); state.scanTimer=setInterval(async()=>{ const codes=await detector.detect(video); if(codes.length){ $('#barcode').value=codes[0].rawValue; stopBarcodeScanner(); lookupBarcode(codes[0].rawValue); } },800); }catch(e){ toast('Leitura automática indisponível neste navegador. Digite manualmente.'); } }
function stopBarcodeScanner(){ clearInterval(state.scanTimer); state.scanStream?.getTracks().forEach(t=>t.stop()); state.scanStream=null; $('#scannerDialog').close(); }
async function lookupBarcode(code){ try{ const res=await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json`); const data=await res.json(); if(data.status===1 && !$('#name').value){ $('#name').value=data.product.product_name_pt || data.product.product_name || ''; $('#brand').value=data.product.brands || ''; } }catch{} }
function exportJson(){ downloadBlob('database.json', JSON.stringify(state.db,null,2)); }
async function importJson(e){ const file=e.target.files[0]; if(!file) return; state.db=normalizeDb(JSON.parse(await file.text())); await persist('Importar database.json'); }
async function createBackup(){ const name=`backup-${new Date().toISOString()}.json`; state.db.statistics.backups.unshift({id:uid(),name,date:new Date().toISOString(),data:state.db}); downloadBlob(name, JSON.stringify(state.db,null,2)); await persist('Criar backup'); }
async function restoreBackup(){ $('#importFile').click(); }
function downloadBlob(name, content){ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([content],{type:'application/json'})); a.download=name; a.click(); URL.revokeObjectURL(a.href); }
function openSettings(){ $('#settingsToken').value=state.settings.token; $('#settingsOwner').value=state.settings.owner; $('#settingsRepo').value=state.settings.repo; $('#settingsBranch').value=state.settings.branch; $('#settingsDialog').showModal(); }
async function saveSettingsForm(e){ e.preventDefault(); saveSettings({token:$('#settingsToken').value.trim(),owner:$('#settingsOwner').value.trim(),repo:$('#settingsRepo').value.trim(),branch:$('#settingsBranch').value.trim()||'main'}); $('#settingsDialog').close(); try{ await githubReadDatabase(); renderAll(); toast('Configurações salvas.'); }catch(err){ toast(err.message); } }

boot();
