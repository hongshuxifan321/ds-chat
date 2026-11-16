"""本地预览服务器：绑定端口后再打开浏览器，并打印局域网地址。"""

import http.server
import os
import socket
import socketserver
import sys
import threading
import webbrowser

PORT = 8090


def lan_ip() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except Exception:
        return ""
    finally:
        s.close()


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):  # 静默，避免刷屏
        pass


def main() -> None:
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    if not os.path.exists("index.html"):
        print("错误：当前目录没有 index.html，请把本脚本放在构建产物目录里。")
        sys.exit(1)

    socketserver.TCPServer.allow_reuse_address = True
    try:
        httpd = socketserver.TCPServer(("0.0.0.0", PORT), Handler)
    except OSError as exc:
        print(f"错误：端口 {PORT} 被占用（{exc}）。")
        print("可能已经有一个预览窗口在运行，先关掉它再试。")
        sys.exit(1)

    local = f"http://127.0.0.1:{PORT}/"
    ip = lan_ip()
    print("=" * 52)
    print(f"  本机访问：{local}")
    if ip:
        print(f"  手机访问：http://{ip}:{PORT}/   （需同一个 Wi-Fi）")
    print("  按 Ctrl+C 或关闭本窗口即停止")
    print("=" * 52)

    threading.Timer(1.0, lambda: webbrowser.open(local)).start()
    with httpd:
        httpd.serve_forever()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n已停止。")
