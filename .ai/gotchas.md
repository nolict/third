# Gotchas

This file contains durable, non-obvious project-specific issues and constraints.

Record things that future developers or AI agents are likely to get wrong without this knowledge.

---

## The `api_keys.token` must be the Thirdwave key, never generated locally

`GET /api/v1/traffic` authenticates with `?api_key=…`, so that value is the Thirdwave
credential. A `randomBytes().toString("base64url")` token looks fine in the panel but
makes every poll return 401. `createApiKey(client, label, token)` therefore takes the
token as an argument and the panel validates it with `verifyApiKey()` before saving.
`label` is only the display name. There is no key rotation — Thirdwave rotates the key,
not the bot.

## Thirdwave `sms` may have digits masked

Unless the account has permission to view digits, the API returns `sms` with digits
replaced by `*` (e.g. `G-****** is your Google verification code.`). Code extraction
then fails. Do not treat missing digits as a parsing bug; the message still gets
delivered with "TIDAK ADA KODE" and no copy button.

## Codes may be formatted with a dash, a space, or an en dash

Thirdwave passes SMS bodies verbatim, and every service formats the code differently:
`947-2999` (WhatsApp), `482 913` (Facebook), `947–2999` (en dash), `801-274` (X).
`extractOtp` therefore treats hyphen, en dash, and whitespace as one separator class and
joins the runs before stripping non-digits, so `482 913` becomes `482913` and not `482`.

Any change to `extractOtp` must keep every template in `tests/otp.test.ts` passing — that
table is the regression net for real service wording, not a style preference.

## `extractOtp` prefers a labeled code, then the longest plausible run

The algorithm is: find a label (`code`/`kode`/`otp`/`pin`/`verification`/`verifikasi`/
`passcode`/`token`), read the first >=4-digit candidate after it; otherwise take the
longest run of 4–8 digits anywhere. Digits are skipped when they look like a date
(`12/10/2026`), a phone number (leading `0`, longer than 10 digits), or a quantity/price
(preceded by `rp`, `stok`, `total`, `sisa`, …). Without those guards a marketing SMS
produces a fake OTP button.

## grammY `InlineKeyboard.text` accepts no `style`

The inline keyboard buttons the Bot API accepts do carry `style`
(`"danger" | "success" | "primary"`), and grammY's `InlineKeyboard` chain exposes
`.style()`, `.danger()`, `.primary()`. The builder's `.text(text, data)` overload does
NOT take a style argument, so the style must be chained or passed as a button object:

    .text("Copy OTP", "x").style("danger")            // chained
    .add({ text: "Copy OTP", copy_text: { text } , style: "danger" })  // object

Passing `{ style }` as the second argument to `.text()` is a type error.

## Reply-keyboard buttons vs. admin free-text input

`Home` / `API Keys` / `Log Channels` / `Numbers` are literal message texts. The admin
handler checks `isMenuButton(text)` before consuming input for "add key" or "add
channel"; otherwise a menu tap would be stored as a key label or a channel link.

## Do not decorate the OTP message with emoji separator rows

A `➖➖➖` row appended to the bold info line renders glued to the last word and inherits
the bold weight, so it reads as a smear rather than a divider. The message separates the
text from the reply keyboard with a trailing blank line (`"*…*\n"`) instead. Do not
reintroduce a decoration row to "make the buttons look wider" — inline button width is
set by Telegram, not by the message text. `tests/logMessage.test.ts` asserts no `➖`.

## The OTP button text is dashed but its `copy_text` is not

The red OTP button shows the code grouped with dashes (`247-299-9`, `482-913`, `98-76`) so
the digits are easy to read. `copy_text` must keep the plain code, otherwise every paste
carries the dashes and the verification fails. `spacedCode` only changes the display text;
`extractOtp` keeps returning bare digits. `tests/logMessage.test.ts` asserts both fields.

## Country codes must not be prefix-matched

`countryFromNumber` matches calling codes against the raw digits, so a short prefix such
as `5` would shadow `591` (Bolivia) or `55` (Brazil). The table is therefore searched in
listed order with no `5`/`5x` ambiguity, and `formatLogMessage` prefers
`countryFromRange(rangeName)` over the number: the range name ("Bolivia Entel") is
authoritative, the number is only a fallback. Do not trim the country-name list back to a
handful of countries — an unmapped name falls through to `??` even though the number is
known.

## A derived `t.me/c/<id>` button URL is not the channel the admin configured

Buttons built from the numeric `chat_id` misroute for username-only chats and topics. Use
`number_channels.link_url` (stored from the pasted link); `targetUrl()` is a legacy
fallback only.

## Copy-text buttons with a placeholder, and missing numbers channels

The OTP button row is always the first row so the code button is full width. When no code
is extracted the button row is dropped entirely; the code itself must never be wrapped in
backticks, because the button has to show the bare digits.

When there is no numbers channel the message is sent with `inline_keyboard: []` — not with
`url: ""`. Telegram rejects empty button URLs with `BUTTON_URL_INVALID`, so
`formatLogMessage` returns no button rows at all and delivery still proceeds.

## Hyphenated OTP codes need a label anchor near the digits

Indonesian phrasing puts words between the label and the digits
(`Kode verifikasi Anda adalah 2438-2574`), so the label search allows up to 24 non-digit
characters between the label and the code, and the label list includes both English and
Indonesian forms. Shortening that gap or narrowing the list silently drops the second half
of the code (`2438` instead of `24382574`). Covered by `tests/otp.test.ts`.

## `ensureSchema` runs at startup only — restart after every schema change

`index.ts` calls `ensureSchema()` once before the bot starts. A bot process that was
started before a column was added to `sql/schema.sql` keeps running the OLD binary and
never applies the migration, so the new query fails with
`error: column "label" does not exist` on every update. The symptom looks like a schema
bug, but the cause is a stale process.

Rule: after changing `sql/schema.sql` or any query that depends on it, stop and restart
the bot. `ensureSchema` now logs `[db] schema ready` and throws loudly instead of letting
the bot continue half-migrated.

A second trap in the same area: `listChannels("log")` must not select `label`/`position`.
Those columns only exist on `number_channels`, so the column list is chosen per kind
(`logColumns` vs `numberColumns`) rather than shared.

## `number_channels` are buttons, not delivery targets

A previous revision delivered OTP messages into `number_channels` when they were toggled
on. That is wrong and must not come back. The rule:

- `listTargets()` (used by the poller and fan-out) reads `log_channels` **only**.
- `numberButtons()` reads `number_channels` **only**, and its rows are pure `url` buttons.

If a new feature needs to send something into a numbers channel, that is a design change,
not a small edit. `setChannelActive` throws for `kind === "number"` on purpose.
`tests/delivery.test.ts` guards the button shape.

## `maxNumberChannels` is enforced twice

`addNumberChannel` locks the table (`SELECT … FOR UPDATE`) and refuses a third row, and
`promptChannel` also refuses to open the label step when the slots are full. Both are
needed: the prompt check gives a clean message, the DB check closes the race between two
admins adding at the same time.

## `adminReplyKeyboard` must be typed as `ReplyKeyboardMarkup`

An object literal without a type annotation widens `style: "primary"` to `string`, which
`tsc --noEmit` rejects (`Property 'web_app' is missing in type …`). Annotate the constant.

## Admin panel messages

`renderPanel` edits the callback message when available and falls back to a plain reply.
`/start` sends the reply keyboard and the home panel in **one** message; sending a separate
carrier message first leaves a useless "OTP Logger" bubble in the chat.

The home panel carries an inline `Tutup` button while the reply keyboard is visible, which
is fine — they live on the same message and Telegram renders both.

## Aiven TLS

`DATABASE_URL` must include `sslmode=require`. Without it the pool connects without
TLS. If `SSL_CERT_FILE` is set, the pool verifies the CA; otherwise it encrypts without
verification (Aiven's default CA is not in Bun's trust store).

## Deletion is restricted by history

`otp_logs.api_key_id` uses `ON DELETE RESTRICT`. Deleting a key that already logged
OTPs fails; the panel reports this instead of silently deleting history.

## Topic link → chat id conversion

`https://t.me/c/4435318978/183` is NOT chat `4435318978`. The first number maps to
`-1004435318978` and the last number is `message_thread_id`. Do not pass the raw link
segment as `chat_id`; `parseChannelLink` in `src/domain/channelLink.ts` handles it and is
covered by tests.

## Sending with `message_thread_id` silently falls back in non-forums

Telegram ignores `message_thread_id` for chats that are not forum-enabled, so a wrong
target would land in the general feed without an error. That is why
`validateTopic` checks `is_forum` and probes with `sendChatAction` before saving.

## `UNIQUE (chat_id, thread_id)` does not block duplicate "general" targets

`thread_id IS NULL` never conflicts with itself in a plain UNIQUE constraint, because
`NULL` is distinct from `NULL`. Duplicate checks therefore use
`thread_id IS NOT DISTINCT FROM $2`, and the app-level check in `addLogChannel` must be
kept (a `ON CONFLICT` clause would not fire for `NULL` threads).

## `t.me/c/<id>/<topic>` links often point at a supergroup, not a channel

Older "channels" that had forum topics converted are surfaced by the Bot API as
`type: "supergroup"` with `is_forum: true`. A strict `chat.type !== "channel"` check
rejects valid log targets with "bukan channel". `checkLogTarget` accepts both `channel`
and `supergroup`; posting with `message_thread_id` works for either.

## `can_post_messages` is absent, not `false`

`getChatMember` omits `can_post_messages` for administrators of supergroups (verified
2026-10), and newer Bot API versions may omit it for channels too. Checking
`can_post_messages === true` therefore rejects a bot that can actually post. Only an
explicit `false` blocks; `creator` always may post.
