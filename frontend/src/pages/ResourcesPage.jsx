import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download, File, FileImage, FileText, FolderOpen, Loader, Paperclip,
  Search, Trash2, UploadCloud,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext.jsx';
import { downloadResourceFile, makeResourcesApi, uploadResourceFile } from '../services/resourcesApi.js';

function formatSize(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sourceLabel(source) {
  if (source === 'resume_vault') return 'Resume Vault';
  if (source === 'compose') return 'Compose';
  return 'Resources';
}

function ResourceIcon({ mimeType }) {
  if (mimeType?.startsWith('image/')) return <FileImage size={18} />;
  if (mimeType === 'application/pdf') return <FileText size={18} />;
  return <File size={18} />;
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightWithQuery(value, query) {
  const text = String(value || '');
  if (!text) return text;
  const terms = String(query || '').trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return text;
  const re = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'ig');
  return text.split(re).map((part, index) => (
    terms.some(term => part.toLowerCase() === term.toLowerCase())
      ? <mark key={`${part}-${index}`} className="rf-resource-match">{part}</mark>
      : part
  ));
}

function DotMark() {
  return <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--rf-accent)', display: 'inline-block' }} />;
}

export default function ResourcesPage() {
  const { authedFetch, idToken, setNotice, setWarningDialog } = useApp();
  const api = useMemo(() => makeResourcesApi(authedFetch), [authedFetch]);
  const inputRef = useRef(null);
  const [resources, setResources] = useState([]);
  const [limit, setLimit] = useState(10);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState('');

  async function load() {
    setLoading(true);
    try {
      const data = await api.list();
      setResources(data.resources || []);
      setLimit(data.limit || 10);
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [api]);

  async function upload(file) {
    if (!file) return;
    setUploading(true);
    try {
      const data = await uploadResourceFile(idToken, file, 'manual');
      await load();
      setNotice({
        type: data.deduplicated ? 'info' : 'success',
        message: data.deduplicated ? `"${file.name}" already exists in Resources.` : `"${file.name}" added to Resources.`,
      });
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
    } finally {
      setUploading(false);
    }
  }

  function requestDelete(resource) {
    setWarningDialog({
      title: 'Delete resource?',
      message: `This permanently removes "${resource.name}" from Resources. Scheduled emails that use it will no longer be able to send.`,
      confirmText: 'Delete resource',
      intent: 'danger',
      onConfirm: async () => {
        try {
          await api.remove(resource.id);
          setResources(current => current.filter(item => item.id !== resource.id));
          setNotice({ type: 'info', message: 'Resource deleted.' });
        } catch (err) {
          setNotice({ type: 'error', message: err.message });
        }
      },
    });
  }

  async function download(resource) {
    try {
      await downloadResourceFile(idToken, resource);
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
    }
  }

  const filtered = resources.filter(resource => resource.name.toLowerCase().includes(query.toLowerCase()));
  const usedBytes = resources.reduce((sum, resource) => sum + (resource.fileSize || 0), 0);

  return (
    <div className="rf-page rf-resources">
      <header className="rf-page-header">
        <div className="rf-page-header__lead">
          <div className="rf-page-header__eyebrow"><DotMark /> Resource library</div>
          <h1 className="rf-page-header__title">Resources</h1>
          <p className="rf-page-header__subtitle">
            Your uploaded resources from Compose attachments and Resume Vault are shown here.
          </p>
        </div>
        <div className="rf-page-header__actions">
          <button className="rf-btn rf-btn--primary rf-btn--sm" onClick={() => inputRef.current?.click()} disabled={uploading || resources.length >= limit}>
            {uploading ? <><Loader size={14} className="rf-spin" /> Uploading...</> : <><UploadCloud size={14} /> Upload resource</>}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
            hidden
            onChange={event => { upload(event.target.files?.[0]); event.target.value = ''; }}
          />
        </div>
      </header>

      <section className="rf-resource-summary">
        <div>
          <span className="rf-resource-summary__value">{resources.length}<small> / {limit}</small></span>
          <span className="rf-resource-summary__label">resource slots used</span>
        </div>
        <div>
          <span className="rf-resource-summary__value">{formatSize(usedBytes)}</span>
          <span className="rf-resource-summary__label">stored in your server folder</span>
        </div>
        <div className="rf-resource-summary__search">
          <Search size={14} />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a resource..." />
        </div>
      </section>

      {loading ? (
        <div className="rf-resource-loading"><Loader size={20} className="rf-spin" /> Loading resources...</div>
      ) : filtered.length === 0 ? (
        <div className="rf-resource-empty">
          <span className="rf-resource-empty__icon"><Paperclip size={24} /></span>
          <h2>{resources.length ? 'No matching resources' : 'Your resource library is empty'}</h2>
          <p>Attach a file in Compose or upload a resume in Resume Vault and it will appear here automatically.</p>
        </div>
      ) : (
        <div className="rf-resource-list">
          {filtered.map(resource => (
            <article className="rf-resource-row" key={resource.id}>
              <span className="rf-resource-row__icon"><ResourceIcon mimeType={resource.mimeType} /></span>
              <div className="rf-resource-row__body">
                <h2 title={resource.name}>{highlightWithQuery(resource.name, query)}</h2>
                <p>{formatSize(resource.fileSize)} · Added {new Date(resource.createdAt).toLocaleDateString()}</p>
              </div>
              <div className="rf-resource-row__sources">
                {(resource.sources || []).map(source => <span key={source}>{sourceLabel(source)}</span>)}
              </div>
              <div className="rf-resource-row__actions">
                <button className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm" onClick={() => download(resource)} title="Download">
                  <Download size={14} />
                </button>
                <button
                  className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm"
                  onClick={() => requestDelete(resource)}
                  disabled={!resource.canDelete}
                  title={resource.canDelete ? 'Delete resource' : 'Remove it from Resume Vault before deleting'}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
