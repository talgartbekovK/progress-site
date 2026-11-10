import http.cookiejar
import hashlib
import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path

import server


class ApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        server.DB = Path(cls.temp.name) / 'test.sqlite3'
        server.init_db()
        with server.db_session() as db:
            db.execute('INSERT INTO users(name,login,role,password_hash) VALUES(?,?,?,?)',
                       ('Admin', 'admin', 'admin', server.password_hash('test-admin-pass')))
            db.commit()
        cls.http = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        cls.thread = threading.Thread(target=cls.http.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f'http://127.0.0.1:{cls.http.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown()
        cls.http.server_close()
        cls.temp.cleanup()

    def client(self):
        return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def call(self, client, method, path, body=None, origin=True):
        headers = {'Content-Type': 'application/json'}
        if origin: headers['Origin'] = self.base
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, headers=headers, method=method)
        try:
            response = client.open(req)
        except urllib.error.HTTPError as error:
            response = error
        return response.status, json.load(response)

    def test_full_role_and_content_flow(self):
        admin = self.client(); parent = self.client(); teacher = self.client(); outsider = self.client()
        self.assertEqual(self.call(parent, 'POST', '/api/register',
            {'name':'Parent','login':'parent1','phone':'+996 111','password':'parent-pass-123'})[0], 201)
        self.assertEqual(self.call(parent, 'POST', '/api/login',
            {'login':'parent1','password':'parent-pass-123'})[0], 200)
        self.assertEqual(self.call(admin, 'POST', '/api/login',
            {'login':'admin','password':'test-admin-pass'})[0], 200)
        self.assertEqual(self.call(parent, 'GET', '/api/admin/overview')[0], 403)
        self.assertEqual(self.call(parent, 'POST', '/api/admin/teachers',
            {'name':'Wrong','login':'wrong','password':'long-password'})[0], 403)
        _, overview = self.call(admin, 'GET', '/api/admin/overview')
        parent_id = next(u['id'] for u in overview['users'] if u['login'] == 'parent1')
        status, application = self.call(outsider, 'POST', '/api/applications',
            {'name':'Applicant','phone':'+996 222','interest':'Математика'})
        self.assertEqual(status, 201)
        _, overview = self.call(admin, 'GET', '/api/admin/overview')
        self.assertEqual(overview['applications'][0]['interest'], 'Математика')
        status, created = self.call(admin, 'POST', '/api/admin/teachers',
            {'name':'Teacher','login':'teacher1','password':'teacher-pass-123'})
        self.assertEqual(status, 201)
        teacher_id = created['id']
        self.assertEqual(self.call(teacher, 'POST', '/api/login',
            {'login':'teacher1','password':'teacher-pass-123'})[0], 200)
        status, created = self.call(admin, 'POST', '/api/admin/students',
            {'name':'Child','teacher_id':teacher_id,'parent_id':parent_id,'course':'Математика'})
        self.assertEqual(status, 201)
        student_id = created['id']
        self.assertEqual(len(self.call(teacher, 'GET', '/api/teacher/students')[1]['students']), 1)
        self.assertEqual(self.call(teacher, 'POST', '/api/teacher/attendance',
            {'student_id':student_id,'date':'2026-11-10','present':True,'comment':'Урок пройден'})[0], 200)
        second_teacher = self.client()
        self.assertEqual(self.call(admin, 'POST', '/api/admin/teachers',
            {'name':'Other teacher','login':'teacher2','password':'teacher-pass-456'})[0], 201)
        self.assertEqual(self.call(second_teacher, 'POST', '/api/login',
            {'login':'teacher2','password':'teacher-pass-456'})[0], 200)
        self.assertEqual(self.call(second_teacher, 'GET', f'/api/teacher/attendance?student_id={student_id}')[0], 403)
        self.assertEqual(self.call(second_teacher, 'POST', '/api/teacher/attendance',
            {'student_id':student_id,'date':'2026-11-10','present':False})[0], 403)
        my_students = self.call(parent, 'GET', '/api/my/students')[1]['students']
        self.assertEqual(my_students[0]['attendance'][0]['comment'], 'Урок пройден')
        self.assertEqual(self.call(outsider, 'GET', '/api/my/students')[0], 401)
        self.assertEqual(self.call(admin, 'PATCH', f'/api/admin/students/{student_id}',
            {'name':'Child','teacher_id':teacher_id,'parent_id':parent_id,'course':'Русский язык',
             'type':'Группа','schedule':'Пн','cost':'3500','payment':'Оплачено'})[0], 200)
        self.assertEqual(self.call(parent, 'GET', '/api/my/students')[1]['students'][0]['course'], 'Русский язык')
        self.assertEqual(self.call(admin, 'PATCH', f'/api/admin/students/{student_id}', {'active':False})[0], 200)
        self.assertEqual(self.call(teacher, 'GET', '/api/teacher/students')[1]['students'], [])
        self.assertEqual(self.call(parent, 'GET', '/api/my/students')[1]['students'], [])
        self.assertEqual(self.call(admin, 'PATCH', f'/api/admin/students/{student_id}', {'active':True})[0], 200)
        status, created = self.call(admin, 'POST', '/api/admin/tests',
            {'title':'Тест','subject':'Математика','duration_minutes':5,'published':True,
             'is_paid':False,'questions':[{'question':'1+1?','options':['1','2'],'correct':1}]})
        self.assertEqual(status, 201)
        test_id = created['id']
        status, public = self.call(outsider, 'GET', '/api/tests')
        self.assertEqual(status, 200)
        self.assertNotIn('correct', public['tests'][0]['questions'][0])
        token = self.call(outsider, 'POST', f'/api/tests/{test_id}/start', {})[1]['attempt_token']
        self.assertEqual(self.call(outsider, 'POST', f'/api/tests/{test_id}/submit',
            {'attempt_token':token,'answers':[1]})[1]['correct'], 1)
        self.assertEqual(self.call(outsider, 'POST', f'/api/tests/{test_id}/submit',
            {'attempt_token':token,'answers':[1]})[0], 403)
        expired_token = self.call(outsider, 'POST', f'/api/tests/{test_id}/start', {})[1]['attempt_token']
        with server.db_session() as db:
            db.execute('UPDATE test_attempts SET expires_at=0 WHERE token_hash=?',
                       (hashlib.sha256(expired_token.encode()).hexdigest(),))
        self.assertEqual(self.call(outsider, 'POST', f'/api/tests/{test_id}/submit',
            {'attempt_token':expired_token,'answers':[1]})[0], 403)
        active_token = self.call(outsider, 'POST', f'/api/tests/{test_id}/start', {})[1]['attempt_token']
        self.assertEqual(self.call(admin, 'PATCH', f'/api/admin/tests/{test_id}',
            {'title':'Изменённый тест','subject':'Математика','duration_minutes':10,'published':True,
             'is_paid':False,'questions':[{'question':'2+2?','options':['4','5'],'correct':0}]})[0], 200)
        self.assertEqual(self.call(outsider, 'GET', '/api/tests')[1]['tests'][0]['title'], 'Изменённый тест')
        self.assertEqual(self.call(outsider, 'POST', f'/api/tests/{test_id}/submit',
            {'attempt_token':active_token,'answers':[1]})[1]['correct'], 1)
        self.assertEqual(self.call(admin, 'PATCH', f'/api/admin/tests/{test_id}',
            {'published':False})[0], 200)
        self.assertEqual(self.call(outsider, 'GET', '/api/tests')[1]['tests'], [])
        self.assertEqual(self.call(outsider, 'POST', f'/api/tests/{test_id}/submit',
            {'attempt_token':token,'answers':[1]})[0], 404)
        status, created = self.call(admin, 'POST', '/api/admin/videos',
            {'title':'Видео','subject':'Математика','url':'https://example.com/video','published':True})
        self.assertEqual(status, 201)
        self.assertEqual(len(self.call(outsider, 'GET', '/api/videos')[1]['videos']), 1)
        self.assertEqual(self.call(admin, 'PATCH', f"/api/admin/videos/{created['id']}",
            {'title':'Новое видео','subject':'Физика','url':'https://example.com/new','published':True})[0], 200)
        self.assertEqual(self.call(outsider, 'GET', '/api/videos')[1]['videos'][0]['title'], 'Новое видео')

    def test_cross_origin_write_rejected(self):
        client = self.client()
        status, _ = self.call(client, 'POST', '/api/applications',
            {'name':'X','phone':'123','interest':'Y'}, origin=False)
        self.assertEqual(status, 403)


if __name__ == '__main__': unittest.main()
