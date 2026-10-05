#!/usr/bin/env python3
"""课搭AI校园平台 3分钟营销风剪辑：快节奏分镜 + 口播 + 大字标题 + 字幕"""
import subprocess, os, json

W = "/home/hatch/workspace/video-ketaplat3"
MAIN = "/home/hatch/workspace/your_files/课搭AI校园平台全功能演示录屏.mp4"
SUPP = "/home/hatch/workspace/your_files/课搭AI校园平台全功能演示录屏-补录.mp4"
B = f"{W}/build"
os.makedirs(B, exist_ok=True)

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print("FAIL:", " ".join(cmd[:6]), "\n", r.stderr[-2000:])
        raise SystemExit(1)
    return r

def probe(path):
    r = run(["ffprobe","-v","error","-show_entries","format=duration",
             "-of","csv=p=0",path])
    return float(r.stdout.strip())

# 字体
r = run(["fc-list"])
font = None
for line in r.stdout.splitlines():
    if "NotoSansCJK" in line and "Bold" in line and ".ttc" in line:
        font = line.split(":")[0].strip(); break
assert font, "no CJK bold font"
print("font:", font)

# ---- CTA 卡 ----
from PIL import Image, ImageDraw, ImageFont
cta_path = f"{B}/cta.png"
img = Image.new("RGB",(1920,1080))
dr = ImageDraw.Draw(img)
for y in range(1080):
    t = y/1080
    c = (int(8+20*t), int(60+60*t), int(90+70*t))
    dr.line([(0,y),(1920,y)], fill=c)
f_big = ImageFont.truetype(font, 130)
f_mid = ImageFont.truetype(font, 58)
f_sml = ImageFont.truetype(font, 44)
def ct(text, f, y, fill=(255,255,255)):
    bb = dr.textbbox((0,0), text, font=f)
    dr.text(((1920-(bb[2]-bb[0]))/2, y), text, font=f, fill=fill)
ct("课搭 AI 校园平台", f_big, 330)
ct("老师省力 · 学生爱学 · 家长放心", f_mid, 540, (255,214,10))
ct("现在预约演示，开启智慧校园", f_sml, 680, (210,230,240))
img.save(cta_path)

# ---- 分镜表: (src, ss, to, speed, title, audio) ----
SEGS = [
    (MAIN,   6,  12, 1.5, "一所学校，一个平台，全搞定",   "n1"),
    (MAIN,  60,  90, 1.2, "一句话，AI 生成互动课件",       "n2"),
    (MAIN, 250, 265, 1.2, "先确认需求，再动手生成",         "n3"),
    (MAIN, 283, 310, 1.2, "课件智能体，随取随用",           "n4"),
    (SUPP,  40,  52, 1.2, "一键发到班级，数据实时回流",     "n5"),
    (MAIN, 326, 352, 1.2, "全校师生算力，一屏掌控",         "n6"),
    (MAIN, 455, 468, 1.2, "公告一键群发，家校同步",         "n7"),
    (SUPP,  93, 112, 1.0, "学生：点开就学，边玩边练",       "n8"),
    (MAIN, 580, 602, 1.2, "不会就问 AI 助手",               "n9"),
    (MAIN, 646, 656, 1.0, "作品一键提交，老师即时看到",     "n13"),
    (SUPP, 133, 143, 1.0, "家长：孩子学到哪，一目了然",     "n10"),
    ("CTA",  0,   0, 1.0, "",                              "n11"),
]

def esc(s):
    return s.replace("\\","\\\\").replace("'","\\'").replace(":","\\:")

seg_files, srt_entries, t_cursor = [], [], 0.0
for i,(src,ss,to,speed,title,aud) in enumerate(SEGS,1):
    v_raw = f"{B}/s{i:02d}_v.mp4"
    a_path = f"{W}/audio/{aud}.mp3"
    if src == "CTA":
        run(["ffmpeg","-y","-v","error","-loop","1","-i",cta_path,
             "-t","7","-vf","fps=30,format=yuv420p",
             "-c:v","libx264","-preset","veryfast","-crf","18",v_raw])
    else:
        dt = (f"drawtext=fontfile='{font}':text='{esc(title)}':fontsize=64:"
              f"fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=24:"
              f"x=(w-text_w)/2:y=84:enable='lt(t,3)'")
        run(["ffmpeg","-y","-v","error","-ss",str(ss),"-to",str(to),"-i",src,
             "-vf",f"setpts=PTS/{speed},fps=30,{dt},format=yuv420p",
             "-an","-c:v","libx264","-preset","veryfast","-crf","18",v_raw])
    dv, da = probe(v_raw), probe(a_path)
    T = max(dv, da) + 0.5
    v_pad = max(0.0, T - dv); a_pad = max(0.0, T - da)
    out = f"{B}/s{i:02d}.mp4"
    run(["ffmpeg","-y","-v","error","-i",v_raw,"-i",a_path,"-filter_complex",
         f"[0:v]tpad=stop_mode=clone:stop_duration={v_pad:.2f}[v];"
         f"[1:a]apad=whole_dur={T:.2f}[a]",
         "-map","[v]","-map","[a]","-c:v","libx264","-preset","veryfast",
         "-crf","18","-c:a","aac","-b:a","128k","-ar","44100","-t",f"{T:.2f}",out])
    seg_files.append(out)
    # 字幕条目
    with open(f"{W}/script/{aud}.txt") as f: txt = f.read().strip().replace("\n"," ")
    def ts(s):
        h,m = divmod(int(s),3600); m,sec = divmod(m,60)
        return f"{h:02d}:{m:02d}:{sec:02d},{int((s%1)*1000):03d}"
    srt_entries.append((ts(t_cursor+0.15), ts(t_cursor+0.15+da), txt))
    print(f"seg{i:02d}: video {dv:.1f}s + audio {da:.1f}s -> {T:.1f}s  [{title}]")
    t_cursor += T

# 拼接
lst = f"{B}/list.txt"
with open(lst,"w") as f:
    for p in seg_files: f.write(f"file '{p}'\n")
joined = f"{B}/joined.mp4"
run(["ffmpeg","-y","-v","error","-f","concat","-safe","0","-i",lst,
     "-c","copy",joined])

# 字幕
srt = f"{B}/subs.srt"
with open(srt,"w") as f:
    for i,(a,b,t) in enumerate(srt_entries,1):
        f.write(f"{i}\n{a} --> {b}\n{t}\n\n")

final = "/home/hatch/workspace/your_files/课搭AI校园平台3分钟营销版.mp4"
style = ("FontName=Noto Sans CJK SC,FontSize=46,PrimaryColour=&HFFFFFF,"
         "OutlineColour=&H80000000,BorderStyle=1,Outline=2,Shadow=0,"
         "Alignment=2,MarginV=70")
run(["ffmpeg","-y","-v","error","-i",joined,
     "-vf",f"subtitles='{srt}':force_style='{style}',format=yuv420p",
     "-c:v","libx264","-preset","medium","-crf","20",
     "-c:a","aac","-b:a","128k",final])
d = probe(final); sz = os.path.getsize(final)/1e6
print(f"\nDONE: {final}\n时长 {d:.0f}s ({d/60:.1f}分钟), {sz:.1f}MB")
