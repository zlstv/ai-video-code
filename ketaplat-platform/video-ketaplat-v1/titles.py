#!/usr/bin/env python3
"""片头/片尾标题卡生成 (PIL + Noto Sans CJK)."""
import os
from PIL import Image, ImageDraw, ImageFont

BASE = os.path.expanduser("~/workspace/video-ketaplat/build")
W, H = 1920, 1080
FONT = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
BOLD = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"

def grad_bg(c1, c2):
    img = Image.new("RGB", (W, H))
    px = img.load()
    for y in range(H):
        t = y / H
        px_col = tuple(int(c1[i] + (c2[i]-c1[i])*t) for i in range(3))
        for x in range(W):
            px[x, y] = px_col
    return img

def center(draw, y, text, font, fill):
    l, t, r, b = draw.textbbox((0, 0), text, font=font)
    draw.text(((W-(r-l))/2, y), text, font=font, fill=fill)

# 片头
img = grad_bg((8, 24, 48), (16, 48, 96))
d = ImageDraw.Draw(img)
f_big = ImageFont.truetype(BOLD, 110)
f_mid = ImageFont.truetype(FONT, 52)
f_small = ImageFont.truetype(FONT, 36)
center(d, 380, "课搭AI校园平台", f_big, (255, 255, 255))
center(d, 540, "把学校装进云里，把学习连成一条路", f_mid, (150, 200, 255))
center(d, 660, "学校介绍 · 教师版", f_small, (120, 160, 200))
img.save(f"{BASE}/title_intro.png")

# 片尾
img = grad_bg((8, 24, 48), (16, 48, 96))
d = ImageDraw.Draw(img)
f_t = ImageFont.truetype(BOLD, 80)
f_b = ImageFont.truetype(FONT, 46)
center(d, 360, "欢迎联系我们", f_t, (255, 255, 255))
center(d, 500, "service@smdata.com.cn", f_b, (150, 200, 255))
center(d, 580, "服务热线  0592-0000000", f_b, (200, 220, 240))
center(d, 660, "福建省泉州市 · 工作日 9:00–18:00", f_b, (200, 220, 240))
center(d, 780, "把学校装进云里，把学习连成一条路", f_small, (120, 160, 200))
img.save(f"{BASE}/title_outro.png")
print("title cards done")
