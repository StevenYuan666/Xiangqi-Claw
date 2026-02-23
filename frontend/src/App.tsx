import { useCallback, useEffect, useRef, useState } from 'react';
import { Board } from './components/Board';
import { AnalysisPanel } from './components/AnalysisPanel';
import { ExplainPanel } from './components/ExplainPanel';
import { MoveInput } from './components/MoveInput';
import { MoveHistory } from './components/MoveHistory';
import { BoardEditor } from './components/BoardEditor';
import { useGame } from './hooks/useGame';
import { useEngine } from './hooks/useEngine';
import { parseUciMove } from './lib/fen';
import type { Square } from './lib/fen';
import './App.css';

export default function App() {
  const game = useGame();
  const engine = useEngine();

  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [bestMoveArrow, setBestMoveArrow] = useState<{ from: Square; to: Square } | null>(null);
  const [showAnalysis, setShowAnalysis] = useState(true);
  const [flipped, setFlipped] = useState(false);
  const [editing, setEditing] = useState(false);

  const [explainData, setExplainData] = useState<{
    fen: string;
    userMove: string;
    bestMove: string;
    userScoreCp: number;
    bestScoreCp: number;
    prevScoreCp: number;
    pvAfterUser: string[];
    pvAfterBest: string[];
    moveNumber: number;
    side: 'w' | 'b';
  } | null>(null);

  const prevFenRef = useRef<string>('');

  const playerAtBottom: 'w' | 'b' = flipped ? 'b' : 'w';

  useEffect(() => {
    if (editing) return;
    const fen = game.currentFen();
    if (fen !== prevFenRef.current && showAnalysis && engine.connected) {
      engine.analyse(fen);
      prevFenRef.current = fen;
    }
  }, [game.position, showAnalysis, engine.connected, editing]);

  useEffect(() => {
    if (engine.result?.best_move) {
      const parsed = parseUciMove(engine.result.best_move);
      setBestMoveArrow(parsed);
    }
  }, [engine.result]);

  const handleBoardMove = useCallback(
    (from: Square, to: Square) => {
      const fen = game.currentFen();
      const side = game.position.turn;
      const moveNum = Math.floor(game.moveHistory.length / 2) + 1;

      const prevScore = engine.info?.score_cp ?? 0;
      const prevPv = engine.info?.pv ?? [];

      const ok = game.tryMove(from, to);
      if (ok) {
        const uci = `${String.fromCharCode(97 + from.col)}${9 - from.row}${String.fromCharCode(97 + to.col)}${9 - to.row}`;
        setLastMove({ from, to });
        setBestMoveArrow(null);

        if (engine.result) {
          setExplainData({
            fen,
            userMove: uci,
            bestMove: engine.result.best_move,
            userScoreCp: -(engine.info?.score_cp ?? 0),
            bestScoreCp: prevScore,
            prevScoreCp: prevScore,
            pvAfterUser: [],
            pvAfterBest: prevPv,
            moveNumber: moveNum,
            side,
          });
        }
      }
    },
    [game, engine.info, engine.result],
  );

  const handleTextMove = useCallback(
    (uci: string) => {
      const fen = game.currentFen();
      const side = game.position.turn;
      const moveNum = Math.floor(game.moveHistory.length / 2) + 1;
      const prevScore = engine.info?.score_cp ?? 0;
      const prevPv = engine.info?.pv ?? [];

      const ok = game.tryMoveUci(uci);
      if (ok) {
        const parsed = parseUciMove(uci);
        setLastMove(parsed);
        setBestMoveArrow(null);

        if (engine.result) {
          setExplainData({
            fen,
            userMove: uci,
            bestMove: engine.result.best_move,
            userScoreCp: -(engine.info?.score_cp ?? 0),
            bestScoreCp: prevScore,
            prevScoreCp: prevScore,
            pvAfterUser: [],
            pvAfterBest: prevPv,
            moveNumber: moveNum,
            side,
          });
        }
      }
    },
    [game, engine.info, engine.result],
  );

  const clearState = () => {
    setLastMove(null);
    setBestMoveArrow(null);
    setExplainData(null);
    prevFenRef.current = '';
  };

  const handleNewGame = () => {
    game.reset();
    clearState();
  };

  const handleEditorConfirm = (fen: string) => {
    game.reset(fen);
    clearState();
    setEditing(false);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">象棋智教</h1>
      </header>

      <main className="app-main">
        {editing ? (
          <BoardEditor
            onConfirm={handleEditorConfirm}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <div className="play-layout">
            <div className="board-column">
              <Board
                board={game.position.board}
                onMove={handleBoardMove}
                legalTargets={game.legalTargets}
                bestMoveArrow={showAnalysis ? bestMoveArrow : null}
                lastMove={lastMove}
                flipped={flipped}
              />
              <MoveInput
                fen={game.currentFen()}
                legalMoves={game.legalMoves()}
                onMove={handleTextMove}
                disabled={!!game.gameOver}
              />
              {game.gameOver && (
                <div className="game-over">
                  {game.gameOver}
                  <button onClick={handleNewGame}>新局</button>
                </div>
              )}
            </div>

            <div className="side-column">
              <div className="side-controls">
                <button className="control-btn" onClick={handleNewGame}>新局</button>
                <button className="control-btn" onClick={() => setEditing(true)}>编辑局面</button>
                <button
                  className="control-btn flip-btn"
                  onClick={() => setFlipped(f => !f)}
                  title="翻转棋盘"
                >
                  翻转棋盘
                </button>
                <label className="toggle-label">
                  <input
                    type="checkbox"
                    checked={showAnalysis}
                    onChange={(e) => setShowAnalysis(e.target.checked)}
                  />
                  引擎分析
                </label>
              </div>

              {showAnalysis && (
                <AnalysisPanel
                  info={engine.info}
                  result={engine.result}
                  analysing={engine.analysing}
                  connected={engine.connected}
                  fen={game.currentFen()}
                />
              )}

              {explainData && (
                <ExplainPanel
                  fen={explainData.fen}
                  userMove={explainData.userMove}
                  bestMove={explainData.bestMove}
                  userScoreCp={explainData.userScoreCp}
                  bestScoreCp={explainData.bestScoreCp}
                  prevScoreCp={explainData.prevScoreCp}
                  pvAfterUser={explainData.pvAfterUser}
                  pvAfterBest={explainData.pvAfterBest}
                  moveNumber={explainData.moveNumber}
                  side={explainData.side}
                  playerAtBottom={playerAtBottom}
                />
              )}

              <MoveHistory
                moves={game.moveHistory}
                currentIndex={game.currentIndex}
                startFen={game.baseFen}
                onGoTo={game.goToMove}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
