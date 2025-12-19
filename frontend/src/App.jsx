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
  const [selectedBuilding, setSelectedBuilding] = useState('thiefs_gloves');
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
    const buildings = Object.keys(BUILDING_LABELS);
    const myPlayer = activeGame.players.find(
      (player) => player.member_id === activeGame.viewer.member_id
    );
    const myGifts = myPlayer ? myPlayer.gifts : [];

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
            <div className="panel-body game-grid">
              <div className="game-section">
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
                      <div className="player-meta">
                        Score {player.score} · Hand {player.hand_count} · Lands{' '}
                        {player.lands_in_play.length}
                      </div>
                      <div className="player-gifts">
                        {player.gifts.length === 0 ? (
                          <span className="muted">No gifts yet.</span>
                        ) : (
                          player.gifts.map((gift) => (
                            <span key={gift.gift_id} className="pill">
                              {gift.color} {gift.gift_class} · Locks {gift.locks}
                            </span>
                          ))
                        )}
                      </div>
                      {isMyTurn && player.member_id !== activeGame.viewer.member_id
                        ? player.gifts.map((gift) => (
                            <button
                              key={`${gift.gift_id}-steal`}
                              type="button"
                              className="ghost"
                              disabled={gift.sealed || activeGame.turn.has_taken_action}
                              onClick={() => sendGameAction('steal_gift', { gift_id: gift.gift_id })}
                            >
                              Steal {gift.gift_class}
                            </button>
                          ))
                        : null}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="game-section">
                <h3>Gifts on the Table</h3>
                <div className="gift-grid">
                  {activeGame.gifts_display.map((gift) => (
                    <div key={gift.gift_id} className="gift-card">
                      <div className="gift-title">
                        {gift.color} Gift · Class {gift.gift_class}
                      </div>
                      <div className="gift-meta">Locks {gift.locks}</div>
                      {isMyTurn ? (
                        <button
                          type="button"
                          className="primary"
                          disabled={activeGame.turn.has_taken_action}
                          onClick={() => sendGameAction('claim_gift', { gift_id: gift.gift_id })}
                        >
                          Claim
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>

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
                          className="pill"
                          disabled={!isMyTurn || activeGame.turn.has_played_land}
                          onClick={() => sendGameAction('play_land', { index })}
                        >
                          {card}
                        </button>
                      ))
                    )}
                  </div>
                </div>
                <div className="zone-block">
                  <div className="zone-label">Lands in play</div>
                  <div className="land-row">
                    {myLands.length === 0 ? (
                      <span className="muted">No lands yet.</span>
                    ) : (
                      myLands.map((land, index) => (
                        <span key={`${land.color}-${index}`} className="pill">
                          {land.color} {land.tapped ? '(tapped)' : ''}
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
                          className="pill"
                          disabled={!isMyTurn || activeGame.turn.has_taken_action}
                          onClick={() => sendGameAction('wrap_gift', { gift_id: gift.gift_id })}
                        >
                          Wrap {gift.color} {gift.gift_class}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="game-section">
                <h3>Actions</h3>
                {gameError ? <div className="room-error">{gameError}</div> : null}
                <div className="room-actions">
                  <button
                    type="button"
                    className="primary"
                    disabled={!isMyTurn || activeGame.turn.has_taken_action}
                    onClick={() => sendGameAction('draw_extra')}
                  >
                    Draw extra
                  </button>
                  <div className="select-row">
                    <select
                      value={selectedBuilding}
                      onChange={(event) => setSelectedBuilding(event.target.value)}
                      disabled={!!myBuilding}
                    >
                      {buildings.map((building) => (
                        <option key={building} value={building}>
                          {BUILDING_LABELS[building]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="ghost"
                      disabled={!isMyTurn || activeGame.turn.has_taken_action || !!myBuilding}
                      onClick={() => sendGameAction('build_building', { building: selectedBuilding })}
                    >
                      Build
                    </button>
                  </div>
                  <button
                    type="button"
                    className="ghost"
                    disabled={!isMyTurn}
                    onClick={() => sendGameAction('end_turn')}
                  >
                    End turn
                  </button>
                </div>
                <p className="muted">Pick cards in your hand to play a land.</p>
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
