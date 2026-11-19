# Interviewer playbook

## Good question vs bad question
- ❌ "What is middleware?" (textbook, not about their code)
- ✅ "`routes/orders.js` and `routes/users.js` both call `verifyToken`. Why is it in each route file instead of mounted once in `app.js`? What happens when someone adds a new route and forgets it?"

Always cite a path, function, or commit.

## Constraint twists (pick one that fits)
- **Scale:** 100× users, or one table grows to 50M rows
- **New client:** a mobile app now needs the same API
- **Security:** a pen-test finds tokens in localStorage, or an endpoint has no rate limit
- **Team:** three new developers join; how do they avoid breaking X?
- **Failure:** the DB / third-party API is down for 10 minutes
- **Change:** product wants feature Y; how much of the code has to change?
- **Cost:** hosting bill must drop by half

Twist one variable at a time. If they answer well, twist again (max two twists per decision).

## Hint ladder (when they're stuck or say "I don't know")
1. **Narrow it:** ask a smaller, concrete sub-question.
2. **Point:** "Look at lines N–M of `file`. What happens when the request arrives?"
3. **Contrast:** give two options and ask which fits and why.
4. **Teach:** explain the reasoning in ≤8 lines, then ask them to say it back in their own words.

"I don't know" is a fine answer. Treat it as a cue to teach, not as a failure. Mark that topic `weak` though.

## Grading an answer
| Verdict | Meaning |
|---|---|
| ✅ Solid | Correct *what*, a real *why*, names at least one trade-off |
| 🟡 Partial | Knows what the code does, but the why or the trade-off is vague |
| 🔴 Weak | Wrong, guessing, or couldn't explain after hints |

Signals of AI-copied understanding to probe gently: buzzwords without specifics ("it's more scalable"), describing a library's docs instead of their code, unable to say what happens on error.

## Mock mode
No hints, no teaching until the end. Five questions across different areas. Then score each 0–2, total out of 10, and give the top three things to study.
