"""Async manager for the Pikafish UCI engine subprocess."""

from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path
from typing import AsyncIterator, Optional

from backend.engine import uci
from backend.engine.analysis import parse_bestmove, parse_info_line
from backend.models.schemas import AnalysisResult, PVLine

logger = logging.getLogger(__name__)

_DEFAULT_ENGINE_PATH = str(
    Path(__file__).resolve().parent.parent.parent / "Pikafish" / "src" / "pikafish"
)

ENGINE_PATH = os.environ.get("PIKAFISH_PATH", _DEFAULT_ENGINE_PATH)


class EngineManager:
    """Wraps a single Pikafish process, providing async analysis methods."""

    def __init__(self, path: str = ENGINE_PATH):
        self._path = path
        self._proc: Optional[asyncio.subprocess.Process] = None
        self._lock = asyncio.Lock()
        self._ready = False

    async def start(self) -> None:
        if self._proc is not None:
            return
        self._proc = await asyncio.create_subprocess_exec(
            self._path,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await self._send(uci.cmd_uci())
        await self._read_until("uciok")
        await self._send(uci.cmd_setoption("UCI_ShowWDL", "true"))
        await self._send(uci.cmd_setoption("Threads", "2"))
        await self._send(uci.cmd_setoption("Hash", "64"))
        await self._send(uci.cmd_isready())
        await self._read_until("readyok")
        self._ready = True
        logger.info("Pikafish engine started: %s", self._path)

    async def stop(self) -> None:
        if self._proc is None:
            return
        try:
            await self._send(uci.cmd_quit())
            await asyncio.wait_for(self._proc.wait(), timeout=3)
        except (asyncio.TimeoutError, ProcessLookupError):
            self._proc.kill()
        self._proc = None
        self._ready = False
        logger.info("Pikafish engine stopped")

    async def analyse(
        self, fen: str, depth: int = 20, multipv: int = 1
    ) -> AnalysisResult:
        """Run a full analysis up to given depth and return the final result."""
        async with self._lock:
            if multipv > 1:
                await self._send(uci.cmd_setoption("MultiPV", str(multipv)))
            await self._send(uci.cmd_position(fen))
            await self._send(uci.cmd_go(depth=depth))

            lines: dict[int, PVLine] = {}
            best_move = ""
            ponder = None

            async for raw in self._read_lines():
                if raw.startswith("bestmove"):
                    best_move, ponder = parse_bestmove(raw)
                    break
                pv = parse_info_line(raw)
                if pv and pv.pv:
                    multipv_idx = _extract_multipv(raw)
                    lines[multipv_idx] = pv

            if multipv > 1:
                await self._send(uci.cmd_setoption("MultiPV", "1"))

            sorted_lines = [lines[k] for k in sorted(lines.keys())]
            return AnalysisResult(
                fen=fen,
                best_move=best_move,
                ponder=ponder,
                lines=sorted_lines,
                depth=sorted_lines[0].depth if sorted_lines else depth,
            )

    async def analyse_stream(
        self, fen: str, depth: int = 20
    ) -> AsyncIterator[PVLine | AnalysisResult]:
        """Stream intermediate analysis info lines, then yield final result."""
        async with self._lock:
            await self._send(uci.cmd_position(fen))
            await self._send(uci.cmd_go(depth=depth))

            latest: Optional[PVLine] = None
            async for raw in self._read_lines():
                if raw.startswith("bestmove"):
                    best_move, ponder = parse_bestmove(raw)
                    yield AnalysisResult(
                        fen=fen,
                        best_move=best_move,
                        ponder=ponder,
                        lines=[latest] if latest else [],
                        depth=latest.depth if latest else depth,
                    )
                    break
                pv = parse_info_line(raw)
                if pv and pv.pv:
                    latest = pv
                    yield pv

    async def _send(self, command: str) -> None:
        assert self._proc and self._proc.stdin
        self._proc.stdin.write((command + "\n").encode())
        await self._proc.stdin.drain()

    async def _read_lines(self) -> AsyncIterator[str]:
        assert self._proc and self._proc.stdout
        while True:
            raw = await asyncio.wait_for(
                self._proc.stdout.readline(), timeout=30
            )
            if not raw:
                break
            line = raw.decode().strip()
            if line:
                yield line

    async def _read_until(self, token: str) -> list[str]:
        collected: list[str] = []
        async for line in self._read_lines():
            collected.append(line)
            if line.startswith(token):
                return collected
        return collected


def _extract_multipv(line: str) -> int:
    import re
    m = re.search(r"\bmultipv\s+(\d+)", line)
    return int(m.group(1)) if m else 1


engine: Optional[EngineManager] = None


async def get_engine() -> EngineManager:
    global engine
    if engine is None:
        engine = EngineManager()
        await engine.start()
    return engine
