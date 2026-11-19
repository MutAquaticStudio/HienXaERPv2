-- D97 (security review T-1): a WEBHOOK rule may only target a public https host name. Besides the D93 checks (https, no
-- credentials, no localhost / .local / .internal / private IPv4 prefixes), the host must now be a DNS name ending in a
-- letters-only top-level domain, which rules out every IP literal (dotted, decimal "2130706433", hex "0x7f.1", octal, IPv6
-- "[…]" — so 100.64.0.0/10 and fc00::/7 too), and must not be a wildcard-DNS name that resolves to an address written inside it
-- (nip.io, sslip.io, xip.io, …, or any name carrying a dotted/dashed IPv4 such as 10-0-0-5.example.com). Valid https URLs keep
-- working. Rules already saved are not changed; editing one with a refused target asks for another address.
-- Latest definition replaced: 20261116180000_d93_notification_rules.sql.
begin;

create or replace function private.automation_target_valid(rule_channel text, rule_target text) returns boolean
language sql immutable set search_path = '' as $$
  select case rule_channel
    when 'PUSH' then rule_target is null
    -- Only public https host names: no credentials in the URL, no IP literal, no local, private or wildcard-DNS name.
    when 'WEBHOOK' then coalesce(rule_target ~ '^https://[A-Za-z0-9.-]+(:[0-9]{2,5})?(/[^[:space:]]*)?$'
      and char_length(host) <= 253
      and host ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'
      and host !~ '^(localhost|.*\.localhost|.*\.local|.*\.localdomain|.*\.internal|.*\.intranet|.*\.lan|.*\.home|.*\.corp|.*\.arpa)$'
      and host !~ '(^|\.)(nip\.io|sslip\.io|xip\.io|nip\.direct|localtest\.me|lvh\.me|traefik\.me|vcap\.me|lacolhost\.com|backname\.io|1u\.ms)$'
      and host !~ '(^|[.-])[0-9]{1,3}[.-][0-9]{1,3}[.-][0-9]{1,3}[.-][0-9]{1,3}([.-]|$)'
      and host !~ '^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.|0\.)', false)
    else false end
  from (select lower(substring(rule_target from '^https://([^/:]+)')) as host) target
$$;
revoke all on function private.automation_target_valid(text, text) from public, anon, authenticated, service_role;

commit;
