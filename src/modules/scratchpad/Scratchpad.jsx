import { useEffect, useRef, useState } from 'react'
import {
  TextB, TextItalic, TextStrikethrough, Code,
  Quotes, ListBullets, ListNumbers, CheckSquare,
} from '@phosphor-icons/react'
import { useSessionStore } from '../../store/sessionStore.js'

// Freeform per-project notes, auto-saved. A lightweight rich-text editor: a
// contentEditable surface driven by document.execCommand (no editor framework),
// so the formatting tools apply real formatting you can see — bold, italic,
// headings, quotes, code, lists — rather than leaving raw markdown markers.
// Content is stored as HTML.
const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const looksLikeHtml = (s) => /<\/?[a-z][\s\S]*>/i.test(s)
// Older scratchpads were plain text — preserve their line breaks on first load.
const textToHtml = (s) => escapeHtml(s).replace(/\n/g, '<br>')

export default function Scratchpad() {
  const session = useSessionStore((s) => s.session)
  const saveModule = useSessionStore((s) => s.saveModule)
  const ref = useRef(null)
  const [words, setWords] = useState(0)
  const [chars, setChars] = useState(0)

  const recount = () => {
    const text = ref.current?.innerText?.trim() || ''
    setWords(text ? text.split(/\s+/).length : 0)
    setChars(ref.current?.innerText.length || 0)
  }

  // Load the project's content into the editor when the project changes (keyed on
  // id so routine autosaves don't reset the caret).
  useEffect(() => {
    const el = ref.current
    if (!el || !session) return
    const raw = session.modules?.scratchpad?.content || ''
    el.innerHTML = raw ? (looksLikeHtml(raw) ? raw : textToHtml(raw)) : ''
    recount()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id])

  // Persist on every edit (native typing and execCommand both fire `input`).
  const onInput = () => {
    if (!ref.current) return
    saveModule('scratchpad', { content: ref.current.innerHTML })
    recount()
  }

  // Run a formatting command against the current selection, then save.
  const exec = (cmd, val) => {
    const el = ref.current
    if (!el) return
    el.focus()
    document.execCommand(cmd, false, val)
    onInput()
  }
  // Block-level formats toggle: a second press on the same block clears it.
  const formatBlock = (tag) => {
    const cur = (document.queryCommandValue('formatBlock') || '').toLowerCase()
    exec('formatBlock', cur === tag.toLowerCase() ? 'P' : tag)
  }
  // Inline code — execCommand has no native command, so wrap the selection.
  const wrapCode = () => {
    const el = ref.current
    if (!el) return
    el.focus()
    const sel = window.getSelection()
    const text = sel?.toString()
    if (text) document.execCommand('insertHTML', false, `<code>${escapeHtml(text)}</code>`)
    onInput()
  }
  // Checklist — a bullet list tagged `.checklist`; its <li>s render a togglable
  // checkbox via CSS pseudo-elements (toggled by onCheckboxToggle). A second
  // press unwraps it (execCommand toggles the list off), like a real task list.
  const insertChecklist = () => {
    const el = ref.current
    if (!el) return
    el.focus()
    document.execCommand('insertUnorderedList')
    let node = window.getSelection()?.anchorNode
    while (node && node !== el) {
      if (node.nodeName === 'UL') {
        node.classList.add('checklist')
        break
      }
      node = node.parentNode
    }
    onInput()
  }
  // Toggle a checklist item's done state when its checkbox marker is clicked.
  // Fires on mousedown so we can preventDefault (no caret jump) — a real box tick.
  const onCheckboxToggle = (e) => {
    const li = e.target.closest?.('li')
    if (!li || !li.parentElement?.classList.contains('checklist')) return
    if (e.clientX - li.getBoundingClientRect().left > 26) return // clicked the text, not the box
    e.preventDefault()
    li.classList.toggle('checked')
    onInput()
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[var(--bg)]">
      <div data-tut="scratch-toolbar" className="shrink-0 h-10 flex items-center gap-0.5 px-5 border-b-[0.5px] border-[var(--border)]">
        <ToolBtn icon={TextB} label="Bold" hint="Ctrl B" onClick={() => exec('bold')} />
        <ToolBtn icon={TextItalic} label="Italic" hint="Ctrl I" onClick={() => exec('italic')} />
        <ToolBtn icon={TextStrikethrough} label="Strikethrough" onClick={() => exec('strikeThrough')} />
        <ToolBtn icon={Code} label="Inline code" onClick={wrapCode} />
        <Sep />
        <ToolBtn icon={Quotes} label="Quote" onClick={() => formatBlock('BLOCKQUOTE')} />
        <ToolBtn icon={ListBullets} label="Bullet list" onClick={() => exec('insertUnorderedList')} />
        <ToolBtn icon={ListNumbers} label="Numbered list" onClick={() => exec('insertOrderedList')} />
        <ToolBtn icon={CheckSquare} label="Checklist" onClick={insertChecklist} />
      </div>

      {/* min-h-0 is required on a flex-1 child inside a column flex container —
          without it the browser sizes this to its CONTENT height instead of the
          available space, so min-h-full below (a percentage) had nothing solid
          to resolve against and the ruled background could fall short of the
          full page, leaving a visible seam where the ruling just stops. */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={onInput}
          onMouseDown={onCheckboxToggle}
          data-placeholder="Stream of consciousness, fragments, client notes, checklists…  Format with the bar ↑"
          spellCheck="false"
          className="scratch scratch-lined w-full min-h-full bg-transparent text-[14px] text-ink"
        />
      </div>

      <div
        className="h-8 shrink-0 flex items-center gap-3 px-5 text-[11px] text-ink-3 border-t-[0.5px]"
        style={{ borderColor: 'var(--border)' }}
      >
        <span>{words} {words === 1 ? 'word' : 'words'}</span>
        <span className="opacity-50">·</span>
        <span>{chars} {chars === 1 ? 'char' : 'chars'}</span>
      </div>
    </div>
  )
}

function Sep() {
  return <span className="w-px h-5 mx-1 bg-[var(--border)] shrink-0" />
}

function ToolBtn({ icon: Icon, label, hint, onClick }) {
  return (
    <button
      // Keep the editor's selection: clicking the button must not steal focus
      // before the command runs, or it would format nothing.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={hint ? `${label} · ${hint}` : label}
      aria-label={label}
      className="grid place-items-center w-7 h-7 rounded-md text-ink-2 hover:bg-surface-3 hover:text-ink transition-colors"
    >
      <Icon size={16} weight="regular" />
    </button>
  )
}
