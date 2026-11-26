import type { StorybookConfig } from '@storybook/react-vite'

// Development-only component workshop (#310). Storybook reuses vite.config.ts;
// the production build (index.html) never imports stories or this directory.

// In GitHub Codespaces, the private forwarded address of port 6006 is the only
// extra host name Storybook accepts; host validation stays on everywhere.
const codespace = process.env.CODESPACE_NAME
const forwardingDomain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN ?? 'app.github.dev'
const allowedHosts = codespace ? [`${codespace}-6006.${forwardingDomain}`] : undefined

const config: StorybookConfig = {
  stories: ['./Overview.mdx', '../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  framework: { name: '@storybook/react-vite', options: {} },
  core: {
    disableTelemetry: true, enableCrashReports: false, disableWhatsNewNotifications: true,
    ...(allowedHosts && { allowedHosts }),
  },
  // The forwarded HTTPS address answers on port 443, not on Storybook's own port,
  // so the preview's live-reload socket must not append :6006 in a Codespace.
  viteFinal: (viteConfig) => {
    if (codespace && typeof viteConfig.server?.hmr === 'object') viteConfig.server.hmr.clientPort = 443
    return viteConfig
  },
  // The onboarding checklist promotes hosted publishing; this workshop is local only.
  features: { sidebarOnboardingChecklist: false, menuOnboardingChecklist: false },
}

export default config
