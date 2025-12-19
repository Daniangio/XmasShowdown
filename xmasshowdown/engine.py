"""Game engine for Gifts Under Siege."""

from __future__ import annotations

import random
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple
from uuid import uuid4

from xmasshowdown.actions import ACTION_REGISTRY, ActionContext
from xmasshowdown.constants import BuildingType, Color, GiftClass
from xmasshowdown.errors import GameRuleError
from xmasshowdown.models import GameState, Gift, Land, LandInPlay, PlayerState, TurnState
from xmasshowdown.rules import GameConfig, GameRules


class GameEngine:
    def __init__(
        self,
        room_id: str,
        players: List[Dict[str, str]],
        config: Optional[GameConfig] = None,
        rules: Optional[GameRules] = None,
    ) -> None:
        self.config = config or GameConfig()
        self.rules = rules or GameRules()
        self.state = GameState(
            game_id=str(uuid4()),
            room_id=room_id,
            created_at=datetime.now(timezone.utc),
            status="active",
            players=[PlayerState(member_id=p["member_id"], name=p["name"]) for p in players],
            deck=self._build_deck(),
            gifts_display=[],
            turn=TurnState(player_id="", number=0),
        )
        self._setup_game()

    def apply_action(self, player_id: str, action: str, payload: Dict[str, object]) -> None:
        action_cls = ACTION_REGISTRY.get(action)
        if not action_cls:
            raise GameRuleError("Unknown action.")
        action_cls().apply(self, ActionContext(player_id=player_id, payload=payload))

    def play_land(self, player_id: str, index: int) -> None:
        self._require_turn(player_id)
        player = self._find_player(player_id)
        if self.state.turn.has_played_land:
            raise GameRuleError("You already played a land this turn.")
        if len(player.lands_in_play) >= self.config.land_limit:
            raise GameRuleError("Land limit reached.")
        if index < 0 or index >= len(player.hand):
            raise GameRuleError("Invalid land selection.")
        land = player.hand.pop(index)
        player.lands_in_play.append(LandInPlay(color=land.color))
        self.state.turn.has_played_land = True

    def claim_gift(self, player_id: str, gift_id: str) -> None:
        self._require_turn_action(player_id)
        player = self._find_player(player_id)
        gift = self._find_display_gift(gift_id)
        total_cost, color_req = self.rules.gift_cost(gift.gift_class)
        self._pay_mana(player, total_cost, gift.color, color_req)
        gift.owner_id = player_id
        gift.locks = min(5, gift.locks + 1)
        player.gifts.append(gift)
        self.state.gifts_display = [g for g in self.state.gifts_display if g.gift_id != gift_id]
        self.state.turn.has_taken_action = True

    def steal_gift(
        self,
        player_id: str,
        gift_id: str,
        *,
        add_lock: bool = False,
        discard_indices: Optional[List[int]] = None,
    ) -> None:
        self._require_turn_action(player_id)
        player = self._find_player(player_id)
        gift, owner = self._find_owned_gift(gift_id)
        if not owner or owner.member_id == player_id:
            raise GameRuleError("You must steal from another player.")
        if gift.sealed:
            raise GameRuleError("That gift is sealed and cannot be stolen.")
        total_cost, color_req = self.rules.gift_cost(gift.gift_class)
        self._pay_mana(player, total_cost, gift.color, color_req)
        discard_count = gift.locks
        if player.building == BuildingType.THIEFS_GLOVES:
            discard_count = max(0, discard_count - 2)
        if len(player.hand) < discard_count:
            raise GameRuleError("Not enough cards in hand to pay lock cost.")
        if discard_indices is None:
            for _ in range(discard_count):
                player.hand.pop(0)
        else:
            unique_indices = sorted(set(discard_indices), reverse=True)
            if len(unique_indices) != discard_count:
                raise GameRuleError("Incorrect number of discard selections.")
            if unique_indices and (unique_indices[0] >= len(player.hand) or unique_indices[-1] < 0):
                raise GameRuleError("Discard selection out of range.")
            for index in unique_indices:
                if index < 0 or index >= len(player.hand):
                    raise GameRuleError("Discard selection out of range.")
                player.hand.pop(index)
        owner.gifts = [g for g in owner.gifts if g.gift_id != gift_id]
        gift.owner_id = player_id
        if add_lock and player.building == BuildingType.CROWBAR:
            gift.locks = min(5, gift.locks + 1)
        player.gifts.append(gift)
        self.state.turn.has_taken_action = True

    def wrap_gift(self, player_id: str, gift_id: str) -> None:
        self._require_turn_action(player_id)
        player = self._find_player(player_id)
        gift = self._find_player_gift(player, gift_id)
        self._pay_mana(player, self.rules.wrap_cost(), None, 0)
        add_locks = 2 if player.building == BuildingType.REINFORCED_RIBBON else 1
        gift.locks = min(5, gift.locks + add_locks)
        self.state.turn.has_taken_action = True

    def build_building(self, player_id: str, building: BuildingType) -> None:
        self._require_turn_action(player_id)
        player = self._find_player(player_id)
        if player.building:
            raise GameRuleError("You already built a building.")
        total_cost, color_req, color = self.rules.building_cost(building)
        self._pay_mana(player, total_cost, color, color_req)
        player.building = building
        self.state.turn.has_taken_action = True

    def recycle(self, player_id: str) -> None:
        self._require_turn_action(player_id)
        player = self._find_player(player_id)
        if player.pending_discard > 0:
            raise GameRuleError("You must discard before recycling again.")
        count = 2 if player.building == BuildingType.SUPPLY_WAREHOUSE else 1
        self._draw_cards(player, count)
        player.pending_discard = 1
        self.state.turn.has_taken_action = True

    def discard_from_hand(self, player_id: str, index: int) -> None:
        self._require_turn(player_id)
        player = self._find_player(player_id)
        if player.pending_discard <= 0:
            raise GameRuleError("No discard is required.")
        if index < 0 or index >= len(player.hand):
            raise GameRuleError("Invalid discard selection.")
        player.hand.pop(index)
        player.pending_discard -= 1

    def end_turn(self, player_id: str) -> None:
        self._require_turn(player_id)
        player = self._find_player(player_id)
        if player.pending_discard > 0:
            raise GameRuleError("You must discard before ending your turn.")
        if len(player.hand) > self.config.hand_limit:
            excess = len(player.hand) - self.config.hand_limit
            for _ in range(excess):
                player.hand.pop()
        self._advance_turn()

    def serialize_state(self, viewer_id: str) -> Dict[str, object]:
        players_payload = []
        for player in self.state.players:
            players_payload.append(
                {
                    "member_id": player.member_id,
                    "name": player.name,
                    "score": player.score,
                    "hand_count": len(player.hand),
                    "lands_in_play": [
                        {"color": land.color.value, "tapped": land.tapped}
                        for land in player.lands_in_play
                    ],
                    "gifts": [self._serialize_gift(gift) for gift in player.gifts],
                    "building": player.building.value if player.building else None,
                }
            )

        viewer = self._find_player(viewer_id)
        return {
            "game_id": self.state.game_id,
            "room_id": self.state.room_id,
            "status": self.state.status,
            "created_at": self.state.created_at.isoformat(),
            "turn": {
                "player_id": self.state.turn.player_id,
                "number": self.state.turn.number,
                "has_played_land": self.state.turn.has_played_land,
                "has_taken_action": self.state.turn.has_taken_action,
            },
            "players": players_payload,
            "gifts_display": [self._serialize_gift(gift) for gift in self.state.gifts_display],
            "viewer": {
                "member_id": viewer.member_id,
                "name": viewer.name,
                "hand": [land.color.value for land in viewer.hand],
                "lands_in_play": [
                    {"color": land.color.value, "tapped": land.tapped}
                    for land in viewer.lands_in_play
                ],
                "building": viewer.building.value if viewer.building else None,
                "pending_discard": viewer.pending_discard,
            },
            "deck_count": len(self.state.deck),
        }

    def _setup_game(self) -> None:
        self.state.gifts_display = self._build_gifts()
        for player in self.state.players:
            self._draw_cards(player, self.config.initial_hand)
        self.state.turn = TurnState(player_id=self.state.players[0].member_id, number=1)
        self._start_turn()

    def _build_deck(self) -> List[Land]:
        deck = []
        for color in Color:
            deck.extend([Land(color=color) for _ in range(self.config.deck_size_per_color)])
        random.shuffle(deck)
        return deck

    def _build_gifts(self) -> List[Gift]:
        gifts = []
        for _ in range(self.config.gift_pool_size):
            gift_class = random.choices(
                [GiftClass.CLASS_I, GiftClass.CLASS_II, GiftClass.CLASS_III],
                weights=[5, 3, 2],
            )[0]
            color = random.choice(list(Color))
            gifts.append(Gift(gift_id=str(uuid4()), color=color, gift_class=gift_class))
        return gifts[: self.config.gifts_in_display]

    def _start_turn(self) -> None:
        player = self._find_player(self.state.turn.player_id)
        for land in player.lands_in_play:
            land.tapped = False
        self._draw_cards(player, 1)

    def _advance_turn(self) -> None:
        current_index = self._player_index(self.state.turn.player_id)
        next_index = (current_index + 1) % len(self.state.players)
        next_player_id = self.state.players[next_index].member_id
        self.state.turn = TurnState(player_id=next_player_id, number=self.state.turn.number + 1)
        self._start_turn()

    def _draw_cards(self, player: PlayerState, count: int) -> None:
        for _ in range(count):
            if not self.state.deck:
                self.state.status = "ended"
                raise GameRuleError("The deck is empty.")
            player.hand.append(self.state.deck.pop(0))

    def _pay_mana(
        self, player: PlayerState, total_cost: int, color: Optional[Color], color_req: int
    ) -> None:
        untapped = [land for land in player.lands_in_play if not land.tapped]
        if len(untapped) < total_cost:
            raise GameRuleError("Not enough untapped lands.")
        chosen: List[LandInPlay] = []
        if color and color_req > 0:
            color_matches = [land for land in untapped if land.color == color]
            if len(color_matches) < color_req:
                raise GameRuleError("Not enough required color mana.")
            chosen.extend(color_matches[:color_req])
        remaining = total_cost - len(chosen)
        if remaining > 0:
            for land in untapped:
                if land in chosen:
                    continue
                chosen.append(land)
                remaining -= 1
                if remaining == 0:
                    break
        for land in chosen:
            land.tapped = True

    def _require_turn(self, player_id: str) -> None:
        if self.state.status != "active":
            raise GameRuleError("The game is not active.")
        if self.state.turn.player_id != player_id:
            raise GameRuleError("It is not your turn.")

    def _require_turn_action(self, player_id: str) -> None:
        self._require_turn(player_id)
        if self.state.turn.has_taken_action:
            raise GameRuleError("You already took a main action this turn.")

    def _find_player(self, player_id: str) -> PlayerState:
        for player in self.state.players:
            if player.member_id == player_id:
                return player
        raise GameRuleError("Player not found.")

    def _player_index(self, player_id: str) -> int:
        for index, player in enumerate(self.state.players):
            if player.member_id == player_id:
                return index
        raise GameRuleError("Player not found.")

    def _find_display_gift(self, gift_id: str) -> Gift:
        for gift in self.state.gifts_display:
            if gift.gift_id == gift_id:
                return gift
        raise GameRuleError("Gift not available.")

    def _find_player_gift(self, player: PlayerState, gift_id: str) -> Gift:
        for gift in player.gifts:
            if gift.gift_id == gift_id:
                return gift
        raise GameRuleError("You do not own that gift.")

    def _find_owned_gift(self, gift_id: str) -> Tuple[Gift, Optional[PlayerState]]:
        for player in self.state.players:
            for gift in player.gifts:
                if gift.gift_id == gift_id:
                    return gift, player
        raise GameRuleError("Gift not found.")

    def _serialize_gift(self, gift: Gift) -> Dict[str, object]:
        return {
            "gift_id": gift.gift_id,
            "color": gift.color.value,
            "gift_class": gift.gift_class.value,
            "locks": gift.locks,
            "owner_id": gift.owner_id,
            "sealed": gift.sealed,
        }
