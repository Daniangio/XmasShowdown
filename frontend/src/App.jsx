import { useEffect, useRef, useState } from 'react';

const STATUS_LABELS = {
  connected: 'Connected',
  connecting: 'Connecting',
  disconnected: 'Disconnected',
  error: 'Error',
};

const STATUS_HINTS = {
  connected: 'You are in the lobby.',
  connecting: 'Reaching the lobby...',
  disconnected: 'Lobby connection is closed.',
  error: 'Something went wrong with the lobby connection.',
};

const BUILDING_LABELS = {
  thiefs_gloves: "Thief's Gloves",
  crowbar: 'Crowbar',
  reinforced_ribbon: 'Reinforced Ribbon',
  supply_warehouse: 'Supply Warehouse',
};

const GIFT_COSTS = {
  I: { total: 3, color: 2 },
  II: { total: 5, color: 3 },
  III: { total: 7, color: 4 },
};

const BUILDING_COST = { total: 4, color: 2 };

const BUILDING_INFO = [
  {
    key: 'thiefs_gloves',
    color: 'B',
    name: "Thief's Gloves",
    effect: 'Steal: discard up to 2 fewer lock cards.',
  },
  {
    key: 'crowbar',
    color: 'R',
    name: 'Crowbar',
    effect: 'After stealing, you may add +1 lock to the stolen gift.',
  },
  {
    key: 'reinforced_ribbon',
    color: 'G',
    name: 'Reinforced Ribbon',
    effect: 'Wrap adds +2 locks instead of +1.',
  },
  {
    key: 'supply_warehouse',
    color: 'U',
    name: 'Supply Warehouse',
    effect: 'Recycle draws 2 lands then discard 1.',
  },
];

const buildWsBase = () => {
  if (process.env.REACT_APP_WS_BASE) {
    return process.env.REACT_APP_WS_BASE;
  }
  const { protocol, hostname, port } = window.location;
  const wsProtocol = protocol === 'https:' ? 'wss' : 'ws';
  if (process.env.NODE_ENV === 'development') {
    return `${wsProtocol}://${hostname}:8000`;
  }
  const portSuffix = port ? `:${port}` : '';
  return `${wsProtocol}://${hostname}${portSuffix}`;
};

const formatJoinedTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export default function App() {
  const [status, setStatus] = useState('disconnected');
  const [members, setMembers] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [me, setMe] = useState(null);
  const [nameInput, setNameInput] = useState('');
  const [roomNameInput, setRoomNameInput] = useState('');
  const [roomError, setRoomError] = useState('');
  const [activeGame, setActiveGame] = useState(null);
  const [gameError, setGameError] = useState('');
  const [stealSelection, setStealSelection] = useState(null);
  const wsRef = useRef(null);

  const sendMessage = (payload) => {
    if (status !== 'connected' || !wsRef.current) {
      return false;
    }
    wsRef.current.send(JSON.stringify(payload));
    return true;
  };

  const connect = (desiredName) => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    const params = desiredName ? `?name=${encodeURIComponent(desiredName)}` : '';
    const wsUrl = `${buildWsBase()}/api/v1/lobby/ws${params}`;
    const socket = new WebSocket(wsUrl);
    wsRef.current = socket;
    setStatus('connecting');

    const isActiveSocket = () => wsRef.current === socket;

    socket.onopen = () => {
      if (isActiveSocket()) {
        setStatus('connected');
      }
    };

    socket.onerror = () => {
      if (isActiveSocket()) {
        setStatus('error');
      }
    };

    socket.onclose = () => {
      if (isActiveSocket()) {
        setStatus('disconnected');
        setRooms([]);
        setActiveGame(null);
      }
    };

    socket.onmessage = (event) => {
      if (!isActiveSocket()) {
        return;
      }
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch (err) {
        return;
      }

      if (payload.type === 'welcome') {
        setMe(payload.member);
        setMembers(payload.members || []);
        setRooms(payload.rooms || []);
        setNameInput(payload.member?.name || '');
        setRoomError('');
        return;
      }

      if (payload.type === 'member_joined') {
        setMembers((prev) => {
          if (prev.find((item) => item.member_id === payload.member.member_id)) {
            return prev;
          }
          return [...prev, payload.member];
        });
      }

      if (payload.type === 'member_left') {
        setMembers((prev) => prev.filter((item) => item.member_id !== payload.member.member_id));
      }

      if (payload.type === 'member_renamed') {
        setMembers((prev) =>
          prev.map((item) => (item.member_id === payload.member.member_id ? payload.member : item))
        );
        setMe((current) =>
          current && current.member_id === payload.member.member_id ? payload.member : current
        );
      }

      if (payload.type === 'rooms_updated') {
        setRooms(payload.rooms || []);
      }

      if (payload.type === 'error') {
        setRoomError(payload.message || 'Something went wrong.');
      }

      if (payload.type === 'game_started' || payload.type === 'game_state') {
        setActiveGame(payload.state || null);
        setGameError('');
      }

      if (payload.type === 'game_error') {
        setGameError(payload.message || 'Game action failed.');
      }
    };
  };

  useEffect(() => {
    if (!stealSelection || !activeGame) {
      return;
    }
    const gifts = activeGame.players.flatMap((player) => player.gifts || []);
    const stillExists = gifts.some((gift) => gift.gift_id === stealSelection.giftId);
    if (!stillExists) {
      setStealSelection(null);
    }
  }, [activeGame, stealSelection]);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const handleNameSubmit = (event) => {
    event.preventDefault();
    if (status !== 'connected' || !wsRef.current) {
      connect(nameInput.trim());
      return;
    }
    wsRef.current.send(
      JSON.stringify({
        type: 'rename',
        name: nameInput.trim(),
      })
    );
  };

  const handleReconnect = () => {
    connect(nameInput.trim());
  };

  const handleCreateRoom = (event) => {
    event.preventDefault();
    if (!sendMessage({ type: 'create_room', name: roomNameInput.trim() })) {
      return;
    }
    setRoomNameInput('');
    setRoomError('');
  };

  const handleJoinRoom = (roomId) => {
    sendMessage({ type: 'join_room', room_id: roomId });
    setRoomError('');
  };

  const handleLeaveRoom = () => {
    sendMessage({ type: 'leave_room' });
    setRoomError('');
  };

  const handleStartGame = (roomId) => {
    sendMessage({ type: 'start_game', room_id: roomId });
    setRoomError('');
  };

  const sendGameAction = (action, payload = {}) => {
    sendMessage({ type: 'game_action', action, payload });
  };

  const currentRoom = me
    ? rooms.find((room) => room.members?.some((member) => member.member_id === me.member_id))
    : null;
  const isHost = currentRoom && me && currentRoom.host_id === me.member_id;

  if (activeGame) {
    const isMyTurn = activeGame.turn.player_id === activeGame.viewer.member_id;
    const myHand = activeGame.viewer.hand || [];
    const myLands = activeGame.viewer.lands_in_play || [];
    const myBuilding = activeGame.viewer.building;
    const myPlayer = activeGame.players.find(
      (player) => player.member_id === activeGame.viewer.member_id
    );
    const myGifts = myPlayer ? myPlayer.gifts : [];
    const pendingDiscard = activeGame.viewer.pending_discard || 0;
    const isActionBlocked = !isMyTurn || activeGame.turn.has_taken_action;
    const isLandBlocked = !isMyTurn || activeGame.turn.has_played_land;

    const renderColorChip = (label, color) => (
      <span className={`card-chip card-chip--${color}`}>{label}</span>
    );

    const renderCostRow = (total, colorCount, color) => (
      <div className="cost-row">
        <span className="cost-label">Cost</span>
        <span className="cost-chip">{total} mana</span>
        {colorCount ? (
          <span className={`cost-chip cost-chip--color card-chip--${color}`}>
            {colorCount} {color}
          </span>
        ) : null}
      </div>
    );

    const renderBadge = (label) => <span className="mini-badge">{label}</span>;

    const renderColorDots = (items, limit = 6) => {
      const visible = items.slice(0, limit);
      const extra = items.length - visible.length;
      return (
        <>
          {visible.map((item, index) => (
            <span
              key={`${item.color}-${index}`}
              className={`color-dot color-dot--${item.color}`}
              title={item.color}
            />
          ))}
          {extra > 0 ? <span className="muted">+{extra}</span> : null}
        </>
      );
    };

    const startStealSelection = (gift) => {
      if (!isMyTurn || isActionBlocked) {
        return;
      }
      const reduction = myBuilding === 'thiefs_gloves' ? 2 : 0;
      const required = Math.max(0, gift.locks - reduction);
      if (required === 0) {
        sendGameAction('steal_gift', { gift_id: gift.gift_id, discard_indices: [] });
        return;
      }
      if (myHand.length < required) {
        return;
      }
      setStealSelection({
        giftId: gift.gift_id,
        giftClass: gift.gift_class,
        giftColor: gift.color,
        locks: gift.locks,
        required,
        selected: [],
      });
    };

    const toggleStealDiscard = (index) => {
      setStealSelection((current) => {
        if (!current) {
          return current;
        }
        const exists = current.selected.includes(index);
        let selected;
        if (exists) {
          selected = current.selected.filter((value) => value !== index);
        } else {
          if (current.selected.length >= current.required) {
            return current;
          }
          selected = [...current.selected, index];
        }
        return { ...current, selected };
      });
    };

    const confirmSteal = () => {
      if (!stealSelection) {
        return;
      }
      if (stealSelection.selected.length !== stealSelection.required) {
        return;
      }
      sendGameAction('steal_gift', {
        gift_id: stealSelection.giftId,
        discard_indices: stealSelection.selected,
      });
      setStealSelection(null);
    };

    return (
      <div className="page">
        <div className="shell game-shell">
          <section className="panel game-panel">
            <div className="panel-header">
              <div>
                <h2>Game Room</h2>
                <p className="muted">
                  Room #{activeGame.room_id} · Turn {activeGame.turn.number}
                </p>
              </div>
              <div className="game-header-actions">
                <div className="count-pill">Game #{activeGame.game_id.slice(0, 6)}</div>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    handleLeaveRoom();
                    setActiveGame(null);
                  }}
                >
                  Leave room
                </button>
              </div>
            </div>
            <div className="panel-body game-layout">
              <aside className="side-panel">
                <h3>Players</h3>
                <ul className="player-list">
                  {activeGame.players.map((player) => (
                    <li
                      key={player.member_id}
                      className={`player-card ${
                        player.member_id === activeGame.turn.player_id ? 'player-card--active' : ''
                      }`}
                    >
                      <div className="player-name">
                        {player.name}
                        {player.member_id === activeGame.viewer.member_id ? (
                          <span className="you-tag">You</span>
                        ) : null}
                      </div>
                      <div className="player-meta">Score {player.score}</div>
                      <div className="player-icons">
                        <div className="icon-row">
                          {renderBadge('L')}
                          {renderColorDots(player.lands_in_play)}
                          <span className="mini-count">{player.lands_in_play.length}</span>
                        </div>
                        <div className="icon-row">
                          {renderBadge('H')}
                          {Array.from({ length: Math.min(player.hand_count, 5) }).map((_, index) => (
                            <span key={index} className="icon-card" />
                          ))}
                          {player.hand_count > 5 ? (
                            <span className="muted">+{player.hand_count - 5}</span>
                          ) : null}
                          <span className="mini-count">{player.hand_count}</span>
                        </div>
                        <div className="icon-row">
                          {renderBadge('G')}
                          {player.gifts.length === 0 ? (
                            <span className="muted">No gifts</span>
                          ) : (
                            player.gifts.map((gift) => (
                              <span
                                key={gift.gift_id}
                                className={`icon-gift icon-gift--${gift.color}`}
                                title={`${gift.color} ${gift.gift_class}`}
                              />
                            ))
                          )}
                          <span className="mini-count">{player.gifts.length}</span>
                        </div>
                        <div className="icon-row">
                          {renderBadge('B')}
                          {player.building ? (
                            <span className="pill pill--host">
                              {BUILDING_LABELS[player.building]}
                            </span>
                          ) : (
                            <span className="muted">No building</span>
                          )}
                        </div>
                      </div>
                      {player.member_id !== activeGame.viewer.member_id
                        ? player.gifts.map((gift) => {
                            const reduction = myBuilding === 'thiefs_gloves' ? 2 : 0;
                            const discardNeeded = Math.max(0, gift.locks - reduction);
                            const canDiscard = myHand.length >= discardNeeded;
                            return (
                              <div key={`${gift.gift_id}-steal`} className="steal-card">
                                <div className="steal-header">
                                  {renderColorChip(gift.color, gift.color)}
                                  <div className="steal-title">Class {gift.gift_class}</div>
                                  <span
                                    className={`lock-badge ${
                                      gift.sealed ? 'lock-badge--sealed' : ''
                                    }`}
                                  >
                                    Locks {gift.locks}
                                  </span>
                                </div>
                                <div className="steal-cost">
                                  <span className="cost-chip cost-chip--mini">
                                    {GIFT_COSTS[gift.gift_class].total} mana
                                  </span>
                                  <span
                                    className={`cost-chip cost-chip--mini cost-chip--color card-chip--${gift.color}`}
                                  >
                                    {GIFT_COSTS[gift.gift_class].color} {gift.color}
                                  </span>
                                  <span className="cost-chip cost-chip--mini">
                                    Discard {discardNeeded}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  className="primary"
                                  disabled={gift.sealed || isActionBlocked || !canDiscard}
                                  onClick={() => startStealSelection(gift)}
                                >
                                  {gift.sealed ? 'Sealed' : 'Steal'}
                                </button>
                                {!canDiscard ? (
                                  <span className="muted">Not enough cards to discard.</span>
                                ) : null}
                              </div>
                            );
                          })
                        : null}
                    </li>
                  ))}
                </ul>
              </aside>

              <div className="game-main">
                <div className="game-top">
                  <div className="game-section">
                    <h3>Gifts on the Table</h3>
                    <div className="gift-grid">
                      {activeGame.gifts_display.map((gift) => {
                        const cost = GIFT_COSTS[gift.gift_class];
                        return (
                          <div key={gift.gift_id} className="gift-card">
                            <div className="gift-title">
                              {renderColorChip(gift.color, gift.color)}
                              <span>Class {gift.gift_class}</span>
                            </div>
                            <div className="gift-meta">Locks {gift.locks}</div>
                            {renderCostRow(cost.total, cost.color, gift.color)}
                            <button
                              type="button"
                              className="primary"
                              disabled={!isMyTurn || isActionBlocked}
                              onClick={() => sendGameAction('claim_gift', { gift_id: gift.gift_id })}
                            >
                              Claim
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="game-section">
                    <h3>Buildings</h3>
                    <div className="building-list">
                      {BUILDING_INFO.map((building) => (
                        <div key={building.key} className="building-card">
                          <div className="building-header">
                            {renderColorChip(building.color, building.color)}
                            <div>
                              <div className="building-name">{building.name}</div>
                              <div className="building-meta">{building.effect}</div>
                            </div>
                          </div>
                          {renderCostRow(BUILDING_COST.total, BUILDING_COST.color, building.color)}
                          <button
                            type="button"
                            className="ghost"
                            disabled={!!myBuilding || isActionBlocked}
                            onClick={() =>
                              sendGameAction('build_building', { building: building.key })
                            }
                          >
                            {myBuilding === building.key ? 'Built' : 'Build'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="game-bottom">
                  <div className="game-section">
                    <h3>Your Zone</h3>
                    <div className="zone-block">
                      <div className="zone-label">Hand</div>
                      <div className="hand-row">
                        {myHand.length === 0 ? (
                          <span className="muted">Empty</span>
                        ) : (
                          myHand.map((card, index) => (
                            <button
                              key={`${card}-${index}`}
                              type="button"
                              className={`card-chip card-chip--${card}`}
                              disabled={isLandBlocked}
                              onClick={() => sendGameAction('play_land', { index })}
                            >
                              {card} land
                            </button>
                          ))
                        )}
                      </div>
                      <div className="cost-note">Play 1 land per turn.</div>
                    </div>
                    <div className="zone-block">
                      <div className="zone-label">Lands in play</div>
                      <div className="land-row">
                        {myLands.length === 0 ? (
                          <span className="muted">No lands yet.</span>
                        ) : (
                          myLands.map((land, index) => (
                            <span
                              key={`${land.color}-${index}`}
                              className={`card-chip card-chip--${land.color} ${
                                land.tapped ? 'card-chip--tapped' : ''
                              }`}
                            >
                              {land.color}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                    <div className="zone-block">
                      <div className="zone-label">Building</div>
                      <div className="land-row">
                        {myBuilding ? (
                          <span className="pill pill--host">{BUILDING_LABELS[myBuilding]}</span>
                        ) : (
                          <span className="muted">None</span>
                        )}
                      </div>
                    </div>
                    <div className="zone-block">
                      <div className="zone-label">Your gifts</div>
                      <div className="land-row">
                        {myGifts.length === 0 ? (
                          <span className="muted">No gifts yet.</span>
                        ) : (
                          myGifts.map((gift) => (
                            <button
                              key={gift.gift_id}
                              type="button"
                              className={`card-chip card-chip--${gift.color}`}
                              disabled={isActionBlocked}
                              onClick={() => sendGameAction('wrap_gift', { gift_id: gift.gift_id })}
                            >
                              {gift.color} {gift.gift_class} · Wrap (2 mana)
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="game-section">
                    <h3>Actions</h3>
                    {gameError ? <div className="room-error">{gameError}</div> : null}
                    {stealSelection ? (
                      <div className="discard-panel">
                        <div className="discard-header">
                          <h4>Steal: discard {stealSelection.required}</h4>
                          <p className="muted">
                            Pick {stealSelection.required} cards to discard.
                          </p>
                        </div>
                        <div className="discard-grid">
                          {myHand.map((card, index) => {
                            const isSelected = stealSelection.selected.includes(index);
                            return (
                              <button
                                key={`${card}-${index}-steal-discard`}
                                type="button"
                                className={`card-chip card-chip--${card} ${
                                  isSelected ? 'card-chip--selected' : ''
                                }`}
                                disabled={!isMyTurn}
                                onClick={() => toggleStealDiscard(index)}
                              >
                                {isSelected ? 'Selected' : 'Discard'} {card}
                              </button>
                            );
                          })}
                        </div>
                        <div className="room-actions">
                          <button
                            type="button"
                            className="primary"
                            disabled={stealSelection.selected.length !== stealSelection.required}
                            onClick={confirmSteal}
                          >
                            Confirm steal
                          </button>
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => setStealSelection(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : null}
                    {pendingDiscard > 0 ? (
                      <div className="discard-panel">
                        <div className="discard-header">
                          <h4>Discard 1 land</h4>
                          <p className="muted">Select a card from your hand to discard.</p>
                        </div>
                        <div className="discard-grid">
                          {myHand.map((card, index) => (
                            <button
                              key={`${card}-${index}-discard`}
                              type="button"
                              className={`card-chip card-chip--${card}`}
                              disabled={!isMyTurn}
                              onClick={() => sendGameAction('discard', { index })}
                            >
                              Discard {card}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <div className="room-actions">
                      <button
                        type="button"
                        className="primary"
                        disabled={isActionBlocked}
                        onClick={() => sendGameAction('recycle')}
                      >
                        Recycle (draw then discard)
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        disabled={!isMyTurn || pendingDiscard > 0}
                        onClick={() => sendGameAction('end_turn')}
                      >
                        End turn
                      </button>
                    </div>
                    <p className="muted">
                      Main actions consume your action for the turn. Discard before ending turn.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  const membersCount = members.length;
  const statusLabel = STATUS_LABELS[status] || STATUS_LABELS.disconnected;
  const statusHint = STATUS_HINTS[status] || STATUS_HINTS.disconnected;

  return (
    <div className="page">
      <div className="shell">
        <section className="hero">
          <p className="eyebrow">Gifts Under Siege</p>
          <h1>Xmas Showdown Lobby</h1>
          <p className="lede">
            Gather the table, claim your seat, and keep an eye on the room while we
            get ready for the main event.
          </p>
          <div className="hero-grid">
            <div className="hero-card">
              <h2>Your guest badge</h2>
              <p className="muted">
                You arrive as a guest. Pick a name you want the lobby to see.
              </p>
              <form className="name-form" onSubmit={handleNameSubmit}>
                <label className="field">
                  Display name
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(event) => setNameInput(event.target.value)}
                    placeholder="Guest name"
                    maxLength={24}
                  />
                </label>
                <div className="actions">
                  <button type="submit" className="primary">
                    {status === 'connected' ? 'Update name' : 'Join lobby'}
                  </button>
                  <button type="button" className="ghost" onClick={handleReconnect}>
                    Reconnect
                  </button>
                </div>
              </form>
              <div className="status-row">
                <span className={`status-pill status-pill--${status}`}>{statusLabel}</span>
                <span className="status-hint">{statusHint}</span>
              </div>
            </div>
            <div className="hero-card hero-card--rules">
              <h2>Lobby etiquette</h2>
              <ul>
                <li>Stay ready while gifts are set on the table.</li>
                <li>Keep your guest name short and recognisable.</li>
                <li>Invite others by sharing the lobby link.</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="panel panel--rooms">
          <div className="panel-header">
            <div>
              <h2>Rooms</h2>
              <p className="muted">Create a room or join one already waiting.</p>
            </div>
            {currentRoom ? (
              <div className="count-pill">In room #{currentRoom.room_id}</div>
            ) : (
              <div className="count-pill">No room</div>
            )}
          </div>
          <div className="panel-body">
            <form className="room-form" onSubmit={handleCreateRoom}>
              <label className="field">
                Room name
                <input
                  type="text"
                  value={roomNameInput}
                  onChange={(event) => setRoomNameInput(event.target.value)}
                  placeholder="Snowfall Strategy"
                  maxLength={32}
                />
              </label>
              <button type="submit" className="primary">
                Create room
              </button>
            </form>
            {roomError ? <div className="room-error">{roomError}</div> : null}
            {rooms.length === 0 ? (
              <div className="empty-state">
                <p>No rooms yet. Create one to start gathering players.</p>
              </div>
            ) : (
              <ul className="room-list">
                {rooms.map((room) => {
                  const inRoom = currentRoom && currentRoom.room_id === room.room_id;
                  const canStart = inRoom && isHost && !room.started;
                  return (
                    <li key={room.room_id} className={`room ${inRoom ? 'room--active' : ''}`}>
                      <div className="room-top">
                        <div>
                          <div className="room-name">{room.name}</div>
                          <div className="room-meta">
                            Host: {room.host_name || '—'} · {room.members.length} players ·{' '}
                            {room.started ? 'In progress' : 'Waiting'}
                          </div>
                        </div>
                        <div className="room-code">#{room.room_id}</div>
                      </div>
                      <div className="room-members">
                        {room.members.map((member) => (
                          <span
                            key={member.member_id}
                            className={`pill ${
                              member.member_id === room.host_id ? 'pill--host' : ''
                            } ${me && member.member_id === me.member_id ? 'pill--me' : ''}`}
                          >
                            {member.name}
                          </span>
                        ))}
                      </div>
                      <div className="room-actions">
                        {inRoom ? (
                          <>
                            {canStart ? (
                              <button
                                type="button"
                                className="primary"
                                onClick={() => handleStartGame(room.room_id)}
                              >
                                Start game
                              </button>
                            ) : null}
                            <button type="button" className="ghost" onClick={handleLeaveRoom}>
                              Leave room
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="primary"
                            onClick={() => handleJoinRoom(room.room_id)}
                          >
                            Join room
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="panel-footer">
            <div>
              <p className="muted">Room status</p>
              <p className="status-line">
                {currentRoom
                  ? `${currentRoom.name} is ${currentRoom.started ? 'in progress' : 'waiting'}`
                  : 'You are not in a room yet.'}
              </p>
            </div>
            <div className="signal-bar">
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Live guests</h2>
              <p className="muted">Everyone connected right now.</p>
            </div>
            <div className="count-pill">{membersCount} online</div>
          </div>
          <div className="panel-body">
            {membersCount === 0 ? (
              <div className="empty-state">
                <p>No guests yet. Keep this tab open to hold the lobby.</p>
              </div>
            ) : (
              <ul className="member-list">
                {members.map((member) => (
                  <li key={member.member_id} className="member">
                    <div>
                      <div className="member-name">
                        {member.name}
                        {me && me.member_id === member.member_id ? (
                          <span className="you-tag">You</span>
                        ) : null}
                      </div>
                      <div className="member-meta">
                        Joined at {formatJoinedTime(member.joined_at)}
                      </div>
                    </div>
                    <div className="member-id">#{member.member_id.slice(0, 6)}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="panel-footer">
            <div>
              <p className="muted">Lobby status</p>
              <p className="status-line">
                {me ? `${me.name} is waiting for the game to begin.` : 'Connecting...'}
              </p>
            </div>
            <div className="signal-bar">
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
