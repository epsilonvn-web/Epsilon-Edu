'use strict';

const EE = {
  config: null,
  subjects: [],
  user: null,
  access: {},
  notifications: [],
  currentGrade: 1,
  pendingRegistrationEmail: '',
  view: 'catalog'
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

window.addEventListener('DOMContentLoaded', init);

async function init() {
  try {
    [EE.config, EE.subjects] = await Promise.all([
      fetch('config.json', {cache:'no-store'}).then(r => r.json()),
      fetch('subjects.json', {cache:'no-store'}).then(r => r.json())
    ]);
    EE.currentGrade = Number(EE.config.defaultGrade || 1);
    buildGradeOptions();
    bindEvents();
    renderGradeTabs();
    await restoreSession();
    renderAll();
  } catch (err) {
    console.error(err);
    toast('Không thể khởi tạo EE page. Kiểm tra config.json / subjects.json.');
  }
}

function bindEvents() {
  $$('.nav-btn').forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.view)));
  $('#brand-home').addEventListener('click', () => showView('catalog'));
  $('#notification-btn').addEventListener('click', () => showView('notifications'));
  $('#user-btn').addEventListener('click', () => EE.user ? showView('account') : openAuth('login'));
  $('#auth-tab-login').addEventListener('click', () => switchAuth('login'));
  $('#auth-tab-register').addEventListener('click', () => switchAuth('register'));
  $('#otp-back').addEventListener('click', () => switchAuth('register'));
  $$('[data-close]').forEach(btn => btn.addEventListener('click', () => $('#' + btn.dataset.close).classList.add('hidden')));
  $('#login-form').addEventListener('submit', handleLogin);
  $('#register-form').addEventListener('submit', handleRegister);
  $('#otp-form').addEventListener('submit', handleOtpVerify);
  $('#request-form').addEventListener('submit', handleAccessRequest);
  document.addEventListener('click', handleDelegatedClicks);
}

function handleDelegatedClicks(e) {
  const action = e.target.closest('[data-action]');
  if (!action) return;
  const {action: name} = action.dataset;
  if (name === 'open-subject') openSubject(action.dataset.id);
  if (name === 'request-access') openRequestModal(action.dataset.id);
  if (name === 'logout') logout();
  if (name === 'save-profile') saveProfile();
  if (name === 'open-admin') showAdmin();
  if (name === 'approve-request') adminResolveRequest(action.dataset.requestId, 'approve');
  if (name === 'reject-request') adminResolveRequest(action.dataset.requestId, 'reject');
  if (name === 'mark-read') markNotificationRead(action.dataset.notificationId);
  if (name === 'open-login') openAuth('login');
}

function buildGradeOptions() {
  const options = Array.from({length:12}, (_,i) => `<option value="${i+1}">Lớp ${i+1}</option>`).join('');
  $('#reg-grade').innerHTML = options;
}

function renderAll() {
  renderGradeTabs();
  renderSubjects();
  renderAccount();
  renderAccess();
  renderNotifications();
  renderTopbar();
}

function showView(view) {
  EE.view = view;
  ['catalog','access','account','notifications','admin'].forEach(v => $('#view-' + v)?.classList.toggle('hidden', v !== view));
  $$('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
  if (view === 'notifications' && EE.user) refreshNotifications();
  if (view === 'admin' && EE.user?.role === 'admin') loadAdminRequests();
}

function renderGradeTabs() {
  const available = [...new Set(EE.subjects.map(x => Number(x.grade)))].sort((a,b)=>a-b);
  $('#grade-tabs').innerHTML = available.map(g => `<button class="grade-btn ${g===EE.currentGrade?'active':''}" data-grade="${g}">Lớp ${g}</button>`).join('');
  $$('#grade-tabs [data-grade]').forEach(btn => btn.addEventListener('click', () => { EE.currentGrade = Number(btn.dataset.grade); renderGradeTabs(); renderSubjects(); }));
}

function renderSubjects() {
  const list = EE.subjects.filter(s => Number(s.grade) === EE.currentGrade);
  $('#subject-grid').innerHTML = list.map(s => {
    const access = EE.user ? (EE.access[s.id] || {type:'regular'}) : {type:'guest'};
    const type = access.type || 'regular';
    const label = type === 'vip' ? 'VIP' : type === 'trial' ? 'TRIAL' : type === 'guest' ? 'GUEST' : 'REGULAR';
    const expiry = access.endAt ? `<div class="disabled-note">Hết hạn: ${formatDate(access.endAt)}</div>` : '';
    return `<article class="subject-card ${s.accent}">
      <div class="subject-icon">${s.icon || '📘'}</div><h3>${escapeHtml(s.name)}</h3><div class="subject-meta">Lớp ${s.grade} · ${escapeHtml(s.subjectLabel)}</div>
      <span class="access-pill ${type==='guest'?'regular':type}">${label}</span>${expiry}
      <div class="subject-actions"><button class="primary" data-action="open-subject" data-id="${escapeAttr(s.id)}">${s.enabled ? 'Vào học' : 'Xem module'}</button>${EE.user ? `<button class="secondary" data-action="request-access" data-id="${escapeAttr(s.id)}">Trial/VIP</button>` : ''}</div>
      ${s.enabled ? '' : '<div class="disabled-note">Repo đang để chế độ thử nghiệm, chưa bật điều hướng thật.</div>'}
    </article>`;
  }).join('') || '<div class="empty">Chưa có môn học ở lớp này.</div>';
}

function openSubject(id) {
  const s = EE.subjects.find(x => x.id === id); if (!s) return;
  if (!s.enabled) return toast('Module này đang được khóa để test EE độc lập. Khi pilot repo, chỉ cần bật enabled=true trong subjects.json.');
  location.href = s.url;
}

function renderTopbar() {
  const btn = $('#user-btn');
  if (!EE.user) {
    btn.className = 'user-btn login-btn'; btn.textContent = 'Đăng nhập';
    $('#notification-badge').classList.add('hidden');
  } else {
    btn.className = 'user-btn'; btn.textContent = EE.user.name || EE.user.userId;
    const unread = EE.notifications.filter(n => !n.read).length;
    $('#notification-badge').textContent = unread; $('#notification-badge').classList.toggle('hidden', unread === 0);
  }
}

function renderAccount() {
  if (!EE.user) {
    $('#account-content').innerHTML = `<div class="empty">Bạn chưa đăng nhập.<div class="actions" style="justify-content:center"><button class="primary" data-action="open-login">Đăng nhập Epsilon Edu</button></div></div>`; return;
  }
  const u = EE.user;
  $('#account-content').innerHTML = `<h3>Hồ sơ Epsilon</h3><div class="panel-grid">
    <div class="field"><label>UserId</label><input value="${escapeAttr(u.userId)}" disabled></div>
    <div class="field"><label>Email</label><input value="${escapeAttr(u.email)}" disabled></div>
    <div class="field span-2"><label>Họ và tên</label><input id="profile-name" value="${escapeAttr(u.name||'')}"></div>
    <div class="field"><label>Khối</label><select id="profile-grade">${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${Number(u.grade)===i+1?'selected':''}>Lớp ${i+1}</option>`).join('')}</select></div>
    <div class="field"><label>Lớp</label><input id="profile-class" value="${escapeAttr(u.className||'')}"></div>
    <div class="field span-2"><label>Năm học</label><input id="profile-year" value="${escapeAttr(u.schoolYear||'')}"></div>
  </div><div class="actions"><button class="primary" data-action="save-profile">Lưu hồ sơ</button>${u.role==='admin'?'<button class="secondary" data-action="open-admin">Quản trị hệ thống</button>':''}<button class="danger" data-action="logout">Đăng xuất</button></div>`;
}

function renderAccess() {
  if (!EE.user) {
    $('#access-content').innerHTML = `<div class="empty">Hãy đăng nhập để xem Trial/VIP theo môn.<div class="actions" style="justify-content:center"><button class="primary" data-action="open-login">Đăng nhập</button></div></div>`; return;
  }
  const rows = EE.subjects.map(s => {
    const a = EE.access[s.id] || {type:'regular'};
    return `<div class="request-row"><div class="row-top"><div><strong>${escapeHtml(s.name)}</strong><div class="muted">${a.type.toUpperCase()}${a.endAt ? ' · đến '+formatDate(a.endAt):''}</div></div><button class="secondary" data-action="request-access" data-id="${escapeAttr(s.id)}">Yêu cầu Trial/VIP</button></div></div>`;
  }).join('');
  $('#access-content').innerHTML = `<h3>Quyền hiện tại</h3><div class="request-list">${rows}</div>`;
}

function renderNotifications() {
  const root = $('#notification-list'); if (!root) return;
  if (!EE.user) return root.innerHTML = '<div class="empty">Đăng nhập để xem thông báo.</div>';
  if (!EE.notifications.length) return root.innerHTML = '<div class="empty">Chưa có thông báo.</div>';
  root.innerHTML = EE.notifications.map(n => `<div class="notification-row"><div class="row-top"><div><strong>${escapeHtml(n.title)}</strong><div class="muted">${escapeHtml(n.message)}</div><div class="muted">${formatDateTime(n.createdAt)}</div></div>${n.read?'':'<button class="secondary" data-action="mark-read" data-notification-id="'+escapeAttr(n.id)+'">Đã đọc</button>'}</div></div>`).join('');
}

function openAuth(mode='login') { $('#auth-modal').classList.remove('hidden'); switchAuth(mode); }
function switchAuth(mode) {
  $('#auth-tab-login').classList.toggle('active', mode==='login'); $('#auth-tab-register').classList.toggle('active', mode==='register');
  $('#login-form').classList.toggle('hidden', mode!=='login'); $('#register-form').classList.toggle('hidden', mode!=='register'); $('#otp-form').classList.add('hidden');
}

async function handleLogin(e) {
  e.preventDefault(); setMsg('login-message','');
  try {
    const data = await api('login',{email:$('#login-email').value,password:$('#login-password').value});
    localStorage.setItem(EE.config.sessionKey, data.token); EE.user = data.user; EE.access = data.access || {}; EE.notifications = data.notifications || [];
    $('#auth-modal').classList.add('hidden'); renderAll(); showView('catalog'); toast('Đăng nhập Epsilon Edu thành công.');
    handleReturnAfterLogin();
  } catch(err) { setMsg('login-message', err.message); }
}

async function handleRegister(e) {
  e.preventDefault(); setMsg('register-message','');
  try {
    const payload = {email:$('#reg-email').value,password:$('#reg-password').value,name:$('#reg-name').value,grade:Number($('#reg-grade').value),className:$('#reg-class').value,schoolYear:$('#reg-year').value};
    const data = await api('registerStart', payload); EE.pendingRegistrationEmail = data.email;
    $('#register-form').classList.add('hidden'); $('#otp-form').classList.remove('hidden'); toast('OTP đã được gửi về email.');
  } catch(err) { setMsg('register-message', err.message); }
}

async function handleOtpVerify(e) {
  e.preventDefault(); setMsg('otp-message','');
  try {
    const data = await api('registerVerify',{email:EE.pendingRegistrationEmail,otp:$('#otp-code').value});
    localStorage.setItem(EE.config.sessionKey, data.token); EE.user = data.user; EE.access = {}; EE.notifications = data.notifications || [];
    $('#auth-modal').classList.add('hidden'); renderAll(); showView('catalog'); toast(`Tạo tài khoản thành công: ${data.user.userId}`);
  } catch(err) { setMsg('otp-message', err.message); }
}

async function restoreSession() {
  const token = localStorage.getItem(EE.config.sessionKey); if (!token) return;
  try {
    const data = await api('sessionVerify',{token}); EE.user = data.user; EE.access = data.access || {}; EE.notifications = data.notifications || [];
  } catch (err) { localStorage.removeItem(EE.config.sessionKey); EE.user = null; EE.access = {}; EE.notifications = []; }
}

async function logout() {
  const token = localStorage.getItem(EE.config.sessionKey);
  if (token) { try { await api('logout',{token}); } catch(_){} }
  localStorage.removeItem(EE.config.sessionKey); EE.user = null; EE.access = {}; EE.notifications = []; renderAll(); showView('catalog'); toast('Đã đăng xuất.');
}

async function saveProfile() {
  try {
    const data = await apiAuth('profileUpdate',{name:$('#profile-name').value,grade:Number($('#profile-grade').value),className:$('#profile-class').value,schoolYear:$('#profile-year').value});
    EE.user = data.user; renderAll(); toast('Đã cập nhật hồ sơ.');
  } catch(err) { toast(err.message); }
}

function openRequestModal(subjectId) {
  if (!EE.user) return openAuth('login');
  const s = EE.subjects.find(x => x.id===subjectId); if (!s) return;
  $('#request-subject-id').value = subjectId; $('#request-subject-name').textContent = s.name; $('#request-note').value=''; $('#request-message').textContent=''; $('#request-modal').classList.remove('hidden');
}

async function handleAccessRequest(e) {
  e.preventDefault(); setMsg('request-message','');
  try {
    await apiAuth('accessRequestCreate',{subjectId:$('#request-subject-id').value,accessType:$('#request-type').value,note:$('#request-note').value});
    $('#request-modal').classList.add('hidden'); toast('Đã gửi yêu cầu. Admin sẽ là người quyết định cuối cùng.'); await refreshNotifications();
  } catch(err) { setMsg('request-message',err.message); }
}

async function refreshNotifications() {
  if (!EE.user) return;
  try { const data = await apiAuth('notificationsList',{}); EE.notifications = data.notifications || []; renderNotifications(); renderTopbar(); } catch(err) { toast(err.message); }
}

async function markNotificationRead(id) {
  try { await apiAuth('notificationRead',{notificationId:id}); await refreshNotifications(); } catch(err){toast(err.message);}
}

function showAdmin() { showView('admin'); loadAdminRequests(); }
async function loadAdminRequests() {
  if (EE.user?.role !== 'admin') return $('#admin-content').innerHTML='<div class="empty">Bạn không có quyền Admin.</div>';
  try {
    const data = await apiAuth('adminAccessRequestsList',{});
    const rows = data.requests || [];
    $('#admin-content').innerHTML = rows.length ? rows.map(r => `<div class="admin-request"><div><strong>${escapeHtml(r.name)} · ${escapeHtml(r.userId)}</strong><div class="muted">${escapeHtml(r.email)} · ${escapeHtml(r.subjectId)} · ${escapeHtml(r.accessType.toUpperCase())}</div><div class="muted">${escapeHtml(r.note||'Không có ghi chú')} · ${formatDateTime(r.createdAt)}</div></div><div class="admin-actions"><button class="primary" data-action="approve-request" data-request-id="${escapeAttr(r.requestId)}">Duyệt</button><button class="danger" data-action="reject-request" data-request-id="${escapeAttr(r.requestId)}">Từ chối</button></div></div>`).join('') : '<div class="empty">Không có yêu cầu chờ xử lý.</div>';
  } catch(err) { $('#admin-content').innerHTML=`<div class="empty">${escapeHtml(err.message)}</div>`; }
}

async function adminResolveRequest(requestId, decision) {
  try { await apiAuth('adminAccessRequestResolve',{requestId,decision}); toast(decision==='approve'?'Đã cấp quyền.':'Đã từ chối yêu cầu.'); await loadAdminRequests(); } catch(err){toast(err.message);}
}

function handleReturnAfterLogin() {
  const q = new URLSearchParams(location.search); const ret = q.get('return'); if (!ret) return;
  try { const url = new URL(ret, location.origin); if (url.origin === location.origin) location.href = url.href; } catch(_) {}
}

async function apiAuth(action,data={}) {
  const token = localStorage.getItem(EE.config.sessionKey); if (!token) throw new Error('Bạn cần đăng nhập Epsilon Edu.');
  return api(action,{...data,token});
}

async function api(action,data={}) {
  if (!EE.config?.apiUrl || EE.config.apiUrl.includes('PASTE_YOUR')) throw new Error('Chưa cấu hình apiUrl trong config.json.');
  if (!/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(String(action||''))) throw new Error('Yêu cầu không hợp lệ.');
  const body = new URLSearchParams();
  body.set('payload', JSON.stringify({action,...data}));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(EE.config.apiUrl,{
      method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
      body:body.toString(),
      signal:controller.signal,
      cache:'no-store',
      referrerPolicy:'no-referrer'
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Không thể xử lý yêu cầu.');
    return json.data || {};
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error('Máy chủ phản hồi quá lâu. Vui lòng thử lại.');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}


function formatDate(v){if(!v)return'';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleDateString('vi-VN')}
function formatDateTime(v){if(!v)return'';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString('vi-VN')}
function setMsg(id,msg){$('#'+id).textContent=msg||''}
function toast(msg){const el=document.createElement('div');el.className='toast';el.textContent=msg;$('#toast-host').appendChild(el);setTimeout(()=>el.remove(),3200)}
function escapeHtml(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function escapeAttr(v=''){return escapeHtml(v)}
window.openAuth = openAuth;
