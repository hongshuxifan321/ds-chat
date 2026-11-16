from PIL import Image, ImageDraw

BG = (37, 99, 235, 255)
WHITE = (255, 255, 255, 255)
S = 512


def sc(v: float, k: float) -> float:
    """把 512 画布上的坐标按 k 围绕中心缩放。"""
    return (v - S / 2) * k + S / 2


def draw_icon(size: int, corner: int, k: float, keyhole: bool = True) -> Image.Image:
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=corner, fill=BG)

    # 对话气泡
    d.rounded_rectangle(
        [sc(88, k), sc(116, k), sc(424, k), sc(356, k)],
        radius=64 * k,
        fill=WHITE,
    )
    # 尾巴
    d.polygon(
        [(sc(150, k), sc(330, k)), (sc(150, k), sc(440, k)), (sc(252, k), sc(350, k))],
        fill=WHITE,
    )
    # 钥匙孔：小尺寸下会糊成一团，按需关闭
    if keyhole:
        cx, cy = 256, 220
        d.ellipse(
            [sc(cx - 32, k), sc(cy - 32, k), sc(cx + 32, k), sc(cy + 32, k)],
            fill=BG,
        )
        d.polygon(
            [
                (sc(cx - 13, k), sc(cy + 8, k)),
                (sc(cx + 13, k), sc(cy + 8, k)),
                (sc(cx + 19, k), sc(cy + 84, k)),
                (sc(cx - 19, k), sc(cy + 84, k)),
            ],
            fill=BG,
        )
    return img.resize((size, size), Image.LANCZOS)


# 普通图标：圆角 + 内容占满
draw_icon(192, 112, 1.0).save("public/icons/icon-192.png")
draw_icon(512, 112, 1.0).save("public/icons/icon-512.png")

# 小尺寸：去掉钥匙孔，只留气泡轮廓，避免糊成一团
draw_icon(32, 112, 1.0, keyhole=False).save("public/icons/favicon-32.png")

# maskable：满幅方底（由系统裁切），内容缩到 80% 安全区
draw_icon(512, 0, 0.8).save("public/icons/icon-512-maskable.png")

# apple-touch-icon：不透明满幅方底，iOS 自己加圆角
draw_icon(180, 0, 1.0).convert("RGB").save("public/icons/apple-touch-icon.png")

print("icons written")
