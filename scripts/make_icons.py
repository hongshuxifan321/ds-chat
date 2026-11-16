from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# DeepSeek 品牌蓝
BLUE = (77, 107, 254, 255)
WHITE = (255, 255, 255, 255)
S = 512

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\seguibl.ttf",
    r"C:\Windows\Fonts\arialbd.ttf",
    r"C:\Windows\Fonts\segoeuib.ttf",
]

FONT_PATH = next((p for p in FONT_CANDIDATES if Path(p).exists()), None)
if FONT_PATH is None:
    raise SystemExit("no bold font found")


def draw_icon(size: int, corner: int, k: float, text: str = "DS") -> Image.Image:
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=corner, fill=BLUE)

    # 先按大字号量出字形尺寸，再缩到目标宽度，保证居中且各尺寸一致
    probe = ImageFont.truetype(FONT_PATH, 400)
    box = d.textbbox((0, 0), text, font=probe)
    glyph_w = box[2] - box[0]

    target_w = 304 * k
    font = ImageFont.truetype(FONT_PATH, int(400 * target_w / glyph_w))
    box = d.textbbox((0, 0), text, font=font)
    w = box[2] - box[0]
    h = box[3] - box[1]
    x = (S - w) / 2 - box[0]
    y = (S - h) / 2 - box[1]
    d.text((x, y), text, font=font, fill=WHITE)
    return img.resize((size, size), Image.LANCZOS)


# 普通图标：圆角 + 字母占满
draw_icon(192, 112, 1.0).save("public/icons/icon-192.png")
draw_icon(512, 112, 1.0).save("public/icons/icon-512.png")
draw_icon(32, 112, 1.0).save("public/icons/favicon-32.png")

# maskable：满幅方底（由系统裁切），内容缩到 80% 安全区
draw_icon(512, 0, 0.8).save("public/icons/icon-512-maskable.png")

# apple-touch-icon：不透明满幅方底，iOS 自己加圆角
draw_icon(180, 0, 1.0).convert("RGB").save("public/icons/apple-touch-icon.png")

print("icons written with", FONT_PATH)
