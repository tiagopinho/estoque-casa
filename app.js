'use strict';

const CATEGORIES = ['Geladeira','Freezer','Armário','Despensa','Bebidas','Limpeza','Higiene','Outros'];
const CACHE_KEY = 'estoqueDatabaseV2';
const QUEUE_KEY = 'estoqueOperationsV2';
const DEFAULT_DB = () => ({ products: [], history: [], shoppingList: [] });
const state = { db: loadJson(CACHE_KEY, DEFAULT_DB()), queue: loadJson(QUEUE_KEY, []), editingId: null, scanStream: null, scanTimer: null, syncing: false };

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const pad = value => String(value).padStart(2, '0');
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
const parseDate = value => { const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || ''); return match ? new Date(Number(match[1]), Number(match[2])-1, Number(match[3]), 12) : null; };
const daysUntil = value => Math.round((parseDate(value) - parseDate(todayISO())) / 86400000);
const fmtDate = value => parseDate(value)?.toLocaleDateString('pt-BR') || 'Sem validade';
const fmtDateTime = value => new Date(value).toLocaleString('pt-BR');
const escapeHtml = (value='') => String(value).replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const toast = message => { const el=document.createElement('div'); el.className='toast'; el.textContent=message; document.body.appendChild(el); setTimeout(()=>el.remove(),3200); };

function loadJson(key, fallback) { try { const value=JSON.parse(localStorage.getItem(key)); return value ?? fallback; } catch { return fallback; } }
function normalizeDb(db) {
  const value=db && typeof db==='object' ? db : {};
  return {
    products: Array.isArray(value.products) ? value.products.map(p=>({...p, quantity:Math.max(0,Number(p.quantity)||0), expirations:Array.isArray(p.expirations)?p.expirations:[], favorite:!!p.favorite})) : [],
    history: Array.isArray(value.history) ? value.history : [],
    shoppingList: Array.isArray(value.shoppingList) ? value.shoppingList : []
  };
}
function saveLocal() { localStorage.setItem(CACHE_KEY, JSON.stringify(state.db)); localStorage.setItem(QUEUE_KEY, JSON.stringify(state.queue)); updateSyncStatus(); }
function updateSyncStatus() { const el=$('#syncStatus'); if(el) el.textContent=state.syncing?'Sincronizando...':state.queue.length?`${state.queue.length} alteração(ões) aguardando envio.`:'Tudo sincronizado.'; }

async function api(path, options={}) {
  const response=await fetch(path, { ...options, headers:{'Content-Type':'application/json',...(options.headers||{})} });
  const body=await response.json().catch(()=>({}));
  if(!response.ok) { const error=new Error(body.error||'Falha de comunicação.'); error.status=response.status; throw error; }
  return body;
}
async function login(event) {
  event.preventDefault();
  try { await api('/api/login',{method:'POST',body:JSON.stringify({password:$('#loginPassword').value})}); $('#loginPassword').value=''; await startApp(); }
  catch(error) { toast(error.message); }
}
async function logout() { await api('/api/logout',{method:'POST'}).catch(()=>{}); $('#settingsDialog').close(); $('#mainApp').classList.add('hidden'); $('#setupScreen').classList.remove('hidden'); }
async function fetchDatabase() { state.db=normalizeDb(await api('/api/data')); saveLocal(); renderAll(); }
async function enqueue(type,payload) { state.queue.push({id:uid(),type,payload:structuredClone(payload),createdAt:new Date().toISOString()}); saveLocal(); renderAll(); await flushQueue(); }
async function flushQueue() {
  if(state.syncing || !navigator.onLine || !state.queue.length) return;
  state.syncing=true; updateSyncStatus();
  try {
    while(state.queue.length) { await api('/api/mutate',{method:'POST',body:JSON.stringify(state.queue[0])}); state.queue.shift(); saveLocal(); }
  } catch(error) {
    if(error.status===401) { $('#mainApp').classList.add('hidden'); $('#setupScreen').classList.remove('hidden'); }
    toast(error.message==='Failed to fetch'?'Sem conexão. A alteração está segura neste aparelho.':error.message);
  } finally { state.syncing=false; saveLocal(); }
}
async function syncNow() { await flushQueue(); if(state.queue.length) return; try { await fetchDatabase(); toast('Sincronizado.'); } catch(error) { toast(error.message); } }

async function boot() {
  document.body.classList.toggle('dark',localStorage.getItem('theme')==='dark');
  registerServiceWorker(); fillSelects(); bindEvents();
  state.db=normalizeDb(state.db); renderAll();
  try { await startApp(); } catch(error) { if(error.status===401) { $('#mainApp').classList.add('hidden'); $('#setupScreen').classList.remove('hidden'); } else if(state.db.products.length) { $('#mainApp').classList.remove('hidden'); toast('Modo offline: alterações serão sincronizadas depois.'); } else { $('#mainApp').classList.add('hidden'); $('#setupScreen').classList.remove('hidden'); toast(error.message); } }
}
async function startApp() {
  await flushQueue();
  const remote=normalizeDb(await api('/api/data'));
  if(!state.queue.length) { state.db=remote; saveLocal(); }
  $('#setupScreen').classList.add('hidden'); $('#mainApp').classList.remove('hidden');
  renderAll(); checkNotifications();
}
function registerServiceWorker() { if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{}); }
function fillSelects() { const options=['<option value="all">Todas categorias</option>',...CATEGORIES.map(c=>`<option>${escapeHtml(c)}</option>`)].join(''); $('#categoryFilter').innerHTML=options; $('#category').innerHTML=CATEGORIES.map(c=>`<option>${escapeHtml(c)}</option>`).join(''); }
function bindEvents() {
  $('#setupForm').onsubmit=login;
  $$('.tabs button').forEach(button=>button.onclick=()=>showView(button.dataset.view));
  $('#themeBtn').onclick=()=>{document.body.classList.toggle('dark');localStorage.setItem('theme',document.body.classList.contains('dark')?'dark':'light');};
  $('#syncBtn').onclick=syncNow; $('#notifyBtn').onclick=enableNotifications;
  $('#settingsBtn').onclick=()=>{$('#settingsDialog').showModal();updateSyncStatus();}; $('#logoutBtn').onclick=logout;
  $('#addProductBtn').onclick=()=>openProduct(); $('#openAddBtn').onclick=()=>openProduct(); $('#productForm').onsubmit=saveProductForm; $('#deleteProductBtn').onclick=deleteCurrentProduct;
  $$('[data-close]').forEach(button=>button.onclick=()=>$('#'+button.dataset.close).close());
  ['searchInput','categoryFilter','validityFilter'].forEach(id=>$('#'+id).addEventListener('input',renderProducts));
  $('#exportBtn').onclick=exportJson; $('#openImportBtn').onclick=()=>$('#importFile').click(); $('#importFile').onchange=importJson;
  $('#backupBtn').onclick=createBackup; $('#restoreBtn').onclick=()=>$('#importFile').click(); $('#scanBtn').onclick=startBarcodeScanner; $('#stopScanBtn').onclick=stopBarcodeScanner;
  window.addEventListener('online',async()=>{await flushQueue();if(!state.queue.length) await fetchDatabase().catch(()=>{});});
}
function showView(id) { $$('.tabs button').forEach(b=>b.classList.toggle('active',b.dataset.view===id)); $$('.view').forEach(v=>v.classList.toggle('active-view',v.id===id)); }

function productQty(product) { return Math.max(0,Number(product.quantity)||0); }
function sortedExpirations(product) { return [...(product.expirations||[])].filter(e=>!e.consumed&&parseDate(e.date)).sort((a,b)=>a.date.localeCompare(b.date)); }
function productStatus(product) { const exp=sortedExpirations(product)[0]; if(!exp)return{label:'Sem validade',cls:'ok'}; const days=daysUntil(exp.date); if(days<0)return{label:'Vencido',cls:'danger'}; if(days===0)return{label:'Vence hoje',cls:'warning'}; if(days<=15)return{label:`Vence em ${days} dia${days===1?'':'s'}`,cls:'warning'}; return{label:`Validade ${fmtDate(exp.date)}`,cls:'ok'}; }
function getAlerts() { return state.db.products.flatMap(p=>sortedExpirations(p).map(e=>({name:p.name,date:e.date,days:daysUntil(e.date)}))).filter(a=>a.days<=15).sort((a,b)=>a.days-b.days).map(a=>({...a,label:a.days<0?'Produto vencido':a.days===0?'Vence hoje':a.days===1?'Vence amanhã':`Vence em ${a.days} dias`})); }
function topConsumed() { const map={};state.db.history.filter(h=>h.type==='Saída').forEach(h=>map[h.productName]=(map[h.productName]||0)+Number(h.quantity));return Object.entries(map).map(([name,qty])=>({name,qty})).sort((a,b)=>b.qty-a.qty).slice(0,6); }
function renderAll() { renderDashboard();renderProducts();renderShopping();renderHistory();updateSyncStatus(); }
function renderDashboard() {
  const products=state.db.products,total=products.reduce((sum,p)=>sum+productQty(p),0),alerts=getAlerts(),expired=alerts.filter(a=>a.days<0).length,missing=products.filter(p=>productQty(p)===0).length;
  const now=new Date(),month=`${now.getFullYear()}-${pad(now.getMonth()+1)}`,consumed=state.db.history.filter(h=>h.type==='Saída'&&String(h.date).startsWith(month)).reduce((sum,h)=>sum+Number(h.quantity),0);
  $('#statsGrid').innerHTML=[['Produtos',total],['Próx. vencimento',alerts.filter(a=>a.days>=0&&a.days<=15).length],['Vencidos',expired],['Em falta',missing],['Consumidos mês',consumed]].map(([label,value])=>`<div class="stat-card"><b>${value}</b><span>${label}</span></div>`).join('');
  $('#alertsList').innerHTML=alerts.length?alerts.slice(0,12).map(a=>`<div class="list-item"><div><strong>${escapeHtml(a.name)}</strong><span class="muted small">${escapeHtml(a.label)} · ${fmtDate(a.date)}</span></div><span class="badge ${a.days<0?'danger':'warning'}">${a.days<0?'Vencido':'Alerta'}</span></div>`).join(''):'<div class="empty">Nenhum alerta no momento.</div>';
  const top=topConsumed();$('#topConsumed').innerHTML=top.length?top.map(t=>`<div class="list-item"><strong>${escapeHtml(t.name)}</strong><span class="badge">${t.qty} saídas</span></div>`).join(''):'<div class="empty">Ainda sem consumo registrado.</div>';
}
function renderProducts() {
  const query=$('#searchInput').value?.toLowerCase()||'',category=$('#categoryFilter').value,validity=$('#validityFilter').value;
  let products=state.db.products.filter(p=>productQty(p)>0&&[p.name,p.brand,p.location,p.category].join(' ').toLowerCase().includes(query));
  if(category&&category!=='all')products=products.filter(p=>p.category===category);
  if(validity!=='all')products=products.filter(p=>{const exp=sortedExpirations(p)[0];if(!exp)return false;const d=daysUntil(exp.date);return validity==='expired'?d<0:validity==='today'?d===0:d>=0&&d<=Number(validity);});
  $('#productsGrid').innerHTML=products.length?products.map(productCard).join(''):'<div class="empty glass-card">Nenhum produto encontrado.</div>';
  $$('.edit-product').forEach(b=>b.onclick=()=>openProduct(b.dataset.id));$$('.consume-product').forEach(b=>b.onclick=()=>consumeProduct(b.dataset.id));$$('.duplicate-product').forEach(b=>b.onclick=()=>duplicateProduct(b.dataset.id));$$('.favorite-product').forEach(b=>b.onclick=()=>toggleFavorite(b.dataset.id));
}
function expirationSummary(product) { const groups={};sortedExpirations(product).forEach(item=>groups[item.date]=(groups[item.date]||0)+1);return Object.entries(groups).slice(0,4).map(([date,quantity])=>`${quantity}× ${fmtDate(date)}`).join(', '); }
function productCard(p) { const status=productStatus(p),exp=expirationSummary(p);return `<article class="product-card"><div class="product-head"><h3>${escapeHtml(p.name)}</h3></div><div><span class="badge ${status.cls}">${escapeHtml(status.label)}</span></div><p><strong>${productQty(p)}</strong> unidade${productQty(p)===1?'':'s'}</p><p class="muted small">Lotes: ${exp||'Sem validade informada'}</p><div class="product-actions"><button class="soft-btn consume-product" data-id="${escapeHtml(p.id)}">Consumir</button><button class="soft-btn edit-product" data-id="${escapeHtml(p.id)}">Editar</button><button class="soft-btn duplicate-product" data-id="${escapeHtml(p.id)}">Duplicar</button></div></article>`; }

function openProduct(id=null) { state.editingId=id;const p=id?state.db.products.find(x=>x.id===id):null;$('#productDialogTitle').textContent=p?'Editar produto':'Adicionar lote';$('#deleteProductBtn').classList.toggle('hidden',!p);$('#productId').value=p?.id||'';$('#name').value=p?.name||'';$('#category').value=p?.category||'Outros';$('#brand').value=p?.brand||'';$('#quantity').value=p?productQty(p):1;$('#unit').value=p?.unit||'un';$('#location').value=p?.location||'';$('#barcode').value=p?.barcode||'';$('#notes').value=p?.notes||'';$('#expirations').value='';$('#expirations').required=!p;$('#expirationField').classList.toggle('hidden',!!p);$('#photo').value='';$('#productDialog').showModal(); }
async function fileToBase64(file) { if(!file)return null;if(file.size>2_000_000)throw new Error('A foto deve ter no máximo 2 MB.');return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Não foi possível ler a foto.'));reader.readAsDataURL(file);}); }
function historyEntry(productName,quantity,type) { return{id:uid(),date:new Date().toISOString(),productName,quantity:Number(quantity),type}; }
function shoppingFor(product) { if(productQty(product)!==0)return null;let item=state.db.shoppingList.find(i=>i.productName===product.name&&!i.removed);if(!item){item={id:uid(),productName:product.name,quantity:1,purchased:false,removed:false,createdAt:new Date().toISOString()};state.db.shoppingList.unshift(item);}return item; }
async function saveProductForm(event) {
  event.preventDefault();
  try {
    const id=$('#productId').value||uid(),editing=state.db.products.find(p=>p.id===id),photo=await fileToBase64($('#photo').files[0]),name=$('#name').value.trim(),amount=Number($('#quantity').value),date=$('#expirations').value;
    if(!name)throw new Error('Informe o nome do produto.');if(!Number.isInteger(amount)||amount<1)throw new Error('Informe uma quantidade válida.');if(!editing&&!parseDate(date))throw new Error('Informe a validade do lote.');
    const sameName=!editing?state.db.products.find(p=>p.name.trim().toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR')):null,existing=editing||sameName;
    let product,history;
    if(sameName){
      const batch=Array.from({length:amount},()=>({id:uid(),date,consumed:false}));sameName.quantity=productQty(sameName)+amount;sameName.expirations=[...(sameName.expirations||[]),...batch];sameName.updatedAt=new Date().toISOString();product=sameName;history=historyEntry(product.name,amount,'Entrada');
    }else{
      const expirations=editing?(editing.expirations||[]):Array.from({length:amount},()=>({id:uid(),date,consumed:false}));product={id,name,category:$('#category').value,brand:$('#brand').value.trim(),quantity:amount,unit:$('#unit').value,location:$('#location').value.trim(),barcode:$('#barcode').value.trim(),notes:$('#notes').value.trim(),photo:photo||editing?.photo||'',expirations,favorite:editing?.favorite||false,createdAt:editing?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};history=historyEntry(product.name,amount,editing?'Correção':'Entrada');if(editing)Object.assign(editing,product);else state.db.products.unshift(product);
    }
    state.db.history.unshift(history);$('#productDialog').close();await enqueue('saveProduct',{product,history});
  } catch(error) { toast(error.message); }
}
async function consumeProduct(id) { const p=state.db.products.find(x=>x.id===id);if(!p||productQty(p)===0)return;const first=sortedExpirations(p)[0];if(first){const original=p.expirations.find(e=>e.id===first.id);original.consumed=true;original.consumedAt=new Date().toISOString();}p.quantity=Math.max(0,productQty(p)-1);p.updatedAt=new Date().toISOString();const history=historyEntry(p.name,1,'Saída');state.db.history.unshift(history);const shoppingItem=shoppingFor(p);await enqueue('consumeProduct',{product:p,history,shoppingItem}); }
async function duplicateProduct(id) { const source=state.db.products.find(x=>x.id===id);if(!source)return;const product=structuredClone(source);product.id=uid();product.name=`${product.name} cópia`;product.createdAt=product.updatedAt=new Date().toISOString();product.expirations=sortedExpirations(source).map(e=>({...e,id:uid(),consumed:false,consumedAt:null}));state.db.products.unshift(product);const history=historyEntry(product.name,productQty(product),'Entrada');state.db.history.unshift(history);await enqueue('duplicateProduct',{product,history}); }
async function toggleFavorite(id) { const product=state.db.products.find(x=>x.id===id);if(!product)return;product.favorite=!product.favorite;product.updatedAt=new Date().toISOString();await enqueue('toggleFavorite',{product}); }
async function deleteCurrentProduct() { const id=$('#productId').value,product=state.db.products.find(x=>x.id===id);if(!product||!confirm(`Excluir ${product.name}?`))return;state.db.products=state.db.products.filter(x=>x.id!==id);$('#productDialog').close();await enqueue('deleteProduct',{id}); }

function renderShopping() { const items=state.db.shoppingList.filter(i=>!i.removed);$('#shoppingList').innerHTML=items.length?items.map(i=>`<div class="list-item"><div><strong>${escapeHtml(i.productName)}</strong><span class="muted small">${i.purchased?'Comprado':'Pendente'}</span></div><div class="top-actions"><button class="soft-btn shop-buy" data-id="${escapeHtml(i.id)}">Comprado</button><button class="danger-btn shop-remove" data-id="${escapeHtml(i.id)}">Remover</button></div></div>`).join(''):'<div class="empty">Lista vazia.</div>';$$('.shop-buy').forEach(b=>b.onclick=()=>changeShopping(b.dataset.id,'purchased'));$$('.shop-remove').forEach(b=>b.onclick=()=>changeShopping(b.dataset.id,'removed')); }
async function changeShopping(id,key) { const item=state.db.shoppingList.find(i=>i.id===id);if(!item)return;item[key]=true;await enqueue('saveShopping',{item}); }
function renderHistory() { $('#historyList').innerHTML=state.db.history.length?state.db.history.slice(0,80).map(h=>`<div class="list-item"><div><strong>${escapeHtml(h.productName)}</strong><span class="muted small">${fmtDateTime(h.date)}</span></div><span class="badge">${escapeHtml(h.type)} · ${Number(h.quantity)||0}</span></div>`).join(''):'<div class="empty">Nenhum histórico.</div>'; }
function vapidBytes(value) { const normalized=(value+'='.repeat((4-value.length%4)%4)).replace(/-/g,'+').replace(/_/g,'/'),raw=atob(normalized);return Uint8Array.from([...raw].map(char=>char.charCodeAt(0))); }
async function enableNotifications() {
  if(!('Notification'in window)||!('PushManager'in window))return toast('Este navegador não suporta notificações automáticas.');
  try {
    const permission=await Notification.requestPermission();if(permission!=='granted')return toast('Notificações não permitidas.');
    const config=await api('/api/push-config'),registration=await navigator.serviceWorker.ready;
    let subscription=await registration.pushManager.getSubscription();
    if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:vapidBytes(config.publicKey)});
    await api('/api/subscribe',{method:'POST',body:JSON.stringify(subscription)});checkNotifications(true);toast('Alertas automáticos ativados.');
  } catch(error) { toast(error.message); }
}
function checkNotifications(force=false) { if(!('Notification'in window)||Notification.permission!=='granted')return;const key=`notified-${todayISO()}`;if(!force&&localStorage.getItem(key))return;const alert=getAlerts()[0];if(alert){new Notification('Estoque Casa',{body:`${alert.name}: ${alert.label}`,icon:'icons/icon-192.png'});localStorage.setItem(key,'1');} }
async function startBarcodeScanner() { $('#scannerDialog').showModal();const video=$('#scannerVideo');try{state.scanStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});video.srcObject=state.scanStream;if(!('BarcodeDetector'in window))throw new Error();const detector=new BarcodeDetector({formats:['ean_13','ean_8','upc_a','upc_e','code_128']});state.scanTimer=setInterval(async()=>{try{const codes=await detector.detect(video);if(codes.length){$('#barcode').value=codes[0].rawValue;stopBarcodeScanner();lookupBarcode(codes[0].rawValue);}}catch{}},800);}catch{stopBarcodeScanner();toast('Leitura automática indisponível. Digite o código manualmente.');} }
function stopBarcodeScanner() { clearInterval(state.scanTimer);state.scanTimer=null;state.scanStream?.getTracks().forEach(track=>track.stop());state.scanStream=null;if($('#scannerDialog').open)$('#scannerDialog').close(); }
async function lookupBarcode(code) { if(!/^\d{6,14}$/.test(code))return;try{const response=await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`);const data=await response.json();if(data.status===1&&!$('#name').value){$('#name').value=data.product.product_name_pt||data.product.product_name||'';$('#brand').value=data.product.brands||'';}}catch{} }
function downloadBlob(name,content) { const url=URL.createObjectURL(new Blob([content],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000); }
function exportJson() { downloadBlob('database.json',JSON.stringify(state.db,null,2)); }
function createBackup() { const snapshot=structuredClone(state.db);downloadBlob(`backup-${new Date().toISOString().replace(/:/g,'-')}.json`,JSON.stringify(snapshot,null,2));toast('Backup criado.'); }
async function importJson(event) { const file=event.target.files[0];event.target.value='';if(!file)return;try{const imported=normalizeDb(JSON.parse(await file.text()));if(!confirm('Substituir todos os dados atuais pelo arquivo importado?'))return;state.db=imported;await enqueue('replaceAll',imported);toast('Dados importados.');}catch(error){toast(error instanceof SyntaxError?'O arquivo JSON é inválido.':error.message);} }

boot();
