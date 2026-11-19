# Windows 0.1.47

- Simplified assistant welcome with centered heading, rounded composer and an optional starter prompt. Preserves streaming, cancellation, saved chats and explicit page reading.
- Markdown HTTP(S) links and plain URLs now open in a new Labeeb tab on click or middle-click, retaining the conversation. Relative, executable, file and credential-bearing links remain inactive.
- Verified Arabic empty/input direction and focus styling using the synthetic browser fixture; streamed answer and restored conversation rendered without browser errors or horizontal overflow.
- TypeScript and production frontend build passed. Full frontend suite passed 165 tests (1 skipped), followed by 37 targeted tests including the new App link-opening integration test.
- No live provider or installed-app test was needed for this UI-only change; native tab creation uses the existing command.
