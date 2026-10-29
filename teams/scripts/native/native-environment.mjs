// Local Teams and business-test endpoints must bypass inherited external
// proxies. Some HTTP clients read only one casing; Python also matches IPv6
// URL hosts with brackets. Preserve every existing bypass and proxy setting.
export function loopbackProxyEnvironment(base) {
  const bypass = [...new Set([
    ...(base.NO_PROXY ?? '').split(','),
    ...(base.no_proxy ?? '').split(','),
    '127.0.0.1', 'localhost', '::1', '[::1]',
  ].map(value => value.trim()).filter(Boolean))].join(',');
  return { ...base, NO_PROXY: bypass, no_proxy: bypass };
}

// Teams uses CLI progress and native session files. Disable OTLP for every
// launched iCode process, even when its parent shell used to enable trace.
// Do not modify the user's global iCode configuration or session storage.
export function withoutNativeTrace(base) {
  const env = Object.fromEntries(Object.entries(base).filter(([key]) => !/^(OTEL_|CHRYS_OTEL)/i.test(key)));
  return { ...env, CHRYS_OTEL: 'false', CHRYS_OTEL_SENSITIVE_DATA: 'false', OTEL_SDK_DISABLED: 'true', OTEL_TRACES_EXPORTER: 'none', OTEL_METRICS_EXPORTER: 'none', OTEL_LOGS_EXPORTER: 'none' };
}
