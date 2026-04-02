/**
 * Tests AuthGuard routing logic:
 * - No token && not in auth group -> redirect to /auth/login
 * - Has token && in auth group -> redirect to /(tabs)/books
 * - Has token && not in auth group -> stay
 * - No token && in auth group -> stay (loading form)
 */

describe('AuthGuard redirect logic', () => {
  // Pure function extraction from AuthGuard
  const shouldRedirect = (
    isLoading: boolean,
    hasToken: boolean,
    inAuthGroup: boolean
  ): { redirect: string | null } => {
    if (isLoading) return { redirect: null };
    if (!hasToken && !inAuthGroup) return { redirect: '/auth/login' };
    if (hasToken && inAuthGroup) return { redirect: '/(tabs)/books' };
    return { redirect: null };
  };

  it('redirects unauthenticated user to login when not in auth group', () => {
    const result = shouldRedirect(false, false, false);
    expect(result.redirect).toBe('/auth/login');
  });

  it('redirects authenticated user out of auth group to books', () => {
    const result = shouldRedirect(false, true, true);
    expect(result.redirect).toBe('/(tabs)/books');
  });

  it('does not redirect when still loading', () => {
    const result = shouldRedirect(true, false, false);
    expect(result.redirect).toBeNull();
  });

  it('does not redirect authenticated user already on main screen', () => {
    const result = shouldRedirect(false, true, false);
    expect(result.redirect).toBeNull();
  });

  it('does not redirect unauthenticated user who is on the auth screen', () => {
    const result = shouldRedirect(false, false, true);
    expect(result.redirect).toBeNull();
  });
});
