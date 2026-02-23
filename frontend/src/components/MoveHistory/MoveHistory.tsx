import type { MoveRecord } from '../../hooks/useGame';
import { uciToChineseNotation } from '../../lib/notation';
import './MoveHistory.css';

interface Props {
  moves: MoveRecord[];
  currentIndex: number;
  startFen: string;
  onGoTo: (index: number) => void;
}

export default function MoveHistory({ moves, currentIndex, startFen, onGoTo }: Props) {
  const pairs: { index: number; red: MoveRecord; black?: MoveRecord }[] = [];

  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({
      index: i,
      red: moves[i],
      black: moves[i + 1],
    });
  }

  const getFenBefore = (i: number) => {
    return i === 0 ? startFen : moves[i - 1].fen;
  };

  return (
    <div className="move-history">
      <div className="move-history-header">
        <h3>走棋记录</h3>
        <button
          className="nav-btn"
          onClick={() => onGoTo(-1)}
          title="回到开局"
        >
          ⏮
        </button>
        <button
          className="nav-btn"
          onClick={() => onGoTo(Math.max(-1, currentIndex - 1))}
          disabled={currentIndex < 0}
          title="上一步"
        >
          ◀
        </button>
        <button
          className="nav-btn"
          onClick={() => onGoTo(Math.min(moves.length - 1, currentIndex + 1))}
          disabled={currentIndex >= moves.length - 1}
          title="下一步"
        >
          ▶
        </button>
        <button
          className="nav-btn"
          onClick={() => onGoTo(moves.length - 1)}
          title="最新"
        >
          ⏭
        </button>
      </div>

      <div className="move-list">
        {pairs.length === 0 && (
          <p className="no-moves">尚未走棋</p>
        )}
        {pairs.map(({ index, red, black }) => (
          <div key={index} className="move-pair">
            <span className="move-number">{Math.floor(index / 2) + 1}.</span>
            <span
              className={`move-item red-move ${currentIndex === index ? 'active' : ''}`}
              onClick={() => onGoTo(index)}
            >
              {uciToChineseNotation(red.uci, getFenBefore(index))}
            </span>
            {black && (
              <span
                className={`move-item black-move ${currentIndex === index + 1 ? 'active' : ''}`}
                onClick={() => onGoTo(index + 1)}
              >
                {uciToChineseNotation(black.uci, getFenBefore(index + 1))}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
