const courses = [
  { id: 'english', title: 'Английский язык', icon: '🇬🇧', tint: 'flag', price: 'от 3 500 сом', desc: 'Разговорная практика, грамматика и уверенное общение на английском.' },
  { id: 'math', title: 'Математика', icon: '∑', tint: 'math', price: 'от 3 500 сом', desc: 'Понятные объяснения, практика и подготовка к контрольным.' },
  { id: 'russian', title: 'Русский язык', icon: '🇷🇺', tint: 'flag', price: 'от 3 500 сом', desc: 'Грамотная речь, письмо и подготовка к экзаменам.' },
  { id: 'science', title: 'Физика, химия и т. д.', icon: '⚛', tint: 'science', price: 'от 3 500 сом', desc: 'Естественные науки через опыты и задачи из жизни.' },
  { id: 'exam', title: 'Подготовка к ОРТ и НЦТ', icon: '✎', tint: 'exam', price: 'от 4 000 сом', desc: 'Системная подготовка и тренировочные тесты.' },
  { id: 'roblox', title: 'Roblox', icon: '◈', tint: 'roblox', price: 'от 3 500 сом', desc: 'Первые шаги в разработке собственных игровых миров.' },
  { id: 'minecraft', title: 'Minecraft', icon: '▣', tint: 'minecraft', price: 'от 3 500 сом', desc: 'Программирование и творчество в знакомой игровой среде.' },
  { id: 'codecombat', title: 'CodeCombat', icon: '⚔', tint: 'code', price: 'от 3 500 сом', desc: 'Основы кода в формате захватывающих приключений.' },
  { id: 'scratch', title: 'Scratch', icon: '🐱', tint: 'scratch', price: 'от 3 500 сом', desc: 'Создание анимаций и игр с помощью визуального кода.' },
];

const benefits = [
  ['Опытные преподаватели', 'Занятия с преподавателями практиками и игровыми механиками увлекают детей. После наших курсов успеваемость по школьным предметам тоже повышается!', '👩‍🏫'],
  ['Уникальная методика обучения', 'Изучаем креативно и создаём. Показываем, как строится работа в реальной жизни.', '🧠'],
  ['Быстрые результаты в обучении', 'Новые навыки и уверенность в себе становятся заметны уже после первых занятий.', '🚀'],
  ['Индивидуальный подход к каждому ученику', 'Для тех, кому нужен индивидуальный подход, максимум концентрации на учебном процессе и получаемых навыках.', '🎯'],
  ['Все виды и формы занятий', 'Есть перерывы, время для знакомства и общения с другими учениками. Время занятий можно согласовать заранее.', '📚'],
];

const lessons = [
  { title: 'Первые слова на английском', subject: 'Английский язык', icon: '🇬🇧', duration: '12:24' },
  { title: 'Дроби — это просто', subject: 'Математика', icon: '∑', duration: '18:06' },
  { title: 'Секреты русского языка', subject: 'Русский язык', icon: '🇷🇺', duration: '14:35' },
  { title: 'Как устроен атом', subject: 'Физика', icon: '⚛', duration: '10:18' },
  { title: 'Создаём первую игру', subject: 'Scratch', icon: '🐱', duration: '16:42' },
  { title: 'Основы программирования', subject: 'CodeCombat', icon: '⌘', duration: '21:03' },
];

const teachers = [
  { name: 'Преподаватель английского', subject: 'Английский язык', badge: 'EN', color: 'pink' },
  { name: 'Преподаватель математики', subject: 'Математика', badge: '∑', color: 'mint' },
  { name: 'Преподаватель русского', subject: 'Русский язык', badge: 'RU', color: 'peach' },
  { name: 'Преподаватель физики', subject: 'Физика', badge: '⚛', color: 'lavender' },
];

const quiz = [
  { question: 'Чему равно 12 × 8?', options: ['84', '96', '108', '112'], correct: 1 },
  { question: 'Сколько градусов в прямом угле?', options: ['45°', '90°', '120°', '180°'], correct: 1 },
  { question: 'Чему равна половина числа 3/4?', options: ['1/4', '3/8', '1/2', '2/3'], correct: 1 },
];

const state = { slide: 0, searchNotice: false, quizIndex: 0, quizAnswers: [], quizDeadline: null, quizExpired: false, quizResult: null, activeTest: null, attemptToken: null, testError: '', publishedTests: [], publishedVideos: [], user: null, myStudents: [], modal: null, menuOpen: false };
const app = document.querySelector('#app');
const staticPreview = location.hostname.endsWith('.github.io');
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
async function api(path, options = {}) { if (staticPreview) throw new Error('Это предпросмотр. Вход, заявки и база данных работают только на сервере.'); const response = await fetch(path, {credentials:'same-origin',headers:{'Content-Type':'application/json'},...options}); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Ошибка запроса'); return data; }
async function refreshData() { try { state.user = (await api('/api/me')).user; } catch { state.user = null; } try { state.publishedTests = (await api('/api/tests')).tests; } catch { state.publishedTests = []; } try { state.publishedVideos = (await api('/api/videos')).videos; } catch { state.publishedVideos = []; } if (state.user?.role === 'parent') { try { state.myStudents = (await api('/api/my/students')).students; } catch { state.myStudents = []; } } render(); }

function logo() {
  return `<a class="logo" href="#/" aria-label="Прогресс — главная"><svg viewBox="0 0 58 48" aria-hidden="true"><path d="M2 15 29 3l27 12-27 12L2 15Z" fill="currentColor"/><path d="M11 23v13c11 8 25 8 36 0V23L29 32 11 23Z" fill="currentColor"/><path d="M52 19v15" stroke="currentColor" stroke-width="3"/><circle cx="52" cy="37" r="3" fill="currentColor"/></svg><span><small>образовательный центр</small><strong>ПРОГРЕСС</strong></span></a>`;
}

function header(route) {
  const nav = [['/', 'Главная'], ['/about', 'О нас'], ['/courses', 'Наши курсы'], ['/tests', 'Онлайн тестирование'], ['/videos', 'Видеоуроки'], ['/teachers', 'Поиск учеников']];
  const access = state.user ? `<a class="button yellow" href="${state.user.role === 'parent' ? '#/teachers' : '/admin.html'}">${state.user.role === 'parent' ? 'Мои дети' : 'Кабинет'}</a><button class="button light" type="button" data-action="logout">Выйти</button>` : '<button class="button yellow" type="button" data-action="login">Войти</button>';
  return `<header class="site-header">${staticPreview ? '<div class="preview-banner">Предпросмотр сайта · вход, заявки и база данных доступны только на сервере</div>' : ''}<div class="topline"><div class="shell top-inner"><span>⌖ &nbsp;9-й Микрорайон, Суеркулова 10Б</span><a href="tel:+996504245552">♧ &nbsp;+996 (504) 245 552</a><a href="mailto:progress.kg2@gmail.com">✉ &nbsp;progress.kg2@gmail.com</a></div></div><div class="shell nav-inner">${logo()}<button class="menu-toggle" type="button" aria-label="${state.menuOpen ? 'Закрыть меню' : 'Открыть меню'}" aria-expanded="${state.menuOpen}" data-action="menu">☰</button><nav class="main-nav ${state.menuOpen ? 'is-open' : ''}" aria-label="Основная навигация">${nav.map(([url, label]) => `<a href="#${url}" class="${route === url ? 'active' : ''}">${label}</a>`).join('')}<span class="nav-mobile-login">${access}</span></nav><span class="nav-login">${access}</span></div></header>`;
}

function footer() {
  const mapUrl = `https://2gis.kg/bishkek/search/${encodeURIComponent('Суеркулова 10Б')}`;
  return `<footer class="site-footer"><div class="shell"><div class="footer-brand">${logo()}</div><div class="footer-grid"><div><h3>ГЛАВНАЯ</h3><a href="#/about">О нас</a><a href="#/courses">Наши курсы</a><a href="#/tests">Онлайн тестирование</a><a href="#/teachers">Поиск учеников</a></div><a class="map-card" href="${mapUrl}" target="_blank" rel="noreferrer" aria-label="Найти адрес центра в 2ГИС"><div class="map-lines"></div><span class="map-pin">⌖</span><span class="map-label">Прогресс<br/>9-й Микрорайон</span></a><div><h3>КОНТАКТЫ</h3><p>Номер телефона:<br/><a href="tel:+996504245552">+996 (504) 245 552</a></p><p>E-mail:<br/><a href="mailto:progress.kg2@gmail.com">progress.kg2@gmail.com</a></p><p>Адрес:<br/>9-й Микрорайон,<br/>Суеркулова 10Б</p></div></div><div class="socials"><span aria-hidden="true" title="Instagram">◎</span><span aria-hidden="true" title="Telegram">➤</span><a href="https://wa.me/996504245552" aria-label="WhatsApp" target="_blank" rel="noreferrer">◉</a></div></div></footer>`;
}

function sectionHeading(title, subtitle = '') { return `<div class="section-heading"><h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ''}</div>`; }
function iconMarkup(icon) { if (icon === '🇬🇧') return '<img class="flag-icon" src="./assets/uk.svg" alt="" />'; if (icon === '🇷🇺') return '<img class="flag-icon" src="./assets/ru.svg" alt="" />'; return icon; }

function home() {
  const slides = [
    { eyebrow: 'ОТКРЫТ НОВЫЙ НАБОР', title: 'Английский язык для детей', text: 'Учимся говорить уверенно и с удовольствием', icon: '✦' },
    { eyebrow: 'УЧИТЬСЯ ИНТЕРЕСНО', title: 'Знания, которые вдохновляют', text: 'Маленькие шаги к большим достижениям', icon: '✧' },
    { eyebrow: 'ПЕРВЫЙ ШАГ', title: 'Попробуйте бесплатно', text: 'Познакомьтесь с нашей методикой на пробном уроке', icon: '✷' },
  ];
  const slide = slides[state.slide];
  return `<main><section class="hero"><div class="shell hero-inner"><div class="hero-orbit hero-orbit-one"></div><div class="hero-orbit hero-orbit-two"></div><div class="hero-copy"><p class="hero-kicker">ОБРАЗОВАТЕЛЬНЫЙ ЦЕНТР ПРОГРЕСС</p><h1>ИЗУЧАЙ НОВЫЕ<br/>НАВЫКИ СЕЙЧАС</h1><p class="hero-lead">Мы предлагаем курсы для всех уровней, от начинающих до продвинутых. Групповые и индивидуальные занятия с опытными преподавателями помогут вам достичь желаемого результата.</p><button class="button yellow hero-cta" type="button" data-action="signup">Записаться на курс <span aria-hidden="true">↗</span></button></div><img class="hero-art" src="./assets/hero-education.png" alt="Ученик за занятиями в окружении учебных предметов" /><div class="feature-slider"><button class="slider-arrow" type="button" data-action="prev-slide" aria-label="Предыдущий слайд">‹</button><div class="slide-card"><span>${slide.eyebrow}</span><strong>${slide.title}</strong><p>${slide.text}</p><b aria-hidden="true">${slide.icon}</b></div><button class="slider-arrow" type="button" data-action="next-slide" aria-label="Следующий слайд">›</button></div></div></section><section class="benefits section-pad"><div class="shell">${sectionHeading('КТО МЫ И ПОЧЕМУ ВЫБИРАЮТ НАС?', 'Мы научим вашего ребёнка любить и получать удовольствие от учёбы!')}<div class="benefit-grid">${benefits.map(([title, text, icon]) => `<article class="benefit-card"><h3>${title}</h3><p>${text}</p><div class="benefit-art" aria-hidden="true">${icon}</div></article>`).join('')}<article class="benefit-card free-card"><h3>Бесплатный урок!</h3><p>Запишитесь на пробное занятие прямо сейчас и получите это</p><div class="free-ribbon">Б Е С П Л А Т Н О</div><button class="button light" type="button" data-action="signup">Записаться на пробный урок</button></article></div></div></section><section class="reviews section-pad"><div class="shell">${sectionHeading('ОТЗЫВЫ', 'Узнайте, что говорят о нас ученики и их родители')}<div class="review-grid"><blockquote>«У нас твёрдая пятёрка! Спасибо огромное за ваши уроки. Всё доступно и легко, дочка с удовольствием усвоила математику.»<cite>Мама Карины</cite></blockquote></div></div></section><section class="partners section-pad"><div class="shell">${sectionHeading('НАШИ ПАРТНЁРЫ')}<div class="partner-grid"><div>КНУ<br/><b>им. Ж. Баласагына</b></div><div>THE<br/><b>STORY</b></div><div>PERSPECTIVE<br/><b>TRAVEL</b></div></div></div></section></main>`;
}

function about() {
  return `<main><section class="about-intro section-pad blue-section"><div class="shell narrow">${sectionHeading('О НАС')}<p>Учебный центр «Прогресс» — это команда людей, влюблённых в образование и детей. Мы предоставляем курсы по разным направлениям и доступным ценам, чтобы удовлетворить ваши потребности. Мы хотим, чтобы обучение было интересным и эффективным, а каждый ребёнок раскрывал свои способности.</p><h2>НАША МИССИЯ</h2><p>Миссия нашего образовательного центра — вдохновлять возрастающее поколение учиться. Мы стремимся превратить утрату интереса к обучению в увлечение, помочь каждому ребёнку поверить в свои силы и достигать поставленных целей. Наш коллектив преподавателей создаёт условия, в которых дети растут и стремятся к постоянному личностному и интеллектуальному развитию.</p></div></section><section class="team section-pad"><div class="shell">${sectionHeading('НАША КОМАНДА', 'Более 50 человек упорно трудятся изо дня в день, чтобы все процессы обучения не останавливались ни на минуту!')}<div class="team-grid">${teachers.map(t => `<article class="teacher-card"><div class="avatar ${t.color}">${t.badge}</div><h3>${t.name}</h3><p>Преподаватель: ${t.subject}</p></article>`).join('')}</div></div></section></main>`;
}

function courseCard(c) { return `<article class="course-card"><div class="course-visual ${c.tint}" aria-hidden="true"><span>${iconMarkup(c.icon)}</span></div><h3>${c.title}</h3><p>${c.price}</p><button class="button yellow" type="button" data-course="${c.id}">Подробнее</button></article>`; }
function coursesPage() { return `<main><section class="courses-section section-pad blue-section"><div class="shell">${sectionHeading('САМЫЕ ВОСТРЕБОВАННЫЕ КУРСЫ<br/>В КЫРГЫЗСТАНЕ', 'Мы постоянно исследуем запросы и поиски новых возможностей, поддерживая интересы учеников')}<div class="course-grid">${courses.map(courseCard).join('')}</div></div></section><section class="stats section-pad"><div class="shell stats-grid"><div><h2>ПОЧЕМУ ВЫБИРАЮТ<br/>ОБРАЗОВАТЕЛЬНЫЙ ЦЕНТР <b>ПРОГРЕСС</b></h2><div class="stats-cards"><div><b>#1</b><span>Развиваем любовь к обучению</span></div><div><b>500+</b><span>Учеников доверили нам своё обучение</span></div><div><b>24/7</b><span>Учитесь в собственном графике</span></div><div class="yellow-stat"><b>96 %</b><span>Достигают своих целей</span></div></div></div><div class="stats-person" aria-hidden="true"><span>🎓</span></div></div></section></main>`; }

function videosPage() { const published = state.publishedVideos.map(v => `<a class="lesson-card" href="${escapeHtml(v.url)}" target="_blank" rel="noopener noreferrer"><div class="lesson-thumb"><span>▶</span></div><strong>${escapeHtml(v.title)}</strong><span>${escapeHtml(v.subject)}</span></a>`).join(''); return `<main><section class="video-hero section-pad blue-section"><div class="shell">${sectionHeading('ВИДЕОУРОКИ', state.publishedVideos.length ? 'Уроки от преподавателей центра' : 'Видео будут опубликованы здесь после добавления администратором')}<div class="video-feature"><div class="video-screen"><span>▶</span></div><div><h3>Учиться можно легко и интересно</h3><p>Смотрите уроки по интересующим вас предметам.</p><button type="button" class="button yellow" data-action="scroll-lessons">К каталогу уроков</button></div></div></div></section><section class="section-pad" id="video-list"><div class="shell">${sectionHeading('БИБЛИОТЕКА УРОКОВ')}<div class="lesson-grid">${published || lessons.map((l,i) => `<button class="lesson-card" type="button" data-lesson="${i}"><div class="lesson-thumb"><span>${iconMarkup(l.icon)}</span><i>▶</i><small>Скоро</small></div><strong>${l.title}</strong><span>${l.subject}</span></button>`).join('')}</div></div></section></main>`; }

function searchPage() { const parent = state.user?.role === 'parent'; return `<main><section class="search-section section-pad"><div class="shell">${sectionHeading('МОИ УЧЕНИКИ', 'Данные детей доступны только после входа родителя и привязки администратором')}<div class="parent-cards">${parent ? (state.myStudents.length ? state.myStudents.map(s => `<article class="student-preview"><h3>${escapeHtml(s.name)}</h3><div class="student-fields">${[['Преподаватель',s.teacher_name],['Курс',s.course],['Тип обучения',s.type],['Расписание',s.schedule],['Стоимость',s.cost],['Оплата',s.payment]].map(([label,value])=>`<div><span>${label}</span><strong>${escapeHtml(value || '—')}</strong></div>`).join('')}</div><h4>Посещаемость и комментарии</h4>${s.attendance.length ? s.attendance.map(a=>`<p>${escapeHtml(a.date)} — ${a.present ? 'Пришёл' : 'Не пришёл'}${a.comment ? ': '+escapeHtml(a.comment) : ''}</p>`).join('') : '<p>Записей пока нет.</p>'}</article>`).join('') : '<p class="student-empty">Пока нет привязанных учеников. Обратитесь к администратору центра.</p>') : '<div class="student-preview"><h3>Вход для родителей</h3><p>Войдите, чтобы увидеть информацию только о своём ребёнке.</p><button class="button yellow" type="button" data-action="login">Войти</button></div>'}</div></div></section></main>`; }

function testsPage() {
  if (!state.quizDeadline) state.quizDeadline = Date.now() + 5 * 60 * 1000;
  const currentQuiz = state.activeTest?.questions || quiz;
  const q = currentQuiz[state.quizIndex];
  const answer = state.quizAnswers[state.quizIndex];
  const done = state.quizIndex >= currentQuiz.length;
  const correct = state.activeTest ? state.quizResult?.correct ?? '…' : state.quizAnswers.filter((a, i) => a === quiz[i].correct).length;
  const subjects = [['Математика', 'Бесплатный · демо', true], ['Английский язык', 'Определение уровня · скоро', false], ['ОРТ / ЖРТ', 'Платный · скоро', false], ['Русский язык', 'Скоро', false], ['Физика', 'Скоро', false], ['Химия', 'Скоро', false]];
  return `<main><section class="test-section section-pad blue-section"><div class="shell">${sectionHeading('ОНЛАЙН ТЕСТИРОВАНИЕ', 'Проверьте свои знания в удобном формате')}<p class="test-error" role="status">${escapeHtml(state.testError)}</p><div class="test-subjects">${state.publishedTests.map(t=>`<button class="test-subject ${state.activeTest?.id === t.id ? 'active' : ''}" type="button" data-start-test="${t.id}" ${t.is_paid ? 'disabled title="Оплата будет подключена позже"' : ''}><strong>${escapeHtml(t.title)}</strong><span>${escapeHtml(t.subject)} · ${t.question_count} вопросов · ${t.duration_minutes} мин${t.is_paid ? ' · платный, скоро' : ''}</span></button>`).join('')}${subjects.map(([title,label,active])=>`<div class="test-subject ${!state.activeTest && active?'active':''}"><strong>${title}</strong><span>${label}</span></div>`).join('')}</div><div class="test-layout"><aside class="test-aside"><h3>Онлайн тест</h3><p>${escapeHtml(state.activeTest?.title || 'Пробный тест по математике')}</p><p class="timer-label">Осталось времени: <b id="quiz-timer">${done ? '00:00' : formatTime(Math.ceil((state.quizDeadline-Date.now())/1000))}</b></p><div class="test-count">${currentQuiz.map((_,i)=>`<span class="${i===state.quizIndex?'current':''} ${state.quizAnswers[i]!==undefined?'answered':''}">${i+1}</span>`).join('')}</div><p>Результат появится сразу после завершения.</p></aside><div class="quiz-card">${done ? `<div class="quiz-done"><div class="quiz-trophy">★</div><h3>${state.quizExpired ? 'Время вышло' : 'Тест завершён!'}</h3><p>Правильных: <strong>${correct}</strong> · Неправильных и без ответа: <strong>${state.activeTest ? state.quizResult?.incorrect ?? '…' : currentQuiz.length-correct}</strong></p><button class="button yellow" data-action="restart-test">Пройти ещё раз</button></div>` : `<div class="quiz-progress">Вопрос ${state.quizIndex+1} из ${currentQuiz.length}</div><h3>${escapeHtml(q.question)}</h3><div class="quiz-options">${q.options.map((o,i)=>`<button type="button" data-answer="${i}" class="${answer===i?'selected':''}" aria-pressed="${answer===i}"><span>${String.fromCharCode(65+i)}</span>${escapeHtml(o)}</button>`).join('')}</div><button class="button yellow" type="button" data-action="next-question" ${answer===undefined?'disabled':''}>${state.quizIndex===currentQuiz.length-1?'Завершить':'Следующий вопрос'} →</button>`}</div></div></div></section></main>`;
}
function formatTime(seconds) { const safe = Math.max(0,seconds); return `${String(Math.floor(safe/60)).padStart(2,'0')}:${String(safe%60).padStart(2,'0')}`; }
async function startPublished(test) { try { const attempt = await api(`/api/tests/${test.id}/start`,{method:'POST',body:'{}'}); state.activeTest = test; state.attemptToken = attempt.attempt_token; state.quizIndex = 0; state.quizAnswers = []; state.quizResult = null; state.quizExpired = false; state.quizDeadline = attempt.expires_at; state.testError = ''; } catch (error) { state.testError = error.message; } render(); }
async function finishQuiz() { if (!state.activeTest) return; try { state.quizResult = await api(`/api/tests/${state.activeTest.id}/submit`, {method:'POST',body:JSON.stringify({attempt_token:state.attemptToken,answers:state.activeTest.questions.map((_,i)=>state.quizAnswers[i] ?? -1)})}); } catch (error) { state.quizResult = {correct:'—',incorrect:'—'}; state.testError = error.message; } render(); }

function modal() {
  if (!state.modal) return '';
  let content = '';
  if (state.modal.type === 'course') {
    const c = courses.find(x => x.id === state.modal.id);
    content = `<div class="modal-icon ${c.tint}">${iconMarkup(c.icon)}</div><h2>${c.title}</h2><p>${c.desc}</p><p class="modal-price">${c.price}</p><button class="button yellow" type="button" data-action="signup" data-selected-course="${c.id}">Записаться</button>`;
  } else if (state.modal.type === 'lesson') {
    const l = lessons[state.modal.id];
    content = `<div class="modal-video">${iconMarkup(l.icon)}<span>▶</span></div><h2>${l.title}</h2><p>Направление: ${l.subject}</p><p>Видеоматериалы будут подключены позже.</p>`;
  } else if (state.modal.type === 'signup') {
    const selected = state.modal.course || '';
    content = `<h2>Запись на курс</h2><p>Заявка появится у администратора центра.</p><form class="modal-form" id="signup-form"><label>ФИО<input type="text" name="name" placeholder="Ваше имя" required /></label><label>Номер телефона<input type="tel" name="phone" placeholder="+996" required /></label><label>Что вас интересует?<select name="interest" required><option value="">Выберите курс</option>${courses.map(c => `<option value="${escapeHtml(c.title)}" ${c.id === selected ? 'selected' : ''}>${escapeHtml(c.title)}</option>`).join('')}</select></label><button class="button yellow" type="submit">Оставить заявку</button><p class="form-status" role="status"></p></form>`;
  } else if (state.modal.type === 'register') {
    content = `<h2>Создать учётную запись</h2><p>Регистрация для родителей. Преподавателей добавляет администратор.</p><form class="modal-form" id="register-form"><label>ФИО<input type="text" name="name" required /></label><label>Логин<input type="text" name="login" autocomplete="username" required minlength="3" /></label><label>Телефон<input type="tel" name="phone" /></label><label>Пароль (от 10 символов)<input type="password" name="password" autocomplete="new-password" required minlength="10" /></label><button class="button yellow" type="submit">Зарегистрироваться</button><p class="form-status" role="status"></p></form>`;
  } else {
    content = `<h2>Войти в личный кабинет</h2><form class="modal-form" id="login-form"><label>Логин<input type="text" name="login" autocomplete="username" required /></label><label>Пароль<input type="password" name="password" autocomplete="current-password" required /></label><button class="button yellow" type="submit">Войти</button><p class="form-status" role="status"></p></form><button class="text-button" type="button" data-action="register">Создать учётную запись</button>`;
  }
  return `<div class="modal-backdrop" data-action="close-modal"><div class="modal" role="dialog" aria-modal="true" aria-label="Информация"><button class="modal-close" type="button" aria-label="Закрыть" data-action="close-modal">×</button>${content}</div></div>`;
}

function notFound() { return `<main class="section-pad"><div class="shell not-found"><h1>Страница не найдена</h1><a class="button blue" href="#/">На главную</a></div></main>`; }
function render() { const route = location.hash.slice(1).split('?')[0] || '/'; const pages = { '/': home, '/about': about, '/courses': coursesPage, '/videos': videosPage, '/teachers': searchPage, '/tests': testsPage }; app.innerHTML = header(route) + (pages[route] || notFound)() + footer() + modal(); document.body.classList.toggle('modal-open', !!state.modal); app.querySelectorAll('header,main,footer').forEach(el => { el.inert = !!state.modal; }); if (state.modal) app.querySelector('.modal-close')?.focus(); }
function closeModal() { const previous = state.modal; state.modal = null; render(); let trigger; if (previous?.type === 'course') trigger = app.querySelector(`[data-course="${previous.id}"]`); if (previous?.type === 'lesson') trigger = app.querySelector(`[data-lesson="${previous.id}"]`); if (previous?.type === 'signup') trigger = previous.course ? app.querySelector(`[data-course="${previous.course}"]`) : app.querySelector('[data-action="signup"]'); if (previous?.type === 'login' || previous?.type === 'register') trigger = [...app.querySelectorAll('[data-action="login"]')].find(el => el.getClientRects().length); trigger?.focus(); }
function navigate() { state.menuOpen = false; state.modal = null; render(); window.scrollTo({top:0,behavior:'instant'}); }

window.addEventListener('hashchange', navigate);
document.addEventListener('click', async e => {
  const course = e.target.closest('[data-course]');
  const lesson = e.target.closest('[data-lesson]');
  const answer = e.target.closest('[data-answer]');
  const startTest = e.target.closest('[data-start-test]');
  const action = e.target.closest('[data-action]');
  if (action?.classList.contains('modal-backdrop') && e.target !== action) return;
  if (startTest) { await startPublished(state.publishedTests.find(t=>t.id === Number(startTest.dataset.startTest))); return; }
  else if (course) state.modal = { type: 'course', id: course.dataset.course };
  else if (lesson) state.modal = { type: 'lesson', id: Number(lesson.dataset.lesson) };
  else if (answer) state.quizAnswers[state.quizIndex] = Number(answer.dataset.answer);
  else if (action) {
    switch (action.dataset.action) {
      case 'menu': state.menuOpen = !state.menuOpen; break;
      case 'login': state.modal = { type: 'login' }; break;
      case 'logout': await api('/api/logout', {method:'POST',body:'{}'}); state.user = null; state.myStudents = []; break;
      case 'signup': state.modal = { type: 'signup', course: action.dataset.selectedCourse || '' }; break;
      case 'register': state.modal = { type: 'register' }; break;
      case 'close-modal': closeModal(); return;
      case 'prev-slide': state.slide = (state.slide + 2) % 3; break;
      case 'next-slide': state.slide = (state.slide + 1) % 3; break;
      case 'next-question': if (state.quizAnswers[state.quizIndex] !== undefined) { state.quizIndex++; if (state.activeTest && state.quizIndex === state.activeTest.questions.length) finishQuiz(); } break;
      case 'restart-test': if (state.activeTest) { await startPublished(state.activeTest); return; } state.quizIndex = 0; state.quizAnswers = []; state.quizResult = null; state.quizDeadline = Date.now() + 5 * 60 * 1000; state.quizExpired = false; break;
      case 'scroll-lessons': document.querySelector('#video-list')?.scrollIntoView({behavior:'smooth'}); return;
    }
  } else return;
  render();
});
document.addEventListener('submit', async e => {
  if (!['signup-form','login-form','register-form'].includes(e.target.id)) return;
  e.preventDefault(); const form = e.target, status = form.querySelector('[role="status"]'); const values = Object.fromEntries(new FormData(form));
  try {
    if (form.id === 'signup-form') { await api('/api/applications',{method:'POST',body:JSON.stringify(values)}); status.textContent = 'Заявка сохранена. С вами свяжутся.'; form.reset(); }
    else if (form.id === 'register-form') { await api('/api/register',{method:'POST',body:JSON.stringify(values)}); status.textContent = 'Аккаунт создан. Теперь войдите.'; form.reset(); }
    else { const result = await api('/api/login',{method:'POST',body:JSON.stringify(values)}); state.user = result.user; state.modal = null; await refreshData(); if (result.user.role !== 'parent') location.href = '/admin.html'; else location.hash = '#/teachers'; }
  } catch (error) { status.textContent = error.message; }
});
document.addEventListener('keydown', e => { if (!state.modal) return; if (e.key === 'Escape') { closeModal(); return; } if (e.key === 'Tab') { const focusable = [...app.querySelectorAll('.modal button,.modal a,.modal input,.modal select')].filter(el => el.getClientRects().length); const first = focusable[0], last = focusable.at(-1); if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } } });
render(); refreshData();
setInterval(() => { const count = state.activeTest?.questions.length || quiz.length; if (location.hash.slice(1) !== '/tests' || state.quizIndex >= count) return; const left = Math.ceil((state.quizDeadline - Date.now()) / 1000); const timer = document.querySelector('#quiz-timer'); if (timer) timer.textContent = formatTime(left); if (left <= 0) { state.quizExpired = true; state.quizIndex = count; finishQuiz(); render(); } }, 1000);
