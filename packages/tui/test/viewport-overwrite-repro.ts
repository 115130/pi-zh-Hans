/**
 * TUI 视口覆盖重现脚本
 *
 * 将此文件放在：packages/tui/test/viewport-overwrite-repro.ts
 * 从仓库根目录运行：npx tsx packages/tui/test/viewport-overwrite-repro.ts
 *
 * 为可靠重现，在小终端（8-12 行）或 tmux 会话中运行：
 *   tmux new-session -d -s tui-bug -x 80 -y 12
 *   tmux send-keys -t tui-bug "npx tsx packages/tui/test/viewport-overwrite-repro.ts" Enter
 *   tmux attach -t tui-bug
 *
 * 预期行为：
 * - PRE-TOOL 行在工具输出上方保持可见。
 * - POST-TOOL 行追加到工具输出之后，不会覆盖之前的内容。
 *
 * 实际行为（bug）：
 * - 当内容超出视口且新行在工具调用暂停后到达时，
 *   底部附近的某些 PRE-TOOL 行会被 POST-TOOL 行覆盖。
 */
import { ProcessTerminal } from "../src/terminal.ts";
import { type Component, TUI } from "../src/tui.ts";

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

class Lines implements Component {
	private lines: string[] = [];

	set(lines: string[]): void {
		this.lines = lines;
	}

	append(lines: string[]): void {
		this.lines.push(...lines);
	}

	render(width: number): string[] {
		return this.lines.map((line) => {
			if (line.length > width) return line.slice(0, width);
			return line.padEnd(width, " ");
		});
	}

	invalidate(): void {}
}

async function streamLines(buffer: Lines, label: string, count: number, delayMs: number, ui: TUI): Promise<void> {
	for (let i = 1; i <= count; i += 1) {
		buffer.append([`${label} ${String(i).padStart(2, "0")}`]);
		ui.requestRender();
		await sleep(delayMs);
	}
}

async function main(): Promise<void> {
	const ui = new TUI(new ProcessTerminal());
	const buffer = new Lines();
	ui.addChild(buffer);
	ui.start();

	const height = ui.terminal.rows;
	const preCount = height + 8; // 确保内容超出视口
	const toolCount = height + 12; // 工具输出进一步推入回滚缓冲区
	const postCount = 6;

	buffer.set([
		"TUI 视口覆盖重现脚本",
		`检测到的视口行数：${height}`,
		"（为最佳重现效果，将终端调整到 ~8-12 行）",
		"",
		"=== PRE-TOOL 流 ===",
	]);
	ui.requestRender();
	await sleep(300);

	// 阶段 1：流式输出 pre-tool 文本，直到超出视口。
	await streamLines(buffer, "PRE-TOOL 行", preCount, 30, ui);

	// 阶段 2：模拟工具调用暂停和工具输出。
	buffer.append(["", "--- 工具调用开始 ---", "（暂停...）", ""]);
	ui.requestRender();
	await sleep(700);

	await streamLines(buffer, "工具输出", toolCount, 20, ui);

	// 阶段 3：工具后的流式输出。这是覆盖通常出现的位置。
	buffer.append(["", "=== POST-TOOL 流 ==="]);
	ui.requestRender();
	await sleep(300);
	await streamLines(buffer, "POST-TOOL 行", postCount, 40, ui);

	// 让输出短暂可见，然后恢复终端状态。
	await sleep(1500);
	ui.stop();
}

main().catch((error) => {
	// 确保出错时终端恢复正常。
	try {
		const ui = new TUI(new ProcessTerminal());
		ui.stop();
	} catch {
		// 忽略恢复错误。
	}
	process.stderr.write(`${String(error)}\n`);
	process.exitCode = 1;
});
