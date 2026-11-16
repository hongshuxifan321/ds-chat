from PIL import Image, ImageDraw

BG = (37, 99, 235, 255)
WHITE = (255, 255, 255, 255)
W = 512


def draw_mark() -> Image.Image:
    img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, W - 1, W - 1], radius=112, fill=BG)
    # 对话气泡
    d.rounded_rectangle([88, 116, 424, 356], radius=64, fill=WHITE)
    # 尾巴
    d.polygon([(150, 330), (150, 440), (252, 350)], fill=WHITE)
    # 钥匙孔
    cx, cy = 256, 220
    d.ellipse([cx - 32, cy - 32, cx + 32, cy + 32], fill=BG)
    d.polygon(
        [(cx - 13, cy + 8), (cx + 13, cy + 8), (cx + 19, cy + 84), (cx - 19, cy + 84)],
        fill=BG,
    )
    return img


mark = draw_mark()

# 普通图标
mark.resize((192, 192), Image.LANCZOS).save("public/icons/icon-192.png")
mark.resize((512, 512), Image.LANCZOS).save("public/icons/icon-512.png")
mark.resize((32, 32), Image.LANCZOS).save("public/icons/favicon-32.png")

# maskable：内容缩到中间 80% 安全区，四周用底色铺满
maskable = Image.new("RGBA", (W, W), BG)
inner = mark.resize((410, 410), Image.LANCZOS)
maskable.paste(inner, (51, 51), inner)
maskable.save("public/icons/icon-512-maskable.png")

# apple-touch-icon：必须不透明
apple = Image.new("RGB", (180, 180), (37, 99, 235))
apple_mark = mark.resize((180, 180), Image.LANCZOS)
apple.paste(apple_mark, (0, 0), apple_mark)
apple.save("public/icons/apple-touch-icon.png")

print("icons written")
