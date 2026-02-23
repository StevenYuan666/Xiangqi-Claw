"""Engine analysis endpoints (REST and WebSocket)."""

from __future__ import annotations

import json
import os

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from backend.engine.manager import get_engine
from backend.models.schemas import (AnalysisRequest, AnalysisResult,
                                    ExplanationRequest, ExplanationResponse,
                                    PVLine)
from backend.services.llm import generate_explanation
from backend.services.openai_client import get_openai_client

router = APIRouter(tags=["analysis"])


@router.post("/api/analysis", response_model=AnalysisResult)
async def analyse_position(req: AnalysisRequest):
    engine = await get_engine()
    result = await engine.analyse(req.fen, depth=req.depth, multipv=req.multipv)
    return result


@router.post("/api/explain", response_model=ExplanationResponse)
async def explain_move(req: ExplanationRequest):
    if not os.environ.get("OPENAI_API_KEY"):
        raise HTTPException(status_code=400, detail="未配置 OpenAI API Key")
    return await generate_explanation(req, get_openai_client())


@router.websocket("/ws/analysis")
async def ws_analysis(websocket: WebSocket):
    await websocket.accept()
    engine = await get_engine()
    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            fen = msg.get("fen", "")
            depth = msg.get("depth", 18)

            async for item in engine.analyse_stream(fen, depth=depth):
                if isinstance(item, PVLine):
                    await websocket.send_json({
                        "type": "info",
                        "depth": item.depth,
                        "score_cp": item.score_cp,
                        "score_mate": item.score_mate,
                        "wdl": item.wdl,
                        "pv": item.pv,
                        "nodes": item.nodes,
                        "nps": item.nps,
                    })
                elif isinstance(item, AnalysisResult):
                    await websocket.send_json({
                        "type": "bestmove",
                        "best_move": item.best_move,
                        "ponder": item.ponder,
                        "depth": item.depth,
                        "lines": [
                            {
                                "depth": l.depth,
                                "score_cp": l.score_cp,
                                "pv": l.pv,
                            }
                            for l in item.lines
                        ],
                    })
    except WebSocketDisconnect:
        pass
