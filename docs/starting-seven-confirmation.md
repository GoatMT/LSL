# Confirmed Starting 7 Data

Team profiles read a season-specific starting7 object from the matching team record. A lineup is displayed only when it is explicitly confirmed, tied to that season, and references seven unique players and seven valid slots from that formation.

~~~json
{
  "starting7": {
    "status": "confirmed",
    "season": "2026",
    "formation": "2-3-1",
    "source": "Official match sheet",
    "confirmedAt": "2026-06-13",
    "players": [
      { "playerId": "goalkeeper-id", "slot": "GK" },
      { "playerId": "left-defender-id", "slot": "LB" },
      { "playerId": "right-defender-id", "slot": "RB" },
      { "playerId": "left-midfielder-id", "slot": "LM" },
      { "playerId": "center-midfielder-id", "slot": "CM" },
      { "playerId": "right-midfielder-id", "slot": "RM" },
      { "playerId": "striker-id", "slot": "ST" }
    ]
  }
}
~~~

Supported formations and slots:

- 2-3-1: GK, LB, RB, LM, CM, RM, ST
- 3-2-1: GK, LB, CB, RB, LM, RM, ST
- 2-2-2: GK, LB, RB, LM, RM, LW, RW

Player name, jersey number, and photo are read from that season's team roster. If a photo or jersey number is missing, the graphic uses initials or “NO #”; it never fills the gap with a guess. Do not mark a proposed or simulated lineup as confirmed.
