import { useCallback, useState } from 'react';
import { useVoice } from '../../hooks/useVoice';
import './MoveInput.css';

interface Props {
  fen: string;
  legalMoves: string[];
  onMove: (uci: string) => void;
  disabled?: boolean;
}

export default function MoveInput({ fen, legalMoves, onMove, disabled }: Props) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [parsing, setParsing] = useState(false);

  const submitText = useCallback(async (input: string) => {
    if (!input.trim() || disabled) return;
    setParsing(true);
    setError('');
    try {
      const resp = await fetch('/api/game/parse-move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fen, text: input.trim(), legal_moves: legalMoves }),
      });
      if (resp.ok) {
        const data = await resp.json();
        onMove(data.move);
        setText('');
      } else {
        const err = await resp.json().catch(() => ({ detail: '解析失败' }));
        setError(err.detail || '无法理解这步棋');
      }
    } catch {
      setError('网络错误');
    } finally {
      setParsing(false);
    }
  }, [fen, legalMoves, onMove, disabled]);

  const handleVoiceResult = useCallback((result: string) => {
    setText(result);
    submitText(result);
  }, [submitText]);

  const { listening, transcript, supported, toggle } = useVoice(handleVoiceResult);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitText(text);
  };

  return (
    <div className="move-input">
      <form onSubmit={handleSubmit} className="move-input-form">
        <input
          type="text"
          value={listening ? transcript || text : text}
          onChange={(e) => { setText(e.target.value); setError(''); }}
          placeholder="输入走法，如 '炮二平五' 或 '把马跳到中间'"
          className="move-text-input"
          disabled={disabled || parsing}
        />
        <button
          type="submit"
          className="move-submit-btn"
          disabled={disabled || parsing || !text.trim()}
        >
          {parsing ? '...' : '走'}
        </button>
        {supported && (
          <button
            type="button"
            className={`voice-btn ${listening ? 'listening' : ''}`}
            onClick={toggle}
            disabled={disabled}
            title="语音输入"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
          </button>
        )}
      </form>
      {error && <p className="move-error">{error}</p>}
      {listening && (
        <p className="voice-status">
          正在听... {transcript && <span>「{transcript}」</span>}
        </p>
      )}
    </div>
  );
}
