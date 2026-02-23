import React, { useCallback, useState } from 'react';
import type { Board as BoardType, PieceChar, Square } from '../../lib/fen';
import { isRedPiece } from '../../lib/fen';
import './Board.css';

const CELL = 64;
const PAD = 40;
const BOARD_W = CELL * 8;
const BOARD_H = CELL * 9;
const SVG_W = BOARD_W + PAD * 2;
const SVG_H = BOARD_H + PAD * 2;

const PIECE_NAMES: Record<string, string> = {
  R: '車', N: '馬', B: '相', A: '仕', K: '帥', C: '炮', P: '兵',
  r: '車', n: '馬', b: '象', a: '士', k: '將', c: '砲', p: '卒',
};

interface Props {
  board: BoardType;
  onMove?: (from: Square, to: Square) => void;
  legalTargets?: (sq: Square) => Square[];
  bestMoveArrow?: { from: Square; to: Square } | null;
  lastMove?: { from: Square; to: Square } | null;
  flipped?: boolean;
}

function toX(col: number) { return PAD + col * CELL; }
function toY(row: number) { return PAD + row * CELL; }

export default function Board({
  board,
  onMove,
  legalTargets,
  bestMoveArrow,
  lastMove,
  flipped = false,
}: Props) {
  const [selected, setSelected] = useState<Square | null>(null);
  const [targets, setTargets] = useState<Square[]>([]);
  const [dragging, setDragging] = useState<{
    piece: PieceChar;
    from: Square;
    x: number;
    y: number;
  } | null>(null);

  const displayRow = (r: number) => flipped ? 9 - r : r;
  const displayCol = (c: number) => flipped ? 8 - c : c;

  const handleClick = useCallback(
    (row: number, col: number) => {
      const piece = board[row][col];
      if (selected) {
        if (row === selected.row && col === selected.col) {
          setSelected(null);
          setTargets([]);
          return;
        }
        if (onMove) onMove(selected, { row, col });
        setSelected(null);
        setTargets([]);
      } else if (piece) {
        setSelected({ row, col });
        if (legalTargets) setTargets(legalTargets({ row, col }));
      }
    },
    [board, selected, onMove, legalTargets],
  );

  const handleDragStart = (e: React.PointerEvent, row: number, col: number) => {
    const piece = board[row][col];
    if (!piece) return;
    setSelected({ row, col });
    if (legalTargets) setTargets(legalTargets({ row, col }));
    const svgRect = (e.currentTarget as HTMLElement).closest('svg')!.getBoundingClientRect();
    setDragging({
      piece,
      from: { row, col },
      x: e.clientX - svgRect.left,
      y: e.clientY - svgRect.top,
    });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleDragMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const svgRect = (e.currentTarget as HTMLElement).closest('svg')!.getBoundingClientRect();
    setDragging({
      ...dragging,
      x: e.clientX - svgRect.left,
      y: e.clientY - svgRect.top,
    });
  };

  const handleDragEnd = (e: React.PointerEvent) => {
    if (!dragging) return;
    const svgRect = (e.currentTarget as HTMLElement).closest('svg')!.getBoundingClientRect();
    const x = e.clientX - svgRect.left;
    const y = e.clientY - svgRect.top;

    let bestDist = Infinity;
    let bestSq: Square | null = null;
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const sx = toX(displayCol(c));
        const sy = toY(displayRow(r));
        const dist = Math.hypot(x - sx, y - sy);
        if (dist < bestDist) {
          bestDist = dist;
          bestSq = { row: r, col: c };
        }
      }
    }

    if (bestSq && bestDist < CELL * 0.7 && onMove) {
      onMove(dragging.from, bestSq);
    }

    setDragging(null);
    setSelected(null);
    setTargets([]);
  };

  const renderGrid = () => {
    const lines: React.JSX.Element[] = [];
    for (let r = 0; r < 10; r++) {
      lines.push(
        <line key={`h${r}`}
          x1={toX(0)} y1={toY(r)} x2={toX(8)} y2={toY(r)}
          className="board-line"
        />,
      );
    }
    for (let c = 0; c < 9; c++) {
      if (c === 0 || c === 8) {
        lines.push(
          <line key={`v${c}`}
            x1={toX(c)} y1={toY(0)} x2={toX(c)} y2={toY(9)}
            className="board-line"
          />,
        );
      } else {
        lines.push(
          <line key={`vt${c}`}
            x1={toX(c)} y1={toY(0)} x2={toX(c)} y2={toY(4)}
            className="board-line"
          />,
        );
        lines.push(
          <line key={`vb${c}`}
            x1={toX(c)} y1={toY(5)} x2={toX(c)} y2={toY(9)}
            className="board-line"
          />,
        );
      }
    }
    // Palace diagonals
    lines.push(
      <line key="pd1" x1={toX(3)} y1={toY(0)} x2={toX(5)} y2={toY(2)} className="board-line" />,
      <line key="pd2" x1={toX(5)} y1={toY(0)} x2={toX(3)} y2={toY(2)} className="board-line" />,
      <line key="pd3" x1={toX(3)} y1={toY(7)} x2={toX(5)} y2={toY(9)} className="board-line" />,
      <line key="pd4" x1={toX(5)} y1={toY(7)} x2={toX(3)} y2={toY(9)} className="board-line" />,
    );
    return lines;
  };

  const renderRiver = () => (
    <text
      x={SVG_W / 2}
      y={toY(4.5)}
      className="river-text"
      textAnchor="middle"
      dominantBaseline="middle"
    >
      楚 河　　　　漢 界
    </text>
  );

  const renderHighlights = () => {
    const elems: React.JSX.Element[] = [];
    if (lastMove) {
      for (const sq of [lastMove.from, lastMove.to]) {
        elems.push(
          <rect key={`lm${sq.row}${sq.col}`}
            x={toX(displayCol(sq.col)) - CELL / 2 + 2}
            y={toY(displayRow(sq.row)) - CELL / 2 + 2}
            width={CELL - 4} height={CELL - 4}
            className="last-move-highlight" rx="4"
          />,
        );
      }
    }
    if (selected) {
      elems.push(
        <rect key="sel"
          x={toX(displayCol(selected.col)) - CELL / 2 + 2}
          y={toY(displayRow(selected.row)) - CELL / 2 + 2}
          width={CELL - 4} height={CELL - 4}
          className="selected-highlight" rx="4"
        />,
      );
    }
    for (const t of targets) {
      const occupied = board[t.row][t.col] !== null;
      elems.push(
        <circle key={`t${t.row}${t.col}`}
          cx={toX(displayCol(t.col))}
          cy={toY(displayRow(t.row))}
          r={occupied ? CELL * 0.4 : 8}
          className={occupied ? 'target-capture' : 'target-dot'}
        />,
      );
    }
    return elems;
  };

  const renderArrow = () => {
    if (!bestMoveArrow) return null;
    const { from, to } = bestMoveArrow;
    const x1 = toX(displayCol(from.col));
    const y1 = toY(displayRow(from.row));
    const x2 = toX(displayCol(to.col));
    const y2 = toY(displayRow(to.row));
    return (
      <g className="best-move-arrow">
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="7"
            refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6" />
          </marker>
        </defs>
        <line
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke="#3b82f6" strokeWidth="4" opacity="0.7"
          markerEnd="url(#arrowhead)"
        />
      </g>
    );
  };

  const renderPieces = () => {
    const pieces: React.JSX.Element[] = [];
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const piece = board[r][c];
        if (!piece) continue;
        if (dragging && dragging.from.row === r && dragging.from.col === c) continue;

        const x = toX(displayCol(c));
        const y = toY(displayRow(r));
        const isRed = isRedPiece(piece);

        pieces.push(
          <g key={`p${r}${c}`}
            className="piece-group"
            onPointerDown={(e) => handleDragStart(e, r, c)}
            onClick={() => handleClick(r, c)}
            style={{ cursor: 'grab' }}
          >
            <circle cx={x} cy={y} r={CELL * 0.42}
              className={isRed ? 'piece-bg-red' : 'piece-bg-black'}
            />
            <circle cx={x} cy={y} r={CELL * 0.38}
              className="piece-inner-ring"
            />
            <text x={x} y={y}
              className={isRed ? 'piece-text-red' : 'piece-text-black'}
              textAnchor="middle" dominantBaseline="central"
              fontSize={CELL * 0.44} fontWeight="bold"
            >
              {PIECE_NAMES[piece]}
            </text>
          </g>,
        );
      }
    }
    return pieces;
  };

  const renderDraggingPiece = () => {
    if (!dragging) return null;
    const isRed = isRedPiece(dragging.piece);
    return (
      <g className="piece-group dragging" style={{ pointerEvents: 'none' }}>
        <circle cx={dragging.x} cy={dragging.y} r={CELL * 0.42}
          className={isRed ? 'piece-bg-red' : 'piece-bg-black'}
          opacity="0.9"
        />
        <circle cx={dragging.x} cy={dragging.y} r={CELL * 0.38}
          className="piece-inner-ring"
        />
        <text x={dragging.x} y={dragging.y}
          className={isRed ? 'piece-text-red' : 'piece-text-black'}
          textAnchor="middle" dominantBaseline="central"
          fontSize={CELL * 0.44} fontWeight="bold"
        >
          {PIECE_NAMES[dragging.piece]}
        </text>
      </g>
    );
  };

  const renderClickTargets = () => {
    const rects: React.JSX.Element[] = [];
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c]) continue;
        rects.push(
          <rect key={`ct${r}${c}`}
            x={toX(displayCol(c)) - CELL / 2}
            y={toY(displayRow(r)) - CELL / 2}
            width={CELL} height={CELL}
            fill="transparent"
            onClick={() => handleClick(r, c)}
          />,
        );
      }
    }
    return rects;
  };

  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      className="xiangqi-board"
      onPointerMove={handleDragMove}
      onPointerUp={handleDragEnd}
    >
      <rect x="0" y="0" width={SVG_W} height={SVG_H} className="board-bg" rx="8" />
      <rect
        x={PAD - CELL / 2} y={PAD - CELL / 2}
        width={BOARD_W + CELL} height={BOARD_H + CELL}
        className="board-surface" rx="4"
      />
      {renderGrid()}
      {renderRiver()}
      {renderHighlights()}
      {renderArrow()}
      {renderClickTargets()}
      {renderPieces()}
      {renderDraggingPiece()}
    </svg>
  );
}
