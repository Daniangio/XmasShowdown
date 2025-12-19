"""Shared enums and constants for the game engine."""

from enum import Enum


class Color(str, Enum):
    WHITE = "W"
    BLUE = "U"
    BLACK = "B"
    RED = "R"
    GREEN = "G"


class GiftClass(str, Enum):
    CLASS_I = "I"
    CLASS_II = "II"
    CLASS_III = "III"


class BuildingType(str, Enum):
    THIEFS_GLOVES = "thiefs_gloves"
    CROWBAR = "crowbar"
    REINFORCED_RIBBON = "reinforced_ribbon"
    SUPPLY_WAREHOUSE = "supply_warehouse"
