# Lightweight TeX Live image with all packages required by ReachFlow resume templates.
# Multi-arch: supports both amd64 and arm64 (Apple Silicon).
# Build: docker build -t reachflow-latex ./backend/docker/latex
FROM texlive/texlive:latest-small

# Install packages used by ReachFlow's bundled templates and commonly emitted by
# LLM-generated LaTeX. Packages omitted on purpose (present in texlive-small's
# base / collection-latexrecommended, so no tlmgr install needed):
#   - latexsym  : part of core LaTeX since 2020
#   - multicol  : ships in collection-latex (tools bundle)
#   - textcomp  : merged into core LaTeX since 2020
#   - fullpage  : removed from TeX Live 2026 repo; latexCompiler.js rewrites
#                 any \usepackage{fullpage} to \usepackage[margin=1in]{geometry}
#   - sourcesanspro : removed from TeX Live 2026 repo; latexCompiler.js drops
#                     any \usepackage{sourcesanspro} (templates fall back to lmodern)
RUN tlmgr install \
  # Fonts — scalable Type1 fonts required by microtype
  lm cm-super \
  # Section formatting
  titlesec \
  # Page layout
  preprint geometry \
  # Font & icon packages
  fontawesome5 fontawesome marvosym wasysym \
  # Colors & graphics
  xcolor colortbl pgf \
  # Table & list formatting
  multirow parskip ragged2e \
  # Header/footer
  fancyhdr lastpage \
  # Misc document utilities
  needspace setspace etoolbox \
  # PDF accessibility
  accsupp \
  # Babel + hyphenation
  babel-english hyphen-english \
  # Charter / other popular resume fonts
  charter sourcecodepro cabin raleway \
  && mktexlsr
