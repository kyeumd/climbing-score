#!/usr/bin/env python3
"""
개발용 정적 서버.

python -m http.server 는 Cache-Control을 보내지 않는다. 브라우저는
Last-Modified만 보고 휴리스틱 캐싱을 적용해 재검증 없이 옛 파일을 쓴다.
그 결과 CSS를 고쳐도 화면이 그대로여서, 이미 고친 문제를 계속 보게 된다.
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def send_response(self, code, message=None):
        # 304를 주면 브라우저가 캐시를 쓴다. 개발 중에는 항상 새로 내려준다.
        super().send_response(200 if code == 304 else code, message)

    def log_message(self, fmt, *args):
        pass


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    handler = partial(NoCacheHandler, directory=".")
    with ThreadingHTTPServer(("", port), handler) as httpd:
        print(f"http://localhost:{port}  (no-cache)")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
