# Lightweight TeX Live image with all packages required by ReachFlow resume templates.
# Multi-arch: supports both amd64 and arm64 (Apple Silicon).
# Build: docker build -t reachflow-latex ./backend/docker/latex
FROM texlive/texlive:latest-small

# Install a comprehensive set of packages commonly used in resume/CV LaTeX templates.
# This covers our own templates AND any packages the LLM might use in generated LaTeX.
RUN tlmgr install \
  # Fonts — scalable Type1 fonts required by microtype
  lm cm-super \
  # Section formatting
  titlesec \
  # Page layout
  preprint fullpage geometry \
  # Font & icon packages
  fontawesome5 fontawesome marvosym wasysym latexsym \
  # Colors & graphics
  xcolor colortbl pgf \
  # Table & list formatting
  multirow multicol parskip ragged2e \
  # Header/footer
  fancyhdr lastpage \
  # Misc document utilities
  needspace setspace textcomp-dist etoolbox \
  # PDF accessibility
  accsupp \
  # Babel + hyphenation
  babel-english hyphen-english \
  # Charter / other popular resume fonts
  charter sourcesanspro sourcecodepro cabin raleway \
  && mktexlsr
