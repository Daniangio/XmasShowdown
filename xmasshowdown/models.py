"""Domain models for the Gifts Under Siege game."""

from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional

from xmasshowdown.constants import BuildingType, Color, GiftClass


@dataclass
class Land:
    color: Color


@dataclass
class LandInPlay:
    color: Color
    tapped: bool = False


@dataclass
class Gift:
    gift_id: str
    color: Color
    gift_class: GiftClass
    locks: int = 0
    owner_id: Optional[str] = None

    @property
    def sealed(self) -> bool:
        return self.locks >= 5


@dataclass
class PlayerState:
    member_id: str
    name: str
    hand: List[Land] = field(default_factory=list)
    lands_in_play: List[LandInPlay] = field(default_factory=list)
    gifts: List[Gift] = field(default_factory=list)
    building: Optional[BuildingType] = None
    pending_discard: int = 0

    @property
    def score(self) -> int:
        score = 0
        for gift in self.gifts:
            if gift.gift_class == GiftClass.CLASS_I:
                score += 1
            elif gift.gift_class == GiftClass.CLASS_II:
                score += 2
            elif gift.gift_class == GiftClass.CLASS_III:
                score += 3
        return score


@dataclass
class TurnState:
    player_id: str
    number: int
    has_played_land: bool = False
    has_taken_action: bool = False


@dataclass
class GameState:
    game_id: str
    room_id: str
    created_at: datetime
    status: str
    players: List[PlayerState]
    deck: List[Land]
    gifts_display: List[Gift]
    turn: TurnState
