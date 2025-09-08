export function getUseReasoningV1() {
  let queryFlag = null;
  if (typeof window !== 'undefined' && window.location) {
    const params = new URLSearchParams(window.location.search);
    queryFlag = params.get('useReasoningV1');
  }
  if (queryFlag !== null) {
    return queryFlag === 'true';
  }
  const envFlag =
    import.meta.env?.VITE_USE_REASONING_V1 ??
    (typeof process !== 'undefined' ? process.env.USE_REASONING_V1 : undefined);
  if (envFlag !== undefined) {
    return String(envFlag).toLowerCase() === 'true';
  }
  return false;
}
