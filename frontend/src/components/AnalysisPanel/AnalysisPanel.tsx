import type { EngineInfo, EngineResult } from '../../hooks/useEngine';
import { uciToChineseNotation } from '../../lib/notation';
import { parseFen, applyMove, toFen, uciToSquare } from '../../lib/fen';
import './AnalysisPanel.css';

interface Props {
  info: EngineInfo | null;
  result: EngineResult | null;
  analysing: boolean;
  connected: boolean;
  fen: string;
}

function formatScore(cp: number, mate: number | null): string {
  if (mate !== null) {
    return mate > 0 ? `杀棋 ${mate} 步` : `被杀 ${Math.abs(mate)} 步`;
  }
  const pawns = (cp / 100).toFixed(1);
  return cp >= 0 ? `+${pawns}` : `${pawns}`;
}

function formatNodes(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function pvToChineseSequence(pv: string[], startFen: string, maxMoves: number): string {
  const moves: string[] = [];
  let currentFen = startFen;
  for (let i = 0; i < Math.min(pv.length, maxMoves); i++) {
    const uci = pv[i];
    try {
      const cn = uciToChineseNotation(uci, currentFen);
      moves.push(cn);
      const pos = parseFen(currentFen);
      const from = uciToSquare(uci.substring(0, 2));
      const to = uciToSquare(uci.substring(2, 4));
      const newPos = applyMove(pos, from, to);
      currentFen = toFen(newPos);
    } catch {
      moves.push(uci);
      break;
    }
  }
  return moves.join(' ');
}

function WDLBar({ wdl }: { wdl: [number, number, number] }) {
  const total = wdl[0] + wdl[1] + wdl[2];
  if (total === 0) return null;
  const w = (wdl[0] / total * 100).toFixed(1);
  const d = (wdl[1] / total * 100).toFixed(1);
  const l = (wdl[2] / total * 100).toFixed(1);

  return (
    <div className="wdl-bar">
      <div className="wdl-win" style={{ width: `${w}%` }} title={`胜 ${w}%`} />
      <div className="wdl-draw" style={{ width: `${d}%` }} title={`和 ${d}%`} />
      <div className="wdl-loss" style={{ width: `${l}%` }} title={`负 ${l}%`} />
    </div>
  );
}

export default function AnalysisPanel({ info, result, analysing, connected, fen }: Props) {
  const bestMoveCn = result?.best_move
    ? uciToChineseNotation(result.best_move, fen)
    : null;

  const pvDisplay = info?.pv
    ? pvToChineseSequence(info.pv, fen, 6)
    : null;

  return (
    <div className="analysis-panel">
      <div className="analysis-header">
        <h3>引擎分析</h3>
        <span className={`status-dot ${connected ? 'connected' : ''}`} />
      </div>

      {!connected && (
        <p className="analysis-status">引擎未连接</p>
      )}

      {analysing && !info && (
        <p className="analysis-status thinking">分析中...</p>
      )}

      {info && (
        <div className="analysis-info">
          <div className="score-display">
            <span className="score-value">
              {formatScore(info.score_cp, info.score_mate)}
            </span>
            <span className="depth-badge">深度 {info.depth}</span>
          </div>

          {info.wdl && <WDLBar wdl={info.wdl} />}

          {pvDisplay && (
            <div className="pv-line">
              <span className="pv-label">最佳变化:</span>
              <span className="pv-moves">{pvDisplay}</span>
            </div>
          )}

          <div className="engine-stats">
            <span>节点: {formatNodes(info.nodes)}</span>
            <span>速度: {formatNodes(info.nps)}/s</span>
          </div>
        </div>
      )}

      {result && !analysing && bestMoveCn && (
        <div className="best-move-display">
          <span className="best-label">最佳着法:</span>
          <span className="best-move">{bestMoveCn}</span>
        </div>
      )}
    </div>
  );
}
