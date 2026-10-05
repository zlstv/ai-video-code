#!/usr/bin/env python3
"""局部修复 seg04 配音后重建"""
import subprocess, os, shutil

W = "/home/hatch/workspace/video-ketaplat3"
B = f"{W}/build"

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print("FAIL:", r.stderr[-2000:]); raise SystemExit(1)
    return r

def probe(p):
    return float(run(["ffprobe","-v","error","-show_entries","format=duration",
                      "-of","csv=p=0",p]).stdout.strip())

shutil.copy(f"{W}/audio/n4_try1.mp3", f"{W}/audio/n4.mp3")

TITLES = ["一所学校，一个平台，全搞定","一句话，AI 生成互动课件",
    "先确认需求，再动手生成","课件智能体，随取随用","一键发到班级，数据实时回流",
    "全校师生算力，一屏掌控","公告一键群发，家校同步","学生：点开就学，边玩边练",
    "不会就问 AI 助手","作品一键提交，老师即时看到",
    "家长：孩子学到哪，一目了然",""]
AUDS = ["n1","n2","n3","n4","n5","n6","n7","n8","n9","n13","n10","n11"]

# 重建 s04
dv, da = probe(f"{B}/s04_v.mp4"), probe(f"{W}/audio/n4.mp3")
T = max(dv, da) + 0.5
run(["ffmpeg","-y","-v","error","-i",f"{B}/s04_v.mp4","-i",f"{W}/audio/n4.mp3",
     "-filter_complex",
     f"[0:v]tpad=stop_mode=clone:stop_duration={max(0,T-dv):.2f}[v];"
     f"[1:a]apad=whole_dur={T:.2f}[a]",
     "-map","[v]","-map","[a]","-c:v","libx264","-preset","veryfast","-crf","18",
     "-c:a","aac","-b:a","128k","-ar","44100","-t",f"{T:.2f}",f"{B}/s04.mp4"])
print(f"s04 rebuilt: v {dv:.1f}s + a {da:.1f}s -> {T:.1f}s")

# 重新拼接 + 字幕时间轴
seg_files = [f"{B}/s{i:02d}.mp4" for i in range(1,13)]
with open(f"{B}/list.txt","w") as f:
    for p in seg_files: f.write(f"file '{p}'\n")
run(["ffmpeg","-y","-v","error","-f","concat","-safe","0","-i",f"{B}/list.txt",
     "-c","copy",f"{B}/joined.mp4"])

def ts(s):
    h,m = divmod(int(s),3600); m,sec = divmod(m,60)
    return f"{h:02d}:{m:02d}:{sec:02d},{int((s%1)*1000):03d}"
t = 0.0; entries = []
for i,aud in enumerate(AUDS,1):
    da = probe(f"{W}/audio/{aud}.mp3")
    with open(f"{W}/script/{aud}.txt") as f: txt = f.read().strip().replace("\n"," ")
    entries.append((ts(t+0.15), ts(t+0.15+da), txt))
    t += probe(f"{B}/s{i:02d}.mp4")
with open(f"{B}/subs.srt","w") as f:
    for i,(a,b,x) in enumerate(entries,1): f.write(f"{i}\n{a} --> {b}\n{x}\n\n")

final = "/home/hatch/workspace/your_files/课搭AI校园平台3分钟营销版.mp4"
style = ("FontName=Noto Sans CJK SC,FontSize=46,PrimaryColour=&HFFFFFF,"
         "OutlineColour=&H80000000,BorderStyle=1,Outline=2,Shadow=0,"
         "Alignment=2,MarginV=70")
run(["ffmpeg","-y","-v","error","-i",f"{B}/joined.mp4",
     "-vf",f"subtitles='{B}/subs.srt':force_style='{style}',format=yuv420p",
     "-c:v","libx264","-preset","medium","-crf","20",
     "-c:a","aac","-b:a","128k",final])
d = probe(final); sz = os.path.getsize(final)/1e6
print(f"DONE: 时长 {d:.0f}s, {sz:.1f}MB")
