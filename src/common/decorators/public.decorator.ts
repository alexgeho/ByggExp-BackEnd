import { SetMetadata } from '@nestjs/common';

/**
 * Marks a route (or whole controller) as publicly accessible, bypassing the
 * global JWT authentication guard. Use sparingly — only for endpoints that must
 * work without a logged-in user (auth, health, public forms).
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
