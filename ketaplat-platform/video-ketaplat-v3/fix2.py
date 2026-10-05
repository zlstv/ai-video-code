#!/usr/bin/env python3
"""修复: seg01 重切(13-19s) + 字幕按句分段"""
import subprocess, os, re

W = "/home/hatch/workspace/video-ketaplat3"
B = f"{W}/build"
MAIN = "/home/hatch/workspace/your_files/课搭AI校园平台全功能演示录屏.mp4"

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print("FAIL:", r.stderr[-2000:]); raise SystemExit(1)
    return r

def probe(p):
    return float(run(["ffprobe","-v","error","-show_entries","format=duration",
                      "-of","csv=p=0",p]).stdout.strip())

r = run(["fc-list"])
font = [l.split(":")[0].strip() for l in r.stdout.splitlines()
        if "NotoSansCJK" in l and "Bold" in l and ".ttc" in l][0]

def esc(s): return s.replace("\\","\\\\").replace("'","\\'").replace(":","\\:")

# 1) 重切 seg01: 13-19s @1.5x
title = "一所学校，一个平台，全搞定"
dt = (f"drawtext=fontfile='{font}':text='{esc(title)}':fontsize=64:fontcolor=white:"
      f"box=1:boxcolor=black@0.55:boxborderw=24:x=(w-text_w)/2:y=84:enable='lt(t,3)'")
run(["ffmpeg","-y","-v","error","-ss","13","-to","19","-i",MAIN,
     "-vf",f"setpts=PTS/1.5,fps=30,{dt},format=yuv420p",
     "-an","-c:v","libx264","-preset","veryfast","-crf","18",f"{B}/s01_v.mp4"])
dv, da = probe(f"{B}/s01_v.mp4"), probe(f"{W}/audio/n1.mp3")
T = max(dv, da) + 0.5
run(["ffmpeg","-y","-v","error","-i",f"{B}/s01_v.mp4","-i",f"{W}/audio/n1.mp3",
     "-filter_complex",
     f"[0:v]tpad=stop_mode=clone:stop_duration={max(0,T-dv):.2f}[v];"
     f"[1:a]apad=whole_dur={T:.2f}[a]",
     "-map","[v]","-map","[a]","-c:v","libx264","-preset","veryfast","-crf","18",
     "-c:a","aac","-b:a","128k","-ar","44100","-t",f"{T:.2f}",f"{B}/s01.mp4"])
print(f"s01 rebuilt -> {T:.1f}s")

# 2) 字幕分段: 按句切, 每段<=26字, 按字数比例分配时长
AUDS = ["n1","n2","n3","n4","n5","n6","n7","n8","n9","n13","n10","n11"]
def chunks(txt):
    sents = [s for s in re.split(r'(?<=[。！？])', txt) if s.strip()]
    out, cur = [], ""
    for s in sents:
        if len(cur)+len(s) <= 26: cur += s
        else:
            if cur: out.append(cur)
            cur = s
    if cur: out.append(cur)
    return out

def ts(s):
    h,m = divmod(int(s),3600); m,sec = divmod(m,60)
    return f"{h:02d}:{m:02d}:{sec:02d},{int((s%1)*1000):03d}"

t = 0.0; entries = []
for i,aud in enumerate(AUDS,1):
    da = probe(f"{W}/audio/{aud}.mp3")
    with open(f"{W}/script/{aud}.txt") as f: txt = f.read().strip().replace("\n"," ")
    chs = chunks(txt); total = sum(len(c) for c in chs)
    ct = t + 0.15
    for c in chs:
        d = da * len(c)/total
        entries.append((ts(ct), ts(ct+d), c)); ct += d
    t += probe(f"{B}/s{i:02d}.mp4")
    print(f"s{i:02d} {aud}: {len(chs)} 条字幕")

with open(f"{B}/subs.srt","w") as f:
    for i,(a,b,x) in enumerate(entries,1): f.write(f"{i}\n{a} --> {b}\n{x}\n\n")

# 3) 重新拼接 + 压制
with open(f"{B}/list.txt","w") as f:
    for i in range(1,13): f.write(f"file '{B}/s{i:02d}.mp4'\n")
run(["ffmpeg","-y","-v","error","-f","concat","-safe","0","-i",f"{B}/list.txt",
     "-c","copy",f"{B}/joined.mp4"])
final = "/home/hatch/workspace/your_files/课搭AI校园平台3分钟营销版.mp4"
style = ("FontName=Noto Sans CJK SC,FontSize=44,PrimaryColour=&HFFFFFF,"
         "OutlineColour=&H80000000,BorderStyle=1,Outline=2,Shadow=0,"
         "Alignment=2,MarginV=64")
run(["ffmpeg","-y","-v","error","-i",f"{B}/joined.mp4",
     "-vf",f"subtitles='{B}/subs.srt':force_style='{style}',format=yuv420p",
     "-c:v","libx264","-preset","medium","-crf","20",
     "-c:a","aac","-b:a","128k",final])
print(f"DONE: {probe(final):.0f}s, {os.path.getsize(final)/1e6:.1f}MB")
