---
layout: default
title: zames_pro — терминальный coding-агент без API-ключа
description: >-
  zames_pro — бесплатный терминальный coding-агент с открытым исходным кодом.
  Управляет веб-чатом DeepSeek, Qwen или GLM через браузер: читает и правит
  файлы, выполняет команды и коммитит в git. Без API-ключа и оплаты за токены.
lang: ru
alt_url: /
ui:
  features: Возможности
  how: Как это работает
  providers: Провайдеры
  why: Почему zames
  install: Установка
  project: Проект
  docs: Документация
  help: Помощь
  home: На главную
  footer_about: >-
    Бесплатный терминальный coding-агент с открытым кодом, работающий на вашем
    аккаунте веб-чата DeepSeek, Qwen или GLM — без API-ключа и оплаты за токены.
---

<section class="hero">
  <div class="wrap">
    <span class="hero-badge"><strong>Без API-ключа</strong> · бесплатно · открытый код · MIT</span>
    <h1>Терминальный coding-агент<br /><em>на том веб-чате, которым вы уже пользуетесь</em></h1>
    <p class="lead">
      zames_pro превращает DeepSeek, Qwen или GLM в агента для командной строки
      в духе Claude Code. Он входит в <em>ваш</em> аккаунт чата в настоящем
      браузере, читает ответ модели и выполняет инструменты локально — поэтому
      здесь нет API-ключа и счёта за токены.
    </p>
    <div class="hero-actions">
      <a class="btn btn-primary" href="#install">Начать</a>
      <a class="btn" href="https://github.com/Viqto0r/zames_pro">GitHub</a>
      <a class="btn" href="https://www.npmjs.com/package/zames_pro">npm</a>
    </div>
    <div class="install"><span class="prompt">$</span> npm install -g zames_pro</div>
    <div class="hero-shot">
      <img
        src="https://raw.githubusercontent.com/Viqto0r/zames_pro/master/docs/demo.png"
        alt="Сессия zames_pro в терминале: агент читает файлы, выполняет команды и печатает ответ"
        width="1385"
        height="671"
      />
    </div>
  </div>
</section>

<section id="features">
  <div class="wrap">
    <div class="section-head">
      <h2>Всё, что ждёшь от coding-агента</h2>
      <p>Тот же рабочий процесс, что в Claude Code и Codex CLI — только на аккаунте чата, а не на API-ключе.</p>
    </div>
    <div class="grid">
      <div class="card">
        <span class="icon">🛠️</span>
        <h3>Настоящие файловые и shell-инструменты</h3>
        <p>
          Read, Write, Edit, MultiEdit, ApplyPatch, Bash, Glob, Grep, плюс
          git-инструменты (status, diff, commit, push) и WebFetch/WebSearch.
          Каждая правка подкреплена /undo и /rewind.
        </p>
      </div>
      <div class="card">
        <span class="icon">🔑</span>
        <h3>Без API-ключа и счёта за токены</h3>
        <p>
          zames управляет публичным веб-чатом в (headless) Chromium как
          обычный пользователь. Подойдёт аккаунт DeepSeek, Qwen или GLM,
          который у вас уже есть.
        </p>
      </div>
      <div class="card">
        <span class="icon">🧠</span>
        <h3>Контекст проекта и навыки</h3>
        <p>
          Читает AGENTS.md, MEMORY.md, навыки SKILL.md и пользовательские
          слэш-команды из репозитория и ~/.zames — та же конвенция, что в Codex
          и Claude Code.
        </p>
      </div>
      <div class="card">
        <span class="icon">🤖</span>
        <h3>Субагенты</h3>
        <p>
          Инструмент Task выполняет самодостаточную подзадачу в отдельном
          изолированном чате и возвращает только отчёт, не засоряя основной
          контекст.
        </p>
      </div>
      <div class="card">
        <span class="icon">🔌</span>
        <h3>MCP-серверы</h3>
        <p>
          Подключайте внешние серверы инструментов, например @playwright/mcp
          или Context7. Их инструменты видны как server__tool и в /mcp.
        </p>
      </div>
      <div class="card">
        <span class="icon">⏱️</span>
        <h3>Работает, пока вы печатаете</h3>
        <p>
          Сообщения во время задачи встают в очередь и уходят сразу после неё,
          в тот же чат. Esc прерывает генерацию, /loop и /cron повторяют задачи
          по таймеру.
        </p>
      </div>
      <div class="card">
        <span class="icon">🛡️</span>
        <h3>Песочница и local-first</h3>
        <p>
          Агент не может читать или писать выше директории запуска. Профили
          браузера, сессии и логи остаются на вашей машине.
        </p>
      </div>
      <div class="card">
        <span class="icon">🌍</span>
        <h3>Два языка и темы</h3>
        <p>
          Интерфейс на русском и английском (/config lang) и 29 цветовых тем
          терминала с живым предпросмотром в /theme.
        </p>
      </div>
    </div>
  </div>
</section>

<section id="how-it-works">
  <div class="wrap">
    <div class="section-head">
      <h2>Как это работает</h2>
      <p>API модели не вызывается. zames — это автоматизация браузера, которая ведёт себя как очень быстрый машинист.</p>
    </div>
    <div class="hero-shot" style="margin-top: 0">
      <img
        src="https://raw.githubusercontent.com/Viqto0r/zames_pro/master/docs/how-it-works.png"
        alt="Как работает zames_pro: терминал отправляет задачу в веб-чат DeepSeek, Qwen или GLM через Playwright и выполняет вызовы инструментов локально"
        width="2240"
        height="360"
      />
    </div>
    <div class="steps" style="margin-top: 24px">
      <div class="step">
        <h3>Вы вводите задачу</h3>
        <p>zames отправляет системный промпт и задачу в активный веб-чат.</p>
      </div>
      <div class="step">
        <h3>Модель отвечает</h3>
        <p>Ответ читается из сырого SSE-потока, поэтому JSON вызова инструмента остаётся целым.</p>
      </div>
      <div class="step">
        <h3>zames выполняет инструмент</h3>
        <p>Файлы, shell, git или MCP — локально, внутри директории проекта (песочницы).</p>
      </div>
      <div class="step">
        <h3>Результат возвращается</h3>
        <p>Вывод инструмента уходит обратно модели, и цикл повторяется, пока задача не выполнена.</p>
      </div>
    </div>
  </div>
</section>

<section id="providers">
  <div class="wrap">
    <div class="section-head">
      <h2>Три бэкенда, один агент</h2>
      <p>Переключение живое: <code>/provider &lt;deepseek|qwen|glm&gt;</code> — у каждого свой залогиненный профиль браузера.</p>
    </div>
    <div class="providers">
      <div class="provider">
        <h3>DeepSeek<span class="tag">по умолчанию</span></h3>
        <p>
          chat.deepseek.com, headless. «Deep thinking» и «Smart web search»
          переключаются из конфига. Самый обкатанный бэкенд.
        </p>
      </div>
      <div class="provider">
        <h3>Qwen</h3>
        <p>
          chat.qwen.ai, headless, с выбором модели (<code>/model</code>) и
          гостевым режимом на несколько сообщений в день. Более быстрый
          троттлинг отправки.
        </p>
      </div>
      <div class="provider">
        <h3>GLM</h3>
        <p>
          chat.z.ai. По умолчанию работает с видимым окном браузера: сайт
          отвечает на headless-отправки капчей-слайдером. Адаптивная пауза
          между отправками включена.
        </p>
      </div>
    </div>
  </div>
</section>

<section id="why">
  <div class="wrap">
    <div class="section-head">
      <h2>Почему не просто API?</h2>
      <p>Потому что аккаунт чата, за который вы уже платите, справляется сам — а zames ещё и разрабатывает себя собой.</p>
    </div>
    <div class="grid">
      <div class="card">
        <span class="icon">💸</span>
        <h3>Нулевая предельная стоимость</h3>
        <p>
          Ни API-ключа, ни счёта за токены, ни тарифного плана. Если ваш чат
          DeepSeek, Qwen или GLM работает в браузере — он работает и в zames.
        </p>
      </div>
      <div class="card">
        <span class="icon">🧪</span>
        <h3>Разрабатывается сам собой</h3>
        <p>
          Над zames_pro работает zames_pro: агент в этом терминале читает
          исходники, гоняет тесты и коммитит результат. Это ежедневное
          доказательство работоспособности.
        </p>
      </div>
      <div class="card">
        <span class="icon">🔁</span>
        <h3>Знакомый рабочий процесс</h3>
        <p>
          Инструменты, AGENTS.md, навыки, MCP и слэш-команды как в Claude Code
          и Codex CLI — переход занимает минуты, а не дни.
        </p>
      </div>
      <div class="card">
        <span class="icon">📦</span>
        <h3>Одна команда, чтобы попробовать</h3>
        <p>
          <code>npm install -g zames_pro</code> — и вы внутри. Лицензия MIT,
          никаких аккаунтов на нашей стороне.
        </p>
      </div>
    </div>
  </div>
</section>
<section id="install">
  <div class="wrap">
    <div class="section-head">
      <h2>Запуск за минуту</h2>
      <p>Нужен Node.js 22 или новее. Chromium для Playwright скачивается автоматически.</p>
    </div>
    <div class="grid">
      <div class="card">
        <h3>1. Установка</h3>
        <pre><code>npm install -g zames_pro</code></pre>
        <p>На Linux/WSL системные библиотеки тоже ставятся, если доступен sudo без пароля.</p>
      </div>
      <div class="card">
        <h3>2. Запуск в проекте</h3>
        <pre><code>cd your-project
zames</code></pre>
        <p>Агент работает внутри этой директории и не может её покинуть.</p>
      </div>
      <div class="card">
        <h3>3. Опишите задачу</h3>
        <pre><code>❯ отрефактори загрузчик конфига и добавь тест</code></pre>
        <p>Войдите один раз в браузере; сессия хранится отдельно для каждого провайдера.</p>
      </div>
    </div>
  </div>
</section>

<section id="docs">
  <div class="wrap">
    <div class="section-head">
      <h2>Документация</h2>
      <p>Полный справочник — в репозитории и на этом сайте.</p>
    </div>
    <div class="grid">
      <a class="card" href="{{ '/readme/ru' | relative_url }}">
        <h3>README</h3>
        <p>Полный обзор: вход в аккаунт, провайдеры, использование, опции и FAQ.</p>
      </a>
      <a class="card" href="{{ '/commands-ru' | relative_url }}">
        <h3>Команды и инструменты</h3>
        <p>Все инструменты и слэш-команды, которые понимает агент.</p>
      </a>
      <a class="card" href="{{ '/configuration-ru' | relative_url }}">
        <h3>Конфигурация и темы</h3>
        <p>Все настройки, меню /config и 29 встроенных палитр.</p>
      </a>
      <a class="card" href="{{ '/mcp-ru' | relative_url }}">
        <h3>MCP</h3>
        <p>Подключение внешних серверов инструментов с безопасным примером Playwright MCP.</p>
      </a>
      <a class="card" href="{{ '/troubleshooting-ru' | relative_url }}">
        <h3>Решение проблем</h3>
        <p>Вход и капча, headless 403, рейт-лимиты, отсутствующие библиотеки.</p>
      </a>
      <a class="card" href="{{ '/' | relative_url }}">
        <h3>English version</h3>
        <p>Overview, commands, configuration and troubleshooting in English.</p>
      </a>
    </div>
  </div>
</section>
