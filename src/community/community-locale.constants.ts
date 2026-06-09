export const COMMUNITY_LOCALES = ['ko', 'ja'] as const;

export type CommunityLocale = (typeof COMMUNITY_LOCALES)[number];

export const DEFAULT_COMMUNITY_LOCALE: CommunityLocale = 'ko';
