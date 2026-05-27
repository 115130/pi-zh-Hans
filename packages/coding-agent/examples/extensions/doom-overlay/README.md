# DOOM 覆盖层演示

在 pi 中作为覆盖层运行 DOOM。展示覆盖系统能够以 35 FPS 实时渲染游戏的能力。

## 使用方法

```bash
pi --extension ./examples/extensions/doom-overlay
```

然后运行：
```
/doom-overlay
```

共享版 WAD 文件（约 4MB）会在首次运行时自动下载。

## 控制

| 操作 | 按键 |
|------|------|
| 移动 | W A S D 或方向键 |
| 奔跑 | Shift + W A S D |
| 开火 | F 或 Ctrl |
| 使用/开门 | 空格键 |
| 武器 | 1-7 |
| 地图 | Tab |
| 菜单 | Escape |
| 暂停/退出 | Q |

## 工作原理

DOOM 作为从 [doomgeneric](https://github.com/ozkl/doomgeneric) 编译的 WebAssembly 运行。每一帧使用半块字符（▀）和 24 位颜色渲染，其中上半像素为前景色，下半像素为背景色。

覆盖层使用：
- `width: "90%"` - 终端宽度的 90%
- `maxHeight: "80%"` - 终端高度的最大 80%
- `anchor: "center"` - 在终端中居中

高度根据宽度计算，以保持 DOOM 的 3.2:1 宽高比（考虑半块渲染）。

## 致谢

- [id Software](https://github.com/id-Software/DOOM) 提供原始 DOOM
- [doomgeneric](https://github.com/ozkl/doomgeneric) 提供可移植的 DOOM 实现
- [pi-doom](https://github.com/badlogic/pi-doom) 提供原始的 pi 集成
