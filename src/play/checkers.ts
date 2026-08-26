/**
 * CHECKERS.DLL `PlugProc` / `checkmove` (VA 0x10001000), from the
 * installed `Checkers.486.release.dll`.
 *
 * Scripts already own American-style movement (`goodmove` / `goodjump`
 * in PRP/_CHECKERS). This module is the native search + jump generator
 * the scripts call through `pluginfx("checkmove", board, lookahead, mode)`.
 *
 * Protocol (PlugProc opcode 2, then FUN_10001000):
 * - `board` is 64 space-separated cells: 0 empty, 1/2 him man/king,
 *   -1/-2 me man/king. Him sits on rows 0–2 and moves +row.
 * - `mode` 0 = him (AI, maximise). `mode` 1 = me (player list, minimise).
 * - `lookahead` 0 returns the first legal move (jumps before steps).
 *   Depth > 0 is full minimax, no alpha-beta. Equal scores keep the
 *   first move in scan order (row 0..7, col 0..7, codes 1..4 then 5..8).
 * - Return is concatenated `row col code` triples joined with commas
 *   (and a trailing comma). Codes 1–4 are jumps; 5–8 are steps. Empty
 *   string = no moves. A jump may append the first continuation chain
 *   so `automove` can play a multi-jump as several comma words.
 */

export const STARTING_BOARD =
  "0 1 0 1 0 1 0 1 1 0 1 0 1 0 1 0 0 1 0 1 0 1 0 1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -1 0 -1 0 -1 0 -1 0 0 -1 0 -1 0 -1 0 -1 -1 0 -1 0 -1 0 -1 0 ";

/** Dust `decodemove` / DLL jump table at 0x100019a4 + 0x100019c4. */
const DELTA: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [-2, 2],
  [2, 2],
  [2, -2],
  [-2, -2],
  [-1, 1],
  [1, 1],
  [1, -1],
  [-1, -1],
];

const NEIGHBOR: ReadonlyArray<readonly [number, number]> = [
  [-1, 1],
  [1, 1],
  [1, -1],
  [-1, -1],
];

export interface CheckersMove {
  row: number;
  col: number;
  code: number;
}

export function parseBoard(text: string): Int16Array {
  const cells = new Int16Array(64);
  let i = 0;
  let pos = 0;
  while (pos < text.length && i < 64) {
    while (pos < text.length && text.charCodeAt(pos) === 32) {
      pos += 1;
    }
    if (pos >= text.length) {
      break;
    }
    let sign = 1;
    if (text.charCodeAt(pos) === 45) {
      sign = -1;
      pos += 1;
    }
    let value = 0;
    while (pos < text.length) {
      const ch = text.charCodeAt(pos);
      if (ch < 48 || ch > 57) {
        break;
      }
      value = value * 10 + (ch - 48);
      pos += 1;
    }
    cells[i] = sign * value;
    i += 1;
  }
  return cells;
}

export function encodeMove(move: CheckersMove): string {
  return `${move.row}${move.col}${move.code}`;
}

export function checkMove(boardText: string, lookahead: number, mode: number): string {
  const board = parseBoard(boardText);
  const depth = Math.trunc(lookahead);
  const side = Math.trunc(mode) !== 0 ? 1 : 0;
  const result = search(board, depth, side);
  if (!result.move) {
    return "";
  }
  return encodeChain(board, result.move, side);
}

export function generateMoves(board: Int16Array, mode: number): CheckersMove[] {
  const jumps = listMoves(board, mode, true);
  if (jumps.length) {
    return jumps;
  }
  return listMoves(board, mode, false);
}

export function evaluateBoard(board: Int16Array): number {
  let score = 0;
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = board[row * 8 + col]!;
      score = i16(score + piece * 100);
      if (piece === 0) {
        continue;
      }
      score = i16(score + neighborScore(board, row, col, piece > 0));
    }
  }
  return score;
}

function search(
  board: Int16Array,
  depth: number,
  mode: number,
): { score: number; move: CheckersMove | undefined } {
  const moves = generateMoves(board, mode);
  if (moves.length === 0) {
    return { score: evaluateBoard(board), move: undefined };
  }
  if (depth <= 0) {
    return { score: evaluateBoard(board), move: moves[0] };
  }
  let bestScore = mode === 0 ? -999 : 999;
  let bestMove = moves[0];
  const saved = board.slice();
  const childMode = mode === 1 ? 0 : 1;
  for (const move of moves) {
    board.set(saved);
    applyChain(board, move, mode);
    const child = search(board, depth - 1, childMode);
    const better = mode === 0 ? bestScore < child.score : bestScore > child.score;
    if (better) {
      bestScore = child.score;
      bestMove = move;
    }
  }
  board.set(saved);
  return { score: bestScore, move: bestMove };
}

function encodeChain(board: Int16Array, first: CheckersMove, mode: number): string {
  const work = board.slice();
  const parts: string[] = [];
  let move: CheckersMove | undefined = first;
  while (move) {
    parts.push(encodeMove(move));
    const delta = DELTA[move.code];
    if (!delta || (delta[0] !== 2 && delta[0] !== -2)) {
      break;
    }
    applyOne(work, move, mode);
    const landRow: number = move.row + delta[0];
    const landCol: number = move.col + delta[1];
    const jumps: CheckersMove[] = listMoves(work, mode, true);
    move = jumps.find((next) => next.row === landRow && next.col === landCol);
  }
  return parts.length ? `${parts.join(",")},` : "";
}

function applyChain(board: Int16Array, move: CheckersMove, mode: number): void {
  applyOne(board, move, mode);
  const delta = DELTA[move.code];
  if (!delta || (delta[0] !== 2 && delta[0] !== -2)) {
    return;
  }
  const landRow = move.row + delta[0];
  const landCol = move.col + delta[1];
  const next = listMoves(board, mode, true).find((jump) => jump.row === landRow && jump.col === landCol);
  if (next) {
    applyChain(board, next, mode);
  }
}

function applyOne(board: Int16Array, move: CheckersMove, mode: number): void {
  const delta = DELTA[move.code];
  if (!delta) {
    return;
  }
  const destRow = move.row + delta[0];
  const destCol = move.col + delta[1];
  if (destRow < 0 || destRow > 7 || destCol < 0 || destCol > 7) {
    return;
  }
  const from = move.row * 8 + move.col;
  const dest = destRow * 8 + destCol;
  const piece = board[from]!;
  const king = isKing(piece);
  if (mode === 0) {
    board[dest] = king || destRow === 7 ? 2 : 1;
  } else {
    board[dest] = king || destRow === 0 ? -2 : -1;
  }
  board[from] = 0;
  if (delta[0] === 2 || delta[0] === -2) {
    const midRow = move.row + (delta[0] >> 1);
    const midCol = move.col + (delta[1] >> 1);
    board[midRow * 8 + midCol] = 0;
  }
}

function listMoves(board: Int16Array, mode: number, jumps: boolean): CheckersMove[] {
  const out: CheckersMove[] = [];
  const him = mode === 0;
  const from = jumps ? 1 : 5;
  const to = jumps ? 4 : 8;
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = board[row * 8 + col]!;
      if (him ? piece <= 0 : piece >= 0) {
        continue;
      }
      for (let code = from; code <= to; code += 1) {
        const delta = DELTA[code]!;
        const destRow = row + delta[0];
        const destCol = col + delta[1];
        if (jumps ? goodJump(board, row, col, destRow, destCol, him) : goodStep(board, row, col, destRow, destCol, him)) {
          out.push({ row, col, code });
        }
      }
    }
  }
  return out;
}

function goodStep(
  board: Int16Array,
  srow: number,
  scol: number,
  erow: number,
  ecol: number,
  him: boolean,
): boolean {
  if (erow < 0 || ecol < 0 || erow > 7 || ecol > 7) {
    return false;
  }
  if (board[erow * 8 + ecol] !== 0) {
    return false;
  }
  const drow = erow - srow;
  const dcol = ecol - scol;
  if (him) {
    if (drow === 1 && (dcol === 1 || dcol === -1)) {
      return true;
    }
    return drow === -1 && (dcol === 1 || dcol === -1) && isKing(board[srow * 8 + scol]!);
  }
  if (drow === -1 && (dcol === 1 || dcol === -1)) {
    return true;
  }
  return drow === 1 && (dcol === 1 || dcol === -1) && isKing(board[srow * 8 + scol]!);
}

function goodJump(
  board: Int16Array,
  srow: number,
  scol: number,
  erow: number,
  ecol: number,
  him: boolean,
): boolean {
  if (erow < 0 || ecol < 0 || erow > 7 || ecol > 7) {
    return false;
  }
  if (board[erow * 8 + ecol] !== 0) {
    return false;
  }
  const drow = erow - srow;
  const dcol = ecol - scol;
  const mid = board[(srow + (drow >> 1)) * 8 + (scol + (dcol >> 1))]!;
  if (him) {
    if (drow === 2 && (dcol === 2 || dcol === -2) && mid < 0) {
      return true;
    }
    return drow === -2 && (dcol === 2 || dcol === -2) && mid < 0 && isKing(board[srow * 8 + scol]!);
  }
  if (drow === -2 && (dcol === 2 || dcol === -2) && mid > 0) {
    return true;
  }
  return drow === 2 && (dcol === 2 || dcol === -2) && mid > 0 && isKing(board[srow * 8 + scol]!);
}

function neighborScore(board: Int16Array, row: number, col: number, him: boolean): number {
  let di = 0;
  for (const [drow, dcol] of NEIGHBOR) {
    const r = row + drow;
    const c = col + dcol;
    if (r < 0 || r > 7 || c < 0 || c > 7) {
      continue;
    }
    const ax = board[r * 8 + c]!;
    if (him) {
      if (ax < 0) {
        di -= ax;
      } else if (ax === 0) {
        di -= 1;
      }
    } else if (ax > 0) {
      di += ax;
    } else if (ax === 0) {
      di += 1;
    }
  }
  return di;
}

function isKing(piece: number): boolean {
  return piece === 2 || piece === -2;
}

function i16(value: number): number {
  return (value << 16) >> 16;
}
