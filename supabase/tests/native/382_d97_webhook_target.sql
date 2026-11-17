-- D97 (T-1): a WEBHOOK rule targets only a public https host name; IP literals in any notation, local / private names and
-- wildcard-DNS names that point at an address written inside them are refused. Valid https URLs keep working, also through
-- save_automation_rule.
do $test$
declare
  target text;
  failed text;
begin
  foreach target in array array['https://hooks.example.com/hx', 'https://example.org', 'https://api.example.co.uk:8443/a/b?c=d',
    'https://hooks.example.test/352', 'https://Sub-1.Example.VN/path'] loop
    assert private.automation_target_valid('WEBHOOK', target), format('accepted: %s', target);
  end loop;
  foreach target in array array['https://127.0.0.1/x', 'https://2130706433/', 'https://0x7f.1/', 'https://0177.0.0.1/', 'https://100.64.0.1/x',
    'https://[::1]/x', 'https://[fc00::1]/x', 'https://10.0.0.5.nip.io/', 'https://app.10-0-0-5.sslip.io/', 'https://foo.xip.io/',
    'https://192-168-1-1.example.com/', 'https://localhost/', 'https://printer.local/', 'https://db.internal/', 'https://example',
    'https://example.123', 'http://hooks.example.com/', 'https://user:pass@hooks.example.com/', 'https://-bad.example.com/', null] loop
    assert not coalesce(private.automation_target_valid('WEBHOOK', target), true), format('refused: %s', coalesce(target, 'null'));
  end loop;
  assert private.automation_target_valid('PUSH', null) and not private.automation_target_valid('PUSH', 'https://hooks.example.com'), 'PUSH unchanged';

  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  perform public.save_automation_rule(null, '20000000-0000-4000-8000-00000000000a', jsonb_build_object('name', 'Webhook hợp lệ 382',
    'event', 'delivery.claimed', 'channel', 'WEBHOOK', 'target', 'https://hooks.example.com/382'), null, gen_random_uuid());
  begin
    perform public.save_automation_rule(null, '20000000-0000-4000-8000-00000000000a', jsonb_build_object('name', 'Webhook nội bộ 382',
      'event', 'delivery.claimed', 'channel', 'WEBHOOK', 'target', 'https://10.0.0.5.nip.io/382'), null, gen_random_uuid());
  exception when others then failed := sqlerrm;
  end;
  perform pg_temp.act_as_admin();
  assert failed = 'automation_rule_invalid', format('a wildcard-DNS target is refused on save, got %s', failed);
end
$test$;
