-- D97 (security review G-2): the "http" extension (synchronous HTTP calls from SQL) was enabled by D47 only for the Zalo OA
-- token calls; D91 removed every Zalo OA function, and nothing else uses it (outbound messages use pg_net, net.http_post).
-- Dropped without CASCADE: if anything still depended on it, this migration stops instead of removing that object.
begin;

drop extension if exists http;

commit;
