import { useCallback, useState } from 'react';
import { uciToChineseNotation } from '../../lib/notation';
import './ExplainPanel.css';

interface Props {
  fen: string;
  userMove: string | null;
  bestMove: string | null;
  userScoreCp: number;
  bestScoreCp: number;
  prevScoreCp: number;
  pvAfterUser: string[];
  pvAfterBest: string[];
  moveNumber: number;
  side: 'w' | 'b';
  playerAtBottom: 'w' | 'b';
}

type Quality = 'best' | 'ok' | 'blunder';

function classifySimple(userMove: string, bestMove: string, userScoreCp: number, _bestScoreCp: number, prevScoreCp: number): Quality {
  if (userMove === bestMove) return 'best';
  const wasWinning = prevScoreCp > 50;
  const nowLosing = userScoreCp < -50;
  if (wasWinning && nowLosing) return 'blunder';
  return 'ok';
}

const QUALITY_DISPLAY: Record<Quality, { text: string; className: string }> = {
  best: { text: '最佳着法', className: 'quality-best' },
  ok: { text: '可以更好', className: 'quality-ok' },
  blunder: { text: '漏招', className: 'quality-blunder' },
};

export default function ExplainPanel({
  fen, userMove, bestMove, userScoreCp, bestScoreCp, prevScoreCp,
  pvAfterUser, pvAfterBest, moveNumber, side, playerAtBottom,
}: Props) {
  const [explanation, setExplanation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const userMoveCn = userMove ? uciToChineseNotation(userMove, fen) : '';
  const bestMoveCn = bestMove ? uciToChineseNotation(bestMove, fen) : '';

  const quality: Quality | null =
    userMove && bestMove
      ? classifySimple(userMove, bestMove, userScoreCp, bestScoreCp, prevScoreCp)
      : null;

  const requestExplanation = useCallback(async () => {
    if (!userMove || !bestMove) return;
    setLoading(true);
    setExplanation(null);
    try {
      const resp = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fen,
          user_move: userMove,
          best_move: bestMove,
          user_move_cn: userMoveCn,
          best_move_cn: bestMoveCn,
          user_score_cp: userScoreCp,
          best_score_cp: bestScoreCp,
          prev_score_cp: prevScoreCp,
          pv_after_user: pvAfterUser,
          pv_after_best: pvAfterBest,
          move_number: moveNumber,
          side,
          player_at_bottom: playerAtBottom,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setExplanation(data.explanation);
      } else {
        const err = await resp.json().catch(() => ({ detail: '请求失败' }));
        setExplanation(err.detail || '请求失败');
      }
    } catch {
      setExplanation('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [fen, userMove, bestMove, userMoveCn, bestMoveCn, userScoreCp, bestScoreCp, prevScoreCp, pvAfterUser, pvAfterBest, moveNumber, side, playerAtBottom]);

  if (!userMove) return null;

  const qualityInfo = quality ? QUALITY_DISPLAY[quality] : null;

  return (
    <div className="explain-panel">
      <div className="explain-header">
        <h3>教学解析</h3>
        {qualityInfo && (
          <span className={`quality-badge ${qualityInfo.className}`}>
            {qualityInfo.text}
          </span>
        )}
      </div>

      <div className="explain-move-summary">
        <span>你走了: <strong>{userMoveCn}</strong></span>
        {userMove !== bestMove && (
          <span>最佳: <strong>{bestMoveCn}</strong></span>
        )}
      </div>

      {explanation && (
        <div className="explanation-text">{explanation}</div>
      )}

      <button
        className="explain-btn"
        onClick={requestExplanation}
        disabled={loading}
      >
        {loading ? '正在分析...' : explanation ? '重新分析' : '让AI教练解释这步棋'}
      </button>
    </div>
  );
}
