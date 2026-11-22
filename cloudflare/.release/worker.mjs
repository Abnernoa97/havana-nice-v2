var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/modules/admin/admin-realtime.js
var ADMIN_PROTOCOL = "havana-v2-admin";
var ADMIN_TOKEN = /^[A-Za-z0-9_-]{40,128}$/;
function adminSocketToken(request) {
  const protocols = (request.headers.get("sec-websocket-protocol") || "").split(",").map((p) => p.trim());
  if (!protocols.includes(ADMIN_PROTOCOL)) return "";
  const value = protocols.find((p) => p.startsWith("admin."))?.slice(6) || "";
  return ADMIN_TOKEN.test(value) ? value : "";
}
__name(adminSocketToken, "adminSocketToken");
function adminTokenRequest(token) {
  return new Request("https://internal/admin-session-check", { headers: { authorization: "Bearer " + token } });
}
__name(adminTokenRequest, "adminTokenRequest");
async function notifyAdminClients(env, topic) {
  if (!["members"].includes(topic)) return;
  try {
    await env.CHAT_ROOMS.get(env.CHAT_ROOMS.idFromName("main-chat-v2")).fetch(
      "https://internal/admin-invalidate",
      { method: "POST", body: JSON.stringify({ topic }) }
    );
  } catch {
  }
}
__name(notifyAdminClients, "notifyAdminClients");

// src/shared/crypto-helpers.js
var encoder = new TextEncoder();
async function sha256Hex(value) {
  const bytes = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(bytes), (n) => n.toString(16).padStart(2, "0")).join("");
}
__name(sha256Hex, "sha256Hex");

// src/modules/admin/admin-auth.js
var encoder2 = new TextEncoder();
var HOUR = 60 * 60 * 1e3;
var ATTEMPT_WINDOW = 15 * 60 * 1e3;
var SESSION_DURATION = 8 * HOUR;
var MIN_SECRET_LENGTH = 8;
var TOKEN = /^[A-Za-z0-9_-]{40,128}$/;
function opaque(bytes = 32) {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(bytes)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
__name(opaque, "opaque");
async function equalSecret(left, right) {
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder2.encode(left)),
    crypto.subtle.digest("SHA-256", encoder2.encode(right))
  ]);
  let difference = 0;
  const x = new Uint8Array(a), y = new Uint8Array(b);
  for (let i = 0; i < x.length; i++) difference |= x[i] ^ y[i];
  return difference === 0;
}
__name(equalSecret, "equalSecret");
function adminLoginConfigured(env) {
  return env.V2_ADMIN_LOGIN_MODE === "enabled" && typeof env.V2_ADMIN_LOGIN_SECRET === "string" && env.V2_ADMIN_LOGIN_SECRET.length >= MIN_SECRET_LENGTH;
}
__name(adminLoginConfigured, "adminLoginConfigured");
function tokenFromRequest(request) {
  return (request.headers.get("authorization") || "").match(/^Bearer ([A-Za-z0-9_-]{40,128})$/i)?.[1] || "";
}
__name(tokenFromRequest, "tokenFromRequest");
async function verifyAdminSession(request, env) {
  if (!adminLoginConfigured(env)) return false;
  const token = tokenFromRequest(request);
  if (!TOKEN.test(token)) return false;
  const row = await env.DB.prepare(
    "SELECT expires_at,revoked_at FROM chat_admin_sessions WHERE token_hash=?"
  ).bind(await sha256Hex(token)).first();
  return !!row && row.revoked_at == null && Number(row.expires_at) > Date.now();
}
__name(verifyAdminSession, "verifyAdminSession");
async function clientHash(request, env) {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  return sha256Hex(env.V2_ADMIN_LOGIN_SECRET + ":" + ip);
}
__name(clientHash, "clientHash");
async function issueAdminSession(env) {
  const now = Date.now(), token = opaque(), expiresAt = now + SESSION_DURATION;
  await env.DB.prepare("INSERT INTO chat_admin_sessions(token_hash,created_at,expires_at) VALUES(?,?,?)").bind(await sha256Hex(token), now, expiresAt).run();
  return { token, expiresAt: new Date(expiresAt).toISOString(), role: "chat-admin" };
}
__name(issueAdminSession, "issueAdminSession");
async function handleAdminSessionApi(request, env, url, origin, respond3) {
  const reply6 = /* @__PURE__ */ __name((body3, status = 200) => respond3(body3, status, origin), "reply");
  if (url.pathname === "/api/chat/admin/auth/status" && request.method === "GET") {
    return reply6({ enabled: adminLoginConfigured(env) });
  }
  if (!adminLoginConfigured(env)) return reply6({ error: "Inicio de administrador a\xFAn no configurado" }, 503);
  if (url.pathname === "/api/chat/admin/auth/sessions" && request.method === "GET") {
    if (!await verifyAdminSession(request, env)) return reply6({ error: "No autorizado" }, 401);
    const currentHash = await sha256Hex(tokenFromRequest(request));
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS others FROM chat_admin_sessions WHERE revoked_at IS NULL AND expires_at>? AND token_hash<>?"
    ).bind(Date.now(), currentHash).first();
    return reply6({ others: Number(row?.others || 0) });
  }
  if (url.pathname === "/api/chat/admin/auth/revoke-others" && request.method === "POST") {
    if (!await verifyAdminSession(request, env)) return reply6({ error: "No autorizado" }, 401);
    const currentHash = await sha256Hex(tokenFromRequest(request));
    const result = await env.DB.prepare(
      "UPDATE chat_admin_sessions SET revoked_at=? WHERE revoked_at IS NULL AND expires_at>? AND token_hash<>?"
    ).bind(Date.now(), Date.now(), currentHash).run();
    await notifyAdminClients(env, "members");
    return reply6({ ok: true, revoked: Number(result.meta?.changes || 0) });
  }
  if (url.pathname === "/api/chat/admin/auth/session" && request.method === "GET") {
    if (!await verifyAdminSession(request, env)) return reply6({ error: "No autorizado" }, 401);
    return reply6({ ok: true });
  }
  if (url.pathname === "/api/chat/admin/auth/session" && request.method === "DELETE") {
    if (!await verifyAdminSession(request, env)) return reply6({ error: "No autorizado" }, 401);
    await env.DB.prepare("UPDATE chat_admin_sessions SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL").bind(Date.now(), await sha256Hex(tokenFromRequest(request))).run();
    await notifyAdminClients(env, "members");
    return reply6({ ok: true });
  }
  if (url.pathname !== "/api/chat/admin/auth/session" || request.method !== "POST")
    return reply6({ error: "M\xE9todo no permitido" }, 405);
  if ((request.headers.get("content-type") || "").split(";")[0].trim() !== "application/json")
    return reply6({ error: "Solicitud inv\xE1lida" }, 415);
  let body2 = null;
  try {
    body2 = await request.json();
  } catch {
    return reply6({ error: "Solicitud inv\xE1lida" }, 400);
  }
  const now = Date.now(), client = await clientHash(request, env);
  const existing = await env.DB.prepare(
    "SELECT failures,window_start FROM chat_admin_login_limits WHERE client_hash=?"
  ).bind(client).first();
  if (existing?.window_start > now - ATTEMPT_WINDOW && Number(existing.failures) >= 5)
    return reply6({ error: "Demasiados intentos. Intenta m\xE1s tarde." }, 429);
  const password = typeof body2?.password === "string" ? body2.password : "";
  const valid = password.length >= MIN_SECRET_LENGTH && password.length <= 256 && await equalSecret(password, env.V2_ADMIN_LOGIN_SECRET);
  if (!valid) {
    await env.DB.prepare(
      "INSERT INTO chat_admin_login_limits(client_hash,window_start,failures) VALUES(?,?,1) ON CONFLICT(client_hash) DO UPDATE SET failures=CASE WHEN window_start<? THEN 1 ELSE failures+1 END,window_start=CASE WHEN window_start<? THEN excluded.window_start ELSE window_start END"
    ).bind(client, now, now - ATTEMPT_WINDOW, now - ATTEMPT_WINDOW).run();
    return reply6({ error: "Credencial no v\xE1lida" }, 401);
  }
  await env.DB.prepare("DELETE FROM chat_admin_login_limits WHERE client_hash=?").bind(client).run();
  const session2 = await issueAdminSession(env);
  try {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM chat_admin_sessions WHERE expires_at<=? OR revoked_at IS NOT NULL").bind(now),
      env.DB.prepare("DELETE FROM chat_admin_login_limits WHERE window_start<?").bind(now - 24 * HOUR)
    ]);
  } catch {
  }
  return reply6(session2);
}
__name(handleAdminSessionApi, "handleAdminSessionApi");

// src/modules/family/family-quota.js
var FAMILY_STORAGE_STOP_BYTES = 95e8;
var FAMILY_STORAGE_WARNING_BYTES = 9e9;
var UNKNOWN_POSTER_ESTIMATE = 384 * 1024;
var USAGE_SQL = `(SELECT COALESCE(SUM(size_bytes + CASE
 WHEN poster_key IS NULL THEN 0
 WHEN poster_size_bytes>0 THEN poster_size_bytes
 ELSE ${UNKNOWN_POSTER_ESTIMATE} END),0) FROM family_media)`;
var CHAT_SQL = `(SELECT COALESCE(SUM(size_bytes),0) FROM chat_media_objects WHERE status='ready')`;
var MEMBER_DELETE_PENDING_SQL = `(SELECT COALESCE(SUM(size_bytes),0) FROM r2_member_delete_queue)`;
var BOOK_SQL = `(SELECT COALESCE(SUM(size_bytes+optimized_size_bytes),0) FROM book_pages)`;
var BOOK_DELETE_PENDING_SQL = `(SELECT COALESCE(SUM(size_bytes),0) FROM book_delete_queue)`;
var CALENDAR_PHOTOS_SQL = `(SELECT COALESCE(SUM(size_bytes+optimized_size_bytes),0) FROM calendar_event_photos)`;
var CALENDAR_PHOTOS_PENDING_SQL = `(SELECT COALESCE(SUM(size_bytes),0) FROM calendar_photo_delete_queue)`;
var AUDIO_SQL = `(SELECT COALESCE(SUM(size_bytes+cover_size_bytes),0) FROM audio_tracks)`;
var AUDIO_DELETE_SQL = `(SELECT COALESCE(SUM(size_bytes),0) FROM audio_delete_queue)`;
var GLOBAL_SQL = USAGE_SQL + "+" + CHAT_SQL + "+" + MEMBER_DELETE_PENDING_SQL + "+" + BOOK_SQL + "+" + BOOK_DELETE_PENDING_SQL + "+" + CALENDAR_PHOTOS_SQL + "+" + CALENDAR_PHOTOS_PENDING_SQL + "+" + AUDIO_SQL + "+" + AUDIO_DELETE_SQL;
var ACTIVE_SQL = `(SELECT COALESCE(SUM(size_bytes),0) FROM family_upload_sessions)`;
var RESERVED_SQL = `(SELECT COALESCE(SUM(size_bytes),0) FROM family_upload_reservations)`;
async function familyStorageUsage(env) {
  const row = await env.DB.prepare("SELECT " + GLOBAL_SQL + " AS used_bytes," + ACTIVE_SQL + "+" + RESERVED_SQL + " AS pending_bytes").first();
  const usedBytes = Number(row?.used_bytes || 0);
  const pendingBytes = Number(row?.pending_bytes || 0);
  const occupied = usedBytes + pendingBytes;
  return {
    usedBytes,
    pendingBytes,
    maxBytes: FAMILY_STORAGE_STOP_BYTES,
    warningBytes: FAMILY_STORAGE_WARNING_BYTES,
    remainingBytes: Math.max(0, FAMILY_STORAGE_STOP_BYTES - occupied),
    warning: occupied >= FAMILY_STORAGE_WARNING_BYTES,
    stopped: occupied >= FAMILY_STORAGE_STOP_BYTES
  };
}
__name(familyStorageUsage, "familyStorageUsage");
async function reserveFamilyStorage(env, bytes, id = crypto.randomUUID()) {
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > FAMILY_STORAGE_STOP_BYTES) return null;
  await env.DB.prepare("DELETE FROM family_upload_reservations WHERE expires_at<?").bind(Date.now()).run();
  const sql = "INSERT INTO family_upload_reservations(id,size_bytes,expires_at) SELECT ?,?,? WHERE " + GLOBAL_SQL + "+" + ACTIVE_SQL + "+" + RESERVED_SQL + "+? <= ?";
  await env.DB.prepare(sql).bind(
    id,
    bytes,
    Date.now() + 6 * 60 * 60 * 1e3,
    bytes,
    FAMILY_STORAGE_STOP_BYTES
  ).run();
  const reserved = await env.DB.prepare("SELECT id FROM family_upload_reservations WHERE id=?").bind(id).first();
  return reserved ? id : null;
}
__name(reserveFamilyStorage, "reserveFamilyStorage");
async function releaseFamilyStorage(env, id) {
  await env.DB.prepare("DELETE FROM family_upload_reservations WHERE id=?").bind(id).run();
}
__name(releaseFamilyStorage, "releaseFamilyStorage");

// src/modules/admin/admin-storage-summary.js
var GROUPS = [
  { id: "family", name: "Familia", sql: `SELECT COUNT(*) count,COALESCE(SUM(size_bytes+
  CASE WHEN poster_key IS NULL THEN 0 WHEN poster_size_bytes>0
   THEN poster_size_bytes ELSE 393216 END),0) bytes FROM family_media` },
  { id: "chat", name: "Chat", sql: `SELECT COUNT(*) count,COALESCE(SUM(size_bytes),0) bytes
  FROM chat_media_objects WHERE status='ready'` },
  { id: "book", name: "BOOK", sql: `SELECT COUNT(*) count,
  COALESCE(SUM(size_bytes+optimized_size_bytes),0) bytes FROM book_pages` },
  { id: "calendar", name: "Calendario", sql: `SELECT COUNT(*) count,
  COALESCE(SUM(size_bytes+optimized_size_bytes),0) bytes FROM calendar_event_photos` },
  { id: "audio", name: "Audio", sql: `SELECT COUNT(*) count,
  COALESCE(SUM(size_bytes+cover_size_bytes),0) bytes FROM audio_tracks` },
  { id: "stories", name: "Estados", sql: `SELECT COUNT(*) count,
  COALESCE(SUM(byte_size),0) bytes FROM member_stories` },
  { id: "profiles", name: "Perfiles", sql: `SELECT COUNT(*) count,
  COALESCE(SUM(photo_size),0) bytes FROM member_profiles WHERE photo_key IS NOT NULL` },
  { id: "cleanup", name: "Pendiente de limpieza", sql: `SELECT
  ((SELECT COUNT(*) FROM audio_delete_queue)+
   (SELECT COUNT(*) FROM r2_member_delete_queue)+
   (SELECT COUNT(*) FROM book_delete_queue)+
   (SELECT COUNT(*) FROM calendar_photo_delete_queue)) count,
  ((SELECT COALESCE(SUM(size_bytes),0) FROM audio_delete_queue)+
   (SELECT COALESCE(SUM(size_bytes),0) FROM r2_member_delete_queue)+
   (SELECT COALESCE(SUM(size_bytes),0) FROM book_delete_queue)+
   (SELECT COALESCE(SUM(size_bytes),0) FROM calendar_photo_delete_queue)) bytes` }
];
async function handleAdminStorageSummary(request, env, url, origin, respond3) {
  const reply6 = /* @__PURE__ */ __name((body2, status = 200) => respond3(body2, status, origin), "reply");
  if (url.pathname !== "/api/chat/admin/storage/summary" || request.method !== "GET")
    return reply6({ error: "Ruta no encontrada" }, 404);
  if (!await verifyAdminSession(request, env)) return reply6({ error: "No autorizado" }, 401);
  try {
    const [quota, ...records] = await Promise.all([
      familyStorageUsage(env),
      ...GROUPS.map(async (group) => {
        const row = await env.DB.prepare(group.sql).first();
        return { id: group.id, name: group.name, count: Number(row?.count || 0), bytes: Number(row?.bytes || 0) };
      })
    ]);
    const files = records.filter((item) => item.id !== "cleanup");
    const extraBytes = files.filter((item) => item.id === "stories" || item.id === "profiles").reduce((sum, item) => sum + item.bytes, 0);
    return reply6({
      storage: quota,
      rows: records,
      indexedFiles: files.reduce((sum, item) => sum + item.count, 0),
      indexedBytes: records.reduce((sum, item) => sum + item.bytes, 0),
      outsideQuotaBytes: extraBytes,
      note: "Cifras basadas en archivos registrados en D1. No son un inventario directo de R2. Estados y perfiles se muestran por separado del l\xEDmite controlado."
    });
  } catch {
    return reply6({ error: "No se pudo consultar el almacenamiento." }, 503);
  }
}
__name(handleAdminStorageSummary, "handleAdminStorageSummary");

// src/modules/family/family-realtime.js
var ROOM = "main-chat-v2";
async function notifyFamilyClients(env) {
  if (!env.CHAT_ROOMS) return;
  try {
    const stub = env.CHAT_ROOMS.get(env.CHAT_ROOMS.idFromName(ROOM));
    const response2 = await stub.fetch("https://internal/family-invalidate", { method: "POST" });
    if (!response2.ok) throw Error("Familia realtime signal unavailable: " + response2.status);
  } catch {
  }
}
__name(notifyFamilyClients, "notifyFamilyClients");

// src/modules/audio/audio.js
var AUDIO_MIME = /* @__PURE__ */ new Set(["audio/mpeg", "audio/mp4", "audio/aac", "audio/x-m4a", "audio/wav", "audio/wave"]);
var COVER_MIME = /* @__PURE__ */ new Set(["image/jpeg", "image/png", "image/webp"]);
var GRANT_TTL = 60 * 60 * 1e3;
var MAX_AUDIO = 30 * 1024 * 1024;
var MAX_COVER = 400 * 1024;
var MAX_TRACKS = 100;
var ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
var TOKEN2 = /^[a-f0-9]{32}$/;
var ORIGIN = "https://havana-nice-v2.pages.dev";
var json = /* @__PURE__ */ __name((value, status = 200, origin = "") => new Response(JSON.stringify(value), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "private,no-store",
    "access-control-allow-origin": origin || ORIGIN,
    "vary": "Origin",
    "referrer-policy": "no-referrer"
  }
}), "json");
var headers = /* @__PURE__ */ __name((origin, contentType) => new Headers({
  "content-type": contentType,
  "cache-control": "private,no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "accept-ranges": "bytes",
  "access-control-allow-origin": origin || ORIGIN,
  "vary": "Origin"
}), "headers");
function field(request, name, fallback = "", max = 120) {
  const raw = request.headers.get(name);
  if (!raw) return fallback;
  try {
    return decodeURIComponent(raw).replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max) || fallback;
  } catch {
    return fallback;
  }
}
__name(field, "field");
async function issue(env, rows) {
  if (!rows.length) return [];
  const expire = Date.now() + GRANT_TTL;
  const pairs = rows.flatMap((row) => [
    { id: row.id, variant: "audio" },
    ...row.cover_key ? [{ id: row.id, variant: "cover" }] : []
  ]);
  const tokens = pairs.map(() => crypto.randomUUID().replace(/-/g, ""));
  const hashes = await Promise.all(tokens.map(sha256Hex));
  await env.DB.batch(pairs.map((row, i) => env.DB.prepare(
    "INSERT INTO audio_media_grants(token_hash,track_id,variant,expires_at) VALUES(?,?,?,?)"
  ).bind(hashes[i], row.id, row.variant, expire)));
  let cursor = 0;
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    artist: row.artist,
    album: row.album,
    position: row.position,
    sizeBytes: row.size_bytes,
    hasCover: !!row.cover_key,
    audioUrl: "/api/audio/media/" + tokens[cursor++],
    coverUrl: row.cover_key ? "/api/audio/media/" + tokens[cursor++] : null
  }));
}
__name(issue, "issue");
async function cleanup(env) {
  if (!env.MEDIA_BUCKET) return;
  const rows = (await env.DB.prepare(
    "SELECT object_key FROM audio_delete_queue ORDER BY queued_at ASC LIMIT 15"
  ).all()).results || [];
  for (const row of rows) {
    try {
      await env.MEDIA_BUCKET.delete(row.object_key);
      await env.DB.prepare("DELETE FROM audio_delete_queue WHERE object_key=?").bind(row.object_key).run();
    } catch {
    }
  }
}
__name(cleanup, "cleanup");
async function readGrant(request, env, url, origin) {
  if (request.method !== "GET" && request.method !== "HEAD") return json({ error: "M\xE9todo no permitido" }, 405, origin);
  const token = url.pathname.slice("/api/audio/media/".length);
  if (!TOKEN2.test(token)) return json({ error: "Archivo no disponible" }, 404, origin);
  const row = await env.DB.prepare(
    "SELECT t.object_key,t.mime_type,t.cover_key,t.cover_mime,g.variant FROM audio_media_grants g JOIN audio_tracks t ON t.id=g.track_id WHERE g.token_hash=? AND g.expires_at>? AND t.published=1"
  ).bind(await sha256Hex(token), Date.now()).first();
  if (!row || !env.MEDIA_BUCKET) return json({ error: "Enlace caducado o archivo no disponible" }, 404, origin);
  const isCover = row.variant === "cover";
  if (isCover && !row.cover_key) return json({ error: "Sin portada" }, 404, origin);
  const object = await env.MEDIA_BUCKET.get(
    isCover ? row.cover_key : row.object_key,
    !isCover && request.headers.has("range") ? { range: request.headers } : {}
  );
  if (!object) return json({ error: "Archivo no disponible" }, 404, origin);
  const h = headers(origin, isCover ? row.cover_mime : row.mime_type);
  let status = 200;
  if (!isCover && request.headers.has("range") && object.range && typeof object.range.offset === "number" && typeof object.range.length === "number") {
    const start = object.range.offset, end = start + object.range.length - 1;
    h.set("content-range", `bytes ${start}-${end}/${object.size}`);
    h.set("content-length", String(object.range.length));
    status = 206;
  } else h.set("content-length", String(object.size));
  return new Response(request.method === "HEAD" ? null : object.body, { status, headers: h });
}
__name(readGrant, "readGrant");
async function list(env, origin) {
  await env.DB.prepare("DELETE FROM audio_media_grants WHERE expires_at<=?").bind(Date.now()).run();
  const rows = (await env.DB.prepare(
    "SELECT id,title,artist,album,position,size_bytes,cover_key FROM audio_tracks WHERE published=1 ORDER BY position ASC,created_at ASC LIMIT 100"
  ).all()).results || [];
  return json({ tracks: await issue(env, rows) }, 200, origin);
}
__name(list, "list");
async function uploadAudio(request, env, origin) {
  if (!env.MEDIA_BUCKET) return json({ error: "R2 no disponible" }, 503, origin);
  const mime = (request.headers.get("content-type") || "").split(";")[0].toLowerCase();
  if (!AUDIO_MIME.has(mime)) return json({ error: "Audio no compatible; utiliza MP3, M4A, AAC o WAV" }, 415, origin);
  const size = Number(request.headers.get("content-length") || 0);
  if (!Number.isSafeInteger(size) || size < 128 || size > MAX_AUDIO) return json({ error: "Audio vac\xEDo o mayor de 30 MiB" }, 413, origin);
  const title = field(request, "x-audio-title", "", 120);
  if (!title) return json({ error: "Falta el t\xEDtulo" }, 400, origin);
  const artist = field(request, "x-audio-artist", "HAVANA NICE", 100);
  const album = field(request, "x-audio-album", "HAVANA NICE", 100);
  const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM audio_tracks").first();
  if (Number(count?.total || 0) >= MAX_TRACKS) return json({ error: "M\xE1ximo 100 canciones" }, 409, origin);
  const id = crypto.randomUUID(), key = "audio/v2/original/" + id;
  const reservation = await reserveFamilyStorage(env, size, id);
  if (!reservation) return json({ error: "No hay suficiente memoria privada disponible" }, 409, origin);
  try {
    const stored = await env.MEDIA_BUCKET.put(key, request.body, {
      httpMetadata: { contentType: mime },
      customMetadata: { module: "audio-havana-nice-v2" }
    });
    if (!stored || stored.size !== size) {
      await env.MEDIA_BUCKET.delete(key);
      return json({ error: "Tama\xF1o incorrecto" }, 400, origin);
    }
    try {
      await env.DB.prepare(
        "INSERT INTO audio_tracks(id,title,artist,album,object_key,mime_type,size_bytes,created_at,position) VALUES(?,?,?,?,?,?,?,?,(SELECT COALESCE(MAX(position),0)+100 FROM audio_tracks))"
      ).bind(id, title, artist, album, key, mime, size, Date.now()).run();
    } catch {
      await env.MEDIA_BUCKET.delete(key).catch(async () => env.DB.prepare(
        "INSERT OR IGNORE INTO audio_delete_queue(object_key,size_bytes,queued_at) VALUES(?,?,?)"
      ).bind(key, size, Date.now()).run());
      return json({ error: "No se pudo registrar el audio" }, 503, origin);
    }
    return json({ id, ok: true }, 201, origin);
  } catch {
    return json({ error: "No se pudo subir el audio" }, 503, origin);
  } finally {
    await releaseFamilyStorage(env, reservation);
  }
}
__name(uploadAudio, "uploadAudio");
async function uploadCover(request, env, id, origin) {
  if (!env.MEDIA_BUCKET) return json({ error: "R2 no disponible" }, 503, origin);
  const mime = (request.headers.get("content-type") || "").split(";")[0].toLowerCase();
  const size = Number(request.headers.get("content-length") || 0);
  if (!COVER_MIME.has(mime) || !Number.isSafeInteger(size) || size < 32 || size > MAX_COVER)
    return json({ error: "Portada JPG, PNG o WebP de m\xE1ximo 400 KiB" }, 415, origin);
  const track = await env.DB.prepare("SELECT cover_key,cover_size_bytes FROM audio_tracks WHERE id=?").bind(id).first();
  if (!track) return json({ error: "Audio no encontrado" }, 404, origin);
  const bytes = new Uint8Array(await request.arrayBuffer());
  const jpg = mime === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const png = mime === "image/png" && bytes.slice(0, 4).every((v, i) => v === [137, 80, 78, 71][i]);
  const webp = mime === "image/webp" && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  if (bytes.length !== size || !jpg && !png && !webp) return json({ error: "Imagen de portada inv\xE1lida" }, 415, origin);
  const key = "audio/v2/cover/" + id + "/" + crypto.randomUUID();
  const reservation = await reserveFamilyStorage(env, size, crypto.randomUUID());
  if (!reservation) return json({ error: "Espacio insuficiente" }, 409, origin);
  let saved = false;
  try {
    await env.MEDIA_BUCKET.put(key, bytes, { httpMetadata: { contentType: mime } });
    const old = track.cover_key;
    const batch = [];
    if (old) batch.push(env.DB.prepare(
      "INSERT OR IGNORE INTO audio_delete_queue(object_key,size_bytes,queued_at) VALUES(?,?,?)"
    ).bind(old, track.cover_size_bytes, Date.now()));
    batch.push(env.DB.prepare(
      "UPDATE audio_tracks SET cover_key=?,cover_mime=?,cover_size_bytes=? WHERE id=? AND cover_key IS ?"
    ).bind(key, mime, size, id, old));
    const result = await env.DB.batch(batch);
    if (!Number(result.at(-1)?.meta?.changes || 0)) throw Error("Conflict");
    saved = true;
    await cleanup(env);
    return json({ ok: true }, 200, origin);
  } catch {
    if (!saved) await env.MEDIA_BUCKET.delete(key).catch(async () => env.DB.prepare(
      "INSERT OR IGNORE INTO audio_delete_queue(object_key,size_bytes,queued_at) VALUES(?,?,?)"
    ).bind(key, size, Date.now()).run());
    return json({ error: "No se pudo guardar la portada" }, 503, origin);
  } finally {
    await releaseFamilyStorage(env, reservation);
  }
}
__name(uploadCover, "uploadCover");
async function removeTrack(env, id, origin) {
  const row = await env.DB.prepare(
    "SELECT object_key,size_bytes,cover_key,cover_size_bytes FROM audio_tracks WHERE id=?"
  ).bind(id).first();
  if (!row) return json({ error: "Audio no encontrado" }, 404, origin);
  const batch = [
    env.DB.prepare("INSERT OR IGNORE INTO audio_delete_queue(object_key,size_bytes,queued_at) VALUES(?,?,?)").bind(row.object_key, row.size_bytes, Date.now()),
    ...row.cover_key ? [env.DB.prepare(
      "INSERT OR IGNORE INTO audio_delete_queue(object_key,size_bytes,queued_at) VALUES(?,?,?)"
    ).bind(row.cover_key, row.cover_size_bytes, Date.now())] : [],
    env.DB.prepare("DELETE FROM audio_tracks WHERE id=?").bind(id)
  ];
  await env.DB.batch(batch);
  await cleanup(env);
  return json({ ok: true }, 200, origin);
}
__name(removeTrack, "removeTrack");
async function handleAudioApi(request, env, url, origin, verifyMember, ctx) {
  if (url.pathname.startsWith("/api/audio/media/")) {
    try {
      return await readGrant(request, env, url, origin);
    } catch {
      return json({ error: "Audio no disponible" }, 503, origin);
    }
  }
  const admin = url.pathname.startsWith("/api/audio/admin/");
  if (admin) {
    if (!await verifyAdminSession(request, env)) return json({ error: "No autorizado" }, 401, origin);
  } else {
    const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!await verifyMember(env, token)) return json({ error: "No autorizado" }, 401, origin);
  }
  try {
    if (url.pathname === (admin ? "/api/audio/admin/tracks" : "/api/audio/tracks") && request.method === "GET")
      return await list(env, origin);
    if (!admin) return json({ error: "M\xE9todo no permitido" }, 405, origin);
    let result;
    if (url.pathname === "/api/audio/admin/tracks" && request.method === "POST")
      result = await uploadAudio(request, env, origin);
    const m = /^\/api\/audio\/admin\/tracks\/([0-9a-f-]{36})$/.exec(url.pathname);
    if (!result && m && ID.test(m[1]) && request.method === "DELETE") result = await removeTrack(env, m[1], origin);
    const cover = /^\/api\/audio\/admin\/tracks\/([0-9a-f-]{36})\/cover$/.exec(url.pathname);
    if (!result && cover && ID.test(cover[1]) && request.method === "POST") result = await uploadCover(request, env, cover[1], origin);
    if (!result) return json({ error: "Ruta no encontrada" }, 404, origin);
    if (result.ok && ctx?.waitUntil) ctx.waitUntil(notifyFamilyClients(env));
    return result;
  } catch {
    return json({ error: "Audio temporalmente no disponible" }, 503, origin);
  }
}
__name(handleAudioApi, "handleAudioApi");

// src/modules/admin/admin-trusted-device.js
var ID2 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var B64URL = /^[A-Za-z0-9_-]{40,100}$/;
var TRUSTED_ORIGIN = "https://havana-nice-v2.pages.dev";
var WINDOW_MS = 3 * 60 * 1e3;
var MAX_DEVICES = 3;
var text = new TextEncoder();
var opaque2 = /* @__PURE__ */ __name(() => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""), "opaque");
var decode = /* @__PURE__ */ __name((value) => {
  const src = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(src + "=".repeat((4 - src.length % 4) % 4)), (c) => c.charCodeAt(0));
}, "decode");
var payload = /* @__PURE__ */ __name((id, nonce) => text.encode("havana-nice-v2-admin-device-v1\n" + id + "\n" + nonce + "\n" + TRUSTED_ORIGIN), "payload");
var validKey = /* @__PURE__ */ __name((jwk) => jwk && typeof jwk === "object" && !Array.isArray(jwk) && jwk.kty === "EC" && jwk.crv === "P-256" && /^[A-Za-z0-9_-]{43}$/.test(jwk.x || "") && /^[A-Za-z0-9_-]{43}$/.test(jwk.y || "") && !("d" in jwk), "validKey");
var onlyPublic = /* @__PURE__ */ __name((key) => ({ kty: "EC", crv: "P-256", x: key.x, y: key.y, ext: true, key_ops: ["verify"] }), "onlyPublic");
async function handleAdminTrustedDevice(request, env, url, origin, respond3) {
  const reply6 = /* @__PURE__ */ __name((body3, status = 200) => respond3(body3, status, origin), "reply");
  if (!adminLoginConfigured(env)) return reply6({ error: "Administrador no configurado" }, 503);
  if (request.method !== "POST") return reply6({ error: "M\xE9todo no permitido" }, 405);
  if (request.headers.get("Origin") !== TRUSTED_ORIGIN)
    return reply6({ error: "Abre el Administrador desde su enlace oficial." }, 403);
  if ((request.headers.get("content-type") || "").split(";")[0].trim() !== "application/json")
    return reply6({ error: "Se requiere JSON" }, 415);
  const size = Number(request.headers.get("content-length") || 0);
  if (size > 6e3) return reply6({ error: "Solicitud demasiado grande" }, 413);
  let body2;
  try {
    body2 = await request.json();
  } catch {
    return reply6({ error: "Solicitud inv\xE1lida" }, 400);
  }
  const path = url.pathname, now = Date.now();
  const enrolled = path === "/api/chat/admin/auth/device/enroll";
  const revoke = path === "/api/chat/admin/auth/device/revoke";
  if (enrolled || revoke) {
    if (!await verifyAdminSession(request, env)) return reply6({ error: "No autorizado" }, 401);
    if (!ID2.test(body2?.deviceId || "")) return reply6({ error: "Dispositivo inv\xE1lido" }, 400);
    if (revoke) {
      await env.DB.prepare("DELETE FROM chat_admin_trusted_devices WHERE id=?").bind(body2.deviceId).run();
      return reply6({ ok: true });
    }
    if (!validKey(body2?.publicKey)) return reply6({ error: "Clave p\xFAblica inv\xE1lida" }, 400);
    const publicKey = onlyPublic(body2.publicKey);
    try {
      await crypto.subtle.importKey("jwk", publicKey, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    } catch {
      return reply6({ error: "Clave p\xFAblica no v\xE1lida" }, 400);
    }
    const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM chat_admin_trusted_devices WHERE revoked_at IS NULL").first();
    if (Number(count?.total || 0) >= MAX_DEVICES) return reply6({ error: "L\xEDmite de dispositivos alcanzado" }, 409);
    try {
      await env.DB.prepare("INSERT INTO chat_admin_trusted_devices(id,public_jwk,created_at) VALUES(?,?,?)").bind(body2.deviceId, JSON.stringify(publicKey), now).run();
      return reply6({ ok: true });
    } catch {
      return reply6({ error: "No se pudo autorizar el dispositivo" }, 409);
    }
  }
  if (!ID2.test(body2?.deviceId || "")) return reply6({ error: "Dispositivo no autorizado" }, 401);
  if (path === "/api/chat/admin/auth/device/challenge") {
    const member = await env.DB.prepare(
      "SELECT id FROM chat_admin_trusted_devices WHERE id=? AND revoked_at IS NULL"
    ).bind(body2.deviceId).first();
    if (!member) return reply6({ error: "Dispositivo no autorizado" }, 401);
    await env.DB.prepare("DELETE FROM chat_admin_device_challenges WHERE expires_at<?").bind(now).run();
    const challengeId = crypto.randomUUID(), challenge = opaque2();
    await env.DB.prepare("INSERT INTO chat_admin_device_challenges(id,device_id,challenge_hash,expires_at) VALUES(?,?,?,?)").bind(challengeId, body2.deviceId, await sha256Hex(challenge), now + WINDOW_MS).run();
    return reply6({ challengeId, challenge });
  }
  if (path === "/api/chat/admin/auth/device/session") {
    if (!ID2.test(body2?.challengeId || "") || !B64URL.test(body2?.challenge || "") || typeof body2?.signature !== "string" || body2.signature.length > 300)
      return reply6({ error: "Prueba inv\xE1lida" }, 401);
    const row = await env.DB.prepare(
      "SELECT d.public_jwk,c.challenge_hash FROM chat_admin_device_challenges c JOIN chat_admin_trusted_devices d ON d.id=c.device_id WHERE c.id=? AND c.device_id=? AND c.used_at IS NULL AND c.expires_at>? AND d.revoked_at IS NULL"
    ).bind(body2.challengeId, body2.deviceId, now).first();
    if (!row) return reply6({ error: "Acceso no autorizado" }, 401);
    const consumed = await env.DB.prepare(
      "UPDATE chat_admin_device_challenges SET used_at=? WHERE id=? AND device_id=? AND used_at IS NULL AND expires_at>?"
    ).bind(now, body2.challengeId, body2.deviceId, now).run();
    if (Number(consumed.meta?.changes || 0) !== 1) return reply6({ error: "Prueba ya utilizada" }, 401);
    if (await sha256Hex(body2.challenge) !== row.challenge_hash) return reply6({ error: "Prueba inv\xE1lida" }, 401);
    let verified = false;
    try {
      const key = await crypto.subtle.importKey(
        "jwk",
        JSON.parse(row.public_jwk),
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["verify"]
      );
      verified = await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        key,
        decode(body2.signature),
        payload(body2.challengeId, body2.challenge)
      );
    } catch {
      return reply6({ error: "Dispositivo no reconocido" }, 401);
    }
    if (!verified) return reply6({ error: "Prueba inv\xE1lida" }, 401);
    const session2 = await issueAdminSession(env);
    await env.DB.prepare("UPDATE chat_admin_trusted_devices SET last_used_at=? WHERE id=?").bind(Date.now(), body2.deviceId).run();
    return reply6(session2);
  }
  return reply6({ error: "Ruta no encontrada" }, 404);
}
__name(handleAdminTrustedDevice, "handleAdminTrustedDevice");

// src/modules/chat/message-removal.js
async function deleteChatMessageRecord(env, seq) {
  if (!Number.isSafeInteger(seq) || seq <= 0) throw new Error("Invalid message sequence");
  const row = await env.DB.prepare("SELECT seq FROM chat_messages WHERE seq=?").bind(seq).first();
  const media = (await env.DB.prepare("SELECT id,object_key FROM chat_media_objects WHERE message_seq=?").bind(seq).all()).results || [];
  if (!row) return false;
  await env.DB.batch([
    env.DB.prepare("UPDATE chat_messages SET reply_to_seq=NULL WHERE reply_to_seq=?").bind(seq),
    env.DB.prepare("DELETE FROM chat_reactions WHERE message_seq=?").bind(seq),
    env.DB.prepare("DELETE FROM chat_messages WHERE seq=?").bind(seq)
  ]);
  const check = await env.DB.prepare("SELECT seq FROM chat_messages WHERE seq=?").bind(seq).first();
  for (const item of media) {
    await env.DB.prepare("DELETE FROM chat_media_objects WHERE id=? AND message_seq IS NULL").bind(item.id).run();
    if (env.MEDIA_BUCKET) {
      await env.MEDIA_BUCKET.delete(item.object_key).catch(() => {
      });
      await env.MEDIA_BUCKET.delete(item.object_key + ".poster.jpg").catch(() => {
      });
    }
  }
  if (check) throw new Error("Deletion not confirmed");
  return true;
}
__name(deleteChatMessageRecord, "deleteChatMessageRecord");

// src/modules/chat/chat-media.js
var MIME = /* @__PURE__ */ new Map([
  ["image/jpeg", "photo"],
  ["image/png", "photo"],
  ["image/webp", "photo"],
  ["image/heic", "photo"],
  ["image/heif", "photo"],
  ["video/mp4", "video"],
  ["video/quicktime", "video"]
]);
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var CHAT_PART_BYTES = 5 * 1024 * 1024;
var CHAT_DIRECT_MAX = 15 * 1024 * 1024;
var MAX_PARTS = 2e3;
var GRANT_MS = 10 * 60 * 1e3;
var ROOM2 = "main-chat-v2";
var CHAT_VIDEO_POSTER_MAX_BYTES = 256 * 1024;
function chatVideoPosterKey(objectKey) {
  return objectKey + ".poster.jpg";
}
__name(chatVideoPosterKey, "chatVideoPosterKey");
function reply(data, status = 200, origin = "") {
  return new Response(JSON.stringify(data), { status, headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": origin || "https://havana-nice-v2-dev.pages.dev",
    "vary": "Origin"
  } });
}
__name(reply, "reply");
async function asset(env, id) {
  return env.DB.prepare("SELECT id,sender_id,object_key,kind,mime_type,size_bytes,original_name,status,multipart_upload_id,message_seq,created_at FROM chat_media_objects WHERE id=?").bind(id).first();
}
__name(asset, "asset");
function publicMedia(row) {
  return {
    assetId: row.id,
    kind: row.kind,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    name: row.original_name || ""
  };
}
__name(publicMedia, "publicMedia");
async function prune(env) {
  const old = await env.DB.prepare("SELECT id,object_key,multipart_upload_id,sender_id,status FROM chat_media_objects WHERE message_seq IS NULL AND updated_at<? LIMIT 12").bind(Date.now() - 24 * 60 * 60 * 1e3).all();
  for (const row of old.results || []) {
    try {
      if (row.status === "pending" && row.multipart_upload_id)
        await env.MEDIA_BUCKET.resumeMultipartUpload(row.object_key, row.multipart_upload_id).abort();
      else await env.MEDIA_BUCKET.delete(row.object_key);
      await env.MEDIA_BUCKET.delete(chatVideoPosterKey(row.object_key)).catch(() => {
      });
      await env.DB.prepare("DELETE FROM chat_media_objects WHERE id=? AND message_seq IS NULL").bind(row.id).run();
      await releaseFamilyStorage(env, row.id);
    } catch {
    }
  }
  await env.DB.prepare("DELETE FROM chat_media_grants WHERE expires_at<=?").bind(Date.now()).run();
}
__name(prune, "prune");
function expectedPart(row, index) {
  const parts = Math.ceil(row.size_bytes / CHAT_PART_BYTES);
  if (index < 1 || index > parts) return -1;
  return index === parts ? row.size_bytes - (parts - 1) * CHAT_PART_BYTES : CHAT_PART_BYTES;
}
__name(expectedPart, "expectedPart");
async function startChatMedia(request, env, session2, origin) {
  if (!env.MEDIA_BUCKET) return reply({ error: "Archivos no disponibles" }, 503, origin);
  let data;
  try {
    data = await request.json();
  } catch {
    return reply({ error: "Solicitud inv\xE1lida" }, 400, origin);
  }
  const id = data?.id, kind = MIME.get(data?.mimeType), size = data?.sizeBytes;
  if (typeof id !== "string" || !UUID.test(id) || !kind || data?.kind !== kind || !Number.isSafeInteger(size) || size <= 0 || size > 95e8 || kind === "photo" && size > 100 * 1024 * 1024 || Math.ceil(size / CHAT_PART_BYTES) > MAX_PARTS)
    return reply({ error: "Tipo o tama\xF1o de archivo no admitido" }, 400, origin);
  const name = typeof data?.name === "string" ? data.name.slice(0, 120) : "";
  const existing = await asset(env, id);
  if (existing) {
    if (existing.sender_id !== session2.actorId || existing.size_bytes !== size || existing.mime_type !== data.mimeType)
      return reply({ error: "Identificador de archivo ya utilizado" }, 409, origin);
    if (existing.status === "pending") {
      const held = await env.DB.prepare("SELECT id FROM family_upload_reservations WHERE id=? AND expires_at>?").bind(id, Date.now()).first();
      if (!held && !await reserveFamilyStorage(env, size, id))
        return reply({ error: "Almacenamiento casi lleno: libera espacio antes de reanudar" }, 409, origin);
    }
    return chatMediaStatus(env, session2, id, origin);
  }
  await prune(env);
  const reserved = await reserveFamilyStorage(env, size, id);
  if (!reserved) return reply({ error: "Almacenamiento casi lleno: l\xEDmite compartido de 9.5 GB" }, 409, origin);
  const multipart = size > CHAT_DIRECT_MAX;
  const key = "chat/" + encodeURIComponent(session2.actorId) + "/" + id;
  let upload = null;
  try {
    if (multipart) upload = await env.MEDIA_BUCKET.createMultipartUpload(key, { httpMetadata: { contentType: data.mimeType } });
    const inserted = await env.DB.prepare("INSERT OR IGNORE INTO chat_media_objects (id,sender_id,object_key,kind,mime_type,size_bytes,original_name,status,multipart_upload_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(id, session2.actorId, key, kind, data.mimeType, size, name, "pending", upload?.uploadId || null, Date.now(), Date.now()).run();
    if (Number(inserted.meta?.changes) !== 1) {
      if (upload) await upload.abort().catch(() => {
      });
      await releaseFamilyStorage(env, reserved);
      return chatMediaStatus(env, session2, id, origin);
    }
    return reply({
      id,
      kind,
      multipart,
      partSize: CHAT_PART_BYTES,
      partCount: multipart ? Math.ceil(size / CHAT_PART_BYTES) : 1,
      completedParts: [],
      ready: false
    }, 201, origin);
  } catch {
    if (upload) await upload.abort().catch(() => {
    });
    await releaseFamilyStorage(env, reserved);
    return reply({ error: "No se pudo preparar el almacenamiento privado" }, 503, origin);
  }
}
__name(startChatMedia, "startChatMedia");
async function chatMediaStatus(env, session2, id, origin) {
  const row = await asset(env, id);
  if (!row || row.sender_id !== session2.actorId) return reply({ error: "Archivo no encontrado" }, 404, origin);
  const parts = row.multipart_upload_id ? (await env.DB.prepare("SELECT part_number FROM chat_media_parts WHERE media_id=? ORDER BY part_number").bind(id).all()).results || [] : [];
  return reply({
    id,
    kind: row.kind,
    ready: row.status === "ready",
    sent: row.message_seq !== null,
    multipart: !!row.multipart_upload_id,
    partSize: CHAT_PART_BYTES,
    partCount: Math.ceil(row.size_bytes / CHAT_PART_BYTES),
    completedParts: parts.map((x) => x.part_number)
  }, 200, origin);
}
__name(chatMediaStatus, "chatMediaStatus");
async function uploadChatDirect(request, env, session2, id, origin) {
  const row = await asset(env, id);
  if (!row || row.sender_id !== session2.actorId) return reply({ error: "Archivo no encontrado" }, 404, origin);
  if (row.status === "ready") return reply({ id, ready: true }, 200, origin);
  if (row.status !== "pending" || row.multipart_upload_id || row.size_bytes > CHAT_DIRECT_MAX)
    return reply({ error: "Se necesita transferencia multipart" }, 409, origin);
  if (request.headers.get("content-type")?.split(";")[0] !== row.mime_type || Number(request.headers.get("content-length")) !== row.size_bytes || !request.body)
    return reply({ error: "Tipo o longitud de archivo incorrectos" }, 400, origin);
  try {
    const object = await env.MEDIA_BUCKET.put(row.object_key, request.body, { httpMetadata: { contentType: row.mime_type } });
    if (object.size !== row.size_bytes) {
      await env.MEDIA_BUCKET.delete(row.object_key).catch(() => {
      });
      return reply({ error: "Tama\xF1o original incompleto" }, 400, origin);
    }
    await env.DB.prepare("UPDATE chat_media_objects SET status='ready',updated_at=? WHERE id=? AND status='pending'").bind(Date.now(), id).run();
    await releaseFamilyStorage(env, id);
    return reply({ id, ready: true }, 201, origin);
  } catch {
    return reply({ error: "Se interrumpi\xF3 la transferencia. Reintenta el mismo archivo." }, 503, origin);
  }
}
__name(uploadChatDirect, "uploadChatDirect");
async function uploadChatPart(request, env, session2, id, number, origin) {
  const row = await asset(env, id);
  if (!row || row.sender_id !== session2.actorId) return reply({ error: "Archivo no encontrado" }, 404, origin);
  if (row.status !== "pending" || !row.multipart_upload_id) return reply({ error: "Transferencia ya finalizada" }, 409, origin);
  const bytes = expectedPart(row, number);
  if (bytes < 1 || Number(request.headers.get("content-length")) !== bytes || !request.body)
    return reply({ error: "Fragmento incorrecto" }, 400, origin);
  try {
    const uploaded = await env.MEDIA_BUCKET.resumeMultipartUpload(row.object_key, row.multipart_upload_id).uploadPart(number, request.body);
    await env.DB.prepare("INSERT INTO chat_media_parts(media_id,part_number,etag,size_bytes) VALUES(?,?,?,?) ON CONFLICT(media_id,part_number) DO UPDATE SET etag=excluded.etag,size_bytes=excluded.size_bytes").bind(id, number, uploaded.etag, bytes).run();
    return reply({ ok: true, partNumber: number }, 200, origin);
  } catch {
    return reply({ error: "Fragmento no disponible; reintenta solamente esa parte" }, 503, origin);
  }
}
__name(uploadChatPart, "uploadChatPart");
async function completeChatMedia(env, session2, id, origin) {
  const row = await asset(env, id);
  if (!row || row.sender_id !== session2.actorId) return reply({ error: "Archivo no encontrado" }, 404, origin);
  if (row.status === "ready") return reply({ id, ready: true }, 200, origin);
  if (row.status !== "pending" || !row.multipart_upload_id) return reply({ error: "Transferencia inv\xE1lida" }, 409, origin);
  const parts = (await env.DB.prepare("SELECT part_number,etag,size_bytes FROM chat_media_parts WHERE media_id=? ORDER BY part_number").bind(id).all()).results || [];
  const total = Math.ceil(row.size_bytes / CHAT_PART_BYTES);
  if (parts.length !== total || parts.some((x, i) => x.part_number !== i + 1 || x.size_bytes !== expectedPart(row, i + 1)))
    return reply({ error: "Faltan partes del video" }, 409, origin);
  try {
    const result = await env.MEDIA_BUCKET.resumeMultipartUpload(row.object_key, row.multipart_upload_id).complete(parts.map((x) => ({ partNumber: x.part_number, etag: x.etag })));
    if (result.size !== row.size_bytes) {
      await env.MEDIA_BUCKET.delete(row.object_key).catch(() => {
      });
      return reply({ error: "Tama\xF1o original incorrecto" }, 400, origin);
    }
    await env.DB.batch([
      env.DB.prepare("UPDATE chat_media_objects SET status='ready',updated_at=? WHERE id=? AND status='pending'").bind(Date.now(), id),
      env.DB.prepare("DELETE FROM chat_media_parts WHERE media_id=?").bind(id)
    ]);
    await releaseFamilyStorage(env, id);
    return reply({ id, ready: true }, 201, origin);
  } catch {
    const stored = await env.MEDIA_BUCKET.head(row.object_key).catch(() => null);
    if (stored?.size === row.size_bytes) {
      await env.DB.prepare("UPDATE chat_media_objects SET status='ready',updated_at=? WHERE id=?").bind(Date.now(), id).run();
      await env.DB.prepare("DELETE FROM chat_media_parts WHERE media_id=?").bind(id).run();
      await releaseFamilyStorage(env, id);
      return reply({ id, ready: true }, 200, origin);
    }
    return reply({ error: "No se pudo completar; reintenta la confirmaci\xF3n" }, 503, origin);
  }
}
__name(completeChatMedia, "completeChatMedia");
async function uploadChatVideoPoster(request, env, session2, id, origin) {
  const row = await asset(env, id);
  if (!row || row.sender_id !== session2.actorId) return reply({ error: "Archivo no encontrado" }, 404, origin);
  if (row.kind !== "video" || row.status !== "ready")
    return reply({ error: "El video todav\xEDa no est\xE1 disponible" }, 409, origin);
  const bytes = Number(request.headers.get("content-length"));
  if (request.headers.get("content-type")?.split(";")[0] !== "image/jpeg" || !Number.isSafeInteger(bytes) || bytes < 3 || bytes > CHAT_VIDEO_POSTER_MAX_BYTES)
    return reply({ error: "Car\xE1tula no v\xE1lida" }, 400, origin);
  try {
    const data = new Uint8Array(await request.arrayBuffer());
    if (data.byteLength !== bytes || data[0] !== 255 || data[1] !== 216 || data[2] !== 255)
      return reply({ error: "JPEG incorrecto" }, 400, origin);
    await env.MEDIA_BUCKET.put(chatVideoPosterKey(row.object_key), data, {
      httpMetadata: { contentType: "image/jpeg" }
    });
    return reply({ ok: true }, 201, origin);
  } catch {
    return reply({ error: "No se pudo guardar la car\xE1tula" }, 503, origin);
  }
}
__name(uploadChatVideoPoster, "uploadChatVideoPoster");
async function sendChatMedia(env, session2, id, origin) {
  const row = await asset(env, id);
  if (!row || row.sender_id !== session2.actorId || row.status !== "ready")
    return reply({ error: "Primero debe finalizar la carga original" }, 409, origin);
  const text3 = row.kind === "photo" ? "Foto" : "Video";
  try {
    const existing = await env.DB.prepare("SELECT seq FROM chat_messages WHERE sender_id=? AND client_message_id=?").bind(session2.actorId, id).first();
    if (!existing) {
      await env.DB.batch([
        env.DB.prepare("INSERT OR IGNORE INTO chat_messages (client_message_id,sender_id,sender_name,body,created_at) VALUES (?,?,?,?,?)").bind(id, session2.actorId, session2.displayName, text3, (/* @__PURE__ */ new Date()).toISOString()),
        env.DB.prepare("UPDATE chat_media_objects SET message_seq=(SELECT seq FROM chat_messages WHERE sender_id=? AND client_message_id=?),updated_at=? WHERE id=? AND sender_id=? AND message_seq IS NULL").bind(session2.actorId, id, Date.now(), id, session2.actorId)
      ]);
    }
    const saved = await env.DB.prepare("SELECT seq FROM chat_messages WHERE sender_id=? AND client_message_id=?").bind(session2.actorId, id).first();
    if (!saved) return reply({ error: "Mensaje no confirmado" }, 503, origin);
    if (!existing) try {
      await env.CHAT_ROOMS.get(env.CHAT_ROOMS.idFromName(ROOM2)).fetch(
        "https://internal/chat-media-message-ready",
        { method: "POST", body: JSON.stringify({ seq: saved.seq }) }
      );
    } catch {
    }
    return reply({ ok: true, seq: saved.seq, media: publicMedia(row) }, existing ? 200 : 201, origin);
  } catch {
    return reply({ error: "No se pudo publicar el archivo en Chat" }, 503, origin);
  }
}
__name(sendChatMedia, "sendChatMedia");
async function decorateChatMessages(env, messages) {
  if (!messages.length) return messages;
  const ids = messages.map((x) => x.seq);
  const rows = (await env.DB.prepare(
    "SELECT message_seq,id,kind,mime_type,size_bytes,original_name FROM chat_media_objects WHERE message_seq IN (" + ids.map(() => "?").join(",") + ") AND status='ready'"
  ).bind(...ids).all()).results || [];
  const media = new Map(rows.map((row) => [row.message_seq, {
    assetId: row.id,
    kind: row.kind,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    name: row.original_name || ""
  }]));
  return messages.map((message) => media.has(message.seq) ? { ...message, text: "", media: media.get(message.seq) } : message);
}
__name(decorateChatMessages, "decorateChatMessages");
async function grantChatMedia(env, id, origin) {
  const row = await env.DB.prepare("SELECT a.id,a.kind,a.mime_type,a.size_bytes,a.original_name FROM chat_media_objects a JOIN chat_messages m ON m.seq=a.message_seq AND m.deleted_at IS NULL WHERE a.id=? AND a.status='ready'").bind(id).first();
  if (!row) return reply({ error: "Archivo no encontrado" }, 404, origin);
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  await env.DB.prepare("INSERT INTO chat_media_grants(token_hash,media_id,expires_at) VALUES(?,?,?)").bind(await sha256Hex(token), id, Date.now() + GRANT_MS).run();
  return reply({ url: "https://havana-nice-v2-dev.soloaplicaciones97.workers.dev/api/chat/media/" + id + "/file?token=" + encodeURIComponent(token) }, 200, origin);
}
__name(grantChatMedia, "grantChatMedia");
async function readChatMedia(request, env, id, url, origin, poster = false) {
  const token = url.searchParams.get("token");
  if (!token || !/^[a-zA-Z0-9_-]{40,100}$/.test(token)) return reply({ error: "Acceso denegado" }, 403, origin);
  const row = await env.DB.prepare("SELECT a.object_key,a.mime_type,a.size_bytes,a.kind FROM chat_media_grants g JOIN chat_media_objects a ON a.id=g.media_id AND a.status='ready' JOIN chat_messages m ON m.seq=a.message_seq AND m.deleted_at IS NULL WHERE g.token_hash=? AND g.media_id=? AND g.expires_at>?").bind(await sha256Hex(token), id, Date.now()).first();
  if (!row) return reply({ error: "Permiso caducado" }, 403, origin);
  if (poster && row.kind !== "video") return reply({ error: "Car\xE1tula no disponible" }, 404, origin);
  const range = request.headers.get("range");
  if (range && !/^bytes=\d*-\d*$/.test(range)) return reply({ error: "Rango inv\xE1lido" }, 416, origin);
  const object = await env.MEDIA_BUCKET.get(
    poster ? chatVideoPosterKey(row.object_key) : row.object_key,
    !poster && range ? { range: request.headers } : {}
  );
  if (!object) return reply({ error: "Archivo no disponible" }, 404, origin);
  const headers2 = new Headers({
    "content-type": poster ? "image/jpeg" : row.mime_type,
    "accept-ranges": poster ? "none" : "bytes",
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; sandbox",
    "referrer-policy": "no-referrer",
    "content-disposition": "inline",
    "access-control-allow-origin": origin || "https://havana-nice-v2-dev.pages.dev",
    "vary": "Origin"
  });
  let status = 200;
  if (range && object.range && typeof object.range.offset === "number" && typeof object.range.length === "number") {
    const first = object.range.offset;
    headers2.set("content-range", "bytes " + first + "-" + (first + object.range.length - 1) + "/" + object.size);
    headers2.set("content-length", String(object.range.length));
    status = 206;
  } else headers2.set("content-length", String(object.size));
  return new Response(request.method === "HEAD" ? null : object.body, { status, headers: headers2 });
}
__name(readChatMedia, "readChatMedia");
async function handleChatMedia(request, env, url, origin, session2) {
  const path = url.pathname;
  const idMatch = /^\/api\/chat\/media\/([0-9a-f-]{36})(?:\/(content|send|complete|grant|file|poster|parts\/(\d+)))?$/.exec(path);
  if (path === "/api/chat/media/status" && request.method === "GET")
    return reply({
      enabled: !!env.MEDIA_BUCKET,
      maxFilesPerSend: 5,
      storage: await familyStorageUsage(env)
    }, 200, origin);
  if (path === "/api/chat/media/start" && request.method === "POST")
    return startChatMedia(request, env, session2, origin);
  if (!idMatch || !UUID.test(idMatch[1])) return reply({ error: "Ruta no v\xE1lida" }, 404, origin);
  const [, id, operation, part] = idMatch;
  if (!operation && request.method === "GET") return chatMediaStatus(env, session2, id, origin);
  if (operation === "content" && request.method === "PUT") return uploadChatDirect(request, env, session2, id, origin);
  if (part && request.method === "PUT") return uploadChatPart(request, env, session2, id, Number(part), origin);
  if (operation === "complete" && request.method === "POST") return completeChatMedia(env, session2, id, origin);
  if (operation === "poster" && request.method === "PUT") return uploadChatVideoPoster(request, env, session2, id, origin);
  if (operation === "send" && request.method === "POST") return sendChatMedia(env, session2, id, origin);
  if (operation === "grant" && request.method === "GET") return grantChatMedia(env, id, origin);
  return reply({ error: "M\xE9todo no permitido" }, 405, origin);
}
__name(handleChatMedia, "handleChatMedia");

// src/modules/admin/admin-chat.js
var MAX_HISTORY = 100;
var ROOM3 = "main-chat-v2";
var COLUMNS = "seq,client_message_id,sender_id,sender_name,body,created_at,reply_to_seq,edited_at,deleted_at";
function mapped(row) {
  return {
    seq: row.seq,
    clientMessageId: row.client_message_id,
    senderId: row.sender_id,
    senderName: row.sender_name,
    text: row.body,
    sentAt: row.created_at,
    replyToSeq: row.reply_to_seq ?? null,
    editedAt: row.edited_at ?? null,
    deletedAt: null
  };
}
__name(mapped, "mapped");
async function handleAdminChat(request, env, url, origin, respond3) {
  const reply6 = /* @__PURE__ */ __name((data, status = 200) => respond3(data, status, origin), "reply");
  if (!await verifyAdminSession(request, env)) return reply6({ error: "No autorizado" }, 401);
  if (url.pathname === "/api/chat/admin/messages" && request.method === "GET") {
    const raw = url.searchParams.get("beforeSeq"), before = raw === null ? null : Number(raw);
    if (before !== null && (!Number.isSafeInteger(before) || before < 1)) return reply6({ error: "Cursor inv\xE1lido" }, 400);
    const query = before === null ? env.DB.prepare("SELECT " + COLUMNS + " FROM chat_messages WHERE deleted_at IS NULL ORDER BY seq DESC LIMIT ?").bind(MAX_HISTORY) : env.DB.prepare("SELECT " + COLUMNS + " FROM chat_messages WHERE seq<? AND deleted_at IS NULL ORDER BY seq DESC LIMIT ?").bind(before, MAX_HISTORY);
    const rows = (await query.all()).results || [], ids = rows.map((x) => x.seq);
    let reactions = [];
    if (ids.length) {
      const query2 = await env.DB.prepare("SELECT message_seq,actor_id,emoji FROM chat_reactions WHERE message_seq IN (" + ids.map(() => "?").join(",") + ")").bind(...ids).all();
      reactions = (query2.results || []).map((x) => ({ messageSeq: x.message_seq, actorId: x.actor_id, emoji: x.emoji }));
    }
    return reply6({ messages: await decorateChatMessages(env, rows.reverse().map(mapped)), reactions, hasMore: rows.length === MAX_HISTORY });
  }
  const match = /^\/api\/chat\/admin\/messages\/(\d+)$/.exec(url.pathname);
  if (!match || request.method !== "DELETE") return reply6({ error: "Ruta no v\xE1lida" }, 404);
  const seq = Number(match[1]);
  if (!Number.isSafeInteger(seq) || seq < 1) return reply6({ error: "Mensaje inv\xE1lido" }, 400);
  const deleted = await deleteChatMessageRecord(env, seq);
  if (!deleted) return reply6({ error: "Mensaje no encontrado" }, 404);
  try {
    await env.CHAT_ROOMS.get(env.CHAT_ROOMS.idFromName(ROOM3)).fetch(
      "https://internal/admin-chat-message-deleted",
      { method: "POST", body: JSON.stringify({ seq }) }
    );
  } catch {
  }
  return reply6({ ok: true, seq });
}
__name(handleAdminChat, "handleAdminChat");

// src/shared/member-media-cleanup.js
function alreadyAbsent(error) {
  const message = String(error?.message || error || "");
  return error?.status === 404 || error?.code === 404 || /NoSuchUpload|NoSuchKey|not found|404/i.test(message);
}
__name(alreadyAbsent, "alreadyAbsent");
async function cleanupMemberMedia(env, actorId, limit = 80) {
  if (!env.MEDIA_BUCKET) return { cleaned: 0, pending: null };
  const rows = (await env.DB.prepare(
    "SELECT object_key,multipart_upload_id FROM r2_member_delete_queue WHERE actor_id=? ORDER BY queued_at,object_key LIMIT ?"
  ).bind(actorId, limit).all()).results || [];
  let cleaned = 0;
  for (let i = 0; i < rows.length; i += 4) {
    const results = await Promise.all(rows.slice(i, i + 4).map(async (row) => {
      try {
        if (row.multipart_upload_id) {
          try {
            await env.MEDIA_BUCKET.resumeMultipartUpload(row.object_key, row.multipart_upload_id).abort();
          } catch (error) {
            if (!alreadyAbsent(error)) throw error;
          }
        } else {
          await env.MEDIA_BUCKET.delete(row.object_key);
        }
        await env.DB.prepare(
          "DELETE FROM r2_member_delete_queue WHERE actor_id=? AND object_key=?"
        ).bind(actorId, row.object_key).run();
        return true;
      } catch {
        return false;
      }
    }));
    cleaned += results.filter(Boolean).length;
  }
  const pending = await env.DB.prepare(
    "SELECT COUNT(*) AS remaining FROM r2_member_delete_queue WHERE actor_id=?"
  ).bind(actorId).first();
  return { cleaned, pending: Number(pending?.remaining || 0) };
}
__name(cleanupMemberMedia, "cleanupMemberMedia");
async function pendingMemberMedia(env, actorId) {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS remaining FROM r2_member_delete_queue WHERE actor_id=?"
  ).bind(actorId).first();
  return Number(row?.remaining || 0);
}
__name(pendingMemberMedia, "pendingMemberMedia");

// src/modules/admin/member-admin.js
var ID3 = /^member:(?:[a-z0-9_-]{1,28}|[0-9a-f-]{36})$/i;
function deviceDetails(request) {
  const agent = (request.headers.get("user-agent") || "").slice(0, 800);
  const android = /Android\s*([\d.]+)?/i.exec(agent);
  const reducedAndroid = /Android\s+10\s*;\s*K\s*(?:;|\))/i.test(agent);
  const ios = /(?:CPU(?: iPhone)? OS)\s*([\d_]+)/i.exec(agent);
  const isIpad = /iPad/i.test(agent), isIphone = /iPhone|iPod/i.test(agent);
  const system = android ? reducedAndroid ? "Android (versi\xF3n no disponible)" : "Android" + (android[1] ? " " + android[1] : "") : isIpad || isIphone ? "iOS" + (ios ? " " + ios[1].replace(/_/g, ".") : "") : /Windows NT/i.test(agent) ? "Windows" : /Macintosh|Mac OS X/i.test(agent) ? "macOS" : /Linux/i.test(agent) ? "Linux" : "No identificado";
  let model = null;
  if (android && !reducedAndroid) {
    const hit = /(?:Android\s*[\d.]*;\s*)([^;)]+?)(?:\s+Build\/|\s*\)|;)/i.exec(agent);
    const candidate = hit?.[1]?.trim() || "";
    if (candidate && !/^(?:K|[a-z]{2}-[a-z]{2}|wv|mobile|u|linux)$/i.test(candidate))
      model = candidate.slice(0, 100);
  }
  const deviceName = isIpad ? "iPad" : isIphone ? "iPhone" : android ? "Tel\xE9fono Android" : /Windows NT|Macintosh|Linux/i.test(agent) ? "Computadora" : "Dispositivo no identificado";
  const origin = request.headers.get("origin") || "";
  const platform = origin === "https://havana-nice-v2-dev.pages.dev" ? "PWA" : /ReactNative|okhttp|Expo/i.test(agent) ? "Android nativo" : origin ? "Navegador web" : "Cliente no identificado";
  return { platform, operatingSystem: system.slice(0, 80), deviceName, model };
}
__name(deviceDetails, "deviceDetails");
async function recordMemberEvent(env, actorId, eventType, request, details = null) {
  if (!ID3.test(actorId) || !["login", "connect", "disconnect"].includes(eventType)) return;
  const meta = details || deviceDetails(request);
  await env.DB.prepare(
    "INSERT INTO chat_access_events(id,actor_id,event_type,occurred_at,platform,operating_system,device_name,device_model) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM chat_members WHERE actor_id=?)"
  ).bind(
    crypto.randomUUID(),
    actorId,
    eventType,
    Date.now(),
    meta.platform,
    meta.operatingSystem,
    meta.deviceName,
    meta.model,
    actorId
  ).run();
}
__name(recordMemberEvent, "recordMemberEvent");
function readMemberDevice(request) {
  return deviceDetails(request);
}
__name(readMemberDevice, "readMemberDevice");
async function memberDeletionImpact(env, actorId) {
  const row = await env.DB.prepare(
    "SELECT (SELECT COUNT(*) FROM chat_sessions WHERE actor_id=?) AS sessions,(SELECT COUNT(*) FROM chat_messages WHERE sender_id=?) AS messages,(SELECT COUNT(*) FROM chat_reactions WHERE actor_id=? OR message_seq IN (SELECT seq FROM chat_messages WHERE sender_id=?)) AS reactions,(SELECT COUNT(*) FROM chat_read_receipts WHERE actor_id=?) AS receipts,(SELECT COUNT(*) FROM chat_access_events WHERE actor_id=?) AS historyEvents,(SELECT COUNT(*) FROM chat_media_objects WHERE sender_id=?) AS chatMedia,(SELECT COUNT(*) FROM family_media WHERE actor_id=?) AS familyMedia,(SELECT COUNT(*) FROM family_upload_sessions WHERE actor_id=?) AS pendingUploads,(SELECT COUNT(*) FROM calendar_event_recipients WHERE actor_id=?) AS calendarAssignments"
  ).bind(actorId, actorId, actorId, actorId, actorId, actorId, actorId, actorId, actorId, actorId).first();
  const counts = {};
  for (const key of ["sessions", "messages", "reactions", "receipts", "historyEvents", "chatMedia", "familyMedia", "pendingUploads", "calendarAssignments"])
    counts[key] = Math.max(0, Number(row?.[key] || 0));
  return counts;
}
__name(memberDeletionImpact, "memberDeletionImpact");
function reply2(respond3, origin, body2, status = 200) {
  return respond3(body2, status, origin);
}
__name(reply2, "reply");
async function handleAdminMemberManagement(request, env, url, origin, respond3, ROOM6) {
  if (!await verifyAdminSession(request, env))
    return reply2(respond3, origin, { error: "No autorizado" }, 401);
  if (url.pathname === "/api/chat/admin/member-history" && request.method === "GET") {
    const actorId2 = url.searchParams.get("actorId") || "";
    if (!ID3.test(actorId2)) return reply2(respond3, origin, { error: "Miembro inv\xE1lido" }, 400);
    const member2 = await env.DB.prepare("SELECT actor_id FROM chat_members WHERE actor_id=?").bind(actorId2).first();
    if (!member2) return reply2(respond3, origin, { error: "Miembro no encontrado" }, 404);
    const [counts, events] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) AS entries FROM chat_access_events WHERE actor_id=? AND event_type='login'").bind(actorId2).first(),
      env.DB.prepare(
        "SELECT event_type,occurred_at,platform,CASE WHEN device_model='K' AND operating_system='Android 10' THEN 'Android (versi\xF3n no disponible)' ELSE operating_system END AS operating_system,device_name,CASE WHEN device_model='K' THEN NULL ELSE device_model END AS device_model FROM chat_access_events WHERE actor_id=? ORDER BY occurred_at DESC LIMIT 100"
      ).bind(actorId2).all()
    ]);
    return reply2(respond3, origin, {
      entries: Number(counts?.entries || 0),
      events: events.results || [],
      since: "Solo desde la activaci\xF3n del historial; no se inventan registros anteriores."
    });
  }
  if (url.pathname === "/api/chat/admin/member-delete-preview" && request.method === "GET") {
    const actorId2 = url.searchParams.get("actorId") || "";
    if (!ID3.test(actorId2)) return reply2(respond3, origin, { error: "Miembro inv\xE1lido" }, 400);
    const member2 = await env.DB.prepare("SELECT actor_id,display_name FROM chat_members WHERE actor_id=?").bind(actorId2).first();
    if (!member2) return reply2(respond3, origin, { error: "Miembro no encontrado" }, 404);
    const counts = await memberDeletionImpact(env, actorId2);
    return reply2(respond3, origin, { displayName: member2.display_name, counts, canDelete: true });
  }
  if (url.pathname === "/api/chat/admin/member-media-cleanup" && request.method === "POST") {
    let payload3;
    try {
      payload3 = await request.json();
    } catch {
      return reply2(respond3, origin, { error: "Solicitud inv\xE1lida" }, 400);
    }
    const actorId2 = payload3?.actorId;
    if (typeof actorId2 !== "string" || !ID3.test(actorId2))
      return reply2(respond3, origin, { error: "Miembro inv\xE1lido" }, 400);
    const existing = await pendingMemberMedia(env, actorId2);
    if (!existing) return reply2(respond3, origin, { ok: true, cleaned: 0, pending: 0 });
    const cleaned = await cleanupMemberMedia(env, actorId2);
    return reply2(respond3, origin, { ok: true, ...cleaned });
  }
  if (url.pathname !== "/api/chat/admin/remove-member" || request.method !== "POST")
    return reply2(respond3, origin, { error: "Ruta no v\xE1lida" }, 404);
  let payload2;
  try {
    payload2 = await request.json();
  } catch {
    return reply2(respond3, origin, { error: "Solicitud inv\xE1lida" }, 400);
  }
  const actorId = payload2?.actorId, confirmName = payload2?.confirmName;
  if (typeof actorId !== "string" || !ID3.test(actorId) || typeof confirmName !== "string")
    return reply2(respond3, origin, { error: "Confirmaci\xF3n inv\xE1lida" }, 400);
  const member = await env.DB.prepare(
    "SELECT actor_id,display_name FROM chat_members WHERE actor_id=?"
  ).bind(actorId).first();
  if (!member) return reply2(respond3, origin, { error: "Miembro no encontrado" }, 404);
  if (member.display_name !== confirmName) return reply2(respond3, origin, {
    error: "El nombre de confirmaci\xF3n no coincide."
  }, 409);
  const queuedAt = Date.now();
  const queries = [
    env.DB.prepare(
      "INSERT OR IGNORE INTO r2_member_delete_queue(object_key,actor_id,multipart_upload_id,size_bytes,queued_at) SELECT object_key,sender_id,CASE WHEN status='pending' THEN multipart_upload_id ELSE NULL END,size_bytes,? FROM chat_media_objects WHERE sender_id=?"
    ).bind(queuedAt, actorId),
    env.DB.prepare(
      "INSERT OR IGNORE INTO r2_member_delete_queue(object_key,actor_id,multipart_upload_id,size_bytes,queued_at) SELECT object_key,actor_id,NULL,size_bytes,? FROM family_media WHERE actor_id=?"
    ).bind(queuedAt, actorId),
    env.DB.prepare(
      "INSERT OR IGNORE INTO r2_member_delete_queue(object_key,actor_id,multipart_upload_id,size_bytes,queued_at) SELECT photo_key,actor_id,NULL,photo_size,? FROM member_profiles WHERE actor_id=?"
    ).bind(queuedAt, actorId),
    env.DB.prepare(
      "INSERT OR IGNORE INTO r2_member_delete_queue(object_key,actor_id,multipart_upload_id,size_bytes,queued_at) SELECT object_key,actor_id,NULL,byte_size,? FROM member_stories WHERE actor_id=?"
    ).bind(queuedAt, actorId),
    // Queue voice notes authored by the revoked member OR attached to their states.
    env.DB.prepare(
      "INSERT OR IGNORE INTO r2_member_delete_queue(object_key,actor_id,multipart_upload_id,size_bytes,queued_at) SELECT c.voice_key,c.actor_id,NULL,c.voice_size,? FROM member_story_comments c JOIN member_stories s ON s.id=c.story_id WHERE c.voice_key IS NOT NULL AND (c.actor_id=? OR s.actor_id=?)"
    ).bind(queuedAt, actorId, actorId),
    env.DB.prepare(
      "INSERT OR IGNORE INTO r2_member_delete_queue(object_key,actor_id,multipart_upload_id,size_bytes,queued_at) SELECT poster_key,actor_id,NULL,poster_size_bytes,? FROM family_media WHERE actor_id=? AND poster_key IS NOT NULL"
    ).bind(queuedAt, actorId),
    env.DB.prepare(
      "INSERT OR IGNORE INTO r2_member_delete_queue(object_key,actor_id,multipart_upload_id,size_bytes,queued_at) SELECT object_key,actor_id,upload_id,size_bytes,? FROM family_upload_sessions WHERE actor_id=?"
    ).bind(queuedAt, actorId),
    // Video sidecars share the existing durable R2 delete queue.
    env.DB.prepare(
      "INSERT OR IGNORE INTO r2_member_delete_queue(object_key,actor_id,multipart_upload_id,size_bytes,queued_at) SELECT object_key||'.poster.jpg',sender_id,NULL,0,? FROM chat_media_objects WHERE sender_id=? AND kind='video'"
    ).bind(queuedAt, actorId),
    // Chat media FK (sender_id -> chat_members) is not ON DELETE CASCADE.
    // Release media grants/parts with their existing ON DELETE CASCADE FKs.
    env.DB.prepare("DELETE FROM chat_media_objects WHERE sender_id=?").bind(actorId),
    env.DB.prepare("DELETE FROM family_media WHERE actor_id=?").bind(actorId),
    env.DB.prepare("DELETE FROM family_upload_sessions WHERE actor_id=?").bind(actorId),
    env.DB.prepare("UPDATE chat_messages SET reply_to_seq=NULL WHERE reply_to_seq IN (SELECT seq FROM chat_messages WHERE sender_id=?)").bind(actorId),
    env.DB.prepare("DELETE FROM chat_reactions WHERE message_seq IN (SELECT seq FROM chat_messages WHERE sender_id=?)").bind(actorId),
    env.DB.prepare("DELETE FROM chat_reactions WHERE actor_id=?").bind(actorId),
    env.DB.prepare("DELETE FROM chat_messages WHERE sender_id=?").bind(actorId),
    env.DB.prepare("DELETE FROM chat_read_receipts WHERE actor_id=?").bind(actorId),
    env.DB.prepare("DELETE FROM chat_sessions WHERE actor_id=?").bind(actorId),
    env.DB.prepare("DELETE FROM chat_access_events WHERE actor_id=?").bind(actorId),
    env.DB.prepare("DELETE FROM chat_duplicate_login_alerts WHERE actor_id=?").bind(actorId),
    env.DB.prepare("DELETE FROM chat_single_device_owners WHERE actor_id=?").bind(actorId),
    env.DB.prepare("DELETE FROM chat_members WHERE actor_id=? AND display_name=?").bind(actorId, confirmName)
  ];
  const result = await env.DB.batch(queries);
  if (Number(result.at(-1)?.meta?.changes) !== 1)
    return reply2(respond3, origin, { error: "No se pudo confirmar la eliminaci\xF3n" }, 409);
  try {
    await env.CHAT_ROOMS.get(env.CHAT_ROOMS.idFromName(ROOM6)).fetch(
      "https://internal/member-removed",
      { method: "POST", body: JSON.stringify({ actorId }) }
    );
  } catch {
  }
  await notifyAdminClients(env, "members").catch(() => {
  });
  const cleanup3 = await cleanupMemberMedia(env, actorId).catch(async () => ({
    cleaned: 0,
    pending: await pendingMemberMedia(env, actorId).catch(() => null)
  }));
  return reply2(respond3, origin, { ok: true, deleted: true, cleanupPending: cleanup3.pending });
}
__name(handleAdminMemberManagement, "handleAdminMemberManagement");

// src/modules/admin/single-installation.js
var ID4 = /^member:[a-z0-9_-]{1,40}$/i;
var ROOM4 = "main-chat-v2";
function reply3(respond3, origin, body2, status = 200) {
  return respond3(body2, status, origin);
}
__name(reply3, "reply");
async function claimFirstInstallation(env, member, tokenHash, expiry) {
  const rows = await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO chat_single_device_owners(actor_id,token_hash,linked_at) VALUES(?,?,?)"
    ).bind(member.actor_id, tokenHash, Date.now()),
    env.DB.prepare(
      "INSERT INTO chat_sessions(token_hash,actor_id,display_name,expires_at) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM chat_single_device_owners WHERE actor_id=? AND token_hash=?)"
    ).bind(tokenHash, member.actor_id, member.display_name, expiry, member.actor_id, tokenHash)
  ]);
  return Number(rows[1]?.meta?.changes) === 1;
}
__name(claimFirstInstallation, "claimFirstInstallation");
async function auditDuplicateInstallation(env, actorId, request) {
  try {
    const meta = readMemberDevice(request), now = Date.now();
    const r = await env.DB.prepare(
      "INSERT INTO chat_duplicate_login_alerts(id,actor_id,attempted_at,platform,operating_system,device_name) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM chat_duplicate_login_alerts WHERE actor_id=? AND attempted_at>?)<20"
    ).bind(
      crypto.randomUUID(),
      actorId,
      now,
      meta.platform,
      meta.operatingSystem,
      meta.deviceName,
      actorId,
      now - 864e5
    ).run();
    if (Number(r.meta?.changes) > 0) await notifyAdminClients(env, "members");
  } catch {
  }
}
__name(auditDuplicateInstallation, "auditDuplicateInstallation");
async function handleSingleInstallationAdmin(request, env, url, origin, respond3) {
  if (!await verifyAdminSession(request, env))
    return reply3(respond3, origin, { error: "No autorizado" }, 401);
  if (url.pathname === "/api/chat/admin/duplicate-logins" && request.method === "GET") {
    const result = await env.DB.prepare(
      "SELECT a.id,a.actor_id,m.display_name,a.attempted_at,a.platform,a.operating_system,a.device_name,a.reviewed_at FROM chat_duplicate_login_alerts a JOIN chat_members m ON m.actor_id=a.actor_id ORDER BY a.attempted_at DESC LIMIT 60"
    ).all();
    return reply3(respond3, origin, { alerts: result.results || [] });
  }
  if (url.pathname === "/api/chat/admin/duplicate-logins/review" && request.method === "POST") {
    let body2 = null;
    try {
      body2 = await request.json();
    } catch {
    }
    if (typeof body2?.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body2.id))
      return reply3(respond3, origin, { error: "Alerta inv\xE1lida" }, 400);
    await env.DB.prepare(
      "UPDATE chat_duplicate_login_alerts SET reviewed_at=? WHERE id=? AND reviewed_at IS NULL"
    ).bind(Date.now(), body2.id).run();
    await notifyAdminClients(env, "members");
    return reply3(respond3, origin, { ok: true });
  }
  if (url.pathname === "/api/chat/admin/release-installation" && request.method === "POST") {
    let body2 = null;
    try {
      body2 = await request.json();
    } catch {
    }
    if (typeof body2?.actorId !== "string" || !ID4.test(body2.actorId) || typeof body2?.confirmName !== "string")
      return reply3(respond3, origin, { error: "Confirmaci\xF3n inv\xE1lida" }, 400);
    const m = await env.DB.prepare(
      "SELECT actor_id,display_name FROM chat_members WHERE actor_id=? AND active=1"
    ).bind(body2.actorId).first();
    if (!m) return reply3(respond3, origin, { error: "Miembro no encontrado" }, 404);
    if (m.display_name !== body2.confirmName)
      return reply3(respond3, origin, { error: "El nombre de confirmaci\xF3n no coincide" }, 409);
    const rows = await env.DB.batch([
      env.DB.prepare("DELETE FROM chat_sessions WHERE actor_id=?").bind(body2.actorId),
      env.DB.prepare("DELETE FROM chat_single_device_owners WHERE actor_id=?").bind(body2.actorId)
    ]);
    try {
      await env.CHAT_ROOMS.get(env.CHAT_ROOMS.idFromName(ROOM4)).fetch(
        "https://internal/installation-released",
        { method: "POST", body: JSON.stringify({ actorId: body2.actorId }) }
      );
    } catch {
    }
    await notifyAdminClients(env, "members");
    return reply3(respond3, origin, { ok: true, revokedSessions: Number(rows[0]?.meta?.changes || 0) });
  }
  return reply3(respond3, origin, { error: "Ruta no v\xE1lida" }, 404);
}
__name(handleSingleInstallationAdmin, "handleSingleInstallationAdmin");

// src/modules/calendar/calendar-realtime.js
var MEMBER = /^member:[a-z0-9_-]{1,64}$/i;
var SESSION = /^[A-Za-z0-9_-]{40,100}$/;
var ADMIN = /^[A-Za-z0-9_-]{40,128}$/;
function calendarSocketIdentity(request) {
  const protocols = (request.headers.get("sec-websocket-protocol") || "").split(",").map((x) => x.trim());
  if (!protocols.includes("havana-v2-calendar")) return null;
  const member = protocols.find((x) => x.startsWith("session."))?.slice(8);
  const admin = protocols.find((x) => x.startsWith("admin."))?.slice(6);
  if (member && SESSION.test(member) && !admin) return { role: "member", token: member };
  if (admin && ADMIN.test(admin) && !member) return { role: "admin", token: admin };
  return null;
}
__name(calendarSocketIdentity, "calendarSocketIdentity");
async function calendarMember(env, token) {
  if (!SESSION.test(token)) return null;
  const row = await env.DB.prepare(
    "SELECT s.actor_id,s.expires_at FROM chat_sessions s JOIN chat_members m ON m.actor_id=s.actor_id AND m.active=1 WHERE s.token_hash=? AND EXISTS (SELECT 1 FROM chat_single_device_owners o WHERE o.actor_id=m.actor_id AND o.token_hash=s.token_hash)"
  ).bind(await sha256Hex(token)).first();
  return row && Number(row.expires_at) > Date.now() ? row.actor_id : null;
}
__name(calendarMember, "calendarMember");
async function calendarSocketAuthorized(env, identity) {
  if (!identity) return null;
  if (identity.role === "admin") {
    const req = new Request("https://internal/calendar-admin-check", {
      headers: { Authorization: "Bearer " + identity.token }
    });
    return await verifyAdminSession(req, env) ? { role: "admin", actorId: null } : null;
  }
  const actorId = await calendarMember(env, identity.token);
  return actorId ? { role: "member", actorId } : null;
}
__name(calendarSocketAuthorized, "calendarSocketAuthorized");
async function notifyCalendarClients(env, ids) {
  if (!env.CALENDAR_ROOMS) return;
  const recipients2 = [...new Set(ids)].filter((id) => typeof id === "string" && MEMBER.test(id));
  if (!recipients2.length) return;
  try {
    await env.CALENDAR_ROOMS.get(env.CALENDAR_ROOMS.idFromName("calendar-v2")).fetch(
      "https://internal/calendar-changed",
      { method: "POST", body: JSON.stringify({ recipients: recipients2 }) }
    );
  } catch {
  }
}
__name(notifyCalendarClients, "notifyCalendarClients");
async function notifyRepertoireClients(env) {
  if (!env.CALENDAR_ROOMS) return;
  try {
    await env.CALENDAR_ROOMS.get(env.CALENDAR_ROOMS.idFromName("calendar-v2")).fetch(
      "https://internal/repertoire-changed",
      { method: "POST" }
    );
  } catch {
  }
}
__name(notifyRepertoireClients, "notifyRepertoireClients");
var CalendarRoom = class {
  static {
    __name(this, "CalendarRoom");
  }
  constructor(_state, env) {
    this.env = env;
    this.connections = /* @__PURE__ */ new Map();
  }
  send(ws, data) {
    try {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
    } catch {
    }
  }
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/calendar-changed" && request.method === "POST") {
      let data;
      try {
        data = await request.json();
      } catch {
      }
      if (!Array.isArray(data?.recipients)) return Response.json({ error: "Invalid calendar change" }, { status: 400 });
      const affected = new Set(data.recipients.filter((x) => typeof x === "string" && MEMBER.test(x)));
      for (const [socket, peer2] of this.connections) {
        if (peer2.role === "member" && !affected.has(peer2.actorId)) continue;
        const current = await calendarSocketAuthorized(this.env, peer2.identity).catch(() => null);
        if (!current) {
          try {
            socket.close(4003, "Access expired");
          } catch {
          }
          this.connections.delete(socket);
          continue;
        }
        this.send(socket, { type: "calendar.invalidate" });
      }
      return Response.json({ ok: true });
    }
    if (path === "/repertoire-changed" && request.method === "POST") {
      for (const [socket, peer2] of this.connections) {
        const current = await calendarSocketAuthorized(this.env, peer2.identity).catch(() => null);
        if (!current) {
          try {
            socket.close(4003, "Access expired");
          } catch {
          }
          this.connections.delete(socket);
          continue;
        }
        this.send(socket, { type: "repertoire.invalidate" });
      }
      return Response.json({ ok: true });
    }
    if (path !== "/ws/calendar") return Response.json({ error: "Not found" }, { status: 404 });
    if ((request.headers.get("upgrade") || "").toLowerCase() !== "websocket")
      return Response.json({ error: "WebSocket required" }, { status: 426 });
    const identity = calendarSocketIdentity(request);
    const peer = await calendarSocketAuthorized(this.env, identity);
    if (!peer) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    server.accept();
    this.connections.set(server, { ...peer, identity });
    const cleanup3 = /* @__PURE__ */ __name(() => this.connections.delete(server), "cleanup");
    server.addEventListener("close", cleanup3);
    server.addEventListener("error", cleanup3);
    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: { "Sec-WebSocket-Protocol": "havana-v2-calendar" }
    });
  }
};

// src/modules/calendar/calendar-memories.js
var ID5 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var GRANT = /^[a-f0-9]{32}$/;
var TYPES = /* @__PURE__ */ new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
var MAX_BYTES = 15 * 1024 * 1024;
var MAX_WEBP_BYTES = 5 * 1024 * 1024;
var MAX_PHOTOS = 50;
var GRANT_MS2 = 10 * 60 * 1e3;
var ROUTE = "/api/calendar/photo/";
var response = /* @__PURE__ */ __name((body2, status = 200) => Response.json(body2, { status, headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } }), "response");
var mediaHeaders = {
  "cache-control": "private, no-store",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "content-security-policy": "default-src 'none'; sandbox"
};
var sizeOf = /* @__PURE__ */ __name((request) => Number(request.headers.get("content-length")), "sizeOf");
var mimeOf = /* @__PURE__ */ __name((request) => (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase(), "mimeOf");
var nowIso = /* @__PURE__ */ __name(() => (/* @__PURE__ */ new Date()).toISOString(), "nowIso");
function isoToday(timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(/* @__PURE__ */ new Date());
  const value = /* @__PURE__ */ __name((type) => parts.find((p) => p.type === type)?.value || "", "value");
  return value("year") + "-" + value("month") + "-" + value("day");
}
__name(isoToday, "isoToday");
function completed(event2) {
  return event2?.status === "confirmed" && typeof event2.date_sort === "string" && /^\d{4}-\d{2}-\d{2}$/.test(event2.date_sort) && event2.date_sort < isoToday(event2.time_zone);
}
__name(completed, "completed");
async function eventRow(env, id) {
  return await env.DB.prepare(
    "SELECT id,date_sort,time_zone,status FROM calendar_events WHERE id=?"
  ).bind(id).first();
}
__name(eventRow, "eventRow");
async function recipients(env, id) {
  const result = await env.DB.prepare(
    "SELECT actor_id FROM calendar_event_recipients WHERE event_id=?"
  ).bind(id).all();
  return (result.results || []).map((x) => x.actor_id);
}
__name(recipients, "recipients");
async function cleanup2(env) {
  if (!env.MEDIA_BUCKET) return;
  const rows = (await env.DB.prepare(
    "SELECT object_key FROM calendar_photo_delete_queue ORDER BY queued_at LIMIT 30"
  ).all()).results || [];
  for (const row of rows) {
    try {
      await env.MEDIA_BUCKET.delete(row.object_key);
      await env.DB.prepare("DELETE FROM calendar_photo_delete_queue WHERE object_key=?").bind(row.object_key).run();
    } catch {
    }
  }
}
__name(cleanup2, "cleanup");
async function queueOrphan(env, key, size) {
  try {
    await env.MEDIA_BUCKET.delete(key);
  } catch {
    await env.DB.prepare("INSERT OR IGNORE INTO calendar_photo_delete_queue(object_key,size_bytes,queued_at) VALUES(?,?,?)").bind(key, size, nowIso()).run();
  }
}
__name(queueOrphan, "queueOrphan");
async function grantPhotos(env, photos, admin, actorId, variant = "reader") {
  if (!photos.length) return [];
  const expires = Date.now() + GRANT_MS2;
  const tokens = photos.map(() => crypto.randomUUID().replaceAll("-", ""));
  const hashes = await Promise.all(tokens.map(sha256Hex));
  await env.DB.batch(photos.map((photo, i) => env.DB.prepare(
    "INSERT INTO calendar_photo_grants(token_hash,photo_id,actor_id,admin_only,variant,expires_at) VALUES(?,?,?,?,?,?)"
  ).bind(
    hashes[i],
    photo.id,
    admin ? null : actorId,
    admin ? 1 : 0,
    variant === "reader" && photo.optimized_key ? "optimized" : "original",
    expires
  )));
  return tokens.map((x) => ROUTE + x);
}
__name(grantPhotos, "grantPhotos");
async function listPhotos(env, id, admin, actorId) {
  const event2 = await eventRow(env, id);
  if (!event2) return response({ error: "Evento no encontrado" }, 404);
  if (!admin) {
    const assigned = await env.DB.prepare(
      "SELECT 1 AS allowed FROM calendar_event_recipients WHERE event_id=? AND actor_id=?"
    ).bind(id, actorId).first();
    if (!assigned) return response({ error: "No autorizado" }, 403);
    if (!completed(event2)) return response({ error: "El recuerdo se abre cuando termine el evento" }, 403);
  }
  await env.DB.prepare("DELETE FROM calendar_photo_grants WHERE expires_at<=?").bind(Date.now()).run();
  const rows = (await env.DB.prepare(
    "SELECT id,event_id,position,mime_type,size_bytes,optimized_key,optimized_size_bytes,optimized_width,optimized_height FROM calendar_event_photos WHERE event_id=? ORDER BY position ASC,created_at ASC,id ASC LIMIT ?"
  ).bind(id, MAX_PHOTOS).all()).results || [];
  const urls = await grantPhotos(env, rows, admin, actorId);
  const originals = admin ? await grantPhotos(env, rows, true, null, "original") : [];
  return response({ photos: rows.map((p, i) => ({
    id: p.id,
    url: urls[i],
    position: p.position,
    fit: "cover",
    ...admin ? {
      originalUrl: originals[i],
      sizeBytes: p.size_bytes,
      optimizedSizeBytes: p.optimized_key ? p.optimized_size_bytes : 0
    } : {}
  })) });
}
__name(listPhotos, "listPhotos");
async function servePhoto(request, env, path) {
  if (request.method !== "GET" && request.method !== "HEAD") return response({ error: "M\xE9todo no permitido" }, 405);
  const token = path.slice(ROUTE.length);
  if (!GRANT.test(token)) return response({ error: "Foto no encontrada" }, 404);
  const row = await env.DB.prepare(
    "SELECT p.object_key,p.mime_type,p.optimized_key,g.variant,g.admin_only,e.date_sort,e.time_zone,e.status FROM calendar_photo_grants g JOIN calendar_event_photos p ON p.id=g.photo_id JOIN calendar_events e ON e.id=p.event_id WHERE g.token_hash=? AND g.expires_at>? AND (g.admin_only=1 OR EXISTS(SELECT 1 FROM calendar_event_recipients r JOIN chat_members m ON m.actor_id=r.actor_id AND m.active=1 WHERE r.event_id=p.event_id AND r.actor_id=g.actor_id))"
  ).bind(await sha256Hex(token), Date.now()).first();
  if (!row || !row.admin_only && !completed(row)) return response({ error: "Foto no autorizada" }, 404);
  if (!env.MEDIA_BUCKET) return response({ error: "Almacenamiento no disponible" }, 503);
  const optimized = row.variant === "optimized" && !!row.optimized_key;
  let object = await env.MEDIA_BUCKET.get(optimized ? row.optimized_key : row.object_key);
  let mime = optimized ? "image/webp" : row.mime_type;
  if (!object && optimized) {
    object = await env.MEDIA_BUCKET.get(row.object_key);
    mime = row.mime_type;
  }
  if (!object) return response({ error: "Foto no encontrada" }, 404);
  return new Response(request.method === "HEAD" ? null : object.body, {
    status: 200,
    headers: { ...mediaHeaders, "content-type": mime, "content-length": String(object.size) }
  });
}
__name(servePhoto, "servePhoto");
async function uploadPhoto(request, env, eventId) {
  if (!env.MEDIA_BUCKET) return response({ error: "Almacenamiento no disponible" }, 503);
  const mime = mimeOf(request), size = sizeOf(request);
  if (!TYPES.has(mime)) return response({ error: "Solo JPG, PNG, WebP, HEIC o HEIF" }, 415);
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_BYTES || !request.body)
    return response({ error: "Fotograf\xEDa vac\xEDa o mayor a 15 MB" }, 413);
  const count = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM calendar_event_photos WHERE event_id=?"
  ).bind(eventId).first();
  if (Number(count?.n || 0) >= MAX_PHOTOS) return response({ error: "M\xE1ximo de 50 fotos por evento" }, 409);
  const id = crypto.randomUUID(), key = "calendar/v2/memories/" + eventId + "/" + id;
  const reserved = await reserveFamilyStorage(env, size, id);
  if (!reserved) return response({ error: "Espacio R2 insuficiente (protecci\xF3n 9.5 GB)" }, 409);
  let stored = false;
  try {
    const object = await env.MEDIA_BUCKET.put(key, request.body, {
      httpMetadata: { contentType: mime },
      customMetadata: { module: "calendar-event-memories-v2" }
    });
    if (object?.size !== size) throw Error("Longitud incorrecta");
    stored = true;
    await env.DB.prepare(
      "INSERT INTO calendar_event_photos(id,event_id,object_key,mime_type,size_bytes,position,created_at) VALUES(?,?,?,?,?,(SELECT COALESCE(MAX(position),0)+100 FROM calendar_event_photos WHERE event_id=?),?)"
    ).bind(id, eventId, key, mime, size, eventId, nowIso()).run();
    return response({ ok: true, id }, 201);
  } catch {
    if (stored) await queueOrphan(env, key, size);
    return response({ error: "No se pudo guardar la fotograf\xEDa privada" }, 503);
  } finally {
    await releaseFamilyStorage(env, reserved);
  }
}
__name(uploadPhoto, "uploadPhoto");
async function optimizePhoto(request, env, eventId, id) {
  const photo = await env.DB.prepare(
    "SELECT object_key,size_bytes,optimized_key,optimized_size_bytes FROM calendar_event_photos WHERE id=? AND event_id=?"
  ).bind(id, eventId).first();
  if (!photo) return response({ error: "Foto no encontrada" }, 404);
  const size = sizeOf(request), width = Number(request.headers.get("x-book-width"));
  const height = Number(request.headers.get("x-book-height"));
  if (mimeOf(request) !== "image/webp") return response({ error: "Formato WebP requerido" }, 415);
  if (!Number.isSafeInteger(size) || size < 100 || size > MAX_WEBP_BYTES || size >= Number(photo.size_bytes) * 0.94) return response({ error: "Copia WebP demasiado grande" }, 413);
  if (!Number.isInteger(width) || !Number.isInteger(height) || Math.min(width, height) < 1 || Math.max(width, height) > 2200)
    return response({ error: "Dimensiones inv\xE1lidas" }, 400);
  const bytes = new Uint8Array(await request.arrayBuffer());
  const text3 = /* @__PURE__ */ __name((x) => String.fromCharCode(...bytes.subarray(x, x + 4)), "text");
  if (bytes.byteLength !== size || text3(0) !== "RIFF" || text3(8) !== "WEBP")
    return response({ error: "Archivo WebP inv\xE1lido" }, 415);
  const key = "calendar/v2/memories/optimized/" + id + "/" + crypto.randomUUID() + ".webp";
  const reserved = await reserveFamilyStorage(env, size);
  if (!reserved) return response({ error: "Espacio R2 insuficiente" }, 409);
  let stored = false, persisted = false;
  try {
    const object = await env.MEDIA_BUCKET.put(key, bytes, {
      httpMetadata: { contentType: "image/webp" },
      customMetadata: { module: "calendar-event-memories-v2", variant: "optimized" }
    });
    if (object?.size !== size) throw Error("Longitud optimizada incorrecta");
    stored = true;
    const old = photo.optimized_key;
    const statements = [];
    if (old) statements.push(env.DB.prepare(
      "INSERT OR IGNORE INTO calendar_photo_delete_queue(object_key,size_bytes,queued_at) SELECT optimized_key,optimized_size_bytes,? FROM calendar_event_photos WHERE id=? AND event_id=? AND optimized_key=?"
    ).bind(nowIso(), id, eventId, old));
    statements.push(env.DB.prepare(
      "UPDATE calendar_event_photos SET optimized_key=?,optimized_size_bytes=?,optimized_width=?,optimized_height=? WHERE id=? AND event_id=? AND object_key=? AND optimized_key IS ?"
    ).bind(key, size, width, height, id, eventId, photo.object_key, old));
    const updates = await env.DB.batch(statements);
    if (Number(updates.at(-1)?.meta?.changes || 0) !== 1) throw Error("Conflicto de foto");
    persisted = true;
    if (old) await cleanup2(env);
    return response({ ok: true, optimizedSizeBytes: size }, 200);
  } catch {
    if (stored && !persisted) await queueOrphan(env, key, size);
    return response({ error: "No se pudo optimizar; original intacto" }, 503);
  } finally {
    await releaseFamilyStorage(env, reserved);
  }
}
__name(optimizePhoto, "optimizePhoto");
async function removePhoto(env, eventId, id) {
  const photo = await env.DB.prepare(
    "SELECT object_key,size_bytes,optimized_key,optimized_size_bytes FROM calendar_event_photos WHERE id=? AND event_id=?"
  ).bind(id, eventId).first();
  if (!photo) return response({ error: "Foto no encontrada" }, 404);
  const queue = /* @__PURE__ */ __name((key, bytes) => env.DB.prepare(
    "INSERT OR IGNORE INTO calendar_photo_delete_queue(object_key,size_bytes,queued_at) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM calendar_event_photos WHERE id=? AND event_id=?)"
  ).bind(key, bytes, nowIso(), id, eventId), "queue");
  const actions = [queue(photo.object_key, photo.size_bytes)];
  if (photo.optimized_key) actions.push(queue(photo.optimized_key, photo.optimized_size_bytes));
  actions.push(env.DB.prepare("DELETE FROM calendar_event_photos WHERE id=? AND event_id=?").bind(id, eventId));
  const result = await env.DB.batch(actions);
  if (Number(result.at(-1)?.meta?.changes || 0) !== 1) return response({ error: "Foto no encontrada" }, 404);
  await cleanup2(env);
  return response({ ok: true });
}
__name(removePhoto, "removePhoto");
async function reorderPhoto(request, env, eventId, id) {
  let value;
  try {
    value = await request.json();
  } catch {
    return response({ error: "Orden inv\xE1lido" }, 400);
  }
  if (!Number.isSafeInteger(value?.position) || value.position < 0 || value.position > 1e6)
    return response({ error: "Orden inv\xE1lido" }, 400);
  const result = await env.DB.prepare(
    "UPDATE calendar_event_photos SET position=? WHERE id=? AND event_id=?"
  ).bind(value.position, id, eventId).run();
  return Number(result.meta?.changes || 0) === 1 ? response({ ok: true }) : response({ error: "Foto no encontrada" }, 404);
}
__name(reorderPhoto, "reorderPhoto");
async function calendarMemoriesRoute(request, env, url, verifyMusicianSession) {
  const path = url.pathname;
  try {
    if (path.startsWith(ROUTE)) return await servePhoto(request, env, path);
    const admin = path.startsWith("/api/calendar/admin/");
    const match = new RegExp("^/api/calendar/" + (admin ? "admin/" : "") + "events/([0-9a-f-]{36})/photos(?:/([0-9a-f-]{36})(?:/(optimized))?)?$").exec(path);
    if (!match || !ID5.test(match[1]) || match[2] && !ID5.test(match[2]))
      return response({ error: "Ruta no encontrada" }, 404);
    let actorId = null;
    if (admin) {
      if (!await verifyAdminSession(request, env)) return response({ error: "No autorizado" }, 401);
    } else {
      const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
      const member = await verifyMusicianSession(env, token);
      if (!member) return response({ error: "No autorizado" }, 401);
      actorId = member.actorId;
    }
    if (!env.MEDIA_BUCKET) return response({ error: "R2 no disponible" }, 503);
    if (request.method === "GET" && !match[2]) return await listPhotos(env, match[1], admin, actorId);
    if (!admin) return response({ error: "M\xE9todo no permitido" }, 405);
    const exists = await eventRow(env, match[1]);
    if (!exists) return response({ error: "Evento no encontrado" }, 404);
    const done = /* @__PURE__ */ __name(async (result) => {
      if (result.ok) {
        await notifyCalendarClients(env, await recipients(env, match[1]));
      }
      return result;
    }, "done");
    if (request.method === "POST" && !match[2]) return done(await uploadPhoto(request, env, match[1]));
    if (match[2] && request.method === "POST" && match[3] === "optimized")
      return done(await optimizePhoto(request, env, match[1], match[2]));
    if (match[2] && request.method === "DELETE" && !match[3])
      return done(await removePhoto(env, match[1], match[2]));
    if (match[2] && request.method === "PUT" && !match[3])
      return done(await reorderPhoto(request, env, match[1], match[2]));
    return response({ error: "M\xE9todo no permitido" }, 405);
  } catch {
    return response({ error: "Recuerdo temporalmente no disponible" }, 503);
  }
}
__name(calendarMemoriesRoute, "calendarMemoriesRoute");
async function handleCalendarMemories(request, env, url, origin, verifyMusicianSession) {
  const reply6 = await calendarMemoriesRoute(request, env, url, verifyMusicianSession);
  const headers2 = new Headers(reply6.headers);
  headers2.set("access-control-allow-origin", origin || "https://havana-nice-v2.pages.dev");
  headers2.set("vary", "Origin");
  return new Response(reply6.body, { status: reply6.status, headers: headers2 });
}
__name(handleCalendarMemories, "handleCalendarMemories");
async function queueCalendarPhotosOnEventDelete(env, eventId, version) {
  const guard = " EXISTS (SELECT 1 FROM calendar_events WHERE id=? AND version=?)";
  const records = [
    env.DB.prepare("INSERT OR IGNORE INTO calendar_photo_delete_queue(object_key,size_bytes,queued_at) SELECT object_key,size_bytes,? FROM calendar_event_photos WHERE event_id=? AND" + guard).bind(nowIso(), eventId, eventId, version),
    env.DB.prepare("INSERT OR IGNORE INTO calendar_photo_delete_queue(object_key,size_bytes,queued_at) SELECT optimized_key,optimized_size_bytes,? FROM calendar_event_photos WHERE event_id=? AND optimized_key IS NOT NULL AND" + guard).bind(nowIso(), eventId, eventId, version),
    env.DB.prepare("DELETE FROM calendar_events WHERE id=? AND version=?").bind(eventId, version)
  ];
  const result = await env.DB.batch(records);
  if (Number(result.at(-1)?.meta?.changes || 0) === 1) await cleanup2(env);
  return Number(result.at(-1)?.meta?.changes || 0) === 1;
}
__name(queueCalendarPhotosOnEventDelete, "queueCalendarPhotosOnEventDelete");

// src/modules/calendar/calendar.js
var ID6 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var ACTOR_ID = /^member:[a-z0-9_-]{1,64}$/i;
var STATUSES = /* @__PURE__ */ new Set(["tentative", "confirmed", "cancelled"]);
var COLUMNS2 = "e.id,e.event_date,e.time_zone,e.title,e.venue,e.city,e.call_time,e.soundcheck_time,e.arrival_time,e.show_time,e.end_time,e.wardrobe,e.details,e.contact_name,e.contact_phone,e.notes,e.map_url,e.status,e.status_text,e.version,e.updated_at,e.date_sort,(SELECT COUNT(*) FROM calendar_event_photos p WHERE p.event_id=e.id) AS memory_count";
var PAGE_SIZE = 100;
var ERR = { 401: "No autorizado", 409: "La fecha cambi\xF3. Actualiza antes de editar." };
function string(value, max, label, required = false) {
  if (typeof value !== "string") throw Error(label + " debe ser texto");
  const text3 = value.normalize("NFC").trim();
  if (text3.length > max || required && !text3) throw Error(label + " inv\xE1lido o demasiado largo");
  return text3;
}
__name(string, "string");
function optionalSortDate(input) {
  const value = input.trim();
  let y, m, d;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  const local = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(value);
  if (iso) {
    y = Number(iso[1]);
    m = Number(iso[2]);
    d = Number(iso[3]);
  } else if (local) {
    y = Number(local[3]);
    m = Number(local[2]);
    d = Number(local[1]);
  } else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return String(y).padStart(4, "0") + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
}
__name(optionalSortDate, "optionalSortDate");
function time(value) {
  return string(value ?? "", 60, "Hora");
}
__name(time, "time");
function fields(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw Error("Evento inv\xE1lido");
  const date = string(input.date ?? "", 160, "Fecha");
  const timeZone = string(input.timeZone ?? "America/Mexico_City", 64, "Zona horaria", true);
  try {
    new Intl.DateTimeFormat("en", { timeZone });
  } catch {
    throw Error("Zona horaria inv\xE1lida");
  }
  const status = input.status ?? "confirmed";
  if (!STATUSES.has(status)) throw Error("Estado inv\xE1lido");
  const mapUrl = string(input.mapUrl ?? "", 1500, "Google Maps");
  const recipients2 = input.recipientIds;
  if (!Array.isArray(recipients2) || recipients2.length === 0 || recipients2.length > 100)
    throw Error("Selecciona al menos un m\xFAsico destinatario");
  if (!recipients2.every((id) => typeof id === "string" && ACTOR_ID.test(id)) || new Set(recipients2).size !== recipients2.length) throw Error("Destinatarios inv\xE1lidos");
  return {
    date,
    dateSort: optionalSortDate(date),
    timeZone,
    title: string(input.title, 160, "Evento", true),
    venue: string(input.venue ?? "", 160, "Lugar"),
    city: string(input.city ?? "", 120, "Ciudad"),
    callTime: time(input.callTime),
    soundcheckTime: time(input.soundcheckTime),
    arrivalTime: time(input.arrivalTime),
    showTime: time(input.showTime),
    endTime: time(input.endTime),
    wardrobe: string(input.wardrobe ?? "", 500, "Vestuario"),
    details: string(input.details ?? "", 4e3, "Detalles"),
    contactName: string(input.contactName ?? "", 160, "Contacto"),
    contactPhone: string(input.contactPhone ?? "", 80, "Tel\xE9fono"),
    notes: string(input.notes ?? "", 4e3, "Notas"),
    mapUrl,
    status,
    statusText: string(input.statusText ?? "", 160, "Estado"),
    recipientIds: recipients2
  };
}
__name(fields, "fields");
var valueList = /* @__PURE__ */ __name((x) => [
  x.date,
  x.timeZone,
  x.title,
  x.venue,
  x.city,
  x.callTime,
  x.soundcheckTime,
  x.arrivalTime,
  x.showTime,
  x.endTime,
  x.wardrobe,
  x.details,
  x.contactName,
  x.contactPhone,
  x.notes,
  x.mapUrl,
  x.status,
  x.dateSort,
  x.statusText
], "valueList");
function event(row, admin = false) {
  const result = {
    id: row.id,
    date: row.event_date,
    timeZone: row.time_zone,
    title: row.title,
    venue: row.venue,
    city: row.city,
    callTime: row.call_time,
    soundcheckTime: row.soundcheck_time,
    arrivalTime: row.arrival_time,
    showTime: row.show_time,
    endTime: row.end_time,
    wardrobe: row.wardrobe,
    details: row.details,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    notes: row.notes,
    mapUrl: row.map_url,
    status: row.status,
    statusText: row.status_text || "",
    version: row.version,
    updatedAt: row.updated_at,
    dateSort: row.date_sort || null,
    memoryCount: Number(row.memory_count || 0)
  };
  if (admin) result.recipientIds = JSON.parse(row.recipients_json || "[]");
  return result;
}
__name(event, "event");
async function bodyOf(request) {
  if ((request.headers.get("content-type") || "").split(";")[0].trim() !== "application/json")
    throw Error("Se requiere JSON");
  if (Number(request.headers.get("content-length") || 0) > 2e4) throw Error("Solicitud demasiado grande");
  const text3 = await request.text();
  if (text3.length > 2e4) throw Error("Solicitud demasiado grande");
  try {
    return JSON.parse(text3);
  } catch {
    throw Error("JSON inv\xE1lido");
  }
}
__name(bodyOf, "bodyOf");
async function authorizedRecipients(db, ids) {
  const placeholders = ids.map(() => "?").join(",");
  const data = await db.prepare("SELECT actor_id FROM chat_members WHERE active=1 AND actor_id IN (" + placeholders + ")").bind(...ids).all();
  if ((data.results || []).length !== ids.length) throw Error("Seleccionaste un m\xFAsico que ya no est\xE1 activo. Actualiza la lista.");
}
__name(authorizedRecipients, "authorizedRecipients");
function invalid(error, reply6) {
  return reply6({ error: error instanceof Error ? error.message : "Solicitud inv\xE1lida" }, 400);
}
__name(invalid, "invalid");
async function handleCalendarApi(request, env, url, origin, respond3, verifyMusicianSession) {
  const reply6 = /* @__PURE__ */ __name((body2, status = 200) => respond3(body2, status, origin), "reply");
  const path = url.pathname;
  const admin = path.startsWith("/api/calendar/admin/");
  let member = null;
  if (admin) {
    if (!await verifyAdminSession(request, env)) return reply6({ error: ERR[401] }, 401);
  } else {
    const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    member = await verifyMusicianSession(env, token);
    if (!member) return reply6({ error: ERR[401] }, 401);
  }
  if ((path === "/api/calendar/events" || path === "/api/calendar/admin/events") && request.method === "GET") {
    const offset = Number(url.searchParams.get("offset") || "0");
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1e4) return reply6({ error: "Paginaci\xF3n inv\xE1lida" }, 400);
    const assigned = admin ? "" : " WHERE EXISTS (SELECT 1 FROM calendar_event_recipients r WHERE r.event_id=e.id AND r.actor_id=?)";
    const sql = "SELECT " + COLUMNS2 + (admin ? ",(SELECT json_group_array(actor_id) FROM calendar_event_recipients r WHERE r.event_id=e.id) AS recipients_json" : "") + " FROM calendar_events e" + assigned + " ORDER BY CASE WHEN e.date_sort IS NULL THEN 1 ELSE 0 END,e.date_sort ASC,e.event_date ASC,e.id ASC LIMIT ? OFFSET ?";
    try {
      const args = admin ? [PAGE_SIZE + 1, offset] : [member.actorId, PAGE_SIZE + 1, offset];
      const result = await env.DB.prepare(sql).bind(...args).all();
      const rows = result.results || [];
      return reply6({ events: rows.slice(0, PAGE_SIZE).map((x) => event(x, admin)), hasMore: rows.length > PAGE_SIZE });
    } catch {
      return reply6({ error: "Calendario no disponible" }, 503);
    }
  }
  if (!admin) return reply6({ error: "Ruta no encontrada" }, 404);
  if (path === "/api/calendar/admin/events" && request.method === "POST") {
    let payload2;
    try {
      payload2 = fields(await bodyOf(request));
      await authorizedRecipients(env.DB, payload2.recipientIds);
    } catch (e) {
      return invalid(e, reply6);
    }
    const id2 = crypto.randomUUID(), revision = crypto.randomUUID(), now = (/* @__PURE__ */ new Date()).toISOString();
    try {
      const statements = [
        env.DB.prepare("INSERT INTO calendar_events(id,event_date,time_zone,title,venue,city,call_time,soundcheck_time,arrival_time,show_time,end_time,wardrobe,details,contact_name,contact_phone,notes,map_url,status,date_sort,status_text,version,revision_token,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?)").bind(id2, ...valueList(payload2), revision, now, now),
        ...payload2.recipientIds.map((actorId) => env.DB.prepare(
          "INSERT INTO calendar_event_recipients(event_id,actor_id) VALUES (?,?)"
        ).bind(id2, actorId))
      ];
      await env.DB.batch(statements);
      await notifyCalendarClients(env, payload2.recipientIds);
      return reply6({ event: { id: id2, ...payload2, version: 1, updatedAt: now } }, 201);
    } catch {
      return reply6({ error: "No se pudo crear la fecha" }, 503);
    }
  }
  const match = /^\/api\/calendar\/admin\/events\/([0-9a-f-]+)$/.exec(path);
  if (!match || !ID6.test(match[1])) return reply6({ error: "Ruta no encontrada" }, 404);
  const id = match[1];
  if (request.method === "POST") {
    let raw, payload2;
    try {
      raw = await bodyOf(request);
      if (!Number.isSafeInteger(raw?.version) || raw.version < 1) throw Error("Versi\xF3n inv\xE1lida");
      payload2 = fields(raw);
      await authorizedRecipients(env.DB, payload2.recipientIds);
    } catch (e) {
      return invalid(e, reply6);
    }
    const before = await env.DB.prepare("SELECT actor_id FROM calendar_event_recipients WHERE event_id=?").bind(id).all();
    const previous = (before.results || []).map((row) => row.actor_id);
    const revision = crypto.randomUUID(), now = (/* @__PURE__ */ new Date()).toISOString();
    try {
      const update = env.DB.prepare("UPDATE calendar_events SET event_date=?,time_zone=?,title=?,venue=?,city=?,call_time=?,soundcheck_time=?,arrival_time=?,show_time=?,end_time=?,wardrobe=?,details=?,contact_name=?,contact_phone=?,notes=?,map_url=?,status=?,date_sort=?,status_text=?,version=version+1,revision_token=?,updated_at=? WHERE id=? AND version=?").bind(...valueList(payload2), revision, now, id, raw.version);
      const exists = "EXISTS (SELECT 1 FROM calendar_events WHERE id=? AND revision_token=?)";
      const replaceRecipients = [
        env.DB.prepare("DELETE FROM calendar_event_recipients WHERE event_id=? AND " + exists).bind(id, id, revision),
        ...payload2.recipientIds.map((actorId) => env.DB.prepare(
          "INSERT INTO calendar_event_recipients(event_id,actor_id) SELECT ?,? WHERE " + exists
        ).bind(id, actorId, id, revision))
      ];
      const results = await env.DB.batch([update, ...replaceRecipients]);
      if (Number(results[0]?.meta?.changes) !== 1) return reply6({ error: ERR[409] }, 409);
      await notifyCalendarClients(env, [...previous, ...payload2.recipientIds]);
      return reply6({ event: { id, ...payload2, version: raw.version + 1, updatedAt: now } });
    } catch {
      return reply6({ error: "No se pudo guardar la fecha" }, 503);
    }
  }
  if (request.method === "DELETE") {
    let raw;
    try {
      raw = await bodyOf(request);
      if (!Number.isSafeInteger(raw?.version) || raw.version < 1) throw Error("Versi\xF3n inv\xE1lida");
    } catch (e) {
      return invalid(e, reply6);
    }
    try {
      const previous = await env.DB.prepare("SELECT actor_id FROM calendar_event_recipients WHERE event_id=?").bind(id).all();
      const deleted = await queueCalendarPhotosOnEventDelete(env, id, raw.version);
      if (!deleted) return reply6({ error: ERR[409] }, 409);
      await notifyCalendarClients(env, (previous.results || []).map((row) => row.actor_id));
      return reply6({ ok: true });
    } catch {
      return reply6({ error: "No se pudo eliminar la fecha" }, 503);
    }
  }
  return reply6({ error: "M\xE9todo no permitido" }, 405);
}
__name(handleCalendarApi, "handleCalendarApi");

// src/modules/repertoire/repertoire.js
var UUID2 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var PAGE = 250;
var SONG_COLS = "id,title,artist,category,position,active,reference_url,version,updated_at";
var ITEM_COLS = "id,event_id,song_id,title,artist,reference_url,position,completed,updated_at";
var text2 = /* @__PURE__ */ __name((input, max, label, required = false) => {
  if (typeof input !== "string") throw Error(label + " debe ser texto");
  const value = input.normalize("NFC").trim();
  if (value.length > max || required && !value) throw Error(label + " inv\xE1lido");
  return value;
}, "text");
var safeLink = /* @__PURE__ */ __name((s) => {
  const value = text2(s ?? "", 1500, "Referencia");
  if (!value) return value;
  try {
    if (new URL(value).protocol !== "https:") throw Error();
  } catch {
    throw Error("El link debe ser https://");
  }
  return value;
}, "safeLink");
function songInput(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw Error("Canci\xF3n inv\xE1lida");
  const position = raw.position ?? 0;
  if (!Number.isSafeInteger(position) || position < 0 || position > 1e5) throw Error("Orden inv\xE1lido");
  return {
    title: text2(raw.title ?? "", 180, "T\xEDtulo", true),
    artist: text2(raw.artist ?? "", 180, "Artista"),
    category: text2(raw.category ?? "ENGLISH", 80, "Categor\xEDa", true),
    position,
    active: raw.active === void 0 ? true : raw.active === true,
    referenceUrl: safeLink(raw.referenceUrl)
  };
}
__name(songInput, "songInput");
async function body(request) {
  if ((request.headers.get("content-type") || "").split(";")[0].trim() !== "application/json") throw Error("Se requiere JSON");
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 2e4) throw Error("Solicitud demasiado grande");
  const raw = await request.text();
  if (raw.length > 2e4) throw Error("Solicitud demasiado grande");
  try {
    return JSON.parse(raw);
  } catch {
    throw Error("JSON inv\xE1lido");
  }
}
__name(body, "body");
function publicSong(row) {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    category: row.category,
    position: row.position,
    active: row.active === 1,
    referenceUrl: row.reference_url,
    version: row.version,
    updatedAt: row.updated_at
  };
}
__name(publicSong, "publicSong");
function publicItem(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    songId: row.song_id,
    title: row.title,
    artist: row.artist,
    referenceUrl: row.reference_url,
    position: row.position,
    completed: row.completed === 1,
    updatedAt: row.updated_at
  };
}
__name(publicItem, "publicItem");
async function eventAllowed(db, eventId, actorId) {
  const row = await db.prepare("SELECT 1 AS ok FROM calendar_event_recipients WHERE event_id=? AND actor_id=?").bind(eventId, actorId).first();
  return !!row;
}
__name(eventAllowed, "eventAllowed");
async function loadItems(db, eventId) {
  const result = await db.prepare("SELECT " + ITEM_COLS + " FROM repertoire_event_items WHERE event_id=? ORDER BY position,id").bind(eventId).all();
  return (result.results || []).map(publicItem);
}
__name(loadItems, "loadItems");
async function itemList(db, eventId, member, admin) {
  if (!admin && !await eventAllowed(db, eventId, member.actorId)) return null;
  return loadItems(db, eventId);
}
__name(itemList, "itemList");
async function handleRepertoireApi(request, env, url, origin, respond3, verifyMusicianSession) {
  const reply6 = /* @__PURE__ */ __name((value, status = 200) => respond3(value, status, origin), "reply");
  const path = url.pathname, admin = path.startsWith("/api/repertoire/admin/");
  let member = null;
  if (admin) {
    if (!await verifyAdminSession(request, env)) return reply6({ error: "No autorizado" }, 401);
  } else {
    const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    member = await verifyMusicianSession(env, token);
    if (!member) return reply6({ error: "No autorizado" }, 401);
  }
  try {
    if (path === "/api/repertoire/events/assigned" && request.method === "GET") {
      const offset = Number(url.searchParams.get("offset") || 0);
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1e4)
        return reply6({ error: "Paginaci\xF3n inv\xE1lida" }, 400);
      const sql = "SELECT i.id,i.event_id,i.song_id,i.title,i.artist,i.reference_url,i.position,i.completed,i.updated_at FROM repertoire_event_items i INNER JOIN calendar_event_recipients r ON r.event_id=i.event_id WHERE r.actor_id=? ORDER BY i.event_id,i.position,i.id LIMIT ? OFFSET ?";
      const response2 = await env.DB.prepare(sql).bind(member.actorId, PAGE + 1, offset).all();
      const rows = response2.results || [];
      return reply6({ items: rows.slice(0, PAGE).map(publicItem), hasMore: rows.length > PAGE });
    }
    if ((path === "/api/repertoire/songs" || path === "/api/repertoire/admin/songs") && request.method === "GET") {
      const offset = Number(url.searchParams.get("offset") || 0);
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1e4) return reply6({ error: "Paginaci\xF3n inv\xE1lida" }, 400);
      const where = admin ? "" : " WHERE active=1";
      const sql = "SELECT " + SONG_COLS + " FROM repertoire_songs" + where + " ORDER BY category,position,title,id LIMIT ? OFFSET ?";
      const res = await env.DB.prepare(sql).bind(PAGE + 1, offset).all();
      const entries = res.results || [];
      return reply6({ songs: entries.slice(0, PAGE).map(publicSong), hasMore: entries.length > PAGE });
    }
    if (path === "/api/repertoire/admin/songs" && request.method === "POST") {
      const value = songInput(await body(request));
      const id = crypto.randomUUID(), now = (/* @__PURE__ */ new Date()).toISOString();
      await env.DB.prepare("INSERT INTO repertoire_songs(id,title,artist,category,position,active,reference_url,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(id, value.title, value.artist, value.category, value.position, value.active ? 1 : 0, value.referenceUrl, now, now).run();
      return reply6({ song: { id, ...value, version: 1, updatedAt: now } }, 201);
    }
    const songPath = /^\/api\/repertoire\/admin\/songs\/([0-9a-f-]+)$/.exec(path);
    if (songPath && UUID2.test(songPath[1])) {
      const id = songPath[1], data = await body(request);
      if (!Number.isSafeInteger(data?.version) || data.version < 1) return reply6({ error: "Versi\xF3n inv\xE1lida" }, 400);
      if (request.method === "POST") {
        const value = songInput(data), now = (/* @__PURE__ */ new Date()).toISOString();
        const result = await env.DB.prepare("UPDATE repertoire_songs SET title=?,artist=?,category=?,position=?,active=?,reference_url=?,version=version+1,updated_at=? WHERE id=? AND version=?").bind(value.title, value.artist, value.category, value.position, value.active ? 1 : 0, value.referenceUrl, now, id, data.version).run();
        if (result.meta?.changes !== 1) return reply6({ error: "La canci\xF3n cambi\xF3; actualiza antes de editar." }, 409);
        return reply6({ song: { id, ...value, version: data.version + 1, updatedAt: now } });
      }
      if (request.method === "DELETE") {
        const result = await env.DB.prepare("DELETE FROM repertoire_songs WHERE id=? AND version=?").bind(id, data.version).run();
        if (result.meta?.changes !== 1) return reply6({ error: "La canci\xF3n cambi\xF3; actualiza antes de borrar." }, 409);
        return reply6({ ok: true });
      }
    }
    const eventPath = /^\/api\/repertoire\/(?:admin\/)?events\/([0-9a-f-]+)\/items$/.exec(path);
    if (eventPath && UUID2.test(eventPath[1])) {
      const eventId = eventPath[1];
      if (request.method === "GET") {
        const items = await itemList(env.DB, eventId, member, admin);
        return items === null ? reply6({ error: "Evento no asignado" }, 403) : reply6({ items });
      }
      if (!admin) return reply6({ error: "No autorizado" }, 403);
      if (request.method === "POST") {
        const data = await body(request);
        const masterIds = data?.songIds;
        const isMaster = Array.isArray(masterIds);
        if (isMaster) {
          if (!masterIds.length || masterIds.length > 100 || new Set(masterIds).size !== masterIds.length || !masterIds.every((id) => typeof id === "string" && UUID2.test(id)))
            return reply6({ error: "Selecciona canciones v\xE1lidas" }, 400);
        }
        if (!isMaster && (!data?.special || typeof data.special !== "object" || Array.isArray(data.special)))
          return reply6({ error: "Canci\xF3n especial inv\xE1lida" }, 400);
        const custom = isMaster ? null : {
          title: text2(data.special.title ?? "", 180, "T\xEDtulo", true),
          artist: text2(data.special.artist ?? "", 180, "Artista"),
          referenceUrl: safeLink(data.special.referenceUrl)
        };
        const event2 = await env.DB.prepare("SELECT id FROM calendar_events WHERE id=?").bind(eventId).first();
        if (!event2) return reply6({ error: "Evento no encontrado" }, 404);
        const existing = await env.DB.prepare("SELECT song_id FROM repertoire_event_items WHERE event_id=? AND song_id IS NOT NULL").bind(eventId).all();
        const already = new Set((existing.results || []).map((r) => r.song_id));
        const rows = isMaster ? (await env.DB.prepare("SELECT " + SONG_COLS + " FROM repertoire_songs WHERE id IN (" + masterIds.map(() => "?").join(",") + ") AND active=1").bind(...masterIds).all()).results || [] : [];
        if (isMaster && rows.length !== masterIds.length) return reply6({ error: "Una canci\xF3n ya no est\xE1 activa." }, 409);
        const toInsert = isMaster ? masterIds.filter((id) => !already.has(id)).map((id) => rows.find((s) => s.id === id)) : [null];
        if (isMaster && !toInsert.length) return reply6({ added: 0, items: await loadItems(env.DB, eventId) });
        const count = await env.DB.prepare("SELECT COALESCE(MAX(position),-1) AS max_position FROM repertoire_event_items WHERE event_id=?").bind(eventId).first();
        const start = Number(count?.max_position || 0) + 1, now = (/* @__PURE__ */ new Date()).toISOString();
        const statements = toInsert.map((row, i) => env.DB.prepare(
          "INSERT INTO repertoire_event_items(id,event_id,song_id,title,artist,reference_url,position,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)"
        ).bind(
          crypto.randomUUID(),
          eventId,
          row?.id || null,
          row?.title || custom.title,
          row?.artist || custom.artist,
          row?.reference_url || custom.referenceUrl,
          start + i,
          now,
          now
        ));
        await env.DB.batch(statements);
        return reply6({ added: statements.length, items: await loadItems(env.DB, eventId) }, 201);
      }
    }
    const orderPath = /^\/api\/repertoire\/admin\/events\/([0-9a-f-]+)\/order$/.exec(path);
    if (orderPath && UUID2.test(orderPath[1]) && request.method === "POST") {
      const eventId = orderPath[1], data = await body(request);
      const ids = data?.itemIds;
      if (!Array.isArray(ids) || ids.length > 250 || !ids.every((id) => typeof id === "string" && UUID2.test(id)) || new Set(ids).size !== ids.length) return reply6({ error: "Orden inv\xE1lido" }, 400);
      const stored = await env.DB.prepare("SELECT id FROM repertoire_event_items WHERE event_id=?").bind(eventId).all();
      const existing = (stored.results || []).map((x) => x.id);
      if (existing.length !== ids.length || !existing.every((id) => ids.includes(id))) return reply6({ error: "La lista cambi\xF3; actualiza antes de ordenarla." }, 409);
      if (ids.length) {
        const now = (/* @__PURE__ */ new Date()).toISOString();
        await env.DB.batch(ids.map((id, i) => env.DB.prepare(
          "UPDATE repertoire_event_items SET position=?,updated_at=? WHERE event_id=? AND id=?"
        ).bind(i, now, eventId, id)));
      }
      return reply6({ items: await loadItems(env.DB, eventId) });
    }
    const itemPath = /^\/api\/repertoire\/admin\/items\/([0-9a-f-]+)$/.exec(path);
    if (itemPath && UUID2.test(itemPath[1])) {
      if (request.method === "DELETE") {
        const result = await env.DB.prepare("DELETE FROM repertoire_event_items WHERE id=?").bind(itemPath[1]).run();
        return result.meta?.changes === 1 ? reply6({ ok: true }) : reply6({ error: "Canci\xF3n del evento no encontrada" }, 404);
      }
      if (request.method === "POST") {
        const data = await body(request);
        if (typeof data?.completed !== "boolean") return reply6({ error: "Progreso inv\xE1lido" }, 400);
        const result = await env.DB.prepare("UPDATE repertoire_event_items SET completed=?,updated_at=? WHERE id=?").bind(data.completed ? 1 : 0, (/* @__PURE__ */ new Date()).toISOString(), itemPath[1]).run();
        return result.meta?.changes === 1 ? reply6({ ok: true }) : reply6({ error: "Canci\xF3n no encontrada" }, 404);
      }
    }
    return reply6({ error: "Ruta no encontrada" }, 404);
  } catch (error) {
    if (error instanceof Error && /inválid|título|texto|artista|categoría|link|demasiado|JSON|https/.test(error.message.toLowerCase()))
      return reply6({ error: error.message }, 400);
    return reply6({ error: "No se pudo completar la operaci\xF3n de Repertorio." }, 503);
  }
}
__name(handleRepertoireApi, "handleRepertoireApi");

// src/modules/family/family-multipart.js
var FAMILY_PART_BYTES = 5 * 1024 * 1024;
var SESSION_LIFETIME = 6 * 60 * 60 * 1e3;
var MULTIPART_FORMATS = /* @__PURE__ */ new Map([
  ["video/mp4", "video"],
  ["video/quicktime", "video"],
  ["image/jpeg", "photo"],
  ["image/png", "photo"],
  ["image/webp", "photo"],
  ["image/heic", "photo"],
  ["image/heif", "photo"]
]);
function reply4(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "referrer-policy": "no-referrer"
  } });
}
__name(reply4, "reply");
function familyMultipartRoute(path) {
  const matched = /^\/api\/family\/admin\/albums\/(member(?::|%3A)[a-z0-9_-]{1,64})\/multipart(?:\/([0-9a-f-]{36})(?:\/(parts\/([1-9][0-9]{0,3})|complete))?)?$/i.exec(path);
  if (!matched) return null;
  const id = matched[2] || null;
  if (id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  return {
    actorId: decodeURIComponent(matched[1]),
    id,
    part: matched[4] ? Number(matched[4]) : null,
    complete: !!matched[3] && matched[3] === "complete"
  };
}
__name(familyMultipartRoute, "familyMultipartRoute");
async function session(env, route) {
  if (!route.id) return null;
  return env.DB.prepare("SELECT id,actor_id,object_key,upload_id,mime_type,size_bytes,expires_at FROM family_upload_sessions WHERE id=? AND actor_id=?").bind(route.id, route.actorId).first();
}
__name(session, "session");
async function startFamilyMultipart(request, env, route) {
  let body2;
  try {
    body2 = await request.json();
  } catch {
    return reply4({ error: "Datos de carga inv\xE1lidos" }, 400);
  }
  const mime = body2?.mimeType;
  const size = body2?.sizeBytes;
  if (!MULTIPART_FORMATS.has(mime) || !Number.isSafeInteger(size) || size < 2 * FAMILY_PART_BYTES || size > FAMILY_STORAGE_STOP_BYTES)
    return reply4({ error: "Formato no permitido o archivo mayor que el espacio total de 9.5 GB" }, 413);
  const member = await env.DB.prepare("SELECT actor_id FROM chat_members WHERE actor_id=? AND active=1").bind(route.actorId).first();
  if (!member) return reply4({ error: "Integrante no autorizado" }, 404);
  const expired = await env.DB.prepare("SELECT id,actor_id,object_key,upload_id FROM family_upload_sessions WHERE expires_at<? LIMIT 20").bind(Date.now()).all();
  for (const old of expired.results || []) {
    try {
      await env.MEDIA_BUCKET.resumeMultipartUpload(old.object_key, old.upload_id).abort();
      await env.DB.prepare("DELETE FROM family_upload_sessions WHERE id=?").bind(old.id).run();
    } catch {
    }
  }
  const reservation = await reserveFamilyStorage(env, size);
  if (!reservation) return reply4({ error: "Almacenamiento Familia casi lleno: l\xEDmite preventivo 9.5 GB. Borra archivos para liberar espacio." }, 409);
  const id = crypto.randomUUID(), key = "family/" + encodeURIComponent(route.actorId) + "/" + id;
  let multipart;
  try {
    multipart = await env.MEDIA_BUCKET.createMultipartUpload(key, {
      httpMetadata: { contentType: mime },
      customMetadata: { module: "familia-v2", actorId: route.actorId }
    });
    await env.DB.batch([
      env.DB.prepare("INSERT INTO family_upload_sessions(id,actor_id,object_key,upload_id,mime_type,size_bytes,expires_at) VALUES(?,?,?,?,?,?,?)").bind(id, route.actorId, key, multipart.uploadId, mime, size, Date.now() + SESSION_LIFETIME),
      env.DB.prepare("DELETE FROM family_upload_reservations WHERE id=?").bind(reservation)
    ]);
    return reply4({ id, partSize: FAMILY_PART_BYTES, partCount: Math.ceil(size / FAMILY_PART_BYTES) }, 201);
  } catch {
    if (multipart) await multipart.abort().catch(() => {
    });
    return reply4({ error: "No se pudo preparar la carga privada" }, 503);
  } finally {
    await releaseFamilyStorage(env, reservation);
  }
}
__name(startFamilyMultipart, "startFamilyMultipart");
async function familyMultipartStatus(env, route) {
  const saved = await session(env, route);
  if (!saved) {
    const done = await env.DB.prepare(
      "SELECT id FROM family_media WHERE id=? AND actor_id=?"
    ).bind(route.id, route.actorId).first();
    return done ? reply4({ id: done.id, complete: true }) : reply4({ error: "Transferencia no encontrada" }, 404);
  }
  if (saved.expires_at <= Date.now()) return reply4({ error: "Transferencia caducada" }, 410);
  const parts = await env.DB.prepare(
    "SELECT part_number FROM family_upload_parts WHERE session_id=? ORDER BY part_number"
  ).bind(saved.id).all();
  return reply4({
    id: saved.id,
    complete: false,
    partSize: FAMILY_PART_BYTES,
    partCount: Math.ceil(saved.size_bytes / FAMILY_PART_BYTES),
    completedParts: (parts.results || []).map((row) => row.part_number)
  });
}
__name(familyMultipartStatus, "familyMultipartStatus");
async function uploadFamilyPart(request, env, route) {
  const s = await session(env, route);
  if (!s || s.expires_at <= Date.now()) return reply4({ error: "Carga caducada" }, 404);
  const count = Math.ceil(s.size_bytes / FAMILY_PART_BYTES), number = route.part;
  if (!Number.isInteger(number) || number < 1 || number > count) return reply4({ error: "Parte inv\xE1lida" }, 400);
  const required = Math.min(FAMILY_PART_BYTES, s.size_bytes - (number - 1) * FAMILY_PART_BYTES);
  const size = Number(request.headers.get("content-length"));
  if (!Number.isSafeInteger(size) || size !== required || !request.body)
    return reply4({ error: "Tama\xF1o de la parte incorrecto" }, 400);
  try {
    const upload = env.MEDIA_BUCKET.resumeMultipartUpload(s.object_key, s.upload_id);
    const saved = await upload.uploadPart(number, request.body);
    await env.DB.prepare("INSERT INTO family_upload_parts(session_id,part_number,etag,size_bytes) VALUES(?,?,?,?) ON CONFLICT(session_id,part_number) DO UPDATE SET etag=excluded.etag,size_bytes=excluded.size_bytes").bind(s.id, number, saved.etag, size).run();
    return reply4({ ok: true, partNumber: number });
  } catch {
    return reply4({ error: "Fallo de red al recibir una parte; puedes reintentarla" }, 503);
  }
}
__name(uploadFamilyPart, "uploadFamilyPart");
async function completeFamilyMultipart(env, route) {
  const s = await session(env, route);
  if (!s || s.expires_at <= Date.now()) return reply4({ error: "Carga caducada" }, 404);
  const parts = await env.DB.prepare("SELECT part_number,etag,size_bytes FROM family_upload_parts WHERE session_id=? ORDER BY part_number").bind(s.id).all();
  const rows = parts.results || [], count = Math.ceil(s.size_bytes / FAMILY_PART_BYTES);
  if (rows.length !== count || rows.some((r, i) => r.part_number !== i + 1 || r.size_bytes !== Math.min(FAMILY_PART_BYTES, s.size_bytes - i * FAMILY_PART_BYTES)))
    return reply4({ error: "Faltan fragmentos del video" }, 409);
  try {
    const object = await env.MEDIA_BUCKET.resumeMultipartUpload(s.object_key, s.upload_id).complete(rows.map((row) => ({ partNumber: row.part_number, etag: row.etag })));
    if (!object || object.size !== s.size_bytes) {
      await env.MEDIA_BUCKET.delete(s.object_key).catch(() => {
      });
      return reply4({ error: "El tama\xF1o del video no coincide" }, 400);
    }
    try {
      await env.DB.batch([
        env.DB.prepare("INSERT INTO family_media(id,actor_id,kind,object_key,mime_type,size_bytes,position,is_cover,created_at) VALUES(?,?,?, ?,?,?,0,0,?)").bind(s.id, s.actor_id, MULTIPART_FORMATS.get(s.mime_type), s.object_key, s.mime_type, s.size_bytes, (/* @__PURE__ */ new Date()).toISOString()),
        env.DB.prepare("DELETE FROM family_upload_sessions WHERE id=? AND actor_id=?").bind(s.id, s.actor_id)
      ]);
    } catch (e) {
      await env.MEDIA_BUCKET.delete(s.object_key).catch(() => {
      });
      throw e;
    }
    return reply4({ ok: true, id: s.id, kind: MULTIPART_FORMATS.get(s.mime_type) }, 201);
  } catch {
    return reply4({ error: "No se pudo finalizar el video privado" }, 503);
  }
}
__name(completeFamilyMultipart, "completeFamilyMultipart");
async function abortFamilyMultipart(env, route) {
  const s = await session(env, route);
  if (!s) return reply4({ ok: true });
  try {
    await env.MEDIA_BUCKET.resumeMultipartUpload(s.object_key, s.upload_id).abort();
    await env.DB.prepare("DELETE FROM family_upload_sessions WHERE id=? AND actor_id=?").bind(s.id, s.actor_id).run();
    return reply4({ ok: true });
  } catch {
    return reply4({ error: "No se pudo cancelar la carga" }, 503);
  }
}
__name(abortFamilyMultipart, "abortFamilyMultipart");
async function handleFamilyMultipart(request, env, route) {
  if (!env.MEDIA_BUCKET) return reply4({ error: "Almacenamiento no disponible" }, 503);
  if (!route.id && request.method === "POST") return startFamilyMultipart(request, env, route);
  if (route.id && route.part !== null && request.method === "POST") return uploadFamilyPart(request, env, route);
  if (route.id && route.complete && request.method === "POST") return completeFamilyMultipart(env, route);
  if (route.id && route.part === null && !route.complete && request.method === "GET")
    return familyMultipartStatus(env, route);
  if (route.id && route.part === null && !route.complete && request.method === "DELETE")
    return abortFamilyMultipart(env, route);
  return reply4({ error: "M\xE9todo no permitido" }, 405);
}
__name(handleFamilyMultipart, "handleFamilyMultipart");

// src/modules/family/family-media.js
var GRANT_LIFETIME_MS = 10 * 60 * 1e3;
var MEDIA_TYPES = {
  "image/jpeg": "photo",
  "image/png": "photo",
  "image/webp": "photo",
  "image/heic": "photo",
  "image/heif": "photo",
  "video/mp4": "video",
  "video/quicktime": "video"
};
var GRANT_PATH = "/api/family/media/";
function json2(data, status = 200, origin = "") {
  return new Response(JSON.stringify(data), { status, headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": origin || "https://havana-nice-v2-dev.pages.dev",
    "vary": "Origin",
    "referrer-policy": "no-referrer"
  } });
}
__name(json2, "json");
async function issueFamilyGrants(env, items) {
  if (!items.length) return [];
  if (items.length > 160) throw new Error("Too many private media grants");
  const expiresAt = Date.now() + GRANT_LIFETIME_MS;
  const tokens = items.map(() => crypto.randomUUID().replace(/-/g, ""));
  const hashes = await Promise.all(tokens.map((token) => sha256Hex(token)));
  await env.DB.batch(items.map(({ id, variant }, index) => env.DB.prepare("INSERT INTO family_media_grants(token_hash,media_id,expires_at,variant) VALUES(?,?,?,?)").bind(hashes[index], id, expiresAt, variant)));
  return tokens.map((token) => GRANT_PATH + token);
}
__name(issueFamilyGrants, "issueFamilyGrants");
function secureFileHeaders(object, mime, origin, rangeRequested) {
  const h = new Headers({
    "content-type": mime,
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; sandbox",
    "content-disposition": "inline",
    "referrer-policy": "no-referrer",
    "accept-ranges": "bytes",
    "access-control-allow-origin": origin || "https://havana-nice-v2-dev.pages.dev",
    "vary": "Origin"
  });
  if (rangeRequested && object.range && typeof object.range.offset === "number" && typeof object.range.length === "number") {
    const start = object.range.offset, end = start + object.range.length - 1;
    h.set("content-range", "bytes " + start + "-" + end + "/" + object.size);
    h.set("content-length", String(object.range.length));
    return { headers: h, status: 206 };
  }
  h.set("content-length", String(object.size));
  return { headers: h, status: 200 };
}
__name(secureFileHeaders, "secureFileHeaders");
async function readFamilyGrant(request, env, url, origin) {
  if (request.method !== "GET" && request.method !== "HEAD") return json2({ error: "M\xE9todo no permitido" }, 405, origin);
  if (!env.MEDIA_BUCKET) return json2({ error: "Archivos no disponibles" }, 503, origin);
  const token = url.pathname.slice(GRANT_PATH.length);
  if (!/^[a-f0-9]{32}$/.test(token)) return json2({ error: "Archivo no encontrado" }, 404, origin);
  const row = await env.DB.prepare(
    "SELECT f.object_key,f.mime_type,f.poster_key,f.poster_mime,g.variant FROM family_media_grants g JOIN family_media f ON f.id=g.media_id JOIN chat_members m ON m.actor_id=f.actor_id AND m.active=1 WHERE g.token_hash=? AND g.expires_at>?"
  ).bind(await sha256Hex(token), Date.now()).first();
  if (!row) return json2({ error: "Enlace caducado o archivo no autorizado" }, 404, origin);
  const poster = row.variant === "poster";
  if (poster && (!row.poster_key || !row.poster_mime))
    return json2({ error: "Portada no disponible" }, 404, origin);
  const objectKey = poster ? row.poster_key : row.object_key;
  const mime = poster ? row.poster_mime : row.mime_type;
  const obj = await env.MEDIA_BUCKET.get(
    objectKey,
    !poster && request.headers.has("range") ? { range: request.headers } : {}
  );
  if (!obj) return json2({ error: "Archivo no encontrado" }, 404, origin);
  const options = secureFileHeaders(obj, mime, origin, !poster && request.headers.has("range"));
  return new Response(request.method === "HEAD" ? null : obj.body, options);
}
__name(readFamilyGrant, "readFamilyGrant");
async function pruneExpiredFamilyGrants(env) {
  await env.DB.prepare("DELETE FROM family_media_grants WHERE expires_at<=?").bind(Date.now()).run();
}
__name(pruneExpiredFamilyGrants, "pruneExpiredFamilyGrants");
async function listFamilyMedia(env, actorId) {
  await pruneExpiredFamilyGrants(env);
  const member = await env.DB.prepare("SELECT actor_id FROM chat_members WHERE actor_id=? AND active=1").bind(actorId).first();
  if (!member) return null;
  const rows = await env.DB.prepare(
    "SELECT id,kind,poster_key FROM family_media WHERE actor_id=? ORDER BY position ASC,created_at DESC,id DESC LIMIT 80"
  ).bind(actorId).all();
  const media = rows.results || [];
  const grants = await issueFamilyGrants(env, media.flatMap((row) => [
    { id: row.id, variant: "original" },
    ...row.kind === "video" && row.poster_key ? [{ id: row.id, variant: "poster" }] : []
  ]));
  let offset = 0;
  return media.map((row) => {
    const fileUrl = grants[offset++];
    const thumbnailUrl = row.kind === "photo" ? fileUrl : row.poster_key ? grants[offset++] : null;
    return {
      id: row.id,
      kind: row.kind,
      fileUrl,
      thumbnailUrl,
      alt: row.kind === "video" ? "Video del \xE1lbum" : "Foto del \xE1lbum"
    };
  });
}
__name(listFamilyMedia, "listFamilyMedia");
async function checkFamilyOriginalUpload(env, actorId, mediaId, origin) {
  const row = await env.DB.prepare(
    "SELECT id,size_bytes,mime_type FROM family_media WHERE id=? AND actor_id=?"
  ).bind(mediaId, actorId).first();
  return row ? json2({ id: row.id, sizeBytes: row.size_bytes, mimeType: row.mime_type }, 200, origin) : json2({ error: "Esta transferencia a\xFAn no termin\xF3" }, 404, origin);
}
__name(checkFamilyOriginalUpload, "checkFamilyOriginalUpload");
async function uploadFamilyMedia(request, env, actorId, origin) {
  if (!env.MEDIA_BUCKET) return json2({ error: "Almacenamiento no disponible" }, 503, origin);
  const contentType = (request.headers.get("content-type") || "").split(";")[0].toLowerCase().trim();
  const kind = MEDIA_TYPES[contentType];
  if (!kind) return json2({ error: "Formato no permitido" }, 415, origin);
  const declared = Number(request.headers.get("content-length"));
  if (!Number.isSafeInteger(declared) || declared <= 0) return json2({ error: "Se necesita tama\xF1o del archivo" }, 411, origin);
  if (declared > FAMILY_STORAGE_STOP_BYTES) return json2({ error: "El archivo supera el espacio m\xE1ximo de Familia (9.5 GB)" }, 413, origin);
  if (declared > 15 * 1024 * 1024) return json2({ error: "Utiliza la transferencia por partes para este archivo" }, 413, origin);
  if (!request.body) return json2({ error: "Archivo vac\xEDo" }, 400, origin);
  const member = await env.DB.prepare("SELECT actor_id FROM chat_members WHERE actor_id=? AND active=1").bind(actorId).first();
  if (!member) return json2({ error: "Integrante no autorizado" }, 404, origin);
  const clientId = request.headers.get("x-havana-v2-upload-id");
  if (clientId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId))
    return json2({ error: "Identificador de carga inv\xE1lido" }, 400, origin);
  const id = clientId || crypto.randomUUID();
  if (clientId) {
    const existing = await env.DB.prepare(
      "SELECT actor_id,mime_type,size_bytes FROM family_media WHERE id=?"
    ).bind(id).first();
    if (existing) {
      if (existing.actor_id === actorId && existing.mime_type === contentType && existing.size_bytes === declared)
        return json2({ ok: true, id, kind, actorId, alreadySaved: true }, 200, origin);
      return json2({ error: "Identificador de carga ya utilizado" }, 409, origin);
    }
  }
  const reservation = await reserveFamilyStorage(env, declared, id);
  if (!reservation) return json2({ error: "Almacenamiento Familia casi lleno (l\xEDmite 9.5 GB). Elimina archivos para liberar espacio." }, 409, origin);
  const key = "family/" + encodeURIComponent(actorId) + "/" + id;
  try {
    const object = await env.MEDIA_BUCKET.put(key, request.body, {
      httpMetadata: { contentType },
      customMetadata: { module: "familia-v2", actorId }
    });
    if (!object || object.size !== declared) {
      await env.MEDIA_BUCKET.delete(key).catch(() => {
      });
      return json2({ error: "El tama\xF1o recibido no coincide con el archivo original" }, 400, origin);
    }
    try {
      await env.DB.prepare(
        "INSERT INTO family_media(id,actor_id,kind,object_key,mime_type,size_bytes,position,is_cover,created_at) VALUES(?,?,?,?,?,?,0,0,?)"
      ).bind(id, actorId, kind, key, contentType, declared, (/* @__PURE__ */ new Date()).toISOString()).run();
    } catch (error) {
      await env.MEDIA_BUCKET.delete(key).catch(() => {
      });
      throw error;
    }
    return json2({ ok: true, id, kind, actorId }, 201, origin);
  } catch {
    return json2({ error: "No se pudo guardar el archivo privado" }, 503, origin);
  } finally {
    await releaseFamilyStorage(env, reservation);
  }
}
__name(uploadFamilyMedia, "uploadFamilyMedia");
async function uploadFamilyPoster(request, env, actorId, mediaId, origin) {
  if (!env.MEDIA_BUCKET) return json2({ error: "Almacenamiento no disponible" }, 503, origin);
  const mime = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (mime !== "image/webp" && mime !== "image/jpeg")
    return json2({ error: "La portada debe ser una imagen WebP o JPEG" }, 415, origin);
  const length = Number(request.headers.get("content-length"));
  if (!Number.isSafeInteger(length) || length < 64 || length > 384 * 1024)
    return json2({ error: "Portada demasiado grande (m\xE1ximo 384 KiB)" }, 413, origin);
  const row = await env.DB.prepare(
    "SELECT f.poster_key FROM family_media f JOIN chat_members m ON m.actor_id=f.actor_id AND m.active=1 WHERE f.id=? AND f.actor_id=? AND f.kind='video'"
  ).bind(mediaId, actorId).first();
  if (!row) return json2({ error: "El video no pertenece a un \xE1lbum activo" }, 404, origin);
  let bytes;
  try {
    bytes = new Uint8Array(await request.arrayBuffer());
  } catch {
    return json2({ error: "No se pudo leer la portada" }, 400, origin);
  }
  if (bytes.byteLength !== length) return json2({ error: "Tama\xF1o de portada incorrecto" }, 400, origin);
  const jpeg = mime === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = mime === "image/webp" && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!jpeg && !webp) return json2({ error: "La imagen de portada no coincide con su formato" }, 415, origin);
  const reservation = await reserveFamilyStorage(env, length);
  if (!reservation) return json2({ error: "Almacenamiento Familia casi lleno (l\xEDmite 9.5 GB)" }, 409, origin);
  const key = "family/" + encodeURIComponent(actorId) + "/" + mediaId + ".poster." + crypto.randomUUID() + (jpeg ? ".jpg" : ".webp");
  try {
    const saved = await env.MEDIA_BUCKET.put(key, bytes, {
      httpMetadata: { contentType: mime },
      customMetadata: { module: "familia-v2", type: "video-poster" }
    });
    if (saved?.size !== bytes.byteLength) {
      await env.MEDIA_BUCKET.delete(key).catch(() => {
      });
      return json2({ error: "La portada recibida est\xE1 incompleta" }, 503, origin);
    }
    try {
      await env.DB.prepare("UPDATE family_media SET poster_key=?,poster_mime=?,poster_size_bytes=? WHERE id=? AND actor_id=? AND kind='video'").bind(key, mime, bytes.byteLength, mediaId, actorId).run();
    } catch (e) {
      await env.MEDIA_BUCKET.delete(key).catch(() => {
      });
      throw e;
    }
    if (row.poster_key && row.poster_key !== key)
      await env.MEDIA_BUCKET.delete(row.poster_key).catch(() => {
      });
    return json2({ ok: true, id: mediaId }, 201, origin);
  } catch {
    return json2({ error: "No se pudo guardar la portada privada" }, 503, origin);
  } finally {
    await releaseFamilyStorage(env, reservation);
  }
}
__name(uploadFamilyPoster, "uploadFamilyPoster");
async function deleteFamilyMedia(env, actorId, mediaId, origin) {
  if (!env.MEDIA_BUCKET) return json2({ error: "Almacenamiento no disponible" }, 503, origin);
  const row = await env.DB.prepare(
    "SELECT f.object_key,f.poster_key FROM family_media f JOIN chat_members m ON m.actor_id=f.actor_id AND m.active=1 WHERE f.id=? AND f.actor_id=?"
  ).bind(mediaId, actorId).first();
  if (!row) return json2({ error: "Archivo no encontrado" }, 404, origin);
  try {
    await env.MEDIA_BUCKET.delete([row.object_key, ...row.poster_key ? [row.poster_key] : []]);
    await env.DB.prepare("DELETE FROM family_media WHERE id=? AND actor_id=?").bind(mediaId, actorId).run();
    return json2({ ok: true, id: mediaId }, 200, origin);
  } catch {
    return json2({ error: "No se pudo borrar el archivo privado" }, 503, origin);
  }
}
__name(deleteFamilyMedia, "deleteFamilyMedia");
async function selectFamilyCover(env, actorId, mediaId, origin) {
  const row = await env.DB.prepare(
    "SELECT f.id FROM family_media f JOIN chat_members m ON m.actor_id=f.actor_id AND m.active=1 WHERE f.id=? AND f.actor_id=? AND f.kind='photo'"
  ).bind(mediaId, actorId).first();
  if (!row) return json2({ error: "Selecciona una fotograf\xEDa v\xE1lida del \xE1lbum" }, 404, origin);
  try {
    await env.DB.batch([
      env.DB.prepare("UPDATE family_media SET is_cover=0 WHERE actor_id=?").bind(actorId),
      env.DB.prepare("UPDATE family_media SET is_cover=1 WHERE actor_id=? AND id=? AND kind=?").bind(actorId, mediaId, "photo")
    ]);
    return json2({ ok: true, id: mediaId }, 200, origin);
  } catch {
    return json2({ error: "No se pudo actualizar la portada" }, 503, origin);
  }
}
__name(selectFamilyCover, "selectFamilyCover");
function familyMediaItemRoute(pathname) {
  const media = /^\/api\/family\/admin\/albums\/(member(?::|%3A)[a-z0-9_-]{1,64})\/media\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\/(cover|poster))?$/i.exec(pathname);
  return media ? { actorId: decodeURIComponent(media[1]), id: media[2], cover: media[4] === "cover", poster: media[4] === "poster" } : null;
}
__name(familyMediaItemRoute, "familyMediaItemRoute");
function familyAlbumRoute(pathname) {
  const media = /^\/api\/family\/(admin\/)?albums\/(member(?::|%3A)[a-z0-9_-]{1,64})\/media$/i.exec(pathname);
  return media ? { admin: !!media[1], actorId: decodeURIComponent(media[2]) } : null;
}
__name(familyAlbumRoute, "familyAlbumRoute");
async function familyAlbumSummaries(env, rows) {
  await pruneExpiredFamilyGrants(env);
  const albums = rows.map((row) => ({
    actorId: row.actor_id,
    name: row.display_name,
    photoCount: 0,
    videoCount: 0,
    coverUrl: null,
    mediaReady: true
  }));
  const byActor = new Map(albums.map((a) => [a.actorId, a]));
  const counts = await env.DB.prepare(
    "SELECT actor_id,kind,COUNT(*) total FROM family_media GROUP BY actor_id,kind"
  ).all();
  for (const row of counts.results || []) {
    const album = byActor.get(row.actor_id);
    if (album) {
      if (row.kind === "photo") album.photoCount = row.total;
      else if (row.kind === "video") album.videoCount = row.total;
    }
  }
  const covers = await env.DB.prepare(
    "SELECT f.id,f.actor_id,f.kind FROM family_media f WHERE (f.kind='photo' OR (f.kind='video' AND f.poster_key IS NOT NULL)) AND f.id=(SELECT f2.id FROM family_media f2 WHERE f2.actor_id=f.actor_id AND (f2.kind='photo' OR (f2.kind='video' AND f2.poster_key IS NOT NULL)) ORDER BY CASE WHEN f2.kind='photo' THEN 0 ELSE 1 END ASC,f2.is_cover DESC,f2.position ASC,f2.created_at ASC,f2.id ASC LIMIT 1)"
  ).all();
  const coverRows = (covers.results || []).filter((row) => byActor.has(row.actor_id));
  const urls = await issueFamilyGrants(env, coverRows.map((row) => ({
    id: row.id,
    variant: row.kind === "video" ? "poster" : "original"
  })));
  coverRows.forEach((row, index) => {
    byActor.get(row.actor_id).coverUrl = urls[index];
  });
  return albums;
}
__name(familyAlbumSummaries, "familyAlbumSummaries");

// src/modules/family/family.js
async function handleFamilyApi(request, env, url, origin, respond3, verifyMusicianSession, ctx) {
  const reply6 = /* @__PURE__ */ __name((value, status = 200) => respond3(value, status, origin), "reply");
  const signalSaved = /* @__PURE__ */ __name((result) => {
    if (result.ok) {
      const task = notifyFamilyClients(env);
      if (ctx?.waitUntil) ctx.waitUntil(task);
      else void task;
    }
    return result;
  }, "signalSaved");
  if (url.pathname.startsWith("/api/family/media/")) {
    try {
      return await readFamilyGrant(request, env, url, origin);
    } catch {
      return reply6({ error: "Archivo privado no disponible" }, 503);
    }
  }
  const isAdmin = url.pathname.startsWith("/api/family/admin/");
  if (isAdmin) {
    if (!await verifyAdminSession(request, env)) return reply6({ error: "No autorizado" }, 401);
  } else {
    const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!await verifyMusicianSession(env, token))
      return reply6({ error: "No autorizado" }, 401);
  }
  const transfer = familyMultipartRoute(url.pathname);
  if (transfer) {
    if (!isAdmin) return reply6({ error: "No autorizado" }, 401);
    const result = await handleFamilyMultipart(request, env, transfer);
    result.headers.set("access-control-allow-origin", origin || "https://havana-nice-v2-dev.pages.dev");
    result.headers.set("vary", "Origin");
    return request.method === "POST" && transfer.complete ? signalSaved(result) : result;
  }
  const item = familyMediaItemRoute(url.pathname);
  if (item) {
    if (!isAdmin) return reply6({ error: "No autorizado" }, 401);
    if (!env.MEDIA_BUCKET) return reply6({ error: "Almacenamiento no disponible" }, 503);
    if (request.method === "GET" && !item.cover && !item.poster)
      return checkFamilyOriginalUpload(env, item.actorId, item.id, origin);
    if (request.method === "DELETE" && !item.cover && !item.poster)
      return signalSaved(await deleteFamilyMedia(env, item.actorId, item.id, origin));
    if (request.method === "POST" && item.cover)
      return signalSaved(await selectFamilyCover(env, item.actorId, item.id, origin));
    if (request.method === "POST" && item.poster)
      return signalSaved(await uploadFamilyPoster(request, env, item.actorId, item.id, origin));
    return reply6({ error: "M\xE9todo no permitido" }, 405);
  }
  const route = familyAlbumRoute(url.pathname);
  if (route) {
    if (!env.MEDIA_BUCKET) return reply6({ error: "Almacenamiento no disponible" }, 503);
    if (request.method === "GET") {
      try {
        const items = await listFamilyMedia(env, route.actorId);
        return items ? reply6({ actorId: route.actorId, items }) : reply6({ error: "\xC1lbum no encontrado" }, 404);
      } catch {
        return reply6({ error: "Archivos no disponibles" }, 503);
      }
    }
    if (request.method === "POST" && isAdmin && route.admin)
      return signalSaved(await uploadFamilyMedia(request, env, route.actorId, origin));
    return reply6({ error: "M\xE9todo no permitido" }, 405);
  }
  if (request.method !== "GET") return reply6({ error: "M\xE9todo no permitido" }, 405);
  if (url.pathname !== (isAdmin ? "/api/family/admin/albums" : "/api/family/albums"))
    return reply6({ error: "Ruta no encontrada" }, 404);
  try {
    const rows = await env.DB.prepare(
      "SELECT actor_id,display_name FROM chat_members WHERE active=1 ORDER BY display_name COLLATE NOCASE,actor_id LIMIT 30"
    ).all();
    const albums = env.MEDIA_BUCKET ? await familyAlbumSummaries(env, rows.results || []) : (rows.results || []).map((row) => ({
      actorId: row.actor_id,
      name: row.display_name,
      photoCount: 0,
      videoCount: 0,
      coverUrl: null,
      mediaReady: false
    }));
    return reply6({
      section: "Familia HAVANA NICE",
      albums,
      mediaReady: !!env.MEDIA_BUCKET,
      ...isAdmin && env.MEDIA_BUCKET ? { storage: await familyStorageUsage(env) } : {}
    });
  } catch {
    return reply6({ error: "Familia HAVANA NICE no est\xE1 disponible" }, 503);
  }
}
__name(handleFamilyApi, "handleFamilyApi");

// src/modules/profile/profile.js
var MAX_AVATAR = 15e5;
var EXPIRES = 10 * 60 * 1e3;
var ID7 = /^member:(?:[a-z0-9_-]{1,28}|[0-9a-f-]{36})$/i;
var AUTH_PREFIX = "/api/profile/photo/";
function json3(value, status = 200, origin = "") {
  return new Response(JSON.stringify(value), { status, headers: {
    "content-type": "application/json;charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": origin || "https://havana-nice-v2-dev.pages.dev",
    "vary": "Origin"
  } });
}
__name(json3, "json");
async function readPhotoGrant(request, env, url, origin) {
  if (request.method !== "GET" && request.method !== "HEAD") return json3({ error: "M\xE9todo no permitido" }, 405, origin);
  const id = url.pathname.slice(AUTH_PREFIX.length);
  if (!/^[a-f0-9]{32}$/.test(id)) return json3({ error: "Foto no encontrada" }, 404, origin);
  const grant = await env.DB.prepare(
    "SELECT p.photo_key FROM member_profile_grants g JOIN member_profiles p ON p.actor_id=g.actor_id AND p.photo_key=g.photo_key JOIN chat_members m ON m.actor_id=p.actor_id AND m.active=1 WHERE g.token_hash=? AND g.expires_at>?"
  ).bind(await sha256Hex(id), Date.now()).first();
  if (!grant) return json3({ error: "Foto caducada" }, 404, origin);
  const object = await env.MEDIA_BUCKET.get(grant.photo_key);
  if (!object) return json3({ error: "Foto no encontrada" }, 404, origin);
  return new Response(request.method === "HEAD" ? null : object.body, { status: 200, headers: {
    "content-type": "image/jpeg",
    "cache-control": "private,no-store",
    "x-content-type-options": "nosniff",
    "content-disposition": "inline",
    "referrer-policy": "no-referrer",
    "access-control-allow-origin": origin || "https://havana-nice-v2-dev.pages.dev",
    "vary": "Origin",
    "content-length": String(object.size)
  } });
}
__name(readPhotoGrant, "readPhotoGrant");
async function listProfiles(env, origin, workerOrigin) {
  await env.DB.prepare("DELETE FROM member_profile_grants WHERE expires_at<=?").bind(Date.now()).run();
  const rows = (await env.DB.prepare(
    "SELECT m.actor_id,m.display_name,p.photo_key FROM chat_members m LEFT JOIN member_profiles p ON p.actor_id=m.actor_id WHERE m.active=1 ORDER BY m.display_name COLLATE NOCASE,m.actor_id LIMIT 30"
  ).all()).results || [];
  const grants = await Promise.all(rows.map(async (row) => {
    if (!row.photo_key) return null;
    const token = crypto.randomUUID().replace(/-/g, "");
    const hash = await sha256Hex(token);
    await env.DB.prepare(
      "INSERT INTO member_profile_grants(token_hash,actor_id,photo_key,expires_at) VALUES(?,?,?,?)"
    ).bind(hash, row.actor_id, row.photo_key, Date.now() + EXPIRES).run();
    return AUTH_PREFIX + token;
  }));
  return json3({ profiles: rows.map((row, i) => ({
    actorId: row.actor_id,
    name: row.display_name,
    photoUrl: grants[i] ? new URL(grants[i], workerOrigin).toString() : null
  })) }, 200, origin);
}
__name(listProfiles, "listProfiles");
async function uploadPhoto2(request, env, actor, origin, ctx) {
  if ((request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase() !== "image/jpeg")
    return json3({ error: "La fotograf\xEDa debe estar en formato JPG." }, 415, origin);
  const declared = Number(request.headers.get("content-length"));
  if (!Number.isSafeInteger(declared) || declared <= 0 || declared > MAX_AVATAR)
    return json3({ error: "La fotograf\xEDa debe pesar menos de 1.5 MB." }, 413, origin);
  const data = await request.arrayBuffer();
  if (data.byteLength !== declared || data.byteLength < 4 || data.byteLength > MAX_AVATAR)
    return json3({ error: "Tama\xF1o de fotograf\xEDa no v\xE1lido." }, 400, origin);
  const head = new Uint8Array(data);
  if (head[0] !== 255 || head[1] !== 216 || head[head.length - 2] !== 255 || head[head.length - 1] !== 217)
    return json3({ error: "El archivo JPG est\xE1 da\xF1ado o no es v\xE1lido." }, 415, origin);
  if (!ID7.test(actor.actorId)) return json3({ error: "Identidad no v\xE1lida" }, 403, origin);
  const previous = await env.DB.prepare(
    "SELECT photo_key FROM member_profiles WHERE actor_id=?"
  ).bind(actor.actorId).first();
  const objectKey = "profiles/" + encodeURIComponent(actor.actorId) + "/" + crypto.randomUUID() + ".jpg";
  try {
    await env.MEDIA_BUCKET.put(objectKey, data, { httpMetadata: { contentType: "image/jpeg" } });
  } catch {
    return json3({ error: "No se pudo guardar la foto en R2." }, 503, origin);
  }
  try {
    const sql = [
      env.DB.prepare(
        "INSERT INTO member_profiles(actor_id,photo_key,photo_size,updated_at) VALUES(?,?,?,?) ON CONFLICT(actor_id) DO UPDATE SET photo_key=excluded.photo_key,photo_size=excluded.photo_size,updated_at=excluded.updated_at"
      ).bind(actor.actorId, objectKey, data.byteLength, Date.now())
    ];
    if (previous?.photo_key && previous.photo_key !== objectKey) {
      sql.push(env.DB.prepare(
        "INSERT OR IGNORE INTO r2_member_delete_queue(object_key,actor_id,multipart_upload_id,size_bytes,queued_at) VALUES(?,?,NULL,0,?)"
      ).bind(previous.photo_key, actor.actorId, Date.now()));
    }
    await env.DB.batch(sql);
  } catch {
    await env.MEDIA_BUCKET.delete(objectKey).catch(() => {
    });
    return json3({ error: "No se pudo asociar la foto al perfil." }, 503, origin);
  }
  if (previous?.photo_key && previous.photo_key !== objectKey) {
    const task = (async () => {
      try {
        await env.MEDIA_BUCKET.delete(previous.photo_key);
        await env.DB.prepare("DELETE FROM r2_member_delete_queue WHERE object_key=?").bind(previous.photo_key).run();
      } catch {
      }
    })();
    if (ctx?.waitUntil) ctx.waitUntil(task);
    else void task;
  }
  const signal = notifyFamilyClients(env);
  if (ctx?.waitUntil) ctx.waitUntil(signal);
  else void signal;
  return json3({ ok: true, actorId: actor.actorId }, 200, origin);
}
__name(uploadPhoto2, "uploadPhoto");
async function handleProfileApi(request, env, url, origin, verifySession2, ctx) {
  if (!env.MEDIA_BUCKET) return json3({ error: "Perfiles no disponibles" }, 503, origin);
  try {
    if (url.pathname.startsWith(AUTH_PREFIX)) return readPhotoGrant(request, env, url, origin);
    const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const actor = await verifySession2(env, token);
    if (!actor) return json3({ error: "No autorizado" }, 401, origin);
    if (url.pathname === "/api/profile/team" && request.method === "GET")
      return listProfiles(env, origin, url.origin);
    if (url.pathname === "/api/profile/me/photo" && request.method === "PUT")
      return uploadPhoto2(request, env, actor, origin, ctx);
    return json3({ error: "Ruta no encontrada" }, 404, origin);
  } catch {
    return json3({ error: "Perfiles no disponibles" }, 503, origin);
  }
}
__name(handleProfileApi, "handleProfileApi");

// src/modules/notices/member-notifications.js
var asJson = /* @__PURE__ */ __name((value, status, origin) => new Response(JSON.stringify(value), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "private,no-store",
    "access-control-allow-origin": origin || "https://havana-nice-v2.pages.dev",
    "vary": "Origin"
  }
}), "asJson");
var UUID3 = /^[a-f0-9-]{36}$/i;
async function notifyMember(env, { recipientId, actorId, kind, targetId, emoji = "", preview = "", dedupeKey = null }) {
  if (!recipientId || !actorId || recipientId === actorId) return false;
  const now = Date.now();
  const response2 = await env.DB.prepare(
    "INSERT OR IGNORE INTO member_notifications (id,recipient_id,actor_id,kind,target_id,emoji,preview,created_at,dedupe_key) SELECT ?,r.actor_id,a.actor_id,?,?,?,?,?,? FROM chat_members r JOIN chat_members a ON a.actor_id=? AND a.active=1 WHERE r.actor_id=? AND r.active=1"
  ).bind(
    crypto.randomUUID(),
    String(kind).slice(0, 60),
    String(targetId).slice(0, 100),
    String(emoji).slice(0, 12),
    String(preview).slice(0, 160),
    now,
    dedupeKey,
    actorId,
    recipientId
  ).run();
  return Number(response2.meta?.changes || 0) > 0;
}
__name(notifyMember, "notifyMember");
async function notifyStoryOwner(env, storyId, actor, kind, { emoji = "", preview = "", dedupeKey = null } = {}) {
  const story = await env.DB.prepare(
    "SELECT s.actor_id FROM member_stories s JOIN chat_members m ON m.actor_id=s.actor_id AND m.active=1 WHERE s.id=? AND s.expires_at>?"
  ).bind(storyId, Date.now()).first();
  if (!story || story.actor_id === actor.actorId) return false;
  return notifyMember(env, {
    recipientId: story.actor_id,
    actorId: actor.actorId,
    kind,
    targetId: storyId,
    emoji,
    preview,
    dedupeKey
  });
}
__name(notifyStoryOwner, "notifyStoryOwner");
async function handleMemberNotices(request, env, url, origin, verifySession2) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const actor = await verifySession2(env, token);
  if (!actor) return asJson({ error: "No autorizado." }, 401, origin);
  try {
    if (url.pathname === "/api/notices" && request.method === "GET") {
      const rows = (await env.DB.prepare(
        "SELECT n.id,n.actor_id,a.display_name,n.kind,n.target_id,n.emoji,n.preview,n.created_at,n.read_at FROM member_notifications n JOIN chat_members a ON a.actor_id=n.actor_id WHERE n.recipient_id=? ORDER BY n.created_at DESC,n.id DESC LIMIT 60"
      ).bind(actor.actorId).all()).results || [];
      const unread = await env.DB.prepare(
        "SELECT COUNT(*) AS total FROM member_notifications WHERE recipient_id=? AND read_at IS NULL"
      ).bind(actor.actorId).first();
      return asJson({ items: rows.map((row) => ({
        id: row.id,
        actorId: row.actor_id,
        name: row.display_name,
        kind: row.kind,
        targetId: row.target_id,
        emoji: row.emoji,
        preview: row.preview,
        createdAt: row.created_at,
        readAt: row.read_at
      })), unread: Number(unread?.total || 0) }, 200, origin);
    }
    if (url.pathname === "/api/notices/read" && request.method === "POST") {
      let data;
      try {
        data = await request.json();
      } catch {
        return asJson({ error: "Solicitud inv\xE1lida." }, 400, origin);
      }
      const id = data?.id;
      if (id !== null && id !== void 0 && (typeof id !== "string" || !UUID3.test(id)))
        return asJson({ error: "Notificaci\xF3n inv\xE1lida." }, 400, origin);
      const now = Date.now();
      if (id) {
        await env.DB.prepare("UPDATE member_notifications SET read_at=? WHERE id=? AND recipient_id=? AND read_at IS NULL").bind(now, id, actor.actorId).run();
      } else {
        await env.DB.prepare("UPDATE member_notifications SET read_at=? WHERE recipient_id=? AND read_at IS NULL").bind(now, actor.actorId).run();
      }
      return asJson({ ok: true }, 200, origin);
    }
    return asJson({ error: "M\xE9todo no permitido." }, 405, origin);
  } catch {
    return asJson({ error: "Notificaciones a\xFAn no disponibles." }, 503, origin);
  }
}
__name(handleMemberNotices, "handleMemberNotices");

// src/modules/stories/story-conversation.js
var STORY_PATH = /^\/api\/stories\/([a-f0-9-]{36})\/(conversation|text|voice|reaction)$/i;
var VOICE_PATH = /^\/api\/stories\/voice\/([a-f0-9]{32})$/;
var MIME2 = /* @__PURE__ */ new Set(["audio/mp4", "audio/webm", "audio/ogg"]);
var MAX_VOICE_BYTES = 3e6;
var VOICE_GRANT_MS = 10 * 60 * 1e3;
var json4 = /* @__PURE__ */ __name((data, status, origin) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": origin || "https://havana-nice-v2.pages.dev",
    "vary": "Origin"
  }
}), "json");
var fail = /* @__PURE__ */ __name((error, status, origin) => json4({ error }, status, origin), "fail");
async function visibleStory(env, id) {
  return env.DB.prepare("SELECT s.id,s.expires_at FROM member_stories s JOIN chat_members m ON m.actor_id=s.actor_id AND m.active=1 WHERE s.id=? AND s.expires_at>?").bind(id, Date.now()).first();
}
__name(visibleStory, "visibleStory");
async function newVoiceGrant(env, id, storyExpiry, origin) {
  const random = crypto.randomUUID().replace(/-/g, "");
  await env.DB.prepare(
    "INSERT INTO member_story_voice_grants(token_hash,comment_id,expires_at) VALUES(?,?,?)"
  ).bind(await sha256Hex(random), id, Math.min(Date.now() + VOICE_GRANT_MS, storyExpiry)).run();
  return "/api/stories/voice/" + random;
}
__name(newVoiceGrant, "newVoiceGrant");
async function conversation(env, id, url, origin) {
  const rows = (await env.DB.prepare(
    "SELECT c.id,c.actor_id,m.display_name,c.kind,c.body,c.voice_key,c.created_at FROM member_story_comments c JOIN chat_members m ON c.actor_id=m.actor_id AND m.active=1 WHERE c.story_id=? ORDER BY c.created_at ASC,c.id ASC LIMIT 150"
  ).bind(id).all()).results || [];
  const story = await visibleStory(env, id);
  if (!story) return fail("El estado ya caduc\xF3.", 404, origin);
  const comments = await Promise.all(rows.map(async (row) => ({
    id: row.id,
    actorId: row.actor_id,
    name: row.display_name,
    kind: row.kind,
    text: row.kind === "text" ? row.body : "",
    createdAt: row.created_at,
    voiceUrl: row.kind === "voice" ? new URL(await newVoiceGrant(env, row.id, story.expires_at, origin), url.origin).toString() : null
  })));
  const reactionRows = (await env.DB.prepare(
    "SELECT emoji,SUM(count) AS total FROM member_story_reactions WHERE story_id=? GROUP BY emoji"
  ).bind(id).all()).results || [];
  const reactions = Object.fromEntries(["\u2764\uFE0F", "\u{1F44F}", "\u{1F602}"].map((emoji) => [
    emoji,
    Number(reactionRows.find((row) => row.emoji === emoji)?.total || 0)
  ]));
  return json4({ storyId: id, comments, reactions, serverNow: Date.now() }, 200, origin);
}
__name(conversation, "conversation");
async function postText(request, env, actor, id, origin, ctx) {
  let data;
  try {
    data = await request.json();
  } catch {
    return fail("Mensaje inv\xE1lido.", 400, origin);
  }
  const text3 = typeof data?.text === "string" ? data.text.trim() : "";
  if (!text3 || text3.length > 500) return fail("Escribe entre 1 y 500 caracteres.", 400, origin);
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM member_story_comments WHERE story_id=?").bind(id).first();
  if (Number(count?.n || 0) >= 150) return fail("Esta conversaci\xF3n alcanz\xF3 su l\xEDmite.", 409, origin);
  const commentId = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO member_story_comments (id,story_id,actor_id,kind,body,created_at) VALUES(?,?,?,'text',?,?)"
  ).bind(commentId, id, actor.actorId, text3, Date.now()).run();
  try {
    await notifyStoryOwner(env, id, actor, "story.comment", {
      preview: text3,
      dedupeKey: "story.comment:" + commentId
    });
  } catch {
  }
  if (ctx?.waitUntil) ctx.waitUntil(notifyFamilyClients(env));
  return json4({ ok: true, id: commentId }, 201, origin);
}
__name(postText, "postText");
async function postVoice(request, env, actor, id, origin, ctx) {
  const type = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!MIME2.has(type)) return fail("Formato de audio no compatible.", 415, origin);
  const declared = Number(request.headers.get("content-length"));
  if (request.headers.has("content-length") && (!Number.isSafeInteger(declared) || declared < 1 || declared > MAX_VOICE_BYTES))
    return fail("El mensaje de voz supera 3 MB.", 413, origin);
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_VOICE_BYTES)
    return fail("El mensaje de voz supera 3 MB.", 413, origin);
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM member_story_comments WHERE story_id=?").bind(id).first();
  if (Number(count?.n || 0) >= 150) return fail("Esta conversaci\xF3n alcanz\xF3 su l\xEDmite.", 409, origin);
  const commentId = crypto.randomUUID();
  const key = "stories/voice/" + encodeURIComponent(actor.actorId) + "/" + commentId;
  await env.MEDIA_BUCKET.put(key, bytes, { httpMetadata: { contentType: type } });
  try {
    await env.DB.prepare(
      "INSERT INTO member_story_comments (id,story_id,actor_id,kind,body,voice_key,voice_mime,voice_size,created_at) VALUES(?,?,?,'voice','',?,?,?,?)"
    ).bind(commentId, id, actor.actorId, key, type, bytes.byteLength, Date.now()).run();
  } catch {
    try {
      await env.DB.prepare(
        "INSERT OR IGNORE INTO r2_member_delete_queue (object_key,actor_id,multipart_upload_id,size_bytes,queued_at) VALUES(?,?,NULL,?,?)"
      ).bind(key, actor.actorId, bytes.byteLength, Date.now()).run();
    } catch {
    }
    try {
      await env.MEDIA_BUCKET.delete(key);
      await env.DB.prepare(
        "DELETE FROM r2_member_delete_queue WHERE object_key=?"
      ).bind(key).run();
    } catch {
    }
    return fail("No se pudo guardar el audio.", 503, origin);
  }
  try {
    await notifyStoryOwner(env, id, actor, "story.voice", {
      preview: "Nota de voz",
      dedupeKey: "story.voice:" + commentId
    });
  } catch {
  }
  if (ctx?.waitUntil) ctx.waitUntil(notifyFamilyClients(env));
  return json4({ ok: true, id: commentId }, 201, origin);
}
__name(postVoice, "postVoice");
async function postReaction(request, env, actor, id, origin, ctx) {
  let body2;
  try {
    body2 = await request.json();
  } catch {
    return fail("Reacci\xF3n inv\xE1lida.", 400, origin);
  }
  if (body2?.emoji !== "\u2764\uFE0F" && body2?.emoji !== "\u{1F44F}" && body2?.emoji !== "\u{1F602}") return fail("Reacci\xF3n inv\xE1lida.", 400, origin);
  await env.DB.prepare(
    "INSERT INTO member_story_reactions(story_id,actor_id,emoji,count,updated_at) VALUES(?,?,?,1,?) ON CONFLICT(story_id,actor_id,emoji) DO UPDATE SET count=MIN(200,count+1),updated_at=excluded.updated_at"
  ).bind(id, actor.actorId, body2.emoji, Date.now()).run();
  try {
    await notifyStoryOwner(env, id, actor, "story.reaction", {
      emoji: body2.emoji,
      dedupeKey: "story.reaction:" + id + ":" + actor.actorId + ":" + body2.emoji
    });
  } catch {
  }
  if (ctx?.waitUntil) ctx.waitUntil(notifyFamilyClients(env));
  return json4({ ok: true }, 200, origin);
}
__name(postReaction, "postReaction");
async function readVoice(request, env, url, origin) {
  if (!["GET", "HEAD"].includes(request.method)) return fail("M\xE9todo no permitido.", 405, origin);
  const code = VOICE_PATH.exec(url.pathname)?.[1];
  if (!code) return fail("Audio no encontrado.", 404, origin);
  const row = await env.DB.prepare(
    "SELECT c.voice_key,c.voice_mime,c.voice_size FROM member_story_voice_grants g JOIN member_story_comments c ON c.id=g.comment_id AND c.kind='voice' JOIN member_stories s ON s.id=c.story_id AND s.expires_at>? JOIN chat_members owner ON owner.actor_id=s.actor_id AND owner.active=1 JOIN chat_members sender ON sender.actor_id=c.actor_id AND sender.active=1 WHERE g.token_hash=? AND g.expires_at>?"
  ).bind(Date.now(), await sha256Hex(code), Date.now()).first();
  if (!row) return fail("Audio no disponible.", 404, origin);
  const range = (request.headers.get("range") || "").match(/^bytes=(\d+)-(\d*)$/);
  let start = 0, end = Number(row.voice_size) - 1, partial = false;
  if (request.headers.has("range")) {
    if (!range) return new Response(null, { status: 416, headers: { "content-range": "bytes */" + row.voice_size } });
    start = Number(range[1]);
    end = range[2] ? Number(range[2]) : end;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= row.voice_size)
      return new Response(null, { status: 416, headers: { "content-range": "bytes */" + row.voice_size } });
    end = Math.min(end, Number(row.voice_size) - 1);
    partial = true;
  }
  const audio = await env.MEDIA_BUCKET.get(row.voice_key, partial ? { range: { offset: start, length: end - start + 1 } } : void 0);
  if (!audio) return fail("Audio no encontrado.", 404, origin);
  const headers2 = {
    "content-type": row.voice_mime,
    "cache-control": "private,no-store",
    "x-content-type-options": "nosniff",
    "content-disposition": "inline",
    "access-control-allow-origin": origin || "https://havana-nice-v2.pages.dev",
    "vary": "Origin",
    "accept-ranges": "bytes",
    "content-length": String(partial ? end - start + 1 : row.voice_size),
    ...partial ? { "content-range": `bytes ${start}-${end}/${row.voice_size}` } : {}
  };
  return new Response(request.method === "HEAD" ? null : audio.body, { status: partial ? 206 : 200, headers: headers2 });
}
__name(readVoice, "readVoice");
async function handleStoryConversation(request, env, url, origin, verifySession2, ctx) {
  try {
    if (VOICE_PATH.test(url.pathname)) return readVoice(request, env, url, origin);
    const match = STORY_PATH.exec(url.pathname);
    if (!match) return fail("Ruta no encontrada.", 404, origin);
    const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const actor = await verifySession2(env, token);
    if (!actor) return fail("No autorizado.", 401, origin);
    const [, id, action] = match;
    if (!await visibleStory(env, id)) return fail("Estado no disponible.", 404, origin);
    if (action === "conversation" && request.method === "GET") return conversation(env, id, url, origin);
    if (action === "text" && request.method === "POST") return postText(request, env, actor, id, origin, ctx);
    if (action === "voice" && request.method === "POST") return postVoice(request, env, actor, id, origin, ctx);
    if (action === "reaction" && request.method === "POST") return postReaction(request, env, actor, id, origin, ctx);
    return fail("M\xE9todo no permitido.", 405, origin);
  } catch {
    return fail("Conversaci\xF3n temporalmente no disponible.", 503, origin);
  }
}
__name(handleStoryConversation, "handleStoryConversation");

// src/modules/stories/stories.js
var STORY_DURATION_MS = 24 * 60 * 60 * 1e3;
var GRANT_MAX_MS = 10 * 60 * 1e3;
var MAX_BYTES2 = 15e5;
var MAX_ACTIVE_PER_MEMBER = 12;
var PHOTO_PREFIX = "/api/stories/photo/";
var ID8 = /^[a-f0-9-]{36}$/i;
var respond = /* @__PURE__ */ __name((body2, status = 200, origin = "") => new Response(JSON.stringify(body2), {
  status,
  headers: {
    "content-type": "application/json;charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": origin || "https://havana-nice-v2.pages.dev",
    "vary": "Origin"
  }
}), "respond");
var photoResponse = /* @__PURE__ */ __name((stream, bytes, origin, head = false) => new Response(head ? null : stream, {
  status: 200,
  headers: {
    "content-type": "image/jpeg",
    "content-length": String(bytes),
    "cache-control": "private,no-store",
    "x-content-type-options": "nosniff",
    "content-disposition": "inline",
    "referrer-policy": "no-referrer",
    "access-control-allow-origin": origin || "https://havana-nice-v2.pages.dev",
    "vary": "Origin"
  }
}), "photoResponse");
async function readPhoto(request, env, url, origin) {
  if (!["GET", "HEAD"].includes(request.method)) return respond({ error: "M\xE9todo no permitido" }, 405, origin);
  const code = url.pathname.slice(PHOTO_PREFIX.length);
  if (!/^[a-f0-9]{32}$/.test(code)) return respond({ error: "Estado no encontrado" }, 404, origin);
  const row = await env.DB.prepare(
    "SELECT s.object_key FROM member_story_grants g JOIN member_stories s ON s.id=g.story_id JOIN chat_members m ON m.actor_id=s.actor_id AND m.active=1 WHERE g.token_hash=? AND g.expires_at>? AND s.expires_at>?"
  ).bind(await sha256Hex(code), Date.now(), Date.now()).first();
  if (!row) return respond({ error: "Estado caducado" }, 404, origin);
  const image = await env.MEDIA_BUCKET.get(row.object_key);
  if (!image) return respond({ error: "Estado no encontrado" }, 404, origin);
  return photoResponse(image.body, image.size, origin, request.method === "HEAD");
}
__name(readPhoto, "readPhoto");
async function listStories(env, url, origin, ctx) {
  const now = Date.now();
  const rows = (await env.DB.prepare(
    "SELECT s.id,s.actor_id,m.display_name,s.created_at,s.expires_at FROM member_stories s JOIN chat_members m ON m.actor_id=s.actor_id WHERE m.active=1 AND s.expires_at>? ORDER BY s.created_at ASC,s.id ASC LIMIT 200"
  ).bind(now).all()).results || [];
  const photos = await Promise.all(rows.map(async (row) => {
    const random = crypto.randomUUID().replace(/-/g, "");
    await env.DB.prepare(
      "INSERT INTO member_story_grants(token_hash,story_id,expires_at) VALUES(?,?,?)"
    ).bind(await sha256Hex(random), row.id, Math.min(now + GRANT_MAX_MS, row.expires_at)).run();
    return new URL(PHOTO_PREFIX + random, url.origin).toString();
  }));
  if (ctx?.waitUntil) ctx.waitUntil(cleanupExpiredStories(env, 25));
  return respond({ stories: rows.map((row, i) => ({
    id: row.id,
    actorId: row.actor_id,
    name: row.display_name,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    photoUrl: photos[i]
  })), serverNow: now }, 200, origin);
}
__name(listStories, "listStories");
async function uploadStory(request, env, actor, origin, ctx) {
  if ((request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase() !== "image/jpeg")
    return respond({ error: "Elige una fotograf\xEDa." }, 415, origin);
  const length = Number(request.headers.get("content-length"));
  if (request.headers.has("content-length") && (!Number.isSafeInteger(length) || length <= 0 || length > MAX_BYTES2))
    return respond({ error: "La imagen supera 1.5 MB." }, 413, origin);
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > MAX_BYTES2)
    return respond({ error: "La imagen debe pesar menos de 1.5 MB." }, 413, origin);
  const data = new Uint8Array(bytes);
  if (data.length < 4 || data[0] !== 255 || data[1] !== 216 || data[data.length - 2] !== 255 || data[data.length - 1] !== 217)
    return respond({ error: "El formato JPG no es v\xE1lido." }, 415, origin);
  const now = Date.now();
  const count = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM member_stories WHERE actor_id=? AND expires_at>?"
  ).bind(actor.actorId, now).first();
  if (Number(count?.n || 0) >= MAX_ACTIVE_PER_MEMBER)
    return respond({ error: "Puedes tener hasta 12 estados activos. Espera a que caduque uno." }, 409, origin);
  const id = crypto.randomUUID();
  const key = "stories/" + encodeURIComponent(actor.actorId) + "/" + id + ".jpg";
  try {
    await env.MEDIA_BUCKET.put(key, bytes, { httpMetadata: { contentType: "image/jpeg" } });
  } catch {
    return respond({ error: "No se pudo guardar la fotograf\xEDa del estado." }, 503, origin);
  }
  try {
    await env.DB.prepare(
      "INSERT INTO member_stories(id,actor_id,object_key,byte_size,created_at,expires_at) VALUES(?,?,?,?,?,?)"
    ).bind(id, actor.actorId, key, bytes.byteLength, now, now + STORY_DURATION_MS).run();
  } catch {
    await env.MEDIA_BUCKET.delete(key).catch(() => {
    });
    return respond({ error: "No se pudo publicar el estado." }, 503, origin);
  }
  if (ctx?.waitUntil) ctx.waitUntil(notifyFamilyClients(env));
  return respond({ ok: true, id, createdAt: now, expiresAt: now + STORY_DURATION_MS }, 201, origin);
}
__name(uploadStory, "uploadStory");
async function uploadStoryBatch(request, env, actor, origin, ctx) {
  const type = (request.headers.get("content-type") || "").toLowerCase();
  if (!type.startsWith("multipart/form-data;"))
    return respond({ error: "Selecciona entre 1 y 5 fotograf\xEDas." }, 415, origin);
  const declared = Number(request.headers.get("content-length"));
  if (request.headers.has("content-length") && (!Number.isSafeInteger(declared) || declared <= 0 || declared > 8e6))
    return respond({ error: "El lote supera el tama\xF1o permitido." }, 413, origin);
  let form;
  try {
    form = await request.formData();
  } catch {
    return respond({ error: "No se pudieron leer las fotograf\xEDas." }, 400, origin);
  }
  const files = form.getAll("photos");
  if (files.length < 1 || files.length > 5 || [...form.keys()].some((k) => k !== "photos"))
    return respond({ error: "Selecciona entre 1 y 5 fotograf\xEDas." }, 400, origin);
  const now = Date.now();
  const existing = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM member_stories WHERE actor_id=? AND expires_at>?"
  ).bind(actor.actorId, now).first();
  if (Number(existing?.n || 0) + files.length > MAX_ACTIVE_PER_MEMBER)
    return respond({ error: "El l\xEDmite es de 12 estados activos por integrante." }, 409, origin);
  const contents = [];
  for (const part of files) {
    if (!(part instanceof Blob) || part.type.toLowerCase() !== "image/jpeg" || part.size < 4 || part.size > MAX_BYTES2)
      return respond({ error: "Cada foto debe ser JPG y pesar menos de 1.5 MB." }, 415, origin);
    const bytes = await part.arrayBuffer(), head = new Uint8Array(bytes);
    if (head[0] !== 255 || head[1] !== 216 || head[head.length - 2] !== 255 || head[head.length - 1] !== 217)
      return respond({ error: "Una fotograf\xEDa JPG est\xE1 da\xF1ada." }, 415, origin);
    contents.push(bytes);
  }
  const records = contents.map((bytes, i) => {
    const id = crypto.randomUUID();
    return {
      id,
      actorId: actor.actorId,
      object_key: "stories/" + encodeURIComponent(actor.actorId) + "/" + id + ".jpg",
      byte_size: bytes.byteLength,
      createdAt: now + i,
      expiresAt: now + i + STORY_DURATION_MS,
      bytes
    };
  });
  const uploaded = [];
  try {
    for (const item of records) {
      await env.MEDIA_BUCKET.put(item.object_key, item.bytes, { httpMetadata: { contentType: "image/jpeg" } });
      uploaded.push(item);
    }
    await env.DB.batch(records.map((item) => env.DB.prepare(
      "INSERT INTO member_stories(id,actor_id,object_key,byte_size,created_at,expires_at) VALUES(?,?,?,?,?,?)"
    ).bind(item.id, item.actorId, item.object_key, item.byte_size, item.createdAt, item.expiresAt)));
  } catch {
    for (const item of uploaded) {
      try {
        await env.DB.prepare(
          "INSERT OR IGNORE INTO r2_member_delete_queue(object_key,actor_id,multipart_upload_id,size_bytes,queued_at) VALUES(?,?,NULL,?,?)"
        ).bind(item.object_key, item.actorId, item.byte_size, Date.now()).run();
      } catch {
      }
      await discardObject(env, item);
    }
    return respond({ error: "No se pudo publicar el lote completo. Ninguna foto se ha a\xF1adido." }, 503, origin);
  }
  if (ctx?.waitUntil) ctx.waitUntil(notifyFamilyClients(env));
  return respond({
    ok: true,
    count: records.length,
    ids: records.map((x) => x.id),
    expiresAt: records.map((x) => x.expiresAt)
  }, 201, origin);
}
__name(uploadStoryBatch, "uploadStoryBatch");
async function discardObject(env, row) {
  try {
    await env.MEDIA_BUCKET.delete(row.object_key);
    await env.DB.prepare("DELETE FROM r2_member_delete_queue WHERE object_key=?").bind(row.object_key).run();
  } catch {
  }
}
__name(discardObject, "discardObject");
async function retireStory(env, row, now) {
  const voices = (await env.DB.prepare(
    "SELECT voice_key AS object_key,actor_id,voice_size AS byte_size FROM member_story_comments WHERE story_id=? AND kind='voice'"
  ).bind(row.id).all()).results || [];
  await env.DB.batch([
    ...voices.map((voice) => env.DB.prepare(
      "INSERT OR IGNORE INTO r2_member_delete_queue(object_key,actor_id,multipart_upload_id,size_bytes,queued_at) VALUES(?,?,NULL,?,?)"
    ).bind(voice.object_key, voice.actor_id, voice.byte_size, now)),
    env.DB.prepare(
      "INSERT OR IGNORE INTO r2_member_delete_queue(object_key,actor_id,multipart_upload_id,size_bytes,queued_at) VALUES(?,?,NULL,?,?)"
    ).bind(row.object_key, row.actor_id, row.byte_size, now),
    env.DB.prepare("DELETE FROM member_stories WHERE id=?").bind(row.id)
  ]);
  for (const voice of voices) await discardObject(env, voice);
  await discardObject(env, row);
}
__name(retireStory, "retireStory");
async function cleanupExpiredStories(env, limit = 40) {
  if (!env.MEDIA_BUCKET || !env.DB) return { cleaned: 0 };
  const now = Date.now();
  const rows = (await env.DB.prepare(
    "SELECT id,actor_id,object_key,byte_size FROM member_stories WHERE expires_at<=? ORDER BY expires_at ASC LIMIT ?"
  ).bind(now, Math.min(Math.max(1, limit), 100)).all()).results || [];
  for (const row of rows) {
    try {
      await retireStory(env, row, now);
    } catch {
    }
  }
  const pending = (await env.DB.prepare(
    "SELECT object_key FROM r2_member_delete_queue WHERE object_key LIKE 'stories/%' ORDER BY queued_at ASC LIMIT 60"
  ).all()).results || [];
  for (const row of pending) await discardObject(env, row);
  await env.DB.prepare("DELETE FROM member_story_grants WHERE expires_at<=?").bind(now).run();
  await env.DB.prepare("DELETE FROM member_story_voice_grants WHERE expires_at<=?").bind(now).run();
  return { cleaned: rows.length };
}
__name(cleanupExpiredStories, "cleanupExpiredStories");
async function removeOwnStory(request, env, actor, url, origin, ctx) {
  const id = url.pathname.slice("/api/stories/me/".length);
  if (!ID8.test(id)) return respond({ error: "Estado no encontrado" }, 404, origin);
  const row = await env.DB.prepare(
    "SELECT id,actor_id,object_key,byte_size FROM member_stories WHERE id=? AND actor_id=?"
  ).bind(id, actor.actorId).first();
  if (!row) return respond({ error: "Estado no encontrado" }, 404, origin);
  try {
    await retireStory(env, row, Date.now());
  } catch {
    return respond({ error: "No se pudo eliminar el estado." }, 503, origin);
  }
  if (ctx?.waitUntil) ctx.waitUntil(notifyFamilyClients(env));
  return respond({ ok: true }, 200, origin);
}
__name(removeOwnStory, "removeOwnStory");
async function handleStoriesApi(request, env, url, origin, verifySession2, ctx) {
  if (!env.MEDIA_BUCKET) return respond({ error: "Estados no disponibles" }, 503, origin);
  try {
    if (url.pathname.startsWith(PHOTO_PREFIX))
      return readPhoto(request, env, url, origin);
    if (url.pathname.startsWith("/api/stories/voice/") || /^\/api\/stories\/[a-f0-9-]{36}\/(conversation|text|voice|reaction)$/i.test(url.pathname))
      return handleStoryConversation(request, env, url, origin, verifySession2, ctx);
    const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const actor = await verifySession2(env, token);
    if (!actor) return respond({ error: "No autorizado" }, 401, origin);
    if (url.pathname === "/api/stories/team" && request.method === "GET")
      return listStories(env, url, origin, ctx);
    if (url.pathname === "/api/stories/me/photo" && request.method === "PUT")
      return uploadStory(request, env, actor, origin, ctx);
    if (url.pathname === "/api/stories/me/batch" && request.method === "POST")
      return uploadStoryBatch(request, env, actor, origin, ctx);
    if (url.pathname.startsWith("/api/stories/me/") && request.method === "DELETE")
      return removeOwnStory(request, env, actor, url, origin, ctx);
    return respond({ error: "Ruta no encontrada" }, 404, origin);
  } catch {
    return respond({ error: "Estados no disponibles" }, 503, origin);
  }
}
__name(handleStoriesApi, "handleStoriesApi");

// src/modules/book/book.js
var MIMES = /* @__PURE__ */ new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
var MAX_BYTES3 = 15 * 1024 * 1024;
var MAX_PAGES = 80;
var MAX_OPTIMIZED_BYTES = 5 * 1024 * 1024;
var GRANT_MS3 = 10 * 60 * 1e3;
var ID9 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var TOKEN3 = /^[a-f0-9]{32}$/;
var MEDIA_ROUTE = "/api/book/media/";
var reply5 = /* @__PURE__ */ __name((body2, status = 200, origin = "") => new Response(JSON.stringify(body2), { status, headers: {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "access-control-allow-origin": origin || "https://havana-nice-v2.pages.dev",
  "vary": "Origin",
  "referrer-policy": "no-referrer"
} }), "reply");
var mediaHeader = /* @__PURE__ */ __name((origin) => ({
  "access-control-allow-origin": origin || "https://havana-nice-v2.pages.dev",
  "vary": "Origin",
  "referrer-policy": "no-referrer",
  "cache-control": "private, no-store",
  "x-content-type-options": "nosniff",
  "content-security-policy": "default-src 'none'; sandbox"
}), "mediaHeader");
async function cleanupBookQueue(env) {
  if (!env.MEDIA_BUCKET) return;
  const rows = (await env.DB.prepare("SELECT object_key FROM book_delete_queue ORDER BY queued_at LIMIT 20").all()).results || [];
  for (const row of rows) {
    try {
      await env.MEDIA_BUCKET.delete(row.object_key);
      await env.DB.prepare("DELETE FROM book_delete_queue WHERE object_key=?").bind(row.object_key).run();
    } catch {
    }
  }
}
__name(cleanupBookQueue, "cleanupBookQueue");
async function issueBookGrants(env, rows, admin, variant) {
  if (!rows.length) return [];
  const expiry = Date.now() + GRANT_MS3;
  const tokens = rows.map(() => crypto.randomUUID().replace(/-/g, ""));
  const hashes = await Promise.all(tokens.map(sha256Hex));
  await env.DB.batch(rows.map((row, i) => env.DB.prepare(
    "INSERT INTO book_media_grants(token_hash,page_id,admin_only,expires_at,variant) VALUES(?,?,?,?,?)"
  ).bind(
    hashes[i],
    row.id,
    admin ? 1 : 0,
    expiry,
    variant === "reader" && row.optimized_key ? "optimized" : "original"
  )));
  return tokens.map((t) => MEDIA_ROUTE + t);
}
__name(issueBookGrants, "issueBookGrants");
async function listBook(env, admin, origin) {
  await env.DB.prepare("DELETE FROM book_media_grants WHERE expires_at<=?").bind(Date.now()).run();
  const result = await env.DB.prepare(
    "SELECT id,mime_type,size_bytes,position,published,fit,created_at,optimized_key,optimized_size_bytes,optimized_width,optimized_height FROM book_pages " + (admin ? "" : "WHERE published=1 ") + "ORDER BY position ASC,created_at ASC,id ASC LIMIT ?"
  ).bind(MAX_PAGES).all();
  const rows = result.results || [];
  const grants = await issueBookGrants(env, rows, admin, "reader");
  const originals = admin ? await issueBookGrants(env, rows, true, "original") : [];
  return reply5({ section: "BOOK HAVANA NICE", pages: rows.map((row, i) => ({
    id: row.id,
    url: grants[i],
    fit: row.fit,
    position: row.position,
    published: !!row.published,
    ...admin ? {
      originalUrl: originals[i],
      sizeBytes: row.size_bytes,
      optimizedSizeBytes: row.optimized_key ? row.optimized_size_bytes : 0,
      optimizedWidth: row.optimized_width,
      optimizedHeight: row.optimized_height
    } : {}
  })) }, 200, origin);
}
__name(listBook, "listBook");
async function readBookGrant(request, env, url, origin) {
  if (request.method !== "GET" && request.method !== "HEAD") return reply5({ error: "M\xE9todo no permitido" }, 405, origin);
  const token = url.pathname.slice(MEDIA_ROUTE.length);
  if (!TOKEN3.test(token)) return reply5({ error: "Imagen no encontrada" }, 404, origin);
  const row = await env.DB.prepare(
    "SELECT p.object_key,p.mime_type,p.optimized_key,g.variant FROM book_media_grants g JOIN book_pages p ON p.id=g.page_id WHERE g.token_hash=? AND g.expires_at>? AND (p.published=1 OR g.admin_only=1)"
  ).bind(await sha256Hex(token), Date.now()).first();
  if (!row) return reply5({ error: "Enlace caducado o imagen no autorizada" }, 404, origin);
  if (!env.MEDIA_BUCKET) return reply5({ error: "Almacenamiento no disponible" }, 503, origin);
  const optimized = row.variant === "optimized" && !!row.optimized_key;
  let object = await env.MEDIA_BUCKET.get(optimized ? row.optimized_key : row.object_key);
  let mime = optimized ? "image/webp" : row.mime_type;
  if (!object && optimized) {
    object = await env.MEDIA_BUCKET.get(row.object_key);
    mime = row.mime_type;
  }
  if (!object) return reply5({ error: "Imagen no encontrada" }, 404, origin);
  const headers2 = new Headers(mediaHeader(origin));
  headers2.set("content-type", mime);
  headers2.set("content-length", String(object.size));
  return new Response(request.method === "HEAD" ? null : object.body, { status: 200, headers: headers2 });
}
__name(readBookGrant, "readBookGrant");
async function uploadBookPage(request, env, origin) {
  if (!env.MEDIA_BUCKET) return reply5({ error: "Almacenamiento no disponible" }, 503, origin);
  const mime = (request.headers.get("content-type") || "").split(";")[0].toLowerCase().trim();
  if (!MIMES.has(mime)) return reply5({ error: "Solo fotos JPG, PNG, WebP, HEIC o HEIF" }, 415, origin);
  const size = Number(request.headers.get("content-length"));
  if (!Number.isSafeInteger(size) || size <= 0) return reply5({ error: "Falta tama\xF1o del archivo" }, 411, origin);
  if (size > MAX_BYTES3) return reply5({ error: "Imagen demasiado grande (m\xE1ximo 15 MB)" }, 413, origin);
  if (!request.body) return reply5({ error: "Imagen vac\xEDa" }, 400, origin);
  const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM book_pages").first();
  if (Number(count?.total || 0) >= MAX_PAGES) return reply5({ error: "L\xEDmite de 80 p\xE1ginas alcanzado" }, 409, origin);
  const id = crypto.randomUUID(), key = "book/v2/" + id;
  const reservation = await reserveFamilyStorage(env, size, id);
  if (!reservation) return reply5({ error: "Espacio R2 insuficiente (protecci\xF3n 9.5 GB)" }, 409, origin);
  try {
    const object = await env.MEDIA_BUCKET.put(key, request.body, {
      httpMetadata: { contentType: mime },
      customMetadata: { module: "book-havana-nice-v2" }
    });
    if (!object || object.size !== size) {
      await env.MEDIA_BUCKET.delete(key).catch(() => {
      });
      return reply5({ error: "La imagen recibida no coincide con su tama\xF1o" }, 400, origin);
    }
    try {
      await env.DB.prepare(
        "INSERT INTO book_pages(id,object_key,mime_type,size_bytes,position,published,fit,created_at) VALUES(?,?,?,?,(SELECT COALESCE(MAX(position),0)+100 FROM book_pages),1,?,?)"
      ).bind(id, key, mime, size, "cover", (/* @__PURE__ */ new Date()).toISOString()).run();
    } catch (err) {
      try {
        await env.MEDIA_BUCKET.delete(key);
      } catch {
        await env.DB.prepare("INSERT OR IGNORE INTO book_delete_queue(object_key,size_bytes,queued_at) VALUES(?,?,?)").bind(key, size, (/* @__PURE__ */ new Date()).toISOString()).run();
      }
      throw err;
    }
    return reply5({ ok: true, id, published: true }, 201, origin);
  } catch {
    return reply5({ error: "No se pudo guardar la p\xE1gina privada" }, 503, origin);
  } finally {
    await releaseFamilyStorage(env, reservation);
  }
}
__name(uploadBookPage, "uploadBookPage");
async function uploadOptimizedBookPage(request, env, id, origin) {
  if (!env.MEDIA_BUCKET) return reply5({ error: "Almacenamiento no disponible" }, 503, origin);
  const page = await env.DB.prepare(
    "SELECT object_key,size_bytes,optimized_key,optimized_size_bytes FROM book_pages WHERE id=?"
  ).bind(id).first();
  if (!page) return reply5({ error: "P\xE1gina no encontrada" }, 404, origin);
  const mime = (request.headers.get("content-type") || "").split(";")[0].toLowerCase();
  const size = Number(request.headers.get("content-length"));
  const width = Number(request.headers.get("x-book-width"));
  const height = Number(request.headers.get("x-book-height"));
  if (mime !== "image/webp") return reply5({ error: "BOOK optimizado requiere WebP" }, 415, origin);
  if (!Number.isSafeInteger(size) || size < 100 || size > MAX_OPTIMIZED_BYTES)
    return reply5({ error: "Derivado WebP vac\xEDo o excesivo" }, 413, origin);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || Math.max(width, height) > 2200)
    return reply5({ error: "Dimensiones BOOK inv\xE1lidas" }, 400, origin);
  if (size >= Number(page.size_bytes) * 0.94)
    return reply5({ error: "La versi\xF3n optimizada debe ser menor al original" }, 409, origin);
  const payload2 = new Uint8Array(await request.arrayBuffer());
  if (payload2.length !== size || String.fromCharCode(...payload2.subarray(0, 4)) !== "RIFF" || String.fromCharCode(...payload2.subarray(8, 12)) !== "WEBP")
    return reply5({ error: "Archivo WebP inv\xE1lido" }, 415, origin);
  const key = "book/v2/optimized/" + id + "/" + crypto.randomUUID() + ".webp";
  const reservation = await reserveFamilyStorage(env, size, crypto.randomUUID());
  if (!reservation) return reply5({ error: "Protecci\xF3n R2: espacio insuficiente" }, 409, origin);
  let persisted = false;
  try {
    const stored = await env.MEDIA_BUCKET.put(key, payload2, {
      httpMetadata: { contentType: "image/webp" },
      customMetadata: { module: "book-havana-nice-v2", variant: "optimized" }
    });
    if (!stored || stored.size !== size) throw Error("Optimized R2 length mismatch");
    const old = page.optimized_key;
    const mutation = env.DB.prepare(
      "UPDATE book_pages SET optimized_key=?,optimized_size_bytes=?,optimized_width=?,optimized_height=? WHERE id=? AND object_key=? AND optimized_key IS ?"
    ).bind(key, size, width, height, id, page.object_key, old);
    const statements = [];
    if (old) statements.push(env.DB.prepare(
      "INSERT OR IGNORE INTO book_delete_queue(object_key,size_bytes,queued_at) VALUES(?,?,?)"
    ).bind(old, page.optimized_size_bytes, (/* @__PURE__ */ new Date()).toISOString()));
    statements.push(mutation);
    const changed = await env.DB.batch(statements);
    if (!Number(changed.at(-1)?.meta?.changes || 0))
      throw Error("BOOK page changed during optimization");
    persisted = true;
    if (old) await cleanupBookQueue(env);
    return reply5({ ok: true, optimizedSizeBytes: size, width, height }, 200, origin);
  } catch {
    if (!persisted) {
      try {
        await env.MEDIA_BUCKET.delete(key);
      } catch {
        await env.DB.prepare(
          "INSERT OR IGNORE INTO book_delete_queue(object_key,size_bytes,queued_at) VALUES(?,?,?)"
        ).bind(key, size, (/* @__PURE__ */ new Date()).toISOString()).run().catch(() => {
        });
      }
    }
    return reply5({ error: "No se pudo guardar el derivado; el original permanece intacto" }, 503, origin);
  } finally {
    await releaseFamilyStorage(env, reservation);
  }
}
__name(uploadOptimizedBookPage, "uploadOptimizedBookPage");
async function editBookPage(request, env, id, origin) {
  let payload2;
  try {
    payload2 = await request.json();
  } catch {
    return reply5({ error: "Datos inv\xE1lidos" }, 400, origin);
  }
  const fields2 = [], values = [];
  if (Object.hasOwn(payload2 || {}, "published")) {
    if (typeof payload2.published !== "boolean") return reply5({ error: "Publicaci\xF3n inv\xE1lida" }, 400, origin);
    fields2.push("published=?");
    values.push(payload2.published ? 1 : 0);
  }
  if (Object.hasOwn(payload2 || {}, "fit")) {
    if (!["cover", "contain"].includes(payload2.fit)) return reply5({ error: "Ajuste inv\xE1lido" }, 400, origin);
    fields2.push("fit=?");
    values.push(payload2.fit);
  }
  if (Object.hasOwn(payload2 || {}, "position")) {
    if (!Number.isInteger(payload2.position) || payload2.position < 0 || payload2.position > 1e6)
      return reply5({ error: "Orden inv\xE1lido" }, 400, origin);
    fields2.push("position=?");
    values.push(payload2.position);
  }
  if (!fields2.length) return reply5({ error: "Sin cambios" }, 400, origin);
  const result = await env.DB.prepare("UPDATE book_pages SET " + fields2.join(",") + " WHERE id=?").bind(...values, id).run();
  return Number(result.meta?.changes || 0) > 0 ? reply5({ ok: true }, 200, origin) : reply5({ error: "P\xE1gina no encontrada" }, 404, origin);
}
__name(editBookPage, "editBookPage");
async function deleteBookPage(env, id, origin) {
  const page = await env.DB.prepare("SELECT object_key,size_bytes,optimized_key,optimized_size_bytes FROM book_pages WHERE id=?").bind(id).first();
  if (!page) return reply5({ error: "P\xE1gina no encontrada" }, 404, origin);
  const tasks = [env.DB.prepare(
    "INSERT OR IGNORE INTO book_delete_queue(object_key,size_bytes,queued_at) VALUES(?,?,?)"
  ).bind(page.object_key, page.size_bytes, (/* @__PURE__ */ new Date()).toISOString())];
  if (page.optimized_key) tasks.push(env.DB.prepare(
    "INSERT OR IGNORE INTO book_delete_queue(object_key,size_bytes,queued_at) VALUES(?,?,?)"
  ).bind(page.optimized_key, page.optimized_size_bytes, (/* @__PURE__ */ new Date()).toISOString()));
  tasks.push(env.DB.prepare("DELETE FROM book_pages WHERE id=?").bind(id));
  await env.DB.batch(tasks);
  await cleanupBookQueue(env);
  return reply5({ ok: true }, 200, origin);
}
__name(deleteBookPage, "deleteBookPage");
async function handleBookApi(request, env, url, origin, verifyMember, ctx) {
  if (url.pathname.startsWith(MEDIA_ROUTE)) {
    try {
      return await readBookGrant(request, env, url, origin);
    } catch {
      return reply5({ error: "Imagen no disponible" }, 503, origin);
    }
  }
  const admin = url.pathname.startsWith("/api/book/admin/");
  const bearer = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (admin) {
    if (!await verifyAdminSession(request, env)) return reply5({ error: "No autorizado" }, 401, origin);
  } else if (!await verifyMember(env, bearer)) return reply5({ error: "No autorizado" }, 401, origin);
  try {
    if (url.pathname === (admin ? "/api/book/admin/pages" : "/api/book/pages") && request.method === "GET")
      return await listBook(env, admin, origin);
    if (!admin) return reply5({ error: "M\xE9todo no permitido" }, 405, origin);
    const signal = /* @__PURE__ */ __name(async (result) => {
      if (result.ok) {
        const task = notifyFamilyClients(env);
        if (ctx?.waitUntil) ctx.waitUntil(task);
        else void task;
      }
      return result;
    }, "signal");
    if (url.pathname === "/api/book/admin/pages" && request.method === "POST")
      return signal(await uploadBookPage(request, env, origin));
    const m = /^\/api\/book\/admin\/pages\/([0-9a-f-]{36})$/.exec(url.pathname);
    if (m && ID9.test(m[1])) {
      if (request.method === "PUT") return signal(await editBookPage(request, env, m[1], origin));
      if (request.method === "DELETE") return signal(await deleteBookPage(env, m[1], origin));
    }
    const optimized = /^\/api\/book\/admin\/pages\/([0-9a-f-]{36})\/optimized$/.exec(url.pathname);
    if (optimized && ID9.test(optimized[1]) && request.method === "POST")
      return signal(await uploadOptimizedBookPage(request, env, optimized[1], origin));
    return reply5({ error: "Ruta no encontrada" }, 404, origin);
  } catch {
    return reply5({ error: "BOOK HAVANA NICE temporalmente no disponible" }, 503, origin);
  }
}
__name(handleBookApi, "handleBookApi");

// src/modules/chat/chat-session.ts
async function verifySession(env, token) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{40,100}$/.test(token)) return null;
  try {
    const row = await env.DB.prepare(
      "SELECT s.actor_id, m.display_name, s.expires_at FROM chat_sessions s JOIN chat_members m ON m.actor_id=s.actor_id AND m.active=1 WHERE s.token_hash=? AND EXISTS (SELECT 1 FROM chat_single_device_owners owner WHERE owner.actor_id=m.actor_id AND owner.token_hash=s.token_hash)"
    ).bind(await sha256Hex(token)).first();
    if (!row || !Number.isFinite(row.expires_at) || row.expires_at <= Date.now()) return null;
    return { actorId: row.actor_id, displayName: row.display_name, exp: row.expires_at };
  } catch {
    return null;
  }
}
__name(verifySession, "verifySession");
function websocketSessionToken(request) {
  const protocols = request.headers.get("sec-websocket-protocol") || "";
  const offered = protocols.split(",").map((s) => s.trim());
  const browserToken = offered.find((s) => s.startsWith("session."));
  if (browserToken) return browserToken.slice(8);
  const auth = request.headers.get("authorization") || "";
  const match = /^Bearer ([A-Za-z0-9_-]{40,100})$/i.exec(auth);
  return match?.[1] || "";
}
__name(websocketSessionToken, "websocketSessionToken");
function mapMessage(row) {
  return { seq: row.seq, clientMessageId: row.client_message_id, senderId: row.sender_id, senderName: row.sender_name, text: row.deleted_at ? "" : row.body, sentAt: row.created_at, replyToSeq: row.reply_to_seq ?? null, editedAt: row.edited_at ?? null, deletedAt: row.deleted_at ?? null };
}
__name(mapMessage, "mapMessage");

// src/shared/worker-http.ts
function respond2(data, status = 200, origin = "") {
  return new Response(JSON.stringify(data), { status, headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": origin || "https://havana-nice-v2-dev.pages.dev",
    "vary": "Origin"
  } });
}
__name(respond2, "respond");

// src/modules/chat/chat-room.ts
var MAX_TEXT = 2e3;
var CHAT_EDIT_WINDOW_MS = 15 * 60 * 1e3;
var ChatRoom = class {
  static {
    __name(this, "ChatRoom");
  }
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sockets = /* @__PURE__ */ new Set();
    this.members = /* @__PURE__ */ new Map();
    this.typingSent = /* @__PURE__ */ new Map();
    this.adminSockets = /* @__PURE__ */ new Map();
    this.familySockets = /* @__PURE__ */ new Map();
  }
  async fetch(request) {
    if (new URL(request.url).pathname === "/health") return Response.json({ ok: true, durableObject: "ChatRoom", environment: this.env.HAVANA_ENV || "development" });
    if (new URL(request.url).pathname === "/member-removed" && request.method === "POST") {
      let data = null;
      try {
        data = await request.json();
      } catch {
      }
      if (typeof data?.actorId !== "string" || !/^member:[a-z0-9_-]{1,40}$/i.test(data.actorId))
        return respond2({ error: "Invalid member" }, 400);
      for (const [socket, member] of this.members.entries()) {
        if (member.actorId !== data.actorId) continue;
        this.send(socket, { type: "chat.revoked", error: "Tu acceso fue eliminado por el Administrador" });
        try {
          socket.close(4003, "Member removed");
        } catch {
        }
        this.sockets.delete(socket);
        this.members.delete(socket);
        this.typingSent.delete(socket);
      }
      for (const [socket, subscriber] of this.familySockets) {
        if (subscriber.actorId !== data.actorId) continue;
        this.send(socket, { type: "family.revoked" });
        try {
          socket.close(4003, "Member removed");
        } catch {
        }
        this.familySockets.delete(socket);
      }
      this.broadcast({ type: "chat.presence", users: this.onlineUsers() });
      await this.invalidateAdmins("members");
      await this.invalidateFamilyClients();
      return respond2({ ok: true }, 200);
    }
    if (new URL(request.url).pathname === "/installation-released" && request.method === "POST") {
      let data = null;
      try {
        data = await request.json();
      } catch {
      }
      if (typeof data?.actorId !== "string" || !/^member:[a-z0-9_-]{1,40}$/i.test(data.actorId))
        return respond2({ error: "Invalid member" }, 400);
      for (const [socket, member] of this.members.entries()) {
        if (member.actorId !== data.actorId) continue;
        this.send(socket, { type: "chat.revoked", error: "El Administrador liber\xF3 este dispositivo" });
        try {
          socket.close(4003, "Installation released");
        } catch {
        }
        this.sockets.delete(socket);
        this.members.delete(socket);
        this.typingSent.delete(socket);
      }
      for (const [socket, subscriber] of this.familySockets) {
        if (subscriber.actorId !== data.actorId) continue;
        this.send(socket, { type: "family.revoked" });
        try {
          socket.close(4003, "Installation released");
        } catch {
        }
        this.familySockets.delete(socket);
      }
      this.broadcast({ type: "chat.presence", users: this.onlineUsers() });
      return respond2({ ok: true });
    }
    if (new URL(request.url).pathname === "/chat-media-message-ready" && request.method === "POST") {
      let payload2 = null;
      try {
        payload2 = await request.json();
      } catch {
      }
      if (!Number.isSafeInteger(payload2?.seq) || Number(payload2?.seq) <= 0)
        return respond2({ error: "Invalid media message" }, 400);
      const row = await this.env.DB.prepare(
        "SELECT seq,client_message_id,sender_id,sender_name,body,created_at,reply_to_seq,edited_at,deleted_at FROM chat_messages WHERE seq=? AND deleted_at IS NULL"
      ).bind(payload2?.seq).first();
      if (!row) return respond2({ error: "Message not found" }, 404);
      const [message] = await decorateChatMessages(this.env, [mapMessage(row)]);
      if (!message?.media) return respond2({ error: "Media not confirmed" }, 409);
      this.broadcast({ type: "chat.message", message });
      return respond2({ ok: true });
    }
    if (new URL(request.url).pathname === "/admin-chat-message-deleted" && request.method === "POST") {
      let data = null;
      try {
        data = await request.json();
      } catch {
      }
      if (typeof data?.seq !== "number" || !Number.isSafeInteger(data.seq) || data.seq <= 0) return respond2({ error: "Invalid message" }, 400);
      const row = await this.env.DB.prepare("SELECT seq FROM chat_messages WHERE seq=?").bind(data.seq).first();
      if (row) return respond2({ error: "Message still exists" }, 409);
      this.broadcast({ type: "chat.deleted", seq: data.seq });
      return respond2({ ok: true });
    }
    if (new URL(request.url).pathname === "/admin-invalidate" && request.method === "POST") {
      let event2 = null;
      try {
        event2 = await request.json();
      } catch {
      }
      if (typeof event2?.topic !== "string" || !["requests", "members"].includes(event2.topic)) return respond2({ error: "Invalid topic" }, 400);
      await this.invalidateAdmins(event2.topic);
      return respond2({ ok: true }, 200);
    }
    if (new URL(request.url).pathname === "/family-invalidate" && request.method === "POST") {
      await this.invalidateFamilyClients();
      return respond2({ ok: true }, 200);
    }
    if (new URL(request.url).pathname === "/ws/family") {
      if ((request.headers.get("upgrade") || "").toLowerCase() !== "websocket")
        return respond2({ error: "WebSocket required" }, 426);
      const adminToken = adminSocketToken(request);
      const admin = !!adminToken && await verifyAdminSession(adminTokenRequest(adminToken), this.env);
      const memberToken = websocketSessionToken(request);
      const member = !admin && await verifySession(this.env, memberToken);
      const offered = (request.headers.get("sec-websocket-protocol") || "").split(",").map((x) => x.trim());
      if (!admin && !member) return respond2({ error: "Unauthorized" }, 401);
      if (!admin && !offered.includes("havana-v2-family")) return respond2({ error: "Invalid protocol" }, 400);
      const pair2 = new WebSocketPair();
      const client2 = pair2[0], server2 = pair2[1];
      server2.accept();
      this.familySockets.set(server2, {
        token: admin ? adminToken : memberToken,
        admin: !!admin,
        actorId: member ? member.actorId : null
      });
      this.send(server2, { type: "family.ready" });
      const cleanup4 = /* @__PURE__ */ __name(() => this.familySockets.delete(server2), "cleanup");
      server2.addEventListener("close", cleanup4);
      server2.addEventListener("error", cleanup4);
      return new Response(null, {
        status: 101,
        webSocket: client2,
        headers: { "Sec-WebSocket-Protocol": admin ? "havana-v2-admin" : "havana-v2-family" }
      });
    }
    if (new URL(request.url).pathname === "/ws/admin") {
      if ((request.headers.get("upgrade") || "").toLowerCase() !== "websocket")
        return respond2({ error: "WebSocket required" }, 426);
      const token = adminSocketToken(request);
      if (!token || !await verifyAdminSession(adminTokenRequest(token), this.env))
        return respond2({ error: "Unauthorized" }, 401);
      const pair2 = new WebSocketPair();
      const client2 = pair2[0], server2 = pair2[1];
      server2.accept();
      this.adminSockets.set(server2, token);
      this.send(server2, { type: "admin.ready" });
      this.send(server2, { type: "admin.chat.presence", users: this.onlineUsers() });
      const cleanup4 = /* @__PURE__ */ __name(() => this.adminSockets.delete(server2), "cleanup");
      server2.addEventListener("close", cleanup4);
      server2.addEventListener("error", cleanup4);
      return new Response(null, {
        status: 101,
        webSocket: client2,
        headers: { "Sec-WebSocket-Protocol": "havana-v2-admin" }
      });
    }
    if ((request.headers.get("upgrade") || "").toLowerCase() !== "websocket") return respond2({ error: "WebSocket required" }, 426);
    const session2 = await verifySession(this.env, websocketSessionToken(request));
    if (!session2) return respond2({ error: "Unauthorized" }, 401);
    const actorId = session2.actorId;
    const name = session2.displayName;
    const enrollmentToken = websocketSessionToken(request);
    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    server.accept();
    this.sockets.add(server);
    this.members.set(server, { actorId, name, enrollmentToken });
    const deviceDetails2 = readMemberDevice(request);
    await recordMemberEvent(this.env, actorId, "connect", request, deviceDetails2).catch(() => {
    });
    server.send(JSON.stringify({ type: "chat.ready", at: (/* @__PURE__ */ new Date()).toISOString(), users: this.onlineUsers() }));
    this.broadcast({ type: "chat.presence", users: this.onlineUsers() });
    void this.invalidateAdmins("members").catch(() => {
    });
    server.addEventListener("message", (event2) => {
      this.state.waitUntil((async () => {
        const stillAuthorized = await verifySession(this.env, enrollmentToken);
        if (!stillAuthorized) {
          this.send(server, { type: "chat.revoked", error: "Acceso revocado por administrador" });
          server.close(4003, "Access revoked");
          return;
        }
        await this.onMessage(server, actorId, name, event2.data);
      })().catch(() => {
        this.send(server, { type: "chat.error", error: "Delivery failed" });
      }));
    });
    let socketClosed = false;
    const cleanup3 = /* @__PURE__ */ __name(() => {
      if (socketClosed) return;
      socketClosed = true;
      this.state.waitUntil(recordMemberEvent(this.env, actorId, "disconnect", request, deviceDetails2).catch(() => {
      }));
      this.sockets.delete(server);
      this.members.delete(server);
      this.typingSent.delete(server);
      this.broadcast({ type: "chat.presence", users: this.onlineUsers() });
    }, "cleanup");
    server.addEventListener("close", cleanup3);
    server.addEventListener("error", cleanup3);
    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: { "Sec-WebSocket-Protocol": "havana-v2" }
    });
  }
  send(socket, data) {
    try {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data));
    } catch {
    }
  }
  broadcast(data) {
    for (const socket of this.sockets) this.send(socket, data);
    this.broadcastToAdmins(data);
  }
  broadcastToAdmins(data) {
    const types = {
      "chat.message": "admin.chat.message",
      "chat.updated": "admin.chat.updated",
      "chat.deleted": "admin.chat.deleted",
      "chat.reaction": "admin.chat.reaction",
      "chat.presence": "admin.chat.presence",
      "chat.typing": "admin.chat.typing",
      "chat.read": "admin.chat.read"
    };
    const type = types[data.type];
    if (!type) return;
    this.state.waitUntil((async () => {
      for (const [socket, token] of this.adminSockets) {
        if (!await verifyAdminSession(adminTokenRequest(token), this.env)) {
          try {
            socket.close(4003, "Admin session ended");
          } catch {
          }
          this.adminSockets.delete(socket);
          continue;
        }
        this.send(socket, { ...data, type });
      }
    })().catch(() => {
    }));
  }
  async invalidateAdmins(topic) {
    for (const [socket, token] of this.adminSockets) {
      if (!await verifyAdminSession(adminTokenRequest(token), this.env)) {
        try {
          socket.close(4003, "Admin session ended");
        } catch {
        }
        this.adminSockets.delete(socket);
        continue;
      }
      this.send(socket, { type: "admin.invalidate", topic });
    }
  }
  async invalidateFamilyClients() {
    for (const [socket, subscriber] of this.familySockets) {
      const authorized = subscriber.admin ? await verifyAdminSession(adminTokenRequest(subscriber.token), this.env) : await verifySession(this.env, subscriber.token);
      if (!authorized) {
        try {
          socket.close(4003, "Access revoked");
        } catch {
        }
        this.familySockets.delete(socket);
        continue;
      }
      this.send(socket, { type: "family.invalidate" });
    }
  }
  onlineUsers() {
    const users = /* @__PURE__ */ new Map();
    for (const member of this.members.values()) users.set(member.actorId, member.name);
    return [...users.entries()].map(([actorId, displayName]) => ({ actorId, displayName }));
  }
  async onMessage(socket, senderId, senderName, raw) {
    if (typeof raw !== "string" || raw.length > 1e4) return this.send(socket, { type: "chat.error", error: "Invalid message" });
    let input;
    try {
      input = JSON.parse(raw);
    } catch {
      return this.send(socket, { type: "chat.error", error: "Invalid JSON" });
    }
    if (input.type === "chat.typing") {
      const now = Date.now();
      if (typeof input.active !== "boolean" || now - (this.typingSent.get(socket) || 0) < 750) return;
      this.typingSent.set(socket, now);
      const signal = { type: "chat.typing", actorId: senderId, senderName, active: input.active, expiresAt: now + 4e3 };
      for (const other of this.sockets) if (other !== socket) this.send(other, signal);
      this.broadcastToAdmins(signal);
      return;
    }
    if (input.type === "chat.read") {
      if (!Number.isSafeInteger(input.seq) || input.seq < 1) return;
      const cap = await this.env.DB.prepare("SELECT MAX(seq) AS newest FROM chat_messages").first();
      const upto = Math.min(input.seq, Number(cap?.newest || 0));
      if (!upto) return;
      await this.env.DB.prepare(
        "INSERT INTO chat_read_receipts(actor_id,display_name,last_read_seq,updated_at) VALUES(?,?,?,?) ON CONFLICT(actor_id) DO UPDATE SET last_read_seq=MAX(chat_read_receipts.last_read_seq,excluded.last_read_seq), updated_at=excluded.updated_at"
      ).bind(senderId, senderName, upto, (/* @__PURE__ */ new Date()).toISOString()).run();
      this.broadcast({ type: "chat.read", actorId: senderId, displayName: senderName, seq: upto });
      return;
    }
    if (input.type === "chat.edit" || input.type === "chat.delete") {
      if (!Number.isSafeInteger(input.seq) || input.seq <= 0) {
        this.send(socket, { type: "chat.error", error: "Identificador inv\xE1lido" });
        return;
      }
      const own = await this.env.DB.prepare(
        "SELECT seq,sender_id,created_at,deleted_at FROM chat_messages WHERE seq=?"
      ).bind(input.seq).first();
      if (!own || own.sender_id !== senderId || own.deleted_at || Date.now() - Date.parse(own.created_at) > (input.type === "chat.delete" ? 48 * 60 * 60 * 1e3 : CHAT_EDIT_WINDOW_MS) || !Number.isFinite(Date.parse(own.created_at))) {
        this.send(socket, { type: "chat.error", error: "No puedes modificar este mensaje" });
        return;
      }
      const now = (/* @__PURE__ */ new Date()).toISOString();
      if (input.type === "chat.edit") {
        if (typeof input.text !== "string" || !input.text.trim() || input.text.trim().length > MAX_TEXT) {
          this.send(socket, { type: "chat.error", error: "Texto inv\xE1lido" });
          return;
        }
        await this.env.DB.prepare(
          "UPDATE chat_messages SET body=?,edited_at=? WHERE seq=? AND sender_id=? AND deleted_at IS NULL"
        ).bind(input.text.trim(), now, input.seq, senderId).run();
      } else {
        if (await deleteChatMessageRecord(this.env, input.seq))
          this.broadcast({ type: "chat.deleted", seq: input.seq });
        return;
      }
      const current = await this.env.DB.prepare(
        "SELECT seq,client_message_id,sender_id,sender_name,body,created_at,reply_to_seq,edited_at,deleted_at FROM chat_messages WHERE seq=?"
      ).bind(input.seq).first();
      if (current) this.broadcast({ type: "chat.updated", message: mapMessage(current) });
      return;
    }
    if (input.type === "chat.react") {
      if (!Number.isSafeInteger(input.messageSeq) || input.messageSeq < 1 || !["\u2764\uFE0F", "\u{1F602}", "\u{1F44D}"].includes(input.emoji)) {
        this.send(socket, { type: "chat.error", error: "Invalid reaction" });
        return;
      }
      const exists = await this.env.DB.prepare("SELECT seq FROM chat_messages WHERE seq = ? AND deleted_at IS NULL").bind(input.messageSeq).first();
      if (!exists) {
        this.send(socket, { type: "chat.error", error: "Message not found" });
        return;
      }
      const current = await this.env.DB.prepare("SELECT actor_id FROM chat_reactions WHERE message_seq=? AND actor_id=? AND emoji=?").bind(input.messageSeq, senderId, input.emoji).first();
      if (current) {
        await this.env.DB.prepare("DELETE FROM chat_reactions WHERE message_seq=? AND actor_id=? AND emoji=?").bind(input.messageSeq, senderId, input.emoji).run();
      } else {
        await this.env.DB.prepare("INSERT OR IGNORE INTO chat_reactions(message_seq,actor_id,emoji,created_at) VALUES (?,?,?,?)").bind(input.messageSeq, senderId, input.emoji, (/* @__PURE__ */ new Date()).toISOString()).run();
      }
      this.broadcast({ type: "chat.reaction", messageSeq: input.messageSeq, actorId: senderId, emoji: input.emoji, active: !current });
      return;
    }
    if (input.type !== "chat.send" || typeof input.clientMessageId !== "string" || !/^[A-Za-z0-9_-]{8,100}$/.test(input.clientMessageId) || typeof input.text !== "string") {
      return this.send(socket, { type: "chat.error", error: "Invalid message format" });
    }
    const text3 = input.text.trim();
    if (!text3 || text3.length > MAX_TEXT) return this.send(socket, { type: "chat.error", error: "Text length must be 1\u20132000" });
    const reply6 = input.replyToSeq === null || input.replyToSeq === void 0 ? null : input.replyToSeq;
    if (reply6 !== null) {
      if (!Number.isSafeInteger(reply6) || reply6 < 1) {
        this.send(socket, { type: "chat.error", error: "Invalid reply" });
        return;
      }
      const original = await this.env.DB.prepare("SELECT seq FROM chat_messages WHERE seq=? AND deleted_at IS NULL").bind(reply6).first();
      if (!original) {
        this.send(socket, { type: "chat.error", error: "Original message not found" });
        return;
      }
    }
    const result = await this.env.DB.prepare(
      "INSERT OR IGNORE INTO chat_messages (client_message_id, sender_id, sender_name, body, created_at, reply_to_seq) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(input.clientMessageId, senderId, senderName, text3, (/* @__PURE__ */ new Date()).toISOString(), reply6).run();
    const row = await this.env.DB.prepare(
      "SELECT seq, client_message_id, sender_id, sender_name, body, created_at, reply_to_seq, edited_at, deleted_at FROM chat_messages WHERE sender_id = ? AND client_message_id = ?"
    ).bind(senderId, input.clientMessageId).first();
    if (!row) throw new Error("Persistence failure");
    const event2 = { type: "chat.message", message: mapMessage(row) };
    if (result.meta?.changes > 0) this.broadcast(event2);
    else this.send(socket, event2);
  }
};

// src/index.ts
var ROOM5 = "main-chat-v2";
var MAX_HISTORY2 = 100;
function trustedOrigin(origin) {
  if (!origin) return "";
  try {
    const url = new URL(origin);
    if (url.protocol === "https:" && (url.hostname === "havana-nice-v2.pages.dev" || url.hostname.endsWith(".havana-nice-v2.pages.dev") || url.hostname === "havana-nice-v2-dev.pages.dev" || url.hostname.endsWith(".havana-nice-v2-dev.pages.dev"))) return origin;
    if (url.protocol === "https:" && url.hostname === "havana-nice-v2-dev.soloaplicaciones97.workers.dev") return origin;
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return origin;
  } catch {
  }
  return "";
}
__name(trustedOrigin, "trustedOrigin");
function b64(bytes) {
  return btoa(String.fromCharCode(...bytes)).split("+").join("-").split("/").join("_").replace(/=+$/, "");
}
__name(b64, "b64");
var MEMBER_SESSION_EXPIRY = Date.UTC(2100, 0, 1);
function normalizeMusicianName(value) {
  if (typeof value !== "string") return "";
  const name = value.trim().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ");
  return /^[a-z][a-z0-9 _-]{0,27}$/.test(name) ? name : "";
}
__name(normalizeMusicianName, "normalizeMusicianName");
async function createSession(env, member, request) {
  const token = b64(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256Hex(token);
  const claimed = await claimFirstInstallation(env, member, tokenHash, MEMBER_SESSION_EXPIRY);
  if (!claimed) {
    await auditDuplicateInstallation(env, member.actor_id, request);
    return null;
  }
  await recordMemberEvent(env, member.actor_id, "login", request).catch(() => {
  });
  return { token, actorId: member.actor_id, displayName: member.display_name, expiresAt: new Date(MEMBER_SESSION_EXPIRY).toISOString() };
}
__name(createSession, "createSession");
var index_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = trustedOrigin(request.headers.get("origin"));
    if (request.headers.has("origin") && !origin) return respond2({ error: "Origin not allowed" }, 403);
    if (request.method === "OPTIONS") return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": origin || "https://havana-nice-v2-dev.pages.dev",
        "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
        "access-control-allow-headers": "Authorization, Content-Type, Range, X-Havana-V2-Offset, X-Havana-V2-Upload-ID, X-Book-Width, X-Book-Height, X-Audio-Title, X-Audio-Artist, X-Audio-Album",
        "access-control-max-age": "3600",
        "vary": "Origin"
      }
    });
    if (url.pathname === "/health") {
      let row = null, database = "error";
      try {
        row = await env.DB.prepare("SELECT value FROM system_meta WHERE key = ?").bind("schema_version").first();
        database = "ok";
      } catch {
      }
      return respond2({ ok: database === "ok", app: "havana-nice-v2", environment: env.HAVANA_ENV || "development", database, schemaVersion: row?.value ?? null, realtime: "configured", media: "private-r2-chat-and-family", chat: "authorized-members-persistent-device-sessions-realtime" }, database === "ok" ? 200 : 503, origin);
    }
    if (url.pathname === "/ws/family") {
      if ((request.headers.get("upgrade") || "").toLowerCase() !== "websocket")
        return respond2({ error: "Upgrade required" }, 426, origin);
      const adminToken = adminSocketToken(request);
      const admin = !!adminToken && await verifyAdminSession(adminTokenRequest(adminToken), env);
      const protocols = (request.headers.get("sec-websocket-protocol") || "").split(",").map((x) => x.trim());
      const memberToken = websocketSessionToken(request);
      const member = !admin && protocols.includes("havana-v2-family") && await verifySession(env, memberToken);
      if (!admin && !member) return respond2({ error: "No autorizado" }, 401, origin);
      return env.CHAT_ROOMS.get(env.CHAT_ROOMS.idFromName(ROOM5)).fetch(request);
    }
    if (url.pathname === "/ws/calendar") {
      if (!request.headers.get("origin") || !origin) return respond2({ error: "Origin not allowed" }, 403, origin);
      if ((request.headers.get("upgrade") || "").toLowerCase() !== "websocket")
        return respond2({ error: "Upgrade required" }, 426, origin);
      const identity = calendarSocketIdentity(request);
      if (!await calendarSocketAuthorized(env, identity))
        return respond2({ error: "No autorizado" }, 401, origin);
      return env.CALENDAR_ROOMS.get(env.CALENDAR_ROOMS.idFromName("calendar-v2")).fetch(request);
    }
    if (url.pathname.startsWith("/api/calendar/photo/") || /^\/api\/calendar\/(?:admin\/)?events\/[0-9a-f-]{36}\/photos(?:\/|$)/.test(url.pathname))
      return handleCalendarMemories(request, env, url, origin, verifySession);
    if (url.pathname.startsWith("/api/calendar/"))
      return handleCalendarApi(request, env, url, origin, respond2, verifySession);
    if (url.pathname.startsWith("/api/repertoire/")) {
      const response2 = await handleRepertoireApi(request, env, url, origin, respond2, verifySession);
      if (request.method !== "GET" && url.pathname.startsWith("/api/repertoire/admin/") && response2.ok)
        ctx.waitUntil(notifyRepertoireClients(env));
      return response2;
    }
    if (url.pathname.startsWith("/api/book/"))
      return handleBookApi(request, env, url, origin, verifySession, ctx);
    if (url.pathname.startsWith("/api/profile/"))
      return handleProfileApi(request, env, url, origin, verifySession, ctx);
    if (url.pathname === "/api/notices" || url.pathname === "/api/notices/read")
      return handleMemberNotices(request, env, url, origin, verifySession);
    if (url.pathname.startsWith("/api/stories/"))
      return handleStoriesApi(request, env, url, origin, verifySession, ctx);
    if (url.pathname.startsWith("/api/audio/"))
      return handleAudioApi(request, env, url, origin, verifySession, ctx);
    if (url.pathname.startsWith("/api/family/"))
      return handleFamilyApi(request, env, url, origin, respond2, verifySession, ctx);
    if (url.pathname.startsWith("/api/chat/media/")) {
      const match = /^\/api\/chat\/media\/([0-9a-f-]{36})\/(file|poster)$/.exec(url.pathname);
      if (match && request.method === "GET") return readChatMedia(request, env, match[1], url, origin, match[2] === "poster");
      const member = await verifySession(env, (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""));
      const admin = !member && await verifyAdminSession(request, env);
      if (!member && !admin) return respond2({ error: "No autorizado" }, 401, origin);
      const identity = member ? { actorId: member.actorId, displayName: member.displayName } : null;
      if (!identity && url.pathname.endsWith("/grant") && request.method === "GET")
        return handleChatMedia(request, env, url, origin, null);
      if (!identity && url.pathname === "/api/chat/media/status" && request.method === "GET")
        return handleChatMedia(request, env, url, origin, null);
      if (!identity) return respond2({ error: "Solo los m\xFAsicos pueden enviar archivos" }, 403, origin);
      return handleChatMedia(request, env, url, origin, identity);
    }
    if (url.pathname === "/realtime/health") return env.CHAT_ROOMS.get(env.CHAT_ROOMS.idFromName("foundation-health")).fetch("https://internal/health");
    if (url.pathname === "/api/chat/admin/member-history" || url.pathname === "/api/chat/admin/member-delete-preview" || url.pathname === "/api/chat/admin/remove-member" || url.pathname === "/api/chat/admin/member-media-cleanup") {
      return handleAdminMemberManagement(request, env, url, origin, respond2, ROOM5);
    }
    if (url.pathname.startsWith("/api/chat/admin/duplicate-logins") || url.pathname === "/api/chat/admin/release-installation") {
      return handleSingleInstallationAdmin(request, env, url, origin, respond2);
    }
    if (url.pathname === "/api/chat/admin/messages" || url.pathname.startsWith("/api/chat/admin/messages/")) {
      return handleAdminChat(request, env, url, origin, respond2);
    }
    if (url.pathname === "/api/chat/admin/members") {
      if (request.method !== "GET" && request.method !== "POST") return respond2({ error: "M\xE9todo no permitido" }, 405, origin);
      if (!await verifyAdminSession(request, env)) return respond2({ error: "No autorizado" }, 401, origin);
      if (request.method === "POST") {
        let payload2;
        try {
          payload2 = await request.json();
        } catch {
          return respond2({ error: "Solicitud inv\xE1lida" }, 400, origin);
        }
        const displayName = typeof payload2?.displayName === "string" ? payload2.displayName.normalize("NFC").trim().replace(/\s+/g, " ") : "";
        const username = normalizeMusicianName(displayName);
        if (!username || displayName.length > 28) return respond2({
          error: "Escribe un nombre v\xE1lido de hasta 28 caracteres. Se permiten espacios y acentos."
        }, 400, origin);
        const actorId = "member:" + crypto.randomUUID();
        const created = await env.DB.prepare(
          "INSERT OR IGNORE INTO chat_members(username,actor_id,display_name,active) VALUES(?,?,?,1)"
        ).bind(username, actorId, displayName).run();
        if (Number(created.meta?.changes) !== 1) return respond2({ error: "Este nombre ya existe en el Administrador." }, 409, origin);
        await notifyAdminClients(env, "members");
        ctx.waitUntil(notifyFamilyClients(env));
        return respond2({ member: { actor_id: actorId, username, display_name: displayName, active: 1, session_count: 0, installation_bound: 0 } }, 201, origin);
      }
      const members = await env.DB.prepare(
        "SELECT m.actor_id,m.display_name,m.username,m.active,MAX(CASE WHEN owner.actor_id IS NOT NULL THEN 1 ELSE 0 END) AS installation_bound,COUNT(s.token_hash) AS session_count FROM chat_members m LEFT JOIN chat_sessions s ON s.actor_id=m.actor_id AND s.expires_at>? LEFT JOIN chat_single_device_owners owner ON owner.actor_id=m.actor_id GROUP BY m.actor_id,m.display_name,m.username,m.active ORDER BY m.display_name"
      ).bind(Date.now()).all();
      return respond2({ members: members.results || [] }, 200, origin);
    }
    if (url.pathname === "/api/chat/admin/storage/summary")
      return handleAdminStorageSummary(request, env, url, origin, respond2);
    if (url.pathname.startsWith("/api/chat/admin/auth/device/"))
      return handleAdminTrustedDevice(request, env, url, origin, respond2);
    if (url.pathname.startsWith("/api/chat/admin/auth/")) {
      return handleAdminSessionApi(request, env, url, origin, respond2);
    }
    if (url.pathname === "/api/chat/session" && request.method === "POST") {
      let payload2;
      try {
        payload2 = await request.json();
      } catch {
        return respond2({ error: "Solicitud inv\xE1lida" }, 400, origin);
      }
      const username = normalizeMusicianName(payload2?.displayName);
      if (!username) return respond2({ error: "Escribe tu nombre para entrar" }, 400, origin);
      const member = await env.DB.prepare(
        "SELECT username,actor_id,display_name FROM chat_members WHERE username=? AND active=1"
      ).bind(username).first();
      if (!member) return respond2({ error: "Tu nombre todav\xEDa no est\xE1 autorizado. Solicita acceso al administrador." }, 403, origin);
      const session2 = await createSession(env, member, request);
      if (!session2) return respond2({
        code: "name_already_bound",
        error: "Este nombre ya est\xE1 vinculado a otro dispositivo. Se notific\xF3 al Administrador."
      }, 409, origin);
      return respond2(session2, 200, origin);
    }
    if (url.pathname === "/api/chat/session" && request.method === "GET") {
      const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
      const valid = await verifySession(env, token);
      if (!valid) return respond2({ error: "Acceso revocado o no autorizado" }, 401, origin);
      return respond2({ token, actorId: valid.actorId, displayName: valid.displayName, expiresAt: new Date(valid.exp).toISOString() }, 200, origin);
    }
    if (url.pathname === "/api/chat/messages" && request.method === "GET") {
      const session2 = await verifySession(env, (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""));
      if (!session2) return respond2({ error: "Acceso revocado o sesi\xF3n no autorizada" }, 401, origin);
      const before = url.searchParams.get("beforeSeq");
      const earlier = before === null ? null : Number(before);
      if (earlier !== null && (!Number.isSafeInteger(earlier) || earlier < 1)) return respond2({ error: "Invalid beforeSeq" }, 400, origin);
      const search = url.searchParams.get("search");
      if (search !== null && (search.trim().length < 2 || search.length > 80)) return respond2({ error: "Search must contain 2\u201380 characters" }, 400, origin);
      if (search !== null) {
        const needle = "%" + search.trim().replace(/[\\%_]/g, (x) => "\\" + x) + "%";
        const result = await env.DB.prepare(
          "SELECT seq,client_message_id,sender_id,sender_name,body,created_at,reply_to_seq,edited_at,deleted_at FROM chat_messages WHERE deleted_at IS NULL AND body LIKE ? ESCAPE '\\' ORDER BY seq DESC LIMIT 60"
        ).bind(needle).all();
        return respond2({ messages: await decorateChatMessages(env, (result.results || []).map(mapMessage).reverse()), hasMore: false, reactions: [] }, 200, origin);
      }
      const after = url.searchParams.get("afterSeq");
      const seq = after === null ? null : Number(after);
      if (seq !== null && (!Number.isSafeInteger(seq) || seq < 0)) return respond2({ error: "Invalid cursor" }, 400, origin);
      if (seq !== null && earlier !== null) return respond2({ error: "Incompatible cursors" }, 400, origin);
      const query = earlier !== null ? env.DB.prepare("SELECT seq,client_message_id,sender_id,sender_name,body,created_at,reply_to_seq,edited_at,deleted_at FROM chat_messages WHERE seq < ? AND deleted_at IS NULL ORDER BY seq DESC LIMIT ?").bind(earlier, MAX_HISTORY2) : seq === null ? env.DB.prepare("SELECT seq,client_message_id,sender_id,sender_name,body,created_at,reply_to_seq,edited_at,deleted_at FROM chat_messages WHERE deleted_at IS NULL ORDER BY seq DESC LIMIT ?").bind(MAX_HISTORY2) : env.DB.prepare("SELECT seq,client_message_id,sender_id,sender_name,body,created_at,reply_to_seq,edited_at,deleted_at FROM chat_messages WHERE seq > ? AND deleted_at IS NULL ORDER BY seq ASC LIMIT ?").bind(seq, MAX_HISTORY2);
      const rows = (await query.all()).results || [];
      if (seq === null || earlier !== null) rows.reverse();
      const messageSeqs = rows.map((row) => row.seq);
      let reactions = [];
      if (messageSeqs.length) {
        const placeholders = messageSeqs.map(() => "?").join(",");
        const query2 = await env.DB.prepare("SELECT message_seq, actor_id, emoji FROM chat_reactions WHERE message_seq IN (" + placeholders + ")").bind(...messageSeqs).all();
        reactions = query2.results || [];
      }
      const receipts = await env.DB.prepare("SELECT actor_id,display_name,last_read_seq FROM chat_read_receipts WHERE updated_at > ? LIMIT 100").bind(new Date(Date.now() - 7 * 864e5).toISOString()).all();
      return respond2({
        messages: await decorateChatMessages(env, rows.map(mapMessage)),
        reactions: reactions.map((r) => ({ messageSeq: r.message_seq, actorId: r.actor_id, emoji: r.emoji })),
        receipts: (receipts.results || []).map((r) => ({ actorId: r.actor_id, displayName: r.display_name, seq: r.last_read_seq })),
        hasMore: rows.length === MAX_HISTORY2
      }, 200, origin);
    }
    if (url.pathname === "/ws/admin") {
      const rawOrigin = request.headers.get("origin");
      if (!rawOrigin || !origin) return respond2({ error: "Origin not allowed" }, 403, origin);
      if ((request.headers.get("upgrade") || "").toLowerCase() !== "websocket")
        return respond2({ error: "Upgrade required" }, 426, origin);
      const token = adminSocketToken(request);
      if (!token || !await verifyAdminSession(adminTokenRequest(token), env))
        return respond2({ error: "No autorizado" }, 401, origin);
      return env.CHAT_ROOMS.get(env.CHAT_ROOMS.idFromName(ROOM5)).fetch(request);
    }
    if (url.pathname === "/ws") {
      const session2 = await verifySession(env, websocketSessionToken(request));
      if (!session2) return respond2({ error: "Unauthorized" }, 401, origin);
      if ((request.headers.get("upgrade") || "").toLowerCase() !== "websocket") return respond2({ error: "Upgrade required" }, 426, origin);
      return env.CHAT_ROOMS.get(env.CHAT_ROOMS.idFromName(ROOM5)).fetch(request);
    }
    return respond2({ error: "Not found" }, 404, origin);
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(cleanupExpiredStories(env, 80));
  }
};
export {
  CalendarRoom,
  ChatRoom,
  index_default as default
};
//# sourceMappingURL=index.js.map
