(() => {
  'use strict';
  // This file is loaded only by admin-preview.html. It never contacts the live API.
  const today = new Date().toISOString().slice(0, 10);
  const users = [
    { id: 1, name: 'Демо администратор', login: 'demo-admin', phone: '—', role: 'admin', active: 1, created_at: today },
    { id: 2, name: 'Родитель 01', login: 'parent-01', phone: '+996 000 000 001', role: 'parent', active: 1, created_at: today },
    { id: 3, name: 'Преподаватель 01', login: 'teacher-01', phone: '—', role: 'teacher', active: 1, created_at: today },
    { id: 4, name: 'Родитель 02', login: 'parent-02', phone: '+996 000 000 002', role: 'parent', active: 1, created_at: today },
  ];
  const applications = [
    { id: 1, name: 'Заявка 01', phone: '+996 000 000 003', interest: 'Английский язык', created_at: today },
    { id: 2, name: 'Заявка 02', phone: '+996 000 000 004', interest: 'Математика', created_at: today },
  ];
  const students = [
    { id: 1, name: 'Ученик 01', teacher_id: 3, parent_id: 2, course: 'Английский язык', type: 'Группа', schedule: 'Пн, Ср · 16:00', cost: '4500', payment: 'Оплачено', active: 1 },
    { id: 2, name: 'Ученик 02', teacher_id: 3, parent_id: 4, course: 'Математика', type: 'Индивидуально', schedule: 'Вт, Чт · 15:00', cost: '6000', payment: 'Ожидается', active: 1 },
    { id: 3, name: 'Ученик 03', teacher_id: 3, parent_id: null, course: 'Английский язык', type: 'Группа', schedule: 'Пн, Ср · 16:00', cost: '4500', payment: 'Оплачено', active: 0 },
  ];
  const tests = [
    { id: 1, title: 'Английский: вводный тест', subject: 'Английский язык', duration_minutes: 30, published: 1, is_paid: 0, questions: [{ question: 'Как переводится «book»?', options: ['Книга', 'Ручка', 'Стол', 'Окно'], correct: 0 }] },
    { id: 2, title: 'Математика: основы', subject: 'Математика', duration_minutes: 20, published: 0, is_paid: 0, questions: [{ question: 'Сколько будет 2 + 2?', options: ['2', '3', '4', '5'], correct: 2 }] },
  ];
  const videos = [
    { id: 1, title: 'Знакомство с курсом', subject: 'Английский язык', url: 'https://example.com/demo-video', published: 1 },
    { id: 2, title: 'Первый урок', subject: 'Математика', url: 'https://example.com/demo-video', published: 0 },
  ];
  const attendance = [{ student_id: 1, date: today, present: true, comment: 'Демонстрационная запись посещения.' }];
  let role = 'admin';
  let nextId = 5;
  const currentUser = () => role === 'admin' ? users[0] : users[2];
  const teacherName = id => users.find(user => user.id === Number(id))?.name || '—';
  const decorateStudent = student => ({ ...student, teacher_name: teacherName(student.teacher_id), parent_name: teacherName(student.parent_id) });
  const find = (items, id) => {
    const item = items.find(entry => entry.id === Number(id));
    if (!item) throw new Error('Запись не найдена.');
    return item;
  };
  const request = async (path, options = {}) => {
    const method = options.method || 'GET';
    const data = options.body ? JSON.parse(options.body) : {};
    const url = new URL(path, location.origin);
    const route = url.pathname;
    if (method === 'GET' && route === '/me') return { user: currentUser() };
    if (method === 'GET' && route === '/admin/overview') return { users, applications, students: students.map(decorateStudent), teachers: users.filter(user => user.role === 'teacher'), tests, videos };
    if (method === 'GET' && route === '/teacher/students') return { students: students.filter(student => student.active && student.teacher_id === currentUser().id).map(decorateStudent) };
    if (method === 'GET' && route === '/teacher/attendance') return { attendance: attendance.filter(record => record.student_id === Number(url.searchParams.get('student_id'))).sort((a, b) => b.date.localeCompare(a.date)) };
    if (method === 'POST' && route === '/teacher/attendance') {
      const record = attendance.find(item => item.student_id === data.student_id && item.date === data.date);
      if (record) Object.assign(record, data); else attendance.push({ ...data });
      return { ok: true };
    }
    if (method === 'POST' && route === '/admin/teachers') {
      if (users.some(user => user.login === data.login)) throw new Error('Этот логин уже занят в демо.');
      const id = nextId++;
      users.push({ id, name: data.name, login: data.login, phone: '—', role: 'teacher', active: 1, created_at: today });
      return { id };
    }
    for (const [name, items] of [['students', students], ['tests', tests], ['videos', videos]]) {
      if (method === 'POST' && route === `/admin/${name}`) {
        const id = nextId++;
        items.unshift({ id, ...data, ...(name === 'students' ? { active: 1 } : {}) });
        return { id };
      }
      if (method === 'PATCH' && route.startsWith(`/admin/${name}/`)) {
        Object.assign(find(items, route.split('/').pop()), data);
        return { ok: true };
      }
    }
    throw new Error('Это действие недоступно в демо.');
  };
  window.ProgressDemoApi = { request, switchRole: () => { role = role === 'admin' ? 'teacher' : 'admin'; return currentUser(); } };
})();
