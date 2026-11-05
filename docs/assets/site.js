// The site's small behaviours: the mobile menu, the copy button on a code
// block, the collapsed theme gallery and its lightbox. Kept in one external
// file (not inline) so a Content-Security-Policy stays possible, and every
// element it touches is an ENHANCEMENT: the menu links still exist as plain
// <a>, and a gallery tile is still a real <a href> to the full-size
// screenshot. A JS-off visitor gets the gallery expanded by default instead
// of an empty box, which is why the closed state is applied from here and
// not baked into the markup.
;(function () {
  'use strict'

  // ---------- mobile navigation ----------
  // The header hides its links under 720px (CSS), so the toggle is the only
  // way to reach them on a phone. aria-expanded is kept in sync because the
  // button is what a screen reader announces.
  var toggle = document.querySelector('.nav-toggle')
  var nav = document.getElementById('site-nav')
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open')
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false')
    })
    // A tap on a link navigates anyway; closing here keeps an in-page jump
    // from scrolling under a still-open panel.
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) {
        nav.classList.remove('open')
        toggle.setAttribute('aria-expanded', 'false')
      }
    })
  }

  // ---------- copy button on a code block ----------
  // Only the shell one-liners are worth copying (npm install, cd + zames), so
  // the button is injected here: a JS-off page never shows a dead control.
  var LABEL = { copy: 'Copy', done: 'Copied!', failed: 'Press Ctrl+C' }
  if (document.documentElement.getAttribute('data-lang') === 'ru') {
    LABEL = {
      copy: 'Копировать',
      done: 'Скопировано!',
      failed: 'Нажмите Ctrl+C',
    }
  }
  function wireCopy(host, getText, className) {
    if (host.querySelector('.copy-btn')) return
    var btn = document.createElement('button')
    btn.type = 'button'
    btn.className = className || 'copy-btn'
    btn.textContent = LABEL.copy
    btn.addEventListener('click', function () {
      var text = getText()
      var done = function (label, ok) {
        btn.textContent = label
        btn.classList.toggle('copied', ok)
        setTimeout(function () {
          btn.textContent = LABEL.copy
          btn.classList.remove('copied')
        }, 1600)
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          function () {
            done(LABEL.done, true)
          },
          function () {
            done(LABEL.failed, false)
          },
        )
      } else {
        // The clipboard API needs a secure context (https/localhost); the
        // file:// preview falls back to selecting the text instead.
        var range = document.createRange()
        range.selectNodeContents(host)
        var sel = window.getSelection()
        sel.removeAllRanges()
        sel.addRange(range)
        done(LABEL.failed, false)
      }
    })
    host.appendChild(btn)
  }

  Array.prototype.forEach.call(
    document.querySelectorAll('pre > code'),
    function (code) {
      wireCopy(code.parentNode, function () {
        return code.innerText
      })
    },
  )

  // The hero's `npm install -g zames_pro` is a copyable one-liner too, and it
  // is the one command a first-time visitor actually needs.
  var install = document.querySelector('.install')
  if (install) {
    wireCopy(install, function () {
      return install.textContent.replace(/^\s*\$\s*/, '').trim()
    })
  }

  // ---------- theme gallery: collapsed under a toggle ----------
  // The full grid lives on its own themes page now, so it never sits above a
  // hero again; the toggle is still what keeps 29 screenshots from turning
  // that page into one endless scroll. The button shipped by the include is
  // `hidden` and revealed only here, so a JS-off page shows every tile and no
  // dead control.
  var gallery = document.querySelector('.theme-gallery')
  var galleryToggle = document.querySelector('.theme-toggle')
  if (gallery && galleryToggle) {
    gallery.classList.add('is-collapsed')
    galleryToggle.hidden = false
    galleryToggle.addEventListener('click', function () {
      var open = !gallery.classList.toggle('is-collapsed')
      galleryToggle.setAttribute('aria-expanded', open ? 'true' : 'false')
      // The two labels are both server-rendered (the RU one comes from the
      // page front matter), so a locale never depends on a string here.
      if (open) {
        galleryToggle.textContent = galleryToggle.getAttribute('data-less')
      } else {
        galleryToggle.textContent = galleryToggle.getAttribute('data-more')
      }
    })
  }

  // ---------- theme gallery lightbox ----------
  // A <dialog> gives Esc, the backdrop and focus trapping for free. A click
  // on a tile is intercepted only for an unmodified left click: ctrl/cmd/shift
  // clicks keep opening the PNG in a new tab.
  var dialog = document.getElementById('theme-lightbox')
  if (!dialog || !gallery || typeof dialog.showModal !== 'function') return
  var img = dialog.querySelector('img')
  var caption = dialog.querySelector('.lightbox-caption')
  var close = dialog.querySelector('.lightbox-close')
  // The <dialog> restores focus to the clicked tile on close; a long gallery
  // otherwise jumps the reader back to wherever the browser thinks the tile
  // was. Remembering the tile and re-focusing it is cheap and predictable.
  var lastTile = null
  var links = Array.prototype.slice.call(
    gallery.querySelectorAll('a.theme-tile'),
  )
  var index = 0
  function show(i) {
    index = (i + links.length) % links.length
    var link = links[index]
    var thumb = link.querySelector('img')
    img.src = link.getAttribute('href')
    img.alt = thumb ? thumb.alt : link.getAttribute('data-label') || ''
    caption.textContent = link.getAttribute('data-label') || ''
  }
  gallery.addEventListener('click', function (e) {
    var link = e.target.closest('a.theme-tile')
    if (!link || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    lastTile = link
    show(links.indexOf(link))
    dialog.showModal()
  })
  dialog.addEventListener('close', function () {
    if (lastTile) lastTile.focus({ preventScroll: true })
  })
  dialog.addEventListener('click', function (e) {
    // A backdrop click lands on the <dialog> itself, the content is a child,
    // so clicking the image does not close it.
    if (e.target === dialog) dialog.close()
  })
  close.addEventListener('click', function () {
    dialog.close()
  })
  dialog.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      show(index + 1)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      show(index - 1)
    }
  })

  // ---------- hero screenshot: same lightbox ----------
  // The landing page's demo image is a link to the raw PNG; opening it in the
  // same dialog keeps a visitor on the page instead of throwing them at a
  // bare GitHub-hosted image.
  var heroLink = document.querySelector('.hero-shot-link')
  if (heroLink) {
    heroLink.addEventListener('click', function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
      e.preventDefault()
      var heroImg = heroLink.querySelector('img')
      img.src = heroImg
        ? heroImg.currentSrc || heroImg.src
        : heroLink.getAttribute('href')
      img.alt = heroImg ? heroImg.alt : ''
      caption.textContent =
        document.documentElement.getAttribute('data-lang') === 'ru'
          ? 'Сессия zames в терминале'
          : 'A zames session in the terminal'
      lastTile = null
      dialog.showModal()
    })
  }
})()
