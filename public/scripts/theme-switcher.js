// Garante que o código só rode no navegador
if (typeof window !== 'undefined') {
  const themeToggle = document.getElementById('theme-toggle');
  const htmlEl = document.documentElement;
  let currentTheme = 'light'; // Tema padrão

  // Função para aplicar o tema e atualizar o ícone do botão
  const applyTheme = (theme) => {
    if (theme === 'dark') {
      htmlEl.classList.add('dark-mode');
      htmlEl.classList.remove('light-mode');
      if (themeToggle) themeToggle.textContent = '☀️'; // Ícone de sol
      currentTheme = 'dark';
    } else {
      htmlEl.classList.add('light-mode');
      htmlEl.classList.remove('dark-mode');
      if (themeToggle) themeToggle.textContent = '🌙'; // Ícone de lua
      currentTheme = 'light';
    }
  };

  // Lógica para carregar o tema na primeira visita
  const loadTheme = () => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      applyTheme(savedTheme);
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) {
        applyTheme('dark');
      } else {
        applyTheme('light');
      }
    }
  };

  // Adiciona o evento de clique ao botão
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      applyTheme(newTheme);
      localStorage.setItem('theme', newTheme);
    });
  }

  // Carrega o tema quando o script é executado
  loadTheme();
}