# Technical Decisions

This file records durable technical and architectural decisions.

Only record decisions that are important enough to influence future development.

For each decision, use the following structure:

# [Decision Title]

Status: Accepted

## Context

Why this decision was necessary.

## Decision

What was decided.

## Reasoning

Why this approach was chosen over relevant alternatives.

## Consequences

Important trade-offs, limitations, or implications.

---

# Poll-based ingestion instead of webhooks

Status: Accepted

## Context

Thirdwave only exposes a pull endpoint (`GET /api/v1/traffic`) with a 30 req/min
limit per key. There is no inbound event mechanism.

## Decision

Poll every active key every 5 s (`pollIntervalMs`), requesting up to 50 recent
items, and treat the database as the deduplication ledger.

## Reasoning

5 s × 50 items gives wide headroom under the 30 req/min limit while keeping
latency low. Fetching a window (not just the newest item) tolerates missed ticks.

## Consequences

- Delivery latency is bounded by the poll interval.
- Duplicates are only prevented by `otp_logs` `UNIQUE (api_key_id, fingerprint)`,
  so new keys do backfill the 20–50 most recent messages on first poll.
- Rate limiting is naturally avoided by one request per key per tick.

---

# Dynamic API keys stored in the database

Status: Accepted

## Context

Admins must add an arbitrary number of Thirdwave API keys at runtime through the bot.
The key the bot uses to call `GET /api/v1/traffic` **must be the key issued by Thirdwave**
— the `api_key` request parameter is the Thirdwave credential itself, so the bot cannot
invent its own token.

## Decision

Store the Thirdwave API key verbatim in `api_keys.token` (`UNIQUE`). `label` is only a
human-friendly name chosen by the admin so keys can be told apart in the panel.

Adding a key is a two-step flow: send the Thirdwave key first, then a label.

```
1) panels prompt: "Kirim API key dari dashboard thirdwave.im"
2) submitApiKey: reject if empty/contains whitespace, reject when maxKeys reached,
   then call verifyApiKey() which hits GET /api/v1/traffic?api_key=…&limit=1
3) verifyApiKey: 401 -> "key tidak valid", 403 -> "akses API belum aktif",
   429 -> treated as ok (key exists, just throttled), network/5xx -> error message
4) only on ok: session becomes `keyLabel` with pendingToken
5) submitKeyLabel: stores {label, token}; duplicate token rejected ("sudah terdaftar")
```

There is **no** key rotation. Rotating a Thirdwave key is an action taken at Thirdwave,
not something the bot can perform, and a self-generated token is useless. Admins delete
the stale row and add the new key instead.

## Reasoning

A locally generated token is never accepted by Thirdwave, so it would make the bot poll
with a credential the API rejects. Validating on entry turns a silent runtime failure
(401 on every tick) into immediate feedback at the moment the key is added.

## Consequences

- `createApiKey(client, label, token)` takes the token; the bot never generates tokens.
- Key deletion is `ON DELETE RESTRICT` while rows exist in `otp_logs`.
- Validation costs one live API call per key addition (limit=1, negligible quota).

---

# MarkdownV2 rendering with legacy Markdown fallback

Status: Accepted

## Context

OTP text is untrusted input containing characters meaningful to Telegram markup.
MarkdownV2 supports `code` blocks and spoilers for a tidy OTP message.

## Decision

Escape all dynamic fields for MarkdownV2, and if Telegram rejects the message with
`can't parse entities`, resend the same content rendered for legacy `Markdown`.

## Reasoning

MarkdownV2 gives the cleanest output; the fallback guarantees delivery instead of
losing an OTP because of an escaping edge case.

## Consequences

- Two render paths exist and must be kept in sync (`formatLogMessage`).
- Both paths are covered by unit tests.

---

# Reply keyboard for menus, inline keyboards for actions

Status: Accepted

## Context

The user requires menu navigation via a reply keyboard while channel and OTP log messages
need buttons, and explicitly asked to remove emoji clutter from the panel.

## Decision

The persistent reply keyboard (`adminReplyKeyboard`) is the only menu navigation:
`Home`, `API Keys`, `Log Channels`, `Numbers`. Inline keyboards are used exclusively for
in-screen actions (add, toggle, delete, rotate, pagination, back) and on log messages.

## Reasoning

Matches the explicit requirement. The Bot API exposes a `style` field
(`danger`/`success`/`primary`) on both inline and reply keyboard buttons in this grammY
version, so color is conveyed by `style` instead of emoji prefixes. Labels stay plain
text (`Tambah`, not `➕ Tambah`).

## Consequences

- The OTP log message uses a `Copy OTP` button with `copy_text` (`style: "danger"`) above
  a `Numbers` link button (`style: "primary"`).
- Admin handlers must ignore the reply-keyboard texts before consuming free-text input.
- `adminReplyKeyboard` is typed as `ReplyKeyboardMarkup`; an untyped object literal widens
  `style` to `string` and fails `tsc`.

---

# Multiple log channels with an ON/OFF toggle, no primary

Status: Accepted (supersedes the earlier "one primary" decision)

## Context

Logs must fan out to more than one channel, channels may be forum topics, and an admin
must be able to stop delivery to one channel without deleting it. The earlier design had
a `is_primary` column that drove the OTP button URL; with a separate Numbers channel that
selection became meaningless.

## Decision

`log_channels` and `number_channels` hold delivery targets `(chat_id, thread_id, title,
is_active)`. There is no primary. Delivery fans out to every active `log_channels` row, and
the OTP `Numbers` button points at the first active `number_channels` row in creation order.

## Reasoning

Toggle covers the real operational need (pause a channel) without a second concept.
Ordering (`created_at ASC`) makes "first active" deterministic and predictable, so an
explicit primary column would only duplicate state.

## Consequences

- `is_primary` and its partial unique index were dropped by `ALTER TABLE … DROP COLUMN`.
  The column is not restored; any old primary data is intentionally discarded.
- The button URL is "first active numbers channel", not an explicit choice. Reordering is
  done by toggling, not by reordering rows.
- Buttons on already-sent messages keep their URL; toggling only affects new messages.

---

# Channel kinds share one db module

Status: Accepted

## Context

`log_channels` and `number_channels` are structurally identical (target + title + toggle)
and differ only in what they feed. Two copies of the CRUD code would drift.

## Decision

`db/channels.ts` exposes `ChannelKind = "log" | "number"` and maps the kind to a table
name. The same functions serve both kinds.

## Reasoning

One implementation with a validated kind is smaller than two near-identical modules and
avoids a table-name parameter crossing a trust boundary untyped. The table name is never
derived from user input; `isChannelKind` validates callback data first.

## Consequences

- Adding a third kind is a one-line table map entry plus a menu button.
- The table name is interpolated into SQL, which is only acceptable because it comes from
  the `tableFor` constant map and never from a request.
- `number_channels` carries extra `label`/`position` columns, so callers there use
  `listNumberChannels` / `findNumberChannel` / `addNumberChannel`.

---

# Numbers are two fixed slots with a label

Status: Accepted (revised: button-only, never delivery targets)

## Context

The OTP message shows up to two channel buttons side by side under the code. The admin
must be able to name each button and choose which one sits on the left. An earlier
revision also delivered OTP messages into these channels, which is wrong: they are
navigation destinations for readers, not log sinks.

## Decision

`number_channels` (menu label **Set Channel**) is button-only. It holds at most two rows
(`maxNumberChannels = 2`) with a `label` used as the button text and a `position`
(0 left, 1 right). `addNumberChannel` locks the table and refuses a third row.
`swapNumberChannelPositions` reverses the positions so left and right can be exchanged.

Delivery never reads this table. `LogDelivery.listTargets()` reads `log_channels` only;
`numberButtons()` reads `number_channels` only. The panel reflects the split: Set Channel
has no ON/OFF toggle and no `Test kirim`, only `Tukar posisi` and a `Cek tombol` alert.

## Reasoning

Two separate tables make the separation structural rather than a runtime filter. Tying
delivery to a flag on the same table would let a single toggle leak OTPs into a chat that
is only meant to be a link target.

## Consequences

- `is_active` still exists on `number_channels` for schema symmetry but is unused;
  `setChannelActive` throws for this kind.
- An earlier revision delivered to `number_channels` when toggled on. If such a row was
  toggled ON, it is now ignored — no cleanup query is needed.
- Swapping only affects new messages; buttons on messages already sent keep their URL.
- Labels are admin-supplied, so they are length-checked (`maxLabelLength`) like key names.

---

# Topic links are parsed explicitly, never guessed

Status: Accepted

## Context

Admins paste links like `https://t.me/c/4435318978/183`. The trailing `183` is the topic
(message thread) ID. Sending a topic message without `message_thread_id` lands in the
channel's general feed — a silent misroute.

## Decision

`parseChannelLink` converts such links to `chat_id = -100<first-id>` and
`thread_id = <last-id>`. Malformed topic links are rejected with an error instead of being
silently treated as a whole channel. Forum support is validated with `getChat().is_forum`
and a `sendChatAction(..., { message_thread_id })` probe before saving.

## Reasoning

Rejecting on doubt is safer than delivering OTPs to the wrong topic. The probe is the
only way to confirm the topic exists without posting a real message.

## Consequences

- Topic links only work for forum supergroups; regular channels reject a topic ID.
- Each added topic costs one extra API call.
