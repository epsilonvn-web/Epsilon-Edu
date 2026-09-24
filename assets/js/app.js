console.info('Epsilon Edu frontend build 1.5.0-games-tools-pilot');
'use strict';

const EE = {
  config: null,
  subjects: [],
  user: null,
  access: {},
  notifications: [],
  requests: [],
  currentGrade: 1,
  pendingRegistrationEmail: '',
  view: 'catalog',
  sessionRestoring: true,
  accessMutationBusy: false,
  adminTab: 'requests',
  adminUsers: [],
  avatars: ['🐼','🐯','🦊','🐰','🐨','🐸','🐧','🦁','🐱','🐶','🐵','🦄','🌟','🚀','🎨','📚','⚽','🎵','🌈','🍀','🌻','🦋','🐳','🐙']
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

window.addEventListener('DOMContentLoaded', init);

async function init() {
  // Gắn sự kiện trước, nhưng chưa render trạng thái Guest khi đang khôi phục session.
  buildGradeOptions();
  bindEvents();
  primeSessionUi();

  try {
    const [config, subjects] = await Promise.all([
      loadJson('assets/data/config.json', 'cấu hình hệ thống'),
      loadJson('assets/data/subjects.json', 'danh mục môn học')
    ]);

    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error('config.json không đúng định dạng object.');
    }
    if (!Array.isArray(subjects)) {
      throw new Error('subjects.json không đúng định dạng mảng.');
    }

    EE.config = config;
    EE.subjects = subjects;
    EE.currentGrade = Number(EE.config.defaultGrade || 1);
    await restoreSession();
    EE.sessionRestoring = false;
    renderAll();
  } catch (err) {
    EE.sessionRestoring = false;
    console.error('EE init error:', err);
    renderAll();
    $('#subject-grid').innerHTML = `<div class="empty">${escapeHtml(err.message || 'Không thể tải dữ liệu EE.')}</div>`;
    toast(err.message || 'Không thể tải assets/data/config.json / assets/data/subjects.json.');
  }
}

function primeSessionUi() {
  const token = localStorage.getItem('epsilon_session');
  const btn = $('#user-btn');
  if (!btn) return;
  if (!token) {
    btn.className = 'user-btn login-btn';
    btn.textContent = 'Đăng nhập';
    EE.sessionRestoring = false;
    return;
  }
  const hint = localStorage.getItem('epsilon_user_hint') || 'Tài khoản';
  btn.className = 'user-btn';
  btn.textContent = hint;
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
}

function cacheUserHint(user) {
  const name = String(user?.name || user?.userId || '').trim();
  const avatar = String(user?.avatarEmoji || '🙂');
  const role = user?.role === 'admin' ? ' · ADMIN' : '';
  const text = (avatar + ' ' + name + role).trim();
  if (text) localStorage.setItem('epsilon_user_hint', text);
}

async function loadJson(url, label) {
  const res = await fetch(url, {cache:'no-store'});
  if (!res.ok) throw new Error(`Không tải được ${label} (${url}) - HTTP ${res.status}.`);
  try {
    return await res.json();
  } catch (_) {
    throw new Error(`${url} không phải JSON hợp lệ.`);
  }
}

function bindEvents() {
  $$('.nav-btn').forEach(btn => btn.addEventListener('click', () => btn.dataset.view === 'admin' ? showAdmin() : showView(btn.dataset.view)));
  $$('[data-admin-tab]').forEach(btn => btn.addEventListener('click', () => showAdminTab(btn.dataset.adminTab)));
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
  document.addEventListener('click', handleDelegatedClicks);
  document.addEventListener('pointerdown', handleButtonPressFeedback, true);
}

function handleDelegatedClicks(e) {
  const action = e.target.closest('[data-action]');
  if (!action) return;
  const {action: name} = action.dataset;
  if (name === 'open-subject') openSubject(action.dataset.id);
  if (name === 'cancel-access-request') cancelAccessRequest(action.dataset.requestId, action);
  if (name === 'logout') logout(action);
  if (name === 'save-profile') saveProfile(action);
  if (name === 'select-avatar') selectAvatar(action.dataset.avatar);
  if (name === 'open-admin') showAdmin();
  if (name === 'approve-request') adminResolveRequest(action.dataset.requestId, 'approve', action);
  if (name === 'reject-request') adminResolveRequest(action.dataset.requestId, 'reject', action);
  if (name === 'sync-subject-catalog') adminSyncSubjectCatalog(action);
  if (name === 'mark-read') markNotificationRead(action.dataset.notificationId, action);
  if (name === 'open-login') openAuth('login');
}

function handleButtonPressFeedback(e) {
  const btn = e.target.closest('button');
  if (!btn || btn.disabled) return;
  btn.classList.remove('press-flash');
  void btn.offsetWidth;
  btn.classList.add('press-flash');
  window.setTimeout(() => btn.classList.remove('press-flash'), 240);
}

async function withButtonBusy(button, busyText, task) {
  if (!button || button.disabled) return;
  const oldHtml = button.innerHTML;
  button.disabled = true;
  button.classList.add('is-busy');
  button.setAttribute('aria-busy', 'true');
  button.innerHTML = `<span class="ee-spinner" aria-hidden="true"></span>${escapeHtml(busyText || 'Đang xử lý...')}`;
  try {
    return await task();
  } finally {
    if (button.isConnected) {
      button.innerHTML = oldHtml;
      button.disabled = false;
      button.classList.remove('is-busy');
      button.removeAttribute('aria-busy');
    }
  }
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

function hasAnyPremiumAccess() {
  if (EE.user?.role === 'admin') return true;
  return !!EE.user && Object.values(EE.access || {}).some(a => {
    const type = String(a?.type || '').toLowerCase();
    return type === 'trial' || type === 'vip';
  });
}

function openValueModule(view) {
  if (!EE.user) {
    toast('Đăng nhập Epsilon Edu để tiếp tục.');
    openAuth('login');
    return false;
  }
  if (!hasAnyPremiumAccess()) {
    toast('Games và Tools dành cho Admin hoặc tài khoản đang có Trial/VIP ở ít nhất một môn học.');
    return false;
  }
  const key = view === 'games' ? 'gamesUrl' : 'toolsUrl';
  const rawUrl = String(EE.config?.[key] || '').trim();
  if (!rawUrl) return true;
  try {
    const target = new URL(rawUrl, location.origin);
    if (target.origin !== location.origin) throw new Error('MODULE_ORIGIN');
    location.href = target.href;
    return false;
  } catch (_) {
    toast('Đường dẫn module chưa được cấu hình hợp lệ.');
    return false;
  }
}

function showView(view) {
  if ((view === 'games' || view === 'tools') && !openValueModule(view)) return;
  if (view === 'admin' && EE.user?.role !== 'admin') {
    toast('Bạn không có quyền Admin.');
    view = 'account';
  }
  EE.view = view;
  ['catalog','games','tools','access','account','notifications','admin'].forEach(v => $('#view-' + v)?.classList.toggle('hidden', v !== view));
  $$('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
  if (view === 'notifications' && EE.user) refreshNotifications();
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
    const special = type === 'vip' || type === 'trial';
    const label = type === 'vip' ? 'VIP' : 'TRIAL';
    const expiry = special && access.endAt ? `<div class="disabled-note">${formatDate(access.startAt)} → ${formatDate(access.endAt)}</div>` : '';
    return `<article class="subject-card ${s.accent}">
      <div class="subject-icon">${s.icon || '📘'}</div><h3>${escapeHtml(s.name)}</h3><div class="subject-meta">Lớp ${s.grade} · ${escapeHtml(s.subjectLabel)}</div>
      ${special ? `<span class="access-pill ${type}">${label}</span>${expiry}` : ''}
      <div class="subject-actions"><button class="primary" data-action="open-subject" data-id="${escapeAttr(s.id)}">${s.enabled ? 'Vào học' : 'Xem module'}</button></div>
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
  if (!btn) return;
  const adminNav = $('#admin-nav-btn');
  const topnav = document.querySelector('.topnav');
  const isAdmin = EE.user?.role === 'admin';
  if (adminNav) adminNav.classList.toggle('hidden', !isAdmin);
  if (topnav) topnav.classList.toggle('admin-visible', !!isAdmin);
  if (!isAdmin && EE.view === 'admin' && !EE.sessionRestoring) showView('account');
  if (EE.sessionRestoring) return;
  btn.disabled = false;
  btn.removeAttribute('aria-busy');
  if (!EE.user) {
    btn.className = 'user-btn login-btn'; btn.textContent = 'Đăng nhập';
    $('#notification-badge').classList.add('hidden');
  } else {
    btn.className = 'user-btn';
    const avatar = escapeHtml(EE.user.avatarEmoji || '🙂');
    const name = escapeHtml(EE.user.name || EE.user.userId);
    const adminBadge = isAdmin ? '<span class="top-role-badge">ADMIN</span>' : '';
    btn.innerHTML = `<span class="top-avatar">${avatar}</span><span class="top-user-copy"><span class="top-user-name">${name}</span>${adminBadge}</span>`;
    cacheUserHint(EE.user);
    const unread = EE.notifications.filter(n => !n.read).length;
    $('#notification-badge').textContent = unread; $('#notification-badge').classList.toggle('hidden', unread === 0);
  }
}

function renderAccount() {
  if (!EE.user) {
    $('#account-content').innerHTML = `<div class="empty">Bạn chưa đăng nhập.<div class="actions" style="justify-content:center"><button class="primary" data-action="open-login">Đăng nhập Epsilon Edu</button></div></div>`; return;
  }
  const u = EE.user;
  const currentAvatar = u.avatarEmoji || '🙂';
  const avatarHtml = EE.avatars.map(a => `<button type="button" class="avatar-choice ${a===currentAvatar?'selected':''}" data-action="select-avatar" data-avatar="${escapeAttr(a)}" aria-label="Chọn avatar ${escapeAttr(a)}">${escapeHtml(a)}</button>`).join('');
  const roleHtml = u.role === 'admin' ? '<div class="profile-role-line"><span class="profile-role-badge">ADMIN</span><span>Tài khoản quản trị hệ thống</span></div>' : '';
  $('#account-content').innerHTML = `<h3>Hồ sơ Epsilon</h3>${roleHtml}<div class="field span-2 avatar-field"><label>Avatar</label><div class="avatar-picker">${avatarHtml}</div></div><div class="panel-grid">
    <div class="field"><label>UserId</label><input value="${escapeAttr(u.userId)}" disabled></div>
    <div class="field"><label>Email</label><input value="${escapeAttr(u.email)}" disabled></div>
    <div class="field span-2"><label>Họ và tên</label><input id="profile-name" value="${escapeAttr(u.name||'')}"></div>
    <div class="field"><label>Khối</label><select id="profile-grade">${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${Number(u.grade)===i+1?'selected':''}>Lớp ${i+1}</option>`).join('')}</select></div>
    <div class="field"><label>Lớp</label><input id="profile-class" value="${escapeAttr(u.className||'')}"></div>
    <div class="field span-2"><label>Năm học</label><input id="profile-year" value="${escapeAttr(u.schoolYear||'')}"></div>
  </div><div class="actions"><button class="primary" data-action="save-profile">Lưu hồ sơ</button><button class="danger" data-action="logout">Đăng xuất</button></div>`;
}


function selectAvatar(avatar) {
  if (!EE.avatars.includes(String(avatar || ''))) return;
  $$('.avatar-choice').forEach(btn => btn.classList.toggle('selected', btn.dataset.avatar === avatar));
}

function renderAccess() {
  const root = $('#access-content');
  if (!EE.user) {
    root.innerHTML = `<div class="empty">Hãy đăng nhập để xem và yêu cầu quyền Trial/VIP theo môn.<div class="actions" style="justify-content:center"><button class="primary" data-action="open-login">Đăng nhập</button></div></div>`;
    return;
  }

  const subjectMap = new Map(EE.subjects.map(s => [String(s.id), s]));
  const activeItems = Object.entries(EE.access || {})
    .filter(([, a]) => a && (a.type === 'trial' || a.type === 'vip'))
    .map(([subjectId, a]) => ({subjectId, access:a, subject:subjectMap.get(subjectId)}))
    .sort((x, y) => Number(x.subject?.grade || 99) - Number(y.subject?.grade || 99) || String(x.subject?.name || x.subjectId).localeCompare(String(y.subject?.name || y.subjectId), 'vi'));

  const pendingItems = (EE.requests || [])
    .map(r => ({...r, subject:subjectMap.get(String(r.subjectId))}))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  const activeHtml = activeItems.map(({subjectId, access, subject}) => {
    const title = subject?.name || subjectId;
    const type = String(access.type || '').toLowerCase();
    return `<div class="request-row"><div class="row-top"><div><strong>${escapeHtml(title)}</strong><div class="muted"><span class="access-pill ${type}">${type.toUpperCase()}</span> · ${formatDate(access.startAt)} → ${formatDate(access.endAt)}</div></div></div></div>`;
  }).join('');

  const pendingHtml = pendingItems.map(r => {
    const title = r.subject?.name || r.subjectId;
    return `<div class="request-row"><div class="row-top"><div><strong>${escapeHtml(title)}</strong><div class="muted"><span class="access-pill trial">CHỜ DUYỆT</span> · Yêu cầu ${escapeHtml(String(r.accessType || '').toUpperCase())} · gửi ${formatDateTime(r.createdAt)}</div></div><button class="danger" data-action="cancel-access-request" data-request-id="${escapeAttr(r.requestId)}">Hủy yêu cầu</button></div></div>`;
  }).join('');

  const currentHtml = activeHtml + pendingHtml || '<div class="empty">Bạn chưa có quyền Trial/VIP và chưa có yêu cầu nào đang chờ.</div>';

  const activeIds = new Set(activeItems.map(x => String(x.subjectId)));
  const pendingIds = new Set(pendingItems.map(x => String(x.subjectId)));
  const requestable = EE.subjects.filter(s => !activeIds.has(String(s.id)) && !pendingIds.has(String(s.id)));
  const levels = [
    {id:'primary', label:'Tiểu học', min:1, max:5},
    {id:'secondary', label:'THCS', min:6, max:9},
    {id:'high', label:'THPT', min:10, max:12}
  ].filter(level => requestable.some(s => Number(s.grade) >= level.min && Number(s.grade) <= level.max));

  root.innerHTML = `<h3>Quyền & yêu cầu hiện tại</h3><div class="request-list">${currentHtml}</div>
    <h3 style="margin-top:18px">Yêu cầu quyền mới</h3>
    ${requestable.length ? `<form id="access-request-filter-form" class="panel-grid" style="margin-top:8px">
      <div class="field"><label>Cấp học</label><select id="access-filter-level">${levels.map(x => `<option value="${x.id}">${x.label}</option>`).join('')}</select></div>
      <div class="field"><label>Lớp</label><select id="access-filter-grade"></select></div>
      <div class="field"><label>Môn</label><select id="access-filter-subject"></select></div>
      <div class="field"><label>Loại quyền</label><select id="access-filter-type"><option value="trial">Trial</option><option value="vip">VIP</option></select></div>
      <div class="span-2 actions"><button class="primary" type="submit">Gửi yêu cầu</button></div>
      <div id="access-filter-message" class="message span-2"></div>
    </form>` : '<div class="empty">Hiện không còn môn nào để gửi yêu cầu mới.</div>'}`;

  if (requestable.length) setupAccessRequestFilters(requestable, levels);
}

function setupAccessRequestFilters(requestable, levels) {
  const levelSelect = $('#access-filter-level');
  const gradeSelect = $('#access-filter-grade');
  const subjectSelect = $('#access-filter-subject');
  const form = $('#access-request-filter-form');
  if (!levelSelect || !gradeSelect || !subjectSelect || !form) return;

  function currentLevel() {
    return levels.find(x => x.id === levelSelect.value) || levels[0];
  }
  function refreshGrades() {
    const level = currentLevel();
    const grades = [...new Set(requestable.filter(s => Number(s.grade) >= level.min && Number(s.grade) <= level.max).map(s => Number(s.grade)))].sort((a,b)=>a-b);
    gradeSelect.innerHTML = grades.map(g => `<option value="${g}">Lớp ${g}</option>`).join('');
    refreshSubjects();
  }
  function refreshSubjects() {
    const grade = Number(gradeSelect.value);
    const list = requestable.filter(s => Number(s.grade) === grade);
    subjectSelect.innerHTML = list.map(s => `<option value="${escapeAttr(s.id)}">${escapeHtml(s.name)}</option>`).join('');
  }

  levelSelect.addEventListener('change', refreshGrades);
  gradeSelect.addEventListener('change', refreshSubjects);
  form.addEventListener('submit', handleFilteredAccessRequest);
  refreshGrades();
}

function setAccessControlsDisabled(disabled, exceptButton = null) {
  const root = $('#access-content');
  if (!root) return;
  root.querySelectorAll('button, select, input, textarea').forEach(el => {
    if (el === exceptButton) return;
    el.disabled = !!disabled;
  });
}

async function withAccessMutation(button, busyText, task) {
  if (EE.accessMutationBusy) {
    toast('Hệ thống đang xử lý yêu cầu trước. Vui lòng chờ một chút.');
    return;
  }
  EE.accessMutationBusy = true;
  setAccessControlsDisabled(true, button);
  try {
    return await withButtonBusy(button, busyText, task);
  } finally {
    EE.accessMutationBusy = false;
    setAccessControlsDisabled(false);
  }
}

async function handleFilteredAccessRequest(e) {
  e.preventDefault();
  setMsg('access-filter-message','');
  const subjectId = $('#access-filter-subject')?.value;
  const accessType = $('#access-filter-type')?.value;
  if (!subjectId || !accessType) return setMsg('access-filter-message','Vui lòng chọn môn và loại quyền.');
  const button = e.submitter || e.currentTarget.querySelector('button[type="submit"]');
  await withAccessMutation(button, 'Đang gửi...', async () => {
    try {
      await apiAuth('accessRequestCreate',{subjectId, accessType});
      await refreshAccessState();
      toast('Đã gửi yêu cầu. Admin sẽ là người quyết định cuối cùng.');
    } catch(err) {
      setMsg('access-filter-message', err.message);
    }
  });
}

async function cancelAccessRequest(requestId, button) {
  if (!requestId) return;
  await withAccessMutation(button, 'Đang hủy...', async () => {
    try {
      await apiAuth('accessRequestCancel',{requestId});

      // Server đã xác nhận xóa: cập nhật UI ngay, không chờ thêm một round-trip đọc state.
      EE.requests = (EE.requests || []).filter(r => String(r.requestId) !== String(requestId));
      renderAccess();
      renderSubjects();
      toast('Đã hủy yêu cầu.');

      // Đồng bộ nền để kiểm tra lại state thật; không giữ spinner chờ request này.
      setTimeout(() => { refreshAccessState(); }, 250);
    } catch(err) {
      // Nếu client timeout đúng lúc server đã xóa xong, kiểm tra state thật trước khi báo lỗi.
      try {
        const state = await apiAuth('accessStateGet',{});
        EE.access = state.access || {};
        EE.requests = state.requests || [];
        renderAccess();
        renderSubjects();
        const stillExists = EE.requests.some(r => String(r.requestId) === String(requestId));
        if (!stillExists) {
          toast('Đã hủy yêu cầu.');
          return;
        }
      } catch (_) {
        // Giữ lỗi ban đầu nếu cả bước đối chiếu cũng không lấy được state.
      }
      toast(err.message);
    }
  });
}

async function refreshAccessState() {
  if (!EE.user) return;
  try {
    const data = await apiAuth('accessStateGet',{});
    EE.access = data.access || {};
    EE.requests = data.requests || [];
    renderAccess();
    renderSubjects();
  } catch(err) {
    toast(err.message);
  }
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
  const button = e.submitter || e.currentTarget.querySelector('button[type="submit"]');
  await withButtonBusy(button, 'Đang đăng nhập...', async () => {
  try {
    const data = await api('login',{email:$('#login-email').value,password:$('#login-password').value});
    localStorage.setItem(EE.config?.sessionKey || 'epsilon_session', data.token); EE.user = data.user; cacheUserHint(EE.user); EE.access = data.access || {}; EE.requests = data.requests || []; EE.notifications = data.notifications || [];
    $('#auth-modal').classList.add('hidden'); renderAll(); showView('catalog'); toast('Đăng nhập Epsilon Edu thành công.');
    handleReturnAfterLogin();
  } catch(err) { setMsg('login-message', err.message); }
  });
}

async function handleRegister(e) {
  e.preventDefault(); setMsg('register-message','');
  const button = e.submitter || e.currentTarget.querySelector('button[type="submit"]');
  await withButtonBusy(button, 'Đang gửi OTP...', async () => {
  try {
    const payload = {email:$('#reg-email').value,password:$('#reg-password').value,name:$('#reg-name').value,grade:Number($('#reg-grade').value),className:$('#reg-class').value,schoolYear:$('#reg-year').value};
    const data = await api('registerStart', payload); EE.pendingRegistrationEmail = data.email;
    $('#register-form').classList.add('hidden'); $('#otp-form').classList.remove('hidden'); toast('OTP đã được gửi về email.');
  } catch(err) { setMsg('register-message', err.message); }
  });
}

async function handleOtpVerify(e) {
  e.preventDefault(); setMsg('otp-message','');
  const button = e.submitter || e.currentTarget.querySelector('button[type="submit"]');
  await withButtonBusy(button, 'Đang xác thực...', async () => {
  try {
    const data = await api('registerVerify',{email:EE.pendingRegistrationEmail,otp:$('#otp-code').value});
    localStorage.setItem(EE.config?.sessionKey || 'epsilon_session', data.token); EE.user = data.user; cacheUserHint(EE.user); EE.access = {}; EE.requests = []; EE.notifications = data.notifications || [];
    $('#auth-modal').classList.add('hidden'); renderAll(); showView('catalog'); toast(`Tạo tài khoản thành công: ${data.user.userId}`);
  } catch(err) { setMsg('otp-message', err.message); }
  });
}

async function restoreSession() {
  const sessionKey = EE.config?.sessionKey || 'epsilon_session';
  const token = localStorage.getItem(sessionKey); if (!token) return;
  try {
    const data = await api('sessionVerify',{token}); EE.user = data.user; cacheUserHint(EE.user); EE.access = data.access || {}; EE.requests = data.requests || []; EE.notifications = data.notifications || [];
  } catch (err) { localStorage.removeItem(sessionKey); localStorage.removeItem('epsilon_user_hint'); EE.user = null; EE.access = {}; EE.requests = []; EE.notifications = []; }
}

async function logout(button) {
  return withButtonBusy(button, 'Đang đăng xuất...', async () => {
  const sessionKey = EE.config?.sessionKey || 'epsilon_session';
  const token = localStorage.getItem(sessionKey);
  if (token && EE.config?.apiUrl) { try { await api('logout',{token}); } catch(_){} }
  localStorage.removeItem(sessionKey); localStorage.removeItem('epsilon_user_hint'); EE.user = null; EE.access = {}; EE.requests = []; EE.notifications = []; renderAll(); showView('catalog'); toast('Đã đăng xuất.');
  });
}

async function saveProfile(button) {
  return withButtonBusy(button, 'Đang lưu...', async () => {
  try {
    const selectedAvatar = $('.avatar-choice.selected')?.dataset.avatar || EE.user?.avatarEmoji || '🙂';
    const data = await apiAuth('profileUpdate',{name:$('#profile-name').value,grade:Number($('#profile-grade').value),className:$('#profile-class').value,schoolYear:$('#profile-year').value,avatarEmoji:selectedAvatar});
    EE.user = data.user; cacheUserHint(EE.user); renderAll(); toast('Đã cập nhật hồ sơ.');
  } catch(err) { toast(err.message); }
  });
}

async function refreshNotifications() {
  if (!EE.user) return;
  try { const data = await apiAuth('notificationsList',{}); EE.notifications = data.notifications || []; renderNotifications(); renderTopbar(); } catch(err) { toast(err.message); }
}

async function markNotificationRead(id, button) {
  return withButtonBusy(button, 'Đang cập nhật...', async () => {
    try { await apiAuth('notificationRead',{notificationId:id}); await refreshNotifications(); } catch(err){toast(err.message);}
  });
}

function showAdmin() {
  if (EE.user?.role !== 'admin') return toast('Bạn không có quyền Admin.');
  showView('admin');
  showAdminTab('requests');
}

function showAdminTab(tab) {
  if (EE.user?.role !== 'admin') return;
  const allowed = ['requests','users','access','overview'];
  const next = allowed.includes(tab) ? tab : 'requests';
  EE.adminTab = next;
  $$('.admin-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.adminTab === next));
  if (next === 'requests') loadAdminRequests();
  if (next === 'users') loadAdminUsers();
  if (next === 'access') loadAdminAccessOverview();
  if (next === 'overview') loadAdminOverview();
}

function renderAdminLoading(text) {
  const root = $('#admin-content');
  if (root) root.innerHTML = `<div class="empty"><span class="ee-spinner" style="display:inline-block;margin-right:8px"></span>${escapeHtml(text || 'Đang tải...')}</div>`;
}

function setAdminRequestCount(count) {
  const el = $('#admin-request-count');
  if (el) el.textContent = String(Number(count || 0));
}

async function loadAdminRequests() {
  if (EE.user?.role !== 'admin') return;
  renderAdminLoading('Đang tải yêu cầu chờ duyệt...');
  try {
    const data = await apiAuth('adminAccessRequestsList',{});
    const rows = data.requests || [];
    setAdminRequestCount(rows.length);
    const distinctSubjects = new Set(rows.map(r => String(r.subjectId || ''))).size;
    const summaryText = rows.length
      ? `Có ${rows.length} yêu cầu ở ${distinctSubjects} môn học đang chờ duyệt.`
      : 'Hiện không có yêu cầu nào đang chờ duyệt.';
    const summary = `<div class="admin-summary"><div><strong>${escapeHtml(summaryText)}</strong><div class="muted">Mặc định mở tab này để Admin thấy ngay các việc cần xử lý.</div></div></div>`;
    const requests = rows.length ? rows.map(r => {
      const classText = r.className ? ` · Lớp ${escapeHtml(r.className)}` : (r.grade ? ` · Khối ${escapeHtml(r.grade)}` : '');
      const subjectName = r.subjectName || r.subjectId;
      return `<div class="admin-request pending"><div class="admin-request-main"><div class="admin-request-title"><strong>${escapeHtml(r.name || r.userId)}</strong><span class="admin-chip pending">CHỜ DUYỆT</span></div><div class="muted">${escapeHtml(r.userId)}${classText} · ${escapeHtml(r.email || '')}</div><div class="muted"><strong>${escapeHtml(subjectName)}</strong> · Yêu cầu ${escapeHtml(String(r.accessType || '').toUpperCase())} · gửi ${formatDateTime(r.createdAt)}</div>${r.note ? `<div class="muted">Ghi chú: ${escapeHtml(r.note)}</div>` : ''}</div><div class="admin-actions"><button class="primary" data-action="approve-request" data-request-id="${escapeAttr(r.requestId)}">Duyệt</button><button class="danger" data-action="reject-request" data-request-id="${escapeAttr(r.requestId)}">Từ chối</button></div></div>`;
    }).join('') : '<div class="empty">Không có yêu cầu chờ xử lý.</div>';
    $('#admin-content').innerHTML = summary + `<div class="admin-table">${requests}</div>`;
  } catch(err) {
    $('#admin-content').innerHTML=`<div class="empty">${escapeHtml(err.message)}</div>`;
  }
}

async function loadAdminUsers() {
  if (EE.user?.role !== 'admin') return;
  renderAdminLoading('Đang tải danh sách người dùng...');
  try {
    const data = await apiAuth('adminUsersList',{});
    EE.adminUsers = data.users || [];
    renderAdminUsers(EE.adminUsers);
  } catch(err) {
    $('#admin-content').innerHTML=`<div class="empty">${escapeHtml(err.message)}</div>`;
  }
}

function renderAdminUsers(rows) {
  const root = $('#admin-content');
  if (!root) return;

  const grades = [...new Set(rows.map(u => Number(u.grade)).filter(Number.isFinite))].sort((a,b) => a-b);
  let activeType = 'all';
  let activeGrade = 'all';

  const typeFilters = [
    ['all','Tất cả',''],
    ['admin','Admin','admin'],
    ['vip','VIP','vip'],
    ['trial','Trial','trial'],
    ['regular','Regular','regular']
  ].map(([value,label,cls]) => `<button type="button" class="admin-filter-chip ${cls} ${value === 'all' ? 'active' : ''}" data-user-filter-type="${value}">#${label}</button>`).join('');
  const gradeFilters = grades.map(g => `<button type="button" class="admin-filter-chip grade" data-user-filter-grade="${g}">#Lớp${g}</button>`).join('');

  const summary = `<div class="admin-summary"><div><strong><span id="admin-user-visible-count" class="admin-user-count">${rows.length}</span> / ${rows.length} tài khoản</strong><div class="muted">Tìm kiếm, lọc bằng hashtag và sắp xếp tức thời.</div></div><div class="admin-user-tools"><input id="admin-user-search" aria-label="Tìm người dùng" placeholder="Tìm tên, email hoặc UserId"><select id="admin-user-sort" aria-label="Sắp xếp người dùng"><option value="id-asc">UserId tăng dần</option><option value="id-desc">UserId giảm dần</option><option value="name-asc">Tên A → Z</option><option value="name-desc">Tên Z → A</option><option value="newest">Mới đăng ký trước</option><option value="oldest">Cũ đăng ký trước</option><option value="admin-first">Admin trước</option><option value="vip-first">VIP trước</option><option value="trial-first">Trial trước</option><option value="regular-first">Regular trước</option></select></div></div>`;
  root.innerHTML = summary + `<div class="admin-user-filters" id="admin-user-type-filters">${typeFilters}</div>${gradeFilters ? `<div class="admin-user-filters" id="admin-user-grade-filters">${gradeFilters}</div>` : ''}<div class="admin-filter-note">Bấm lại hashtag lớp đang chọn để bỏ lọc lớp.</div><div id="admin-users-list" class="admin-table"></div>`;

  const search = $('#admin-user-search');
  const sort = $('#admin-user-sort');

  const classify = (u) => {
    const accesses = u.accesses || [];
    const isAdmin = String(u.role || '').toLowerCase() === 'admin';
    const hasVip = accesses.some(a => String(a.type).toLowerCase() === 'vip');
    const hasTrial = accesses.some(a => String(a.type).toLowerCase() === 'trial');
    return {isAdmin,hasVip,hasTrial,isRegular:!hasVip && !hasTrial};
  };

  const rankFor = (u, mode) => {
    const c = classify(u);
    if (mode === 'admin-first') return c.isAdmin ? 0 : 1;
    if (mode === 'vip-first') return c.hasVip ? 0 : 1;
    if (mode === 'trial-first') return c.hasTrial ? 0 : 1;
    if (mode === 'regular-first') return c.isRegular ? 0 : 1;
    return 0;
  };

  const matchesType = (u) => {
    if (activeType === 'all') return true;
    const c = classify(u);
    if (activeType === 'admin') return c.isAdmin;
    if (activeType === 'vip') return c.hasVip;
    if (activeType === 'trial') return c.hasTrial;
    if (activeType === 'regular') return c.isRegular && !c.isAdmin;
    return true;
  };

  const draw = () => {
    const q = String(search?.value || '').trim().toLowerCase();
    const mode = sort?.value || 'id-asc';
    let filtered = rows.filter(u => {
      const matchesSearch = !q || [u.userId,u.name,u.email,u.className,String(u.grade||'')].join(' ').toLowerCase().includes(q);
      const matchesGrade = activeGrade === 'all' || String(u.grade || '') === String(activeGrade);
      return matchesSearch && matchesGrade && matchesType(u);
    });

    filtered = [...filtered].sort((a,b) => {
      if (['admin-first','vip-first','trial-first','regular-first'].includes(mode)) {
        const d = rankFor(a,mode) - rankFor(b,mode);
        if (d) return d;
      }
      if (mode === 'id-desc') return String(b.userId||'').localeCompare(String(a.userId||''),'vi',{numeric:true});
      if (mode === 'name-asc') return String(a.name||'').localeCompare(String(b.name||''),'vi');
      if (mode === 'name-desc') return String(b.name||'').localeCompare(String(a.name||''),'vi');
      if (mode === 'newest') return new Date(b.createdAt||0) - new Date(a.createdAt||0);
      if (mode === 'oldest') return new Date(a.createdAt||0) - new Date(b.createdAt||0);
      return String(a.userId||'').localeCompare(String(b.userId||''),'vi',{numeric:true});
    });

    const count = $('#admin-user-visible-count');
    if (count) count.textContent = String(filtered.length);

    $('#admin-users-list').innerHTML = filtered.length ? filtered.map(u => {
      const accesses = u.accesses || [];
      const {isAdmin,hasVip,hasTrial} = classify(u);
      const rowClass = isAdmin ? 'is-admin' : (hasVip ? 'has-vip' : (hasTrial ? 'has-trial' : 'is-regular'));
      const typeBadge = isAdmin ? '<span class="account-type-badge admin">ADMIN</span>' : (hasVip ? '<span class="account-type-badge vip">VIP</span>' : (hasTrial ? '<span class="account-type-badge trial">TRIAL</span>' : ''));
      const chips = accesses.map(a => `<span class="admin-chip ${escapeAttr(a.type)}">${escapeHtml(a.subjectName || a.subjectId)} · ${escapeHtml(String(a.type || '').toUpperCase())} · ${formatDate(a.endAt)}</span>`).join('');
      return `<div class="admin-user-row ${rowClass}"><div class="admin-user-primary"><span class="admin-list-avatar">${escapeHtml(u.avatarEmoji || '🙂')}</span><div><div class="admin-user-id">${escapeHtml(u.userId)} ${typeBadge}</div><div class="admin-user-name">${escapeHtml(u.name || '')}</div></div></div><div><div class="admin-user-email">${escapeHtml(u.email || '')}</div><div class="admin-user-meta">${u.grade ? `Khối ${escapeHtml(u.grade)}` : ''}${u.className ? ` · Lớp ${escapeHtml(u.className)}` : ''}${isAdmin ? ' · Quản trị viên' : ''}</div></div><div class="admin-access-chips">${chips || '<span class="muted regular-label">Regular · chưa có quyền Trial/VIP</span>'}</div></div>`;
    }).join('') : '<div class="empty">Không tìm thấy người dùng phù hợp với bộ lọc hiện tại.</div>';
  };

  if (search) search.addEventListener('input', draw);
  if (sort) sort.addEventListener('change', draw);
  $$('[data-user-filter-type]').forEach(btn => btn.addEventListener('click', () => {
    activeType = btn.dataset.userFilterType || 'all';
    $$('[data-user-filter-type]').forEach(x => x.classList.toggle('active', x === btn));
    draw();
  }));
  $$('[data-user-filter-grade]').forEach(btn => btn.addEventListener('click', () => {
    const value = btn.dataset.userFilterGrade || 'all';
    activeGrade = activeGrade === value ? 'all' : value;
    $$('[data-user-filter-grade]').forEach(x => x.classList.toggle('active', activeGrade !== 'all' && x.dataset.userFilterGrade === activeGrade));
    draw();
  }));
  draw();
}

async function loadAdminAccessOverview() {
  if (EE.user?.role !== 'admin') return;
  renderAdminLoading('Đang tổng hợp quyền học...');
  try {
    const data = await apiAuth('adminAccessOverview',{});
    const rows = data.subjects || [];
    const summary = `<div class="admin-summary"><div><strong>Quyền học theo môn</strong><div class="muted">Theo dõi số quyền VIP/Trial đang còn hiệu lực ở từng môn.</div></div><button class="secondary" data-action="sync-subject-catalog">Đồng bộ môn học</button></div>`;
    const list = rows.length ? rows.map(r => `<div class="admin-subject-row"><strong>${escapeHtml(r.subjectName || r.subjectId)}</strong><span class="admin-chip vip">VIP ${Number(r.vip || 0)}</span><span class="admin-chip trial">Trial ${Number(r.trial || 0)}</span><span class="muted">Tổng ${Number(r.total || 0)}</span></div>`).join('') : '<div class="empty">Chưa có dữ liệu quyền học.</div>';
    $('#admin-content').innerHTML = summary + `<div class="admin-table">${list}</div>`;
  } catch(err) {
    $('#admin-content').innerHTML=`<div class="empty">${escapeHtml(err.message)}</div>`;
  }
}

async function loadAdminOverview() {
  if (EE.user?.role !== 'admin') return;
  renderAdminLoading('Đang tổng hợp hệ thống...');
  try {
    const data = await apiAuth('adminOverviewGet',{});
    setAdminRequestCount(data.pendingRequests || 0);
    const cards = [
      ['Tổng tài khoản', data.totalUsers],
      ['Chỉ Regular', data.regularOnly],
      ['Có VIP', data.usersWithVip],
      ['Có Trial', data.usersWithTrial],
      ['Yêu cầu chờ', data.pendingRequests],
      ['Admin', data.adminUsers]
    ].map(([label,value]) => `<div class="admin-stat"><strong>${Number(value || 0)}</strong><span>${escapeHtml(label)}</span></div>`).join('');
    const grades = (data.byGrade || []).map(x => `<span class="admin-chip">Lớp ${escapeHtml(x.grade)} · ${Number(x.count || 0)} user</span>`).join('');
    $('#admin-content').innerHTML = `<div class="admin-stat-grid">${cards}</div><div class="admin-summary" style="margin-top:14px"><div><strong>Phân bố theo khối</strong><div class="admin-access-chips" style="margin-top:8px">${grades || '<span class="muted">Chưa có dữ liệu.</span>'}</div></div></div><div class="muted">“Có VIP” và “Có Trial” là số user có ít nhất một quyền tương ứng theo môn; một user có thể đồng thời nằm ở cả hai nhóm.</div>`;
  } catch(err) {
    $('#admin-content').innerHTML=`<div class="empty">${escapeHtml(err.message)}</div>`;
  }
}

async function adminSyncSubjectCatalog(button) {
  return withButtonBusy(button, 'Đang đồng bộ...', async () => {
    try {
      const data = await apiAuth('adminCatalogSync',{});
      toast(`Đã đồng bộ ${data.subjectCount || 0} môn. Tạo mới ${data.createdSheets || 0} sheet quyền.`);
      const fresh = await loadJson('assets/data/subjects.json', 'danh mục môn học');
      if (Array.isArray(fresh)) {
        EE.subjects = fresh;
        const available = [...new Set(EE.subjects.map(x => Number(x.grade)))].filter(Number.isFinite).sort((a,b)=>a-b);
        if (available.length && !available.includes(Number(EE.currentGrade))) EE.currentGrade = available[0];
        renderAll();
      }
      showAdminTab(EE.adminTab || 'access');
    } catch(err) { toast(err.message); }
  });
}

async function adminResolveRequest(requestId, decision, button) {
  return withButtonBusy(button, decision==='approve'?'Đang duyệt...':'Đang từ chối...', async () => {
    try {
      await apiAuth('adminAccessRequestResolve',{requestId,decision});
      toast(decision==='approve'?'Đã cấp quyền.':'Đã từ chối yêu cầu.');
      await loadAdminRequests();
      if (EE.user) refreshAccessState();
    } catch(err){ toast(err.message); }
  });
}

function handleReturnAfterLogin() {
  const q = new URLSearchParams(location.search); const ret = q.get('return'); if (!ret) return;
  try { const url = new URL(ret, location.origin); if (url.origin === location.origin) location.href = url.href; } catch(_) {}
}

async function apiAuth(action,data={}) {
  const sessionKey = EE.config?.sessionKey || 'epsilon_session';
  const token = localStorage.getItem(sessionKey); if (!token) throw new Error('Bạn cần đăng nhập Epsilon Edu.');
  return api(action,{...data,token});
}

async function api(action,data={}) {
  if (!EE.config?.apiUrl || EE.config.apiUrl.includes('PASTE_YOUR')) throw new Error('Chưa cấu hình apiUrl trong config.json.');
  if (!/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(String(action||''))) throw new Error('Yêu cầu không hợp lệ.');
  const body = new URLSearchParams();
  body.set('payload', JSON.stringify({action,...data}));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(EE.config.apiUrl,{
      method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
      body:body.toString(),
      signal:controller.signal,
      cache:'no-store',
      referrerPolicy:'no-referrer'
    });
    const raw = await res.text();
    let json;
    try {
      json = JSON.parse(raw);
    } catch (_) {
      // Apps Script/Google đôi khi trả về trang HTML tạm thời thay vì JSON.
      // Không để lỗi parse kỹ thuật lộ ra giao diện người dùng.
      throw new Error('Máy chủ đang phản hồi chưa ổn định. Vui lòng thử lại sau vài giây.');
    }
    if (!res.ok) throw new Error(json?.error || 'Máy chủ đang bận. Vui lòng thử lại sau vài giây.');
    if (!json || typeof json !== 'object') throw new Error('Máy chủ đang phản hồi chưa ổn định. Vui lòng thử lại sau vài giây.');
    if (!json.ok) throw new Error(json.error || 'Không thể xử lý yêu cầu.');
    return json.data || {};
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error('Máy chủ phản hồi quá lâu. Vui lòng thử lại.');
    if (err instanceof TypeError) throw new Error('Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.');
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
