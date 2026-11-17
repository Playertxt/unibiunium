#!/usr/bin/env python3
"""
UNBIUNIUM: Element 121 Air Combat - game server.

Serves the web game from ./public and runs a WebSocket lobby/relay at /ws
so friends can play together. Run:

    python3 server.py            # port 8080
    python3 server.py 9000       # custom port

Then open http://localhost:8080 (friends use http://<your-ip>:8080).
"""
import asyncio
import json
import mimetypes
import os
import random
import socket
import string
import sys
import time
from pathlib import Path

from aiohttp import WSMsgType, web

ROOT = Path(__file__).resolve().parent / "public"
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("PORT", "8080"))

# Message types that are simply forwarded to the other players in a room.
RELAY = {"st", "ai", "hit", "kill", "ev", "score", "spawn", "fx", "dmg"}
WORLD_IDS = ("island", "desert", "arctic", "archipelago", "highlands")
MAX_NAME = 18

mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")


class Player:
    def __init__(self, pid, ws):
        self.id = pid
        self.ws = ws
        self.name = "Pilot"
        self.team = 0
        self.plane = "falcon"
        self.ready = False
        self.room = None

    def public(self):
        return {"id": self.id, "name": self.name, "team": self.team,
                "plane": self.plane, "ready": self.ready}


class Room:
    def __init__(self, code, name, settings):
        self.code = code
        self.name = name
        self.settings = settings
        self.players = {}
        self.host = None
        self.state = "lobby"
        self.seed = random.randint(1, 2**31 - 1)
        self.started_at = 0.0

    def lobby_msg(self):
        return {"t": "lobby", "code": self.code, "name": self.name, "host": self.host,
                "state": self.state, "settings": self.settings,
                "players": [p.public() for p in self.players.values()]}

    def summary(self):
        return {"code": self.code, "name": self.name, "players": len(self.players),
                "max": self.settings.get("maxPlayers", 8), "state": self.state,
                "mode": self.settings.get("mode", "team"), "world": self.settings.get("world", "island")}


rooms = {}
_next_id = 0


def new_id():
    global _next_id
    _next_id += 1
    return f"p{_next_id}"


def new_code():
    while True:
        code = "".join(random.choice(string.ascii_uppercase.replace("O", "").replace("I", "")) for _ in range(4))
        if code not in rooms:
            return code


async def send(ws, obj):
    if ws.closed:
        return
    try:
        await ws.send_str(json.dumps(obj, separators=(",", ":")))
    except Exception:
        pass


async def broadcast(room, obj, exclude=None):
    data = json.dumps(obj, separators=(",", ":"))
    for p in list(room.players.values()):
        if p.id == exclude or p.ws.closed:
            continue
        try:
            await p.ws.send_str(data)
        except Exception:
            pass


def clean_settings(s):
    s = s or {}
    mode = s.get("mode", "team")
    if mode not in ("team", "coop", "ffa"):
        mode = "team"
    return {
        "mode": mode,
        "maxPlayers": max(2, min(16, int(s.get("maxPlayers", 8)))),
        "bots": max(0, min(8, int(s.get("bots", 2)))),
        "timeLimit": max(3, min(60, int(s.get("timeLimit", 15)))),
        "scoreLimit": max(500, min(20000, int(s.get("scoreLimit", 3000)))),
        "timeOfDay": s.get("timeOfDay", "day") if s.get("timeOfDay") in ("day", "dusk", "dawn") else "day",
        "world": s.get("world") if s.get("world") in WORLD_IDS else "island",
    }


def balanced_team(room):
    if room.settings.get("mode") == "coop":
        return 0
    counts = [0, 0]
    for p in room.players.values():
        counts[p.team] += 1
    return 0 if counts[0] <= counts[1] else 1


async def leave_room(player):
    room = player.room
    if not room:
        return
    player.room = None
    room.players.pop(player.id, None)
    if not room.players:
        rooms.pop(room.code, None)
        return
    await broadcast(room, {"t": "pleft", "id": player.id, "name": player.name})
    if room.host == player.id:
        room.host = next(iter(room.players))
        await broadcast(room, {"t": "host", "id": room.host})
    await broadcast(room, room.lobby_msg())


async def join_room(player, room):
    if player.room:
        await leave_room(player)
    player.room = room
    player.ready = False
    player.team = balanced_team(room)
    room.players[player.id] = player
    if room.host is None:
        room.host = player.id
    await send(player.ws, {"t": "joined", "code": room.code, "you": player.id, "host": room.host})
    await broadcast(room, room.lobby_msg())
    if room.state == "playing":
        # Late join: drop straight into the running match.
        await broadcast(room, {"t": "pjoin", "player": player.public()}, exclude=player.id)
        await send(player.ws, {"t": "start", "seed": room.seed, "settings": room.settings,
                               "players": [p.public() for p in room.players.values()],
                               "elapsed": time.time() - room.started_at, "late": True})


async def handle(player, msg):
    t = msg.get("t")
    room = player.room

    if t == "hello":
        player.name = str(msg.get("name", "Pilot"))[:MAX_NAME] or "Pilot"
        await send(player.ws, {"t": "welcome", "id": player.id})
    elif t == "list":
        await send(player.ws, {"t": "rooms", "rooms": [r.summary() for r in rooms.values()]})
    elif t == "create":
        settings = clean_settings(msg.get("settings"))
        code = new_code()
        rname = str(msg.get("name") or f"{player.name}'s room")[:28]
        room = Room(code, rname, settings)
        rooms[code] = room
        await join_room(player, room)
    elif t == "join":
        code = str(msg.get("code", "")).upper().strip()
        target = rooms.get(code)
        if not target:
            await send(player.ws, {"t": "error", "msg": f"Room {code} not found"})
        elif len(target.players) >= target.settings["maxPlayers"]:
            await send(player.ws, {"t": "error", "msg": "Room is full"})
        else:
            await join_room(player, target)
    elif t == "leave":
        await leave_room(player)
        await send(player.ws, {"t": "left"})
    elif not room:
        return
    elif t == "lobby":
        if "team" in msg and room.settings["mode"] != "coop":
            player.team = 1 if int(msg["team"]) == 1 else 0
        if "plane" in msg:
            player.plane = str(msg["plane"])[:16]
        if "ready" in msg:
            player.ready = bool(msg["ready"])
        if "name" in msg:
            player.name = str(msg["name"])[:MAX_NAME] or player.name
        await broadcast(room, room.lobby_msg())
    elif t == "settings" and player.id == room.host and room.state == "lobby":
        room.settings = clean_settings(msg.get("settings"))
        if room.settings["mode"] == "coop":
            for p in room.players.values():
                p.team = 0
        await broadcast(room, room.lobby_msg())
    elif t == "start" and player.id == room.host and room.state == "lobby":
        room.state = "playing"
        room.seed = random.randint(1, 2**31 - 1)
        room.started_at = time.time()
        await broadcast(room, {"t": "start", "seed": room.seed, "settings": room.settings,
                               "players": [p.public() for p in room.players.values()],
                               "elapsed": 0, "late": False})
        await broadcast(room, room.lobby_msg())
    elif t == "end" and player.id == room.host and room.state == "playing":
        room.state = "lobby"
        for p in room.players.values():
            p.ready = False
        await broadcast(room, {"t": "end", "results": msg.get("results")})
        await broadcast(room, room.lobby_msg())
    elif t == "chat":
        text = str(msg.get("text", ""))[:160]
        if text:
            await broadcast(room, {"t": "chat", "from": player.id, "name": player.name,
                                   "team": player.team, "text": text})
    elif t in RELAY:
        msg["from"] = player.id
        to = msg.get("to")
        if to:
            target = room.players.get(to)
            if target:
                await send(target.ws, msg)
        else:
            await broadcast(room, msg, exclude=player.id)


async def ws_handler(request):
    ws = web.WebSocketResponse(heartbeat=15, max_msg_size=2 * 1024 * 1024)
    await ws.prepare(request)
    player = Player(new_id(), ws)
    try:
        async for m in ws:
            if m.type == WSMsgType.TEXT:
                try:
                    msg = json.loads(m.data)
                except ValueError:
                    continue
                if isinstance(msg, dict):
                    await handle(player, msg)
            elif m.type == WSMsgType.ERROR:
                break
    finally:
        await leave_room(player)
    return ws


async def static_handler(request):
    rel = request.match_info.get("path", "") or "index.html"
    path = (ROOT / rel).resolve()
    if ROOT not in path.parents and path != ROOT:
        raise web.HTTPForbidden()
    if path.is_dir():
        path = path / "index.html"
    if not path.is_file():
        raise web.HTTPNotFound()
    resp = web.FileResponse(path)
    resp.headers["Cache-Control"] = "no-cache"
    return resp


def lan_addresses():
    ips = set()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        ips.add(s.getsockname()[0])
        s.close()
    except Exception:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ips.add(info[4][0])
    except Exception:
        pass
    return sorted(ip for ip in ips if not ip.startswith("127."))


def main():
    app = web.Application()
    app.router.add_get("/ws", ws_handler)
    app.router.add_get("/", static_handler)
    app.router.add_get("/{path:.*}", static_handler)
    print("\n  UNBIUNIUM: Element 121 Air Combat server")
    print(f"  Local:   http://localhost:{PORT}")
    for ip in lan_addresses():
        print(f"  Friends: http://{ip}:{PORT}")
    print("  (Ctrl+C to stop)\n")
    web.run_app(app, host="0.0.0.0", port=PORT, print=None)


if __name__ == "__main__":
    main()
