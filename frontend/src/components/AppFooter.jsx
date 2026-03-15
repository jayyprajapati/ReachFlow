import React from 'react';
import { Heart } from 'lucide-react';

export default function AppFooter({ onNavigate }) {
  return (
    <footer className="ftr">
      <span className="ftr__brand"><Heart size={12} /> Built with care · ReachFlow © {new Date().getFullYear()}</span>
      <span className="ftr__links">
        <button className="ftr__link" onClick={() => onNavigate('/about')}>About</button>
        <span>•</span>
        <button className="ftr__link" onClick={() => onNavigate('/privacy-policy')}>Privacy Policy</button>
      </span>
    </footer>
  );
}
