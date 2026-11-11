import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import server


class BootstrapTest(unittest.TestCase):
    def test_render_refuses_ephemeral_database_and_missing_admin(self):
        with patch.dict(os.environ, {'RENDER': 'true'}, clear=False):
            with self.assertRaisesRegex(RuntimeError, 'DATABASE_URL'):
                server.connect()

        previous_db = server.DB
        try:
            with tempfile.TemporaryDirectory() as directory:
                server.DB = Path(directory) / 'site.sqlite3'
                sqlite_connect = server.connect
                with patch.dict(os.environ, {'RENDER': 'true'}, clear=False), \
                     patch.object(server, 'connect', side_effect=lambda: self.sqlite_connect(sqlite_connect)):
                    with self.assertRaisesRegex(RuntimeError, 'PROGRESS_INITIAL_ADMIN_PASSWORD'):
                        server.init_db()
        finally:
            server.DB = previous_db

    @staticmethod
    def sqlite_connect(connect):
        with patch.dict(os.environ, {'RENDER': ''}, clear=False):
            return connect()

    def test_initial_admin_can_be_rotated_without_losing_data(self):
        previous_db = server.DB
        try:
            with tempfile.TemporaryDirectory() as directory:
                server.DB = Path(directory) / 'site.sqlite3'
                with patch.dict(os.environ, {'PROGRESS_INITIAL_ADMIN_PASSWORD': 'first-password-123'}):
                    server.init_db()
                with server.db_session() as db:
                    owner = db.execute("SELECT * FROM users WHERE login='owner'").fetchone()
                    self.assertTrue(server.verify_password('first-password-123', owner['password_hash']))
                    db.execute('INSERT INTO applications(name,phone,interest) VALUES(?,?,?)',
                               ('Test', '123', 'Course'))
                    db.execute('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)',
                               ('old-session', owner['id'], 9999999999))
                with patch.dict(os.environ, {'PROGRESS_INITIAL_ADMIN_PASSWORD': 'second-password-456'}):
                    server.init_db()
                with server.db_session() as db:
                    owner = db.execute("SELECT * FROM users WHERE login='owner'").fetchone()
                    self.assertTrue(server.verify_password('second-password-456', owner['password_hash']))
                    self.assertFalse(server.verify_password('first-password-123', owner['password_hash']))
                    self.assertEqual(db.execute('SELECT COUNT(*) FROM sessions').fetchone()[0], 0)
                    self.assertEqual(db.execute('SELECT COUNT(*) FROM applications').fetchone()[0], 1)
        finally:
            server.DB = previous_db


if __name__ == '__main__':
    unittest.main()
