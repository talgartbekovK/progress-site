"""WSGI entry point for hosts such as PythonAnywhere."""
from __future__ import annotations

from io import BytesIO

from server import Handler, init_db


class _Socket:
    """Pass one WSGI request through the existing HTTP handler."""

    def __init__(self, request: bytes):
        self.input = BytesIO(request)
        self.output = BytesIO()

    def makefile(self, mode: str, *_args):
        return self.input if 'r' in mode else self.output

    def sendall(self, data: bytes):
        self.output.write(data)


class _Server:
    server_name = 'localhost'
    server_port = 80


def application(environ, start_response):
    method = environ['REQUEST_METHOD']
    path = environ.get('PATH_INFO', '/') or '/'
    query = environ.get('QUERY_STRING', '')
    if query:
        path += '?' + query
    try:
        body_length = int(environ.get('CONTENT_LENGTH') or 0)
    except ValueError:
        body_length = -1
    if body_length < 0 or body_length > 128_000:
        start_response('413 Request Entity Too Large', [('Content-Length', '0')])
        return [b'']
    body = environ['wsgi.input'].read(body_length)
    headers = {'Host': environ.get('HTTP_HOST') or environ.get('SERVER_NAME', 'localhost')}
    for key, value in environ.items():
        if key.startswith('HTTP_') and key not in ('HTTP_HOST', 'HTTP_CONNECTION', 'HTTP_X_FORWARDED_PROTO'):
            headers[key[5:].replace('_', '-').title()] = value
    if environ.get('wsgi.url_scheme') == 'https':
        headers['X-Forwarded-Proto'] = 'https'
    if environ.get('CONTENT_TYPE'):
        headers['Content-Type'] = environ['CONTENT_TYPE']
    headers['Content-Length'] = str(len(body))
    request = (f'{method} {path} HTTP/1.1\r\n' + ''.join(
        f'{key}: {value}\r\n' for key, value in headers.items()
    ) + '\r\n').encode('latin-1') + body
    sock = _Socket(request)
    client = environ.get('REMOTE_ADDR', '127.0.0.1')
    Handler(sock, (client, 0), _Server())
    raw = sock.output.getvalue()
    head, separator, response_body = raw.partition(b'\r\n\r\n')
    if not separator:
        raise RuntimeError('HTTP handler returned an incomplete response')
    lines = head.decode('latin-1').split('\r\n')
    status = lines[0].split(' ', 1)[1]
    response_headers = [tuple(line.split(': ', 1)) for line in lines[1:] if ': ' in line]
    start_response(status, response_headers)
    return [response_body]


init_db()
