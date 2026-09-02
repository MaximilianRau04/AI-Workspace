from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func

import llm
from db import get_session
from models.usage import UsageRecord
from utils import login_required

router = APIRouter(tags=["usage"])


class PricingBody(BaseModel):
    pricing: dict = {}


def _totals_since(db, user_id: str, since_iso: str | None) -> dict:
    q = db.query(
        func.coalesce(func.sum(UsageRecord.prompt_tokens), 0),
        func.coalesce(func.sum(UsageRecord.reply_tokens), 0),
        func.coalesce(func.sum(UsageRecord.total_tokens), 0),
    ).filter(UsageRecord.user_id == user_id)
    if since_iso:
        q = q.filter(UsageRecord.created_at >= since_iso)
    prompt, reply, total = q.first()
    return {"prompt": prompt, "reply": reply, "total": total}


def _cost_usd(
    prompt_tokens: int, reply_tokens: int, provider: str, model: str, pricing: dict
) -> float:
    rates = pricing.get(f"{provider}::{model}")
    if not rates:
        return 0.0
    input_rate = rates.get("input", 0) or 0
    output_rate = rates.get("output", 0) or 0
    return (prompt_tokens / 1_000_000) * input_rate + (reply_tokens / 1_000_000) * output_rate


@router.get("/usage/summary")
async def usage_summary(current_user: dict = Depends(login_required)):
    user_id = current_user["user_id"]
    now = datetime.utcnow()
    today_start = now.strftime("%Y-%m-%dT00:00:00")
    d7 = (now - timedelta(days=7)).isoformat()
    d30 = (now - timedelta(days=30)).isoformat()

    pricing = llm.load_config().get("pricing", {})

    with get_session() as db:
        today = _totals_since(db, user_id, today_start)
        last_7d = _totals_since(db, user_id, d7)
        last_30d = _totals_since(db, user_id, d30)
        all_time = _totals_since(db, user_id, None)

        rows = (
            db.query(
                UsageRecord.provider,
                UsageRecord.model,
                func.coalesce(func.sum(UsageRecord.prompt_tokens), 0),
                func.coalesce(func.sum(UsageRecord.reply_tokens), 0),
                func.coalesce(func.sum(UsageRecord.total_tokens), 0),
                func.count(UsageRecord.id),
            )
            .filter(UsageRecord.user_id == user_id)
            .group_by(UsageRecord.provider, UsageRecord.model)
            .order_by(func.sum(UsageRecord.total_tokens).desc())
            .all()
        )

    by_model = [
        {
            "provider": provider,
            "model": model,
            "prompt": prompt,
            "reply": reply,
            "total": total,
            "requests": count,
            "cost_usd": round(_cost_usd(prompt, reply, provider, model, pricing), 4),
        }
        for provider, model, prompt, reply, total, count in rows
    ]

    all_time_cost = round(sum(m["cost_usd"] for m in by_model), 4)

    return {
        "today": today,
        "last_7d": last_7d,
        "last_30d": last_30d,
        "all_time": all_time,
        "all_time_cost_usd": all_time_cost,
        "by_model": by_model,
    }


@router.get("/usage/pricing")
async def get_pricing(current_user: dict = Depends(login_required)):
    return {"pricing": llm.load_config().get("pricing", {})}


@router.post("/usage/pricing")
async def set_pricing(body: PricingBody, current_user: dict = Depends(login_required)):
    cfg = llm.load_config()
    cfg["pricing"] = body.pricing
    llm.save_config(cfg)
    return {"ok": True}
