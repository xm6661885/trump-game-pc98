# 中期选举夜骑 · Midterm Night Ride

粉色像素风跑酷小游戏。在线玩：https://xm6661885.github.io/trump-game-pc98/

## 玩法
- 空格 / ↑ / 点屏幕：跳；↓ / 下滑 / 「趴」：压低；P 暂停
- 选票收集、擦边连击（倍率最高 ×5）
- 道具：能量饮料（无敌）、护盾、沙漏（慢动作）、磁铁
- 每跑一段完成一个州，切换场景（投票站 / 街区 / 大桥 / 黎明）+ 计票冲刺（踩拍子、选票双倍）
- 新障碍：泥水坑、弹跳脑袋、先跳后趴组合；随机事件：雨夜、顺/逆风、操作反转
- 难度：休闲 / 标准 / 地狱；今日挑战（按日期定种子，所有人同一张图）
- 车库：车手和车皮肤按成绩解锁，可上传自己的照片当车手或障碍（自动抠图）
- 结算可生成像素风成绩海报

## 文件
```
index.html          页面结构
assets/style.css    样式（内嵌子集化像素字体）
assets/game.js      纯逻辑（可在 Node 里跑）
assets/main.js      渲染 / 音效 / UI
assets/images.js    所有图片素材（data URI，双击 index.html 也能玩）
assets/bgm.m4a      背景音乐
tests/fairness.test.cjs  公平性测试：node tests/fairness.test.cjs
tools/subset_font.py     改了文案后重新子集化字体
```
