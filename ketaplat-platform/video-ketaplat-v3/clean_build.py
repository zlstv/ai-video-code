#!/usr/bin/env python3
"""纯净版: 去掉大字标题 overlay, 保留口播, 不要字幕"""
import subprocess, os

W = "/home/hatch/workspace/video-ketaplat3"
B = f"{W}/build"
MAIN = "/home/hatch/workspace/your_files/课搭AI校园平台全功能演示录屏.mp4"
SUPP = "/home/hatch/workspace/your_files/课搭AI校园平台全功能演示录屏-补录.mp4"
C = f"{B}/clean"
os.makedirs(C, exist_ok=True)

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print("FAIL:", r.stderr[-2000:]); raise SystemExit(1)
    return r

def probe(p):
    return float(run(["ffprobe","-v","error","-show_entries","format=duration",
                      "-of","csv=p=0",p]).stdout.strip())

# (src, ss, to, speed, audio) —— 与 fix2 定稿一致, seg01 为 13-19
SEGS = [
    (MAIN,  13,  19, 1.5, "n1"),
    (MAIN,  60,  90, 1.2, "n2"),
    (MAIN, 250, 265, 1.2, "n3"),
    (MAIN, 283, 310, 1.2, "n4"),
    (SUPP,  40,  52, 1.2, "n5"),
    (MAIN, 326, 352, 1.2, "n6"),
    (MAIN, 455, 468, 1.2, "n7"),
    (SUPP,  93, 112, 1.0, "n8"),
    (MAIN, 580, 602, 1.2, "n9"),
    (MAIN, 646, 656, 1.0, "n13"),
    (SUPP, 133, 143, 1.0, "n10"),
    ("CTA",  0,   0, 1.0, "n11"),
]

seg_files = []
for i,(src,ss,to,speed,aud) in enumerate(SEGS,1):
    v_raw = f"{C}/s{i:02d}_v.mp4"
    a_path = f"{W}/audio/{aud}.mp3"
    if src == "CTA":
        run(["ffmpeg","-y","-v","error","-loop","1","-i",f"{B}/cta.png",
             "-t","7","-vf","fps=30,format=yuv420p",
             "-c:v","libx264","-preset","veryfast","-crf","18",v_raw])
    else:
        run(["ffmpeg","-y","-v","error","-ss",str(ss),"-to",str(to),"-i",src,
             "-vf",f"setpts=PTS/{speed},fps=30,format=yuv420p",
             "-an","-c:v","libx264","-preset","veryfast","-crf","18",v_raw])
    dv, da = probe(v_raw), probe(a_path)
    T = max(dv, da) + 0.5
    out = f"{C}/s{i:02d}.mp4"
    run(["ffmpeg","-y","-v","error","-i",v_raw,"-i",a_path,"-filter_complex",
         f"[0:v]tpad=stop_mode=clone:stop_duration={max(0,T-dv):.2f}[v];"
         f"[1:a]apad=whole_dur={T:.2f}[a]",
         "-map","[v]","-map","[a]","-c:v","libx264","-preset","veryfast",
         "-crf","18","-c:a","aac","-b:a","128k","-ar","44100","-t",f"{T:.2f}",out])
    seg_files.append(out)
    print(f"seg{i:02d} -> {T:.1f}s", flush=True)

with open(f"{C}/list.txt","w") as f:
    for p in seg_files: f.write(f"file '{p}'\n")
final = "/home/hatch/workspace/your_files/课搭AI校园平台3分钟营销版-纯净版.mp4"
run(["ffmpeg","-y","-v","error","-f","concat","-safe","0","-i",f"{C}/list.txt",
     "-c:v","libx264","-preset","medium","-crf","20",
     "-c:a","aac","-b:a","128k",final])
print(f"DONE: {probe(final):.0f}s, {os.path.getsize(final)/1e6:.1f}MB")
