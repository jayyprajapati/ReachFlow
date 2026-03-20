import React from 'react';
import { ExternalLink, Heart } from 'lucide-react';

const PERSONAL_SITE_URL = import.meta.env.VITE_PERSONAL_SITE_URL || 'https://jayprajapati.dev';

export default function AppFooter({ onNavigate }) {
  return (
    <footer className="ftr">
      <span className="ftr__brand"><Heart size={12} /> Built with care · ReachFlow © {new Date().getFullYear()}</span>
      <span className="ftr__links">
        <button className="ftr__link" onClick={() => onNavigate('/about')}>About</button>
        <span>•</span>
        <button className="ftr__link" onClick={() => onNavigate('/privacy-policy')}>Privacy Policy</button>
        <span>•</span>
        <button className="ftr__link" onClick={() => onNavigate('/terms-of-use')}>Terms of Use</button>
        <span>•</span>
        <a className="ftr__link ftr__link--ext" href={PERSONAL_SITE_URL} target="_blank" rel="noreferrer noopener">
          Personal site <ExternalLink size={12} />
        </a>
      </span>
    </footer>
  );
}
