"""Command objects for applying game actions."""

from dataclasses import dataclass
from typing import Dict, Type

from xmasshowdown.constants import BuildingType
from xmasshowdown.errors import GameRuleError


@dataclass
class ActionContext:
    player_id: str
    payload: Dict[str, object]


class GameAction:
    name: str = ""

    def apply(self, engine, context: ActionContext) -> None:
        raise NotImplementedError


class PlayLandAction(GameAction):
    name = "play_land"

    def apply(self, engine, context: ActionContext) -> None:
        index = context.payload.get("index")
        if index is None:
            raise GameRuleError("Missing land index.")
        engine.play_land(context.player_id, int(index))


class ClaimGiftAction(GameAction):
    name = "claim_gift"

    def apply(self, engine, context: ActionContext) -> None:
        gift_id = context.payload.get("gift_id")
        if not gift_id:
            raise GameRuleError("Missing gift id.")
        engine.claim_gift(context.player_id, str(gift_id))


class StealGiftAction(GameAction):
    name = "steal_gift"

    def apply(self, engine, context: ActionContext) -> None:
        gift_id = context.payload.get("gift_id")
        if not gift_id:
            raise GameRuleError("Missing gift id.")
        add_lock = bool(context.payload.get("add_lock", False))
        discard_indices = context.payload.get("discard_indices")
        if discard_indices is not None:
            if not isinstance(discard_indices, list):
                raise GameRuleError("Discard indices must be a list.")
            try:
                discard_indices = [int(index) for index in discard_indices]
            except (TypeError, ValueError) as exc:
                raise GameRuleError("Discard indices must be integers.") from exc
        engine.steal_gift(
            context.player_id,
            str(gift_id),
            add_lock=add_lock,
            discard_indices=discard_indices,
        )


class WrapGiftAction(GameAction):
    name = "wrap_gift"

    def apply(self, engine, context: ActionContext) -> None:
        gift_id = context.payload.get("gift_id")
        if not gift_id:
            raise GameRuleError("Missing gift id.")
        engine.wrap_gift(context.player_id, str(gift_id))


class BuildBuildingAction(GameAction):
    name = "build_building"

    def apply(self, engine, context: ActionContext) -> None:
        raw_building = context.payload.get("building")
        if not raw_building:
            raise GameRuleError("Missing building type.")
        try:
            building = BuildingType(str(raw_building))
        except ValueError as exc:
            raise GameRuleError("Unknown building type.") from exc
        engine.build_building(context.player_id, building)


class RecycleAction(GameAction):
    name = "recycle"

    def apply(self, engine, context: ActionContext) -> None:
        engine.recycle(context.player_id)


class DiscardAction(GameAction):
    name = "discard"

    def apply(self, engine, context: ActionContext) -> None:
        index = context.payload.get("index")
        if index is None:
            raise GameRuleError("Missing discard index.")
        engine.discard_from_hand(context.player_id, int(index))


class EndTurnAction(GameAction):
    name = "end_turn"

    def apply(self, engine, context: ActionContext) -> None:
        engine.end_turn(context.player_id)


ACTION_REGISTRY: Dict[str, Type[GameAction]] = {
    PlayLandAction.name: PlayLandAction,
    ClaimGiftAction.name: ClaimGiftAction,
    StealGiftAction.name: StealGiftAction,
    WrapGiftAction.name: WrapGiftAction,
    BuildBuildingAction.name: BuildBuildingAction,
    RecycleAction.name: RecycleAction,
    DiscardAction.name: DiscardAction,
    EndTurnAction.name: EndTurnAction,
}
