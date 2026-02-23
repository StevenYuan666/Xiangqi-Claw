"""Generate natural-language teaching explanations using OpenAI."""

from __future__ import annotations

from openai import AsyncOpenAI

from backend.models.schemas import ExplanationRequest, ExplanationResponse
from backend.services.openai_client import LLM_MODEL


def classify_quality(
    user_score_cp: int, best_score_cp: int, prev_score_cp: int
) -> str:
    """Beginner-friendly quality classification.

    The key insight: for a beginner, what matters is whether the move turned
    an advantage into a disadvantage, not the raw centipawn loss. Small
    inaccuracies are fine as long as the position stays favorable.

    Scores are always from the moving side's perspective (positive = good).
    prev_score_cp: engine eval before the move (from moving side's view)
    user_score_cp: eval after user's move (from moving side's view)
    best_score_cp: eval after best move (from moving side's view)
    """
    score_loss = max(0, best_score_cp - user_score_cp)

    was_winning = prev_score_cp > 50
    now_losing = user_score_cp < -50
    flipped = was_winning and now_losing

    if score_loss <= 15:
        return "brilliant"

    if flipped:
        if score_loss > 200:
            return "blunder"
        return "mistake"

    if score_loss <= 60:
        return "good"
    if score_loss <= 150:
        return "inaccuracy"
    if score_loss <= 300:
        return "mistake"
    return "blunder"


def classify_quality_simple(score_loss: int) -> str:
    """Simpler classification used by game review where we don't have prev_score."""
    if score_loss <= 15:
        return "brilliant"
    if score_loss <= 60:
        return "good"
    if score_loss <= 150:
        return "inaccuracy"
    if score_loss <= 300:
        return "mistake"
    return "blunder"


async def generate_explanation(
    req: ExplanationRequest, client: AsyncOpenAI
) -> ExplanationResponse:
    score_loss = max(0, req.best_score_cp - req.user_score_cp)
    prev_score = req.prev_score_cp if req.prev_score_cp is not None else req.best_score_cp
    quality = classify_quality(req.user_score_cp, req.best_score_cp, prev_score)

    player_name = "我方" if req.player_at_bottom == req.side.value else "对方"
    side_name = "红方" if req.side.value == "w" else "黑方"

    if req.player_at_bottom == "w":
        perspective_desc = "你执红棋（棋盘下方），黑棋是对手。"
    else:
        perspective_desc = "你执黑棋（棋盘下方），红棋是对手。"

    pv_user_str = " ".join(req.pv_after_user[:5]) if req.pv_after_user else "无"
    pv_best_str = " ".join(req.pv_after_best[:5]) if req.pv_after_best else "无"

    was_winning = prev_score > 50
    now_losing = req.user_score_cp < -50
    flipped = was_winning and now_losing

    if quality in ("brilliant", "good"):
        tone_instruction = """这步棋走得不错！请表扬学生，然后温和地提一下是否有更好的选择（如果有的话）。
语气要积极、鼓励。如果最佳走法和学生的走法一样或者差距很小，就纯粹表扬即可。"""
    elif quality == "inaccuracy":
        tone_instruction = """这步棋可以走，但不是最优。请温和地指出有更好的选择，引导学生思考为什么另一步更好。
不要批评学生，而是用"你有没有考虑过...""其实还有一步更妙的棋..."这样的引导方式。"""
    else:
        tone_instruction = f"""这步棋走得不太好（{'从优势变成了劣势！' if flipped else '丢失了不少分数'}）。
请明确指出这步棋的问题，并根据引擎搜索出的后续变化，引导学生思考为什么这步棋不好。
比如对手接下来可能怎么走、会造成什么威胁。但语气仍然要友善，像一个耐心的老师。"""

    prompt = f"""你是一位友善的中国象棋教练，正在帮助一个新手学生理解棋局。请用中文解释这步棋。

{perspective_desc}
当前是第 {req.move_number} 手，{side_name}走棋。

走之前的局面评分: {prev_score} 分（正数表示{side_name}优势）
学生走了: {req.user_move_cn}（走后评分: {req.user_score_cp} 分）
最佳着法: {req.best_move_cn}（走后评分: {req.best_score_cp} 分）
差距: {score_loss} 分

学生走法后续可能的变化: {pv_user_str}
最佳走法后续可能的变化: {pv_best_str}

{tone_instruction}

要求:
- 用2-4句话解释
- 不要使用FEN格式或UCI格式的走法表示，用自然的中文棋语（如"车一进一"、"炮打中兵"等）
- 永远从{perspective_desc.split("，")[0].replace("你", "")}的视角来分析
- 不要重复说评分数字，而是用"优势""劣势""均势"等自然语言"""

    resp = await client.chat.completions.create(
        model=LLM_MODEL,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=400,
        temperature=0.7,
    )

    explanation = resp.choices[0].message.content.strip()
    return ExplanationResponse(
        explanation=explanation,
        quality=quality,
        score_loss=score_loss,
    )


async def generate_game_summary(
    moves_data: list[dict], client: AsyncOpenAI
) -> str:
    """Generate a summary of an entire game review."""
    move_descriptions = []
    for i, m in enumerate(moves_data):
        if m["quality"] in ("mistake", "blunder"):
            side = "红方" if i % 2 == 0 else "黑方"
            move_descriptions.append(
                f"第{i+1}手: {side}走{m['move']}（{m['quality']}，丢失{m['score_loss']}分）"
            )

    key_moments = "\n".join(move_descriptions[:10]) if move_descriptions else "整局没有明显失误"

    prompt = f"""你是一位中国象棋教练，请用中文总结这盘棋的复盘要点。

关键时刻:
{key_moments}

总步数: {len(moves_data)}

请用3-5句话总结:
1. 双方整体表现
2. 最关键的转折点
3. 一个针对性的提高建议

语气友善，给予鼓励。"""

    resp = await client.chat.completions.create(
        model=LLM_MODEL,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=400,
        temperature=0.7,
    )
    return resp.choices[0].message.content.strip()
