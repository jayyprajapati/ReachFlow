import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useApp } from '../../contexts/AppContext.jsx';
import { useRouter } from '../../router.jsx';
import {
  Search, LayoutGrid, PenLine, Briefcase, Users, FileText, Compass, Settings, ArrowRight, CornerDownLeft,
} from 'lucide-react';

const NAV_COMMANDS = [
  { id: 'nav-today',     label: 'Today',         hint: 'Home',         path: '/',           icon: LayoutGrid,  section: 'Workspace' },
  { id: 'nav-compose',   label: 'Compose',       hint: 'New email',    path: '/compose',    icon: PenLine,     section: 'Workspace' },
  { id: 'nav-pipeline',  label: 'Applications',  hint: 'Pipeline',     path: '/pipeline',   icon: Briefcase,   section: 'Workspace' },
  { id: 'nav-contacts',  label: 'Contacts',      hint: 'Companies',    path: '/contacts',   icon: Users,       section: 'Workspace' },
  { id: 'nav-resume',    label: 'Resume Lab',    hint: 'Analyze · Generate', path: '/resume-lab', icon: FileText, section: 'Workspace' },
  { id: 'nav-roadmap',   label: 'Roadmaps',      hint: 'Skill tracks', path: '/roadmaps',   icon: Compass,     section: 'Workspace' },
  { id: 'nav-settings',  label: 'Settings',      hint: '',             path: '/settings',   icon: Settings,    section: 'Workspace' },
];

export default function CommandPalette({ onClose }) {
  const { groups, templates } = useApp();
  const { navigateTo } = useRouter();
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const items = useMemo(() => {
    const all = [
      ...NAV_COMMANDS,
      ...groups.map(g => ({
        id: `group-${g.id}`,
        label: g.companyName,
        hint: `${g.contactCount || 0} contact${(g.contactCount || 0) === 1 ? '' : 's'}`,
        path: `/contacts/${g.id}`,
        icon: Users,
        section: 'Companies',
      })),
      ...templates.map(t => ({
        id: `tpl-${t.id}`,
        label: t.title || t.subject,
        hint: 'Open in Compose',
        path: '/compose',
        icon: FileText,
        section: 'Templates',
      })),
    ];
    if (!query.trim()) return all;
    const q = query.toLowerCase();
    return all.filter(item => item.label.toLowerCase().includes(q) || (item.hint || '').toLowerCase().includes(q));
  }, [query, groups, templates]);

  useEffect(() => { setActiveIdx(0); }, [query]);

  function handleSelect(item) {
    navigateTo(item.path);
    onClose();
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => (i + 1) % Math.max(items.length, 1)); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => (i - 1 + Math.max(items.length, 1)) % Math.max(items.length, 1)); }
    else if (e.key === 'Enter' && items[activeIdx]) { handleSelect(items[activeIdx]); }
    else if (e.key === 'Escape') { onClose(); }
  }

  const sections = useMemo(() => {
    const map = new Map();
    items.forEach((item, idx) => {
      const sec = item.section || 'Other';
      if (!map.has(sec)) map.set(sec, []);
      map.get(sec).push({ ...item, globalIdx: idx });
    });
    return map;
  }, [items]);

  return (
    <div className="rf-command-overlay" onClick={onClose}>
      <div className="rf-command" onClick={e => e.stopPropagation()}>
        <div className="rf-command__input-wrap">
          <Search size={18} style={{ color: 'var(--rf-text-muted)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            className="rf-command__input"
            placeholder="Search workspace, jump to…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <kbd className="rf-command__kbd">ESC</kbd>
        </div>
        <div className="rf-command__results">
          {items.length === 0 ? (
            <div className="rf-command__empty">No matches for "{query}"</div>
          ) : (
            Array.from(sections.entries()).map(([section, sectionItems]) => (
              <React.Fragment key={section}>
                <div className="rf-command__section">{section}</div>
                {sectionItems.map(item => {
                  const Icon = item.icon;
                  const active = item.globalIdx === activeIdx;
                  return (
                    <button
                      key={item.id}
                      className={`rf-command__item${active ? ' rf-command__item--active' : ''}`}
                      onClick={() => handleSelect(item)}
                      onMouseEnter={() => setActiveIdx(item.globalIdx)}
                    >
                      <span className="rf-command__item-icon"><Icon size={16} strokeWidth={1.8} /></span>
                      <span className="rf-command__item-label">{item.label}</span>
                      {item.hint && <span className="rf-command__item-hint">{item.hint}</span>}
                      {active
                        ? <CornerDownLeft size={13} className="rf-command__item-go" />
                        : <ArrowRight size={13} className="rf-command__item-go" />}
                    </button>
                  );
                })}
              </React.Fragment>
            ))
          )}
        </div>
        <div className="rf-command__hints">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
