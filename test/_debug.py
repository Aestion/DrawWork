import requests, time
ts = int(time.time())
api = requests.Session()
email = f"dbg2_{ts}@test.com"
api.post(f"http://localhost:3000/api/auth/register", json={"username":f"dbg2_{ts}","email":email,"password":"TestPass123!"})
r = api.post(f"http://localhost:3000/api/auth/login", json={"email":email,"password":"TestPass123!"})
api.headers["Authorization"] = f"Bearer {r.json()['token']}"
board = api.post(f"http://localhost:3000/api/boards", json={"name":f"DBG Board {ts}"})
bid = board.json()["id"]
canvases = api.get(f"http://localhost:3000/api/boards/{bid}/canvases").json()
for c in canvases:
    print(f"  {c['id']} [{c['type']}] {c['name']}")
# Try delete
cid = canvases[0]["id"]
r = api.delete(f"http://localhost:3000/api/boards/{bid}/canvases/{cid}")
print(f"\nDELETE {cid}: {r.status_code} {r.text[:200]}")
# Check if there's a DELETE endpoint
r2 = api.delete(f"http://localhost:3000/api/canvases/{cid}")
print(f"DELETE /api/canvases/{cid}: {r2.status_code} {r2.text[:200]}")
