// 以下是翻译后的 TypeScript 文件，只翻译了 description、label、promptSnippet、promptGuidelines、
// 用户可见的错误消息、UI 文本等，未修改任何变量名、类型、import/export、技术术语或代码逻辑。

/**
 * Tic-Tac-Toe extension - demonstrates executionMode: "sequential" on tools.
 *
 * The user plays via /tic-tac-toe (arrow keys + Enter).
 * The agent plays via a single tool `tic_tac_toe` that takes ONE atomic action
 * per call. To play at (r, c) from its cursor (r0, c0) the agent must emit the
 * required move_* and a final `play` as SEPARATE tool_use blocks inside ONE
 * assistant response.
 *
 * Move actions share the agent cursor and have a 300ms delay. Under the
 * default parallel tool-execution mode this races: `play` can resolve before
 * the earlier `move_*` calls finish and O lands on the wrong cell. With
 * `executionMode: "sequential"` the runner serializes the sibling calls and O
 * lands on the intended cell.
 *
 * The user cursor (TUI-only) and the agent cursor (tool-only) are stored in
 * separate variables. Only the agent cursor is ever exposed to the agent.
 */

import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext, Theme, ToolExecutionMode } from "@earendil-works/pi-coding-agent";
import { type Component, matchesKey, Text, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";

// Thrown from the tool on illegal actions. The agent runtime surfaces thrown
// errors as tool errors (isError=true) without resetting any of our state.
class TicTacToeError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "TicTacToeError";
	}
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Cell = " " | "X" | "O";
type GameStatus = "playing" | "win_X" | "win_O" | "draw";

interface GameState {
	board: Cell[][];
	// User cursor (TUI-only, never exposed to the agent).
	userCursorRow: number;
	userCursorCol: number;
	// Agent cursor (manipulated by the tool, shown in the TUI during O's turn).
	agentCursorRow: number;
	agentCursorCol: number;
	status: GameStatus;
	userMark: Cell;
	agentMark: Cell;
	currentTurn: Cell;
}

// Persisted with each toolResult for state reconstruction AND sent to the
// agent as `details`. Only the agent cursor is included: the user cursor is
// private to the TUI.
interface BoardDetails {
	board: Cell[][];
	agentCursorRow: number;
	agentCursorCol: number;
	status: GameStatus;
	currentTurn: Cell;
}

// ---------------------------------------------------------------------------
// Game logic
// ---------------------------------------------------------------------------

// Agent cursor home: where the cursor is reset to after a SUCCESSFUL play.
// Pinned at (0,0) so every non-origin play requires at least one move, which
// guarantees multiple tool calls per turn and makes the parallel-vs-sequential
// behavior observable in the demo. The cursor is NOT reset when the user plays
// nor on a failed `play` (cell taken), so the agent can retry without
// starting over.
const AGENT_CURSOR_HOME_ROW = 0;
const AGENT_CURSOR_HOME_COL = 0;

function createInitialState(): GameState {
	return {
		board: [
			[" ", " ", " "],
			[" ", " ", " "],
			[" ", " ", " "],
		],
		userCursorRow: 1,
		userCursorCol: 1,
		agentCursorRow: AGENT_CURSOR_HOME_ROW,
		agentCursorCol: AGENT_CURSOR_HOME_COL,
		status: "playing",
		userMark: "X",
		agentMark: "O",
		currentTurn: "X",
	};
}

function getWinLine(board: Cell[][]): [number, number][] | null {
	const lines: [number, number][][] = [
		[
			[0, 0],
			[0, 1],
			[0, 2],
		],
		[
			[1, 0],
			[1, 1],
			[1, 2],
		],
		[
			[2, 0],
			[2, 1],
			[2, 2],
		],
		[
			[0, 0],
			[1, 0],
			[2, 0],
		],
		[
			[0, 1],
			[1, 1],
			[2, 1],
		],
		[
			[0, 2],
			[1, 2],
			[2, 2],
		],
		[
			[0, 0],
			[1, 1],
			[2, 2],
		],
		[
			[0, 2],
			[1, 1],
			[2, 0],
		],
	];
	for (const line of lines) {
		const vals = line.map(([r, c]) => board[r][c]);
		if (vals[0] !== " " && vals[0] === vals[1] && vals[1] === vals[2]) {
			return line;
		}
	}
	return null;
}

function checkWin(board: Cell[][]): GameStatus {
	const winLine = getWinLine(board);
	if (winLine) {
		const [r, c] = winLine[0];
		return board[r][c] === "X" ? "win_X" : "win_O";
	}
	if (board.every((row) => row.every((c) => c !== " "))) {
		return "draw";
	}
	return "playing";
}

function boardToAscii(board: Cell[][], agentCursorRow: number, agentCursorCol: number): string {
	// Plain grid with coordinates for empty cells, marking the agent cursor
	// position with angle brackets. The user cursor is NEVER included: it is a
	// TUI-only concept and must not leak to the agent.
	const rows = board.map((row, r) =>
		row
			.map((c, cIdx) => {
				const onCursor = r === agentCursorRow && cIdx === agentCursorCol;
				if (c === " ") return onCursor ? `<[${r},${cIdx}]>` : ` [${r},${cIdx}] `;
				return onCursor ? `   <${c}>   ` : `    ${c}    `;
			})
			.join("|"),
	);
	const separator = "---------+---------+---------";
	return rows.join(`\n${separator}\n`);
}

// ---------------------------------------------------------------------------
// Visual board rendering (ANSI).
// - Cells have NO background fill. Only the centered glyph is drawn.
// - Played cells color their glyph AND their surrounding borders in the
//   player's color, so each mark reads as a colored boxed region.
// - Cursor is indicated with colored borders around the cursor cell.
// ---------------------------------------------------------------------------

const CELL_WIDTH = 7;
const CELL_HEIGHT = 3;

// Player colors (SGR fg codes). Also used for the borders of played cells.
const FG_CODE_X = "34"; // blue
const FG_CODE_O = "33"; // yellow
const FG_CODE_WIN = "32"; // green (overrides on the winning line)

// Single-character glyphs, picked for maximum visual size without emoji.
// - \u2573 (BOX DRAWINGS LIGHT DIAGONAL CROSS) for X
// - \u25ef (LARGE CIRCLE) for O
const GLYPH_X = "\u2573";
const GLYPH_O = "\u25ef";

const DIM = (s: string) => `\x1b[2m${s}\x1b[22m`;
const RESET = "\x1b[0m";

function centerPad(content: string, width: number): string {
	const contentLen = visibleWidth(content);
	if (contentLen >= width) return truncateToWidth(content, width);
	const pad = width - contentLen;
	const left = Math.floor(pad / 2);
	return " ".repeat(left) + content + " ".repeat(pad - left);
}

// Fg color for a played cell's glyph and its surrounding borders. Undefined
// for empty cells.
function cellFgCode(cell: Cell, isWin: boolean): string | undefined {
	if (cell === " ") return undefined;
	if (isWin) return FG_CODE_WIN;
	return cell === "X" ? FG_CODE_X : FG_CODE_O;
}

function buildCellContent(mark: Cell, lineIdx: number, isWin: boolean): string {
	const empty = " ".repeat(CELL_WIDTH);
	if (mark === " ") return empty;

	const isMidLine = lineIdx === Math.floor(CELL_HEIGHT / 2);
	if (!isMidLine) return empty;

	const glyph = mark === "X" ? GLYPH_X : GLYPH_O;
	const fg = cellFgCode(mark, isWin) as string;
	const padLen = CELL_WIDTH - visibleWidth(glyph);
	const leftPad = Math.floor(padLen / 2);
	const rightPad = padLen - leftPad;
	return `${" ".repeat(leftPad)}\x1b[${fg};1m${glyph}${RESET}${" ".repeat(rightPad)}`;
}

// Fg color for a border char based on its adjacent cells. Undefined when no
// adjacent cell is played or when adjacent plays disagree (border stays dim
// to show the separation).
function borderFgCode(adjacent: ReadonlyArray<{ cell: Cell; isWin: boolean }>): string | undefined {
	const fgs = adjacent.map((a) => cellFgCode(a.cell, a.isWin)).filter((f): f is string => !!f);
	if (fgs.length === 0) return undefined;
	const first = fgs[0];
	return fgs.every((f) => f === first) ? first : undefined;
}

interface BoardRenderOpts {
	board: Cell[][];
	maxWidth: number;
	// Optional cursor overlay. Omit to render a static snapshot (used in tool
	// results, move messages, and the game-over banner).
	cursor?: { row: number; col: number; owner: "user" | "agent" };
}

function renderBoard(opts: BoardRenderOpts): string[] {
	const { board, maxWidth, cursor } = opts;
	const showCursor = !!cursor;
	const cr = cursor?.row ?? -1;
	const cc = cursor?.col ?? -1;

	// Green for user cursor, yellow for agent cursor.
	const cursorSgr = cursor?.owner === "agent" ? "\x1b[33;1m" : "\x1b[32;1m";

	const winLine = getWinLine(board);
	const winCells = new Set((winLine ?? []).map(([r, c]) => `${r},${c}`));
	const cellAt = (r: number, c: number) => ({ cell: board[r][c], isWin: winCells.has(`${r},${c}`) });

	const isCursorCorner = (gridR: number, gridC: number): boolean =>
		showCursor && (gridR === cr || gridR === cr + 1) && (gridC === cc || gridC === cc + 1);
	const isCursorHSegment = (gridR: number, c: number): boolean =>
		showCursor && c === cc && (gridR === cr || gridR === cr + 1);
	const isCursorVBorder = (r: number, gridC: number): boolean =>
		showCursor && r === cr && (gridC === cc || gridC === cc + 1);

	const paintBorder = (ch: string, highlighted: boolean, fgCode: string | undefined): string => {
		if (highlighted) return `${cursorSgr}${ch}${RESET}`;
		if (fgCode) return `\x1b[${fgCode};1m${ch}${RESET}`;
		return DIM(ch);
	};

	const cornerChar = (gridR: number, gridC: number): string => {
		if (gridR === 0 && gridC === 0) return "\u250c";
		if (gridR === 0 && gridC === 3) return "\u2510";
		if (gridR === 3 && gridC === 0) return "\u2514";
		if (gridR === 3 && gridC === 3) return "\u2518";
		if (gridR === 0) return "\u252c";
		if (gridR === 3) return "\u2534";
		if (gridC === 0) return "\u251c";
		if (gridC === 3) return "\u2524";
		return "\u253c";
	};

	const cornerAdjacent = (gridR: number, gridC: number) => {
		const out: { cell: Cell; isWin: boolean }[] = [];
		for (const [dr, dc] of [
			[-1, -1],
			[-1, 0],
			[0, -1],
			[0, 0],
		]) {
			const r = gridR + dr;
			const c = gridC + dc;
			if (r >= 0 && r < 3 && c >= 0 && c < 3) out.push(cellAt(r, c));
		}
		return out;
	};

	const lines: string[] = [];

	for (let gridR = 0; gridR <= 3; gridR++) {
		// Horizontal border row.
		let row = "";
		for (let gridC = 0; gridC <= 3; gridC++) {
			const cornerColor = borderFgCode(cornerAdjacent(gridR, gridC));
			row += paintBorder(cornerChar(gridR, gridC), isCursorCorner(gridR, gridC), cornerColor);
			if (gridC < 3) {
				const adj: { cell: Cell; isWin: boolean }[] = [];
				if (gridR > 0) adj.push(cellAt(gridR - 1, gridC));
				if (gridR < 3) adj.push(cellAt(gridR, gridC));
				const segColor = borderFgCode(adj);
				row += paintBorder("\u2500".repeat(CELL_WIDTH), isCursorHSegment(gridR, gridC), segColor);
			}
		}
		lines.push(centerPad(row, maxWidth));

		if (gridR === 3) break;

		for (let lineIdx = 0; lineIdx < CELL_HEIGHT; lineIdx++) {
			let contentRow = "";
			for (let gridC = 0; gridC <= 3; gridC++) {
				const adj: { cell: Cell; isWin: boolean }[] = [];
				if (gridC > 0) adj.push(cellAt(gridR, gridC - 1));
				if (gridC < 3) adj.push(cellAt(gridR, gridC));
				const vColor = borderFgCode(adj);
				contentRow += paintBorder("\u2502", isCursorVBorder(gridR, gridC), vColor);
				if (gridC < 3) {
					contentRow += buildCellContent(board[gridR][gridC], lineIdx, winCells.has(`${gridR},${gridC}`));
				}
			}
			lines.push(centerPad(contentRow, maxWidth));
		}
	}

	return lines;
}

// Full TUI board with the right cursor overlayed for the current turn.
function renderVisualBoard(state: GameState, maxWidth: number): string[] {
	const isUserTurn = state.currentTurn === state.userMark;
	const cursor =
		state.status !== "playing"
			? undefined
			: {
					row: isUserTurn ? state.userCursorRow : state.agentCursorRow,
					col: isUserTurn ? state.userCursorCol : state.agentCursorCol,
					owner: (isUserTurn ? "user" : "agent") as "user" | "agent",
				};
	return renderBoard({ board: state.board, maxWidth, cursor });
}

/** Static snapshot used inside tool results and custom messages. */
function renderBoardSnapshot(board: Cell[][], maxWidth: number): string[] {
	return renderBoard({ board, maxWidth });
}

// ---------------------------------------------------------------------------
// TUI component
// ---------------------------------------------------------------------------

class TicTacToeComponent implements Component {
	private state: GameState;
	private onClose: () => void;
	private onUserPlay: (row: number, col: number) => void;
	private tui: { requestRender: () => void };
	private cachedLines: string[] = [];
	private cachedWidth = 0;
	private version = 0;
	private cachedVersion = -1;

	constructor(
		tui: { requestRender: () => void },
		onClose: () => void,
		onUserPlay: (row: number, col: number) => void,
		state: GameState,
	) {
		this.tui = tui;
		this.onClose = onClose;
		this.onUserPlay = onUserPlay;
		this.state = state;
	}

	updateState(state: GameState): void {
		this.state = state;
		this.version++;
		this.tui.requestRender();
	}

	handleInput(data: string): boolean {
		if (matchesKey(data, "escape") || data === "q" || data === "Q") {
			this.onClose();
			return true;
		}
		if (this.state.status !== "playing") {
			if (data === "r" || data === "R") {
				this.onClose();
				return true;
			}
			return true;
		}
		if (this.state.currentTurn !== this.state.userMark) return true;

		if (matchesKey(data, "up") && this.state.userCursorRow > 0) {
			this.state.userCursorRow--;
			this.version++;
			this.tui.requestRender();
		} else if (matchesKey(data, "down") && this.state.userCursorRow < 2) {
			this.state.userCursorRow++;
			this.version++;
			this.tui.requestRender();
		} else if (matchesKey(data, "left") && this.state.userCursorCol > 0) {
			this.state.userCursorCol--;
			this.version++;
			this.tui.requestRender();
		} else if (matchesKey(data, "right") && this.state.userCursorCol < 2) {
			this.state.userCursorCol++;
			this.version++;
			this.tui.requestRender();
		} else if (matchesKey(data, "return") || data === " ") {
			const { userCursorRow, userCursorCol } = this.state;
			if (this.state.board[userCursorRow][userCursorCol] === " ") {
				this.onUserPlay(userCursorRow, userCursorCol);
			}
		}
		return true;
	}

	invalidate(): void {
		this.cachedWidth = 0;
	}

	render(width: number): string[] {
		if (width === this.cachedWidth && this.cachedVersion === this.version) {
			return this.cachedLines;
		}

		const ESC = "\x1b[";
		const reset = `${ESC}0m`;
		const bold = (s: string) => `${ESC}1m${s}${reset}`;
		const dim = (s: string) => `${ESC}2m${s}${reset}`;
		const blue = (s: string) => `${ESC}34m${s}${reset}`;
		const yellow = (s: string) => `${ESC}33m${s}${reset}`;
		const green = (s: string) => `${ESC}32m${s}${reset}`;

		const lines: string[] = [];

		// Top title banner, full width.
		const titleText = " 井字棋 ";
		const titleLen = visibleWidth(titleText); // visibleWidth should handle Chinese characters correctly
		const borderLen = Math.max(0, width - titleLen);
		const leftBorder = Math.floor(borderLen / 2);
		const rightBorder = borderLen - leftBorder;
		lines.push(dim("\u2500".repeat(leftBorder)) + bold(blue(titleText)) + dim("\u2500".repeat(rightBorder)));

		lines.push("");

		// Status line.
		if (this.state.status !== "playing") {
			const statusText =
				this.state.status === "draw"
					? bold(yellow("平局！"))
					: this.state.status === "win_X"
						? bold(green("X 获胜！"))
						: bold(yellow("O 获胜！"));
			lines.push(centerPad(statusText, width));
		} else if (this.state.currentTurn === "X") {
			lines.push(centerPad(`回合：${bold(blue("X"))}（你）  ${dim("|")}  ${bold(yellow("O"))}（Agent）`, width));
		} else {
			lines.push(centerPad(`${blue("X")}（你）  ${dim("|")}  回合：${bold(yellow("O"))}（Agent）`, width));
		}

		lines.push("");
		lines.push("");

		lines.push(...renderVisualBoard(this.state, width));

		lines.push("");
		lines.push("");

		// Footer.
		let footer: string;
		if (this.state.status !== "playing") {
			footer = `${bold("R")} 重新开始  ${dim("|")}  ${bold("Q")}/${bold("ESC")} 退出`;
		} else if (this.state.currentTurn !== this.state.userMark) {
			footer = dim("Agent 正在思考...");
		} else {
			footer = `${bold("\u2190\u2191\u2193\u2192")} 移动  ${dim("|")}  ${bold("ENTER")} 落子  ${dim("|")}  ${bold("ESC")} 退出`;
		}
		lines.push(centerPad(footer, width));

		// Bottom separator between the component and the editor below.
		lines.push("");
		lines.push(dim("\u2500".repeat(width)));

		this.cachedLines = lines;
		this.cachedWidth = width;
		this.cachedVersion = this.version;
		return lines;
	}
}

// ---------------------------------------------------------------------------
// Move-message renderer (full width banner)
// ---------------------------------------------------------------------------

// Full-width banner message with an optional board snapshot underneath.
class BannerMessageComponent implements Component {
	private readonly title: string;
	private readonly details: BoardDetails | undefined;
	private readonly expanded: boolean;
	private readonly theme: Theme;

	constructor(title: string, details: BoardDetails | undefined, expanded: boolean, theme: Theme) {
		this.title = title;
		this.details = details;
		this.expanded = expanded;
		this.theme = theme;
	}

	invalidate(): void {}

	render(width: number): string[] {
		const dim = (s: string) => this.theme.fg("dim", s);
		const lines: string[] = [];
		const titleLen = visibleWidth(this.title);
		const fillLen = Math.max(0, width - titleLen - 2);
		const leftFill = Math.floor(fillLen / 2);
		const rightFill = fillLen - leftFill;
		lines.push(`${dim("\u2500".repeat(leftFill))} ${this.title} ${dim("\u2500".repeat(rightFill))}`);

		if (this.expanded && this.details) {
			lines.push("");
			lines.push(...renderBoardSnapshot(this.details.board, width));
		}

		return lines;
	}
}

// End-of-game banner: two dim hrs, a big colored title line, and the final
// board with the winning line highlighted.
class GameOverMessageComponent implements Component {
	private readonly status: GameStatus;
	private readonly details: BoardDetails | undefined;
	private readonly theme: Theme;

	constructor(status: GameStatus, details: BoardDetails | undefined, theme: Theme) {
		this.status = status;
		this.details = details;
		this.theme = theme;
	}

	invalidate(): void {}

	render(width: number): string[] {
		const dim = (s: string) => this.theme.fg("dim", s);
		const bold = (s: string) => this.theme.bold(s);

		const hr = dim("\u2500".repeat(width));
		const lines: string[] = [];
		lines.push(hr);
		lines.push("");

		let title: string;
		let sub: string;
		switch (this.status) {
			case "win_X":
				title = bold(this.theme.fg("accent", "\u2605 玩家 X 获胜 \u2605"));
				sub = "你击败了 Agent。";
				break;
			case "win_O":
				title = bold(this.theme.fg("warning", "\u2605 玩家 O 获胜 \u2605"));
				sub = "Agent 击败了你。";
				break;
			case "draw":
				title = bold(this.theme.fg("muted", "\u2014 平局 \u2014"));
				sub = "没有赢家。";
				break;
			default:
				title = bold("游戏结束");
				sub = "";
				break;
		}

		for (const line of [title, dim(sub)]) {
			const pad = Math.max(0, width - visibleWidth(line));
			lines.push(`${" ".repeat(Math.floor(pad / 2))}${line}`);
		}

		lines.push("");
		if (this.details) {
			lines.push(...renderBoardSnapshot(this.details.board, width));
			lines.push("");
		}
		lines.push(hr);

		return lines;
	}
}

// ---------------------------------------------------------------------------
// Delay helper
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

const SAVE_TYPE = "tic-tac-toe-save";
const MOVE_MESSAGE_TYPE = "tic-tac-toe-move";
const GAME_OVER_MESSAGE_TYPE = "tic-tac-toe-game-over";

let gameState: GameState = createInitialState();
let component: TicTacToeComponent | null = null;
let gameActive = false;

function reconstructState(ctx: ExtensionContext): void {
	gameState = createInitialState();
	gameActive = false;

	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type !== "message") continue;
		const msg = entry.message;
		if (msg.role !== "toolResult") continue;
		if (msg.toolName !== "tic_tac_toe" && msg.toolName !== "tic_tac_toe_see_board") continue;

		const details = msg.details as BoardDetails | undefined;
		if (details) {
			gameState.board = details.board.map((row) => [...row]);
			gameState.agentCursorRow = details.agentCursorRow;
			gameState.agentCursorCol = details.agentCursorCol;
			gameState.status = details.status;
			gameState.currentTurn = details.currentTurn;
		}
	}
}

function getBoardDetails(): BoardDetails {
	return {
		board: gameState.board.map((row) => [...row]),
		agentCursorRow: gameState.agentCursorRow,
		agentCursorCol: gameState.agentCursorCol,
		status: gameState.status,
		currentTurn: gameState.currentTurn,
	};
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => reconstructState(ctx));
	pi.on("session_tree", async (_event, ctx) => reconstructState(ctx));

	// Sent once per game at end-of-game. The custom renderer paints the banner;
	// `content` is a plain-text fallback for any non-TUI consumer and for the
	// LLM (in case the message ends up in future context).
	const emitGameOverMessage = (): void => {
		const label =
			gameState.status === "win_X"
				? "玩家 X（人类）获胜"
				: gameState.status === "win_O"
					? "玩家 O（Agent）获胜"
					: gameState.status === "draw"
						? "平局"
						: "游戏结束";
		pi.sendMessage({
			customType: GAME_OVER_MESSAGE_TYPE,
			content: `游戏结束：${label}。`,
			display: true,
			details: getBoardDetails(),
		});
	};

	// -----------------------------------------------------------------------
	// Custom message renderer for user move messages
	// -----------------------------------------------------------------------
	pi.registerMessageRenderer(MOVE_MESSAGE_TYPE, (message, { expanded }, theme) => {
		const details = message.details as BoardDetails | undefined;
		const turnLabel =
			details?.currentTurn === "O"
				? `${theme.fg("warning", theme.bold("O"))}（Agent）`
				: `${theme.fg("accent", theme.bold("X"))}（你）`;
		const title = `${theme.fg("accent", theme.bold("玩家 X 落子"))}  ${theme.fg("dim", "\u2192")}  下一手：${turnLabel}`;
		return new BannerMessageComponent(title, details, expanded, theme);
	});

	// -----------------------------------------------------------------------
	// Custom message renderer for game-over messages
	// -----------------------------------------------------------------------
	pi.registerMessageRenderer(GAME_OVER_MESSAGE_TYPE, (message, _options, theme) => {
		const details = message.details as BoardDetails | undefined;
		const status = (details?.status ?? "draw") as GameStatus;
		return new GameOverMessageComponent(status, details, theme);
	});

	// -----------------------------------------------------------------------
	// before_agent_start - inject game instructions each turn
	// -----------------------------------------------------------------------
	pi.on("before_agent_start", async (event) => {
		if (!gameActive) return undefined;

		const instructions = `

## Tic-Tac-Toe (you are Player O)

A tic-tac-toe game is in progress. The human is Player X. You are Player O.
The human plays through a TUI; you play through the \`tic_tac_toe\` tool.

### Turn protocol

When the human plays, you receive a message that contains the cell X marked,
the full board, and YOUR cursor position (Player O's cursor). The message is
the source of truth for the board.

Player O's cursor persists between O turns. It is reset to (row=${AGENT_CURSOR_HOME_ROW}, col=${AGENT_CURSOR_HOME_COL})
only after a successful \`play\`. If a \`play\` fails (cell already taken), the
cursor stays where it was, so you can move and retry.

You may also call \`tic_tac_toe_see_board\` if you want the current board and
your cursor position restated at any point. The user's cursor is private and
is never shown to you.

### The tool

\`tic_tac_toe\` takes ONE action per call:
- \`move_up\` / \`move_down\` / \`move_left\` / \`move_right\`: move YOUR cursor one cell (clamped at edges)
- \`play\`: place O on the cell under YOUR cursor. Errors if the cell is not empty.

There is no batched form. One call = one action.

### CRITICAL: emit the whole turn in a single response

To play at (r, c) from your cursor (r0, c0) emit, in order:
- \`move_down\` (r - r0) times (or \`move_up\` (r0 - r) times if r < r0)
- \`move_right\` (c - c0) times (or \`move_left\` (c0 - c) times if c < c0)
- one call of \`play\`

All of these tool calls MUST be emitted in the SAME assistant response, as
separate tool_use blocks, before you stop. Do not:
- split the sequence across multiple assistant responses,
- wait for a move result before emitting the next move or \`play\`,
- write any explanation or text between the tool calls,
- call any other tool during your turn (except \`tic_tac_toe_see_board\` when you
  explicitly need the state restated).

Decide the target cell first, then dump every action for the turn in one go.

### Examples (cursor starts at (${AGENT_CURSOR_HOME_ROW}, ${AGENT_CURSOR_HOME_COL}))

- Target (0,0): one call, \`play\`.
- Target (0,2): \`move_right\`, \`move_right\`, \`play\`. Three calls, one response.
- Target (1,1): \`move_down\`, \`move_right\`, \`play\`. Three calls, one response.
- Target (2,2): \`move_down\`, \`move_down\`, \`move_right\`, \`move_right\`, \`play\`. Five calls, one response.

### Strategy

1. If you have two O's in a line with the third cell empty, win by playing there.
2. Otherwise, if X has two in a line with the third cell empty, block there.
3. Otherwise, prefer center, then corners, then edges.
`;

		return {
			systemPrompt: event.systemPrompt + instructions,
		};
	});

	// -----------------------------------------------------------------------
	// /tic-tac-toe command
	// -----------------------------------------------------------------------
	pi.registerCommand("tic-tac-toe", {
		description: "与 Agent 玩井字棋",

		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("井字棋需要交互模式", "error");
				return;
			}

			reconstructState(ctx);
			if (gameState.status !== "playing") {
				gameState = createInitialState();
			}
			gameActive = true;
			pi.setSessionName("Tic-Tac-Toe");

			await ctx.ui.custom<void>((tui, _theme, _kb, done) => {
				component = new TicTacToeComponent(
					tui,
					() => {
						component = null;
						gameActive = false;
						done(undefined);
					},
					(row, col) => {
						gameState.board[row][col] = gameState.userMark;
						gameState.status = checkWin(gameState.board);
						if (gameState.status === "playing") {
							gameState.currentTurn = gameState.agentMark;
						}
						component?.updateState(gameState);
						pi.appendEntry(SAVE_TYPE, getBoardDetails());

						if (gameState.status === "playing") {
							// IMPORTANT: user play does NOT touch the agent cursor.
							// The agent cursor is only reset after a successful agent play.
							const boardAscii = boardToAscii(
								gameState.board,
								gameState.agentCursorRow,
								gameState.agentCursorCol,
							);
							pi.sendMessage(
								{
									customType: MOVE_MESSAGE_TYPE,
									content:
										`玩家 X 在 (行=${row}, 列=${col}) 落子。现在轮到玩家 O。\n\n` +
										`棋盘（你的光标用 < > 标记）：\n${boardAscii}\n\n` +
										`你的光标位于 (行=${gameState.agentCursorRow}, 列=${gameState.agentCursorCol})。` +
										`决定你的目标格子，然后在此响应中依次发出每个 move_* 和最终的 play 作为单独的 tic_tac_toe 工具调用。`,
									display: true,
									details: getBoardDetails(),
								},
								{ triggerTurn: true },
							);
						} else {
							emitGameOverMessage();
							gameActive = false;
						}
					},
					gameState,
				);
				return component;
			});
		},
	});

	// -----------------------------------------------------------------------
	// tic_tac_toe tool - one action per call.
	// -----------------------------------------------------------------------

	type Action = "move_up" | "move_down" | "move_left" | "move_right" | "play";

	const ACTION_DELAYS: Record<Action, number> = {
		move_up: 300,
		move_down: 300,
		move_left: 300,
		move_right: 300,
		play: 0,
	};

	pi.registerTool({
		name: "tic_tac_toe",
		label: "井字棋",
		description:
			"作为玩家 O 执行一个井字棋操作。`action` 必须是以下之一：move_up, move_down, move_left, move_right（将你的光标移动一格，边缘处会卡住），或 play（在光标位置放置 O；如果格子不为空则报错）。没有批量形式。要从当前光标位置 (r0, c0) 落到 (r, c)，请在同一个 assistant 响应中依次发出必要的 move_down/move_up 和 move_right/move_left 调用，然后是 play，每个都是单独的 tool_use 块。不要将序列拆分成多个响应，也不要等待前一个调用的结果再发出下一个调用。你的光标位置在回合之间保持不变，只有在成功 play 后才会重置到 (0,0)。",
		promptSnippet: "作为玩家 O 执行一个井字棋动作（move_up/down/left/right 或 play）",
		promptGuidelines: [
			"当轮到你的井字棋回合时，先决定目标格子，然后在一个单独的 assistant 响应中依次发出每个 move_* 和最终的 play 作为单独的 tic_tac_toe 工具调用。切勿将序列拆分到多个响应中或等待中间结果。",
			"永远不要向用户询问棋盘。棋盘和你的光标位置已包含在用户的移动消息中；如果你需要重新查看，可以使用 tic_tac_toe_see_board。",
		],
		parameters: Type.Object({
			action: StringEnum(["move_up", "move_down", "move_left", "move_right", "play"] as const, {
				description: "本次调用要执行的单个操作。在同一个响应中发出多个 tic_tac_toe 调用以串联操作。",
			}),
		}),
		executionMode: "sequential" as ToolExecutionMode,

		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const actionDelay = ACTION_DELAYS[params.action];
			if (actionDelay > 0) await delay(actionDelay);

			let result: string;

			switch (params.action) {
				case "move_up":
					if (gameState.agentCursorRow > 0) gameState.agentCursorRow--;
					result = `向上移动。光标：(${gameState.agentCursorRow}, ${gameState.agentCursorCol})`;
					break;
				case "move_down":
					if (gameState.agentCursorRow < 2) gameState.agentCursorRow++;
					result = `向下移动。光标：(${gameState.agentCursorRow}, ${gameState.agentCursorCol})`;
					break;
				case "move_left":
					if (gameState.agentCursorCol > 0) gameState.agentCursorCol--;
					result = `向左移动。光标：(${gameState.agentCursorRow}, ${gameState.agentCursorCol})`;
					break;
				case "move_right":
					if (gameState.agentCursorCol < 2) gameState.agentCursorCol++;
					result = `向右移动。光标：(${gameState.agentCursorRow}, ${gameState.agentCursorCol})`;
					break;
				case "play": {
					if (gameState.status !== "playing") {
						throw new TicTacToeError(`游戏已结束（${gameState.status}）。`);
					}
					if (gameState.currentTurn !== gameState.agentMark) {
						throw new TicTacToeError("现在不是你的回合。");
					}
					const r = gameState.agentCursorRow;
					const c = gameState.agentCursorCol;
					if (gameState.board[r][c] !== " ") {
						// Do NOT reset the cursor on failure. The agent can retry
						// from the cursor's current position.
						component?.updateState(gameState);
						pi.appendEntry(SAVE_TYPE, getBoardDetails());
						throw new TicTacToeError(
							`格子 (${r},${c}) 已被 ${gameState.board[r][c]} 占据。你的光标仍在 (${r},${c})。请移动到空格子并重试落子。`,
						);
					}
					gameState.board[r][c] = gameState.agentMark;
					gameState.status = checkWin(gameState.board);
					// Reset agent cursor to home ONLY on successful play.
					gameState.agentCursorRow = AGENT_CURSOR_HOME_ROW;
					gameState.agentCursorCol = AGENT_CURSOR_HOME_COL;
					if (gameState.status === "playing") {
						gameState.currentTurn = gameState.userMark;
						result = `已在 (${r},${c}) 放置 O。光标重置到 (${AGENT_CURSOR_HOME_ROW},${AGENT_CURSOR_HOME_COL})。轮到你了 X！`;
					} else if (gameState.status === "win_O") {
						result = `已在 (${r},${c}) 放置 O。玩家 O 获胜！`;
						gameActive = false;
						emitGameOverMessage();
					} else if (gameState.status === "draw") {
						result = `已在 (${r},${c}) 放置 O。平局！`;
						gameActive = false;
						emitGameOverMessage();
					} else {
						result = `已在 (${r},${c}) 放置 O。`;
					}
					break;
				}
			}

			component?.updateState(gameState);
			pi.appendEntry(SAVE_TYPE, getBoardDetails());

			return {
				content: [{ type: "text", text: result }],
				details: getBoardDetails(),
			};
		},

		renderCall(args, theme) {
			const action = typeof args.action === "string" ? args.action : "";
			return new Text(theme.fg("toolTitle", theme.bold("tic_tac_toe ")) + theme.fg("muted", action), 0, 0);
		},

		renderResult(result, { expanded }, theme, context) {
			const details = result.details as BoardDetails | undefined;
			const text = result.content[0];
			const msg = text?.type === "text" ? text.text : "";
			const prefix = context?.isError ? theme.fg("error", "\u2717 ") : theme.fg("success", "\u2713 ");
			const summary = prefix + theme.fg("muted", msg);

			if (expanded && details) {
				return new BannerMessageComponent(summary, details, true, theme);
			}
			return new Text(summary, 0, 0);
		},
	});

	// -----------------------------------------------------------------------
	// tic_tac_toe_see_board tool - inspect board + agent cursor.
	// -----------------------------------------------------------------------
	pi.registerTool({
		name: "tic_tac_toe_see_board",
		label: "查看棋盘",
		description:
			"返回当前的井字棋棋盘状态和你（玩家 O）的光标位置。不带参数。如果你需要在回合中重新查看当前状态（例如在落子失败后），可以使用此工具。用户的光标从不暴露。",
		promptSnippet: "查看井字棋棋盘和你的光标",
		parameters: Type.Object({}),

		async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
			const boardAscii = boardToAscii(gameState.board, gameState.agentCursorRow, gameState.agentCursorCol);
			const text =
				`棋盘（你的光标用 < > 标记）：\n${boardAscii}\n\n` +
				`你的光标：(行=${gameState.agentCursorRow}, 列=${gameState.agentCursorCol})\n` +
				`状态：${gameState.status}\n` +
				`当前回合：${gameState.currentTurn === gameState.agentMark ? "玩家 O（你）" : "玩家 X"}`;
			return {
				content: [{ type: "text", text }],
				details: getBoardDetails(),
			};
		},

		renderCall(_args, theme) {
			return new Text(theme.fg("toolTitle", theme.bold("tic_tac_toe_see_board")), 0, 0);
		},

		renderResult(result, { expanded }, theme) {
			const details = result.details as BoardDetails | undefined;
			const summary =
				theme.fg("success", "\u2713 ") +
				theme.fg("muted", `光标 (${details?.agentCursorRow ?? 0},${details?.agentCursorCol ?? 0})`);
			if (expanded && details) {
				return new BannerMessageComponent(summary, details, true, theme);
			}
			return new Text(summary, 0, 0);
		},
	});
}
