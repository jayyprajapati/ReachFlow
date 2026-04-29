import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useApp } from '../../contexts/AppContext.jsx';
import { useRouter } from '../../router.jsx';
import { Search, Send, Users, Kanban, FileText, Clock, Settings, ArrowRight } from 'lucide-react';

const NAV_COMMANDS = [
  { id: 'nav-compose', label: 'Go to Compose', path: '/', icon: Send, section: 'Navigation' },
  { id: 'nav-pipeline', label: 'Go to Pipeline', path: '/pipeline', icon: Kanban, section: 'Navigation' },
  { id: 'nav-contacts', label: 'Go to Contacts', path: '/contacts', icon: Users, section: 'Navigation' },
  { id: 'nav-templates', label: 'Go to Templates', path: '/templates', icon: FileText, section: 'Navigation' },
  { id: 'nav-history', label: 'Go to History', path: '/history', icon: Clock, section: 'Navigation' },
  { id: 'nav-settings', label: 'Go to Settings', path: '/settings', icon: Settings, section: 'Navigation' },
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
        id: `group-${g.id}`, label: g.companyName, path: `/contacts/${g.id}`,
        icon: Users, section: 'Companies',
      })),
      ...templates.map(t => ({
        id: `tpl-${t.id}`, label: t.title || t.subject, path: '/',
        icon: FileText, section: 'Templates', meta: t,
      })),
    ];
    if (!query.trim()) return all;
    const q = query.toLowerCase();
    return all.filter(item => item.label.toLowerCase().includes(q));
  }, [query, groups, templates]);

  useEffect(() => { setActiveIdx(0); }, [query]);

  function handleSelect(item) {
    navigateTo(item.path);
    onClose();
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => (i + 1) % Math.max(items.length, 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => (i - 1 + Math.max(items.length, 1)) % Math.max(items.length, 1)); }
    else if (e.key === 'Enter' && items[activeIdx]) { handleSelect(items[activeIdx]); }
    else if (e.key === 'Escape') { onClose(); }
  }

  // Group items by section
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
            placeholder="Search or jump to…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
        <div className="rf-command__results">
          {items.length === 0 ? (
            <div className="rf-command__empty">No results found</div>
          ) : (
            Array.from(sections.entries()).map(([section, sectionItems]) => (
              <React.Fragment key={section}>
                <div className="rf-command__section">{section}</div>
                {sectionItems.map(item => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      className={`rf-command__item ${item.globalIdx === activeIdx ? 'rf-command__item--active' : ''}`}
                      onClick={() => handleSelect(item)}
                    >
                      <span className="rf-command__item-icon"><Icon size={16} /></span>
                      <span style={{ flex: 1 }}>{item.label}</span>
                      <ArrowRight size={12} style={{ color: 'var(--rf-text-faint)' }} />
                    </button>
                  );
                })}
              </React.Fragment>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
