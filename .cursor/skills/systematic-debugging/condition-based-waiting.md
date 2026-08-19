# Condition-Based Waiting

Source: [obra/superpowers](https://github.com/obra/superpowers/blob/main/skills/systematic-debugging/condition-based-waiting.md)

Don't `sleep` in tests or Playwright loops. Wait for the condition:

- Vite ready → regex `Local:`
- Overlay gone → snapshot no longer has `diplo-overlay`
- API ok → status 200, not a fixed 500ms

Always timeout with a clear error. Arbitrary delay only when testing real timing (and comment WHY).
