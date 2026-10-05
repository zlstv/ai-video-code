#!/usr/bin/env python3
"""课搭AI校园平台 3分钟介绍视频合成脚本."""
import json, os, subprocess, math

BASE = os.path.expanduser("~/workspace/video-ketaplat")
SHOTS, AUDIO, BUILD = f"{BASE}/shots", f"{BASE}/audio", f"{BASE}/build"
OUT = os.path.expanduser("~/workspace/your_files/ketaplat-intro-3min.mp4")
FPS, W, H = 30, 1920, 1080
GAP = 0.4          # 分镜间气口
INTRO_D, OUTRO_D = 2.5, 3.5

def dur(path):
    r = subprocess.run(["ffprobe","-v","error","-show_entries","format=duration",
                        "-of","csv=p=0",path], capture_output=True, text=True)
    return float(r.stdout.strip())

def read_text(n):
    with open(f"{BASE}/script/scene-{n}.txt", encoding="utf-8") as f:
        return f.read().strip()

# 分镜: (scene_no, [(image, motion, share), ...])  share 为时长占比
PLAN = [
    (1, [("home-hero.png","zin",0.5), ("home-dialog.png","panr",0.5)]),
    (2, [("home-roles.png","zout",1.0)]),
    (3, [("home-workbench-banner.png","zin",0.25),
         ("home-8funcs.png","zin2",0.375), ("home-8funcs.png","panl",0.375)]),
    (4, [("home-manage.png","zin",1.0)]),
    (5, [("plaza-list.png","zout",1.0)]),
    (6, [("auth-login.png","zin",0.5), ("auth-signup.png","zout",0.5)]),
    (7, [("contact.png","zout",1.0)]),
]

def motion_filter(motion, frames):
    if motion == "zin":   # 缓慢推近
        return f"zoompan=z='min(1.0+0.12*on/{frames},1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s={W}x{H}:fps={FPS}"
    if motion == "zin2":  # 推近(幅度稍大)
        return f"zoompan=z='min(1.05+0.15*on/{frames},1.20)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s={W}x{H}:fps={FPS}"
    if motion == "zout":   # 缓慢拉远
        return f"zoompan=z='max(1.18-0.13*on/{frames},1.05)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s={W}x{H}:fps={FPS}"
    if motion == "panr":   # 右移
        return f"zoompan=z='1.15':x='(iw-iw/zoom)*on/{frames}':y='ih/2-(ih/zoom/2)':d={frames}:s={W}x{H}:fps={FPS}"
    if motion == "panl":   # 左移
        return f"zoompan=z='1.15':x='(iw-iw/zoom)*(1-on/{frames})':y='ih/2-(ih/zoom/2)':d={frames}:s={W}x{H}:fps={FPS}"
    raise ValueError(motion)

def render_clip(img, motion, seconds, out):
    frames = max(1, round(seconds*FPS))
    vf = f"scale=2400:-1,{motion_filter(motion,frames)},format=yuv420p"
    subprocess.run(["ffmpeg","-y","-v","error","-loop","1","-framerate",str(FPS),
                    "-i",f"{SHOTS}/{img}","-vf",vf,"-frames:v",str(frames),
                    "-c:v","libx264","-preset","medium","-crf","20",out], check=True)

def main():
    os.makedirs(BUILD, exist_ok=True)
    aud_d = {n: dur(f"{AUDIO}/scene-{n}.mp3") for n in range(1,8)}
    print("audio durations:", aud_d, "total:", sum(aud_d.values()))

    # 1) 渲染各分镜视频片段
    clips, starts, t = [], {}, 0.0
    for n, shots in PLAN:
        total = aud_d[n] + (GAP if n < 7 else 0.0)
        starts[n] = t
        for i,(img,motion,share) in enumerate(shots):
            secs = total*share if i < len(shots)-1 else total - sum(total*s for _,_,s in shots[:i])
            out = f"{BUILD}/clip-{n}-{i}.mp4"
            render_clip(img, motion, secs, out)
            clips.append(out)
        t += total

    # 2) 生成字幕 SRT (按字符数分配时长)
    srt = []
    idx = 1
    for n, _ in PLAN:
        text = read_text(n)
        # 按标点切成短句,再打包成每卡<=38字
        import re
        sents = [s for s in re.split(r'(?<=[。！？；])', text) if s.strip()]
        cards, cur = [], ""
        for s in sents:
            if len(cur)+len(s) <= 38: cur += s
            else:
                if cur: cards.append(cur)
                cur = s
        if cur: cards.append(cur)
        total_chars = sum(len(c) for c in cards)
        st = starts[n]
        for c in cards:
            d = aud_d[n]*len(c)/total_chars
            srt.append((idx, st, st+d, c)); st += d; idx += 1
    def ts(x):
        ms = int(round(x*1000)); h,ms=divmod(ms,3600000); m,ms=divmod(ms,60000); s,ms=divmod(ms,1000)
        return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"
    with open(f"{BUILD}/subs.srt","w",encoding="utf-8") as f:
        for i,a,b,c in srt:
            # 超长卡片折成两行
            if len(c) > 20:
                mid = len(c)//2
                cut = max(c.rfind("，",0,mid+6), c.rfind("、",0,mid+6))
                if cut > 8: c = c[:cut+1]+"\n"+c[cut+1:]
            f.write(f"{i}\n{ts(a)} --> {ts(b)}\n{c}\n\n")
    print("subtitle cards:", len(srt))

    # 3) 拼接视频
    with open(f"{BUILD}/list.txt","w") as f:
        for c in clips: f.write(f"file '{c}'\n")
    subprocess.run(["ffmpeg","-y","-v","error","-f","concat","-safe","0",
                    "-i",f"{BUILD}/list.txt","-c","copy",f"{BUILD}/body.mp4"], check=True)

    # 4) 拼接音频(含气口静音)
    af = []
    SIL = "aevalsrc=0:d={}:s=24000:c=mono"
    af.append(SIL.format(INTRO_D))
    for n in range(1,8):
        af.append(f"{AUDIO}/scene-{n}.mp3")
        if n < 7: af.append(SIL.format(GAP))
    af.append(SIL.format(OUTRO_D))
    # 用 filter_complex 拼接
    inputs, fc, outs = [], [], []
    for j,a in enumerate(af):
        if a.endswith(".mp3"): inputs += ["-i", a]
        else: inputs += ["-f","lavfi","-i", a]
    n_in = len(af)
    fc = "".join(f"[{j}:a]" for j in range(n_in)) + f"concat=n={n_in}:v=0:a=1[a]"
    subprocess.run(["ffmpeg","-y","-v","error",*inputs,"-filter_complex",fc,
                    "-map","[a]","-c:a","aac","-b:a","128k",f"{BUILD}/full.m4a"], check=True)

    # 5) 片头片尾 + 字幕 + 混流 (4 inputs: intro/body/outro/audio)
    subprocess.run(["ffmpeg","-y","-v","error",
        "-loop","1","-i",f"{BUILD}/title_intro.png",
        "-i",f"{BUILD}/body.mp4",
        "-loop","1","-i",f"{BUILD}/title_outro.png",
        "-i",f"{BUILD}/full.m4a",
        "-filter_complex",
        f"[0:v]scale={W}:{H},format=yuv420p,trim=duration={INTRO_D},setpts=PTS-STARTPTS[pre];"
        f"[2:v]scale={W}:{H},format=yuv420p,trim=duration={OUTRO_D},setpts=PTS-STARTPTS[post];"
        f"[pre][1:v][post]concat=n=3:v=1:a=0[vcat];"
        f"[vcat]subtitles={BUILD}/subs.srt:fontsdir='/usr/share/fonts/opentype/noto':"
        f"force_style='FontName=Noto Sans CJK SC,FontSize=22,PrimaryColour=&HFFFFFF,"
        f"OutlineColour=&H80000000,BorderStyle=1,Outline=2,Shadow=0,MarginV=45'[v]",
        "-map","[v]","-map","3:a",
        "-c:v","libx264","-preset","medium","-crf","20",
        "-c:a","copy","-movflags","+faststart",
        OUT], check=True)
    print("FINAL:", OUT)

if __name__ == "__main__":
    main()
