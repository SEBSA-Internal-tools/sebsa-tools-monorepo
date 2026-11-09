-- VIEW and notification-read events are intentionally excluded from the business activity log.
delete from audit_logs
where action in ('VIEW', 'READ')
   or (
     entity_type = 'notification'
     and action = 'UPDATE'
     and (
       metadata ->> 'operation' = 'mark_all_read'
       or metadata -> 'changed_fields' @> '["is_read"]'::jsonb
     )
   );
