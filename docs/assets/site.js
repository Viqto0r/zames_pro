// The site's small behaviours: the mobile menu, the copy button on a code
// block and the theme-gallery lightbox. Kept in one external file (not inline)
// so a Content-Security-Policy stays possible, and every element it touches is
// an ENHANCEMENT: the menu links still exist as plain <a>, and a gallery tile
// is still a real <a href> to the full-size screenshot.
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
  Array.prototype.forEach.call(
    document.querySelectorAll('pre > code'),
    function (code) {
      var pre = code.parentNode
      if (pre.querySelector('.copy-btn')) return
      var btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'copy-btn'
      btn.textContent = LABEL.copy
      btn.addEventListener('click', function () {
        var text = code.innerText
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
          range.selectNodeContents(code)
          var sel = window.getSelection()
          sel.removeAllRanges()
          sel.addRange(range)
          done(LABEL.failed, false)
        }
      })
      pre.appendChild(btn)
    },
  )

  // ---------- theme gallery lightbox ----------
  // A <dialog> gives Esc, the backdrop and focus trapping for free. A click
  // on a tile is intercepted only for an unmodified left click: ctrl/cmd/shift
  // clicks keep opening the PNG in a new tab.
  var dialog = document.getElementById('theme-lightbox')
  var gallery = document.querySelector('.theme-gallery')
  if (!dialog || !gallery || typeof dialog.showModal !== 'function') return
  var img = dialog.querySelector('img')
  var caption = dialog.querySelector('.lightbox-caption')
  var close = dialog.querySelector('.lightbox-close')
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
    show(links.indexOf(link))
    dialog.showModal()
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
})()
