(() => {
  'use strict';
  const root = document.getElementById('app');
  const state = { user: null, overview: null, students: [], section: 'overview', attendance: new Map(), edit: null };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch]);
  const list = value => Array.isArray(value) ? value : [];
  const val = (object, ...keys) => keys.map(key => object?.[key]).find(value => value !== undefined && value !== null && value !== '') ?? '—';
  const dateText = value => { if (!value) return '—'; const date = new Date(value); return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('ru-RU'); };
  const localDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const status = (message, kind = '') => { const el = document.getElementById('status'); if (el) { el.textContent = message; el.className = `status ${kind}`; } };
  async function api(path, options = {}) {
    const response = await fetch(`/api${path}`, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.message || (response.status === 401 ? 'Войдите в кабинет.' : `Ошибка сервера (${response.status}).`));
    return data;
  }
  const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body) });
  const patch = (path, body) => api(path, { method: 'PATCH', body: JSON.stringify(body) });
  const jsonForm = form => Object.fromEntries(new FormData(form).entries());
  function button(label, action, id, active = false) { return `<button type="button" class="nav-btn ${active ? 'active' : ''}" data-nav="${action}" ${id ? `data-id="${esc(id)}"` : ''}>${label}</button>`; }
  function table(headers, rows, empty = 'Записей пока нет.') {
    if (!rows.length) return `<p class="empty">${empty}</p>`;
    return `<div class="table-wrap"><table class="data-table"><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map((cell, i) => `<td data-label="${headers[i]}">${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  function shell() {
    const admin = state.user.role === 'admin';
    const sections = admin ? [['overview','Обзор'],['registrations','Регистрации'],['applications','Заявки'],['students','Ученики'],['teachers','Преподаватели'],['tests','Тесты'],['videos','Видеоуроки']] : [['students','Мои ученики']];
    root.innerHTML = `<div class="layout"><aside class="sidebar"><div class="brand"><span class="brand-mark">П</span><span>Прогресс</span></div><nav class="side-nav" aria-label="Разделы">${sections.map(([key, label]) => button(label, key, '', state.section === key)).join('')}</nav><div class="side-foot"><span>${esc(state.user.name)} · ${admin ? 'Администратор' : 'Преподаватель'}</span><button id="logout" type="button">Выйти</button></div></aside><main class="main"><header class="top"><div><h1 id="page-title"></h1><p>${admin ? 'Управление учебным центром' : 'Посещаемость и комментарии'}</p></div><a href="./index.html">На сайт ↗</a></header><p id="status" class="status" role="status" aria-live="polite"></p><div id="content"></div></main></div>`;
    root.querySelector('#logout').addEventListener('click', async () => { try { await post('/logout', {}); state.user = null; state.overview = null; state.students = []; login(); } catch (error) { status(error.message, 'error'); } });
    root.querySelectorAll('[data-nav]').forEach(el => el.addEventListener('click', () => { state.section = el.dataset.nav; state.edit = null; render(); }));
    render();
  }
  function login(message = '') {
    root.innerHTML = `<div class="login-wrap"><div class="login-card"><div class="brand"><span class="brand-mark">П</span><span>Прогресс</span></div><h1>Вход в кабинет</h1><p>Для администрации и преподавателей</p><form id="login-form" class="form-grid"><label class="field full">Логин<input name="login" autocomplete="username" required></label><label class="field full">Пароль<input name="password" type="password" autocomplete="current-password" required></label><div class="actions"><button class="button primary" type="submit">Войти</button><a href="./index.html">Вернуться на сайт</a></div></form><p id="status" class="status" role="status" aria-live="polite"></p></div></div>`;
    if (message) status(message, 'error');
    document.getElementById('login-form').addEventListener('submit', async event => {
      event.preventDefault(); const form = event.currentTarget; const submit = form.querySelector('button'); submit.disabled = true; status('Проверяем данные…');
      try { await post('/login', jsonForm(form)); form.reset(); await loadMe(); }
      catch (error) { status(error.message, 'error'); }
      finally { submit.disabled = false; }
    });
  }
  async function loadMe() {
    const data = await api('/me');
    if (!data.user || !['admin','teacher'].includes(data.user.role)) throw new Error('Для этой учётной записи кабинет недоступен.');
    state.user = data.user;
    state.section = data.user.role === 'admin' ? 'overview' : 'students';
    root.textContent = 'Загрузка данных…';
    try { await refresh(); shell(); }
    catch (error) { shell(); status(error.message, 'error'); }
  }
  async function refresh() {
    if (state.user.role === 'admin') state.overview = await api('/admin/overview');
    else state.students = list((await api('/teacher/students')).students);
  }
  function title() { return ({ overview:'Обзор', registrations:'Регистрации', applications:'Заявки', students:state.user.role === 'admin' ? 'Ученики' : 'Мои ученики', teachers:'Преподаватели', tests:'Тесты', videos:'Видеоуроки' })[state.section]; }
  function render() {
    root.querySelectorAll('[data-nav]').forEach(el => el.classList.toggle('active', el.dataset.nav === state.section));
    document.getElementById('page-title').textContent = title();
    const target = document.getElementById('content');
    target.innerHTML = state.user.role === 'teacher' ? teacherView() : ({ overview: overviewView, registrations: registrationsView, applications: applicationsView, students: studentsView, teachers: teachersView, tests: testsView, videos: videosView })[state.section]();
    bind();
  }
  function overviewView() {
    const o = state.overview || {}, applications = list(o.applications), students = list(o.students), teachers = list(o.teachers), tests = list(o.tests), videos = list(o.videos);
    return `<div class="stats">${[['Регистрации',list(o.users).length],['Заявки',applications.length],['Ученики',students.length],['Преподаватели',teachers.length]].map(([label, number]) => `<div class="stat"><span>${label}</span><strong>${number}</strong></div>`).join('')}</div><div class="split"><section class="surface"><h2>Последние заявки</h2>${table(['Имя','Контакт','Направление'], applications.slice(0,5).map(a => [esc(val(a,'name','student_name')),esc(val(a,'phone','email')),esc(val(a,'interest','course','subject'))]))}</section><section class="surface"><h2>Материалы</h2><p>Тестов: <strong>${tests.length}</strong> · Видеоуроков: <strong>${videos.length}</strong></p><p class="muted small">Публикация материалов управляется в соответствующих разделах.</p></section></div>`;
  }
  function registrationsView() {
    const rows = list(state.overview?.users).map(u => [esc(val(u,'id')),esc(val(u,'name')),esc(val(u,'login','email')),esc(val(u,'phone')),esc(val(u,'role')),esc(dateText(u.created_at))]);
    return `<section class="surface"><h2>Зарегистрированные пользователи</h2>${table(['ID','Имя','Логин','Телефон','Роль','Дата'], rows)}</section>`;
  }
  function applicationsView() {
    const rows = list(state.overview?.applications).map(a => [esc(val(a,'name','student_name')),esc(val(a,'phone')),esc(val(a,'interest','course','subject')),esc(dateText(a.created_at))]);
    return `<section class="surface"><h2>Заявки с сайта</h2>${table(['Имя','Телефон','Направление','Дата'],rows)}</section>`;
  }
  function selected(value, option) { return String(value ?? '') === String(option) ? ' selected' : ''; }
  function teacherOptions(value) { return list(state.overview?.teachers).filter(t => t.active || String(t.id) === String(value)).map(t => `<option value="${esc(t.id)}"${selected(value,t.id)}>${esc(t.name)}</option>`).join(''); }
  function parentOptions(value) { return list(state.overview?.users).filter(u => u.role === 'parent' && u.active || String(u.id) === String(value)).map(u => `<option value="${esc(u.id)}"${selected(value,u.id)}>${esc(u.name)} (${esc(u.login)})</option>`).join(''); }
  function editing(kind) { return state.edit?.kind === kind ? list(state.overview?.[kind]).find(item => String(item.id) === String(state.edit.id)) : null; }
  function studentsView() {
    const current = editing('students');
    const rows = list(state.overview?.students).map(s => [esc(s.name),esc(val(s,'course')),esc(val(s,'type')),esc(val(s,'schedule')),esc(val(s,'teacher_name','teacher')),esc(val(s,'cost')),esc(val(s,'payment')),`<span class="pill ${s.active ? 'good' : ''}">${s.active ? 'Активен' : 'В архиве'}</span>`,`<button type="button" class="button tiny" data-edit="students" data-id="${esc(s.id)}">Изменить</button> <button type="button" class="button tiny" data-archive-student="${esc(s.id)}" data-active="${s.active ? '1' : '0'}">${s.active ? 'В архив' : 'Восстановить'}</button>`]);
    return `<section class="surface" id="edit-form"><h2>${current ? 'Изменить ученика' : 'Добавить ученика'}</h2><form id="student-form" class="form-grid"><label class="field">Имя<input name="name" value="${esc(current?.name ?? '')}" required></label><label class="field">Преподаватель<select name="teacher_id" required><option value="">Выберите</option>${teacherOptions(current?.teacher_id)}</select></label><label class="field">Курс<input name="course" value="${esc(current?.course ?? '')}" required></label><label class="field">Формат<input name="type" value="${esc(current?.type ?? '')}" placeholder="Группа / индивидуально" required></label><label class="field">Расписание<input name="schedule" value="${esc(current?.schedule ?? '')}" required></label><label class="field">Стоимость<input name="cost" type="number" min="0" step="0.01" value="${esc(current?.cost ?? '')}" required></label><label class="field">Оплата<input name="payment" value="${esc(current?.payment ?? '')}" placeholder="Статус или сумма"></label><label class="field">Родитель<select name="parent_id"><option value="">Не привязан</option>${parentOptions(current?.parent_id)}</select></label><div class="actions field full"><button class="button primary" type="submit">${current ? 'Сохранить изменения' : 'Добавить ученика'}</button>${current ? '<button class="button" type="button" data-cancel-edit>Отмена</button>' : ''}</div></form></section><section class="surface"><h2>Ученики</h2>${table(['Имя','Курс','Формат','Расписание','Преподаватель','Стоимость','Оплата','Статус','Действия'], rows)}</section>`;
  }
  function teachersView() {
    const rows = list(state.overview?.teachers).map(t => [esc(t.name),esc(t.login),esc(t.id)]);
    return `<section class="surface"><h2>Создать учётную запись</h2><form id="teacher-form" class="form-grid"><label class="field">Имя<input name="name" required></label><label class="field">Логин<input name="login" autocomplete="off" required></label><label class="field full">Временный пароль<input name="password" type="password" minlength="10" autocomplete="new-password" required></label><div class="actions field full"><button class="button primary" type="submit">Создать преподавателя</button></div></form><div id="teacher-secret"></div></section><section class="surface"><h2>Преподаватели</h2>${table(['Имя','Логин','ID'],rows)}</section>`;
  }
  const questionMarkup = (index, q = {}) => `<div class="question" data-question><div class="question-head"><h3>Вопрос ${index + 1}</h3><button type="button" class="button tiny" data-remove-question>Удалить</button></div><div class="form-grid"><label class="field full">Текст вопроса<input data-question-text value="${esc(q.question ?? '')}" required></label><div class="question-options">${[0,1,2,3].map(i => `<label class="field">Вариант ${i+1}<input data-option="${i}" value="${esc(q.options?.[i] ?? '')}" required></label>`).join('')}</div><label class="field">Правильный вариант<select data-correct>${[0,1,2,3].map(i => `<option value="${i}"${selected(q.correct ?? 0,i)}>${i+1}</option>`).join('')}</select></label></div></div>`;
  function testsView() {
    const current = editing('tests');
    const rows = list(state.overview?.tests).map(t => [esc(t.title),esc(val(t,'subject')),esc(val(t,'duration_minutes')),t.is_paid ? 'Платный' : 'Бесплатный',`<span class="pill ${t.published ? 'good' : ''}">${t.published ? 'Открыт' : 'Закрыт'}</span>`,`<button type="button" class="button tiny" data-edit="tests" data-id="${esc(t.id)}">Изменить</button> <button type="button" class="button tiny" data-toggle-test="${esc(t.id)}" data-published="${t.published ? '1' : '0'}">${t.published ? 'Закрыть' : 'Открыть'}</button>`]);
    return `<section class="surface" id="edit-form"><h2>${current ? 'Изменить тест' : 'Создать тест'}</h2><form id="test-form" class="form-grid"><label class="field">Название<input name="title" value="${esc(current?.title ?? '')}" required></label><label class="field">Предмет<input name="subject" value="${esc(current?.subject ?? '')}" required></label><label class="field">Время, минут<input name="duration_minutes" type="number" min="1" value="${esc(current?.duration_minutes ?? 30)}" required></label><div class="checks"><label class="check"><input name="published" type="checkbox" ${current?.published ? 'checked' : ''}> Опубликовать</label><label class="check"><input name="is_paid" type="checkbox" ${current?.is_paid ? 'checked' : ''}> Платный</label></div><div class="field full"><span>Вопросы</span><div id="questions">${current && list(current.questions).length ? list(current.questions).map((q,i) => questionMarkup(i,q)).join('') : questionMarkup(0)}</div><button id="add-question" class="button" type="button">Добавить вопрос</button></div><div class="actions field full"><button class="button primary" type="submit">${current ? 'Сохранить изменения' : 'Сохранить тест'}</button>${current ? '<button class="button" type="button" data-cancel-edit>Отмена</button>' : ''}</div></form></section><section class="surface"><h2>Тесты</h2>${table(['Название','Предмет','Минут','Доступ','Статус','Действие'],rows)}</section>`;
  }
  function videosView() {
    const current = editing('videos');
    const rows = list(state.overview?.videos).map(v => [esc(v.title),esc(val(v,'subject')),`<a href="${esc(safeUrl(v.url))}" target="_blank" rel="noopener noreferrer">Открыть</a>`,`<span class="pill ${v.published ? 'good' : ''}">${v.published ? 'Опубликовано' : 'Скрыто'}</span>`,`<button type="button" class="button tiny" data-edit="videos" data-id="${esc(v.id)}">Изменить</button> <button type="button" class="button tiny" data-toggle-video="${esc(v.id)}" data-published="${v.published ? '1' : '0'}">${v.published ? 'Скрыть' : 'Опубликовать'}</button>`]);
    return `<section class="surface" id="edit-form"><h2>${current ? 'Изменить видеоурок' : 'Добавить видеоурок'}</h2><form id="video-form" class="form-grid"><label class="field">Название<input name="title" value="${esc(current?.title ?? '')}" required></label><label class="field">Предмет<input name="subject" value="${esc(current?.subject ?? '')}" required></label><label class="field full">Ссылка на видео<input name="url" type="url" value="${esc(current?.url ?? '')}" placeholder="https://…" required></label><label class="check field full"><input name="published" type="checkbox" ${current?.published ? 'checked' : ''}> Опубликовать</label><div class="actions field full"><button class="button primary" type="submit">${current ? 'Сохранить изменения' : 'Добавить видео'}</button>${current ? '<button class="button" type="button" data-cancel-edit>Отмена</button>' : ''}</div></form></section><section class="surface"><h2>Видеоуроки</h2>${table(['Название','Предмет','Ссылка','Статус','Действие'],rows)}</section>`;
  }
  function safeUrl(value) { try { const url = new URL(value); return ['http:','https:'].includes(url.protocol) ? url.href : '#'; } catch { return '#'; } }
  function teacherView() {
    return `<section class="surface"><h2>Ученики на занятиях</h2><div class="teacher-students">${state.students.length ? state.students.map(s => `<article class="student-card"><div class="student-card-header"><div><h3>${esc(s.name)}</h3><p>${esc(val(s,'course'))} · ${esc(val(s,'schedule'))}</p></div><button type="button" class="button tiny" data-history="${esc(s.id)}">История посещений</button></div><form class="attendance-form form-grid" data-student-id="${esc(s.id)}"><label class="field">Дата занятия<input name="date" type="date" value="${localDate()}" required></label><label class="field">Посещение<select name="present"><option value="true">Присутствовал</option><option value="false">Отсутствовал</option></select></label><label class="field full">Комментарий<textarea name="comment" placeholder="Что изучали, домашнее задание или причина отсутствия"></textarea></label><div class="actions field full"><button type="submit" class="button primary">Сохранить</button></div></form><div id="history-${esc(s.id)}" class="attendance-list"></div></article>`).join('') : '<p class="empty">Назначенных учеников пока нет.</p>'}</div></section>`;
  }
  function bindForm(id, submitFn, success) {
    const form = document.getElementById(id); if (!form) return;
    form.addEventListener('submit', async event => { event.preventDefault(); const button = form.querySelector('[type=submit]'); button.disabled = true; status('Сохраняем…'); try { await submitFn(form); await refresh(); state.edit = null; render(); status(success, 'success'); } catch (error) { status(error.message, 'error'); } finally { button.disabled = false; } });
  }
  function bind() {
    bindForm('student-form', form => { const data = jsonForm(form); data.teacher_id = Number(data.teacher_id); data.parent_id = data.parent_id ? Number(data.parent_id) : null; return state.edit?.kind === 'students' ? patch(`/admin/students/${encodeURIComponent(state.edit.id)}`, data) : post('/admin/students', data); }, state.edit?.kind === 'students' ? 'Ученик обновлён.' : 'Ученик добавлен.');
    document.getElementById('teacher-form')?.addEventListener('submit', async event => { event.preventDefault(); const form = event.currentTarget, button = form.querySelector('[type=submit]'), data = jsonForm(form); button.disabled = true; status('Создаём преподавателя…'); try { const result = await post('/admin/teachers', data); const password = result.password || data.password; await refresh(); render(); document.getElementById('teacher-secret').innerHTML = `<div class="secret"><strong>Временный пароль для ${esc(data.name)}</strong><code>${esc(password)}</code><span>Сохраните его сейчас: после перехода в другой раздел он исчезнет.</span></div>`; status('Преподаватель создан.', 'success'); } catch (error) { status(error.message, 'error'); button.disabled = false; } });
    bindForm('video-form', form => { const data = jsonForm(form); data.published = form.elements.published.checked; if (!safeUrl(data.url).startsWith('https://')) throw new Error('Нужна HTTPS-ссылка на видео.'); return state.edit?.kind === 'videos' ? patch(`/admin/videos/${encodeURIComponent(state.edit.id)}`, data) : post('/admin/videos', data); }, state.edit?.kind === 'videos' ? 'Видеоурок обновлён.' : 'Видеоурок добавлен.');
    bindForm('test-form', form => { const data = jsonForm(form); const questions = [...form.querySelectorAll('[data-question]')].map(q => ({ question: q.querySelector('[data-question-text]').value.trim(), options: [...q.querySelectorAll('[data-option]')].map(input => input.value.trim()), correct: Number(q.querySelector('[data-correct]').value) })); if (!questions.length) throw new Error('Добавьте хотя бы один вопрос.'); const body = { title:data.title, subject:data.subject, duration_minutes:Number(data.duration_minutes), published:form.elements.published.checked, is_paid:form.elements.is_paid.checked, questions }; return state.edit?.kind === 'tests' ? patch(`/admin/tests/${encodeURIComponent(state.edit.id)}`, body) : post('/admin/tests', body); }, state.edit?.kind === 'tests' ? 'Тест обновлён.' : 'Тест сохранён.');
    document.querySelectorAll('[data-edit]').forEach(el => el.addEventListener('click', () => { state.edit = { kind:el.dataset.edit, id:el.dataset.id }; render(); document.getElementById('edit-form')?.scrollIntoView({ behavior:'smooth', block:'start' }); }));
    document.querySelector('[data-cancel-edit]')?.addEventListener('click', () => { state.edit = null; render(); });
    document.querySelectorAll('[data-archive-student]').forEach(el => el.addEventListener('click', async () => { el.disabled = true; status('Обновляем статус ученика…'); try { await patch(`/admin/students/${encodeURIComponent(el.dataset.archiveStudent)}`, { active:el.dataset.active !== '1' }); await refresh(); state.edit = null; render(); status(el.dataset.active === '1' ? 'Ученик отправлен в архив.' : 'Ученик восстановлен.', 'success'); } catch (error) { status(error.message, 'error'); el.disabled = false; } }));
    document.getElementById('add-question')?.addEventListener('click', () => { const box = document.getElementById('questions'); box.insertAdjacentHTML('beforeend', questionMarkup(box.children.length)); });
    document.getElementById('questions')?.addEventListener('click', event => { if (!event.target.matches('[data-remove-question]')) return; const box = document.getElementById('questions'); if (box.children.length === 1) { status('В тесте нужен хотя бы один вопрос.', 'error'); return; } event.target.closest('[data-question]').remove(); [...box.children].forEach((q, i) => q.querySelector('h3').textContent = `Вопрос ${i+1}`); });
    document.querySelectorAll('[data-toggle-test]').forEach(el => el.addEventListener('click', () => toggle(el, 'tests')));
    document.querySelectorAll('[data-toggle-video]').forEach(el => el.addEventListener('click', () => toggle(el, 'videos')));
    document.querySelectorAll('.attendance-form').forEach(form => form.addEventListener('submit', async event => { event.preventDefault(); const button = form.querySelector('button'); button.disabled = true; status('Сохраняем посещение…'); try { const data = jsonForm(form); await post('/teacher/attendance', { student_id:Number(form.dataset.studentId), date:data.date, present:data.present === 'true', comment:data.comment.trim() }); status('Посещение сохранено.', 'success'); await history(form.dataset.studentId); } catch (error) { status(error.message, 'error'); } finally { button.disabled = false; } }));
    document.querySelectorAll('[data-history]').forEach(el => el.addEventListener('click', () => history(el.dataset.history)));
  }
  async function toggle(el, kind) { el.disabled = true; status('Обновляем…'); try { await patch(`/admin/${kind}/${encodeURIComponent(el.dataset[`toggle${kind === 'tests' ? 'Test' : 'Video'}`])}`, { published:el.dataset.published !== '1' }); await refresh(); render(); status('Статус обновлён.', 'success'); } catch (error) { status(error.message, 'error'); el.disabled = false; } }
  async function history(id) {
    const target = document.getElementById(`history-${id}`); if (!target) return; target.innerHTML = '<p class="muted">Загрузка истории…</p>';
    try { const data = await api(`/teacher/attendance?student_id=${encodeURIComponent(id)}`); const records = list(data.attendance); target.innerHTML = records.length ? `<ul class="attendance-list">${records.map(a => `<li><strong>${esc(dateText(a.date))}</strong> · ${a.present ? 'Присутствовал' : 'Отсутствовал'}${a.comment ? ` · ${esc(a.comment)}` : ''}</li>`).join('')}</ul>` : '<p class="empty">Записей о посещении пока нет.</p>'; }
    catch (error) { target.textContent = error.message; }
  }
  loadMe().catch(error => login(['Войдите в кабинет.','Требуется вход'].includes(error.message) ? '' : error.message));
})();
