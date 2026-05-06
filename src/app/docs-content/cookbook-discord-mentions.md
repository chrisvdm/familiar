# Receive Discord mentions and forward them into Familiar

Use this when:

- a Discord bot or webhook receives a mention for Familiar
- you want that message to appear in Familiar's conversation flow
- you want Familiar to decide whether to reply directly or call a tool

## Correct route

Send inbound Discord messages to:

```text
POST /api/v1/input
```

Do not send inbound Discord messages to:

```text
POST /api/v1/webhooks/executor
```

That webhook is only for executor results coming back later.

## Bridge flow

1. Discord sends an event to your bridge.
2. Your bridge verifies the Discord request.
3. Your bridge extracts the message text and channel id.
4. Your bridge strips the bot mention if needed.
5. Your bridge sends the remaining text into Familiar.
6. Familiar handles it like any other user message.
7. Familiar may reply directly or call a synced tool.

## Familiar request shape

```json
{
  "integration_id": "discord_bridge",
  "channel": {
    "type": "discord",
    "id": "123456789012345678"
  },
  "input": {
    "kind": "text",
    "text": "@discord hello from Discord"
  }
}
```

## curl example

```sh
curl -X POST https://familiar.chrsvdmrw.workers.dev/api/v1/input \
  -H "Authorization: Bearer YOUR_FAMILIAR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: discord-msg-1234567890" \
  -H "X-Request-Id: discord-msg-1234567890" \
  -d '{
    "integration_id": "discord_bridge",
    "channel": {
      "type": "discord",
      "id": "123456789012345678"
    },
    "input": {
      "kind": "text",
      "text": "@discord hello from Discord"
    }
  }'
```

## How tool invocation works

The message body is still just normal `input.text`.

That means these can all work:

- `@discord hello`
- `send to discord: hello`
- `please send hello to discord`
- `I want to post "hello there sunnies" in Discord`

Familiar can:

- treat explicit invocation syntax as a direct tool shortcut
- or use the AI pass to decide that the Discord tool should be called

## Recommended Discord mapping

- `integration_id`: a stable integration id such as `discord_bridge`
- `channel.type`: `discord`
- `channel.id`: the Discord channel id
- `input.kind`: always `text`
- `input.text`: the normalized Discord message content

## Idempotency

Use the Discord message id as the Familiar idempotency key.

Example:

```text
Idempotency-Key: discord-msg-<discord-message-id>
```

## Minimal bridge pseudocode

```ts
async function handleDiscordMention(event: DiscordMessageCreate) {
  if (event.author.bot) return;

  const text = stripFamiliarMention(event.content);

  if (!text.trim()) return;

  const response = await fetch(
    "https://familiar.chrsvdmrw.workers.dev/api/v1/input",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.FAMILIAR_API_TOKEN}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `discord-msg-${event.id}`,
        "X-Request-Id": `discord-msg-${event.id}`,
      },
      body: JSON.stringify({
        integration_id: "discord_bridge",
        channel: {
          type: "discord",
          id: event.channel_id,
        },
        input: {
          kind: "text",
          text,
        },
      }),
    },
  );

  const result = await response.json();
  return result;
}
```

## Common mistake

Do not send inbound Discord messages to the executor webhook.

This is wrong for inbound chat:

```text
POST /api/v1/webhooks/executor
```

That route is only for delayed executor results such as:

```json
{
  "thread_id": "thread_abc",
  "result": {
    "execution_id": "exec_123",
    "state": "completed",
    "content": "Done."
  }
}
```
