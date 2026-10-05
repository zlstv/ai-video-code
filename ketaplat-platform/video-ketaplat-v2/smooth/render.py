"""PIL sub-pixel Ken Burns renderer: affine transform with BICUBIC, no zoompan jitter."""
import sys, subprocess
from PIL import Image

W, H, FPS = 1920, 1080, 25

def motion_params(motion, t):
    # returns (zoom, cx_frac, cy_frac) at t in [0,1]; cx_frac in [0,1] of image
    if motion == "zin":   z = 1.0 + 0.09*t; c = (0.5, 0.5)
    elif motion == "zin2":z = 1.0 + 0.06*t; c = (0.5, 0.42)
    elif motion == "zout":z = 1.09 - 0.09*t; c = (0.5, 0.5)
    elif motion == "panr":z = 1.12; c = (0.5-0.04+0.08*t, 0.5)
    elif motion == "panl":z = 1.12; c = (0.5+0.04-0.08*t, 0.5)
    else: z = 1.0; c = (0.5, 0.5)
    return z, c[0], c[1]

def render_clip(img_path, motion, secs, out_path, quiet=True):
    src = Image.open(img_path).convert("RGB")
    sw, sh = src.size
    # normalize: work in source pixels; output maps to source window
    n = max(2, int(round(secs*FPS)))
    cmd = ["ffmpeg","-y","-v","error","-f","rawvideo","-pix_fmt","rgb24",
           "-s",f"{W}x{H}","-framerate",str(FPS),"-i","-",
           "-an","-c:v","libx264","-preset","medium","-crf","18",
           "-pix_fmt","yuv420p",out_path]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for i in range(n):
        t = i/(n-1)
        z, cxf, cyf = motion_params(motion, t)
        w = W/z * (sw/W)   # source-pixel window w (accounts for non-1920 sources)
        h = H/z * (sh/H)
        # keep aspect: source may not be exactly 16:9; fit window by height
        w = h*16/9
        cx, cy = cxf*sw, cyf*sh
        x0, y0 = cx-w/2, cy-h/2
        # clamp
        x0 = min(max(x0, 0), sw-w); y0 = min(max(y0, 0), sh-h)
        # output(px,py) -> input: ix = (w/W)*px + x0
        frame = src.transform((W,H), Image.AFFINE, (w/W, 0, x0, 0, h/H, y0), resample=Image.BICUBIC)
        p.stdin.write(frame.tobytes())
    p.stdin.close(); p.wait()
    if not quiet: print("wrote", out_path, n, "frames")

if __name__ == "__main__":
    render_clip(sys.argv[1], sys.argv[2], float(sys.argv[3]), sys.argv[4], quiet=False)
