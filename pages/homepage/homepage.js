/* Letter-by-letter slam animation setup */
document.querySelectorAll('.hero-left h1, .hero-right h2').forEach((el, elIdx) => {
  const baseDelay = elIdx === 0 ? 0.55 : 0.75;

  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const frag = document.createDocumentFragment();

      [...node.textContent].forEach((ch, i) => {
        if (ch === ' ') {
          frag.appendChild(document.createTextNode(' '));
        } else {
          const span = document.createElement('span');
          span.className = 'char';
          span.textContent = ch;
          span.style.animationDelay = (baseDelay + i * 0.055) + 's';
          frag.appendChild(span);
        }
      });

      node.parentNode.replaceChild(frag, node);
    } else if (node.nodeName !== 'BR') {
      [...node.childNodes].forEach(walk);
    }
  };

  [...el.childNodes].forEach(walk);
});
