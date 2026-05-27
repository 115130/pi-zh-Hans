/**
 * 用于扩展的多行编辑器组件。
 * 支持 Ctrl+G 打开外部编辑器。
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	Container,
	Editor,
	type EditorOptions,
	type Focusable,
	getKeybindings,
	Spacer,
	Text,
	type TUI,
} from "@earendil-works/pi-tui";
import type { KeybindingsManager } from "../../../core/keybindings.ts";
import { getEditorTheme, theme } from "../theme/theme.ts";
import { DynamicBorder } from "./dynamic-border.ts";
import { keyHint } from "./keybinding-hints.ts";

export class ExtensionEditorComponent extends Container implements Focusable {
	private editor: Editor;
	private onSubmitCallback: (value: string) => void;
	private onCancelCallback: () => void;
	private tui: TUI;
	private keybindings: KeybindingsManager;

	private _focused = false;
	get focused(): boolean {
		return this._focused;
	}
	set focused(value: boolean) {
		this._focused = value;
		this.editor.focused = value;
	}

	constructor(
		tui: TUI,
		keybindings: KeybindingsManager,
		title: string,
		prefill: string | undefined,
		onSubmit: (value: string) => void,
		onCancel: () => void,
		options?: EditorOptions,
	) {
		super();

		this.tui = tui;
		this.keybindings = keybindings;
		this.onSubmitCallback = onSubmit;
		this.onCancelCallback = onCancel;

		// 添加上边框
		this.addChild(new DynamicBorder());
		this.addChild(new Spacer(1));

		// 添加标题
		this.addChild(new Text(theme.fg("accent", title), 1, 0));
		this.addChild(new Spacer(1));

		// 创建编辑器
		this.editor = new Editor(tui, getEditorTheme(), options);
		if (prefill) {
			this.editor.setText(prefill);
		}
		// 绑定 Enter 键提交（Shift+Enter 换行，与主编辑器一致）
		this.editor.onSubmit = (text: string) => {
			this.onSubmitCallback(text);
		};
		this.addChild(this.editor);

		this.addChild(new Spacer(1));

		// 添加提示
		const hasExternalEditor = !!(process.env.VISUAL || process.env.EDITOR);
		const hint =
			keyHint("tui.select.confirm", "提交") +
			"  " +
			keyHint("tui.input.newLine", "换行") +
			"  " +
			keyHint("tui.select.cancel", "取消") +
			(hasExternalEditor ? `  ${keyHint("app.editor.external", "外部编辑器")}` : "");
		this.addChild(new Text(hint, 1, 0));

		this.addChild(new Spacer(1));

		// 添加底边框
		this.addChild(new DynamicBorder());
	}

	handleInput(keyData: string): void {
		const kb = getKeybindings();
		// Escape 或 Ctrl+C 取消
		if (kb.matches(keyData, "tui.select.cancel")) {
			this.onCancelCallback();
			return;
		}

		// 外部编辑器（应用按键绑定）
		if (this.keybindings.matches(keyData, "app.editor.external")) {
			this.openExternalEditor();
			return;
		}

		// 转发给编辑器
		this.editor.handleInput(keyData);
	}

	private async openExternalEditor(): Promise<void> {
		const editorCmd = process.env.VISUAL || process.env.EDITOR;
		if (!editorCmd) {
			return;
		}

		const currentText = this.editor.getText();
		const tmpFile = path.join(os.tmpdir(), `pi-extension-editor-${Date.now()}.md`);

		try {
			fs.writeFileSync(tmpFile, currentText, "utf-8");
			this.tui.stop();

			const [editor, ...editorArgs] = editorCmd.split(" ");
			process.stdout.write(`正在启动外部编辑器：${editorCmd}\n编辑器退出后 Pi 将继续运行。\n`);

			// 不要在此使用 spawnSync。在 Windows 上，同步子进程调用可能会在 tui.stop() 暂停 stdin 后仍保持
			// Node/libuv 控制台输入读取活跃，与 vim/nvim 竞争控制台输入缓冲区，直到 Ctrl+C 取消待处理的读取。
			const status = await new Promise<number | null>((resolve) => {
				const child = spawn(editor, [...editorArgs, tmpFile], {
					stdio: "inherit",
					shell: process.platform === "win32",
				});
				child.on("error", () => resolve(null));
				child.on("close", (code) => resolve(code));
			});

			if (status === 0) {
				const newContent = fs.readFileSync(tmpFile, "utf-8").replace(/\n$/, "");
				this.editor.setText(newContent);
			}
		} finally {
			try {
				fs.unlinkSync(tmpFile);
			} catch {
				// 忽略清理错误
			}
			this.tui.start();
			// 外部编辑器使用了备用屏幕，强制完全重新渲染
			this.tui.requestRender(true);
		}
	}
}
