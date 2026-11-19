---
name: puddle
description: Connect this computer's Claude Code and Codex to the user's Puddle usage dashboard, show connection status, or disconnect. Use when the user types /puddle, asks to set up, check or turn off Puddle, or wants to see their coding-agent usage stats.
allowed-tools: Bash(puddle setup), Bash(puddle status), Bash(puddle off)
---

# Puddle

Puddle shows people how they use their coding agents. It shares only counts, token totals, tool names, timings, prompt lengths, repository names and conversation titles. It never shares prompts, the agent's answers, code, file contents, commands or file paths.

Pick the action from what the user asked. With no argument, run setup.

- **Set up**: run `puddle setup`.
  - It prints a short code and opens the browser, where the user signs in with their email and confirms the code.
  - Before running it, tell the user in one sentence what is shared and what is never shared, as above.
  - The command waits until the user confirms in the browser; let it run.
  - When it finishes, tell the user that new Claude Code (and Codex) sessions share from now on, and give them the dashboard link it printed. Earlier work is already there from the session logs.
- **Status**: run `puddle status` and relay the result.
- **Turn off**: run `puddle off`. It restores the user's original settings.

If setup says another collector is already configured, explain that Claude Code and Codex can each send usage to only one place. The user must turn the other one off first. Never edit the settings yourself.
