"""Rules and configuration for the game engine."""

from dataclasses import dataclass
from typing import Dict, Tuple

from xmasshowdown.constants import BuildingType, Color, GiftClass


@dataclass
class GameConfig:
    gifts_in_display: int = 8
    initial_hand: int = 5
    hand_limit: int = 7
    land_limit: int = 10
    deck_size_per_color: int = 12
    gift_pool_size: int = 24


class GameRules:
    GIFT_COSTS: Dict[GiftClass, Tuple[int, int]] = {
        GiftClass.CLASS_I: (3, 2),
        GiftClass.CLASS_II: (5, 3),
        GiftClass.CLASS_III: (7, 4),
    }
    BUILDING_COLOR: Dict[BuildingType, Color] = {
        BuildingType.THIEFS_GLOVES: Color.BLACK,
        BuildingType.CROWBAR: Color.RED,
        BuildingType.REINFORCED_RIBBON: Color.GREEN,
        BuildingType.SUPPLY_WAREHOUSE: Color.BLUE,
    }

    @staticmethod
    def gift_cost(gift_class: GiftClass) -> Tuple[int, int]:
        return GameRules.GIFT_COSTS[gift_class]

    @staticmethod
    def building_cost(building: BuildingType) -> Tuple[int, int, Color]:
        return (4, 2, GameRules.BUILDING_COLOR[building])

    @staticmethod
    def wrap_cost() -> int:
        return 2
