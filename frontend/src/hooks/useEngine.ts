import { useCallback, useEffect, useRef, useState } from 'react';

export interface EngineInfo {
  depth: number;
  score_cp: number;
  score_mate: number | null;
  wdl: [number, number, number] | null;
  pv: string[];
  nodes: number;
  nps: number;
}

export interface EngineResult {
  best_move: string;
  ponder: string | null;
  depth: number;
}

export function useEngine() {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [info, setInfo] = useState<EngineInfo | null>(null);
  const [result, setResult] = useState<EngineResult | null>(null);
  const [analysing, setAnalysing] = useState(false);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/analysis`);

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      setAnalysing(false);
    };
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'info') {
        setInfo(data as EngineInfo);
      } else if (data.type === 'bestmove') {
        setResult(data as EngineResult);
        setAnalysing(false);
      }
    };

    wsRef.current = ws;
    return () => ws.close();
  }, []);

  const analyse = useCallback((fen: string, depth = 18) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    setInfo(null);
    setResult(null);
    setAnalysing(true);
    wsRef.current.send(JSON.stringify({ fen, depth }));
  }, []);

  return { connected, info, result, analysing, analyse };
}
