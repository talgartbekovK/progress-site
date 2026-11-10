import json
import tempfile
import unittest
from io import BytesIO
from pathlib import Path

import server


class WsgiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.previous_db = server.DB
        server.DB = Path(cls.temp.name) / 'site.sqlite3'
        import wsgi
        cls.application = staticmethod(wsgi.application)
        with server.db_session() as db:
            db.execute('INSERT INTO users(name,login,role,password_hash) VALUES(?,?,?,?)',
                       ('Owner', 'owner', 'admin', server.password_hash('temporary-test-password')))

    @classmethod
    def tearDownClass(cls):
        server.DB = cls.previous_db
        cls.temp.cleanup()

    def request(self, method, path, payload=None, cookie=None):
        body = json.dumps(payload).encode() if payload is not None else b''
        environ = {
            'REQUEST_METHOD': method, 'PATH_INFO': path,
            'QUERY_STRING': '', 'CONTENT_LENGTH': str(len(body)),
            'CONTENT_TYPE': 'application/json', 'HTTP_HOST': 'example.pythonanywhere.com',
            'HTTP_ORIGIN': 'https://example.pythonanywhere.com',
            'REMOTE_ADDR': '127.0.0.1', 'wsgi.url_scheme': 'https',
            'wsgi.input': BytesIO(body),
        }
        if cookie:
            environ['HTTP_COOKIE'] = cookie
        result = {}
        def start_response(status, headers):
            result.update(status=status, headers=dict(headers))
        result['body'] = b''.join(self.application(environ, start_response))
        return result

    def test_login_and_admin_overview(self):
        self.assertTrue(self.request('GET', '/admin.html')['status'].startswith('200'))
        self.assertTrue(self.request('GET', '/api/admin/overview')['status'].startswith('401'))
        login = self.request('POST', '/api/login', {'login': 'owner', 'password': 'temporary-test-password'})
        self.assertTrue(login['status'].startswith('200'))
        self.assertIn('Secure', login['headers']['Set-Cookie'])
        cookie = login['headers']['Set-Cookie'].split(';', 1)[0]
        overview = self.request('GET', '/api/admin/overview', cookie=cookie)
        self.assertTrue(overview['status'].startswith('200'))
        self.assertEqual(json.loads(overview['body'])['users'][0]['login'], 'owner')


if __name__ == '__main__':
    unittest.main()
