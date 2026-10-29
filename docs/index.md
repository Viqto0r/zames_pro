---
layout: default
title: zames_pro — terminal coding agent without an API key
description: >-
  zames_pro is a free, open-source terminal coding agent that drives a real
  DeepSeek, Qwen or GLM web chat through a browser. It reads and edits files,
  runs commands and commits to git — no API key, no per-token bill.
lang: en
alt_url: /ru/
---

<section class="hero">
  <div class="wrap">
    <span class="hero-badge"><strong>No API key</strong> · free · open source · MIT</span>
    <h1>Your terminal coding agent,<br /><em>powered by the web chat you already use</em></h1>
    <p class="lead">
      zames_pro turns DeepSeek, Qwen or GLM into a Claude Code-style agent in
      your command line. It signs in to <em>your</em> chat account in a real
      browser, reads the model's answer and runs the tools locally — so there
      is no API key and no per-token bill.
    </p>
    <div class="hero-actions">
      <a class="btn btn-primary" href="#install">Get started</a>
      <a class="btn" href="https://github.com/Viqto0r/zames_pro">View on GitHub</a>
      <a class="btn" href="https://www.npmjs.com/package/zames_pro">npm package</a>
    </div>
    <div class="install"><span class="prompt">$</span> npm install -g zames_pro</div>
    <div class="hero-shot">
      <img
        src="https://raw.githubusercontent.com/Viqto0r/zames_pro/master/docs/demo.png"
        alt="A zames_pro session in the terminal: the agent reads files, runs commands and prints its answer"
        width="1385"
        height="671"
      />
    </div>
  </div>
</section>

<section id="features">
  <div class="wrap">
    <div class="section-head">
      <h2>Everything you expect from a coding agent</h2>
      <p>The same workflow as Claude Code and Codex CLI — on a chat account instead of an API key.</p>
    </div>
    <div class="grid">
      <div class="card">
        <span class="icon">🛠️</span>
        <h3>Real file and shell tools</h3>
        <p>
          Read, Write, Edit, MultiEdit, ApplyPatch, Bash, Glob, Grep — plus git
          tools (status, diff, commit, push) and WebFetch/WebSearch. Every edit
          is backed by /undo and /rewind.
        </p>
      </div>
      <div class="card">
        <span class="icon">🔑</span>
        <h3>No API key, no token bill</h3>
        <p>
          zames drives the public chat UI in a (headless) Chromium like a
          regular user. Use the DeepSeek, Qwen or GLM account you already have.
        </p>
      </div>
      <div class="card">
        <span class="icon">🧠</span>
        <h3>Project context and skills</h3>
        <p>
          Reads AGENTS.md, MEMORY.md, SKILL.md skills and custom slash
          commands from the repo and ~/.zames — the same convention as Codex
          and Claude Code.
        </p>
      </div>
      <div class="card">
        <span class="icon">🤖</span>
        <h3>Subagents</h3>
        <p>
          The Task tool runs a self-contained sub-task in its own isolated
          chat and returns only a report, keeping the main context small.
        </p>
      </div>
      <div class="card">
        <span class="icon">🔌</span>
        <h3>MCP servers</h3>
        <p>
          Plug in external tool servers such as @playwright/mcp or Context7.
          Their tools appear as server__tool and are listed by /mcp.
        </p>
      </div>
      <div class="card">
        <span class="icon">⏱️</span>
        <h3>Runs while you type</h3>
        <p>
          Queue messages during a task — they run right after it in the same
          chat. Esc aborts the current generation, /loop and /cron repeat work
          on a timer.
        </p>
      </div>
      <div class="card">
        <span class="icon">🛡️</span>
        <h3>Sandboxed and local-first</h3>
        <p>
          The agent cannot read or write above the directory it was started
          in. Browser profiles, sessions and logs stay on your machine.
        </p>
      </div>
      <div class="card">
        <span class="icon">🌍</span>
        <h3>Bilingual and themed</h3>
        <p>
          Russian / English UI (/config lang) and 29 terminal color themes
          with a live preview in /theme.
        </p>
      </div>
    </div>
  </div>
</section>

<section id="how-it-works">
  <div class="wrap">
    <div class="section-head">
      <h2>How it works</h2>
      <p>No model API is called. zames is a browser automation that behaves like a very fast typist.</p>
    </div>
    <div class="hero-shot" style="margin-top: 0">
      <img
        src="https://raw.githubusercontent.com/Viqto0r/zames_pro/master/docs/how-it-works.png"
        alt="How zames_pro works: the terminal sends the task to a DeepSeek, Qwen or GLM web chat through Playwright and runs the tool calls locally"
        width="2240"
        height="360"
      />
    </div>
    <div class="steps" style="margin-top: 24px">
      <div class="step">
        <h3>You type a task</h3>
        <p>zames sends the system prompt and your task into the active chat web app.</p>
      </div>
      <div class="step">
        <h3>The model answers</h3>
        <p>The answer is read from the raw SSE stream, so tool-call JSON with escapes survives intact.</p>
      </div>
      <div class="step">
        <h3>zames runs the tool</h3>
        <p>Files, shell, git or MCP — executed locally inside the project directory (the sandbox).</p>
      </div>
      <div class="step">
        <h3>The result goes back</h3>
        <p>The tool output is fed to the model and the loop repeats until the task is done.</p>
      </div>
    </div>
  </div>
</section>

<section id="providers">
  <div class="wrap">
    <div class="section-head">
      <h2>Three backends, one agent</h2>
      <p>Switch live with <code>/provider &lt;deepseek|qwen|glm&gt;</code> — each keeps its own signed-in browser profile.</p>
    </div>
    <div class="providers">
      <div class="provider">
        <h3>DeepSeek<span class="tag">default</span></h3>
        <p>
          chat.deepseek.com, headless. Deep thinking and Smart web search can
          be toggled from the config. The most battle-tested backend.
        </p>
      </div>
      <div class="provider">
        <h3>Qwen</h3>
        <p>
          chat.qwen.ai, headless, with a model picker (<code>/model</code>) and
          a guest mode for a few messages a day. Faster send throttle.
        </p>
      </div>
      <div class="provider">
        <h3>GLM</h3>
        <p>
          chat.z.ai. Runs with a visible browser window by default, because the
          site answers headless sends with a slider captcha. Adaptive send
          pause included.
        </p>
      </div>
    </div>
  </div>
</section>

<section id="why">
  <div class="wrap">
    <div class="section-head">
      <h2>Why not just use an API?</h2>
      <p>Because the chat account you already pay for can do the job — and zames keeps the agent honest by developing itself with itself.</p>
    </div>
    <div class="grid">
      <div class="card">
        <span class="icon">💸</span>
        <h3>Zero marginal cost</h3>
        <p>
          No API key, no per-token invoice, no rate plan to configure. If your
          DeepSeek, Qwen or GLM chat works in a browser, it works in zames.
        </p>
      </div>
      <div class="card">
        <span class="icon">🧪</span>
        <h3>Built with itself</h3>
        <p>
          zames_pro is developed by zames_pro: the agent in this terminal reads
          the sources, runs the tests and commits the result. That is the daily
          proof it works.
        </p>
      </div>
      <div class="card">
        <span class="icon">🔁</span>
        <h3>Familiar workflow</h3>
        <p>
          Tools, AGENTS.md, skills, MCP and slash commands match Claude Code and
          Codex CLI, so switching costs minutes, not days.
        </p>
      </div>
      <div class="card">
        <span class="icon">📦</span>
        <h3>One command to try</h3>
        <p>
          <code>npm install -g zames_pro</code> and you are in. MIT-licensed,
          no account on our side, nothing to sign up for.
        </p>
      </div>
    </div>
  </div>
</section>
<section id="install">
  <div class="wrap">
    <div class="section-head">
      <h2>Up and running in a minute</h2>
      <p>Requires Node.js 22 or newer. Chromium for Playwright is fetched automatically.</p>
    </div>
    <div class="grid">
      <div class="card">
        <h3>1. Install</h3>
        <pre><code>npm install -g zames_pro</code></pre>
        <p>On Linux/WSL the system libraries are installed too when passwordless sudo is available.</p>
      </div>
      <div class="card">
        <h3>2. Run in your project</h3>
        <pre><code>cd your-project
zames</code></pre>
        <p>The agent works inside this directory and cannot leave it.</p>
      </div>
      <div class="card">
        <h3>3. Describe the task</h3>
        <pre><code>❯ refactor the config loader and add a test</code></pre>
        <p>Sign in once in the browser; the session is stored per provider.</p>
      </div>
    </div>
  </div>
</section>

<section id="docs">
  <div class="wrap">
    <div class="section-head">
      <h2>Documentation</h2>
      <p>The full reference lives in the repository and on this site.</p>
    </div>
    <div class="grid">
      <a class="card" href="{{ '/readme/en' | relative_url }}">
        <h3>README</h3>
        <p>The complete overview: signing in, providers, usage, options and FAQ.</p>
      </a>
      <a class="card" href="{{ '/commands' | relative_url }}">
        <h3>Commands &amp; tools</h3>
        <p>Every tool and slash command the agent understands.</p>
      </a>
      <a class="card" href="{{ '/configuration' | relative_url }}">
        <h3>Configuration &amp; themes</h3>
        <p>All settings, the /config menu and the 29 bundled palettes.</p>
      </a>
      <a class="card" href="{{ '/mcp' | relative_url }}">
        <h3>MCP</h3>
        <p>Connect external tool servers, with a safe Playwright MCP example.</p>
      </a>
      <a class="card" href="{{ '/troubleshooting' | relative_url }}">
        <h3>Troubleshooting</h3>
        <p>Sign-in and captcha, headless 403, rate limits, missing libraries.</p>
      </a>
      <a class="card" href="{{ '/ru/' | relative_url }}">
        <h3>Русская версия</h3>
        <p>Обзор, команды, конфигурация и решение проблем на русском.</p>
      </a>
    </div>
  </div>
</section>
