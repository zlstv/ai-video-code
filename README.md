# ai-video-code

AI 制作视频的代码合集。每一个文件夹对应一支实际产出的视频，代码即"怎么做出这支视频"的完整记录。

> 成品视频（MP4 等大文件）不在本仓库，只收代码与脚本。

## 目录

| 文件夹 | 对应的视频 | 技术路线 |
|---|---|---|
| `ai-evolution-60s/` | 《AI 进化史》60 秒短片 | Puppeteer + Canvas 逐帧渲染 (`reel.js`/`cues.js`)，Web Audio 程序化配乐 (`music/score.mjs`) |
| `ai-history-60s/` | AI 简史倒叙 60 秒 | 同上，含分镜截图脚本 `stills.mjs` |
| `blog-opening/` | 个人博客 40 秒开场动画 | 纯前端代码实时渲染（Canvas / Three.js），`index.html` 即开即播 |
| `ketaplat-platform/ketaplat-60s/` | 课搭 AI 校园平台 60 秒版 | Canvas 动画 + 程序化配乐 |
| `ketaplat-platform/video-ketaplat-v1~v3/` | 课搭 AI 校园平台 3 分钟介绍视频（三版迭代） | Python + ffmpeg 合成 (`build.py` 系列)：字幕版 → 无字幕版 → 纯净版 |
| `video-skills/` | 短片动效技能库 | 做短视频沉淀下来的可复用技能模板：`kinetic-reel`（动效短片）、`painted-animation`（手绘风动画），含 `new_project.sh` 一键起新项目 |

## 怎么用

1. JS/Node 类项目：进对应目录 `npm install` 后按各目录 `STORYBOARD.md` / `README.md` 的说明渲染。
2. Python 类项目：`pip install` 所需依赖（ffmpeg 等），运行 `build.py`。
3. 想从零起一支新短片：看 `video-skills/` 的技能模板，用 `scripts/new_project.sh` 脚手架开新项目。

## 说明

- 代码由 AI 辅助生成与迭代，部分脚本为特定项目定制，直接复用前建议先读对应目录的 STORYBOARD / README。
- 不含任何账号、密钥与个人信息。
