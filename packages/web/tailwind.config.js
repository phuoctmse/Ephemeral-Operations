module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'ephops': {
          'base': '#0f1117',
          'surface': '#161b22',
          'elevated': '#1c2128',
          'border-subtle': '#21262d',
          'border-default': '#30363d',
          'text-primary': '#e6edf3',
          'text-secondary': '#8b949e',
          'text-muted': '#484f58',
          'accent-blue': '#388bfd',
          'state-running': '#3fb950',
          'state-creating': '#d29922',
          'state-failed': '#f85149',
          'state-destroyed': '#484f58',
        },
      },
      fontFamily: {
        'sans': ['Inter', '-apple-system', 'BlinkMacSystemFont', "'Segoe UI'", 'system-ui', 'sans-serif'],
        'mono': ["'JetBrains Mono'", "'Fira Code'", "'Cascadia Code'", 'ui-monospace', "'SF Mono'", 'Menlo', 'monospace'],
      },
      borderRadius: {
        'sm': '4px',
        'md': '6px',
        'lg': '8px',
      },
      spacing: {
        'xs': '4px',
        'sm': '8px',
        'md': '16px',
        'lg': '24px',
        'xl': '32px',
      },
    },
  },
  plugins: [],
}
