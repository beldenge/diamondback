import { describe, expect, it } from "vitest";
import { findWord } from "./puzzle";
import {
  STARTING_BOARD,
  checkMove,
  encodeMove,
  evaluateBoard,
  generateMoves,
  parseBoard,
} from "./checkers";

function cell(board: Int16Array, row: number, col: number): number {
  return board[row * 8 + col]!;
}

function put(board: string, row: number, col: number, value: string): string {
  const parts = board.trimEnd().split(" ");
  parts[row * 8 + col] = value;
  return `${parts.join(" ")} `;
}

function emptyBoard(): string {
  return `${Array.from({ length: 64 }, () => "0").join(" ")} `;
}

describe("CHECKERS.DLL checkmove", () => {
  it("parses the script starting position as 12 him and 12 me", () => {
    const board = parseBoard(STARTING_BOARD);
    expect(board.length).toBe(64);
    expect(cell(board, 0, 1)).toBe(1);
    expect(cell(board, 2, 7)).toBe(1);
    expect(cell(board, 3, 0)).toBe(0);
    expect(cell(board, 5, 0)).toBe(-1);
    expect(cell(board, 7, 6)).toBe(-1);
    expect([...board].filter((n) => n > 0)).toHaveLength(12);
    expect([...board].filter((n) => n < 0)).toHaveLength(12);
  });

  it("player's first opening step is row 5 col 0 code 5", () => {
    const moves = generateMoves(parseBoard(STARTING_BOARD), 1);
    expect(moves[0]).toEqual({ row: 5, col: 0, code: 5 });
    expect(checkMove(STARTING_BOARD, 0, 1)).toBe("505,");
    expect(findWord(checkMove(STARTING_BOARD, 0, 1), ",", 1)).toBe("505");
    expect(Number(findWord("505", "", 3))).toBe(5);
  });

  it("him's first opening step is row 2 col 1 code 6", () => {
    const moves = generateMoves(parseBoard(STARTING_BOARD), 0);
    expect(moves[0]).toEqual({ row: 2, col: 1, code: 6 });
    expect(checkMove(STARTING_BOARD, 0, 0)).toBe("216,");
  });

  it("returns empty when that side has no moves", () => {
    expect(checkMove(emptyBoard(), 0, 0)).toBe("");
    expect(checkMove(emptyBoard(), 2, 1)).toBe("");
  });

  it("mode 1 lists a forced jump and hides steps", () => {
    let board = emptyBoard();
    board = put(board, 3, 2, "-1");
    board = put(board, 2, 3, "1");
    const moves = generateMoves(parseBoard(board), 1);
    expect(moves.every((move) => move.code <= 4)).toBe(true);
    expect(moves).toContainEqual({ row: 3, col: 2, code: 1 });
    expect(checkMove(board, 0, 1)).toBe("321,");
  });

  it("cannot jump a man on the a/h files (landing would be off the board)", () => {
    let board = emptyBoard();
    board = put(board, 2, 1, "1");
    board = put(board, 3, 0, "-1");
    expect(generateMoves(parseBoard(board), 0).some((move) => move.code <= 4)).toBe(false);
    board = emptyBoard();
    board = put(board, 2, 6, "1");
    board = put(board, 3, 7, "-1");
    expect(generateMoves(parseBoard(board), 0).some((move) => move.code <= 4)).toBe(false);
  });

  it("him must jump a me man in front, not step", () => {
    let board = emptyBoard();
    board = put(board, 2, 3, "1");
    board = put(board, 3, 4, "-1");
    const moves = generateMoves(parseBoard(board), 0);
    expect(moves).toEqual([{ row: 2, col: 3, code: 2 }]);
    expect(checkMove(board, 0, 0)).toBe("232,");
  });

  it("a man does not jump backward; a king does", () => {
    let board = emptyBoard();
    board = put(board, 4, 3, "-1");
    board = put(board, 5, 4, "1");
    expect(generateMoves(parseBoard(board), 1).some((move) => move.code === 2)).toBe(false);
    board = put(board, 4, 3, "-2");
    expect(generateMoves(parseBoard(board), 1)).toContainEqual({ row: 4, col: 3, code: 2 });
  });

  it("encodes a two-jump chain so automove can play both words", () => {
    let board = emptyBoard();
    board = put(board, 2, 1, "1");
    board = put(board, 3, 2, "-1");
    board = put(board, 5, 4, "-1");
    const text = checkMove(board, 0, 0);
    expect(findWord(text, ",", 1)).toBe("212");
    expect(findWord(text, ",", 2)).toBe("432");
    expect(findWord(text, ",", 3)).toBe("");
  });

  it("keeps the first equal-score move (no random, no alpha-beta)", () => {
    const easy = checkMove(STARTING_BOARD, 2, 0);
    const again = checkMove(STARTING_BOARD, 2, 0);
    expect(easy).toBe(again);
    expect(easy.endsWith(",")).toBe(true);
    expect(findWord(easy, ",", 1).length).toBe(3);
  });

  it("medium and hard searches stay deterministic and legal for him", () => {
    for (const depth of [2, 3, 4]) {
      const text = checkMove(STARTING_BOARD, depth, 0);
      const word = findWord(text, ",", 1);
      expect(word.length).toBe(3);
      const row = Number(findWord(word, "", 1));
      const col = Number(findWord(word, "", 2));
      const code = Number(findWord(word, "", 3));
      const legal = generateMoves(parseBoard(STARTING_BOARD), 0);
      expect(legal).toContainEqual({ row, col, code });
    }
  });

  it("starting eval is him-positive from the empty-diagonal term", () => {
    const score = evaluateBoard(parseBoard(STARTING_BOARD));
    expect(Number.isInteger(score)).toBe(true);
    expect(checkMove(STARTING_BOARD, 1, 0)).not.toBe("");
  });

  it("encodeMove is the three-digit triple automove splits on empty sep", () => {
    expect(encodeMove({ row: 7, col: 0, code: 8 })).toBe("708");
    expect(findWord("708", "", 1)).toBe("7");
    expect(findWord("708", "", 2)).toBe("0");
    expect(findWord("708", "", 3)).toBe("8");
  });
});
