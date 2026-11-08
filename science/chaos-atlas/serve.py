#!/usr/bin/env python3
"""Serve the local experiments without stale HTML, JS or CSS during development."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, urlsplit


class NoCacheHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, entry=None, **kwargs):
        self.entry = entry
        super().__init__(*args, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, max-age=0')
        super().end_headers()

    def redirect_entry(self):
        if not self.entry or urlsplit(self.path).path != '/':
            return False
        self.send_response(302)
        self.send_header('Location', self.entry)
        self.send_header('Content-Length', '0')
        self.end_headers()
        return True

    def do_GET(self):
        if not self.redirect_entry():
            super().do_GET()

    def do_HEAD(self):
        if not self.redirect_entry():
            super().do_HEAD()


def main():
    parser = argparse.ArgumentParser(description='Serve the classical dynamics workbenches')
    parser.add_argument('--bind', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=4173)
    parser.add_argument('--entry', help='open this HTML page at / (default: index.html)')
    args = parser.parse_args()
    directory = Path(__file__).resolve().parent
    entry_url = None
    if args.entry:
        relative = Path(args.entry)
        target = (directory / relative).resolve()
        try:
            target.relative_to(directory)
            inside = True
        except ValueError:
            inside = False
        if (relative.is_absolute() or not inside
                or target.suffix.lower() != '.html' or not target.is_file()):
            parser.error('--entry must be an existing HTML file inside chaos-atlas')
        entry_url = '/' + '/'.join(quote(part, safe='') for part in relative.parts)
    handler = partial(NoCacheHandler, directory=str(directory), entry=entry_url)
    server = ThreadingHTTPServer((args.bind, args.port), handler)
    print(f'Classical dynamics labs: http://{args.bind}:{server.server_port}/', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
