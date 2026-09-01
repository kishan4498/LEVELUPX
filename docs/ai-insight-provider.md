# AI Insight Provider

LevelUpX uses rule-based AI productivity insights by default. External HTTP insight generation is optional and should stay off until a provider endpoint is ready.

## Current Behavior

- `AI_INSIGHT_PROVIDER=rules` uses the built-in rule provider.
- `AI_INSIGHT_PROVIDER=external-http` uses the external provider only when `AI_INSIGHT_ENDPOINT` is present.
- External HTTP calls are aborted after `AI_INSIGHT_TIMEOUT_MS`.
- External HTTP calls include hosted provider profile metadata from `AI_INSIGHT_EXTERNAL_PROVIDER_NAME`.
- External HTTP auth can use a configurable header and scheme through `AI_INSIGHT_EXTERNAL_AUTH_HEADER` and `AI_INSIGHT_EXTERNAL_AUTH_SCHEME`.
- External HTTP calls include a structured `prompt` contract with version, audience, max insight count, allowed insight types, instructions, and response schema hints.
- If external generation returns no insights, fails, or times out during manual generation, the service falls back to rule-based insights.
- External provider responses are normalized and filtered to known insight types.

## Observability

- Each generated insight stores the provider name that produced it (`providerSource` column).
- The generate response includes a `meta` object with `providerSource`, `usedFallback`, `insightCount`, and `durationMs`.
- The generate response includes `promptVersion` so manual and scheduled runs can be traced to the prompt/rule set.
- A structured `ai_insights_generated` log entry is emitted after every generation with provider, prompt version, fallback status, count, and duration.
- The frontend displays the provider source per insight and shows provider/prompt metadata after each manual generation.
- `GET /api/ai-insights/prompt-registry` exposes the active provider readiness, hosted provider profile, auth header profile, prompt version, audience, max insight count, prompt contract, and rollout notes.
- `GET /api/ai-insights/prompt-runs` lists recent persisted prompt run history for the authenticated user.

## Prompt Run History

Manual and scheduled generation record prompt run metadata in `AiPromptRun`.

Stored fields include:

- provider source
- prompt version
- prompt audience
- max insight count
- fallback status
- generated insight count
- duration in milliseconds
- trigger, either `MANUAL` or `SCHEDULED`

## Feedback Learning

`GET /api/ai-insights/learning` combines user ratings with prompt run history.

The learning summary includes:

- provider helpful/not-helpful rates
- insight-type helpful/not-helpful rates
- prompt-version run counts, fallback rates, average duration, and total generated insights
- tuning actions with `INFO`, `WATCH`, or `ACTION` severity
- a recommendation that prioritizes high fallback prompts before wider scheduled rollout

## Environment

```bash
AI_INSIGHT_PROVIDER=rules
AI_INSIGHT_ENDPOINT=
AI_INSIGHT_API_KEY=
AI_INSIGHT_EXTERNAL_PROVIDER_NAME=custom-http
AI_INSIGHT_EXTERNAL_AUTH_HEADER=Authorization
AI_INSIGHT_EXTERNAL_AUTH_SCHEME=Bearer
AI_INSIGHT_TIMEOUT_MS=5000
AI_INSIGHT_PROMPT_VERSION=rules-v1
AI_INSIGHT_PROMPT_AUDIENCE=self-directed learners
AI_INSIGHT_MAX_INSIGHTS=3
AI_INSIGHT_SCHEDULE_ROLLOUT_PERCENT=100
AI_INSIGHT_SCHEDULE_REQUIRE_EXTERNAL=false
```

- `AI_INSIGHT_PROVIDER`: `rules` or `external-http`.
- `AI_INSIGHT_ENDPOINT`: external HTTP endpoint for future production provider rollout.
- `AI_INSIGHT_API_KEY`: optional external provider credential.
- `AI_INSIGHT_EXTERNAL_PROVIDER_NAME`: human-readable external hosted provider profile name, defaulting to `custom-http`.
- `AI_INSIGHT_EXTERNAL_AUTH_HEADER`: HTTP header used for `AI_INSIGHT_API_KEY`, defaulting to `Authorization`.
- `AI_INSIGHT_EXTERNAL_AUTH_SCHEME`: auth scheme prefix for `AI_INSIGHT_API_KEY`, defaulting to `Bearer`; set `none` to send the key as the raw header value.
- `AI_INSIGHT_TIMEOUT_MS`: timeout budget for external calls.
- `AI_INSIGHT_PROMPT_VERSION`: human-readable rule or prompt version label for observability.
- `AI_INSIGHT_PROMPT_AUDIENCE`: short audience/context label sent to the external provider prompt contract.
- `AI_INSIGHT_MAX_INSIGHTS`: maximum external insights to accept and request, clamped to 1-5.
- `AI_INSIGHT_SCHEDULE_ROLLOUT_PERCENT`: percent of active users eligible for scheduled generation, clamped to 0-100.
- `AI_INSIGHT_SCHEDULE_REQUIRE_EXTERNAL`: when `true`, scheduled generation is blocked unless the external HTTP provider is ready.

## Scheduled Rollout Controls

The scheduled insight job uses deterministic user bucketing for `AI_INSIGHT_SCHEDULE_ROLLOUT_PERCENT`, so the same user stays in or out of a partial rollout across job runs.

`GET /api/ai-insights/schedule` reports:

- configured rollout percent
- whether external provider readiness is required
- whether the external provider is ready
- the external hosted provider profile, auth profile, request format, and hosted rollout readiness
- whether hosted scheduling is effectively enabled
- a blocked reason when rollout is intentionally stopped

## External Request Contract

External HTTP providers receive JSON like:

```json
{
  "userId": "user-id",
  "stats": {
    "focusHoursLast3Days": 2,
    "failedTaskRateLast7Days": 0.1,
    "completedQuestsLast7Days": 4,
    "activeFocusDaysLast7Days": 3
  },
  "provider": {
    "name": "custom-http",
    "requestFormat": "levelupx-insight-v1"
  },
  "prompt": {
    "version": "rules-v1",
    "audience": "self-directed learners",
    "maxInsights": 3,
    "allowedInsightTypes": ["BURNOUT_WARNING", "SCHEDULE_OPTIMIZATION"],
    "instructions": ["Generate concise, actionable productivity insights for the learner's recent LevelUpX activity."],
    "outputSchema": {
      "insights": {
        "insightType": "one of allowedInsightTypes",
        "title": "non-empty string, max 120 characters",
        "message": "non-empty string, max 800 characters",
        "confidenceScore": "number from 0 to 1"
      }
    }
  }
}
```

The provider should return `{ "insights": [...] }`. Unknown insight types, empty titles/messages, and invalid confidence scores are ignored.

## Later Wiring

Provider-specific hosted rollout is now represented by the external provider profile, configurable auth header/scheme, hosted readiness flags, and the versioned `levelupx-insight-v1` request format. Real provider secret-manager setup and infrastructure deployment remain production work.
