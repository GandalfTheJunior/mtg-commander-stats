import type { StorybookConfig } from '@storybook/react-vite'

// Development-only component workshop (#310). Storybook reuses vite.config.ts;
// the production build (index.html) never imports stories or this directory.
const config: StorybookConfig = {
  stories: ['./Overview.mdx', '../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  framework: { name: '@storybook/react-vite', options: {} },
  core: { disableTelemetry: true, enableCrashReports: false, disableWhatsNewNotifications: true },
  // The onboarding checklist promotes hosted publishing; this workshop is local only.
  features: { sidebarOnboardingChecklist: false, menuOnboardingChecklist: false },
}

export default config
