"""Local Progress web server with SQLite, role based access and JSON API."""
from __future__ import annotations

import argparse
from contextlib import contextmanager
import getpass
import hashlib
import hmac
import json
import mimetypes
import os
import secrets
import sqlite3
import sys
import time
from datetime import date
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
DB = Path(os.environ.get('PROGRESS_DB', ROOT / 'data' / 'progress.sqlite3'))
SESSION_AGE = 60 * 60 * 24 * 7
LOGIN_FAILURES: dict[str, list[float]] = {}


def connect():
    DB.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    db.execute('PRAGMA journal_mode=WAL')
    return db


@contextmanager
def db_session():
    db = connect()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def init_db():
    with db_session() as db:
        db.executescript('''
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY, name TEXT NOT NULL, login TEXT NOT NULL UNIQUE,
          phone TEXT, role TEXT NOT NULL CHECK(role IN ('admin','teacher','parent')),
          password_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
        );
        CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS applications (
          id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, interest TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS students (
          id INTEGER PRIMARY KEY, name TEXT NOT NULL,
          teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          parent_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          course TEXT NOT NULL DEFAULT '', type TEXT NOT NULL DEFAULT '',
          schedule TEXT NOT NULL DEFAULT '', cost TEXT NOT NULL DEFAULT '',
          payment TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS attendance (
          id INTEGER PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
          teacher_id INTEGER NOT NULL REFERENCES users(id), date TEXT NOT NULL,
          present INTEGER NOT NULL CHECK(present IN (0,1)), comment TEXT NOT NULL DEFAULT '',
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(student_id,date)
        );
        CREATE TABLE IF NOT EXISTS tests (
          id INTEGER PRIMARY KEY, title TEXT NOT NULL, subject TEXT NOT NULL,
          questions_json TEXT NOT NULL, duration_minutes INTEGER NOT NULL CHECK(duration_minutes BETWEEN 1 AND 180),
          published INTEGER NOT NULL DEFAULT 0 CHECK(published IN (0,1)),
          is_paid INTEGER NOT NULL DEFAULT 0 CHECK(is_paid IN (0,1)),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS test_attempts (
          token_hash TEXT PRIMARY KEY, test_id INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
          expires_at INTEGER NOT NULL, questions_json TEXT NOT NULL,
          completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1))
        );
        CREATE TABLE IF NOT EXISTS videos (
          id INTEGER PRIMARY KEY, title TEXT NOT NULL, subject TEXT NOT NULL, url TEXT NOT NULL,
          published INTEGER NOT NULL DEFAULT 0 CHECK(published IN (0,1)),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        ''')


def password_hash(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 310_000)
    return f'pbkdf2_sha256$310000${salt.hex()}${digest.hex()}'


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, iterations, salt, digest = stored.split('$')
        if algorithm != 'pbkdf2_sha256': return False
        actual = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), int(iterations))
        return hmac.compare_digest(actual, bytes.fromhex(digest))
    except (ValueError, TypeError):
        return False


def public_user(row):
    return {key: row[key] for key in ('id', 'name', 'login', 'phone', 'role', 'created_at', 'active')}


def rows(db, query, params=()):
    return [dict(row) for row in db.execute(query, params)]


class APIError(Exception):
    def __init__(self, status, message):
        self.status, self.message = status, message


def required_text(data, key, limit=200):
    value = data.get(key)
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise APIError(400, f'Некорректное поле: {key}')
    return value.strip()


def optional_text(data, key, limit=500):
    value = data.get(key, '')
    if not isinstance(value, str) or len(value) > limit:
        raise APIError(400, f'Некорректное поле: {key}')
    return value.strip()


def boolean(data, key, default=False):
    value = data.get(key, default)
    if not isinstance(value, bool): raise APIError(400, f'Некорректное поле: {key}')
    return int(value)


def positive_id(value):
    try:
        number = int(value)
        if number > 0: return number
    except (ValueError, TypeError): pass
    raise APIError(400, 'Некорректный идентификатор')


class Handler(BaseHTTPRequestHandler):
    server_version = 'Progress/1.0'

    def log_message(self, fmt, *args):
        sys.stderr.write('%s - %s\n' % (self.address_string(), fmt % args))

    def respond(self, status, payload, cookie=None):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Referrer-Policy', 'same-origin')
        if cookie: self.send_header('Set-Cookie', cookie)
        self.end_headers()
        self.wfile.write(body)

    def data(self):
        try: length = int(self.headers.get('Content-Length', '0'))
        except ValueError: raise APIError(400, 'Некорректный запрос')
        if length < 1 or length > 128_000: raise APIError(413, 'Недопустимый размер запроса')
        if self.headers.get('Content-Type', '').split(';')[0].strip() != 'application/json':
            raise APIError(415, 'Требуется JSON')
        try:
            data = json.loads(self.rfile.read(length))
            if isinstance(data, dict): return data
        except (ValueError, UnicodeDecodeError): pass
        raise APIError(400, 'Некорректный JSON')

    def user(self, db):
        cookie = SimpleCookie()
        try: cookie.load(self.headers.get('Cookie', ''))
        except Exception: return None
        morsel = cookie.get('progress_session')
        if not morsel: return None
        token_hash = hashlib.sha256(morsel.value.encode()).hexdigest()
        return db.execute('''SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id
          WHERE s.token_hash=? AND s.expires_at>? AND u.active=1''', (token_hash, int(time.time()))).fetchone()

    def require(self, user, role=None):
        if not user: raise APIError(401, 'Требуется вход')
        if role and user['role'] != role: raise APIError(403, 'Нет доступа')

    def check_origin(self):
        origin = self.headers.get('Origin')
        host = self.headers.get('Host', '')
        if origin not in (f'http://{host}', f'https://{host}'):
            raise APIError(403, 'Недопустимый источник запроса')

    def serve_file(self, path):
        if path == '/': path = '/index.html'
        safe = Path(path.lstrip('/'))
        if '..' in safe.parts or safe.parts[0].startswith('.') or safe.parts[0] == 'data':
            raise APIError(404, 'Не найдено')
        if safe.parts[0] not in ('assets', 'index.html', 'app.js', 'styles.css', 'admin.html', 'admin.js', 'admin.css'):
            raise APIError(404, 'Не найдено')
        file = ROOT / safe
        if not file.is_file(): raise APIError(404, 'Не найдено')
        body = file.read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', mimetypes.guess_type(file.name)[0] or 'application/octet-stream')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self): self.run('GET')
    def do_POST(self): self.run('POST')
    def do_PATCH(self): self.run('PATCH')

    def run(self, method):
        parsed = urlparse(self.path)
        try:
            if method == 'GET' and not parsed.path.startswith('/api/'):
                return self.serve_file(parsed.path)
            if method != 'GET': self.check_origin()
            with db_session() as db:
                result = self.api(db, method, parsed.path, parse_qs(parsed.query))
                if result is not None:
                    status, payload, cookie = result
                    self.respond(status, payload, cookie)
        except APIError as exc: self.respond(exc.status, {'error': exc.message})
        except sqlite3.IntegrityError as exc:
            self.respond(409, {'error': 'Запись уже существует или указана неверная связь'})
        except Exception as exc:
            self.log_error('Unexpected server error: %s', exc)
            self.respond(500, {'error': 'Ошибка сервера'})

    def api(self, db, method, path, query):
        user = self.user(db)
        if method == 'POST' and path == '/api/register':
            data = self.data()
            name, login = required_text(data, 'name'), required_text(data, 'login', 80).lower()
            phone = optional_text(data, 'phone', 40)
            password = required_text(data, 'password', 200)
            if len(password) < 10: raise APIError(400, 'Пароль должен содержать не менее 10 символов')
            if len(login) < 3: raise APIError(400, 'Логин слишком короткий')
            db.execute('INSERT INTO users(name,login,phone,role,password_hash) VALUES(?,?,?,?,?)',
                       (name, login, phone, 'parent', password_hash(password)))
            db.commit()
            return 201, {'ok': True}, None
        if method == 'POST' and path == '/api/applications':
            data = self.data()
            db.execute('INSERT INTO applications(name,phone,interest) VALUES(?,?,?)',
                       (required_text(data, 'name'), required_text(data, 'phone', 40), required_text(data, 'interest')))
            db.commit()
            return 201, {'ok': True}, None
        if method == 'POST' and path == '/api/login':
            data = self.data()
            login, password = required_text(data, 'login', 80).lower(), required_text(data, 'password', 200)
            key = f'{self.client_address[0]}:{login}'
            recent = [t for t in LOGIN_FAILURES.get(key, []) if t > time.time() - 900]
            if len(recent) >= 8: raise APIError(429, 'Слишком много попыток. Повторите позже')
            account = db.execute('SELECT * FROM users WHERE login=? AND active=1', (login,)).fetchone()
            if not account or not verify_password(password, account['password_hash']):
                recent.append(time.time()); LOGIN_FAILURES[key] = recent
                raise APIError(401, 'Неверный логин или пароль')
            LOGIN_FAILURES.pop(key, None)
            token = secrets.token_urlsafe(32)
            db.execute('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)',
                       (hashlib.sha256(token.encode()).hexdigest(), account['id'], int(time.time()) + SESSION_AGE))
            db.commit()
            cookie = f'progress_session={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age={SESSION_AGE}'
            if self.headers.get('X-Forwarded-Proto') == 'https': cookie += '; Secure'
            return 200, {'user': public_user(account)}, cookie
        if method == 'POST' and path == '/api/logout':
            if user:
                cookie = SimpleCookie(); cookie.load(self.headers.get('Cookie', ''))
                db.execute('DELETE FROM sessions WHERE token_hash=?',
                           (hashlib.sha256(cookie['progress_session'].value.encode()).hexdigest(),))
                db.commit()
            return 200, {'ok': True}, 'progress_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'
        if method == 'GET' and path == '/api/me':
            self.require(user)
            return 200, {'user': public_user(user)}, None
        if method == 'GET' and path == '/api/tests':
            tests = rows(db, 'SELECT * FROM tests WHERE published=1 ORDER BY id DESC')
            for test in tests:
                questions = json.loads(test.pop('questions_json'))
                test['question_count'] = len(questions)
                test['questions'] = [] if test['is_paid'] else [{'question': q['question'], 'options': q['options']} for q in questions]
            return 200, {'tests': tests}, None
        if method == 'POST' and path.startswith('/api/tests/') and path.endswith('/start'):
            test_id = positive_id(path.split('/')[3])
            test = db.execute('SELECT duration_minutes,is_paid,questions_json FROM tests WHERE id=? AND published=1', (test_id,)).fetchone()
            if not test: raise APIError(404, 'Тест не найден')
            if test['is_paid']: raise APIError(403, 'Платный тест пока недоступен')
            token = secrets.token_urlsafe(32)
            expires = int(time.time()) + test['duration_minutes'] * 60
            db.execute('INSERT INTO test_attempts(token_hash,test_id,expires_at,questions_json) VALUES(?,?,?,?)',
                       (hashlib.sha256(token.encode()).hexdigest(), test_id, expires, test['questions_json']))
            db.commit()
            return 201, {'attempt_token': token, 'expires_at': expires * 1000}, None
        if method == 'POST' and path.startswith('/api/tests/') and path.endswith('/submit'):
            test_id = positive_id(path.split('/')[3])
            test = db.execute('SELECT * FROM tests WHERE id=? AND published=1', (test_id,)).fetchone()
            if not test: raise APIError(404, 'Тест не найден')
            if test['is_paid']: raise APIError(403, 'Платный тест пока недоступен')
            data = self.data()
            token = required_text(data, 'attempt_token', 200)
            token_hash = hashlib.sha256(token.encode()).hexdigest()
            attempt = db.execute('SELECT * FROM test_attempts WHERE token_hash=? AND test_id=?', (token_hash, test_id)).fetchone()
            if not attempt or attempt['completed'] or attempt['expires_at'] + 3 < time.time():
                raise APIError(403, 'Попытка теста завершена или время вышло')
            questions = json.loads(attempt['questions_json'])
            answers = data.get('answers')
            if not isinstance(answers, list) or len(answers) != len(questions):
                raise APIError(400, 'Некорректные ответы')
            if any(isinstance(a, bool) or not isinstance(a, int) or not -1 <= a < len(q['options']) for a, q in zip(answers, questions)):
                raise APIError(400, 'Некорректные ответы')
            correct = sum(a == q['correct'] for a, q in zip(answers, questions))
            db.execute('UPDATE test_attempts SET completed=1 WHERE token_hash=?', (token_hash,))
            db.commit()
            return 200, {'correct': correct, 'incorrect': len(questions) - correct, 'total': len(questions)}, None
        if method == 'GET' and path == '/api/videos':
            return 200, {'videos': rows(db, 'SELECT * FROM videos WHERE published=1 ORDER BY id DESC')}, None
        if method == 'GET' and path == '/api/my/students':
            self.require(user, 'parent')
            students = rows(db, '''SELECT s.*,u.name teacher_name FROM students s LEFT JOIN users u ON u.id=s.teacher_id
                WHERE s.parent_id=? AND s.active=1 ORDER BY s.name''', (user['id'],))
            for student in students:
                student['attendance'] = rows(db, 'SELECT date,present,comment FROM attendance WHERE student_id=? ORDER BY date DESC', (student['id'],))
            return 200, {'students': students}, None
        if path.startswith('/api/admin/'):
            self.require(user, 'admin')
            return self.admin_api(db, method, path)
        if path.startswith('/api/teacher/'):
            self.require(user, 'teacher')
            return self.teacher_api(db, method, path, query, user)
        raise APIError(404, 'Не найдено')

    def admin_api(self, db, method, path):
        if method == 'GET' and path == '/api/admin/overview':
            return 200, {
                'users': rows(db, 'SELECT id,name,login,phone,role,created_at,active FROM users ORDER BY id DESC'),
                'applications': rows(db, 'SELECT * FROM applications ORDER BY id DESC'),
                'students': rows(db, '''SELECT s.*,t.name teacher_name,p.name parent_name FROM students s
                    LEFT JOIN users t ON t.id=s.teacher_id LEFT JOIN users p ON p.id=s.parent_id ORDER BY s.id DESC'''),
                'teachers': rows(db, "SELECT id,name,login,active FROM users WHERE role='teacher' ORDER BY name"),
                'tests': self.full_tests(db),
                'videos': rows(db, 'SELECT * FROM videos ORDER BY id DESC'),
            }, None
        if method == 'POST' and path == '/api/admin/teachers':
            data = self.data()
            name, login = required_text(data, 'name'), required_text(data, 'login', 80).lower()
            password = required_text(data, 'password', 200)
            if len(password) < 10: raise APIError(400, 'Пароль должен содержать не менее 10 символов')
            cur = db.execute('INSERT INTO users(name,login,role,password_hash) VALUES(?,?,?,?)',
                             (name, login, 'teacher', password_hash(password)))
            db.commit()
            return 201, {'id': cur.lastrowid}, None
        if method == 'POST' and path == '/api/admin/students':
            data = self.data()
            teacher_id = positive_id(data['teacher_id']) if data.get('teacher_id') else None
            parent_id = positive_id(data['parent_id']) if data.get('parent_id') else None
            if teacher_id and not db.execute("SELECT 1 FROM users WHERE id=? AND role='teacher' AND active=1", (teacher_id,)).fetchone():
                raise APIError(400, 'Преподаватель не найден')
            if parent_id and not db.execute("SELECT 1 FROM users WHERE id=? AND role='parent' AND active=1", (parent_id,)).fetchone():
                raise APIError(400, 'Родитель не найден')
            cur = db.execute('''INSERT INTO students(name,teacher_id,parent_id,course,type,schedule,cost,payment)
                VALUES(?,?,?,?,?,?,?,?)''', (required_text(data, 'name'), teacher_id, parent_id,
                optional_text(data, 'course'), optional_text(data, 'type'), optional_text(data, 'schedule'),
                optional_text(data, 'cost'), optional_text(data, 'payment')))
            db.commit()
            return 201, {'id': cur.lastrowid}, None
        if method == 'PATCH' and path.startswith('/api/admin/students/'):
            student_id = positive_id(path.rsplit('/', 1)[-1]); data = self.data()
            if set(data) == {'active'}:
                cur = db.execute('UPDATE students SET active=? WHERE id=?', (boolean(data, 'active'), student_id))
            else:
                teacher_id = positive_id(data['teacher_id']) if data.get('teacher_id') else None
                parent_id = positive_id(data['parent_id']) if data.get('parent_id') else None
                if teacher_id and not db.execute("SELECT 1 FROM users WHERE id=? AND role='teacher' AND active=1", (teacher_id,)).fetchone():
                    raise APIError(400, 'Преподаватель не найден')
                if parent_id and not db.execute("SELECT 1 FROM users WHERE id=? AND role='parent' AND active=1", (parent_id,)).fetchone():
                    raise APIError(400, 'Родитель не найден')
                cur = db.execute('''UPDATE students SET name=?,teacher_id=?,parent_id=?,course=?,type=?,schedule=?,cost=?,payment=?
                  WHERE id=?''', (required_text(data, 'name'), teacher_id, parent_id,
                  optional_text(data, 'course'), optional_text(data, 'type'), optional_text(data, 'schedule'),
                  optional_text(data, 'cost'), optional_text(data, 'payment'), student_id))
            if not cur.rowcount: raise APIError(404, 'Ученик не найден')
            db.commit(); return 200, {'ok': True}, None
        if method == 'POST' and path == '/api/admin/tests':
            data = self.data()
            clean, duration = self.validate_test(data)
            cur = db.execute('''INSERT INTO tests(title,subject,questions_json,duration_minutes,published,is_paid)
                VALUES(?,?,?,?,?,?)''', (required_text(data, 'title'), required_text(data, 'subject'),
                json.dumps(clean, ensure_ascii=False), duration, boolean(data, 'published'), boolean(data, 'is_paid')))
            db.commit()
            return 201, {'id': cur.lastrowid}, None
        if method == 'PATCH' and path.startswith('/api/admin/tests/'):
            test_id = positive_id(path.rsplit('/', 1)[-1]); data = self.data()
            if set(data) == {'published'}:
                cur = db.execute('UPDATE tests SET published=? WHERE id=?', (boolean(data, 'published'), test_id))
            else:
                clean, duration = self.validate_test(data)
                cur = db.execute('''UPDATE tests SET title=?,subject=?,questions_json=?,duration_minutes=?,published=?,is_paid=? WHERE id=?''',
                    (required_text(data, 'title'),required_text(data, 'subject'),json.dumps(clean,ensure_ascii=False),
                     duration,boolean(data,'published'),boolean(data,'is_paid'),test_id))
            if not cur.rowcount: raise APIError(404, 'Тест не найден')
            db.commit(); return 200, {'ok': True}, None
        if method == 'POST' and path == '/api/admin/videos':
            data = self.data(); url = required_text(data, 'url', 1000)
            parsed = urlparse(url)
            if parsed.scheme != 'https' or not parsed.netloc: raise APIError(400, 'Нужна HTTPS-ссылка на видео')
            cur = db.execute('INSERT INTO videos(title,subject,url,published) VALUES(?,?,?,?)',
                             (required_text(data, 'title'), required_text(data, 'subject'), url, boolean(data, 'published')))
            db.commit(); return 201, {'id': cur.lastrowid}, None
        if method == 'PATCH' and path.startswith('/api/admin/videos/'):
            video_id = positive_id(path.rsplit('/', 1)[-1]); data = self.data()
            if set(data) == {'published'}:
                cur = db.execute('UPDATE videos SET published=? WHERE id=?', (boolean(data, 'published'), video_id))
            else:
                url = required_text(data, 'url', 1000)
                parsed = urlparse(url)
                if parsed.scheme != 'https' or not parsed.netloc: raise APIError(400, 'Нужна HTTPS-ссылка на видео')
                cur = db.execute('UPDATE videos SET title=?,subject=?,url=?,published=? WHERE id=?',
                    (required_text(data,'title'),required_text(data,'subject'),url,boolean(data,'published'),video_id))
            if not cur.rowcount: raise APIError(404, 'Видео не найдено')
            db.commit(); return 200, {'ok': True}, None
        raise APIError(404, 'Не найдено')

    def full_tests(self, db):
        tests = rows(db, 'SELECT * FROM tests ORDER BY id DESC')
        for test in tests: test['questions'] = json.loads(test.pop('questions_json'))
        return tests

    def validate_test(self, data):
        questions = data.get('questions')
        if not isinstance(questions, list) or not 1 <= len(questions) <= 100:
            raise APIError(400, 'Нужен список вопросов')
        clean = []
        for q in questions:
            if not isinstance(q, dict): raise APIError(400, 'Некорректный вопрос')
            question = required_text(q, 'question', 1000)
            options = q.get('options')
            if not isinstance(options, list) or not 2 <= len(options) <= 6 or any(not isinstance(x, str) or not x.strip() or len(x) > 500 for x in options):
                raise APIError(400, 'Некорректные варианты ответа')
            correct = q.get('correct')
            if isinstance(correct, bool) or not isinstance(correct, int) or not 0 <= correct < len(options):
                raise APIError(400, 'Некорректный правильный ответ')
            clean.append({'question': question, 'options': [x.strip() for x in options], 'correct': correct})
        duration = data.get('duration_minutes')
        if isinstance(duration, bool) or not isinstance(duration, int) or not 1 <= duration <= 180:
            raise APIError(400, 'Время теста: от 1 до 180 минут')
        return clean, duration

    def teacher_api(self, db, method, path, query, user):
        if method == 'GET' and path == '/api/teacher/students':
            return 200, {'students': rows(db, '''SELECT id,name,course,type,schedule,cost,payment FROM students
                WHERE teacher_id=? AND active=1 ORDER BY name''', (user['id'],))}, None
        if method == 'GET' and path == '/api/teacher/attendance':
            student_id = positive_id(query.get('student_id', [None])[0])
            if not db.execute('SELECT 1 FROM students WHERE id=? AND teacher_id=? AND active=1', (student_id, user['id'])).fetchone():
                raise APIError(403, 'Нет доступа к ученику')
            return 200, {'attendance': rows(db, 'SELECT date,present,comment FROM attendance WHERE student_id=? ORDER BY date DESC', (student_id,))}, None
        if method == 'POST' and path == '/api/teacher/attendance':
            data = self.data(); student_id = positive_id(data.get('student_id'))
            if not db.execute('SELECT 1 FROM students WHERE id=? AND teacher_id=? AND active=1', (student_id, user['id'])).fetchone():
                raise APIError(403, 'Нет доступа к ученику')
            day = required_text(data, 'date', 10)
            try:
                if date.fromisoformat(day).isoformat() != day: raise ValueError()
            except ValueError: raise APIError(400, 'Некорректная дата')
            present = boolean(data, 'present'); comment = optional_text(data, 'comment', 2000)
            db.execute('''INSERT INTO attendance(student_id,teacher_id,date,present,comment) VALUES(?,?,?,?,?)
                ON CONFLICT(student_id,date) DO UPDATE SET teacher_id=excluded.teacher_id,
                present=excluded.present,comment=excluded.comment,updated_at=CURRENT_TIMESTAMP''',
                (student_id, user['id'], day, present, comment))
            db.commit(); return 200, {'ok': True}, None
        raise APIError(404, 'Не найдено')


def main():
    parser = argparse.ArgumentParser(description='Progress local server')
    sub = parser.add_subparsers(dest='command')
    admin = sub.add_parser('create-admin', help='Create first administrator interactively')
    admin.add_argument('--login', required=True)
    admin.add_argument('--name', default='Администратор')
    reset = sub.add_parser('set-password', help='Change a user password locally')
    reset.add_argument('--login', required=True)
    serve = sub.add_parser('serve', help='Run the web server')
    serve.add_argument('--host', default='127.0.0.1')
    serve.add_argument('--port', type=int, default=4173)
    args = parser.parse_args()
    init_db()
    if args.command == 'create-admin':
        password = getpass.getpass('Новый пароль администратора (10+ символов): ')
        if len(password) < 10: parser.error('Пароль слишком короткий')
        with db_session() as db:
            db.execute('INSERT INTO users(name,login,role,password_hash) VALUES(?,?,?,?)',
                       (args.name, args.login.lower(), 'admin', password_hash(password)))
            db.commit()
        print('Администратор создан')
    elif args.command == 'set-password':
        password = getpass.getpass('Новый пароль (10+ символов): ')
        if len(password) < 10: parser.error('Пароль слишком короткий')
        with db_session() as db:
            account = db.execute('SELECT id FROM users WHERE login=?', (args.login.lower(),)).fetchone()
            if not account: parser.error('Пользователь не найден')
            db.execute('UPDATE users SET password_hash=? WHERE id=?', (password_hash(password), account['id']))
            db.execute('DELETE FROM sessions WHERE user_id=?', (account['id'],))
        print('Пароль изменён; старые сеансы завершены')
    elif args.command == 'serve':
        print(f'Progress: http://{args.host}:{args.port}', flush=True)
        ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()
    else: parser.print_help()


if __name__ == '__main__': main()
